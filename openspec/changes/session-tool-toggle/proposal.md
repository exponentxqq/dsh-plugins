# Proposal

## Why

DSH 会话的工具面成本随安装的 MCP 服务器线性膨胀：本部署实测单个会话模型可见工具 214 个（MCP 139 个，yunxiao 单台 70 个），工具 schema + 服务器指令段 + skill 目录每步请求重复计费，数千至上万 token 量级。现有机制只覆盖工作区隔离（project-mcp）与 profile 级插件装卸，用户无法在**单个会话内**即时关掉不需要的工具面。

## What Changes

- 新增插件 `dsh-plugin-session-tool-toggle`（**双端 bundle**，`exports "."` 宿主 + `exports "./client"` 浏览器，任何 profile 可装；无 Web 组合时宿主面独立可用）：会话级开关工具面，开关在下一次模型步骤生效
- 开关对象（组地址文法）：`mcp:<server>` 整组（工具 schema + `mcp:<server>` 指令段一并移除）、`mcp:<server>::<tool|prefix*>` 单工具/尾部通配（仅移除 schema，指令段保留）、`tool:<name>` 内置工具（硬保护名单拒关自救基础，`skill` 归一为 `tool:skill` 整档开关）
- 双层强制：`tools.restrict` 掩码（不可见）+ dispatch guard（拒调用），deny 名单只从活注册表推导，`tools/change` 幂等重算 + diff 守卫（照抄 project-mcp 掩码引擎工程先例）
- 持久化：`appendPluginRecord` 整值状态记录（`plugin:session-tool-toggle/state`）+ host-only 投影 fold，fork/resume 免费重放；同一 `StateStore` 端口提供 `ctx.storageDomain` 第二实现（配置键可切）；两者皆不可用时降级内存态
- 用户级默认档：`$DSH_HOME/session-tool-toggle/defaults.json`，`/tools default` 子命令与 Web 面板均可写，会话（含子代理/队友会话）创建时拍快照、不追溯既有会话
- 交互（命令面）：单一 `/tools` 命令 + 子文法（off/on/status/default），零 token 命令通道；回执含计数与 KV 缓存一次性重建提示（开/关对称）
- 交互（Web 面板，2026-10-30 扩入）：入口注册在会话主视图头部工具区插槽 `conversation.session.header.utilities`（order 20 图标按钮）→ Modal 完整管理面板：工具清单分组（MCP 服务器可展开到单工具 / skill / 内置工具）+ 会话级开关切换 + 用户级默认档编辑 + 关闭集展示；读写走 Connection RPC 通道 `/session-tool-toggle`（4 端点 panel/toggle/reset/defaults），与 `/tools` 命令面共用同一 `control.ts` 用例内核、同一 per-session 状态与同一持久化记录（无第二份状态）；不提供配置键编辑
- 子代理/队友：不继承主会话的会话级开关（README 明示）；但创建时同样拍用户级默认档快照
- 根仓文档：README.md 插件清单、AGENTS.md 插件清单与「DSH 基线」软插件计数补行

## Capabilities

### New Capabilities

- `dsh-session-tool-toggle`: 会话级工具面开关——MCP 服务器整组/单工具、内置工具（保护名单）、skill 整档的可见性开关与拒调用；会话日志持久化与 fork/resume 重放；用户级默认档快照语义；双交互面（`/tools` 命令 + Web 配置面板，共用同一状态与持久化）

### Modified Capabilities

（无——project-mcp 的工作区隔离语义不变，两者通过 restrict 掩码取交集正交组合）

## Impact

- **代码**：新增 `plugins/session-tool-toggle/`（23 个 src（宿主 11 + client 8 + 共享契约 1 + css/d.ts 各 1，≈3,660–4,590 行）+ 17 个测试（≈2,350 行）+ 工程文件 + README）；无既有源码改动
- **文档**：根仓 `README.md`、`AGENTS.md` 各补一处条目
- **依赖**：宿主半新增 `zod@4.4.3` 直接依赖（已在锁内）；client 半新增 12 项 devDeps（dsh-client-ui-* / dsh-client-connection / react 系，全部已在 `pnpm-lock.yaml` 内，零新增解析节点）；`pnpm-workspace.yaml` 仅在发布年龄门拦截时追加豁免（条件项）
- **边界**：不动 project-mcp / cordis.patch.yml 既有 MCP 行；不做全局/进程级服务器管理（plugin_manager 已有）；不做 per-skill 粒度（v2 候选）；不改安全边界语义（开关面向 token 经济，非权限面）；面板不提供配置键编辑
- **基线**：`engines.dsh` 与 DSH peer 派生自 `scripts/dsh-baseline.mjs`（`>=0.2.1-rc.2 <0.3.0`），发布走既有 `pnpm release` 流程；profile 安装/升级后需重启 web profile（浏览器半 bundle 由宿主启动图提供）
