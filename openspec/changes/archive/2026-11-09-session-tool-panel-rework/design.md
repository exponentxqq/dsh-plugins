# Design

> 本文件的深度契约全文（触达面清单 / 证据锚 / 接口与数据形状 / 决策记录 / 逐任务组实现要点 / 假设与未决项）随变更目录附带：`code-design.md`（阶段 1.7 产物副本，落档后为权威）与 `decisions.md`（阶段 1.5 收敛留痕副本）。本文承载其断言摘要与栈识别结论；执行侧展开细节以 `code-design.md` 为准。

## Context

会话工具面（`plugins/session-tool-toggle` 的 `ToolPanelAction.tsx` Modal）现为六段平铺：状态摘要 / 工具清单 / 技能 / 工作区默认档（折叠壳）/ 用户级默认档（折叠壳）/ 关闭集 chip 段。统一「工作区配置」页面的「工作区默认档」分节（`WorkspaceDefaultsPage.tsx`）已形成三卡形态（概要卡 / 清单卡 / 命令卡 + 脚注 + 页脚动作区），共用清单组件 `DefaultsGroupList` 具备全局过滤（`query`）与行详情（`showDetails`）两个页面形态能力。收敛结论（`decisions.md`）：三卡整编 / 用户级 GUI 全移除仅留命令 / 技能并入清单卡 / 关闭集段拆并三处；落档分歧点拍板：workspace 端点 `{sessionId}` 寻址与 `choices` 字段本次一并删（P-1=b）、面板不设「关闭集为空」空态文案（P-2=a）。

## 栈识别结论

**writer skill = `dsh-plugin-writer`**（证据：pnpm workspace 的 DSH 插件仓——TypeScript + React + cordis 双端插件，入口 `src/index.ts` 导出 `name`/`inject`/`apply`，build-kit 构建、产物 `lib/` 随仓库提交；阶段 1.7 派发前主会话只读探测未命中 Spring/Nuxt 判据，由用户指认本仓专属 writer）。其「复用优先 / 分层方向 / 任务拆分粒度 / 构建与验证」规范已作为设计硬约束执行；任务拆分粒度同时满足该 skill 的拆分规定（见 `tasks.md` 分组）。

## Goals / Non-Goals

**Goals**

- 面板与页面两形态最大同构：同一卡片栈、同一分组清单组件、同一命令卡组件、同一失败文案映射落点。
- wire 契约随 GUI 消费方消失一次清干净（快照两字段、`defaults` 端点、workspace 端点 `{sessionId}` 寻址与 `choices`），不留「宿主还在维护但无人使用」的死面。
- 会话级面板的开关真值口径与命令面一致（整组关时组内行按实际不可用呈关且禁用——顺手修复旧面板「组关着但行显示开且可点」的既有缺陷）。

**Non-Goals**（见 `code-design.md` 1.6 零改动面，全文以彼为准）

- 不动 `/tools` 命令面、宿主状态内核、统一页分节（`variant='dialog'`）路径、座位与装配、失败码集合、其余六包与 workspace-config 插件。

## Decisions

断言摘要（完整版含被否方案与反例见 `code-design.md` ④，D-01…D-14）：

| # | 决策 | 关键理由 |
| --- | --- | --- |
| D-01 | 卡片结构与清单组件双重复用（`.cardStack` + 同一 `DefaultsGroupList`） | 两表面共用 DOM/类名/文案键；页面下次改清单面板自动获得 |
| D-02 | wire 瘦身：删快照 `defaults`/`workspace`、`defaults` 端点全家；**P-1=b** 追加删 workspace 端点 `{sessionId}` 寻址与 `choices`（`liveSessionOf` 保留共用、`choicesOf` 转私有登记查询）；失败码全保留 | 同 tag 安装免兼容垫片；用户拍板死面一次清干净；失败码删减收益为负 |
| D-03 | 会话槽 = 单个可选 `session?: SessionListState{pending, effectiveDisabled, shadowedSkills, intentOnly}` 对象 | 文案形态与数据槽同时存在才自洽；「不可能半套形态」成为类型事实；页面调用点零改动 |
| D-04 | 行开关 `checked` 走 `effectiveDisabled`（整组关 → 组内行呈关且禁用） | 会话面板真值是「现在能不能用」；与 `stats.denied`、`/tools status`、真实调用结果三处一致 |
| D-05 | 命令卡抽共用 `CommandCard` | 复制反馈状态机只有一份，防已修缺陷在第二份复活 |
| D-06 | 概要卡无徽章、无独立脚注块（`panel.description` 兼任脚注） | 会话面无「登记」事实可挂徽章；脚注句与 Modal description 重复 |
| D-07 | 刷新移概要卡头；「恢复创建时快照」进 Modal footer；`.workspacePage` 更名 `.cardStack` | 与页面同构；footer 固定底栏可达且不被长清单推走 |
| D-08 | 技能并入后保留 `skill.blocked` 组内提示行 | 整档关的后果（影子 stub 不注册）仅靠标签无法解释 |
| D-09 | 失败文案映射迁 `panel-failure.tsx` | `DefaultsEditor.tsx` 删除后的唯一落点；消除分节对面板容器的反向 import |
| D-10 | `PanelSnapshot.intentOnly` 保留并在清单行/组头消费 | 「已记录但命中 0 个注册名」与残留区不等价（carried 场景），Q4 信息零丢失 |
| D-11 | `defaults-corrupt` 提示码保留、面板不再产出 | 健康告警归启动 warn + `/tools default status`；删码改动面大收益为零 |
| D-12 | 分组词汇表内建 `group-shape.ts`（`wordingOf`/`copyBundleOf`） | 词汇表是形态的一部分，集中一处新增标签只改一个文件 |
| D-13 | 变更名 `2026-11-09-session-tool-panel-rework` | 与上游留痕一致；「域-主题」而非「方案」命名 |
| D-14 | delta 只用 MODIFIED、7 条 requirement 标题逐字沿用 | strict 校验按标题匹配；改名会被视作新增产生双写 |

**新纯函数**（`defaults-view.ts`）：`skillAddressOf(name)`（`skill:` 地址唯一拼接点）、`shadowedSkillAddressesOf(skills)`、`effectiveClosedOf(universe, disabled)`（整组关时组内行地址并入关闭读数）。

**执行环境**：直用主工作区（衔接点判据未命中隔离：工作区干净、main 检出、无并行变更 worktree；用户确认）。布局：本仓单检出 `/home/xuqinqin/develop/person/dsh-plugins` @ main，代码与工件提交均落 main；装配：node 栈经 pnpm 包装脚本（volta 容器），执行前核对依赖已装齐（缺失补 `pnpm install`）；环境错开：无（无端口/库错开需求）；装载指纹：省略（wire 瘦身为收缩性改动，无新增/改名导出符号，执行半程不含 profile link/重启环节）；创建于 2026-11-09。

## Risks / Trade-offs

- [wire 收缩为破坏性契约变化] → 仓库既定「统一版本、同 tag 安装、混装不受支持」+ 浏览器半由宿主启动图提供；新 client + 旧宿主因 parser 容忍未知键而安全，旧 client + 新宿主仅现于手工换产物（面板显 `bad-response`，可观测）。
- [`DefaultsGroupList` 吸收会话语义引入分支复杂度] → 分支全部收敛在 `session` 可选槽判定之后（缺省路径 DOM 与文案逐字不变），以 `defaults-group-list.test.tsx` 两形态契约套件钉住默认档形态零回归。
- [P-1=b 扩大测试改动面（`workspace-attribution`/`workspace-universe` 两套 900+ 行）] → 改动以**删除断言**为主（`{workspacePath}` 路径用例全保留）；`typecheck` 与 `wire-contract` 兜底。
- [三卡在 Modal 窄容器的布局适配] → 复用既有 `.card` 体系与 `.content` 滚动，不新增面板变体类；界面演示（`demos/session-panel-three-cards-l2.html`）已经用户确认。

## Migration Plan

单仓单包改动，随仓库统一版本与 tag 发布：实施完成 → `pnpm dsh:check` 绿灯 → 重建 `lib/*.js` 随仓库提交 → release 打 tag → profile 侧按 tag 安装并重启 web profile（浏览器半由宿主启动图提供，无迁移脚本需求）。回滚 = 回退到上一 tag 重新安装。

## Open Questions

无（阶段 1.5 四项决策与阶段 1.7 两项待决均已拍板；实施期自裁的 6 条非用户决策见 `code-design.md` ⑥ 6.2，不改变规格/方案/任务拆分）。
