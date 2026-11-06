# Design

> 代码级蓝图的权威载体是同目录 [`code-design.md`](./code-design.md)（六字段全文，836 行）；本文承载其深度契约的结构化断言、全部已定裁定与执行约束。规划材料 [`decisions.md`](./decisions.md)（阶段 1.5 收敛留痕）随档。

## ① 触达面（断言概要，逐文件清单见 code-design.md ①）

| 组 | 写面（根仓） | 所属仓补充 |
| --- | --- | --- |
| 1 G-C 依赖面 | `pnpm-workspace.yaml`(catalogs) / `plugins/multi-root-workspace/package.json` / `scripts/{check-dsh-baseline,upgrade-dsh,dsh-baseline}.mjs` / `pnpm-lock.yaml`(生成物) | — |
| 2 G-C 运行时门 | multi-root `src/compat/dsh-version.ts` / `src/compat.ts` / `src/index.ts` / `tests/compat.spec.ts` / `tests/support/compat.ts` / `scripts/check-dsh-compat.mjs` / `lib/**`(生成物) | — |
| 3 G-C 文档与 spec | ADR-0009/0002/0011/0012、decisions README、multi-root AGENTS/README(.en)/docs×3/.agent/note×3、根 README/AGENTS | — |
| 4 G-A 模板外迁 | `templates/**`(新) / `tooling/template/**`(删) / `scripts/gen-plugin.mjs` / `scripts/check-architecture.mjs` / `pnpm-workspace.yaml`(注释) / 根 README/AGENTS | dotfiles：dsh-plugin-writer SKILL.md×3 + references×3（执行期单独 commit） |
| 5 G-B 清理 | 9 个 `*.tsbuildinfo` / multi-root `scripts/upgrade-dsh.mjs`(删) / ADR-0009 第二条 fork 注 | — |
| 6 收口 | 不改源码（命令与 /tmp 快照） | — |

**明确不触达**：tooling 四包源码、六软插件源码/清单、multi-root 业务行为代码（fs/sandbox/registry/scope/instructions/lsp/workspace-files/file-references/client）、`minimumReleaseAgeExclude`、`allowBuilds`、`.oxlintrc.json`、CI workflow、`openspec/specs/**`（归档 sync 才动）、历史变更与归档（`tooling/template` 旧引用保留不回改）。

## ② 证据锚

code-design.md ② 给出 5 个模块族的 file:line 事实（模板与生成器 / G-C 依赖面 / 运行时门 / 文档与 spec / 清理）+ 新建文件单列；关键锚：peers 实测 **21 条 DSH + cordis**（`:94-163`）、`hardPlugins.length !== 1` 断言（check-dsh-baseline:264）、`SUPPORTED_DSH_RELEASES`（dsh-version.ts:34）、warn enforcement（`:80-83`/`:205-217`）、spec「MUST NOT 改动 multi-root」子句（升级脚本候选树推导节）。

## ③ 接口与数据形状（关键签名，全文见 code-design.md ③）

- 运行时：`DSH_BASELINE = '0.2.2-rc.1'`（src 本地字面量 + 指针注释）→ `SUPPORTED_DSH_RANGE = '>=0.2.2-rc.1 <0.3.0'`（派生）；手写比较器（默认规则拒 `0.2.3-alpha.1`、`includePrerelease` 放行 `0.3.0-alpha.1` 需 minor 守卫）；`isSupportedDshRelease(release: string): boolean`；范围语义 =「与基线同 major.minor 且 ≥ 基线」。
- `template.json`：顶层 `{name, description, files[]}`，条目键 `template`/`output`/`format?`/`only?`（11 条 = 现 FILE_TABLE 原样外移）；gen-plugin 签名 `pnpm gen:plugin <name> --kind host-only|dual [--template <name>] [--dry-run]`，`loadTemplate()` fail-closed 校验（缺文件/未知键/空 files 即 exit 1）。
- catalogs 新 22 条键值形态：`'@deepseek-ai/<名>': '0.2.2-rc.1'` 按字母序插入（精确清单 = code-design ③ 3.3）。
- `check-dsh-compat.mjs`：断言① = peers(22 DSH) == `dsh.engines.dsh` == 派生范围；required-core-in-peers 保留；installed tree 保留「必需包可解析 + 单一 release」；开发 pin 断言删除（值归根 `dsh:check`）。

## ④ 决策记录（已定裁定，全文见 code-design.md ④ D-0..D-9 与 decisions.md）

| 裁定 | 结论 | 否决的替代 |
| --- | --- | --- |
| 运行时门形态 | **a 彻底范围化**（用户） | b 台账收窄为安全闸 |
| D1 warn 机制 | 整体删除（用户确认） | 降级为日志开关 |
| D2 导出面 | 直接删除不留别名（用户确认） | deprecated 别名 |
| D3 spec delta | 删旧+新增+改写（用户确认） | 合并改写 |
| Q1 dsh peer | **补声明**（用户确认）：22 DSH + cordis = 23 条 @deepseek-ai | 21 条 + 根门禁倒退放宽 |
| Q2 tsbuildinfo | 按实测 **9 个**全删，验证句「零命中」不锁数字（用户确认） | 按材料的 8 个 |
| Q3 升级脚本 spec | **补 MODIFIED**（用户确认）：删「MUST NOT 改动 multi-root」子句，改「同批重指运行时基线副本」，三 scenario 名保留 | 归档 sync 人工处理 |
| Q4 compat:check | 挂 multi-root `verify:all`，**不进** CI 七步链与根 dsh:check（用户确认）；同构断言由 compat.spec 在 `pnpm test` 覆盖 | CI 插步 |
| 范围常量载体 | src 本地字面量 + 指针注释（D-1） | 读自身 manifest（源码态/构建态分叉、装载期 I/O、自证循环） |
| 比较器 | 手写 ~45 行（D-2） | 引 semver（破零运行时依赖）；字符串前缀比较（排序错） |
| 运行时基线同步 | `upgrade-dsh` 新增 `repointRuntimeBaselines()` 同批重写（D-4） | 只靠人工 + 检查（升级后门红） |
| AR2/AR7 | AR2 零改动，只改 AR7 禁止条目与三处文案（D-6）；不新增 AR8 | 新增 templates 完整性 AR（gen-plugin fail-closed 已覆盖） |
| ADR/spec 写法 | append-only + RENAMED/MODIFIED + scenario 名保留（D-9；OpenSpec 1.16 validator 两条 ERROR 实测） | 改写历史正文 |
| 栈识别 | **豁免 writer skill 本次加载**（用户确认）：Spring/Nuxt 皆未命中，仓级工程改造非插件编写，延续 optimize-architecture D-13 先例；设计受仓根 AGENTS.md 与 multi-root AGENTS.md 约束 | 指认 dsh-plugin-writer；终止 |

## ⑤ 逐任务组实现要点

六组（组间串行、组内写面不相交、单组 ≤8）：**组 1** G-C 依赖面（catalogs 扩容→门禁脚本先行→manifest 改写→升级脚本→install→注释，6 任务）；**组 2** 运行时门（dsh-version 重写→compat.ts→index.ts→tests→compat:check→产物重建，6 任务）；**组 3** 文档与 spec delta（ADR append-only 四件→multi-root 全文档面→根文档→落档件只读校验，8 任务）；**组 4** 模板外迁（git mv→约定+清单→gen-plugin→AR7→自链接→根文档→dotfiles 单独 commit，7 任务）；**组 5** 清理（tsbuildinfo→shim→fork 注→复现验证，4 任务）；**组 6** 收口（七链+verify:all+双 kind 演练+三组红队+提交面复核+规范收口，8 任务）。每组 GATE 与逐任务局部验证命令见 code-design.md ⑤（tasks.md 验证句与其一致）。

## ⑥ 设计假设与未决项

code-design.md ⑥ 载 A-1..A-13（关键：`dsh.engines.dsh` 对 cordis.patch.yml 装载无副作用；template.json 四键可完整表达现 FILE_TABLE；peers 收窄后 0.2.1-rc.2/rc.5 失去声明属预期再裁剪；compat.spec 台账断言全部可映射为范围断言）。**未决项：无**——阶段 1.5 D1–D3 与落档 Q1–Q4 已全部裁定；1.75 界面演示未触发（纯后端/CLI/配置/脚本，C1 不成立，留痕 code-design.md 附录）。

## 执行约束（承接 spec-apply）

- 跨仓写面：dotfiles 仅组 4 末 6 处，**单独 commit**；根仓单 commit（auto 提交纪律由执行模式承接）。
- 红队纪律：独占窗口 + cp 备份恢复（禁 git checkout/stash，R13 先例）；install 一律 `--store-dir /home/xuqinqin/develop/.pnpm-store/v11`（R5 先例）。
- multi-root 目录自带 AGENTS.md（「改动前先读」）与 `.agent/note/` 耐久知识——组 2/3 执行子代理派发时须在提示中要求先读。
- 基线快照：`check-artifacts` 的 multi-root 模块词集将因导出面删除而变化（预期差异，B6 比对时说明，不属回归）。
