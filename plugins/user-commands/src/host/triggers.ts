/**
 * 让「发现结果」失效的信号。
 *
 * 有两件事会在没有任何文件改动的情况下改变命令集合：
 *
 * - 某个主根被授予或收回了附加根（multi-root registry），以及
 * - 工作区被登记、迁移或移除（持久化域变更）。
 *
 * 两者都只当触发器用：处理函数从不读取事件载荷，重扫需要的一切它自己会从登记表重新读。
 *
 * 薄再导出（G4）：安装逻辑（装不上的触发器跳过、绝不致命）是内核的 `installTriggers`；
 * 上下文切片用内核的结构化 `TriggerContext`，宿主 DSH 类型不进入本包的触发路径。
 * @module dsh-plugin-user-commands/host/triggers
 */

export { installTriggers } from '@dsh-plugins/host-kit/triggers'
export type { TriggerContext } from '@dsh-plugins/host-kit/triggers'
