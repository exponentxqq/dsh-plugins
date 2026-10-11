# Design

## Context

add-web-ux-plugin 已实现、归档（2026-10-11），其规范落在 `openspec/specs/dsh-web-ux-project-mcp/`（8 条需求）。本变更是纯结构性拆分：迁出的宿主代码在新插件内改用新插件自己的标识（`name='project-mcp'`、`dsh-plugin-project-mcp:` 标签、cordis 行 id `project-mcp`），而 **`dsh-plugin-web-ux` 自身标识保持不变**——它继续作为 web 界面体验优化（徽章及后续改动）的落点。验收标准是**行为零变化**——三条真机隔离日志、`/mcp-reload` 计数输出、冲突仲裁与降级语义均不变。

## Goals / Non-Goals

Goals:

- 项目级 MCP 成为独立插件 `dsh-plugin-project-mcp`，任何 profile 可单独安装。
- `plugins/web-ux/` 保持原目录名与包名，去掉 host 半后只剩 provider 徽章；host 半的位置由一个 no-op 载体行承接，供 web 客户端模块扫描定位 `dsh.client` 声明。
- 测试、构建、文档随代码迁移，全绿。

Non-Goals:

- 不改任何运行时行为、配置格式、日志文案（`/mcp-reload` 输出、`isolation:` 诊断行均不变）。
- **不改 web-ux 的标识**：目录名、包名 `dsh-plugin-web-ux`、插件 `name` 导出、effect 标签前缀 `dsh-plugin-web-ux:`、capability `dsh-web-ux-provider-badge`、README 路径一律不动。
- 不修订 capability 内容——需求语义逐字迁移，措辞调整不属于本变更。
- 不接入 acp / headless profile（设计兼容即可，接入另行决定）。

## Decisions

### D1: 迁移映射表

| web-ux 原位置 | project-mcp 新位置 | 动作 |
|---|---|---|
| `src/host/{index,isolation,scan,mcp-manager,attribution,roots,watcher,triggers,plugin-loader,env-expand,host-io,types}.ts` | 同名 | 整体迁移（内部均为相对导入，不动） |
| `src/index.ts` | `src/index.ts` | 迁移并改写 docblock |
| `test/{isolation,config-scan,mcp-manager,attribution,triggers,watch-reload}.test.ts` | 同名 | 整体迁移，同步断言中的标签字符串 |
| `tsconfig.base.json` / `tsconfig.host.json` | 同名 | 迁移；新 `tsconfig.json` 只引用 host |
| `build.mjs` | `build.mjs` | 迁移后删 client 面（仅 host bundle），`PACKAGE_NAME` 改 `dsh-plugin-project-mcp` |
| `.gitignore` / `icon.svg` | 同名 | 复制 |
| `vitest.config.ts` | 新写 | node 环境（去 jsdom；host 测试不需要 DOM） |
| `package.json` | 新写 | name `dsh-plugin-project-mcp`、version 1.0.0、`dsh.bundle.patch`、依赖 `yaml`、exports 仅 `.`；无 `dsh.client`、无 react 系 devDeps |
| `cordis.patch.yml` | 新写 | insert 单行 `id: project-mcp`（bare 包名行） |
| `README.md` | 新写 | 迁入 MCP 章节与隔离冒烟证据表 |
| `src/client/`、`src/css-modules.d.ts`、`test/badge.test.tsx` | 留在 web-ux | 不动 |

### D2: 新插件的改名点清单（仅作用于迁出的新插件）

以下改名只发生在**新建的 `plugins/project-mcp/`** 内，`plugins/web-ux/` 不带任何改名：

- `src/host/index.ts`：`export const name = 'web-ux'` → `'project-mcp'`；`@module` docblock 更名。
- effect / 日志标签：`dsh-plugin-web-ux: workspace isolation`、`dsh-plugin-web-ux: /mcp-reload`、`dsh-plugin-web-ux: teardown` → `dsh-plugin-project-mcp: …`（三处）。
- `cordis.patch.yml` 行 id `web-ux` → `project-mcp`，注释同步。
- 测试断言中的标签字符串同步；README 指称按上下文改写。
- 验收口径：`grep -rn 'web-ux' plugins/project-mcp/` 在源码与测试目录零命中。

### D3: web-ux 瘦身后的宿主半

保留 bare 包名 cordis 行——web 客户端模块扫描只从 bare 包名行读取 `dsh.client` 声明（multi-root 的 `multi-root-client` 载体行同理，见其 cordis.patch.yml 注释）。`src/index.ts` 导出 `name='web-ux'`、`inject: []`、空 `apply`，注释说明锚点用途。构建收敛 client-only：`build.mjs` 删 host 面、`tsconfig.json` 只引 client、`package.json` 去掉 `yaml` 与 host 面 devDeps（dsh-agent / dsh-commands / dsh-mcp-client / dsh-tools / dsh-workspace / dsh-api-session-controller）；`jsdom`、`@testing-library/react`、`@types/react*` 因 badge 测试保留。**实施修正**：`@deepseek-ai/dsh-session` 不在删除之列——client 半以 `@deepseek-ai/dsh-session/types` 取会话类型，裁掉即 typecheck 失败（首轮验证已暴露并回补）。

### D4: 归属判定逻辑不跨插件共享

另一变更（add-user-commands-plugin）会各自持有 cwd→根集合判定的独立副本，两插件互不依赖、可单独安装。本变更不涉及，仅记录边界决议。

### D5: web-ux 标识冻结，留作 web 体验优化载体

用户决议（本变更评审）：web-ux 不改名。理由是它后续还要承接其他 web 界面体验优化，改名会牵动 profile 依赖、cordis 行、effect 标签与已归档能力 `dsh-web-ux-provider-badge`，收益为零。因此：

- 目录 `plugins/web-ux/`、包名 `dsh-plugin-web-ux`、`src/index.ts` 的 `name` 导出、`package.json#name`、`cordis.patch.yml` 行 id 全部保持现值；
- 只有「项目级 MCP」这一宿主能力换个交付主体（新插件），web-ux 的能力范围收窄为 provider 徽章 + 后续 web 体验改动；
- 反向口径：本变更的 diff 中 `plugins/web-ux/` 不得出现 `git mv` / 目录重命名 / 包名变更，只有文件删除与内部改写。

## Risks / Trade-offs

- **迁移即风险**：三重兜底——测试随代码整体迁移（断言标签漏改会红）、全量自检、真机隔离行为复验（三条 `isolation:` 日志逐字比对）。
- **锁文件重算**：新增 workspace 成员会使既有 importer 的 peer 解析哈希重算（add-web-ux-plugin 落地时已出现过同类变化），属 pnpm 正常行为。
- **包数量增加**：仓库多一个可发布单元；版本仍随仓库统一 tag，发布流程不变。

## Migration Plan

1. 建 `plugins/project-mcp/` 三件套骨架 → 迁移 host 源码与测试 → 改名点清扫 → 新写 package.json / cordis.patch.yml / README.md。
2. web-ux 删 host 半与 host 测试 → `src/index.ts` 改 no-op 载体 → 构建配置收敛 client-only → README 精简（目录名、包名、插件 name 全程不动）。
3. 根 `pnpm install`（workspace 自动纳入）→ 逐插件 lint / typecheck / test / build → 根 build / test。
4. dotfiles web profile 增补 link: 依赖并重装 → 真机重启复验三条隔离日志与 `/mcp-reload` 计数。

## Open Questions

（无——拆分边界与 web-ux 形态已确认。）
