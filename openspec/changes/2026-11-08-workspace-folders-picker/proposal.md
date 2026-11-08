# Proposal

## Why

「工作区配置」页面的「工作区文件夹」分节（multi-root-workspace 贡献）在当前部署形态下**实际只能手动输入绝对路径**：分节的「＋ 添加目录」按钮调用上游 `uiWorkspace.pickDirectory()`，而该便捷方法仅在 native 选择器表面可用——当前部署由 `directory-picker-auto` 判定服务 browse 表面（`pick` 即报 `directory-picker/unavailable`），点击只得到一句「操作失败。」。同时，`commonRoots` 配置授予的通用根与工作区自登记的附属根**混排在同一列表**，用户难以区分哪些可在面板管理、哪些来自配置。

## What Changes

- **能力自适应目录拾取（新模块）**：「＋ 添加目录」先尝试系统选择器（native 表面）；失败且判定当前为 browse 表面时，自动降级打开**本插件自建的应用内目录选择对话框**（起点为宿主主目录，面包屑逐级导航，可新建文件夹，确认即走既有 `add` 校验）。能力信号按三级分类取得（结构化 details → message 兜底 → `listDirectory` 结构探测），探测按服务实例缓存；能力不可用时隐藏拾取入口并提示手输。
- **应用内目录选择对话框（新组件）**：单栏列表 + 面包屑 + 隐藏目录开关 + 截断提示 + 新建文件夹（`directory-exists` 等错误原地显示）；Esc/取消/遮罩关闭不采纳；采纳失败（重复/包含/主根冲突等既有校验）时错误句在对话框内显示且不关闭。
- **附属/通用分组呈现**：分节正文按 `source === 'common'` 拆为「附属工作目录」与「通用工作目录」两组（纯客户端拆分，wire 契约零改动）；通用组标题与说明常驻（空态说明指向 `commonRoots` 配置），通用行保留既有徽章与禁用操作集；「添加目录」动作行收进附属组内。
- **动作升级**：拾取入口从 icon-only 升级为带文案的主按钮，手动输入降为次要兜底；主工作目录行补「复制路径」。
- **已知不一致落档（本轮不做）**：页面顶部工作区选择框与分节实际寻址（当前会话）不一致——涉 ADR-0008 宿主寻址安全模型，另立变更。
- 文档：README、架构文档 §7、新增插件级 ADR-0015（能力信号取得方式 / 对话框自绘与 ADR-0006 边界 / 分组纯客户端）、ADR 索引、commonRoots 参考。

**零改动面**：宿主半（`command.ts`/`registry`/`scope`）、wire 契约（`contract.ts` 8 端点与 `RootsView` 形状）、`cordis.patch.yml`/`package.json`/`tsdown.config.ts`、workspace-config holder、上游任何包。

## Capabilities

### New Capabilities

- `dsh-multi-root-folders-panel`: 工作区文件夹分节的**目录拾取与呈现行为**——能力自适应拾取（native OS 选择器 / 应用内浏览对话框 / 不可用降级手输）、应用内对话框的浏览与新建语义、附属/通用两组的呈现规则、拾取主动作与主目录行操作。

### Modified Capabilities

（无——`dsh-workspace-config-entry` 只约束 holder 的座位契约，本变更不触碰其任何 requirement。）

## Impact

- **代码**（全部在子仓 `plugins/multi-root-workspace`）：新建 `src/client/directory-picker.ts`（能力判定与降级适配器）与 `src/client/DirectoryPickerDialog.tsx`（对话框组件）；修改 `WorkspaceFoldersAction.tsx`（分组渲染/动作行/拾取状态机）、`index.ts`（装配适配器）、`locales.ts`（+21 键×2 语）、`styles.ts`（picker 样式族）、`compat/client-icons.ts`（+2 字形）；测试新建 2 个 spec、改 3 个（详见 design 触达面）。
- **依赖**：零新增运行时依赖；`react-dom` 以既有外置模块词身份进入产物 require 面（`tsdown.config.ts` 已外置，产物断言同批更新）。
- **兼容性**：四包同装、统一版本发布形态不变；上游 API 消费面（`pickDirectory`/`listDirectory`/`createDirectory`）全部为已发布服务方法。
- **不受影响**：三个分节的既有业务功能（默认档读写、会话管理）、宿主代码、`/workspace-folders` 命令面。
