/**
 * 会话 cwd → 工作区键的归属：新会话该读哪一份工作区级默认档。
 *
 * 走法（逐级 realpath 上溯、最近层优先、registry 路径**精确**匹配）由
 * `@dsh-plugins/host-kit/attribution` 的 `walkUp` 提供，与 project-mcp / user-commands
 * 共用同一份实现。本文件只保留本包的**键策略**：
 *
 * - 命中已登记工作区 → 键是 registry 的 `path` 原文（连同 `title`）——同一份工作区不会
 *   因为进入路径不同而分裂成两个键；
 * - 上溯无命中、而 cwd 自己可规范化 → 以 canonical cwd 为退化键（`registered:false`）：
 *   未登记目录同样可以承载工作区档，未登记不是错误，不告警；
 * - cwd 自己规范化失败（目录已删）且没有命中 → `undefined` + 一条 warn（fail-closed）：
 *   调用方只用用户级默认档，不阻塞会话创建。
 *
 * registry 路径**不**再做 realpath：上游保证 `Workspace.path` 已是规范路径，保持零额外
 * syscall 与现有语义。
 * @module dsh-plugin-session-tool-toggle/host/attribution
 */

import { resolve } from 'node:path'
import { walkUp, type Attribution, type RealpathPort } from '@dsh-plugins/host-kit/attribution'
import type { SpecLog, WorkspaceAttribution } from './types.ts'

export type { RealpathPort } from '@dsh-plugins/host-kit/attribution'

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

  // registry 路径直接进索引：首写优先（同 path 重复登记时仍取第一条，与旧的 find 一致）。
  const byPath = new Map<string, { readonly path: string; readonly title: string }>()
  for (const workspace of ports.roots.registered()) {
    if (!byPath.has(workspace.path)) byPath.set(workspace.path, workspace)
  }
  const lookup = (canonical: string): Attribution | undefined => {
    const workspace = byPath.get(canonical)
    return workspace === undefined
      ? undefined
      : { workspaceRoot: workspace.path, roots: [workspace.path] }
  }

  const { hit, canonicalCwd } = await walkUp(cwd, lookup, ports.realpath)
  if (hit !== undefined) {
    const workspace = byPath.get(hit.workspaceRoot)
    if (workspace !== undefined) {
      return { key: workspace.path, registered: true, title: workspace.title }
    }
  }
  if (canonicalCwd !== undefined) return { key: canonicalCwd, registered: false }

  ports.log.warn(
    `会话 cwd「${resolve(cwd)}」无法归属工作区：realpath 失败（目录可能已被删除），本次只用用户级默认档`,
  )
  return undefined
}
