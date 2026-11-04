# Proposal

## Why

`project-mcp` 目前只隔离**工具面**：它加载的项目级 MCP 服务器，其**资源服务器名**（系统提示 `## MCP resource servers` 段）与**服务器指令段**（`### MCP server: <name>`）仍对所有会话可见，三个共享资源工具（`list_mcp_resources` / `list_mcp_resource_templates` / `read_mcp_resource`）也能被任意会话用来读取其它工作区服务器的资源——插件 README 的非目标条目（「不隔离 MCP 资源面……需另开提案」）已记录该边界，冒烟中也实测到越权工作区的资源可被列出。

本机现状把它变成日常成本：`dsh-plugins` 工作区（无任何 `.dsh/mcp` 配置）的新会话提示词仍列出 8 个资源服务器名，其中 6 个属于 opc / family / brains 三个无关工作区，模型还可直接读取它们的资源（figma/dbx/yunxiao 可能含设计稿、库结构、发布单）。多工作区并行越普遍，越权面与提示词噪音越大。

同时顺带修正工具面一个既有口径缺陷：判断「哪些项目工具应被隐藏/拒绝」用的是**配置声称集合**（含加载失败的 claim）。当某工作区的项目 claim 与 profile 级服务器同名且加载失败时，别的工作区会话会把 **profile 的同名服务器工具**误判为越权并拒绝——用户表现为「没装该工具的工作区把全局工具弄没了」。

## What Changes

- **名字面隔离（新增）**：在提示词组装瀑布内按会话归属过滤 `## MCP resource servers` 段的服务器名数组，并按段名移除被隐藏项目服务器的 `### MCP server: <name>` 指令段；归属未知/未跟踪的会话对项目名 fail-closed（全隐），profile 级名字保留；上游段文本解析失败时**整段删除**（fail-closed）并告警，不静默泄漏。
- **资源面隔离（新增）**：三个资源工具按 `arguments.server` 与该调用 agent 的归属判定，越权调用在派发前拒绝且**不触达目标服务器**；拒绝文案与上游「服务器在本 agent 作用域不可用」**逐字同形**（模型无法区分「被隔离」与「不存在」，不构成存在性探测）；参数缺失/非字符串交回上游自身校验；原生与 PTC 内层调用走同一管线。
- **工具面口径修正（MODIFIED，行为修复）**：隔离的应拒集合由「配置声称（claimed）」改为「**已声称且加载未失败（claimed \ failedClaims）**」= 已加载 ∪ 加载中；`visible` 仍由「本工作区配置定义了哪些服务器」派生。效果：加载失败的 claim 不再误伤同名的 profile 级服务器，同时保留「工具已注册、隔离列表尚未重算」窗口的 fail-closed 保护。
- **三面同源**：工具/名字/资源三面共用同一归属判定与同一刷新路径（`agent/created` 串行 attach、`tools/change`/重扫 → 重算），无新配置开关、无新运行时依赖、无上游源码修改、不新增每 agent 连接。
- **明确不纳入**：profile 级 MCP 的隔离（profile 行无工作区归属语义）、人类 UI（`session-tool-toggle` 面板 `shadowed` 与 `/tools` 输出，属管理员视图）、跨工作区同名 `serverName` 复用、上游包修改、每 agent 独立 MCP 连接。
- **文档与证据**：改写插件 README 的非目标与机制说明，补三面边界、`blocked`/`visible` 口径、降级矩阵（无 `systemPrompt` / 无 `mcpResources` / 段格式漂移 / HMR 后存量会话 / agentless 调用）、残余边界（人类 UI、全局注册层、升级前历史会话）与回滚代价；根 `README.md` / `AGENTS.md` 插件描述各一行更新；隔离实例端到端冒烟证据归档到变更目录。

## Capabilities

### New Capabilities

（无——能力全部并入既有 `dsh-project-mcp`，不新开 catch-all 能力）

### Modified Capabilities

- `dsh-project-mcp`：
  - `工作区可见性隔离` —— 从「工具可见性」扩为「工具、名字、资源三面」；新增口径条款：只隔离「本插件已声称且加载未失败」的项目服务器，**加载失败的 claim MUST NOT 影响同名的非项目（profile 级）服务器**；名字面与资源面的 fail-closed、profile 不受影响、PTC 一致等场景。
  - 新增需求 `资源服务器名与资源面的隔离` —— 资源服务器名段与服务器指令段的隔离、三个资源工具的服务端归属 gate、解析失败降级、无归属全隐、升级前历史不追溯。
  - `隔离的动态刷新` —— 重算范围从工具集扩为「工具集 + 名字面可见集 + 资源面可访问集」，同一刷新路径与幂等要求不变。

## Impact

- **代码**：仅 `plugins/project-mcp/`（宿主半：新建名字面过滤模块；扩展 `isolation.ts` 的三面闸门与口径、`mcp-manager.ts` 的失败/可拒集合读数、`index.ts` 接线；测试与 `lib/` 产物；构建配置不变）；无其他插件源码改动。
- **依赖与基线**：不新增运行时依赖与 devDep，DSH 基线保持 `0.2.1-rc.2`；不改/patch/vendor 上游包；不新增配置键（行为默认生效）。
- **兼容性**：名字面依赖上游模型可见文本形态（`mcp-resource-servers` 段与 `mcp:<server>` 段名），解析失败走 fail-closed 删段 + 告警，不阻断装配；工具面口径修正只改变「claim 加载失败」这一边缘场景的判定（属缺陷修复），既有单测与冒烟需同步更新；升级无需迁移数据。
- **文档与规范**：插件 README、根 README/AGENTS、`openspec/specs/dsh-project-mcp/spec.md`（delta）；证据归档 `openspec/changes/project-mcp-name-resource-isolation/artifacts/`。
- **残余边界（如实记录，不在本次交付）**：人类 UI 仍显示项目名（管理员视图）；名字仍存在于全局工具/资源注册表（未来新增的「全局读名字」消费者仍可见）；升级前已进入会话历史的名字不可清除；profile 级名字保持全局可见。
