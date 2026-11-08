# docs-arch-refinement · 代码级蓝图（阶段 1.7）

> **角色**：代码设计线。只产出代码级蓝图（触达哪些文件、怎么改、接口与数据形状、为什么这么定），不复述需求级轻重与风险。
> **项目根**：`/home/xuqinqin/develop/person/dsh-plugins`（下文相对路径一律相对它；`HEAD = 04c3bb5`）。
> **已加载 writer skill**：`dsh-plugin-writer`（聚合层 `~/.agents/skills/dsh-plugin-writer`，主会话栈识别用户指认，加载成功）。其硬约束在本产物中的落点：§2 选型决策树（本变更不新增插件、不动形态 → 走「已有插件结构性修改」支路）、§4 必改清单第 4 项（`files` 白名单随删除文件同步）、§7 反例 F2（漏文件 = git 安装缺件）、生命周期第 6–7 步（门禁与装载验证分层）。**未加载**其它 writer skill。
> **输入**：`line-a.md`(182) / `line-b.md`(173) / `diff-matrix.md`(139，含 §5 D-1~D-14 与轮 4 规范草案定稿)。§5 的 14 条与轮 4 节清单是**已定约束**，本产物逐条遵循；**未推翻任何收敛结论**，唯一上浮点见「待决问题 Q1」。
> **不变量**：本设计零插件运行时行为与产物字节变化（D-14）——`plugins/*/src/**` 与 `lib/**` 零触达，`pnpm dsh:check` 的 B1–B5 面零变化。

---

## ① 触达面清单

按「仓/子包 → 文件」组织。动作 = 新建 / 改 / 删。**未列入本表的一律不动**（边界见 ①.F 节）。

### A. 根仓 · 门禁脚本（`scripts/`）

| 路径 | 动作 | 改动意图与关键改动点 |
| --- | --- | --- |
| `scripts/lib/doc-checks.mjs` | **新建** | 共享检查内核（D-6）：把 multi-root 现有 10 检查参数化重写为 `runDocChecks(config)`；**打印层与退出计数由内核持有**（薄入口不打印，见 ④D-B3），新增 4 检查（`readme-skeleton` / `adr-skeleton` / `evidence-location` / `bare-adr-ref`）。单文件约 600–700 行 |
| `scripts/lib/doc-checks.d.mts` | **新建** | 与 `scripts/lib/artifacts.d.mts`、`scripts/dsh-baseline.d.mts` 同先例的类型声明（JSDoc + `.d.mts` 双轨是本仓既有形状），导出 `DocCheckConfig` / `CheckId` / `runDocChecks` 签名 |
| `scripts/lib/doc-checks.selftest.mjs` | **新建** | 负测试（O10 硬验收）：`runSelfTest()` 把 5 类缺陷样本**运行时写入 `fs.mkdtempSync(os.tmpdir())`** 并对内核断言逐项 FAIL、对合规样本断言 PASS（④D-B10 + D-B11）。**样本不入库** |
| `scripts/check-docs.mjs` | **新建** | 仓级薄入口：构造 `REPO_CONFIG` 并调用内核；**只负责 exit code**（0/1/2 三值，与 `dsh-check.mjs` 同约定） |
| `package.json` | 改 | `docs:check` 字符串：`"pnpm -r run docs:check"` → `"node scripts/check-docs.mjs && pnpm -r run docs:check"`（D-6 字面，仓级先行、递归兜底） |

### B. 根仓 · 文档与规范面

| 路径 | 动作 | 改动意图与关键改动点 |
| --- | --- | --- |
| `docs/decisions/ADR-0003-doc-system-layers-and-gates.md` | **新建** | 规范本体（D-3）：分层 ownership 表（入口/参考/证据/规格/决策/评估）、README 软骨架 4+5 节定义、证据两级制与证据行文法、门禁 6 查项与「规则在文档、脚本只机械执行」分工、`openspec` 工件面一句边界声明（N1）、索引页「只链接不复制摘要」纪律（N2）。按 `docs/decisions/README.md:35` 的七节骨架写，**自身先过 `adr-skeleton`** |
| `docs/README.md` | **新建** | 仓级文档索引页（D-3/O7）：只链接（README / AGENTS / docs 三区 / openspec / 各插件 README / artifacts 索引），不复制任何摘要 |
| `docs/decisions/README.md` | 改 | 索引表 +1 行（ADR-0003）；纪律段（:34–:38）与「两套编号」段（:5–:19）**一字不改** |
| `docs/decisions/ADR-0001-shared-build-and-source-kits.md` | 改 | :161 断链改指归档路径（见 ⑤ G8 精确清单）。`## 修订记录` 段保留——它是 `adr-skeleton` 必须「子集而非等集」的**反例本体**（④D-B8） |
| `docs/decisions/ADR-0002-attribution-kernel.md` | 改 | :83/:84/:123(2)/:124(2)/:125 共 6 处断链（⑤ G8 精确清单） |
| `docs/assessments/docs-unification.md` | **新建** | T0 评估档案（O13，镜像 `multi-root-build-unification.md` 的 4 节骨架）：现状差异清单 / 不施工项（双语推广、multi-root 体系收敛、豁免清单生成化）/ 通过标准（非归档区 0 error、骨架门禁绿）/ 结论；附录落 D-12 的豁免清单盘点 |
| `docs/assessments/README.md` | 改 | 索引表 +1 行 |
| `AGENTS.md` | 改 | ≤4 行 diff：+2 行链接（ADR-0003 / `docs/README.md`）；:66 与 :22 的 `docs:check` 口径句改写（**改错而不是膨胀**，⑤ G9 有行数断言） |
| `README.md` | 改 | :25 / :40 两处 `docs:check` 口径；:77 绝对路径改 `<本仓>/plugins/<name>`；:105 文档地图句 → 链接 `docs/README.md` |
| `openspec/specs/dsh-plugin-toolchain/spec.md` | 改 | 末尾（:203 后）追加 **1 条 requirement**（门禁机器行为，D-3/line-b §3.2 混合落法）+ 4–6 条 Scenario（③.6 给形状） |
| `tooling/contracts/README.md` | **新建** | 四包唯一缺位补位（O6）：座位契约纯类型包定位、`import type` 消费方式、与 workspace-config / 三贡献方关系、为何零运行时 |
| `.github/workflows/ci.yml` | 改 | `scaffold` 作业（:68 起）在两包 `verify:all` 之后、`dsh:check` 之前插入 `pnpm docs:check` 步（D-10/O9 落点）；:15 段注释同步 |

### C. 模板与生成器（`templates/` + `scripts/gen-plugin.mjs`）

| 路径 | 动作 | 改动意图与关键改动点 |
| --- | --- | --- |
| `templates/default/plugin-README.md.tmpl` | 改 | 4 节（结构/开发/安装）→ 骨架全集：`## 定位`（含 `端性：host-only\|双端` 声明行）、`## 安装到 profile`、`## 构建与测试`、`## 许可` 四个**实节** + 5 类「如适用」以 **HTML 注释**承载（④D-B9）+ `## 结构` 保留为自由节；新增 `{{DUAL_SECTION}}` 占位 |
| `scripts/gen-plugin.mjs` | 改 | `buildTokens()`（:397 区间）新增 `DUAL_SECTION` 取值：dual → `## 双端结构\n\n…`，host-only → `''`；`structureTree()`（:333）与 :354 不改（件套数不变，见 ④D-B9 被否方案） |
| `templates/default/README.md` | 改 | 件套表 `plugin-README.md.tmpl` 行说明改为「骨架全集（4 必备 + 5 如适用注释 + 1 自由节）」；「两条硬约束」第 2 条追加一句「生成物须过 `pnpm docs:check`」 |
| `templates/README.md` | 不改 | 12 条目件套数不变（未新增文件，④D-B9），通用约定无变化 |

### D. `plugins/multi-root-workspace`（fork 包，其 `AGENTS.md:5-8` 要求改动前先读 docs）

| 路径 | 动作 | 改动意图与关键改动点 |
| --- | --- | --- |
| `scripts/check-docs.mjs` | 改（薄化） | 318 行 → 约 30 行：构造包内 `PKG_CONFIG` 调内核 + 自检 + exit code。**检查集合恰为原 10 项减 3 项双语**，7 项输出逐项一致（⑤ G3/G4 双验收） |
| `README.en.md` 等 **10 份 `.en.md`（781 行）** | 删 | D-2 单语化。清单：`README.en.md`(239)、`docs/README.en.md`、`docs/{architecture,decisions,development,reference,troubleshooting}/README.en.md`(6)、`.agent/README.en.md`、`.agent/note/README.en.md`、`.agent/note/dsh-compat-contract.en.md` |
| `package.json` | 改 | `files`（:63 起）删 `"README.en.md"` 行（:69）——**漏改 = 清单撒谎**（writer skill §4 第 4 项 / F2 同族） |
| `README.md` | 改 | 删 :3 语言导航行；删 fork 上游叙述（:17 整段、:21 的「本仓库是本地 fork」句、:82 上游 tgz 注释、:111 上游源码命令、:118 上游 clone）；**保留** DSH 上游语义（:7、:209「不修改上游仓库（deepseek-harness）」） |
| `AGENTS.md` | 改 | 删 `## Bilingual Documentation` 整节（:71–:86）；:90 `local fork…baseline f149fa4…M1–M3/H1–H4` 段清零改写为**纯现状事实**（**不含任何来历句**——轮 5 裁定②：上游相关描述一句不留，本行原「留一句 fork 事实」口径已废）；十一条不变量与其后 DSH 兼容正文**不动** |
| `.agent/skills/documentation/SKILL.md` | 改 | §4 中英文文档规则（:62–:87）删除；§5 README Rules（:95–:103）去掉成对与导航要求；:140 特殊文件名去掉 `README.en.md`；§11 清单第 4 项（:170）删除；§12（:180–:186）检查范围描述改写为「7 项 + 共享内核」 |
| `.agent/note/README.md` | 改 | :39 `foo.en.md` 说明、:46 `upstream-integration.en.md` 举例、:51 成对创建规则三处删除/改写 |
| `docs/README.md` | 改 | :5 nav 行删；「## 语言」段（:48–:57）改为「中文唯一」一句 |
| `docs/{architecture,decisions,development,reference,troubleshooting}/README.md` | 改 | 各删 :3 `English: [README.en.md]` 导航行（5 文件，规则同 D-2） |
| `docs/decisions/ADR-0014-fork-divergence-and-single-language.md` | **新建** | 插件级 ADR（D-2 要求）：单语化（删 10 份 .en.md、双语规则退役）+ 终止 fork 上游同步（叙述面清理、上游事实留一句、git 历史不动）+ `docs:check` 薄化为 workspace 共享内核。**一篇覆盖三事**（同属「fork 定位变更」一个决策边界，④D-B12） |
| `docs/decisions/README.md` | 改 | 索引 +1 行（ADR-0014） |
| `docs/development/plugin-development-workflow.md` | 改 | §6/§7 与表格中「已随 fork 移除」类叙述（:10/:12/:186/:189–:195）收敛为一句现状事实；凡「上游 = DSH」的语义**全部保留** |

### E. 六个软插件（`plugins/{project-mcp,user-commands,web-ux,session-tool-toggle,workspace-config,zcode-plan}`）

| 路径 | 动作 | 改动意图与关键改动点 |
| --- | --- | --- |
| `plugins/project-mcp/README.md` | 改 | :108–:160「隔离冒烟记录（验证证据）」52 行 → 迁 `artifacts/isolation-smoke.md`，README 留 1 行证据行；:106 「（冒烟⑦实测，见下节）」改指向证据行；:132 断链改指归档路径（⑤ G8）；补 `## 定位`；`## 构建`→`## 构建与测试`；`## 配置文件`→`## 配置`；`## 与 dsh-plugin-web-ux 的关系`→`## 与其他插件的关系` |
| `plugins/user-commands/README.md` | 改 | :149–:205「真机验证（验证证据）」57 行 → `artifacts/real-machine-verification.md`；:92 示例输出里的绝对路径改为 `…/person/dsh-plugins`；:198 安装路径同改；补 `## 定位`；`## 构建`→`## 构建与测试` |
| `plugins/web-ux/README.md` | 改 | 去重三处（D-8）：:80↔:292 搬家细节、:175↔:266 半失败语义、:199–:206↔:308–:317↔:435–:439 非目标三段；**只删重复正文本体，不改任何 `##` 标题文本**（8 处同文档锚点靠标题 slug，④D-B13）；补 `## 定位`；`## 构建`→`## 构建与测试` |
| `plugins/session-tool-toggle/README.md` | 改 | :127 裸 `ADR-0002` → 带路径；补 `## 定位`；其余已合规 |
| `plugins/workspace-config/README.md` | 改 | 已有 `## 定位`/`## 双端结构`/`## 安装到 profile`/`## 许可`；`## 构建与类型`→`## 构建与测试`（三名归一） |
| `plugins/zcode-plan/README.md` | 改 | :5/:104 `docs/acceptance.md` → `artifacts/acceptance.md`；:247 `docs/discount-verify.md` → `artifacts/discount-verify.md`；补 `## 定位`；`## 构建`→`## 构建与测试` |
| `plugins/zcode-plan/docs/acceptance.md` | 移动 | → `plugins/zcode-plan/artifacts/acceptance.md`（D-11：变更时点读数，属长效证据） |
| `plugins/zcode-plan/docs/discount-verify.md` | 移动 | → `plugins/zcode-plan/artifacts/discount-verify.md` |
| `plugins/zcode-plan/docs/migration-from-zai-coding-zcode.md` | 改 | **留在 `docs/`**（用户迁移指南 = 参考层）并做**内容级复核**（D-11/D4）：:3「适用 DSH 基线 `0.2.1-rc.2`」→ 指向 `scripts/dsh-baseline.mjs` 表述 + 落档日期；逐段对账 :62 已引用的 `0.2.2-rc.1` 行为（同一文件内自相矛盾，④D-B14 反例） |
| `plugins/{project-mcp,user-commands,zcode-plan}/artifacts/` | **新建目录** | 三处证据位落地；每份文件首行写明「证据类型 / 采集时点 / 结论」（文件内容为搬迁原文，除 zcode-plan 迁移指南外**零改写**） |

### F. 显式不触达（边界）

`openspec/changes/archive/**`（只读，D-7）｜ `openspec/changes/<active>` 新建提案除外 ｜ `openspec/specs/` 除 toolchain 一条 requirement 外不动 ｜ `tooling/{build-kit,host-kit,test-kit}/README.md`（D-13 自洽不改造）｜ `plugins/multi-root-workspace/docs/` 正文（除上表列出的 8 份 README/索引与新增 ADR-0014）｜ 任何 `src/**`、`lib/**`、`tsconfig*`、`build.mjs`、`.oxlintrc.json`、`pnpm-workspace.yaml`、`scripts/check-{architecture,artifacts,dsh-baseline}.mjs`、`scripts/dsh-check.mjs`。

---

## ② 证据锚（每个触达模块 ≥1 条代码事实）

**新建文件（无既有代码事实，锚点 = 其落位/形状所依据的既有事实）**

- `scripts/lib/doc-checks.mjs` —— **新建**。落位依据 `scripts/lib/artifacts.mjs`（既有共享内核）与 `scripts/lib/artifacts.d.mts`（类型声明双轨）；内容依据 `plugins/multi-root-workspace/scripts/check-docs.mjs` 全文（搬运源）。
- `scripts/lib/doc-checks.d.mts` —— **新建**。锚：`scripts/dsh-baseline.d.mts` 与 `scripts/lib/artifacts.d.mts` 两处同类文件（同一约定已两次成立）。
- `scripts/lib/doc-checks.selftest.mjs` —— **新建**。锚：根 `package.json` 无 `test` 脚本（`node -e "console.log(require('./package.json').scripts.test)"` → undefined），故自检不能寄居 vitest；`scripts/` 目录现无任何测试文件（`ls scripts` 全为 `.mjs`），自检模块是本目录第一份测试形态。
- `scripts/check-docs.mjs` —— **新建**。锚：`scripts/dsh-check.mjs:28-32`（聚合入口的 `CHECKS` 形状）与 `:52-64`（spawn + 退出码 0/1/2 约定）。
- `docs/README.md` —— **新建**。锚：`docs/` 下现只有 `assessments/` 与 `decisions/` 两个子目录各自的 README（`ls docs` 实测），仓级索引页缺位；`docs/decisions/README.md:30` 已用「链接指向兄弟区 README」的形态，索引页沿用同形态。
- `docs/decisions/ADR-0003-doc-system-layers-and-gates.md` —— **新建**。锚：`docs/decisions/README.md:35`（七节骨架）+ `:25-26`（索引行形状）。
- `docs/assessments/docs-unification.md` —— **新建**。锚：`docs/assessments/README.md:7`（四节骨架）+ `:13`（索引行形状）。
- `tooling/contracts/README.md` —— **新建**。锚：`ls tooling/*/README.md` 命中 3 份（build-kit / host-kit / test-kit），`tooling/contracts/` 为四包唯一缺位（`ls tooling/contracts` 只有 `package.json` / `src` / `tsconfig.json`）。
- `plugins/{project-mcp,user-commands,zcode-plan}/artifacts/` —— **新建目录**。锚：`plugins/web-ux/artifacts/` 与 `plugins/workspace-config/artifacts/` 两份已有先例（D-5 的形态出处）。
- `plugins/multi-root-workspace/docs/decisions/ADR-0014-fork-divergence-and-single-language.md` —— **新建**。锚：`docs/decisions/README.md:11-12`（两套编号互不干涉）+ 其 `SKILL.md:115`（ADR 创建阈值）。

**内核抽取源（A 组）**

- `plugins/multi-root-workspace/scripts/check-docs.mjs:10` — `REPO_ROOT = path.resolve(dirname(fileURLToPath(import.meta.url)), "..")`：扫描根由**入口文件的物理位置**推导，因此薄化后包内入口仍能定位包根；仓级入口用同一推导得到仓根 → 这是「扫描根参数化」的天然接缝，不需要环境变量。
- 同文件 `:12-23` — `IGNORED_DIRECTORIES`（9 项，含 `.dsh-smoke`）与 `:26-29` 四个目录角色常量（`AGENT_NOTE_DIR` / `PLANS_ACTIVE_DIR` / `PLANS_COMPLETED_DIR` / `DECISIONS_DIR`）：**9 + 4 = 13 个硬编码即参数化的全部落点**。
- 同文件 `:35` — `const ABSOLUTE_PATH_ALLOWLIST = []`，其上方 `:31-34` 注释明写「documentation that intentionally discusses path formats … can be exempted here instead of scattering special cases」→ **豁免清单机制已在源码里成文**，抽取的是既有设计而非新发明（D1 裁定的证据基础）。
- 同文件 `:54-55` — 全量 `findMarkdownFiles()` 在模块顶层执行一次（模块加载即扫盘）：参数化后必须改成**惰性 + 按 config 执行**，否则薄入口无法选择扫描根。
- 同文件 `:142` — 链接正则 `\[[^\]]*\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)`；`:151` `if (target.startsWith("#")) continue;` → **同文档锚点从不检查**，这是语义事实（④D-B13 的前提）。
- 同文件 `:176-178` — 绝对路径三条 pattern（Unix home / Windows user / `file://`），`:181` 逐条 `rel.includes(allowed)` 子串匹配 → 豁免语义 = 相对路径**子串**，与 `dsh-plugins` 仓根绝对路径 `/home/xuqinqin/...` 天然冲突，故仓级配置必须给出 `.dsh`/`.opencode` 等排除（§③.2）。
- 同文件 `:298-312` — 输出契约：`[PASS] <name>` / `[FAIL] <name>` + `file:line` + `LEVEL: message`，`errors > 0` 才 `process.exitCode = 1`（`:310-312`）。**这段打印即「输出逐项一致」的验收对象**，必须原样搬进内核。
- `scripts/lib/artifacts.mjs:1-22` — 既有共享内核先例：模块头写「**单一实现**（R9）…第四份不许再出现」，`scripts/lib/artifacts.d.mts` 是它的类型声明。新内核的落位、文件命名、`.d.mts` 双轨由此**逐条对齐**，不是新约定。
- `scripts/dsh-check.mjs:28-32` + `:52-64` — 聚合器的输出纪律「三个脚本各自收集全部失败再退出」与 `execFileSync` 顺序跑完不截断。仓级 `check-docs.mjs` 采用同一退出码约定（0/1/2），但**不并入** `dsh-check.mjs` 的 `CHECKS` 数组（D-14）。

**仓级挂点（A/B 组）**

- `package.json:22` — `"docs:check": "pnpm -r run docs:check"`：现状**只递归**，仓级无入口。
- `.github/workflows/ci.yml:60` — `run: pnpm docs:check`（verify 作业）；`:68` `scaffold:` 作业起始、`:99`/`:102` 两包 `verify:all`、`:15` 注释自述「它只跑 multi-root 的双语文档一致性检查」。→ scaffold 补步的插入点 = `:102` 之后、末步 `dsh:check` 之前；`:15` 注释必须同批改（否则注释与行为打架）。
- `AGENTS.md:66`、`README.md:40` — 同一句口径副本「（仅 multi-root-workspace 实现该脚本）」。**两处副本 + ci.yml:15 = 3 份**，是 R-3「口径多副本必漂移」的在册样本，必须同批改。

**规范载体（B 组）**

- `docs/decisions/README.md:35` — 「每篇 MUST 含：Status / Date / Context / Decision / Alternatives Considered / Consequences / Related Documents」→ 门禁 `adr-skeleton` 的规则原文，**脚本只机械执行它**。
- `docs/decisions/README.md:14` — 「因此裸写「ADR-0009」是有歧义的…引用 MUST 写成带路径的形式」→ `bare-adr-ref` 的规则原文；同段落本身即**豁免对象**（④D-B6）。
- `docs/decisions/ADR-0001-shared-build-and-source-kits.md:110`（`## 修订记录`）与 `:157`（`## Related Documents`）— 该 ADR 有 **8 个 H2**，且 `Related Documents` 在「修订记录」之后。→ `adr-skeleton` 必须「子集存在性 + 不查顺序」（④D-B9 反例本体）。
- `docs/assessments/README.md:7` — 「每份档案的固定骨架：现状差异清单 / 不迁移理由 / 迁移通过标准 / 结论」；`:13` 索引行形状。新档案逐字对齐。
- `docs/assessments/multi-root-build-unification.md:9`、`:48`、`:113` — 三处裸 `ADR-0001`（无路径）→ `bare-adr-ref` 的**真实修复点**（④D-B6 的量化结论）。
- `openspec/specs/dsh-plugin-toolchain/spec.md:177`–`:203` — 既有 requirement 形状 `### Requirement: <中文标题>` + 正文 SHALL/MUST + `#### Scenario: <中文>` + `- **WHEN**` / `- **THEN**` 列表；末条 requirement 为「结构评估档案」（`:191`）。新增 requirement 追加在 `:203` 之后。

**模板与生成器（C 组）**

- `templates/default/plugin-README.md.tmpl:15`/`:21`/`:35` — 现有三节 `## 结构` / `## 开发` / `## 安装到 profile`（缺 `## 定位` 与 `## 许可`，`## 开发` 名不符骨架）→ 第四节扩为骨架全集的具体落点。
- `templates/default/template.json:13` — `{ "template": "plugin-README.md.tmpl", "output": "README.md" }`（12 条目中的最后一条）：**只改素材内容即可，件套数不变**（④D-B9 被否方案依赖此事实）。
- `scripts/gen-plugin.mjs:397` — `STRUCTURE_TREE: structureTree(dual)` 所在 `buildTokens()`；`structureTree()`（`:333`）生成的树末行 `'README.md                     本文件'`（`:354`）。新占位符必须在此注入，否则渲染后残留 `{{DUAL_SECTION}}` 字面量。
- `scripts/gen-plugin.mjs:318-321` — `render()` 为**逐 token 字面替换**：未提供的 token 不报错、原样残留 → 生成器侧无 fail-closed 保护，故 `DUAL_SECTION` 必须**无条件**进 `buildTokens()`（host-only 给空串）。
- `templates/default/README.md:27` — 件套表 `plugin-README.md.tmpl` 行现述「插件 README 骨架（显式占位；模板自述不复用为插件 README）」；同文末「两条硬约束」第 2 条是「生成物开箱即绿」→ 文档面开箱承诺的成文位置（C9/D-10 的验收锚）。

**六个软插件（E 组）**

- `plugins/project-mcp/README.md:108` — `## 隔离冒烟记录（验证证据）`，至 `:160` 共 52 行；`:106` 句尾「（冒烟⑦实测，见下节）」是**指向被迁走内容的内联引用**（迁移后必须改口，否则成孤儿指引）；`:132` 断链 `../../openspec/changes/project-mcp-name-resource-isolation/artifacts/smoke-record.md`。
- `plugins/user-commands/README.md:149` — `## 真机验证（验证证据）`，至 `:205` 共 57 行（含 `### 线上宿主（web profile）确认` 子节）；`:92` 内联绝对路径 `/home/xuqinqin/develop/person/dsh-plugins`；`:138`/`:198` 同类路径（在代码围栏内）。
- `plugins/web-ux/README.md:21`/`:208`/`:319` 三个能力章合计 187+111 行（占 443 行的 67%，D-8 复算数据）；重复三处 `:80`↔`:292`、`:175`↔`:266`、`:199-206`↔`:308-317`↔`:435-439`（行号取自 diff-matrix §2 复算，本轮抽检一致）；同文档锚点 8 处（实测：`:201` `#会话管理`、`:244`/`:265` `#恢复语义`、`:295`/`:407`/`:417` `#归档目录与手工找回`、`:299` `#拒绝码`、`:439` `#非目标本能力` 与 `#边界与已知限制`）→ 去重不得改标题。
- `plugins/session-tool-toggle/README.md:127` — 裸 `ADR-0002：@deepseek-ai/dsh* 零修改`（跨体系裸引用），`bare-adr-ref` 的修复点。
- `plugins/workspace-config/README.md:119` — `## 构建与类型`（三名归一的第三个变体；另两个实例是 `plugins/project-mcp/README.md:161` `## 构建`、`plugins/session-tool-toggle/README.md:157` `## 构建与测试`）。
- `plugins/zcode-plan/README.md:5`/`:104`/`:247` — 三处指向 `docs/acceptance.md`、`docs/discount-verify.md` 的链接（迁移后必改）；`plugins/zcode-plan/docs/migration-from-zai-coding-zcode.md:3` — 「适用 DSH 基线 `0.2.1-rc.2`」而 `:62` 已写 `0.2.2-rc.1` 行为（同文档内自相矛盾，R-5 的实证）。
- 既有证据位形态：`plugins/web-ux/artifacts/{command-feedback-smoke,session-manager-smoke}.md`、`plugins/workspace-config/artifacts/workspace-config-smoke.md`（三份，是 `artifacts/` 的仓内先例，D-5 的形态依据）。

**multi-root 单语化（D 组）**

```
- 10 份 `.en.md` 合计 **781 行**（`find | wc -l` 实测）；非 `.en.md` 文件中指向它们的**导航行共 10 处**（执行期实测较本盘点 9 处多 1：`.agent/note/dsh-compat-contract.md:3` 漏盘，已随执行补清），形式仅两种：`English: [README.en.md](./README.en.md)`（9 处，如 `docs/architecture/README.md:3`）与 `中文 | [English](./README.en.md)`（1 处，`README.md:3`）→ 删除面是**有限且可枚举**的。
```

- `plugins/multi-root-workspace/package.json:69` — `"README.en.md"` 在 `files` 白名单内 → 删文件必同批删此行（writer skill §4 第 4 项）。
- `plugins/multi-root-workspace/AGENTS.md:71`–`:86` — `## Bilingual Documentation` 整节（含「if the two versions ever conflict, the Chinese version wins」）；`:90` — `This checkout is a **local fork** vendored…upstream is cherrchen/…baseline f149fa4…`（fork 叙述的唯一英文权威段）；`:88` 与 `:108`/`:111` 中的 `upstream` 指 **DSH 上游**（保留）。
- `plugins/multi-root-workspace/.agent/skills/documentation/SKILL.md:13` — 「相关文档规则的总纲见根目录 [`AGENTS.md`](../../../AGENTS.md)」（指向包外，证明其规则体系与仓根的耦合是**既定事实**，为新入口共享内核提供同构先例）；`:180` — 「`docs:check` 是稳定的逻辑入口，其内部实现（当前为 `node scripts/check-docs.mjs`）属于实现细节，不要直接依赖脚本内部文件名」→ **薄化在语义上被其自身规范允许**（契约是 `docs:check`，不是文件名）。
- `plugins/multi-root-workspace/docs/README.md:5`（nav 行）与 `:48`–`:57`（「## 语言」段，重述成对与中文为准规则）→ 单语化的叙述面第二处。
- 仓级 `docs/decisions/README.md:11-12` — 两套编号的表：「仓级 ADR 约束整个 workspace」「插件级 ADR 约束 multi-root 内核」→ `ADR-0014` 属插件级、编号与仓级 `ADR-0003` **互不干涉**（④D-B12）。

**fork 上游叙述（D 组，精确清单）**

- `plugins/multi-root-workspace/README.md:17`（fork 段整段）、`:21`（「本仓库是**本地 fork**」句）、`:82`（上游 tgz URL 注释）、`:111`（「想跑**上游**源码」）、`:118`（`git clone …cherrchen…`）→ 5 处；`README.en.md` 同构 5 处（随文件删除消失）。
- 保留面：`README.md:7`/`:209`、`docs/README.md:19`、`docs/architecture/multi-root-workspace.md:4`、`docs/development/plugin-development-workflow.md:25` 等的「上游 = DSH / deepseek-harness」语义**全部保留**（④D-B15 的反例：按「上游」二字批量替换会抹掉这些承重语义）。

---

## ③ 接口与数据形状

### ③.1 共享内核对外接口（`scripts/lib/doc-checks.mjs`）

```js
// 导出面（doc-checks.d.mts 同形）
export const CHECK_IDS = /** @type {const} */ ([
  'readme-pairs', 'agent-note-pairs', 'wrong-english-suffix', 'readme-navigation',
  'markdown-links', 'absolute-paths', 'agent-note-filenames', 'plan-conflicts',
  'adr-names', 'empty-documents',
  'readme-skeleton', 'adr-skeleton', 'evidence-location', 'bare-adr-ref',
])

/**
 * 运行一组文档检查。**打印由内核负责**，返回值只供入口决定退出码。
 * @param {DocCheckConfig} config
 * @returns {{ errors: number, warnings: number, results: CheckResult[] }}
 */
export function runDocChecks(config) {}

/** 负测试：临时目录造 6 个样本（5 缺陷 + 1 合规），断言逐项 FAIL / 全 PASS。 */
export function runSelfTest() {}   // 在 doc-checks.selftest.mjs
```

```ts
// 数据形状（JSDoc typedef → d.mts）
type CheckId = /* CHECK_IDS 的并集 */

interface DocCheckConfig {
  root: string                        // 扫描根绝对路径（由入口按 import.meta.url 推导，不用环境变量）
  label: string                       // 'repo' | 'multi-root'，只用于错误提示里的入口标识
  checks: Partial<Record<CheckId, boolean>>   // 缺省 false：显式开启制（防新检查静默扩散到包内入口）
  scan: {
    markdownRoots: string[]           // 相对 root；文件或目录，目录递归
    excludeDirs: string[]             // 目录**名**匹配（node_modules / .git / .dsh / .opencode / .worktrees …）
    excludePaths: string[]            // 相对路径前缀，整棵子树不扫（仓级用它排除 multi-root 子树）
    linkWarningPaths: string[]        // 相对路径前缀：该域内 links 发现记 warning（归档域，D-7）
    noScanPaths: string[]             // 相对路径前缀：除 links 外的检查一律不扫（归档域，④D-B4）
  }
  dirs: {                             // 目录角色（原 :26-29 四常量）
    agentNote?: string
    plansActive?: string
    plansCompleted?: string
    decisions?: string
  }
  rules: {
    adrNamePattern: RegExp
    scratchpadNamePattern: RegExp
    wrongEnglishSuffix: RegExp        // 单语化后仍保留：防 .en.md 残留错拼（O4）
    adrRequiredSections: string[]     // ['Status','Date','Context','Decision','Alternatives Considered','Consequences','Related Documents']
    readmeRequiredSections: string[]  // ['定位','安装到 profile','构建与测试','许可']
    readmeOptionalSections: string[]  // ['配置','双端结构','已知限制','排障','非目标','与其他插件的关系']
    readmeEndness: { line: RegExp, values: ['host-only','双端'], dualSection: '双端结构' }
    evidenceSectionPattern: RegExp    // /^(验证证据|冒烟记录|验收记录|真机验证)$/
    evidenceLinePattern: RegExp       // /^验证证据：\[[^\]]+\]\((?:\.\.\/)?artifacts\/[^)]+\.md\)——结论：.+$/
    evidenceDirName: string           // 'artifacts'
    pluginPackages: { dir: string, exclude: string[] }   // { dir:'plugins', exclude:[] }（轮 5 裁定⑤：七包统一，exclude 空集）
  }
  exemptions: {
    absolutePaths: string[]           // 相对路径**子串**（沿用 :181 语义）
    bareAdrRefs: string[]             // 相对路径**精确**匹配（规则自述文件，④D-B6）
  }
  selfTest?: boolean                  // 缺省 true；false 仅供调试
}
```

`CheckResult = { id: CheckId, name: string, issues: Array<{ level:'error'|'warning', check:string, message:string, file?:string, line?:number }> }`。

**检查 id ↔ 显示名对照表**（显示名逐字取自 `check-docs.mjs` 现状，**parity 的硬契约**，不许改写）：

| id | 显示名（原样） | multi-root 入口 | 仓级入口 | 判定要点 |
| --- | --- | --- | --- | --- |
| `readme-pairs` | `README bilingual pairs` | 退役（D-2） | 退役 | 原 :70-83 |
| `agent-note-pairs` | `Agent note bilingual pairs` | 退役 | 退役 | 原 :86-102 |
| `wrong-english-suffix` | `English document suffixes` | **开** | **开** | 原 :105-116 |
| `readme-navigation` | `README language navigation` | 退役 | 退役 | 原 :119-137 |
| `markdown-links` | `Markdown local links` | **开** | **开** | 原 :140-170 + `linkWarningPaths` |
| `absolute-paths` | `Absolute paths` | **开** | **开** | 原 :173-195 + 豁免 + `noScanPaths` |
| `agent-note-filenames` | `Agent note filenames` | **开** | 关（无 `.agent/note` 域） | 原 :198-211 |
| `plan-conflicts` | `Plan lifecycle` | **开**（保输出一致） | 关（仓根无 `docs/plans`） | 原 :214-231 |
| `adr-names` | `ADR naming` | **开** | **开** | 原 :234-260 |
| `empty-documents` | `Empty documents` | **开** | **开** | 原 :263-272 |
| `readme-skeleton` | `Plugin README skeleton` | 关 | **开** | 4 必备节 + 端性声明 + 如适用节非空 + 双端闭环 |
| `adr-skeleton` | `ADR section skeleton` | 关（保 parity） | **开** | 7 节**子集**存在性、不查顺序 |
| `evidence-location` | `Verification evidence location` | 关 | **开** | 证据节禁入 README + 证据行文法与目标位 |
| `bare-adr-ref` | `Bare ADR references` | 关 | **开** | 裸 `ADR-\d{4}` 非路径形式；豁免 2 文件 + 自标题 |

### ③.2 仓级入口 `scripts/check-docs.mjs`（调用形态）

```js
#!/usr/bin/env node
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runDocChecks } from './lib/doc-checks.mjs'
import { runSelfTest } from './lib/doc-checks.selftest.mjs'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** 仓级配置：骨架检查取包面 = 七包（rules.pluginPackages，exclude 空集，R5）；markdown 扫描子树
 *  排除 multi-root（scan.excludePaths，④D-B2 双入口）；openspec/changes/** 入 scan.noScanPaths
 *  （D-B6/N1 裸 ADR 排除口径；链接检查不受 noScanPaths 影响，R8） */
const REPO_CONFIG = { root: REPO_ROOT, label: 'repo', checks: { /* 4 必 + 4 新，见 ③.1 表 */ },
  scan: { noScanPaths: ['openspec/changes'], excludePaths: ['plugins/multi-root-workspace'] } /* 其余旋钮见 ③.1 */ }

// 用法：--help → 0；未知参数 → 2（与 dsh-check.mjs 同约定）
if (!runSelfTest()) process.exit(1)
const { errors } = runDocChecks(REPO_CONFIG)
process.exitCode = errors > 0 ? 1 : 0
```

`scan` 取值（仓级）：

```js
scan: {
  markdownRoots: ['README.md', 'AGENTS.md', 'docs', 'tooling', 'templates', 'plugins', 'openspec'],
  excludeDirs: ['.git','node_modules','dist','build','coverage','.next','out','.dsh','.opencode','.worktrees','.dsh-smoke'],
  excludePaths: ['plugins/multi-root-workspace'],          // 子树由包内入口负责
  linkWarningPaths: ['openspec/changes/archive/'],        // 归档内断链 = warning（D-7 字面）
  noScanPaths: ['openspec/changes/archive/', 'plugins/*/artifacts/',
                'openspec/changes/archive/**/artifacts/'],// 除 links 外不扫（④D-B4/D-B5）
}
```

> `noScanPaths` 支持单层 `*` 段（`plugins/*/artifacts/`），实现为「按 `/` 切段后逐段比对，`*` 匹配任意一段」，不引入 glob 依赖（仓内脚本零依赖是既有事实，`dsh-check.mjs` 与 `check-architecture.mjs` 均只 import `node:*`）。

### ③.3 multi-root 薄入口（`plugins/multi-root-workspace/scripts/check-docs.mjs`）

```js
#!/usr/bin/env node
// 薄化：检查实现在 workspace 根 scripts/lib/doc-checks.mjs（单实现，防双写漂移）。
// 本包只声明：扫描根 = 包根、目录角色 = 本包约定、检查集合 = 原 10 项（G3 时点十项全开，含双语三项；
// 组 4 任务 4.7 同批退役双语三项后为 7 项，PKG_CONFIG 随该任务同批改）。
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runDocChecks } from '../../../scripts/lib/doc-checks.mjs'
import { runSelfTest } from '../../../scripts/lib/doc-checks.selftest.mjs'

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PKG_CONFIG = {
  root: PKG_ROOT, label: 'multi-root',
  checks: { /* G3 时点：10 项全开（readme-pairs / agent-note-pairs / wrong-english-suffix / readme-navigation /
              markdown-links / absolute-paths / agent-note-filenames / plan-conflicts / adr-names / empty-documents）；
              4.7 退役双语三项后为 7 项 */ },
  scan: { markdownRoots: ['.'], excludeDirs: [/* 8 项原样（.git,node_modules,dist,build,coverage,.next,out,.dsh-smoke） */], excludePaths: [],
          linkWarningPaths: [], noScanPaths: [] },
  dirs: { agentNote: '.agent/note', plansActive: 'docs/plans/active',
          plansCompleted: 'docs/plans/completed', decisions: 'docs/decisions' },
  rules: { /* 与本包约定一致；readme*/adr* 规则在此不生效 */ },
  exemptions: { absolutePaths: [], bareAdrRefs: [] },
}
if (!runSelfTest()) process.exit(1)   // 自检静默模式接线（R12）：通过时零输出保 parity，失败时打印诊断并 exit 1
const { errors } = runDocChecks(PKG_CONFIG)
process.exitCode = errors > 0 ? 1 : 0
```

**跨包相对 import 的合法性论证**：`plugins/multi-root-workspace/package.json:63-71` 的 `files` 不含 `scripts/`，安装形态下薄入口与其 import 目标都不存在 → 无运行时影响；AR1–AR8 不约束 `scripts/`（`check-architecture.mjs:42-46` 的扫描根只有 `plugins/`、`tooling/`）；其自身规范已把契约钉在 `docs:check` 这个**脚本名**上而非文件名（`SKILL.md:180`）。

### ③.4 `package.json` 挂点串

```jsonc
// 根 package.json（:22）
"docs:check": "node scripts/check-docs.mjs && pnpm -r run docs:check"

// multi-root package.json（:77，不改）
"docs:check": "node scripts/check-docs.mjs"      // 包内（相对包根的 scripts/check-docs.mjs）
```

语义：仓级先行（六个软插件 + 仓级面）→ 递归兜底（当前只有 multi-root 实现该脚本）。CI 步骤名与位置不变（`.github/workflows/ci.yml:60`），scaffold 作业新增一步（`:102` 后）。

### ③.5 README 骨架文法（门禁判定的精确形状）

```markdown
## 定位                                  ← 必备；正文必须含一行 `端性：host-only` 或 `端性：双端`
## 配置                                  ← 如适用：存在即须有非空白正文
## 双端结构                              ← 端性=双端 时**必备**；host-only 时不得出现（闭环）
## 安装到 profile                        ← 必备
## 构建与测试                            ← 必备（归一「构建」「构建与类型」两变体）
## 已知限制 / ## 排障                    ← 如适用；二者任一存在即可
## 非目标                                ← 如适用
## 与其他插件的关系                      ← 如适用（归一「与 dsh-plugin-web-ux 的关系」）
## <自由节…>                             ← 不限、不查
## 许可                                  ← 必备（归一「许可证」）
验证证据：[标题](artifacts/xxx.md)——结论：<一句话>    ← 证据行：全角冒号 + 破折号，目标必须在 <pkg>/artifacts/ 且文件存在
```

判定细则（全部机械可判）：
1. 必备节按**标题文本精确**匹配（去首尾空白、不含层级前缀），不查顺序与位置。
2. 「如适用」节：存在 → 正文去空白后长度 > 0（防空壳节，R1 对冲）；不存在 → 不报。
3. `端性` 声明行缺失或取值不在 `{host-only, 双端}` → error；声明 `双端` 而无 `## 双端结构` → error；声明 `host-only` 却有 `## 双端结构` → error（防复制粘贴残留）。
4. 标题命中 `evidenceSectionPattern` 的 H2 → error「证据不得内嵌 README」。
5. 证据行：格式不符 → error；目标不在 `artifacts/` 下或文件不存在 → error。
6. 门禁范围：`plugins/*/README.md` 七包全部纳入——`pluginPackages.exclude` 为空集（轮 5 用户裁定⑤推翻 D-B7 六包范围；multi-root 骨架对齐由 G5.5 施工）。
7. 模板生成的注释行 `<!-- 如适用：… -->` 不构成 `##` 标题 → 不触发任何判定（④D-B9）。

### ③.6 spec 增补形状（`openspec/specs/dsh-plugin-toolchain/spec.md` 末尾）

```markdown
### Requirement: 文档件套与文档门禁

仓级 SHALL 以 ADR-0003 承载文档分层与骨架决策，以 `docs/README.md` 承载索引（只链接不复制摘要）；
`scripts/lib/doc-checks.mjs` MUST 是唯一的文档检查实现，`scripts/check-docs.mjs`（全仓）与
`plugins/multi-root-workspace/scripts/check-docs.mjs`（包内）MUST 只是薄入口；
根 `docs:check` MUST 为 `node scripts/check-docs.mjs && pnpm -r run docs:check`，MUST NOT 并入 `dsh:check`；
门禁 MUST 只判可机械判定项（必备节存在性 / 内链有效性 / 证据位置 / 禁项 / ADR 骨架），MUST NOT 判节序与文案语义；
门禁 MUST 自带走时自检（5 类缺陷样本逐项 FAIL + 合规样本 PASS），MUST NOT 依赖人工演练。

#### Scenario: 新插件文档开箱合规
- **WHEN** `pnpm gen:plugin <name> --kind host-only|dual` 生成的 README 进入 `plugins/`
- **THEN** 仓级 `docs:check` 直接通过（4 必备节齐全、无证据节、端性声明与实际形态一致）

#### Scenario: 双实现漂移被拒
- **WHEN** 有人在任一入口重写检查逻辑而非消费 `scripts/lib/doc-checks.mjs`
- **THEN** 评审以本 requirement 拒收；`runSelfTest` 只覆盖内核，入口不得包含检查实现

#### Scenario: 归档域不阻塞
- **WHEN** `openspec/changes/archive/` 内存在断链
- **THEN** 门禁只报 warning 且 exit 0；非归档区同类问题 exit 1

#### Scenario: 单语化残留被拦
- **WHEN** 仓内出现 `.en.md` 文件或 `(_en|.eng|.english|-en).md` 错拼后缀
- **THEN** `wrong-english-suffix` / `markdown-links` 使门禁失败

#### Scenario: 骨架缺失被拦
- **WHEN** 某软插件 README 缺 `## 定位`，或声明 `端性：双端` 却无 `## 双端结构`
- **THEN** `readme-skeleton` 失败并点名文件与缺失节
```

### ③.7 ADR-0003 骨架（按其自身规范 `docs/decisions/README.md:35` 与该文件 `adr-skeleton` 检查）

`## Status`（Accepted 2026-11-07）/ `## Date` / `## Context`（三体制并存的实证 + 受众排序 O2：agent 第一受众、检索成本与误读率即门禁收益面）/ `## Decision`（分层表 + 4 必备 5 如适用节清单 + 证据两级制与证据行文法 + 门禁 6 查项 + 两处边界声明 N1/N2）/ `## Alternatives Considered`（强统一 12 节、纯 spec 载体、README 内嵌证据、直接上移 multi-root 脚本）/ `## Consequences`（含「multi-root 骨架是否纳入」的取值与改动成本）/ `## Related Documents`（ADR-0001/0002 带路径、`docs/README.md`、toolchain spec、`docs/assessments/docs-unification.md`）。

---

## ④ 决策记录

### D-B0 栈识别：`dsh-plugin-writer`（用户指认），不做其它 writer skill 的适配

**结论**：本仓是 pnpm workspace 的 TypeScript DSH 插件仓，变更触达插件仓**工程面**（门禁脚本 Node ESM、模板素材、包结构 `package.json#files`、CI 作业），唯一适用 = `dsh-plugin-writer`。
**证据**：本仓无 Java 源（无 `pom.xml`/`build.gradle`/`src/main/java`）、无 Vue/Nuxt（无 `nuxt.config.*`/`app.vue`/`pages/`），七个插件清单入口均为 `cordis.patch.yml` + `dsh.bundle.patch`（`AGENTS.md`「插件结构约定」）；自动命中面为空，故按主会话栈识别取用户指认。
**被否方案**：① 套 `spring-writer` 的 Java 分层（controller/service/mapper）——反例：本仓 `scripts/lib/` 是**脚本共享内核**而非业务分层，套进去会把 `doc-checks.mjs` 误摆成「service」。② 套 `nuxt-writer` 的页面/组件分层——反例：`templates/` 是**渲染素材目录而非包**（`templates/README.md`「目录定位」段、AR7 禁止 `templates` 进 packages），当 `pages/` 处理会破坏 fail-closed 件套清单。
**理由**：本变更 90% 触达面是「文档 + 脚本 + 模板」，正是该 skill §1 分工表的「对已有插件做结构性修改」支路。

### D-B1 内核落位 `scripts/lib/doc-checks.mjs` + 双薄入口（D-6 的代码化）

**选定**：单实现 + 双入口，入口只构造配置与退出码。
**被否方案**：① 仓级另写一份实现（A 线 U2 的「双跑并存」）——反例即 R-6：`build.mjs` 六份漂移是本仓立项理由原文，文档门禁重演一遍等于自证失败。② 把 multi-root 脚本整体上移、包内改符号链接/删除——反例：`check-docs.mjs:26-29` 的四个目录常量里 `docs/plans/{active,completed}` 在仓根**不存在**（其 `SKILL.md:129` 明写「本 fork 已移除 docs/plans/ 目录」），整体上移会把死逻辑与活逻辑一起搬，且包内 `verify:all` 的 `docs:check` 语义变更越其 C2 硬边界。
**理由**：`scripts/lib/artifacts.mjs` 已证实「`scripts/lib/` + `.d.mts` + 多消费者」是该仓的既有形态（`:1-22` 模块头「第四份不许再出现」）。

### D-B2 双入口的扫描域互斥（子树归属，而非双扫双报）

**选定**：仓级 `excludePaths: ['plugins/multi-root-workspace']`；multi-root 包内入口 `markdownRoots: ['.']`。跨树链接仍双向闭合——**目标存在性检查与被扫文件归属无关**（`check-docs.mjs:160-165` 用 `path.resolve` + `existsSync`，可指向包外）：仓级文档指向 multi-root 文件的链接由仓级入口查；multi-root 文档指向仓级文件的链接由包内入口查。
**被否方案**：两级都全仓扫（D-6「根入口扫描全仓」的字面读法）——反例：仓级入口会把 multi-root 的 10 份 `.en.md`、双语配对、`.agent/note` 全部按仓级规则重判一遍，与 D-2/D-13「multi-root 体系仅单语化例外」直接冲突，且 `pnpm docs:check` 会把同一文件报两遍。
**理由**：D-6 的「全仓」语义在双入口架构下 = 「全仓**无主区域**」；multi-root 子树有主（其包内 `docs:check`），仓级入口覆盖其余全部。

### D-B3 打印层归内核，入口只设退出码

**选定**：`[PASS]/[FAIL]/file:line/LEVEL: message` 与末行 `<n> errors, <m> warnings.` 逐字搬进内核的 `printResults()`。
**被否方案**：内核返回结构化结果、各入口自己打印——反例：两入口的打印格式一旦分叉，「输出逐项一致」这条验收就失去意义（对比对象是文本），且 delta 会以「格式差异」而非「检查差异」的形式出现，噪声大于信号。
**理由**：parity 验收（⑤ G3）比对的是**文本**；打印单实现是让该验收在架构上成立。

### D-B4 归档域：links 降 warning，其余检查**不扫**

**选定**：`linkWarningPaths: ['openspec/changes/archive/']`（D-7 字面：归档内断链 warning、exit 0）+ `noScanPaths` 让绝对路径/空文档/ADR/骨架检查不进归档。
**被否方案**：① 所有检查在归档域统一降 warning——反例：实测归档域有 **142 处绝对路径命中中的约 110 处**（`openspec/changes/archive/**` 19+8+6+6+5+5+4+3+3+3+3+2+2+… 份文件的合计），会让每次 CI 常驻上百条 warning，把 D-9 要保留的 **4 条真信号**（归档断链）淹没。② 归档内断链完全豁免——反例：D-7 已定 warning（可见不阻塞），且「未来文档迁移把归档内部链接弄坏」需要可见信号。
**理由**：D-7 的适用面本就是**链接**（其原文「归档内断链降 warning」）；其余检查在只读域不可修复，error 即永久红灯、warning 即噪音，两者都无信号价值。

### D-B5 `artifacts/` 域豁免绝对路径检查

**选定**：`noScanPaths` 涵盖 `plugins/*/artifacts/` 与 `openspec/changes/archive/**/artifacts/`；证据文件的链接仍受 `markdown-links` 检查。
**被否方案**：证据文件同样禁绝对路径——反例：`plugins/workspace-config/artifacts/workspace-config-smoke.md:7` 的 `link:/home/xuqinqin/develop/person/dsh-plugins/plugins/workspace-config` 与 `:12` 的 `/home/docker/.cache/spec-evidence/…` 是**采集时的真实读数/真实命令**；把它们改写成 `<本仓>` 等于伪造证据（`plugins/user-commands/README.md:155` 的日志原文同理）。② 干脆把证据迁出仓库——反例：D-5 已定插件级证据入 `artifacts/`。
**理由**：证据的可信性优先于路径卫生；门禁只管「**叙述型**文档不写死开发者机器路径」。

### D-B6 `bare-adr-ref` 的 scope 与豁免（量化后的结论）

**选定**：error 级，scope = 仓级面（不含 `plugins/multi-root-workspace/**`），豁免 = `AGENTS.md`、`docs/decisions/README.md`（规则自述）+ 结构豁免（`docs/decisions/*.md` 的 `# ADR-NNNN:` 首行自标题、markdown 链接标签内的 `[ADR-0002：…]`）+ 链接目标形如 `ADR-NNNN-title.md` 的不算裸引用。
**量化依据**（本轮实测，逐层收窄）：全仓裸 `ADR-\d{4}` ≈ **325** 处 → 排除 `openspec/changes/**` 与 multi-root 子树后 **13** 处 → 去链接标签/自标题 **13** 处，其中 **7 处**落在两个规则自述文件（`AGENTS.md:101`×2、`:102`、`docs/decisions/README.md:7`、`:14`×3）→ **真实修复 5 处**（`docs/assessments/multi-root-build-unification.md:33/:48/:113`、`docs/decisions/ADR-0001:130` 的 `ADR-0013 决策 3`、`plugins/session-tool-toggle/README.md:127`）。另有 1 处 `docs/decisions/ADR-0001:36`（`详见 ADR-0002`，同体系内相邻引用）按修复 6 处算。
**被否方案**：① 全仓 error 一刀切——反例：一开闸 **325** 条，其中 312 条在只读归档或 multi-root 自有单编号体系内，门禁上线即不可用。② 只做 warning——反例：`docs/decisions/README.md:14` 把「引用 MUST 带路径」写成成文纪律，warning 等于自己声明纪律不必遵守（`check-docs.mjs:310-311` 只在 errors>0 时置退出码）。③ 把 multi-root 子树也纳入——反例：其内部 13 篇 ADR + 34 处架构文档裸引用**全部无歧义**（单编号体系，`docs/decisions/README.md:11-12` 的歧义只在**跨体系**时产生），一律要求带路径是纯噪声。
**理由**：把「歧义」这个真实判据机械化 —— 歧义只在跨体系边界产生，故 scope 以体系边界为界。

### D-B7 `readme-skeleton` 范围 = 六个软插件（不是七个）【已被轮 5 用户裁定⑤推翻：七包统一】

**选定（轮 5 修订后现行）**：`pluginPackages = { dir:'plugins', exclude:[] }`——七包全部纳入；multi-root 骨架对齐（3 处改名 + 补 `## 构建与测试` + `README.md:29` 锚点跟随）由 G5.5 施工，配置一行改动、不触内核代码（本段下方「风险与消解」预埋的路径即现行执行路径）。
**轮 4 原选定（已废弃，留档）**：`pluginPackages = { dir:'plugins', exclude:['plugins/multi-root-workspace'] }`。
**证据**（轮 4 自身的枚举即是范围声明）：轮 4 的「如适用」清单写 `## 配置`（project-mcp/session-tool-toggle/zcode-plan/web-ux）、`## 双端结构`（web-ux/session-tool-toggle/workspace-config）——**两处枚举都恰为软插件集合**且都不含 multi-root；而 multi-root 实际是 dual（`dsh.client.platform: web`）且也有配置键（`Config.commonRoots`），若「全部插件」= 7 包，这两条枚举就该包含它。故轮 4 的「全部插件必查」= 六个软插件。
**被否方案**：7 包强制——反例：multi-root README 需 `## 项目简介（What & Why）`→`## 定位`、`## 安装`→`## 安装到 profile`、`## 许可证`→`## 许可` 三处改名 + 新增 `## 构建与测试` + 修复 `README.md:29` 的 `[安装](#安装)` 同文档锚点（改名即断），合计 5 处编辑，与 D-13「multi-root 文档体系其余面不动」冲突，收益为零（其 12 节骨架本身比软骨架信息量更高）。
**风险与消解**：此判断是对轮 4 字面的**解释**而非改写；若用户裁定为 7 包，改动是配置表一行 + multi-root 5 处编辑，**不触内核代码**（见「待决问题 Q1」）。

### D-B8 `adr-skeleton` = 七节**子集**存在性、不查顺序

**选定**：`required.every(s => headings.includes(s))`，允许多余节、允许任意顺序。
**反例（决定性）**：`docs/decisions/ADR-0001-shared-build-and-source-kits.md:110` 多出 `## 修订记录`、且 `## Related Documents` 在 `:157`（位于修订记录之后）——等集或顺序断言会让 **ADR-0001 自己先红**，而它正是「被修订结论保留记录」这一纪律的正面范例。multi-root 侧同样是反例：13 篇 ADR 的 H2 数为 7/7/7/7/7/7/**9**/7/**15**/9/7/7/7。
**被否方案**：① 等集断言——反例同上，逼人删掉修订记录段。② 顺序断言——反例同上（Related Documents 必然在修订记录之后）。
**理由**：`docs/decisions/README.md:35` 的原文是「MUST 含」，是包含关系而非等价关系。

### D-B9 模板的「如适用」用 HTML 注释承载，不生成空节

**选定**：`plugin-README.md.tmpl` 只生成 4 个必备实节 + `## 结构`（自由节）+ `<!-- 如适用：## 配置 … -->` 注释块。
**被否方案**：① 生成 5 个空 `## 配置` 等实节——反例：直接触发本设计自己的「空壳节」判定（`readme-skeleton` 规则 2），模板生成物开箱即红，与 C9/D-10「生成即合规」直接矛盾。② 加 `artifacts/.gitkeep` 占位——反例：`template.json:13` 的 12 条目件套会变 13，需同步改 `scripts/gen-plugin.mjs:333` 的 `structureTree()`、`templates/README.md` 的「12 条目」与 `templates/default/README.md` 的件套表三处；且新插件尚无证据，空目录是错误暗示（Git 不跟踪空目录，`.gitkeep` 是非 `.md` 噪声）。
**理由**：注释在渲染后对人可见、对门禁不可见，是「提醒但不强制」的唯一无损载体。

### D-B10 缺陷样本运行时生成，不入库

**选定**：`runSelfTest()` 用 `fs.mkdtempSync(os.tmpdir())` 建临时根，写 6 个样本文件（断链 / 绝对路径 / 空文档 / ADR 缺节 + 命名非法 / README 缺必备节 / 合规对照），断言 5 项逐条 FAIL 且对照 PASS，`finally` 递归清理。
**被否方案**：① 样本入库为 `scripts/__fixtures__/doc-checks/**`——反例：仓级入口的 `scan.markdownRoots` 覆盖 `scripts/`（或需专门排除），**样本本身就是门禁红灯**，形成「为了测红灯必须先关红灯」的死锁。② 用 vitest 写（`plugins/*/test/*.spec`）——反例：根 `package.json` 无 `test` 脚本（`pnpm test` = `pnpm -r run test`），把根脚本的测试挂进某个插件包里，等于让该包为全仓内核的测试付费（也会被 AR8 的 include 闭合规则拉扯）。
**理由**：自检零依赖（只用 `node:fs`/`node:os`/`node:assert`）、零新增 CI 步、且在**任何一次**门禁运行时都执行（门禁坏了当场红，而不是等 CI）。

### D-B11 自检内置在入口，不设独立 npm script / CI 步

**选定**：两入口各自 `if (!runSelfTest()) process.exit(1)`，且 `docs:check` 字符串保持 D-6 字面（不塞第三个命令）。
**被否方案**：① `docs:check:self-test` 独立 script + CI 新步——反例：D-14/O14 已定「不新增 CI 步、不改步骤结构」，且独立脚本在本地开发时 100% 不会被想起。② 只在 CI 跑——反例：反例同 D-B10① 的反面：本地绿灯不等于门禁健康，正是 O10 要防的「门禁坏了但一直绿灯」。
**理由**：`runSelfTest` 纯内存 + 临时目录，实测成本可忽略（6 个小文件 + 14 项断言），放进热路径不构成负担。

### D-B12 multi-root 插件级 ADR 用**一篇**（ADR-0014）覆盖三事

**选定**：`ADR-0014-fork-divergence-and-single-language.md` 一篇覆盖「单语化 / 终止上游同步 / docs:check 薄化」。
**被否方案**：三篇（0014/0015/0016）——反例：三件事同属一个决策边界（「本包从『跟随上游的双语 fork』变为『本仓自有插件』」），拆开后每篇都要重述同一背景，与其 `SKILL.md:115`「不要为简单实现细节创建 ADR」的精神相反。② 复用仓级 ADR-0003 记录——反例：`docs/decisions/README.md:11-12` 明定两套编号互不预留、互不重编号，仓级 ADR 不约束插件内核。
**理由**：决策边界 = 一次可判定的定位变更；编号沿用其体系递增（0013 之后 = 0014）。

### D-B13 web-ux 去重只删正文、不改标题

**选定**：三处重复段落删正文本体，保留所有 `##`/`###` 标题文本，重复内容留**一份**（含表格的唯一副本）在原位，其余位置改为「见 [某节](#锚点)」。
**被否方案**：改写/合并标题以「更准确」——反例：`plugins/web-ux/README.md:201`/`:244`/`:265`/`:295`/`:299`/`:407`/`:417`/`:439` 共 **8 处**同文档锚点（`#会话管理`、`#非目标本能力`、`#归档目录与手工找回`、`#恢复语义`、`#边界与已知限制`）依赖标题 slug；`markdown-links` 明确跳过 `#` 开头目标（`check-docs.mjs:151`），**改坏了门禁也抓不到**——这正是最危险的一类静默回归。
**理由**：去重目标是 D-8 的 −30~40 行，不涉及信息重组。

### D-B14 zcode-plan 迁移指南复核口径 = 静态对账，不做真机重放

**选定**：逐段对账（版本声明 → 指向 `scripts/dsh-baseline.mjs` 表述 + 落档日期；命令与 0.2.2-rc.1 行为；路由 YAML 形状；已退役概念的注记如 `--dump-config-schema` exit 1 豁免口径）+ 在文首加「复核日期 + 复核基线来源」两行，**不改写实测读数**。
**被否方案**：① 真机重放（登录 → 路由 → 扣费）——反例：需要真实 bigmodel 凭证与运行中的 profile，本变更零凭证零 profile 的边界（D-14 同源）不成立；且重放产生的新读数属新证据，应另立 `artifacts/` 文件而非改写指南。② 只改版本号那一行——反例：该文件 `:3` 写 `0.2.1-rc.2` 而 `:62` 已写 `0.2.2-rc.1` 的行为，**同一文件自相矛盾**，只改 `:3` 会留下「指南声明适用于旧基线却引用新基线行为」的隐性地雷。
**理由**：复核的可验证产出是「矛盾清零 + 版本声明有来源」，不是「重新跑一次」。

### D-B15 上游清理的**语义分流**（fork 上游 vs DSH 上游）

**选定**：只清「fork 上游」（`cherrchen/…` 仓库、基线 `f149fa4`、`v0.1.2`–`v0.1.5` 里程碑、M1–M3/H1–H4 批次、「local fork vendored」措辞、「已随 fork 移除」的车道叙述）；「上游 = DSH / deepseek-harness」的语义**全部保留**。
**反例（决定性）**：`plugins/multi-root-workspace/README.md:7`/`:209`「不修改上游仓库（deepseek-harness）任何包」、`docs/architecture/multi-root-workspace.md:4` 同句、`src/*` 里 `ctx.fs`/`ctx.sandbox` 的「替换上游 provider」叙事（`AGENTS.md` 十一条不变量第 7 条）——按「上游」二字批量替换会抹掉**安全边界与兼容契约的承重语义**。同理 `docs/development/plugin-development-workflow.md:25` 的「与上游仓库同一 lint 选择」指 DSH。
**被否方案**：全文批量 `sed` 上游 → 自研——反例同上，且会把 `ADR-0002-upstream-coupling-policy.md`（其标题里的「上游耦合」= DSH 耦合策略）改成无意义标题。
**理由**：D-2 的原文是「清理所有**上游相关描述**（叙述面清、其 ADR 决策留一句事实）」，语境是「废弃 fork 上游同步」，不是「否认 DSH 是上游」。

### D-B16 门禁不并入 `dsh:check`（承接 D-14，给代码级理由）

**选定**：`docs:check` 独立；仓级 `check-docs.mjs` **不**进 `scripts/dsh-check.mjs:28-32` 的 `CHECKS` 数组。
**被否方案**：并入聚合器——反例：`dsh-check.mjs` 是 `release.mjs` 的调用目标（发布门禁），把「文档断链」塞进去等于**断链阻塞发版**；且其 `CHECKS` 三项的失败语义是「产物/结构不变式」，混装后 `dsh:check` 的 0/1 不再等于「可以发布」。
**理由**：门禁语义分层（产物面 vs 文档面），CI 已有独立步骤位（`ci.yml:60`），零 CI 结构改动。

### D-B17 仓级入口的目录排除集必须大于 multi-root 的 9 项

**选定**：`excludeDirs` 在原有 9 项上增加 `.dsh`、`.opencode`、`.worktrees`。
**反例**：`.gitignore:1-2` 明写 `.dsh`、`.opencode` 是本地生成物；`tools` 生成物里含 `SKILL.md`（`AGENTS.md`「`.dsh/skills/` — OpenSpec 安装的 DSH skill（本地生成，勿手改，不入库）」）。不排除 → 本地跑门禁会把生成的 skill 文档当项目文档扫，**本地红、CI 绿**的经典分裂。
**被否方案**：只在 CI 里跑（CI 没有这些目录）——反例：本地门禁是开发者的第一道闸，本地与 CI 判定不一致会训练出「忽略本地红灯」的习惯。

---

## ⑤ 逐任务组实现要点

组间串行、组内可并行（D-1）。**组序相对输入建议做两处调整，理由随附**；其余组序与输入一致，逐组「触达 / 要点 / 验证」三栏。

> **调整 1（换位）**：门禁**内核抽取**从第 7 组前移到第 3 组（单语化之前）。
> 理由：删掉 10 份 `.en.md` 的瞬间，`readme-pairs` + `agent-note-pairs` + `readme-navigation` 三项立即 FAIL（`check-docs.mjs:70-83`/`:86-102`/`:119-137` 的成对与导航断言），`pnpm docs:check` 会从此刻起长期红到第 7 组。内核抽取先落地且**保持 10 项全开**，还能让 parity 验收以 10 项为基线（比退役后的 7 项更强）。
> **调整 2（合并）**：模板重写并入「骨架对齐」组，`scaffold` CI 补步留在门禁组。
> 理由：骨架是一条规则的三个表达面（存量 README / 模板 / 生成器 token），拆到两组必然出现「存量已按 A 版骨架改、模板还是 B 版」的中间态；而模板正确性的**唯一机械验收**（生成物过 `docs:check`）必须等门禁存在，故补步留后。
> **同批约束**：G7 与 G8 必须在**同一提交**内收口（门禁挂上根入口 = 首轮清偿完成），否则 `docs:check` 红。

### G1 评估档案（含豁免清单盘点，D-12）【已施工 · 终形态 2026-11-07】

- **触达**：`docs/assessments/docs-unification.md`（新建）、`docs/assessments/README.md`（+1 索引行）。
- **要点**：按 `docs/assessments/README.md:7` 的四节骨架写；§现状差异清单逐条对应 P1–P6 与 D-1~D-14 的落点（不复制需求级论证，只记「事实 → 处置」）；§不施工项三条（双语推广、multi-root 体系收敛、豁免清单生成化）各带一句依据；附录 = 豁免清单盘点（`minimumReleaseAgeExclude` 300+ 条现状、`--dump-config-schema` 4 条 unrecognized 口径豁免、`ABSOLUTE_PATH_ALLOWLIST` 当前为空、`AR5` 的 workspace-config 六键放行）；§结论明确「本档案不裁定方案」。
- **验证**：`grep -c '^## ' docs/assessments/docs-unification.md` = 4；`node -e` 断言索引行含文件名；`git status --porcelain docs/assessments/` 仅 2 个文件。
- **执行回填（终形态）**：档案 169 行落地（四节 + 附录 A.1–A.5）；验收实测——文件存在 ✅、`不施工`=15（≥2）、`minimumReleaseAgeExclude`=3（≥1）、H2=4、strict validate exit 0、`docs/assessments/` 恰 2 文件。执行期实测校正三条（详见 diff-matrix §7 R1–R3）：①豁免清单精确 333 条（档案按实测写，未沿用「300+」）；②规划台账行号漂移两条（G6/G8 按现读重定位）；③索引行结论列由主会话按档案 §结论口径对齐（1.2 产物一行微调，验证句复跑绿）。

### G2 规范落位（D-3）

- **触达**：`docs/decisions/ADR-0003-doc-system-layers-and-gates.md`（新建）、`docs/README.md`（新建）、`docs/decisions/README.md`（+1 行）、`AGENTS.md`（+2 链接行）、`openspec/specs/dsh-plugin-toolchain/spec.md`（+1 requirement，③.6 形状）、`openspec/changes/docs-unification/{proposal,design,tasks}.md`（提案本体，OpenSpec 工作流）。
- **要点**：ADR-0003 先按 `adr-skeleton` 的七节**子集**自检（多出节允许）；分层表六行逐字对齐 C2；4 必备 + 5 如适用节清单与 ③.5 文法**逐字一致**（规范与脚本是同一份规则的两种表达，禁止改写成同义不同词）；两处边界声明（N1 openspec 工件面、N2 索引只链接）各一句；`docs/README.md` 只写链接与一句话定位，**不写任何摘要**（N2）。
- **验证**：`grep -c '^## ' docs/decisions/ADR-0003-*.md` ≥ 7 且七节名齐全；`pnpm spec:check` exit 0；`git diff -U0 AGENTS.md | grep -c '^+[^+]'` = 2（本组只加链接，口径句在 G9）。
- **执行回填（终形态 2026-11-07）**：2.1/2.2/2.3 全部核对通过。实测——ADR-0003 172 行、H2=7、分层表与 C2 逐字一致、4+5 节清单与 ③.5 逐字一致、内链全通；`docs/README.md` 33 行 15 链接人工巡检零断链（「docs 三区」实为两区、openspec 无 README 故链两个真实目录、artifacts 只链现存两包——G6 后补 3 行，见 R4）；`AGENTS.md` 恰 +2 行（numstat 2/0）。主会话组收尾补齐三件：①`docs/decisions/README.md` 索引 +1 行（触达面有、tasks.md 三条任务均未覆盖，机械补齐）；②AGENTS 括注「文档体系分层与门禁」与 ADR 标题核对一致（概括式，形态同 0001/0002 行，不改）；③工件矛盾同步——readme-skeleton 范围按轮 5 裁定⑤改七包统一（D-B7 标注被推翻），见 R5。触达面残留口径（同 R2 原则）：`openspec/specs/dsh-plugin-toolchain/spec.md` 不直改——specs delta 已随落档存在，归档时由 OpenSpec 同步主 spec。

### G3 门禁内核抽取 + multi-root 薄化（10 项全开，D-6 前半）

- **触达**：`scripts/lib/doc-checks.mjs`（新建）、`scripts/lib/doc-checks.d.mts`（新建）、`scripts/lib/doc-checks.selftest.mjs`（新建）、`plugins/multi-root-workspace/scripts/check-docs.mjs`（318 → ~30 行）。
- **要点**：① 把 `:70-272` 的 10 个 `checkXxx()` 逐个搬进内核，**逻辑零改写**（含 `:142` 链接正则、`:150-159` 的 `<>`/`#`/scheme/`decodeURIComponent` 处理、`:176-178` 三条绝对路径 pattern、`:37-40` 三条文件名正则）；② `:54-55` 的顶层全量扫描改为 `collectMarkdown(config)` 惰性执行；③ `:26-29` 四常量 → `config.dirs`；④ `:12-23` → `config.scan.excludeDirs`；⑤ `:35` → `config.exemptions.absolutePaths`；⑥ `:298-312` 打印与计数逐字搬入 `printResults()`；⑦ 本组 multi-root 配置**十项全开**（含三项双语），且 `runSelfTest` 一并接上（此时自检覆盖的是内核的既有 5 类样本）；⑧ 仓级入口本组先不建（G7 建）。
- **验证（硬验收，输出逐项一致）**：

```bash
cp plugins/multi-root-workspace/scripts/check-docs.mjs /tmp/new-check-docs.mjs
git checkout -- plugins/multi-root-workspace/scripts/check-docs.mjs
node plugins/multi-root-workspace/scripts/check-docs.mjs > /tmp/before.txt; echo "before=$?"   # 期望 0
cp /tmp/new-check-docs.mjs plugins/multi-root-workspace/scripts/check-docs.mjs
node plugins/multi-root-workspace/scripts/check-docs.mjs > /tmp/after.txt;  echo "after=$?"    # 期望 0
diff /tmp/before.txt /tmp/after.txt && echo PARITY-OK                                          # 本组必须无差异
```

（本组尚未退役任何检查，故 `before.txt` 的 10 行 `[PASS]` 与末两行必须**逐字节**相同；基线文本已实测为：`Documentation checks` + 10 行 `[PASS] <name>` + `0 errors, 0 warnings.` + `Documentation checks passed.`。）
另：`grep -c 'checkXxx\|newResult' scripts/lib/doc-checks.mjs` 用于确认实现只有一处（口令人工核对，不设阈值）。
- **执行回填（终形态 2026-11-07）**：3.1/3.2/3.3 全部核对通过。实测——内核 1278 行（14 检查 + 配置归一化 fail-closed + 惰性收集 + 打印层，导出面 `CHECK_IDS`/`runDocChecks`）+ `.d.mts` 165 行 + selftest 517 行（**22 项运行时断言**，超 D-B10 的 6 样本口径：每类缺陷 + 合规/豁免/边界，含 R7 围栏用例位、D-7 归档降级、端性闭环、bare-adr 剥离语义）+ 薄入口 39 行（318→39，含自检静默接线 2 行）。验收三条链全绿：①正常路径 parity 与基线 md5 逐字节一致（主会话独立复核，接线自检后复跑仍一致）；②缺陷路径双树对拍（新旧同构树喂 8 类缺陷，输出逐字节一致、均 exit 1）；③selftest 22 断言 + 规则回退探针（弱化内置规则→精确转红）。组期工件修正四件（R8–R11）：③.2 示例同步 noScanPaths、specs delta 必备节措辞对齐裁定链、③.3 蓝本两时态计数修正、bare-adr 修复面 6→17（R9）。执行期裁定（R12/R13）：自检组合输出模式已实施接线；规则回退口径 G7 复跑探针。未做（范围外）：根入口（G7）、双语三项退役（4.7，内核开关已备）。

### G4 单语化 + 废弃上游同步 + 3 项退役（D-2）

- **触达**：D 组全表（10 份 `.en.md` 删、9 处导航行删、`package.json:69`、`README.md`、`AGENTS.md`、`SKILL.md`、`.agent/note/README.md`、`docs/README.md` 语言段、5 份目录索引、`plugin-development-workflow.md`、`ADR-0014` 新建 + 索引）。
- **要点**：① **同批三件事**：删文件 / 退役三项 / 改 `files`；② 退役 = 在 `PKG_CONFIG.checks` 里把 `readme-pairs`/`agent-note-pairs`/`readme-navigation` 置 `false`（内核代码里三项**保留但不启用**，不删实现——删了就无法证明「退役后 7 项输出与原 7 项一致」）；③ 上游清理按 D-B15 的语义分流，逐文件按下表的精确点位改；④ `SKILL.md` 改 5 处（§4 删、§5 去成对、:140、:170 第 4 项、§12 描述）；⑤ `ADR-0014` 按 `docs/decisions/ADR-0014-*.md` 命名 + 七节子集，含「上游事实一句」。
- **验证**：

```bash
find plugins/multi-root-workspace -name '*.en.md' -not -path '*/node_modules/*' | wc -l        # 0
grep -rn 'README\.en\.md' plugins/multi-root-workspace --include='*.md' --include='package.json' | wc -l  # 0
grep -rn 'cherrchen\|f149fa4\|local fork\|本地 fork' plugins/multi-root-workspace --include='*.md' | grep -v docs/decisions/ | wc -l  # 0（全域清零——轮 5 裁定②一句不留；ADR-0014 只写处置，decisions 域内旧 ADR 不含这些词）
grep -c 'deepseek-harness\|上游 provider' plugins/multi-root-workspace/README.md                 # ≥1（DSH 上游语义保留，D-B15）
node plugins/multi-root-workspace/scripts/check-docs.mjs | grep -c '^\[PASS\]'                  # 7
node plugins/multi-root-workspace/scripts/check-docs.mjs | grep -E 'bilingual|language navigation' | wc -l  # 0
git diff --stat -- plugins/multi-root-workspace/src plugins/*/src | wc -l                       # 0
```
- **执行回填（终形态 2026-11-07）**：7/7 任务核对通过。实测——10 份 `.en.md` 删净（781 行）、files 行同批、双语三项配置退役（内核实现保留）；README 239→220 行（17 个删除点，**npm 上游安装通道叙述随裁定清零**、安装来源计数 4→3）；AGENTS 119→101（H2 9→8，十一条不变量逐字保留）；SKILL §4 保号改写 + §12 对齐 7 项共享内核口径；ADR-0014 80 行零来历句（三条 SHALL 处置 + 六条被否方案）；workflow §7 整节重写为现状 CI 事实。组级验收全绿：docs:check 7 项 PASS + `0 errors, 0 warnings.` + exit 0（恰少双语三行）；fork 词全域扫描 0（decisions 域外）；dsh:check 3/3 组全过。执行期连锁与工件同步见 R14（12+ 处补清、验收①口径裁定、M/H 里程碑标签全域去化、code-design :59/:568/Q5/:151 四处旧口径同步）。

### G5 骨架对齐（六软插件）+ web-ux 去重 + 模板同步（D-4/D-8/D-10 前半）

- **触达**：E 组六个 README；`templates/default/plugin-README.md.tmpl`；`scripts/gen-plugin.mjs`（`buildTokens` + `DUAL_SECTION`）；`templates/default/README.md`。
- **要点**（每包一句）：

| 包 | 缺的必备节 | 改名 | 备注 |
| --- | --- | --- | --- |
| project-mcp | `## 定位` | `## 配置文件`→`## 配置`；`## 构建`→`## 构建与测试`；`## 与 dsh-plugin-web-ux 的关系`→`## 与其他插件的关系` | 端性 `host-only` |
| user-commands | `## 定位` | `## 构建`→`## 构建与测试` | 端性 `host-only` |
| web-ux | `## 定位` | `## 构建`→`## 构建与测试` | 端性 `双端`（已有 `## 双端结构`）；去重三处 |
| session-tool-toggle | `## 定位` | — | 已有 双端结构/配置/已知限制/排障/构建与测试/许可 |
| workspace-config | — | `## 构建与类型`→`## 构建与测试` | 已有 定位/双端结构/安装/许可 |
| zcode-plan | `## 定位` | `## 构建`→`## 构建与测试` | 端性 `host-only`；`## 配置` 可用现有「手工路由 YAML」+ 配置键说明合成，或声明为不适用（不强制） |

  web-ux 去重三刀：`:80`↔`:292`（搬家细节三句 → 第二节保留、第一节改一句链接）；`:175`↔`:266`（半失败 warnings 语义 → 保留 `:175` 的完整表述，`:266` 段改为一行「warnings 语义见 [半失败…](#半失败warnings与手工清理)」）；`:199-206`↔`:308-317`↔`:435-439`（非目标三段：`:199-206` 为能力级非目标保留，`:308-317` 只留该能力独有项，`:435-439` 留版本级三项）。**标题一律不动**（D-B13）。
  模板：`## 定位` 首行放 `端性：{{KIND_LABEL}}`（新增 token，或复用 `{{KIND}}` 并让门禁接受 `host-only|dual` 两值——取后者，少一个 token，③.5 的取值域同步为 `{host-only, 双端, dual}`，**优先方案：新增 `ENDNESS` token 输出 `host-only|双端` 中文值，保持门禁取值域为二值**）；`安装到 profile` 原样保留；`开发` → `构建与测试`；`## 结构` 保留；末尾加 `## 许可` + 5 段 `<!-- 如适用 -->` 注释；`{{DUAL_SECTION}}` 放在 `## 结构` 之后。
- **验证**：

```bash
for f in plugins/*/README.md; do echo "$f: $(grep -c '^## 定位$\|^## 安装到 profile$\|^## 构建与测试$\|^## 许可$' $f)"; done   # 每行 4（multi-root 除外）
grep -c '^## ' plugins/web-ux/README.md                                                      # 去重后行数下降 ≥30
wc -l plugins/web-ux/README.md                                                               # ≤ 443-30
pnpm gen:plugin tmp-doc-smoke --kind dual --dry-run | grep -c 'DUAL_SECTION'                   # 0（渲染无残留）
pnpm gen:plugin tmp-doc-smoke --kind dual && grep -E '^## (定位|安装到 profile|构建与测试|许可|双端结构)$' plugins/tmp-doc-smoke/README.md | wc -l  # 5
pnpm gen:plugin tmp-doc-host --kind host-only && grep -c '^## 双端结构$' plugins/tmp-doc-host/README.md  # 0
rm -rf plugins/tmp-doc-smoke plugins/tmp-doc-host   # 临时件不入库
```
- **执行回填（终形态 2026-11-08）**：6/6 任务核对通过，组级硬验收达成——**七包 4 必备节计数全部 = 4**、内核 readme-skeleton 探针逐包全绿（web-ux 最后补验 PASS）。5.1/5.2 补定位 + 改名（锚点零跟随需求实测确认）；5.3 三刀去重按 R15 改判口径验收（重复正文净删 1609 字符、标题除定位/改名外逐字节零变化、wc 443→443 如实记录）；5.4 三包 + 偏差补齐（workspace-config 端性行，R15②）；5.5 四改名 + 双端结构节（R15②）+ 构建归并单一出处 + tarball `pnpm pack` 无参修正（G4 遗留观察闭环）；5.6 模板骨架全集 + ENDNESS/DUAL_SECTION 无条件注入（生成物 dual/host-only 双验证 + 内核正负对照 + gen:plugin --check 回归 0）。组期联动：ADR-0003:163 代价行补端性闭环项、templates/README.md:156 措辞对齐、tasks.md 5.5 验证句补双端结构计数。

### G6 证据归位 + zcode-plan 内容级复核（D-5/D-11）

- **触达**：project-mcp / user-commands / zcode-plan 的 README + 三个 `artifacts/` 新目录；zcode-plan `docs/` 两篇移动、一篇改写。
- **要点**：① 迁移用 `git mv`（保留 blame），**同批**改 README 的一行证据行 + 所有指向它的链接（zcode-plan README `:5`/`:104`/`:247` 三处）；② project-mcp `:106` 的内联指引「见下节」必须改口（否则成孤儿）；③ user-commands `:92` 示例输出路径改为 `…/person/dsh-plugins`（`artifacts/` 里的原文**不改**，D-B5）；④ 每份证据文件首行加元信息行（`> 证据类型 / 采集时点 / 结论`），正文零改写；⑤ zcode-plan 迁移指南按 D-B14 静态对账，文首加两行（复核日期、复核基线来源 `scripts/dsh-baseline.mjs`）。
- **执行回填（终形态 2026-11-08）**：4/4 任务核对通过。6.1——证据节 52 行 sha256 字节级一致迁 `artifacts/isolation-smoke.md`（元信息采集时点取正文记录 2026-11-05），README 证据行按 §3 文法就位、`artifacts/isolation-smoke.md` 恰 2 处命中；6.2——38 行 / 4054 字符字符级全等迁 `artifacts/real-machine-verification.md`；6.3——两文件普通 mv（暂存区零触碰，rename 相似度 98%/97% 由临时索引实测）+ 元信息首行 + README 三处活链改链（散文路径 7 处按 R16⑤不改）；6.4——前置经用户裁定满足（R16①），静态复核三条全绿（`0.2.1-rc.2` 零命中、来源常量表述、复核时点 2026-11-08），真机三命令读数由用户执行回贴、`route-replay-2026-11-08.md` 主会话落盘（status/route/refresh 含幂等换发形态 + 四点对照表）。组期联动：zcode-plan README:17 版本声明矛盾修正、verify-discount.sh:9 注释路径同步、G8.2 修复清单 +1（R16②）。验证句全达成（route-replay 文件名与指南引用一致）。
- **验证（原文保留；`git mv` 实际按 R16 改用普通 mv）**：

```bash
ls plugins/{project-mcp,user-commands,zcode-plan}/artifacts/*.md                             # 各 ≥1
grep -rn '^## .*验证证据\|^## 隔离冒烟记录\|^## 真机验证' plugins/*/README.md | wc -l          # 0
grep -rn '^验证证据：\[' plugins/*/README.md | wc -l                                          # ≥2（project-mcp / user-commands 各 1）
grep -rn 'docs/acceptance\.md\|docs/discount-verify\.md' plugins/ --include='*.md' | wc -l    # 0
ls plugins/zcode-plan/docs/                                                                   # 只剩 migration-from-zai-coding-zcode.md
grep -n '0\.2\.1-rc\.2' plugins/zcode-plan/docs/migration-from-zai-coding-zcode.md | wc -l     # 0
grep -c 'dsh-baseline\.mjs\|复核日期' plugins/zcode-plan/docs/migration-from-zai-coding-zcode.md  # ≥2
git log --follow --oneline -1 plugins/project-mcp/artifacts/isolation-smoke.md                # 有历史（git mv 生效）
```

### G7 门禁落位：仓级入口 + 4 新检查 + 负测试 + scaffold 补步（D-6 后半 / D-10 后半）

- **触达**：`scripts/check-docs.mjs`（新建）、`scripts/lib/doc-checks.mjs`（+4 检查 + `noScanPaths`/`linkWarningPaths`/`pluginPackages`）、`package.json:22`、`.github/workflows/ci.yml`（+1 步 + `:15` 注释）。
- **要点**：① 4 个新检查按 ③.1 表与 ③.5 文法实现（G3 已在内核落地，G7 只做配置启用）；`bare-adr-ref` 的链接标签剥离 + 首行自标题跳过已随内核实现（D-B6 的量化路径）；② 仓级配置的 `excludeDirs` 补三项（D-B17）、`excludePaths` 排 multi-root（D-B2）、`noScanPaths` 排归档与 artifacts（D-B4/D-B5/R8）；③ scaffold 作业在两包 `verify:all` 之后、`dsh:check` 之前插 `- name: 文档检查（生成物）` / `run: pnpm docs:check`；④ `ci.yml:15` 注释句改写为「仓级共享内核 + dual 入口」。
- **执行回填（终形态 2026-11-08，含与 G8 的联合验收）**：2/2 任务核对通过。仓级入口 151 行（三值语义 + R12/R13 自检接线 + R5/R8 配置口径）；首跑 `36 errors + 4 warnings` 全量盘点（R17：台账外断链 6 条并入 G8.2 fenced 化、absolutePaths 空数组裁定、G8 清单漂移修正）。**联合验收（8.3 完成时）全绿**：`node scripts/check-docs.mjs` exit 0、`0 errors, 4 warnings.`（恰 D-7 归档域）、`pnpm docs:check` 两段全跑 exit 0（仓级 + multi-root 7 项）——7.1 验证句原口径（exit 0 + 四新检查 PASS 行）于此达成。ci.yml scaffold 补步 + :3/:15 注释口径句改写（YAML 解析验证、scaffold 10→11 步逐位核对）。
- **验证**：

```bash
node scripts/check-docs.mjs; echo "exit=$?"                                  # 0（本组与 G8 同批收口后成立）
node scripts/check-docs.mjs | grep -c '^\[PASS\]'                            # ≥ 8（仓级启用项）
node scripts/check-docs.mjs | grep -E 'errors, [0-9]+ warnings'              # 期望 "0 errors, 4 warnings"（归档 4 条）
pnpm docs:check; echo "exit=$?"                                              # 0
node scripts/check-docs.mjs --self-test; echo "exit=$?"                       # 0（若保留 flag；否则由内置自检覆盖）
node scripts/check-docs.mjs --bogus; echo "exit=$?"                           # 2（用法错误）
```

> 负测试的可验证口径（写进 tasks 的验收条目，不用占位命令）：**规则回退验证** —— 人为把 `readmeRequiredSections` 删掉一项后跑 `node scripts/check-docs.mjs`，自检必须 exit 1 并点名该样本；恢复后 exit 0。这一步证明「自检真的绑着规则」，而不是自检绑着固定输出。

### G8 首轮清偿（断链 9 + 裸 ADR 6 + 绝对路径 2）

- **触达**（精确清单，全部已扫描核实）：

| 文件:行 | 现状 | 改为 |
| --- | --- | --- |
| `docs/decisions/ADR-0001-shared-build-and-source-kits.md:161` | `../../openspec/changes/optimize-architecture/code-design.md` | `../../openspec/changes/archive/2026-11-07-optimize-architecture/code-design.md` |
| `docs/decisions/ADR-0002-attribution-kernel.md:83` | `…/changes/optimize-architecture/specs/dsh-project-mcp/spec.md` | `…/changes/archive/2026-11-07-optimize-architecture/specs/dsh-project-mcp/spec.md` |
| 同上 `:84` | `…/specs/dsh-user-commands/spec.md` | 同上加 `archive/2026-11-07-…` |
| 同上 `:123`（2 链接） | `code-design.md`、`design.md` 各一 | 均加 `archive/2026-11-07-optimize-architecture/` |
| 同上 `:124`（2 链接） | 两个 spec delta | 同上 |
| 同上 `:125` | `../../plugins/user-commands/test/attribution-concurrency.test.ts` | `attribution-anomaly.test.ts`（实测现存文件名） |
| `plugins/project-mcp/README.md:132` | `../../openspec/changes/project-mcp-name-resource-isolation/artifacts/smoke-record.md` | `../../openspec/changes/archive/2026-11-04-project-mcp-name-resource-isolation/artifacts/smoke-record.md` |
| `docs/assessments/multi-root-build-unification.md:33/:48/:113` | 裸 `ADR-0001` | `docs/decisions/ADR-0001-shared-build-and-source-kits.md`（链接形式） |
| `docs/decisions/ADR-0001:36` | 裸 `ADR-0002` | 带路径 |
| `docs/decisions/ADR-0001:130` | 裸 `ADR-0013 决策 3` | `plugins/multi-root-workspace/docs/decisions/ADR-0013-workspace-config-section-mount.md` |
| `plugins/session-tool-toggle/README.md:127` | 裸 `ADR-0002：` | `docs/decisions/ADR-0002-attribution-kernel.md` |
| `README.md:77` | `add /home/xuqinqin/develop/person/dsh-plugins/plugins/<name>` | `add <本仓>/plugins/<name>` |
| `plugins/user-commands/README.md:92` | 内联绝对路径（示例输出） | `…/person/dsh-plugins` |

- **要点**：归档域 4 条**不修**（`openspec/changes/archive/2026-11-07-unify-deps-and-templates/{code-design.md:81,128, tasks.md:52}`）——由 `linkWarningPaths` 降为 warning（D-7）；`openspec/specs/dsh-multi-root-file-references/spec.md:30/:44` 的示例路径进 `exemptions.absolutePaths`（不改 spec：`docs/decisions/README.md` 与 D-13 把 spec 归行为权威）。
- **验证**：

```bash
node scripts/check-docs.mjs | grep -E 'errors, [0-9]+ warnings'    # "0 errors, 4 warnings"
node plugins/multi-root-workspace/scripts/check-docs.mjs; echo $?  # 0
node scripts/check-docs.mjs | grep -c "Broken link"              # 4（全部落在归档域，且为 warning）
```
- **执行回填（终形态 2026-11-08，含 G7+G8 联合验收）**：3/3 任务核对通过。8.1——10 处 error 清零（8 断链 + 2 bare-adr；:123/:124 各含 2 链接故行号 8 个点位 10 条 error）；内容层小修（主会话）：ADR-0002 :125 label 与 :90 叙述按「并发用例已迁入 `tooling/host-kit/test/attribution.test.ts`」事实更新。8.2——23 处清零（1 断链 + 15 bare-adr + 7 围栏化）；**偏差① 纠正正确**：session-tool-toggle 的 ADR-0002 真源是插件级 `upstream-coupling-policy.md`（仓级 attribution-kernel 无该内容）——派发提示照搬台账未辨析语义，子代理按内容改链插件级并报备；围栏化落本变更三工件（文字逐字未动，主会话抽查确认）。8.3——spec 子串豁免登记（`exemptions.absolutePaths`）+ 根 README:77 `<本仓>` 占位；行号漂移根因实测：内核 `checkAbsolutePaths` 先 `stripCodeFences()` 后按剥离文本计数（报告 :38 = 原文 :77）。**联合验收全绿**：exit 0、`0 errors, 4 warnings.`（恰 D-7 归档域 4 条）、`pnpm docs:check` 两段全跑 exit 0。与台账差异：断链实修 10 处（8 仓级 + 1 迁移连带 + 1 label 同步）、bare-adr 实修 17 处（台账 6 + G1 自伤 11）、围栏化 7 处（R17① 台账外）、豁免 1 子串（2 error）、绝对路径 1 处（user-commands:92 由 G6 达成）。

### G9 收尾（O6 + 口径同步 + 索引回链）

- **触达**：`tooling/contracts/README.md`（新建）、根 `README.md`（:25/:40/:105）、`AGENTS.md`（:22/:66）、`ci.yml` 注释（若 G7 未含）、`docs/README.md`（补 artifacts 与 assessments 入口）。
- **要点**：三份 `docs:check` 口径副本（`AGENTS.md:66`、`README.md:40`、`ci.yml:15`）**同批**改为「仓级共享内核 + 双入口」；根 README 文档地图句 → `docs/README.md` 链接（`:105`）；contracts README 四段（定位 / 消费形态 `import type` / 与 workspace-config 及三贡献方关系 / 零运行时）。
- **验证**：

```bash
grep -rn '仅 multi-root-workspace 实现该脚本' . --include='*.md' --include='*.yml' | wc -l   # 0
git diff -U0 AGENTS.md | grep -c '^+[^+]'                                                     # ≤ 4
grep -c 'docs/README.md' README.md                                                            # ≥1
ls tooling/*/README.md | wc -l                                                                # 4
pnpm lint && pnpm typecheck && pnpm test && pnpm dsh:check && pnpm spec:check && pnpm docs:check  # 全 0
git diff --stat -- 'plugins/*/src' 'plugins/*/lib' | wc -l                                    # 0（D-14 底线）
```

---

## ⑥ 设计假设与未决项

### 设计假设（本设计成立所依赖的前提，均可被实施期证伪）

- **H1**：`pnpm -r run docs:check` 在只有 multi-root 实现该脚本时**静默跳过**其余包（现网行为，`package.json:22` 现行生效即证据）。若该假设不成立，根 `docs:check` 需改 `--if-present` 形态。
- **H2**：`runSelfTest` 的单次成本 < 100ms（6 个小文件 + 14 项断言）。若远超，则改为 `docs:check` 只在 `--self-test` 显式调用（会牺牲「热路径自检」）。
- **H3**：multi-root 包内 `docs:check` 允许 `import '../../../scripts/lib/doc-checks.mjs'`（跨包相对引用在本仓无门禁禁止——AR1–AR8 只扫 `plugins/`、`tooling/` 为包的依赖面，`scripts/` 不是包）。
- **H4**：`docs/decisions/ADR-0003` 的七节子集能被 `adr-skeleton` 判过（多出的节不罚）。
- **H5**：仓级入口排除 `plugins/multi-root-workspace` 后，**不存在**「只有仓级规则才查、包内规则不查」的检查项——即跨树链接仍双向闭合（③.1 已论证：目标存在性检查与扫描归属无关）。
- **H6**：`templates/default/README.md` 的件套数（12）与 `scripts/gen-plugin.mjs:333` 的 `structureTree()` 在本轮**无需改动**（未新增件套文件）。
- **H7**：`gen:plugin` 生成的临时包（`plugins/ci-smoke-*`、演练用 `plugins/tmp-*`）在 CI/本地都会被仓级 `docs:check` 扫到，故模板必须一次成型；它们不进仓库（`.gitignore` 无需新增——CI 作业末尾不做清理，但也不提交）。

### 未决项（技术未知，不构成用户决策）

- **U1**：`noScanPaths` 的单层 `*` 匹配是否需要支持 `**`。当前设计只需 `plugins/*/artifacts/` 与 `openspec/changes/archive/**/artifacts/` 两种形状；若实施时发现还有第三种（如 `docs/**/artifacts/`），需扩语法（代价：一个 8 行的段匹配器）。

```
- **U2**：`bare-adr-ref` 对 `[ADR-0002：归属内核](./ADR-0002-attribution-kernel.md)` 这类**标签即裸写、目标带路径**的形态是否算违规。本设计的判定是「标签不算引用表述，只看非链接文本」→ 不算。实施时若希望更严，需先接受 `docs/assessments/multi-root-build-unification.md:9`、`docs/decisions/ADR-0002:120` 等 3–5 处同类改写的连带面。
```

- **U3**：`adr-skeleton` 是否应同时查 `## Status` 的取值域（`Accepted|Proposed|Deprecated|Superseded`）。本设计不查（`docs/decisions/README.md:35` 只要求「含」，取值域未成文）。
- **U4**：`check-docs.mjs --self-test` 是否作为公开 flag 保留。本设计倾向「内置 + 同 flag 双通道」（flag 便于排障，内置保证热路径），成本是 4 行参数解析。
- **U5**：multi-root 入口的 `label` 与输出前缀是否要区分（当前设计只用于错误提示里的一行标识，**不进 `[PASS]` 行**，以免破坏 parity）。若未来两入口输出被并列阅读，需要前缀。

---

## 待决问题

> 需用户拍板；每条含 问题 / 选项 / 你的推荐 / 影响面。**不自行假设**，未拍板项在实施前按推荐值落地并在 tasks 里标注「待确认」。

### Q1 `readme-skeleton` 的范围：六软插件，还是七个包（含 multi-root）

- **问题**：轮 4 定稿写「固定必备 4 节（**全部插件**必查）」，但同稿两条「如适用」枚举（`## 配置` 4 包、`## 双端结构` 3 包）都**不含** multi-root；而 multi-root 实际是 dual 且有配置键。若「全部」= 7 包，其 README 需 3 处改名 + 1 处新增 + 1 处同文档锚点修复；若 = 6 包，则与其「12 节 fork 骨架不动」现状一致（D-13）。
- **选项**：a) 6 包（本设计取此值）；b) 7 包（multi-root 也纳入软骨架）。
- **推荐**：**a**。证据是轮 4 自身的两处枚举（若 intent 是 7 包，这两条必然包含 multi-root）；且 D-13 明写「multi-root 文档体系其余面不动」，纳入骨架会与它同批矛盾。
- **影响面**：选 b 时 `pluginPackages.exclude` 清空 + multi-root README 5 处编辑 + 其 `README.md:29` 的 `[安装](#安装)` 锚点跟随改名（门禁查不到锚点，必须人工修）；不动内核代码。选 a 时 multi-root 维持现状，仅单语化与 ADR-0014。

### Q2 「如适用」5 类的强制面：声明驱动，还是 per-package 期望表

- **问题**：轮 4 枚举了哪些包有配置键 / 有双端结构 / 有已知限制。是把这些枚举做成门禁的**期望表**（逐包强制），还是只做「声明驱动」（存在即查非空 + 双端结构由端性声明闭环）？
- **选项**：a) 声明驱动（本设计）；b) per-package 期望表（4 包必查配置、3 包必查双端结构等）；c) 两者并用（表内项强查，表外项声明驱动）。
- **推荐**：**a**（v1）。`## 配置`/`## 已知限制`/`## 非目标` 的「适用性」是语义判断（`Config` 存在 ≠ 有意义的配置面），强制会逼出空壳节（正是 R1 的风险）；而 b/c 需在内核里维护一张与 ADR-0003 同源的包表 = **第二真源**（本设计全程反对的东西）。双端结构一项已用端性声明做到闭环，覆盖了机械可判的部分。
- **影响面**：选 b/c 时多一张表 + 每个新插件需登记（gen:plugin 与表要同步，否则新包要么漏查要么误伤）；选 a 则软骨架更软，`## 配置` 缺失不会被拦（靠 ADR-0003 的规范约束 + 评审）。

### Q3 zcode-plan 迁移指南「内容级复核」的深度

- **问题**：D-11/用户轮 3 裁定「内容级复核（按 `0.2.2-rc.1` 逐段复核更新）」。复核深度到哪一档？
- **选项**：a) 静态对账（版本声明 → 常量来源 + 落档日期、命令与 0.2.2-rc.1 行为逐段核对、路由 YAML 形状、退役概念注记、矛盾清零）；b) 真机重放（登录 → 路由 → 扣费复测并更新读数）；c) 只改版本声明一行（line-b 原推荐）。
- **推荐**：**a**。b 需要真实 bigmodel 凭证与运行中 profile，越「零凭证、零 profile、零运行时变化」边界，且新读数应另立 `artifacts/` 文件；c 已被实测否证——该文件 `:3` 写 `0.2.1-rc.2` 而 `:62` 已引 `0.2.2-rc.1` 行为，**同文档自相矛盾**，只改 `:3` 会留下隐性地雷。
- **影响面**：选 a 则 G6 增约 0.5 人日（逐段读 10k 字 + 改 5–8 处）；选 b 需凭证与 profile，且引入内容回归风险；选 c 则 D-11 的裁定落空（用户已明确选过内容级复核）。

### Q4 证据域（`artifacts/`）是否豁免绝对路径检查

- **问题**：证据文件里的绝对路径（`/home/xuqinqin/...`、`/home/docker/.cache/...`、日志原文 cwd）是**采集时的真实读数**。豁免它们，还是要求改写为相对/占位？
- **选项**：a) 豁免（本设计，D-B5）；b) 证据同样禁绝对路径，一律改写为 `<本仓>`/`<DSH_HOME>`；c) 豁免但要求证据文件首行声明「含本机绝对路径，属读数原文」。
- **推荐**：**a + c 的可选补充**（豁免机制按 a，元信息行按 c 的措辞写进 G6 的要点，不做门禁断言）。b 会让「证据」变成「叙述」，与 D-5 的证据语义冲突。
- **影响面**：选 b 则 `plugins/workspace-config/artifacts/workspace-config-smoke.md` 5 处、`zcode-plan` 两篇 4 处、`user-commands` 迁入内容 4 处需人工改写（可读性与可信度双降）；选 a 则门禁只管叙述型文档，证据域对路径卫生零约束。

### Q5 multi-root 插件级 ADR 的「上游事实一句」写在哪一节【前提已被轮 5 裁定②推翻：上游事实一句不留，本问失效】

- **问题**：~~D-2 要求「决策记录留一句最简上游事实供自解释」~~（轮 5 裁定②改为完全移除、一句不留，ADR-0014 只写处置）。
- **结论（轮 5 现行）**：ADR-0014 **零来历句**（Context 只写现状与动因，不写 fork 历史）；4.6 施工已按此落地。

---

*本产物只写自身一份文件（`/tmp/spec-flow/docs-arch-refinement/code-design.md`），未改项目文件、未动 `openspec/`、未执行 git 写操作。*

## 附：阶段 1.75 界面演示（判定与确认）

1.75 未触发：C1 不成立——本次变更触达面为文档规范（ADR-0003/索引/骨架）、门禁脚本（scripts/lib 内核+双入口）、模板与 multi-root 单语化，全部为纯文档/脚本/配置面，无任何页面、组件、弹窗、布局或视觉改版；命中排除表「纯后端 / CLI / 数据迁移 / 配置 / 脚本」行。
