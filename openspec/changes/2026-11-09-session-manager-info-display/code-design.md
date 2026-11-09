# code-design.md —「会话管理」分节信息展示优化 · 阶段 1.7 代码级蓝图

> 角色：代码设计线（阶段 1.7）。输入：`explore.md`、`decisions.md`（已逐字读完）。
> 硬约束：栈识别已由主会话裁定为 `dsh-plugin-writer`（本会话经 skill 工具加载成功，§1 的锚点即
> `/home/xuqinqin/develop/person/dsh-plugins`），其「分层方向 / 复用优先 / 任务拆分粒度 / 构建与验证纪律」
> 是本设计的约束；`decisions.md` 的已定结论**不重开**，与代码事实的冲突只在文末「待决问题」上浮。
> 本文只回答「改哪些文件、怎么改、接口与数据长什么样、为什么这么定、怎么验」，不复述探索结论。
>
> 路径约定：仓库路径相对本仓根 `/home/xuqinqin/develop/person/dsh-plugins`；上游安装树记为
> `$UP = /usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai`。

## 0. 设计摘要

一句话：**宿主半新增一个「归档日志前缀读取器」（纯逻辑 + 注入端口），把标题与创建时间并入
`list-migrated` 契约；client 半新增一个纯格式化模块，把三域行改成两行式并补上域计数、过滤框与归档根显示；
配置键、端点集合、`dsh.client.inject`、依赖表、holder 全部零增量。**

| 收敛留痕 | 代码落点 | 本文决策 |
| --- | --- | --- |
| Q1-B 列表时读日志前缀（256KB 文本预算 / 帧粒度 / 首命中即停） | 新建 `src/session-log-title.ts`；`src/migrated.ts` 列表后置探测；`src/index.ts` 绑 `node:zlib` | D-01 / D-02 / D-03 / D-04 |
| Q2 回退短码目录名 | `src/client/session-manager-model.ts` 的 `titleOfMigrated` + `shortCodeOf` | D-07 / D-08 |
| Q3 字段全集 + 两行式 | 契约 2 个可选字段 + `MigratedRowView`/`SessionRowView` 扩字段 + 行 DOM 重排 | D-05 / D-09 / D-10 |
| Q4-a 域计数徽标 / Q4-b 过滤框 / Q4-c 归档根显示 | `ManagerFilters` + `filterSessionRows`/`filterMigratedRows`；tab label 徽标；`migratedBar` | D-11 / D-12 / D-13 |
| Q5 紧凑绝对时间 | 新建 `src/client/display-format.ts` | D-14 |
| Q6 过滤交互（大小写不敏感 / 全选只作用可见行 / 各 tab 独立） | 过滤判据全在 model；视图只接状态 | D-12 |
| Q7 主显迁移时间、创建时间进悬停 | 行时间元素 `title` 复合串 | D-14 |
| 工程细节：fork 徽标 / cwd 尾段 / 并发受限 / 逐条降级 | model 的 `isFork`/`projectDirTail`；`MIGRATED_PROBE_CONCURRENCY`；探测永不抛 | D-06 / D-10 |

改动规模：新增 2 个源文件（宿主读取器约 300 行、client 格式化约 70 行）、修改 7 个源文件
（`contract.ts` +35、`migrated.ts` +75、`index.ts` +45、`session-manager-model.ts` +130、
`SessionManagerDialog.tsx` +190/−70、`session-manager.module.css` +65、`locales.ts` +12）、
新增 2 个测试文件、修改 7 个测试文件、2 个 tsconfig 的 `include`、1 个 spec delta、README 6 处、
两个 `lib/*.js` 重建。**零新增依赖、零新增端点、零新增配置键。**

---

## ① 触达面清单

> 「仓」列：本变更全部在**根仓 `dsh-plugins`**；「包」列区分 `plugins/web-ux` 与仓级
> `openspec/`。没有子仓、没有第二个包。

### 1.1 源码（根仓 · 包 `plugins/web-ux`）

| 仓 / 包 | 文件 | 类型 | 改动意图 | 关键改动点 |
| --- | --- | --- | --- | --- |
| 根仓 · web-ux | `plugins/web-ux/src/contract.ts` | 改（约 +35 行） | `MigratedEntry` 扩两个可选字段 + 响应解析 | 新增 `title?: string`、`createdAt?: number`（JSDoc 写清「缺省 = 不可得」）；`parseMigratedListing` 用两个新辅助函数按「存在则校验、缺失则不写键」处理；响应体未知字段仍容忍（不加白名单） |
| 根仓 · web-ux | `plugins/web-ux/src/session-log-title.ts` | **新建**（约 300 行） | 归档日志前缀读取器：规范文件名挑选、zstd 帧结构扫描、逐帧解压、首个 `session/title` 提取、header `createdAt` 提取、字节预算 | 纯模块（零 `node:*`、零上游 import）：`chooseSessionLogName` / `iterateZstdFrames`（惰性生成器，异常即止）/ `probeSessionLogPrefix`（同步）/ `probeSessionLog`（异步两段前缀）；常量 `TITLE_TEXT_BUDGET_BYTES=256KiB`、`INITIAL_LOG_PREFIX_BYTES=128KiB`、`MAX_LOG_PREFIX_BYTES=512KiB` |
| 根仓 · web-ux | `plugins/web-ux/src/migrated.ts` | 改（约 +75 行） | 枚举时给条目补标题/创建时间 | `MigratedPorts` 增可选 `log?: MigratedLogOps`；`listArchiveEntries` 增加 `log` 形参，先完成原有枚举与体积统计，再以并发 3 后置探测，结果用条件展开并入条目；探测永不抛、不产生 warnings；`listMigrated` 的 `Pick` 增 `'log'` |
| 根仓 · web-ux | `plugins/web-ux/src/index.ts` | 改（约 +45 行） | 宿主适配器：把 `node:fs/promises` 的 `open/read` 与 `node:zlib` 的 `zstdDecompressSync` 接到端口 | 新增模块级 `createNodeLogOps()`（特性探测：`typeof zlib.zstdDecompressSync === 'function'`，否则返回 `undefined` → `log` 端口缺省）；`createPorts` 的返回对象增 `log` 字段（条件展开） |
| 根仓 · web-ux | `plugins/web-ux/src/client/display-format.ts` | **新建**（约 70 行） | 三处显示派生的单一来源：id 短码、cwd 尾段、紧凑绝对时间 | `shortCodeOf`（16 字符 + `…`）、`tailSegmentOf`（POSIX/Windows/根/空）、`formatCompactTimestamp(epoch, now?)` 返回 `{text, full}`；纯函数、零 React |
| 根仓 · web-ux | `plugins/web-ux/src/client/session-manager-model.ts` | 改（约 +130 行） | 行视图扩字段 + 过滤/计数判据 | `SessionRowViewInput` +`cwd?`/`parentId?`；`SessionRowView` +`cwd`/`projectDirTail`/`isFork`；`MigratedRowView` +`title`/`titleSource`/`createdAt`/`workspaceTitle`/`shortId`；新增 `ManagerFilters`/`EMPTY_FILTERS`/`withTabFilter`/`normalizeFilterQuery`/`filterSessionRows`/`filterMigratedRows` |
| 根仓 · web-ux | `plugins/web-ux/src/client/SessionManagerDialog.tsx` | 改（约 +190 / −70 行） | 两行式行布局、过滤框、域计数、归档根行、时间悬停 | 新增 `filters` state 与三份可见行集；`rows` 一律换成可见行；tab label 追加 `aria-hidden` 计数徽标；`migratedBar` 收编刷新按钮 + 归档根；两处行渲染改两行结构（Checkbox 仍是唯一可访问名）；`formatTime` 换成 `formatCompactTimestamp` |
| 根仓 · web-ux | `plugins/web-ux/src/client/session-manager.module.css` | 改（约 +65 行） | 两行式几何 + 过滤/计数/归档根类 | `.row` 改 `flex-wrap` 容器、`.row > :first-child` 改 `flex:1 1 0`；新增 `.rowBadges`、`.rowMetaRow`、`.tabCount`、`.filterRow`、`.filterInput`、`.migratedBar`、`.archiveRoot`；类名契约注释同步 |
| 根仓 · web-ux | `plugins/web-ux/src/client/locales.ts` | 改（+6 键 × 2 语言） | 过滤、过滤空态、fork 徽标、三个时间悬停标签 | 见 3.8；zh 为 canonical，en 用既有 `satisfies Record<Key, string>` 钉死 |

### 1.2 测试（根仓 · 包 `plugins/web-ux`）

| 仓 / 包 | 文件 | 类型 | 改动意图 | 关键改动点 |
| --- | --- | --- | --- | --- |
| 根仓 · web-ux | `plugins/web-ux/test/session-log-title.test.ts` | **新建**（约 220 行） | 读取器逐条契约 | 规范名挑选（v0/vN/`.zstd`/非规范名）；单段帧与**流式帧（Single_Segment=0，断言 FHD bit5=0 证明走了 Window_Descriptor 分支）**；header 在第一帧；title 在第二帧；预算耗尽；尾部撕裂；结构性损坏后停止但保留已得字段；解压抛错；非压缩日志分支；空文件 |
| 根仓 · web-ux | `plugins/web-ux/test/migrated.test.ts` | 改（约 +90 行） | 列表探测的流程契约 | 注入 fake `log` 端口：断言条目携带标题/创建时间、缺 `log` 时字段缺省、无规范日志时零读取、探测抛错不影响列表、并发上限 ≤3、每条目读取次数 ≤2、`warnings` 不新增 |
| 根仓 · web-ux | `plugins/web-ux/test/contract.test.ts` | 改（约 +30 行） | 新字段校验三分 | 存在且合法接受；缺失时结果对象**不含**该键（`'title' in value === false`）；类型非法/空串/负值/0/Infinity 拒绝并带字段名 |
| 根仓 · web-ux | `plugins/web-ux/test/index.test.ts` | 改（约 +50 行） | 适配器真链路 | 新增一条：用 `zstdCompressSync` 拼接真实 zstd 帧写进归档目录，`list-migrated` 返回 `title`/`createdAt`；坏字节日志仍返回条目（字段缺省），无新增 warning |
| 根仓 · web-ux | `plugins/web-ux/test/display-format.test.ts` | **新建**（约 90 行） | 三个纯格式化 | 16/17 字符边界；尾段（`/a/b/`、`C:\a\b`、`/`、`undefined`）；同年 `MM-DD HH:mm`、跨年 `YYYY-MM-DD HH:mm`、`full === toLocaleString()`、`0`/`NaN` → `—` |
| 根仓 · web-ux | `plugins/web-ux/test/session-manager-model.test.ts` | 改（约 +110 行） | 行派生与过滤 | 标题来源/回退、`createdAt` 归一、`workspaceTitle` 替代/回退、`shortId`、`projectDirTail`、`isFork`（`parentId` 非空且非 subagent）、过滤三口径（大小写/字段/跨 tab 独立）、过滤后全选与计数、动作输入只含可见行 |
| 根仓 · web-ux | `plugins/web-ux/test/session-manager-dialog.test.tsx` | 改（约 +160 行） | 视图契约 | 两行渲染（标题、次行 id/工作区/体积/时间）；回退短码；fork 徽标；tab 计数（`aria-hidden` 且可访问名不变）；过滤输入 → 行收窄 / 过滤空态 / 全选只选可见 / 切 tab 保留过滤词；归档根行；时间元素 `title` 含创建时间；`selectedTabLabel` 助手改为按可访问名断言（约 8 处调用点机械替换） |
| 根仓 · web-ux | `plugins/web-ux/test/locale-parity.test.ts` | 改（+6 行） | 新键进「界面真正会读的键」清单 | `REQUIRED_KEYS` 追加 6 个新键（键集合双向相等由共享检查守住） |
| 根仓 · web-ux | `plugins/web-ux/test/bundle.test.ts` | 改（+2 断言） | 分层纪律的产物证据 | 宿主 `lib/index.js` 含 `node:zlib`（自包含断言已允许 node 内建）；客户端 `lib/client.js` **不含** `node:zlib`/`zstd` |
| 根仓 · web-ux | `plugins/web-ux/tsconfig.host.json` | 改（+2 行） | 新宿主源码与用例进 host program | `include` 追加 `src/session-log-title.ts`、`test/session-log-title.test.ts` |
| 根仓 · web-ux | `plugins/web-ux/tsconfig.client.json` | 改（+1 行） | 新 client 纯模块用例进 client program | `include` 追加 `test/display-format.test.ts` |

### 1.3 产物（根仓 · 包 `plugins/web-ux`，随仓库提交）

| 仓 / 包 | 文件 | 类型 | 说明 |
| --- | --- | --- | --- |
| 根仓 · web-ux | `plugins/web-ux/lib/index.js` | 重建 | 宿主半：新增 `node:zlib` 外置 import、读取器与端口装配内联 |
| 根仓 · web-ux | `plugins/web-ux/lib/client.js` | 重建 | 浏览器半：新增 `display-format`、model/视图/文案/CSS 变更内联；`require` 词集合不变（仍 3 项） |

### 1.4 规范与文档

| 仓 | 文件 | 类型 | 改动意图 | 关键改动点 |
| --- | --- | --- | --- | --- |
| 根仓 | `openspec/changes/2026-11-09-session-manager-info-display/specs/dsh-web-ux-session-manager/spec.md` | **新建**（delta） | 两条 requirement 的 MODIFIED delta | 「已迁移会话管理」改写标题/创建时间/行标识语义与 3 个 scenario；「批量线上契约」补 `MigratedEntry` 可选字段与 1 个 scenario；文本见 TG5 |
| 根仓 | `openspec/changes/2026-11-09-session-manager-info-display/` 的 `proposal.md` / `design.md` / `tasks.md` / `.openspec.yaml` | 其他阶段产物 | 本设计**不写**；由落档阶段生成 | `pnpm spec:check` 严格校验要求四件套齐备才能通过（见 TG5 前提） |
| 根仓 | `openspec/specs/dsh-web-ux-session-manager/spec.md` | **本次不改** | 能力真源，两条 requirement 在 `:89-111`（已迁移会话管理）与 `:113-130`（批量线上契约） | 变更落档后由 OpenSpec 归档把 delta 合入；实施期手改会与 delta 双写 |
| 根仓 | `openspec/specs/dsh-web-ux-session-delete/spec.md` | **零改动**（decisions 已定） | — | 处置语义与投影缓存删除语义不变 |
| 根仓 · web-ux | `plugins/web-ux/README.md` | 改 6 处 | 用户可见能力与运维事实 | ①`:249` 已迁移 tab 行（标题尽力显示/回退短码/创建时间/两行式/id 短码）；②`:251` 行标题与徽标段（两行式、fork 徽标、active/archived 的项目目录尾段）；③`:313-317` 边界与已知限制（标题近似 6.1%、无标题 0.5%、256KB 预算、只读不轮询、不计日志读取耗时保证）；④`:351-355` 双端结构（`src/session-log-title.ts`、`src/client/display-format.ts`）；⑤`:370-371` 两个 tsconfig 的文件清单；⑥新增 `### 版本迁移（会话信息展示）`（无配置键、无端点变更、契约向后兼容） |

### 1.5 明确零改动面（写出来是为了让实施期不接受「顺手也改一下」）

- `plugins/web-ux/src/config.ts`、`archiveRoot` 配置键、`cordis.patch.yml`、`package.json`
  （无新增依赖：`node:zlib` 是内建；`dsh.client.inject` 仍 11 项；peer 范围不变）。
- `plugins/web-ux/src/contract.ts` 的 **请求** 契约（`MigratedRequest`/`MigratedTarget`/端点名/失败码）
  与 `parseRequest`：本次只扩**响应**形状。
- `plugins/web-ux/src/delete-session.ts`、`src/project-key.ts`、`src/client/index.ts`
  （分节注册与注入面不变）、`src/client/delete-client.ts`（`listMigrated()` 的返回类型由 `MigratedListing` 自动带上新字段）。
- `plugins/web-ux/src/migrated.ts` 的 `createArchiveFiles` / `ArchiveFileLayout`：文件工厂继续只服务
  删除与恢复；列表走 `listMigrated`（生产路径），不给工厂加日志端口以免两处列表行为分叉。
- 根仓 `plugins/workspace-config`（holder）：分节座位契约、owner 份额三态、页面壳零改动。
- `plugins/web-ux/README.md` 的「非目标」「失败码」「恢复语义」节：语义无变化，不加条目。

---

## ② 证据锚

> 每条都是**代码事实**（本会话逐行读取得出），不是探索散文。行号对应当前工作树。

### 2.1 宿主半（`plugins/web-ux/src`）

| 模块 | 证据 | 在设计里的作用 |
| --- | --- | --- |
| 迁移条目类型（现状） | `src/contract.ts:190-201`（`MigratedEntry` 仅 `sessionId/dirName/projectDir/bytes/updatedAt`） | 新字段的落点与「不写空串」规则的基座 |
| 列表响应与上限 | `src/contract.ts:203-211`（`MigratedListing`）、`:259`（`MAX_BATCH_TARGETS=500`）、`:265`（`MAX_LISTED_MIGRATED=2000`） | 探测只对已列出的 ≤2000 条跑；截断语义不变 |
| 列表解析器 | `src/contract.ts:608-642`（逐字段必填、`truncated` 布尔） | 新字段用「存在则校验、缺失则不写键」插入同一循环；响应未知字段本就容忍 |
| 解析辅助函数 | `src/contract.ts:321-326`（`readNonEmptyString`）、`:327-339`（`readNonNegativeNumber`）、`:275-286`（`readObject`） | 两个新辅助函数按下限/正数语义与之并列，不复制校验风格 |
| 路径片段上限 | `src/contract.ts:272`（`MAX_PATH_SEGMENT=255`） | 解释「目录名可直接当显示输入」与短码只做显示 |
| 迁移文件端口 | `src/migrated.ts:64-67`（`MigratedFileOps` 只 6 个原语、**无 `readFile`**） | 日志读取必须走**新增独立端口**，不能塞进 `MigratedFileOps`（否则内存 fake 与恢复/删除用例全要扩） |
| 迁移端口面 | `src/migrated.ts:70-87`（`MigratedPorts` 的 `archiveRoot`/`homePath`/`fs`/`listWorkspaces`/…/`warn`） | `log?: MigratedLogOps` 加在这里；可选 ⇒ 删除/恢复与既有测试零改动 |
| 枚举循环 | `src/migrated.ts:365-448`；`:396-445` 是二级循环；`:421-437` 统计一层体积；`:438-444` 组装条目 | 探测必须在体积统计之后（`members` 已在手，可直接挑日志名），且 `entries.push` 之后按下标回填 |
| 截断点 | `src/migrated.ts:417-420`（到 2000 条即 `truncated=true` 并 break） | 探测集合 = 返回集合，不会多读一条 |
| 列表出口 | `src/migrated.ts:595-611`（`listMigrated` 的 ports 只 Pick 归档根、文件原语与 warn 三个字段） | `Pick` 增 `'log'`；`createArchiveFiles.list`（`:572-574`）不扩（见 1.5） |
| 文件工厂 | `src/migrated.ts:564-584`（`list/remove/restore` 三方法） | 明确不改：只有测试调用 `files.list`（`test/migrated.test.ts:620`） |
| 宿主文件适配 | `src/index.ts:260-271`（`nodeFileSystem` 的 `readdir/lstat/rm/unlink/mkdir/rename/copyFile`） | 新适配器与之并列、同样模块级无状态；`open/read` 不塞进 `FileSystemOps` |
| 端口装配 | `src/index.ts:305-316`（`createPorts` 解析 home 与归档根、`createSessionFiles`）、`:320-323`（返回对象首字段） | `log` 字段与 `archiveRoot` 在同一次装配里给出，缺失时不影响其它端口 |
| 恢复广播 | `src/index.ts:364-391`（`announceRestored` 只发真实存在 id） | 不在本次范围；证明宿主已有「软失败只告警」的既有风格可沿用 |
| 既有软失败风格 | `src/index.ts:346-349`、`:387-389`（广播失败只 `logger.warn`） | 探测失败连 warn 都不发（D-04）时需要说明为什么比既有风格更静默 |

### 2.2 client 半（`plugins/web-ux/src/client`）

| 模块 | 证据 | 在设计里的作用 |
| --- | --- | --- |
| 行输入投影 | `src/client/session-manager-model.ts:106-117`（`SessionRowViewInput` 只有 `displayTitle/running/updatedAt/blank/origin`） | 必须补 `cwd?`/`parentId?` 才能出「项目目录尾段」与 fork 徽标 |
| 两域行视图 | `...session-manager-model.ts:131-148`（`SessionRowView`） | 新字段 `projectDirTail`/`isFork` 的落点 |
| 迁移行视图 | `...session-manager-model.ts:151-168`（`MigratedRowView` 八字段） | 新字段 `title/titleSource/createdAt/workspaceTitle/shortId` 的落点 |
| 行构造 | `...session-manager-model.ts:224-241`（`sessionRow`）、`:249-260`（`migratedRow` 直接透传 `entry.*`） | 派生点：标题回退、工作区名替换、短码、尾段、fork 判定都在这里，视图零判据 |
| 迁移行集 | `...session-manager-model.ts:419-436`（`migratedRows` 用 `workspaceForProjectDir` 只拿 id） | `workspaceTitle` 需要按 id 二次查 `items`（`WorkspaceRowView.title` 在 `:86-95`） |
| 选择口径 | `...session-manager-model.ts:284-292`（`selectableKeys`）、`:522-528`（`selectAllSelection`）、`:541-550`（`allSelected`）、`:562-573`（`selectedCount`）、`:602-615`（`selectedSessionIds`） | 只要视图把「可见行」传进来，全部口径自动变成「过滤后可见」——无需改这些函数 |
| 时间格式 | `src/client/SessionManagerDialog.tsx:352-354`（`formatTime = toLocaleString()`） | 换成 `formatCompactTimestamp`，`toLocaleString()` 保留为 hover 全串 |
| 三 tab 文案 | `...SessionManagerDialog.tsx:540-545`（`tabItems` 的 `label` 是纯字符串） | 计数徽标要在这里把 `label` 换成节点 |
| 派生段 | `...SessionManagerDialog.tsx:497-519`（三份行集 + `rows` + `truncatedCount`） | 可见行集与计数插在这里；`truncatedCount` 改用可见行 |
| 已迁移分支 | `...SessionManagerDialog.tsx:881-891`（刷新按钮）、`:925-954`（行：Checkbox label = `row.sessionId` + 三个 `rowMeta`） | 行改两行式、label 换 `row.title`、归档根行与刷新按钮同排 |
| 活跃/已归档分支 | `...SessionManagerDialog.tsx:955-986`（Checkbox label = 标题/未命名 + 时间 + running/blank 徽标） | 行改两行式并追加 fork 徽标与项目目录尾段 |
| 选择条 | `...SessionManagerDialog.tsx:893-915`（全选/已选/清空） | 传入可见行即可；过滤词不在这里（属于工具栏） |
| 空态文案 | `...SessionManagerDialog.tsx:529-538`（`emptyText` 三分支） | 保留「本来就空」的解释；新增「过滤后为空」文案需在渲染处先判 `unfilteredRows` |
| 列表上限提示 | `...SessionManagerDialog.tsx:515-519`、`:988-991` | 2000 与 500 两个口径的分支保持不变，只换成可见行 |
| 类名契约 | `src/client/session-manager.module.css:15-26`（类名清单注释）、`:139-193`（`.list/.row/.rowMeta`）、`:195-217`（`.badge*`） | 新类必须写进清单；`.row` 从单行 flex 改 wrap 容器，`.row > :first-child` 改 `flex:1 1 0` |
| 文案表 | `src/client/locales.ts:77-98`（tab/空态/徽标/meta）、`:114`（`manager.confirm.archiveRoot`） | 新键插入位；归档根行**复用** `manager.confirm.archiveRoot` |
| 客户端调用面 | `src/client/delete-client.ts:103`（`listMigrated(): Promise<MigratedListing>`）、`:205-209`（解析后返回） | 契约扩字段后客户端零改动即可消费 |
| 分节注册 | `src/client/index.ts:92-105`（装配导入）、注入面声明 `SessionManagerSectionInjected` 在 `SessionManagerDialog.tsx:229-236` | 本次不新增服务、不改注入面 ⇒ 这两处零改动 |

### 2.3 上游（只读依赖，全部零改动）

| 上游模块 | 证据 | 在设计里的作用 |
| --- | --- | --- |
| 帧扫描算法 | `$UP/dsh-session-persistence-jsonl/lib/index.js:1305-1364`（`scanZstdFrames`：magic → FHD → Window_Descriptor(仅 Single_Segment=0) → Dictionary_ID → FCS → 3 字节块头循环 → 校验和） | 新读取器的算法蓝本；`:1324`（`singleSegment = (descriptor & 32) !== 0`）、`:1329`（`remainingHeaderBytes` 含 `singleSegment ? 0 : 1`）是 Window_Descriptor 分支的唯一依据 |
| 帧解压用法 | `$UP/dsh-session-persistence-jsonl/lib/index.js:3402-3405`（先 `scanZstdFrames(content,1)` 取首帧、再 `decompressZstdFrame(subarray)`） | 证明「切出单帧再 `zstdDecompressSync`」是上游同款路径 |
| 日志文件名规则 | `$UP/dsh-session-format/lib/index.js:472-489`（`sessionFormatLogFilename`：v0 = `session.jsonl`，vN = `session.v{N}.jsonl`；`parseSessionFormatLogFilename` 拒绝临时/大写/前导零/`.v0`）+ `$UP/dsh-session-persistence-jsonl/lib/index.js:752-768`（`.zstd` 后缀） | `chooseSessionLogName` 的规范名正则与「最高版本优先」规则 |
| 事件行形状 | `$UP/dsh-session-persistence-jsonl/lib/index.js:960`（`JSON.stringify(sessionFormatCatalog.encodeCurrentEvent(event))`）+ `$UP/dsh-session-title/lib/types/types.d.ts:33-41`（`SessionTitleEventData.title`） | 行 = `{type, seq, time, data}`；标题取 `data.title`，事件类型字面量 `session/title` |
| 列表并发默认值 | `$UP/dsh-session-persistence-jsonl/lib/index.js:2304`（`DEFAULT_LIST_CONCURRENCY = 3`）、`:2436`（`pLimit`） | 探测并发取 3（镜像，不引入 `p-limit`） |
| 客户端行字段 | `$UP/dsh-api-session-controller/lib/types/client/sessions/service.d.ts:17-24`（`SessionSummary.title?`/`displayTitle`/**`cwd?`**/**`parentId?`**） | 「项目目录尾段」取 `cwd`、fork 徽标取 `parentId`（语义即 header 的 `parentSession`）；**字段名不是 `parentSessionId`** |
| 分节 tab 可承载节点 | `$UP/dsh-client-ui-primitives/lib/types/SegmentedTabs.d.ts:3-8`（`label: ReactNode`） | 计数徽标可进 `label` |
| Checkbox 支持悬停 | `$UP/dsh-client-ui-primitives/lib/types/Checkbox.d.ts:12-18`（`title?`） | 回退行/迁移行用 `title` 暴露完整目录名，不新增可访问名 |
| `Input` 原语 | `$UP/dsh-client-ui-primitives/lib/types/Input.d.ts:9-10`（`icon?`/`className?` + 原生属性） | 过滤框用它，不手写 input；`className` 落在 wrapper span（`test/stubs/ui-primitives.tsx:145-151` 同形） |
| `aria-hidden` 与可访问名 | 实测（本会话）：`dom-accessibility-api@0.5.16` 对 `活跃<span aria-hidden="true">7</span>` 计算得 `"活跃"` | 计数徽标 `aria-hidden` 的可行性证据（D-11），不是猜测 |

---

## ③ 接口与数据形状

### 3.1 `MigratedEntry` 新字段（`src/contract.ts`）

```ts
/**
 * 归档根下的一条已迁移会话。
 *
 * 新增两个**可选**字段：可选表达的是「这条日志读不出来」，而不是「宿主版本旧」。
 * 宿主只在真读到值时写键；读不到就不写，client 据缺省做回退——绝不用空串或 0 占位。
 */
export interface MigratedEntry {
  readonly sessionId: string
  readonly dirName: string
  readonly projectDir: string
  readonly bytes: number
  readonly updatedAt: number
  /**
   * 会话日志前缀内**首个** `session/title` 事件的标题（已 trim）。
   * 不承诺是日志里的最新标题（Q1-B 的近似语义）；不可得时缺省。
   */
  readonly title?: string
  /**
   * 会话日志 header 行的 `createdAt`（epoch ms，恒 > 0）。
   * header 不可读时缺省；**不会**写 0（0 在界面上会渲染成 1970）。
   */
  readonly createdAt?: number
}
```

**解析规则**（`parseMigratedListing` 的条目循环内，既有 5 个字段之后）：

| 字段 | 键缺失 | 键存在但非法 | 合法值 |
| --- | --- | --- | --- |
| `title` | 不写该键 | `typeof !== 'string'`、空串、`trim() === ''` → 整条响应 `bad-response`，原因带 `entries[i].title` | trim 后的非空字符串（原样收下，不做长度/字符白名单） |
| `createdAt` | 不写该键 | `typeof !== 'number'`、非有限、`<= 0` → 整条响应 `bad-response`，原因带 `entries[i].createdAt` | `Number.isFinite(n) && n > 0` |

两个新私有辅助函数（与 `:321-339` 并列，风格一致）：

```ts
/** 读一个可选的「trim 后非空」字符串字段；键缺失返回 undefined。 */
function readOptionalNonEmptyString(
  record: Record<string, unknown>,
  key: string,
  subject: string,
): Parsed<string | undefined>

/** 读一个可选的正有限数字段（epoch ms）；键缺失返回 undefined。 */
function readOptionalPositiveNumber(
  record: Record<string, unknown>,
  key: string,
  subject: string,
): Parsed<number | undefined>
```

条目组装用条件展开，保证「没有值就不出现键」：

```ts
items.push({
  sessionId: sessionId.value,
  dirName: dirName.value,
  projectDir: projectDir.value,
  bytes: bytes.value,
  updatedAt: updatedAt.value,
  ...(title.ok && title.value !== undefined ? { title: title.value } : {}),
  ...(createdAt.ok && createdAt.value !== undefined ? { createdAt: createdAt.value } : {}),
})
```

> 请求契约零变化：`MigratedTarget`/`MigratedRequest`/`readMigratedRequest`（`:169-181`、`:406-437`）不动。

### 3.2 新模块 `src/session-log-title.ts`

```ts
/* ---------- 常量（工程参数，均在模块内单点定义） ---------- */

/** 解压文本累计预算（Q1 已定 256 KiB；超出即回退，帧粒度推进）。 */
export const TITLE_TEXT_BUDGET_BYTES = 256 * 1024
/** 首次读取的压缩前缀；足以解出 256 KiB 文本的常见压缩比区间。 */
export const INITIAL_LOG_PREFIX_BYTES = 128 * 1024
/** 压缩前缀硬上限：256 KiB 文本即使完全不可压也只需约 256 KiB + 帧开销。 */
export const MAX_LOG_PREFIX_BYTES = 512 * 1024

/* ---------- 规范日志文件名 ---------- */

/** 一个可读的会话日志候选：规范文件名 + 是否 zstd 压缩。 */
export interface SessionLogEntryName {
  /** 目录内的文件名（`session.jsonl[.zstd]` / `session.vN.jsonl[.zstd]`）。 */
  readonly name: string
  /** `.zstd` 后缀 ⇒ 拼接帧容器；否则是纯 JSONL。 */
  readonly compressed: boolean
}

/**
 * 从目录成员名里挑出可读的会话日志：只认规范名（`$UP/dsh-session-format/lib/index.js:472-489`
 * 同款判据），最高 format 版本优先，同版本优先压缩形态；非规范名（临时文件、大写、前导零、
 * `.v0`、`session.lock`）一律不认。
 * @param names - 会话目录内的成员文件名。
 * @returns 选中的日志，或 undefined（没有可读规范名 ⇒ 该条目字段缺省）。
 */
export function chooseSessionLogName(names: readonly string[]): SessionLogEntryName | undefined

/* ---------- zstd 帧结构扫描（惰性） ---------- */

/** 一个结构完整的 zstd 帧在字节数组里的区间（end 不含）。 */
export interface ZstdFrameRange {
  readonly start: number
  readonly end: number
}

/**
 * 逐个产出结构完整的 zstd 帧区间。
 *
 * 与上游 `scanZstdFrames`（`$UP/dsh-session-persistence-jsonl/lib/index.js:1305-1364`）
 * 同一套字节判据，**唯一的语义差异**：结构性异常（magic 不符 / 保留位 / 保留块类型）
 * 与尾部撕裂一律**停止产出**而不是抛错——本读取器的契约是降级，不是失败（D-02）。
 * @param bytes - 已读到的压缩前缀（可含不完整的最后一帧）。
 * @returns 帧区间的惰性序列（消费方提前停止即不再扫描）。
 */
export function* iterateZstdFrames(bytes: Uint8Array): Generator<ZstdFrameRange, void, void>

/* ---------- 探测 ---------- */

/** 帧解压器（宿主绑 `zlib.zstdDecompressSync`；测试绑真实 zlib 或抛错替身）。 */
export type ZstdFrameDecompressor = (frame: Uint8Array) => Uint8Array

/** 同步探测的端口。 */
export interface SessionLogProbePorts {
  readonly decompressFrame: ZstdFrameDecompressor
  /** 覆盖文本预算（测试用小值驱动边界）。 */
  readonly textBudgetBytes?: number
}

/** 一次探测的结论；`title` 与 `createdAt` 都为 null 表示「日志里什么都没读到」。 */
export interface SessionLogProbe {
  /** 首个标题事件的值（trim 后非空）；无标题事件/预算内未命中/不可读 ⇒ null。 */
  readonly title: string | null
  /** header 的 `createdAt`（> 0）；header 不可读 ⇒ null。 */
  readonly createdAt: number | null
  /** 解压文本是否触到预算（true = 可能还有没读到的标题）。 */
  readonly budgetExhausted: boolean
}

/**
 * 对一段**已读到的**字节做同步探测（纯函数，永不抛错；坏帧只停止扫描并保留已得字段）。
 * @param bytes - 压缩前缀或纯 JSONL 前缀。
 * @param log - 由 {@link chooseSessionLogName} 选出的日志（决定是否按帧解压）。
 * @param ports - 解压器与预算。
 * @returns 探测结论。
 */
export function probeSessionLogPrefix(
  bytes: Uint8Array,
  log: SessionLogEntryName,
  ports: SessionLogProbePorts,
): SessionLogProbe

/** 读文件前缀的端口（宿主绑 `node:fs/promises`；测试给内存字节）。 */
export interface LogPrefixReader {
  /**
   * 读文件前 `length` 字节；返回长度小于请求即表示已到 EOF。
   * @throws 打开/读取失败（缺失、权限、是目录）。
   */
  readPrefix(path: string, length: number): Promise<Uint8Array>
}

/** 异步探测的端口。 */
export interface SessionLogReadPorts extends SessionLogProbePorts {
  readonly readPrefix: LogPrefixReader['readPrefix']
  /** 覆盖首次前缀（测试用）。 */
  readonly initialPrefixBytes?: number
  /** 覆盖前缀硬上限（测试用）。 */
  readonly maxPrefixBytes?: number
}

/**
 * 读归档会话日志的前缀并探测标题/创建时间。
 *
 * 两段式前缀：先读 {@link INITIAL_LOG_PREFIX_BYTES}；仅当「没命中标题 + 预算未耗尽 +
 * 读满首段（说明文件还有）」才补读到 {@link MAX_LOG_PREFIX_BYTES}。**永不 reject**：
 * 任何失败都折叠成 `{title:null, createdAt:null, budgetExhausted:false}`。
 * @param path - 日志文件绝对路径。
 * @param log - 规范日志名（决定压缩形态）。
 * @param ports - 文件读取、解压与预算端口。
 * @returns 探测结论。
 */
export async function probeSessionLog(
  path: string,
  log: SessionLogEntryName,
  ports: SessionLogReadPorts,
): Promise<SessionLogProbe>
```

**行为契约（逐条可测，TG2 验收逐条对应）**

1. **帧扫描**：magic（4 字节 LE `0xFD2FB528`）→ FHD（bit7-6 `Frame_Content_Size_flag`、bit5
   `Single_Segment_flag`、**bit4-3 保留/未用位必须为 0**（上游判据 `(descriptor & 24) !== 0` 即拒绝）、
   bit2 `Content_Checksum_flag`、bit1-0 `Dictionary_ID_flag`）→ **`Single_Segment === 0`
   时读 1 字节 `Window_Descriptor`** → `Dictionary_ID`（0/1/2/4）→ `Frame_Content_Size`
   （flag=0 时 singleSegment ⇒ 1 字节、否则 0 字节；flag>0 ⇒ `1 << flag` 字节）→ 3 字节 LE 块头循环（bit0 last、
   bit1-2 type、bit3+ size；`type === 3` 非法；RLE 块载荷 1 字节）→ **bit2 为 1** 则跳 4 字节校验和。
   区间 = `[start, offset)`，只有「完整帧」才产出。
2. **异常策略**：任一结构性异常或字节不足 → 生成器**结束**（不抛）；消费方拿到的都是完整帧。
3. **解压策略**：逐帧 `ports.decompressFrame(frame)`；某帧抛错 ⇒ 停止扫描、保留已得字段。
4. **行解析**：解压文本按 `\n` 切行；跨帧的不完整尾行存入 carry，与下一帧首段拼接；carry 只在
   预算内存在（预算即上界）。
5. **标题**：`record.type === 'session/title'` 且 `record.data.title` 为 trim 后非空字符串 ⇒
   取该值并**立即停止**（首个命中即停；不读后面的更新标题）。
6. **创建时间**：`record.type === 'session'` 且 `record.createdAt` 为有限且 > 0 ⇒ 记下，继续找标题。
7. **预算**：每帧解压后把 `plaintext.byteLength` 累加；**处理完该帧**才判 `>= budget`（帧粒度），
   命中即 `budgetExhausted = true` 并停止。
8. **非压缩日志**：`log.compressed === false` 时不做帧扫描，直接把前缀当 JSONL 行流，预算与
   首命中规则相同。
9. **两段前缀**：只有 `title === null && !budgetExhausted && bytes.length === requested` 才补读；
   补读后重跑一次同步探测（不保留第一段结果，实现简单且两段都 ≤512 KiB）。
10. **纯 JSON 行**：`JSON.parse` 失败的行走「跳过」；不因单行坏 JSON 中止（与预算共同保证有界）。

### 3.3 `migrated.ts`：端口与流程

```ts
/** 迁移域的日志读取端口（= 读取器端口，命名对齐本域）。 */
export type MigratedLogOps = SessionLogReadPorts

export interface MigratedPorts {
  readonly archiveRoot: string
  readonly homePath: (...segments: string[]) => string
  readonly fs: MigratedFileOps
  /**
   * 归档日志读取端口。缺省 = 不读标题（字段缺省、列表行为与本次变更前逐字节一致）；
   * 宿主不支持 zstd（Node 特性探测失败）时也走缺省。
   */
  readonly log?: MigratedLogOps
  listWorkspaces(): readonly MigratedWorkspace[]
  attachToWorkspace(workspaceId: string, sessionId: string): Promise<void>
  readdToArchiveSet(sessionId: string): Promise<void>
  announceRestored(entries: readonly { readonly sessionId: string; readonly updatedAt: number }[]): Promise<void>
  warn(message: string, error?: unknown): void
}

/** 标题探测的并发上限（镜像上游 list 并发默认值 3，不引入 p-limit）。 */
export const MIGRATED_PROBE_CONCURRENCY = 3
```

内部流程（`listArchiveEntries` 的三段结构）：

```ts
async function listArchiveEntries(
  fs: MigratedFileOps,
  archiveRoot: string,
  warn: (message: string) => void,
  log?: MigratedLogOps,          // 新增，可选
): Promise<ArchiveEntries>
```

```
阶段 A（既有逻辑，逐字节不变）
  readdir(archiveRoot) → 每个 project 目录 → readdir(project) → 每条 session 目录
  → lstat(sessionPath) → 2000 上限判定 → readdir(sessionPath) 统计一层体积 → entries.push
  同时（仅当 log 存在）：从 members 名里 chooseSessionLogName → 命中则记
  pending.push({ index, path: joinUnder(sessionPath, name), log: picked })

阶段 B（新增，仅 log 存在且 pending 非空）
  await mapLimit(pending, MIGRATED_PROBE_CONCURRENCY, async (item) => {
    const probe = await probeSessionLog(item.path, item.log, log)   // 永不抛
    if (probe.title === null && probe.createdAt === null) return
    entries[item.index] = {
      ...entries[item.index],
      ...(probe.title === null ? {} : { title: probe.title }),
      ...(probe.createdAt === null ? {} : { createdAt: probe.createdAt }),
    }
  })

阶段 C（返回）
  { entries, truncated }（截断语义与既有完全一致）
```

- `mapLimit` 是本文件私有约 12 行助手（worker 池，不用 `Promise.all` 一次打满；任一条 worker
  抛错不影响其它条——虽然 `probeSessionLog` 契约上永不抛，仍包一层 `catch` 兜底）。
- `listMigrated(ports: Pick<MigratedPorts, 'archiveRoot' | 'fs' | 'warn' | 'log'>)`；端口缺失 ⇒
  `listArchiveEntries` 不进入阶段 B。
- **不产生 warnings**：探测失败不进 `warn`（理由与被否见 D-04）。
- `createArchiveFiles` / `ArchiveFileLayout` **不改**（见 1.5）。

### 3.4 `index.ts`：宿主适配器

```ts
import { copyFile, lstat, mkdir, open, readdir, rename, rm, unlink } from 'node:fs/promises'
import * as zlib from 'node:zlib'

/** 归档日志端口：`readPrefix` 用 `open/read` 做有界读取，`decompressFrame` 绑 zlib 的 zstd。 */
function createNodeLogOps(): MigratedLogOps | undefined {
  // 特性探测：engines 地板 22.19 > zstd 进入 zlib 的 22.15，但更老的 Node 装载本插件时
  // 不应因缺 API 崩掉——缺 API 就让 log 端口缺省（标题不可得，列表照常）。
  if (typeof zlib.zstdDecompressSync !== 'function') return undefined
  return {
    readPrefix: async (path, length) => {
      const handle = await open(path, 'r')
      try {
        const size = (await handle.stat()).size
        const wanted = Math.min(length, Math.max(size, 0))
        const buffer = Buffer.allocUnsafe(wanted)
        let read = 0
        while (read < wanted) {
          const { bytesRead } = await handle.read(buffer, read, wanted - read, read)
          if (bytesRead === 0) break
          read += bytesRead
        }
        return buffer.subarray(0, read)
      } finally {
        await handle.close()
      }
    },
    decompressFrame: (frame) => zlib.zstdDecompressSync(frame),
  }
}

const nodeLogOps = createNodeLogOps()
```

`createPorts` 的返回对象里加一行（条件展开，缺省即不出现该键）：

```ts
return {
  archiveRoot,
  homePath,
  fs: nodeFileSystem,
  ...(nodeLogOps === undefined ? {} : { log: nodeLogOps }),
  listStoredHeaders: …,
  // …既有全部字段不变
}
```

> 分层：`node:zlib` 只出现在 `index.ts`（宿主实载体，已 import `node:fs/promises` / `node:os`）；
> `session-log-title.ts` 与 `migrated.ts` 仍零 `node:*`。产物：宿主 `external: ['node:*']`
> （`tooling/build-kit/src/host.mjs:28`、`:54`）⇒ `node:zlib` 天然外置；`test/bundle.test.ts` 的
> 自包含断言允许 node 内建（`tooling/build-kit/src/artifact-contract.mjs:133`）。

### 3.5 新模块 `src/client/display-format.ts`

```ts
/** 短码长度：`session-`（8）+ 8 个十六进制字符（decisions 的示例形态）。 */
export const SHORT_CODE_LENGTH = 16

/**
 * 显示用短码：超过 {@link SHORT_CODE_LENGTH} 才截断并补 `…`。
 * 只用于显示，不参与身份（D12 的「目录名即 id」不变）。
 * @param value - 目录名或会话 id。
 * @returns 原值或短码。
 */
export function shortCodeOf(value: string): string

/**
 * 路径尾段（交互式目录展示）：去掉尾部分隔符后取最后一段。
 * @param path - 绝对路径（POSIX 或 Windows）。
 * @returns 尾段；空串/只有分隔符/undefined ⇒ null。
 */
export function tailSegmentOf(path: string | undefined): string | null

/** 一个时间的两副面孔：行内紧凑绝对串 + 悬停全串。 */
export interface CompactTimestamp {
  /** 当年 `MM-DD HH:mm`；跨年 `YYYY-MM-DD HH:mm`；不可解释的值 ⇒ `—`。 */
  readonly text: string
  /** `toLocaleString()` 全串（悬停用）；不可解释的值 ⇒ 空串。 */
  readonly full: string
}

/**
 * 紧凑绝对时间（不用相对时间：旧设计已显式排除）。
 * @param epochMs - epoch 毫秒；`<= 0` / 非有限按「未知」处理。
 * @param now - 「今年」的参照（测试注入；缺省 `new Date()`）。
 * @returns 行内串与悬停全串。
 */
export function formatCompactTimestamp(epochMs: number, now?: Date): CompactTimestamp
```

**为什么单独成模块**：model 需要 `shortCodeOf`（`shortId`、回退标题）与 `tailSegmentOf`（尾段），
dialog 需要 `formatCompactTimestamp`；放进任一组件文件都会让另一个模块 import `.tsx`（现状里
`formatSize` 从 `DeleteSessionDialog.tsx` 导入只是历史便利，不再复制这种耦合）。本模块零 React、
零上游 import，可进 client program 直接单测。

`formatCompactTimestamp` 的实现约束：用本地时区的 `getFullYear/getMonth/getDate/getHours/getMinutes`
+ `padStart(2,'0')` 拼串（`full` 用 `toLocaleString()`），因此测试用同一组本地 getter 独立重算期望值，
不依赖 CI 时区；`now` 可注入以覆盖「同年 / 跨年」两条分支。

### 3.6 client 行视图与过滤函数（`session-manager-model.ts`）

```ts
/** 会话行投影的输入（补两个白得字段）。 */
export interface SessionRowViewInput {
  readonly displayTitle: string
  readonly running: boolean
  readonly updatedAt: number
  readonly blank: boolean
  readonly origin?: 'subagent'
  /** 会话工作目录（`SessionSummary.cwd`）；缺失时行次行只有时间。 */
  readonly cwd?: string
  /** fork 的父会话 id（`SessionSummary.parentId`，语义即 header 的 `parentSession`）。 */
  readonly parentId?: string
}

/** 活跃 / 已归档域的一行。 */
export interface SessionRowView {
  readonly key: string
  readonly sessionId: string
  readonly title: string
  readonly updatedAt: number
  readonly running: boolean
  readonly blank: boolean
  readonly selectable: boolean
  readonly workspaceId: string | null
  /** 会话工作目录全路径（次行只显示尾段，悬停用全路径）；无 cwd 为 null。 */
  readonly cwd: string | null
  /** `cwd` 的尾段（次行显示）；无 cwd 为 null。 */
  readonly projectDirTail: string | null
  /** fork 徽标：`parentId` 非空且 `origin !== 'subagent'`（Q3 工程细节）。 */
  readonly isFork: boolean
}

/** 已迁移域的一行（归档根下的一条会话目录）。 */
export interface MigratedRowView {
  readonly key: string
  readonly sessionId: string
  readonly dirName: string
  readonly projectDir: string
  readonly bytes: number
  readonly updatedAt: number
  readonly workspaceId: string | null
  readonly selectable: boolean
  /** 首行主标识：日志标题；缺失时回退 {@link shortCodeOf}(dirName)。恒非空。 */
  readonly title: string
  /** 标题来源：`log` = 读到的标题（次行可回显 id），`dirname` = 回退短码（次行不再重复 id）。 */
  readonly titleSource: 'log' | 'dirname'
  /** 创建时间（header.createdAt）；缺省归一为 null，只进悬停。 */
  readonly createdAt: number | null
  /** 命中工作区时的显示名；无归属或标题为空 ⇒ null（视图回退 `projectDir`）。 */
  readonly workspaceTitle: string | null
  /** 目录名短码（次行弱化显示）。 */
  readonly shortId: string
}
```

派生规则（`sessionRow` / `migratedRow` 内，视图零判据；标题回退抽成私有 `titleOfMigrated(entry)`，
工作区名抽成私有 `workspaceTitleOf(owner, workspaces)`，两者都只在本模块内使用）：

| 字段 | 规则 |
| --- | --- |
| `SessionRowView.cwd` | `summary.cwd ?? null`（悬停全路径） |
| `SessionRowView.projectDirTail` | `tailSegmentOf(summary.cwd)` |
| `SessionRowView.isFork` | `summary.parentId !== undefined && summary.parentId !== '' && summary.origin !== 'subagent'` |
| `MigratedRowView.title` / `titleSource` | `titleOfMigrated(entry)`：`entry.title` trim 后非空 ⇒ `{title, 'log'}`；否则 `{shortCodeOf(entry.dirName), 'dirname'}` |
| `MigratedRowView.createdAt` | `entry.createdAt ?? null`（契约已保证 > 0） |
| `MigratedRowView.workspaceTitle` | `workspaceTitleOf(owner, workspaces)`：命中工作区 id 后取 `workspaces.items.find(w => w.workspaceId === owner)?.title`；空串/未命中 ⇒ null |
| `MigratedRowView.shortId` | `shortCodeOf(entry.dirName)`（恒有值；渲染是否显示由 `titleSource` 决定） |

过滤与计数（判据全在 model）：

```ts
/** 三个域各自的过滤词（切 tab 保留；空串 = 不过滤）。 */
export type ManagerFilters = Readonly<Record<ManagerTab, string>>

/** 空过滤（三个域都是空串；每次返回新对象，避免共享可变状态）。 */
export const EMPTY_FILTERS: ManagerFilters

/** 归一化过滤词：`trim().toLowerCase()`；空串表示不过滤。 */
export function normalizeFilterQuery(query: string): string

/** 换掉某一个 tab 的过滤词，其余 tab 原样保留（identity 不变）。 */
export function withTabFilter(filters: ManagerFilters, tab: ManagerTab, query: string): ManagerFilters

/**
 * 活跃 / 已归档域的过滤：标题 + 会话 id + 工作目录全路径（cwd），大小写不敏感子串匹配。
 * 空查询返回**原数组**（保 identity，供 useMemo 短路）。
 */
export function filterSessionRows(rows: readonly SessionRowView[], query: string): readonly SessionRowView[]

/**
 * 已迁移域的过滤：标题 + 会话 id + 目录名 + 项目目录 + 工作区名，大小写不敏感子串匹配。
 * 空查询返回**原数组**。
 */
export function filterMigratedRows(rows: readonly MigratedRowView[], query: string): readonly MigratedRowView[]
```

匹配面的精确构成（避免「匹配了什么」在实现与文档间漂移）：

| 函数 | haystack（`\n` 连接、整体 `toLowerCase()`，`null` 段跳过） |
| --- | --- |
| `filterSessionRows` | `title`、`sessionId`、`cwd`（全路径，因此按尾段或中间段都能命中） |
| `filterMigratedRows` | `title`、`sessionId`、`dirName`、`projectDir`、`workspaceTitle` |

判据：`normalized === '' || haystack.toLowerCase().includes(normalized)`；`normalized` 只由
`normalizeFilterQuery` 产出（`trim` + `toLowerCase`），不做分词、不做拼音/模糊匹配。

### 3.7 视图契约（`SessionManagerDialog.tsx`）

**状态**（新增 1 个）：

```ts
const [filters, setFilters] = useState<ManagerFilters>(EMPTY_FILTERS)
```

`filters` 与 `phase`/`selection` 同处 {@link SessionManagerContent}：切 tab **保留**（三域各一份），
换工作区因 `key={choice}` 重挂而**整体复位**——与既有「换工作区 = 重挂」（D14）完全一致，不做额外持久化。

**派生**（插在现有 `:497-519` 之后，全部用 `useMemo`）：

```ts
const activeVisible = useMemo(() => filterSessionRows(activeRowList, filters.active), [activeRowList, filters.active])
const archivedVisible = useMemo(() => filterSessionRows(archivedRowList, filters.archived), [archivedRowList, filters.archived])
const migratedVisible = useMemo(() => filterMigratedRows(migratedRowList, filters.migrated), [migratedRowList, filters.migrated])

const currentQuery = filters[tab]
const unfilteredRows: readonly ManagerRow[] = tab === 'migrated' ? migratedRowList : tab === 'active' ? activeRowList : archivedRowList
const rows: readonly ManagerRow[] = tab === 'migrated' ? migratedVisible : tab === 'active' ? activeVisible : archivedVisible
const tabCounts: Readonly<Record<ManagerTab, number | null>> = {
  active: activeVisible.length,
  archived: archivedVisible.length,
  migrated: listing === null ? null : migratedVisible.length,   // 未加载 ≠ 0，不显示徽标
}
```

**tab 标签**（`:540-545` 改造，计数徽标 `aria-hidden`）：

```tsx
const tabLabel = (key: Key, count: number | null): ReactNode => (
  <>
    {t(key)}
    {count !== null && <span className={css.tabCount} aria-hidden="true">{count}</span>}
  </>
)
const tabItems = [
  { value: 'active', label: tabLabel('manager.tab.active', tabCounts.active), id: …, panelId: … },
  { value: 'archived', label: tabLabel('manager.tab.archived', tabCounts.archived), id: …, panelId: … },
  { value: 'migrated', label: tabLabel('manager.tab.migrated', tabCounts.migrated), id: …, panelId: … },
]
```

**工具栏与归档根**（`:881-891` 改造）：

```tsx
{tab === 'migrated' && phase === 'select' && (
  <div className={css.migratedBar}>
    <Button variant="ghost" icon={<IconRefreshOutlineRegular />} onClick={reloadListing} disabled={listingPhase === 'loading'}>
      {t('manager.refresh')}
    </Button>
    {listing !== null && (
      <span className={css.archiveRoot} title={listing.archiveRoot}>
        {t('manager.confirm.archiveRoot', { path: listing.archiveRoot })}
      </span>
    )}
  </div>
)}
```

**过滤行**（`phase === 'select'` 内、选择条之前；无行且无过滤词时不渲染）：

```tsx
{(unfilteredRows.length > 0 || currentQuery !== '') && (
  <div className={css.filterRow}>
    <Input
      type="search"
      className={css.filterInput}
      value={currentQuery}
      placeholder={t('manager.filter.placeholder')}
      aria-label={t('manager.filter.placeholder')}
      onChange={(event) => { setFilters((current) => withTabFilter(current, tab, event.target.value)) }}
    />
  </div>
)}
```

**空态与列表**（`:920-986` 的三元链改造）：

```tsx
{tab === 'migrated' && listing === null
  ? (listingError === null ? <p className={css.muted}>{t('manager.running')}</p> : null)
  : rows.length === 0
    ? <p className={css.empty}>{unfilteredRows.length === 0 ? emptyText : t('manager.empty.filtered', { query: currentQuery })}</p>
    : tab === 'migrated' ? <ul className={css.list}>{migratedVisible.map(renderMigratedRow)}</ul>
    : <ul className={css.list}>{rows.map(renderSessionRow)}</ul>}
```

> 渲染的是**可见行集**（`migratedVisible` / `rows`），不是未过滤行集；`unfilteredRows` 只用于区分
> 「本来就空」与「被过滤筛空」两种空态文案。

**迁移行 DOM 契约**（首行 = Checkbox 标题 + 徽标，次行 = 弱化 meta）：

```tsx
<li className={cx(css.row, selected && css.rowSelected, !row.selectable && css.rowDisabled)}>
  <Checkbox
    label={row.title}
    title={row.dirName}                       /* 回退行/长标题可用悬停看到完整目录名 */
    checked={…} disabled={…} onChange={…}
  />
  <span className={css.rowMetaRow}>
    {row.titleSource === 'log' && <span className={css.rowMeta}>{row.shortId}</span>}
    <span className={css.rowMeta} title={row.projectDir}>{row.workspaceTitle ?? row.projectDir}</span>
    <span className={css.rowMeta}>{t('manager.meta.size', { size: formatSize(row.bytes, t) })}</span>
    <span className={css.rowMeta} title={timeHover(row)}>
      {t('manager.meta.time', { time: formatCompactTimestamp(row.updatedAt).text })}
    </span>
  </span>
</li>
```

```ts
/** 迁移行的时间悬停：迁移时间全串 +（可得时）创建时间全串。 */
function timeHover(row: MigratedRowView): string {
  const archived = t('manager.meta.archived', { time: formatCompactTimestamp(row.updatedAt).full })
  if (row.createdAt === null) return archived
  return `${archived}\n${t('manager.meta.created', { time: formatCompactTimestamp(row.createdAt).full })}`
}
```

**活跃 / 已归档行 DOM 契约**：

```tsx
<li className={…}>
  <Checkbox label={row.title === '' ? t('manager.untitled') : row.title} … />
  {row.running && <span className={cx(css.badge, css.badgeRunning)}>{t('manager.badge.running')}</span>}
  {row.blank && <span className={cx(css.badge, css.badgeBlank)}>{t('manager.badge.blank')}</span>}
  {row.isFork && <span className={cx(css.badge, css.badgeFork)}>{t('manager.badge.fork')}</span>}
  <span className={css.rowMetaRow}>
    {row.projectDirTail !== null && <span className={css.rowMeta} title={row.cwd ?? undefined}>{row.projectDirTail}</span>}
    <span className={css.rowMeta} title={t('manager.meta.updated', { time: formatCompactTimestamp(row.updatedAt).full })}>
      {t('manager.meta.time', { time: formatCompactTimestamp(row.updatedAt).text })}
    </span>
  </span>
</li>
```

> 徽标位置：**首行**、Checkbox 之后（`flex:none`），与 decisions 的「首行 Checkbox 标题（含徽标）」一致。
> Checkbox 仍是行内唯一可访问名（既有 D9 不破）；`title` 属性只是悬停补充。

### 3.8 文案键（`locales.ts`，zh canonical / en 同键）

| 键 | zh | en |
| --- | --- | --- |
| `manager.filter.placeholder` | `过滤标题、会话 id、项目目录或工作区名` | `Filter by title, session id, project directory, or workspace name` |
| `manager.empty.filtered` | `没有匹配「{query}」的条目。` | `No entries match “{query}”.` |
| `manager.badge.fork` | `Fork` | `Fork` |
| `manager.meta.updated` | `更新时间：{time}` | `Updated: {time}` |
| `manager.meta.archived` | `迁移时间：{time}` | `Archived: {time}` |
| `manager.meta.created` | `创建时间：{time}` | `Created: {time}` |

复用（不新增）：`manager.meta.time`（`{time}`）、`manager.meta.size`（`{size}`）、
`manager.clear`（清空选择，过滤框不放清空按钮）、`manager.confirm.archiveRoot`（`归档目录：{path}`）、
`manager.untitled`（仅活跃/已归档域仍用）。

### 3.9 样式类名（`session-manager.module.css`）

| 类 | 作用 | 关键声明 |
| --- | --- | --- |
| `.row`（改） | 两行式容器 | `display:flex; flex-wrap:wrap; align-items:flex-start; gap:2px 8px;` 其余几何不变 |
| `.row > :first-child`（改） | Checkbox 占首行剩余宽度 | `flex:1 1 0; min-width:0`（`0` 基准保证徽标不被长标题挤到次行） |
| `.rowBadges`（新） | 首行徽标组 | `flex:none; display:flex; gap:4px; align-self:center` |
| `.rowMetaRow`（新） | 次行 meta | `flex:1 1 100%; display:flex; flex-wrap:wrap; align-items:center; gap:2px 10px; min-width:0; padding-left:22px`（缩进对齐标题文字，纯视觉） |
| `.badgeFork`（新） | fork 徽标 | 继承 `.badge`，`color: var(--dsw-alias-label-secondary, currentColor)` |
| `.tabCount`（新） | tab 计数徽标 | `margin-left:6px; color: var(--dsw-alias-label-tertiary, currentColor); font-variant-numeric: tabular-nums` |
| `.filterRow`（新） | 过滤行 | `display:flex; gap:8px; margin:0 0 8px` |
| `.filterInput`（新） | `Input` wrapper | `flex:1 1 auto; min-width:0`（`className` 落在外层 span，`test/stubs/ui-primitives.tsx:145-151` 同形） |
| `.migratedBar`（新） | 刷新 + 归档根 | `display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin:0 0 8px` |
| `.archiveRoot`（新） | 归档根路径 | `flex:1 1 auto; min-width:0; color: var(--dsw-alias-label-tertiary, currentColor); font-family: var(--ds-font-family-code, monospace); font-size:12px; line-height:18px; word-break:break-all` |

颜色纪律沿用文件头既有铁律（每处 `var(--dsw-alias-*, <兜底>)`，兜底只用关键字 / `color-mix`）；
类名契约注释（`:15-26`）追加：`rowBadges、rowMetaRow` ▸ 行内两行结构与徽标组；
`tabCount` ▸ 域计数徽标；`filterRow、filterInput` ▸ 过滤框；`migratedBar、archiveRoot` ▸ 迁移工具栏与归档根；
`.badgeFork` 并入既有徽标族一行。

---

## ④ 决策记录

### D-00 栈识别（主会话裁定，照录）

**结论**：writer skill = `dsh-plugin-writer`（本会话已通过 skill 工具加载成功并按其纪律执行）。

**证据（三条，均由主会话裁定）**：
① 本仓是 **DSH 插件 pnpm workspace**（`pnpm-workspace.yaml` 的 `packages: plugins/*` + 五个 tooling 包、
`package.json` 的 `packageManager: pnpm@11.25.0`），目标包 `plugins/web-ux` 是仓内七个 DSH 组合包之一；
② `web-ux` 是**双端插件**（`package.json` 的 `dsh.client.platform: web` + `exports["./client"]` + `main: lib/index.js`，
`build.mjs` 一次产 `lib/index.js` 与 `lib/client.js`），本次改动同时落在宿主半与 client 半；
③ **聚合层 skill 的适用范围覆盖本仓**：`/home/docker/.agents/skills/dsh-plugin-writer/SKILL.md` §1 明写唯一锚点是
`/home/xuqinqin/develop/person/dsh-plugins`，§2 的选型树把「要动 Web UI」直接指向 `plugins/web-ux` 这条双端路线。

**影响**：构建/验证沿用 skill §5 生命周期（`pnpm --filter dsh-plugin-web-ux verify:all` → `pnpm dsh:check`，
装载性用 `dsh --profile web --dump-config`）；本次**不新建插件、不改形态**，只消费它的分层方向（宿主流程层不 import
`node:*`、不 import 上游包）、复用优先（复用 `manager.confirm.archiveRoot`、`Input`、`Checkbox.title`、`formatSize`）
与任务粒度纪律（TG1–TG6）。

**被否**：把本次当「纯前端组件改造」只改 client（宿主拿不到标题，需求 1 不可能成立）；把读取器实现成新插件
（一次列表增强不需要新 bundle 与安装链，且会破坏「四包同装」的既有约定）。

**反例**：若按「文案小改」分流（skill §1 的不适用项），会漏掉宿主契约扩展、分层约束与产物重建——
`typecheck` 的 host program 与新模块 `include` 都会红，`dsh:check` 的产物契约也守不住。

### D-01 标题来源 = 列表时读归档日志前缀（照录 Q1-B，不重开）

**决策**：`list-migrated` 在枚举完成后，对每条已列出的条目读其 `session.vN.jsonl[.zstd]` 前缀，
取**首个** `session/title` 事件作为标题、header 的 `createdAt` 作为创建时间；读不到就字段缺省。

**被否方案与理由**（explore §3.1 的四案，收敛已裁）：
- **A 迁移时写 sidecar 快照**：存量 1134 条归档没有 sidecar ⇒ 需求 1 对存量完全失效；且向用户数据目录写
  非上游文件，恢复回 `sessions/` 后成为目录内多余文件。
- **C 迁移不再删投影缓存**：违反「纯缓存可随时删」哲学，缓存里永久留孤儿记录；存量仍无标题。
- **A+B 混合**：两套读取路径 + 两套测试，收益只是「新迁移的标题更准」，而 Q1 已接受近似语义。

**反例**：若为了「标题最新」选 A，用户升级后打开「已迁移」看到的仍是 `session-xxxx` 目录名（存量无 sidecar），
会直接判定「这个需求没做」；而 B 对全部 1134 条存量立即生效（实测 99.5% 命中）。

### D-02 帧扫描/解压在本插件内实现，且分两层（纯逻辑 + 宿主适配）

**决策**：新建 `src/session-log-title.ts`（零 `node:*`，帧结构扫描 + 行解析 + 预算），
`src/index.ts` 的 `createNodeLogOps()` 绑定 `node:fs/promises` 与 `node:zlib`；`migrated.ts` 只认端口类型。

**被否方案与理由**：
- **import 上游 `@deepseek-ai/dsh-session-persistence-jsonl` 的 zstd 工具**：该包虽然声明了 `"./src/*"`
  子路径导出，但发布件的 `files` 不含 `src`（`$UP/dsh-session-persistence-jsonl/package.json` 的 `files`
  只有 `locale/*.json`、`lib/index.js`、`lib/worker.cjs`、`lib/types/**/*.d.ts`，安装树实测无 `src/` 目录），
  包入口类型面（`lib/types/index.d.ts`）也不导出 `scanZstdFrames`/`decompressZstdFrame`（它们只在内部
  使用的 `lib/types/zstd.d.ts`）；走 `lib/types/**` 深路径等于把上游当私有 API，违反产物自包含与公开面。
- **把 `node:zlib`/`node:fs` 直接写进 `migrated.ts`**：破坏该层「不认识 cordis、不 import 任何 `node:*`」
  的既有契约（文件头 `src/migrated.ts:5-8` 明写），内存 fake 将无法驱动列表流程，`test/migrated.test.ts`
  的 40+ 条纯流程用例全部要改成真实磁盘。
- **把读取器放 client 半**：client 没有归档根的磁盘访问权，且 `lib/client.js` 会带上 zlib 词，破坏浏览器产物。

**反例**：若把 `readFile` 塞进 `MigratedFileOps`（`src/migrated.ts:64-67`），`delete/restore` 的 fake fs
也得实现读文件（它们从不用），四份测试夹具同时扩，改动量与收益完全不成比例。

### D-03 两段式压缩前缀：先 128 KiB，必要时补到 512 KiB

**决策**：`readPrefix` 先读 `INITIAL_LOG_PREFIX_BYTES = 128 KiB`；仅当「没命中标题 + 文本预算未耗尽 +
读满首段（说明还有数据）」时补读到 `MAX_LOG_PREFIX_BYTES = 512 KiB`，重跑一次同步探测。

**为什么 512 KiB 足够覆盖 256 KiB 文本预算**（可在评审复算）：对完全不可压的数据，zstd 用 RAW 块存储，
压缩后字节数 ≈ 原文 + 每 128 KiB 块约 3 字节块头 + 每帧约 18 字节头尾（略大于原文，永不显著小于）；
因此 256 KiB 文本最多约需 256.1 KiB 压缩前缀，512 KiB 有约 2× 余量。读满 512 KiB 仍未命中，就是
「标题在预算之外」，与 decisions 的回退语义一致。

**被否方案与理由**：
- **一次读满 512 KiB（不做首段）**：p50 压缩体积 288591 字节（≈282 KiB，本机 1134 条实测）⇒ 每次列表的 I/O 约 4×
  首段；2000 条上限下差约 750 MB 读取量。首段 128 KiB 让压缩比 ≥2 的日志一次到位。
- **流式 `createZstdDecompress` 逐段解**：实测它同样不出第二帧（父会话已测），拿不到后续帧的标题。
- **先用独立的 `stat`/`lstat` 再 `open`**：多一次路径解析与系统调用；本设计用 `open` 后的 `fstat`
  （`handle.stat()`）一次拿齐。

**反例**：若只读 128 KiB 且不做补读，压缩比低（日志里嵌大量 base64 / 图片引用）的条目会在文本远未到
256 KiB 时就停止，标题命中率从实测 99.5% 掉到不可知水平；补读一步恰好兜住这群条目。

### D-04 探测逐条静默降级，不产生 warnings

**决策**：`probeSessionLog` 契约上永不 reject；`migrated.ts` 不为探测失败记 `warn`，也不引入汇总告警。

**被否方案与理由**：
- **逐条 `warn`**：2000 条上限下最坏 2000 行宿主日志；且「没有标题」是**正常状态**（实测 0.5%），
  不是异常。
- **循环结束发一条汇总 warn**：会改写既有 warnings 契约——`test/index.test.ts:752-800` 逐字断言
  `list-migrated` 的 warnings 恰为两条「非目录跳过」；而且「N 条无标题」对用户没有可执行信息。

**反例**：如果探测失败走 warn，`test/index.test.ts` 的既有断言会立刻红，实施方将被迫把「坏日志」当
可告警异常，进而给每个归档目录都刷一条——代价远大于收益。

### D-05 新字段可选（缺省），不用 `null` 或哨兵值

**决策**：`title?: string`、`createdAt?: number`；宿主**只在读到值时写键**，解析器缺失即不写键。

**被否方案与理由**：
- **`title: string | null` 必填**：老宿主（同 tag 之前的版本）不写该字段时解析器必须伪造 `null`，
  而响应里「字段不存在」与「明确为 null」在 wire 上无法区分；同 tag 安装本无兼容负担，但伪造会掩盖协议漂移。
- **`createdAt: number` 必填、0 表示未知**：`formatCompactTimestamp(0)` 会渲染 1970，
  界面上出现一个假的「创建时间」比没有更糟。

**反例**：若用空串表示「无标题」，client 的 `entry.title?.trim()` 判断仍要走一次回退分支，但 wire 上
多了个无意义的值，`test/contract` 也必须为「空串合法」开口子——可选字段让「不可得」在类型上就成立。

### D-06 探测并发 3、逐条顺序无关，`mapLimit` 手写

**决策**：新增 `MIGRATED_PROBE_CONCURRENCY = 3`；`migrated.ts` 内私有 `mapLimit`（worker 池约 12 行），
每个条目 1–2 次 `readPrefix`。

**被否方案与理由**：
- **全串行**：1134 条 × (读 + 解压) 在真实归档根上会明显拉长列表刷新时间，而列表是手动刷新、用户正在等。
- **无上限 `Promise.all`**：2000 个文件句柄 + 2000 × ≤512 KiB 的瞬时缓冲，内存与 fd 峰值都不可控。
- **引入 `p-limit` 依赖**：一个 12 行的 worker 池不值得新增依赖（`package.json` 的 dependencies 至今为空）。

**反例**：若并发不设上限，`test/migrated.test.ts` 的并发断言（在途 ≤3）无法成立，且真机上 2000 条冷归档
会同时打开 2000 个 fd——在 fd 软上限较低的机器上直接 EMFILE。

### D-07 两行式行布局：Checkbox 仍是唯一可访问名，meta 进第二行

**决策**：`.row` 改 `flex-wrap` 容器：首行 Checkbox（标题即 label）+ 徽标组，次行 `.rowMetaRow` 承载弱化 meta。

**被否方案与理由**：
- **单行压缩（缩短 meta、隐藏部分字段）**：decisions 要的是「字段全集」，单行里 UUID 与 4 项 meta 会互相挤压。
- **标题移出 Checkbox，单独一行标题 + 一个无标签 checkbox**：破坏既有 D9「行标题由 Checkbox 的 label 承载
  （唯一可访问名）」，`test/session-manager-dialog.test.tsx` 的 30 条 `getByRole('checkbox', { name })` 全部失效，
  且屏幕阅读器会读到无名字的复选框。

**反例**：若把 meta 塞进 Checkbox 的 label（拼成一条长文本），可访问名会变成「标题 + id + 大小 + 时间」，
侧栏读屏体验灾难；而视觉上两行式正是把「身份」与「元数据」分开。

### D-08 标题缺失回退「目录名短码」（照录 Q2），短码 = 前 16 字符 + `…`

**决策**：`shortCodeOf(value)` = `value.length > 16 ? value.slice(0,16) + '…' : value`；回退标题与次行 id 共用它。

**被否方案与理由**：
- **「（无标题）」+ title 提示全量**：丢失可定位性——用户要靠目录名找到归档目录里的条目。
- **剥掉 `session-` 前缀再截 8 位**：D12 明确「目录名即 id，不做前缀归一」；显示层剥前缀会让用户复制的短码
  与目录名对不上（两代目录名并存，裸 UUID 与 `session-<uuid>` 都在）。

**反例**：`session-a1b2c3d4…`（8 + 8）正好是本机主流命名；若取前 20 字符，短码会吃进 UUID 的第二段分隔符
（`session-01234567-89a`），既没有更可辨识，也比必要的更长。

### D-09 工作区名替代转义 `projectDir`；空标题回退 `projectDir`

**决策**：`migratedRows` 命中工作区后按 id 二次查 `workspaces.items` 取 `title`；`title` 空串视为不可得，
视图回退显示 `projectDir`（悬停恒为完整 `projectDir`）。

**被否方案与理由**：
- **改 `workspaceForProjectDir` 让它返回工作区对象**：该函数被 `restoreMigrated`（`src/migrated.ts:705`）共用，
  改返回形状会牵动恢复流程与 `test/project-key.test.ts`；收益只是省一次 `find`。
- **只在伪选项下显示 `projectDir`**：真实工作区选项下 `projectDir` 是 `--home-...--` 转义串，正是需求要消灭的不可读信息。

**反例**：若不做空标题回退，一个未命名工作区会让整行 meta 变成空白（`title` 为空串时直接渲染空 span），
用户看到「体积 · 时间」前面缺一块；回退 `projectDir` 至少有可读内容。

### D-10 过滤判据全在 model；全选/计数/动作输入都作用「过滤后可见行」；选择集合不因过滤被裁剪

**决策**：`filterSessionRows` / `filterMigratedRows` 是纯函数；视图把 `rows` 一律替换为可见行传入
既有选择函数（`selectAllSelection`/`allSelected`/`selectedCount`/`selectedSessionIds`/`selectedMigratedTargets`），
因此「全选只作用于可见行」「已选 N = 可见已选」自动成立；切换过滤词**不清空**选择集合。

**被否方案与理由**：
- **过滤时清空该 tab 选择**：每敲一个字符就丢一次选择，用户无法「先筛出来再勾选」。
- **动作输入按未过滤行集投影**：用户筛掉的行仍在选择集合里，删除/物理删除会作用到**屏幕上看不见**的行——
  危险方向不可接受；`selectedCount` 与动作输入若口径不一致，还会出现「已选 3 个，删除 2 个」的怪状态。

**反例**：若动作按未过滤行集投影，用户先全选 500 行、再输入过滤词只看 2 行后点「永久删除所选」，
会删掉 500 条——这不是理论风险，而是「全选 + 过滤」的常见操作序列。可见投影把最坏情况锁死在用户眼前。

### D-11 域计数徽标 `aria-hidden`，不并入 tab 可访问名

**决策**：`<span className={css.tabCount} aria-hidden="true">{count}</span>`。

**被否方案与理由**：
- **把计数拼进 tab 文案（可访问名）**：`test/session-manager-dialog.test.tsx` 有 20 条
  `getByRole('tab', { name: zh['manager.tab.*'] })` 与 8 处 `selectedTabLabel()` 断言，全部要改；
  更重要的是计数在列表里本来就可数，读屏用户不需要每个 tab 多一个数字。
- **给 tab 设 `aria-label`**：`SegmentedTab` 只有 `label: ReactNode`（`$UP/dsh-client-ui-primitives/lib/types/SegmentedTabs.d.ts:3-8`），
  没有 label 以外的可访问名入口。

**证据（实测，非假设）**：`dom-accessibility-api@0.5.16` 对 `活跃<span aria-hidden="true">7</span>`
计算可访问名为 `"活跃"`——徽标被排除，既有查询口径不变。

**反例**：若把计数放进可访问名，`getByRole('tab', { name: '活跃' })` 会因 `"活跃3"` 匹配失败，
一个纯视觉增强却让 20 条既有用例红——这类「顺手改可访问名」的代价通常被低估。

### D-12 过滤交互：大小写不敏感子串、各 tab 独立保留（照录 Q6）

**决策**：`ManagerFilters` 三域各一个字符串；匹配面 = 迁移域的「标题 + 目录名/id + 项目目录 + 工作区名」
与两域的「标题 + 会话 id + 工作目录全路径（cwd）」；`normalizeFilterQuery` 只做 `trim().toLowerCase()`。

**被否方案与理由**：
- **分词 / 多关键词 AND**：交互复杂度上升，而目标是「长列表定位」，子串足够。
- **只匹配标题**：ad-hoc 的目录名/工作区名同样是指引信息（例如按项目名找迁移条目）。
- **过滤词全局共享一份**：三个域的数据源完全不同，切 tab 保留各自的词才符合「各 tab 独立」的 Q6 裁定。

**反例**：若三域共用一个过滤词，从已迁移域（按项目名筛）切到活跃域会因项目名不匹配得到空列表，
用户会以为活跃域没有会话。

### D-13 归档根显示复用 `manager.confirm.archiveRoot`

**决策**：已迁移 tab 的工具栏右侧显示 `t('manager.confirm.archiveRoot', { path: listing.archiveRoot })`。

**被否方案与理由**：
- **新增 `manager.archiveRoot` 键**：同一句文案（「归档目录：{path}」）出现两处，locale 表要维护两份，
  且 `{path}` 占位符漂移风险翻倍。
- **不显示**：现在归档根只在确认页可见，用户平时无从核对「日志到底在哪」（需求 3 的价值点之一）。

**反例**：若另起新键，`test/locale-parity` 的 `REQUIRED_KEYS` 要加两条同义键，未来翻译改了 A 忘了 B，
两处文案就分叉。

### D-14 紧凑绝对时间（当年省年）+ 悬停全串；创建时间只进悬停

**决策**：`formatCompactTimestamp` 返回 `{text, full}`；行内显示 `text`，时间元素的 `title` 用 `full`；
迁移行的 `title` = 「迁移时间全串」+（可得时）「创建时间全串」两行。

**被否方案与理由**：
- **相对时间（`relativeTime`）**：旧设计显式排除（测试替身不提供该导出），本次不翻案。
- **保持 `toLocaleString()`**：行内串过长（含秒、时区、星期样式随 locale 变化），两行式里更挤。
- **`<time>` 元素 + `datetime` 属性**：`Checkbox` 家族已有 `title` 惯例，新增时间语义元素不带来可测收益。

**反例**：若显示相对时间，「3 个月前」在清理归档时没有信息量——用户要做的是按时间判断该删哪批，
绝对时间（哪怕省了年份）才可比较；跨年补全年份正是为了避免把「去年 12 月」误读成「今年 12 月」。

### D-15 spec delta 只改两条 requirement（照录 decisions）；通用呈现不新增 requirement

**决策**：`openspec/changes/<change>/specs/dsh-web-ux-session-manager/spec.md` 只出两个
`## MODIFIED Requirements`（「已迁移会话管理」「批量线上契约」）；`dsh-web-ux-session-delete` 零改动。

**被否方案与理由**：
- **顺手改 `openspec/specs/.../spec.md` 真源**：变更期手改真源会与 delta 双写，归档时冲突。
- **把两行式/计数/过滤塞进「已迁移会话管理」**：这三项是三域通用行为，塞进单域 requirement 语义错位。
- **新增一条 ADDED requirement 覆盖通用呈现**：超出收敛裁定的 delta 范围（此点不是代码矛盾，已上浮 P-1）。

**反例**：若把「过滤框」写进「已迁移会话管理」，活跃/已归档域的过滤行为就没有规范约束，评审时会被问到
「这条行为在哪定义」；但按 P-1 的推荐，本期先由 README 承载，评审要求再补 ADDED。

### D-16 支持非压缩日志（`session.jsonl`）分支

**决策**：`chooseSessionLogName` 同时接受 `.jsonl` 与 `.jsonl.zstd`；非压缩时直接按行流解析（同一预算）。

**被否方案与理由**：
- **只认 `.zstd`，其它一律回退**：上游 `compression` 可配为 `none`（`logSuffix`/`compressionSuffix`，
  `$UP/dsh-session-persistence-jsonl/lib/index.js:752-768`），这类部署会**永远**没有标题，而诊断成本极高
  （用户只看到短码）。多一个分支约 10 行 + 1 条用例。
- **扫描目录里任意 `*.jsonl*`**：会读到 `.tmp` 半成品或非规范命名，违背「只认已提交代次」的上游判据。

**反例**：若猜文件名，`session.v4.jsonl.zstd.tmp` 这类写入中间态会被当成日志，读到半行 JSON 后回退——
结果是「有时有标题、有时没有」的不可解释行为；规范名正则把它排除在外。

---

## ⑤ 逐任务组实现要点

分组沿用建议六组，**执行顺序是拓扑序**：`TG1 → TG2 → TG3 → TG4 → TG5 → TG6`（TG2 与 TG3 无相互依赖，
可并行；TG4 依赖 TG3 与自身新增文案键）。

### TG1 契约扩展

**文件**：改 `src/contract.ts`；改 `test/contract.test.ts`。

**要点**
1. 新字段与 JSDoc 严格按 3.1；`readonly` 全部保留。
2. 两个新辅助函数与既有 `readNonEmptyString` / `readNonNegativeNumber` 并列，**不合并**（语义不同：
   一个禁止空串、一个要求正数）。
3. `parseMigratedListing` 的条目循环追加两次读取与条件展开；失败原因必须带 `entries[i].<key>`（便于定位）。
4. 请求 parser、端点常量、失败码集合、上限常量一律不动。

**验收**

```bash
pnpm --filter dsh-plugin-web-ux exec vitest run test/contract.test.ts
```

- `{...entry, title: '  标题  '}` → `value.entries[0].title === '  标题  '`（原样收下，不在 wire 层 trim）。
- `{...entry, title: ''}` / `title: 7` / `title: '   '` → `ok === false` 且 `message` 含 `title`。
- `{...entry, createdAt: 1700000000000}` → 收下；`createdAt: 0` / `-1` / `NaN` / `'1700'` → 拒绝且含 `createdAt`。
- 不含新键的条目 → `parseMigratedListing(...)` 结果 `toEqual({ok:true, value: valid})`，且
  `'title' in value.entries[0] === false`。
- 既有 `describe('parseMigratedListing')` 的 22 条非法形状用例全部保持绿。

### TG2 宿主标题读取器

**文件**：新建 `src/session-log-title.ts`；新建 `test/session-log-title.test.ts`；改 `src/migrated.ts`；
改 `src/index.ts`；改 `test/migrated.test.ts`；改 `test/index.test.ts`；改 `tsconfig.host.json`。

**要点**
1. 读取器签名与常量按 3.2；模块**零 import**（连 `./contract.ts` 的类型也不需要——条目字段的回填在
   `migrated.ts` 做；`TextDecoder` 与 `DataView` 都是全局）。
2. 帧扫描逐字节按 3.2 行为契约 1；**`Single_Segment === 0` 必须读 1 字节 Window_Descriptor**——这是父会话
   首版脚本全零的同一坑，测试要用流式帧证明该分支被执行（见验收）。
3. 生成器在结构性异常处 `return`（不抛）；`probeSessionLogPrefix` 内部再包一层 `try/catch` 兜解压抛错。
4. `probeSessionLog` 两段前缀按 3.2 契约 9；`readPrefix` 的失败（ENOENT/EACCES/EISDIR）一律折叠成空结论。
5. `migrated.ts` 三段结构按 3.3；`mapLimit` 用 worker 池（不要 `Promise.all` 一次打满）；`log` 缺省时
   阶段 B 完全跳过（既有 40+ 用例零改动）。
6. `index.ts` 的 `createNodeLogOps` 按 3.4；`node:zlib` 用**命名空间 import**（`import * as zlib`）而不是
   命名导入——老 Node 缺该导出时命名导入会在链接期抛 `SyntaxError`，命名空间 import 只会得到 `undefined`，
   特性探测才有意义。
7. `tsconfig.host.json` 的 `include` 追加两个新文件（漏了就 `typecheck` 覆盖不到）。

**验收**

```bash
pnpm --filter dsh-plugin-web-ux typecheck
pnpm --filter dsh-plugin-web-ux exec vitest run test/session-log-title.test.ts
pnpm --filter dsh-plugin-web-ux exec vitest run test/migrated.test.ts
pnpm --filter dsh-plugin-web-ux exec vitest run test/index.test.ts
```

- 帧分支证据：测试里构造一帧并断言 `src[4] & 32`（FHD 的 Single_Segment 位）**为 0**，再断言
  `probeSessionLogPrefix` 能读出该帧里的 `createdAt`（证明 Window_Descriptor 分支生效）。
  构造方式：`createZstdCompress()` 流式写入并收集输出（一次性 `zstdCompressSync` 产的是 Single_Segment=1 帧，
  只覆盖另一分支）。
- `Buffer.concat([frame(headerLine), frame(titleLine)])` → `title === '标题'`、`createdAt === 1700000000000`。
- `textBudgetBytes: 1` + 标题在第二帧 → `title === null`、`budgetExhausted === true`。
- 把标题帧截断 3 字节 → 只解析出 header（`createdAt` 有值、`title === null`），**不抛**。
- 在第二帧前插入 4 字节垃圾 → 生成器在第一帧后停止，`createdAt` 保留、`title === null`、不抛。
- `decompressFrame` 抛错 → 不抛、保留已得字段。
- 非压缩：`Buffer.from(header + '\n' + title + '\n')` + `compressed:false` → 标题命中（且 `readPrefix`
  只调用一次）。
- 两段前缀：第一段返回满 128 KiB 且无标题 → `readPrefix` 调用 2 次、第二次请求 512 KiB；
  第一段短于请求（EOF）→ 只调 1 次。
- `migrated.test.ts`：注入 fake `log` 的 `listMigrated` 条目带 `title`/`createdAt`；不注入时两条键都不存在；
  目录里只有 `session.lock` 时零 `readPrefix` 调用；worker 池在途峰值 ≤3（fake 端口自己计数）；
  `warn` 调用次数与既有用例逐条相等（不新增）。
- `index.test.ts`：用 `zstdCompressSync` 写真实归档日志后 `list-migrated` 返回标题；既有 2000 条截断用例
  与 warnings 断言保持绿。

### TG3 client 纯派生

**文件**：新建 `src/client/display-format.ts`；新建 `test/display-format.test.ts`；
改 `src/client/session-manager-model.ts`；改 `test/session-manager-model.test.ts`；改 `tsconfig.client.json`。

**要点**
1. `display-format.ts` 按 3.5；`shortCodeOf` 对 `SHORT_CODE_LENGTH` 边界（16 保留、17 截断）。
2. model 新字段与派生按 3.6；`sessionRow`/`migratedRow` 是**唯一**派生点，视图不得再判 `entry.title`。
3. 过滤函数：空查询返回原数组（identity 短路）；匹配前 `toLowerCase()`；`withTabFilter` 保留其余 tab 的
   identity（与既有 `withTabSelection` 同风格）。
4. 既有 `toEqual` 断言会因新字段红——按新形状更新期望对象（这是设计内变更，不是回归）。
5. `tsconfig.client.json` 追加 `test/display-format.test.ts`。

**验收**

```bash
pnpm --filter dsh-plugin-web-ux typecheck
pnpm --filter dsh-plugin-web-ux exec vitest run test/display-format.test.ts
pnpm --filter dsh-plugin-web-ux exec vitest run test/session-manager-model.test.ts
```

- `shortCodeOf('session-0123456789ab')` → `'session-01234567…'`；`shortCodeOf('session-0123')` → 原样；
  `shortCodeOf('')` → `''`。
- `tailSegmentOf('/home/dev/alpha/')` → `'alpha'`；`tailSegmentOf('C:\\dev\\alpha')` → `'alpha'`；
  `tailSegmentOf('/')` → `null`；`tailSegmentOf(undefined)` → `null`。
- 固定 `now = new Date(2026, 5, 1)`：同年输入的 `text` 匹配 `/^\d{2}-\d{2} \d{2}:\d{2}$/`，
  且与用 `getMonth/getDate/getHours/getMinutes` 独立重算的串相等；跨年输入匹配
  `/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/`；`full === new Date(ms).toLocaleString()`；`0`/`NaN` → `'—'`/`''`。
- 模型：`entry` 无 `title` → `title === shortCodeOf(dirName)`、`titleSource === 'dirname'`；
  有 `title` → `titleSource === 'log'`、`createdAt === 1700000000000`。
- 工作区名为空串 → `workspaceTitle === null`；命中工作区 → 等于 `WorkspaceRowView.title`。
- `parentId: 'p'` + 无 `origin` → `isFork === true`；`origin: 'subagent'` → `false`；`parentId: ''` → `false`。
- 过滤：`filterMigratedRows(rows, '  ALPHA ')` 命中标题含 `Alpha` 的行；按 `projectDir` / 工作区名可命中；
  `filterSessionRows(rows, '甲一')` 命中标题，`filterSessionRows(rows, 'alpha')` 命中 cwd 含 `/alpha` 的行；
  空查询返回同一数组（`toBe`）。
- 可见投影：`selectAllSelection(sel, 'archived', visibleRows)` 后 `selectedSessionIds(visibleRows, sel.archived)`
  只含可见行；`selectedCount(sel, tab, visibleRows)` 不计隐藏行。

### TG4 视图与样式文案

**文件**：改 `src/client/locales.ts`；改 `src/client/session-manager.module.css`；
改 `src/client/SessionManagerDialog.tsx`；改 `test/session-manager-dialog.test.tsx`；改 `test/locale-parity.test.ts`；
改 `test/bundle.test.ts`。

**要点**
1. 文案 6 键一次补齐 zh/en；`test/locale-parity.test.ts` 的 `REQUIRED_KEYS` 追加同 6 键。
2. CSS 按 3.9；类名契约注释同步；颜色只用 token + 关键字兜底。
3. Dialog 状态/派生/渲染按 3.7；**先落地文案与样式类，再改 JSX**（`Key` 是字面量联合，缺键直接类型错）。
4. `formatTime` 删除（避免两套时间格式并存）；`formatSize` 继续复用 `DeleteSessionDialog.tsx`。
5. `selectedTabLabel()` 助手改为按可访问名断言（约 8 处调用点机械替换），并补一条「计数徽标不改变
   可访问名」的断言。
6. `bundle.test.ts` 加两条：宿主产物含 `node:zlib`；客户端产物不含 `node:zlib`/`zstd`（分层证据）。
7. import 面变化：`Input`（primitives）、`EMPTY_FILTERS`/`withTabFilter`/`filterSessionRows`/`filterMigratedRows`（model）、
   `formatCompactTimestamp`（display-format）；`formatTime` 删除。

**验收**

```bash
pnpm --filter dsh-plugin-web-ux typecheck
pnpm --filter dsh-plugin-web-ux exec vitest run test/locale-parity.test.ts
pnpm --filter dsh-plugin-web-ux exec vitest run test/session-manager-dialog.test.tsx
pnpm --filter dsh-plugin-web-ux build
pnpm --filter dsh-plugin-web-ux exec vitest run test/bundle.test.ts
```

- 已迁移行：`getByRole('checkbox', { name: '日志标题' })` 命中；次行同时出现 `shortId`、工作区名（或
  `projectDir`）、体积与紧凑时间；时间元素 `title` 同时含「迁移时间：」与「创建时间：」两段。
- 回退行：fixture 用 17 字符目录名 + 无标题 → checkbox 名 = 16 字符 + `…`，次行**不再**出现该短码。
- 活跃行：`parentId` 非空且非 subagent → `manager.badge.fork` 可见；`cwd` 尾段可见且 `title` 为全路径。
- 计数：`getByRole('tab', { name: zh['manager.tab.active'] })` 仍解析成功（可访问名不含数字），
  其 `textContent` 为 `活跃` + 当前可见行数；迁移列表未加载时迁移 tab 无数字。
- 过滤：输入 `zh` 前缀 → 行数收窄；全选后 `manager.selected` 计数 = 可见行数；过滤到 0 行 →
  `manager.empty.filtered` 出现且含查询词；切到另一 tab 再切回，过滤词仍在；动作按钮在可见已选为 0 时禁用。
- 归档根：已迁移 tab 出现 `manager.confirm.archiveRoot` 文案且 `title` 为完整路径；确认页仍只有一处该文案。
- 两行式：`.row` 下存在 `.rowMetaRow`，且 `aria-hidden` 的计数 span 存在（`grep -c 'aria-hidden'` = 1）。

### TG5 spec 与 README

**文件**：新建 delta `openspec/changes/2026-11-09-session-manager-info-display/specs/dsh-web-ux-session-manager/spec.md`；
改 `plugins/web-ux/README.md`（1.4 的 6 处）。

**要点（delta 文本骨架，实施照此落档）**

```md
# Spec Delta

## Purpose

会话管理「已迁移」域的信息展示：从归档日志前缀读取标题与创建时间、标题缺失时的目录名短码回退、
行内主次标识的分工，以及 `list-migrated` 响应对应字段的线上形状。

## MODIFIED Requirements

### Requirement: 已迁移会话管理

已迁移域 SHALL 列出归档根下按「归档根两层目录」枚举的条目（会话标识取目录名、不做前缀归一；
附体积、迁移时间与所属项目目录）。宿主 SHALL 读取每个条目的会话日志前缀以取得标题与创建时间：
标题 SHALL 取前缀内**首个** `session/title` 事件（解压文本预算 256 KiB、帧粒度推进、首命中即停），
创建时间 SHALL 取日志头部 `createdAt`；读取失败或预算内未命中 SHALL NOT 使列表失败，SHALL NOT 产生逐条错误。
标题 SHALL 视为尽力快照，SHALL NOT 承诺与日志中最新标题一致。标题不可得时 SHALL 回退为目录名短码。
行的主标识 SHALL 是「标题，或标题不可得时的目录名短码」（不再以完整目录名为主标识），
完整目录名/id SHALL 以短码保留在次要行；所属项目目录在可匹配工作区时 SHALL 以工作区名替代显示。
提供两个批量动作：…

#### Scenario: 标题取自日志前缀
- **WHEN** 归档条目的日志在前缀预算内存在 `session/title` 事件
- **THEN** 已迁移域该行主显该标题，次行显示 id 短码、工作区名（可匹配时）或项目目录、体积与迁移时间；
  创建时间仅在行时间悬停中可见

#### Scenario: 标题缺失回退目录名短码
- **WHEN** 条目目录内没有规范日志、日志损坏，或前缀预算内没有 `session/title` 事件
- **THEN** 该行主显目录名短码（截断形态），其余字段照常渲染，列表整体成功且不产生逐条错误

#### Scenario: 标题近似不承诺最新
- **WHEN** 同一会话日志在前缀之后还存在更新的 `session/title` 事件
- **THEN** 界面展示前缀内首个标题事件的值，允许与日志最新标题不同

### Requirement: 批量线上契约

（保留既有 requirement 文本，在其末尾追加以下两句）已迁移列表响应中的每个条目 SHALL 允许携带可选 `title`（非空字符串）与可选
`createdAt`（正有限数，epoch 毫秒）；缺失 SHALL 表示「该字段不可得」而不是错误；出现但类型/取值非法
SHALL 按 `bad-response` 拒绝并指明字段。其余端点、请求体与既有失败码 SHALL NOT 改变。

#### Scenario: 已迁移列表携带标题与创建时间
- **WHEN** 宿主能读取条目的会话日志前缀
- **THEN** `list-migrated` 响应对应条目携带 `title` 与 `createdAt`；读不到的条目不携带这两个字段
```

- **前提**：`pnpm spec:check`（`openspec validate --all --strict`）要求变更目录四件套齐备
  （`proposal.md`/`design.md`/`tasks.md`/`specs/` 与 `.openspec.yaml`）；若落档阶段未先补齐，
  spec:check 会因缺件报红——这是流程顺序问题，不是本 delta 的形状问题。
- README 6 处按 1.4；**不得写绝对路径**（`scripts/check-docs.mjs` 的 `absolute-paths` 开启且无豁免），
  上游证据写成「包名 + 文件 + 符号」，真机路径用 `$DSH_HOME` 变量表述。
- README 明确记录**已知近似**（6.1% 陈旧、0.5% 无标题）与**代价**（列表刷新会读归档日志前缀，只读、不缓存）。

**验收**

```bash
pnpm spec:check
pnpm docs:check
```

- `spec:check` 输出包含 `✓ change/2026-11-09-session-manager-info-display` 且总失败数为 0。
- `docs:check` 退出码 0（README 骨架四节仍在、无绝对路径、相对链接可解析）。

### TG6 门禁验证

**文件**：无源码改动；`lib/index.js`、`lib/client.js` 重建并核对新鲜。

**要点**
1. 全量 `verify:all`（lint → typecheck（host+client 两段）→ build → test）。
2. 分层 grep 断言（见下表）：`session-log-title.ts`/`migrated.ts` 零 `node:`；client 侧零 `zstd`。
3. 仓级三组门禁：`spec:check`、`docs:check`、`dsh:check`。
4. 装载性（真机，可选但记录）：`dsh --profile web --dump-config` 退出码 0（本包既有 profile 行会让
   `--dump-config-schema` 有既有噪音，装载门禁只认 `--dump-config`）。

**验收**

```bash
pnpm --filter dsh-plugin-web-ux verify:all
grep -nE "from 'node:" plugins/web-ux/src/session-log-title.ts plugins/web-ux/src/migrated.ts  # 期望无输出（exit 1）
grep -rnE "from 'node:|zstd" plugins/web-ux/src/client/                                        # 期望无输出（exit 1）
grep -c "aria-hidden" plugins/web-ux/src/client/SessionManagerDialog.tsx                 # 期望 1
pnpm spec:check
pnpm docs:check
pnpm dsh:check
```

### TG 依赖与提交切分

| 顺序 | 提交 | 依赖 | 说明 |
| --- | --- | --- | --- |
| 1 | TG1 契约 + 契约测试 | 无 | 后续两端的编译前提（`title`/`createdAt` 类型） |
| 2 | TG2 宿主读取器 + 适配器 + 宿主测试 + `tsconfig.host.json` + 重建 `lib/index.js` | TG1 | 宿主行为切换点；既有迁移用例必须原样绿 |
| 3 | TG3 `display-format` + model + 模型测试 + `tsconfig.client.json` | TG1 | 纯派生，可先于视图落地 |
| 4 | TG4 文案 + 样式 + 视图 + 视图测试 + 重建 `lib/client.js` + bundle 断言 | TG3 | 行为切换点；`Key` 字面量必须先于 JSX |
| 5 | TG5 delta + README | TG4（描述最终行为） | 需变更目录四件套齐备才能过 `spec:check` |
| 6 | TG6 全量门禁 + 产物新鲜度复核 | 全部 | 不改源码；只跑门禁与重建核对 |

### 验证矩阵（需求 → 断言 → 命令）

> 下表命令均以本仓根为 cwd；`$P = pnpm --filter dsh-plugin-web-ux`。

| 需求/决策 | 可判定的断言 | 命令 |
| --- | --- | --- |
| 需求① ID→会话名称 | 读取器/流程/契约三段：前缀内首个 title 被读出并进响应；视图 checkbox 可访问名 = 标题 | `$P exec vitest run test/session-log-title.test.ts test/migrated.test.ts test/contract.test.ts test/session-manager-dialog.test.tsx` |
| 需求① 回退可定位 | 17 字符串目录名 + 无标题 → 主显 16 字符 + `…`；次行不重复该短码 | `$P exec vitest run test/session-manager-model.test.ts test/display-format.test.ts test/session-manager-dialog.test.tsx` |
| 需求② 字段全集 | 已迁移行含标题/id/工作区名或项目目录/体积/迁移时间，创建时间仅在悬停 | `$P exec vitest run test/session-manager-dialog.test.tsx` |
| 需求② 两行式布局 | `.row` 内 `.rowMetaRow` 存在；checkbox 可访问名不变（非唯一可访问名会红） | `$P exec vitest run test/session-manager-dialog.test.tsx` |
| 需求② 活跃/已归档增量 | `cwd` 尾段与 fork 徽标派生正确（含 subagent 排除） | `$P exec vitest run test/session-manager-model.test.ts` |
| 需求③ 域计数 | tab 可访问名 = 纯文案；`textContent` 含可见行数；迁移未加载不显示数字 | `$P exec vitest run test/session-manager-dialog.test.tsx` |
| 需求③ 过滤框 | 三域各自保留过滤词；匹配标题/id/目录/工作区名；大小写不敏感；过滤空态文案含查询词 | `$P exec vitest run test/session-manager-model.test.ts test/session-manager-dialog.test.tsx` |
| 需求③ 全选口径 | 过滤后全选只覆盖可见行；已选计数与动作输入都只含可见行 | `$P exec vitest run test/session-manager-model.test.ts test/session-manager-dialog.test.tsx` |
| 需求③ 归档根显示 | 已迁移 tab 出现 `manager.confirm.archiveRoot`（复用键），确认页无重复匹配 | `$P exec vitest run test/session-manager-dialog.test.tsx` |
| 需求③ 时间格式 | 同年无年份、跨年带年份、悬停全串、0/NaN → `—` | `$P exec vitest run test/display-format.test.ts` |
| 分层纪律 | `session-log-title.ts`/`migrated.ts` 零 `node:`；client 零 `zstd`；宿主产物含 `node:zlib` | 见 TG6 的三条 `grep` + `$P build && $P exec vitest run test/bundle.test.ts` |
| 契约向后兼容 | 缺新字段的响应仍解析成功；请求契约用例全绿 | `$P exec vitest run test/contract.test.ts` |
| 全量回归 | `verify:all` 退出码 0 | `pnpm --filter dsh-plugin-web-ux verify:all` |
| 规范 | `spec:check` 退出码 0（含新增 change） | `pnpm spec:check` |
| 文档 | `docs:check` 退出码 0 | `pnpm docs:check` |
| 仓级门禁 | `dsh:check` 退出码 0（基线 / AR1–AR8 / B1–B5） | `pnpm dsh:check` |
| 装载性（真机） | `--dump-config` 退出码 0；打开「工作区配置 → 会话管理 → 已迁移」能看到标题 | `docker exec dsh dsh --profile web --dump-config`（装/重启 profile 后） |
| 性能（验证缺口） | 单元断言：每条 ≤2 次读取、≤512 KiB、在途 ≤3；**真实归档根端到端耗时不进 CI** | `$P exec vitest run test/migrated.test.ts`（耗时缺口记入 A-8） |

---

## ⑥ 设计假设与未决项

### 6.1 设计假设

- **A-1（日志命名族）**：归档条目内的日志文件是规范名 `session.jsonl[.zstd]` / `session.vN.jsonl[.zstd]`
  （上游 `sessionFormatLogFilename` + `.zstd` 后缀）。未来更高版本（v5+）仍被同一正则接受；若上游改命名规则，
  代价是标题回退（不崩）。
- **A-2（帧结构稳定）**：拼接帧容器与上游 `scanZstdFrames` 同构；`Window_Descriptor` 分支必须由测试覆盖
  （流式压缩产 Single_Segment=0 帧），否则正是父会话首版脚本踩过的坑。
- **A-3（预算与前缀是工程参数）**：256 KiB 文本预算由 decisions 定；128/512 KiB 前缀由本设计推导
  （见 D-03 的充分性论证），如需调整只改常量与对应用例。
- **A-4（近似与缺失接受）**：6.1% 陈旧、0.5% 无标题是已接受的代价；界面不标注「可能不是最新」
  （是否标注见 P-2）。
- **A-5（只读）**：读取器只打开文件读取，不写、不加锁、不改 mtime；归档条目目录的 mtime 仍是列表的 `updatedAt`。
- **A-6（不改列表高度）**：两行式让可见行数下降，`.list` 的 `max-height: min(46vh, 420px)` 与滚动行为保持不变。
- **A-7（计数徽标的可访问性）**：`aria-hidden` 节点不进入可访问名——已用 `dom-accessibility-api@0.5.16` 实测
  （`活跃<span aria-hidden="true">7</span>` → `"活跃"`），并写成 TG4 的断言。
- **A-8（验证缺口）**：真实归档根（1134 条）的端到端刷新耗时不进 CI（测试用合成 zstd 帧 + fake 端口）；
  只有「每条约 ≤2 次读、≤512 KiB、在途 ≤3」的单元断言，真机耗时靠人工观察。
- **A-9（客户端字段名）**：fork 判定读 `SessionSummary.parentId`（`$UP/dsh-api-session-controller/lib/types/client/sessions/service.d.ts:24`），
  其语义等于 header 的 `parentSession`；上游若改名，徽标静默消失但不会崩。
- **A-10（零配置/零依赖）**：`node:zlib` 是内建；`package.json`、`cordis.patch.yml`、`dsh.client.inject`、
  `archiveRoot` 配置键全部不动，因此无版本迁移动作、无 profile 侧配置变更。

### 6.2 未决项摘要

本设计**没有阻塞开工的未决项**。两项需要上游角色确认或接受（详见文末「待决问题」）：

- **P-1** delta 只覆盖两条 requirement，三域通用的呈现（两行式/计数/过滤/fork 徽标）缺少 spec 约束。
- **P-2** 「标题近似 / 回退」是否要对用户显式可见。

另外两条已在本设计内裁定、不需要再问，记录备查：探测失败静默不告警（D-04，既有 warnings 契约与 0.5% 正常态）；
非压缩日志也支持（D-16，上游 `compression: none` 是受支持配置）。

---

## 待决问题

### P-1 spec delta 的覆盖面：两条 requirement vs 三域通用呈现

- **问题**：`decisions.md` 定 delta 只改「已迁移会话管理」「批量线上契约」两条，但本次新增的**两行式行布局、
  域计数徽标、过滤框、活跃/已归档的 fork 徽标与项目目录尾段**是三域通用界面行为，现有 spec 没有对应
  requirement（`openspec/specs/dsh-web-ux-session-manager/spec.md` 只定义入口、工作区定向、三域动作与
  已迁移域字段，从未定义行布局或过滤）。按当前 delta 落档，这些行为只有 README 与本文承载。
- **选项**：
  - **a（推荐）** 严格按 decisions 落两条 MODIFIED，通用呈现写进 README；不新增 requirement。不重开收敛，
    代码与测试照样覆盖这些行为。
  - **b** 追加一条 `## ADDED Requirements`「会话管理面的信息展示与过滤」（append-only，不改已定两条），
    覆盖两行式、域计数、过滤与 fork 徽标。代价是多一个 requirement + 3–4 个 scenario。
  - **c** 把它们塞进「已迁移会话管理」：语义错位（过滤与计数覆盖三个域），不选。
- **推荐**：a。理由：收敛留痕明确限制了 delta 范围；通用呈现的行为契约已在本文 ③3.6/3.7 与 README 里写死，
  并在 TG4 有逐条断言；若 OpenSpec 评审要求 spec 面覆盖，再按 b 追加（append-only，不动已定两条）。
- **影响面**：仅 spec 文件与评审；b 不产生任何代码/测试改动。不影响 TG1–TG6 的实施。

### P-2 「标题近似 / 回退」是否要对用户显式可见

- **问题**：6.1% 的条目首标题 ≠ 日志最新标题（all-prompts 再生成所致），0.5% 没有标题事件。当前设计
  对两种情况都不给界面提示：陈旧标题**看起来像真标题**，回退短码**看起来像正常标题**。用户可能据此误判。
  （此问**不回退** Q2 的短码裁定，只问「要不要把近似这件事说出来」。）
- **选项**：
  - **a（推荐）** 不加行内标记，只在 README 的「已知限制」与 spec 文本里声明「尽力显示、不承诺最新」。
  - **b** 在时间/标题上加悬停说明（如「标题取自日志前缀，可能不是最新标题」），或在回退行加一个弱化徽标。
  - **c** 对回退行显示 `（无标题）` 而不是短码。**不选**：Q2 已裁定短码（保留可定位性），c 属重开。
- **推荐**：a。理由：行内标记只会给 100% 的行增加噪音（用户无法判断哪些是陈旧标题），而 README/spec
  已诚实声明；模型里的 `titleSource` 字段已为 b 保留落点，后续若要加是纯视图改动 + 1 个文案键。
- **影响面**：b 需要 1–2 个文案键与视图条件渲染，不改宿主、契约与模型；a 为零改动。

---

## 附：与 `decisions.md` 的一致性核对

| decisions 终态 | 本文落点 | 是否改动结论 |
| --- | --- | --- |
| 标题来源 = 读日志前缀，256 KiB 文本预算、帧粒度、超限回退 | D-01 / D-03 / TG2 | 不改；前缀 128/512 KiB 是实现参数（D-03 论证） |
| 回退 = 短码目录名 | D-08 / `titleOfMigrated` | 不改 |
| 字段全集 + 两行式 | 3.1 / 3.6 / 3.7 | 不改；回退行次行不重复 id 属渲染去重，不改字段集 |
| 域计数（过滤后可见行数）+ 过滤框（三域独立）+ 归档根显示 | D-10～D-13 | 不改 |
| 时间 = 紧凑绝对（当年省年，悬停全串）、主显迁移时间、创建时间进悬停 | D-14 | 不改 |
| 排序切换不做；时间仍 `updatedAt` 倒序 | `compareMigrated` 不动 | 不改 |
| fork 徽标 = `parentSessionId` 非空且非 subagent | `isFork`（客户端字段名 `parentId`） | 不改语义，只记录字段名事实（A-9） |
| spec delta = 两条 requirement，`session-delete` 不动 | D-15 / TG5 | 不改；覆盖面缺口上浮 P-1 |
| 解压并发受限、逐条失败降级不阻塞列表 | D-04 / D-06 | 不改；"复用 listConcurrency 思路" 落实为并发 3（上游默认值） |

## 附：阶段 1.75 界面演示（判定与确认）

- **判定**：命中 C1∧C2∧C3，排除表无命中 → **触发演示**。
  - C1：本次产出含两行式行布局、过滤框、域计数徽标、归档根行、紧凑时间等界面改动（触达面 1.1 的 Dialog/CSS 条目）。
  - C2：用户未提供 Figma/截图/原型；改动对象即现有布局本身，无可照抄的设计依据。
  - C3：两行式行结构 + 过滤框 + 徽标属新视觉与布局决策，非「既有设计体系内零视觉决策的机械改动」。
- **分档**：L2——含关键交互流（过滤收窄行集、全选作用于可见行）与多状态（回退行、过滤空态、running 置灰行、悬停提示）。
- **产物路径**：`/tmp/spec-flow/2026-11-09-session-manager-info-display/demos/session-manager-rows-l2.html`（宿主预览 `file:///data/tmp/spec-flow/2026-11-09-session-manager-info-display/demos/session-manager-rows-l2.html`）。
- **确认结论**：已确认（2026-11-09 12:39，用户三选一选「① 确认，转入落档」）。自检轮次 2：首轮视觉核对 A–F/H/I 通过、G（徽标渲染于行首）不通过 → 改稿（`.badge` 补 `order:1`）→ 几何复验 3/3 通过、控制台零消息、双视口零横向溢出。
