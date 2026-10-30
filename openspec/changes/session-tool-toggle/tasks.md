# Tasks

> 执行批次契约：`## N.` 组间严格串行（N 递增即执行顺序），组内任务互不依赖、可并行；每任务引用触达面清单（`code-design.md` §1.1/§1.2 表行 + 附录增量设计 §1）中的文件条目。openspec 立项与落档（code-design 任务组 T1）已随本变更规划完成，不重复列任务。组 9/10 为 2026-10-30 Web 面板扩展新增（原验证矩阵/文档组顺延为 11/12）。

## 1. 脚手架与最小闭环

- [ ] 1.1 创建 `plugins/session-tool-toggle/` 工程骨架（触达面 1.1：package.json（含双端字段：`exports "./client"`、`dsh.client.{inject,platform:"web"}`、react peer、client devDeps）、cordis.patch.yml、build.mjs（宿主+client 双构建）、tsconfig×4（含 client project）、vitest.config.ts（tsx/jsdom/alias）、.gitignore、src/index.ts、src/host/index.ts 空 apply、src/client/index.ts 空 apply、src/contract.ts 常量骨架、src/css-modules.d.ts、src/host/types.ts 端口完整声明）；验证：仓库根 `pnpm install` 退出码 0 后 `pnpm --filter dsh-plugin-session-tool-toggle build` 退出码 0 且 `test -f plugins/session-tool-toggle/lib/index.js` 与 `test -f plugins/session-tool-toggle/lib/client.js` 均为真，且 `grep -c '"platform": "web"' plugins/session-tool-toggle/package.json` 为 1
- [ ] 1.2 根仓文档补行（触达面 1.2：README.md 插件清单表加行、AGENTS.md 插件清单加条且「DSH 基线」节改为「四个软插件」）；验证：`grep -n "session-tool-toggle" README.md AGENTS.md` 两文件均命中，且 `grep -c "四个软插件" AGENTS.md` 为 1

## 2. 地址文法与状态模型

- [ ] 2.1 实现 `src/host/address.ts` 与 `test/address.test.ts`（触达面 1.1：地址文法/规范形/`skill` 归一/保护名单基线/未知 serverName 宽容）；验证：`pnpm --filter dsh-plugin-session-tool-toggle test` 退出码 0，其中 address 套件覆盖：`mcp:a::b*` 归一、`tool:mcp__x__y` 拒绝、`tool:bash` 命中保护基线
- [ ] 2.2 实现 `src/host/state.ts` 与 `test/state.test.ts`（触达面 1.1：SessionToolState/EMPTY_STATE/normalizeState/withToggled/foldStatus 纯函数）；验证：`pnpm --filter dsh-plugin-session-tool-toggle test` 退出码 0，其中 state 套件断言 `withToggled` 幂等（同地址二次切换返回同引用形状）与损坏 payload 降级为 EMPTY_STATE

## 3. 掩码引擎

- [ ] 3.1 实现 `src/host/mask.ts` 与 `test/mask.test.ts`（触达面 1.1：planMask 三读并集→deny+遮蔽名单+命中计数、guardReason、PROTECTED_BASELINE）；验证：`pnpm --filter dsh-plugin-session-tool-toggle test` 退出码 0，其中 mask 套件覆盖：服务器断线名字消失不抛错、carried 名字保持、尾部 `*` 只匹配 public name、整组 vs 单工具的 section 遮蔽差异

## 4. 每 agent 层

- [ ] 4.1 实现 `src/host/session-layer.ts` 与 `test/session-layer.test.ts`（触达面 1.1：SessionLayer attach/detach/setState/refresh，子 fiber 内 restrict+guard+同名空 section，diff 守卫+失败重试一次+拆卸容错）；验证：`pnpm --filter dsh-plugin-session-tool-toggle test` 退出码 0，其中 layer 套件断言：同 deny 集二次 refresh 不产生新 restrict 调用（假 surface 计数）、restrict 抛错重试一次、inactive context 拆卸不抛

## 5. 持久化（双实现 + 降级）

- [ ] 5.1 实现 `src/host/host-runtime.ts` + `src/host/record-store.ts` 与 `test/record-store.test.ts`（触达面 1.1：宿主 dsh-session 模块解析+`mod.Session === session.constructor` 身份断言；StateStore 端口两实现——appendPluginRecord 整值记录+host-only 投影注册 与 ctx.storageDomain 自有域——配置键可切；内存降级与读路径「投影优先+snapshotEvents 重放兜底」）；验证：`pnpm --filter dsh-plugin-session-tool-toggle test` 退出码 0，其中 record-store 套件覆盖：身份断言失败→降级内存态、append 抛错→内存态且不丢开关、投影缺失→重放兜底、fork 前缀折叠等价

## 6. 用户级默认档

- [ ] 6.1 实现 `src/host/defaults.ts` 与 `test/defaults.test.ts`（触达面 1.1：dshHomePath 定位、readDefaults/writeDefaults 原子写、schema 校验与损坏降级告警）；验证：`pnpm --filter dsh-plugin-session-tool-toggle test` 退出码 0，其中 defaults 套件覆盖：半写/损坏 JSON→空档+告警、原子写后读回一致、空数组合法

## 7. 命令面

- [ ] 7.1 实现 `src/host/commands.ts` 与 `test/commands.test.ts`（触达面 1.1：单一 `/tools` 子文法 off/on/status/default、回执含计数与 KV 缓存重建提示（开/关对称）、status 两态区分「全局层有、本会话关」vs「未注册」、default 子命令读写默认档）；验证：`pnpm --filter dsh-plugin-session-tool-toggle test` 退出码 0，其中 commands 套件覆盖：文法错误文案、`/tools off tool:bash` 保护拒绝文案、status 两态输出

## 8. 装配整合

- [ ] 8.1 改写 `src/host/index.ts` 为完整接线（触达面 1.1：inject agents/tools；`agent/created` 挂载返回 Promise 且拍默认档快照（含子代理/队友会话）、`tools/change` 全量幂等重算、启动时 `ctx.agents.list()` 补挂、`ctx.inject(['commands'])` 注册 `/tools`、`ctx.inject(['sessionProjections'])` 注册投影、`ctx.effect` 统一拆卸；层注册表 `Map<SessionId, SessionLayer>` 单点持有，并构造 `ControlDeps`（层注册表 + StateStore + defaults io + 保护名单 + log）交给 `commands.ts`，供组 9 的 RPC 复用同一内核）；验证：`docker exec dsh dsh --profile web --dump-config-schema` 退出码 0（插件可加载），且临时 profile 装入后 `--dump-config` 输出含 `session-tool-toggle` 注册行

## 9. 共享控制内核与 Web RPC 通道（宿主半，扩展新增）

- [ ] 9.1 抽取 `src/host/control.ts` 并把 `src/host/commands.ts` 降级为文本前端（触达面增量 §1.1：`control.ts` 新增、`commands.ts` 改写、`types.ts` 增 `ControlDeps`）。要点：`toggleSession`/`resetSession`/`readPanel`/`writeDefaults` 四用例；全有或全无校验（保护/reserved/文法一次判完再落盘）；固定顺序 `写入 StateStore → layer.setState → 组装回执`；`withToggled` 无变化返回同引用。验证：`pnpm --filter dsh-plugin-session-tool-toggle test` 退出码 0，control 套件覆盖「保护命中整单拒绝且 `store.write` 调用数 0」「0 匹配地址仍进关闭集且 `matched:0`」「无变化时返回快照与旧对象同引用」；结构性断言：`grep -rn "\.write(session" plugins/session-tool-toggle/src/host --include=*.ts | grep -v "control.ts" | wc -l` 输出 `0`（命令面不得绕过内核直读 store）
- [ ] 9.2 写 `src/contract.ts` 与 `test/wire-contract.test.ts`（触达面增量 §1.1：`contract.ts` 新增）。要点：通道 `'/session-tool-toggle'`、端点 `panel|toggle|reset|defaults`、7 个宿主失败码 + 2 个传输码、4 对手写 parser（strict：未知字段即越界）、地址数量/长度上限。验证：`pnpm --filter dsh-plugin-session-tool-toggle test` 退出码 0；`grep -cE "^(import|export .* from) " plugins/session-tool-toggle/src/contract.ts` 输出 `0`（零外部依赖，可安全内联进 client bundle）
- [ ] 9.3 写 `src/host/panel.ts` 与 `test/panel.test.ts`（触达面增量 §1.1：`panel.ts` 新增）。要点：三读并集 → 分组（`toolServerOf` 首 `__` 切分）→ 四标记（disabled/protected/reserved/shadowed）→ `stats` 四计数 → `notices`；描述截断 160 字；不携带 `parameters`。验证：`pnpm --filter dsh-plugin-session-tool-toggle test` 退出码 0，panel 套件覆盖「`mcp__a__x` 归 a 组」「`mcp__a__b__c` 归 a 组（记录歧义）」「被其它作用域隐藏的名字进 `hiddenByOthers` 且对应条目 `shadowed:true`」「`run_code` → `reserved:true`」
- [ ] 9.4 写 `src/host/rpc.ts` 与 `test/rpc.test.ts`（触达面增量 §1.1：`rpc.ts` 新增）。要点：端点派发 → contract parser → control 内核 → 信封映射；未知端点 `bad-request`；抛错 `internal` 并 `logger.warn`；`session-not-live` 判定（`agents.get` + `session.id` 对账）。验证：`pnpm --filter dsh-plugin-session-tool-toggle test` 退出码 0，rpc 套件覆盖「未知端点 → `bad-request`」「parser 拒绝超长地址 → `bad-request`」「control 抛 → `internal`」「不存在 sessionId → `session-not-live`」
- [ ] 9.5 在 `src/host/index.ts` 挂载通道（触达面增量 §1.1：`src/host/index.ts` 改写行）。要点：`ctx.inject(['connection','webServer'], c => { const connection = c.root.get('connection'); … connection.rpc.handle(CHANNEL, dispatcher) })`——`webServer` 必须在注入名单、`connection` 必须从 `ctx.root` 读（`plugins/web-ux/src/index.ts:74-99` 的完整说明）；`connection` 解析为空只 warn 不抛。验证：`docker exec dsh dsh --profile web --dump-config-schema` 退出码 0 且输出含 `session-tool-toggle`；隔离实例中通道直调返回 `ok:true`（完整命令见 `code-design.md` 附录增量设计 §5.5）

## 10. client 半：入口与面板（扩展新增）

- [ ] 10.1 写 `src/client/locales.ts` 与 `test/locale-parity.test.ts`（触达面增量 §1.1：`locales.ts` 新增）。要点：NS `sessionToolToggle`；zh canonical + `en satisfies Record<Key,string>`；失败码文案键与设计 §3.5 表逐条对齐；`declare module` 注册 `LocaleNamespaceMap`。验证：`pnpm --filter dsh-plugin-session-tool-toggle test` 退出码 0（parity 套件：zh/en 键集合一致）
- [ ] 10.2 写 `src/client/panel-client.ts` 与 `test/panel-client.test.ts`（触达面增量 §1.1：`panel-client.ts` 新增）。要点：`connection.rpc.call(CHANNEL, endpoint, payload)`；信封拆解；parser 失败 → `bad-response`；`PanelError{code,message}`。验证：`pnpm --filter dsh-plugin-session-tool-toggle test` 退出码 0，套件覆盖「传输抛 → `unavailable`」「坏信封 → `bad-response`」「宿主码原样保留」
- [ ] 10.3 写 `src/client/panel-controller.ts` 与 `test/panel-controller.test.ts`（触达面增量 §1.1：`panel-controller.ts` 新增）。要点：`idle→loading→ready/failed`；`pending` 集；mutation 直接吃响应快照；`command/executed` 触发刷新（仅本会话 + `tools`）；`focus` 监听可摘；`resolveClient` 渲染期软取（connection 可能晚于 apply 就绪）。验证：`pnpm --filter dsh-plugin-session-tool-toggle test` 退出码 0，套件覆盖「并发 toggle 两地址 → `pending` 同时含两者」「toggle 失败保留旧快照且 `pending` 清空」「`command/executed` 他会话/他命令不触发」
- [ ] 10.4 写 `src/client/ToolPanelAction.tsx`、`ToolPanelGroups.tsx`、`DefaultsEditor.tsx`、`panel.module.css` 与 `test/tool-panel.test.tsx` + `test/stubs/ui-primitives.tsx`（触达面增量 §1.1：4 个新文件 + stub）。要点：28px 图标按钮（`aria-label`/`aria-expanded`）+ 组件内 `Modal`；组行折叠；三态禁用（protected/reserved/shadowed 各带 `title` 理由）；`intent` 徽标；默认档增删（客户端不做文法校验，宿主为唯一权威）；失败码文案。验证：`pnpm --filter dsh-plugin-session-tool-toggle test` 退出码 0，jsdom 套件断言「按钮带 `aria-label`」「保护行 `disabled` 且点击后 `client.toggle` 调用数 0」「切组开关发出的地址是 `mcp:<server>`」「`unavailable` 时渲染降级文案且无 `Switch`」
- [ ] 10.5 写 `src/client/index.ts` + `test/client-index.test.ts` + `test/bundle.test.ts`（触达面增量 §1.1：`client/index.ts` 新增）。要点：`inject:['slots','locale']`；`locale.register` 用 `ctx.effect`；座位 `register`（utilities、order 20）包 `try/catch` 软注册；`ctx.on('command/executed')` 桥接；`connection` 渲染期软读。验证：`pnpm --filter dsh-plugin-session-tool-toggle build` 退出码 0 且 `test -f plugins/session-tool-toggle/lib/client.js`；`pnpm --filter dsh-plugin-session-tool-toggle test` 退出码 0（bundle 纯度套件：client 只 require `['@deepseek-ai/dsh-client-ui-primitives','react','react/jsx-runtime']`，host 只 import `node:*`）

## 11. 验证矩阵与冒烟（原组 9 顺延）

- [ ] 11.1 静态门禁全绿（仓库递归脚本）；验证：仓库根依次 `pnpm build`、`pnpm typecheck`、`pnpm test`、`pnpm lint`、`pnpm dsh:check` 全部退出码 0，且 `test -f plugins/session-tool-toggle/lib/client.js` 为真、`pnpm --filter dsh-plugin-session-tool-toggle typecheck` 覆盖 client project 退出码 0
- [ ] 11.2 隔离实例冒烟与省量表（独立 `DSH_HOME`+独立端口起 web profile，探针复用本部署实测基线：可见 214/MCP 139）；断言并归档 `openspec/changes/session-tool-toggle/artifacts/`：① `/tools off mcp:yunxiao` 后该会话工具计数减少 70 且 `system/message` 不含 `### MCP server: yunxiao`；② 邻会话不受影响；③ resume 后关闭集保持；④ fork 继承 fork 点；⑤ 子代理会话按默认档快照（不含主会话会话级关闭）；⑥ ≥5 agent × ≥5 服务器重算不抛错；⑦ tokenMeter 前后对照省量表；⑧ 面板端点直调（附录 §5.5 命令）返回 `ok:true` 且 `stats.catalog` ≈ 实测基线；⑨ 面板关闭 `mcp:yunxiao` 后与 `/tools status` 关闭集一致、`mutation.applied[0].matched` = 70；⑩ 面板默认档写入后 `$DSH_HOME/session-tool-toggle/defaults.json` 含新地址且既有会话不变（负路径：`toggle` 发 `tool:bash` → `protected`；不存在的 sessionId → `session-not-live`）；验证：artifacts 下存在冒烟记录表与省量表两个文件且十条断言逐条记录实测值
- [ ] 11.3 浏览器侧演示证据（扩展新增）：隔离实例里用 chrome-devtools MCP 打开面板、截图、切一个组开关再截图；验证：`artifacts/` 下存在两张截图 + 一段操作记录

## 12. 文档与发布准备（原组 10 顺延）

- [ ] 12.1 写 `plugins/session-tool-toggle/README.md` 预期管理段（触达面 1.1：非安全边界、子代理不继承会话开关但拍默认档快照、历史不改写、KV 一次性重建对称提示、skill 翻转目录成本、保护名单、持久化降级行为、实验性通道声明；扩展追加「Web 面板」一节：入口座位、与命令面同一状态、默认档不追溯、降级矩阵补 3 行（RPC 通道/座位/client 服务）、「面板不提供配置键编辑」明示）；验证：`grep -c "不是安全边界\|实验性\|Web 面板" plugins/session-tool-toggle/README.md` ≥ 3
- [ ] 12.2 发布前自检（触达面 1.2 关联：统一版本与 tag 流程）；验证：仓库根 `pnpm verify` 退出码 0（multi-root smoke 需运行中的 dsh，若不可用则记录跳过原因于 artifacts）

## Workflow follow-up

- `pnpm release <version>` 打 tag 并 `git push origin main --tags`（发布绿灯后人工动作；profile 侧按 tag 安装：`docker exec dsh dsh plugin --profile web add "github:exponentxqq/dsh-plugins#<TAG>&path:plugins/session-tool-toggle"`）；**profile 安装/升级后必须重启 web profile**（浏览器半 bundle 由宿主在启动图里提供，热装不生效）
- 若 `zod@4.4.3` 被发布年龄门拦截：`pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude` 追加豁免（触达面 1.2 条件项），重跑 `pnpm dsh:check`（client devDeps 已全在锁内，无额外豁免需求）
