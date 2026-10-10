# Proposal

## Why

`dsh-plugin-git-graph-multi` 的客户端界面是从上游插件 fork 而来、几乎全部手写的原生控件：组切换用原生 `<select>`、仓库勾选用原生 checkbox、六个对话框是自制的 fixed 定位浮层（手工 z-index、无焦点归还），弹层表面与徽章配色也是自绘。结果是插件在宿主 DSH Web GUI 里「一眼像外来户」——深色主题下原生下拉菜单尤其突兀，与宿主 `@deepseek-ai/dsh-client-ui-primitives` 组件体系（官方客户端插件在运行时同样使用它）的观感不一致。

宿主组件库已随插件运行时而存在（客户端 bundle 的唯一 UI external，无新增依赖成本），因此现在是把界面统一到宿主体系、消除自绘控件的最低成本时机。

## What Changes

- **总览行重排**：删除 11px 表头三列表格，改为自描述行——每行以宿主状态点标识仓库状态（干净 / 脏 / 不可用），根仓徽章与脏文件数改用宿主 Tag；选中行保留勾选与品牌色底。
- **组切换候选改平铺选择**：原生 `<select>` 换成宿主 Pill 平铺列表，Pill 内含覆盖率后缀（如 `feat/x ·2/4`），支持点选与选中态；无同名分支时给出空态提示。
- **六个对话框改用宿主 Modal**：创建分支、创建 worktree、Git 图谱、worktree 管理、组新建、组操作结果统一换成宿主模态（遮罩模糊、Escape 关闭、焦点归还、层级由宿主统一管理），按钮/输入框/勾选/单选分别改用宿主 Button / Input / Checkbox / SegmentedControl。
- **弹层与控件统一**：分支弹层与总览面板改用宿主菜单表面（MenuSurface）；搜索框改用宿主 Input；超长分支名改用宿主 Tooltip 呈现完整名；按钮全部走宿主 Button 的尺寸与变体。
- **反馈与忙碌态**：单仓切换成功改用宿主 Toast（弹层关闭后仍可见），失败原因保持内联停留；进行中的操作呈忙碌态并禁止重复提交。
- **细节修正**：芯片展开时箭头旋转；分支弹层底部四项入口使用语义化图标（不再全部复用分支图标）；Git 图谱保留字形泳道，仅精修 refs 标签、行距与元信息排版。
- 非目标：Git 图谱泳道改为 SVG/分色曲线（需重做 core 的泳道计算，另立变更）；`/git/*` 路由、host 逻辑、core 类型与既有测试的语义变更；新增任何运行时依赖。

## Capabilities

### New Capabilities

（无：本次改动不引入新的能力边界，全部落在既有多仓 git 能力之内。）

### Modified Capabilities

- `dsh-multi-repo-git-graph`: 全仓总览的行构成与呈现方式改变（状态点、Tag 徽章、去表头、宿主菜单表面）；新增组切换候选的平铺选择、宿主组件体系一致性、操作反馈与忙碌态三类界面行为要求。

## Impact

- **修改**：`dsh/plugins/git-graph-multi/src/client/` 下的渲染层——6 个对话框组件、分支弹层、总览面板、结果面板、芯片、两个 CSS module、`locales.ts`（新增少量文案键）。
- **不变**：`src/host/`、`src/core/`、`src/index.ts`、`src/invariant.ts`、`src/client/api.ts`、`src/client/verbs.ts`、SSE 与自动隔离逻辑、现有 4 个测试文件、`build.mjs`、`package.json`（无新依赖、无 externals 变化）、`pnpm-lock.yaml`。
- **产物契约**：客户端 bundle 的 externals 仍恰为 `react` / `react-dom` / `react/jsx-runtime` / `@deepseek-ai/dsh-client-ui-primitives`；bundle id 与 `window.__ModuleLoader__.load` 形态不变。
- **使用侧**：多仓工作区（如 opc）与单仓工作区的外观与交互同时受益；单仓工作区的既有行为（无仓库切换与组操作控件）保持不变。
- **文档**：`dsh/plugins/git-graph-multi/README.md` 的界面说明同步更新。
