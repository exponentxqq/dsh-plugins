/**
 * `session-log-title` 纯逻辑读取器的行为契约测试（`src/session-log-title.ts`）。
 *
 * 覆盖四组契约：规范日志文件名挑选（v0 拒绝 / vN 最高版本 / `.zstd` 同版本优先 /
 * 非规范名不认）、zstd 帧边界扫描（单段帧 + **流式帧**）、同步探测（逐帧推进 /
 * 跨帧 carry / 预算 / 坏行 / 坏帧降级）与两段前缀异步探测（补读条件 / 永不 reject）。
 *
 * 流式帧（Single_Segment=0）是 `session.v4.jsonl.zstd` 的真实形态：`zstdCompressSync`
 * 产出的帧是 Single_Segment=1 形态（实测 FHD=0b00100000），覆盖不到 Window_Descriptor
 * 分支，所以 {@link createZstdCompress} 手工构造帧头（magic + FHD bit5=0 + Window_
 * Descriptor + raw 块头 + 原始载荷），raw 块是合法 zstd，`zstdDecompressSync` 可直接
 * 解开。生成器为该帧产出区间 + 帧头第 5 字节 bit5=0 双断言，钉死 Window_Descriptor
 * 分支被真实执行。
 *
 * @module dsh-plugin-web-ux/test/session-log-title
 */

import { zstdCompressSync, zstdDecompressSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  INITIAL_LOG_PREFIX_BYTES,
  MAX_LOG_PREFIX_BYTES,
  TITLE_TEXT_BUDGET_BYTES,
  chooseSessionLogName,
  iterateZstdFrames,
  probeSessionLog,
  probeSessionLogPrefix,
  type SessionLogProbePorts,
} from '../src/session-log-title.ts'

/* ------------------------------------------------------------------ */
/* 帧构造与端口替身                                                     */
/* ------------------------------------------------------------------ */

/** 单段帧：`zstdCompressSync` 的真实产物（Single_Segment=1，覆盖不到流式分支）。 */
function singleSegmentFrame(text: string): Uint8Array {
  return zstdCompressSync(Buffer.from(text, 'utf8'))
}

/** 一个手工构造的流式帧：FHD bit5=0（Single_Segment=0）+ Window_Descriptor + raw 块。 */
function rawStreamingFrame(payload: string, descriptor = 0x00): Uint8Array {
  const body = Buffer.from(payload, 'utf8')
  const head = Buffer.alloc(4 + 1 + 1 + 3)
  head.writeUInt32LE(0xfd2fb528, 0)
  head[4] = descriptor // bit5=0 ⇒ 必须读 1 字节 Window_Descriptor
  head[5] = 0x20 // Window_Descriptor（窗口 16 KiB，载荷远小于窗口）
  const blockHeader = (body.length << 3) | (0 << 1) | 1 // raw 块（type=0）、last=1
  head[6] = blockHeader & 0xff
  head[7] = (blockHeader >>> 8) & 0xff
  head[8] = (blockHeader >>> 16) & 0xff
  return Buffer.concat([head, body])
}

/**
 * 流式帧容器：每个 chunk 一个独立流式帧后拼接，模拟 `session.v4.jsonl.zstd` 的
 * 真实多帧形态。`zstdDecompressSync` 只解首帧（实测），因此宿主必须逐帧切帧解压。
 */
function createZstdCompress(chunks: readonly string[]): Uint8Array {
  return Buffer.concat(chunks.map((chunk) => Buffer.from(rawStreamingFrame(chunk))))
}

/** 帧字节截断 helper：制造尾部撕裂（最后一帧不完整）。 */
function torn(bytes: Uint8Array, keep: number): Uint8Array {
  return bytes.subarray(0, keep)
}

/** 真实 zlib 解压替身（宿主接线前的同一语义路径）。 */
function realDecompress(frame: Uint8Array): Uint8Array {
  return zstdDecompressSync(frame)
}

/** 标准端口（可逐项覆盖）。 */
function makePorts(overrides: Partial<SessionLogProbePorts> = {}): SessionLogProbePorts {
  return { decompressFrame: realDecompress, ...overrides }
}

/** header 事件行（创建时间在顶层 `createdAt`）。 */
function headerLine(createdAt: number): string {
  return `${JSON.stringify({ type: 'session', seq: 0, createdAt })}\n`
}

/** 标题事件行（`session/title`，标题在 `data.title`）。 */
function titleLine(title: string): string {
  return `${JSON.stringify({ type: 'session/title', seq: 1, data: { title } })}\n`
}

/** 与探测无关的填充行（JSON 合法但 type 不被识别，消费时跳过）。 */
function padLine(index: number): string {
  return `${JSON.stringify({ type: 'session/pad', seq: index, data: { filler: 'x'.repeat(40) } })}\n`
}

/** 内存前缀读取器：返回前 `length` 字节（不足即 EOF），并记录每次请求的长度。 */
function memoryReader(content: Uint8Array, calls: number[] = []) {
  return (_path: string, length: number): Promise<Uint8Array> => {
    calls.push(length)
    return Promise.resolve(content.subarray(0, Math.min(length, content.byteLength)))
  }
}

/* ------------------------------------------------------------------ */
/* 规范日志文件名挑选                                                   */
/* ------------------------------------------------------------------ */

describe('chooseSessionLogName：规范名挑选', () => {
  it('纯 v0 与压缩 v0 各自命中，compressed 标志随 `.zstd` 后缀', () => {
    expect(chooseSessionLogName(['session.jsonl'])).toEqual({ name: 'session.jsonl', compressed: false })
    expect(chooseSessionLogName(['session.jsonl.zstd'])).toEqual({ name: 'session.jsonl.zstd', compressed: true })
  })

  it('vN 混排取最高版本', () => {
    expect(chooseSessionLogName(['session.v1.jsonl', 'session.v3.jsonl', 'session.v2.jsonl'])?.name).toBe(
      'session.v3.jsonl',
    )
  })

  it('版本优先于压缩形态：v3 纯文本胜过 v2 压缩', () => {
    expect(chooseSessionLogName(['session.v2.jsonl.zstd', 'session.v3.jsonl'])?.name).toBe('session.v3.jsonl')
  })

  it('同版本优先压缩形态', () => {
    expect(chooseSessionLogName(['session.v2.jsonl', 'session.v2.jsonl.zstd'])).toEqual({
      name: 'session.v2.jsonl.zstd',
      compressed: true,
    })
  })

  it.each([
    ['session.v0.jsonl', '.v0 不是规范名'],
    ['session.v01.jsonl', '前导零不认'],
    ['SESSION.JSONL', '大写不认'],
    ['session.jsonl.tmp', '临时文件不认'],
    ['session.lock', '锁文件不认'],
    ['session.jsonl.gz', '其他压缩格式不认'],
    ['session', '缺后缀不认'],
    ['session.v1.zstd', '缺 .jsonl 段不认'],
    ['', '空名不认'],
  ])('拒绝非规范名：%s（%s）', (name) => {
    expect(chooseSessionLogName([name])).toBeUndefined()
  })

  it('全非规范名 / 空目录 → undefined', () => {
    expect(chooseSessionLogName([])).toBeUndefined()
    expect(chooseSessionLogName(['session.lock', 'projection.json'])).toBeUndefined()
  })
})

/* ------------------------------------------------------------------ */
/* zstd 帧边界扫描                                                      */
/* ------------------------------------------------------------------ */

describe('iterateZstdFrames：帧边界', () => {
  it('单段帧（zstdCompressSync）产出恰一个覆盖全字节的区间', () => {
    const frame = singleSegmentFrame(headerLine(1700000000000))
    expect([...iterateZstdFrames(frame)]).toEqual([{ start: 0, end: frame.byteLength }])
  })

  it('流式帧（FHD bit5=0）产出区间且区间可被 zlib 逐帧解压——Window_Descriptor 分支被执行', () => {
    const container = createZstdCompress([headerLine(1700000000000), titleLine('流式')])
    const ranges = [...iterateZstdFrames(container)]
    expect(ranges.length).toBeGreaterThanOrEqual(2)
    for (const range of ranges) {
      // FHD 位于帧起始后第 5 字节：bit5（Single_Segment）必须为 0 ⇒ 流式形态成立。
      expect(container[range.start + 4] & 32).toBe(0)
      const plaintext = zstdDecompressSync(container.subarray(range.start, range.end)).toString('utf8')
      expect(plaintext.endsWith('\n')).toBe(true)
    }
    expect(ranges.at(-1)?.end).toBe(container.byteLength)
  })

  it('尾部撕裂：最后一帧不完整时只产出前面的完整帧（不抛错）', () => {
    const container = createZstdCompress([headerLine(1), titleLine('撕裂')])
    const ranges = [...iterateZstdFrames(torn(container, container.byteLength - 5))]
    expect(ranges.length).toBeGreaterThanOrEqual(1)
    expect(ranges.at(-1)!.end).toBeLessThan(container.byteLength - 5)
  })

  it('结构性异常一律停止产出：坏 magic / 保留 FHD 位 / 保留块类型', () => {
    expect([...iterateZstdFrames(new Uint8Array([0x28, 0xb5, 0x2f, 0xfd]))]).toEqual([]) // 只有 magic，无 FHD
    const badMagic = singleSegmentFrame('x')
    badMagic[0] = 0x00
    expect([...iterateZstdFrames(badMagic)]).toEqual([])
    // 保留位：bit4-3 必须为 0，置 1 即拒绝（上游 `(descriptor & 24) !== 0`）。
    const badReserved = rawStreamingFrame('x', 0x08)
    expect([...iterateZstdFrames(badReserved)]).toEqual([])
    // 保留块类型 type=3：改写块头最低字节为 (size<<3)|(3<<1)|last。
    const badBlock = Buffer.from(rawStreamingFrame('x'))
    badBlock[6] = 0x0f
    expect([...iterateZstdFrames(badBlock)]).toEqual([])
  })

  it('空字节与首帧完好后接坏帧：产出已完整的帧即停', () => {
    expect([...iterateZstdFrames(new Uint8Array())]).toEqual([])
    const good = singleSegmentFrame('a\n')
    const bad = singleSegmentFrame('b\n')
    bad[4] = 0xff // FHD 保留位非 0
    const ranges = [...iterateZstdFrames(Buffer.concat([good, bad]))]
    expect(ranges).toEqual([{ start: 0, end: good.byteLength }])
  })
})

/* ------------------------------------------------------------------ */
/* 同步探测：压缩容器                                                    */
/* ------------------------------------------------------------------ */

describe('probeSessionLogPrefix：压缩容器', () => {
  it('header 在第一帧、title 在第二帧：逐帧推进两个字段都命中', () => {
    const container = createZstdCompress([headerLine(1700000000000), titleLine('逐帧推进')])
    expect(probeSessionLogPrefix(container, { name: 'session.jsonl.zstd', compressed: true }, makePorts())).toEqual({
      title: '逐帧推进',
      createdAt: 1700000000000,
      budgetExhausted: false,
    })
  })

  it('单段帧容器同样逐帧解压（zstdCompressSync 帧拼接）', () => {
    const container = Buffer.concat([singleSegmentFrame(headerLine(42)), singleSegmentFrame(titleLine('单段'))])
    expect(probeSessionLogPrefix(container, { name: 'session.jsonl.zstd', compressed: true }, makePorts())).toEqual({
      title: '单段',
      createdAt: 42,
      budgetExhausted: false,
    })
  })

  it('跨帧不完整尾行经 carry 拼接后命中标题', () => {
    const first = `{"type":"session","createdAt":7}\n{"type":"session/ti`
    const second = `tle","data":{"title":"跨帧"}}\n`
    const container = createZstdCompress([first, second])
    expect(probeSessionLogPrefix(container, { name: 'session.jsonl.zstd', compressed: true }, makePorts())).toEqual({
      title: '跨帧',
      createdAt: 7,
      budgetExhausted: false,
    })
  })

  it('首个标题命中即停：后面的更新标题不读', () => {
    const container = createZstdCompress([
      headerLine(1),
      `${titleLine('首标题')}${titleLine('更新标题')}`,
      titleLine('更后面'),
    ])
    expect(probeSessionLogPrefix(container, { name: 'session.jsonl.zstd', compressed: true }, makePorts())?.title).toBe(
      '首标题',
    )
  })

  it('预算耗尽：小预算停止扫描并置 budgetExhausted，标题留在更后面帧', () => {
    const container = createZstdCompress([headerLine(5), padLine(0), padLine(1), titleLine('预算外')])
    const probe = probeSessionLogPrefix(
      container,
      { name: 'session.jsonl.zstd', compressed: true },
      makePorts({ textBudgetBytes: 80 }),
    )
    expect(probe).toEqual({ title: null, createdAt: 5, budgetExhausted: true })
  })

  it('标题恰在预算耗尽帧内命中时优先返回标题（先处理后判预算）', () => {
    // 预算 = 1：帧 1（header + title 同帧）处理完才判预算，命中即返回 ⇒ 预算拦不住已命中帧。
    const container = createZstdCompress([`${headerLine(5)}${titleLine('帧内命中')}`, padLine(0)])
    const probe = probeSessionLogPrefix(
      container,
      { name: 'session.jsonl.zstd', compressed: true },
      makePorts({ textBudgetBytes: 1 }),
    )
    expect(probe).toEqual({ title: '帧内命中', createdAt: 5, budgetExhausted: false })
  })

  it('标题取 trim 后的值；空串与纯空白标题视为未命中', () => {
    const container = createZstdCompress([headerLine(1), `{"type":"session/title","data":{"title":"  带空白  "}}\n`])
    expect(probeSessionLogPrefix(container, { name: 'session.jsonl.zstd', compressed: true }, makePorts())?.title).toBe(
      '带空白',
    )
    const blank = createZstdCompress([headerLine(1), `{"type":"session/title","data":{"title":"   "}}\n`])
    const probe = probeSessionLogPrefix(blank, { name: 'session.jsonl.zstd', compressed: true }, makePorts())
    expect(probe).toEqual({ title: null, createdAt: 1, budgetExhausted: false })
  })

  it('createdAt 只认有限正数：0 / 负数 / 非数字行都不记录', () => {
    const lines = [
      `{"type":"session","createdAt":0}\n`,
      `{"type":"session","createdAt":-5}\n`,
      `{"type":"session","createdAt":"soon"}\n`,
      headerLine(12345),
    ]
    const container = createZstdCompress([lines.join('')])
    const probe = probeSessionLogPrefix(container, { name: 'session.jsonl.zstd', compressed: true }, makePorts())
    expect(probe).toEqual({ title: null, createdAt: 12345, budgetExhausted: false })
  })

  it('坏 JSON 行跳过，不中止后续命中', () => {
    const container = createZstdCompress([headerLine(9), 'not-json-at-all\n', '{broken\n', titleLine('坏行后')])
    expect(probeSessionLogPrefix(container, { name: 'session.jsonl.zstd', compressed: true }, makePorts())?.title).toBe(
      '坏行后',
    )
  })

  it('结构性坏帧停止扫描但保留已得字段（header 已得 + 后续坏帧）', () => {
    const good = singleSegmentFrame(headerLine(77))
    const bad = singleSegmentFrame(titleLine('读不到'))
    bad[4] = 0xff
    const container = Buffer.concat([good, bad])
    expect(probeSessionLogPrefix(container, { name: 'session.jsonl.zstd', compressed: true }, makePorts())).toEqual({
      title: null,
      createdAt: 77,
      budgetExhausted: false,
    })
  })

  it('标题命中后的坏帧不影响结果（命中即停，坏帧根本不被消费）', () => {
    const good = singleSegmentFrame(titleLine('已得'))
    const bad = singleSegmentFrame('x\n')
    bad[4] = 0xff
    const container = Buffer.concat([good, bad])
    expect(probeSessionLogPrefix(container, { name: 'session.jsonl.zstd', compressed: true }, makePorts())).toEqual({
      title: '已得',
      createdAt: null,
      budgetExhausted: false,
    })
  })

  it('解压抛错替身：停止扫描并保留已得字段，探测本身不抛', () => {
    const container = Buffer.concat([singleSegmentFrame(headerLine(3)), singleSegmentFrame(titleLine('解不开'))])
    let calls = 0
    const probe = probeSessionLogPrefix(
      container,
      { name: 'session.jsonl.zstd', compressed: true },
      {
        decompressFrame: (frame) => {
          calls += 1
          if (calls > 1) throw new Error('zstd 解压失败')
          return realDecompress(frame)
        },
      },
    )
    expect(probe).toEqual({ title: null, createdAt: 3, budgetExhausted: false })
    expect(calls).toBe(2) // 抛错帧也消耗了一次调用，其后不再扫描
  })

  it('空容器 / 全坏字节 → 全缺省且预算未耗尽', () => {
    expect(
      probeSessionLogPrefix(new Uint8Array(), { name: 'session.jsonl.zstd', compressed: true }, makePorts()),
    ).toEqual({ title: null, createdAt: null, budgetExhausted: false })
  })
})

/* ------------------------------------------------------------------ */
/* 同步探测：非压缩纯 JSONL                                             */
/* ------------------------------------------------------------------ */

describe('probeSessionLogPrefix：非压缩纯 JSONL', () => {
  it('不做帧扫描，把前缀直接当行流解析', () => {
    const bytes = Buffer.from(`${headerLine(99)}${titleLine('纯文本')}`, 'utf8')
    expect(probeSessionLogPrefix(bytes, { name: 'session.jsonl', compressed: false }, makePorts())).toEqual({
      title: '纯文本',
      createdAt: 99,
      budgetExhausted: false,
    })
  })

  it('预算超限置 budgetExhausted（整块消费后判定）；标题在前则正常返回', () => {
    const beyond = Buffer.from(`${padLine(0)}${padLine(1)}${padLine(2)}`, 'utf8')
    expect(
      probeSessionLogPrefix(beyond, { name: 'session.jsonl', compressed: false }, makePorts({ textBudgetBytes: 80 })),
    ).toEqual({ title: null, createdAt: null, budgetExhausted: true })
    const withTitle = Buffer.from(`${titleLine('预算内')}`, 'utf8')
    expect(
      probeSessionLogPrefix(withTitle, { name: 'session.jsonl', compressed: false }, makePorts({ textBudgetBytes: 1 })),
    ).toEqual({ title: '预算内', createdAt: null, budgetExhausted: false })
  })

  it('无尾换行的末行（残留 carry）也被消费；截断的坏行跳过', () => {
    const complete = Buffer.from(`${headerLine(8)}${titleLine('无尾换行').trimEnd()}`, 'utf8')
    expect(probeSessionLogPrefix(complete, { name: 'session.jsonl', compressed: false }, makePorts())?.title).toBe(
      '无尾换行',
    )
    const truncated = Buffer.from(`${headerLine(8)}{"type":"session/ti`, 'utf8')
    expect(
      probeSessionLogPrefix(truncated, { name: 'session.jsonl', compressed: false }, makePorts()),
    ).toEqual({ title: null, createdAt: 8, budgetExhausted: false })
  })

  it('空文件 → 全缺省', () => {
    expect(probeSessionLogPrefix(new Uint8Array(), { name: 'session.jsonl', compressed: false }, makePorts())).toEqual({
      title: null,
      createdAt: null,
      budgetExhausted: false,
    })
  })
})

/* ------------------------------------------------------------------ */
/* 两段前缀异步探测                                                     */
/* ------------------------------------------------------------------ */

describe('probeSessionLog：两段前缀与永不 reject', () => {
  it('首段即命中标题：只读一次', async () => {
    const calls: number[] = []
    const content = Buffer.from(`${headerLine(1)}${titleLine('首段命中')}`, 'utf8')
    const probe = await probeSessionLog('/archive/s1/session.jsonl', { name: 'session.jsonl', compressed: false }, {
      ...makePorts(),
      readPrefix: memoryReader(content, calls),
      initialPrefixBytes: content.byteLength,
    })
    expect(calls).toEqual([content.byteLength])
    expect(probe).toEqual({ title: '首段命中', createdAt: 1, budgetExhausted: false })
  })

  it('首段读满且未命中：补读到硬上限后重跑（第二次以 max 长度请求）', async () => {
    const calls: number[] = []
    const content = Buffer.from(`${padLine(0)}${padLine(1)}${padLine(2)}${headerLine(2)}${titleLine('二段命中')}`, 'utf8')
    const probe = await probeSessionLog('/archive/s1/session.jsonl', { name: 'session.jsonl', compressed: false }, {
      ...makePorts(),
      readPrefix: memoryReader(content, calls),
      initialPrefixBytes: 64,
      maxPrefixBytes: 4096,
    })
    expect(calls).toEqual([64, 4096])
    expect(probe).toEqual({ title: '二段命中', createdAt: 2, budgetExhausted: false })
  })

  it('压缩日志同样两段补读：首段撕裂帧解不出标题，第二段命中', async () => {
    const calls: number[] = []
    const container = createZstdCompress([headerLine(3), titleLine('压缩二段')])
    const probe = await probeSessionLog('/archive/s1/session.v4.jsonl.zstd', { name: 'session.v4.jsonl.zstd', compressed: true }, {
      ...makePorts(),
      readPrefix: memoryReader(container, calls),
      initialPrefixBytes: 64,
      maxPrefixBytes: 4096,
    })
    expect(calls).toEqual([64, 4096])
    expect(probe).toEqual({ title: '压缩二段', createdAt: 3, budgetExhausted: false })
  })

  it('首段未读满（EOF）：不补读', async () => {
    const calls: number[] = []
    const content = Buffer.from(`${headerLine(4)}${titleLine('短文件')}`, 'utf8')
    const probe = await probeSessionLog('/archive/s1/session.jsonl', { name: 'session.jsonl', compressed: false }, {
      ...makePorts(),
      readPrefix: memoryReader(content, calls),
      initialPrefixBytes: content.byteLength + 100,
    })
    expect(calls.length).toBe(1)
    expect(probe).toEqual({ title: '短文件', createdAt: 4, budgetExhausted: false })
  })

  it('预算耗尽：不再补读（可能还有标题也无意义）', async () => {
    const calls: number[] = []
    const content = Buffer.from(`${padLine(0)}${padLine(1)}${titleLine('预算外')}`, 'utf8')
    const probe = await probeSessionLog('/archive/s1/session.jsonl', { name: 'session.jsonl', compressed: false }, {
      ...makePorts({ textBudgetBytes: 32 }),
      readPrefix: memoryReader(content, calls),
      initialPrefixBytes: 64,
    })
    expect(calls.length).toBe(1) // 首段 64 字节 ≥ 32 ⇒ 预算耗尽，补读条件不成立
    expect(probe).toEqual({ title: null, createdAt: null, budgetExhausted: true })
  })

  it('首段读取失败（ENOENT 等任意错误）折叠为全缺省，永不 reject', async () => {
    const probe = await probeSessionLog('/archive/gone/session.jsonl', { name: 'session.jsonl', compressed: false }, {
      ...makePorts(),
      readPrefix: () => Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
    })
    expect(probe).toEqual({ title: null, createdAt: null, budgetExhausted: false })
  })

  it('补读失败同样折叠为全缺省', async () => {
    const content = Buffer.from('x'.repeat(64), 'utf8')
    let first = true
    const probe = await probeSessionLog('/archive/s1/session.jsonl', { name: 'session.jsonl', compressed: false }, {
      ...makePorts(),
      readPrefix: (_path, length) => {
        if (first) {
          first = false
          return Promise.resolve(content.subarray(0, length))
        }
        return Promise.reject(new Error('EACCES'))
      },
      initialPrefixBytes: 64,
    })
    expect(probe).toEqual({ title: null, createdAt: null, budgetExhausted: false })
  })
})

/* ------------------------------------------------------------------ */
/* 常量形状                                                             */
/* ------------------------------------------------------------------ */

describe('预算与前缀常量', () => {
  it('默认值固定：256 KiB 文本预算 / 128 KiB 首段 / 512 KiB 硬上限', () => {
    expect(TITLE_TEXT_BUDGET_BYTES).toBe(256 * 1024)
    expect(INITIAL_LOG_PREFIX_BYTES).toBe(128 * 1024)
    expect(MAX_LOG_PREFIX_BYTES).toBe(512 * 1024)
    expect(INITIAL_LOG_PREFIX_BYTES).toBeLessThan(MAX_LOG_PREFIX_BYTES)
  })
})
