# Spec Delta

## MODIFIED Requirements

### Requirement: 基线常量唯一来源与软范围派生

仓库 SHALL 以单一常量(`scripts/dsh-baseline.mjs` 的 `DSH_BASELINE`)声明当前开发与发布验证所针对的 DSH 精确版本;全部插件(含 multi-root)的 `dsh.engines.dsh` 与全部 DSH peer 范围 SHALL 由该常量机械派生为 `>=<基线> <<主>.<次+1>.0`。基线提升后,任何插件声明与派生值不一致 SHALL 构成检查失败;基线检查的版本比对 SHALL 先把 `catalog:`/`catalog:dsh` 引用归一化为 catalog 实际值再比较。multi-root 运行时门 SHALL 直接 import 该常量并在构建期内联进其产物;仓内代码文件 MUST NOT 存在第二个 `DSH_BASELINE` 赋值字面量定义,且每个运行时门文件 MUST 以 import 单源的方式取得基线——门禁 SHALL 拦截第二处字面量并断言 import 形态;升级车道 SHALL NOT 再持有运行时副本重写步骤。

#### Scenario: 基线提升收紧软范围

- **WHEN** 基线常量为 `<基线>` 且仓库检查器运行
- **THEN** 全部插件(含 multi-root)的 `dsh.engines.dsh` 与全部 DSH peer 均为 `>=<基线> <<主>.<次+1>.0`,检查器退出码 0

#### Scenario: 软范围漂移被拒绝

- **WHEN** 任一插件的 DSH peer 或 engines 值不等于派生范围
- **THEN** `pnpm dsh:check` 逐条报出插件名、实际值与期望值并以非零退出码结束

#### Scenario: 第二处基线字面量被拦截

- **WHEN** 任意代码文件新增 `export const DSH_BASELINE = '<值>'` 字面量定义
- **THEN** `pnpm dsh:check` 第 10 项失败并指明该文件

#### Scenario: 运行时门丢失单源 import

- **WHEN** `src/compat/dsh-version.ts` 被改回本地字面量或删除对 `scripts/dsh-baseline.mjs` 的 import
- **THEN** `pnpm dsh:check` 第 10 项失败并要求恢复单源 import
