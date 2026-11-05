# diff-matrix · unify-workspace-config-entry（阶段 1.5 收敛留痕）

> 输入：`line-a.md`（A 线：需求与价值）/ `line-b.md`（B 线：实现与风险），均 team 成员产出（锁定 Lead 模型，规划键路由不适用，已留痕）。
> 本文件随落档复制入 `openspec/changes/unify-workspace-config-entry/`，落档副本为权威。

## 一、三分类矩阵（按 7 字段）

### 1) 目标与非目标

| 内容 | 分类 | 处置 |
|---|---|---|
| footer 单入口、双形态（256px/56px）可见可点有可访问名 | 共识 | 采信 |
| 统一弹窗 + 分节导航，首批三节（Folders/工作区默认档/会话管理） | 共识 | 采信 |
| 分节可扩展、未装插件节隐藏 | 共识 | 采信 |
| 三插件宿主半/RPC 通道/落盘零变更 | 共识 | 采信 |
| 不改上游 shell、不提上游换行类修改 | 共识 | 采信 |
| web-ux 会话管理是唯一无其他 GUI 路径的功能（迁移风险硬点） | 共识（A 线风险 6 / B 线 Q3 特别提示） | 采信，进 Q2 决策 |
| 不做工具管理节（只留扩展点） | 共识 | 采信 |
| stt web 面板与 `/tools` 共用状态不得回归 | 共识 | 采信 |

### 2) 范围与边界

| 内容 | 分类 | 处置 |
|---|---|---|
| 新建 holder 插件（footer 触发 + 弹窗壳 + 分节座位声明） | 共识 | 采信（归属最终裁决见 Q1） |
| mrfw：Dialog 正文剥壳为分节组件，保留 Files tab 入口 + `/workspace-folders` | 共识 | 采信 |
| stt：复用 `WorkspaceDefaultsEditor`，保留 header 入口 + `/tools` | 共识 | 采信 |
| web-ux：`SessionManagerDialog` 五阶段机剥壳内联，保留删除弹窗（500）与行菜单 | 共识 | 采信 |
| mrfw fork 文档联动（AGENTS 十一条不变量 + 双语 README + docs:check 硬门） | 单边（B） | **核验成立**：B 线引 mrfw AGENTS.md 实证，纳入任务与风险 |
| 弹窗尺寸/滚动策略（三节内容高度差异大） | 单边（A） | **核验成立**：纳入 design 细化项 |
| i18n：节 label 由贡献方注册方本地化（各自 NS） | 单边（A）+ B R3 合并 | **核验成立**：与官方 settings.section 模式一致（见裁定 R3） |
| 兜底范围（holder 缺席降级行为） | 分歧 | 进 Q2 裁决 |

### 3) 方案与取舍

| 内容 | 分类 | 处置 |
|---|---|---|
| 入口归属：新建轻量插件（落 web-ux/mrfw/stt 失衡反例一致） | 共识 | 采信，Q1 确认 |
| 机制：children 子座位 + `slots.inject` 软注册；否决 registry service（stt/web-ux 踩过的服务时序坑） | 共识 | 采信，Q1/Q2 轮确认 |
| **座位形状**：A 推荐 nav(list)+panel(keyed) 两座位 vs B 推荐单 list 座位 + `RenderOpts.only` | **分歧** | **自行裁定（见二.1）**：单 list 座位 + only |
| Modal 嵌套红线：会话管理节不得再开第二层 Modal，五阶段机节内换卡片主体 | 共识（A 风险 3 / B 剥壳方案） | 采信 |
| `ManagerRequestStore`（seq/identity 打开桥）移交 holder 持有 | 单边（B） | **核验成立**：纳入 design |
| stt 编辑器形态二选一（`variant='section'|'dialog'`，统一弹窗更可能 dialog 形态） | 单边（B） | **核验成立**：留实施定稿（探针测试覆盖） |
| cordis badge 整行独占 + rail 36px 共存约束 | 单边（B） | **核验成立 + 审视降级**（见四） |
| React 单例安全（三插件 externals react/primitives，外壳 loader 单实例） | 单边（B，实证） | 采信 |

### 4) 任务拆分草案

两线批次结构同构（提案→骨架→壳→三插件迁移→回归验收→收尾）。合并差异：
- A 线「机制 PoC 批」前置（风险早炸）→ **纳入**（与 B 未知项探针合并为 PoC 批）；
- B 线四格安装组合时序矩阵（全装/只 holder/只贡献者/后装 holder）→ **纳入**验收矩阵；
- 分类：共识。

### 5) 验证思路

| 内容 | 分类 | 处置 |
|---|---|---|
| 递归 build/typecheck/test/lint + dsh:check + docs:check | 共识 | 采信 |
| bundle 断言（web-ux test/bundle.test.ts 先例） | 共识 | 采信 |
| 真机 GUI 双形态 + a11y 树走查 + 三节功能回归 + 降级反例 | 共识 | 采信 |
| cordis 在场/不在场两轮走查 | 单边（B） | **核验成立**，但经审视降级（badge 当前不在场，见四.2） |
| grep 断言（footer 注册移除、座位名入产物） | 共识 | 采信 |
| 冒烟记录归档 `plugins/<holder>/artifacts/` | 共识 | 采信 |

### 6) 风险与未知项

| 内容 | 分类 | 处置 |
|---|---|---|
| slots children 运行时未实证（仅 rc.5 类型面） | 共识 | 采信 → PoC 批前置 |
| `declarationEpoch` 语义陷阱（单调递增不区分折叠） | 单边（A） | 核验成立；随 Q2 裁决（硬移除）不再需要兜底探测，仅 PoC 批认知项 |
| `StoredEntry.label` 形态 / `only` 运行时语义 | 单边（B） | 核验成立 → PoC 探针钉住 |
| stt 未保存态切换丢弃（dirty check 或 keep-mounted） | 单边（B R6） | 核验成立 → design 细化（交互决策留实施） |
| 发布中间态组合（R7） | 单边（B） | 核验成立 → proposal 迁移说明 + Q2 裁决落档 |
| 折叠态打开默认节语义（order 最小者） | 单边（B R8） | 核验成立 → design 假设 |
| Menu portal（A13）在新壳内复验 | 共识（A 风险 3 部分/B R1） | 采信 → 验收批 |
| mrfw 版本枚举与 holder devDep 交叉 | 单边（A 风险 5） | 随 Q3 裁决（devDep）**升级为任务项**：mrfw 依赖面变更评估 + 文档同步 |

### 7) 假设清单

两线假设大面积重合（基线 rc.5、shell 布局不变、安装形态、React 单例、真机环境可用）。合并采信。
A 线假设「AGENTS.md 基线 rc.2 为文档滞后」经 `scripts/dsh-baseline.mjs` 双线独立实证一致（rc.5），采信。

## 二、自行裁定记录（第 2 步）

1. **座位形状**：读上游 `dsh-client-ui-settings/lib/types/client/contract/slots.d.ts`（宿主 rc.5 实装）——`settings.section` 为 `kind:'list' / scope:'root'`，注册 options 携带 `id`（drives `only` filtering）/`order`/`label`，owner 仅 `{ close }`，注释明示「Sections render inside the panel content column」。读本仓 web-ux 实装 `dsh-client-ui-slots@0.2.1-rc.5` 类型——`RenderOpts.only?: string`（list filtering）、`ChildrenDecl`（Declaring is claiming）、`PropsRenderSlots` 收窄 renderSlot 均在。**裁定：单 list 座位 + `only` 过滤（官方零发明同构）；A 线 nav+panel 两座位为被否方案**（理由：契约面翻倍无对应收益，官方先例在前）。
2. **R3 label 形态**：官方注释「registrant-localized label + locale 变化时重注册，ledger bump 充重渲染触发器」——照抄官方模式，实施探针确认 `StoredEntry` 读取面。
3. **版本疑点**：本仓根 node_modules 存在 `dsh-client-ui-slots@0.2.1-rc.2`（mrfw fork 上游依赖所拉），但 web-ux 子包实装 **rc.5** 与宿主 dsh@0.2.1-rc.5 一致——A 线类型实证有效，无版本漂移。
4. **A 待决 4（会话管理挂载深度）**：两线方案一致（五阶段机整体内联、节内换卡片主体；B 实证现状即同卡换主体）——降级共识，不问。
5. **A 待决 6（Files tab 入口去留）**：两线一致保留——降级共识，不问。

## 三、分歧复算决策（第 3 步）

唯一实质分歧 = 兜底策略（A 动态切换 vs B 硬移除）。**裁定不派复算线**，理由：
- B 线否决理由（「探测座位占用者不可靠」）针对的不是 A 线实际方案（A 探测的是分节座位声明状态，`subscribeDeclaration` 公开 API，类型面可行）——分歧的工程部分已由主会话查证澄清，非「无法查证的分歧」；
- 剩余部分为纯产品取舍（未装 holder 时 web-ux 会话管理可否 GUI 不可达），复算线无法替用户回答偏好 → 直接列为用户决策项（Q2），已获裁决。

## 四、探索审视（第 4 步，openspec-explore 姿态）

1. **宽栏共存成立性核验**：`dsh-client-ui-cordis` 产物 `.Nqubda_badge` = `width:calc(100% + 4px)` 且**无 `flex:none`**（可缩 flex item，区别于 mrfw 触发行的显式不可缩）——B 线「行内收缩份额共存」方案成立。**新增设计约束：统一入口禁 `flex:none`/整行独占**（否则重蹈 R5 把 cordis 挤出）；badge 被压缩后的视觉属真机走查项。
2. **cordis badge 常驻性**：`docker exec dsh dsh --profile web --dump-config` 全量检索——当前 profile **未装载 `dsh-client-ui-cordis`**（仅 cordis-plugin-timer / cordis-host-runner 等宿主侧内核）。**B 线 R2 从「最大单点风险」降级为条件预案**：验收时确认 badge 不在场即收口；若未来在场，按预案缩 rail 图标。B 线 Q6（折叠轨共存裁决）随之**事实降级**，无需用户裁决。
3. **嵌套红线边界**：web-ux 源码 `client/index.ts` L112 注释证实删除弹窗（order 500）与会话管理器（520）互斥不叠放；会话管理器内批量删除走 confirm 卡片、单会话删除入口在行菜单（弹窗外）。**裁定：节内动作不开新 Modal 的约束照搬 500/520 互斥模式**（统一弹窗 530 与删除弹窗 500 保持互斥），无隐藏嵌套路径。
4. **实施细节下沉 design**：nav 键盘导航 a11y 模式（参照官方 settings nav）、弹窗关闭重开的选中节记忆、折叠态打开默认节（order 最小）、stt dirty-check vs keep-mounted——均为实施决策，进 design 假设/要点，不问用户。

## 五、设计树与前沿分轮记录（第 5 步，grill-me）

### 第 1 轮（4 问，全部前沿）

| # | 问题 | 推荐（来源） | 用户答复 |
|---|---|---|---|
| Q1 | 入口归属 | 新建 workspace-config（两线共识） | ✅ 新建 workspace-config |
| Q2 | 兜底策略 | 硬移除 + 四包同装约定（B 线 + 主会话裁定：探测机制运行时未实证不作为方案前提） | ✅ 硬移除 + 四包同装约定 |
| Q3 | 类型共享 | declare module 镜像 + 探针（B 线） | ❓ 反问「workspace-config 不是公共包吗」→ 澄清后重问 |
| Q4 | 命名 | workspace-config 系列（两线共识） | ✅ workspace-config 系列 |

### Q3 澄清（第 2 轮，1 问）

澄清内容：官方 `settings.plugins.tab` 类型放公共层是「搭已有运行时依赖便车」（注册方本就依赖该包的 `ctx.configForms`）；本仓 workspace-config 为纯壳插件、无运行时 API 给贡献方，devDep 是纯类型目的依赖；同仓统一 tag 下「发布顺序锁」不成立（修正 B 线顾虑）；真实代价 = 构建顺序耦合 + mrfw fork 依赖面扩大 vs 镜像漂移靠探针守护。

| # | 问题 | 推荐 | 用户答复 |
|---|---|---|---|
| Q3' | 类型共享（澄清重问） | declare module 镜像 | ✅ **devDependency workspace-config**（用户裁决：类型安全直接优先，接受包间依赖与构建顺序耦合） |

### 收敛结束判定

第 7 步：前沿为空（Q1–Q4 全部落定，座位形状/机制/内联/Files tab/cordis 均有结论或事实裁定），无静默假设项。**收敛结束**。

## 六、最终决策清单（落档输入）

1. **入口归属**：新建轻量插件 `plugins/workspace-config`（包 `dsh-plugin-workspace-config`，client 为主双端结构，宿主半 no-op apply 锚点）。
2. **兜底策略**：三个旧 footer 入口**硬移除**；proposal 迁移说明写明「四包同装」推荐（统一 tag）；不做动态切换/共存探测/配置开关。
3. **类型共享**：三插件 devDependency 引 `dsh-plugin-workspace-config`（workspace 协议），holder 导出座位契约类型；mrfw 依赖面变更评估 + 文档同步列为任务项。
4. **命名**：目录 `workspace-config` / 包 `dsh-plugin-workspace-config` / 座位 `workspace-config.section` / 文案 zh「工作区配置」· en "Workspace settings"。
5. **座位形状**：单 list 座位（`kind:'list' / scope:'root'`，owner `{ close(): void }`）+ 注册 options（id/order/label）+ `renderSlot(key, { only: selectedId })`——官方 settings.section 同构。
6. **机制**：统一弹窗 entry 在 `shell.overlay` 注册时以 `children` 声明分节座位；三插件 `slots.inject` 软注册；未声明静默不出现；PoC 批前置实证运行时。
7. **会话管理节**：五阶段机整体内联（节内换卡片主体，不开新 Modal）；`ManagerRequestStore` 打开桥移交 holder。
8. **共存约束**：统一入口行内收缩份额（禁 `flex:none`）；与删除弹窗（500）保持互斥（530）。
9. **cordis 条件预案**：验收确认 badge 不在场即收口；若在场缩 rail 图标（28px）。
10. **保留项**：mrfw Files tab 入口 + `/workspace-folders`；stt header 入口 + `/tools`（共用状态零回归）；web-ux 行菜单删除 + 删除弹窗（500）。

## 七、执行期留痕（spec-apply，R<n> 契约见 spec-apply refs/execution.md）

- **R1 /tmp 证据落点改道**：dsh 容器内 /tmp 写入报 `Disk quota exceeded`（tmpfs 16G 已用 81%，容器级配额而非容量），执行期进度笔记/证据目录按手册落 /tmp 失败。改落 `/home/docker/.cache/spec-evidence/unify-workspace-config-entry/`（本会话工作区根之一、不入 git）。依据：2026-11-05 衔接点实测（`df -h /tmp` + write 失败原文）。适用范围：执行期全程证据落盘；连锁面：终末 spec-done 收尾的证据读取路径按本条（其六要素汇报以工件为准，证据仅过程佐证）。
- **R2 validate 基线 WARNING 噪声口径**：`openspec validate --all` 对基线既有主规格 `openspec/specs/dsh-session-tool-toggle/spec.md` requirements[5]（Web 配置界面）恒报非致命 WARNING「Requirement text is very long (>500 characters)」，不影响退出码（组 1 实测 13 passed / 0 failed）；本变更单独 `--strict` 零警告。适用范围：组 3/7/10 等含 validate 的验证句解读——该 WARNING 不计失败；连锁面：无（主规格不在本变更触达面，归档 sync 时不改其既有文本）。
- **R3 并发派发 id↔prompt 错位核对口径**：同消息并发派发两个子代理时，工具回报的子代理 id 与实际执行的 prompt 可能错位（组 2 实测：回报 2.1 的 id 交回了 2.2 回执，实际 2.1 在另一 id 手里）。适用范围：此后所有组的主会话核对——**一律以任务原文验证句 + 实际 `git diff` 判定，不采信子代理自报任务号**；连锁面：无（不改变派发方式，仅改核对依据）。
- **R4（scope 待决上浮，未决不阻塞）**：根 `AGENTS.md`「插件清单」仍为 6 包（「其余五个用 build.mjs」「五个软插件」「web 侧插件三包」等计数），第 7 包 workspace-config 入场后计数过旧；该文件不在 58 项触达面内，属规划外 scope。已上浮用户裁决（拟于组 8 link: 安装演练前定）：若裁决更新则由组 8 或组 10 顺带补一段 + 计数修正，并在沉淀回流清单登记；若裁决不动则留待下一批变更。**✅ 用户裁决（2026-11-05）：纳入本变更**——组 10 收口时顺带更新插件清单 6→7 包与计数句（「其余五个用 build.mjs」「五个软插件」「web 侧三包」等），并在沉淀回流清单登记去向。
- **R5（批次顺序待决，组 2 收尾上浮）**：tasks.md 组 3「首次构建与仓级门禁」的产物断言（`lib/client.js`、`lib/types/client/index.d.ts`）依赖组 5（5.1）装配出的 `src/client/index.ts`（#13）——骨架状态下两件必然不存在，组 2 子代理临时 harness 已实证（`tsc` 只能发 contract/locales 两个 d.ts，无 `index.d.ts`）。处置选项已代问用户：A（推荐）拆 3.1=依赖安装（先行，PoC 前置）/3.2=构建+manifest 断言+门禁三连（组 5 后回跑），执行顺序 1→2→3.1→4(PoC 风险门)→5→3.2→6…；B 保持 tasks.md 不动、按 A 时序执行但工件无时序注记（恢复协议「最小编号未完成组」会在恢复时误闯未就绪的构建断言）。**裁决后本条补记处置结果，tasks.md 以裁决为准修订。✅ 用户裁决（2026-11-05）：方案 A。** 落地映射：原 3.1 拆为 **3.1**（依赖安装，先行，PoC 前置）+ **5.2**（首次构建 + manifest 断言 + 门禁三连，移入组 5 于装配后执行）；执行顺序 1→2→3→4(PoC 风险门)→5(5.1 装配 + 5.2 回跑)→6…；两条验证句语义不变（3.1 改为可独立核对的 install 断言）。tasks.md 已按此修订。**衍生核对时点注记**：5.1 验证句含 `lib/client.js` 座位名 ≥2 断言，而 build 落在 5.2——5.1 收尾核对时**允许先跑一次 build** 产 `lib/` 以按原文完整核对（build 幂等，5.2 照原文重建 + bundle.test + 门禁三连，「首次」语义由 5.2 承担，两任务验证句原文零改动）。
- **R6 node 引擎告警既存口径**：volta 容器 node 为 v22.18.0，低于仓 engines 下限 `^22.19.0 || >=24.0.0`，`pnpm install` 逐项目打印 `[WARN] Unsupported engine`——**warn 非 error，不阻断、不计失败**（组 3 实测 install exit 0；`pnpm peers check` = No issues）。适用范围：5.2 / 组 7 / 组 10 的构建与门禁输出解读——该告警与 27 条 deprecated 传递依赖告警均为既存噪声；若未来变为 error 级阻断才上浮。连锁面：无（不在本变更触达面，不升 node 版本）。
- **R7 jsdom 直渲 root 的 session 适配器前置**：真 renderer 的 `root` 出口固定包 `ScopeProvider scope="session-maybe"`，jsdom 测试直渲 root 前必须安装 session 作用域适配器（空绑定即可；生产由 `dsh-client-ui-session` 提供）——组 4 PoC 首跑实测（`scope 'session-maybe' rendered without an installed adapter`，属环境缺件非断言失败）。适用范围：组 5 弹窗测试、组 6 三插件迁移测试等一切直渲 root 的套件；绕开方式 = 只渲染组件级（如 `WorkspaceConfigDialog`）或用假 ctx。权威细节：design.md「运行时实证」第 5 条；连锁面：上述测试若遇该报错按本条处置，不算实现缺陷。
- **R8 仓级测试既有 skip 口径**：`pnpm -r test` 中 multi-root-workspace 有 5 条**既有条件跳过**（parity-matrix 3 条：kernel-runner 本机不可用；compat 1 条：upgrade-lane 互斥分支；windows-multi-root 1 条：Windows-only）——属显式 `skipIf` 平台门控，非并发导致的静默跳过，与 execution.md 干净窗口立法本意（防验证任务被并发静默跳过而假成功）不冲突。适用范围：组 7 递归门禁与 10.1 `pnpm verify` 的输出解读——以「本批触达包 0 skip + 无新增 skipped」为准，这 5 条不计失败；连锁面：若后续批次的改动使这 5 条的跳过条件变化（如 kernel-runner 变可用），需重新核对而非沿用本条。
- **R9 D13 延伸至 mrfw（code-design ③3.6 局部修订）**：mrfw footer 座位删除后 `@deepseek-ai/dsh-client-ui-sidebar` 在本包实证零使用点（Files tab 座位 `sidebar.right.tab.files.actions` 实由 `dsh-client-ui-sidebar-files` 声明，mrfw 原自声明仅是旧 surface 防御性镜像），按 D13「清除 dead coupling」精神删除（devDeps + `dsh.client.inject` + 类型 import，6.1 实测 408 tests / typecheck / docs:check / compat:check 全绿）。依据：design.md D13 决策精神 + 实测；适用范围：mrfw 依赖面；连锁面：**code-design ③3.6「mrfw inject 不变」与 #29「其余不动」就此条修订**（其余断言不变）；回退点 3 处（package.json devDeps+inject、src/client/index.ts 一行 type import、tests/client-bundle.spec.ts inject 期望）；若上游 `dsh-client-ui-sidebar-files` 语义变化需重新评估（其不在本变更触达面）。
- **R10 Files tab 入口形态裁决**：mrfw Files tab 紧凑胶囊（`WorkspaceFoldersLauncher`）点击后**就地展开同一分节本体**——design Goals 仅要求「Files tab 入口保留」（功能可达性），未规定打开形态；「点击打开统一弹窗」需 holder 暴露跨包运行时打开桥，违反 D3（贡献方零 holder 运行时依赖、产物断言「不含 holder 包名」）与 D12 类型纪律。依据：design.md Goals/D3 + code-design #25/#33；适用范围：mrfw 客户端 UX；连锁面：组 9 真机走查按本口径验收（胶囊 → tab 内就地展开，非弹窗）；若用户终末呈证时改判「必须开统一弹窗」，需追加设计（跨包事件通道），属规划外 scope 回规划。
- **R11 四格矩阵跨包导入长期形态**：格 1「四包同 ctx」在 holder 套件（`test/dialog.test.tsx` 矩阵 describe）以**测试侧相对导入**三贡献方 `src/client` 实现——不进任何 `lib/` 产物、零 devDep、不反转 D3 依赖方向。已知副作用（特性非缺陷）：贡献方改 client 入口路径或新增 primitives 具名导入会先打红 holder 矩阵套件（哨兵面）。依据：tasks.md 7.1 + code-design G6 格 1 规格；适用范围：holder 测试套件维护者；连锁面：三贡献方迁移 client 入口/新增具名导入时须同步跑 holder 套件；若未来不接受此形态，替代方案（各包内模拟弱化矩阵 / 根级集成工程）属新决策需另议。
- **R12 收口口径两条**：① 根 `AGENTS.md`「DSH 基线」节的 `0.2.1-rc.2` 及软插件派生范围句为**既存文档漂移**（实际 rc.5，规划期已留档），不在本变更触达面（R4 仅裁决插件清单计数），未修订——待下次 `dsh:upgrade` 或发布批次处理（`scripts/dsh-baseline.mjs:13` 为唯一权威）。② `release.mjs` 脏工作区门禁（L88-89）无条件前置且先于 dsh:check 与版本写入——auto 模式收尾提交前 dry-run 必然 exit 1（零 git 变更有结构保证）；10.1 的 dry-run 断言以「零变更结构证明 + /tmp 干净副本 EXIT 0（8 目标 1.5.0→1.6.0，无写入无 tag）」双证满足，**提交后主会话复跑一次取 exit 0** 作为终验。连锁面：spec-done 归档链中如需 release 语义证据，按本条时序执行。
