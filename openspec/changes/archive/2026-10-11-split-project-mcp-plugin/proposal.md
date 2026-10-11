# Proposal

## Why

项目级 MCP 能力（`.dsh/mcp/` 扫描、按工作区隔离工具可见性、热重载、`/mcp-reload`）目前打包在 `dsh-plugin-web-ux` 里，名字与安装面把它锁死在 web 场景：acp、headless 等任何 profile 想要这套能力，都得连带安装一个纯 web 客户端组件包。而该能力本身是纯宿主面的——只依赖 `workspaceRegistry` / `tools` / `commands` 宿主服务，与 Web UI 毫无耦合。

## What Changes

把项目级 MCP 从 `dsh-plugin-web-ux` 整体拆出为独立插件 `dsh-plugin-project-mcp`（目录 `plugins/project-mcp/`）：

- 迁移全部宿主实现（扫描、归属判定、加载管理、隔离、监听、触发器、`/mcp-reload`）与对应测试，**行为零变化**；
- `dsh-plugin-web-ux` 瘦身为纯徽章插件：host 半只留一个 no-op 载体行（web 客户端模块扫描需要 bare 包名行读取 `dsh.client` 声明），client 半（provider 徽章）原样保留；
- **web-ux 自身标识一律不变**：目录名 `plugins/web-ux/`、包名 `dsh-plugin-web-ux`、插件 `name='web-ux'`、capability `dsh-web-ux-provider-badge`、README 路径全部保持现状——它仍是后续 web 界面体验优化的落点，本次只做减法不更名；
- capability `dsh-web-ux-project-mcp` 改名为 `dsh-project-mcp`，需求语义逐字迁移（此为**规范能力标识**迁移，与插件命名无关）。

## Capabilities

### New Capabilities

- `dsh-project-mcp`: 原 `dsh-web-ux-project-mcp` 的全部需求——扫描范围、配置格式与 serverName、环境变量展开、冲突仲裁、动态加载与失败隔离、工作区可见性隔离、隔离动态刷新、热重载与手动重载；语义零漂移，交付主体改为独立插件。

### Modified Capabilities

（无——`dsh-web-ux-provider-badge` 不受影响，`dsh-web-ux-project-mcp` 整体移除并由 `dsh-project-mcp` 承接。）

## Impact

- **代码移动**：`plugins/web-ux/src/host/` 全部 12 文件与 6 个 host 测试整体迁往 `plugins/project-mcp/`；`plugins/web-ux/` 目录保留原名，内部只留 client 半并收敛构建配置。
- **标识冻结**：`plugins/web-ux/` 不发生目录改名、包改名或插件改名，其 `package.json#name`、`cordis.patch.yml` 行 id、`src/index.ts` 的 `name` 导出与 effect 标签前缀 `dsh-plugin-web-ux:` 均不动。
- **profile 接线**：web profile 同时安装两个插件；acp / headless 今后可单独安装 `dsh-plugin-project-mcp`（本轮不接入）。
- **运行时依赖**：不变——host 面仍经 `ctx.loader.import('@deepseek-ai/dsh-mcp-client')` 动态获取客户端，`yaml` 打包进 bundle。
- **安装目标**：本轮 profile `web`；版本随仓库统一 tag 发布。
