/**
 * 让「发现结果」失效的信号。
 *
 * 有两件事会在没有任何文件改动的情况下改变命令集合：
 *
 * - 某个主根被授予或收回了附加根（multi-root registry），以及
 * - 工作区被登记、迁移或移除（持久化域变更）。
 *
 * 两者都只当触发器用：处理函数从不读取事件载荷——载荷的确切形状是发出方子系统的私有细节，
 * 而重扫需要的一切它自己会从登记表重新读。这也是「无关域的 domain/changed 无害」的原因：
 * 重扫是声明式且幂等的。
 * @module dsh-plugin-user-commands/host/triggers
 */

import type { MultiRootGrant } from './types.ts'

/** 安装触发器用到的上下文切片。 */
export interface TriggerContext {
  /**
   * 从上下文读一个服务。
   * @param name - 服务名。
   * @returns 服务；缺席时为 undefined。
   */
  get(name: string): unknown
  /**
   * 订阅一个宿主事件。
   * @param event - 事件名。
   * @param listener - 触发器。
   * @returns 停止监听的 disposer。
   */
  on(event: 'domain/changed', listener: () => void): () => void
}

/**
 * 安装重扫触发器。
 *
 * 装不上的触发器（服务缺席或订阅失败）直接跳过：其余触发器与手动命令仍在，
 * 丢一个信号只是新鲜度降级，不是功能降级。
 * @param ctx - 要订阅的上下文切片。
 * @param rescan - 要跑的重扫。
 * @returns 每个已安装触发器一个 disposer。
 */
export function installTriggers(ctx: TriggerContext, rescan: () => void): readonly (() => void)[] {
  const disposers: (() => void)[] = []

  const grant = ctx.get('multiRootRegistry') as MultiRootGrant | undefined
  if (grant !== undefined) {
    try {
      disposers.push(grant.onChange(() => {
        rescan()
      }))
    } catch {
      // 登记表在，但这份构建里不可订阅；下面的域事件仍然覆盖持久化变更。
    }
  }

  try {
    disposers.push(ctx.on('domain/changed', () => {
      rescan()
    }))
  } catch {
    // 这个事件没有事件总线：`/commands-reload` 仍是兜底。
  }

  return disposers
}
