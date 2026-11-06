# Tasks

> 组间严格串行（组号即执行顺序），组内任务写面互不相交、可并行。每组末位任务为组收口门禁（GATE = `pnpm install && pnpm -r lint && pnpm -r typecheck && pnpm -r build && pnpm -r test && pnpm dsh:check`，退出码 0）。任务描述中的 R#/K#/H#/T#/P# 为 [`code-design.md`](./code-design.md) ① 触达面清单条目编号。

## 1. G0 基线冻结与等价性工具

- [ ] 1.1 新建 `scripts/lib/artifacts.mjs`（R9，产物词法器单一实现）与 `scripts/check-artifacts.mjs` 的 `--write-baseline/--baseline` 比对模式（R8），并在未改动的当前 HEAD 上冻结基线、记录六软插件用例数；验证：`node scripts/check-artifacts.mjs --write-baseline /tmp/arch-baseline && node scripts/check-artifacts.mjs --baseline /tmp/arch-baseline` 退出码 0，且 `/tmp/arch-baseline` 下存在 7 个 `<包名>.json`（各含排序后的 `host.words` 与 `sha256`）

## 2. G1 build-kit 收敛（构建期死的重复）

- [ ] 2.1 新建 `tooling/build-kit/` 全部文件（K1–K10：package.json/src/{index,host,client,css,guards}.mjs/test 三件/README）与 `pnpm-workspace.yaml` 的 packages 显式三行（R1）；验证：`pnpm --filter @dsh-plugins/build-kit test` 退出码 0（css 双模块去重/壳形状/守卫四格全绿）且 `grep -c "tooling/build-kit" pnpm-workspace.yaml` ≥1
- [ ] 2.2 三个 host-only 包迁移薄入口：`plugins/{project-mcp,user-commands,zcode-plan}/build.mjs` 改 3–5 行、package.json 加 `@dsh-plugins/build-kit: workspace:*` 删 `esbuild`（1.6 表对应行；依赖 2.1 产物，组收口统一验证）；验证：`node scripts/check-artifacts.mjs --baseline /tmp/arch-baseline` 模块词集合逐字相等
- [ ] 2.3 三个双端包迁移薄入口：`plugins/{session-tool-toggle,web-ux,workspace-config}/build.mjs` 改薄（`cssClassPrefix` 三值 stt/wux/wsc；wsc 的 clean 由 dtsOwned 推导，1.6 表对应行）；验证：同 2.2 基线比对相等，且 `test -d plugins/workspace-config/lib/types` 为真（types 未被误清）
- [ ] 2.4 组收口 GATE；验证：GATE 退出码 0 且 `git diff --stat plugins/multi-root-workspace/lib` 输出为空（multi-root 产物零变化）

## 3. G2 构建配置与依赖收敛（tsconfig / catalog / oxlint / scripts）

- [ ] 3.1 新建根基准 `tsconfig.plugin.base.json`（R3，含 `paths`，无 composite）；六软插件删 `tsconfig.base.json`、`tsconfig.{host,client}.json` 改 extends 并去 composite、`include` 去掉 `vitest.config.ts`；删 pm/uc/zcode 三包 `vitest.config.ts`（1.6 表各包行）；验证：`pnpm -r typecheck` 退出码 0、`grep -r '"composite"' plugins/*/tsconfig.*.json` 0 命中、`ls plugins/{project-mcp,user-commands,zcode-plan}/vitest.config.ts` 均报不存在、`pnpm -r test` 逐包用例数与 G0 记录相等
- [ ] 3.2 catalog 同批落地：`pnpm-workspace.yaml` 增默认 catalog 与 `catalogs.dsh`（R1）；六包 devDeps 改 `catalog:`/`catalog:dsh`、`typecheck` 脚本改 `-p --noEmit` 形态（1.6 表各包行）；`scripts/check-dsh-baseline.mjs` 归一化比对（R10）；`scripts/upgrade-dsh.mjs` catalog 感知重写 + 后置断言（R11）——四者必须同批；验证：lockfile `packages:` 段键集合与迁移前零差异（`sed -n '/^packages:/,/^snapshots:/p' … | grep -E "^  '?[@a-z]" | sort` 两文件 diff 为空）、`pnpm dsh:upgrade 0.2.2-rc.1` 重跑后 `git diff` 为空（幂等）
- [ ] 3.3 新建根 `.oxlintrc.json`（R4，pattern 与目录无关：`**/lib/**` 等）并删 `plugins/{session-tool-toggle,workspace-config}/.oxlintrc.json`；验证：`pnpm -r lint` 退出码 0，且向 `plugins/web-ux/lib/` 放一个 `var x = 1` 临时文件后 `pnpm -r lint` 不报该文件（验后删除）
- [ ] 3.4 `scripts/release.mjs` 改调聚合入口（R12），新建 `scripts/dsh-check.mjs` 聚合器（R6）与 `scripts/check-architecture.mjs` 骨架（R7，先开 AR2/AR3/AR5/AR7）；验证：`node scripts/dsh-check.mjs` 退出码 0 且 `grep -c "dsh-check.mjs" scripts/release.mjs` ≥1、`grep -c "check-dsh-baseline.mjs" scripts/release.mjs` 为 0
- [ ] 3.5 组收口 GATE + 红队：把某包 `devDependencies["@deepseek-ai/dsh"]` 从 `catalog:dsh` 改回字面量 → `pnpm dsh:check` 必须退出码 1（验后恢复）；验证：GATE 退出码 0 且红队复现记录在变更说明

## 4. G3 测试资产收敛

- [ ] 4.1 新建 `tooling/test-kit/` 全部文件（T1–T5：ui-primitives 并集底座、locale-parity 纯函数、tsconfig/package/README）；验证：`pnpm -r lint && pnpm -r typecheck` 退出码 0（test-kit 被递归覆盖）
- [ ] 4.2 三个双端包 `test/stubs/ui-primitives.tsx` 改薄为 re-export 底座 + 允许本地覆盖（1.6 表 stt/wux/wsc 行；vitest alias 不动）；验证：`pnpm -r test` 退出码 0 且三个双端包用例数 ≥ G0 记录值
- [ ] 4.3 三份 `test/bundle.test.ts` 删本地词法器改 import `scripts/lib/artifacts.mjs`（1.6 表各包行），stt 新增「每个 css module 一个注入器」断言；验证：`grep -c "expect(" plugins/{session-tool-toggle,web-ux,workspace-config}/test/bundle.test.ts` 与 G0 记录值逐个相等（字面量断言不减），`pnpm -r test` 退出码 0
- [ ] 4.4 `locale-parity.test.ts` ×2 改调 `tooling/test-kit/locale-parity`（1.6 表相关行；`expect(NS).toBe('<字面量>')` 留本包）；验证：`grep -rc "localeParityIssues" plugins/*/test/*.ts` 合计 ≥2 且 `pnpm -r test` 退出码 0
- [ ] 4.5 组收口 GATE；验证：GATE 退出码 0

## 5. G4 host-kit 骨架 + attribution 内核三包接管

- [ ] 5.1 新建 `tooling/host-kit/` 全部文件（H1–H9/H12：attribution 内核、watcher、triggers、roots、log、host-io seam、桶与 README + H10/H11 规范级测试含 #3 异常与并发原子场景）；验证：`pnpm --filter @dsh-plugins/host-kit test` 退出码 0 且 `grep -rn "@deepseek-ai/" tooling/host-kit/src/` 0 命中（零 DSH import）
- [ ] 5.2 project-mcp 接管：`src/host/{attribution,roots,triggers}.ts` 薄化再导出、`index.ts` 换 `RootAttributor`、`types.ts` 类型收敛、新增 `test/attribution-anomaly.test.ts`（1.6 表 pm 行）；验证：`pnpm --filter dsh-plugin-project-mcp test` 退出码 0 且 `git diff --stat plugins/project-mcp/test/attribution.test.ts` 为空（oracle 零改动）
- [ ] 5.3 user-commands 接管：attribution 薄化（并发修复由内核获得）、roots/triggers 薄化、`index.ts`/`types.ts` 接线、新增 `test/attribution-concurrency.test.ts` 与 `test/attribution-anomaly.test.ts`（1.6 表 uc 行）；验证：`pnpm --filter dsh-plugin-user-commands test` 退出码 0 且 `git diff --stat plugins/user-commands/test/attribution.test.ts` 为空
- [ ] 5.4 session-tool-toggle 策略适配器：`src/host/attribution.ts` 重写为 ~45 行适配器（保留 `WorkspaceAttribution` 形状与 canonical-cwd 键策略）、`types.ts` 的 `SpecLog` 走 `LogSink` 别名（1.6 表 stt 行）；验证：`pnpm --filter dsh-plugin-session-tool-toggle test` 退出码 0 且 `git diff --stat plugins/session-tool-toggle/test/workspace-attribution.test.ts` 为空
- [ ] 5.5 组收口 GATE + 产物纯净：验证：GATE 退出码 0 且 `grep -c "@dsh-plugins/" plugins/*/lib/index.js` 全部为 0、`node scripts/check-artifacts.mjs --baseline /tmp/arch-baseline` 模块词集合相等

## 6. G5 host-kit 其余语义合并

- [ ] 6.1 project-mcp：`watcher.ts` 保阶梯签名内部走 kit（`fallbackToLast: true`）、`host-io.ts` 减半（`nodeScanIo` 留本地）、`scanLog` 改 `createLog(ctx, 'dsh-plugin-project-mcp')`（1.6 表 pm 行）；验证：`pnpm --filter dsh-plugin-project-mcp test` 退出码 0（`test/watch-reload.test.ts` 三档用例零改动即过）且 `grep -c "dsh-plugin-project-mcp: " plugins/project-mcp/lib/index.js` ≥1（前缀逐字不变）
- [ ] 6.2 user-commands：`watcher.ts` 保双阶梯（无 fallback）、`host-io.ts` 减半（`harnessHome`/`nodeCommandIo` 留本地）、`commandLog` 改 `createLog(ctx, 'dsh-plugin-user-commands')`（1.6 表 uc 行）；验证：`pnpm --filter dsh-plugin-user-commands test` 退出码 0（`test/watcher.test.ts` 四档用例零改动即过）且 `grep -c "dsh-plugin-user-commands: " plugins/user-commands/lib/index.js` ≥1
- [ ] 6.3 session-tool-toggle：第三份日志适配器（`src/host/index.ts:951-966`）改调 `createLog`（分歧点①裁决：纳入；1.6 表 stt 行补遗）；验证：`pnpm --filter dsh-plugin-session-tool-toggle test` 退出码 0 且 `node scripts/check-artifacts.mjs --baseline /tmp/arch-baseline` 模块词集合相等
- [ ] 6.4 组收口 GATE；验证：GATE 退出码 0

## 7. G6 规范增量与回归证据

- [ ] 7.1 project-mcp `test/attribution-anomaly.test.ts` 完整落盘（#3 场景：`roots[0]≠primaryRoot` 不丢根 + 诊断），红→绿取证：在旧实现（git stash 或临时 import）复现一次失败并记录；验证：`pnpm --filter dsh-plugin-project-mcp test` 退出码 0 且 `grep -c "primaryRoot" plugins/project-mcp/test/attribution-anomaly.test.ts` ≥1
- [ ] 7.2 user-commands `test/attribution-concurrency.test.ts` 完整落盘（断言：update 到 B 不 await 时 attribute 返回 A 的完整结果而非 null/半表），先旧实现红后新内核绿；验证：`pnpm --filter dsh-plugin-user-commands test` 退出码 0 且该文件含「不 await 的 pending update + 交错 attribute」断言（`grep -c "await pending" ` ≥1）
- [ ] 7.3 仓级 ADR 落盘：`docs/decisions/README.md` 索引（R16，两套编号带路径说明）+ `ADR-0001-shared-build-and-source-kits.md`（R17，含被否方案）+ `ADR-0002-attribution-kernel.md`（R18，#3 裁定与原子索引纪律）；验证：`test -f docs/decisions/ADR-0001-shared-build-and-source-kits.md && test -f docs/decisions/ADR-0002-attribution-kernel.md` 退出码 0 且 `grep -c "multi-root" docs/decisions/README.md` ≥1（编号歧义说明在位）
- [ ] 7.4 组收口：`openspec validate optimize-architecture --strict` 退出码 0（spec delta R19/R20 已随本变更落档）+ GATE；验证：两命令退出码均 0 且 `git diff --stat openspec/specs` 输出为空（主 specs 由归档 sync，不在本组手改）

## 8. G7 守护聚合与 CI

- [ ] 8.1 断言全开：`scripts/check-architecture.mjs` AR1–AR7 全量、`scripts/check-artifacts.mjs` B1–B6 门禁模式全量、`scripts/dsh-check.mjs` 三脚本聚合（R6/R7/R8）；验证：红队三连——把 `@dsh-plugins/host-kit` 挪入某包 `dependencies`（AR1 红）、把某包 `build.mjs` 换回旧骨架（AR4 红）、向 `plugins/web-ux/lib/index.js` 手加 `require('lodash')`（B2 红）——每次 `pnpm dsh:check` 退出码 1、恢复后退出码 0
- [ ] 8.2 新建 `.github/workflows/ci.yml`（R5：push/PR 七步 install --frozen-lockfile → lint → typecheck → build → test → docs:check → dsh:check，含 docs:check 为分歧点②裁决；不跑 verify）；验证：`node -e "require('yaml').parse(require('fs').readFileSync('.github/workflows/ci.yml','utf8'))"` 无异常（用仓内任一包 node_modules 的 yaml）且本地逐链执行七步全部退出码 0
- [ ] 8.3 组收口 GATE；验证：GATE 退出码 0

## 9. G8 脚手架生成与文档

- [ ] 9.1 新建 `scripts/gen-plugin.mjs`（R13）与 `tooling/template/` 模板素材（P1–P3，`package.json.tmpl` 命名使 template 非包）；验证：`pnpm gen:plugin demo-host --kind host-only && pnpm --filter dsh-plugin-demo-host lint && pnpm --filter dsh-plugin-demo-host typecheck && pnpm --filter dsh-plugin-demo-host build && pnpm --filter dsh-plugin-demo-host test && pnpm dsh:check` 全链退出码 0，`rm -rf plugins/demo-host && pnpm install && git status --porcelain` 输出为空；同法演练 `--kind dual`；`grep -rnE '"(typescript|vitest|oxlint|esbuild|@deepseek-ai/[a-z-]+)": *"[0-9^~]' tooling/template/` 0 命中
- [ ] 9.2 文档更新：`README.md`（R14：目录树含 tooling 四目录、常用命令加 gen:plugin、三检查脚本）与 `AGENTS.md`（R15：插件结构约定改薄入口 + gen:plugin 一句 + docs/decisions 段）；验证：`grep -c "gen:plugin" README.md` ≥1、`grep -c "gen:plugin" AGENTS.md` ≥1、`grep -c "docs/decisions" AGENTS.md` ≥1、`grep -c "tooling" README.md` ≥1
- [ ] 9.3 组收口 GATE；验证：GATE 退出码 0

## 10. G-doc-sync 跨仓 skill 改版（所属仓：dotfiles，单独 commit）

- [ ] 10.1 【执行时必须先加载 `writing-skills` 技能】改版 `dotfiles 仓 agent/skills/dsh-plugin-writer/`：SKILL.md（§2/§3/§5/§6 按 code-design 1.8 表）与 `references/{build,dual-client,structure,verify-install}.md`（15 处 `build.mjs:<行号>` 引用全部改指 build-kit）；验证：`grep -rno 'build\.mjs:[0-9-]*' /home/xuqinqin/develop/dotfiles/agent/skills/dsh-plugin-writer/` 0 命中；skill 内引用的仓库路径逐一 `test -e` 通过；skill 内提到的 `pnpm <script>` 在根 package.json 存在；dotfiles 仓单独 commit 且 `git -C /home/xuqinqin/develop/dotfiles show --stat HEAD` 只含 `agent/skills/dsh-plugin-writer/` 路径
