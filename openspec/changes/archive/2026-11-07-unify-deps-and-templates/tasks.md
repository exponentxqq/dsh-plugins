# Tasks

> 组间严格串行（组号即执行顺序），组内任务写面互不相交、可并行。每组末位任务为组收口门禁。任务描述中的「触达面 1.x」指 [`code-design.md`](./code-design.md) ① 触达面清单的节号。install 一律 `--store-dir /home/xuqinqin/develop/.pnpm-store/v11`（R5 纪律）。

## 1. G-C 依赖面（触达面 1.1）

- [x] 1.1 `pnpm-workspace.yaml` 的 `catalogs.dsh` 按字母序插入 22 条 `'@deepseek-ai/*': '0.2.2-rc.1'`（31→53，精确清单见 code-design ③ 3.3；`allowBuilds` 与 `minimumReleaseAgeExclude` 一字不动）；验证：code-design ⑤ 1.1 的 node 断言脚本退出码 0（53 entries、36 条 devDeps 全入册、新键值全 `0.2.2-rc.1`）
- [x] 1.2 `scripts/check-dsh-baseline.mjs` 删 `hardPlugins`/`softPlugins` 分裂与 `hardPlugins.length !== 1` 断言与组 6 整段（allowlist 正则 + compat:check 调用），组 4 形态断言与组 5 范围断言改遍历全部插件，头注释与 `normalizeDep` 注释去「精确契约插件豁免」措辞；验证：`node scripts/check-dsh-baseline.mjs` 在 1.3 完成前退出码 1 且失败行全部以 `dsh-plugin-multi-root-workspace:` 开头（六软插件零失败）
- [x] 1.3 `plugins/multi-root-workspace/package.json`：36 条 `@deepseek-ai/*` devDeps → `catalog:dsh`；21 条 DSH peer → `">=0.2.2-rc.1 <0.3.0"` 并新增 `"@deepseek-ai/dsh"` peer（Q1）；新增 `dsh.engines.dsh` 同值；cordis peer 不动；`verify:all` 追加 `compat:check`（Q4，置于 lint 之后）；验证：`node -e` 断言 engines/peers/devDeps/cordis 四项后 `node scripts/check-dsh-baseline.mjs` 退出码 0
- [x] 1.4 `scripts/upgrade-dsh.mjs` 删 `hasExactContract()` 与全部豁免调用点，`repointPlugin` 对全部插件写 `dsh.engines.dsh` 与 DSH peer，新增 `repointRuntimeBaselines()` 重写 `plugins/*/src/compat/dsh-version.ts` 的 `DSH_BASELINE` 字面量，末段提示删 warn/allowlist 文案；验证：`grep -n "hasExactContract\|SUPPORTED_DSH_RELEASES\|DSH_MULTI_ROOT_COMPAT" scripts/upgrade-dsh.mjs` 0 命中且 `node scripts/upgrade-dsh.mjs --print-installed` 退出码 0
- [x] 1.5 `pnpm install --no-frozen-lockfile` 更新 lockfile；验证：lockfile 变化仅三类合法行——specifier 改写（含删除侧旧 specifier 36 行：35×`0.2.2-rc.1`+1×`4.1.0`）与 catalogs 段 22 条新条目定义（包名+specifier+version 各 22 行），解析结果零漂移（version 删除 0 行）；等价替代句（原句只白名单新增侧 specifier、未排除删除侧与 catalogs 定义段，属规划疏漏，R1 留痕）：`git diff --unified=0 pnpm-lock.yaml | grep -E '^[+-]' | grep -vE '^(\+\+\+|---)' | grep -v 'specifier: catalog:dsh' | grep -vE '^[-+]        specifier: (0\.2\.2-rc\.1|4\.1\.0)$' | grep -vE "^\+    '@deepseek-ai/[^']+':$" | grep -vE '^\+      (specifier|version): 0\.2\.2-rc\.1$' | wc -l` 为 0（实测 0）且 `node scripts/check-dsh-baseline.mjs` 退出码 0
- [x] 1.6 `scripts/dsh-baseline.mjs` 头注释校正（「四个插件/三个软插件」→ 七插件统一口径），常量与 `softDshRange()` 不动；验证：`grep -n "四个插件\|三个软插件" scripts/dsh-baseline.mjs` 0 命中
- [x] 1.7 组收口 GATE + 红队；验证：`pnpm dsh:check` 退出码 0；红队——临时把 multi-root 任一 DSH devDep 写回字面量 `0.2.2-rc.1` → `pnpm dsh:check` 退出码 1 且信息含 `expected "catalog:dsh"`，cp 恢复后退出码 0（红队窗口独占；红队命令实际须 `pnpm --config.verify-deps-before-run=false dsh:check` 才落到脚本断言，R2 留痕）

## 2. G-C 运行时门（触达面 1.2；执行前先读 multi-root `AGENTS.md` 与 `.agent/note/`）

- [x] 2.1 `src/compat/dsh-version.ts` 重写：删 `SUPPORTED_DSH_RELEASES`/`SupportedDshRelease`/`CompatEnforcement`/`COMPAT_ENFORCEMENT_ENV`/`compatEnforcement()`，新增 `DSH_BASELINE` 字面量 + 派生 `SUPPORTED_DSH_RANGE` + 手写比较器 + `isSupportedDshRelease()`（签名与规则见 code-design ③ 3.1），unsupported 分支改范围判定（missing/mixed 不变），docblock 重写注明新裁定；验证：旧五名**词边界** grep（R3：`SupportedDshRelease` 是新导出名 `isSupportedDshRelease` 的子串，字面 grep 恒命中）`grep -nE "\b(SUPPORTED_DSH_RELEASES|SupportedDshRelease|compatEnforcement|COMPAT_ENFORCEMENT_ENV|CompatEnforcement)\b" plugins/multi-root-workspace/src/compat/dsh-version.ts` 0 命中（实测 0；边界表 46 断言 0 失败）
- [x] 2.2 `src/compat.ts` 删 warn 分支与三处 import，`assertSupportedInstallation(report)` 单参非 supported 即抛，`apply` 去 warning/`ctx.logger.warn`；验证：`grep -n "compatEnforcement\|COMPAT_ENFORCEMENT_ENV\|CompatEnforcement\|DSH_MULTI_ROOT_COMPAT\|logger.warn" plugins/multi-root-workspace/src/compat.ts` 0 命中
- [x] 2.3 `src/index.ts` 导出面：删 `SUPPORTED_DSH_RELEASES`/`SupportedDshRelease`/`CompatEnforcement`（D2 不留别名），新增 `DSH_BASELINE`/`SUPPORTED_DSH_RANGE`/`isSupportedDshRelease`；验证：旧三名**词边界** grep（R3）`grep -nE "\b(SUPPORTED_DSH_RELEASES|SupportedDshRelease|CompatEnforcement)\b" plugins/multi-root-workspace/src/index.ts` 0 命中且新三名 grep 3 命中
- [x] 2.4 `tests/compat.spec.ts` 改写（范围三态边界表 + 删 warn/lane 用例 + dev pin 断言改 `'catalog:dsh'` + engines 断言）与 `tests/support/compat.ts` docstring 同步；验证：`pnpm --filter dsh-plugin-multi-root-workspace test` 退出码 0（边界表覆盖 code-design ③ 3.1 全部 8 行）
- [x] 2.5 `scripts/check-dsh-compat.mjs` 改写（断言① = 22 DSH peers == `dsh.engines.dsh` == 派生范围；required-core-in-peers 与 installed-tree 单 release 保留；删开发 pin 断言与 allowlist 成员判断）；验证：`pnpm --filter dsh-plugin-multi-root-workspace compat:check` 退出码 0 且 stdout 含 `[compat] baseline: 0.2.2-rc.1` 与 `[compat] range: >=0.2.2-rc.1 <0.3.0`
- [x] 2.6 重建产物并核对导出面；验证：旧二名**词边界** grep（R3）`grep -rnE "\b(SUPPORTED_DSH_RELEASES|SupportedDshRelease)\b" plugins/multi-root-workspace/lib` 0 命中且 `grep -c "SUPPORTED_DSH_RANGE\|isSupportedDshRelease" plugins/multi-root-workspace/lib/types/compat/dsh-version.d.ts` ≥2
- [x] 2.7 组收口 GATE + 红队；验证：`pnpm --filter dsh-plugin-multi-root-workspace typecheck && pnpm --filter dsh-plugin-multi-root-workspace build && pnpm --filter dsh-plugin-multi-root-workspace test && pnpm --filter dsh-plugin-multi-root-workspace compat:check && pnpm -r typecheck && pnpm dsh:check` 全退出码 0（六连实测 0）；红队一——`DSH_BASELINE` 改 `0.2.1-rc.5` → `compat:check` 退出码 1（23 条 expected 红）+ 包测试红（tripwire 等 5 用例），cp 恢复后双绿；红队二——`grep -rn "DSH_MULTI_ROOT_COMPAT" plugins/multi-root-workspace/{src,tests,scripts}` 0 命中（经 2.8 docblock 收口后达标，含 lib 全零）
- [x] 2.8（执行期新增微任务，裁定 A）`src/compat/dsh-version.ts:19` docblock 叙述行去 `DSH_MULTI_ROOT_COMPAT` 字面字符串（「删除了按环境变量放行的警告档：…」语义等价改写）+ lib 重建（chunk `compat-CZl_gQYV.js`→`compat-BoLaK7du.js`，无孤儿引用）；验证：红队二 grep 在 src/tests/scripts/lib 四处全 0 命中，typecheck/test/compat:check/dsh:check 四连复跑全 0（裁定理由：历史叙述归 ADR-0009，源码注释保留环境变量字符串会干扰未来 grep 排查）

## 3. G-C 文档与 spec delta（触达面 1.3；ADR 一律 append-only）

- [x] 3.1 `docs/decisions/ADR-0009-dsh-compat-contract.md`：`## Related Documents` 前新增 `## 支持矩阵范围化（2026-11-07）` 节（warn 删除、探测车道降级回归验证、明确「范围是预测」论证被推翻）+ Status 追加范围化 fork 注；验证：`grep -c "支持矩阵范围化（2026-11-07）` 该文件 = 1 且 `git diff -U0 -- <该文件> | grep '^-' | grep -v '^---' | wc -l` = 0（只增不删）
- [x] 3.2 `ADR-0002`/`ADR-0011`/`ADR-0012` 末尾注记式追加（「精确版本或已被基线派生软范围取代」）+ `docs/decisions/README.md:28` 索引描述改口；验证：`grep -c "2026-11-07" <三份 ADR>` 各 ≥1 且三份 + README 同为只增不删（README 除外，允许改写该行）
- [x] 3.3 multi-root `AGENTS.md`（H3 段与不变量 7）去 allowlist/warn/「提升是人工动作」旧语义；验证：`grep -n "SUPPORTED_DSH_RELEASES\|DSH_MULTI_ROOT_COMPAT\|exact-version allowlist" plugins/multi-root-workspace/AGENTS.md` 0 命中
- [x] 3.4 multi-root `README.md` + `README.en.md`（双语同步）+ `docs/architecture/multi-root-workspace.md:90` 改口（exact list → baseline-derived range；unsupported 定义改范围外；warn 删除）；验证：`grep -n "exact list, not a range\|精确 allowlist\|version allowlist" <三文件>` 0 命中
- [x] 3.5 `docs/development/plugin-development-workflow.md`（表三行/命令/verify:all 反转/升级流程去 warn 与「人工加入 allowlist」/排障表）+ `docs/troubleshooting/unsupported-dsh-release.md` 整篇改口（`:88` shim 路径改根 `pnpm dsh:upgrade`、删 warn 小节）；验证：两文件 `grep -n "DSH_MULTI_ROOT_COMPAT\|SUPPORTED_DSH_RELEASES"` 0 命中且 `grep -n "multi-root-workspace/scripts/upgrade-dsh" docs/troubleshooting/unsupported-dsh-release.md` 0 命中
- [x] 3.6 `.agent/note/dsh-compat-contract.md` + `.en.md`（§1 唯一真源→运行时副本+派生范围、§5 warn 节删除、§6 升级流程、§8 verify:all 现含 compat:check；历史测量段保留）+ `.agent/note/README.md` + `.en.md` 索引；验证：`cd plugins/multi-root-workspace && pnpm docs:check` 退出码 0
- [x] 3.7 根 `README.md:46` 删例外条、根 `AGENTS.md:48-50` 改「全部插件统一派生 + 运行时副本同批重指」；验证：`grep -n "multi-root 保留精确\|六个软插件" README.md AGENTS.md` 0 命中
- [x] 3.8 组收口（落档件只读校验）；验证：`openspec validate unify-deps-and-templates --strict` 退出码 0（实测 valid）且 `git status --porcelain openspec/` 输出为空——例外命中（R4 口径）：变更目录内 `design.md`/`code-design.md`/`tasks.md` 的执行期留痕更新属预期，`openspec/specs/**` 0 行（执行期未改规范件）+ `pnpm docs:check` 退出码 0（实测绿）

## 4. G-A 模板外迁（触达面 1.4/1.6）

- [x] 4.1 `git mv tooling/template templates/default`（12 文件整目录，保留历史）；验证：`git status --porcelain | grep -c '^R'` ≥11 且 `test ! -d tooling/template`
- [x] 4.2 新建 `templates/README.md`（多模板约定：目录定位/命名/`template.json` schema/`--template` 契约/新增模板步骤/版本字面量禁令）+ 新建 `templates/default/template.json`（现 FILE_TABLE 原样外移，11 条目）+ 原 README 改写为 `templates/default/README.md`（只留本模板件套表，约定段上移）；验证：`node -e "JSON.parse(require('fs').readFileSync('templates/default/template.json'))"` 退出码 0 且 `grep -c '"output"' templates/default/template.json` = 11
- [x] 4.3 `scripts/gen-plugin.mjs`：`TEMPLATE_ROOT` → `templates`、删 `FILE_TABLE` 改 `loadTemplate()` 读 template.json（fail-closed：缺文件/未知键/空 files 即 exit 1）、新增 `--template`（默认 `default`）、USAGE 与输出加模板名；验证：`pnpm gen:plugin --help` 退出码 0 且含 `--template`；`pnpm gen:plugin demo --kind host-only --dry-run` 退出码 0；`pnpm gen:plugin demo --kind host-only --template nope` 退出码 1 且 stderr 含 `default`
- [x] 4.4 `scripts/check-architecture.mjs`：`FORBIDDEN_PACKAGES` 删 `tooling/template` 加 `templates`/`templates/*` + 三处文案（`:22`/`:70`/`:794`）同步，AR2 逻辑零改动；验证：`node scripts/check-architecture.mjs` 退出码 0；红队——`pnpm-workspace.yaml` packages 临时加 `templates/default` → 退出码 1 且信息含 `AR7 packages 里出现 "templates/default"`（cp 恢复）
- [x] 4.5 `templates/default/plugin-README.md.tmpl:6` 自链接改 `templates/default/README.md`；验证：`grep -rn "tooling/template" templates/` 0 命中（4.2 收尾后全量复跑 0 命中达标）
- [x] 4.6 `pnpm-workspace.yaml:3-6` 注释（模板在顶层 `templates/`）+ 根 `README.md`（`:15`/`:19`/`:44`）+ 根 `AGENTS.md`（`:15`/`:17`/`:43`）路径与 `--template` 说明；验证：`grep -rn "tooling/template" README.md AGENTS.md pnpm-workspace.yaml` 0 命中
- [x] 4.7 dotfiles 仓 dsh-plugin-writer 6 处路径同步（SKILL.md×3 + references×3，触达面 1.6 精确行号）并**单独 commit**；验证：`cd /home/xuqinqin/develop/dotfiles && grep -rn "tooling/template" agent/skills/dsh-plugin-writer/` 0 命中且 `git show --stat HEAD` 只含该 skill 路径（两笔：`aca27aa` 4 文件 6 行纯路径替换 + `df0630b` SKILL.md 2 行补 `--template` 与多模板约定引用——4.2/4.3 落地后接续，文档不超前于代码；cordis.patch.yml 全程未混入）
- [x] 4.8 组收口 GATE + 演练；验证：`pnpm dsh:check` 退出码 0；`--template default` 显式与默认 `--dry-run` 输出 diff 为空（口径：剥离生成器自身 argv 回显行后清单段 17 行 diff 空、md5 一致——回显是既有行为，不为演练口径改生成器）；host-only 全链演练（g4demo 9 文件：生成→install→lint/typecheck/build/test→dsh:check→删→install→快照 59 行逐行一致、lockfile 零残留）；dual 同法演练（g4demo2 11 文件双段 typecheck/双产物，清理后 lockfile 与 host-only 清理后字节级 cmp 一致）

## 5. G-B 清理（触达面 1.5）

- [x] 5.1 删除 9 个 `*.tsbuildinfo` 本地残留（按 `find` 实测清单，不按条数）；验证：`find . -name '*.tsbuildinfo' -not -path './node_modules/*' | wc -l` = 0 且 `git ls-files '*.tsbuildinfo' | wc -l` = 0
- [x] 5.2 删除 `plugins/multi-root-workspace/scripts/upgrade-dsh.mjs`（已弃用委托 shim）；验证：`test ! -e plugins/multi-root-workspace/scripts/upgrade-dsh.mjs` 且 `ls plugins/multi-root-workspace/scripts | wc -l` = 8
- [x] 5.3 ADR-0009 Status 追加第二条 fork 注（shim 删除、入口唯一化，追加在 3.1 范围化注之后）；验证：`grep -c "委托 shim 已删除" <ADR-0009>` = 1（实测 1）且「只增不删」按 R5 等价句（原句因 3.6 扩面已对 ADR-0009:299 链接文字做 -/+ 成对改口，字面不可满足；快照法证明本次纯追加 2 行）：`git diff -U0 -- <ADR-0009> | grep '^-' | grep -v '^---' | grep -vxF -- '-- [故障排查：不支持的 DSH 版本](../troubleshooting/unsupported-dsh-release.md)' | wc -l` = 0（实测 0）
- [x] 5.4 复跑构建确认 tsbuildinfo 不复现；验证：`pnpm -r build && pnpm -r typecheck` 后 `find . -name '*.tsbuildinfo' -not -path './node_modules/*' | wc -l` 仍为 0（实测 build 0 / typecheck 0 / find 0；node_modules 内 10 个为第三方包自带产物，非本次构建生成）
- [x] 5.5 组收口；验证：`git grep -n "multi-root-workspace/scripts/upgrade-dsh" -- . ':!openspec'` 0 命中且 `pnpm dsh:check` 退出码 0（实测双绿；工作区 60 行全归类：3 ?? 均待提交产物、2 D 删除项、43 M+10 R+2 RM 前序任务）

## 6. 收口（不改源码；命令与 /tmp 快照）

- [x] 6.1 全仓七链；验证：`pnpm install --frozen-lockfile && pnpm -r lint && pnpm -r typecheck && pnpm -r build && pnpm -r test && pnpm docs:check && pnpm dsh:check` 全退出码 0（实测七链全 0；frozen 未触 lockfile sha `23eb69cf…`；2806 passed / 4 既有 skip；唯一 lint warning 为 web-ux 基线既有、不在本变更修改集）
- [x] 6.2 multi-root 完整门禁（`smoke` 需运行中的 dsh；`kernel:probe` 无方言环境按既有 skip 语义）；验证：`pnpm --filter dsh-plugin-multi-root-workspace verify:all` 退出码 0（实测七环节全绿：lint 0 / compat:check 4 行 / 双段 typecheck / build 可重复 / kernel:probe 三方言如实 skip / test 423 passed+4 skip / smoke 46+99+60 checks 全过；事实更正见组 6 终形态——包内 smoke 用仓内 devDependency dsh 二进制 + 隔离 scratch HOME，对 dsh 容器零依赖）
- [x] 6.3 gen:plugin 负例三连；验证：`--template nope` 退出码 1；临时移走 `templates/default/template.json` → 退出码 1（恢复）；临时移走 `templates/default/build.mjs` → 退出码 1 且 stderr 打印相对路径（恢复）（实测三例 exit 1 信息精确含 `templates/default/…` 相对路径；sha256 字节级恢复；工作区 60 行零差异）
- [x] 6.4 dsh-baseline 红队二连（窗口独占，cp 恢复）；验证：任一 DSH devDep 写字面量 → `pnpm dsh:check` 退出码 1 含 `expected "catalog:dsh"`；`engines.dsh` 改 `>=0.2.2-rc.1 <0.4.0` → 退出码 1 含 `expected ">=0.2.2-rc.1 <0.3.0"`；恢复后退出码 0（实测绿→红→红→绿，R2 配方，md5 字节级恢复，工作区 60 行零差异）
- [x] 6.5 运行时门红队（同组 2 红队一口径复核一次）；验证：`DSH_BASELINE` 改 `0.2.1-rc.5` → `compat:check` 退出码 1 + 包测试红，恢复后双绿（实测 compat 23 条 expected 红（engines+22 peers）+ test 5 用例红（tripwire 等），cp 恢复 md5 一致后双绿，工作区 60 行零差异）
- [x] 6.6 结构门禁红队（同组 4 红队一口径复核一次）；验证：packages 临时加 `templates/*` → `node scripts/check-architecture.mjs` 退出码 1 点名 AR7，恢复后退出码 0（实测 `templates/*` 精确键与 `templates/default` 前缀分支双形态均拦截点名；sha256 字节级复原，工作区 60 行零差异）
- [x] 6.7 产物与提交面复核；验证：`node scripts/check-artifacts.mjs` 退出码 0（实测 7 包 B1–B5 全绿；B6 基线比对仅 multi-root host.words 1 词差异 = chunk 哈希轮换预期，未重冻基线；4 条 sha 提示为快照陈旧非回归）且 `git status --porcelain` 逐条归类无意外文件（实测 60 行 0 意外：43 M+2 D+10 R+2 RM+3 ??；diff 47 文件 1412+/1096−，密钥/日志/临时文件零命中；specs/ 与 archive/ 0 改动）
- [x] 6.8 规范收口；验证：`openspec validate unify-deps-and-templates --strict` 退出码 0 且 `openspec doctor` 无 error（实测 strict valid、doctor 零 error 零 warning、R4 全核对 specs/ 与 archive/ 0 行；validate --all --strict 的 2 条既有 WARNING 属 dsh-project-mcp / dsh-session-tool-toggle 未改动文件的基线问题，与本变更无关——留收尾汇报）

## 附录：执行期留痕（R<n> 运行规则，供后续组与接续引用）

- **R1（2026-11-07，任务 1.5）验证句修订：lockfile diff 白名单须含删除侧 specifier 与 catalogs 段新条目**。规则：凡「install 更新 lockfile 后断言 diff 只含合法行」的验证句，必须同时豁免 ①specifier 改写的删除侧旧行（catalog:dsh 改写必然产生 `- specifier: <旧值>` 35+1 行）与 ②catalogs 扩容新条目在 lockfile `catalogs:` 段的定义三行组（包名行 + `specifier:` + `version:`，1.1 扩 22 条即 66 行）。依据：1.5 实测原句得 102（36 删除侧 + 66 定义段），逐行归类证明 version 零漂移、无越界变化；原句只白名单新增侧 `specifier: catalog:dsh`，数学上不可满足。适用范围：本变更组 1 的 1.5 与后续任何 install 类任务；连锁面：tasks.md 1.5 验证句已改为等价替代句（实测 0）；组 6 的 6.1（`pnpm install --frozen-lockfile`）不产生 diff、不受影响；若未来再有 catalogs 扩容任务，直接复用 1.5 的替代句形态。
- **R2（2026-11-07，任务 1.7）红队配方：pnpm 11.25 依赖状态门先于脚本执行**。规则：改动 manifest 制造红队态后，朴素 `pnpm dsh:check` 会因 manifest 与 lockfile 失配触发 pnpm 自身 verify-deps 门（auto-install 尝试 → `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` 中止），**断言脚本根本不执行**、看不到 catalog 断言；红队验证必须用 `pnpm --config.verify-deps-before-run=false dsh:check`（或 `node scripts/dsh-check.mjs` 直跑）才落到门禁断言。依据：1.7 红队实测（GATE 朴素调用绿不受影响——只在 manifest 被改的失败态才触发）。适用范围：本变更全部「改 manifest → 跑 dsh:check 期待红」的红队任务；连锁面：tasks.md 6.4（dsh-baseline 红队二连）与 6.5（若涉 manifest）须按此配方；恢复纪律不变（cp 备份/恢复）。
- **R3（2026-11-07，任务 2.1）旧名 grep 验证句一律词边界 + DSH_BASELINE 注释形状禁令**。规则①：凡 grep 旧导出名（`SUPPORTED_DSH_RELEASES`/`SupportedDshRelease`/`CompatEnforcement`/`COMPAT_ENFORCEMENT_ENV`/`compatEnforcement`）断言「删除后 0 命中」的验证句，必须用 `\b(...)\b` 词边界形态——`SupportedDshRelease` 是新导出名 `isSupportedDshRelease` 的子串，字面 grep 恒有假命中（2.1 实测 2 命中全来自新名）。规则②（DSH_BASELINE 注释形状禁令）：`scripts/upgrade-dsh.mjs` 的 `repointRuntimeBaselines()` 与 `scripts/check-dsh-compat.mjs` 均按**行首首个 `export const DSH_BASELINE = '…'` 文本出现**读取/重写——`src/compat/dsh-version.ts` 内任何注释、docblock、类型示例都不得复写该完整赋值形状，否则升级重指会改写注释而漏掉真常量（2.1 实测踩中并已修复：初版 docblock 示例被 replace 改写、真常量漏改；该常量 docblock 已写明禁令）。适用范围：本变更组 2 的 2.1/2.3/2.6 验证句、组 3 文档任务（引用该文件时不得建议放赋值示例）、未来任何触碰 dsh-version.ts 的任务；连锁面：tasks.md 2.1/2.3/2.6 验证句已改为词边界形态；code-design ③ 3.1 的 grep 断言以本规则为准。
- **R4（2026-11-07，任务 3.8）openspec/ 校验例外范围口径**。规则：凡「执行期未改规范件」类断言（组 3 的 3.8 与组 6 的 6.8 同句式），`git status --porcelain openspec/` 的合法非空仅限 `openspec/changes/<变更名>/` 内的工件更新（design.md / code-design.md / tasks.md 执行期留痕与勾选，随批次提交入库）；`openspec/specs/**` 与 `openspec/changes/` 其他目录出现任何行即异常。依据：3.8 实测 openspec/ 非空 3 行全部为变更目录工件、specs/ 0 行。连锁面：6.8 复用此口径；3.8 勾选行已按例外命中定性改写。
- **R5（2026-11-07，任务 5.3）append-only 断言遇同文件成对改写时用快照法或白名单等价句**。规则：凡「git diff 无 `-` 行」（只增不删）类断言，若该文件在本次变更中已被其他任务做过合法的 -/+ 成对改写（如 3.6 扩面对 ADR-0009:299 链接文字），字面断言数学上不可满足——须改为 ①before/after 快照法（`cp` 快照 → 编辑 → `diff -U0 before after | grep '^-' | grep -v '^---' | wc -l` = 0，证明本次编辑纯追加）或 ②白名单等价句（豁免已知的既有改口行，逐行列出）。依据：5.3 实测原句 = 1（唯一 `-` 行为 3.6 的链接改口），快照法 = 0。适用范围：本变更后续与未来变更中同一文件被多次触达的 append-only 场景；连锁面：tasks.md 5.3 验证句已改等价句；3.1 当时的同句式验证侥幸通过（3.1 落地时该链接行尚未被改）——后触达任务须主动检查前序任务的成对改写。

## 附录：沉淀回流清单（spec-apply 第六节，执行期改动的工作流仓文件去向）

已提交（dotfiles 仓，两笔独立 commit，与根仓分立）：
- `agent/skills/dsh-plugin-writer/SKILL.md` + `references/{build,structure,verify-install}.md`——6 处 `tooling/template` → `templates/default` 路径同步（commit `aca27aa`）；SKILL.md 2 行补 `--template` 与多模板约定引用（commit `df0630b`）。触发源：组 4 模板外迁（4.1/4.2/4.3），连锁由 dotfiles dsh-plugin-writer skill 引用模板路径。

随根仓最终提交入库（本变更批次）：
- `openspec/changes/unify-deps-and-templates/{design.md,tasks.md,code-design.md}`——执行环境块、43 勾选、R1–R5 留痕、组 1–6 终形态、§0 执行期校正（decisions README.en 存在、troubleshooting 索引行、README 链接文字四处）。
- 根 `AGENTS.md` / `README.md`——DSH 基线章节新口径（3.7）与模板路径/`--template`（4.6）。

未提交待决（执行期发现，留用户裁定，均不阻塞本变更）：
- 根 `README.md` / `AGENTS.md` 的「multi-root 的 smoke 需运行中的 dsh」一行——包内 smoke 实测对容器零依赖（见组 6 终形态事实更正），属基线既有口径失真，可另开小变更或随下次触达顺带改。
- dotfiles `dsh/profiles/web/cordis.patch.yml`——用户自己的在途改动，全程未触碰。
