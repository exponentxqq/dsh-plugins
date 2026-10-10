# AGENTS.md

DSH（DeepSeek Harness）自定义插件仓库。每个插件以官方组合包（bundle）形式独立成目录。

## 语言约定

- 所有回复、解释、代码注释、文档、提交信息一律使用简体中文。

## 目录结构

```
pnpm-workspace.yaml      # workspace 定义（packages: plugins/*）+ 构建白名单 / 发布年龄豁免
package.json             # workspace 根：pnpm 版本 pin 与递归脚本
plugins/<name>/          # 一个插件一个目录（见下文插件结构）
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
pnpm install             # 装齐全部插件依赖（单包目录内执行同效）；会触发多根插件的 prepare 构建
pnpm build               # 递归构建全部插件（产物 lib/，不入库）
pnpm typecheck           # 递归类型检查
pnpm test                # 递归单测
pnpm lint                # 递归 lint（无该脚本的插件自动跳过）

# 只跑单个插件
pnpm --filter dsh-plugin-multi-root-workspace verify:all
```

```bash
# 安装插件到某个 profile（link: 形式，改源码重启 profile 即生效）
docker exec dsh dsh plugin --profile web add /home/xuqinqin/develop/person/dsh-plugins/plugins/<name>

# 校验配置可加载（会 import 插件）
docker exec dsh dsh --profile web --dump-config-schema

# 查看合成后的配置树
docker exec dsh dsh --profile web --dump-config
```

DSH 源码与 API 参考位于 `/usr/local/lib/node_modules/@deepseek-ai/dsh/`（各子包 `README.zh.md` 有中文包文档，如 `dsh-commands`、`dsh-agent-instructions`、`dsh-skill`）。

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
