# AGENTS.md

DSH（DeepSeek Harness）自定义插件仓库：pnpm workspace 单仓多包，每个插件是一份官方组合包（bundle），profile 侧按 GitHub tag 安装。

## 语言约定

- 所有回复、解释、代码注释、文档、提交信息一律使用简体中文。

## 目录结构

- `pnpm-workspace.yaml` — workspace 定义（packages: `plugins/*` + 五个显式 tooling 包）+ allowBuilds 构建白名单 + minimumReleaseAgeExclude 发布年龄豁免
- `package.json` — workspace 根：pnpm 版本 pin（packageManager: pnpm@11.25.0）与递归脚本
- `tsconfig.plugin.base.json` — 除 multi-root 外的六个插件共用的根编译基准（各包 tsconfig 只 `extends` 它 + `include` 差异）
- `tooling/build-kit` — 构建期骨架（esbuild 宿主半 / 浏览器半 / CSS modules / 产物守卫）；`tooling/host-kit` — 运行期共享内核（归属 / 监听 / 触发器 / 根枚举 / 日志，零依赖、被内联进产物）；`tooling/client-kit` — client 半共享运行时函数（当前会话探测 + 会话 `updatedAt` 投影，TS 源消费、构建期内联）；`tooling/test-kit` — 测试夹具底座（ui-primitives 并集 / locale-parity）；`tooling/contracts` — 座位契约纯类型包
- `templates/default/` — `pnpm gen:plugin` 的默认模板素材（**不是包**：清单叫 `template.json`；件套表见 `templates/default/README.md`，多模板约定见 `templates/README.md`）
- `plugins/<name>/` — 一个插件一个目录（清单与结构见下文）
- `scripts/gen-plugin.mjs` — 新插件脚手架：从 `templates/default/` 生成骨架，`--template <name>` 可选其他模板（只写文件，不跑 git / pnpm）
- `scripts/check-{dsh-baseline,architecture,artifacts}.mjs` — 三组门禁（基线 / 结构不变式 AR1–AR8 / 产物契约 B1–B5）；`scripts/dsh-check.mjs` 是它们的聚合入口
- `scripts/release.mjs` — 发布：dsh:check → 同步版本号 → 重建产物 → 发布提交 → annotated tag
- [`docs/README.md`](docs/README.md) — 仓级文档索引页（只链接，不复制摘要）
- `docs/decisions/` — 仓级 ADR（见「仓级 ADR」）
- `docs/assessments/` — 评估档案（**非 ADR**）：现状差异与「暂不施工」依据，索引见 `docs/assessments/README.md`
- `.github/workflows/ci.yml` — 最小 CI：install → lint → typecheck → build → test → docs:check（仓级 + 递归）→ spec:check → dsh:check
- `README.md` — 仓库说明与常用命令；`openspec/` — OpenSpec 规范工作区（spec-driven，zh-CN）
- `.dsh/skills/` — OpenSpec 安装的 DSH skill（本地生成，勿手改，不入库）

## 插件清单（统一版本，各自独立 bundle）

- `dsh-plugin-multi-root-workspace` — 给沙箱作用域追加 N 个附加工作区根；目录内有独立 `AGENTS.md` 与 `docs/`，改动前先读
- `dsh-plugin-workspace-config` — 统一「工作区配置」入口（双端 holder）：侧栏面板行（`sidebar.panellist`，id `workspace-config`、order 20）+ 主区域独立页面（`main` 注册、key 与面板行 id 同一值），页面级统一工作区选择框 + 分节 tab（`workspace-config.section` 座位，multi-root-workspace / session-tool-toggle / web-ux 三方软注册贡献分节，缺贡献方节自动隐藏）；与 multi-root-workspace / session-tool-toggle / web-ux 四包同装
- `project-mcp` — 从各工作区根 `.dsh/mcp/` 发现项目级 MCP 服务器，工具可见性按工作区隔离、热重载，名字（资源服务器名与服务器指令段）与资源面隔离
- `user-commands` — markdown 定义的用户斜杠命令（builtin / `$DSH_HOME/commands` / 各工作区根 `.dsh/commands` 三层），内置 prompt 型 `/init` 与宿主侧只读的 `/inventory`（会话 MCP + skill 清单）
- `web-ux` — Web 界面体验（双端）：composer 状态行的模型提供商徽章 + 侧栏已归档会话的删除入口（宿主半承载 Connection RPC 通道 `/web-ux`）+ 命令结果通知卡（结果无处渲染时兜底，视图挂载即自隐）
- `session-tool-toggle` — 会话级工具面开关（双端）：`mcp:<server>` 整组 / 单工具 / `tool:<name>` 内置工具（保护名单拒关）、`skill:<name>` 技能级开关（只对模型隐身、`/name` 调用保留）在会话内可关，`/tools` 命令面与会话头部工具区的 Web 面板共用同一状态，用户级默认档在 `$DSH_HOME/session-tool-toggle/defaults.json`、工作区级默认档在 `$DSH_HOME/session-tool-toggle/workspaces.json`（按工作区规范路径为键），新会话按并集播种、不追溯
- `zcode-plan` — bigmodel GLM Coding Plan 的 ZCode 折扣凭证桥接（host-only）：`/zcode-plan` 五子命令（login / logout / status / route / refresh），org/project 必填；profile 层注册 `llm-pi-ai.providers['zcode-plan']` 路由，不改 `agent-default-model`

## 插件结构约定

- 包名一律 `dsh-plugin-<目录名>`；`package.json` 以 `dsh.bundle.patch` 声明 `cordis.patch.yml`（insert 本包注册行）
- 源码在 `src/`（TypeScript，入口 `src/index.ts`，导出 `name` / `inject` / `apply`），构建产物在 `lib/`（`main` 指向 `lib/index.js`，随仓库提交）
- 构建：除 multi-root 外的六个插件用 `@dsh-plugins/build-kit` 的薄入口——`build.mjs` 只声明不可推导的旋钮（`hostExternals` / `cjsRequireShim` / `cssClassPrefix`），esbuild 策略在 kit 里从包事实推导；multi-root-workspace 仍走自己的 tsc + tsdown
- 编译基准统一 `tsconfig.plugin.base.json`：各包 tsconfig 只 `extends` + `include`（不重声明编译选项、不带 `composite`），`typecheck` 用 `tsc -p` 非 emit 调用（双端包 host + client 两段）；lint 唯一基准是根 `.oxlintrc.json`
- 测试：vitest（全部包统一 `test/` 目录——multi-root 原为 `tests/`，2026-11-07 统一），三个双端插件与模板的 `vitest.config.ts` 是 3 行薄声明（`defineWebTestConfig({ root: import.meta.dirname })`，配置知识在 `tooling/test-kit/README.md`，AR8 守住唯一 import 源）；lint 用 oxlint
- web 侧插件（multi-root-workspace、workspace-config、web-ux、session-tool-toggle）在 `dsh.client` 声明 `platform: web` 与 `inject` 列表；四包须同装（安装矩阵见 README）
- 新增插件用 `pnpm gen:plugin <name> --kind host-only|dual [--template <name>]` 从 `templates/default/` 生成骨架（默认 `default`，开箱通过 lint / typecheck / build / test 与 `pnpm dsh:check`），不要手工复制件套

## DSH 基线

- 唯一版本常量在 `scripts/dsh-baseline.mjs`（当前 `0.2.2-rc.1`，Node 工具链 `24.21.0`）。
- 全部七个插件（含 multi-root）的 `engines.dsh` 与 DSH peer 统一由基线派生为 `>=0.2.2-rc.1 <0.3.0`，无例外。
- multi-root 运行时门持有的基线副本（`plugins/multi-root-workspace/src/compat/dsh-version.ts` 的 `DSH_BASELINE`）与派生范围同源，由升级脚本同批重指；基线提升 = 改 `scripts/dsh-baseline.mjs` 后跑 `pnpm dsh:upgrade`，绿灯是回归证据。
- `pnpm dsh:upgrade <version> [--probe]` 统一重指 devDeps / cordis / 全部插件的 engines 与 DSH peer 范围 / 运行时基线副本 / 豁免；`pnpm dsh:check` 在发布前守住这些事实，`release` 已自动调用。

## 开发与验证命令

node 族命令走 volta/pnpm 包装脚本（见 dotfiles `CLAUDE.md`）；dsh 一律 `docker exec dsh dsh …`。

```bash
# 仓库根执行（递归全部插件）
pnpm install             # 装齐依赖
pnpm gen:plugin <name> --kind host-only|dual   # 新插件脚手架（--help 看用法；生成后按打印的 5 步执行）
pnpm gen:plugin --check  # manifest 形态对账（按需；全部软插件与模板逐键对账，无白名单 fail-closed）
pnpm build               # 构建全部插件（产物 lib/ 随仓库提交，release 时递归重建）
pnpm typecheck           # 递归类型检查
pnpm test                # 递归单测
pnpm lint                # 递归 lint（无该脚本的插件自动跳过）
pnpm docs:check          # 文档检查：仓级 node scripts/check-docs.mjs + pnpm -r 递归（multi-root dual 入口）
pnpm spec:check          # 规范检查（OpenSpec strict 全量：openspec validate --all --strict）
pnpm dsh:check           # 聚合门禁：DSH 基线 + 结构不变式（AR1–AR8）+ 产物契约（B1–B5）
pnpm dsh:upgrade <version> [--probe]   # 根级 DSH 升级（重指 pin / 全部插件范围 / 运行时基线副本 / 豁免）
pnpm verify              # 发布前自检（递归 verify:all；multi-root 的 smoke 只需 `pnpm install` 后的 devDependency dsh CLI，
                         # 零容器、零真实凭证——journey 用本机 OpenAI 兼容假端点 + 隔离 scratch `$DSH_HOME`）
pnpm release <version>   # 发布（--dry-run 只打印；会先跑 dsh:check）

# 只跑单个插件
pnpm --filter dsh-plugin-multi-root-workspace verify:all
```

```bash
# 安装插件到 profile（按 tag 从 GitHub 装；#<tag>&path: 同时指定版本与单仓子目录）
TAG=$(git describe --tags --abbrev=0)
docker exec dsh dsh plugin --profile web add \
  "github:exponentxqq/dsh-plugins#${TAG}&path:plugins/<name>"
# 仅 multi-root 的 koffi（注册表原生依赖）需表态一次：pnpm ≥11 把 allowBuilds 占位改 true，
# pnpm 10 把 koffi（用包名）加进 onlyBuiltDependencies——详见其 docs/troubleshooting 排障文档
# 宿主 ~/.gitconfig 的 insteadOf=ssh 改写现已无害（dsh 容器挂载了宿主 ~/.ssh）；ssh 认证不可用时再加 -e GIT_CONFIG_GLOBAL=/dev/null
# 本地调试可 link: 安装（改源码重启 profile 即生效）：docker exec dsh dsh plugin --profile web add <本仓>/plugins/<name>
docker exec dsh dsh --profile web --dump-config          # 校验配置可加载（合成完整配置树；安装冒烟以此为准）
docker exec dsh dsh --profile web --dump-config-schema   # 查看 schema/逐条目装配形态（会 import 插件模块）
# 注：dsh 0.2.2-rc.1 的 --dump-config-schema 全局 exit 1 为既有豁免——官方 dsh-agent-preset 的
# 自定义载体（EntryGroup.key 标记类）触发 4 条 unrecognized Loader tree carrier；装载门禁只认 --dump-config exit 0
```

DSH 源码与 API 参考位于 `/usr/local/lib/node_modules/@deepseek-ai/dsh/`（各子包 `README.zh.md` 有中文文档）。

## 发布与版本

仓库级统一版本：根 `package.json` 与各插件的 `version` 恒等于当前 tag（`v<major>.<minor>.<patch>`），tag 是 profile 侧安装的唯一锚点。`scripts/release.mjs` 拒绝脏工作区、非 main 分支与已存在的 tag；push 可直接在容器内执行（dsh 容器已挂载宿主 `~/.ssh`）：`git push origin main --tags`；tag 未推远程前 profile 无法按 `#v<version>` 解析安装。

## 仓级 ADR

- 结构性决策记录在 `docs/decisions/`：`ADR-0001`（共享构建与源码包 `tooling/` 五包的落地边界）与 `ADR-0002`（归属内核与 `#3` 值语义），索引见 [`docs/decisions/README.md`](docs/decisions/README.md)。
- `ADR-0003`（文档体系分层与门禁）见 [`docs/decisions/ADR-0003-doc-system-layers-and-gates.md`](docs/decisions/ADR-0003-doc-system-layers-and-gates.md)。
- 仓级 ADR 与 `plugins/multi-root-workspace/docs/decisions/` 的插件级 ADR 是**两套独立编号**；引用时必须带路径——裸写「ADR-0009」有歧义（仓级没有 0009，multi-root 的 0009 是 DSH 兼容契约）。
- 插件业务规格仍以 `openspec/specs/` 为准；ADR 只约束仓级结构与工程约定。

## Codebase Memory 索引

已索引，project 名 `home-xuqinqin-develop-person-dsh-plugins`（绝对路径去掉开头 `/`、其余 `/` 换 `-`）。检索优先 codebase-memory-mcp（`search_graph` / `search_code` / `get_file_outline` / `get_architecture`），未索引或纯文本/文件名匹配才回退 grep/glob。

## OpenSpec 工作流

- 新功能/变更先走 `.dsh/skills/openspec-propose` 生成提案（proposal/specs/design/tasks），确认后用 `openspec-apply-change` 实施——规划与实施严格分离
- CLI：`openspec list`、`openspec validate --all`、`openspec doctor`；规范产物 zh-CN，结构标题与 SHALL/MUST 关键字保留英文
- `openspec/` 随仓库提交；`.dsh/`、`.opencode/` 为本地工具生成物，已由 `.gitignore` 忽略，不入库
