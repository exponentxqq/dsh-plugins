# Tasks

> 执行批次契约：`## N.` 组间严格串行；组内任务互不依赖、可并行（文件域互不重叠）；单组 ≤ 8 任务。每任务描述引用其在 `code-design.md` ①触达面清单中的文件；验证句均为第三方可核对命令/断言。

## 0. 前置：B6 迁移等价基线冻结

- [ ] 0.1 在一切编辑前以已提交的 `lib/` 产物冻结基线（`docs/assessments/multi-root-baseline/` 新建目录，触达面见 code-design ①.1 基线行）：运行 `node scripts/check-artifacts.mjs --write-baseline docs/assessments/multi-root-baseline`；验证：命令退出码 0，且 `ls docs/assessments/multi-root-baseline/*.json | wc -l` 输出 `7`（七个插件各一份）

## 1. 止血与债（N1/N10/B3/B2/N3）

- [ ] 1.1 `openspec` 进根 devDependency 并提供单一校验命令（`package.json` + `pnpm-lock.yaml`，触达面 code-design ①.1 根仓行 N10）：根 `package.json` 加 `scripts["spec:check"] = "openspec validate --all --strict"` 与 `devDependencies["@fission-ai/openspec"]`（当前安装版本），跑 `pnpm install` 重写 lockfile 根 importer；验证：`node -e "const p=require('./package.json');assert(p.scripts['spec:check']&&p.devDependencies['@fission-ai/openspec'])"` 退出 0，且 `git diff pnpm-lock.yaml` 仅根 importer 变化（7 个插件 importer 行不变）
- [ ] 1.2 拆分 `dsh-project-mcp` 过载 requirement（`openspec/specs/dsh-project-mcp/spec.md`，骨架见 code-design ③.5 表一）：1 条 → 4 条、16 个 scenario 各归其位、语句逐字搬运只加标题；验证：组收口时 `openspec validate dsh-project-mcp --type spec --strict` 退出 0，且以 code-design ③.5 的长度自检命令跑该文件每条 requirement 正文 < 500 字符
- [ ] 1.3 拆分 `dsh-session-tool-toggle` 过载 requirement（`openspec/specs/dsh-session-tool-toggle/spec.md`，骨架见 code-design ③.5 表二）：1 条 → 5 条、13 个 scenario 各归其位；验证：组收口时 `openspec validate dsh-session-tool-toggle --type spec --strict` 退出 0，长度自检命令每条 < 500
- [ ] 1.4 smoke 口径四处同修 + CI verify 步骤（`README.md`、`AGENTS.md`、`.github/workflows/ci.yml`，触达面 code-design ①.1 三行）：先实跑 `time pnpm --filter dsh-plugin-multi-root-workspace smoke` 记录耗时与 `[smoke:*] N/N checks passed`，再同批改 README:48/:80、AGENTS:67 为实测口径（devDependency dsh CLI + 零容器零真实凭证），ci.yml 头注释以实测理由重写「为什么不跑 verify 全量」、verify 作业在 docs:check 后加一步 `pnpm spec:check`；验证：`grep -rn "运行中的 dsh" README.md AGENTS.md .github/workflows/ci.yml` 零命中，`grep -c "spec:check" .github/workflows/ci.yml` ≥ 1
- [ ] 1.5 workspace-config 测试补类型检查（`plugins/workspace-config/tsconfig.host.json`，触达面 code-design ①.3 wsc 行）：include 改为 `["src/index.ts", "test/**/*.test.ts", "test/**/*.test.tsx", "test/stubs/**/*.tsx"]`，暴露的类型错误修源码或修测试（不得 `@ts-expect-error` 硬压）；验证：`pnpm --filter dsh-plugin-workspace-config exec tsc -p tsconfig.host.json --listFiles --pretty false | grep -c "/plugins/workspace-config/test/"` ≥ 7

组收口：`pnpm lint && pnpm typecheck && pnpm build && pnpm test && pnpm docs:check && pnpm spec:check && pnpm dsh:check` 全部退出 0（spec:check 由 1.2/1.3 落定后转绿）。

## 2. A3 前置：attribution 对照清单（删除凭证）

- [ ] 2.1 逐条核验 23 条「插件侧用例 → host-kit 并集表行」映射并落对照清单工件（新建 `openspec/changes/residual-convergence/artifacts/a3-attribution-coverage-map.md`，映射表全文见 code-design ⑤组 2）：逐条比对 `plugins/project-mcp/test/attribution.test.ts`（12 条）与 `plugins/user-commands/test/attribution.test.ts`（9 条）+ `attribution-concurrency.test.ts`（2 条）对 `tooling/host-kit/test/attribution.test.ts` 的 CASES 表与并发段；任何一条找不到对应行，先给 host-kit 表补行并跑绿（触达面 code-design ①「明确不触达」中 host-kit 的唯一例外路径）；验证：工件存在且 `grep -c "^| [0-9]" openspec/changes/residual-convergence/artifacts/a3-attribution-coverage-map.md` = 23，`pnpm --filter @dsh-plugins/host-kit test` 退出 0

## 3. A3 执行：删内核规则级重复、留 wiring

- [ ] 3.1 project-mcp 侧删除与引用修正（`plugins/project-mcp/test/attribution.test.ts` 删除 179 行、`attribution-anomaly.test.ts` 改文件头指向，触达面 code-design ①.3 两行）：按对照清单 1–12 行删除，anomaly 文件头「pinned by test/attribution.test.ts」改指 host-kit 表 + 本文件；验证：`test ! -f plugins/project-mcp/test/attribution.test.ts` 且 `pnpm --filter dsh-plugin-project-mcp test` 退出 0 且 `grep -n "onAnomaly\|Attributor" plugins/project-mcp/test/attribution-anomaly.test.ts` 非空（wiring 保留）
- [ ] 3.2 user-commands 侧删除与引用修正（`attribution.test.ts` 删 111 行、`attribution-concurrency.test.ts` 删 82 行、`attribution-anomaly.test.ts` 改头、`src/host/attribution.ts:14-15` 悬空引用改指 host-kit 并发段，触达面 code-design ①.3 四行）：按对照清单 13–23 行删除；验证：`test ! -f plugins/user-commands/test/attribution.test.ts && test ! -f plugins/user-commands/test/attribution-concurrency.test.ts` 且 `grep -rn "attribution-concurrency\|test/attribution.test.ts" plugins/user-commands/src plugins/user-commands/test` 零命中且 `pnpm --filter dsh-plugin-user-commands test` 退出 0

组收口：`pnpm -r test` 退出 0；`git diff --stat` 中被删三文件合计 −372 行；两个 anomaly 文件仅头注释变化。

## 4. A1 前置：test-kit 工厂与 ADR 修订

- [ ] 4.1 test-kit 新增 `./vitest` 子路径（`tooling/test-kit/src/vitest.ts` 新建 + `package.json` exports + `README.md` 章程段，接口签名见 code-design ③.1）：`defineWebTestConfig({ root })` 纯对象工厂（不 import vitest、alias 用 `node:path` join、`WEB_TEST_INCLUDE` 常量、非字符串/空 root 抛错）；验证：`grep -c "vitest" tooling/test-kit/src/vitest.ts` 输出 0（无 import）且 `node -e "import('@dsh-plugins/test-kit/vitest').then(m=>{if(typeof m.defineWebTestConfig!=='function')process.exit(1)})"` 退出 0
- [ ] 4.2 ADR-0001 修订记录（`docs/decisions/ADR-0001-shared-build-and-source-kits.md` :61 行与修订记录节 + `docs/decisions/README.md` 标注，触达面 code-design ①.1 两行）：test-kit 行扩为「夹具 + 测试接线原语、vitest 仅 devDep」，修订记录含被否方案与 D1/D13 结论；验证：`grep -n "测试接线" docs/decisions/ADR-0001-shared-build-and-source-kits.md` 非空且 `grep -c "修订记录" docs/decisions/ADR-0001-shared-build-and-source-kits.md` ≥ 2

## 5. A1 消费面：三包薄声明 + 模板分化 + AR8

- [ ] 5.1 三包 vitest.config 换 4 行薄声明（`plugins/{session-tool-toggle,web-ux,workspace-config}/vitest.config.ts`，消费形态见 code-design ③.1 代码块）：`import { defineWebTestConfig } from '@dsh-plugins/test-kit/vitest'` + `export default defineWebTestConfig({ root: import.meta.dirname })`，原注释知识迁 test-kit README；验证：三文件 `grep -c "defineWebTestConfig" plugins/*/vitest.config.ts` 各 ≥ 2 且 `wc -l` 各 ≤ 6，`pnpm --filter dsh-plugin-workspace-config test` 退出 0（jsdom 组件套件真实跑通）
- [ ] 5.2 模板按 kind 分化（`templates/default/template.json`、`vitest.config.ts`、`test/stubs/ui-primitives.tsx` 新建、`tsconfig.client.json`、`scripts/gen-plugin.mjs` structureTree、`templates/default/README.md` + `templates/README.md` 件套表，触达面 code-design ①.4 前六行）：config 条目加 `only: dual` 改工厂调用、新增 stub 薄 re-export 条目（`only: dual`）、tsconfig.client 补 `test/**/*.tsx` 与 `test/stubs/**/*.tsx`（N8）、structureTree 按 kind 输出；验证：`node -e "const t=require('./templates/default/template.json');const c=t.files.find(f=>f.output==='vitest.config.ts');assert(c.only==='dual')"` 退出 0 且 `test -f templates/default/test/stubs/ui-primitives.tsx`
- [ ] 5.3 AR8 门禁实现（`scripts/check-architecture.mjs` 四规则 + `scripts/dsh-check.mjs:8` 注释，规则表见 code-design ③.2）：AR8-1 存在性 / AR8-2 薄入口（≤6 行、单 import、禁字面量）/ AR8-3 include 双面覆盖（vitest 工厂 include + tsconfig include，Q2 落定）/ AR8-4 stub 存在与指向；验证：负向探针——临时给 `plugins/web-ux/vitest.config.ts` 加 `resolve: { alias: {} }` 后 `node scripts/check-architecture.mjs` 退出 1 且 stderr 含 `AR8`，恢复后退出 0
- [ ] 5.4 AR 范围文档同步（根 `README.md` :21/:39、`AGENTS.md` :18/:65，触达面 code-design ①.1 两行）：AR1–AR7 改 AR1–AR8 并补 spec:check 命令；验证：`grep -rn "AR1–AR7\|AR1-AR7" README.md AGENTS.md scripts/dsh-check.mjs` 零命中

组收口：`pnpm lint && pnpm typecheck && pnpm build && pnpm test && pnpm spec:check && pnpm dsh:check` 全 0；负向 A（临时删工厂 `esbuild.jsx` 行 → wsc 组件套件红）恢复后全绿；三包测试文件计数与 AR8 日志一致（stt 23 / web-ux 19 / wsc 6）。

## 6. A2 前置：build-kit 产物契约模块

- [ ] 6.1 build-kit 新增 `./artifact-contract` 并收口死导出（`src/artifact-contract.mjs` + `artifact-contract.d.mts` 新建、`package.json` exports、`guards.mjs` 删 `assertSelfContained`/`isBuiltin` 链、`index.mjs:223` 去 re-export、`guards.test.mjs` 删 6 用例、`test/artifact-contract.test.mjs` 新建（正面+负面）、`README.md` 消费者段重写，接口全文见 code-design ③.3）：四个 issue 函数纯词数组入参；验证：`pnpm --filter @dsh-plugins/build-kit test` 退出 0 且 `grep -rn "assertSelfContained" tooling/build-kit/src` 零命中且 code-design ⑤组 4 的 node 探针命令（loaderShellIssues 缺标记 + requireSurfaceIssues 双泄漏）退出 0 且文案含包名

## 7. A2 消费面：三份 bundle.test 改声明式

- [ ] 7.1 三包 bundle.test 结构断言改契约函数（`plugins/{session-tool-toggle,web-ux,workspace-config}/test/bundle.test.ts`，保留边界见 code-design ④ D5）：壳/词集/node: 排除/宿主自包含改 `loaderShellIssues`/`requireSurfaceIssues`/`hostSelfContainmentIssues`；INLINED/ABSENT 标记、css 注入器计数（stt 动态/web-ux 固定 4）、座位字面量、dtsOwned 断言与三份词集常量留包内；验证：改造前 `node scripts/check-artifacts.mjs --write-baseline /tmp/rc-b6-before`、改造后 `node scripts/check-artifacts.mjs --baseline /tmp/rc-b6-before` 退出 0（产物字节不变），`pnpm -r test` 退出 0，旧文件 `expect(` 断言与「契约调用 + 包内保留」逐条对照表入执行记录

## 8. A4 manifest 审计落地 + B4 CI 冒烟

- [ ] 8.1 manifest 审计结论落地（`plugins/{session-tool-toggle,web-ux,workspace-config,project-mcp}/package.json` 删 `exports["./src/*"]`；`plugins/{user-commands,zcode-plan,workspace-config}/package.json` 补 `exports["./package.json"]`；wsc files 删冗余 `README.md`；`templates/default/package.json.tmpl` 补 `./package.json` 与 `files` 的 `lib/**/*.d.ts`，判定依据 code-design ④ D8/D9）：验证：`for p in session-tool-toggle web-ux workspace-config project-mcp; do node -e "assert(!require('./plugins/$p/package.json').exports['./src/*'])"` 全过，`for p in user-commands zcode-plan workspace-config; do node -e "assert(require('./plugins/$p/package.json').exports['./package.json'])"` 全过
- [ ] 8.2 `gen-plugin --check` 对账模式（`scripts/gen-plugin.mjs` 新增 --check + `templates/README.md` 增「manifest 形态对账」小节，契约见 code-design ③.4）：复用 buildTokens/buildFiles/finalizeManifest 渲染期望、无白名单 fail-closed、icon/dtsOwned/dual 三条件断言（N11）；验证：`pnpm gen:plugin --check; echo $?` 输出 0（6 软插件），负向——临时给 web-ux 加回 `"./src/*"` 后退出 1 且 stderr 含 `dsh-plugin-web-ux: exports["./src/*"]`，恢复后 0
- [ ] 8.3 模板 smoke.test 改契约消费（`templates/default/test/smoke.test.ts` 第 4 份 loader 壳断言改 `loaderShellIssues` + `hostSelfContainmentIssues`，D16）；验证：`grep -c "artifact-contract" templates/default/test/smoke.test.ts` ≥ 1
- [ ] 8.4 CI scaffold 冒烟作业（`.github/workflows/ci.yml` 新增 job，形态见 code-design ⑤组 5 YAML 块，install 分层按 Q1）：检出 → pnpm/node → `install --frozen-lockfile` → gen 双 kind → `install --no-frozen-lockfile` → 两包 verify:all → `pnpm dsh:check`；验证：`node -e "const Y=require('./plugins/project-mcp/node_modules/yaml');const d=Y.parse(require('fs').readFileSync('.github/workflows/ci.yml','utf8'));assert(JSON.stringify(Object.keys(d.jobs))===JSON.stringify(['verify','scaffold'])&&d.jobs.scaffold.steps.length>=8)"` 退出 0

组收口：六包 `npm pack --dry-run --json --ignore-scripts` 面 = README 自动出现、icon.svg 仅 4 个有 icon 的包；push 后 CI 两作业均绿（scaffold 日志含 `[dsh:check] 3 组门禁全部通过` = B4 首次机械证据）。

## 9. B1 评估档案 + 收尾

- [ ] 9.1 multi-root 评估档案（`docs/assessments/README.md` + `multi-root-build-unification.md` 新建、`docs/decisions/README.md` 增评估档案小节指针、`tooling/build-kit/README.md` multi-root 行链档案，内容框架 code-design ⑤组 6）：现状差异清单 / 不迁移理由 / 迁移通过标准（B6 逐字相等 + B1–B3 typecheck + 装配冒烟）/ 结论；验证：`test -f docs/assessments/multi-root-build-unification.md` 且 `grep -n "非 ADR" docs/assessments/README.md` 非空且 `grep -n "assessments" docs/decisions/README.md` 非空
- [ ] 9.2 test-kit 最小自测 + AR2 白名单 + N9 死分支（`tooling/test-kit/test/locale-parity.test.ts` 与 `test/ui-primitives.test.tsx` 与 `vitest.config.ts` 与 `tsconfig.json` 新建/改、`package.json` 加 `scripts.test` 与 vitest devDep、`scripts/check-architecture.mjs` TOOLING_CONTRACT 加 `test` 并删 :784-790 pending 死分支，D13/D15）；验证：`pnpm --filter @dsh-plugins/test-kit test` 退出 0 且用例 ≥ 6，`node scripts/check-architecture.mjs` 退出 0，`node -e "assert(!('dependencies' in require('./tooling/test-kit/package.json') && require('./tooling/test-kit/package.json').dependencies.vitest))"` 退出 0
- [ ] 9.3 N2 tsconfig include 盘点工件（新建 `openspec/changes/residual-convergence/artifacts/n2-tsconfig-inventory.md`，命令与固定结论见 code-design ⑤组 6 第 4 条）：stt 23 / web-ux 19 / wsc 7（含 stub）全部覆盖、未覆盖 0、形态保持枚举；验证：工件存在且含三包计数与「未覆盖 0」结论，异常（存在未覆盖文件）时该任务不得勾选并升格为待决
- [ ] 9.4 根文档结构约定段同步（根 `README.md` 与 `AGENTS.md` 的目录结构/命令表/测试约定段，X-f）：补 `docs/assessments/`、`pnpm spec:check`、`pnpm gen:plugin --check`、测试薄入口约定；验证：`grep -c "spec:check\|gen:plugin --check\|assessments" README.md` ≥ 3 且同命令对 AGENTS.md ≥ 3
- [ ] 9.5 全链终检与基线锚点比对（只读）：`pnpm lint && pnpm typecheck && pnpm build && pnpm test && pnpm docs:check && pnpm spec:check && pnpm dsh:check` 全 0；`node scripts/check-artifacts.mjs --baseline docs/assessments/multi-root-baseline; echo $?` 退出 0 且无 module-word diff；`git status --porcelain | grep -E 'plugins/[^/]+/lib/' | wc -l` 输出 0（产物字节不变）；验证：三条命令的退出码与计数即证据，全绿后本变更实施完成
