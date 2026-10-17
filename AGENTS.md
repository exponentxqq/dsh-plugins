# AGENTS.md

DSH（DeepSeek Harness）自定义插件仓库：pnpm workspace 单仓多包，每个插件是一份官方组合包（bundle），profile 侧按 GitHub tag 安装。

## 语言约定

- 所有回复、解释、代码注释、文档、提交信息一律使用简体中文。

## 目录结构

- `pnpm-workspace.yaml` — workspace 定义（packages: plugins/*）+ allowBuilds 构建白名单 + minimumReleaseAgeExclude 发布年龄豁免
- `package.json` — workspace 根：pnpm 版本 pin（packageManager: pnpm@11.25.0）与递归脚本
- `plugins/<name>/` — 一个插件一个目录（清单与结构见下文）
- `scripts/release.mjs` — 发布：同步版本号 → 重建产物 → 发布提交 → annotated tag
- `README.md` — 仓库说明与常用命令；`openspec/` — OpenSpec 规范工作区（spec-driven，zh-CN）
- `.dsh/skills/` — OpenSpec 安装的 DSH skill（本地生成，勿手改，不入库）

## 插件清单（统一版本，各自独立 bundle）

- `dsh-plugin-multi-root-workspace` — 给沙箱作用域追加 N 个附加工作区根；目录内有独立 `AGENTS.md` 与 `docs/`，改动前先读
- `git-graph-multi` — web GUI 多仓 git 分支选择器（枚举 / 聚合总览 / 单仓下钻 / 跨仓组操作）
- `project-mcp` — 从各工作区根 `.dsh/mcp/` 发现项目级 MCP 服务器，工具可见性按工作区隔离、热重载
- `user-commands` — markdown 定义的用户斜杠命令（builtin / `$DSH_HOME/commands` / 各工作区根 `.dsh/commands` 三层）
- `web-ux` — Web 界面体验（双端）：composer 状态行的模型提供商徽章 + 侧栏已归档会话的删除入口（宿主半承载 Connection RPC 通道 `/web-ux`）

## 插件结构约定

- 包名一律 `dsh-plugin-<目录名>`；`package.json` 以 `dsh.bundle.patch` 声明 `cordis.patch.yml`（insert 本包注册行）
- 源码在 `src/`（TypeScript，入口 `src/index.ts`，导出 `name` / `inject` / `apply`），构建产物在 `lib/`（`main` 指向 `lib/index.js`，随仓库提交）
- 构建：multi-root-workspace 用 tsc 产类型 + tsdown 打包；其余四个用 `build.mjs`（esbuild）
- 测试：vitest（multi-root 在 `tests/`，其余在 `test/`）；lint 用 oxlint（git-graph-multi 未提供 lint 脚本）
- web 侧插件（multi-root-workspace、git-graph-multi、web-ux）在 `dsh.client` 声明 `platform: web` 与 `inject` 列表

## 开发与验证命令

node 族命令走 volta/pnpm 包装脚本（见 dotfiles `CLAUDE.md`）；dsh 一律 `docker exec dsh dsh …`。

```bash
# 仓库根执行（递归全部插件）
pnpm install             # 装齐依赖
pnpm build               # 构建全部插件（产物 lib/ 随仓库提交，release 时递归重建）
pnpm typecheck           # 递归类型检查
pnpm test                # 递归单测
pnpm lint                # 递归 lint（无该脚本的插件自动跳过）
pnpm docs:check          # 递归文档检查（仅 multi-root-workspace 实现该脚本）
pnpm verify              # 发布前自检（递归 verify:all；multi-root 的 smoke 需运行中的 dsh）
pnpm release <version>   # 发布（--dry-run 只打印）

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
# 宿主 ~/.gitconfig 有 github.com insteadOf=ssh 改写时加 -e GIT_CONFIG_GLOBAL=/dev/null
# 本地调试可 link: 安装（改源码重启 profile 即生效）：docker exec dsh dsh plugin --profile web add <本仓>/plugins/<name>
docker exec dsh dsh --profile web --dump-config-schema   # 校验配置可加载（会 import 插件）
docker exec dsh dsh --profile web --dump-config          # 查看合成后的配置树
```

DSH 源码与 API 参考位于 `/usr/local/lib/node_modules/@deepseek-ai/dsh/`（各子包 `README.zh.md` 有中文文档）。

## 发布与版本

仓库级统一版本：根 `package.json` 与各插件的 `version` 恒等于当前 tag（`v<major>.<minor>.<patch>`），tag 是 profile 侧安装的唯一锚点。`scripts/release.mjs` 拒绝脏工作区、非 main 分支与已存在的 tag；push 须在宿主执行（容器内无 ssh）：`git push origin main --tags`；tag 未推远程前 profile 无法按 `#v<version>` 解析安装。

## Codebase Memory 索引

已索引，project 名 `home-xuqinqin-develop-person-dsh-plugins`（绝对路径去掉开头 `/`、其余 `/` 换 `-`）。检索优先 codebase-memory-mcp（`search_graph` / `search_code` / `get_file_outline` / `get_architecture`），未索引或纯文本/文件名匹配才回退 grep/glob。

## OpenSpec 工作流

- 新功能/变更先走 `.dsh/skills/openspec-propose` 生成提案（proposal/specs/design/tasks），确认后用 `openspec-apply-change` 实施——规划与实施严格分离
- CLI：`openspec list`、`openspec validate --all`、`openspec doctor`；规范产物 zh-CN，结构标题与 SHALL/MUST 关键字保留英文
- `openspec/` 随仓库提交；`.dsh/`、`.opencode/` 为本地工具生成物，已由 `.gitignore` 忽略，不入库
