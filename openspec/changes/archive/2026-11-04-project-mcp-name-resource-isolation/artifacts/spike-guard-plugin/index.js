/**
 * spike 临时探针插件（不进产物，仅用于守卫参数形态实证）。
 *
 * 在 `agent/created` 里经 agent scope 装一条 `agent.ctx.tools.guard`：
 * 每条执行打印 `{ name, arguments, agent, parent }`，并对「资源工具 + server === "probe-b"」
 * 返回拒绝理由（其余一律 undefined 放行）。
 */

const RESOURCE_TOOLS = new Set(['list_mcp_resources', 'list_mcp_resource_templates', 'read_mcp_resource'])
const DENY_REASON = 'spike deny: probe-b is not in this workspace'

export const name = 'spike-guard'
export const inject = ['tools']

export function apply(ctx) {
  ctx.on('agent/created', ({ agent }) => {
    // agent scope 自己持有 disposer：agent 释放时守卫随之卸载。
    agent.ctx.tools.guard((exec) => {
      const args = exec.arguments
      const record = {
        at: new Date().toISOString(),
        name: exec.name,
        arguments: args,
        agent: exec.agent !== undefined,
        parent: exec.parent !== undefined,
      }
      console.log('[spike-guard] ' + JSON.stringify(record))

      if (
        RESOURCE_TOOLS.has(exec.name)
        && typeof args === 'object' && args !== null
        && typeof args.server === 'string' && args.server === 'probe-b'
      ) {
        return DENY_REASON
      }
      return undefined
    })
  })
}
