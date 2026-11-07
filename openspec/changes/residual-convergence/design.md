# Design

> 本文承载阶段 1.7 代码设计线的深度契约断言；逐文件触达面、全部证据锚（F1–F12 + 逐模块 file:line）、接口全文与逐组施工要点见本变更目录权威副本 [`code-design.md`](./code-design.md)（规划收敛留痕见 [`diff-matrix.md`](./diff-matrix.md)）。

## Context

- 本变更是 `optimize-architecture`（tooling 四包单点化）与 `unify-deps-and-templates`（依赖统一 + 模板外迁）之后的第三轮结构收敛——前两轮已覆盖构建期（build-kit `buildPlugin`）、类型期（根基准 tsconfig）、运行期（host-kit 内核），测试接线层是最后一个复制-漂移区。
- 治理框架继续有效：ADR-0001（四包职责边界，本次对 test-kit 行做**修订记录**式扩权）、ADR-0002（归属内核与 #3 值语义）、AR1–AR7 结构不变式（本次扩 AR8）、B1–B6 产物契约（B6 作等价性锚点）。
- 规划期基线漂移的既成事实：两线规划期间 HEAD 由 `30b0d63` 推进到 `e48b476`（`unify-deps-and-templates` 归档 + dsh-baseline 过载 requirement 已拆分）——B3 目标从 3 条降为 2 条（`dsh-project-mcp` / `dsh-session-tool-toggle` 各 1），工作区干净、活跃变更清零。
- 关键外部事实（设计线新证）：DSH `readPluginMeta` 经 Node 解析器读 `<pkg>/package.json`（`dsh-app-app/lib/index.js:3008`）——`./package.json` 导出是**正当差异**（3 包缺失需补）；`./src/*` 全仓零消费者、首现于迁入提交 `0c68025`（死导出）；`iconOf` 要求 manifest icon 指向包内真实文件否则抛错（N11）。
- 机制事实：`pnpm install --frozen-lockfile` 在 lockfile 缺 importer 时必然失败（当前恰 7 个插件 importer）——scaffold 作业的 install 形态按 Q1 裁决分层。

## Goals / Non-Goals

**Goals:**

- 测试接线层单点化：`@dsh-plugins/test-kit/vitest` 工厂（三份 config → 4 行薄声明 + 模板开箱带接缝）、`@dsh-plugins/build-kit/artifact-contract`（三份 bundle.test 结构层断言下沉）、attribution 消费侧去重（608 → 236 行，对照清单为凭证）。
- 口径与门禁互证：openspec 进 devDep + CI strict 步骤；smoke 口径 4 处同修（实跑定稿）；gen:plugin 冒烟 CI 机械化（scaffold 作业）；AR8 薄入口 + include 覆盖（vitest 与 tsconfig 双面）。
- manifest 形态机械对账：`gen-plugin --check` 无白名单 fail-closed；删 `./src/*` 死导出、补 `./package.json` 元数据导出、icon/files 条件断言。
- multi-root 处置定型：`docs/assessments/` 评估档案 + B6 基线冻结（组 0 前置、组 6 终检），不动其任何代码。

**Non-Goals:**

- 不迁移 multi-root 双构建体系（tsc+tsdown 保留；评估档案只产出「不迁移理由 + 未来通过标准」）。
- 不动 `scripts/lib/artifacts.mjs` 词法器单源（R9 先例维持；契约模块以词数组入参消费）。
- 不动 `tooling/contracts`（座位字面量各包自持是 D-15 已决设计，本轮证伪单源化盲区）。
- 不删 `files: src`（发布面决策超出 manifest 声明形态边界，Q3 裁决保留；未来瘦身单独立项）。
- 不改任何插件运行时行为与产物字节（AR1–AR7、B1–B5 全绿；B6 模块词组 0 冻结、组 6 逐字相等）。
- N2 tsconfig include 只盘点不改形态（D15：glob 化有 client 测试误入 host 半的分区语义风险，机器兜底由 AR8 的「每测试文件至少在一个 tsconfig include 内」承担）。

## Decisions

**栈识别（SKILL.md 第六节要求的记录）**：本仓按字面探测规则（Spring / Nuxt）皆未命中；聚合层存在本仓专属 writer `dsh-plugin-writer`，**用户已指认加载**——设计子代理已实际加载该 skill，其分层方向（build-kit / host-kit / test-kit / contracts 职责边界）、复用优先、任务拆分粒度作为本次设计的硬约束（证据：code-design.md 文件头硬约束声明）。

结构性决策（完整版含被否方案与反例见 code-design ④ D1–D16）：

| # | 决策 | 关键理由 / 被否 |
| --- | --- | --- |
| D1 | 工厂落 `@dsh-plugins/test-kit/vitest`，返回裸对象、单 import、不包 `defineConfig` | 三线一致；单 import 让 AR8「唯一 import 源」可逐字断言；被否：保留 `defineConfig` 包裹（多一条 vitest/config import，AR8 须开例外，机器事实退化为注释约定） |
| D2 | 工厂选项键用 `root`（非需求原文的 `dir`） | 与 `buildPlugin({ root })` 同名同义；一个仓两个入口参数两个名字 =下一次复制的开始；工厂对非字符串/空串抛错 fail-fast |
| D3 | 断言壳落 `@dsh-plugins/build-kit/artifact-contract`，词数组入参、issue 列表返回 | T2 落定；`assertSelfContained` 本住 build-kit（落点=补线）；被否：scripts/lib（无 gate 消费方，R9 前提不成立）、test-kit（撞「产物形态断言留在包内」章程） |
| D4 | `assertSelfContained` 删除，判据迁入契约模块 | 死导出（README 声明的消费者不存在）；被否：保留并接线 build 期（归档 R6 已裁定词集合级不进 build 期）；反例：README 继续声称被调用而无人调用 = 文档与机器事实背离 |
| D5 | bundle.test 保留边界：壳/词集/宿主自包含下沉；标记、注入器计数、包声明、词集常量留包内 | stt `cssModuleCount()` 是 v1.4.0 事故护栏、web-ux 固定 4 是另一口径——统一丢事故语义；三份词集是独立证据（反例：共享常量则断言与声明同源，external 漂移测试仍绿） |
| D6 | A3 删 3 份 372 行留 2 份 wiring 236 行；先对照后删，映射不闭合「补表再删」 | 23 条逐条映射 host-kit 并集表；被否：连 anomaly 一起删（wiring 是「包没接上内核」的信号）；被否：只迁移不删（插件侧仍有规则副本） |
| D7 | N3 用 tsconfig.host.json include 测试，不新建 test 工程、不塞 client 工程 | wsc client 工程 `declaration`+`rootDir: "src"` 塞 test 触发 TS6059；被否：新增 tsconfig.test.json（撞 AR3 `expectedCoreScripts`）；反例：加第三个 tsconfig 忘改 AR3 = 假绿灯 |
| D8 | `./package.json` 判正当（保留 + 补齐 3 包）；`./src/*` 删 | F6 DSH readPluginMeta 消费前者；F7 后者零消费者迁入遗留；被否：一起删（元数据静默丢失且无门禁能发现——恰是 `--check` 要钉的） |
| D9 | `files` 收口：模板加 `lib/**/*.d.ts`；wsc 删冗余 `README.md`；`src` 保留 | README 由 npm 自动包含；`src` 是发布面决策（Q3 裁决）；反例：先删 `./src/*` 又忘审计 `files: src` = 发布不可 import 的源码 |
| D10 | `--check` 无白名单、fail-closed、按需跑 | T8 方向 = 删不正当差异后真实包与模板一致，任何差异即缺陷；被否：白名单（把遗留固化为规范）、AR 常跑（低频事件，AR8 已占门禁预算） |
| D11 | B4 落 CI `scaffold` 作业 | 承诺需常驻机械证据；被否：塞 dsh:check（本地秒级变分钟级）；install 分层按 Q1（基线 frozen + gen 后 no-frozen 写盘即弃） |
| D12 | B1 立 `docs/assessments/` 评估档案而非 ADR | `docs/decisions/README.md:32` 明写未决讨论不建 ADR；被否：ADR-0003（给「暂不施工」盖决策章，未来推翻要多一次修订链）；被否：README 一段（B6 七份 JSON 无处落） |
| D13 | test-kit 自测用 devDep vitest + 自持 config；「不装 vitest」精确化为「不作为运行时依赖」 | 复算证「不装 vitest」原是 prose（AR2 devDep 白名单本含 vitest）；被否：node:test 自测（同仓两套运行器）；反例：jsdom/testing-library 渲染 stub 需扩 AR2 白名单外依赖——改用 `renderToStaticMarkup` 零新增 |
| D14 | openspec 进根 devDep + `spec:check` 脚本 | 隐式全局依赖（N10）本地与 CI 两来源；被否：CI `npm i -g`（版本字面量进 CI，本地仍隐藏）；反例：CI 装 @latest → warning 阈值变化无提交即变门禁行为 |
| D15 | N2 只盘点不 glob 化；AR8 守「每测试文件至少在一个 tsconfig include 内」 | glob 化分区语义风险（client .ts 测试误入 host 半）；反例：stt host 改 glob 后 panel-client.test.ts 被两工程各查一遍，无人发现分区失效 |
| D16 | 模板 smoke 接产物契约推迟到组 5（与 scaffold 同批） | 模板改动只有 CI 作业能机械验证；组 4 先落真实包；反例：组 4 同批改模板 = 模板改动押后到「下一个人 gen:plugin」才炸 |

落档分歧点裁决（用户已确认，2026-11-07）：

- **Q1 冒烟 install 形态**：基线安装 frozen + gen 后 `--no-frozen-lockfile`（仅 CI 作业内、lockfile 写盘即弃）——保留「lockfile 完整性由 frozen 证明」原意。被否：gen 加 `--out` 出仓（workspace:*/catalog: 仓外无法解析 + AR7 连带）、全作业普通 install（丢 frozen 证据点）。
- **Q2 AR8 范围**：同批加 tsconfig include 覆盖断言（+25 行复用同一文件枚举）——N2 从「习惯」变机器事实；前置组 1D 堵洞落地。
- **Q3 `files: src`**：保留——本轮边界 = manifest 声明形态，发布内容变更另立；差异清单写明「随包分发源码」。
- **Q4 B1 档案落点**：`docs/assessments/` 新目录 + 索引（注明非 ADR 不做决策）——评估属仓级结构面、寿命长于变更。

阶段 1.75 界面演示 gate：**未触发**——C1 不成立（纯工程收敛：测试接线/CI/manifest/门禁/文档，无任何界面产出），命中排除表「纯后端 / CLI / 配置 / 脚本」行（判定记录见 code-design.md 附录）。

**执行环境（衔接点决策，2026-11-07）**：直用主工作区——判据零命中（工作树干净、仅 main 检出、无并行变更 worktree、单仓触达 dsh-plugins）；`/home/xuqinqin/develop/person/dsh-plugins` 主检出 @ main，装配复用既有 node_modules（无新建装配步骤）；环境错开不适用。执行模式 auto、引擎 subagent（映射文件预置）、apply 键 `opencode-go/deepseek-v4.1-flash`（兜底 `zcode-plan/glm-5.3-flash`）。

## Risks / Trade-offs

- **共享判定单点出错 → 三包同假绿**（A2 固有）：缓解 = build-kit 自测负面用例 + gate 不 import 同一判定（check-artifacts B1–B5 保持独立交叉验证）+ 每包保留独立字节断言（标记/注入器数）。
- **vitest 纯对象加载形态假设**（S1）：组 3 首轮 `pnpm -r test` 实证；不成立则降级为消费方 `defineConfig` 包裹（AR8 放行第二 import）。
- **A3 并集自述未经证伪**（S5）：对照清单是删除前置，映射不闭合先补 host-kit 表再删（降级路径内置）。
- **CI scaffold 时长**（S8）：第二条 install 仅解析两个新 importer；超预算则降级为只演练 host-only（回改 T6，属实施期待决）。
- **`@fission-ai/openspec@1.16.0` 可能被 release-age 门禁拒**：按既有形态加 `minimumReleaseAgeExclude`（与 DSH 条目同形）。
- 设计假设与未决项全文见 code-design ⑥（S1–S8 + 4 条实施期未决）。

## Migration Plan

组间严格串行（组内可并行），组 0 在一切编辑前冻结 B6 基线：**组 0 基线冻结 → 组 1 止血与债（1A openspec+CI / 1B 拆 requirement / 1C 口径四处+实跑 / 1D wsc 堵洞）→ 组 2 A3 去重 → 组 3 A1 工厂+模板+ADR+AR8 → 组 4 A2 契约下沉 → 组 5 A4 审计+--check+scaffold → 组 6 B1 档案+收尾+全链终检**。任何一组收口 = 该组全部门禁命令退出码 0 且不引入下一组返工；若中途发现必须触达 multi-root 产物，冻结动作回退重做。

## 逐任务组与接口断言（摘要，全文见 code-design ③⑤）

- **组 3 接口**：`defineWebTestConfig({ root }: { root: string }): WebTestConfig`（`WEB_TEST_INCLUDE` 常量；不 import vitest）；AR8 四规则（AR8-1 存在性 / AR8-2 薄入口 ≤6 行单 import / AR8-3 include 覆盖双面 / AR8-4 stub 存在）。
- **组 4 接口**：`loaderShellIssues({ packageName, source }): string[]`、`requireSurfaceIssues({ packageName, expected, required, imported }): string[]`、`hostSelfContainmentIssues({ packageName, words }): string[]`、`selfContainmentIssues({ words, externals }): string[]`（全部纯函数、词数组入参、issue 列表返回）。
- **组 5 接口**：`pnpm gen:plugin --check`（无 name/kind、与 --dry-run 互斥；规范键集合表 + icon/dtsOwned/dual 三条件断言；无白名单）。
- **组 1B**：两份主 spec 的 requirement 结构拆分骨架（project-mcp 1→4 条 16 scenario；session-tool-toggle 1→5 条 13 scenario；语句逐字搬运只加标题）。
- 逐文件触达面（含所属仓与组归属）、23 条对照清单、验证命令全文（含负向用例）见 code-design ①②⑤。

## Open Questions

- 实施期定（不阻塞）：smoke 实跑耗时/网络（组 1C 定稿 ci.yml 注释理由）；`@fission-ai/openspec@1.16.0` release-age 豁免是否需要；CI scaffold 时长预算（超则降级单 kind）；vitest 纯对象加载形态（S1 首轮验证）。
- 规划期已全部裁决：阶段 1.5 两轮 9 问（T1/T2/T4/T5/T6/T8/T9/T10/T11）+ 落档 4 问（Q1–Q4）——无未答决策项（留痕 diff-matrix.md §5–§6）。
