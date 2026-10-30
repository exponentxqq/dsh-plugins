# dsh-plugins — DSH 自定义插件单仓

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）自定义插件的统一仓库。每个插件都是一份官方组合包（bundle），以 **pnpm workspace** 单仓多包管理：源码在这里，profile 侧按 **GitHub tag** 安装。

## 目录结构

```
pnpm-workspace.yaml   # workspace 定义（packages: plugins/*）、依赖构建白名单与发布年龄豁免
package.json          # workspace 根：pnpm 版本 pin（packageManager / volta）与递归脚本
plugins/<name>/       # 一个插件一个目录（结构见 AGENTS.md）
scripts/dsh-baseline.mjs          # 唯一 DSH 基线常量（软插件范围由它派生）
scripts/upgrade-dsh.mjs           # 根级 DSH 升级：重指 pin / 软插件范围 / 豁免（--probe 加临时 overrides）
scripts/check-dsh-baseline.mjs    # 根级 dsh:check：基线 / 范围 / 安装树 / 豁免 / 已移除插件
scripts/release.mjs   # 发布：dsh:check → 同步版本号 → 重建产物 → 发布提交 → annotated tag
openspec/             # 规范工作区（spec-driven schema，zh-CN）
```

## 常用命令

```bash
pnpm install          # 装齐全部插件依赖（workspace 统一安装）
pnpm build            # 全部插件构建（产物 lib/ 随仓库提交；release 时递归重建保证新鲜）
pnpm typecheck        # 全部插件类型检查
pnpm test             # 全部插件单测
pnpm lint             # 全部插件 lint（无 lint 脚本的插件自动跳过）
pnpm docs:check       # 文档检查（仅 multi-root-workspace 实现该脚本）
pnpm dsh:check        # 仓库级 DSH 基线检查（发布前置，release 会自动执行）
pnpm dsh:upgrade <version> [--probe]   # 根级升级：重指 DSH pin / 软插件范围 / 豁免并同步基线常量
pnpm release <version>  # 发布：dsh:check → 同步版本 → 重建产物 → 提交 → 打 tag v<version>（详见「发布与版本」）
```

当前 DSH 开发基线是 **`0.2.1-rc.2`**，由 `scripts/dsh-baseline.mjs` 单点声明：multi-root 保留精确 allowlist 与精确 peers，其余三个软插件的 `engines.dsh` / DSH peer 统一为 `>=0.2.1-rc.2 <0.3.0`。Node 工具链由根 `package.json#volta.node` 固定在 `24.21.0`（`engines` 仍兼容 22.19+）。升级流程见 [multi-root 开发工作流](plugins/multi-root-workspace/docs/development/plugin-development-workflow.md)。

只跑单个插件：`pnpm --filter <包名> <脚本>`，例如 `pnpm --filter dsh-plugin-multi-root-workspace verify:all`（含 lint / typecheck / build / 内核探测 / 单测 / 冒烟，需运行中的 dsh 环境）。

## 装入 profile

profile 由 dotfiles 仓库管理（`dsh/profiles/*`）。插件按 **tag 锁定**从 GitHub 装入（`#<tag>&path:plugins/<目录>` 同时指定版本与单仓子目录）：

```bash
TAG=$(git describe --tags --abbrev=0)   # 当前 tag（也可填任意历史 tag 复现旧版本）
docker exec dsh dsh plugin --profile web add \
  "github:exponentxqq/dsh-plugins#${TAG}&path:plugins/multi-root-workspace"
docker exec dsh dsh --profile web --dump-config-schema   # 校验组合可加载（会 import 插件）
```

`dsh plugin add` 走 pnpm：把 git spec 写进 profile 的 `package.json` 依赖，并把声明了 `dsh.bundle` 的包追加进 `dsh.profile.bundles` 激活其 patch 层。移除用 `dsh plugin --profile web remove <包名>`。

两件必知的事：

- **构建授权**：v1.1.1 起各插件的构建产物 `lib/` 随仓库提交且不再带 `prepare` 脚本，git 来源安装**不触发** pnpm 的构建脚本授权（pnpm 10/11 行为一致，改 tag 也无需任何表态）。唯一例外是 multi-root 插件的注册表依赖 `koffi`（原生模块，install 脚本要预编译）：pnpm ≥11 会把 `allowBuilds: koffi:` 占位写进 profile 的 `pnpm-workspace.yaml`，改成 `true` 重跑即可；pnpm 10 会以 `ERR_PNPM_IGNORED_BUILDS` 退出，把 `koffi`（用包名）加进 `onlyBuiltDependencies`——按包名匹配、不随 tag 变化，只需表态一次。背景与机制（为何 git 来源曾是硬失败、为何键里带 commit）见 [安装停在构建授权](plugins/multi-root-workspace/docs/troubleshooting/install-stops-at-build-approval.md)。
- **`insteadOf` 改写**：若宿主 `~/.gitconfig` 写了 `url.git@github.com:.insteadOf = https://github.com/`（该文件被只读挂载进 dsh 容器），容器内 `git ls-remote` 会被改写成 ssh——dsh 容器现已挂载宿主 `~/.ssh`，钥匙对 GitHub 可用时 ssh 直连照常工作，不再是坑；仅当宿主没有可用的 GitHub 钥匙时才会失败，届时把该段拆到宿主专属的 include 文件（见 dotfiles `dsh/README.md`），或给这条命令加 `-e GIT_CONFIG_GLOBAL=/dev/null`：`docker exec -e GIT_CONFIG_GLOBAL=/dev/null dsh dsh plugin …`。

升级 = 改 profile `package.json` 里的 tag 后重装（`pnpm install` + 重启 profile）；想自动跟进同主版本也可用范围写法 `#semver:^<major>.0.0&path:plugins/<目录>`。multi-root-workspace 是个例外：自 v1.3.0 起其目录改名为 `plugins/multi-root-workspace`（包名不变），而 pnpm 的 git 依赖锚点含 `&path:`、不随 tag 自动切换，已装旧版的 profile 需按新 path 重新 `add`（旧 tag 配旧 path 仍可装回旧版本，详见[插件 README](plugins/multi-root-workspace/README.md)）。

本地开发调试仍可 `link:` 安装（改源码重启即生效，无需发布）：`dsh plugin --profile web add /home/xuqinqin/develop/person/dsh-plugins/plugins/<name>`。

## 发布与版本

仓库采用**仓库级统一版本**：根 `package.json` 与每个插件包的 `version` 始终等于当前 tag（风格 `v<major>.<minor>.<patch>`），tag 是 profile 侧安装的唯一锚点，`package.json#version` 与之对齐便于把 DSH 的 `package@version` 版本豁免和排障输出直接对上发布点。

```bash
pnpm dsh:check             # 0. 发布前置检查（release 会自动执行，也可单独跑）
pnpm verify                # 1. 发布前自检（递归 verify:all；多根插件的 smoke 需运行中的 dsh）
pnpm release <version>     # 2. dsh:check → 同步版本 → 重建产物 → 提交 chore(release): v<version> → 打 annotated tag
git push origin main --tags   # 3. push（容器已挂载宿主 ~/.ssh，可直接执行）
```

`pnpm release --dry-run <version>` 只打印将变更的版本；脚本会拒绝脏工作区、非 main 分支、已存在的 tag，以及未通过的 `dsh:check`。tag 未推到远程前，profile 无法按 `#v<version>` 解析安装。

## 插件一览

| 插件 | 说明 |
| --- | --- |
| [`dsh-plugin-multi-root-workspace`](plugins/multi-root-workspace/README.md) | 把 Workspace 的可写范围从「一个主根」扩展为「主根 + N 个附加根」；不放宽沙箱档位，附加根与主根同权。上游 `cherrchen/dsh-plugin-multi-root-workspace` 的本地 fork，含附加根一次性播种与通用附加根 `commonRoots` 两个本地扩展。 |
| [`dsh-plugin-web-ux`](plugins/web-ux/README.md) | Web 界面体验插件（双端）：状态行 provider 徽章 + 侧栏已归档会话的「删除会话」入口（两步预览确认，级联 subagent 日志、保留 fork 与共享附件）；宿主半承载 Connection RPC 通道 `/web-ux`，同时供 web 客户端模块扫描定位 `dsh.client` 声明。后续其他 Web 界面体验改动落在本包。 |
| [`dsh-plugin-project-mcp`](plugins/project-mcp/README.md) | 项目级 MCP（host-only，任何 profile 可单独安装）：各工作区根 `.dsh/mcp/` 每文件一台服务器，自动发现、加载、热重载，按工作区隔离工具可见性，`/mcp-reload` 兜底。自 `dsh-plugin-web-ux` 拆出，行为零变化。 |
| [`dsh-plugin-user-commands`](plugins/user-commands/README.md) | 用户自定义斜杠命令（host-only，任何 profile 可单独安装）：`.md` 文件即命令，正文即 prompt 模板；三层来源（内置 / `$DSH_HOME/commands/` / 各工作区根 `.dsh/commands/`）按层遮蔽、会话级隔离、热刷新、`/commands-reload` 兜底，并内置 `/init` 生成或合并更新主根 `AGENTS.md`。 |

各插件的长文档留在插件目录内：多根插件的 `docs/` 含架构、ADR、参考与排障全文；其余插件的行为说明见各自 README。OpenSpec 规范在 `openspec/specs/`，规划工件归档在 [`openspec/changes/archive/`](openspec/changes/archive/)。

## 插件开发文档（官方）

- [第一个插件](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/index.zh.md)
- [开发一个工具](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/tool.zh.md)
- [打包与安装插件](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.zh.md)

## 相关仓库与环境

- **dotfiles**（`~/develop/dotfiles`）：dotfiles 本体与 dsh profile 配置；插件在此仓库开发与发布，profile 侧只保留按 tag 锁定的 git 依赖与 bundle 清单
- **docker**（`~/develop/docker`）：dsh 运行时容器；dsh 相关命令一律 `docker exec dsh dsh …`
- 插件各自的许可证见其目录下的 `LICENSE`（多根插件 MIT，其余插件 Apache-2.0）
