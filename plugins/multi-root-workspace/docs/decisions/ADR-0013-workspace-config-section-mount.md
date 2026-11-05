# ADR-0013: 面板挂载座位从 footer 迁到统一「工作区配置」弹窗的分节

## Status

Accepted

## Date

2026-11-05

## Context

M3 时期（[ADR-0005](./ADR-0005-out-of-tree-client-transport.md)）给 Workspace Folders 面板选的落点是 `sidebar.footer.action`（list/root）+ 自绘 Modal 对话框。当时这是唯一一个所有受支持运行时都提供的 additive 侧栏座位，代价是遮罩、卡片、header、关闭按钮、Escape 与 Tab 焦点陷阱全部由本插件自己维护（`docs/architecture/multi-root-workspace.md` §7）。

此后 footer 座位饱和：multi-root-workspace、session-tool-toggle、web-ux 三个插件各占一颗入口（R5 的根因是「整行独占 + `flex:none`」把同列其它占用者挤成残条），官方 cordis badge 也是整行宽。宽栏 256px、折叠轨 56px（内容宽约 32px）根本容不下四颗入口。

同期的统一「工作区配置」变更（`unify-workspace-config-entry`）新建了 `dsh-plugin-workspace-config` holder：footer 只留一枚「工作区配置」入口，点击打开统一弹窗，弹窗左 nav + 右内容列；三个插件把自己的面板注册成 `workspace-config.section` 分节。座位形状与官方 `settings.section` 同构：`kind: 'list'` / `scope: 'root'`，owner 份额只有 `{ close }`，注册 options 携带 `id`（驱动 `only` 过滤）/`order`/`label`；holder 在注册 `shell.overlay` 弹窗时用 `children` 声明该座位（Declaring is claiming）。该机制已在真 renderer 的 jsdom PoC 中实证（children 声明、`only` 过滤、label 双态、后装 holder 补跑四条全 PASS，常驻为回归哨兵）。

因此本插件面板的挂载座位需要一次迁移决策：继续自绘对话框，还是成为统一弹窗里的一个分节。

## Decision

1. **面板本体 = 分节组件 `WorkspaceFoldersSection`**，注册到 `workspace-config.section`：list 座位、root 作用域、owner 份额 `{ close }`。entry id 沿用被删除的旧 footer entry id `multi-root-folders`（id 只在座位内唯一，沿用让日志、断言与排障话术保持连续）；`order: 10`（与 session-tool-toggle 20、web-ux 30 排成三行）；`label` 是 `() => t('section.label')` thunk，locale 切换不需要重注册。
2. **座位由 holder 声明，本插件只做软注册。** holder 在 `shell.overlay` 注册弹窗时用 `children` 声明 `workspace-config.section`；本插件 `ctx.slots.inject(SECTION_SEAT, () => register(...))` 并各自 `try/catch` + `ctx.logger?.warn`。holder 缺席时 inject 回调不触发：不报错、不残留入口；座位在但拒绝注册时只丢这一节。
3. **holder 是编译期类型依赖，不是运行时依赖。** `package.json` 的 `devDependencies` 写 `"dsh-plugin-workspace-config": "workspace:*"`；源码只用 `import type`（取得 `SlotMap` 增补与 `WorkspaceConfigSectionSeat` 字面量类型），**不把 holder 写进 `dsh.client.inject`**，产物里也不出现 holder 的代码或 `require` 词。座位字面量在本包各持一份，由类型断言（本地常量赋给 holder 的字面量类型）而不是共享运行时常量保证一致。
4. **删除自绘弹窗壳与 footer 触发按钮**：`.mrfw-overlay` / `.mrfw-mask` / `.mrfw-dialog` / `.mrfw-header` / `.mrfw-title` / `.mrfw-close`、Escape/Tab 焦点陷阱、`dialogRef` 与 focus effect、`role="dialog"` 全部移交给 holder 的 `Modal headless` 壳；footer 的 `sidebar.footer.action` 注册整块删除。座位 owner 的 `close` 按契约接收但本组件不使用——本节没有整窗跳转流程，关闭始终是 holder 的事。
5. **Files tab 紧凑入口保留**：存在 `sidebar.right.tab.files.actions` 的旧界面仍注册一颗紧凑胶囊（`mrfw-fileLauncher` + `mrfw-btn`），点击就地展开同一个分节本体。它不 import holder 的打开桥（那会破坏第 3 条），也不自绘弹窗；`/workspace-folders` 命令不变。
6. **样式纪律不变**：`src/client/styles.ts` 仍是唯一样式表，类前缀 `mrfw-`、颜色只走宿主 `--dsw-*` token（[ADR-0006](./ADR-0006-client-ui-host-tokens.md)）；本次只裁剪 footer/弹窗壳样式族，并新增分节根 `.mrfw-sectionBody`（holder 的内容列负责 padding 与滚动，分节不得二次滚动）。

## Alternatives Considered

- **保留自绘 Modal 对话框（双壳并存）**：与「footer 单入口 + 统一弹窗」的目标直接冲突；焦点陷阱、Escape 层级、遮罩样式要维护两份，正是本次要消灭的重复。且 footer 座位已饱和，没有第二颗入口的位置。
- **Files tab 入口也改调 holder 的打开桥（运行时 import holder）**：会把 holder 的整模块（React 组件、CSS 注入、`createElement`）打进本插件 bundle，并在清单上声明一条对缺席包静默跳过的加载边——D3 明确禁止的虚假硬依赖；产物断言「不含 `dsh-plugin-workspace-config`」也会红。
- **删除 Files tab 入口**：已定结论要求保留（它是 holder 缺席时唯一的 GUI 路径）；删除会让「未装 holder 时面板不可达」从预期降级变成功能缺口。
- **nav(list) + panel(keyed) 两座位**：规划期被否——契约面翻倍而无对应收益；官方设置弹窗本来就是「单 list 座位 + `RenderOpts.only`」的先例。
- **把座位名/owner 做成跨包共享运行时常量**：等价于运行时依赖 holder，理由同上；类型断言已经能在编译期钉住字面量。

## Consequences

- 正面：三个插件共用一套弹窗壳（遮罩、卡片、header、关闭、焦点管理），footer 只留一枚入口；本插件删掉一整族自管焦点/Escape 代码与对应样式；入口文案跟随 locale（thunk 由 holder 的 nav 投影按需求值）。
- 正面：类型权威在 holder 的 `contract.ts`，本插件写错座位名是编译错误；同时产物零 holder 代码，四包之间没有运行时加载依赖（四包同装是约定，不是硬依赖）。
- 代价：未安装 `dsh-plugin-workspace-config` 时，本插件面板没有 GUI 入口（README 明示「推荐四包同装」）；Files tab 旧界面的入口是「就地展开」而不是弹窗。
- 代价：多一个 devDependency（`workspace:*`）与构建顺序耦合——holder 的类型产物必须先于本包 typecheck/build 存在。发布形态不受影响：git 来源安装不装也不改写 devDependencies。
- 文档后果：`AGENTS.md` 不变量 5 的失效表现从「`sidebar.footer.action` 注册静默消失」改为「`workspace-config.section` 注册静默消失」；rc.5 座位表等历史取证只加注记不改写。
- 后续若 holder 的座位形状变化（例如 owner 扩大），本分节接收的结构化 props 需要同步；这是本迁移已接受的跨包类型契约成本。

## Related Documents

- [ADR-0005：出树 client 半部的通道与落点](./ADR-0005-out-of-tree-client-transport.md)（传输层结论不变；挂载座位由本 ADR 取代）
- [ADR-0006：客户端 UI 复用宿主样式 token](./ADR-0006-client-ui-host-tokens.md)
- [ADR-0008：面板主根由 host session 推导](./ADR-0008-panel-session-derived-authority.md)
- [ADR-0011：多根 scope 消费方扩展](./ADR-0011-multi-root-workspace-consumers.md)（附加根文件树）
- [架构文档 §7 Root 管理与 UI](../architecture/multi-root-workspace.md)
- [故障排查：client bundle 不进 web 启动图](../troubleshooting/client-bundle-not-in-boot-graph.md)
- `plugins/workspace-config/src/client/contract.ts`（座位契约唯一权威：座位名、owner 份额、order 常量）
