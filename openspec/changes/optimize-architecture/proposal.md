# Proposal

## Why

本仓 7 个插件的全部公共内容（构建脚本、类型配置、测试资产、host 侧语义实现）以「每包复制一份、各自漂移」存在，且漂移已实证发生：6 份 `build.mjs` 哈希互异（web-ux 的 v1.4.0 CSS 修复未传播到 session-tool-toggle 的同类潜伏 bug）、`tsconfig.base.json` 4+2 分裂（2 份旧版自创建从未更新）、三份 attribution 归属实现中两份存在 3 处实测行为分歧（含 user-commands 的并发窗口 bug）。安装模型铁律（profile 按 git tag 单目录安装、`link:` 不装依赖）决定了共享只能发生在构建期与类型期——本次把「复制-漂移」收敛为「单一事实源 + 薄引用」，使升级、扩展（新增插件）、插件联动（跨包语义一致）三个方向的成本结构性下降。

## What Changes

- 新建顶层 `tooling/` 三包（均 private、0.0.0、不入发布契约）：`build-kit`（构建期策略库，仅依赖 esbuild，策略从包事实推导）、`host-kit`（运行期共享源码：归属内核 + 未命中策略参数化 + watcher/triggers/roots/host-io/log，零依赖、被 esbuild 内联进各包产物）、`test-kit`（测试夹具底座：ui-primitives stub 并集 + locale-parity 纯函数）；另建 `tooling/template/`（非包，`pnpm gen:plugin` 的模板素材）。
- 六个软插件的 `build.mjs` 降为 3–5 行薄声明入口（`buildPlugin({ root, …旋钮 })`）；`tsconfig.base.json` 删除、统一 extends 根基准 `tsconfig.plugin.base.json` 并去 `composite`（`typecheck` 从 `tsc -b` 改为 `-p --noEmit`）；`.oxlintrc.json` 收敛到根；devDeps 工具链迁 pnpm catalog（默认册）+ DSH 家族命名册 `dsh`（`upgrade-dsh.mjs` 同批适配 catalog 感知重写）。
- 运行时语义一次性收敛（不留单独立项）：attribution 内核（resolve→逐级 realpath→最近命中）三包共享、未命中策略参数化（stt 保留其 spec 背书的 canonical-cwd 键 `registered:false`；pm/uc 为 fail-closed）；triggers/watcher/host-io/roots 四模块 pm+uc 两包对齐合并；**修复** user-commands attribution 并发窗口 bug（「建新表→一次性替换」原子索引）；**裁定** `roots[0]≠primaryRoot` 规范空白（值语义 + 一次诊断，契约成立时与现实现逐字等价）。
- 守护升级：`dsh:check` 聚合为三脚本（基线 + 结构不变式 AR1–AR7 + 产物契约 B1–B6，三个 host-only 包补上产物自包含断言真缺口）；`release.mjs` 改调聚合入口；新增 `scripts/lib/artifacts.mjs` 产物词法器单一实现与 `--baseline` 等价性工具。
- 新增 `pnpm gen:plugin <name> --kind host-only|dual` 脚手架生成命令；新增最小 GitHub Actions CI（install→lint→typecheck→build→test→docs:check→dsh:check）。
- 新增仓级 ADR 体系 `docs/decisions/`：ADR-0001（共享构建与源码 kit，推翻 docblock「不共享代码」旧结论）与 ADR-0002（归属内核：#3 裁定 + 原子索引纪律）。
- 跨仓（dotfiles）：`agent/skills/dsh-plugin-writer` 随新结构改版（15 处失效行号引用清零、复制件套流程改 `gen:plugin`），单独 commit。
- **不变**：multi-root-workspace 内核（tsc+tsdown、精确 peer/allowlist、ADR 体系）一字不动；契约类型包维持 holder 导出（D2/D3/D4 纪律）；字面量直写纪律（bundle 断言不稀释）；git tag 分发、仓库级统一版本、`lib/` 自包含产物；豁免清单生成化本次不做（另案）。

## Capabilities

### New Capabilities

- `dsh-plugin-toolchain`: 软插件的构建与工程约定——build-kit 薄入口与产物自包含守卫、根基准 tsconfig 与 lint 配置、catalog 依赖管理、tooling 包结构不变式（AR）、产物契约门禁（B）、脚手架生成命令。承载「新增插件 = 填差异清单」的持久工程行为。

### Modified Capabilities

- `dsh-baseline`: 「升级脚本候选树推导」requirement 变更——devDeps 迁 `catalog:dsh` 后，升级脚本的重指对象从各插件字面量 devDeps 变为 `catalogs.dsh` 块（跳过 `catalog:` 值不改写 + 重写后不得残留字面量断言）。
- `dsh-project-mcp`: 「工作区可见性隔离」requirement 增补——根集合契约异常行为（#3 裁定：主根身份只由 `primaryRoot` 决定，`roots` 异于它的项按原序全进附加根层、一个根不丢、异常报诊断）+ 归属索引原子重建（重扫期间不降级）。
- `dsh-user-commands`: 「三层优先级与会话遮蔽」requirement 增补——同 pm 的 #3 裁定与原子重建（修复并发窗口 bug 的 spec 回归声明：重扫期间归属判定不回退为 fail-closed）。

## Impact

- **根仓 dsh-plugins**：根配置（pnpm-workspace.yaml/package.json/tsconfig.plugin.base.json/.oxlintrc.json）、`scripts/` 五个新脚本与三个改造、`tooling/` 四个新目录、六软插件逐包（build.mjs/tsconfig/package.json/src host 层/test）、`docs/decisions/` 两条 ADR、README/AGENTS、`.github/workflows/ci.yml`、两份 spec delta。
- **跨仓 dotfiles**：`agent/skills/dsh-plugin-writer/`（SKILL.md + 三个 references 分册改版），单独 commit，执行时须加载 `writing-skills` 技能。
- **安装模型零破坏**：产物保持自包含（external 仅 `node:*` 与声明外置词）、tag 锚点安装命令与四包同装矩阵不变、两 host 插件仍可各自单独安装（共享源码构建期内联，探针已证 git 安装不装 devDeps）。
- **行为变更面（均有 spec delta）**：仅 #3 异常场景（两包 spec 均未覆盖的规范空白）与 user-commands 并发窗口修复（实现违反其自身 spec 的回归）；stt 与其余插件行为逐字不变（等价性以 `--baseline` 模块词集合比对 + 既有测试零改动为证据）。
