/**
 * 「工作区文件夹」分节的能力自适应目录拾取（client 半）。
 *
 * 上游 `uiWorkspace` 的目录能力是互斥的判别联合：native 表面只有
 * `pickDirectory`（OS 选择框），browse 表面只有 `listDirectory` /
 * `createDirectory`（可编程浏览原语）；client 侧没有官方能力探测 API，而
 * `pickDirectory` 失败时只抛 `new Error(message)`——结构化的 `code` /
 * `details` 在该层被丢弃（`@deepseek-ai/dsh-client-ui-workspace` 的
 * `pickDirectory` 实现事实，ADR-0015 的 Context 留痕）。本模块把「pick 失败」
 * 翻译成结构化的拾取结局（`DirectoryPickOutcome` 五态），把 browse 原语包成
 * 可注入对话框的浏览端口（`DirectoryBrowser`，失败已归一化），并按三级信号
 * 判定能力（顺序固定）：
 *
 * 1. 结构化 `details.capability`——`list` / `create` 的 rpcError 可靠携带；
 *    pick 层通常取不到，上游一旦修复本支自动接管；
 * 2. message 正则兜底——上游文案不是契约，改形即失配（后果只是多一次探测）；
 * 3. `listDirectory` 零参结构探测——home 层同时充当对话框首帧。
 *
 * 判定结论按**服务实例身份**缓存（D-12）：`read()` 返回同一实例时直接复用，
 * 宿主热替换或 HMR 重建产生新实例即失效重判。
 *
 * 零 React、零上游运行时 import：node 环境可直接单测；装配在 `index.ts`，
 * 通过 `read()` thunk 现取服务——服务晚到仍可用。
 *
 * @module dsh-plugin-multi-root-workspace/client/directory-picker
 */

/* ---------- 上游原语的结构镜像（刻意不 import 上游类型包，D-11） ---------- */

/** 上游 DirectoryEntry 的结构镜像（`@deepseek-ai/dsh-host-directory-picker` 的 `DirectoryEntry`）。 */
export interface DirectoryEntry {
  readonly name: string
  /** 绝对宿主路径；客户端永不自行拼接路径段。 */
  readonly path: string
  /** 宿主平台约定的隐藏项（POSIX 点开头）；是否展示由客户端决定。 */
  readonly hidden: boolean
}

/** 上游 DirectoryListing 的结构镜像。 */
export interface DirectoryListing {
  readonly path: string
  /** 宿主账户 home，面包屑「主目录」的锚点。 */
  readonly home: string
  /** 文件系统根 → 当前层的祖先链（含当前层，每段都可跳转）。 */
  readonly crumbs: readonly DirectoryEntry[]
  /** 直接子目录（按名排序，含指向目录的符号链接）。 */
  readonly entries: readonly DirectoryEntry[]
  /** 后端在完整结果上界处截断 entries 时为 true。 */
  readonly truncated: boolean
}

/** `ctx.uiWorkspace` 中本插件用到的方法；三项都可缺席（组合由表面决定）。 */
export interface DirectoryPickerService {
  readonly pickDirectory?: () => Promise<string | null>
  readonly listDirectory?: (path?: string, signal?: AbortSignal) => Promise<DirectoryListing>
  readonly createDirectory?: (path: string, name: string) => Promise<string>
}

/** 浏览端口：只暴露对话框需要的两个原语，且失败已归一化。 */
export interface DirectoryBrowser {
  /** 列一层；`path` 缺席 = 宿主 home；`signal` 中止底层扫描。 */
  readonly list: (path?: string, signal?: AbortSignal) => Promise<DirectoryListing>
  /** 在已存在的父目录下新建一个子目录，返回创建出的绝对路径。 */
  readonly create: (path: string, name: string) => Promise<string>
}

/** 一次「选择目录」的结局。 */
export type DirectoryPickOutcome =
  | { readonly kind: 'picked'; readonly path: string } // native 成功且非空
  | { readonly kind: 'cancelled' } // 操作员取消（null / 空串）
  | { readonly kind: 'browse'; readonly browsing: DirectoryBrowser; readonly listing?: DirectoryListing }
  | { readonly kind: 'unavailable' } // 无法判定能力：隐藏拾取入口 + 提示手输
  | { readonly kind: 'failed'; readonly error: unknown } // 有拾取能力但本次失败：照常报错

export type PickDirectory = () => Promise<DirectoryPickOutcome>

/** 浏览失败：`code` 是本地稳定码（不是 wire 码），`message` 保留上游原文供诊断。 */
export class DirectoryBrowseError extends Error {
  readonly name = 'DirectoryBrowseError'
  readonly code: DirectoryBrowseCode

  constructor(code: DirectoryBrowseCode, message: string) {
    super(message)
    this.code = code
  }
}

export type DirectoryBrowseCode =
  | 'picker-unreadable'
  | 'picker-exists'
  | 'picker-create-failed'
  | 'picker-failed'

/**
 * 构造拾取端口。
 * @param read - 每次调用现取 `ctx.uiWorkspace`（服务可能晚于 apply 就绪，也可能被替换）。
 * @returns 可直接注入分节的 `pickDirectory`（永远存在；无服务时调用返回 unavailable）。
 */
export function createDirectoryPicker(read: () => DirectoryPickerService | undefined): PickDirectory {
  /** 能力缓存：以上次判定的服务实例为键（D-12），实例更换即失效。 */
  let cached: { readonly service: DirectoryPickerService; readonly kind: Capability } | undefined
  const remember = (service: DirectoryPickerService, kind: Capability): void => {
    cached = { service, kind }
  }

  return async () => {
    const service = read()
    // 行为契约 1：服务缺席 → unavailable，且不缓存——服务之后到达仍可用。
    if (service === undefined) return { kind: 'unavailable' }

    // 行为契约 2：已知 browse 且实例未换 → 直接降级，不再调 pickDirectory。
    const known = cached !== undefined && cached.service === service ? cached.kind : undefined
    if (known === 'browse') {
      const browsing = browseOf(service)
      return browsing === undefined ? { kind: 'unavailable' } : { kind: 'browse', browsing }
    }

    // 行为契约 5：没有 pick 表面但有 list+create → 结构判定 browse（不发失败 RPC）。
    if (service.pickDirectory === undefined) {
      const browsing = browseOf(service)
      if (browsing === undefined) return { kind: 'unavailable' }
      remember(service, 'browse')
      return { kind: 'browse', browsing }
    }

    // 行为契约 3：pick 先行——交互式拾取每次都要真实发起（native 不因缓存短路）。
    try {
      const path = await service.pickDirectory()
      if (path !== null && path !== '') {
        remember(service, 'native')
        return { kind: 'picked', path }
      }
      // null / 空串 = 操作员取消；契约未要求在此缓存，保留逐次真实拾取。
      return { kind: 'cancelled' }
    } catch (error) {
      // 行为契约 4：调用抛错 → 按三级信号分类。
      return await classifyPickFailure(service, error, remember)
    }
  }
}

/* ---------- 内部：能力判定的三级信号（顺序固定，见模块注释） ---------- */

/** 判定出的能力面。 */
type Capability = 'native' | 'browse'

/** DSH 远程失败的结构视图：只按形状读，不 `instanceof`（wire 载体可能有包装层）。 */
type RemoteFailureView = {
  readonly code?: unknown
  readonly message?: unknown
  readonly details?: { readonly capability?: unknown } | undefined
  readonly isDSHRemoteError?: unknown
}

/**
 * pick 抛错后的三级信号分类（顺序固定）。
 *
 * 任意一支返回 browse 之前都要求服务确有 list+create（`browseOf` / 窄化门）：
 * 只暴露 pick 的旧组合不许被误判成能浏览。
 * @param service - 本次判定的服务实例。
 * @param error - pick 原始错误（`failed` 结局必须原样上报）。
 * @param remember - 判定成立时写入能力缓存。
 */
async function classifyPickFailure(
  service: DirectoryPickerService,
  error: unknown,
  remember: (service: DirectoryPickerService, kind: Capability) => void,
): Promise<DirectoryPickOutcome> {
  // ① 结构化信号：details.capability 可靠时直接分派（上游修复 pick 层后本支自动接管）。
  const capability = capabilityOf(failureOf(error))
  if (capability === 'native') return { kind: 'failed', error }
  if (capability === 'browse') return degradeToBrowse(service, remember)

  // ② message 正则兜底：只锚定上游模板的两处片段，不当契约（改形即落到 ③）。
  const message = messageOf(error)
  if (BROWSE_MESSAGE_PATTERNS.some(pattern => pattern.test(message))) {
    return degradeToBrowse(service, remember)
  }

  // ③ 结构探测：零参 list = 宿主 home，成功即 browse（listing 复用为对话框首帧）。
  //    探测直调原始方法而非 browsing.list：要从原始 rpcError 读 capability，
  //    归一化会把 wire 码折成 picker-failed、丢掉该信号。直调必须经 `.call(service)`
  //    保留 receiver——上游原语是实例方法，this 敏感（2026-11-09 真机教训）。
  const list = service.listDirectory
  const create = service.createDirectory
  if (list === undefined || create === undefined) return { kind: 'unavailable' }
  const browsing = browsePort(list.bind(service), create.bind(service))
  try {
    const listing = await list.call(service)
    remember(service, 'browse')
    return { kind: 'browse', browsing, listing }
  } catch (probeError) {
    if (capabilityOf(failureOf(probeError)) === 'native') return { kind: 'failed', error }
    return { kind: 'unavailable' }
  }
}

/** ①② 命中 browse 后的统一降级出口：先过 browseOf 门，再缓存并返回（不带探测 listing）。 */
function degradeToBrowse(
  service: DirectoryPickerService,
  remember: (service: DirectoryPickerService, kind: Capability) => void,
): DirectoryPickOutcome {
  const browsing = browseOf(service)
  if (browsing === undefined) return { kind: 'unavailable' }
  remember(service, 'browse')
  return { kind: 'browse', browsing }
}

/** 服务的浏览端口（list+create 齐备才有）；失败经 `wrapBrowse` 归一化。 */
function browseOf(service: DirectoryPickerService): DirectoryBrowser | undefined {
  const { listDirectory: list, createDirectory: create } = service
  if (list === undefined || create === undefined) return undefined
  return browsePort(list.bind(service), create.bind(service))
}

/**
 * 在已窄化的两个原语上构造浏览端口（`browseOf` 与探测分支共用）。
 *
 * 两个原语必须先 `bind(service)` 再传入：上游 `uiWorkspace` 的 `listDirectory`
 * / `createDirectory` 是读实例状态（`this.directoryPicker`）的实例方法，解构
 * 成裸引用调用会丢 `this` 并以 TypeError 收场——pick 走方法调用语法幸免，
 * 端口路径必须显式保留 receiver（2026-11-09 真机修复，ADR-0015 Consequences）。
 */
function browsePort(
  list: NonNullable<DirectoryPickerService['listDirectory']>,
  create: NonNullable<DirectoryPickerService['createDirectory']>,
): DirectoryBrowser {
  return {
    list: (path, signal) => wrapBrowse(list(path, signal)),
    create: (path, name) => wrapBrowse(create(path, name)),
  }
}

/**
 * browse 原语的失败一律转成 `DirectoryBrowseError`（行为契约 7）；abort 也落
 * `picker-failed`，对话框据 `signal.aborted` 丢弃、不渲染错误。
 */
function wrapBrowse<T>(invocation: Promise<T>): Promise<T> {
  return invocation.catch(error => {
    throw normalizeBrowseFailure(error)
  })
}

/** wire 错误码 → 本地稳定码；表外（含 `gateway/internal`、`gateway/cancelled`）一律 `picker-failed`。 */
const WIRE_CODE_TO_LOCAL: Record<string, DirectoryBrowseCode> = {
  'directory-picker/unreadable': 'picker-unreadable',
  'directory-picker/exists': 'picker-exists',
  'directory-picker/create-failed': 'picker-create-failed',
}

/** 把上游 browse 原语的拒绝归一化成本地错误：`code` 稳定、`message` 保留上游原文供诊断。 */
function normalizeBrowseFailure(error: unknown): DirectoryBrowseError {
  const failure = failureOf(error)
  const wireCode = typeof failure?.code === 'string' ? failure.code : undefined
  const code = wireCode !== undefined ? WIRE_CODE_TO_LOCAL[wireCode] ?? 'picker-failed' : 'picker-failed'
  // 「上游原文」：优先顶层 message；wire 形状（rpcError 载体携带）回退读载体上的 message。
  const topLevel = messageOf(error)
  const message = topLevel !== '' ? topLevel : typeof failure?.message === 'string' ? failure.message : ''
  return new DirectoryBrowseError(code, message !== '' ? message : `directory browse failed: ${wireCode ?? 'unknown failure'}`)
}

/** 读取一个值上的 DSH 远程失败视图：值本身带 string `code`，或经 `rpcError` 载体携带；都不是则 undefined。 */
function failureOf(value: unknown): RemoteFailureView | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const direct = value as RemoteFailureView
  if (typeof direct.code === 'string') return direct
  const carrier = (value as { rpcError?: unknown }).rpcError
  return carrier !== null && typeof carrier === 'object' && typeof (carrier as RemoteFailureView).code === 'string'
    ? (carrier as RemoteFailureView)
    : undefined
}

/** 结构化信号里的 `details.capability`（details 缺席或非对象 → undefined）。 */
function capabilityOf(failure: RemoteFailureView | undefined): unknown {
  const details = failure?.details
  if (details === null || typeof details !== 'object') return undefined
  return (details as { capability?: unknown }).capability
}

/** 任意失败上的 message 原文（Error 或带 string message 的对象；取不到返回空串）。 */
function messageOf(value: unknown): string {
  if (value instanceof Error) return value.message
  if (value !== null && typeof value === 'object') {
    const message = (value as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return ''
}

/** message 兜底正则：锚定上游「composed picker serves "browse"」模板的两处片段；上游文案非契约。 */
const BROWSE_MESSAGE_PATTERNS: readonly RegExp[] = [
  /\bserves\s+["']?browse["']?/i,
  /["']capability["']\s*:\s*["']browse["']/i,
]
