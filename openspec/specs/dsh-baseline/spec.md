# dsh-baseline Specification

## Purpose
约束本仓七个 DSH 插件的基线管理行为:DSH 基线常量的唯一来源与派生规则、multi-root 精确支持矩阵与 peer 枚举的一致性契约、发布年龄豁免与 lockfile 的对账、根级升级脚本对 cordis/schemastery 精确 pin 的候选树推导。

## Requirements

### Requirement: 基线常量唯一来源与软范围派生

仓库 SHALL 以单一常量(`scripts/dsh-baseline.mjs` 的 `DSH_BASELINE`)声明当前开发与发布验证所针对的 DSH 精确版本;全部插件(含 multi-root)的 `dsh.engines.dsh` 与全部 DSH peer 范围 SHALL 由该常量机械派生为 `>=<基线> <<主>.<次+1>.0`。基线提升后,任何插件声明与派生值不一致 SHALL 构成检查失败;基线检查的版本比对 SHALL 先把 `catalog:`/`catalog:dsh` 引用归一化为 catalog 实际值再比较。multi-root 运行时门持有的基线副本 SHALL 由升级脚本与该常量同批重指。

#### Scenario: 基线提升收紧软范围

- **WHEN** 基线常量为 `0.2.2-rc.1` 且仓库检查器运行
- **THEN** 全部插件(含 multi-root)的 `dsh.engines.dsh` 与全部 DSH peer 均为 `>=0.2.2-rc.1 <0.3.0`,检查器退出码 0

#### Scenario: 软范围漂移被拒绝

- **WHEN** 任一插件的 DSH peer 或 engines 值不等于派生范围
- **THEN** `pnpm dsh:check` 逐条报出插件名、实际值与期望值并以非零退出码结束

### Requirement: multi-root 软范围放行

multi-root 插件的启动兼容判定 SHALL 由基线派生软范围(`>=<基线> <<主>.<次+1>.0`)承载:宿主实际安装版本在范围内 SHALL 放行并完整加载;不在范围内 SHALL 拒绝启动并输出受支持范围与实际版本。范围内版本 MUST NOT 要求逐版本登记;missing(必需包缺失)与 mixed(多版本混装)两类安装异常的判定与拒绝行为 SHALL 保持不变。

#### Scenario: 域内版本放行

- **WHEN** 宿主 DSH 为基线版本 `0.2.2-rc.1` 且插件启动
- **THEN** 判定为 supported,插件完整加载(`--dump-config` 可见 `multi-root-` 注册行)

#### Scenario: 域外版本拒绝启动

- **WHEN** 宿主 DSH 为范围外的 `0.3.0`(或任何不满足 `>=0.2.2-rc.1 <0.3.0` 的版本)且插件启动
- **THEN** 判定为 unsupported,插件拒绝启动且错误信息给出受支持范围 `>=0.2.2-rc.1 <0.3.0` 与实际安装版本

### Requirement: multi-root peer 与软范围一致

multi-root 的全部 DSH `peerDependencies`(含 `@deepseek-ai/dsh`)与 `dsh.engines.dsh` SHALL 逐字等于基线派生软范围;cordis peer 范围(`>=4.0.1 <5.0.0`)不受影响。静态契约检查(`compat:check`)与插件单测 SHALL 以同一派生范围断言,不得各自持有一份漂移副本。

#### Scenario: 静态契约与单测双重断言

- **WHEN** 基线为 `0.2.2-rc.1` 且 `pnpm compat:check` 与插件单测运行
- **THEN** 22 项 DSH peer 与 `dsh.engines.dsh` 逐字等于 `>=0.2.2-rc.1 <0.3.0`,两者退出码均为 0

### Requirement: 发布年龄豁免与 lockfile 精确对账

`pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude` 清单 SHALL 与 lockfile 实际解析集合(DSH 家族、cordis、schemastery、libreoffice-kit)精确相等;缺失条目与陈旧条目均 SHALL 构成检查失败。

#### Scenario: 对账双向报错

- **WHEN** 豁免清单缺少 lockfile 中已解析的 `@deepseek-ai/schemastery@3.19.0` 或残留陈旧的 `3.18.5` 条目
- **THEN** `pnpm dsh:check` 分别报出 missing 与 stale 条目并以非零退出码结束

### Requirement: 升级重指面与 catalog 单点重写

根级升级脚本(`pnpm dsh:upgrade <version>`)SHALL 把基线常量、全部插件 DSH devDeps、全部插件范围与豁免清单重指到目标版本;multi-root 的 DSH peers、`dsh.engines.dsh` 与运行时基线副本 SHALL 随同批重指。DSH 家族与 cordis、schemastery 以命名 catalog(`catalog:dsh`)引用时,重指对象 SHALL 是 `pnpm-workspace.yaml` 的 `catalogs.dsh` 块(MUST 单点重写);manifest 的 `catalog:`/`catalog:dsh` 条目 MUST NOT 被改写为字面量,重写后全部插件 devDependencies MUST NOT 残留 DSH 家族、cordis、schemastery 的字面量声明(残留即检查失败)。脚本 MUST NOT 重写默认 catalog(工具链册)中的任何条目。

#### Scenario: 升级重指 catalog 而非字面量

- **WHEN** 执行 `pnpm dsh:upgrade <新版本>` 且各插件 devDependencies 均为 `catalog:dsh` 引用
- **THEN** 只有 `catalogs.dsh` 块的值变为新版本派生值,各插件 manifest 的 `catalog:` 条目逐字不变,且 dsh:check 归一化比对通过

#### Scenario: 残留字面量被拦截

- **WHEN** 某插件的 `@deepseek-ai/dsh` devDependency 被手写为字面量版本
- **THEN** 升级脚本的后置断言或 dsh:check 失败并指明该包

### Requirement: 升级脚本候选树推导

cordis 与 schemastery 的精确 pin SHALL 从候选 dsh 树的声明推导(取 `dsh` 与 `dsh-tools` 对该包的单个 tilde/caret 声明解析出的精确版本),声明不是单一 tilde/caret 时 SHALL 拒绝执行而非猜测。`--probe` 追加的 overrides 块 SHALL 在不带 `--probe` 重跑时移除。

#### Scenario: schemastery 随候选树推导

- **WHEN** 以 `0.2.2-rc.1` 为目标运行升级脚本且候选 `dsh-tools` 声明 `~3.19.0`
- **THEN** 经 `catalog:dsh` 引用 schemastery 的插件其 catalog 条目与豁免条目被重写为 `3.19.0`,stdout 报告该重写

#### Scenario: 宽范围声明拒绝

- **WHEN** 候选树对 schemastery 的声明不是单一 tilde/caret(如 `>=3.0.0`)
- **THEN** 升级脚本抛出包含声明原文的错误并停止,不写出任何猜测版本

#### Scenario: probe overrides 生命周期

- **WHEN** 先后以 `--probe` 与不带 `--probe` 运行同一目标版本
- **THEN** 第一次在 `pnpm-workspace.yaml` 追加 overrides 块,第二次将其整体移除且基线等其余重写保持幂等
