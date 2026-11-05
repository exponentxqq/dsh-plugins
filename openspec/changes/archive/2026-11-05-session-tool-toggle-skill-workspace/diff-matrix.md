# 差异收敛矩阵（阶段 1.5）— session-tool-toggle-skill-workspace

> **输入**：`line-a.md`（A 线，248 行，需求与价值/范围/方案取舍）、`line-b.md`（B 线，445 行，实现/约束/反例/风险）；需求原文逐字见下。
> **本文件是阶段 2 落档输入之一**，落档时复制入 `openspec/changes/session-tool-toggle-skill-workspace/`，落档副本自此为权威。
> 需求原文：
> ```
> 还需要新增两个功能
> 1. skill的开关
> 2. 工作区的配置（现在只有用户级和会话级的配置），工作区的配置放到左侧工作区栏的...中的“删除工作区”上方
> ```

## 0. 阶段摘要（回执核对）

- **A 线**：产物 248 行，7 字段 + 待决问题（Q1–Q5）齐备；关键判断 = 两个需求是现有插件 README 明列「非目标」的两项定向反转、F1 走 agent 作用域影子 skill、F2 数据面可做但指定入口无座位。
- **B 线**：产物 445 行，7 字段 + 待决问题（Q1–Q9）+ 事实基线 F1–F21 齐备；关键判断 = F1 机制是「层优先级副作用」需回读校验、F2 数据面低风险但入口必须改上游、状态/契约/回滚代价量化。
- **独立性**：两线方向差异明显、结论非雷同，7 字段齐备 → 独立性成立。
- **引擎与路由留痕**：两线均为 **team 成员**（`spec-plan-session-tool-toggle-skill-workspace-line-a/-b`，fresh，未命中任何 team 不可行判据、无回退）；**team 成员锁定 Lead 模型（glm-5.3-flash），映射文件 `lineA`/`lineB` 路由不适用**——留痕告知，未静默丢弃显式 `--model`（本轮无显式覆盖）。
- 路由自检（手动复核）：映射路由 `deepseek-official/deepseek-flash`、`zai-coding-cn/glm-5.3`、`zai-coding-cn/glm-5.3-flash`、`opencode-go/deepseek-v4.1-flash` 均在 `profiles/web/cordis.patch.yml` 的 `allowedModels` 内（脚本自检的正则假定 flow-style，实际文件是多行式，脚本报空白名单属**误报**，已人工核对）。

---

## 1. 交叉比对（共识 / 分歧 / 单边遗漏）

### 1.1 共识（两线一致 → 直接采信）

| # | 共识 | 依据 |
|---|---|---|
| C1 | 两个需求 = 现有插件 v2 扩展（README 明列「不做 per-skill 粒度 / 不做工作区级默认档」的定向反转），同一 OpenSpec change，版本 1.4.0→1.5.0 | A §1、A §2；B F1 |
| C2 | 需求①机制 = 在 **agent 作用域**注册同名 runtime skill（`ctx.skills.register`），不做全局层注册、不改 SKILL.md、不替换 `dsh-tool-skill` 行 | A §3 F1-A；B §3.1.2-A、被否方案 |
| C3 | 需求①必须先做 spike 实证（层归属 / 目录替换消息 / `/` 菜单 / dispose 可逆 + 邻会话隔离），失败再转兜底方案 | A T1、§5；B U1/U2、R1 |
| C4 | `skill:<name>` 为新地址类别（kebab-case 文法）；裸 `skill` 仍归一 `tool:skill`；状态/默认档/工作区档共用同一字符串集合、**不升 state version** | A §3 F1、A 假设 4；B F2、§3.1.1、硬约束 5 |
| C5 | 工具掩码计划（`planMask`）不处理 skill 地址、不产生工具 deny；新增独立的「技能遮蔽计划」（B 命名 `planSkills` / `skills-plan.ts`） | A §3 F1「不参与 restrict」；B F3、§3.1.3 |
| C6 | 需求② = 工作区级默认档（第三层）；会话创建时与用户档合并拍快照、**不追溯**（最终口径，见第 5 节用户裁定） | A Q4-A；B Q3-A；用户第 2 轮改判 |
| C7 | 工作区档存中央 `$DSH_HOME/session-tool-toggle/workspaces.json`（`config` 可覆盖绝对路径），canonical path 为键，原子写 0600/0700、损坏降级 | A Q3-A、§3 F2；B Q4-A、Q5-A；用户拍板 A |
| C8 | 合并语义 = **并集**「用户档 ∪ 工作区档」，只表达关闭、不引入「反开」 | A Q2-A；B Q6-A；用户拍板 A |
| C9 | 每 agent 层新增**嵌套** `agent.ctx.inject(['skills'], …)`（与既有 tools/systemPrompt 注入分离）；skills 缺席时工具掩码不受影响 | A §3 F1；B F18、T4 |
| C10 | 软注入纪律：`inject` 名单保持 `['agents','tools']`，`skills`/`workspaceRegistry`/`workingDirectory` 走软注入；缺席降级 + 提示不静默 | A §2 边界；B F18、硬约束 2 |
| C11 | 契约 = 双端手写 strict parser 同步扩展（新端点/新字段/新失败码/提示码）；升级后必须重启 web profile | A §3 横切；B F17、R8 |
| C12 | 面板「技能」组 = 整档开关（`tool:skill`）+ 逐 skill 子条目；面板新增「工作区默认档」分区 | A T4-T6；B §3.1.4、§3.2.5 |
| C13 | 命令面新增 `/tools workspace …`；`/tools status` 增技能组与工作区档段 | A §3 F2；B §3.2.6、T7 |
| C14 | 工作区归属 = 会话 cwd 的 canonical realpath，`workspaceRegistry` 优先、缺 registry 退化；归属失败 fail-closed（只用用户档） | A 假设 11、§3 F2；B F12/F13、§3.2.2 |
| C15 | 需求②指定入口在本基线不可达（工作区行菜单硬编码 `[rename,delete]`、无座位；`sidebar.workspaces` 是 single） | A §2 边界；B F14/F15/F16；本轮主会话复核（第 2 节 A5） |
| C16 | 被否方案池一致：patch 上游 / 抢 single 座位 / 全局层 stub / 改 SKILL.md / 自建 provider 过滤 / guard-only 省不了目录 token / 新开 `/skills` 命令 | A §3「被否方案」；B §3.3 |
| C17 | 目录替换成本如实管理：一次真实翻转 ⇒ 一条全量替换目录 user 消息 + KV 前缀重建；批量一单一条消息；关闭 skill 的收益是「目录行 token」，不是省掉 `skill` 工具 schema | A §3 F1 成本、§5；B F9/F10、R3、A9 |
| C18 | 三层验证：单测 → 隔离实例 E2E → 浏览器证据（chrome-devtools）；发布前 `pnpm verify` / `dsh:check` | A §5；B §5 |
| C19 | 状态/默认档/工作区档对旧版 1.4.0 不保证回滚兼容（旧版丢弃 `skill:` 条目），README/发布说明写明（用户第 2 轮拍板） | A §2 数据边界；B Q8-A、R7；用户拍板 A |

### 1.2 分歧（两线都提出、结论不同 → 交第 2 步裁定）

| # | 分歧 | A 线 | B 线 | 裁定 |
|---|---|---|---|---|
| D1 | 面板技能清单的**读取口径** | 用**全局层** `ctx.skills.list({ cwd })`（不带 scope）当 catalog，与现有工具 catalog 的全局层口径一致 | 统一用**会话视图** `snapshot({ cwd, scope: agent })` + 识别 stub；不新增全局读路径 | **自行裁定 A1**：会话视图为主读（本会话真实可见性权威），全局读只作「已关技能真实描述/路径」兜底；两线各对一半，融合采纳 |
| D2 | 需求②入口的**替代落点**推荐 | 推荐 A：面板内分区 + `/tools workspace` 命令面，组件按可平移设计，等上游座位 | 推荐 A + 并行 C：上游座位软注册 + 本仓先落数据面与面板分区 | **用户裁定**（第 5 节 Q1/Q6 = B：再加 `sidebar.footer.action` 过渡入口；两线均未推荐 footer，属用户加码，已采纳） |

### 1.3 单边遗漏（只在一条线出现 → **逐项核验**，成立则纳入）

| # | 单边项 | 来源 | 核验结论 |
|---|---|---|---|
| S1 | `skill:*` 归一 `tool:skill`（避免 wildcard 歧义） | B | **成立**，纳入：`skill:` 后必须跟合法 kebab 名，`*` 视为整档别名（与裸 `skill` 同义），不新增 wildcard 语义 |
| S2 | 同层同名 runtime 先到先得 → 注册后必须回读校验，并给 `skill-shadow-failed` 提示码 | B F8 | **成立**（`dsh-skill/lib/index.js` 的 `register` 分支：已存在则 warn + no-op disposer），纳入 |
| S3 | 旧 change `session-tool-toggle` 已 Complete 未归档，影响新 change 的 spec delta 基准 | B R14/F21 | **成立**（第 2 节 A6），且用户已拍板「先归档」，纳入为落档前置步骤 |
| S4 | 契约新增失败码 `workspace-unresolved`/`workspace-unwritable` 与提示码 `skills-unavailable`/`skill-shadow-failed` | B §3.2.6 | **成立**，纳入（具体码表在 code-design / design 中定稿） |
| S5 | 无 `skills` 服务时技能开关只记意图（面板 notice + 日志） | A §3 F1 | **成立**，纳入（B 的 F18 同源但 A 明确了面板态） |
| S6 | spike 的 4 项可观察断言清单 | A §5 T1 | **成立**，纳入 T1（B 的 U1/U2 作为同一 spike 的补充断言） |
| S7 | 目录发布侧 `complete === false` 时官方不更新目录（关掉后这一步目录仍在） | B R5 | **成立**（`dsh-tool-skill` pre-step 分支），纳入降级说明 |
| S8 | 面板/契约可选 `ToolEntry.lockCode`（protected/reserved/shadowed/shadow-failed）给出行内不可关理由 | B §3.2.6 | **成立但可选**，纳入为 P2 增强（不阻塞一期） |
| S9 | 上游若未来提供正式「技能可见性 API」的迁移路径（端口封装 `SkillShadowSurface`） | B Q7/R18 | **成立**，纳入设计约束（机制收口在端口后） |
| S10 | 工作区档不写用户仓库、RPC 安全面收窄 | A Q3-A | **成立**，纳入（与 C7 一致） |

---

## 2. 自行裁定（可从代码/命令查证的分歧，主会话自证，**不转提问**）

| # | 待裁事项 | 查证动作与结果 | 裁定 |
|---|---|---|---|
| A1 | D1 的读取口径 | `docker exec dsh dsh --profile web --dump-config`：全局层有 `dsh-skill`(/215)、`skill-filesystem`(/217, `customSkillDirs=/home/docker/.agents/skills`)、`dsh-tool-skill`(/225)；**三个 agent preset 内各另挂** `skill-filesystem`(/722、/886、/1275) 与 `tool-skill`(/724、/888、/1282)；archify 另挂 provider(/1390)。`dsh-tool-skill/lib/index.js:935` 目录读 `snapshot({ cwd, scope: agent })`；`dsh-api-session-controller/lib/types/skill-catalog.js` 的 `skills/list` 用 live agent scope。 | 全局读拿到用户主集但**漏 preset 层 provider**；会话视图才是本会话真实可见集。**裁定：会话视图为主 + 全局/影子前缓存补描述**。A 线「单一全局口径」不成立 |
| A2 | U1：`ctx.skills.register` 从 agent 子 fiber 调用是否落 agent 层 | Cordis `Service` 的 tracker `{ associate: name, property: 'ctx' }`（`cordis/lib/index.js:1742-1790`）使服务方法按**调用方 ctx** 解析 `this.ctx`；`dsh-skill` `register` 用 `scopeOf(this.ctx)` 落层（`dsh-skill/lib/index.js:193-215`）；对照 `dsh-tools.restrict` 在无 scope 时**直接抛错**（`dsh-tools/lib/index.js:2991-2993`）证明同机制生效。既有插件也已用 `agent.ctx.inject([...])`（`plugins/session-tool-toggle/src/host/session-layer.ts:161-175`）。 | **U1 成立**（spike 仍实证目录效果，成本低） |
| A3 | U2：`presets.serviceFor(live,'skills')` 是否返回同一注册表 | `serviceFor` → `serviceForMount(this.owner, mount, name)`（`dsh-agent-preset-registry/lib/index.js:725-728`）返回 mount ctx 上解析的**同一服务代理**；`SessionSkillCatalog.list` 随后以 `scope = live ?? lease?.key` 读取（`dsh-api-session-controller/lib/types/skill-catalog.js` 的 list 实现段） | **同一注册表**、同一 scope 链 → stub 对 `/` 菜单同样生效 |
| A4 | **用户选择「只停模型目录、保留 `/name`」后的机制修正**（关键裁定） | 影子 stub 会替换同名的 content/description/path；`dsh-tool-skill/lib/index.js:905-911` 的 `/name` 注入走 registry `get` 取正文 → 若 stub 正文为空，用户手动调用会拿到空内容。`skills/list` 返回 `modelInvocable` 字段供客户端加「仅限用户」前缀（`dsh-api-session-controller` 的 `skills/list` result schema）。 | **stub 必须复制真实条目正文/描述/path/resourceBase，仅把 invocation 置 `{modelInvocable:false, userInvocable:true}`**；随 `skills/change`（或翻转时）刷新内容。这是「只停模型」语义的唯一公开 API 路径；预期管理：`/` 菜单会以「仅限用户调用」前缀展示被关技能 |
| A5 | 0.2.1-rc.5 / 最新 0.2.2-alpha.2 是否支持工作区行菜单扩展 | 本会话 `npm pack` 两版并解包实测：`lib/client.js` 的 `workspaceMenuItems` 仍硬编码 `[rename, delete]`（rc.5:1956-1964；alpha.2:2002-2010）；SlotMap 仅 `sidebar.workspaces`、`directoryFlow`、`session.menu.item`、`session.row.action`（alpha.2 另加 `sidebar.session.row.trailing`）；`npm view @deepseek-ai/dsh versions` 最新 = 0.2.2-alpha.2；`uiWorkspace` 服务只有 picker 能力、无菜单注册 API | **不支持**；「升级基线换座位」不可行。入口最终方案 = 用户第 2 轮选定 **B**（数据面+面板分区+上游座位软注册+footer 过渡入口） |
| A6 | 旧 change 归档与 spec delta 基准 | `openspec list --json`：change `session-tool-toggle` complete 25/25；`openspec/specs/` 下无 `dsh-session-tool-toggle`；`openspec validate --all` = 6 passed | 落档前置：`openspec archive session-tool-toggle`（用户拍板 A），归档后新 change 用 MODIFIED delta，基准 = `openspec/specs/dsh-session-tool-toggle/spec.md` |
| A7 | 追溯语义 | 用户第 1 轮选 B（立即作用于运行中会话），第 2 轮明示改为「只对新会话生效」 | **最终 = 不追溯**（播种期合并）；B 线 R1/R2/R3 追溯口径全部作废，不进 design |
| A8 | 整档 `tool:skill` 关闭与 per-skill stub 的叠加 | 整档关闭时 `skill` 工具 schema 被掩、目录停发（`dsh-tool-skill` pre-step 在工具不可见时给空目录），再注册 stub 无收益、只会白触发缓存失效 | **设计约束**：整档关闭时跳过 stub 注册，面板子项禁用；重新打开后按状态恢复 |
| A9 | 回滚兼容 | 旧版 `parseAddress` 不认识 `skill:` → 读记录时丢弃；工作区档文件旧版不读 | 用户拍板不保证回滚；README/发布说明写明「回滚会丢 `skill:` 条目与工作区档」 |

**分歧复算（第三条线）：无。** 理由：唯一实质分歧 D1 已由 A1 从环境查证裁定；入口落点分歧 D2 已由用户裁定；其余均为细化/共识，未消耗「最多 3 个复算点」额度。

---

## 3. 探索审视（`openspec-explore` 姿态：补双边盲区 + 降级待决）

> 审视对象 = 合并视图 + 未决清单；不重开双线调研、不推翻已收敛共识。

| # | 发现 | 性质 | 处置 |
|---|---|---|---|
| E1 | 「已关技能的真实描述/路径」在影子 stub 生效后会**从会话视图消失**，面板若不缓存就只能显示占位描述 | 双边盲区（A 用全局读掩盖、B 未点明后果） | 设计约束：面板维护「影子前技能快照缓存 + 全局兜底」，已关行仍显示真实 name/description/path（并入 A1/A4） |
| E2 | 入口若来自 **footer（root 作用域、无 sessionId）**，B 的 `workspace` 端点请求只收 `sessionId` 不够 | 双边盲区 | 设计：`workspace` 端点请求 = `{ sessionId }`（面板分区）或 `{ workspacePath }`（footer/未来工作区菜单座位）；host 用 `workspaceRegistry`/realpath 校验后读写同一 `workspaces.json`；两形态共用内核 |
| E3 | multi-root 附加根**不产生**独立工作区配置（归属按会话 cwd 所属主根，与 project-mcp 归属约定一致） | 双边盲区（两线都提归属复用，未说附加根） | 文档写明；归属实现复用 `project-mcp` 归属约定，附加根只影响 cwd 解析、不影响工作区键 |
| E4 | 原生 `disable-model-invocation` 的 user-only skill 本就 `modelInvocable:false`，对它「关闭模型可见性」无效果 | 双边盲区 | 面板把这类行标为「不可关/无模型可见性」，不渲染可关开关（避免无效操作） |
| E5 | 上游工作区行菜单座位名/属性未定（假设 `sidebar.workspaces.workspace.menu.item`，list/root） | 不可查证（上游未实现） | **降级为未决/后续**：软注册按假设名实现、座位缺席静默；上游定名后调整一行常量 |
| E6 | 旧 change 归档与新 change 基准 | 可查证 + 用户已拍板 | 降级为执行步骤（A6），并入落档前置 |
| E7 | 面板技能组「整档开关 + 逐项开关」的交互（整档关时子项禁用） | 两线各提一半 | 合并为设计约束（A8） |
| E8 | `skill` 影子注册若在 `skills/change` 上重复 reconcile 可能抖动 | 潜在实现风险（B F9/R12 邻近但未覆盖） | 设计约束：stub 集合 diff 守卫（幂等、无变化不重建），与既有工具掩码 diff 守卫同构 |

---

## 4. 设计树与前沿分轮记录（`grill-me`）

### 4.1 设计树（节点 = 决策，边 = 依赖）

```
N1 需求①粒度（per-skill / 整档 / 两者）
 └─> N2 skill 关闭范围（模型目录 / 是否保留 /name）
      └─> N3 影子 stub 内容策略（复制真实条目 / 空占位）——由 N2 决定（A4）
N4 需求②存储位置（中央 / 工作区根 / 两级）
 ├─> N5 合并语义（并集 / 覆盖 / 双列）
 ├─> N6 生效范围（不追溯 / 追溯 / 追溯+显式下发）
 │    └─> N7 追溯实现口径（策略层 / 批量推送）——N6=不追溯后作废
 └─> N8 入口落点（面板分区 / footer / 上游座位 / DOM）
      └─> N9 footer 入口形态（默认当前会话工作区 / 仅当前 / 先选后编辑）
N10 OpenSpec 基准（先归档 / 新 capability / 显式声明）
N11 回滚兼容（不保证 / 保证）
N12 变更名
N13 栈识别 writer skill（命中 / 三选一）
```

### 4.2 第 1 轮前沿（5 问）

| 编号 | 问题 | 答复 |
|---|---|---|
| Q1 | 工作区配置 UI 入口落点（给出 4 选项） | **未选**，反事实询问「0.2.1-rc.5 是否支持增加工作区行菜单」→ 主会话拉包查证后于第 2 轮重问 |
| Q2 | 需求①粒度 | **A 单个 skill 为主 + 保留整档** |
| Q3 | 工作区档存储位置 | **A 中央 `$DSH_HOME/session-tool-toggle/workspaces.json`** |
| Q4 | 用户级 ∪ 工作区级合并语义 | **A 并集（只能追加关闭）** |
| Q5 | 生效范围 | **B 立即作用于运行中会话（追溯）** → 第 2 轮改判 |

### 4.3 第 2 轮重算前沿（5 问）

前置事实：0.2.1-rc.5 / 0.2.2-alpha.2 均无工作区行菜单座位（A5），升级基线不可解。

| 编号 | 问题 | 答复 |
|---|---|---|
| Q6 | 入口落点（重问，附三版本实测事实） | **B 数据面 + 面板分区 + 上游座位软注册 + 侧栏底部 footer 过渡入口** |
| Q7 | 追溯实现口径（因 Q5=B 产生） | **用户改判：「算了，改成只对新会话生效」** → 最终不追溯（A7） |
| Q8 | skill 关闭范围 | **B 只停模型目录，保留 `/name` 手动调用** → 触发 A4 机制修正 |
| Q9 | OpenSpec 基准 | **A 先归档旧 change，再落新变更** |
| Q10 | 回滚兼容 | **A 不保证回滚到 1.4.0** |

### 4.4 第 3 轮重算前沿（3 问）

| 编号 | 问题 | 答复 |
|---|---|---|
| Q11 | 栈识别 writer skill 三选一（TS/React/Cordis 未命中 Spring/Nuxt） | **A 豁免本次 writer 加载并如实标注** |
| Q12 | footer 过渡入口形态 | **A 默认当前会话工作区 + 可下拉切换** |
| Q13 | 变更名 | **`session-tool-toggle-skill-workspace`** |

### 4.6 落档分歧点（阶段 2，设计线上浮 + 收尾补问）

> 阶段 1.7 代码设计线回执上浮 4 项（P1/P2），并入落档分歧点一次问清；答复同时回写 `code-design.md` §0.1。

| 编号 | 问题 | 答复 |
|---|---|---|
| DQ1 | 上游工作区行菜单座位真名/owner 形状未定，怎么处理？ | **C：本期不实现上游座位软注册**（等上游定名后由后续变更实现）→ 本变更的入口范围收窄为「面板分区 + 侧栏底部 footer 入口」 |
| DQ2 | 工作区档是否展示「哪些项来自用户档」的来源标注？ | **A：不标注**，面板一句文案说明并集；契约不加 `inherited` |
| DQ3 | 整档 `tool:skill` 关闭时逐技能行怎么显示？ | **A：保留状态 + 整块置灰 + 行内提示**；不改状态机 |
| DQ4 | `workspace` 端点 `{workspacePath}` 形态是否允许未登记目录？ | **A：仅限已登记工作区**（维持 D-11） |

### 4.5 收敛结束

- **前沿为空**：设计树每条分支均有答复或已裁定；剩余为设计级实现细节（进入阶段 1.7）与已登记假设/未决项（见第 5 节）。
- 用户未再要求追加问题；未答项**不得静默假设**——已全部落入第 5 节「未决/后续」或落档 design 的未决项。

---

## 5. 结论与未决/后续

### 5.1 已定结论（落档 design 必须遵守）

1. **需求①**：新增 `skill:<name>` 地址（kebab-case；`skill:*`→`tool:skill` 整档别名；裸 `skill` 别名保留）；语义 = **只让模型看不见/不可加载**，用户 `/name` 手动调用保留；实现 = agent 作用域同名 runtime stub，**复制真实条目内容/描述/path/resourceBase**，invocation 置 `{modelInvocable:false, userInvocable:true}`；stub 集合 diff 守卫、注册后回读校验、`skills/change` 刷新、整档关闭时跳过注册。
2. **需求②**：工作区级默认档 = `$DSH_HOME/session-tool-toggle/workspaces.json`（canonical path 键、原子写、降级纪律与 defaults 同构）；会话创建时 `snapshot = sortUnique(用户档 ∪ 工作区档)`、**不追溯**；`/tools reset` 回合并快照；命令面 `/tools workspace …`。
3. **UI 落点**：面板「工作区默认档」分区（按当前会话）+ 侧栏底部 footer 过渡入口（默认当前会话工作区、可下拉切换）。上游工作区行 `...` 菜单入口**不在本变更范围**（DQ1=C：当前及最新 DSH 版本均无该座位，等上游定名后由后续变更实现）。
4. **契约**：`workspace` 端点支持 `{sessionId}` 与 `{workspacePath}` 两种请求形态；面板快照新增 `workspace` 视图与技能清单；失败码/提示码按 S4 增补；strict parser 双端同步。
5. **流程**：落档前先 `openspec archive session-tool-toggle`；新变更名 `session-tool-toggle-skill-workspace`；不保证回滚（README/发布说明写明）。

### 5.2 未决/后续（写入落档 design 的「未决/后续」）

- 上游工作区行菜单座位名与属性未定：**本变更不实现**（DQ1=C）；上游定名后由后续变更补齐入口（届时复用同一 `workspace` 端点与对话框内核）。
- 上游「技能可见性 API」（S9）：机制收口在 `SkillShadowSurface` 端口后，上游提供正式 API 时可整体替换。
- 影子 stub 内容复制/刷新策略、`skills/change` 时序、`/` 菜单「仅限用户」前缀的用户可感知度：T1 spike 实证 + README 预期管理。
- 面板「已关技能」描述兜底缓存的具体实现（E1）：code-design 给出形状，实施期按单测钉行为。
- `ToolEntry.lockCode` 等 P2 增强（S8）：一期可不做。

### 5.3 触达仓

- **根仓** `dsh-plugins`：`plugins/session-tool-toggle/`（宿主半 + Web 半 + 测试）、根 `README.md`、`AGENTS.md`、`openspec/changes/session-tool-toggle-skill-workspace/`；上游 `@deepseek-ai/dsh*` 只读核实、零修改（ADR-0002）；用户 profile / dotfiles 不在本仓 diff 内。
- **播种并集可测性补充（设计线细化，不推翻收敛结论）**：并集逻辑以纯函数 `mergeSeed(user, workspace)` 落在 `src/host/workspaces.ts`，由 `index.ts` 的 `readOrSeed` 调用，单测直接钉住并集与排序。

---

## 执行期留痕（spec-apply 维护；R<n> 条目自包含：规则 + 依据 + 适用范围 + 连锁面）

### R1 插件发布版本口径 = 1.6.0（2026-11-04 补勘误同步）

- **规则**：本变更发布 1.6.0，不写 1.5.0。
- **依据**：落档时基座为 1.4.0，但 v1.5.0 已在勘误前发布（提交 `88f4980`、本地 tag `v1.5.0` 已存在）；`pnpm release` 拒绝已存在 tag，写 1.5.0 是硬失败陷阱。勘误提交 `2098d69` 已对齐 code-design，本条补齐 design/tasks 的 5 处漏改（design.md 组 9 行/风险表/Migration Plan、tasks.md 9.1/9.3）。
- **适用范围**：组 9 全部发布动作与文案。
- **连锁面**：tasks.md 9.3（`pnpm release` 目标版本与验证句）、design.md Migration Plan 第 2 条、9.1 README 的版本引用按「不含本功能的旧版（1.4.0/1.5.0 均如此）」表述；组 9 执行 9.3 的「profile 重装后重启」步骤前按 auto 硬停条件③（重启 dsh 进程会杀死本会话）先停下经用户确认。

### R2 spike/冒烟取证口径：隔离 + mock（2026-11-04，组 1 实证）

- **规则**：机制类验证（本变更的 spike 与冒烟）用「独立 `DSH_HOME` + 最小实验插件 + 进程内 mock LLM adapter」取证；临时脚本、fixture、实验插件、会话日志一律落 `/tmp`（执行期证据纪律：`git status` 不出现证据文件），`artifacts/` 只放结论工件（`spike-skill-shadow.md`、`smoke-record.md`、截图 PNG）。
- **依据**：组 1 实测可零真实凭据/零真实 token 取得全部 5 条断言的确定性证据；code-design G1「临时脚本放 artifacts/（gitignore）」原字面按本口径覆盖执行（仓库 `.gitignore` 不为此改动）。
- **适用范围**：组 1（已完成）、组 8.2 冒烟。
- **连锁面**：artifacts/spike-skill-shadow.md §0（装配记录）；组 8.2 优先复用同口径（浏览器截图除外——那需要真实 web 表层，届时独立端口 + 用后即清）。

### R3 上游 0.2.1-rc.5 实测事实（2026-11-04，组 1 实证）

- **规则**：① rc.5 的 `<skill_content>` 注入帧**不渲染 `provider` 属性**——「provider 等于真实值」的断言改用加载定义（`skills.get`）取证；② `agent/created` 事件 serial 且被 `agents.create` await——在该钩子里注册 stub 早于首步，是合法的实验与实现时序；③ headless 表层**不监听端口**（`dsh-headless/README.zh.md` 明示），独立端口验证需另起 web 表层；④ `snapshot.complete === false` 时目录停发（0 条 `skill-catalog`，对应 `dsh-tool-skill/lib/index.js:944` 短路）。
- **依据**：artifacts/spike-skill-shadow.md 断言 1/4 与额外观察。
- **适用范围**：组 3（session-layer 实现与测试）、组 6（rpc 回执「下一步收敛」提示）、组 8（冒烟断言口径）。
- **连锁面**：code-design G1 终形态小节；G3 断言「provider 一致」走 snapshot/加载定义而非注入帧文本；G6 `toggle` 回执的「下一步收敛」提示（H10）以 ④ 为前提；spec 场景「ADDED 技能级开关 · 用户手动调用保留」的验证映射表 provider 行改按加载定义断言。

### R4 组内并行期 typecheck 验收口径与连带同步追认（2026-11-04，组 2 实证）

- **规则**：组 2（类型面先行）与组 5/6/7（实现消费）之间的 typecheck 红为**规划内瞬态**。组收口口径 = 「全量 typecheck/vitest 的红，除归属后续组触达面的已知红外必须为零」。组 2 收口时已知红清单（2 条，全部归属后续组）：`test/wire-contract.test.ts:307`（NOTICE_CODES deep equal 3 码 → T11/组 5 修）、`test/locale-parity.test.ts:186`（`toHaveLength(3)` → T17/组 7 修）。typecheck 全绿点 = 组 6 完成（H6/H7/H10 消费端齐）。
- **依据**：H5 类型面先行冻结与 G5 串行闸是有序设计；组 2 期间任务 2.4 依派发提示「必要最小配套」条款对 6 个连带文件做机械最小同步（`contract.ts` NOTICE_CODES 两码、`ToolPanelAction.tsx` 穷尽 switch 两 case、`locales.ts` zh/en 两键、三个测试 FakeLayer 各两桩），全部在回执偏差中逐条声明，经主会话逐 diff 内容审查合格后**追认保留**（非静默越权）。`PanelInputs` 定形采用 `skills?: SkillLayerSnapshot` + `workspace?: WorkspacePanelInputs`，不加扁平 `skillsAvailable`（组 6 从 `SkillLayerSnapshot.available` 取）。
- **适用范围**：组 2 至组 6 收口前的全部 typecheck/vitest 验收；后续组涉及类型扩面时沿用本条款（连带同步 + 回执声明 + 主会话审查）。
- **连锁面**：组 5.1（wire-contract 码表穷举用例、REQUEST_PARSERS/白名单同步）、组 6（T8/T9/T10 将完整重写三个 FakeLayer 与桩）、组 7.7（locale-parity 5 码断言）；上述三处完成后本条已知红清零，R4 使命结束。
- **组 5 收口更新（2026-11-04）**：原 `wire-contract.test.ts:307` 已由 5.1 顺带清零（码表穷举改 5 提示码/11 失败码）。当前瞬态清单——typecheck 10 条：`rpc.ts:445/542/564`（→6.3）、`wire-contract.test.ts:1122` 双向交叉（→6.1）、client 夹具 6 条（→组 7）；全量 vitest 19 条：`rpc.test`×12（→6.3）、`panel-client`×3 与 `locale-parity`×2（→组 7）、`bundle`×2（→组 8 T18 + lib 重建）。全部有归属，组 6/7/8 完成后清零。
- **组 6 收口更新（2026-11-05）**：rpc 3 条 typecheck 与 `rpc.test`×12 已由 6.3 清零；wire-contract 交叉 1 条由 6.1 清零；余红收敛为 typecheck 6 条 + vitest 7 条（`panel-client`×3、`locale-parity`×2、`bundle`×2），全部归属组 7/8。R4 剩余使命 = 组 7/8 完成时清零。

### R7 组 6 收口裁决集（2026-11-05，主会话核对与修复留痕）

- **① hiddenSkills / schemaChanged 技能项的真实层时序（必修已修）**：内核 `toggleSession/resetSession` 的技能部分是 `setState` 后的**同步初值**（真实层 stub 注册异步，同步读会谎报 0——6.3 上浮、D-4 反例红线「回执不得撒谎」）。定稿 = **双段口径**：`ToggleReport/ResetReport` 增 `shadowedBefore`（收敛前基准，control.ts）；rpc 的 toggle/reset 分支在 `await settledSkills()` **之后**用新增 `settledShadowedOf(deps, session)` 现读层影子数，按 `settled − shadowedBefore` 重算 `hiddenSkills` 并补齐 `kvRebuild` 技能项（`mutationOfToggle/mutationOfReset` 加第三参，undefined 回退内核初值）；reset 分支同步补 `await settledSkills()`（6.4 在命令面已同款）。**语义红线**：未安装技能与无技能服务必须保持 `hiddenSkills=0`/`schemaChanged=false`（不谎报目录消息成本——control.test 与 commands.test 的两条语义用例是裁决依据；中途「意图口径」方案被这两条用例否决后回退）。
- **② workspace `set` = 整份覆盖**：与 `updateDefaults` 的 set 同义、两档同构；`off` 并入 / `on` 移除 / `reset` 清空条目保留键 / `read` 只读不写。tasks 6.2 原文「off|set = 并入」的 set 部分按笔误处理（6.3/6.4 用例已按覆盖钉住）。
- **③ `WorkspaceValue.changed` = 写后整份关闭集**（defaults 端点同构；read 为空数组）：added/removed 明细留在 `WorkspaceDefaultsReport`（宿主内部），不上 wire。契约注释「本次实际写入的规范形地址」按此口径解释。
- **④ 两条技能提示码（`skills-unavailable`/`skill-shadow-failed`）的组装落点 = rpc `snapshotOf`**（panel.ts `noticesOf` 注释指定的「装配层」即 rpc；rpc 是面板快照唯一生产路径）。panel 只做 `NOTICE_ORDER` 排序，不推导。
- **⑤ `TOOLS_GRAMMAR` 物理落点 = control.ts**（H7 文件；6.2 落盘时带出 workspace 子句，6.4 断言消费）——语义属命令面（H11）、物理属内核常量，后续同类「语义在 A 文件、常量在 B 文件」以物理落点为准、由 B 的任务带出。
- **连锁面**：组 7 的 client 夹具 `hiddenSkills` 必填（Mutation 契约不变）；组 8.2 冒烟第 1 条（技能翻转回执数字）与第 5 条（无 skills 组合 `skills-unavailable`）按 ①④ 口径验证；`ToggleReport/ResetReport.shadowedBefore` 为宿主内部字段，不上 wire。

### R8 组 9 执行期勘误与口径（2026-11-05，9.3 复核实证）

- **① tasks 9.3 验证句勘误（已改）**：`scripts/release.mjs` 强制显式版本号（`pnpm release --dry-run` 缺 positional 直接用法错误退出）；且 dry-run 在 build/lib 收集**之前** exit——**从不打印 lib 文件清单**，只打印版本同步清单。修正后口径：`pnpm release 1.6.0 --dry-run` 打印 `1.5.0 → 1.6.0`（须在实现提交后的干净工作区执行，脏工作区在打印版本前即被拒绝）；lib 清单核对改在发布提交后 `git show --stat`。
- **② live `stat 600` 断言移 9.3**：`~/.dsh/session-tool-toggle/workspaces.json` 由新宿主半运行时写入，live profile 虽为 link: 但运行中进程仍旧代码——重启（硬停③）重装后才可断言；8.2 已断言隔离 DSH_HOME 同值权限位（600/700）。
- **③ multi-root `lib/types/contract.d.ts` 的既有 M 归位**：根 `pnpm verify` 的 multi-root `build:types` 把一处历史遗留脏产物重建回 HEAD（该 M 消失）——本变更从未触碰 multi-root，属工作区更干净，无需恢复。
- **④ 无 skills 的 web 组合受上游 agent preset 硬依赖**（`waiting for skills`，8.2 观察）：9.1 README 按此补说明；该组合下命令面可用、面板快照降级（真实 RPC handler 取证 `notices:["skills-unavailable"]`）。
- **适用范围**：9.3 发布执行（主会话、用户审核后）与重启后 live 复跑。
- **连锁面**：tasks.md 9.3（已按 ① 改）；9.1 README（④ 已并入派发）；spec-done 六要素汇报的发布清单按 ① 的发布后核对口径。

### R9 重启后 live 断言（2026-11-05，9.3 前置取证；发布暂缓期间的 link: 形态）

- **重启确认**：dsh 进程 elapsed 3 分钟（2026-11-05 08:56 前后启动），工作区 61 项改动完好。
- **新实现加载硬证据（link: 形态，tag 未打时的等效验证）**：① `--dump-config-schema` 输出含本变更新增 `Config.workspacesFile` 字段描述（旧版无此字段）；② 运行日志装配文案「已装配：inject=[agents, tools]，默认档 …/defaults.json，**工作区档 …/workspaces.json**，保护名单 7 项，持久化 auto（待首个会话解析）」；③ RPC 通道日志「端点 panel / toggle / reset / defaults / **workspace**」（第 5 端点）；④ /tools 日志「本会话开关 + 默认档 + **工作区档**」；⑤ 重启后 2 个会话均已装执行期守卫。
- **workspaces.json 未创建 = 正常**：惰性落盘（首次写入工作区默认档时创建，R6 缺席 warn 语义），`600/700` 权限断言随 9.3 真实发布后复验。
- **dump CLI exit 1 定性**：web profile 下报 4 条 `unrecognized Loader tree carrier`；对照 headless profile（无这批 bundle）0 条；本变更对 `package.json` 的 `dsh.bundle.patch` 声明与 `cordis.patch.yml` **零改动**，web profile 另有 20+ 其他 bundle——定性为本变更无关的既有 dump 特征，schema 照常完整输出。
- **适用范围**：9.3 的「重启并复跑冒烟第 1 条」之机器可验部分已完成；UI 冒烟第 1 条与按 `#v1.6.0` 安装断言仍随真实发布执行。
- **连锁面**：tasks 附录「未提交待决」④⑤ 已完成；① 提交、② release、③ push 经用户裁决**暂缓**（2026-11-05 问询）。

### R10 归档与发布解耦（2026-11-05，用户裁决）

- **裁决**：呈证后用户选择「暂缓提交/发布」→ 09:22 复核后最终裁决「**归档提交，但不推送不发版，仅提交**」。本变更以未发布状态归档：仓库版本号维持 1.5.0（release.mjs 的版本同步/发布提交/tag 均未执行），发布操作清单移交 tasks 9.3 供后续独立执行。
- **连带裁决（面板口径，另立变更）**：用户同裁决「会话工具面不读全局层，只管理当前会话有效工具（与 `/inventory` 同口径：`scoped ∪ carried`）」——因当前变更随即归档，该修改**不可能并入**，成立后续新变更（推翻已归档变更 `2026-11-02-session-tool-toggle` 的 R15①/R18 全局层口径，留痕在新变更）。
- **三方对齐**：tasks 28/28 勾选（9.3 改写为「发布收口（暂缓发布，仅归档提交）」并如实记录未执行项）；工件（R1–R10、G1–G9、附录终态）随归档提交入库；git log = 一次 feat 提交、无 release 提交、无 tag、无 push。

### R5 新测试文件的 tsconfig 登记口径（2026-11-04，组 2 观察）

- **规则**：本变更新建的 `test/*.test.ts`（T2/T4/T6/T7/T12/T13 等）未登记进 `tsconfig.host.json` 的 include，`pnpm typecheck` 暂不覆盖它们；**统一处置 = 组 8.1 静态门禁前一次性登记**（逐个登记或 include 改 glob，随组 8 批次提交），此前各新建测试文件由执行任务自行 `tsc --noEmit` 定向校验（组 2 已这样做）。
- **依据**：2.2 回执观察；触达面清单（code-design ①）未列 tsconfig——规划遗漏的构建配套，属执行期补全而非规划外 scope 变更。
- **适用范围**：组 3–7 全部新建测试文件；组 8.1。
- **连锁面**：组 8.1 的 `verify:all`/`pnpm dsh:check` 前必须完成登记并复跑 typecheck；若某组验收强依赖测试文件类型检查，由该批次临时登记并在回执声明。

### R6 软注入缺席语义 = 降级而非 fail-closed（2026-11-04，组 4 实证裁决）

- **规则**：软注入服务（`workingDirectory`/`workspaceRegistry`/`skills`）缺席时**只降级归属/功能方式**——registry 缺席 → `registered:false` 的 canonical cwd 键照常参与并集；`workingDirectory` 缺席 → 回退 `header.cwd`；skills 缺席 → 技能分面 `available:false` 只记意图。`attribution === undefined`（只用户档播种）**仅限** cwd 缺失或 realpath 全程失败。派发提示与落档工件冲突时以工件为准（组 4.3 派发转述括号作废，实现按 design/spec）。
- **依据**：design.md C14（缺席降级 + 提示不静默）/D8/D11 与 spec「未登记目录以 canonical cwd 为键」条款；若缺席即 fail-closed，headless（无 workspaceRegistry）上工作区档整体失效、违背需求②。4.3 的 /tmp 4 场景冒烟实证（临时脚本已删，结论留此）。
- **适用范围**：组 6（`workspace` 端点与 `updateWorkspaceDefaults`）、组 7（面板工作区视图与 choices 空数组展示）、组 8 冒烟。
- **连锁面**：`workspace-unresolved` 失败码语义收窄为「cwd 无法归属/路径未登记」（组 6.3 测试）；`skills-unavailable` 提示码语义（组 7 SkillPanel 降级文案）；组 8.2 冒烟的「无 skills 组合降级」「坏文件降级」断言口径。缺席 warn 落点 = 首个会话播种时汇总一条（`ctx.inject` 回调微任务时序所致，`apply` 末尾无法区分未就绪与永远缺席）。
