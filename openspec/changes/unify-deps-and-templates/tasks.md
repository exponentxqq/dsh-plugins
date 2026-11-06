# Tasks

> 组间严格串行（组号即执行顺序），组内任务写面互不相交、可并行。每组末位任务为组收口门禁。任务描述中的「触达面 1.x」指 [`code-design.md`](./code-design.md) ① 触达面清单的节号。install 一律 `--store-dir /home/xuqinqin/develop/.pnpm-store/v11`（R5 纪律）。

## 1. G-C 依赖面（触达面 1.1）

- [ ] 1.1 `pnpm-workspace.yaml` 的 `catalogs.dsh` 按字母序插入 22 条 `'@deepseek-ai/*': '0.2.2-rc.1'`（31→53，精确清单见 code-design ③ 3.3；`allowBuilds` 与 `minimumReleaseAgeExclude` 一字不动）；验证：code-design ⑤ 1.1 的 node 断言脚本退出码 0（53 entries、36 条 devDeps 全入册、新键值全 `0.2.2-rc.1`）
- [ ] 1.2 `scripts/check-dsh-baseline.mjs` 删 `hardPlugins`/`softPlugins` 分裂与 `hardPlugins.length !== 1` 断言与组 6 整段（allowlist 正则 + compat:check 调用），组 4 形态断言与组 5 范围断言改遍历全部插件，头注释与 `normalizeDep` 注释去「精确契约插件豁免」措辞；验证：`node scripts/check-dsh-baseline.mjs` 在 1.3 完成前退出码 1 且失败行全部以 `dsh-plugin-multi-root-workspace:` 开头（六软插件零失败）
- [ ] 1.3 `plugins/multi-root-workspace/package.json`：36 条 `@deepseek-ai/*` devDeps → `catalog:dsh`；21 条 DSH peer → `">=0.2.2-rc.1 <0.3.0"` 并新增 `"@deepseek-ai/dsh"` peer（Q1）；新增 `dsh.engines.dsh` 同值；cordis peer 不动；`verify:all` 追加 `compat:check`（Q4，置于 lint 之后）；验证：`node -e` 断言 engines/peers/devDeps/cordis 四项后 `node scripts/check-dsh-baseline.mjs` 退出码 0
- [ ] 1.4 `scripts/upgrade-dsh.mjs` 删 `hasExactContract()` 与全部豁免调用点，`repointPlugin` 对全部插件写 `dsh.engines.dsh` 与 DSH peer，新增 `repointRuntimeBaselines()` 重写 `plugins/*/src/compat/dsh-version.ts` 的 `DSH_BASELINE` 字面量，末段提示删 warn/allowlist 文案；验证：`grep -n "hasExactContract\|SUPPORTED_DSH_RELEASES\|DSH_MULTI_ROOT_COMPAT" scripts/upgrade-dsh.mjs` 0 命中且 `node scripts/upgrade-dsh.mjs --print-installed` 退出码 0
- [ ] 1.5 `pnpm install --no-frozen-lockfile` 更新 lockfile；验证：`git diff --unified=0 pnpm-lock.yaml | grep -E '^[+-]' | grep -vE '^(\+\+\+|---)' | grep -v 'specifier: catalog:dsh' | wc -l` 为 0（只允许 specifier 行变化）
- [ ] 1.6 `scripts/dsh-baseline.mjs` 头注释校正（「四个插件/三个软插件」→ 七插件统一口径），常量与 `softDshRange()` 不动；验证：`grep -n "四个插件\|三个软插件" scripts/dsh-baseline.mjs` 0 命中
- [ ] 1.7 组收口 GATE + 红队；验证：`pnpm dsh:check` 退出码 0；红队——临时把 multi-root 任一 DSH devDep 写回字面量 `0.2.2-rc.1` → `pnpm dsh:check` 退出码 1 且信息含 `expected "catalog:dsh"`，cp 恢复后退出码 0（红队窗口独占）

## 2. G-C 运行时门（触达面 1.2；执行前先读 multi-root `AGENTS.md` 与 `.agent/note/`）

- [ ] 2.1 `src/compat/dsh-version.ts` 重写：删 `SUPPORTED_DSH_RELEASES`/`SupportedDshRelease`/`CompatEnforcement`/`COMPAT_ENFORCEMENT_ENV`/`compatEnforcement()`，新增 `DSH_BASELINE` 字面量 + 派生 `SUPPORTED_DSH_RANGE` + 手写比较器 + `isSupportedDshRelease()`（签名与规则见 code-design ③ 3.1），unsupported 分支改范围判定（missing/mixed 不变），docblock 重写注明新裁定；验证：`grep -n "SUPPORTED_DSH_RELEASES\|SupportedDshRelease\|compatEnforcement\|COMPAT_ENFORCEMENT_ENV\|CompatEnforcement" plugins/multi-root-workspace/src/compat/dsh-version.ts` 0 命中
- [ ] 2.2 `src/compat.ts` 删 warn 分支与三处 import，`assertSupportedInstallation(report)` 单参非 supported 即抛，`apply` 去 warning/`ctx.logger.warn`；验证：`grep -n "compatEnforcement\|COMPAT_ENFORCEMENT_ENV\|CompatEnforcement\|DSH_MULTI_ROOT_COMPAT\|logger.warn" plugins/multi-root-workspace/src/compat.ts` 0 命中
- [ ] 2.3 `src/index.ts` 导出面：删 `SUPPORTED_DSH_RELEASES`/`SupportedDshRelease`/`CompatEnforcement`（D2 不留别名），新增 `DSH_BASELINE`/`SUPPORTED_DSH_RANGE`/`isSupportedDshRelease`；验证：旧三名 grep 0 命中且新三名 grep 3 命中
- [ ] 2.4 `tests/compat.spec.ts` 改写（范围三态边界表 + 删 warn/lane 用例 + dev pin 断言改 `'catalog:dsh'` + engines 断言）与 `tests/support/compat.ts` docstring 同步；验证：`pnpm --filter dsh-plugin-multi-root-workspace test` 退出码 0（边界表覆盖 code-design ③ 3.1 全部 8 行）
- [ ] 2.5 `scripts/check-dsh-compat.mjs` 改写（断言① = 22 DSH peers == `dsh.engines.dsh` == 派生范围；required-core-in-peers 与 installed-tree 单 release 保留；删开发 pin 断言与 allowlist 成员判断）；验证：`pnpm --filter dsh-plugin-multi-root-workspace compat:check` 退出码 0 且 stdout 含 `[compat] baseline: 0.2.2-rc.1` 与 `[compat] range: >=0.2.2-rc.1 <0.3.0`
- [ ] 2.6 重建产物并核对导出面；验证：`grep -rn "SUPPORTED_DSH_RELEASES\|SupportedDshRelease" plugins/multi-root-workspace/lib` 0 命中且 `grep -c "SUPPORTED_DSH_RANGE\|isSupportedDshRelease" plugins/multi-root-workspace/lib/types/compat/dsh-version.d.ts` ≥2
- [ ] 2.7 组收口 GATE + 红队；验证：`pnpm --filter dsh-plugin-multi-root-workspace typecheck && pnpm --filter dsh-plugin-multi-root-workspace build && pnpm --filter dsh-plugin-multi-root-workspace test && pnpm --filter dsh-plugin-multi-root-workspace compat:check && pnpm -r typecheck && pnpm dsh:check` 全退出码 0；红队一——sed 把 `DSH_BASELINE` 改 `0.2.1-rc.5` → `compat:check` 退出码 1 且包测试红（cp 恢复后双绿）；红队二——`grep -rn "DSH_MULTI_ROOT_COMPAT" plugins/multi-root-workspace/{src,tests,scripts}` 0 命中

## 3. G-C 文档与 spec delta（触达面 1.3；ADR 一律 append-only）

- [ ] 3.1 `docs/decisions/ADR-0009-dsh-compat-contract.md`：`## Related Documents` 前新增 `## 支持矩阵范围化（2026-11-07）` 节（warn 删除、探测车道降级回归验证、明确「范围是预测」论证被推翻）+ Status 追加范围化 fork 注；验证：`grep -c "支持矩阵范围化（2026-11-07）` 该文件 = 1 且 `git diff -U0 -- <该文件> | grep '^-' | grep -v '^---' | wc -l` = 0（只增不删）
- [ ] 3.2 `ADR-0002`/`ADR-0011`/`ADR-0012` 末尾注记式追加（「精确版本或已被基线派生软范围取代」）+ `docs/decisions/README.md:28` 索引描述改口；验证：`grep -c "2026-11-07" <三份 ADR>` 各 ≥1 且三份 + README 同为只增不删（README 除外，允许改写该行）
- [ ] 3.3 multi-root `AGENTS.md`（H3 段与不变量 7）去 allowlist/warn/「提升是人工动作」旧语义；验证：`grep -n "SUPPORTED_DSH_RELEASES\|DSH_MULTI_ROOT_COMPAT\|exact-version allowlist" plugins/multi-root-workspace/AGENTS.md` 0 命中
- [ ] 3.4 multi-root `README.md` + `README.en.md`（双语同步）+ `docs/architecture/multi-root-workspace.md:90` 改口（exact list → baseline-derived range；unsupported 定义改范围外；warn 删除）；验证：`grep -n "exact list, not a range\|精确 allowlist\|version allowlist" <三文件>` 0 命中
- [ ] 3.5 `docs/development/plugin-development-workflow.md`（表三行/命令/verify:all 反转/升级流程去 warn 与「人工加入 allowlist」/排障表）+ `docs/troubleshooting/unsupported-dsh-release.md` 整篇改口（`:88` shim 路径改根 `pnpm dsh:upgrade`、删 warn 小节）；验证：两文件 `grep -n "DSH_MULTI_ROOT_COMPAT\|SUPPORTED_DSH_RELEASES"` 0 命中且 `grep -n "multi-root-workspace/scripts/upgrade-dsh" docs/troubleshooting/unsupported-dsh-release.md` 0 命中
- [ ] 3.6 `.agent/note/dsh-compat-contract.md` + `.en.md`（§1 唯一真源→运行时副本+派生范围、§5 warn 节删除、§6 升级流程、§8 verify:all 现含 compat:check；历史测量段保留）+ `.agent/note/README.md` + `.en.md` 索引；验证：`cd plugins/multi-root-workspace && pnpm docs:check` 退出码 0
- [ ] 3.7 根 `README.md:46` 删例外条、根 `AGENTS.md:48-50` 改「全部插件统一派生 + 运行时副本同批重指」；验证：`grep -n "multi-root 保留精确\|六个软插件" README.md AGENTS.md` 0 命中
- [ ] 3.8 组收口（落档件只读校验）；验证：`openspec validate unify-deps-and-templates --strict` 退出码 0 且 `git status --porcelain openspec/` 输出为空（执行期未改规范件）+ `pnpm docs:check` 退出码 0

## 4. G-A 模板外迁（触达面 1.4/1.6）

- [ ] 4.1 `git mv tooling/template templates/default`（12 文件整目录，保留历史）；验证：`git status --porcelain | grep -c '^R'` ≥11 且 `test ! -d tooling/template`
- [ ] 4.2 新建 `templates/README.md`（多模板约定：目录定位/命名/`template.json` schema/`--template` 契约/新增模板步骤/版本字面量禁令）+ 新建 `templates/default/template.json`（现 FILE_TABLE 原样外移，11 条目）+ 原 README 改写为 `templates/default/README.md`（只留本模板件套表，约定段上移）；验证：`node -e "JSON.parse(require('fs').readFileSync('templates/default/template.json'))"` 退出码 0 且 `grep -c '"output"' templates/default/template.json` = 11
- [ ] 4.3 `scripts/gen-plugin.mjs`：`TEMPLATE_ROOT` → `templates`、删 `FILE_TABLE` 改 `loadTemplate()` 读 template.json（fail-closed：缺文件/未知键/空 files 即 exit 1）、新增 `--template`（默认 `default`）、USAGE 与输出加模板名；验证：`pnpm gen:plugin --help` 退出码 0 且含 `--template`；`pnpm gen:plugin demo --kind host-only --dry-run` 退出码 0；`pnpm gen:plugin demo --kind host-only --template nope` 退出码 1 且 stderr 含 `default`
- [ ] 4.4 `scripts/check-architecture.mjs`：`FORBIDDEN_PACKAGES` 删 `tooling/template` 加 `templates`/`templates/*` + 三处文案（`:22`/`:70`/`:794`）同步，AR2 逻辑零改动；验证：`node scripts/check-architecture.mjs` 退出码 0；红队——`pnpm-workspace.yaml` packages 临时加 `templates/default` → 退出码 1 且信息含 `AR7 packages 里出现 "templates/default"`（cp 恢复）
- [ ] 4.5 `templates/default/plugin-README.md.tmpl:6` 自链接改 `templates/default/README.md`；验证：`grep -rn "tooling/template" templates/` 0 命中
- [ ] 4.6 `pnpm-workspace.yaml:3-6` 注释（模板在顶层 `templates/`）+ 根 `README.md`（`:15`/`:19`/`:44`）+ 根 `AGENTS.md`（`:15`/`:17`/`:43`）路径与 `--template` 说明；验证：`grep -rn "tooling/template" README.md AGENTS.md pnpm-workspace.yaml` 0 命中
- [ ] 4.7 dotfiles 仓 dsh-plugin-writer 6 处路径同步（SKILL.md×3 + references×3，触达面 1.6 精确行号）并**单独 commit**；验证：`cd /home/xuqinqin/develop/dotfiles && grep -rn "tooling/template" agent/skills/dsh-plugin-writer/` 0 命中且 `git show --stat HEAD` 只含该 skill 路径
- [ ] 4.8 组收口 GATE + 演练；验证：`pnpm dsh:check` 退出码 0；`--template default` 显式与默认 `--dry-run` 输出 diff 为空；host-only 全链演练（生成→install→lint/typecheck/build/test→dsh:check→删→install→快照 diff 空）；dual 同法演练

## 5. G-B 清理（触达面 1.5）

- [ ] 5.1 删除 9 个 `*.tsbuildinfo` 本地残留（按 `find` 实测清单，不按条数）；验证：`find . -name '*.tsbuildinfo' -not -path './node_modules/*' | wc -l` = 0 且 `git ls-files '*.tsbuildinfo' | wc -l` = 0
- [ ] 5.2 删除 `plugins/multi-root-workspace/scripts/upgrade-dsh.mjs`（已弃用委托 shim）；验证：`test ! -e plugins/multi-root-workspace/scripts/upgrade-dsh.mjs` 且 `ls plugins/multi-root-workspace/scripts | wc -l` = 8
- [ ] 5.3 ADR-0009 Status 追加第二条 fork 注（shim 删除、入口唯一化，追加在 3.1 范围化注之后）；验证：`grep -c "委托 shim 已删除" <ADR-0009>` = 1 且 `git diff -U0 -- <ADR-0009> | grep '^-' | grep -v '^---' | wc -l` = 0
- [ ] 5.4 复跑构建确认 tsbuildinfo 不复现；验证：`pnpm -r build && pnpm -r typecheck` 后 `find . -name '*.tsbuildinfo' -not -path './node_modules/*' | wc -l` 仍为 0
- [ ] 5.5 组收口；验证：`git grep -n "multi-root-workspace/scripts/upgrade-dsh" -- . ':!openspec'` 0 命中且 `pnpm dsh:check` 退出码 0

## 6. 收口（不改源码；命令与 /tmp 快照）

- [ ] 6.1 全仓七链；验证：`pnpm install --frozen-lockfile && pnpm -r lint && pnpm -r typecheck && pnpm -r build && pnpm -r test && pnpm docs:check && pnpm dsh:check` 全退出码 0
- [ ] 6.2 multi-root 完整门禁（`smoke` 需运行中的 dsh；`kernel:probe` 无方言环境按既有 skip 语义）；验证：`pnpm --filter dsh-plugin-multi-root-workspace verify:all` 退出码 0
- [ ] 6.3 gen:plugin 负例三连；验证：`--template nope` 退出码 1；临时移走 `templates/default/template.json` → 退出码 1（恢复）；临时移走 `templates/default/build.mjs` → 退出码 1 且 stderr 打印相对路径（恢复）
- [ ] 6.4 dsh-baseline 红队二连（窗口独占，cp 恢复）；验证：任一 DSH devDep 写字面量 → `pnpm dsh:check` 退出码 1 含 `expected "catalog:dsh"`；`engines.dsh` 改 `>=0.2.2-rc.1 <0.4.0` → 退出码 1 含 `expected ">=0.2.2-rc.1 <0.3.0"`；恢复后退出码 0
- [ ] 6.5 运行时门红队（同组 2 红队一口径复核一次）；验证：`DSH_BASELINE` 改 `0.2.1-rc.5` → `compat:check` 退出码 1 + 包测试红，恢复后双绿
- [ ] 6.6 结构门禁红队（同组 4 红队一口径复核一次）；验证：packages 临时加 `templates/*` → `node scripts/check-architecture.mjs` 退出码 1 点名 AR7，恢复后退出码 0
- [ ] 6.7 产物与提交面复核；验证：`node scripts/check-artifacts.mjs` 退出码 0（B1–B5；multi-root 模块词集变化属预期，记录说明）且 `git status --porcelain` 逐条归类无意外文件
- [ ] 6.8 规范收口；验证：`openspec validate unify-deps-and-templates --strict` 退出码 0 且 `openspec doctor` 无 error（既有 warning 记录「与本次无关」）
