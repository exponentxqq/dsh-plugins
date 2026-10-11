/**
 * 工作区根枚举：发现要走的目录清单。
 *
 * 主来源是 workspace registry 自己的顺序（用户在侧边栏看到的顺序）：登记顺序是一条持久化事实，
 * 它决定附加根归属的先后（见 `attribution.ts`）与扫描清单的顺序，而不是由扫描时机决定。
 * 每个主根随后带上 multi-root registry 授予它的附加根；
 * 那个服务是**软依赖**，缺席（插件未装或未激活）时降级为只看主根，而不是让整次发现失败。
 * @module dsh-plugin-user-commands/host/roots
 */

import type { Context } from '@deepseek-ai/cordis'
import type { MultiRootGrant, WorkspaceRoots } from './types.ts'

/**
 * 枚举每个工作区的有序根集合。
 * @param ctx - 任意宿主上下文（调用方自己的 fiber 即可）。
 * @returns 每个已登记工作区一项，按 registry 顺序；工作区登记表不可用时为空。
 */
export function workspaceRoots(ctx: Context): readonly WorkspaceRoots[] {
  const registry = ctx.get('workspaceRegistry')
  if (registry === undefined) return []
  const grant = ctx.get('multiRootRegistry') as MultiRootGrant | undefined

  return registry.list().map((workspace) => {
    const granted = grant?.granted(workspace.path) ?? []
    const roots = [workspace.path]
    for (const root of granted) {
      // `granted` 可能把主根也再报一遍；主根已经在最前，且一个根不会走两遍。
      if (!roots.includes(root)) roots.push(root)
    }
    return { primaryRoot: workspace.path, roots }
  })
}
