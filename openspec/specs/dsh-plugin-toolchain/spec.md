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

`tooling/` 下的内部包（build-kit / host-kit / test-kit / contracts）MUST 为 private 且版本恒为 `0.0.0`，MUST NOT 进入任何插件的 `dependencies`（仅允许 `devDependencies` 的 `workspace:*` 引用）。发布流程的版本同步与产物重建 MUST 只遍历 `plugins/*`。host-kit MUST 保持零运行时依赖、零 DSH 包导入，其代码经构建期内联进入各消费包产物。结构不变式 SHALL 覆盖 AR1–AR8（AR8 守测试接线薄入口与 include 覆盖）。test-kit 章程 SHALL 为「测试夹具 + 测试接线原语」：vitest 不作为运行时依赖、仅允许自测 devDependency，`scripts` 白名单含 `test`。

#### Scenario: 内部包误入 dependencies

- **WHEN** 某插件把 `@dsh-plugins/host-kit` 写入 `dependencies`
- **THEN** 结构检查失败并指明该包；本地 `pnpm install` 本身不报错（workspace 内可解析），失败必须由门禁而非安装暴露

#### Scenario: 发布不含内部包

- **WHEN** 执行发布流程
- **THEN** 版本同步与产物重建只作用于 `plugins/*`，tooling 包版本保持 `0.0.0` 不变

#### Scenario: test-kit 运行时依赖面混入 vitest

- **WHEN** test-kit 的 `dependencies`（非 devDependencies）出现 vitest
- **THEN** 结构检查失败；`./vitest` 工厂模块 import vitest 同样视为违规

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

`pnpm gen:plugin <name> --kind host-only|dual [--template <name>]` SHALL 从 `templates/<name>/`（缺省 `default`）生成新插件骨架（薄 build.mjs、extends 根基准的 tsconfig、catalog devDependencies、含产物断言的测试骨架、cordis.patch.yml、README/AGENTS 段落）。生成物 MUST 开箱通过 lint、typecheck、build、test 与 `pnpm dsh:check`；模板 MUST NOT 含版本字面量。dual 生成 `vitest.config.ts` 薄声明与 `test/stubs/ui-primitives.tsx` 薄 re-export（tsconfig.client include 覆盖 `test/**/*.tsx`）；host-only MUST NOT 生成 `vitest.config.ts`（vitest 默认收集）。

#### Scenario: 生成后全绿

- **WHEN** 以任一 kind 生成新插件并依次运行 lint/typecheck/build/test 与 dsh:check
- **THEN** 全部退出码 0，且删除生成目录后 `git status --porcelain` 为空

#### Scenario: 模板携带版本字面量

- **WHEN** 模板素材中出现形如 `"typescript": "^5…"` 的版本字面量
- **THEN** 视为缺陷：与配置单一来源 Requirement 冲突

#### Scenario: dual 生成物带组件测试接缝

- **WHEN** 以 `--kind dual` 生成新插件并编写首个 `.test.tsx` 组件测试
- **THEN** 无需手改任何配置即可运行（alias 与 jsx 接缝由模板工厂配置开箱提供）

#### Scenario: host-only 生成物无多余接线

- **WHEN** 以 `--kind host-only` 生成新插件
- **THEN** 生成物不含 `vitest.config.ts` 与 stub 文件，`test/smoke.test.ts` 被 vitest 默认收集并通过

### Requirement: 模板清单 fail-closed 加载

模板件套 SHALL 由该目录的 `template.json` 声明（顶层 name/description/files[]，条目键 template/output/format?/only?），生成器加载清单 MUST fail-closed：未知键、缺失素材、未知模板名或非法 kind SHALL 以非零退出码失败并点名原因，MUST NOT 静默忽略或猜测。

#### Scenario: 清单负例 fail-closed

- **WHEN** 以 `--template nope` 调用生成器，或某模板 `template.json` 携带未知键（如 `"onlyy"`）或声明了缺失的素材文件
- **THEN** 生成器退出码 1，stderr 点名可用模板/非法键/缺失素材；不写任何文件

### Requirement: 测试接线配置工厂

`@dsh-plugins/test-kit` SHALL 提供 `./vitest` 子路径导出 `defineWebTestConfig({ root })`：返回纯配置对象（`esbuild.jsx: 'automatic'` + alias 指向 `<root>/test/stubs/ui-primitives.tsx` + 统一 include 与 node 环境）。该模块 MUST NOT import vitest（vitest 仅允许作为 test-kit 自测的 devDependency，不进入运行时依赖面）。双端软插件（session-tool-toggle / web-ux / workspace-config）的 `vitest.config.ts` SHALL 为薄声明：唯一 import 源 `@dsh-plugins/test-kit/vitest`、有效代码行 ≤ 6、不含 alias/esbuild/include/environment 字面量。multi-root-workspace 与 host-only 包 MUST 排除在该形态外。

#### Scenario: 工厂缺 jsx 接缝被负向用例抓住

- **WHEN** 临时移除工厂中的 `esbuild: { jsx: 'automatic' }` 后运行任一双端软插件的组件测试
- **THEN** 该套件失败（如 `React is not defined`），证明接缝不是侥幸

#### Scenario: 运行时依赖面混入 vitest

- **WHEN** test-kit 的 `dependencies`（非 devDependencies）出现 vitest，或 `./vitest` 工厂模块 import vitest
- **THEN** 结构检查失败

### Requirement: 测试接线门禁（AR8）

结构门禁 AR8 MUST 对双端软插件断言四面：①存在 `dsh.client` 则存在 `vitest.config.ts`；②薄入口形态（见「测试接线配置工厂」）；③磁盘上每个 `test/**` 测试文件被工厂 include 覆盖（防组件套件静默消失）且至少出现在一个 tsconfig include 内（防类型检查漏登）；④`test/stubs/ui-primitives.tsx` 存在且指向 kit 的 ui-primitives 底座。任一面不满足 MUST 以非零退出失败并点名包与文件。

#### Scenario: 薄入口漂移被 AR8 拒绝

- **WHEN** 某双端软插件的 `vitest.config.ts` 加入 `resolve: { alias: … }` 字面量或第二个 import 源
- **THEN** `node scripts/check-architecture.mjs` 退出码 1 且报 `AR8 <包名>/vitest.config.ts`

#### Scenario: 测试文件脱离 include 被拒绝

- **WHEN** 磁盘新增 `test/foo.test.tsx` 但工厂 include 或任一 tsconfig include 未覆盖它
- **THEN** AR8 失败并点名该文件

### Requirement: 产物契约断言模块

`@dsh-plugins/build-kit` SHALL 提供 `./artifact-contract` 子路径：`loaderShellIssues` / `requireSurfaceIssues` / `hostSelfContainmentIssues` / `selfContainmentIssues` 纯函数，返回 issue 列表（空数组 = 通过，每条自带包名与期望/实际）。模块 MUST NOT 读盘、MUST NOT import vitest 与 `scripts/lib`（词数组由调用方以词法器产出）。三份 `bundle.test.ts` 的结构层断言（ModuleLoader 壳标记 / requiredWords 精确集合 / node: 与自包名排除 / 宿主半自包含）SHALL 改用契约函数。既有 `assertSelfContained` 导出 SHALL 删除（README 声明的消费者不存在，判据迁入契约模块），MUST NOT 保留无调用方的同名导出。

#### Scenario: 共享壳单点出错被负面用例抓住

- **WHEN** 契约函数对含 `node:fs` 泄漏或自引用包名的输入运行
- **THEN** issue 非空且文案含包名；build-kit 自测以正反两面用例钉住判据

#### Scenario: 产物字节等价

- **WHEN** 断言下沉改造完成前后运行产物契约基线比对
- **THEN** 全部插件模块词集合逐字相等（共享断言只改测试，不改产物）

### Requirement: 包独有断言保留边界

bundle.test 的包独有断言 MUST 留在包内：INLINED/ABSENT 标记、css 注入器计数（各包口径不同）、座位字面量、dtsOwned 存在性。三份期望词集 MUST 各自保留为包内常量（独立钉住 external 声明的证据），MUST NOT 合并为共享常量。

#### Scenario: 共享词集常量被拒绝

- **WHEN** 三份 `CLIENT_REQUIRES` 被合并为 test-kit 或 build-kit 的共享常量
- **THEN** 视为缺陷：断言与声明同源后，external 漂移不再被独立证据拦截

### Requirement: manifest 形态对账

六个软插件的 manifest SHALL 与模板按 kind 推导的规范形态一致：`exports` 恰含 `.`、`./package.json`（全部软插件——DSH 插件元数据读取依赖它）与 `./client`（dual only）；`exports["./src/*"]` MUST NOT 存在（全仓零消费者的迁入遗留死导出）；`files` 集合 MUST 恰为规范集（含 `icon.svg` 当且仅当 `icon` 字段存在）。`pnpm gen:plugin --check` SHALL 复用生成器的渲染路径逐包对账：无白名单、fail-closed（任何差异非零退出并点名包与键），且 MUST 断言 icon 条件事实（`icon` 存在 ⇒ 文件存在 ⇒ `files` 含它）与 dual ⇒ `./client` 存在。

#### Scenario: 死导出复活被对账拒绝

- **WHEN** 某软插件 manifest 加回 `exports["./src/*"]` 后运行 `pnpm gen:plugin --check`
- **THEN** 退出码 1 且报 `<包名>: exports["./src/*"]`

#### Scenario: 元数据导出缺失被对账拒绝

- **WHEN** 某软插件 manifest 缺 `exports["./package.json"]`
- **THEN** `--check` 非零退出并点名该键（防 DSH 插件列表静默丢标题/图标）

### Requirement: 规范校验与脚手架冒烟的 CI 机械化

`openspec` CLI SHALL 进入根 devDependency 并提供 `pnpm spec:check`（`openspec validate --all --strict`）单一命令；CI verify 作业 MUST 包含该步骤（strict 校验绿灯进入机器事实）。CI SHALL 增设 `scaffold` 冒烟作业：基线安装 `--frozen-lockfile`、生成 host-only 与 dual 两个新包后以 `--no-frozen-lockfile` 补装（lockfile 写盘仅限该一次性作业）、对两包跑 lint/typecheck/build/test 与 `pnpm dsh:check`——「脚手架开箱通过」承诺由该作业提供常驻机械证据，MUST NOT 依赖人工演练。

#### Scenario: strict 回归被 CI 拦截

- **WHEN** 某次提交使 `openspec validate --all --strict` 退出非零
- **THEN** CI verify 作业在该步骤失败

#### Scenario: 模板破坏开箱承诺被 CI 拦截

- **WHEN** 模板改动导致任一 kind 生成物无法通过四链与 dsh:check
- **THEN** scaffold 作业失败并指向失败步骤（不依赖任何人记得演练）

### Requirement: 结构评估档案

仓级 SHALL 设 `docs/assessments/` 评估档案目录（带索引并注明「非 ADR、不做决策」），与 `docs/decisions/`（真实决策）显式区分。multi-root-workspace 构建体系统一化 MUST 以评估档案承载（现状差异清单 / 不迁移理由 / 迁移通过标准 = B6 模块词逐字相等 + 类型面消费方 typecheck 绿 + 装配冒烟绿 / 工作量与风险），MUST NOT 为「暂不施工」的评估新建 ADR。该档案 SHALL 附 B6 基线快照（7 份插件模块词 JSON，经 `check-artifacts.mjs --write-baseline` 产出并随仓库提交），作为未来任何构建迁移的等价性锚点。

#### Scenario: 评估档案不误作决策

- **WHEN** 读者在 `docs/decisions/` 索引中查找 multi-root 构建结论
- **THEN** 索引指向评估档案（非 ADR），档案内明确「结论：暂不迁移 + 通过标准」

#### Scenario: 基线锚点可用

- **WHEN** 未来对任一插件实施构建迁移后以 `--baseline docs/assessments/multi-root-baseline` 比对
- **THEN** 模块词逐字相等即通过；差异非空即失败并列出差异词
