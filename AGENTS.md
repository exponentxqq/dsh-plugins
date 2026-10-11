# AGENTS.md

DSH（DeepSeek Harness）自定义插件仓库。每个插件以官方组合包（bundle）形式独立成目录。

## 语言约定

- 所有回复、解释、代码注释、文档、提交信息一律使用简体中文。

## 目录结构

```
pnpm-workspace.yaml      # workspace 定义（packages: plugins/*）+ 构建白名单 / 发布年龄豁免
package.json             # workspace 根：pnpm 版本 pin 与递归脚本
plugins/<name>/          # 一个插件一个目录（见下文插件结构）
scripts/release.mjs      # 发布：同步版本号 → 重建产物 → 发布提交 → annotated tag
README.md                # 仓库说明与常用命令
.dsh/skills/             # OpenSpec 安装的 DSH skill（本地生成，由 openspec 管理，勿手改）
openspec/                # OpenSpec 规范工作区（spec-driven schema，zh-CN）
```

## 插件结构约定

每个插件目录固定三件套（参照 dotfiles `dsh/README.md` 的 bundle 规范）：

```
plugins/<name>/
├── package.json       # name 一律 dsh-plugin-<name>；声明 dsh.bundle.patch
├── cordis.patch.yml   # insert 本包注册的插件行（按包名引用）
└── index.js           # 插件实现（纯 ESM，导出 name / apply）
```

## 开发与验证命令

环境规则：node 族命令走 volta/pnpm 包装脚本（见 dotfiles `CLAUDE.md`），dsh 一律通过容器执行。

```bash
# workspace 级命令（在仓库根执行；pnpm 版本由 package.json#packageManager 固定为 11.25.0）
pnpm install             # 装齐全部插件依赖（单包目录内执行同效）
pnpm build               # 递归构建全部插件（产物 lib/ 随仓库提交，release 时递归重建）
pnpm typecheck           # 递归类型检查
pnpm test                # 递归单测
pnpm lint                # 递归 lint（无该脚本的插件自动跳过）
pnpm release <version>   # 发布：同步版本 + 重建产物 + 发布提交 + 打 tag v<version>（--dry-run 只打印）

# 只跑单个插件
pnpm --filter dsh-plugin-multi-root-workspace verify:all
```

```bash
# 安装插件到某个 profile（按 tag 从 GitHub 装；#<tag>&path: 同时指定版本与单仓子目录）
TAG=$(git describe --tags --abbrev=0)   # 当前 tag（也可填任意历史 tag）
docker exec dsh dsh plugin --profile web add \
  "github:exponentxqq/dsh-plugins#${TAG}&path:plugins/<name>"

# 插件产物 lib/ 随 tag 提交且无 prepare，git 安装不触发构建授权；仅 multi-root 的
# koffi（注册表原生依赖）需表态一次：pnpm 10 把 koffi（用包名）加进 onlyBuiltDependencies，
# pnpm ≥11 则把 allowBuilds 占位改成 true。详见「安装停在构建授权」排障文档

# 若宿主 ~/.gitconfig 有 github.com 的 insteadOf=ssh 改写（容器无 ssh 会失败），加环境覆盖：
# docker exec -e GIT_CONFIG_GLOBAL=/dev/null dsh dsh plugin --profile web add "github:…#<tag>&path:…"

# 本地开发调试仍可 link: 安装（改源码重启 profile 即生效，无需发布）
docker exec dsh dsh plugin --profile web add /home/xuqinqin/develop/person/dsh-plugins/plugins/<name>

# 校验配置可加载（会 import 插件）
docker exec dsh dsh --profile web --dump-config-schema

# 查看合成后的配置树
docker exec dsh dsh --profile web --dump-config
```

DSH 源码与 API 参考位于 `/usr/local/lib/node_modules/@deepseek-ai/dsh/`（各子包 `README.zh.md` 有中文包文档，如 `dsh-commands`、`dsh-agent-instructions`、`dsh-skill`）。

## 发布与版本

仓库级统一版本：根 `package.json` 与每个插件包的 `version` 恒等于当前 tag（风格 `v<major>.<minor>.<patch>`），tag 是 profile 侧安装的唯一锚点。

```bash
pnpm verify                    # 发布前自检（递归 verify:all）
pnpm release <version>         # 同步版本 → 重建产物 → 提交 chore(release): v<version> → annotated tag（--dry-run 只打印）
git push origin main --tags    # 在宿主执行：容器内没有 ssh，push 不可用
```

`scripts/release.mjs` 拒绝脏工作区、非 main 分支与已存在的 tag；tag 未推到远程前 profile 无法按 `#v<version>` 解析安装。

## Codebase Memory 索引

本项目已索引，project 名为 `home-xuqinqin-develop-person-dsh-plugins`（规则：绝对路径去掉开头 `/`，`/` 全部替换为 `-`）。检索代码优先用 codebase-memory-mcp（`search_graph` / `search_code` / `get_file_outline` / `get_architecture`），仅当未索引或属纯文本/文件名匹配时回退 grep/glob。`.git`、`.dsh` 按设计不索引；索引会自动刷新，若查询结果滞后可重新执行 `index_repository`。

## OpenSpec 工作流

本项目已初始化 OpenSpec（规范驱动开发）：

- 新功能/变更先走 `.dsh/skills/openspec-propose` 生成提案（proposal/specs/design/tasks），确认后再用 `openspec-apply-change` 实施——规划与实施严格分离
- CLI：`openspec list`、`openspec validate --all`、`openspec doctor`
- 规范产物使用 zh-CN，结构标题与 SHALL/MUST 关键字保留英文

## 其他

- `openspec/` 随仓库提交，便于共享
- `.dsh/`、`.opencode/` 为本地工具生成物，已由 `.gitignore` 忽略，不入库
- 遥测已知晓可用 `openspec config set telemetry.enabled false` 关闭
