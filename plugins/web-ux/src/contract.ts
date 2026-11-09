/**
 * web-ux「会话处置」能力的线上契约：宿主半与浏览器半共享的唯一事实来源。
 *
 * 这是纯数据模块，两端各自内联一份（客户端 bundle 与宿主产物各打包一次），不共享
 * 任何运行时身份。它拥有三类职责：
 *
 * - **端点与形状**：7 个端点覆盖「单会话 / 批量」与「已归档 / 已迁移」两个域，一个
 *   端点一种响应形状（预览返回预览形状，执行返回执行形状），调用方不可能把 A 端点的
 *   答案当 B 端点解码。处置请求体同形（目标 + 必填的处置模式），模式没有隐式默认；
 *   预览还回声宿主解析后的归档根（{@link DeletePreview.archiveRoot}），让界面展示
 *   真实去向。
 * - **边界校验**：请求来自浏览器、响应来自宿主，两侧类型都只是「承诺」。这里的
 *   `parse*` 函数在边界上逐字段校验，把结构不符变成一句可读的失败信息，而不是崩溃
 *   或静默错渲染。
 * - **请求分派**：{@link parseRequest} 把端点名与请求体一起解析成
 *   {@link WebUxRequest} 判别联合，宿主 dispatcher 因此只需 `switch` 一次，不必为
 *   每个端点各写一份「先验端点、再验请求体」的分派代码。
 *
 * 本模块不得 import `node:*` 或 `@deepseek-ai/*`（会被内联进浏览器 bundle），因此
 * 校验为手写实现，不引入 zod。
 *
 * @module dsh-plugin-web-ux/contract
 */

/** Connection RPC 通道：两端共享的绝对逻辑通道名。 */
export const CHANNEL = '/web-ux'

/** 单会话预览端点：校验 + 统计删除集合，不产生任何写操作。 */
export const PREVIEW_ENDPOINT = 'preview-delete'

/** 单会话执行端点：重新校验后真正删除或迁移。 */
export const DELETE_ENDPOINT = 'delete-session'

/** 批量预览端点：多目标并集统计，不产生任何写操作。 */
export const PREVIEW_BATCH_ENDPOINT = 'preview-delete-batch'

/** 批量执行端点：多目标整单校验后逐个处置（逐条文件失败只进 warnings）。 */
export const DELETE_BATCH_ENDPOINT = 'delete-session-batch'

/** 已迁移列表端点：枚举归档根下的目录条目，只读。 */
export const LIST_MIGRATED_ENDPOINT = 'list-migrated'

/** 已迁移删除端点：物理删除归档根下的目录条目。 */
export const DELETE_MIGRATED_ENDPOINT = 'delete-migrated'

/** 已迁移恢复端点：把归档条目搬回 `<home>/sessions` 并挂回工作区。 */
export const RESTORE_MIGRATED_ENDPOINT = 'restore-migrated'

/** 全部端点名，供测试与两端穷举。 */
export const ENDPOINTS = [
  PREVIEW_ENDPOINT,
  DELETE_ENDPOINT,
  PREVIEW_BATCH_ENDPOINT,
  DELETE_BATCH_ENDPOINT,
  LIST_MIGRATED_ENDPOINT,
  DELETE_MIGRATED_ENDPOINT,
  RESTORE_MIGRATED_ENDPOINT,
] as const

/** 端点名类型。 */
export type WebUxEndpoint = (typeof ENDPOINTS)[number]

/**
 * 稳定失败码。`bad-request` 表示线上形状不合契约；`internal` 表示宿主侧未预期故障；
 * 其余六个是业务拒绝码，界面按码给出对应文案。`archive-unavailable` 只表示归档根
 * 不可用（未做任何文件改动），`not-migrated` 表示归档根下没有该条目，`target-exists`
 * 表示恢复目标位置已被占用；逐条迁移失败仍只进 warnings，与整单拒绝刻意区分。
 *
 * 顺序被测试逐项断言：两个迁移域码集中插在 `not-archived` 之后，既有码的相对顺序
 * 保持不变。
 */
export const FAILURE_CODES = [
  'bad-request',
  'not-found',
  'not-archived',
  'not-migrated',
  'target-exists',
  'session-live',
  'archive-unavailable',
  'internal',
] as const

/** 失败码类型。 */
export type FailureCode = (typeof FAILURE_CODES)[number]

/** 判断一个字符串是否为已知失败码（未知码由调用方按兜底文案渲染）。 */
export function isFailureCode(code: string): code is FailureCode {
  return (FAILURE_CODES as readonly string[]).includes(code)
}

/** 处置模式：`delete` 物理删除；`archive` 迁移到宿主解析出的归档根目录。 */
export const DISPOSAL_MODES = ['delete', 'archive'] as const

/** 处置模式类型。 */
export type DisposalMode = (typeof DISPOSAL_MODES)[number]

/**
 * 判断一个值是否为已知处置模式。
 *
 * 请求体校验只接受本白名单：所有处置端点都没有隐式默认模式（物理删除不可逆，归档也
 * 会移动文件），未知取值一律按 `bad-request` 拒绝，而不是猜测调用方意图。
 */
export function isDisposalMode(value: unknown): value is DisposalMode {
  return typeof value === 'string' && (DISPOSAL_MODES as readonly string[]).includes(value)
}

/** 单会话请求体：目标会话 id + 处置模式（必填）。 */
export interface DeleteRequest {
  /** 目标已归档会话的 id。 */
  readonly sessionId: string
  /** 处置模式；两个单会话端点都必填，缺失或未知取值都被 `bad-request` 拒绝。 */
  readonly mode: DisposalMode
}

/** 批量请求体：目标已归档会话 id 列表 + 处置模式（必填）。 */
export interface DeleteBatchRequest {
  /** 目标已归档会话 id；允许重复，宿主按首见顺序去重。 */
  readonly sessionIds: readonly string[]
  /** 处置模式；与单会话端点同义，必填且无默认。 */
  readonly mode: DisposalMode
}

/** 批量预览里被拒绝的一个目标：软失败不拖垮整单预览。 */
export interface RejectedTarget {
  /** 被拒绝的目标会话 id。 */
  readonly sessionId: string
  /** 稳定失败码；可能来自更新版本的宿主，界面按 errorKeyOf 兜底。 */
  readonly code: string
  /** 人类可读的拒绝原因。 */
  readonly message: string
}

/** 单会话预览结果：处置集合的规模与体积，外加宿主解析后的归档根，仅用于展示。 */
export interface DeletePreview {
  /** 处置集合的会话数（目标 + 级联后代）。 */
  readonly sessionCount: number
  /** 其中 subagent 后代的数量。 */
  readonly descendantCount: number
  /** 预计释放的字节数（会话日志目录树 + 投影缓存文件）。 */
  readonly logBytes: number
  /** 宿主解析后的归档根绝对路径；与 mode 无关，两种模式下都返回，供界面展示真实去向。 */
  readonly archiveRoot: string
}

/** 批量预览结果：并集统计 + 归档根 + 逐目标软失败清单。 */
export interface DeleteBatchPreview {
  /** 去重后的勾选目标数（用户视角的「N 个会话」）。 */
  readonly targetCount: number
  /** 并集处置集合的会话数（勾选目标 + 级联子代理后代，去重）。 */
  readonly sessionCount: number
  /** 其中后代数（= sessionCount - 通过校验的目标数）。 */
  readonly descendantCount: number
  /** 预计释放的字节数（并集会话日志目录树 + 投影缓存文件）。 */
  readonly logBytes: number
  /** 宿主解析后的归档根绝对路径；两种模式下都返回，供界面展示真实去向。 */
  readonly archiveRoot: string
  /** 软失败清单：预览不因个别目标失效而整单失败。 */
  readonly rejected: readonly RejectedTarget[]
}

/** 单会话执行结果：被移除的 id 列表与逐条文件删除失败。 */
export interface DeleteOutcome {
  /** 已从工作区记录与磁盘移除的会话 id，含级联后代。 */
  readonly removed: readonly string[]
  /** 文件删除失败项，形如 `<路径>: <原因>`；非空不影响本次删除整体成功。 */
  readonly warnings: readonly string[]
}

/** 已迁移条目的身份：归档根下的一级项目目录 + 会话目录名。 */
export interface MigratedTarget {
  /** 归档根下的一级目录名（= projectKey(workspace.path)，或 `_no-cwd`）。 */
  readonly projectDir: string
  /** 会话目录名（= session id；两代命名都原样保留）。 */
  readonly dirName: string
}

/** delete-migrated / restore-migrated 共用请求体。 */
export interface MigratedRequest {
  /** 要处置的归档条目；绝对路径由宿主用 archiveRoot + projectDir + dirName 拼出。 */
  readonly entries: readonly MigratedTarget[]
}

/**
 * 归档根下的一条已迁移会话。
 *
 * `sessionId` 与 `dirName` 在当前实现里恒等，但**故意都保留**：`dirName` 是回写请求
 * 的文件系统键，`sessionId` 是给用户看、给 registry 用的身份；若上游哪天改目录编码
 * 规则，两者会分叉而界面仍然正确。
 */
export interface MigratedEntry {
  /** 会话 id（当前取目录名，不做 `session-` 前缀归一）。 */
  readonly sessionId: string
  /** 归档根下的会话目录名。 */
  readonly dirName: string
  /** 归档根下的一级项目目录名。 */
  readonly projectDir: string
  /** 目录内一层文件体积之和（不递归）。 */
  readonly bytes: number
  /** 目录 mtime（epoch ms）。 */
  readonly updatedAt: number
  /**
   * 会话日志前缀内**首个** `session/title` 事件的标题（已 trim）。
   * 不承诺是日志里的最新标题（近似语义）；不可得时缺省。
   */
  readonly title?: string
  /**
   * 会话日志 header 行的 `createdAt`（epoch ms，恒 > 0）。
   * header 不可读时缺省；**不会**写 0（0 在界面上会渲染成 1970）。
   */
  readonly createdAt?: number
}

/** 已迁移列表响应。 */
export interface MigratedListing {
  /** 宿主解析后的归档根绝对路径。 */
  readonly archiveRoot: string
  /** 归档根下的会话条目。 */
  readonly entries: readonly MigratedEntry[]
  /** 条目数超过 {@link MAX_LISTED_MIGRATED} 时为 true。 */
  readonly truncated: boolean
}

/** 恢复成功的一条会话。 */
export interface RestoredEntry {
  /** 恢复的会话 id。 */
  readonly sessionId: string
  /** 挂回的工作区；匹配不到为 null（未分组）。 */
  readonly workspaceId: string | null
}

/** 恢复结果：成功搬回的条目与逐条降级告警（挂回失败不影响已搬回的事实）。 */
export interface RestoreOutcome {
  /** 已搬回 `<home>/sessions` 的会话（可为空数组：全部逐项失败时）。 */
  readonly restored: readonly RestoredEntry[]
  /** 挂回工作区 / 归档集合 / 广播失败等降级项，形如 `<动作>: <id>: <原因>`。 */
  readonly warnings: readonly string[]
}

/**
 * 一次已解析的宿主调用：端点与其请求体在类型上绑定，`switch` 后不需要再断言。
 *
 * 每个成员都是「端点字面量 + 该端点唯一的请求体形状」；`parseRequest` 是唯一的构造
 * 入口，宿主 dispatcher 不允许自行拼装。
 */
export type WebUxRequest =
  | { readonly endpoint: typeof PREVIEW_ENDPOINT; readonly body: DeleteRequest }
  | { readonly endpoint: typeof DELETE_ENDPOINT; readonly body: DeleteRequest }
  | { readonly endpoint: typeof PREVIEW_BATCH_ENDPOINT; readonly body: DeleteBatchRequest }
  | { readonly endpoint: typeof DELETE_BATCH_ENDPOINT; readonly body: DeleteBatchRequest }
  | { readonly endpoint: typeof LIST_MIGRATED_ENDPOINT; readonly body: Readonly<Record<string, never>> }
  | { readonly endpoint: typeof DELETE_MIGRATED_ENDPOINT; readonly body: MigratedRequest }
  | { readonly endpoint: typeof RESTORE_MIGRATED_ENDPOINT; readonly body: MigratedRequest }

/** 失败响应信封：稳定码 + 可读兜底文案。 */
export interface WireFailure {
  /** 稳定失败码；可能是本版本未知的码。 */
  readonly code: string
  /** 人类可读的兜底文案（不参与本地化）。 */
  readonly message: string
}

/** 一次解析的结果：值，或一句说明哪里不合契约的话。 */
export type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string }

/**
 * 单批目标上限：执行是串行 fs 循环，500 已接近「一次可接受的操作时长」上限。请求体
 * 里的 `sessionIds` / `entries` 数组都受它约束。
 */
export const MAX_BATCH_TARGETS = 500

/**
 * 一次列出的归档条目上限；超出置 `truncated=true`，界面提示先清理再刷新，而不是把
 * 无界的目录树塞进一次响应。
 */
export const MAX_LISTED_MIGRATED = 2000

/**
 * 路径片段（sessionId / projectDir / dirName）的长度上限：这些值会被宿主当作单个
 * 目录名使用，上限取 255（多数文件系统的单段名上限）。模块私有，只经
 * {@link readPathSegment} 生效。
 */
const MAX_PATH_SEGMENT = 255

/** 读一个普通对象（非 `null`、非数组、非标量）。 */
function readObject(value: unknown, subject: string): Parsed<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, message: `${subject}不是对象` }
  }
  return { ok: true, value: value as Record<string, unknown> }
}

/**
 * 校验请求体字段白名单：多一个键都拒绝。
 *
 * 静默忽略未知字段会掩盖版本漂移（旧宿主收到新客户端多带的字段却照样执行），所以
 * 每个请求端点都给出自己的精确键集。
 */
function readExactFields(
  record: Record<string, unknown>,
  allowed: readonly string[],
  subject: string,
): Parsed<Record<string, unknown>> {
  const extra = Object.keys(record).filter((key) => !allowed.includes(key))
  if (extra.length > 0) return { ok: false, message: `${subject}含未知字段：${extra.join(', ')}` }
  return { ok: true, value: record }
}

/**
 * 校验一个路径片段：非空字符串、长度 ≤ 255、不含控制字符、不是 `.` / `..`、不含
 * `/` 或 `\`。
 *
 * 宿主会把这些值当单个目录名拼接，任何一项不满足都意味着路径逃逸或非法文件名；
 * `sessionId`、`projectDir`、`dirName` 三处共用同一套判定，避免规则漂移。
 *
 * @param value - 待校验的值。
 * @param subject - 出现在失败信息里的字段名。
 * @returns 合法片段，或不合契约的原因。
 */
function readPathSegment(value: unknown, subject: string): Parsed<string> {
  if (typeof value !== 'string' || value === '') return { ok: false, message: `${subject} 缺失或不是非空字符串` }
  if (value.length > MAX_PATH_SEGMENT) return { ok: false, message: `${subject} 超长` }
  // 控制字符（含 NUL）不是合法路径片段：宿主会把它当目录名用，node:fs 会直接抛错。
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return { ok: false, message: `${subject} 含控制字符` }
  if (value === '.' || value === '..') return { ok: false, message: `${subject} 不能是 . 或 ..` }
  if (value.includes('/') || value.includes('\\')) return { ok: false, message: `${subject} 含路径分隔符` }
  return { ok: true, value }
}

/** 读一个非空字符串字段（用于响应里的身份/文本，不施加路径片段规则）。 */
function readNonEmptyString(value: unknown, subject: string): Parsed<string> {
  if (typeof value !== 'string' || value === '') return { ok: false, message: `${subject} 缺失或不是非空字符串` }
  return { ok: true, value }
}

/**
 * 读一个可选的「trim 后非空」字符串字段；键缺失返回 undefined。
 *
 * 与 {@link readNonEmptyString} 的差别在可选性：字段读不出来时宿主不写键，client 据
 * undefined 做回退，而不是拿空串占位。键存在但非字符串、空串或纯空白都算坏响应；
 * 合法值原样收下（不在 wire 层 trim），长度与字符不加白名单。
 */
function readOptionalNonEmptyString(
  record: Record<string, unknown>,
  key: string,
  subject: string,
): Parsed<string | undefined> {
  const value = record[key]
  if (value === undefined) return { ok: true, value: undefined }
  if (typeof value !== 'string' || value === '' || value.trim() === '') {
    return { ok: false, message: `${subject} 的 ${key} 不是 trim 后的非空字符串` }
  }
  return { ok: true, value }
}

/** 读一个非负有限数字段。 */
function readNonNegativeNumber(
  record: Record<string, unknown>,
  key: string,
  subject: string,
): Parsed<number> {
  const value = record[key]
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return { ok: false, message: `${subject} 的 ${key} 不是非负有限数` }
  }
  return { ok: true, value }
}

/** 读一个非负安全整数计数。 */
function readCount(record: Record<string, unknown>, key: string, subject: string): Parsed<number> {
  const value = record[key]
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    return { ok: false, message: `${subject} 的 ${key} 不是非负安全整数` }
  }
  return { ok: true, value }
}

/**
 * 读一个可选的正有限数字段（epoch ms）；键缺失返回 undefined。
 *
 * 与 {@link readNonNegativeNumber} 的差别有二：键缺失合法（返回 undefined），且合法值
 * 必须严格 > 0（0 会在界面上渲染成 1970，宿主读到不了 header 时应缺键而不是写 0）。
 */
function readOptionalPositiveNumber(
  record: Record<string, unknown>,
  key: string,
  subject: string,
): Parsed<number | undefined> {
  const value = record[key]
  if (value === undefined) return { ok: true, value: undefined }
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return { ok: false, message: `${subject} 的 ${key} 不是正有限数` }
  }
  return { ok: true, value }
}

/**
 * 校验单会话请求体：只允许 `sessionId` + `mode` 两个字段。
 *
 * @param payload - 原始请求体。
 * @returns 单会话请求，或不合契约的原因。
 */
function readDeleteRequest(payload: unknown): Parsed<DeleteRequest> {
  const object = readObject(payload, '请求体')
  if (!object.ok) return object
  const fields = readExactFields(object.value, ['sessionId', 'mode'], '请求体')
  if (!fields.ok) return fields
  const record = fields.value
  const sessionId = readPathSegment(record['sessionId'], 'sessionId')
  if (!sessionId.ok) return sessionId
  const mode = record['mode']
  if (!isDisposalMode(mode)) return { ok: false, message: 'mode 缺失或不是 delete / archive' }
  return { ok: true, value: { sessionId: sessionId.value, mode } }
}

/**
 * 校验批量请求体：只允许 `sessionIds` + `mode` 两个字段。
 *
 * `sessionIds` 必须是 1..500 个合法路径片段；允许重复（宿主按首见顺序去重，客户端
 * 不做假设）。
 *
 * @param payload - 原始请求体。
 * @returns 批量请求，或不合契约的原因。
 */
function readBatchRequest(payload: unknown): Parsed<DeleteBatchRequest> {
  const object = readObject(payload, '请求体')
  if (!object.ok) return object
  const fields = readExactFields(object.value, ['sessionIds', 'mode'], '请求体')
  if (!fields.ok) return fields
  const record = fields.value
  const sessionIds = record['sessionIds']
  if (!Array.isArray(sessionIds)) return { ok: false, message: 'sessionIds 缺失或不是数组' }
  if (sessionIds.length === 0) return { ok: false, message: 'sessionIds 不能为空数组' }
  if (sessionIds.length > MAX_BATCH_TARGETS) {
    return { ok: false, message: `sessionIds 超过单批上限 ${MAX_BATCH_TARGETS}` }
  }
  const ids: string[] = []
  for (let index = 0; index < sessionIds.length; index += 1) {
    const id = readPathSegment(sessionIds[index], `sessionIds[${index}]`)
    if (!id.ok) return id
    ids.push(id.value)
  }
  const mode = record['mode']
  if (!isDisposalMode(mode)) return { ok: false, message: 'mode 缺失或不是 delete / archive' }
  return { ok: true, value: { sessionIds: ids, mode } }
}

/**
 * 校验迁移域请求体：只允许 `entries` 一个字段，每项恰为 `{ projectDir, dirName }`
 * 两键。
 *
 * @param payload - 原始请求体。
 * @returns 迁移请求，或不合契约的原因。
 */
function readMigratedRequest(payload: unknown): Parsed<MigratedRequest> {
  const object = readObject(payload, '请求体')
  if (!object.ok) return object
  const fields = readExactFields(object.value, ['entries'], '请求体')
  if (!fields.ok) return fields
  const entries = fields.value['entries']
  if (!Array.isArray(entries)) return { ok: false, message: 'entries 缺失或不是数组' }
  if (entries.length === 0) return { ok: false, message: 'entries 不能为空数组' }
  if (entries.length > MAX_BATCH_TARGETS) {
    return { ok: false, message: `entries 超过单批上限 ${MAX_BATCH_TARGETS}` }
  }
  const targets: MigratedTarget[] = []
  for (let index = 0; index < entries.length; index += 1) {
    const subject = `entries[${index}]`
    const entry = readObject(entries[index], subject)
    if (!entry.ok) return entry
    const exact = readExactFields(entry.value, ['projectDir', 'dirName'], subject)
    if (!exact.ok) return exact
    const projectDir = readPathSegment(exact.value['projectDir'], `${subject}.projectDir`)
    if (!projectDir.ok) return projectDir
    const dirName = readPathSegment(exact.value['dirName'], `${subject}.dirName`)
    if (!dirName.ok) return dirName
    targets.push({ projectDir: projectDir.value, dirName: dirName.value })
  }
  return { ok: true, value: { entries: targets } }
}

/**
 * 校验 `list-migrated` 的请求体：必须是空对象 `{}`（不得带任何字段）。
 *
 * @param payload - 原始请求体。
 * @returns 空请求体，或不合契约的原因。
 */
function readEmptyRequest(payload: unknown): Parsed<Readonly<Record<string, never>>> {
  const object = readObject(payload, '请求体')
  if (!object.ok) return object
  const keys = Object.keys(object.value)
  if (keys.length > 0) return { ok: false, message: `请求体含未知字段：${keys.join(', ')}` }
  return { ok: true, value: {} }
}

/**
 * 校验宿主收到的一次调用：端点名与请求体一起解析成 {@link WebUxRequest}。
 *
 * 这是 7 个端点的唯一入口；未知端点与请求体形状错误都返回 `bad-request` 级别的
 * 原因（由 dispatcher 转成失败信封）。
 *
 * @param endpoint - 通道派发的端点名（RPC method）。
 * @param payload - 原始请求体。
 * @returns 可执行的请求，或不合契约的原因。
 */
export function parseRequest(endpoint: string, payload: unknown): Parsed<WebUxRequest> {
  switch (endpoint) {
    case PREVIEW_ENDPOINT: {
      const body = readDeleteRequest(payload)
      if (!body.ok) return body
      return { ok: true, value: { endpoint: PREVIEW_ENDPOINT, body: body.value } }
    }
    case DELETE_ENDPOINT: {
      const body = readDeleteRequest(payload)
      if (!body.ok) return body
      return { ok: true, value: { endpoint: DELETE_ENDPOINT, body: body.value } }
    }
    case PREVIEW_BATCH_ENDPOINT: {
      const body = readBatchRequest(payload)
      if (!body.ok) return body
      return { ok: true, value: { endpoint: PREVIEW_BATCH_ENDPOINT, body: body.value } }
    }
    case DELETE_BATCH_ENDPOINT: {
      const body = readBatchRequest(payload)
      if (!body.ok) return body
      return { ok: true, value: { endpoint: DELETE_BATCH_ENDPOINT, body: body.value } }
    }
    case LIST_MIGRATED_ENDPOINT: {
      const body = readEmptyRequest(payload)
      if (!body.ok) return body
      return { ok: true, value: { endpoint: LIST_MIGRATED_ENDPOINT, body: body.value } }
    }
    case DELETE_MIGRATED_ENDPOINT: {
      const body = readMigratedRequest(payload)
      if (!body.ok) return body
      return { ok: true, value: { endpoint: DELETE_MIGRATED_ENDPOINT, body: body.value } }
    }
    case RESTORE_MIGRATED_ENDPOINT: {
      const body = readMigratedRequest(payload)
      if (!body.ok) return body
      return { ok: true, value: { endpoint: RESTORE_MIGRATED_ENDPOINT, body: body.value } }
    }
    default:
      return { ok: false, message: `未知端点 "${endpoint}"` }
  }
}

/**
 * 校验宿主收到的单会话调用（既有分派路径）。
 *
 * 语义与签名保持既有：**只认** `preview-delete` / `delete-session` 两个单会话端点
 * （`ENDPOINTS` 已扩到 7 个，这里刻意不复用它，避免把批量/迁移请求误当单会话请求
 * 执行）。新代码请走 {@link parseRequest}。
 *
 * @param endpoint - 通道派发的端点名（RPC method）。
 * @param payload - 原始请求体。
 * @returns 可执行的请求，或不合契约的原因。
 */
export function parseDeleteRequest(endpoint: string, payload: unknown): Parsed<DeleteRequest> {
  if (endpoint !== PREVIEW_ENDPOINT && endpoint !== DELETE_ENDPOINT) {
    return { ok: false, message: `未知端点 "${endpoint}"` }
  }
  return readDeleteRequest(payload)
}

/**
 * 校验预览响应。
 * @param value - 端点返回的原始值。
 * @returns 预览结果，或形状不符的原因。
 */
export function parsePreview(value: unknown): Parsed<DeletePreview> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, message: '预览响应不是对象' }
  }
  const record = value as Record<string, unknown>
  const sessionCount = readCount(record, 'sessionCount', '预览响应')
  if (!sessionCount.ok) return sessionCount
  const descendantCount = readCount(record, 'descendantCount', '预览响应')
  if (!descendantCount.ok) return descendantCount
  const logBytes = record['logBytes']
  if (typeof logBytes !== 'number' || !Number.isFinite(logBytes) || logBytes < 0) {
    return { ok: false, message: '预览响应的 logBytes 不是非负有限数' }
  }
  const archiveRoot = record['archiveRoot']
  if (typeof archiveRoot !== 'string' || archiveRoot === '') {
    return { ok: false, message: '预览响应的 archiveRoot 缺失或不是非空字符串' }
  }
  return {
    ok: true,
    value: {
      sessionCount: sessionCount.value,
      descendantCount: descendantCount.value,
      logBytes,
      archiveRoot,
    },
  }
}

/** 读 `rejected` 数组：每项 `sessionId` / `code` 非空字符串，`message` 为字符串。 */
function readRejectedTargets(value: unknown): Parsed<readonly RejectedTarget[]> {
  if (!Array.isArray(value)) return { ok: false, message: '批量预览响应的 rejected 不是数组' }
  const items: RejectedTarget[] = []
  for (let index = 0; index < value.length; index += 1) {
    const subject = `批量预览响应的 rejected[${index}]`
    const object = readObject(value[index], subject)
    if (!object.ok) return object
    const sessionId = readNonEmptyString(object.value['sessionId'], `${subject}.sessionId`)
    if (!sessionId.ok) return sessionId
    const code = readNonEmptyString(object.value['code'], `${subject}.code`)
    if (!code.ok) return code
    const message = object.value['message']
    if (typeof message !== 'string') return { ok: false, message: `${subject}.message 不是字符串` }
    items.push({ sessionId: sessionId.value, code: code.value, message })
  }
  return { ok: true, value: items }
}

/**
 * 校验批量预览响应。
 * @param value - 端点返回的原始值。
 * @returns 批量预览结果，或形状不符的原因。
 */
export function parseBatchPreview(value: unknown): Parsed<DeleteBatchPreview> {
  const object = readObject(value, '批量预览响应')
  if (!object.ok) return object
  const record = object.value
  const targetCount = readCount(record, 'targetCount', '批量预览响应')
  if (!targetCount.ok) return targetCount
  const sessionCount = readCount(record, 'sessionCount', '批量预览响应')
  if (!sessionCount.ok) return sessionCount
  const descendantCount = readCount(record, 'descendantCount', '批量预览响应')
  if (!descendantCount.ok) return descendantCount
  const logBytes = readNonNegativeNumber(record, 'logBytes', '批量预览响应')
  if (!logBytes.ok) return logBytes
  const archiveRoot = readNonEmptyString(record['archiveRoot'], '批量预览响应的 archiveRoot')
  if (!archiveRoot.ok) return archiveRoot
  const rejected = readRejectedTargets(record['rejected'])
  if (!rejected.ok) return rejected
  return {
    ok: true,
    value: {
      targetCount: targetCount.value,
      sessionCount: sessionCount.value,
      descendantCount: descendantCount.value,
      logBytes: logBytes.value,
      archiveRoot: archiveRoot.value,
      rejected: rejected.value,
    },
  }
}

/**
 * 校验已迁移列表响应。
 * @param value - 端点返回的原始值。
 * @returns 已迁移列表，或形状不符的原因。
 */
export function parseMigratedListing(value: unknown): Parsed<MigratedListing> {
  const object = readObject(value, '已迁移列表响应')
  if (!object.ok) return object
  const record = object.value
  const archiveRoot = readNonEmptyString(record['archiveRoot'], '已迁移列表响应的 archiveRoot')
  if (!archiveRoot.ok) return archiveRoot
  const entries = record['entries']
  if (!Array.isArray(entries)) return { ok: false, message: '已迁移列表响应的 entries 不是数组' }
  const items: MigratedEntry[] = []
  for (let index = 0; index < entries.length; index += 1) {
    const subject = `已迁移列表响应的 entries[${index}]`
    const entry = readObject(entries[index], subject)
    if (!entry.ok) return entry
    const sessionId = readNonEmptyString(entry.value['sessionId'], `${subject}.sessionId`)
    if (!sessionId.ok) return sessionId
    const dirName = readNonEmptyString(entry.value['dirName'], `${subject}.dirName`)
    if (!dirName.ok) return dirName
    const projectDir = readNonEmptyString(entry.value['projectDir'], `${subject}.projectDir`)
    if (!projectDir.ok) return projectDir
    const bytes = readNonNegativeNumber(entry.value, 'bytes', subject)
    if (!bytes.ok) return bytes
    const updatedAt = readNonNegativeNumber(entry.value, 'updatedAt', subject)
    if (!updatedAt.ok) return updatedAt
    const title = readOptionalNonEmptyString(entry.value, 'title', subject)
    if (!title.ok) return title
    const createdAt = readOptionalPositiveNumber(entry.value, 'createdAt', subject)
    if (!createdAt.ok) return createdAt
    items.push({
      sessionId: sessionId.value,
      dirName: dirName.value,
      projectDir: projectDir.value,
      bytes: bytes.value,
      updatedAt: updatedAt.value,
      ...(title.ok && title.value !== undefined ? { title: title.value } : {}),
      ...(createdAt.ok && createdAt.value !== undefined ? { createdAt: createdAt.value } : {}),
    })
  }
  const truncated = record['truncated']
  if (typeof truncated !== 'boolean') return { ok: false, message: '已迁移列表响应的 truncated 不是布尔值' }
  return { ok: true, value: { archiveRoot: archiveRoot.value, entries: items, truncated } }
}

/** 读一个字符串数组字段，并复制成独立数组。 */
function readStringList(record: Record<string, unknown>, key: string, subject: string): Parsed<readonly string[]> {
  const value = record[key]
  if (!Array.isArray(value)) return { ok: false, message: `${subject} 的 ${key} 不是数组` }
  const items: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') return { ok: false, message: `${subject} 的 ${key} 含非字符串项` }
    items.push(item)
  }
  return { ok: true, value: items }
}

/**
 * 校验恢复响应。
 * @param value - 端点返回的原始值。
 * @returns 恢复结果，或形状不符的原因。
 */
export function parseRestoreOutcome(value: unknown): Parsed<RestoreOutcome> {
  const object = readObject(value, '恢复响应')
  if (!object.ok) return object
  const record = object.value
  const restored = record['restored']
  if (!Array.isArray(restored)) return { ok: false, message: '恢复响应的 restored 不是数组' }
  const items: RestoredEntry[] = []
  for (let index = 0; index < restored.length; index += 1) {
    const subject = `恢复响应的 restored[${index}]`
    const entry = readObject(restored[index], subject)
    if (!entry.ok) return entry
    const sessionId = readNonEmptyString(entry.value['sessionId'], `${subject}.sessionId`)
    if (!sessionId.ok) return sessionId
    const workspaceId = entry.value['workspaceId']
    if (workspaceId !== null && typeof workspaceId !== 'string') {
      return { ok: false, message: `${subject}.workspaceId 既不是字符串也不是 null` }
    }
    items.push({ sessionId: sessionId.value, workspaceId })
  }
  const warnings = readStringList(record, 'warnings', '恢复响应')
  if (!warnings.ok) return warnings
  return { ok: true, value: { restored: items, warnings: warnings.value } }
}

/**
 * 校验执行响应。
 * @param value - 端点返回的原始值。
 * @returns 执行结果，或形状不符的原因。
 */
export function parseOutcome(value: unknown): Parsed<DeleteOutcome> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, message: '执行响应不是对象' }
  }
  const record = value as Record<string, unknown>
  const removed = readStringList(record, 'removed', '执行响应')
  if (!removed.ok) return removed
  if (removed.value.length === 0) return { ok: false, message: '执行响应的 removed 为空' }
  const warnings = readStringList(record, 'warnings', '执行响应')
  if (!warnings.ok) return warnings
  return { ok: true, value: { removed: removed.value, warnings: warnings.value } }
}

/**
 * 校验失败信封 `{ code, message }`。
 * @param value - 原始错误值。
 * @returns 失败信封，或 `undefined`（该值不是信封）。
 */
export function parseFailure(value: unknown): WireFailure | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const code = record['code']
  const message = record['message']
  if (typeof code !== 'string' || code === '' || typeof message !== 'string') return undefined
  return { code, message }
}
