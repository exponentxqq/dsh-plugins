# dsh-plugin-toolchain Specification

## Purpose

约束本仓六个软插件的构建与工程约定：共享构建工具的薄入口形态、配置与依赖版本的单一来源、tooling 内部包的结构不变式、聚合门禁的单一入口、脚手架生成的开箱合规——承载「新增插件 = 填差异清单」的持久工程行为。

## Requirements

### Requirement: 薄入口构建与产物自包含

六个软插件（multi-root-workspace 除外）的构建 SHALL 由共享构建包 `tooling/build-kit`（`@dsh-plugins/build-kit`）驱动；各包 `build.mjs` SHALL 仅声明不可从包事实推导的差异（宿主外置词追加、CJS require shim 开关、CSS 类名前缀）。构建产出的宿主半 MUST 自包含：external 集合仅允许 `node:*` 前缀词与本包显式声明的外置词；浏览器半 MUST 保持 ModuleLoader 壳包装形态。产物代码中出现动态 `require` 而该包未声明 require shim 时，构建 MUST 失败并说明原因；产物代码 MUST NOT 含内部共享包名（`@dsh-plugins/` 前缀词）。CSS modules 的防重护栏 MUST 按「包 + 模块」双维度查询——同一包的每个 css module MUST 各自获得样式注入器。

#### Scenario: 产物含未声明外部依赖

- **WHEN** 任一软插件的宿主半产物 require 了非 `node:*` 且未在本包声明外置的模块
- **THEN** 产物契约检查失败，报出该模块词

#### Scenario: CSS 双模块注入

- **WHEN** 某包包含两个 css module 且各自的类名有同名
- **THEN** 两个模块各自注入样式，同名类互不覆盖，产物中每个模块对应一个注入器

### Requirement: 配置与依赖版本单一来源

六个软插件 SHALL 共享根级编译基准 `tsconfig.plugin.base.json`（各包 tsconfig 仅以 `extends` 声明 include/files 差异，MUST NOT 重新声明基准编译选项或携带 `composite`）；类型检查 MUST 以非 emit 的 `-p` 调用完成。lint 配置 SHALL 收敛为根级 `.oxlintrc.json`，其忽略 pattern MUST 与配置文件所在目录无关。工具链依赖（esbuild/typescript/vitest/oxlint/@types/* 等）版本 SHALL 由 pnpm 默认 catalog 单一声明；DSH 家族与 cordis、schemastery 的 devDependencies SHALL 以命名 catalog `dsh` 引用，其值由基线升级脚本单点重写。软插件 manifest 中的 DSH 族声明与 catalog 实际值不一致 SHALL 构成检查失败；同一工具链键在各包 MUST 解析到同一版本。

#### Scenario: 某包工具链版本漂移

- **WHEN** 某软插件把 `typescript` 从 `catalog:` 改回字面量版本且与 catalog 值不同
- **THEN** 结构检查失败，报出该包与该键

#### Scenario: tsconfig 重新携带基准选项

- **WHEN** 某包 `tsconfig.host.json` 重新声明了基准已有的编译选项或加回 `composite`
- **THEN** 类型检查或结构检查失败

### Requirement: 内部共享包结构不变式

`tooling/` 下的内部包（build-kit / host-kit / test-kit / contracts）MUST 为 private 且版本恒为 `0.0.0`，MUST NOT 进入任何插件的 `dependencies`（仅允许 `devDependencies` 的 `workspace:*` 引用）——违反时检查 MUST 失败，因为 profile 侧 git tag 单目录安装解析不到内部包。发布流程的版本同步与产物重建 MUST 只遍历 `plugins/*`；内部包 MUST NOT 出现在版本契约内。运行期共享源码包 host-kit MUST 保持零运行时依赖、零 DSH 包导入，其代码经构建期内联进入各消费包产物，消费插件在安装侧 MUST NOT 相互产生依赖。

#### Scenario: 内部包误入 dependencies

- **WHEN** 某插件把 `@dsh-plugins/host-kit` 写入 `dependencies`
- **THEN** 结构检查失败并指明该包；本地 `pnpm install` 本身不报错（workspace 内可解析），失败必须由门禁而非安装暴露

#### Scenario: 发布不含内部包

- **WHEN** 执行发布流程
- **THEN** 版本同步与产物重建只作用于 `plugins/*`，tooling 包版本保持 `0.0.0` 不变

### Requirement: 模板素材非包

模板素材住在顶层 `templates/<name>/`（默认 `default`），MUST NOT 进入 workspace packages——结构门禁 MUST 同时拒绝 `templates` 与 `templates/*` 两条目；每个模板目录 MUST NOT 携带 `package.json`，其自述清单 SHALL 为 `template.json`。

#### Scenario: 模板目录包化被拒

- **WHEN** `pnpm-workspace.yaml` 的 packages 列表出现 `templates` 或 `templates/*` 条目，或某模板目录出现 `package.json`
- **THEN** 结构检查（AR7）失败并报出该条目；模板素材只能经 `pnpm gen:plugin` 消费，不是可安装的包

### Requirement: 聚合门禁单一入口

`pnpm dsh:check` SHALL 聚合三组检查：DSH 基线（既有）、结构不变式（上一条 Requirement）、产物契约（覆盖全部 7 个插件——含此前没有产物断言的 host-only 包）。发布流程（release）与 CI MUST 经过同一聚合入口，MUST NOT 直接调用单组检查从而绕过其余两组。产物契约的等价性工具 SHALL 支持以模块词集合（require/import 词的排序集合）比对迁移前后产物，作为重构不改运行时形状的机器判据。

#### Scenario: 发布绕过新门禁

- **WHEN** 发布流程只调用基线检查而未调用结构/产物检查
- **THEN** 视为缺陷：篡改产物外部词的问题在发布点不被拦截

#### Scenario: 迁移等价性比对

- **WHEN** 对迁移前后的同一插件产物运行等价性工具
- **THEN** 模块词集合逐字相等即通过；差异非空即失败并列出差异词

### Requirement: 脚手架生成开箱合规

`pnpm gen:plugin <name> --kind host-only|dual [--template <name>]` SHALL 从 `templates/<name>/`（缺省 `default`）生成新插件骨架（薄 build.mjs、extends 根基准的 tsconfig、catalog 引用的 devDependencies、含产物断言的测试骨架、cordis.patch.yml、README/AGENTS 段落）；生成物 MUST 开箱通过 lint、typecheck、build、test 与 `pnpm dsh:check` 全部门禁；模板 MUST NOT 含 DSH 族与工具链的版本字面量（一律 catalog 引用，DSH 派生值由基线派生）。

#### Scenario: 生成后全绿

- **WHEN** 以任一 kind 生成新插件并依次运行 lint/typecheck/build/test 与 dsh:check
- **THEN** 全部退出码 0，且删除生成目录后 `git status --porcelain` 为空

#### Scenario: 模板携带版本字面量

- **WHEN** 模板素材中出现形如 `"typescript": "^5…"` 的版本字面量
- **THEN** 视为缺陷：与配置单一来源 Requirement 冲突

### Requirement: 模板清单 fail-closed 加载

模板件套 SHALL 由该目录的 `template.json` 声明（顶层 name/description/files[]，条目键 template/output/format?/only?），生成器加载清单 MUST fail-closed：未知键、缺失素材、未知模板名或非法 kind SHALL 以非零退出码失败并点名原因，MUST NOT 静默忽略或猜测。

#### Scenario: 清单负例 fail-closed

- **WHEN** 以 `--template nope` 调用生成器，或某模板 `template.json` 携带未知键（如 `"onlyy"`）或声明了缺失的素材文件
- **THEN** 生成器退出码 1，stderr 点名可用模板/非法键/缺失素材；不写任何文件
