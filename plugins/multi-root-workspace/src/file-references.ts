/**
 * `multi-root-file-references` 行：additive 包装 `ctx.fileReferences.list`，
 * 让附加根出现在 `@` 文件提及补全候选里（不替换上游 provider、不 disable
 * 任何上游行——先例：`lsp.ts` / `workspace-files.ts` 的 wrapMethod 形态）。
 *
 * 查询三分支（在 `await original` 之前同步判定，透传不干扰时序）：
 * - 空 query → 每个附加根一条绝对目录候选（path 无尾斜杠）；
 * - 绝对 query → 最长匹配的包含根钻入（该根的 WorkspaceFileSearch 以 `R/`
 *   为 displayDirectory 列目录，上游直接产出绝对候选）+ 其余以 query 为
 *   前缀的根各一条候选；
 * - 裸模糊 / 相对 query → 附加根完全不参与（连 WorkspaceFileSearch.acquire
 *   都不触发），字节级透传。
 *
 * 主根取 `agent.session.header.cwd` 的 canonical（不可变 session cwd，不受
 * 会话内 `cd` 影响，code-design ④ D5）；附加根清单唯一来源是
 * `ctx.multiRootScope`，每次调用按当前授予根 retain 剪枝缓存，根撤销即失效。
 *
 * @module dsh-plugin-multi-root-workspace/file-references
 */

import { isAbsolute } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { FileReferenceCandidate, FileReferenceService } from '@deepseek-ai/dsh-file-reference'
import { canonicalPath } from '@deepseek-ai/dsh-sandbox'
import type {} from './compat.ts'   // 声明 ctx.multiRootCompat（门禁前置）
import { AdditionalRootSearchCache } from './compat/file-reference-search.ts'
import { wrapMethod } from './method-wrapper.ts'
import type {} from './scope.ts'    // 声明 ctx.multiRootScope（唯一根数据源）

/** 与 lsp/workspace-files 一致：门禁前置 + 唯一根数据源。 */
export const inject = ['multiRootCompat', 'multiRootScope']

/** 一个被授予的附加根：canonical 用于检索/复验，display 用于候选路径。 */
export interface GrantedRoot {
  /** scope 返回的 canonical 原生路径（检索实例的 root，也是复验键）。 */
  readonly canonical: string
  /** 对用户展示/插入的路径：`/` 分隔、无尾斜杠（Windows 也转 `/`）。 */
  readonly display: string
}

/** 一次查询要追加的内容；`undefined` 表示完全不干预（字节级透传）。 */
export interface AdditionalCandidatesPlan {
  /** 追加为绝对目录候选的根，按 scope 顺序。 */
  readonly roots: readonly GrantedRoot[]
  /** 需要以该根为范围列目录时的钻入目标。 */
  readonly drill?: { readonly root: GrantedRoot; readonly query: string }
}

/** 原生路径 → 候选显示路径（win32 把 `\` 换成 `/`；POSIX 原样）。 */
export function toDisplayPath(canonical: string): string {
  return canonical.replaceAll('\\', '/')
}

/** win32 路径比较大小写不敏感（对齐 `containment.ts` 的 caseSensitive 约定）。 */
const PATH_CASE_SENSITIVE = process.platform !== 'win32'

function comparable(path: string): string {
  return PATH_CASE_SENSITIVE ? path : path.toLowerCase()
}

/** `path` 是否以 `prefix` 开头（win32 大小写不敏感）。 */
function pathStartsWith(path: string, prefix: string): boolean {
  return comparable(path).startsWith(comparable(prefix))
}

/**
 * 纯函数：按 query 形态决定追加什么。
 * - 空 query → { roots: 全部 }
 * - 绝对 query → drill = 最长匹配的包含根（要求 `R/` 前缀，即
 *   `normalized === R + '/'` 或以 `R + '/'` 开头）；roots = 其余「以 query
 *   为前缀」的根（`pathStartsWith(R, normalized)`；win32 大小写不敏感）。
 *   两者都落空 → undefined（不干预）。
 * - 裸模糊 / 相对 query → undefined
 * query 先按上游同样的规则归一化（`replaceAll('\\','/')`）再判形态。
 * 不把 `R` 本身（无尾斜杠）当钻入：上游 listDirectory 会把它切成父目录
 * 片段并因逃逸检查返回空（④ D6）。
 */
export function planAdditionalCandidates(
  query: string,
  roots: readonly GrantedRoot[],
): AdditionalCandidatesPlan | undefined {
  const normalized = query.replaceAll('\\', '/')
  if (normalized === '') return { roots }
  // isAbsolute 按平台语义：POSIX 的 `/x` 与 win32 的 `C:/x`、`/x` 都算绝对；
  // 裸模糊（非空、无 `/`）与相对钻入（含 `/` 但不绝对）都不参与
  if (!isAbsolute(normalized)) return undefined

  // 最长匹配的包含根 → 钻入目标（根之间互斥是注册表不变量，嵌套仅防御）
  let drillRoot: GrantedRoot | undefined
  for (const root of roots) {
    const inside = pathStartsWith(normalized, root.display + '/')
    if (!inside) continue
    if (drillRoot === undefined || root.display.length > drillRoot.display.length) drillRoot = root
  }
  // 其余「以 query 为前缀」的根各一条目录候选（按 scope 顺序）
  const prefixRoots = roots.filter(root => root !== drillRoot && pathStartsWith(root.display, normalized))
  if (drillRoot === undefined && prefixRoots.length === 0) return undefined
  return {
    roots: prefixRoots,
    ...(drillRoot === undefined ? {} : { drill: { root: drillRoot, query } }),
  }
}

/** 主根：agent 的不可变 session cwd → canonical；缺失/非绝对 → undefined。 */
function primaryRootOf(agent: Agent): string | undefined {
  const cwd = agent.session.header.cwd
  return cwd !== undefined && isAbsolute(cwd) ? canonicalPath(cwd) : undefined
}

/** 把 plan 落成候选，并在 I/O 后复验 scope（根撤销即丢弃其候选）。 */
async function materialize(
  scope: Context,
  cache: AdditionalRootSearchCache,
  primaryRoot: string,
  plan: AdditionalCandidatesPlan,
  signal: AbortSignal,
): Promise<FileReferenceCandidate[]> {
  // plan 是调用开始时的快照；I/O（original 与列目录）之后一切以当前 scope 为准
  const granted = (): readonly string[] => scope.multiRootScope.scopeOf(primaryRoot)
  const extra: FileReferenceCandidate[] = []
  const seen = new Set<string>()

  // 钻入结果在前（单次查询最多一个 drill）；不可用（peer 缺席/构造失败）→ 静默降级
  if (plan.drill !== undefined) {
    const { root, query } = plan.drill
    if (granted().includes(root.canonical)) {
      const search = await cache.acquire(root.canonical)
      if (search !== undefined) {
        // abort 原样上抛（上游 list 会抛），不吞 signal
        const items = await search.list(query, signal)
        if (granted().includes(root.canonical)) {
          for (const item of items) {
            if (seen.has(item.path)) continue
            seen.add(item.path)
            extra.push(item)
          }
        }
      }
    }
  }
  // 前缀根候选在后：按当前授予复验（I/O 期间新增的根等下一次按键再出现）
  const current = new Set(granted())
  for (const root of plan.roots) {
    if (!current.has(root.canonical)) continue
    if (seen.has(root.display)) continue
    seen.add(root.display)
    extra.push({ path: root.display, kind: 'directory' })
  }
  return extra
}

export function apply(ctx: Context): void {
  ctx.inject(['fileReferences'], scope => {
    const service = scope.get('fileReferences') as FileReferenceService
    scope.effect(() => {
      const cache = new AdditionalRootSearchCache({
        warn: message => { scope.logger.warn(message) },
      })
      const restore = wrapMethod(service, 'list', original =>
        async function (this: FileReferenceService, agent: Agent, query: string, signal: AbortSignal) {
          // 主根与附加根清单都取调用时刻的 scope（唯一根数据源）
          const primaryRoot = primaryRootOf(agent)
          const roots = primaryRoot === undefined ? [] : scope.multiRootScope.scopeOf(primaryRoot)
          cache.retain(roots)                                   // 每次调用顺带剪枝缓存
          if (primaryRoot === undefined || roots.length === 0) {
            return original.call(this, agent, query, signal)    // 无附加根：字节级透传
          }
          const plan = planAdditionalCandidates(query, roots.map(root => ({
            canonical: root,
            display: toDisplayPath(root),
          })))
          if (plan === undefined) return original.call(this, agent, query, signal)
          const base = await original.call(this, agent, query, signal)
          const extra = await materialize(scope, cache, primaryRoot, plan, signal)
          if (extra.length === 0) return base
          // 附加根候选不覆盖主根同名候选（按 path 去重拼接）
          const seen = new Set(base.map(candidate => candidate.path))
          return [...base, ...extra.filter(candidate => !seen.has(candidate.path))]
        })
      return () => {
        restore()          // 先恢复 list 的属性描述符（wrapMethod 既有语义）
        cache.disposeAll() // 再释放全部检索实例，卸载后不再留缓存
      }
    }, 'multi-root:file-references discovery')
  })
}
