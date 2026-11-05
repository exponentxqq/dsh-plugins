/**
 * 会话 cwd → 工作区键的归属：新会话该读哪一份工作区级默认档。
 *
 * 一个会话在某个目录里创建（cwd），那个目录常常只是工作区根的子目录，也可能经由符号
 * 链接进入（`~/proj` → `/home/docker/proj` 就是 D8 的反例场景）。因此归属从 cwd 自己
 * 开始逐级向上，每一级先 `realpath` 规范化，再与 `workspaceRegistry` 已登记工作区的
 * `path`（上游保证已是 realpath）**精确**比较，取最近命中的那一级：工作区键就是 registry
 * 的 `path` 原文，显示标题也来自 registry——同一份工作区不会因为进入路径不同而分裂成
 * 两个键。
 *
 * 上溯纪律（顺序即语义）：
 *
 * - **一级 `realpath` 失败只意味着「这一级不存在」**：继续上溯，不当作错误抛出。cwd 被
 *   删掉、祖先仍可命中时归属照常成立（例如 `/w/sub/dir` 与 `/w/sub` 都已不存在，但
 *   `/w` 仍是已登记根）。
 * - **cwd 自己规范化不了又没有命中** → 拿不到 canonical cwd，按 fail-closed 返回
 *   `undefined` 并 warn 一条：调用方只用用户级默认档，不阻塞会话创建（spec 场景「目录
 *   已被删除」）。注意生产环境的 `/` 永远存在，所以「全程失败」在实现上就是「cwd 这一级
 *   失败且没有命中」——只按祖先的 canonical 拼键会把工作区档写到会话并不所在的目录上。
 * - **上溯到 `/` 仍无命中、而 cwd 本身可规范化** → 以 canonical cwd 为键
 *   （`registered:false`）：未登记的目录同样可以承载工作区档（spec：不要求先登记）。
 *   未登记不是错误，不告警。
 *
 * 本模块只依赖三个注入端口（registry 读数、realpath、日志），不做任何 IO、不 import
 * 宿主模块；算法与 `project-mcp/src/host/attribution.ts` 的 `Attributor.attribute` 同构
 * （resolve → 逐级 realpath → 最近命中）。
 *
 * @module dsh-plugin-session-tool-toggle/host/attribution
 */

import { dirname, resolve } from 'node:path'
import type { SpecLog, WorkspaceAttribution } from './types.ts'

/** realpath 端口：宿主注入 `node:fs/promises.realpath`。 */
export interface RealpathPort {
  /**
   * 规范化一个路径（解析符号链接）。
   * @param path - 待规范化的路径。
   * @returns 规范绝对路径。
   * @throws 路径不存在时（调用方按「这一级不存在」处理）。
   */
  realpath(path: string): Promise<string>
}

/** 已登记工作区端口：`workspaceRegistry` 缺席时返回空数组。 */
export interface WorkspaceRootsPort {
  /**
   * 已登记工作区（`Workspace.path` 已是 realpath，不再二次 realpath）。
   * @returns 工作区读数快照。
   */
  registered(): readonly { readonly path: string; readonly title: string }[]
}

/**
 * 把会话 cwd 归到一个工作区键。
 *
 * @param cwd - 会话创建目录（绝对路径；`undefined` / 空串 = 缺失）。
 * @param ports - 三个注入端口：registry 读数、realpath、日志。
 * @returns 归属结果；cwd 缺失，或其 realpath 失败（目录已删）时 `undefined`（fail-closed）。
 */
export async function resolveWorkspaceAttribution(
  cwd: string | undefined,
  ports: {
    readonly roots: WorkspaceRootsPort
    readonly realpath: RealpathPort
    readonly log: SpecLog
  },
): Promise<WorkspaceAttribution | undefined> {
  if (cwd === undefined || cwd === '') return undefined

  const start = resolve(cwd)
  const roots = ports.roots.registered()
  let current = start
  let canonicalCwd: string | undefined

  for (;;) {
    const canonical = await tryRealpath(ports.realpath, current)
    if (canonical !== undefined) {
      // 只有第一级（cwd 自己）的规范化结果能当退化键；祖先的 canonical 不是会话目录。
      if (current === start) canonicalCwd = canonical
      const hit = roots.find((workspace) => workspace.path === canonical)
      if (hit !== undefined) return { key: hit.path, registered: true, title: hit.title }
    }

    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }

  if (canonicalCwd === undefined) {
    ports.log.warn(
      `会话 cwd「${start}」无法归属工作区：realpath 失败（目录可能已被删除），本次只用用户级默认档`,
    )
    return undefined
  }

  return { key: canonicalCwd, registered: false }
}

/**
 * 规范化一级路径，把失败当作「这一级不存在」。
 * @param port - realpath 端口。
 * @param candidate - 待规范化的绝对路径。
 * @returns 规范路径；这一级不存在时 `undefined`。
 */
async function tryRealpath(port: RealpathPort, candidate: string): Promise<string | undefined> {
  try {
    return await port.realpath(candidate)
  } catch {
    return undefined
  }
}
