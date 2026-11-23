# Tasks

## 1. 单一真源与派生文本

- [x] 1.1 `plugins/zcode-plan/src/host/route-config.ts`：`ZCODE_PLAN_ROUTE.models` 首位插入 `glm-5.4`（1M / 131072 / `input: ['text','image']` / thinking 四档 / `compat` 与原两条一致），更新模块 JSDoc（三条模型、5.4 视觉、1305 回退理由）。
- [x] 1.2 单测同步：`test/route-config.test.ts` X7-8b（三条 + id 序列 + 逐条 input）、`test/status.test.ts` 两处、`test/commands.test.ts` 两处的状态行文本。
- [x] 1.3 `scripts/compose-check.mjs`：E3 的 `models.length` 断言 2 → 3，头部注释「models 两条」→「三条」。

## 2. 文档与证据

- [x] 2.1 `README.md`：status 核对样例改三条，补「路由里的三个模型」说明；「手工路由 YAML」块插入 `glm-5.4` 条目。
- [x] 2.2 `docs/migration-from-zai-coding-zcode.md`：两处模型清单与状态行样例改三条。
- [x] 2.3 新增 `artifacts/glm-5-4-availability-2026-11-23.md`：在册 / 推理 / 视觉 / thinking 档位 / `max_tokens` 边界 / 上下文窗口依据与残余风险（零机密）。

## 3. 折扣脚本

- [x] 3.1 `scripts/gen.mjs` 与 `scripts/replicate-sign-pat.mjs` 默认模型改 `glm-5.4`（仍可 env/argv 覆盖）。

## 4. 验证

- [x] 4.1 `pnpm --filter dsh-plugin-zcode-plan verify:all`（lint + typecheck + build + test）全绿。
- [x] 4.2 `pnpm --filter dsh-plugin-zcode-plan compose:check` 三例 PASS（E3 深等）。
- [x] 4.3 仓级门禁：`pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm docs:check` / `pnpm spec:check` / `pnpm dsh:check` 全绿。
- [x] 4.4 `lib/index.js` 重建并含三条模型（随仓库提交）。
- [x] 4.5 真机 E2E：`zcode-plan/glm-5.4` 与 `zai-coding-cn/glm-5.4` 各开一个任务板会话，均回「好」、result=succeeded（白名单与路由同时验证）。
