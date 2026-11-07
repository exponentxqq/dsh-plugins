# Spec Delta: dsh-plugin-toolchain（residual-convergence）

## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: 内部共享包结构不变式

`tooling/` 下的内部包（build-kit / host-kit / test-kit / contracts）MUST 为 private 且版本恒为 `0.0.0`，MUST NOT 进入任何插件的 `dependencies`（仅允许 `devDependencies` 的 `workspace:*` 引用）——违反时检查 MUST 失败，因为 profile 侧 git tag 单目录安装解析不到内部包。发布流程的版本同步与产物重建 MUST 只遍历 `plugins/*`；内部包 MUST NOT 出现在版本契约内。运行期共享源码包 host-kit MUST 保持零运行时依赖、零 DSH 包导入，其代码经构建期内联进入各消费包产物，消费插件在安装侧 MUST NOT 相互产生依赖。结构不变式 SHALL 覆盖 AR1–AR8：AR8 守测试接线薄入口与 include 覆盖（见「测试接线底座与配置工厂」）。test-kit 章程 SHALL 为「测试夹具 + 测试接线原语」——不装 vitest 精确化为「vitest 不作为运行时依赖、仅允许自测 devDependency」，其 `scripts` 白名单含 `test`。

#### Scenario: 内部包误入 dependencies

- **WHEN** 某插件把 `@dsh-plugins/host-kit` 写入 `dependencies`
- **THEN** 结构检查失败并指明该包；本地 `pnpm install` 本身不报错（workspace 内可解析），失败必须由门禁而非安装暴露

#### Scenario: 发布不含内部包

- **WHEN** 执行发布流程
- **THEN** 版本同步与产物重建只作用于 `plugins/*`，tooling 包版本保持 `0.0.0` 不变

#### Scenario: test-kit 运行时依赖面混入 vitest

- **WHEN** test-kit 的 `dependencies`（非 devDependencies）出现 vitest
- **THEN** 结构检查失败；`./vitest` 工厂模块 import vitest 同样视为违规

### Requirement: 脚手架生成开箱合规

`pnpm gen:plugin <name> --kind host-only|dual [--template <name>]` SHALL 从 `templates/<name>/`（缺省 `default`）生成新插件骨架（薄 build.mjs、extends 根基准的 tsconfig、catalog 引用的 devDependencies、含产物断言的测试骨架、cordis.patch.yml、README/AGENTS 段落）；生成物 MUST 开箱通过 lint、typecheck、build、test 与 `pnpm dsh:check` 全部门禁；模板 MUST NOT 含 DSH 族与工具链的版本字面量（一律 catalog 引用，DSH 派生值由基线派生）。模板 MUST 按 kind 分化为真实包形态样本：dual 生成 `vitest.config.ts` 薄声明（工厂调用）与 `test/stubs/ui-primitives.tsx` 薄 re-export，其 tsconfig.client include 覆盖 `test/**/*.tsx`；host-only MUST NOT 生成 `vitest.config.ts`（对齐真实 host-only 包无 config 形态，靠 vitest 默认收集）。开箱承诺的机械验证由 CI scaffold 作业承担（见「规范校验与脚手架冒烟的 CI 机械化」）。

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
