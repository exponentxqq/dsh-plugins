/**
 * 会话到工作区的归属判定：薄再导出。
 *
 * 归属走法（逐级 canonical 上溯、最近层优先、同层主根压倒附加根、先写先得、答复保留登记拼写）
 * 与索引的原子重建由 `@dsh-plugins/host-kit/attribution` 唯一承载，与 dsh-plugin-project-mcp
 * 共用同一份实现。本包保留自己的策略：**fail-closed**——未命中即 `null`，该会话只剩用户级
 * 与内置命令（不使用退化的 canonical cwd 键）。
 *
 * 并发修复由内核免费获得：`RootAttributor` 先完整构建新索引、再一次引用赋值提交，重扫窗口内
 * in-flight 的 `attribute()` 仍读到旧索引的完整结果。本包迁移前的实现一进 `update()` 就
 * `owners.clear()`，窗口内的会话会瞬间 fail-closed；该原子性由 host-kit 内核套件
 * （`tooling/host-kit` 的 `attribution.test.ts`）的「并发原子性」两条用例钉住。
 * @module dsh-plugin-user-commands/host/attribution
 */

export { RootAttributor, RootAttributor as Attributor } from '@dsh-plugins/host-kit/attribution'
export type { Attribution, RealpathPort as RealpathIo } from '@dsh-plugins/host-kit/attribution'
