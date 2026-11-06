# Spec Delta

## MODIFIED Requirements

### Requirement: 升级脚本候选树推导

根级升级脚本(`pnpm dsh:upgrade <version> [--probe]`)SHALL 把基线常量、全部插件 DSH devDeps、软插件范围与豁免清单重指到目标版本。DSH 家族与 cordis、schemastery 的 devDependencies 以命名 catalog(`catalog:dsh`)引用时,重指的对象 SHALL 是 `pnpm-workspace.yaml` 的 `catalogs.dsh` 块(升级脚本 MUST 单点重写该块),各插件 manifest 中值为 `catalog:`/`catalog:dsh` 的条目 MUST NOT 被改写为字面量版本;重写结束后,六个软插件的 devDependencies 中 MUST NOT 残留 DSH 家族、cordis、schemastery 的字面量版本声明(残留 SHALL 构成检查失败)。基线检查对 devDependencies 的版本比对 SHALL 先把 `catalog:`/`catalog:dsh` 归一化为 catalog 实际值再比较。cordis 与 schemastery 的精确 pin SHALL 从候选 dsh 树的声明推导(取 `dsh` 与 `dsh-tools` 对该包的单个 tilde/caret 声明解析出的精确版本),声明不是单一 tilde/caret 时 SHALL 拒绝执行而非猜测。`--probe` 追加的 overrides 块 SHALL 在不带 `--probe` 重跑时移除。脚本 MUST NOT 改动 multi-root 的 allowlist 与 peer 枚举,MUST NOT 重写默认 catalog(工具链册)中的任何条目。

#### Scenario: 升级重指 catalog 而非字面量

- **WHEN** 执行 `pnpm dsh:upgrade <新版本>` 且各软插件 devDependencies 均为 `catalog:dsh` 引用
- **THEN** 只有 `catalogs.dsh` 块的值变为新版本派生值,各插件 manifest 的 `catalog:` 条目逐字不变,且 dsh:check 归一化比对通过

#### Scenario: 残留字面量被拦截

- **WHEN** 某软插件的 `@deepseek-ai/dsh` devDependency 被手写为字面量版本
- **THEN** 升级脚本的后置断言或 dsh:check 失败并指明该包

#### Scenario: schemastery 随候选树推导

- **WHEN** 以 `0.2.2-rc.1` 为目标运行升级脚本且候选 `dsh-tools` 声明 `~3.19.0`
- **THEN** `catalogs.dsh` 中 schemastery 的值与豁免条目被重写为 `3.19.0`,各软插件 manifest 的 `catalog:dsh` 条目逐字不变,stdout 报告该重写

#### Scenario: 宽范围声明拒绝

- **WHEN** 候选树对 schemastery 的声明不是单一 tilde/caret(如 `>=3.0.0`)
- **THEN** 升级脚本抛出包含声明原文的错误并停止,不写出任何猜测版本

#### Scenario: probe overrides 生命周期

- **WHEN** 先后以 `--probe` 与不带 `--probe` 运行同一目标版本
- **THEN** 第一次在 `pnpm-workspace.yaml` 追加 overrides 块,第二次将其整体移除且基线等其余重写保持幂等
