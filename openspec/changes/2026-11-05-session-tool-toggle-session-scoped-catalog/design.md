# Design

> 本文档承载 `code-design.md`（随本变更入库的规划材料）的深度契约断言；编号（H/C/B/TS、D-n、G-n、A-n、U-n、P-n）以该文件为权威展开，此处为可审精炼面。

## Context

- 全局层读数闭包：`src/host/index.ts:273`（`ctx.tools.schemas()` 无 scope，会话无关）同时喂三处——`index.ts:642`（`new SessionLayer({log, catalog})`）、`index.ts:764`（`ControlDeps.catalog`）、`index.ts:812`（`RpcDeps.descriptions`，根 ctx `apply()` 期一次装配）。
- 会话作用域读数已在位：`session-layer.ts:259` `visibleNames: () => scope.tools.schemas(agent).map(s => s.name)`，与 `/inventory`（`plugins/user-commands/src/host/index.ts:213` `tools.schemas(agent)`）逐字同源。
- 重算链已在位：`tools/change → refresh()` 幂等全量重算（`session-layer.ts:274/453`；restrict 自身触发 tools/change，I2/I6 幂等设计）——「意图后效」（工具出现在会话即生效）无需新机制。
- 现行 spec `dsh-session-tool-toggle` 零「全局层/被其他作用域/shadowed/catalog」条款（grep 计数 0）——全局层口径纯是归档设计层裁决（R15①/R18①/R20①），本次推翻。
- **栈识别结论**：目标为 TypeScript + esbuild + cordis 插件（非 Spring 非 Nuxt，探测 `pom.xml`/`build.gradle`/`nuxt.config.*` 均未命中），聚合层无对应 writer skill，**用户已明确豁免本次加载（仅本次有效）**——不留分层/拆分硬约束，深度契约由本变更六字段自持。

## Goals / Non-Goals

**Goals:**

- 清单宇宙、掩码候选、matched 计数四处同源收敛为 `scoped ∪ carried`（两读）：`session-layer.plan()`、`control.toggleSession/readPanel`、`panel.buildPanelSnapshot`。
- `catalog` 字段从五个 seam + `RpcDeps.descriptions` 整体删除；`hiddenByOthers`/工具面 shadowed 展示链整条删除。
- 描述改经本会话层读数；`/tools status` 会话作用域计数 + 层未就绪诚实降级。

**Non-Goals:**

- 不改 `/inventory`、project-mcp、技能分面（`SkillView.shadowed` 影子 stub 与 `ClosedAddressReading.shadowed` 指令段遮蔽两处同名不同义标记保留）、上游 DSH。
- 不做层内描述缓存（已关条目失描述的兜底，另立小变更，见 D-4/P2）。

## Decisions

| # | 决策 | 被否方案（理由） |
| --- | --- | --- |
| D-0 | 栈识别未命中，writer 豁免留痕（见 Context） | — |
| D-1 | 清单宇宙 = `scoped ∪ carried`，掩码写路径同源改两读（承接 decisions D1） | 只改展示面（deny 仍含全局层名字 → 经 carried 回流面板，「从面板消失」不成立；toggle 回执 matched 与 deny 分叉） |
| D-2 | `catalog` 五 seam 全删，不留「改义」形态（承接 decisions D2） | 保留改义（与 scoped 同源的双字段是永恒歧义源） |
| D-3 | `hiddenByOthers` 整条删除，而非保留恒空数组（承接 decisions D3 删除裁定） | 保留恒空字段（wire 上多一条永远为 0 的死数据 + parser/键表/文案全套陪葬） |
| D-4 | 描述经本会话层 `visibleSchemas()` 读数；已知代价：已关条目失 `title` 描述，README 写明（承接 decisions D6） | 层内描述缓存（一份跨会话状态 + 淘汰路径，收益仅一行 title，另立小变更） |
| D-5 | `stats` 按「删两个」落地为 `{ visible, denied }` 两计数（分歧点 P1 已裁定） | 第三项 `intentOnly`（新增能力非删除算术，用户已否）；`entries`（D3 已否的 catalog 改义） |
| D-6 | 模块级 `inject` 保留 `['agents','tools']` 不缩成 `['agents']` | 缩减（缺 `tools` 的 profile 下 `agent.ctx.inject(['tools',…])` 永久 pending → `agent/created` 挂死） |
| D-7 | `/tools status` 段 6 删行后，段 5 自带「会话层未就绪」降级行 | 无降级（层未就绪误报「MCP 服务器 0 台」） |
| D-8 | `closedStateText` matched=0 文案改「已记录：本会话当前没有匹配的工具定义；它出现在本会话后自动生效」 | 保留「服务器上线后自动生效」（对被作用域隐藏的服务器误导：上线≠本会话可见） |
| D-9 | 与 `/inventory` 两处刻意差异写进 README 与 proposal，不写进 UI 文案 | UI 加说明行（与「面板还管 tool:/skill:」形成解释冲突，P3 详述） |
| D-10 | 测试替身删 `catalog` 选项，不留 `catalog → scope` 兼容别名 | 兼容别名（掩盖 seam 已删的事实，测不出遗漏改造点） |
| D-11 | 文档（插件 README L77/L120）与产物（`lib/`）同步是施工项，不是收尾项 | 收尾再改（README 的口径段与实现长期打架） |
| D-12 | 版本号维持 `1.5.0`（承接 decisions D5） | bump（与 7c38dbe 同批发布） |
| D-13–D-15 | 详见 code-design ④（wire strict 键表同步、`plan()` 首轮读失败不掩码但 guard 仍装、`switchableText` 计数源改两读候选） | 各附反例，见原文 |

## 接口与数据形状（摘要，全文见 code-design ③）

- `ScopedSurface` 增 `visibleSchemas(): readonly { name: string; description: string }[]`（`scope.tools.schemas(agent)` 轻量投影，name+description 两字段）；`LayerHandle` 同步暴露。
- `MaskInputs` 改两读 `{ scoped, carried, disabled }`（catalog 删除）；`unionNames` 改两参。
- `ControlDeps` 删 `catalog`；`RpcDeps` 删 `descriptions`；`rpc.ts` 组装改 `descriptionsOf(deps, session)` 经 `layerFor` 取层（层未就绪 → 空 Map，快照不带 description）。
- wire：`Stats = { visible, denied }`（P1 裁定后定稿）；`ToolEntry` 去 `shadowed`；`PanelSnapshot` 去 `hiddenByOthers`；contract 三张 strict 键表与三个 parser 同步删。
- 配置面零变化（无新配置键/文件位置变化）。

## 逐任务组要点（对齐 tasks.md T1–T6，详细见 code-design ⑤ G1–G6）

- **T1 契约与端口形状**（串行闸）：contract 键表/parser、`types.ts` 字段删除、`Stats` 形状——后续组的编译基座。
- **T2 会话读数面**：`ScopedSurface.visibleSchemas()`、session-layer catalog 端口删除、`plan()` 两读、rpc `descriptionsOf` 装配、index.ts 注入清理（保留 `['agents','tools']`）。
- **T3 掩码与内核两读**：mask.ts `MaskInputs` 两读 + `unionNames` 两参；control.ts `catalogOf` 整函数删、`toggleSession/readPanel` 改造、`PanelReading` 瘦身。
- **T4 面板构建器与命令面**：panel.ts `hiddenByOthers`/`EntryContext.hidden`/`Stats` 删；commands.ts `hiddenText` 删、`switchableText` 降级行、`closedStateText` 会话口径文案。
- **T5 浏览器半**：locales 六键删（zh/en）、ToolPanelGroups 徽章分支删、ToolPanelAction 统计行重排、CSS 注释。
- **T6 文档、产物与全量回归**：README 口径段与代价说明、`lib/` 重建、`verify:all` + 三条 grep 归零门禁。

## Risks / Trade-offs

- [restrict 对未知名抛错的既有 I3 重推路径不变，但首轮读失败行为翻转] → `session-layer.test.ts:604` 原「读视图失败仍按 catalog 掩码」断言翻转为「不掩码但 guard 仍装」；常规重算因 carried 保底不会抬掩码（code-design ③ 3.4 论证）。- [已关条目失去悬浮描述] → README 写明；用户抱怨再立层内缓存小变更（D-4/P2）。
- [`tools/change` 触发链完备性] → 依赖 dsh-scope 既有行为（restrict 触发 change）；G2/G3 组内含针对性断言。
- [用例总数波动] → 总数不作硬门禁（防数字掩盖漏改），以各组「必含断言」逐条落地为准；终局门禁 `verify:all` 全绿 + `grep -c hiddenByOthers lib/index.js = 0`、`grep -c entry.shadowed lib/client.js = 0`、`grep -c 被其他作用域隐藏 README.md = 0`。

## Open Questions（落档分歧点已全部裁定）

- **P1 → 两计数 `{visible, denied}`**：用户裁定与「删两项」算术一致；蓝图默认即此，零修订。
- **P2 → 接受已关条目无描述**：README 写明代价；层内描述缓存留作后续小变更。
- **P3 → 不加面板说明行**：与 D-9 一致，预期管理写进 README 与 proposal。
