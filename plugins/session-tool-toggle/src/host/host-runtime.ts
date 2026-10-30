/**
 * 宿主 `dsh-session` 模块的解析、身份断言与写入面适配。
 *
 * 为什么必须「解析宿主那一份」而不是 `import('@deepseek-ai/dsh-session')`（D1）：
 * `appendPluginRecord` 最终落到 `Session` 的**类私有方法** `#appendRecord` 上，
 * 而该方法只接受「与函数闭包同一份类」的实例（私有 brand 校验）。本包的
 * `@deepseek-ai/dsh-session` 是 devDependency，profile 安装会装出**第二份副本**；
 * 副本里的 `commitPluginRecord` 绑在副本自己的 `Session` 类上，对宿主实例调用必然
 * 抛 brand 错误。裸 specifier 还会让构建期把宿主打成 bundle 依赖，所以本模块的
 * specifier 一律是**运行期变量**（esbuild 不解析、不打包）。
 *
 * 解析梯形（顺序即优先级，**每一级都要过身份断言** `mod.Session === session.constructor`）：
 *
 * 1. `options.modulePath`：绝对路径覆盖（单测 / 排障）。接受**模块文件**（直接
 *    `import()`）或**解析锚点目录**（从该目录解析 `@deepseek-ai/dsh-session`，即
 *    `Config.hostModuleBase` 的语义），见 {@link importFromModulePath}。
 * 2. `realpath(process.argv[1])` → 向上找最近的 `package.json` 且
 *    `name === '@deepseek-ai/dsh'` → `createRequire(<dsh 包根>/package.json)`
 *    `.resolve('@deepseek-ai/dsh-session')` → 动态 `import()`。
 *    这条链的锚点是**启动 dsh 的入口**：从 dsh 包根解析，得到的就是宿主实际加载的
 *    那一份（Node 的模块缓存按解析结果去重，动态 `import()` 复用同一实例）。
 * 3. 全部失败 → `undefined`，调用方降级内存态（本会话有效，resume 丢状态）。
 *
 * 降级是**可观测**的：所有失败原因汇总成**一条** warn（每级失败各记一句，最终只输出
 * 一次，避免每个 agent 刷屏），文案带可操作的下一步（`hostModuleBase`）。
 *
 * 本文件只 import `node:*`：不 import 任何宿主包，构建产物零宿主依赖。
 *
 * @module dsh-plugin-session-tool-toggle/host/host-runtime
 */

import { readFile, realpath, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { HostRuntimeOptions, HostSessionApi, SessionLike, SpecLog } from './types.ts'

/** 解析梯形的锚点包名：`process.argv[1]` 向上找的 `package.json` 必须声明它。 */
const DSH_PACKAGE = '@deepseek-ai/dsh'

/** 宿主会话包的包名：从 dsh 包根解析它，得到宿主实际加载的那一份。 */
const SESSION_PACKAGE = '@deepseek-ai/dsh-session'

/**
 * 从模块命名空间取宿主写入面，并验证 session 身份。
 *
 * 身份断言是本模块存在的**全部理由**：`appendPluginRecord` 的私有 brand 校验只在
 * 「同一份 `Session` 类」上成立，`mod.Session !== session.constructor` 就说明解析到
 * 了第二份副本（或串了模块实例），此时必须返回 `undefined` 让调用方降级，而不是
 * 让第一次写入在运行期抛 brand 错误。
 *
 * 导出它是为了让单测直接驱动身份断言（真实 `import()` 需要落盘 fixture）；生产路径
 * 只有 {@link loadHostSessionApi} 调用。
 *
 * @param moduleNamespace - 动态 `import()` 的结果（任意值，不做信任假设）。
 * @param session - 要写入的会话；其 `constructor` 是身份断言的右值。
 * @param log - 诊断出口；失败原因恰好一条 warn。
 * @returns 适配后的写入面；命名空间不可用 / 身份不匹配 / 缺导出时为 `undefined`。
 */
export function adoptHostModule(
  moduleNamespace: unknown,
  session: SessionLike,
  log: SpecLog,
): HostSessionApi | undefined {
  if (moduleNamespace === null || typeof moduleNamespace !== 'object') {
    log.warn('宿主 dsh-session 不可用（导入结果不是模块命名空间），已降级为内存态')
    return undefined
  }

  const namespace = moduleNamespace as { readonly Session?: unknown; readonly appendPluginRecord?: unknown }

  if (namespace.Session !== session.constructor) {
    log.warn(
      '宿主 dsh-session 的身份断言失败（mod.Session 与 session.constructor 不一致），已降级为内存态；'
        + '这通常意味着解析到的是插件自带的第二份副本，请确认 dsh 版本或设置 hostModuleBase',
    )
    return undefined
  }

  if (typeof namespace.appendPluginRecord !== 'function') {
    log.warn('宿主 dsh-session 未导出 appendPluginRecord，已降级为内存态；请确认 dsh 版本')
    return undefined
  }

  // 真实签名是 `(session: Session, type: PluginRecordType, data: unknown) => SessionSeq`；
  // 端口声明的是结构等价的窄面。两个方向的差异（Session 子类型、字面量联合的 string）
  // 都在适配层收口，调用方只看到 `SessionLike` + `string`。
  const append = namespace.appendPluginRecord as (
    target: SessionLike,
    type: string,
    data: unknown,
  ) => number

  return {
    appendPluginRecord: (target, type, data) => append(target, type, data),
  }
}

/**
 * 解析宿主 `dsh-session` 并验证身份；任一环节失败返回 `undefined`（调用方降级内存态）。
 *
 * 失败诊断只输出**一条** warn：梯形每一级的失败原因先收集，全部失败才汇总输出——
 * 每级各发一条会让「未配置宿主的极简组合」在每次会话创建时刷四条日志。
 *
 * @param session - 要写入的会话（`agent.session`）；它的 `constructor` 用于身份断言。
 * @param options - 配置覆盖（`modulePath`）与诊断出口。
 * @returns 宿主写入面；解析或身份断言失败时为 `undefined`，永不抛错。
 */
export async function loadHostSessionApi(
  session: SessionLike,
  options: HostRuntimeOptions,
): Promise<HostSessionApi | undefined> {
  /** 已发生的失败原因（按尝试顺序；最终汇总成一条 warn）。 */
  const failures: string[] = []

  /** 收集失败的探针日志：warn 进 `failures`，其余直接转发。 */
  const probe: SpecLog = {
    info: (message) => options.log.info(message),
    warn: (message) => failures.push(message),
    error: (message) => options.log.error(message),
  }

  if (options.modulePath !== undefined) {
    const api = await importFromModulePath(options.modulePath, session, probe)
    if (api !== undefined) {
      reportIgnoredFailures(failures, options.log, 'options.modulePath')
      return api
    }
  }

  const resolved = await resolveFromProcessArgv(probe)
  if (resolved !== undefined) {
    const api = await importHostModule(resolved, session, probe)
    if (api !== undefined) {
      reportIgnoredFailures(failures, options.log, '启动入口解析')
      return api
    }
  }

  const detail = failures.length > 0 ? failures.join('；') : '解析梯形未产出候选路径'
  options.log.warn(
    `宿主 dsh-session 不可用（${detail}），已降级为内存态；本会话的开关在 resume 后会丢失，`
      + '可设置 hostModuleBase 覆盖解析锚点',
  )
  return undefined
}

/**
 * 第 1 级梯形：把配置覆盖解析成模块入口并加载。
 *
 * `modulePath` 接受两种形态，都是「绝对路径覆盖」的自然读法：
 *
 * - **模块文件**（`…/dsh-session/lib/index.js`）：直接 `import()`；
 * - **解析锚点目录**（dsh 安装根 / profile 根）：从该目录 `createRequire` 解析
 *   `@deepseek-ai/dsh-session` 再 `import()`。`Config.hostModuleBase` 就是这种锚点，
 *   装配层可以原样传进来；要求用户填到具体入口文件既难查也不稳定。
 *
 * 目录判定失败（路径不存在）时按文件处理，让 `import()` 给出统一的可读错误。
 *
 * @param modulePath - 模块文件路径或解析锚点目录。
 * @param session - 身份断言的会话。
 * @param log - 探针日志。
 * @returns 适配后的写入面；失败时为 `undefined`。
 */
async function importFromModulePath(
  modulePath: string,
  session: SessionLike,
  log: SpecLog,
): Promise<HostSessionApi | undefined> {
  const target = resolve(modulePath)

  if (await isDirectory(target)) {
    let file: string
    try {
      const require = createRequire(join(target, 'package.json'))
      file = require.resolve(SESSION_PACKAGE)
    } catch (error) {
      log.warn(`把 ${target} 当解析锚点解析 ${SESSION_PACKAGE} 失败（${describeError(error)}）`)
      return undefined
    }
    return importHostModule(file, session, log)
  }

  return importHostModule(target, session, log)
}

/**
 * 路径是否是目录。
 *
 * @param path - 任意路径。
 * @returns 是目录时为 true；不存在 / 无权限时为 false（交给后续导入报错）。
 */
async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

/**
 * 按路径加载一个模块并做身份断言。
 *
 * @param file - 模块文件路径（相对路径按当前工作目录解析）。
 * @param session - 身份断言的会话。
 * @param log - 探针日志。
 * @returns 适配后的写入面；导入失败或身份不匹配时为 `undefined`。
 */
async function importHostModule(
  file: string,
  session: SessionLike,
  log: SpecLog,
): Promise<HostSessionApi | undefined> {
  const target = resolve(file)
  try {
    // specifier 是运行期变量：esbuild 不解析、不打进 bundle（D1）。
    const moduleNamespace: unknown = await import(pathToFileURL(target).href)
    return adoptHostModule(moduleNamespace, session, log)
  } catch (error) {
    log.warn(`导入宿主 dsh-session 失败（${describeError(error)}）路径 ${target}`)
    return undefined
  }
}

/**
 * 第 2 级梯形：从 `process.argv[1]` 出发找到 dsh 包根，再解析 `dsh-session`。
 *
 * @param log - 探针日志（每一处失败记一句原因）。
 * @returns `dsh-session` 入口文件的绝对路径；任一环节不成立时为 `undefined`。
 */
async function resolveFromProcessArgv(log: SpecLog): Promise<string | undefined> {
  const entry = process.argv[1] as string | undefined
  if (entry === undefined || entry === '') {
    log.warn('process.argv[1] 为空，无法定位 dsh 安装')
    return undefined
  }

  let realEntry: string
  try {
    realEntry = await realpath(entry)
  } catch (error) {
    log.warn(`realpath(process.argv[1]) 失败（${describeError(error)}）`)
    return undefined
  }

  const packageDir = await findDshPackageDir(dirname(realEntry))
  if (packageDir === undefined) {
    log.warn(`process.argv[1] 的祖先目录里没有 name 为 ${DSH_PACKAGE} 的 package.json`)
    return undefined
  }

  try {
    const require = createRequire(join(packageDir, 'package.json'))
    return require.resolve(SESSION_PACKAGE)
  } catch (error) {
    log.warn(`从 ${packageDir} 解析 ${SESSION_PACKAGE} 失败（${describeError(error)}）`)
    return undefined
  }
}

/**
 * 从起始目录向上找最近的、`name === '@deepseek-ai/dsh'` 的 `package.json` 所在目录。
 *
 * 不用「第一个 package.json」：bin 目录里可能还有别的清单（`bin/package.json`、
 * 打包残留），认名字才是「dsh 包根」的判据。找不到就一路走到文件系统根。
 *
 * @param startDir - 起始目录（通常是 `dirname(realpath(process.argv[1]))`）。
 * @returns dsh 包根目录；不存在时为 `undefined`。
 */
async function findDshPackageDir(startDir: string): Promise<string | undefined> {
  let dir = startDir
  for (;;) {
    const name = await readPackageName(join(dir, 'package.json'))
    if (name === DSH_PACKAGE) return dir
    const parent = dirname(dir)
    // 到根：dirname('/') === '/'。
    if (parent === dir) return undefined
    dir = parent
  }
}

/**
 * 读一个 `package.json` 的 `name` 字段。
 *
 * 缺失、不是 JSON、不是对象都只是「这个目录不是 dsh 包根」，不构成异常。
 *
 * @param file - 清单文件的绝对路径。
 * @returns `name` 字符串；不可读或没有 name 时为 `undefined`。
 */
async function readPackageName(file: string): Promise<string | undefined> {
  try {
    const text = await readFile(file, 'utf8')
    const parsed: unknown = JSON.parse(text)
    if (parsed === null || typeof parsed !== 'object') return undefined
    const name = (parsed as { readonly name?: unknown }).name
    return typeof name === 'string' ? name : undefined
  } catch {
    return undefined
  }
}

/**
 * 后序候选成功时，把前面已忽略的失败原因记一条 info。
 *
 * 这不是噪声：用户显式配了 `modulePath` 却写错时，静默回落到自动解析会让「排障注入
 * 没生效」变成谜；一条 info 足够定位，又不会升成 warn。
 *
 * @param failures - 已收集的失败原因。
 * @param log - 真实诊断出口。
 * @param source - 成功的候选来源（用于文案）。
 */
function reportIgnoredFailures(failures: readonly string[], log: SpecLog, source: string): void {
  if (failures.length === 0) return
  log.info(`${source} 生效，已忽略 ${failures.length} 条更高优先级的解析失败：${failures.join('；')}`)
}

/**
 * 把一个 `unknown` 错误写成诊断里可读的一行。
 *
 * @param error - 任意抛出物。
 * @returns 错误消息（含 errno code，若有）。
 */
function describeError(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code
    return code === undefined ? error.message : `${error.message}（${code}）`
  }
  return String(error)
}
