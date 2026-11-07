# residual-convergence · 收敛留痕（diff-matrix）

> 阶段 1.5 产物。输入：`line-a.md`（A 线·需求与价值视角）+ `line-b.md`（B 线·实现与风险视角）+ 主会话交叉裁定。
> 事实基线注意：两线规划期间仓库 HEAD 由 `30b0d63` 推进到 `e48b476`（unify-deps-and-templates 已归档、dsh-baseline 过载 requirement 已拆分）——本文所有「最新实测」以 `e48b476` 后复核为准。

## 1. 三分类矩阵

### 1.1 共识（两线一致，直接采信）

| # | 内容 |
|---|---|
| C1 | 事实修正：attribution 消费侧测试为 5 份 608 行（project-mcp 179+145、user-commands 111+91+82）；**host-kit 已有 371 行内核套件**（`tooling/host-kit/test/attribution.test.ts`）且文件头自述为两包规则用例的表驱动并集超集——A3 性质是「删插件侧重复」而非「补内核套件」；anomaly 两份测包级 wiring（onAnomaly 接线），不能删；session-tool-toggle 的 workspace-attribution.test（228 行）测本包函数，不卷入 |
| C2 | 事实修正：smoke 零容器依赖、零真实凭证（CLI 从 pinned devDependency 解析 + scratch `$DSH_HOME` + 假端点假凭证）；失真口径共三处副本：README.md:80、AGENTS.md:67、`.github/workflows/ci.yml` 头注释（L3） |
| C3 | A1 边界共识：三份 28–32 行同形证实；**multi-root 18 行形态必须显式排除**（无 esbuild.jsx、pool: 'forks'、30s timeout、tests/ 目录——并入工厂会改变其测试执行语义）；host-only 三包无配置天然不需要；模板缺 alias（生成的 dual 包一加组件测试即踩坑）是 A1 增量收益大头 |
| C4 | A2 边界共识：词法器已共享（`scripts/lib/artifacts.mjs`）；下沉对象是结构层（ModuleLoader 壳断言/词集对比/node: 排除）；包独有断言（INLINED/ABSENT markers、css 注入器计数、座位/契约字面量）留在包内；A2 收益在三件里最薄、失败信息变间接是主要风险 |
| C5 | A4/B4 联动：AR3 的「模板值」是 check-architecture 硬编码推导、不读 templates/——模板与真实包无机檆对账；「开箱通过」承诺三处成文零机械验证 |
| C6 | B1 定性共识：**可接受的约束**——ADR-0001 C2 硬边界明示不纳入统一构建；特殊面实质（14 exports、双段 d.ts、tsdown、koffi 原生依赖、三段 smoke）；强行迁移代价大、收益偏美学；处置 = 立专项评估档案（不施工） |
| C7 | B2/B3/B4 定性共识：均为**应处理的债**（小）——B2 三处副本同批修；B3 requirement 文本结构拆分语义零变化；B4 实证承诺 |
| C8 | 验证思路共识：全仓门禁链（lint/typecheck/build/test/dsh:check）+ A1 负向用例（删工厂 esbuild 行组件套件应红）+ A3 对照清单先行 + A2 断言集合逐条对照 + B2 grep 归零 + B3 strict 退出 0 + B1 用 check-artifacts --baseline 冻结 B6 作迁移等价锚点 |
| C9 | 非目标共识：不动 multi-root 构建体系；不改插件行为语义与产物字节（AR1–AR7、B1–B5 全绿、lib/ 逐字节不变）；不动 openspec 规范语义；本轮只规划落档 |

### 1.2 分歧（两线都提出但结论不同）

| # | 分歧 | A 线 | B 线 | 处置 |
|---|---|---|---|---|
| D1 | **A1/A2 共享代码落点**（最承重，影响 ADR/门禁/模板件套） | Q1 推荐 a：扩 test-kit 章程（工厂+断言原语都进，ADR-0001 加修订记录） | Q1 推荐 b：分层——工厂进 test-kit（返回裸对象、不装 vitest）、断言壳进 scripts/lib（随 artifacts.mjs 先例）；ADR 只补一句澄清 | **派第三线复算**（见 §3）；结论后进设计树问用户 |
| D2 | **A 类优先级**（A1 vs A3 谁先） | A1 P1 ＞ A2 P2 ≈ A3 P2 ＞ A4 P3（A1 收益含模板防坑） | A3 ① ＞ A1 ② ＞ A2 ③ ＞ A4 ④（A3 收益/风险比最高且无前置；A1 依赖落点裁定） | 两线任务序都以「债/裁定先行」开场，A 类内部顺序依赖 D1 裁定结果 → 设计树节点（依赖 D1） |
| D3 | B4 机制化形态 | CI 冒烟作业（gen → install → verify → dsh:check） | frozen-lockfile 实证 + 演练步入 dsh:check 或 CI（宿主二选一未定） | 可调和（CI 作业是机制化宿主之一）；细节并入设计树（含 U2/Q3） |

### 1.3 单边遗漏核验（SHALL 逐项；主会话已全部实测核验）

| 来源 | 项 | 核验结果 | 结论 |
|---|---|---|---|
| A 线 N1 | CI 不跑 `openspec validate --all --strict` | ✅ 证实：ci.yml 七步链（install→lint→typecheck→build→test→docs:check→dsh:check）无 openspec 步骤；且规划期间 3→2 条 WARNING 无人察觉即为其后果 | **成立，纳入**（P0 止血位） |
| A 线 N2 | tsconfig include 三段式手工枚举漂移 | ✅ 证实：session-tool-toggle host 段逐文件枚举 15 个测试 + client 段枚举 4 个 .ts 测试（新测试漏登即不被类型检查） | 成立，纳入（细节：glob 化有 client 测试误入 host 半的风险，先盘点） |
| A 线 N3 | workspace-config 测试零类型检查 | ✅ 证实：其 tsconfig.host.json include 仅 `src/index.ts`、client 仅 `src/client`+css-modules.d.ts——`test/` 全部 6 文件不在任何 include，typecheck 绿灯为假信心 | **成立，纳入（P1）** |
| A 线 N4 | test-kit 自身零测试 | ✅ 证实：test-kit 无 test 目录（源码仅 locale-parity.ts + ui-primitives.tsx）；B 线亦以「观察项」提及（处置：随落点裁定顺带表态，不单独立项） | 成立，低优先级 |
| A 线 N5 / B 线 U4 | 根口径三副本（含 ci.yml 注释） | ✅ 双边实质同发现（合并为共识 C2 的一部分） | 成立 |
| A 线 N7 | scripts/lib 跨层引用灰区 | ✅ 两线均证实（词法器先例）；处置并入 D1 落点裁定 | 成立 |
| B 线 U1 | 「下沉 test-kit」撞 ADR-0001「不装 vitest」+ AR2 白名单双重拦截——落点是前置决策债 | ✅ 证实存在此约束（两线引同一来源）；A 线也识别为待决 Q1 但未上升为「前置债」 | 成立，D1 复算的核心 |
| B 线 U2 | 「开箱即绿」承诺无自动化（改模板后忘了演练无人知） | ✅ 证实：CI 无 gen 演练步；模板 README 硬约束②只约定人工演练 | 成立，并入 B4 机制化（D3） |
| B 线 U3 | 模板 dual 缺组件测试接缝（alias/jsx） | ✅ 证实（与 A 线 A1 模板收益重合，双边实质共识） | 成立 |
| B 线 U6 | manifest 存量差异未过正当性审计（`./src/*`、`./package.json` 全仓无消费者） | ✅ 复核证实：grep `dsh-plugin-*/src/` 仓内零命中；exports 形态确认（web 三包 + project-mcp 带子路径、user-commands/zcode-plan 仅 [.]） | **成立，纳入（A4 前置）** |
| B 线细节 | css 注入器两种口径（web-ux 固定 4 / stt 动态计数）参数化前须统一 | ✅ 采信（实施细节，进任务描述） | 成立 |
| B 线细节 | `pnpm install --frozen-lockfile` 消解「写 lockfile 风险」 | ✅ 采信（B4 实证路径修正） | 成立 |

## 2. 自行裁定记录（第 2 步）

| 查证 | 方法 | 结论 |
|---|---|---|
| N1/U2/U4 | 读 `.github/workflows/ci.yml` 全步骤 | 七步无 openspec validate、无 gen 演练；L3 注释含失真口径 |
| N2/N3 | 读三包根/host/client tsconfig | N2、N3 均证实（见 §1.3） |
| N4 | `find tooling/test-kit` | 无 test 目录，零测试 |
| U6 | grep 子路径消费者 + 逐包读 exports | 仓内零消费者；形态四类确认 |
| B3 基线漂移 | 规划期间 HEAD `30b0d63`→`e48b476`，重跑 `openspec validate --all --strict` | **剩余 2 条**：spec/dsh-project-mcp requirements[5]、spec/dsh-session-tool-toggle requirements[5]（dsh-baseline 已被归档提交 e48b476 拆掉）；strict 仍非全绿 |
| 工作区 | `git status` | 脏改动已被归档提交吸收，现在干净；`openspec list` 活跃变更清零——落档环境无干扰 |
| openspec 安装 | `which openspec` + 查 package.json | 全局安装（/usr/local/bin/openspec），**不在仓库 devDeps**——N1 的 CI 实施成本 = +1 安装步骤（npx / devDep / 全局装三选一，实施期定） |

## 3. 分歧复算（第三线，panel 路由：deepseek-official/deepseek-flash）

**复算结论**：选 (e) 修正版分层——① `defineWebTestConfig` 工厂 → `@dsh-plugins/test-kit/vitest`（纯 TS、**不 import vitest**、返回配置对象，消费方 `defineConfig(defineWebTestConfig({ root }))` 包裹）；② 共享断言壳 → **`@dsh-plugins/build-kit` 新增「产物契约」模块**（纯 .mjs + 手写 .d.mts、不 import vitest、返回 issue 列表仿 locale-parity）；scripts/lib 不动。明确否决 a（都进 test-kit 撞 ADR-0001「产物形态断言留在包内」）/ c（ADR-0001 L92 已逐条否决 scripts/ 作共享落点）/ d（AR7 五条包红线 + 治理成本）；b 只成立一半（工厂进 test-kit 成立，断言壳进 scripts/lib 不成立——R9 先例前提是 gate 也是消费方，断言壳没有）。

**复算线新核实硬事实**（增量，两线未覆盖）：
- `assertSelfContained` 是 build-kit 的**死导出**：README L107–108 声明「由包内 bundle.test.ts / 仓级 check-artifacts 调用」，实际全仓无人调用——② 落 build-kit 是补线不是新造第三处。
- test-kit「不装 vitest」**只是 prose 无机器门禁**：AR2 脚本白名单无 test，但 devDep 白名单含 vitest（check-architecture L170–178）——修订时可顺带机檆化。
- 模板**不是天然第 4 消费者**：template.json 无 stub 文件、gen-plugin 只给 dual 补 test-kit devDep（L369）、`templates/default/test/smoke.test.ts` 已自带第 4 份 loader 壳断言（按 manifest 分支）——「模板同步受益」需先裁模板边界。
- stt/web-ux 的 bundle.test 在 tsconfig include 内、wsc 不在（与 N3 同根）。
- 可行性实测：Node 24.21 下 test-kit 的 `.ts` 工厂可被 vitest.config.ts 加载（type-stripping + 软链 realpath；工厂须无 JSX/enum）。
- 共享壳四组语义逐字相同的断言（loader 壳/requiredWords 精确集合/node: 与自身包名排除/宿主半自包含）之外，css 注入器计数（stt 动态 = v1.4.0 事故回归点）**必须留包内**；三份相同词集建议保留（独立钉住 external 声明的证据）。

**三线对照**：
| 决策点 | A 线 | B 线 | 复算线 | 裁定 |
|---|---|---|---|---|
| 工厂落点 | test-kit（扩章程） | test-kit（vitest-free） | test-kit/vitest（vitest-free） | **三线一致 → 结论成立**：进 test-kit、vitest-free、最小修订 |
| 断言壳落点 | test-kit | scripts/lib | build-kit（首选；次选 test-kit 纯 issue 函数） | **三线首选互异 → 升级用户决策项**（设计树 T2） |

**复算线提出的上游依赖链**：① test-kit 章程（决定工厂合法性）→ ② 产物契约 owner（build-kit vs gate，比落点更上游）→ ③ 测试资产分类原则（断言跟随被约束代码——同时统一 A2 与 A3 判据）→ ④ 模板边界 → ⑤ AR 化门禁强度 → ⑥ multi-root 排除（三线共识，已定）。

## 4. 探索审视（第 4 步，openspec-explore 姿态）

| # | 发现 | 类型 | 处置 |
|---|---|---|---|
| X-a | **规划期间基线漂移**：unify-deps-and-templates 归档（50928f1）+ dsh-baseline 过载 requirement 拆分归档（e48b476）→ B3 从 3 条降为 2 条、工作区干净、活跃变更清零 | 事实更新 | 已并入 §2；B3 任务目标改为「project-mcp + session-tool-toggle 两处」 |
| X-b | **A4 收敛方向可能反转**：gen-plugin dual 已自动补 `exports['./client']`（L367），模板生成形态 = [., ./client]；与真实双端包的差异恰是 `./src/*` + `./package.json`——U6 审计若判死导出删除，则**真实包向模板收敛**（删存量），而非「模板补齐到真实形态」。A4 的「①按 kind 生成正确形态」已存在，剩余工作 = 审计存量差异 + 删不正当差异 + 文档化正当差异 | 方向修正 | 纳入 A4 任务定义（与 U6 合并为「先审计后收敛」单任务） |
| X-c | openspec CLI 全局安装、不在 devDeps | 实施成本 | 并入 N1 任务说明 |
| X-d | ~~contracts 座位字面量单源化~~ | 盲区证伪 | **丢弃**：D-15 显式设计「各包自持字面量 + 字面量类型断言」，bundle.test 的座位断言是包事实，单源化违背已决决策 |
| X-e | **变更切片决策**：两线任务清单均 10 项左右、跨 test-kit 扩权/测试重写/CI/文档/审计多性质——单变更一次落档 vs 拆「债清理」「测试接线收敛」「manifest 审计」多变更分批 | 决策项 | 进设计树（问用户） |
| X-f | A1/A2 落地后 AGENTS.md「插件结构约定·测试」段、README 相关段需同步（两线均未列） | 小补 | 进任务清单（不上升决策） |

## 5. 设计树与前沿分轮（第 5 步，grill-me）

**待决项池与依赖**：

```
T1 test-kit 章程扩权 ──┬──> T2 断言壳落点（三线互异，用户决策）──> T5 A 类实施顺序
（前沿：是）           ├──> T10 模板边界（是否覆盖 templates/）──┐
                       └──> T11 AR 化门禁强度 <──────────────────┘（终态定死才能写门禁）
T4 A3 删除口径（前沿：是，保留口径两线有分歧）   T6 B4 机制化形态（前沿：是）
T8 A4 方向与强度（前沿：是）                     T9 变更切片（前沿：是，承重：决定落档形态）
```

**共识不问（直接采信）**：B1 = 可接受约束 + 立专项评估档案 + 冻结 B6 基线（两线一致）；N1 = CI 加 openspec strict 止血（P0）；N3 = workspace-config 测试补类型检查（P1 堵洞）；B2 = 三处口径同批修（实跑定稿句子）；B3 = 拆剩余 2 条（project-mcp、session-tool-toggle）；multi-root 显式排除一切收敛；css 注入器计数留包内；三份词集保留。

**第一轮前沿（5 问：T1 / T9 / T4 / T6 / T8）**：已发出，答复待记录。

**第二轮前沿（T1 落定后）**：T2 / T10 / T11 / T5。

### 问答记录

**第一轮（T1/T9/T4/T6/T8，2026-11-07）**——5 问全部按推荐落定：

| 题 | 答复 | 落定结论 |
|---|---|---|
| T1 test-kit 章程 | ✅ 扩为测试接线底座 | 工厂进 test-kit（vitest-free 子路径导出）；ADR-0001 表格 + test-kit README 最小修订；「不装 vitest」保留硬约束并顺带机檆化 |
| T9 变更切片 | ✅ 单变更分批 | 一个 openspec 变更，tasks.md 组间串行批次契约分批（先例 unify-deps-and-templates 44 任务） |
| T4 A3 口径 | ✅ 删规则级留策略+wiring | 逐条对照 host-kit 并集表为删除凭证（映射不闭合自动降级只迁移）；保留策略级 + wiring + 每包 1 条接线用例；608 → 约 150–250 行 |
| T6 B4 形态 | ✅ CI 冒烟作业 | gen 双 kind → 临时目录 → frozen-lockfile install → 四链 + dsh:check；本地 dsh:check 不加重 |
| T8 A4 方向 | ✅ 审计→删减→文档+--check | 先正当性审计 → 删不正当差异（真实包向模板收敛）→ 正当差异文档化 + gen-plugin --check 按需对账；不上 AR8 |

**第二轮前沿（4 问：T2/T10/T11/T5，2026-11-07）**——4 问全部按推荐落定：

| 题 | 答复 | 落定结论 |
|---|---|---|
| T2 断言壳落点 | ✅ build-kit | 新增「产物契约」模块（纯 .mjs + .d.mts、vitest-free、issue 列表函数）；断言跟随 owner；build-kit 测试床负面自测；assertSelfContained 死导出顺势收口（接线或删除，不留第三种说法） |
| T10 模板边界 | ✅ 按 kind 分化 | 模板 vitest.config 加 `only: dual` 改用工厂 + 补 stub 薄文件（only: dual）；host-only 不再生成 config（靠 vitest 默认值，对齐真实三包形态）——模板成为真实形态样本 |
| T11 门禁强度 | ✅ AR 化薄入口门禁 | 新增 AR8（或扩展 AR4）：vitest.config 薄入口断言（唯一 import 源 = test-kit/vitest、有效行 ≤6、无 alias 字面量）+ 磁盘 test/**/*.test.ts(x) 全被工厂 include 覆盖（防组件套件静默消失） |
| T5 A 类顺序 | ✅ A3 先、A1+A2 配套 | 批次序：止血债先行 → A3 去重（零前置）→ A1 工厂（含模板/ADR/门禁配套）→ A2 断言壳（A1 绿灯后）→ 审计收尾 |

## 6. 收敛结论

**前沿为空，收敛结束**（2026-11-07，两轮 9 问全部落定，无静默假设项）。

**架构决策终态**：
1. **落点分层**：`defineWebTestConfig` 工厂 → `@dsh-plugins/test-kit/vitest`（vitest-free，T1+三线一致）；共享断言壳 → `@dsh-plugins/build-kit` 产物契约模块（T2）；scripts/lib 不动（词法器 R9 先例维持，A2 断言壳经 .d.mts 消费或传值，细节设计期定）。
2. **测试资产分类原则**（复算原则 3，被 T2/T4 采纳）：断言跟随被约束的代码（内核用例归 host-kit、产物契约归 build-kit）、夹具与无包语义原语归 test-kit、gate 与测试双消费机制归 scripts/lib。
3. **模板 = 真实形态样本**（T10）：dual 用工厂+stub+test-kit devDep（gen-plugin L369 已有）、host-only 免 config。
4. **门禁三件套**：CI 加 openspec strict（N1）+ gen 冒烟作业（T6）+ vitest.config 薄入口 AR（T11）。
5. **A4 方向反转确认**（T8+X-b）：审计存量差异 → 删不正当差异（真实包向模板收敛）→ 文档化正当差异 + `gen-plugin --check` 按需对账。
6. **B1 处置**：可接受约束；立专项评估档案 + 冻结 B6 基线（共识，未入提问）。

**落档输入汇总**：单变更（T9）、批次序 = 止血债（N1/B3/B2/N3 堵洞）→ A3 → A1（工厂+模板+ADR+AR 门禁）→ A2（断言壳）→ A4 审计+--check+B4 CI 冒烟 → B1 档案+收尾（N2 盘点/N4 最小自测/X-f 文档同步）。

**实施期前置未知项（不阻塞落档，写入任务）**：project-mcp `./src/*` 导出动机（审计任务查明）；smoke 实跑耗时/网络（B2 定稿依据）；N2 glob 化可行性（盘点任务）；vitest 纯对象/工厂加载形态（A1 首轮实施验证，复算已实测可行）。




## 6. 收敛结论

> 状态：进行中。
