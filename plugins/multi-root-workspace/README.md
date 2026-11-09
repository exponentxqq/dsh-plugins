# dsh-plugin-multi-root-workspace

## 定位

端性：双端

DSH（DeepSeek Harness）的外部插件 bundle：把 Workspace 的可写范围从"一个 canonical 目录"扩展为"**一个主根 + N 个附加根**"，且**不修改上游仓库任何包**。

它解决的问题是：一个开发项目往往由多个独立 Git Repository 组成，而 DSH 原生只把会话工作目录当作唯一的可写根，Agent 跨仓库干活就得反复换会话。

这个插件的三个核心价值：

- **Agent 零学习成本**：继续使用原生 `read` / `write` / `edit` / `bash` 工具，插件不新增任何 `workspace_*` 工具，只是把"哪些目录属于当前 Workspace"这一个问题的答案变多了。
- **安全不降级**：多根授权走上游同款机制——进程内 fs fence + 内核级 runner（macOS Seatbelt / Linux bwrap / Landlock），fs 与 bash/PTY 共享同一条 scope；绝不退化为 danger-full-access 或提示词约束。
- **不装就当不存在**：以 bundle patch 替换上游 `fs-sandbox` 与 `sandbox` 两行 provider；未配置附加根时行为与未装插件逐项一致，misconfiguration 一律响亮报错，从不静默降级。

## 快速开始

已有 DSH 运行时（web / Electron 桌面 / headless 均可）时，最短路径是两步——按 tag 从 GitHub 源安装：

```sh
TAG=$(git describe --tags --abbrev=0)   # 当前 tag（也可填任意历史 tag 复现旧版本）
dsh plugin --profile web add "github:exponentxqq/dsh-plugins#${TAG}&path:plugins/multi-root-workspace"
dsh --profile web
```

其他安装来源（GitHub 仓库 / tarball / 本地路径）与源码方式运行 DSH 的命令差异，见[安装到 profile](#安装到-profile)。

启动后，点击侧栏的 **工作区配置** 面板行，其独立页面里的 **工作区文件夹** 分节就是本插件的面板；或直接在会话里：

```text
/workspace-folders add ~/code/another-repo
```

之后 Agent 即可在该目录读写、跑 bash——与本会话的工作目录同权。

## 环境要求

- **使用本源码构建的插件**：需要一个受支持的 DSH 运行时 —— 当前基线是 **`0.2.2-rc.1`**，支持范围是 **`>=0.2.2-rc.1 <0.3.0`**（与基线同 major.minor 且不低于基线），范围外的版本装不上也不会跑（见下）。`dsh plugin` 会把包装进对应 profile，无需本地 Node 工具链
- **从源码构建 / 参与**：**Node.js** `^22.19.0 || >=24`（仓库 `engines` 钉住）、**Git**、**pnpm 11**（`packageManager` 钉 `pnpm@11.25.0`，建议经 corepack 启用）
- **DSH 运行时**：开发依赖精确 pin 在 `0.2.2-rc.1`（支持范围的下界）；自该版本起 DSH 自身要求 **Node `>=24.9.0`**（上游 `engines.node` 收紧，运行 DSH 的宿主需满足）。升级流程见[开发工作流](./docs/development/plugin-development-workflow.md)
- **平台支持**：macOS Seatbelt / Linux bwrap、Landlock；另实现 Windows root-set ACL runner（覆盖 fs 写路径与 ACL 授予，受限 bash/PTY 的多根不在其范围）。
- 运行冒烟测试**不需要模型凭据**：e2e 的模型轮次由内联的脚本化模型端点提供

**受支持的 DSH 版本是一条基线派生的范围，不是逐版本清单。** 因为本插件替换的是 `ctx.fs` 与 `ctx.sandbox`——安全边界本身——而它识别内核沙箱方言靠的是对上游版本实测出来的 argv 形状。所以支持范围由基线派生：`DSH_BASELINE`（当前 `0.2.2-rc.1`）是范围下界，语义为「与基线同 major.minor 且 ≥ 基线」（当前即 `>=0.2.2-rc.1 <0.3.0`），`peerDependencies` 与 `dsh.engines.dsh` 都声明这条范围；启动时还会再查一遍：宿主的版本落在派生范围之外（低于基线，或换了 minor，例如 `0.3.0`），或者若干个 `@deepseek-ai/dsh-*` 混装了不同版本，`multi-root-compat` 门禁就直接抛错拒绝启动（错误里带完整诊断）——fs / sandbox / registry / instructions / lsp / workspace-files / file-references 七行**根本不启动**，没有警告档，也没有降级路径。诊断办法见[故障排查：DSH 版本在支持范围外](./docs/troubleshooting/unsupported-dsh-release.md)，理由见 [ADR-0009](./docs/decisions/ADR-0009-dsh-compat-contract.md)。

## 安装到 profile

`dsh plugin` 支持三种安装来源。以下均以 web profile 为例；桌面端（Electron）把 `--profile web` 换成 `--profile desktop`，安装方式同源。

| 来源 | 命令 | 说明 |
| --- | --- | --- |
| GitHub（本仓发布通道） | `dsh plugin --profile web add "github:exponentxqq/dsh-plugins#<tag>&path:plugins/multi-root-workspace"` | 本仓的发布通道：产物 `lib/` 随 tag 提交、无 `prepare`，即装即用（`&path:` 指定单仓子目录，`<tag>` 换成当前 tag）；仅需 `koffi` 一次 `allowBuilds` 表态，务必锁定 tag |
| tarball | `dsh plugin --profile web add ./dsh-plugin-multi-root-workspace-<version>.tgz` | 预构建离线包，适合内网/离线；同样需要那一次 `allowBuilds` 回答 |
| 本地路径（开发调试） | `dsh plugin --profile web add /path/to/multi-root-workspace` | pnpm `link:` 链接本地 checkout（依赖已在本仓库装好），改源码重启 profile 即生效，适合调试 |

**首次安装需要回答一次 `allowBuilds`，三种来源皆然。** 本插件带一个需要构建的原生依赖 `koffi`（Windows 上 Registry Authority 用的 FFI 封装；其他平台装了不用），而 pnpm ≥10 默认不运行任何依赖的生命周期脚本。所以第一次 `dsh plugin add` 会以 `[ERR_PNPM_IGNORED_BUILDS]` 失败，并把待决项写进该 profile 的 `pnpm-workspace.yaml`：

```yaml
allowBuilds:
  koffi: true          # dsh 留的占位是 "set this to true or false"
```

把它改成 `true` 再执行一次 `add` 即可。把这一行理解为**允许该依赖的安装脚本在你的机器上执行**（不在 agent 运行的任何沙箱之内）——`koffi` 的脚本只做本地预编译。诊断步骤见[故障排查：安装停在构建授权](./docs/troubleshooting/install-stops-at-build-approval.md)。

### 从 tarball 安装

在 `plugins/multi-root-workspace` 目录内执行无参的 `pnpm pack`（pnpm 从当前包的清单取包名与版本，产出 `<包名>-<版本>.tgz`）：

```sh
pnpm pack
dsh plugin --profile web add ./dsh-plugin-multi-root-workspace-<version>.tgz
```

这是预构建产物（不需要编译本插件本身），适合内网或离线环境交付；首次 `add` 同样要回答那一次 `allowBuilds`。

### 从 GitHub 安装

本仓的发布通道就在 `dsh-plugins` 单仓里，用 `#<tag>&path:<目录>` 同时锁定版本与子目录：

```sh
TAG=$(git describe --tags --abbrev=0)   # 当前 tag（也可填任意历史 tag）
dsh plugin --profile web add "github:exponentxqq/dsh-plugins#${TAG}&path:plugins/multi-root-workspace"
```

自本仓 `v1.1.1` 起，git 安装**不再需要插件自身的构建授权**：产物 `lib/` 随 tag 提交、包内没有 `prepare` 脚本，pnpm 10/11 一致放行（改 tag 也无需任何表态）。剩下唯一一次表态就是上面 `koffi` 的 `allowBuilds` 回答——按包名匹配、不随 tag 变化。早于此版本（或想沿用 `prepare` 现场构建的包）为何会被 pnpm 10 以 `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED` 硬拒绝、键里为何带 commit，见[故障排查：安装停在构建授权](./docs/troubleshooting/install-stops-at-build-approval.md)。

然后重新执行 `add` 即可。`#<tag>` 是 tag 锁：推送无法悄悄改变实际运行的内容；想自动跟进同主版本可写成 `#semver:^<major>.0.0&path:plugins/multi-root-workspace`。

**从 v1.2.x 升级（目录改名迁移）**：本插件自 v1.3.0 起目录名从 `plugins/dsh-plugin-multi-root-workspace` 改为 `plugins/multi-root-workspace`（包名不变）。pnpm 的 git 依赖锚点把 `&path:` 一并写进 profile 的 `package.json`，改 tag 不会让 path 自动切换——已按旧 tag 安装的 profile 升级到 v1.3.0+ 时，需按新 path 重新执行一次 `add`：

```sh
dsh plugin --profile web add "github:exponentxqq/dsh-plugins#v1.3.0&path:plugins/multi-root-workspace"
```

旧 tag 配旧 path（`#v1.2.1&path:plugins/dsh-plugin-multi-root-workspace`）仍可安装旧版本，两套锚点互不影响。

> 若宿主 `~/.gitconfig` 把 `https://github.com/` 改写成了 ssh（`insteadOf`）——dsh 容器现已挂载宿主 `~/.ssh`，钥匙对 GitHub 可用时 ssh 直连正常；仅当认证不可用时 `git ls-remote` 才会失败，届时给命令加 `-e GIT_CONFIG_GLOBAL=/dev/null`（`docker exec -e GIT_CONFIG_GLOBAL=/dev/null dsh …`），或按 dotfiles 说明把该段拆到宿主专属的 include 文件。

### 从本地源码安装（开发调试）

本插件存放在本仓库的 `plugins/multi-root-workspace`，profile 用 `link:` 指向该目录——先在该包目录内构建出 `lib/`（`pnpm install` / `pnpm build`，命令与预期见[构建与测试](#构建与测试)），再执行：

```sh
dsh plugin --profile web add "$PWD"
```

> **提示**：如果你的 DSH 是 clone 源码方式使用（而非 `npm install -g @deepseek-ai/deepseek-harness`），`dsh` 不在全局 PATH 里，请把上述命令中的 `dsh` 换成 `pnpm dsh`——例如 `pnpm dsh plugin --profile web add ...`、`pnpm dsh --profile web`。

## 构建与测试

在本包目录（`plugins/multi-root-workspace`）内构建：

```sh
export CI=true                # 无 TTY 时 pnpm 的依赖自检会中止，见开发工作流 §8
pnpm install
pnpm build                    # 生成 lib/，制品测试与安装都依赖它
```

开发自检（每步的预期结果）：

```sh
pnpm lint && pnpm typecheck   # 预期：0 警告 0 错误；两个 tsconfig 全部通过
pnpm test                     # 预期：全部通过；本机没有的内核 runner 用例会显式 skip 并打印原因
pnpm kernel:probe             # 预期：报告本机可用的内核 runner（seatbelt / bwrap / landlock）
pnpm smoke                    # 预期：compose 46/46、behavior 99/99、journey 60/60
pnpm docs:check               # 预期：0 errors, 0 warnings
```

全量命令表、排序约束（`pnpm test` 必须在 `pnpm build` 之后）与一条命令的完整链路 `pnpm verify:all`（lint → compat:check → typecheck → build → kernel:probe → test → smoke）见[开发工作流](./docs/development/plugin-development-workflow.md) §3。

装进 profile 后验证组合（安装命令见[安装到 profile](#安装到-profile)）：

```sh
dsh --profile web --dump-config
```

预期：组合里**仅** `fs-sandbox` 与 `sandbox` 两行被替换为插件的 `multi-root-fs` / `multi-root-sandbox`，并插入 11 行（`multi-root-compat` / `fs` / `sandbox` / `scope` / `registry` / `instructions` / `lsp` / `workspace-files` / `file-references` / `command` 与 client 载体行 `multi-root-client`）；`bash-sandbox` 保持上游（bash 与 PTY 经 `ctx.sandbox` 取根）。启动 `dsh --profile web` 后，侧栏的「工作区配置」面板行打开独立页面，其中的「工作区文件夹」分节即本插件的面板（面板挂载点 `workspace-config.section`，由 workspace-config 在注册 `main` 页面时声明，见 [ADR-0013](./docs/decisions/ADR-0013-workspace-config-section-mount.md)）。

## 使用方法

**命令**（文本入口，headless 下同样可用）：

```text
/workspace-folders                       # 列出主根与附加根
/workspace-folders add <绝对路径>         # 无参数时打开系统目录选择器
/workspace-folders alias 1 支付           # 给第 1 个附加根起别名
/workspace-folders remove 1              # 按序号或路径移除
/workspace-folders reveal 1              # 在文件管理器中显示
```

`add` 后执行 `list` 的预期输出：

```text
Workspace root (primary; access follows the current sandbox mode): /home/me/monorepo
  1 /home/me/payments-service [支付]
  2 /home/me/website
Writable additional roots: 2 of 2.
```

**面板**（Web GUI）：统一「工作区配置」页面里的 **工作区文件夹** 分节（`workspace-config.section`，由 workspace-config 的 `main` 页面声明并渲染；作用工作区由页面的统一选择框决定，份额为「未分配」或「无上下文」时本节显示「尚未选择工作区」空态）列出主根与附加根，按来源分成**附属**与**通用**两组各自呈现（通用组标题与说明常驻，分组为纯客户端拆分、不进 wire 契约，见 [ADR-0015](./docs/decisions/ADR-0015-in-app-directory-picker.md)）；主根行提供复制路径，附属根行支持添加、移除、别名、复制路径、在文件管理器中显示与上下移排序（上下移按组内顺序）。添加走**自适应双模拾取**：优先组合好的目录选择器，browse 部署自动降级为应用内目录浏览对话框（单栏列表 + 面包屑 + 新建文件夹 + 选择此目录，浮层自绘、见 [ADR-0015](./docs/decisions/ADR-0015-in-app-directory-picker.md)），手输路径始终保留为兜底且拾取失败不清空手输框；文案中英双语跟随界面语言。存在 `sidebar.right.tab.files.actions` 的旧界面仍保留就地展开同一分节的紧凑入口（无页面份额，直接渲染正文），`/workspace-folders` 命令不变；未装 workspace-config 时面板没有 GUI 入口（推荐四包同装）。根目录的状态会如实显示：`missing`（暂时不存在）、`redirected`（被替换成指向别处的符号链接）的根**保留登记但暂不授予**，目录恢复后 `list` 或面板刷新即自动重新授予，无需重启。

**模型侧**：附加根拓扑经 `systemPrompt.context` 快照随每次请求告知模型（同 workspace、cwd 不变），无需新增内省工具。授权规则（canonical 化、`recordedPath` 防符号链接转移、冲突拒绝）的完整语义见[架构文档](./docs/architecture/multi-root-workspace.md)。

**`@` 文件提及**（composer）：附加根授予后，在 composer 输入 `@` 的空查询候选会在主根结果之后追加**每个附加根一条**的根目录候选；继续输入某附加根绝对路径的前缀即可选中该根，补出 `根/` 之后便能一路钻入浏览该根内部；裸模糊搜索（`@` 加文件名片段）仍只搜主根——附加根往往是大目录，首次查询的全量索引会卡顿，跨根的结果排名也没有语义，这两点都是刻意取舍。完整行为矩阵见[架构文档](./docs/architecture/multi-root-workspace.md)的「@ 文件提及补全」小节，决策与取舍理由见 [ADR-0012](./docs/decisions/ADR-0012-additional-root-file-references.md)。

## 项目结构

```text
src/
  roots.ts        纯规则层：canonical 化、冲突校验、登记状态分类（available/missing/redirected/invalid）
  registry.ts     根注册表：dsh-storage-domain 持久化，同一主根的变更在一条队列里串行
  registry-lease.ts / registry-lease-win32.ts
                  跨进程 Registry Authority：POSIX flock 与 Windows named semaphore（进程死亡由内核释放）
  scope.ts        ctx.multiRootScope：唯一的授权源，兼发模型可见的拓扑快照
  fs.ts           多根文件系统 provider（进程内 fence，子类自上游 LocalFileSystem）
  sandbox.ts      多根内核沙箱 provider（子类自上游 LocalSandboxProvider）
  dialects.ts     Seatbelt / bwrap / Landlock profile 的识别与附加 grant 拼装（不认识即响亮报错）
  containment.ts  路径包含判定（词法快速路径 + dev/ino 别名回退）
  instructions.ts 附加根 AGENTS.md / CLAUDE.md 的发现、增量投递、预算与撤回（顶层 + 本会话触碰过的子目录，经 agent/pre-step 注入）
  file-references.ts multi-root-file-references 行：additive 包装 ctx.fileReferences.list，让附加根进入 @ 补全候选（空 query 每根一条、绝对路径钻入与前缀匹配；裸模糊不跨根）
  compat.ts       multi-root-compat 启动门禁（基线派生范围与混装判定）
  compat/         适配层：版本差异（dsh-version / sandbox-confine / agent-instructions / llm-message）与 @ 检索载体（file-reference-search），可选 peer 均按需加载
  command.ts      /workspace-folders 命令与面板 RPC 的 host 半部
  contract.ts     面板线协议（zod 双端校验，可内联进浏览器 bundle）
  client/         浏览器半部：工作区文件夹分节（workspace-config.section）、Files tab 紧凑入口、能力自适应目录拾取与单栏浏览对话框（directory-picker / DirectoryPickerDialog）、双语词典
test/            差分 parity、方言真实执行矩阵、契约往返、组件与 locale 门禁、跨进程 lease e2e、指令注入
scripts/          冒烟（compose / behavior / journey）、文档与内核 runner 检查、兼容性契约检查、升级流程
docs/             需求、架构、决策记录（ADR）、计划、开发工作流
```

## 双端结构

宿主半（`exports "."` → `lib/index.js`）承载全部能力：根注册表与 `ctx.multiRootScope`、多根 fs 与内核 sandbox、附加根指令投递、LSP / 工作区文件等消费方，以及 `/workspace-folders` 命令与面板 RPC 的 host 半部；浏览器半（`exports "./client"` → `lib/client.js`，源码在 `src/client/`）只负责「工作区文件夹」分节与 Files tab 紧凑入口，经 Connection RPC 通道 `/multi-root-workspace` 与宿主半通信，样式只走宿主 `var(--dsw-*)` 令牌。

两端共享的线上契约在 `src/contract.ts`（zod 双端校验，可内联进浏览器 bundle）；逐文件清单见[项目结构](#项目结构)。`cordis.patch.yml` 的 `multi-root-client` 行以**裸包名**挂载宿主半：web 组合只从裸包名行读取 `dsh.client`，去掉该行浏览器半即静默消失（面板分节随之不见），宿主半与命令面照常。

## 贡献指南

欢迎 Issue 与 PR：

1. 先读 [`AGENTS.md`](./AGENTS.md)（仓库级规则）与[开发工作流](./docs/development/plugin-development-workflow.md)（环境、命令、运行时支持矩阵、升级流程）。
2. 从 `main` 拉分支；提交信息遵循 conventional commits（`feat` / `fix` / `perf` / `refactor` + scope），参见现有历史。
3. PR 前本地必须全部通过：`pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm test`、`pnpm docs:check`、`pnpm smoke`（CI 按同序执行，先 build 后 test）。
4. 影响行为的变更需同批更新 `docs/` 下的对应文档；有取舍的工程决策请新增 ADR。
5. 硬约束：**不修改上游仓库（deepseek-harness）任何包**；插件只做 out-of-tree 扩展。

## 已知限制

- 附加根的指令文件按需到达模型：根目录顶层的那一份在会话第一步之前注入，子目录里的那一份在本会话**成功**触碰过该目录之后注入；nested 文件只会在其目录被考察到时重新检查（根层每一步，子目录依赖已投递或有新触碰），投递状态是进程内的（resume 后可能再告知一次），也只识别 `read` / `write` / `edit` 三个工具名。主根与 user-global 的指令链仍由上游负责，本插件不重复注入（[ADR-0010](./docs/decisions/ADR-0010-additional-root-instruction-scope.md)）。
- 跨进程单写者：同一 `$DSH_HOME` 上同时只允许一个 DSH 进程持有根登记表；另一个进程显示登记表不可用（`registry-contended`），持锁者退出或崩溃后刷新即接管——这是刻意的 fail-closed，不是待修的竞态（[ADR-0007](./docs/decisions/ADR-0007-registry-authority-lease.md)）。
- 支持矩阵是基线派生的范围（当前 `>=0.2.2-rc.1 <0.3.0`，语义为「与基线同 major.minor 且 ≥ 基线」）：宿主版本在范围外、或核心包混装了不同版本时，启动门禁直接拒绝启动，`fs` / `sandbox` / `registry` / `instructions` / `lsp` / `workspace-files` / `file-references` 七行**不启动**，没有警告档或降级路径（[ADR-0009](./docs/decisions/ADR-0009-dsh-compat-contract.md)）。
- Windows 多根 runner 继承上游 partial enforcement、caller-owned 目录及 private temp 分离条件；已启动进程保留启动时根集合，后续进程使用更新后的集合（[ADR-0011](./docs/decisions/ADR-0011-multi-root-workspace-consumers.md)）。
- 附加根与主根同权（无 per-root read-only）；附加根不能作为 bash/PTY 的默认工作目录（session cwd 语义不变）。
- 附加根文件树位于「工作区文件夹」分节（统一「工作区配置」页面内），采用手动刷新；可展开目录和预览前 200 行文本。主根原生 Files tab 保留，存在 `sidebar.right.tab.files.actions` 时提供就地展开同一分节的紧凑入口。LSP 按附加文件所在根初始化独立 workspace；需要宿主配置对应语言服务器（[ADR-0011](./docs/decisions/ADR-0011-multi-root-workspace-consumers.md)）。
- `@` 文件提及的候选面包屑在附加根的中间层目录上无法回跳：上游面包屑按主根相对语义切分路径，绝对路径候选的层级不在其坐标系内，点中间层段不会跳到该目录（上游修复后自动消失）。
- 附加根自身的绝对路径含有排除目录段名（某一段叫 `build`、`node_modules` 等）时，钻入该根的结果为空：检索载体按上游排除表忽略这类目录，本插件刻意不绕过——自写列目录会与上游排除语义漂移。
- 裸模糊搜索不跨根：附加根只以「根目录候选 + 绝对路径钻入」两种方式参与 `@` 补全，`@` 加文件名片段的模糊查询仍只搜主根（附加根大目录首查全量索引卡顿、跨根排名无语义）。取舍与理由见 [ADR-0012](./docs/decisions/ADR-0012-additional-root-file-references.md)。
- 命令的输出文案为英文（host 侧没有活动语言信息），面板文案中英双语跟随界面语言。
- 面板挂载点是统一「工作区配置」页面里的 `workspace-config.section` 分节（由 `dsh-plugin-workspace-config` 在注册 `main` 独立页面时用 `children` 声明），不是独立全屏面板，也不再占用 `sidebar.footer.action`（该入口已删除）：页面、页面级工作区选择框与 tab 导航都归 holder，本插件只提交分节内容——因此本插件不需要感知面板行 / 页面的座位是否可用，也不自行维护选择状态。Files tab 紧凑入口（无页面份额）与 `/workspace-folders` 保留；未装 workspace-config 时面板没有 GUI 入口（推荐四包同装）。取舍见 [ADR-0013](./docs/decisions/ADR-0013-workspace-config-section-mount.md)。
- 应用内目录浏览对话框的「目录浏览失败」曾为真机缺陷：浏览端口把上游实例方法解构成裸引用调用而丢失 `this`（2026-11-09 定位并修复；初诊误记为上游集成面断点，更正与确证过程见 [ADR-0015](./docs/decisions/ADR-0015-in-app-directory-picker.md) 的 Context）。修复后 browse 部署（headless / 远程浏览器）的浏览与新建走应用内对话框可用；手输路径添加始终可用。native 分支（OS 选择框路径）真机不可覆盖（容器无显示会话），由适配器单测模拟，是已声明的验证缺口。

## 文档

项目长期文档位于 [`docs/`](./docs/README.md)：

- [目标架构](./docs/architecture/multi-root-workspace.md)
- [上游调研](./docs/reference/multi-root-workspace-research.md)
- [决策记录（ADR）](./docs/decisions/README.md)
- [开发工作流](./docs/development/plugin-development-workflow.md)
- [常见问题排查](./docs/troubleshooting/README.md)

Coding Agent 的仓库级规则定义于 [`AGENTS.md`](./AGENTS.md)。

## 许可

[MIT](./LICENSE)
