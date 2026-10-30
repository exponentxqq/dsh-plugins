# Design

> 本文承载阶段 1.7 设计线产物 `code-design.md`（同目录落档副本，685 行）的深度契约；该副本为深度细节权威，本文按其六字段逐断言映射。收敛留痕见同目录 `diff-matrix.md`（共识 C1–C10 / 裁定 D1–D3 / 用户拍板 Q1–Q5、P1–P3 / 单边核验 S1–S15）。

## Context

- 单 git 仓 pnpm workspace，`plugins/*` 一插件一 bundle；本变更新增 `plugins/session-tool-toggle/`，**无既有源码改动**。
- 机制底座全部为已核查的 DSH 公开 API：`tools.restrict`（未知名抛错、只过滤继承面、掩码取交集）+ `tools.guard` + agent 作用域同名空 `systemPrompt.section`（渲染丢弃空段）+ `dsh-tool-skill` 对 `skill` 被掩码的空目录退役语义 + `appendPluginRecord`/投影/`session.snapshotEvents()` 日志面。
- 工程先例：`plugins/project-mcp/`（isolation.ts 掩码引擎三读并集、diff 守卫、`agent/created` 返回 Promise、ports/适配分层、build.mjs/vitest/oxlint）——本插件 deny 来源从「工作区归属」换成「会话开关状态」，引擎结构照抄。
- 实测基线（本部署，读数面 = Host Inspect `Tool.listTools`）：可见工具 214，MCP 139（yunxiao 70 / chrome-devtools 32 / dbx 18 / codebase-memory 17 / figma 2）。

## Goals / Non-Goals

**Goals:**

- 会话级开关在下一步模型步骤即时生效：不可见（restrict）+ 拒调用（guard）双层强制
- 开关状态跨 resume/fork 持久（整值事件 + 投影 fold），持久化通道可切换（日志记录 ↔ 自有存储域）+ 内存降级
- 用户级默认档：命令可写、会话创建时快照（含子代理/队友会话）、不追溯
- 工程质量对齐仓库惯例：vitest/oxlint、engines 派生基线、`pnpm dsh:check`/release

**Non-Goals:**

- 不做全局/进程级服务器启停（plugin_manager 已有）；不做 per-skill 粒度、子代理继承会话开关、Web UI 面板、工作区级默认档（v2 候选池）
- 不改变权限/沙箱语义（开关面向 token 经济，非安全边界）；不做历史改写（已发生的调用保留）
- 不适配 DSH `>=0.3.0`（走既有基线升级流程）

## Decisions

> 完整被否方案、反例与证据锚（每模块 ≥1 条 file:line）见 `code-design.md` ②④；此处逐条精炼并给关键依据。

**栈识别结论（writer skill）**：本仓为 TypeScript/pnpm workspace 的 DSH(Cordis) 插件仓，聚合层无对应 writer skill（仅 spring-writer/nuxt-writer，分属 Java/Vue 栈）——**用户已于 2026-10-30 拍板豁免本次加载**（仅本次有效，如实标注）。替代硬约束 = 仓库 AGENTS.md「插件结构约定」「DSH 基线」「开发与验证命令」+ project-mcp 先例。

- **D0 持久化双实现**（P1=c 拍板）：默认 `appendPluginRecord`（type `plugin:session-tool-toggle/state`，整值事件）+ host-only 投影 key `sessionToolToggle`（stateVersion 1）；`ctx.storageDomain` 自有域为同一 `StateStore` 端口第二实现（配置键 `persistence: 'record' | 'storage-domain' | 'memory'`）。被否：仅记录通道（官方 README 明写仓外不得调用，无退路）；仅自有域（丢 fork/resume 免费语义、要 GC）。
- **D1 宿主模块身份断言**：`appendPluginRecord` 写入是类静态块私有钩子（`dsh-session/lib/index.js:1540-1548`）——只有宿主那一份 `dsh-session` 能写，bundle 自带副本 brand 失败。设计：`realpath(process.argv[1])` → dsh 包根 → `createRequire` 解析 → 动态 `import()` + `mod.Session === session.constructor` 身份断言（已 spike 实证）。**禁止**用 `session.append` 伪造记录：写不出 `ignorable: true`，而缺失该标记的未知事件会令旧读者拒绝重建会话日志。
- **D2 命令面单命令**（P2=a 拍板）：单一 `/tools` + 子文法 `off/on/status/default`，`input.hint` 给文法；被否：四独立命令（解析与文案四份）。
- **D3 地址文法**：`mcp:<server>` / `mcp:<server>::<tool|尾部*>` / `tool:<name>`（`skill` 解析期归一 `tool:skill`；单工具匹配打在 public name `mcp__<server>__<raw>` 上，serverName 文法不含 `::` 故无歧义）。
- **D4 指令段遮蔽**：agent 作用域同名空 section（`dsh-scope` merge 最近层胜出 + 渲染丢弃空段，本地实测 `{name:'mcp:yunxiao',text:''}` 渲染消失）；先例 `dsh-file-reference-local/lib/index.js:342-349`。
- **D5 保护名单**：硬编码基线 bash/read/edit/write/glob/grep + 只可追加的配置键 `protectedTools`（不可移除基线）。
- **D6 回执只报计数与代价形状**（关闭数/可见数/KV 缓存一次性重建提示，开/关对称），不做 token 估值（`tokenMeter` 留作冒烟验收工具而非运行时依赖）。
- **D7 状态变更即时应用**，不 `await agent.whenIdle()`（命令本就在用户轮外执行；guard 兜竞态窗口）。
- **D8 新会话一定落快照记录**（默认档为空也落）：快照来源可观测、resume 重放无歧义。
- **D9 读路径投影优先 + 日志重放兜底**（`session.snapshotEvents()` 公开读面，投影不可用时零 DSH 运行时依赖）。
- **D10 deny 三读并集**（全局层 + agent 视角 + carried 保持），照抄 isolation.ts：322-384——服务器断线名字消失不抛错、被 project-mcp 掩掉的名字仍算已知（交集不抛错）。
- **D11 bundle 自包含**：宿主 DSH 服务包不进 bundle 图（运行时动态 `import()`，specifier 为变量）；zod/schemastery/dsh-home-paths/dsh-atomic-write 四纯库打进产物；esbuild banner 注入 `createRequire`。

## 触达面与接口形状（映射 code-design ①③）

**新增**（根仓 `plugins/session-tool-toggle/`，全部新建）：`package.json` / `cordis.patch.yml`（仅 insert 一行，零配置可跑）/ `build.mjs` / tsconfig×3 / `vitest.config.ts` / `.gitignore` / `src/index.ts`（形状转发）/ `src/host/{index,types,address,state,mask,session-layer,host-runtime,record-store,defaults,commands}.ts`（11 个 src，≈1400–1700 行）/ `test/*.test.ts`×7（≈900 行）/ `README.md`。
**修改**（根仓）：`README.md` 插件清单表 + `AGENTS.md` 插件清单与「四个软插件」计数；`pnpm-workspace.yaml` 仅当 zod 被发布年龄门拦截时追加豁免（条件项）。
**核心接口**：`SessionToolState{version,disabled,snapshot,seeded,updatedAt}`（整值）；记录 type `plugin:session-tool-toggle/state`；6 端口 `ScopedSurface/StateStore/HostSessionApi/SpecLog/DefaultsFile/Config`；配置键 `persistence` / `protectedTools` / `defaultsPath?` / `maxRetries?`。关键不变量 10 条见 code-design ③.9（含「deny 永远从活读数推导」「同 deny 集不重复 restrict」「身份断言失败一律不写记录」）。

## Risks / Trade-offs

- [官方政策：README 明写仓外插件不得调用 `appendPluginRecord`] → P1=c 双实现，配置键一键切换；README 明示依赖实验性通道
- [KV 前缀缓存一次性失效（开关当轮多付全量 prefill）] → 命令回执对称提示；默认档快照在创建时生效可免中途重建
- [非全局安装形态下 `process.argv[1]` 解析不到 dsh 包根] → 身份断言失败自动降级内存态并如实告知；T8 冒烟覆盖
- [`agent/created` 内 append 的时序窗口 / 重算风暴 O(N×M)] → 事件驱动幂等 + diff 守卫；T8 压测 ≥5 agent × ≥5 服务器
- [skill 翻转产生目录替换消息成本 / 历史含已不可调工具] → README 预期管理段明示，不做历史改写
- [升 0.3.0 API 漂移] → engines 门禁 + `pnpm dsh:upgrade`/`dsh:check` 既有流程兜底

## Migration Plan

新插件独立 bundle：安装/卸载零迁移；不装本插件的 profile 行为零变化。发布走 `pnpm release <version>`（统一抬版本 + tag），profile 侧按 tag 安装。

## Open Questions

技术未决 7 条（不阻塞实施路线，实现期实测回填 design 假设）见 `code-design.md` ⑥.2：非全局安装的 argv 形态、`agent/created` 内 append 窗口、被工作区隔离工具的 known 语义、投影 checkpoint 与重放的边界、storageDomain 后端路由细节、`tools/change` 风暴量级、`dsh-home-paths` 在子代理进程内的解析时机。
