# dsh-plugins — DSH 自定义插件单仓

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）自定义插件的统一仓库。每个插件都是一份官方组合包（bundle），以 **pnpm workspace** 单仓多包管理：源码在这里，profile 侧按 **GitHub tag** 安装。

## 目录结构

```
pnpm-workspace.yaml   # workspace 定义（packages: plugins/*）、依赖构建白名单与发布年龄豁免
package.json          # workspace 根：pnpm 版本 pin（packageManager / volta）与递归脚本
plugins/<name>/       # 一个插件一个目录（结构见 AGENTS.md）
scripts/release.mjs   # 发布：同步版本号 → 重建产物 → 发布提交 → annotated tag
openspec/             # 规范工作区（spec-driven schema，zh-CN）
```

## 常用命令

```bash
pnpm install          # 装齐全部插件依赖（workspace 统一安装）
pnpm build            # 全部插件构建（产物 lib/ 随仓库提交；release 时递归重建保证新鲜）
pnpm typecheck        # 全部插件类型检查
pnpm test             # 全部插件单测
pnpm lint             # 全部插件 lint（无 lint 脚本的插件自动跳过）
pnpm release <version>  # 发布：同步版本 + 重建产物 + 提交 + 打 tag v<version>（详见「发布与版本」）
```

只跑单个插件：`pnpm --filter <包名> <脚本>`，例如 `pnpm --filter dsh-plugin-multi-root-workspace verify:all`（含 lint / typecheck / build / 内核探测 / 单测 / 冒烟，需运行中的 dsh 环境）。

## 装入 profile

profile 由 dotfiles 仓库管理（`dsh/profiles/*`）。插件按 **tag 锁定**从 GitHub 装入（`#<tag>&path:plugins/<目录>` 同时指定版本与单仓子目录）：

```bash
TAG=$(git describe --tags --abbrev=0)   # 当前 tag（也可填任意历史 tag 复现旧版本）
docker exec dsh dsh plugin --profile web add \
  "github:exponentxqq/dsh-plugins#${TAG}&path:plugins/dsh-plugin-multi-root-workspace"
docker exec dsh dsh --profile web --dump-config-schema   # 校验组合可加载（会 import 插件）
```

`dsh plugin add` 走 pnpm：把 git spec 写进 profile 的 `package.json` 依赖，并把声明了 `dsh.bundle` 的包追加进 `dsh.profile.bundles` 激活其 patch 层。移除用 `dsh plugin --profile web remove <包名>`。

两件必知的事：

- **构建授权**：v1.2.0 起各插件的构建产物 `lib/` 随仓库提交且不再带 `prepare` 脚本，git 来源安装**不触发** pnpm 的构建脚本授权（pnpm 10/11 行为一致，改 tag 也无需任何表态）。唯一例外是 multi-root 插件的注册表依赖 `koffi`（原生模块，install 脚本要预编译）：pnpm ≥11 会把 `allowBuilds: koffi:` 占位写进 profile 的 `pnpm-workspace.yaml`，改成 `true` 重跑即可；pnpm 10 会以 `ERR_PNPM_IGNORED_BUILDS` 退出，把 `koffi`（用包名）加进 `onlyBuiltDependencies`——按包名匹配、不随 tag 变化，只需表态一次。背景与机制（为何 git 来源曾是硬失败、为何键里带 commit）见 [安装停在构建授权](plugins/dsh-plugin-multi-root-workspace/docs/troubleshooting/install-stops-at-build-approval.md)。
- **`insteadOf` 陷阱**：若宿主 `~/.gitconfig` 写了 `url.git@github.com:.insteadOf = https://github.com/`（该文件被只读挂载进 dsh 容器），容器内 `git ls-remote` 会被改写成 ssh 而容器没有 ssh，安装直接失败。解决办法二选一：把该段拆到宿主专属的 include 文件（容器读不到即静默跳过，见 dotfiles `dsh/README.md`），或给这条命令加 `-e GIT_CONFIG_GLOBAL=/dev/null`：`docker exec -e GIT_CONFIG_GLOBAL=/dev/null dsh dsh plugin …`。

升级 = 改 profile `package.json` 里的 tag 后重装（`pnpm install` + 重启 profile）；想自动跟进同主版本也可用范围写法 `#semver:^<major>.0.0&path:plugins/<目录>`。

本地开发调试仍可 `link:` 安装（改源码重启即生效，无需发布）：`dsh plugin --profile web add /home/xuqinqin/develop/person/dsh-plugins/plugins/<name>`。

## 发布与版本

仓库采用**仓库级统一版本**：根 `package.json` 与每个插件包的 `version` 始终等于当前 tag（风格 `v<major>.<minor>.<patch>`），tag 是 profile 侧安装的唯一锚点，`package.json#version` 与之对齐便于把 DSH 的 `package@version` 版本豁免和排障输出直接对上发布点。

```bash
pnpm verify                # 1. 发布前自检（递归 verify:all；多根插件的 smoke 需运行中的 dsh）
pnpm release <version>     # 2. 同步版本 → 重建产物 → 提交 chore(release): v<version> → 打 annotated tag
git push origin main --tags   # 3. 在宿主 push（容器内没有 ssh）
```

`pnpm release --dry-run <version>` 只打印将变更的版本；脚本会拒绝脏工作区、非 main 分支与已存在的 tag。tag 未推到远程前，profile 无法按 `#v<version>` 解析安装。

## 插件一览

| 插件 | 说明 |
| --- | --- |
| [`dsh-plugin-multi-root-workspace`](plugins/dsh-plugin-multi-root-workspace/README.md) | 把 Workspace 的可写范围从「一个主根」扩展为「主根 + N 个附加根」；不放宽沙箱档位，附加根与主根同权。上游 `cherrchen/dsh-plugin-multi-root-workspace` 的本地 fork，含附加根一次性播种与通用附加根 `commonRoots` 两个本地扩展。 |
| [`dsh-plugin-git-graph-multi`](plugins/git-graph-multi/README.md) | 单工作区多 git 子仓的分支芯片：仓库枚举、每仓平铺芯片与操作面板、跨仓（组）分支操作，均经 host 侧真实 git 执行并带守卫。`@linxin666/dsh-client-ui-git-graph@0.4.5` 的本地 fork（Apache-2.0）。 |
| [`dsh-plugin-web-ux`](plugins/web-ux/README.md) | Web 界面体验插件（client 半）：状态行 provider 徽章；宿主侧只保留一个空载载体行，供 web 客户端模块扫描定位 `dsh.client` 声明。后续其他 Web 界面体验改动落在本包。 |
| [`dsh-plugin-project-mcp`](plugins/project-mcp/README.md) | 项目级 MCP（host-only，任何 profile 可单独安装）：各工作区根 `.dsh/mcp/` 每文件一台服务器，自动发现、加载、热重载，按工作区隔离工具可见性，`/mcp-reload` 兜底。自 `dsh-plugin-web-ux` 拆出，行为零变化。 |
| [`dsh-plugin-user-commands`](plugins/user-commands/README.md) | 用户自定义斜杠命令（host-only，任何 profile 可单独安装）：`.md` 文件即命令，正文即 prompt 模板；三层来源（内置 / `$DSH_HOME/commands/` / 各工作区根 `.dsh/commands/`）按层遮蔽、会话级隔离、热刷新、`/commands-reload` 兜底，并内置 `/init` 生成或合并更新主根 `AGENTS.md`。 |

各插件的长文档留在插件目录内：多根插件的 `docs/` 含架构、ADR、参考与排障全文；git-graph-multi 的行为语义见 [`openspec/specs/dsh-multi-repo-git-graph/spec.md`](openspec/specs/dsh-multi-repo-git-graph/spec.md)（三次变更的规划工件归档在 [`openspec/changes/archive/`](openspec/changes/archive/)）。

## 插件开发文档（官方）

- [第一个插件](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/index.zh.md)
- [开发一个工具](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/tool.zh.md)
- [打包与安装插件](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.zh.md)

## 相关仓库与环境

- **dotfiles**（`~/develop/dotfiles`）：dotfiles 本体与 dsh profile 配置；插件在此仓库开发与发布，profile 侧只保留按 tag 锁定的 git 依赖与 bundle 清单
- **docker**（`~/develop/docker`）：dsh 运行时容器；dsh 相关命令一律 `docker exec dsh dsh …`
- 插件各自的许可证见其目录下的 `LICENSE`（多根插件 MIT，git-graph-multi Apache-2.0，fork 部分版权归上游作者）
