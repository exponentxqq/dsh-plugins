# Design

> 本文件承载 `code-design.md`（随档副本，执行期权威）的深度契约六字段精编；逐行蓝图、完整接口签名与全部金表见副本 `code-design.md`。收敛依据见随档 `decisions.md`。

## Context

`plugins/web-ux` 现有「处置已归档会话」能力（spec `dsh-web-ux-session-delete`）是单会话路径：会话行 "..." 菜单 → `shell.overlay` 确认框 → 宿主 `/web-ux` 通道两端点（`preview-delete` / `delete-session`）。宿主纯流程层（`delete-session.ts`）不识 cordis、只依赖注入端口；契约层（`contract.ts`）双端内联、严格白名单校验；全部上游接触点软注册软降级。本设计在此骨架上叠加批量与已迁移域管理，不动既有单会话路径。

上游事实基线 `0.2.1-rc.5`（与 peer 范围一致）：`sidebar.footer.action`（list slot，owner props 仅 `{ wide }`）可作全局入口；视图选项菜单与工作区 "..." 菜单 items 硬编码、无注入口（收敛 Q1 换道依据）；`projectKey`（jsonl 持久化层的 cwd→目录名转义）有意有损且未导出；`sessionPersistence.list()` 每次即时扫盘；客户端 `workspaces` / `sessions` 快照可组装全部三域列表；`ClientWorkspaceModel.archiveSession(sessionId, { stopActivity })` / `unarchiveSession(sessionId)` 为批量归档/取消归档的上游单调用面。

## Goals / Non-Goals

**Goals:**

- 一处全局入口 + 工作区定向 + 三域（活跃/已归档/已迁移）批量操作，含无主条目聚合出口。
- 批量契约向后兼容：既有单会话两端点与 parser 一字不动。
- 沿用既有分层惯例：契约不 import `node:*` / `@deepseek-ai/*`；纯流程不识 cordis；宿主产物自包含；全接触点软降级。

**Non-Goals:**

- 不改 DSH 上游主包；不做「所有会话」总管理视图（Q1 裁定）；不做自动停止 running 会话（R2）；不做共享附件 GC / undo / 列表轮询 / 虚拟滚动（U1–U3、A9）。

## 栈识别结论（必须留档）

| 项 | 结论 |
| --- | --- |
| 技术栈 | TypeScript + React 18 + esbuild + vitest + cordis 插件包（双端：宿主 ESM 半 / 浏览器半） |
| 证据 | 无 `pom.xml` / `build.gradle` / `nuxt.config.*`；`package.json` 依赖 `react`/`esbuild`/`vitest`；`build.mjs` 双 esbuild 入口 |
| **writer** | **豁免（未触 writer 约束）**——Spring / Nuxt writer 均未命中，用户于阶段 1.7 派发前确认豁免；设计约束改以本仓 AGENTS.md 惯例 + 既有代码范式为准 |

## Decisions

完整决策表（D1–D18，每条含被否方案与反例）见随档 `code-design.md` ④。要点：

| ID | 决策 | 被否方案（摘要） |
| --- | --- | --- |
| D1 | 新增 5 端点按域命名：`preview-delete-batch` / `delete-session-batch` / `list-migrated` / `delete-migrated` / `restore-migrated` | 万能端点+op 字段（形状分叉）；折进既有端点（老契约双形状） |
| D2 | 批量预览宿主一次算清（级联闭包并集 + 合并统计） | 客户端逐条求和（headers 拿不到、口径散） |
| D3 | 迁移域请求体用 `{ projectDir, dirName }`，目录名即会话标识、不做前缀归一（D12：实测 `session-<uuid>` 就是当前 id 形态） | 只传 sessionId（同 id 可在多项目目录各一份，定位不唯一） |
| D4 | 恢复目标路径取自归档树自身（`sessions/<projectDir>/<dirName>`）；`projectKey` 只用于「条目↔工作区」匹配，永不用于写路径 | 用 projectKey 正推目标路径（有损转义会写错位置） |
| D5 | `projectKey` 本地镜像（`src/project-key.ts` 零 import + 真实数据金表测试） | import 上游（未导出且不发 src，实测 `MODULE_NOT_FOUND`；会破坏宿主产物自包含断言） |
| D6 | 恢复后广播 `api-session/added`（真实 header 优先，未命中只 warn） | 不广播（归档集合已含该 id 而列表无行 → 用户以为恢复失败） |
| D7 | 入口 = footer 触发 + `shell.overlay` 浮层，store 桥接（同既有删除对话框模式） | footer 内直渲染 Modal（侧栏折叠动画会卸掉浮层） |
| D8 | 单 Modal 内阶段切换（select→confirm→running→done/failed），不嵌套第二 Modal | 嵌套 Modal（Escape/焦点两层遮罩自管，测试双 portal） |
| D14 | tab 2 行集 = 归档集合 ∩ 所选工作区成员，滤 `origin==='subagent'`；伪选项下并入无主已归档（P1=A） | 全局归档集合（与工作区定向冲突）；不过滤子代理（与级联语义打架） |
| D15 | running 行**置灰不可选** + 服务端拒绝兜底竞态 | 仅执行期失败报告（多一次整单往返才见失败） |
| D16 | 新失败码 `not-migrated` / `target-exists`，不复用 `not-found`（排查方向不同） | 复用 not-found（文案误导去侧栏找会话） |
| D17 | 单会话入口与对话框保留不动（批量是叠加） | 用管理面替换单删入口（高频短路径变长路径） |
| D18 | 新 entry 软注册 + 渲染期软读服务，不加客户端硬依赖 | 硬依赖 workspaces/sessions（服务晚就绪会拖挂徽章等既有能力） |

**落档期增补裁定（第四轮分歧点，详见 decisions.md）**：P1=A（伪选项扩展到 tab 2，孤儿已归档有出口）；P2=A（`MAX_BATCH_TARGETS = 500`，全选截断提示 + README 分批序列）；P3=A（恢复后停在原 tab 显示结果）；**增补**：tab 2 新增「批量取消归档」——客户端循环上游 `unarchiveSession` 逐项报告（T1 同款例外），宿主端点零增量，与「删除」共享选择集合、在途互斥。

## 触达面清单

完整清单（34 文件 + 上游只读依赖 + 有意不触达）见随档 `code-design.md` ①。生产代码：

| 域 | 文件（`plugins/web-ux/`） | 动作 |
| --- | --- | --- |
| 契约 | `src/contract.ts` | 改：端点 2→7、失败码 8、3 上限常量（`MAX_BATCH_TARGETS=500` / `MAX_LISTED_MIGRATED=2000` / `MAX_PATH_SEGMENT=255`）、10 新类型、4 新 parser、`WebUxRequest` 判别联合；`parseDeleteRequest` 原样保留 |
| 共享 | `src/project-key.ts` | **新建**：`projectKey(cwd)` 镜像 + `workspaceForProjectDir()`，零 import |
| 宿主流程 | `src/delete-session.ts` | 改：`collectDeleteSetMany` / `planDeleteBatch` / `previewDeleteBatch` / `deleteSessionBatch` / `archiveSessionBatch`（共用私有 `disposeBatch`）；`FileSystemOps.lstat` 增可选 `mtimeMs` |
| 宿主流程 | `src/migrated.ts` | **新建**：已迁移域 `listMigrated` / `deleteMigrated` / `restoreMigrated` + `createArchiveFiles` 文件工厂 + `SESSION_ADDED_EVENT` |
| 宿主接线 | `src/index.ts` | 改：`parseRequest`+switch 七分支；`HostPorts` 合并两域；端口 +5（`listWorkspaces`/`attachToWorkspace`/`readdToArchiveSet`/`announceRestored` 等）；`api-session/added` 广播 |
| 客户端 | `src/client/delete-client.ts` | 改：`callEndpoint` 抽出；`SessionManagerClient` 增 5 方法 |
| 客户端 | `src/client/session-manager-store.ts` / `session-manager-model.ts` | **新建**：打开请求 store（同 delete-store 模式）/ 纯派生模型（过滤、选择、上限、伪选项全集中于此） |
| 客户端 | `src/client/SessionManagerTrigger.tsx` / `SessionManagerDialog.tsx` / `session-manager.module.css` | **新建**：footer 入口（宽窄两形态）/ 管理浮层（工作区选择 + 三 tab + 五阶段机 + 四动作分派）/ 样式 |
| 客户端 | `src/client/index.ts` | 改：2 新 entry（`MANAGER_TRIGGER_ORDER=100`、`MANAGER_OVERLAY_ORDER=520`）+ 渲染期软读 |
| 文案 | `src/client/locales.ts` | 改：~58 新键（`manager.*` + 新错误码），zh canonical、en 同键镜像 |
| 元数据 | `package.json`（inject +3、devDeps +2）、两个 tsconfig include、`cordis.patch.yml` 注释、`README.md`、`lib/` 重建 | 改 |
| 测试 | `test/` 新增 5 + 扩展 8（契约/流程/接线/RPC/model/trigger/dialog/bundle/stubs/locale-parity/client-apply） | 改/新建 |

上游（`0.2.1-rc.5`）全部**只读依赖**：slot 声明、`ClientWorkspaceModel`、`SessionSummary`、primitives、`api-session/added` 事件面。

## 接口与数据形状

完整签名见随档 `code-design.md` ③。核心：

- **端点族**：单会话两端点原样；批量删除 `{ sessionIds: string[] (1..500), mode }` → 预览 `{ targetCount, sessionCount, descendantCount, logBytes, archiveRoot, rejected: {id, code}[] }` / 执行 `DeleteOutcome`；迁移域 `{ projectDir, dirName }` 定位 → 列表 `MigratedListing`（条目：id、体积、mtimeMs、projectDir、truncated 标记）/ 删除预览+`DeleteOutcome` / 恢复 `RestoreOutcome`（逐条 `restored[]` 与 warnings）。
- **校验**：`readPathSegment` 统一路径片段规则（复用于 sessionId/projectDir/dirName）；未知字段拒绝；上限越界 `bad-request`。
- **纯流程**：`planDeleteBatch` 单次 `listStoredHeaders()`，逐目标三码校验（not-found/not-archived/session-live），通过者闭包并入 union（首见序去重）；`rejected.length > 0` 执行整单拒绝；`disposeBatch` 复用 `disposeAll` 语义（registry→文件→广播，失败不中止）。
- **客户端模型**：`ManagerTab`（active/archived/migrated）、`ManagerAction`（archive/delete/unarchive/deleteMigrated/restoreMigrated）、行派生（`activeRows`/`archivedRows`/`migratedRows`，子代理过滤 + 伪选项聚合 + 500 截断）、`workspaceChoices()`（真实工作区 + `'unassigned'`）。
- **失败语义分档**：删除/恢复（有文件动作）= 预览软失败 + 执行整单拒绝；批量归档/取消归档（可逆 registry 操作）= 客户端循环逐项报告。

## 逐任务组实现要点

与 `tasks.md` 分组一一对齐（G1→组 1 … G8→组 8）；每组完整要点与验证命令见随档 `code-design.md` ⑤：

- **G1 契约层**：端点/类型/parser + `project-key.ts` 镜像（金表 12 条实测用例）+ 契约测试。验证：`pnpm --filter dsh-plugin-web-ux test -- contract project-key`；纯度 grep 无 `node:`/`@deepseek-ai`。
- **G2 宿主纯流程**：批量五函数 + `migrated.ts` 两阶段语义（先校验后动作；恢复 rename 优先 EXDEV 回退 copyTree）+ 测试。验证：`test -- delete-session migrated`；导出 grep。
- **G3 宿主接线**：dispatcher 七分支 + 端口装配 + `announceRestored` + 真实临时 `$DSH_HOME` 集成测试（含 `session-` 前缀目录、target-exists、attach 拒绝降级）。验证：`test -- index`；产物 grep ≥3 标记。
- **G4 客户端 RPC**：`callEndpoint` 抽取 + 5 方法 + parser 接线 + 测试（`toHaveBeenCalledWith`、坏形状 4 种）。验证：`test -- delete-client`。
- **G5 入口与浮层**：store/model/trigger/dialog/css + `client/index.ts` 注册 + stubs 补 `Checkbox`/`SegmentedTabs`/5 图标 + model/trigger/dialog/client-apply 测试。验证：`test -- session-manager client-apply`；typecheck。
- **G6 文案**：zh 先行 en 镜像（编译期 `satisfies` 钉死）+ locale-parity required 追加。验证：`test -- locale-parity`；`grep -c "^  'manager\." locales.ts` = 2×键数。
- **G7 测试收口与产物**：bundle.test CSS 断言 3→4 + 产物标记、tsconfig include 增补、package.json 元数据、重建 lib、`pnpm dsh:check` + 全仓回归。验证：`verify:all` + `pnpm -r test`。
- **G8 README/文档**：新增「会话管理」章节；改写三处旧论断（恢复入口、批量非目标）；双端结构树/tsconfig/版本迁移段更新。验证：grep 断言（新章节在、旧论断无、restore-migrated 在）。

## 设计假设与未决项

完整 A1–A15 / U1–U4 见随档 `code-design.md` ⑥。关键假设：A2（projectKey 只匹配不写路径，漂移最坏退化为未分组）；A3（目录名即 id，两代命名实测成立）；A6（list() 无缓存，恢复后立即可 attach）；A13（`Menu portal` 在 `Modal` 内可用，**实施第一步验证**，冲突则退化 `portal:false`）。未决项 U1–U4 均为实施层推荐（无进度反馈/无轮询/无 undo/排序取 updatedAt 倒序），不阻塞执行。设计期待决 P1–P3 已在落档前裁定（A/A/A + 取消归档增补），见 decisions.md 第四轮。

## Risks / Trade-offs

- [上游 slot/服务面漂移] → 全接触点软注册 + 类型面编译失败显性化（A1）；事件缺失降级为手动刷新（spec 已声明）。
- [projectKey 规则漂移] → 本地镜像金表测试钉住；只用于匹配不用于写路径（D4 安全边界）。
- [批量体积统计/归档枚举为磁盘 I/O] → 500/2000 上限 + 串行 measure 异步预览态 + 列表一层求和（D11）。
- [恢复的 attach 匹配错工作区] → 上游 `attachSession` header-cwd 二次校验兜底（A7），错配只 warning 不写错。
- [`Menu`/`Modal` 嵌套焦点冲突] → A13 实施首验，备选退化方案单点。

## Migration Plan

- 变更随插件 tag 发布；profile 侧 `dsh plugin add` 按 tag 重装（`dsh.client.inject` 变化需重启 profile）。
- 版本矩阵：新客户端 + 旧宿主 = 新端点全部 `bad-request`（文案兜底）；旧客户端 + 新宿主 = 单会话能力照旧（旧端点未动）。
- 回滚：卸载/降级插件 tag 即回退；磁盘数据无不可逆迁移（恢复/删除均是用户显式操作）。

## Open Questions

无（设计期 P1–P3 已裁定；U1–U4 为实施层推荐，按随档 code-design.md ⑥ 执行）。
