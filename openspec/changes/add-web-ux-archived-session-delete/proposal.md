# Proposal

## Why

DSH 只有「归档」没有删除:持久化层明确不提供删除接口,会话日志在 `~/.dsh/sessions/` 无限累积,用户只能手工删目录(需停 Host、自己清理 `workspace.json` 引用)。归档承担了"软删除抽屉"的角色,但抽屉里的东西永远倒不出去。本变更为 Web GUI 补上"碎纸机":对已归档会话提供真实删除入口。

## What Changes

- `dsh-plugin-web-ux` 从 client-only 双端化:宿主半由 no-op 载体变为实载体,通过 Connection RPC channel `/web-ux` 暴露 `preview-delete` 与 `delete-session` 两个端点。
- 已归档会话行的 "..." 菜单新增「删除会话」入口(order 500,trash 图标);正常会话菜单不出现(想删先归档)。
- 删除前弹出确认对话框,显示预览信息(会话标题、级联的子代理会话数、磁盘体积)。
- 删除语义:校验(存在/已归档/非 live)→ registry 清理(detach/unarchive/unpin)→ 移除日志目录与投影缓存 → 借用官方 `api-session/removed` 事件让运行中 GUI 实时删行。
- subagent 后代日志一并级联删除;fork 会话永不级联;附件存储不做清理。
- 不加 hover 按钮、不加键盘快捷键(给不可逆操作保留摩擦)。
- V1 仅单个删除;channel 响应保留数组形态,未来批量不破坏协议。
- 版本 bump 至 1.2.0(minor)。

## Capabilities

### New Capabilities

- `dsh-web-ux-session-delete`: 已归档会话的真实删除能力——入口可见性规则、预览与确认交互、删除范围与级联语义、防护拒绝条件、UI 实时一致性、以及附件不清理的边界。

### Modified Capabilities

(无——`dsh-web-ux-provider-badge` 的 requirement 不受影响,徽章行为零变化。)

## Impact

- **代码**:`plugins/web-ux/` 全部新增/改动——`src/index.ts`(双端化)、新增 `src/contract.ts`、`src/delete-session.ts`、`src/client/` 下删除入口与对话框组件;`package.json`(`dsh.client.inject` 增补、peer/dev 依赖、描述)、`build.mjs` 产物说明、README。
- **上游接触点**(均为软降级,挂不上静默消失):slot `sidebar.workspaces.session.menu.item` / `shell.overlay`、client 服务 `workspaces` / `connection` / `locale`、host 服务 `workspaceRegistry` / `dshHomePath`、host 事件 `api-session/removed`(借用,README 记录)。
- **文档**:`plugins/web-ux/README.md`(双端说明、删除范围、上游依赖清单)、仓库根 `README.md` 插件清单行。
- **无破坏**:不触碰官方包;profile 侧按 tag 重装 `dsh-plugin-web-ux@v1.2.0` 即生效。
