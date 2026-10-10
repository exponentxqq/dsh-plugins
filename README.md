# dsh-plugins — DSH 自定义插件单仓

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）自定义插件的统一仓库。每个插件都是一份官方组合包（bundle），以 **pnpm workspace** 单仓多包管理：源码在这里，profile 侧用 `link:` 安装。

## 目录结构

```
pnpm-workspace.yaml   # workspace 定义（packages: plugins/*）、依赖构建白名单与发布年龄豁免
package.json          # workspace 根：pnpm 版本 pin（packageManager / volta）与递归脚本
plugins/<name>/       # 一个插件一个目录（结构见 AGENTS.md）
openspec/             # 规范工作区（spec-driven schema，zh-CN）
```

## 常用命令

```bash
pnpm install          # 装齐全部插件依赖（workspace 统一安装；会触发多根插件的 prepare 构建）
pnpm build            # 全部插件构建（产物 lib/ 不入库，装入 profile 前必须先构建）
pnpm typecheck        # 全部插件类型检查
pnpm test             # 全部插件单测
pnpm lint             # 全部插件 lint（无 lint 脚本的插件自动跳过）
```

只跑单个插件：`pnpm --filter <包名> <脚本>`，例如 `pnpm --filter dsh-plugin-multi-root-workspace verify:all`（含 lint / typecheck / build / 内核探测 / 单测 / 冒烟，需运行中的 dsh 环境）。

## 装入 profile

profile 由 dotfiles 仓库管理（`dsh/profiles/*`），插件以 `link:` 形式装入，容器内路径与宿主一致：

```bash
docker exec dsh dsh plugin --profile web add /home/xuqinqin/develop/person/dsh-plugins/plugins/<name>
docker exec dsh dsh --profile web --dump-config-schema   # 校验组合可加载（会 import 插件）
```

`dsh plugin add` 会做两件事：把 `link:` 依赖写进 profile 的 `package.json`（改源码后重启 profile 即生效，无需重装），并把声明了 `dsh.bundle` 的包追加进 `dsh.profile.bundles` 激活其 patch 层。移除用 `dsh plugin --profile web remove <包名>`。

## 插件一览

| 插件 | 说明 |
| --- | --- |
| [`dsh-plugin-multi-root-workspace`](plugins/dsh-plugin-multi-root-workspace/README.md) | 把 Workspace 的可写范围从「一个主根」扩展为「主根 + N 个附加根」；不放宽沙箱档位，附加根与主根同权。上游 `cherrchen/dsh-plugin-multi-root-workspace` 的本地 fork，含附加根一次性播种与通用附加根 `commonRoots` 两个本地扩展。 |
| [`dsh-plugin-git-graph-multi`](plugins/git-graph-multi/README.md) | 单工作区多 git 子仓的分支芯片：仓库枚举、每仓平铺芯片与操作面板、跨仓（组）分支操作，均经 host 侧真实 git 执行并带守卫。`@linxin666/dsh-client-ui-git-graph@0.4.5` 的本地 fork（Apache-2.0）。 |
| [`hello`](plugins/hello/README.md) | 最小可用的插件模板（纯 ESM 三件套），复制即新插件起点。 |

各插件的长文档留在插件目录内：多根插件的 `docs/` 含架构、ADR、参考与排障全文；git-graph-multi 的行为语义见 [`openspec/specs/dsh-multi-repo-git-graph/spec.md`](openspec/specs/dsh-multi-repo-git-graph/spec.md)（三次变更的规划工件归档在 [`openspec/changes/archive/`](openspec/changes/archive/)）。

## 插件开发文档（官方）

- [第一个插件](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/index.zh.md)
- [开发一个工具](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/tool.zh.md)
- [打包与安装插件](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.zh.md)

## 相关仓库与环境

- **dotfiles**（`~/develop/dotfiles`）：dotfiles 本体与 dsh profile 配置；插件在此仓库开发，profile 侧只保留 `link:` 引用与 bundle 清单
- **docker**（`~/develop/docker`）：dsh 运行时容器；dsh 相关命令一律 `docker exec dsh dsh …`
- 插件各自的许可证见其目录下的 `LICENSE`（多根插件 MIT，git-graph-multi Apache-2.0，fork 部分版权归上游作者）
