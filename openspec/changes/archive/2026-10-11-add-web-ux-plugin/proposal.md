# Proposal

## Why

dsh Web GUI 的会话状态行（缓存命中率、上下文用量）不展示当前模型的 provider 归属——切换模型后用户无法直观确认这个会话究竟跑在哪家 provider 上。同时 MCP 服务器只能在 profile 级 cordis.yml 里整份静态配置：配置无法随项目目录走，换项目就要改全局配置，项目专属的 MCP（如 apigen 专用工具链）与全局 MCP 混在一起，多项目并行时工具列表互相污染。

## What Changes

新增独立插件 `dsh-plugin-web-ux`（目录 `plugins/web-ux/`，官方组合包 bundle 形式，host + web client 双面），包含两项能力：

- **Provider 徽章**：在输入框下方状态行（`conversation.composer.dock` slot，与官方 StatsPills 同行）追加一枚静态胶囊，显示当前模型 provider 的显示名；tooltip 展示 `providerId · modelId`。纯展示组件，不接管、不遮蔽任何官方控件。
- **项目级 MCP 配置**：扫描各登记工作区根目录（主根 + 附加根）下的 `.dsh/mcp/` 目录，每个配置文件（`.yaml` / `.yml` / `.json`）定义一台 MCP 服务器，经 `@deepseek-ai/dsh-mcp-client` 在运行时动态加载；工具可见性按工作区隔离——会话只看得到其所属工作区根集合的项目 MCP 工具。支持 `${VAR}` 环境变量展开（密钥不进 git）、目录监听热重载、`/mcp-reload` 命令兜底、serverName 冲突按「主根优先、登记顺序先到者得」规则报错并跳过（绝不静默改名）。

无 BREAKING 变更：纯新增插件，不修改任何现有插件或上游行为。

## Capabilities

### New Capabilities

- `dsh-web-ux-provider-badge`: 会话状态行的模型 provider 归属展示——徽章的数据来源、显示与回退规则、宽度安全约束。
- `dsh-web-ux-project-mcp`: 项目目录级 MCP 服务器配置——扫描范围、文件格式与环境变量展开、serverName 冲突仲裁、按工作区的工具可见性隔离、热重载与手动重载。

### Modified Capabilities

（无——不改动现有 `dsh-multi-repo-git-graph` 能力，也不修改本仓库其他插件的行为。）

## Impact

- **新增代码**：`plugins/web-ux/`（package.json、cordis.patch.yml、src/host、src/client、构建脚本、测试、README），遵循仓库插件三件套约定。
- **运行时依赖**：host 面通过 `ctx.loader.import('@deepseek-ai/dsh-mcp-client')` 动态获取 MCP 客户端（不在构建期打包）；client 面 `dsh.client.inject` 引用 model-selection 与 slots 客户端包；peer 依赖 `@deepseek-ai/dsh`。
- **软依赖**：`dsh-plugin-multi-root-workspace` 的 `multiRootRegistry` 服务（附加根枚举）；该插件未安装或版本不在 allowlist 时静默降级为只扫登记主根。
- **安装目标**：profile `web`；版本随仓库统一 tag 发布。
