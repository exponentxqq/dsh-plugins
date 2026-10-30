# Tasks

> 执行批次契约：`## N.` 组间严格串行（N 递增即执行顺序），组内任务互不依赖、可并行；每任务引用触达面清单（`code-design.md` §1.1/§1.2 表行）中的文件条目。openspec 立项与落档（code-design 任务组 T1）已随本变更规划完成，不重复列任务。

## 1. 脚手架与最小闭环

- [ ] 1.1 创建 `plugins/session-tool-toggle/` 工程骨架（触达面 1.1：package.json、cordis.patch.yml、build.mjs、tsconfig×3、vitest.config.ts、.gitignore、src/index.ts、src/host/index.ts 空 apply、src/host/types.ts 六端口完整声明）；验证：仓库根 `pnpm install` 退出码 0 后 `pnpm --filter dsh-plugin-session-tool-toggle build` 退出码 0 且 `test -f plugins/session-tool-toggle/lib/index.js` 为真
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

- [ ] 8.1 改写 `src/host/index.ts` 为完整接线（触达面 1.1：inject agents/tools；`agent/created` 挂载返回 Promise 且拍默认档快照（含子代理/队友会话）、`tools/change` 全量幂等重算、启动时 `ctx.agents.list()` 补挂、`ctx.inject(['commands'])` 注册 `/tools`、`ctx.inject(['sessionProjections'])` 注册投影、`ctx.effect` 统一拆卸）；验证：`docker exec dsh dsh --profile web --dump-config-schema` 退出码 0（插件可加载），且临时 profile 装入后 `--dump-config` 输出含 `session-tool-toggle` 注册行

## 9. 验证矩阵与冒烟

- [ ] 9.1 静态门禁全绿（仓库递归脚本）；验证：仓库根依次 `pnpm build`、`pnpm typecheck`、`pnpm test`、`pnpm lint`、`pnpm dsh:check` 全部退出码 0
- [ ] 9.2 隔离实例冒烟与省量表（独立 `DSH_HOME`+独立端口起 web profile，探针复用本部署实测基线：可见 214/MCP 139）；断言并归档 `openspec/changes/session-tool-toggle/artifacts/`：① `/tools off mcp:yunxiao` 后该会话工具计数减少 70 且 `system/message` 不含 `### MCP server: yunxiao`；② 邻会话不受影响；③ resume 后关闭集保持；④ fork 继承 fork 点；⑤ 子代理会话按默认档快照（不含主会话会话级关闭）；⑥ ≥5 agent × ≥5 服务器重算不抛错；⑦ tokenMeter 前后对照省量表；验证：artifacts 下存在冒烟记录表与省量表两个文件且七条断言逐条记录实测值

## 10. 文档与发布准备

- [ ] 10.1 写 `plugins/session-tool-toggle/README.md` 预期管理段（触达面 1.1：非安全边界、子代理不继承会话开关但拍默认档快照、历史不改写、KV 一次性重建对称提示、skill 翻转目录成本、保护名单、持久化降级行为、实验性通道声明）；验证：`grep -c "不是安全边界\|实验性" plugins/session-tool-toggle/README.md` ≥ 2
- [ ] 10.2 发布前自检（触达面 1.2 关联：统一版本与 tag 流程）；验证：仓库根 `pnpm verify` 退出码 0（multi-root smoke 需运行中的 dsh，若不可用则记录跳过原因于 artifacts）

## Workflow follow-up

- `pnpm release <version>` 打 tag 并 `git push origin main --tags`（发布绿灯后人工动作；profile 侧按 tag 安装：`docker exec dsh dsh plugin --profile web add "github:exponentxqq/dsh-plugins#<TAG>&path:plugins/session-tool-toggle"`）
- 若 `zod@4.4.3` 被发布年龄门拦截：`pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude` 追加豁免（触达面 1.2 条件项），重跑 `pnpm dsh:check`
