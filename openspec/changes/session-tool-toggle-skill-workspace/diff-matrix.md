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
