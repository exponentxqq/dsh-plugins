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
