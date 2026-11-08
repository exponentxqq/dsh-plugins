# Proposal

## Why

「工作区配置」目前是侧栏 footer 入口 + 统一分节弹窗，与宿主三个既有面板（插件 / 自动化任务 / 任务看板）的「侧栏面板列表点击 → 主区域独立页面」交互不一致；且三个分节各自维护节内工作区选择框，选择体验割裂。代码结构重构（2026-11-07-optimize-architecture 等）已完成，页面形态对齐的阻力已消除。

## What Changes

- **入口形式（BREAKING）**：删除侧栏 footer 入口（`sidebar.footer.action`）与统一分节弹窗（`shell.overlay` + open-store 打开桥），改为宿主标准面板配方——`main`（keyed）页面注册 + `sidebar.panellist` 面板行注册（id `workspace-config`、order 20），点击打开独立页面，与插件/自动化任务/任务看板一致。
- **类别展示**：三种类别（工作区文件夹 / 工作区默认档 / 会话管理）仍按 tab 拆分，分节座位 `workspace-config.section` 与软注册机制原样保留；页面样式与布局参照插件页（page/pageBar/pageTabs/tabpanel 骨架 + 真 tablist a11y）。
- **统一工作区选择框**：页面级唯一选择框（真实工作区 + 末项「未分配」），各分节不再单独放置；选择值经座位 owner 份额（纯数据 `{ workspace }` 三态上下文）下传。
- **BREAKING（契约）**：owner 份额 `{ close }` 删除（页面常驻无关闭语义；会话管理分节的取消/关闭按钮改流程内语义）；未登记 cwd 的工作区默认档在页面下不可达（接受，仍可经 `/tools` 命令面）。
- **公共组件**：页面 UI 组件不提取（留在 holder 包内，Q4 裁定）；「当前会话」探测纯函数提取为新的 client 半共享 tooling 包 `@dsh-plugins/client-kit`（对偶 host-kit 模式，P3 裁定），消除双份实现。
- 工程治理面：workspace 五包清单（AR7）与 AR2 白名单登记 client-kit；`dsh-plugin-toolchain` spec 的内部包清单同步扩展。

## Capabilities

### New Capabilities

（无——client-kit 为工程内部共享包，其结构与治理行为由既有 toolchain capability 纳管，不构成独立系统能力。）

### Modified Capabilities

- `dsh-workspace-config-entry`: 入口能力从「footer 单入口 + 统一弹窗」整条改写为「侧栏面板行 + 独立页面」；分节导航 requirement 改写为页面 tablist；新增「统一工作区选择框」requirement（页面级唯一选择、三态上下文下传、默认选择策略、未分配项语义）；分节贡献机制 requirement 的 owner 份额由 `{ close }` 改为 `{ workspace }`；降级与安装矩阵 requirement 调整（未装 holder 时面板不可达、混装不支持）。
- `dsh-plugin-toolchain`: 「内部共享包结构不变式」requirement 的内部包清单由四包（build-kit / host-kit / test-kit / contracts）扩展为五包（+ client-kit：client 半共享运行时函数包，TS 源消费 + 构建期内联 + 零 DSH 包依赖，章程与 host-kit 对偶）。

## Impact

- **代码**：`plugins/workspace-config`（holder 主体改造 + 新建 7 个 client 文件 + 删 4 个旧文件）、`tooling/client-kit`（新建包）、`tooling/contracts`（owner 份额契约）、`plugins/session-tool-toggle`（删节内下拉 + 删 current-session.ts）、`plugins/web-ux`（删节内 Menu + close 流程内化）、`plugins/multi-root-workspace`（compat 探测改消费 client-kit + Q8 空态）、`pnpm-workspace.yaml`、`scripts/check-architecture.mjs`、各包 README 与测试。
- **依赖**：holder devDeps +2（`@deepseek-ai/dsh-api-workspace-controller` / `dsh-api-session-controller`，catalog:dsh，只吃类型，不进 `dsh.client.inject`）；holder 与 multi-root devDeps + `@dsh-plugins/client-kit`（workspace:*，构建期内联）。
- **兼容性**：本仓统一版本发布，四包同 tag 安装是唯一受支持组合；旧贡献方 + 新 holder 混装不做兼容垫片（spec 降级条款写明）。
- **不受影响**：三个分节的业务功能本身（文件夹增删、默认档读写、会话管理动作矩阵）；宿主代码零改动。
