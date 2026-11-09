# Proposal

## Why

统一「工作区配置」页面的「会话管理」分节信息展示不足：已迁移域的行首是裸目录名（≈会话 id，UUID 形态），无法辨认是哪个会话；三域行内可用信息（创建时间、工作区归属、项目目录、fork 关系等）已有数据面却未展示，长列表（上限 2000 条）下定位条目困难。

## What Changes

- **已迁移域行首显示会话名称**：`list-migrated` 枚举时从归档日志 `session.v4.jsonl.zstd` 前缀提取标题（zstd 帧边界结构扫描 + 逐帧解压 + 首个 `session/title` 事件即停，解压文本预算 256KB）与创建时间（header 行 `createdAt`）；标题不可得时回退目录名短码（前 16 字符 + `...`）。存量归档条目同样生效，不改处置流程、不写用户数据目录。
- **`MigratedEntry` 线上契约扩展**：响应条目新增可选字段 `title?` / `createdAt?`（缺失即不写键）；请求契约、端点集合、`dsh.client.inject`、依赖表零变化。
- **三域信息展示增强（两行式行布局）**：已迁移域次行显示「id 短码 · 匹配工作区名（无匹配回退归档目录名）· 体积 · 迁移时间（紧凑绝对，当年省年；创建时间并入悬停）」；活跃/已归档域行新增项目目录尾段与 fork 徽标（`parentId` 非空且非 subagent）。
- **其他易用性优化**：域 tab 计数徽标（口径=过滤后可见行数）、列表关键字过滤框（匹配标题/id/目录名/项目目录/工作区名，大小写不敏感；全选与动作输入只作用于过滤后可见行；各 tab 过滤词独立保留）、已迁移 tab 显示归档根绝对路径。
- **文档与规范**：`dsh-web-ux-session-manager` spec 两条需求 delta（「已迁移会话管理」「批量线上契约」）；README「会话管理」节同步（含标题近似性已知限制：约 6.1% 条目显示的是日志前缀内的首个标题、可能被后续再生成取代，0.5% 无标题事件回退短码）。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `dsh-web-ux-session-manager`：已迁移域的行标识从「目录名」升级为「尽力显示的会话标题 + 缺失回退短码」，列表条目补充标题/创建时间可选字段；批量线上契约的 `list-migrated` 响应形状扩展（新增可选字段，既有字段不变）。

## Impact

- 代码：`plugins/web-ux`（宿主半新增 `src/session-log-title.ts` 纯逻辑读取器 + `src/index.ts` 的 `node:zlib`/`node:fs` 适配器；`src/migrated.ts` 枚举后置探测；client 半 model/视图/样式/文案扩展）——全部在根仓 dsh-plugins，无跨仓改动。
- 契约：`/web-ux` 通道 `list-migrated` 响应新增可选字段（宿主与 client 同包同装，无跨版本兼容负担）。
- 依赖：零新增（zstd 解压用 `node:zlib`，Node ≥22.15/24 自带；上游 jsonl 包的帧扫描器不经 exports 导出，故本插件内实现）。
- 测试：新增 2 个测试文件、扩展 7 个既有测试文件；spec 与 README 同步更新。
