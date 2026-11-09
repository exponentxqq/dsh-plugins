/**
 * 归档会话日志的纯逻辑读取器：从会话目录成员名挑出可读日志、按 zstd 帧边界惰性
 * 扫描压缩前缀、逐帧解压，从中提取首个标题与 header 创建时间。
 *
 * 这是「会话管理面板标题列」的数据源前置层：已归档会话目录里的 `session.jsonl`
 * 可能是纯 JSONL，也可能是 zstd 压缩容器（`.zstd` 后缀），动辄数 MB。本读取器只
 * 读文件前缀（默认 128 KiB，硬上限 512 KiB）、只解压到 256 KiB 文本预算为止，
 * 让「列一次表」的 I/O 与 CPU 都有界。
 *
 * 判据与上游同源（本地镜像，与 `projectKey` 同一纪律——上游未导出这些内部函数，
 * 纯流程层又禁止 import `@deepseek-ai/*`，规则只能手抄）：
 *
 * - 规范日志文件名：`$UP/dsh-session-format/lib/index.js` 的 `CANONICAL_LOG_FILENAME`
 *   正则同款（`session.jsonl` / `session.vN.jsonl`，各带可选 `.zstd`）。
 * - zstd 帧边界：`$UP/dsh-session-persistence-jsonl/lib/index.js` 的 `scanZstdFrames`
 *   同一套字节判据，唯一语义差异是结构性异常与尾部撕裂一律**停止产出**而不是抛错
 *   ——本读取器的契约是降级（标题列回退目录名），不是失败。
 * - 事件行形状：`{type, seq, time, data}` 的 JSONL；标题取 `session/title` 事件的
 *   `data.title`，创建时间取 `session` header 事件的顶层 `createdAt`。
 *
 * **纯模块纪律**：零 import——连 `./contract.ts` 的类型都不引（宿主产物内联与
 * 浏览器侧复用都要求自包含），`TextDecoder` 与 `DataView` 都是全局。所有 I/O 通过
 * 端口注入（{@link LogPrefixReader} / {@link ZstdFrameDecompressor}），本模块自身
 * 不触碰文件系统与 zlib。
 *
 * @module dsh-plugin-web-ux/session-log-title
 */

/** 解压文本累计预算：超出即回退（标题列显示目录名），按帧粒度推进。 */
export const TITLE_TEXT_BUDGET_BYTES = 256 * 1024

/** 首次读取的压缩前缀；足以解出 256 KiB 文本的常见压缩比区间。 */
export const INITIAL_LOG_PREFIX_BYTES = 128 * 1024

/** 压缩前缀硬上限：256 KiB 文本即使完全不可压也只需约 256 KiB + 帧开销。 */
export const MAX_LOG_PREFIX_BYTES = 512 * 1024

/* ------------------------------------------------------------------ */
/* 规范日志文件名挑选                                                   */
/* ------------------------------------------------------------------ */

/** 一个可读的会话日志候选：规范文件名 + 是否 zstd 压缩。 */
export interface SessionLogEntryName {
  /** 目录内的文件名（`session.jsonl[.zstd]` / `session.vN.jsonl[.zstd]`）。 */
  readonly name: string
  /** `.zstd` 后缀 ⇒ 拼接帧容器；否则是纯 JSONL。 */
  readonly compressed: boolean
}

/**
 * 规范日志基名正则（上游 `CANONICAL_LOG_FILENAME` 同款 + 可选压缩后缀）：
 * 临时文件、大写、前导零、`.v0`、其他压缩格式一律不匹配。
 */
const CANONICAL_LOG_NAME = /^session(?:\.v([1-9][0-9]*))?\.jsonl(?:\.zstd)?$/

/**
 * 从目录成员名里挑出可读的会话日志：只认规范名，最高 format 版本优先，同版本优先
 * 压缩形态；非规范名（临时文件、大写、前导零、`.v0`、`session.lock`）一律不认。
 * @param names - 会话目录内的成员文件名。
 * @returns 选中的日志，或 `undefined`（没有可读规范名 ⇒ 该条目的标题/创建时间字段缺省）。
 */
export function chooseSessionLogName(names: readonly string[]): SessionLogEntryName | undefined {
  let best: SessionLogEntryName | undefined
  let bestVersion = -1
  for (const name of names) {
    const match = CANONICAL_LOG_NAME.exec(name)
    if (match === null) continue
    // `.v` 段缺省即版本 0；正则已排除前导零，这里只防超出安全整数的畸形长版本号。
    const version = match[1] === undefined ? 0 : Number(match[1])
    if (!Number.isSafeInteger(version)) continue
    const compressed = name.endsWith('.zstd')
    if (version > bestVersion || (version === bestVersion && best !== undefined && compressed && !best.compressed)) {
      best = { name, compressed }
      bestVersion = version
    }
  }
  return best
}

/* ------------------------------------------------------------------ */
/* zstd 帧结构扫描（惰性）                                              */
/* ------------------------------------------------------------------ */

/** 一个结构完整的 zstd 帧在字节数组里的区间（`end` 不含）。 */
export interface ZstdFrameRange {
  /** 帧起始字节偏移（含，恒为 magic 所在位置）。 */
  readonly start: number
  /** 帧结束字节偏移（不含，即下一帧 magic 或缓冲区尾）。 */
  readonly end: number
}

/** zstd 帧魔数（4 字节小端 `28 B5 2F FD`）。 */
const ZSTD_MAGIC = 0xfd2fb528

/**
 * 逐个产出结构完整的 zstd 帧区间。
 *
 * 与上游 `scanZstdFrames` 同一套字节判据：magic（4 字节 LE）→ 帧头描述符 FHD
 * （bit7-6 `Frame_Content_Size_flag`、bit5 `Single_Segment_flag`、bit4-3 保留位
 * **必须为 0**、bit2 `Content_Checksum_flag`、bit1-0 `Dictionary_ID_flag`）→
 * `Single_Segment === 0` 时读 1 字节 `Window_Descriptor` → `Dictionary_ID`
 * （flag 决定 0/1/2/4 字节）→ `Frame_Content_Size`（flag=0 时 singleSegment ⇒
 * 1 字节、否则 0 字节；flag>0 ⇒ `1 << flag` 字节）→ 3 字节 LE 块头循环（bit0
 * last、bit1-2 type、bit3+ size；type=3 保留非法；RLE 块载荷恒 1 字节）→
 * checksum 位置 1 时跳 4 字节校验和。区间 = `[start, offset)`，只有完整帧才产出。
 *
 * **唯一的语义差异**：结构性异常（magic 不符 / 保留位非 0 / 保留块类型）与尾部
 * 撕裂（字节不足）一律**停止产出**而不是抛错。
 * @param bytes - 已读到的压缩前缀（可含不完整的最后一帧）。
 * @returns 帧区间的惰性序列（消费方提前停止即不再扫描）。
 */
export function* iterateZstdFrames(bytes: Uint8Array): Generator<ZstdFrameRange, void, void> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const end = bytes.byteLength
  let offset = 0
  while (offset < end) {
    const start = offset
    if (end - offset < 4) return
    if (view.getUint32(offset, true) !== ZSTD_MAGIC) return
    offset += 4
    if (offset === end) return
    const descriptor = view.getUint8(offset)
    offset += 1
    if ((descriptor & 24) !== 0) return
    const contentSizeFlag = descriptor >>> 6
    const singleSegment = (descriptor & 32) !== 0
    const checksum = (descriptor & 4) !== 0
    const dictionaryFlag = descriptor & 3
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag
    const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : 1 << contentSizeFlag
    const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes
    if (end - offset < remainingHeaderBytes) return
    offset += remainingHeaderBytes
    for (;;) {
      if (end - offset < 3) return
      const blockHeader =
        view.getUint8(offset) | (view.getUint8(offset + 1) << 8) | (view.getUint8(offset + 2) << 16)
      offset += 3
      const lastBlock = (blockHeader & 1) !== 0
      const blockType = (blockHeader >>> 1) & 3
      const blockSize = blockHeader >>> 3
      if (blockType === 3) return
      const payloadBytes = blockType === 1 ? 1 : blockSize
      if (end - offset < payloadBytes) return
      offset += payloadBytes
      if (lastBlock) break
    }
    if (checksum) {
      if (end - offset < 4) return
      offset += 4
    }
    yield { start, end: offset }
  }
}

/* ------------------------------------------------------------------ */
/* 探测                                                                 */
/* ------------------------------------------------------------------ */

/** 帧解压器（宿主绑 `zlib.zstdDecompressSync`；测试绑真实 zlib 或抛错替身）。 */
export type ZstdFrameDecompressor = (frame: Uint8Array) => Uint8Array

/** 同步探测的端口。 */
export interface SessionLogProbePorts {
  /** 逐帧解压；某帧抛错 ⇒ 停止扫描并保留已得字段（永不向上抛）。 */
  readonly decompressFrame: ZstdFrameDecompressor
  /** 覆盖文本预算（测试用小值驱动边界）；缺省 {@link TITLE_TEXT_BUDGET_BYTES}。 */
  readonly textBudgetBytes?: number
}

/** 一次探测的结论；`title` 与 `createdAt` 都为 null 表示「日志里什么都没读到」。 */
export interface SessionLogProbe {
  /** 首个标题事件的值（trim 后非空）；无标题事件/预算内未命中/不可读 ⇒ null。 */
  readonly title: string | null
  /** header 的 `createdAt`（有限且 > 0）；header 不可读 ⇒ null。 */
  readonly createdAt: number | null
  /** 解压文本是否触到预算（true = 可能还有没读到的标题，调用方不再补读）。 */
  readonly budgetExhausted: boolean
}

/**
 * 对一段**已读到的**字节做同步探测（纯函数，永不抛错；坏帧只停止扫描并保留已得字段）。
 * @param bytes - 压缩前缀（`log.compressed` 为 true）或纯 JSONL 前缀。
 * @param log - 由 {@link chooseSessionLogName} 选出的日志（决定是否按帧解压）。
 * @param ports - 解压器与预算。
 * @returns 探测结论。
 */
export function probeSessionLogPrefix(
  bytes: Uint8Array,
  log: SessionLogEntryName,
  ports: SessionLogProbePorts,
): SessionLogProbe {
  const budget = ports.textBudgetBytes ?? TITLE_TEXT_BUDGET_BYTES
  const decoder = new TextDecoder()
  let title: string | null = null
  let createdAt: number | null = null
  let consumed = 0
  let carry = ''

  /**
   * 消费一行 JSONL：识别 `session/title`（命中返回 true ⇒ 停止一切）与 `session`
   * header（记下 `createdAt` 继续）；空行、坏 JSON、形状不符的行走「跳过」。
   */
  const consumeLine = (line: string): boolean => {
    const trimmed = line.trim()
    if (trimmed === '') return false
    let record: unknown
    try {
      record = JSON.parse(trimmed)
    } catch {
      return false
    }
    if (typeof record !== 'object' || record === null || Array.isArray(record)) return false
    const shape = record as Record<string, unknown>
    if (shape['type'] === 'session/title') {
      const data = shape['data']
      if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
        const raw = (data as Record<string, unknown>)['title']
        if (typeof raw === 'string') {
          const value = raw.trim()
          if (value !== '') {
            title = value
            return true
          }
        }
      }
      return false
    }
    if (shape['type'] === 'session') {
      const value = shape['createdAt']
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) createdAt = value
    }
    return false
  }

  /**
   * 消费一段解压文本：按 `\n` 切行，跨帧的不完整尾行存入 carry 与下一帧首段拼接。
   * 返回 true 表示标题已命中（立即停止，不消费剩余行）。
   */
  const consumeText = (text: string): boolean => {
    const lines = (carry + text).split('\n')
    carry = lines.pop() ?? ''
    for (const line of lines) {
      if (consumeLine(line)) return true
    }
    return false
  }

  /** 流结束时消费残留 carry（无尾换行的完整行；截断行 parse 失败自然跳过）。 */
  if (log.compressed) {
    for (const range of iterateZstdFrames(bytes)) {
      let plaintext: Uint8Array
      try {
        plaintext = ports.decompressFrame(bytes.subarray(range.start, range.end))
      } catch {
        break
      }
      consumed += plaintext.byteLength
      if (consumeText(decoder.decode(plaintext))) {
        return { title, createdAt, budgetExhausted: false }
      }
      // 帧粒度预算：处理完该帧才判 `>= budget`，命中即停止（carry 一并丢弃）。
      if (consumed >= budget) {
        return { title, createdAt, budgetExhausted: true }
      }
    }
  } else {
    // 非压缩日志：整个前缀当作一个「块」，预算与首命中规则相同。
    consumed = bytes.byteLength
    if (consumeText(decoder.decode(bytes))) {
      return { title, createdAt, budgetExhausted: false }
    }
    if (consumed >= budget) {
      return { title, createdAt, budgetExhausted: true }
    }
  }
  if (carry.trim() !== '' && consumeLine(carry)) {
    return { title, createdAt, budgetExhausted: false }
  }
  return { title, createdAt, budgetExhausted: false }
}

/** 读文件前缀的端口（宿主绑 `node:fs/promises` 的 open+read；测试给内存字节）。 */
export interface LogPrefixReader {
  /**
   * 读文件前 `length` 字节；返回长度小于请求即表示已到 EOF。
   * @param path - 日志文件绝对路径。
   * @param length - 请求读取的字节数。
   * @returns 实际读到的字节（长度可能小于 `length`）。
   * @throws 打开/读取失败（缺失、权限、是目录等）。
   */
  readPrefix(path: string, length: number): Promise<Uint8Array>
}

/** 异步探测的端口：同步探测端口 + 文件前缀读取与两段长度覆盖。 */
export interface SessionLogReadPorts extends SessionLogProbePorts {
  /** 文件前缀读取端口。 */
  readonly readPrefix: LogPrefixReader['readPrefix']
  /** 覆盖首次前缀（测试用）；缺省 {@link INITIAL_LOG_PREFIX_BYTES}。 */
  readonly initialPrefixBytes?: number
  /** 覆盖前缀硬上限（测试用）；缺省 {@link MAX_LOG_PREFIX_BYTES}。 */
  readonly maxPrefixBytes?: number
}

/** 全失败的折叠结论：两段前缀读取都失败时的唯一返回形状。 */
const EMPTY_PROBE: SessionLogProbe = { title: null, createdAt: null, budgetExhausted: false }

/**
 * 读归档会话日志的前缀并探测标题/创建时间。
 *
 * 两段式前缀：先读 {@link INITIAL_LOG_PREFIX_BYTES}；仅当「没命中标题 + 预算未耗尽
 * + 读满首段（说明文件可能还有）」才补读到 {@link MAX_LOG_PREFIX_BYTES}，补读后
 * 重跑一次同步探测（不保留第一段结果，实现简单且两段都 ≤ 512 KiB）。
 *
 * **永不 reject**：任何 `readPrefix` 失败（ENOENT/EACCES/EISDIR 等）都折叠成
 * `{title:null, createdAt:null, budgetExhausted:false}`。
 * @param path - 日志文件绝对路径。
 * @param log - 规范日志名（决定压缩形态）。
 * @param ports - 文件读取、解压与预算端口。
 * @returns 探测结论。
 */
export async function probeSessionLog(
  path: string,
  log: SessionLogEntryName,
  ports: SessionLogReadPorts,
): Promise<SessionLogProbe> {
  const initial = ports.initialPrefixBytes ?? INITIAL_LOG_PREFIX_BYTES
  const max = ports.maxPrefixBytes ?? MAX_LOG_PREFIX_BYTES
  try {
    const bytes = await ports.readPrefix(path, initial)
    let probe = probeSessionLogPrefix(bytes, log, ports)
    if (probe.title === null && !probe.budgetExhausted && bytes.length === initial) {
      const second = await ports.readPrefix(path, max)
      probe = probeSessionLogPrefix(second, log, ports)
    }
    return probe
  } catch {
    return EMPTY_PROBE
  }
}
