# dsh-plugins — DSH 自定义插件单仓

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）自定义插件的统一仓库。每个插件都是一份官方组合包（bundle），以 **pnpm workspace** 单仓多包管理：源码在这里，profile 侧按 **GitHub tag** 安装。

## 目录结构

```
pnpm-workspace.yaml   # workspace 定义（packages: plugins/* + 四个显式 tooling 包）、构建白名单与发布年龄豁免
package.json          # workspace 根：pnpm 版本 pin（packageManager / volta）与递归脚本
tsconfig.plugin.base.json  # 除 multi-root 外的六个插件共用的根编译基准（各包 tsconfig 只 extends 它）
tooling/build-kit/    # 构建期骨架：esbuild 宿主半 / 浏览器半 / CSS modules / 产物守卫（薄 build.mjs 的唯一实现）
tooling/host-kit/     # 运行期共享内核：归属判定 / 目录监听 / 触发器 / 根枚举 / 日志（被 esbuild 内联进各包产物）
tooling/test-kit/     # 测试夹具底座：ui-primitives 并集替身 / locale-parity 纯函数
tooling/contracts/    # 座位契约纯类型包（workspace-config.section 的 Seat / SlotMap 条目形状 / order 权威值，仅编译期消费）
templates/default/    # gen:plugin 默认模板素材（不是包；多模板约定见 templates/README.md）
plugins/<name>/       # 一个插件一个目录（结构见 AGENTS.md）
scripts/dsh-baseline.mjs          # 唯一 DSH 基线常量（全部插件的软范围与运行时基线副本由它派生）
scripts/upgrade-dsh.mjs           # 根级 DSH 升级：重指 pin / 全部插件范围 / 运行时基线副本 / 豁免（--probe 加临时 overrides）
scripts/gen-plugin.mjs            # 新插件脚手架：默认从 templates/default/ 生成 plugins/<name>/（--template 可选其他模板）
scripts/check-dsh-baseline.mjs    # 检查 1/3：DSH 基线 / 范围 / 安装树 / 豁免 / 已移除插件
scripts/check-architecture.mjs    # 检查 2/3：结构不变式 AR1–AR8（薄入口 / tsconfig / lint 唯一基准 / workspace 清单）
scripts/check-artifacts.mjs       # 检查 3/3：产物契约 B1–B5（入口存在 / 自包含 / ModuleLoader 壳）
scripts/dsh-check.mjs             # dsh:check 聚合入口：顺序跑上面三个检查脚本
scripts/release.mjs   # 发布：dsh:check → 同步版本号 → 重建产物 → 发布提交 → annotated tag
.github/workflows/ci.yml  # 最小 CI：install → lint → typecheck → build → test → docs:check → spec:check → dsh:check
docs/assessments/     # 评估档案（非 ADR）：现状差异与「暂不施工」依据，见 docs/assessments/README.md
openspec/             # 规范工作区（spec-driven schema，zh-CN）
```

## 常用命令

```bash
pnpm install          # 装齐全部插件依赖（workspace 统一安装）
pnpm gen:plugin <name> --kind host-only|dual   # 新插件脚手架（--help 看用法；只写文件，不跑 install/git）
pnpm gen:plugin --check  # manifest 形态对账：全部软插件与模板逐键比对（按需；无白名单，任一差异 exit 1）
pnpm build            # 全部插件构建（产物 lib/ 随仓库提交；release 时递归重建保证新鲜）
pnpm typecheck        # 全部插件类型检查
pnpm test             # 全部插件单测
pnpm lint             # 全部插件 lint（无 lint 脚本的插件自动跳过）
pnpm docs:check       # 文档检查（仅 multi-root-workspace 实现该脚本）
pnpm spec:check       # 规范检查（OpenSpec strict 全量：openspec validate --all --strict）
pnpm dsh:check        # 聚合门禁：DSH 基线 + 结构不变式（AR1–AR8）+ 产物契约（B1–B5）；release 会自动执行
pnpm dsh:upgrade <version> [--probe]   # 根级升级：重指 DSH pin / 全部插件范围 / 运行时基线副本 / 豁免并同步基线常量
pnpm release <version>  # 发布：dsh:check → 同步版本 → 重建产物 → 提交 → 打 tag v<version>（详见「发布与版本」）
```

测试接线：三个双端插件（session-tool-toggle / web-ux / workspace-config）与 `templates/default/` 的 `vitest.config.ts` 都是 3 行薄声明——只从 `@dsh-plugins/test-kit/vitest` 取 `defineWebTestConfig` 并传 `root: import.meta.dirname`；include 双面（`.test.ts` / `.test.tsx`）与 primitives alias 接缝等配置知识在 [`tooling/test-kit/README.md`](tooling/test-kit/README.md)，`pnpm dsh:check` 的 AR8 门禁守住唯一 import 源。

新增插件 = `pnpm gen:plugin <name> --kind host-only|dual [--template <name>]` 从 `templates/default/` 生成骨架（默认模板 `default`，多模板约定见 [`templates/README.md`](templates/README.md)；薄 `build.mjs`、extends 根基准的 tsconfig、`catalog:` 依赖、冒烟测试与 bundle patch），再按生成器打印的 5 步命令安装与验证；生成物开箱通过 lint / typecheck / build / test 与 `pnpm dsh:check`，模板素材本身不是包（件套表见 [`templates/default/README.md`](templates/default/README.md)）。

当前 DSH 开发基线是 **`0.2.2-rc.1`**，由 `scripts/dsh-baseline.mjs` 单点声明：全部七个插件（含 multi-root）的 `engines.dsh` / DSH peer 统一按基线派生为 `>=0.2.2-rc.1 <0.3.0`；multi-root 运行时门持有的基线副本（`plugins/multi-root-workspace/src/compat/dsh-version.ts` 的 `DSH_BASELINE`）由 `pnpm dsh:upgrade` 同批重指，提升基线 = 改该常量后跑 `pnpm dsh:upgrade`。Node 工具链由根 `package.json#volta.node` 固定在 `24.21.0`（`engines` 仍兼容 22.19+）。升级流程见 [multi-root 开发工作流](plugins/multi-root-workspace/docs/development/plugin-development-workflow.md)。

只跑单个插件：`pnpm --filter <包名> <脚本>`，例如 `pnpm --filter dsh-plugin-multi-root-workspace verify:all`（含 lint / 兼容门 / typecheck / build / 内核探测 / 单测 / 冒烟）。冒烟不依赖已启动的 dsh 服务（零容器、零真实凭证）：只需 `pnpm install` 后的 devDependency dsh CLI——journey 用本机 OpenAI 兼容假端点 + 隔离 scratch `$DSH_HOME`。

## 装入 profile

profile 由 dotfiles 仓库管理（`dsh/profiles/*`）。插件按 **tag 锁定**从 GitHub 装入（`#<tag>&path:plugins/<目录>` 同时指定版本与单仓子目录）：

```bash
TAG=$(git describe --tags --abbrev=0)   # 当前 tag（也可填任意历史 tag 复现旧版本）
docker exec dsh dsh plugin --profile web add \
  "github:exponentxqq/dsh-plugins#${TAG}&path:plugins/multi-root-workspace"
docker exec dsh dsh --profile web --dump-config          # 校验组合可加载（安装冒烟探针；schema dump 的 4 条既有 preset error 见 AGENTS.md）
```

`dsh plugin add` 走 pnpm：把 git spec 写进 profile 的 `package.json` 依赖，并把声明了 `dsh.bundle` 的包追加进 `dsh.profile.bundles` 激活其 patch 层。移除用 `dsh plugin --profile web remove <包名>`。

**四包同装**：统一工作区配置入口由 `dsh-plugin-workspace-config`（holder）与 `dsh-plugin-multi-root-workspace` / `dsh-plugin-session-tool-toggle` / `dsh-plugin-web-ux`（分节贡献方）四个包组成，须同一 tag 一并装入才有完整分节（Folders / 工作区默认档 / 会话管理）。这是 **BREAKING**（安装矩阵语义）：三枚旧 footer 入口已硬移除、不做共存探测或配置开关——只装贡献方不装 holder 时其分节入口不存在（multi-root 仍走 Files tab 入口与 `/workspace-folders`，session-tool-toggle 仍走会话头部入口与 `/tools`，web-ux 的会话管理 GUI 不可达为已知接受项）；升级时四包须一起到同一 tag——holder 是新包、需先 `add` 一次，其余三包改 tag 后重装。

两件必知的事：

- **构建授权**：v1.1.1 起各插件的构建产物 `lib/` 随仓库提交且不再带 `prepare` 脚本，git 来源安装**不触发** pnpm 的构建脚本授权（pnpm 10/11 行为一致，改 tag 也无需任何表态）。唯一例外是 multi-root 插件的注册表依赖 `koffi`（原生模块，install 脚本要预编译）：pnpm ≥11 会把 `allowBuilds: koffi:` 占位写进 profile 的 `pnpm-workspace.yaml`，改成 `true` 重跑即可；pnpm 10 会以 `ERR_PNPM_IGNORED_BUILDS` 退出，把 `koffi`（用包名）加进 `onlyBuiltDependencies`——按包名匹配、不随 tag 变化，只需表态一次。背景与机制（为何 git 来源曾是硬失败、为何键里带 commit）见 [安装停在构建授权](plugins/multi-root-workspace/docs/troubleshooting/install-stops-at-build-approval.md)。
- **`insteadOf` 改写**：若宿主 `~/.gitconfig` 写了 `url.git@github.com:.insteadOf = https://github.com/`（该文件被只读挂载进 dsh 容器），容器内 `git ls-remote` 会被改写成 ssh——dsh 容器现已挂载宿主 `~/.ssh`，钥匙对 GitHub 可用时 ssh 直连照常工作，不再是坑；仅当宿主没有可用的 GitHub 钥匙时才会失败，届时把该段拆到宿主专属的 include 文件（见 dotfiles `dsh/README.md`），或给这条命令加 `-e GIT_CONFIG_GLOBAL=/dev/null`：`docker exec -e GIT_CONFIG_GLOBAL=/dev/null dsh dsh plugin …`。

升级 = 改 profile `package.json` 里的 tag 后重装（`pnpm install` + 重启 profile）；想自动跟进同主版本也可用范围写法 `#semver:^<major>.0.0&path:plugins/<目录>`。multi-root-workspace 是个例外：自 v1.3.0 起其目录改名为 `plugins/multi-root-workspace`（包名不变），而 pnpm 的 git 依赖锚点含 `&path:`、不随 tag 自动切换，已装旧版的 profile 需按新 path 重新 `add`（旧 tag 配旧 path 仍可装回旧版本，详见[插件 README](plugins/multi-root-workspace/README.md)）。

本地开发调试仍可 `link:` 安装（改源码重启即生效，无需发布）：`dsh plugin --profile web add /home/xuqinqin/develop/person/dsh-plugins/plugins/<name>`。

## 发布与版本

仓库采用**仓库级统一版本**：根 `package.json` 与每个插件包的 `version` 始终等于当前 tag（风格 `v<major>.<minor>.<patch>`），tag 是 profile 侧安装的唯一锚点，`package.json#version` 与之对齐便于把 DSH 的 `package@version` 版本豁免和排障输出直接对上发布点。

```bash
pnpm dsh:check             # 0. 聚合门禁（DSH 基线 + 结构不变式 + 产物契约；release 会自动执行，也可单独跑）
pnpm verify                # 1. 发布前自检（递归 verify:all；多根插件的 smoke 只需 `pnpm install` 后的 devDependency dsh CLI，
                           #    零容器、零真实凭证——journey 用本机 OpenAI 兼容假端点 + 隔离 scratch `$DSH_HOME`）
pnpm release <version>     # 2. dsh:check → 同步版本 → 重建产物 → 提交 chore(release): v<version> → 打 annotated tag
git push origin main --tags   # 3. push（容器已挂载宿主 ~/.ssh，可直接执行）
```

`pnpm release --dry-run <version>` 只打印将变更的版本；脚本会拒绝脏工作区、非 main 分支、已存在的 tag，以及未通过的 `dsh:check`。tag 未推到远程前，profile 无法按 `#v<version>` 解析安装。

## 插件一览

| 插件 | 说明 |
| --- | --- |
| [`dsh-plugin-multi-root-workspace`](plugins/multi-root-workspace/README.md) | 把 Workspace 的可写范围从「一个主根」扩展为「主根 + N 个附加根」；不放宽沙箱档位，附加根与主根同权。上游 `cherrchen/dsh-plugin-multi-root-workspace` 的本地 fork，含附加根一次性播种与通用附加根 `commonRoots` 两个本地扩展。 |
| [`dsh-plugin-workspace-config`](plugins/workspace-config/README.md) | 统一工作区配置入口（holder，双端，零业务逻辑）：侧栏 footer 只留一枚「工作区配置」入口（宽栏图标 + 文案、折叠轨图标，两形态均可见）+ 统一分节弹窗（声明 `workspace-config.section` 座位，导航 + 懒渲染 + 空态），把各插件自注册的 footer 入口收敛为一处；须与 `dsh-plugin-multi-root-workspace` / `dsh-plugin-session-tool-toggle` / `dsh-plugin-web-ux` **四包同装**才有完整分节（旧入口已硬移除，未装 holder 时 web-ux 会话管理 GUI 不可达）。 |
| [`dsh-plugin-web-ux`](plugins/web-ux/README.md) | Web 界面体验插件（双端）：状态行 provider 徽章 + 侧栏已归档会话的「删除会话」入口（两步预览确认，级联 subagent 日志、保留 fork 与共享附件）+ 命令结果通知卡（空会话首屏等结果无处渲染的场景，可展开全文，视图挂载即自隐）；宿主半承载 Connection RPC 通道 `/web-ux`，同时供 web 客户端模块扫描定位 `dsh.client` 声明。后续其他 Web 界面体验改动落在本包。 |
| [`dsh-plugin-project-mcp`](plugins/project-mcp/README.md) | 项目级 MCP（host-only，任何 profile 可单独安装）：各工作区根 `.dsh/mcp/` 每文件一台服务器，自动发现、加载、热重载，按工作区隔离工具可见性，`/mcp-reload` 兜底；名字（资源服务器名与服务器指令段）与资源面隔离。自 `dsh-plugin-web-ux` 拆出，行为零变化。 |
| [`dsh-plugin-user-commands`](plugins/user-commands/README.md) | 用户自定义斜杠命令（host-only，任何 profile 可单独安装）：`.md` 文件即命令，正文即 prompt 模板；三层来源（内置 / `$DSH_HOME/commands/` / 各工作区根 `.dsh/commands/`）按层遮蔽、会话级隔离、热刷新、`/commands-reload` 兜底，并内置 `/init`（生成或合并更新主根 `AGENTS.md`）与宿主侧只读的 `/inventory`（列出本会话实际可见的 MCP 服务器与可用 skill，零模型消息）。 |
| [`dsh-plugin-session-tool-toggle`](plugins/session-tool-toggle/README.md) | 会话级工具面开关（双端）：在单个会话内关掉不需要的工具面——`mcp:<server>` 整组（工具 schema 与服务器指令段一并移除）、`mcp:<server>::<tool>` 单工具与尾部通配（仅移除 schema）、`tool:<name>` 内置工具（硬保护名单拒关）、`skill:<name>` 技能级开关（只对模型隐身：模型技能目录与 `skill` 工具加载一并移除，用户 `/name` 调用保留，不进工具掩码），下一次模型步骤生效，`tools.restrict` 掩码 + dispatch guard 双层强制；入口为 `/tools` 命令面与会话头部工具区的 Web 面板（共用同一状态与同一持久化，通道 `/session-tool-toggle`），用户级默认档在 `$DSH_HOME/session-tool-toggle/defaults.json`、工作区级默认档在 `$DSH_HOME/session-tool-toggle/workspaces.json`（按工作区规范路径为键），新会话按两者并集播种且只在会话创建时快照、不追溯；宿主半任何 profile 可装，无 Web 组合时命令面独立可用。 |
| [`dsh-plugin-zcode-plan`](plugins/zcode-plan/README.md) | bigmodel.cn GLM Coding Plan 的 ZCode 折扣桥接（host-only，任何 profile 可单独安装）：`/zcode-plan` 五子命令（login / logout / status / route / refresh），org/project 必填；profile 层注册 `llm-pi-ai.providers['zcode-plan']`，不改 `agent-default-model`。折扣 = 凭证链（usageScene=1 Key + clientType=zcode 换发的 PAT）**+ 官方客户端请求签名体系**（get_sign_key 握手 → 账户私钥 → 每请求 Ed25519 签名 + PoW，零官方机密）；实测签名刻度 0.952 vs 无签名 1.543（比值 0.617，等效 ~1.62x 额度）。 |

各插件的长文档留在插件目录内：多根插件的 `docs/` 含架构、ADR、参考与排障全文；其余插件的行为说明见各自 README。OpenSpec 规范在 `openspec/specs/`，规划工件归档在 [`openspec/changes/archive/`](openspec/changes/archive/)。

## 插件开发文档（官方）

- [第一个插件](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/index.zh.md)
- [开发一个工具](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/tool.zh.md)
- [打包与安装插件](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.zh.md)

## 相关仓库与环境

- **dotfiles**（`~/develop/dotfiles`）：dotfiles 本体与 dsh profile 配置；插件在此仓库开发与发布，profile 侧只保留按 tag 锁定的 git 依赖与 bundle 清单
- **docker**（`~/develop/docker`）：dsh 运行时容器；dsh 相关命令一律 `docker exec dsh dsh …`
- 插件各自的许可证见其目录下的 `LICENSE`（多根插件 MIT，其余插件 Apache-2.0）
