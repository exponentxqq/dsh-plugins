/**
 * session-tool-toggle 浏览器半的双语文案（NS `sessionToolToggle`）。
 *
 * 与 `plugins/web-ux/src/client/locales.ts` 同构：扁平 `Record<string, string>`、键不带
 * 命名空间前缀、zh 为 canonical 形状，en 用 `satisfies Record<Key, string>` 钉住——少一个
 * 键或拼错一个键都是编译错误，`test/locale-parity.test.ts` 再兜一层运行时一致。
 *
 * 命名空间的注册由任务 10.5 的 `src/client/index.ts` 完成（`ctx.locale.register(NS, {zh, en})`），
 * 本模块只提供数据与 `Key` 类型；`declare module` 把 `Key` 并进 `LocaleNamespaceMap`，让
 * 座位声明 `locale: NS` 的组件的 `t()` 拿到键的联合类型（类型只认这里列出的键）。
 *
 * **文案边界（设计 R6 / 附录 §3.5 渲染规则）**：面板只渲染 `t()` 键；宿主返回的
 * `error.message` / `details` 只作二级灰字 detail，不进入本文件的文案。因此文案里**不写死**
 * 宿主侧细节（路径、错误原文、会话 id 等），只按设计 §3.5 表用 `{path}` / `{address}` /
 * `{names}` 这类占位符把结构化事实插进来；detail 由组件另行渲染。
 *
 * 模板参数用框架的 `{name}` 占位（`dsh-client-locale` 的插值实现即 `/\{(\w+)\}/g`）。
 *
 * 键的组织顺序 = 面板自上而下的阅读顺序（入口 → 骨架 → 四分区 → 分组/条目/徽标 → 操作 →
 * 关闭集 → 默认档 → 状态摘要 → 提示码 → 失败码），方便逐区核对。
 *
 * @module dsh-plugin-session-tool-toggle/client/locales
 */

// 类型专用 import：`declare module` 是**模块增强**（augmentation），目标模块必须先作为本文件
// 的依赖被解析一次，否则 tsc 报 TS2664「module cannot be found」（实测：同一份文件去掉这一行
// 即报错，node_modules 里的包本身是齐全的）。`import type {}` 在编译期被完全擦除，不进 bundle。
import type {} from '@deepseek-ai/dsh-client-ui-slots'

/** 本插件独占的 locale 命名空间。 */
export const NS = 'sessionToolToggle'

/** 中文文案（canonical 形状）。 */
export const zh = {
  // —— 会话头部工具区的入口按钮（设计 §3.1） ——
  'action.label': '工具面',
  'action.title': '会话工具面',
  'action.tooltip': '会话工具开关：本会话内的工具可分组或逐个关闭',
  'action.aria': '打开会话工具面面板',

  // —— 统一「工作区配置」弹窗的分节导航行（code-design ①1.4 #40 / ③3.5） ——
  //     分节的 label 是 holder nav 每次读取时求值的 thunk；本键是该行的唯一文案来源。
  'section.label': '工作区默认档',

  // —— 面板骨架（设计 §3.2：title + description + footer 的刷新/关闭） ——
  'panel.title': '会话工具面',
  'panel.description': '本会话内可用的工具与开关；改动只影响本会话之后的模型步骤。',
  'panel.close': '关闭',
  'panel.loading': '正在读取工具面…',
  'panel.empty': '本会话没有可展示的工具。',
  'panel.refresh': '刷新',

  // —— 分区的标题（设计 §3.2 的六段，自上而下；`section.skills` 由 7.7 挂载技能分区时用，
  //    工作区分区的标题归 `WorkspaceDefaultsEditor` 的 `workspace.title`） ——
  'section.state': '状态摘要',
  'section.groups': '本会话开关',
  'section.skills': '逐技能开关',
  'section.defaults': '用户级默认档',
  'section.disabled': '关闭集',

  // —— 分组（宿主只给 kind 与计数，中文由这里渲染，设计 §2.5） ——
  'group.mcp': 'MCP 服务器',
  'group.skill': '技能',
  'group.builtin': '内置工具',
  'group.toolCount': '{count} 个工具',
  'group.disabledCount': '已关 {count} 个',
  'group.summary': '{count} 个工具，已关 {disabled} 个',
  // 内置工具分区的本地过滤输入（纯展示层，不参与任何文法校验）。
  'group.filter': '按工具名过滤…',

  // —— 技能分区（逐 skill 行开关；`section.skills` 标题由 7.7 负责，这里只有块内文案） ——
  'skill.region': '技能开关',
  'skill.unavailable': '技能服务不可用，逐技能开关暂不可用。',
  'skill.blocked': '技能工具已整档关闭，逐项开关暂不生效。',
  'skill.pending': '正在应用…',
  'skill.switchLabel': '{name} 的模型可见性开关',
  'skill.empty': '本会话没有可展示的技能。',
  // 两个状态标签：`effective` = 已关且影子 stub 已生效；`intentOnly` = 意图已记但暂未生效
  // （技能未安装或影子注册未胜出）。`/name` 手动调用不受模型可见性开关影响（设计 D15 语义）。
  'skill.effective': '模型不可见（`/name` 仍可用）',
  'skill.intentOnly': '已记录，暂未生效',

  // —— 技能来源短标签（code-design ③3.5）：映射表在 WorkspaceDefaultsPage.tsx，未知 source 原样显示 ——
  'skill.source.project-dsh': '项目',
  'skill.source.project-agents': '项目(agents)',
  'skill.source.custom': '自定义',
  'skill.source.user-dsh': '用户',
  'skill.source.user-agents': '用户(agents)',
  'skill.source.bundled': '内置',
  'skill.source.runtime': '运行时',

  // —— 行级标记：组内条目上的短标签（设计 §3.3 的 `[保护]` / `[不可关闭]`） ——
  'entry.disabled': '已关闭',
  'entry.protected': '保护',
  'entry.reserved': '不可关闭',
  'entry.intentOnly': '暂无匹配',
  // 工作区页面的技能行标签（code-design ③3.5）：模型调用代价 / 手动调用方式 / 新会话初始态。
  'entry.skillTokens': '占对话 token',
  'entry.skillNoTokens': '不占对话 token',
  'entry.skillUserInvocable': '`/{name}` 可用',
  'entry.skillUserBlocked': '不可手动调用',
  'entry.skillHidden': '新会话默认隐藏',

  // —— 徽标与禁用理由：禁用开关的 `title` 必须给同一句解释（设计 §3.3） ——
  'badge.protected': '在保护名单内，不能关闭。',
  'badge.reserved': '保留工具，不能关闭。',
  'badge.intent': '意图',

  // —— 开关的可访问名（`Switch` 的 `label` 是必填 a11y 名称，设计 §3.3） ——
  'switch.label': '{name} 的会话开关',

  // —— 开关操作的进行中/失败态（失败的主文案按错误码取 `error.*`，这里只讲操作本身） ——
  'toggle.pending': '正在应用…',
  'toggle.failed': '开关未能切换，本次改动未生效。',

  // —— 关闭集区（已关闭地址的 chip 列表） ——
  'disabled.listTitle': '关闭集',
  'disabled.intentOnly': '这些地址当前没有匹配到工具：意图已记录，暂时不产生效果。',
  'disabled.empty': '当前没有关闭项。',
  // 关闭集 chip 上的「开启」与整区的「恢复创建时快照」（10.4 新增：设计 §3.2 第 4 段）。
  'disabled.enable': '开启',
  'disabled.enableAria': '开启 {address}',
  'disabled.reset': '恢复创建时快照',
  'disabled.resetConfirm': '再点一次确认恢复',

  // —— 用户级默认档（设计 §3.4；默认档不追溯已存在会话） ——
  'defaults.path': '默认档文件',
  'defaults.note': '只影响之后新建的会话。',
  'defaults.scope': '影响范围：只影响之后新建的会话，本会话不变。',
  'defaults.snapshot': '本会话创建于 {time}，快照 {count} 项。',
  // —— B 的分组开关界面（code-design ③3.20）：自由文本添加链已死（D8），这里只剩清单读数与
  //     分组开关点的文案；跨清单的新关一律走 `/tools default off <地址>` ——
  'defaults.counts': '清单 {listed} · 默认关 {inDefaults} · 残留 {residual}',
  'defaults.summary': '默认关 {inDefaults} · 残留 {residual}',
  'defaults.residualTitle': '残留地址（不在本会话清单里，只能移除）',
  'defaults.universeUnavailable': '本会话的工具清单暂不可用：只能查看与移除档内已有条目。',
  // 全局过滤无结果的空态（code-design ③3.5；工作区页面清单卡的 DefaultsGroupList 用）。
  'defaults.filterEmpty': '没有匹配「{query}」的条目。',
  // 分组标题行：条目数 / 档内计数 / 合成 title（读屏与悬浮共用 groupSummary）。
  'defaults.groupCount': '{count} 项',
  'defaults.groupInDefaults': '默认关 {count} 项',
  'defaults.groupSummary': '{count} 项，默认关 {inDefaults} 项',
  // 行开关与组开关的可访问名；整组在档时组内行不可切换，改标 `整组默认关`。
  'defaults.groupOff': '整组默认关',
  'defaults.switchLabel': '{name} 的默认档开关',
  'defaults.groupSwitchLabel': '{name} 的整组默认档开关',
  // D8 兜底说明：本页只列本会话可见的工具，跨清单的新关走命令。
  'defaults.cliHint': '本页只列本会话可见的工具；跨清单的新关用命令 `/tools default off <地址>`。',
  'defaults.remove': '移除',
  'defaults.saved': '已保存（本会话不变）。',
  'defaults.clear': '清空默认档',
  'defaults.clearConfirm': '再点一次确认清空',

  // —— 工作区默认档（设计 §3.4 / C2；面板分区与页面分节共用同一组键） ——
  'workspace.title': '工作区默认档',
  // 页面级选择框没有给出有效目标（未分配 / 工作区服务未就绪）时的空态：本节不发任何寻址
  // 请求，也不渲染编辑器（选择动作归 holder 页面的唯一选择框，节内不再自带下拉）。
  'workspace.noTarget': '请先在上方选择一个工作区',
  'workspace.key': '工作区键',
  'workspace.path': '工作区档文件',
  'workspace.registered': '已登记工作区',
  'workspace.unregistered': '未登记工作区',
  'workspace.unresolved': '当前会话的工作区无法归属：只按用户级默认档播种。',
  'workspace.corrupt': '工作区档文件损坏或半写，已按空档处理。',
  'workspace.scope': '影响范围：只影响在这个工作区之后新建的会话，本会话不变。',
  'workspace.union': '新会话初始关闭 = 用户级默认档 ∪ 本工作区默认档',
  // B 的分组开关界面：分组/计数/开关点文案与用户级共用 `defaults.*` 一组键，本区只补命令兜底
  // 说明（D8 + U1：命令只作用本会话所属工作区）。
  'workspace.cliHint': '本页只列本会话可见的工具；跨清单的新关用命令 `/tools workspace off <地址>`（只作用本会话所属工作区）。',
  'workspace.remove': '移除',
  'workspace.removeAria': '移除 {address}',
  'workspace.saved': '已保存（本会话不变）。',
  'workspace.clear': '清空工作区默认档',
  'workspace.clearConfirm': '再点一次确认清空',
  'workspace.refresh': '刷新工作区档',
  // —— 工作区页面（WorkspaceDefaultsPage，code-design ③3.5）：清单卡 ——
  'workspace.listTitle': '默认关闭项',
  'workspace.listHint': '开关只写本工作区默认档：关闭 = 之后在此工作区新建的会话初始不可用。',
  'workspace.filter': '过滤工具、技能或地址…',
  'workspace.emptyDefaults': '本工作区还没有默认关闭项。',
  'workspace.emptyDefaultsHint': '在下方清单里关闭任意条目即写入；只影响之后在此工作区新建的会话。',
  'workspace.emptyUniverse': '宿主没有提供可列出的工具清单，暂时只能查看与移除档内已有条目。',
  'workspace.universeUnavailable': '宿主全局工具注册表暂不可用：只能查看与移除档内已有条目。',
  'workspace.ungrouped': '另有 {count} 个 MCP 工具名无法归组（公开名归一化/截断后无法还原服务器名），本页不提供开关。',
  'workspace.skillsIncomplete': '技能目录观测不完整，清单可能缺项。',
  'workspace.foreignProjectMcp': '另有 {count} 个其他工作区的项目级 MCP 服务器未列入（仅其所属工作区可见）。',
  'mcp.sourceUser': '用户级',
  'mcp.sourceUserHint': 'profile 级配置：所有工作区的会话都可见。',
  'mcp.sourceProject': '项目级',
  'mcp.sourceProjectHint': '本工作区 .dsh/mcp/ 的项目级配置：仅本工作区的会话可见。',
  'mcp.tokens': '计入对话上下文',
  'mcp.tokensHint': '每个可见工具的参数 schema 与服务器指令会计入每次对话请求。',
  'workspace.globalUnion': '工具清单来自宿主进程的全局注册表（所有已加载工作区的并集）：可能列出本工作区看不到的 MCP 工具；写入只保留意图，新会话不存在该工具时不生效。技能清单按本工作区目录读取。',
  // —— 命令卡：跨清单地址的复制兜底（同 ③3.5） ——
  'workspace.commandTitle': '跨清单地址',
  'workspace.commandNote': '该命令只写「本会话所属工作区」的档；要给其他工作区补条目，请直接编辑上面的工作区档文件。',
  'workspace.commandComment': '目标工作区：{key}',
  'workspace.copyCommand': '复制命令',
  'workspace.copied': '已复制',
  'workspace.copyFailed': '复制失败，请手动选择文本。',
  // 侧栏 footer 入口与自绘对话框（7.3）：标题/范围说明复用上面的 workspace.title / workspace.scope，
  // 这里只补两处只属于「入口壳」的状态文案。
  'workspace.loading': '正在读取工作区默认档…',
  'workspace.unavailable': '暂时无法读取工作区默认档。',

  // —— 状态摘要（两计数 + 创建时快照 + 持久化通道，设计 §3.2 第一段） ——
  'state.visible': '本会话可见 {visible}',
  'state.denied': '已关 {denied}',
  'state.storeKind.record': '持久化：会话记录',
  'state.storeKind.memory': '持久化：内存（重启后丢失）',
  'state.snapshot': '创建时快照 {count} 项',
  'state.createdAt': '会话创建于 {time}',

  // —— 变更回执的代价形状（设计 §3.6：只报计数与代价形状，D7） ——
  'mutation.kv': '本次关闭 {hidden} 个工具；前缀缓存将从第一个变化的 schema token 起重建一次。',

  // —— 提示码（`NOTICE_CODES` 五个，宿主只给码） ——
  'notice.persistence-degraded': '记录通道不可用，关闭集已降级为内存态：进程重启后丢失。',
  'notice.defaults-corrupt': '默认档文件损坏或半写，已按空档处理。',
  'notice.session-subagent': '子代理会话不继承父会话的会话级开关，只按默认档快照。',
  'notice.skills-unavailable': '技能服务不可用：技能开关只记意图，影子 stub 不生效。',
  'notice.skill-shadow-failed': '技能影子注册未胜出（同层先到先得）：该技能行的开关不可用。',

  // —— 失败码 → 文案键（设计附录 §3.5 表逐条；未知码回退 error.fallback） ——
  'error.bad-request': '请求不合法，宿主拒绝了本次调用。',
  'error.bad-address': '地址不合法：{address}。语法见 `/tools` 帮助（`mcp:<server>`、`mcp:<server>::<工具>`、`tool:<名字>`、`skill`）。',
  'error.protected': '{names} 在保护名单内，不能关闭。',
  'error.reserved': '{names} 是保留工具，不能关闭。',
  'error.session-not-live': '该会话未在宿主中运行（可能已归档或已结束），无法调整工具面。',
  'error.defaults-unwritable': '默认档写入失败：{path}。',
  'error.workspace-unresolved': '工作区无法归属：{subject}。',
  'error.workspace-unwritable': '工作区默认档写入失败：{path}。',
  'error.internal': '宿主内部错误，本次操作未完成。',
  'error.unavailable': '无法连接到 dsh 主进程。',
  'error.bad-response': '宿主返回了无法识别的响应。',
  'error.fallback': '操作失败。',
} satisfies Record<string, string>

/** canonical 键集合。 */
export type Key = keyof typeof zh

/** 英文文案，钉在中文键集合上。 */
export const en = {
  // —— 入口按钮 ——
  'action.label': 'Tools',
  'action.title': 'Session tool surface',
  'action.tooltip': 'Session tool switches: turn groups or single tools off for this session',
  'action.aria': 'Open the session tool surface panel',

  // —— Section row of the unified workspace-settings dialog (nav label thunk) ——
  'section.label': 'Workspace defaults',

  // —— 面板骨架 ——
  'panel.title': 'Session tool surface',
  'panel.description':
    'Tools available in this session and their switches; changes only affect this session from the next model step on.',
  'panel.close': 'Close',
  'panel.loading': 'Reading the tool surface…',
  'panel.empty': 'No tool to show in this session.',
  'panel.refresh': 'Refresh',

  // —— 分区标题（六段） ——
  'section.state': 'Status summary',
  'section.groups': 'Session switches',
  'section.skills': 'Per-skill switches',
  'section.defaults': 'User defaults',
  'section.disabled': 'Off set',

  // —— 分组 ——
  'group.mcp': 'MCP servers',
  'group.skill': 'Skills',
  'group.builtin': 'Built-in tools',
  'group.toolCount': '{count} tools',
  'group.disabledCount': '{count} off',
  'group.summary': '{count} tools, {disabled} off',
  // The built-in section's local filter input (display only, never grammar validation).
  'group.filter': 'Filter by tool name…',

  // —— 技能分区（逐 skill 行开关） ——
  'skill.region': 'Skill switches',
  'skill.unavailable': 'The skill service is unavailable; per-skill switches cannot be used.',
  'skill.blocked': 'The skill tool is turned off as a whole; per-skill switches have no effect until it is turned back on.',
  'skill.pending': 'Applying…',
  'skill.switchLabel': 'Model visibility switch for {name}',
  'skill.empty': 'No skills to show in this session.',
  // Two state tags: `effective` = turned off and the shadow stub is in effect; `intentOnly` =
  // the intent is recorded but not effective yet (skill missing or shadow registration lost).
  'skill.effective': 'Hidden from the model (`/name` still works)',
  'skill.intentOnly': 'Recorded; no effect yet',

  // Skill source short tags (code-design ③3.5); the mapping table lives in
  // WorkspaceDefaultsPage.tsx and unknown sources render as-is.
  'skill.source.project-dsh': 'Project',
  'skill.source.project-agents': 'Project (agents)',
  'skill.source.custom': 'Custom',
  'skill.source.user-dsh': 'User',
  'skill.source.user-agents': 'User (agents)',
  'skill.source.bundled': 'Bundled',
  'skill.source.runtime': 'Runtime',

  // —— 行级标记 ——
  'entry.disabled': 'Off',
  'entry.protected': 'Protected',
  'entry.reserved': 'Locked',
  'entry.intentOnly': 'No match yet',
  // Skill row tags of the workspace page (code-design ③3.5): model invocation cost / manual
  // invocation / initial state in new sessions.
  'entry.skillTokens': 'Uses dialog tokens',
  'entry.skillNoTokens': 'No dialog tokens',
  'entry.skillUserInvocable': '`/{name}` available',
  'entry.skillUserBlocked': 'No manual invocation',
  'entry.skillHidden': 'Off in new sessions',

  // —— 徽标与禁用理由 ——
  'badge.protected': 'On the protected list; cannot be turned off.',
  'badge.reserved': 'A reserved tool; cannot be turned off.',
  'badge.intent': 'Intent',

  // —— 开关的可访问名 ——
  'switch.label': 'Session switch for {name}',

  // —— 开关操作 ——
  'toggle.pending': 'Applying…',
  'toggle.failed': 'The switch was not applied; nothing changed.',

  // —— 关闭集区 ——
  'disabled.listTitle': 'Off set',
  'disabled.intentOnly': 'These addresses match no tool right now: the intent is recorded but has no effect yet.',
  'disabled.empty': 'Nothing is turned off.',
  // The off-set chip's enable action and the section's restore-to-creation-snapshot action (10.4).
  'disabled.enable': 'Turn on',
  'disabled.enableAria': 'Turn on {address}',
  'disabled.reset': 'Restore the creation snapshot',
  'disabled.resetConfirm': 'Click again to restore',

  // —— 用户级默认档 ——
  'defaults.path': 'Defaults file',
  'defaults.note': 'Only affects sessions created afterwards.',
  'defaults.scope': 'Scope: only sessions created afterwards; this session stays as it is.',
  'defaults.snapshot': 'This session was created at {time}, with a snapshot of {count} entries.',
  // —— B's group-switch UI (code-design ③3.20): the free-text add chain is gone (D8), so only the
  //     list readings and the group-switch labels live here; new entries go through the CLI ——
  'defaults.counts': '{listed} listed · {inDefaults} off by default · {residual} residual',
  'defaults.summary': '{inDefaults} off by default · {residual} residual',
  'defaults.residualTitle': 'Residual addresses (not in this session\'s list; removal only)',
  'defaults.universeUnavailable':
    'This session\'s tool list is unavailable right now: you can only view and remove entries already in the tier.',
  // Empty state when the global filter matches nothing (code-design ③3.5; used by the
  // DefaultsGroupList of the workspace page's list card).
  'defaults.filterEmpty': 'No entry matches “{query}”.',
  // Group header row: entry count / in-tier count / combined title (screen readers and hover).
  'defaults.groupCount': '{count} items',
  'defaults.groupInDefaults': '{count} off by default',
  'defaults.groupSummary': '{count} items, {inDefaults} off by default',
  // Accessible names for the row and group switches; a group in the tier disables its rows and
  // labels them `whole group off by default`.
  'defaults.groupOff': 'Whole group off by default',
  'defaults.switchLabel': 'Defaults switch for {name}',
  'defaults.groupSwitchLabel': 'Whole-group defaults switch for {name}',
  // The D8 fallback line: this page lists only tools visible in this session, so new entries go
  // through the command.
  'defaults.cliHint':
    'This page lists only tools visible in this session; to turn off a new one across lists use the `/tools default off <address>` command.',
  'defaults.remove': 'Remove',
  'defaults.saved': 'Saved (this session is unchanged).',
  'defaults.clear': 'Clear defaults',
  'defaults.clearConfirm': 'Click again to clear',

  // —— 工作区默认档 ——
  'workspace.title': 'Workspace defaults',
  // Empty state when the page-level picker gives no valid target (unassigned / service not ready):
  // the section sends no addressing request and no longer renders a picker of its own.
  'workspace.noTarget': 'Choose a workspace above first',
  'workspace.key': 'Workspace key',
  'workspace.path': 'Workspace file',
  'workspace.registered': 'Registered workspace',
  'workspace.unregistered': 'Unregistered workspace',
  'workspace.unresolved': 'This session\'s workspace cannot be attributed, so only the user defaults are seeded.',
  'workspace.corrupt': 'The workspace file is corrupt or half-written; it was treated as empty.',
  'workspace.scope': 'Scope: only sessions created in this workspace afterwards; this session stays as it is.',
  'workspace.union': 'A new session starts off with the user defaults ∪ this workspace\'s defaults',
  // B's group-switch UI reuses the `defaults.*` group/count/switch labels; only this CLI hint is
  // workspace-specific (D8 + U1: the command applies to this session's workspace only).
  'workspace.cliHint':
    'This page lists only tools visible in this session; to turn off a new one across lists use the `/tools workspace off <address>` command (applies to the workspace of this session only).',
  'workspace.remove': 'Remove',
  'workspace.removeAria': 'Remove {address}',
  'workspace.saved': 'Saved (this session is unchanged).',
  'workspace.clear': 'Clear workspace defaults',
  'workspace.clearConfirm': 'Click again to clear',
  'workspace.refresh': 'Refresh workspace defaults',
  // —— Workspace page (WorkspaceDefaultsPage, code-design ③3.5): list card ——
  'workspace.listTitle': 'Off-by-default entries',
  'workspace.listHint':
    'Switches write this workspace\'s defaults: off means sessions created here later start with the tool unavailable.',
  'workspace.filter': 'Filter tools, skills, or addresses…',
  'workspace.emptyDefaults': 'No off-by-default entries in this workspace yet.',
  'workspace.emptyDefaultsHint':
    'Turn any entry off below to write it to this workspace\'s defaults; only sessions created here afterwards are affected.',
  'workspace.emptyUniverse':
    'The host exposes no tool catalog right now, so only existing entries can be viewed or removed.',
  'workspace.universeUnavailable':
    'The host\'s global tool registry is unavailable: only existing entries can be viewed or removed.',
  'workspace.ungrouped':
    '{count} more MCP tool names cannot be grouped (their public names lost the server boundary after normalization/truncation); they are not switchable here.',
  'workspace.skillsIncomplete': 'The skill catalog observation is incomplete; the list may miss entries.',
  'workspace.foreignProjectMcp':
    '{count} more project-level MCP server(s) from other workspaces are not listed (visible only to their own workspace).',
  'mcp.sourceUser': 'User-level',
  'mcp.sourceUserHint': 'Profile-level configuration: visible to every workspace\'s sessions.',
  'mcp.sourceProject': 'Project-level',
  'mcp.sourceProjectHint': 'Project-level configuration in this workspace\'s .dsh/mcp/: visible only to this workspace\'s sessions.',
  'mcp.tokens': 'Counts into context',
  'mcp.tokensHint': 'Each visible tool\'s parameter schema and the server instructions count into every dialog request.',
  'workspace.globalUnion':
    'The tool list comes from the host process\'s global registry (the union of all loaded workspaces): it may include MCP tools this workspace cannot see; a write only records intent and has no effect where the tool does not exist. The skill list is read for this workspace\'s directory.',
  // —— Command card: the copy fallback for addresses outside the list (same ③3.5) ——
  'workspace.commandTitle': 'Addresses outside the list',
  'workspace.commandNote':
    'The command writes only the workspace this session belongs to; to add entries for another workspace, edit the defaults file shown above.',
  'workspace.commandComment': 'Target workspace: {key}',
  'workspace.copyCommand': 'Copy command',
  'workspace.copied': 'Copied',
  'workspace.copyFailed': 'Copy failed; select the text manually.',
  // The sidebar footer entry and its own dialog (7.3): the title/scope reuse workspace.title /
  // workspace.scope above; only these two state lines belong to the entry shell.
  'workspace.loading': 'Reading the workspace defaults…',
  'workspace.unavailable': 'The workspace defaults are not available right now.',

  // —— 状态摘要（两计数 + 创建时快照 + 持久化通道） ——
  'state.visible': '{visible} visible here',
  'state.denied': '{denied} off',
  'state.storeKind.record': 'Persistence: session record',
  'state.storeKind.memory': 'Persistence: memory (lost on restart)',
  'state.snapshot': 'Snapshot at creation: {count} entries',
  'state.createdAt': 'Session created at {time}',

  // —— 变更回执 ——
  'mutation.kv': 'Turned off {hidden} tools; the prefix cache will be rebuilt once from the first changed schema token.',

  // —— 提示码 ——
  'notice.persistence-degraded':
    'The record channel is unavailable, so the off set fell back to memory and is lost when the process restarts.',
  'notice.defaults-corrupt': 'The defaults file is corrupt or half-written; it was treated as empty.',
  'notice.session-subagent':
    'A subagent session does not inherit its parent session switches; it only snapshots the user defaults.',
  'notice.skills-unavailable':
    'The skill service is unavailable, so skill switches only record intent and no shadow stub takes effect.',
  'notice.skill-shadow-failed':
    'The skill shadow registration lost the first-come-first-served race inside this layer; that skill row cannot be toggled.',

  // —— 失败码 ——
  'error.bad-request': 'The host rejected the request as malformed.',
  'error.bad-address':
    'Invalid address: {address}. The grammar is in the `/tools` help (`mcp:<server>`, `mcp:<server>::<tool>`, `tool:<name>`, `skill`).',
  'error.protected': '{names} is on the protected list and cannot be turned off.',
  'error.reserved': '{names} is a reserved tool and cannot be turned off.',
  'error.session-not-live':
    'That session is not running in the host (it may be archived or finished); its tool surface cannot be adjusted.',
  'error.defaults-unwritable': 'Could not write the defaults file: {path}.',
  'error.workspace-unresolved': 'The workspace cannot be attributed: {subject}.',
  'error.workspace-unwritable': 'Could not write the workspace defaults file: {path}.',
  'error.internal': 'The host hit an internal error; nothing was applied.',
  'error.unavailable': 'Could not reach the dsh host process.',
  'error.bad-response': 'The host answered with an unrecognized response.',
  'error.fallback': 'The operation failed.',
} satisfies Record<Key, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** 本插件「会话级工具面开关」面板的文案。 */
    sessionToolToggle: Key
  }
}
