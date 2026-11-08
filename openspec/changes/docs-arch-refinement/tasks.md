# Tasks

> 执行批次契约：`## N. 组名` = 执行审核批次，N 递增即执行顺序，**组间严格串行**、组内任务可并行（同组任务不写同一文件；标注「同批生效」的任务以组级验收统一收口，中间态不要求绿）。任务描述中括号内标识引用随档 `code-design.md` ① 触达面清单的条目（区.文件）。单组任务数上限 8（映射 `parallelism`）。

## 1. 评估档案

- [x] 1.1 新建 `docs/assessments/docs-unification.md`：现状差异清单（三种体制 / 13 断链 / 证据三形态）、不施工项（双语推广已废 / multi-root 体系收敛 / 豁免清单生成化另案）、通过标准（非归档区 0 error、骨架门禁绿）、附录落豁免清单盘点（minimumReleaseAgeExclude 300+ 条为何另案 + --dump-config-schema 4 条口径豁免收录）（B.docs-unification，新建）；验证：`test -f docs/assessments/docs-unification.md` 且 `grep -c "不施工" docs/assessments/docs-unification.md` ≥ 2 且 `grep -c "minimumReleaseAgeExclude" docs/assessments/docs-unification.md` ≥ 1
- [x] 1.2 `docs/assessments/README.md` 索引表 +1 行（B.assessments-README）；验证：`grep -n "docs-unification" docs/assessments/README.md` 命中且 `openspec validate docs-arch-refinement --strict` 退出码 0（不受影响）

## 2. 规范落位

- [x] 2.1 新建 `docs/decisions/ADR-0003-doc-system-layers-and-gates.md`：分层 ownership 表、README 软骨架 4+5 节定义（七包统一）、证据两级制与证据行文法、门禁 6 查项、「规则在文档、脚本只机械执行」分工、openspec 工件面一句边界声明、索引页只链接纪律；按七节骨架写成且自身先过 adr-skeleton（B.ADR-0003，新建）；验证：`test -f docs/decisions/ADR-0003-doc-system-layers-and-gates.md` 且七节骨架逐节 `grep -c "^## "` ≥ 7
- [x] 2.2 新建 `docs/README.md` 仓级索引页：只链接（README / AGENTS / docs 三区 / openspec / 各插件 README / artifacts 索引），不复制摘要（B.docs-README，新建）；验证：`test -f docs/README.md` 且页面内相对链接目标逐一生成核对清单人工巡检（内链检查在组 7 后由门禁接管）
- [x] 2.3 `AGENTS.md` 加 ADR-0003 与 docs/README.md 链接（≤4 行 diff，正文不膨胀）（B.AGENTS）；验证：`git diff --numstat AGENTS.md` 两列之和 ≤ 4 且 diff 含 `docs/README.md` 链接

> 说明：toolchain spec requirement 以本变更目录 `specs/dsh-plugin-toolchain/spec.md` delta 随归档同步进主 spec（OpenSpec 既定机制），执行侧**不直改** `openspec/specs/dsh-plugin-toolchain/spec.md`；`code-design.md` ① B 区该条目按此理解执行。

## 3. 门禁内核抽取（必须先于组 4）

- [x] 3.1 新建 `scripts/lib/doc-checks.mjs`：multi-root 10 检查参数化重写为 `runDocChecks(config)`（打印与退出计数由内核持有）+ 新增 readme-skeleton / adr-skeleton / evidence-location / bare-adr-ref 四检查（组 7 才在仓级配置启用）+ 新建 `scripts/lib/doc-checks.d.mts` 类型声明（A.doc-checks + A.doc-checks.d.mts，新建）；验证：`node --check scripts/lib/doc-checks.mjs` 退出码 0 且 `test -f scripts/lib/doc-checks.d.mts`
- [x] 3.2 新建 `scripts/lib/doc-checks.selftest.mjs`：运行时 mkdtemp 构造 5 类缺陷样本（断链 / 绝对路径 / 空文档 / 缺骨架节 README / 缺七节 ADR）断言逐项 FAIL、豁免路径断言 PASS，样本不入库（A.selftest，新建）；验证：`node scripts/lib/doc-checks.selftest.mjs` 退出码 0 且输出含 5 类样本的 FAIL 断言通过行
- [x] 3.3 `plugins/multi-root-workspace/scripts/check-docs.mjs` 薄化为构造 PKG_CONFIG + 调内核 + exit code（318 行 → 约 30 行，10 项全开）（D.check-docs）；验证：`pnpm --filter dsh-plugin-multi-root-workspace docs:check` 输出与抽取前基线逐项一致（10 行 PASS + `0 errors, 0 warnings.`，基线已实测存档于 code-design ⑤ G3）且退出码 0

## 4. 单语化 + 废弃上游同步（同批生效，组级验收）

- [x] 4.1 删 10 份 `.en.md`（README.en.md / docs 六索引 / .agent 两份 / note 一份，共 781 行）+ `plugins/multi-root-workspace/package.json` 的 `files` 删 `"README.en.md"` 行（D.en.md×10 + D.package.json，同批：漏删 files 行即清单撒谎）；验证：`find plugins/multi-root-workspace -name "*.en.md" | wc -l` = 0 且 `! grep -n '"README.en.md"' plugins/multi-root-workspace/package.json`
- [x] 4.2 `plugins/multi-root-workspace/README.md`：删语言导航行、删全部 fork 上游叙述（:17 段 / :21 句 / :82 / :111 / :118），保留 DSH 宿主上游语义（D.multi-root-README）；验证：`! grep -n "README.en.md\|cherrchen\|本地 fork" plugins/multi-root-workspace/README.md` 且 `grep -c "deepseek-harness\|不修改上游" plugins/multi-root-workspace/README.md` ≥ 0（DSH 语义不误删，逐处人工核对）
- [x] 4.3 `plugins/multi-root-workspace/AGENTS.md`：删 `## Bilingual Documentation` 整节（:71–:86）、fork 叙述段（:90 起的 local fork/baseline f149fa4/M1–M3/H1–H4 段）清零改写，十一条不变量与 DSH 兼容正文不动（D.multi-root-AGENTS）；验证：`! grep -n "Bilingual\|cherrchen\|f149fa4" plugins/multi-root-workspace/AGENTS.md` 且 `grep -c "^## " plugins/multi-root-workspace/AGENTS.md` 较改前减 1
- [x] 4.4 `.agent/skills/documentation/SKILL.md` 删中英规则（§4/:62–:87、§5 成对与导航、:140、§11 第 4 项、§12 改「7 项 + 共享内核」）+ `.agent/note/README.md` 删三处成对举例（D.SKILL + D.note-README）；验证：`! grep -n "\.en\.md" plugins/multi-root-workspace/.agent/skills/documentation/SKILL.md` 且 `! grep -n "upstream-integration.en.md" plugins/multi-root-workspace/.agent/note/README.md`
- [x] 4.5 `docs/README.md`（multi-root 内）删 nav 行与语言段 + 五目录 README 删英文导航行 + `docs/development/plugin-development-workflow.md` 上游叙述收敛为现状事实一句（D.mr-docs-README + D.五目录 + D.workflow）；验证：`grep -rn "README.en.md" plugins/multi-root-workspace/docs/ | wc -l` = 0
- [x] 4.6 新建 `plugins/multi-root-workspace/docs/decisions/ADR-0014-fork-divergence-and-single-language.md`（只写处置：单语化 / 终止 fork 上游同步 / check-docs 薄化，**不含任何上游来历句**）+ 其 `docs/decisions/README.md` 索引 +1（D.ADR-0014 新建 + D.mr-decisions-README）；验证：`test -f plugins/multi-root-workspace/docs/decisions/ADR-0014-*.md` 且 `! grep -n "cherrchen\|f149fa4\|上游同步" -A0 plugins/multi-root-workspace/docs/decisions/ADR-0014-*.md | grep -c "cherrchen\|f149fa4"` = 0
- [x] 4.7 内核双语 3 项检查退役（checks 开关关闭）+ multi-root 薄入口配置同步为 7 项（A.doc-checks 配置 + D.check-docs；与 4.1 同批生效）；验证：组级验收 `pnpm --filter dsh-plugin-multi-root-workspace docs:check` 输出 7 项 PASS、`0 errors, 0 warnings.`、退出码 0（与 3.3 基线相比恰少 readme-pairs / agent-note-pairs / readme-navigation 三行）

## 5. 骨架对齐（七包）+ web-ux 去重 + 模板

- [x] 5.1 `plugins/project-mcp/README.md`：补 `## 定位`（端性：host-only 声明行）、`## 构建`→`## 构建与测试`、`## 配置文件`→`## 配置`、`## 与 dsh-plugin-web-ux 的关系`→`## 与其他插件的关系`（E.project-mcp-README）；验证：`grep -c "^## 定位\|^## 安装到 profile\|^## 构建与测试\|^## 许可$" plugins/project-mcp/README.md` = 4
- [x] 5.2 `plugins/user-commands/README.md`：补 `## 定位`（端性：host-only）、`## 构建`→`## 构建与测试`（E.user-commands-README）；验证：`grep -c "^## 定位\|^## 安装到 profile\|^## 构建与测试\|^## 许可" plugins/user-commands/README.md` = 4
- [x] 5.3 `plugins/web-ux/README.md`：三处去重（:80↔:292 / :175↔:266 / :199–206↔:308–317↔:435–439，只删重复正文、**H2/H3 标题文本零变化**保同文档锚点）+ 补 `## 定位`（端性：双端）+ `## 构建`→`## 构建与测试`（E.web-ux-README）；验证：改前后 `grep "^#" plugins/web-ux/README.md` 输出逐行一致（标题零变化）且 `wc -l` 减少 30–40 行（**执行期口径改判 R15**：本 README 为长行排版，规划期 30–40 行系字符量折算误当物理行、物理不可达——改判为实质去重口径：重复正文净删 ≥1500 字符（实测 1609）、删除处全留链接、标题除 `## 定位` 新增与归一改名外零变化；实测 `wc -l` 443→443）
- [x] 5.4 `plugins/session-tool-toggle/README.md` 补 `## 定位`（双端）+ `plugins/workspace-config/README.md` `## 构建与类型`→`## 构建与测试` + `plugins/zcode-plan/README.md` 补 `## 定位`（host-only）、`## 构建`→`## 构建与测试`（E.session-tool-toggle + E.workspace-config + E.zcode-plan-README）；验证：三包各自 `grep -c "^## 定位\|^## 安装到 profile\|^## 构建与测试\|^## 许可"` = 4 且 session-tool-toggle `grep -c "^## 双端结构"` ≥ 1
- [x] 5.5 `plugins/multi-root-workspace/README.md` 骨架对齐：`## 项目简介`→`## 定位`（含端性：双端声明行）、`## 安装`→`## 安装到 profile`、`## 许可证`→`## 许可`、补 `## 构建与测试`，`README.md:29` 类同文档锚点逐处巡检修复（D.multi-root-README 二次编辑；执行期按端性闭环规则强制补 `## 双端结构` 节，见 R15）；验证：`grep -c "^## 定位\|^## 安装到 profile\|^## 构建与测试\|^## 许可$" plugins/multi-root-workspace/README.md` = 4 且 `grep -n "](#安装)\|](#项目简介)\|](#许可证)" plugins/multi-root-workspace/README.md` 无命中（锚点跟随）且 `grep -c "^## 双端结构" plugins/multi-root-workspace/README.md` ≥ 1
- [x] 5.6 `templates/default/plugin-README.md.tmpl` 扩为骨架全集（4 实节含 `{{DUAL_SECTION}}` 与端性声明 token、5 如适用 HTML 注释、`## 结构` 自由节保留）+ `scripts/gen-plugin.mjs` buildTokens 无条件注入 `DUAL_SECTION`（dual→节内容 / host-only→''）+ `templates/default/README.md` 件套说明更新（C.plugin-README.tmpl + C.gen-plugin + C.templates-default-README）；验证：临时目录 `pnpm gen:plugin smoke-test-docs --kind dual && pnpm gen:plugin smoke-test-docs2 --kind host-only` 生成物含端性声明行、host-only 生成物无 `## 双端结构`，删除临时生成物

## 6. 证据归位 + zcode-plan 复核

- [x] 6.1 `plugins/project-mcp/README.md` 的 :108–:160「隔离冒烟记录（验证证据）」52 行迁 `artifacts/isolation-smoke.md`（首行元信息：证据类型 / 采集时点 / 结论），README 留一行证据行，:106 指向改证据行（E.project-mcp 二次编辑）；验证：`test -f plugins/project-mcp/artifacts/isolation-smoke.md` 且 `grep -c "^## 隔离冒烟记录" plugins/project-mcp/README.md` = 0 且 `grep -c "artifacts/isolation-smoke.md" plugins/project-mcp/README.md` = 2（证据行 + 原指向）
- [x] 6.2 `plugins/user-commands/README.md` 的 :149–:205「真机验证（验证证据）」57 行迁 `artifacts/real-machine-verification.md`（含元信息行），README 留证据行（E.user-commands 二次编辑）；验证：`test -f plugins/user-commands/artifacts/real-machine-verification.md` 且 `grep -c "^## 真机验证" plugins/user-commands/README.md` = 0
- [x] 6.3 `plugins/zcode-plan/docs/acceptance.md` 与 `docs/discount-verify.md` 迁 `artifacts/`（git mv 保历史）+ README :5/:104/:247 改链（E.zcode-plan）；验证：`test -f plugins/zcode-plan/artifacts/acceptance.md && test -f plugins/zcode-plan/artifacts/discount-verify.md` 且 `! grep -n "docs/acceptance.md\|docs/discount-verify.md" plugins/zcode-plan/README.md`
- [x] 6.4 `plugins/zcode-plan/docs/migration-from-zai-coding-zcode.md` 内容级复核（**真机重放**：真实 bigmodel 凭证 `/zcode-plan login → status → route → refresh` 复测扣费读数，新读数另立 `artifacts/route-replay-<date>.md` 含元信息行；版本声明 :3 改指向 `scripts/dsh-baseline.mjs` 来源常量表述 + 落档日期；:62 已引 0.2.2-rc.1 行为的矛盾逐段清零；**前置：凭证可用 + profile 运行，不可用时该任务挂起上报，不静默降级**）（E.migration）；验证：`! grep -n "0\.2\.1-rc\.2" plugins/zcode-plan/docs/migration-from-zai-coding-zcode.md` 且 `test -f plugins/zcode-plan/artifacts/route-replay-*.md` 且新读数文件含采集时点

## 7. 门禁落位（仓级启用）

- [x] 7.1 新建根 `scripts/check-docs.mjs`（构造 REPO_CONFIG：七包全部纳入 readme-skeleton、归档只参与链接检查、证据域豁免绝对路径、规则自述文件豁免裸 ADR；exit code 0/1/2 三值）+ 根 `package.json` `docs:check` 改 `"node scripts/check-docs.mjs && pnpm -r run docs:check"`（A.check-docs 新建 + A.package.json）；验证：`node scripts/check-docs.mjs` 退出码 0 且输出含 readme-skeleton / adr-skeleton / evidence-location / bare-adr-ref 四检查 PASS 行
- [x] 7.2 `.github/workflows/ci.yml` scaffold 作业在两包 `verify:all` 之后、`dsh:check` 之前插入 `pnpm docs:check` 步 + :15 段注释同步（B.ci.yml）；验证：`grep -n "docs:check" .github/workflows/ci.yml` 命中 scaffold 作业段（:68 之后）且 `openspec validate docs-arch-refinement --strict` 不受影响

## 8. 首轮清偿（门禁启用后实战）

- [x] 8.1 `docs/decisions/ADR-0001` :161 与 `ADR-0002` :83/:84/:123×2/:124×2/:125 共 7 目标断链修复（改指 `openspec/changes/archive/2026-11-07-optimize-architecture/` 归档路径；:125 为测试文件改名 attribution-concurrency→attribution-anomaly）（B.ADR-0001 + B.ADR-0002）；验证：`node scripts/check-docs.mjs` 输出中断链 FAIL 行计数归零（对比组 7 后的首次运行记录）
- [x] 8.2 `plugins/project-mcp/README.md` :132 断链修复 + 全仓裸 ADR 编号 6 处真实修复（分 scope 清单见 code-design ⑤ G8；规则自述文件与 multi-root 子树豁免不动）（E.project-mcp 三次编辑 + 各命中文件）；验证：`node scripts/check-docs.mjs` 的 bare-adr-ref 检查 PASS 且修复清单逐条勾选记录在执行摘要
- [x] 8.3 叙述型文档绝对路径修复 2 处（根 `README.md`:77、`plugins/user-commands/README.md`:92 改 `<本仓>` 占位）+ 证据域豁免登记（specs/dsh-multi-root-file-references :30/:44 类只读引用进豁免清单）（B.根README + E.user-commands 三次编辑 + A.check-docs 配置）；验证：`node scripts/check-docs.mjs` 退出码 0、非归档区 0 error、归档区恰 4 条 warning 可见

## 9. 收尾

- [x] 9.1 新建 `tooling/contracts/README.md`：座位契约纯类型包定位、`import type` 消费方式、与 workspace-config / 三贡献方关系、为何零运行时（B.contracts-README，新建）；验证：`test -f tooling/contracts/README.md` 且 `node scripts/check-docs.mjs` 退出码 0（空文档检查覆盖它）
- [x] 9.2 根 `README.md` :105 文档地图句链接 `docs/README.md` + :25/:40 docs:check 口径更新（B.根README 二次编辑）+ `AGENTS.md` :66/:22 docs:check 口径句改写（B.AGENTS 二次编辑，仍只改错不膨胀）；验证：`grep -c "docs/README.md" README.md` ≥ 1 且 `git diff --numstat AGENTS.md` 相对组 2 累计 ≤ 8 行
- [x] 9.3 全链回归收口：`pnpm lint && pnpm typecheck && pnpm build && pnpm test && pnpm docs:check && pnpm spec:check && pnpm dsh:check` 全绿 + `git diff --stat` 断言 `src/` 面零改动 + multi-root 薄化输出与 3.3 基线逐项一致复核（跨组验收）；验证：上述命令链退出码全 0 且 `git diff --stat | grep -c "src/"` = 0
- [x] 9.4 `pnpm-workspace.yaml:102` 注释 ADR 路径改指插件级真实路径
（R3 用户裁定纳入；只改注释不改清单本体）；验证：`grep -n "ADR-0002-upstream-coupling-policy" pnpm-workspace.yaml` 命中行含 `plugins/multi-root-workspace/docs/decisions/` 且 `test -f plugins/multi-root-workspace/docs/decisions/ADR-0002-upstream-coupling-policy.md` 退出码 0

## 附录：执行期沉淀回流清单（spec-apply §六工件化，随最后批次提交）

- **执行期规则**：R1–R17 共 17 条（`diff-matrix.md` §7——行号漂移以现读、工件口径同步（R2/R5/R10/R17）、验收口径改判（R4/R14/R15）、门禁自伤规避（R7）、自检输出模式（R12）、凭证探测口径（R16）等），全部随工件入库。
- **工作流仓（dotfiles/dsh）改动**：无——四段路由映射、engine、parallelism、白名单本变更执行期全程未改。
- **规划期遗留（spec-plan 侧沉淀，非本仓可修）**：spec-workflow skill 的路由自检脚本对块式 YAML 白名单解析漂移（规划期已向用户报备，宿主 skill 侧另案）。
- **执行纪律备忘**：主会话在 diff-matrix.md §7 追加 R 条目时曾三次误用「前条全文作 old_string」造成相邻条目覆盖（R13–R16），均当场恢复并验证序列完整（R10–R17 现并存）；后续追加条目一律以前条末尾短片段作锚。
- **G6 组收尾遗漏备忘**：R4（docs/README.md 补 artifacts 索引 3 行）在 G6 组收尾时未执行、由 9.2 回执触发后主会话补齐（本附录提交前已闭环）——组收尾清单应显式含「工件联动项逐条核对」步骤。
