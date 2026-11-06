# `@dsh-plugins/host-kit`

DSH **host 半**的共享运行期内核：归属判定、目录监听、重扫触发器、工作区根枚举、日志适配与
真实 `node:fs` seam。被 `dsh-plugin-project-mcp`、`dsh-plugin-user-commands`（波 2）与
`dsh-plugin-session-tool-toggle`（波 2 的适配器）以 **TypeScript 源**消费，由各包的 esbuild
构建就地内联——产物里没有 `@dsh-plugins/host-kit` 这个词（AR1/B3 断言）。

- `private`、`0.0.0`、`dependencies: {}`：`exports` 的 `types` 与 `default` 都指向
  `./src/index.ts` / `./src/*.ts`，消费方靠根 `tsconfig.plugin.base.json` 的 `paths` 做
  类型解析、靠 esbuild 的 package exports 解析做构建期内联（双轨解析）。
- 零 `@deepseek-ai/*` 依赖与 import：所有宿主面都是**结构端口**（`RealpathPort` /
  `WatchIo` / `TriggerContext` / `RootEnumeratorContext` / `LogSink`），`AR2` 断言自动纳管。

## 设计约定：内核只报告上溯事实，不决定未命中结果

归属判定的**走法**（逐级 canonical 上溯、最近层优先、同层主根压倒附加根、先写先得、答复保留
登记拼写）是两包必须逐字一致的部分，因此收进内核的 `walkUp` / `RootAttributor`。但
「什么都没命中」在两个消费方意味着不同的东西：

- `dsh-plugin-project-mcp` 的**策略是 fail-closed**：没命中就 `null`，该会话看不到任何项目级
  MCP 服务器。`RootAttributor.attribute()` 返回 `Attribution | null` 只是把这个最常用读法
  提供成便捷方法。
- `dsh-plugin-user-commands` 的归属适配器会在未命中时保留**退化的 canonical cwd 键**，让会话
  仍能拿到用户级与内置命令。它使用 `walkUp()` 的 `WalkResult`：`hit` 缺席是事实，
  `canonicalCwd`（**cwd 自己那一级**，祖先成功不算）是适配器可以自行处置的另一个事实。

内核因此**不**把「未命中 = 拒绝」写死进 `walkUp`；miss 是调用方的策略。同理，`DirectoryWatcher`
不决定重扫做什么、`installTriggers` 不读事件载荷、`workspaceRoots` 不决定扫描顺序之外的仲裁
——内核只搬运事实，包保留自己的语义。

## 两条硬纪律（规范级断言守护）

1. **#3 裁定：`primaryRoot` 是唯一权威，`roots[0]` 只是期望**。当 `roots[0] !== primaryRoot`
   时，内核仍以 `primaryRoot` 进主根层，把 `roots` 中所有**值不等于** `primaryRoot` 的项按原
   顺序进附加根层，不丢任何根，并通过 `RootIndexOptions.onAnomaly` 报一条诊断。同一
   `primaryRoot` 被重复登记时主根层先到先得并同样诊断；返回的根集合始终属于胜出工作区。
   `test/attribution.test.ts` 的表驱动用例与异常用例逐条钉住这些断言。
2. **索引重建是原子的**：`buildRootIndex()` 先完整构造新表，`RootAttributor.update()` 只做
   一次引用赋值。进行中的 `attribute()` 在调用开始就快照索引，因此并发重扫期间仍返回**旧索引
   的完整结果**，不会退回 fail-closed、也不会读到半表（G6 会把它复现为回归）。

## 消费方适配器指针（波 2）

| 消费方 | 适配器保留的本地语义 |
| --- | --- |
| `plugins/project-mcp/src/host/{attribution,roots,triggers}.ts` | 薄再导出；`Attributor` → `RootAttributor`、`RealpathIo` → `RealpathPort` 的别名；直接取 `hit` 的 fail-closed 策略 |
| `plugins/user-commands/src/host/attribution.ts` | 薄再导出；未命中时用 `canonicalCwd` 构造退化键（并发原子性由内核免费获得） |
| `plugins/project-mcp/src/host/watcher.ts` / `user-commands/src/host/watcher.ts` | 各自的阶梯（`.dsh/mcp` 三档 + `fallbackToLast` / `.dsh/commands` 三档 + 用户级双档），内核只提供 `deepestExisting` / `ladderTargets` / `DirectoryWatcher` |
| `plugins/project-mcp/src/host/host-io.ts` / `user-commands/src/host/host-io.ts` | `nodeScanIo` / `nodeCommandIo` 与 `$DSH_HOME` 解析留本地，`nodeRealpathIo` / `nodeWatchIo` 取自内核 |
| `plugins/session-tool-toggle/src/host/attribution.ts` | ~45 行策略适配器（`WorkspaceAttribution` 形状与 canonical-cwd 键策略） |

包特有的类型（pm 的 `ScanIo`、uc 的 `CommandIo` / `DirEntry`、stt 的 `SpecLog` 的本地字段）
**不进内核**：内核只承载两包公共形状。日志前缀是参数（`createLog(ctx, prefix)`），
双通道纪律（logger + console）见 `src/log.ts` 的 docblock。
