---

description: "面板目录拾取的自适应双模：pick 先行三级降级、应用内浏览对话框自绘、纯客户端分组呈现。"
kind: "architecture-decision-record"
---

# ADR-0015：应用内目录拾取与分组呈现

## Status

Accepted（2026-11-09）

## Date

2026-11-09

## Context

「工作区文件夹」分节的「添加目录」动作需要一个跨部署可用的目录拾取能力。宿主 seam（`ctx.uiWorkspace`）提供三个原语：`pickDirectory()`（OS 原生选择框）、`listDirectory(path?, signal?)` 与 `createDirectory(path, name)`（可编程浏览）。部署处境二分：native 部署（桌面、有显示会话）只有 pick 可用；browse 部署（远程浏览器、headless 宿主）只有 list/create 可用——上游 directory-picker 家族以 `capability` 声明当前部署服务哪一面，客户端没有任何官方能力探测 API。

两条实测事实约束了设计：

1. **P-1（能力信号在 pick 层取不到）**：`@deepseek-ai/dsh-client-ui-workspace` 的 `lib/client.js` 中 `pickDirectory` 的实现把失败折叠成 `new Error("directory picker failed: <message>")`——`code` 与 `details`（含 `capability`）在该层被丢弃。仅当 `list` / `create` 失败时，`rpcError` 才可靠携带 `details.capability`。这条事实推翻了设计留痕早期「`details.capability` 是唯一信号」的假设（OpenSpec 变更 `2026-11-08-workspace-folders-picker` 的待决问题 P-1）。
2. **浏览调用必须保留 receiver 绑定（2026-11-09 实测并确证）**：headless 容器 + 上游 auto 后端的组合里，pick 被宿主以结构化拒绝应答（提示客户端改用 browse，`details.capability: "browse"` 正常携带），host 端 `list` 端点探活健康，remote receiver 本体直调亦能正常返回 home listing；但上游 `UiWorkspaceService` 的 `listDirectory` / `createDirectory` 是读实例状态（`this.directoryPicker`）的实例方法，首版实现曾把它们解构成裸引用传入浏览端口，调用时丢失 `this` 即 TypeError——应用内浏览对话框因此显示浏览失败（该现象初诊误记为「上游 client 集成面断点」，同日经页面探针确证为本插件端口缺陷并修复：端口引用一律 `bind(service)`，探测直调一律 `.call(service)`，this-敏感 fixture 在适配器单测里守护）。手输路径添加不受影响。

同时，分节的呈现需要把配置授予的通用根（`commonRoots`，见 `docs/reference/common-additional-roots.md`）与登记的附属根分开表达，而 wire 契约（不变式 4、10）与宿主半必须零改动。

## Decision

三个决策（OpenSpec 变更 code-design 的 D-01 / D-03 / D-05，此处为沉淀后的终形态）：

1. **能力判定 = pick 先行 + 三级信号 + 结构探测兜底，按服务实例缓存**（D-01）。顺序固定：① pick 失败的 `rpcError.details.capability`（`list`/`create` 失败可靠携带；pick 层一旦上游修复自动接管）；② message 正则兜底（上游文案不是契约，改形后果只是多一次探测）；③ `listDirectory()` 零参结构探测（home 层同时充当对话框首帧）。判定结论按服务实例身份缓存——`read()` 返回同一实例时直接复用，宿主热替换产生新实例即失效重判。
2. **浏览对话框自绘**（D-03）。`DirectoryPickerDialog` 自绘遮罩/卡片/Escape/Tab 焦点环/焦点归还，portal 到 `document.body`，视觉逐值复刻宿主原语样式（只消费 `var(--dsw-*)` token，遵守 ADR-0006）。与 ADR-0013 的边界：ADR-0013 把**分节壳**交给 holder；本对话框是分节内部的**拾取浮层**，只在用户点「添加目录」时出现、只服务一次目录选择，不与页面壳重叠。单栏列表 + 面包屑 + 「选择此目录」，新建成功后导航进入新目录（防误采纳父目录）。
3. **分组 = 纯客户端按 `source === 'common'` 拆分**（D-05）。wire 仍是单 `roots` 数组；面板把列表拆成「附属」「通用」两组各自渲染，通用组标题与说明常驻（说明取自配置语义），通用行保留既有的全禁用操作集与「通用」徽章，move 锚点按组内数组计算。

## Alternatives Considered

- **只靠 `details.capability` 降级**：pick 层取不到（P-1），等于 browse 部署功能缺失。
- **只靠 message 正则**：上游文案改词/本地化即失配，误判不可控。
- **先 `listDirectory()` 探测再决定 pick**：native 部署每次点「添加目录」先打一次必然失败的 RPC。
- **新增宿主端点暴露 `capability()`**：要动宿主半 + wire 契约 + 版本门，与收益不成比例。
- **用 ui-primitives 的 `Modal`**：需要修订 ADR-0006 的 Accepted 结论（结构组件自绘），且测试替身不复现其 Escape/焦点语义，测试面反而变薄。
- **内联展开（非模态）**：页面滚动会把浏览状态带出视口，与「对话框」形态裁定冲突。
- **复用上游 browse 目录流程包**：它填充的是 ui-workspace 自己的 single slot，本插件不是 owner，重复注册会被拒。
- **wire 拆成 `registered`/`commons` 两数组**：breaking 改动，双端 zod 契约与消费方都要动；新旧面板/宿主交叉组合需要兼容垫片。纯客户端拆分对两个方向都退化为「忽略未知字段」。
- **隐藏通用行的全禁用控件 / 删除通用徽章**：呈现打磨，不改变行为；徽章承载「配置授予、不可在此编辑」的提示语义，删除要同步参考文档与 parity 用例，收益为零。

## Consequences

- browse 部署获得完整的应用内拾取能力（对话框浏览、新建、采纳）；native 部署行为不变（pick 成功即用，`list` 零调用）。
- 手输路径保留为兜底入口；拾取失败不清空手输框。
- 上游 message 改形的最坏后果从「功能消失」降为「多一次 `list` 调用」；上游若在 pick 层保留 `details`，①分支自动接管。
- 自绘对话框的 Escape/焦点/portal 语义由本插件的对话框 spec 守护，代价是这部分 a11y 逻辑需要自行维护（宿主原语升级不自动跟随）。
- 浏览端口对上游原语持有的是**绑定后的引用**：上游 `listDirectory` / `createDirectory` 是读实例状态的实例方法（this 敏感），今后任何直调或转手都必须保留 receiver（`.bind` / `.call(service)`），this-敏感 fixture 在适配器单测里守护这条纪律；疏忽的后果是 browse 部署的浏览/新建全数失败而单测全绿（mock 不读 `this` 时无法暴露），2026-11-09 已发生一次并修复。

## Related Documents

- [ADR-0005](./ADR-0005-out-of-tree-client-transport.md) — client 半部的通道与装配纪律（`read()` thunk 现取服务）
- [ADR-0006](./ADR-0006-client-ui-host-tokens.md) — 样式 token 纪律（对话框零字面色）
- [ADR-0013](./ADR-0013-workspace-config-section-mount.md) — 分节壳归 holder 与拾取浮层的边界
- [通用附加根参考](../reference/common-additional-roots.md) — 通用根的配置语义与面板分组呈现
- 架构文档 §7（[Root 管理与 UI](../architecture/multi-root-workspace.md)）— 面板与拾取链路的行为描述
- OpenSpec 变更 `2026-11-08-workspace-folders-picker` 的 code-design（归档后在 `openspec/changes/archive/` 下）— D-01/D-03/D-05 的完整推导与 P-1 待决记录
