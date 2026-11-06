# Design

> 本文承载阶段 1.7 代码设计线的深度契约断言；逐文件触达面、全部证据锚（E1–E30 + 探针 P1–P13）、接口全文与逐组施工要点见本变更目录权威副本 [`code-design.md`](./code-design.md)（规划收敛留痕见 [`diff-matrix.md`](./diff-matrix.md)）。

## Context

- 安装模型铁律：profile 按 git tag + `&path:plugins/<name>` 单目录安装、`link:` 不装依赖 → 共享只能发生在构建期/类型期；任何共享以 devDep `workspace:*` + esbuild 内联进自包含 `lib/` 落地（归档 D12 探针 + 本次 P10 复证：`catalog:` devDep 装出后原样保留、不解析不安装）。
- 机制死结（探针实证）：`composite` 工程 import 跨包 `.ts` 源 → TS6307 硬失败（P1）；package `exports` 指向 `.ts` 而无 `paths` → TS2307（P6）；非 composite + `paths` + esbuild 直读 TS 源 → 全通（P2/P3/P7）。
- 既有决策继续有效：unify-workspace-config-entry 的 D2/D3/D4（贡献方仅 `import type`、holder 发 d.ts 为类型权威）、ADR-0013 决策 3（holder 是编译期类型依赖）；multi-root 的 ADR-0009（精确 peer/allowlist）。
- 行为等价性实证：三份 attribution 中 pm 与 uc 的 spec 本就同义（主根压倒附加根 + 登记顺序先到先得 + fail-closed），实测分歧仅 3 处（E9/E10/E11）；stt 的「未登记目录可承载工作区档」是其 spec 背书的业务语义（E17），非退化。

## Goals / Non-Goals

**Goals:**

- 六软插件构建/配置/测试资产收敛到单一事实源（build-kit / 根基准 tsconfig / 根 oxlint / catalog / test-kit），新增插件 = `pnpm gen:plugin` 填差异。
- 运行时语义一次性收敛：归属内核 + 未命中策略参数化三包共享，triggers/watcher/host-io/roots 两包合并；产物保持自包含且模块词集合与迁移前逐字相等。
- 守护单入口：`dsh:check` 聚合基线 + 结构不变式（AR1–AR7）+ 产物契约（B1–B6，三个 host-only 包补上断言真缺口），release 与 CI 同源。
- 修复 user-commands attribution 并发窗口 bug、裁定 `roots[0]≠primaryRoot` 规范空白，均落 spec delta。

**Non-Goals:**

- 不动 multi-root-workspace 内核（tsc+tsdown、精确 peer/allowlist、其 ADR 体系与 `.oxlintrc.json`/tsconfig 变体）；不重排 `plugins/*` 布局；不拆统一版本、不发包 npm。
- 豁免清单生成化本次不做（分歧点 D6 裁决：另案）；`locales.ts` ×4 不合并（样式同构、内容各异）。
- 不引入 turbo/nx 或统一构建器（multi-root 的 tsdown 路线不并入 kit）。

## Decisions

**栈识别（SKILL.md 第六节要求的记录）**：Spring/Nuxt 判定均未命中；聚合层存在 `dsh-plugin-writer`（专为本仓结构性修改而写），但**用户明确豁免本次加载任何 writer skill**——理由：本次是对该 skill 所述架构的完全重构、skill 本身（含 15 处失效的 `build.mjs:<行号>` 引用）也在重构范围内，旧规范不能约束新设计；豁免仅本次有效，**不延伸到 G-doc-sync（执行时须加载 `writing-skills`）**。被否：先加载旧 skill 再逐条破例（产生「以旧规范为基准的默认否定」偏差）。

结构性决策（完整版含被否方案与反例见 code-design ④ D-1…D-14）：

| # | 决策 | 关键理由 / 被否 |
| --- | --- | --- |
| D-1 | host-kit 消费形态 = 包 `exports`→`src/*.ts` + 根 tsconfig `paths` 双轨；6 包去 `composite`、`typecheck` 改 `-p --noEmit` | 唯一同时满足 esbuild 内联与 tsc 解析的组合（P2/P3/P7）；被否：host-kit 先产 d.ts（typecheck 在 build 前必红）、composite+include 列源（`../../` 进 12 份配置）、project references（隐式产出副作用） |
| D-2 | build-kit 策略从包事实推导（kind ← `dsh.client.platform`+client 入口；dtsOwned/clean ← `exports[*].types`），薄入口仅 `hostExternals`/`cjsRequireShim`/`cssClassPrefix` 三旋钮 + `assertNoDynamicRequire` 守卫 | 旋钮编码不可推导的运行时判断；被否：`package.json#dsh.build` 契约面、kind 显式传参（两个事实源）、shim 默认全开（破 wsc 宿主半零 import 断言 E25） |
| D-3 | CSS 护栏统一「包+模块」双维度（`data-dsh-plugin`+`data-dsh-css`），顺手修 stt 潜伏 bug | E2：web-ux v1.4.0 修复知识未传播；反例：照抄 stt 单维度 → kit 单测红 |
| D-4 | 归属内核只报告上溯事实（`{ hit?, canonicalCwd? }`），未命中策略留各包适配器（stt=canonical-cwd 键；pm/uc=fail-closed） | 未命中是三包唯一真语义分叉；被否：policy 枚举进内核（内核被迫知道 stt registry 形状）、stt 也走 buildRootIndex（多余的 realpath 改变其性能与删除目录语义） |
| D-5 | `#3` 裁定：主根身份只由 `primaryRoot` 决定；`roots` 异于它的项按原序全进附加根层、一个根不丢、异常报诊断 | 契约成立时与两包现实现逐字等价（`filter(≠primary)` ≡ `slice(1)`）；被否：按位置 slice（异常时静默丢根=最坏失败模式）、抛错（全局 fail-closed）、静默忽略 |
| D-6 | npm scripts「模板化」= 生成 + AR3 断言一致，不做真共享 | npm 只读本包 manifest；被否：根脚本代理（破坏 `--filter` 命令面）、内部包导出 bin（不少一行只多一层） |
| D-7 | 三个 host-only 包的产物断言上移仓级 `check-artifacts.mjs`，不新增三份同构 bundle.test.ts | 不变式只落一处；被否：三包各写一份（第四代漂移源）、抽走现有三份的通用部分（拆散 D2/D3 防线） |
| D-8 | `dsh:check` 聚合三脚本；release.mjs 改调聚合入口 | 被否：独立 `arch:check` 顶层命令（多一个「记得跑」）；反例：只改 package.json 不改 release → 发布绕过新门禁 |
| D-9 | `pnpm-workspace.yaml` 的 packages 显式三行 `tooling/build-kit` 等，不用 `tooling/*` | `tooling/template` 不是包（清单叫 `package.json.tmpl`），显式列表使「谁是包」可断言 |
| D-10 | catalog 两册：默认册（工具链，人工升）+ 命名册 `dsh`（DSH 族+cordis+schemastery，upgrade 单点重写）；multi-root 一律不迁 | multi-root 的 typescript 6/vitest 4 会被默认册拖回旧版（C2）；统一方向取较新值（`@types/react ~18.3.31`） |
| D-11 | pm/uc/zcode 三包 `vitest.config.ts` 直接删除（内容全是默认值） | 被否：保留并纳入断言（防不住「升级改 3 处」）；反例：vitest 默认 include 变了会收集 0 用例报绿 → 验收必须比对用例数 |
| D-12 | 内部包一律 private+0.0.0+仅 devDependencies，AR1 机器断言 | 误入 `dependencies` 本地永远测不出（workspace 内可解析），只有 profile 侧炸 |
| D-14 | 仓级 ADR 体系 `docs/decisions/`，与 multi-root ADR 两套独立编号、引用带路径 | ADR-0001 推翻「不共享代码」旧结论；ADR-0002 记录 #3 裁定与原子索引纪律 |
| D-15 | 新建 `tooling/contracts` 纯类型包，座位契约类型权威从 holder（workspace-config）**完全转移**：holder 与三贡献方全部 `import type` 直连 `@dsh-plugins/contracts`，holder 的 `src/client/contract.ts` 退化为文档指针；D2/D3（仅编译期类型依赖、零运行时加载边）与字面量直写断言继续有效，**修订归档决策 D4**（修订记录并入 ADR-0001）；spec 层无需 delta（「降级与安装矩阵」requirement 的「贡献方对持有者的依赖仅限类型」在转移后更成立） | 用户在落档后 grill-me 追认轮拍板（推翻规划期「维持 holder 导出」共识）；被否：维持 holder 导出（权威与版本耦合 holder 发布节奏）、holder re-export 一层（双入口 = 两处事实源） |

**grill-me 追认轮（落档后，2026-11-06）**：①`#3` 裁定追认（值语义 + 诊断，实例说明后确认）；②类型检查形态追认（`tsc -b` → 双 `tsc -p --noEmit`、去 composite）；③变更名追认；④D-7 产物断言上移仓级追认（1.6 表三行 bundle.test 矛盾以 D-7 为准）；⑤stt CSS 去重潜伏 bug 顺手修复追认（产物字节变化属预期，模块词硬断言不变）；⑥CI 覆盖面边界追认（不跑需运行中 dsh 的 smoke）；⑦**contracts 包拍板**（见 D-15，构成落档后 scope 修订）。

落档分歧点裁决（用户已确认）：①stt 第三份日志适配器**纳入** G5（改调 `createLog`）；②CI **加** `pnpm docs:check`；③G4/G5 薄再导出文件**保留**（承载本包真实差异 + 测试零改动即等价证据）；④host-kit/test-kit **不补** `verify:all`（同一批命令跑两遍无增量）；⑤`@types/react` 统一较新值**并修类型**；⑥豁免清单生成化**本次不做**（另案）。

阶段 1.75 界面演示 gate：**未触发**——C1 不成立（纯架构/工具链重构，client 产物逐字等价），命中排除表「纯后端/CLI/配置/脚本」行（判定记录见 code-design.md 附录）。

## Risks / Trade-offs

- [共享 kit 单点故障：build-kit bug 同时打击 6 包] → kit 自带单测进 `pnpm -r test` 门禁 + G0 冻结的模块词集合基线（`check-artifacts --baseline`）每组收口比对。
- [catalog 与 upgrade-dsh 不同批 = 下次升级静默写坏清单] → G2 内强制同批（R10/R11/R1 同组），后置断言「不残留字面量」。
- [profile 侧 pnpm 为 10.34.9（仓库 pin 11.25），catalog 行为需真机验证] → G2 硬验收含真机 tag 安装演练；回退方案：退回字面量版本（探针 P10 已证 git 安装不解析 catalog devDep，风险为低）。
- [stub 并集底座覆盖不了某包真实消费面 → 测试变绿但防护变窄] → 底座=三份并集 + 包内允许本地覆盖；G3 验收断言用例数不减少 + `expect(` 计数逐包相等。
- [重扫行为变化（uc 从「窗口内可观察到半表」变为「原子快照」）] → 属修复非回归：先在旧实现跑红新用例取证，再在新内核跑绿（G6）；spec delta 明写「重扫期间不降级」。
- [重构窗口与 DSH 正式版升级抢同一批文件] → 组间串行小步合入，每组收口跑 GATE 全绿保持可发版。

## Migration Plan

G0 冻结基线（模块词集合快照 + 用例数记录）→ G1 build-kit（三 host-only 先迁再双端）→ G2 配置/catalog（同批适配 upgrade+check）→ G3 测试资产 → G4 归属内核三包接管 → G5 其余语义合并 → G6 spec delta + 并发/#3 回归证据 + 两份 ADR → G7 守护聚合 + CI → G8 gen:plugin + 文档 → G-doc-sync（dotfiles 单独 commit）。回滚策略：每组独立提交，组级 `git revert` 即回到上一可发版状态；G0 基线快照使任何一组的产物漂移可机器检出。

## 逐任务组与接口断言（摘要，全文见 code-design ③⑤）

- 接口形状断言：`buildPlugin(options)` 返回 `{ packageName, kind, dtsOwned, artifacts }`；host-kit 导出 `buildRootIndex`/`lookupIn`/`walkUp`/`RootAttributor`/`WatchIo`/`installTriggers`/`workspaceRoots`/`createLog`/`nodeRealpathIo`/`nodeWatchIo`（零依赖、零 `@deepseek-ai/*` import）；`gen:plugin` 只写文件不跑 git/pnpm；AR1–AR7 / B1–B6 为 `check-architecture.mjs` / `check-artifacts.mjs` 的断言契约。
- 任务组断言（与 tasks.md 一一对齐）：**G0** 冻结基线且门禁在未改树上全绿；**G1** 六包薄入口 + 模块词集合逐字相等 + multi-root `lib/` 零 diff；**G2** lockfile `packages:` 键集合零差异 + `dsh:upgrade` 幂等 + 红队（改回字面量必红）；**G3** 用例数不减 + `expect(` 计数逐包相等；**G4** 三包接管 + oracle 测试零改动 + `grep -c "@dsh-plugins/" plugins/*/lib/index.js` 全 0 + **contracts 权威转移**（四包 `import type` 直连、holder `contract.ts` 退化为指针、贡献方产物不含 holder/contracts 词）；**G5** pm/uc 阶梯用例不改即过 + 日志前缀逐字不变；**G6** 红→绿取证 + `openspec validate --all` 绿 + ADR 补 D4 修订记录；**G7** 红队三连（AR1/AR4/B2）+ CI 等价链本地全绿；**G8** 双 kind 生成演练后 `git status --porcelain` 为空 + 模板零版本字面量；**G-doc-sync** 失效行号引用清零 + 引用路径 `test -e` 全过 + dotfiles 单独 commit。

## Open Questions

无——阶段 1.5 收敛 9 项决策与落档 6 项分歧点均已裁决；G2 的真机 catalog 验证是有回退路径的验证项（见 Risks），非未决设计问题。
