# Tasks

## 1. 单一真源与派生面

- [x] 1.1 `plugins/zcode-plan/src/host/route-config.ts`：`ZCODE_PLAN_ROUTE.models` 移除 `glm-5.3` 条目（保留 `glm-5.4` 置首、`glm-5.3-flash` 收尾），模块 JSDoc 改为角色化描述（最新旗舰 / 最低成本 flash / 旧旗舰 1305 只留两条）。
- [x] 1.2 单测同步：`test/route-config.test.ts` X7-8b（两条 + id 序列 + 两条 input 均 text+image）、`test/status.test.ts` 两处、`test/commands.test.ts` 两处的状态行文本。
- [x] 1.3 `scripts/compose-check.mjs`：E3 的 `models.length` 断言改为与常量同数（`route.models.length`），头部注释「models 三条」→「与常量同数」。

## 2. 文档

- [x] 2.1 `plugins/zcode-plan/README.md`：status 核对样例改为两条；「路由里的模型目录」段去型号化；「手工路由 YAML」块移除 `glm-5.3` 条目。
- [x] 2.2 `docs/migration-from-zai-coding-zcode.md`：模型清单与两处状态行样例改为两条。
- [x] 2.3 `scripts/gen.mjs`、`scripts/replicate-sign-pat.mjs` 注释去型号（默认值不变）。

## 3. 验证

- [x] 3.1 `pnpm --filter dsh-plugin-zcode-plan verify:all`（lint + typecheck + build + test）全绿。
- [x] 3.2 `pnpm --filter dsh-plugin-zcode-plan compose:check` 三例 PASS。
- [x] 3.3 `pnpm spec:check`（`openspec validate --all --strict`）全绿。
- [x] 3.4 `lib/index.js` 重建并只含两条模型（`glm-5.4` / `glm-5.3-flash`）。
- [x] 3.5 活文件 `grep -P 'glm-5\.3(?!-flash)'` 零命中（排除历史 artifacts/archive 与 web-ux 测试夹具）。
