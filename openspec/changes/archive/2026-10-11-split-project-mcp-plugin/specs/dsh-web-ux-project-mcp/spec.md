# Spec Delta

## REMOVED Requirements

### Requirement: 扫描范围
**Reason**: capability 整体迁移——split-project-mcp-plugin 把项目级 MCP 拆出为独立插件 `dsh-plugin-project-mcp`，能力从 `dsh-web-ux-project-mcp` 迁往 `dsh-project-mcp`。此为规范能力标识的迁移，与插件命名无关：`dsh-plugin-web-ux` 的目录名、包名与插件 `name` 均保持不变。
**Migration**: 需求语义逐字迁移至 `dsh-project-mcp` 的同名 Requirement（见本变更 `specs/dsh-project-mcp/spec.md`），无行为变化。

### Requirement: 配置文件格式与 serverName
**Reason**: capability 整体迁移（同上）。
**Migration**: 逐字迁移至 `dsh-project-mcp` 的同名 Requirement，无行为变化。

### Requirement: 环境变量展开
**Reason**: capability 整体迁移（同上）。
**Migration**: 逐字迁移至 `dsh-project-mcp` 的同名 Requirement，无行为变化。

### Requirement: serverName 冲突仲裁
**Reason**: capability 整体迁移（同上）。
**Migration**: 逐字迁移至 `dsh-project-mcp` 的同名 Requirement，无行为变化。

### Requirement: 动态加载与失败隔离
**Reason**: capability 整体迁移（同上）。
**Migration**: 逐字迁移至 `dsh-project-mcp` 的同名 Requirement，无行为变化。

### Requirement: 工作区可见性隔离
**Reason**: capability 整体迁移（同上）。
**Migration**: 逐字迁移至 `dsh-project-mcp` 的同名 Requirement，无行为变化。

### Requirement: 隔离的动态刷新
**Reason**: capability 整体迁移（同上）。
**Migration**: 逐字迁移至 `dsh-project-mcp` 的同名 Requirement，无行为变化。

### Requirement: 热重载与手动重载
**Reason**: capability 整体迁移（同上）。
**Migration**: 逐字迁移至 `dsh-project-mcp` 的同名 Requirement，无行为变化。
