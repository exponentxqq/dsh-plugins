# Proposal

## Why

构建、类型、运行期均已单点化（build-kit `buildPlugin` / 根基准 tsconfig / host-kit 内核）之后，**测试接线层是「复制-漂移」的最后一个未收敛区**，且漂移已实证发生：

- 三份 `vitest.config.ts`（session-tool-toggle 28 / web-ux 32 / workspace-config 30 行）逐字同形仅注释语言不同；模板又是最简 12 行且**缺 alias 与 jsx 接缝**——新生成的 dual 包一写组件测试必踩「React is not defined」坑；
- 三份 `bundle.test.ts`（151–162 行）结构同形（ModuleLoader 壳 / 词集对比 / node: 排除），共享断言无单点；
- attribution 消费侧 5 份 608 行测同一份 host-kit 内核（内核套件 371 行已自称两包规则并集超集），归属规则变更需同步 3 处；
- manifest 形态手工分叉（exports 四类、files 各异），且存量差异**未经正当性审计**：`./src/*` 子路径全仓零消费者（迁入遗留），而 `./package.json` 子路径 3 包缺失——DSH `readPluginMeta` 实际依赖它读插件元数据（删错会静默丢标题/图标）；
- 债与口径失真：`openspec validate --all --strict` 剩 2 条过载 requirement 且 exit 1，而 **CI 不跑 openspec 校验**（计数 3→2 的漂移无人察觉即其后果）；「smoke 需运行中的 dsh」失真口径有 **4 处副本**（README×2 / AGENTS / ci.yml 注释）；gen:plugin「开箱通过」承诺三处成文、零机械验证；multi-root 双构建体系是唯一体系级异类。

## What Changes

按批次分六组（组间串行、组内可并行），一个变更内完成：

- **组 0（前置）**：冻结 B6 迁移等价基线（7 份模块词快照落 `docs/assessments/multi-root-baseline/`，为全程「产物字节不变」提供锚点）。
- **组 1（止血与债）**：`openspec` 进根 devDependency + `spec:check` 脚本 + CI 步骤（N1/N10）；拆分剩余 2 条过载 requirement（B3，语义零变化，只搬不改写）；smoke 口径 4 处同修 + 实跑定稿（B2）；workspace-config 测试补类型检查（N3——其 `test/` 全部 6 文件此前不在任何 tsconfig include，typecheck 绿灯为假信心）。
- **组 2（A3 attribution 去重）**：以「逐条用例 → host-kit 并集表行」对照清单（23 条）为删除凭证，删 3 份内核规则级重复（-372 行）；保留 2 份 anomaly wiring（包级接线）+ 策略级断言；映射不闭合则先补表再删。
- **组 3（A1 vitest 工厂 + 模板分化 + ADR + AR8）**：test-kit 新增 `./vitest` 子路径导出 `defineWebTestConfig({ root })`（vitest-free 纯对象工厂）；三包 config 变 4 行薄声明；模板 vitest.config 改 `only: dual` 用工厂 + 新增 stub 薄文件、host-kind 不再生成 config；模板 tsconfig.client 补测试 include（N8）；ADR-0001 修订记录（test-kit 章程扩为「测试接线底座」）；新增 **AR8** 薄入口门禁（唯一 import 源、有效行 ≤6、无 alias/esbuild 字面量、磁盘测试文件全被 include 覆盖、且每个测试文件至少在一个 tsconfig include 内——Q2 落定）。
- **组 4（A2 产物契约下沉）**：build-kit 新增 `./artifact-contract` 模块（`loaderShellIssues` / `requireSurfaceIssues` / `hostSelfContainmentIssues` / `selfContainmentIssues`，纯函数返回 issue 列表）；三份 bundle.test 改声明式消费；包独有断言（INLINED/ABSENT 标记、css 注入器计数、座位字面量、dtsOwned）留包内；删除 `assertSelfContained` 死导出（README 声明的消费者不存在，判据迁入契约模块）。
- **组 5（A4 manifest 审计与对账 + B4 CI 冒烟）**：审计结论落地——删 4 包 `./src/*` 死导出、给 user-commands/zcode-plan/workspace-config 补 `./package.json` 导出（DSH 元数据依赖）、wsc files 删冗余 README.md、模板补 `./package.json` 与 `lib/**/*.d.ts`；`gen-plugin --check` 按需对账（无白名单、fail-closed、含 icon/files 条件断言 N11）；CI 新增 `scaffold` 冒烟作业（gen 双 kind → 基线 frozen install → `--no-frozen-lockfile` 补装新 importer → verify:all → dsh:check，Q1 落定）——「开箱通过」承诺首次获得机械证据。
- **组 6（B1 评估档案 + 收尾）**：`docs/assessments/` 新目录（非 ADR、不做决策，Q4 落定）+ multi-root 构建迁移评估档案 + B6 基线终检；test-kit 最小自测（N4）；N2 tsconfig include 盘点工件（形态保持枚举，D15）；AR1–AR8 文档五处同步；可选清 AR2 死分支（N9）。

**不变**：multi-root-workspace 一切代码与构建体系（B1 定性为可接受约束，只立评估档案）；`scripts/lib/artifacts.mjs` 词法器单源（R9）；`tooling/contracts`（字面量各包自持是 D-15 已决设计）；全部插件运行时行为与产物字节（AR1–AR7、B1–B5 全绿、`lib/` 逐字节不变）；openspec 规范语义（B3 只做结构拆分）。

## Capabilities

### Modified Capabilities

- `dsh-plugin-toolchain`:
  - ADDED「测试接线配置工厂」——test-kit `./vitest` 工厂（vitest-free 纯对象）、三包 4 行薄声明；
  - ADDED「测试接线门禁（AR8）」——薄入口、stub 存在、vitest include 与 tsconfig include 双面覆盖；
  - ADDED「产物契约断言模块」——build-kit `./artifact-contract` 四函数、三包结构层断言改契约消费、`assertSelfContained` 移除；
  - ADDED「包独有断言保留边界」——标记/注入器计数/座位字面量留包内、三份词集各自保留；
  - ADDED「manifest 形态对账」——`gen-plugin --check`、`./src/*` 删除与 `./package.json` 补齐、icon/files 条件断言；
  - ADDED「规范校验与脚手架冒烟的 CI 机械化」——openspec devDep + `spec:check` + scaffold 作业；
  - ADDED「结构评估档案」——`docs/assessments/` 与 B6 基线冻结；
  - MODIFIED「内部共享包结构不变式」——AR 面从 AR1–AR7 扩为 AR1–AR8；test-kit 章程与脚本白名单（`test`）；
  - MODIFIED「脚手架生成开箱合规」——模板按 kind 分化（dual 工厂 + stub + tsconfig.client 测试接缝；host-only 免 config），演练由 CI scaffold 作业机械执行。

（B3 对 `dsh-project-mcp` / `dsh-session-tool-toggle` 两份主 spec 的 requirement 结构拆分为语义零变化的 spec 维护，不产生 delta——语句逐字搬运、只加标题与移位，详见 tasks 组 1B 与 design。）

## Impact

- **根仓 dsh-plugins（单仓，无跨仓改动）**：根 package.json/pnpm-lock（openspec devDep）、ci.yml（verify +1 步、scaffold 新作业、头注释）、README/AGENTS（口径 4 处、AR 范围 5 处、命令表）、ADR-0001 修订、`docs/assessments/` 新目录；tooling 两包（test-kit：`./vitest` 导出 + 自测 + README；build-kit：`./artifact-contract` + guards 收口）；六个软插件（三包 vitest.config、三包 bundle.test、两包 attribution 测试删除、六个 manifest）；模板（config/stub/tsconfig/smoke/README）；scripts（gen-plugin `--check`、check-architecture AR8）；两份主 spec 结构拆分。
- **安装模型零破坏**：全部收敛发生在 devDependencies / 测试期 / 构建期 / 文档 / CI；manifest 变更只动死导出删除与元数据导出补齐（`./package.json`），`.` 主入口与 `./client` 不动。
- **产物字节零变化**：组 0 冻结的 B6 基线在组 6 终检时模块词逐字相等（唯一例外：manifest 变更不改产物内容）。
- **行为变更面**：无插件运行时行为变化；行为变化全部在工程面（门禁新增 AR8、CI 新增两步、`--check` 新命令、test-kit/build-kit 新导出）。
