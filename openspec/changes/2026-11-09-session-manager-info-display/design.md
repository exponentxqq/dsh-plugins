# Design

## Context

「会话管理」分节（web-ux 贡献于统一「工作区配置」页面，order 30）现状：三域 tab（活跃/已归档/已迁移）五阶段状态机已稳定；已迁移域行首是裸目录名（≈会话 id），spec 明文「不承诺会话标题」。完整代码级蓝图见随档 `code-design.md`（1452 行，六字段 + 1.75 附录，**与本文冲突处以 code-design.md 为准**）。

决定方案空间的三组宿主事实（实证锚见 `code-design.md` ②）：

- **标题数据面**：会话标题以 `session/title` 事件存在日志内（log-only、latest-wins），投影缓存 `storages/session_projcache/sessions/<id>.json` 只是缓存且迁移档删除（`dsh-web-ux-session-delete` spec 明文）；`ctx.sessionPersistence.list()` 只扫 `<home>/sessions`，读不到归档根。→ 已迁移条目的标题只能从**归档日志自身**恢复。
- **日志物理形态**：`session.v4.jsonl.zstd` = zstd 拼接帧容器，第一帧恰为 header 行（`{type:'session',…,createdAt,cwd,…}`）；`node:zlib` 的 `zstdDecompressSync`/流式解压都只解出第一帧，title 事件在后续帧，须经**帧边界结构扫描 + 逐帧解压**。上游 jsonl 包的帧扫描器不经 exports 导出（发布件无 `src/`、入口类型面不含它），须本插件内实现（零新依赖，`node:zlib` 于 Node 22.15+/24 自带）。
- **实测分布**（1134 条真实归档条目）：99.5% 首个 title 事件在解压文本前 256KB 内；全文解压 p50≈1MB/p99≈15.6MB（全量解压不可取）；6.1% 首 title≠末 title（all-prompts 再生成）；0.5% 无 title 事件；帧扫描 0 失败。

**栈识别结论（阶段 1.7）**：writer skill = **dsh-plugin-writer**（证据：本仓为 dsh-plugins pnpm workspace 的 DSH 插件仓，Spring/Nuxt 判据皆未命中；存在锚定本仓的专属 skill `/home/docker/.agents/skills/dsh-plugin-writer/`（SKILL.md §1 唯一锚点即本仓路径），用户于 2026-11-09 指认）。web-ux 属该 skill 覆盖的既有双端插件（build-kit 薄入口路线）；本次不新建插件、不改形态，消费其构建/验证纪律（分层、产物守卫、`verify:all` → 仓级 `dsh:check`）。

## Goals / Non-Goals

**Goals:**

- 已迁移域行首尽力显示会话标题（日志前缀提取），缺失回退目录名短码；顺带白得创建时间。
- `MigratedEntry` 契约扩展两个可选字段（`title?`/`createdAt?`），请求形状与端点集合零变化。
- 三域行信息增强与两行式行布局；域计数徽标、过滤框（全选/动作输入作用于过滤后可见行）、已迁移 tab 显示归档根。

**Non-Goals:**

- 不动处置流程与语义（archive/dispose/unarchive/purge/restore 两阶段校验、`dsh-web-ux-session-delete` spec 一字不改）。
- 不做 LLM 标题再生成、不做排序切换（Q4-e 已否）、不为活跃/已归档域加逐会话体积测量（无批量 measure 端点，体积保留在 dispose 预览/结果里）。
- 过滤不进 spec（P-1=a：三域通用呈现由 README + `code-design.md` ③3.6/3.7 承载，代码与测试照常覆盖）。
- 标题近似性不加行内标记（P-2=a：README 已知限制 + spec 文本声明；模型 `titleSource` 字段为后续加标记留落点）。

## Decisions

（完整决策链与被否方案见 `code-design.md` ④，D-01…D-16；此处列主干，编号沿用。）

| # | 决策 | 被否方案与理由 |
|---|---|---|
| D-01 | 标题来源 = 列表时读归档日志前缀（Q1-B 用户裁定） | A 迁移时快照 sidecar：存量条目无标题、写用户数据目录、须改 delete spec；C 保留 projcache：违反纯缓存哲学、存量仍缺、同样改 spec；A+B 混合：双路径复杂度最高 |
| D-02 | 宿主新增纯逻辑读取器 `src/session-log-title.ts`（零 `node:*`、零上游 import），`src/index.ts` 装配 `node:zlib`/`node:fs` 适配器（特性探测，缺 `zstdDecompressSync` 则端口缺省） | import 上游 jsonl 包工具：不经 exports 导出（实测）；client 侧解压：zlib 不进浏览器半（分层纪律 + bundle 断言） |
| D-03 | 读取策略 = 两段压缩前缀 128KiB→512KiB、解压文本预算 256KiB、帧粒度推进、首个 title 命中即停（99.5% 实测覆盖） | 全量解压：p99 15.6MB×2000 条不可接受；只解第一帧：title 不在第一帧（实测） |
| D-04 | 帧扫描器 = 惰性生成器，结构性异常/尾部撕裂即止不抛；FHD 位域按上游判据（bit7-6 FCS、bit5 Single_Segment、bit2 checksum、bit1-0 dictID，`(descriptor & 24) !== 0` 拒绝） | 魔数搜索定帧界：压缩载荷内伪魔数命中即错位（上游同判）；解压抛错上抛：单条目损坏不该让列表失败 |
| D-05 | 探测在枚举后**并发 3**（镜像上游 listConcurrency 默认，手写 mapLimit）后置进行；探测永不抛、不发 warn（保住既有 45 条迁移用例的 warnings 精确断言） | 枚举中同步探测：慢条目阻塞列表；无并发上限：冷归档根上 IO 风暴 |
| D-06 | 契约：`title?`（存在须 trim 非空）/`createdAt?`（存在须正有限数，不写 0）；缺失即不写键（条件展开）；响应未知字段容忍度不变 | 置空值表示缺失：`title:null` 破坏「存在即合法」解析三分；必填回写：老宿主假想兼容负担（同包同装无此场景） |
| D-07 | 过滤/计数/全选判据全在 model（`ManagerFilters`/`filterSessionRows`/`filterMigratedRows`），视图零判据；动作输入按过滤后可见行投影，选择集合不因过滤裁剪 | 视图内联过滤：违背「判据全在 model」的既有架构；动作按未过滤行集：删除会作用到看不见的行 |
| D-08 | 行改两行式：首行 Checkbox（唯一可访问名）+徽标，次行 `.rowMetaRow` 弱化 meta；tab 计数徽标 `aria-hidden="true"`（实测 dom-accessibility-api 可访问名不变，20 条既有 `getByRole('tab')` 断言零改动） | 单行塞全部字段：UUID+4 项 meta 互相挤压（现状缺陷）；计数进可访问名：全部既有 tab 查询断言要改 |
| D-09 | fork 判据 = `parentId` 非空且 `origin !== 'subagent'`（字段名按上游实测校正：`SessionSummary.parentId`，非 `parentSessionId`） | 按 `parentSession`（header 字段）名取 client 快照：字段不存在于 client 类型面 |
| D-10 | 显示派生单一来源 `src/client/display-format.ts`：`shortCodeOf`（16 字符+…）/`tailSegmentOf`（POSIX/Win32/根/空四分）/`formatCompactTimestamp`（当年 `MM-DD HH:mm`、跨年 `YYYY-MM-DD HH:mm`，返回 `{text,full}`） | 三处各自实现：边界（17 字符、`C:\` 盘符、跨年）行为漂移 |

**收敛依据**：需求 3 条 + Q1–Q8（grill-me 两轮）+ 实测补充见 `decisions.md`；落档分歧点 P-1（两条 MODIFIED，通用呈现不进 spec）/ P-2（不加行内标记）均经用户裁定（2026-11-09）。

**阶段 1.75 界面演示**：**触发（L2）并经用户确认通过**——C1∧C2∧C3 成立（两行式行布局为新视觉决策、无设计依据），产物 `demos/session-manager-rows-l2.html`（约 16.8KB 六状态屏：已迁移默认/过滤中/过滤空态/活跃域/已归档域/禁用与错误位）。自检 = chrome-shared 程序化断言（双视口零横向溢出、零外链、console 零消息）+ vision 子代理读图 A–I 清单（首轮 G 徽标位置不通过 → 改稿 `.badge{order:1}` → 几何复验 3/3 通过），确认于 2026-11-09 12:39。判定与证据详见 `code-design.md` 附录。

## 接口与数据形状（摘要）

（完整签名、解析规则与 JSDoc 见 `code-design.md` ③；此处只列对外可见形状。）

- **契约**（`src/contract.ts`）：`MigratedEntry` + `readonly title?: string` + `readonly createdAt?: number`（存在即合法、缺失即无键）；`parseMigratedListing` 增两字段校验（存在则校验、类型非法带字段名拒绝）。请求类型、端点常量、上限常量零变化。
- **读取器端口**（`src/migrated.ts`）：`MigratedPorts` 增 `readonly log?: MigratedLogOps`（可选⇒缺省时字段缺省、删除/恢复路径零改动）；`listMigrated` 的 `Pick` 增 `'log'`。
- **读取器**（`src/session-log-title.ts` 新建）：`chooseSessionLogName` / `iterateZstdFrames`（生成器）/ `probeSessionLogPrefix`（同步）/ `probeSessionLog`（异步两段前缀）；常量 `TITLE_TEXT_BUDGET_BYTES=256KiB`、`INITIAL_LOG_PREFIX_BYTES=128KiB`、`MAX_LOG_PREFIX_BYTES=512KiB`。
- **宿主适配**（`src/index.ts`）：`createNodeLogOps()`（特性探测 `typeof zlib.zstdDecompressSync === 'function'`，否则 `undefined`）。
- **client 模型**（`src/client/session-manager-model.ts`）：`SessionRowViewInput` +`cwd?`/`parentId?`；`SessionRowView` +`cwd`/`projectDirTail`/`isFork`；`MigratedRowView` +`title`/`titleSource`/`createdAt`/`workspaceTitle`/`shortId`；新增 `ManagerFilters`/`EMPTY_FILTERS`/`withTabFilter`/`normalizeFilterQuery`/`filterSessionRows`/`filterMigratedRows`。
- **显示派生**（`src/client/display-format.ts` 新建）：`shortCodeOf`/`tailSegmentOf`/`formatCompactTimestamp`（纯函数、零 React）。

## 逐任务组要点（对齐 tasks.md）

（每组实现要点全文见 `code-design.md` ⑤ TG1–TG6，此处对齐分组。）

- **TG1 契约扩展**：`MigratedEntry` 两字段 + 解析 + 契约测试三分（存在合法/缺失无键/非法拒绝）。
- **TG2 宿主标题读取器**：`session-log-title.ts` 新建（帧扫描/首 title/createdAt/预算）+ `migrated.ts` 后置探测（并发 3、永不抛、零新增 warning）+ `index.ts` 适配器 + 读取器/流程/真链路三层测试。
- **TG3 client 纯派生**：`display-format.ts` 新建 + model 行字段与过滤函数 + 两组纯函数测试。
- **TG4 视图与样式文案**：两行式行渲染、过滤框、域计数、归档根行、紧凑时间与悬停 + CSS 类名契约 + locales 6 键×2 + 组件测试 + `lib/` 重建。
- **TG5 spec 与 README**：两条 MODIFIED delta（本文档随档）+ README「会话管理」节与已知限制（标题近似性）。
- **TG6 门禁验证**：`pnpm --filter dsh-plugin-web-ux verify:all` → 仓级 `pnpm spec:check` / `docs:check` / `dsh:check` 全绿。

## Risks / Trade-offs

- [标题可能陈旧（6.1% 首 title≠末 title）] → spec/README 明示「尽力显示、不承诺最新」；模型留 `titleSource` 落点，后续可加标记（纯视图改动）。
- [前缀解压成本（2000 条上限×预算）] → 两段压缩前缀 + 帧粒度早停 + 并发 3 + 逐条失败降级不阻塞列表；实测 99.5% 在 256KB 内命中即停。
- [node:zlib zstd 在 Node 22.19 的可用性未在本仓实测（24.21 已实测）] → 适配器特性探测，缺失即端口缺省、字段缺省（降级而非报错）；engines 地板 ≥22.15（zlib zstd 引入线）。
- [帧扫描器自实现的正确性] → 与上游 `scanZstdFrames` 同一套字节判据、不同错误策略；测试用 `createZstdCompress()` 流式帧覆盖 Window_Descriptor 分支（一次性 `zstdCompressSync` 产 Single_Segment=1 帧覆盖不到该坑）；1134 条真实归档件实测 0 失败。
- [两行式行高的可见行数减少] → 行内信息完整性优先（Q3 裁定）；过滤框补定位效率（Q4-b 纳入）。
- [`selectedTabLabel` 助手 8 处断言改写] → 机械替换为按可访问名断言，行为等价。

## Migration Plan

插件双端同包同装：宿主新字段对旧 client 不可见（同版本安装无此组合）；client 解析对缺字段条目按现状渲染（回退短码）。部署 = 常规插件发布流程（`pnpm release`，tag 安装）；回滚 = 装回上一 tag，无持久化迁移、无配置迁移。归档目录无任何写入。

## Open Questions

（无——设计假设与未决项清单见 `code-design.md` ⑥，其中 R3（Node 22 zlib 实测）以特性探测兜底，不阻塞实施。）
