# dsh-plugin-user-commands

DSH 插件（**纯宿主面，`exports "."`**）：用户自定义斜杠命令——用 Markdown 文件定义 `/命令`，正文即 prompt 模板，执行时展开 `$ARGUMENTS` 并作为用户消息提交给当前会话；三层来源（插件内置 / 用户级 / 项目级）按层遮蔽，多工作区会话互不串扰，支持热刷新，并内置 `/init` 为当前仓库生成或更新 `AGENTS.md`。

本包不声明 `dsh.client`，不含任何 Web UI 组件，因此 **web / acp / headless 等任何 profile 都可单独安装**；没有 `commands` 服务的部署里它零注册、零报错。

## 三层来源与遮蔽

| 层 | 目录 | 注册位置 | 遮蔽关系 |
| --- | --- | --- | --- |
| 内置 | 插件代码常量（v1 只有 `/init`） | 全局 | 被用户级 / 项目级同名命令遮蔽 |
| 用户级 | `$DSH_HOME/commands/`（缺省 `~/.dsh/commands/`） | 全局 | 遮蔽内置 |
| 项目级 | 各登记根（主根 + 附加根）的 `<根>/.dsh/commands/` | **该会话自己的作用域** | 遮蔽用户级与内置 |

遮蔽用的是 dsh-commands 官方的 agent 作用域机制：项目级命令在 `agent/created` 时注册到 `agent.ctx` 之下，因此只对该会话遮蔽同名全局命令，对其他会话毫无影响。会话归属取创建目录（cwd）逐级向上做 `realpath` 后与全部已登记根比对，**最近命中**的根所属工作区即归属；归属失败 **fail-closed**——该会话只剩用户级与内置命令。

## 命令文件格式

`*.md`，**只取一层**（子目录整体忽略并记警告）：

```markdown
---
description: 部署到预发
argument-hint: [环境]
---
请把 $ARGUMENTS 部署到预发环境，并在失败时给出日志尾部片段。
```

- **命令名** = 文件名去 `.md`，必须匹配 `^[a-z][a-z0-9_-]*$`（与 dsh-commands 的命令行文法一致）。`Deploy.md`、`2fast.md` 记错误并跳过，同目录其余命令不受影响。
- **frontmatter**（`---` 包围的 YAML）只认两个字段：
  - `description`：发现菜单里的说明；缺省回退为「用户自定义命令 `<文件名>`」，**绝不读正文**（避免 prompt 内容泄漏进发现菜单）。
  - `argument-hint`：输入提示。写成 YAML 列表（`argument-hint: [环境]`，从 Claude Code 抄过来的常见写法）会被还原成 `[环境]`；多段提示请加引号：`argument-hint: "[issue-number] [priority]"`。
- **未知字段**（如 `allowed-tools`）记警告但**不跳过**（前向兼容）；已知字段类型不对同样只警告。
- **frontmatter 不是合法 YAML、命令名不合法、正文去空白后为空** → 记错误并跳过该文件，同目录其余命令照常发现。
- 正文 = frontmatter 之后的内容（提交前会去掉首尾空白，frontmatter 不会进 prompt）。

## `$ARGUMENTS` 占位符

正文里 `$ARGUMENTS` 的**全部出现处**替换为去首尾空白的调用参数，无参数代入空串：

```
/review feat/x     →  正文里的 $ARGUMENTS 全变成 feat/x
/review            →  全变成空串
```

只有这一个占位符：不做 `$1`/`$2`（需引号转义语义），不做 `${CWD}` 之类上下文变量（有泄漏面）。`/命令` 之后的每个字节都属于该命令，语法由命令文件自己拥有。

## 调用语义

- **现读不缓存**：注册表只承载名称、说明与参数提示；正文在**每次执行时**从磁盘重新读。改文件 → 下一次调用即生效，不需要重启也不需要刷新。
- **提交**：展开后走 `agent.steer(createUserMessage(...))`（与 `/plan` 同一条通道）——命令本身不是模型消息，但这是**一条真正的用户消息**，空闲会话也会因此开启轮次。
- **文件没了就报错**：注册之后文件被删除/被清空/变成非法 YAML → 返回错误结果，**不提交任何半截内容**。
- **附件**：v1 不声明附件能力，带图片的调用由官方命令适配器拒绝（错误文案由它给出），不进入 handler。
- `/命令` 的**结果文案**不消耗 token：注册表与 handler 返回值都不进模型请求。

## 同层冲突仲裁与工作区隔离

冲突的仲裁范围是**单个工作区**，不是整个进程：

1. 同一工作区内，**主根优先于附加根**，附加根之间按授予顺序；
2. 同一目录内按文件名排序。

后来者记 `error`（同时指明双方的来源目录与文件名）并跳过，插件**绝不为命令改名**。跨层同名是**遮蔽**不是冲突，不记错误。

工作区之间**不仲裁**：每个工作区各自构成一个独立的项目级命名空间，A 与 B 各有 `deploy.md` 时**两份都生效**，各工作区的会话各自执行到自己的那一份。同一个物理根被授予给多个工作区时，每个工作区各自独立发现它——谁也不会因为别人先扫到就丢掉自己根集合里的命令。（这是与 [`dsh-plugin-project-mcp`](../project-mcp/README.md) 的 `serverName` 仲裁**刻意不同**的一点：MCP 服务器名必须在进程里唯一，一份配置顶掉另一份；命令名没有这个约束，隔离优先。）

归属判定配套地**「谁的『家』谁做主」**：一个目录既被授成别的会话的附加根、又是某个工作区的主根时，它归属那个工作区（主根拥有者压倒附加根认领者），与登记顺序无关；只有没有任何工作区以它为主根时，附加根之间才按登记顺序先到先得。于是在 `opc/` 里开的会话永远是 opc 工作区的会话、用 opc 的命令集合，不会因为别的会话把 `opc/` 授成附加根就被收编过去。

与**别的插件**已注册的全局命令同名（例如你写了 `plan.md`，而官方 `/plan` 已存在）时，注册表按层拒绝重名：记一条 `注册 /plan 失败，已跳过` 的错误日志，其余命令不受影响。

## 内置 `/init`

```
/init                      # 分析当前仓库，在主根创建或合并更新 AGENTS.md
/init 重点写清发布流程      # 用 $ARGUMENTS 传达补充关注点
```

`/init` 指示 agent：查证目录结构、工具链、常用命令（逐条可复制执行）、代码约定 → 写入**主根** `AGENTS.md`；已存在则**合并更新**（保留仍然正确的内容，只修订过时条目，不推倒重写）。产出约束：全文简体中文、≤80 行、只写查证过的事实、不追加 TODO 或后续建议。内置命令可被用户级/项目级的 `init.md` 遮蔽。

## 热刷新与 `/commands-reload`

- 对用户级目录与每个工作区根按阶梯监听**最深的存在层级**（`<根>/.dsh/commands` → `<根>/.dsh` → `<根>`；用户级同理退到 `$DSH_HOME`），因此「全新项目里第一次创建 `.dsh/commands/`」也会自动生效，无需重启；文件事件去抖 250 ms。
- 重扫是**声明式全量重同步**：新增 → 注册，消失 → 注销，指纹（说明/提示/来源）变化 → 重注册；全局层与**全部存活会话**的项目层一起重算。
- 工作区登记变化与附加根授予变化（`multiRootRegistry.onChange`、`domain/changed`）触发全量重扫；事件只当触发器，**不读载荷**。
- **项目级命令只挂到「插件在运行时创建的会话」**：项目层是 `agent/created` 时挂到该会话自己的作用域上的，插件激活之前就已存在的会话没有这一步（它们那时没有 `agent/created` 可等），只剩用户级与内置命令；重启 profile 或新开会话即恢复。全局层（用户级 + 内置）不受此限——服务一出现就注册，对所有会话立即可见。
- **兜底命令 `/commands-reload`**：全量重扫并反馈「加载 / 更新 / 移除 / 跳过」计数。`fs.watch` 在 NFS/SMB/FUSE 等挂载上存在**静默失聪**（不投递事件、无异常可 catch），唯一的发现者是人，所以保留这条手动兜底。该命令名由插件**保留**：命令目录里出现 `commands-reload.md` 会记错误并跳过，兜底不会被悄悄遮蔽。

## 安全提示

**项目级命令等于把 prompt 注入权交给仓库作者。** `.dsh/commands/*.md` 随仓库分发，clone 下来即生效：文件正文会被展开成一条用户消息送进你的会话，模型会把它当作你的指令。所以：

- 只在信任的仓库里保留 `.dsh/commands/`；review 别人的 PR 时留意新增的命令文件。
- 本插件**只做 prompt**，没有任何本地执行能力（不跑 shell、不读 `@file`、不设 `allowed-tools` 白名单）——真正有执行力的注入面需要单独的沙箱设计，不在这一个变更里。
- 用户级目录 `$DSH_HOME/commands/` 是你自己的，不受仓库影响。

## 软依赖与降级

- **`commands` 服务**：缺席的部署（无命令适配器的 acp / headless）中 `ctx.inject(['commands'])` 的回调根本不运行——零注册、零报错、无副作用。
- **[`dsh-plugin-multi-root-workspace`](../dsh-plugin-multi-root-workspace/README.md)**：软依赖。其 registry 在就扫描「主根 + 附加根」，缺席则静默降级为只看各主根，其余行为不变。
- **workspace registry 不在**：没有项目级命令，用户级与内置照常工作。

## 构建

自包含宿主产物：`link:` 与 git 两种安装形态都不依赖本包 `dependencies`（`yaml` 打进产物）。**`@deepseek-ai/dsh-llm` 刻意不打进产物**——`createUserMessage` 由运行中的 harness 解析（multi-root-workspace 同款做法），消息身份实现因此与宿主**同一份**，而不是冻进插件里的私有副本。

```bash
cd /home/xuqinqin/develop/person/dsh-plugins/plugins/user-commands   # 本包是 dsh-plugins workspace 成员
pnpm install
pnpm typecheck     # tsc -b：host 单工程
pnpm test          # vitest：发现/仲裁/frontmatter/归属/分层注册/调用/监听/重载计数/降级
pnpm lint          # oxlint
pnpm build         # esbuild → lib/index.js
pnpm verify:all    # lint + typecheck + build + test
```

`lib/` 与 `node_modules/` 不入库（见 `.gitignore`）。依赖由 workspace 统一安装：仓库根 `pnpm install` 一次装齐。

## 真机验证（验证证据）

在一份**独立 `DSH_HOME`、备用端口 3099 的同构 web profile 实例**上完成（`profiles/web` 符号链接到线上 profile，数据目录与端口都与正在运行的宿主隔离；探针会话与临时数据只落在临时 `DSH_HOME`）。该实例载入的正是本仓库当前构建；线上宿主另有一条已知差异：profile 装配由 harness 自动激活（不必重启），因此线上跑的是**装配当刻**的构建，源码改动要重启 profile 才生效。两轮探针：第一轮验证命令语义（探针仓库 `/tmp/uc-init-probe` 是一个最小 npm 仓库，命令文件分三层放置，探针命令正文形如 `【<层>】正文，参数=$ARGUMENTS`）；第二轮在**真实工作区** `person/dsh-plugins` 与 `company/opc` 各放一个同名 `uc-same.md`（正文形如 `【<工作区> 版】同名命令正文，参数=$ARGUMENTS`），专门验证跨工作区隔离与归属。第二轮期间线上宿主的本插件（旧构建）也会对临时探针文件做出反应——只多打几条同名冲突日志，未影响任何线上会话。

| 验证项 | 真机证据 |
| --- | --- |
| 插件装配与会话挂载 | `dsh-plugin-user-commands: 会话项目级命令：cwd=/home/xuqinqin/develop/person/dsh-plugins 归属=/home/xuqinqin/develop/person/dsh-plugins 注册=2` |
| 归属 fail-closed | `/tmp/uc-init-probe`、`/tmp/uc2-nonroot`（未登记目录）会话：`归属=无 注册=0`，发现菜单只剩 `/init`，`/uc-same` 返回未知命令（RPC 无结果、无提交） |
| **跨工作区同名互不串扰** | `dsh-plugins` 会话 `/uc-same 甲` → 提交 `【dsh-plugins 版】同名命令正文，参数=甲`；`opc` 会话 `/uc-same 乙` → 提交 `【opc 版】同名命令正文，参数=乙`；`commands/list` 各只见自己那一份（opc 会话看不到只属于 dsh-plugins 的 `uc-only-dsh`，执行它也无提交） |
| **主根拥有者优先** | `opc` 会话 `归属=/home/xuqinqin/develop/company/opc 注册=1`——`opc` 同时是 dsh-plugins 工作区授予的附加根，但会话归它自己的工作区（与登记顺序无关），命令用 opc 版 |
| 工作区内仍按主根压附加根 | dsh-plugins 工作区的命名空间 = 主根 + 授予的附加根；主根的 `uc-same.md` 压掉附加根里的同名文件并记错误：`命令名冲突：…/opc/.dsh/commands/uc-same.md 的 /uc-same 已跳过；该名称已由 …/dsh-plugins/.dsh/commands/uc-same.md 提供（插件不改名）`，而 opc 自己的工作区照常用自己那一份 |
| 跨工作区不串扰（第三工作区） | `cloud-the-sky` 会话：`归属=…/company/web/cloud-the-sky 注册=0`；`/uc-proj` 返回「未知命令」（RPC 无结果），`/uc-user`（用户级）照常执行 |
| 用户级命令与执行 | 未登记目录会话执行 `/uc-user 好` → 提交 `【用户级】正文，参数=好`（全局层与 fail-closed 会话不受影响） |
| 项目级发现与执行 | `/uc-proj 乙` → 会话日志 `command/run{name:uc-proj,args:" 乙"}` + 用户消息 `【项目级】探针正文，参数=乙` + `command/done{kind:success}`，并开启模型轮次（`turn/start`） |
| 三层遮蔽（项目遮用户） | 用户级与项目级同名 `uc-same`：提交的是 `【项目级】同名命令正文` |
| 三层遮蔽（用户遮内置） | 用户级 `init.md` 存在时 `/init 重点写发布流程` 提交 `【用户级 init】正文，补充=重点写发布流程`，内置 prompt 不生效 |
| 现读不缓存 | 改写 `uc-proj.md` 后再次执行：提交 `【项目级·第二版】正文，参数=戊` |
| 热刷新 + 手动兜底计数 | 新增 1 个项目级文件后 `/commands-reload` → `已重扫：加载 1、更新 0、移除 0、跳过 0`（按命令名去重，多会话不重复计数）；第二轮里 `uc-hot.md` 落盘即出现在 `commands/list`、删除即消失（都无需重载），清理后 `/commands-reload` → 全 0 |
| 内置 `/init` 产出 | 探针仓库执行 `/init 重点写清测试与 lint 命令`：生成主根 `AGENTS.md`，**56 行**、简体中文、按「目录结构 / 工具链 / 常用命令 / 代码约定」组织，且实测了 `npm run build`、`npm test`、`npm run lint` 的真实退出码后如实写明（并额外覆盖了补充关注点里点名的测试与 lint 命令），末尾没有任何 TODO 或后续建议 |

复现要点：造临时 `DSH_HOME`（`profiles/web` 符号链接到线上 profile + 拷贝 `storages/`）→ `DSH_HOME=… dsh web --port 3099 --no-open` → 用日志里的 token 换 cookie（`GET /?token=…`）→ `POST /api/session/create`（`cwd` 指定工作区）建会话（agent 随之创建，`agent/created` 触发挂载）→ `POST /api/commands/list`（`agentId` 就是 `sessionId`）逐会话核对可见命令 → `POST /api/commands/execute`（`agentId` + `line` + `submittedAttachments`）执行命令 → `POST /api/session/page`（`address{kind,sessionId}` + `throughSeq`）读会话日志核对提交内容（`throughSeq` 过大会返回 `past cursor N`，按它重试即可）。跨工作区隔离要靠**真实工作区**：各放一份同名命令文件，再比对两边的发现列表与提交正文。

验证完成后所有探针物均已清除：临时 `DSH_HOME`、探针仓库、真实工作区 `.dsh/commands/` 下的探针命令文件、探针脚本与隔离实例进程（两次探针都清理过，`git status` 只剩本变更自己的改动）。

### 线上宿主（web profile）确认

重启线上 profile、插件在真实宿主上生效后复核（探针命令文件、探针仓库 `/tmp/uc-live-probe` 与 3 个探针会话已清除/归档）：

| 验证项 | 真机证据 |
| --- | --- |
| 会话挂载（重启时恢复的会话） | `会话项目级命令：cwd=/home/xuqinqin/develop/company/opc 归属=/home/xuqinqin/develop/company/opc 注册=0`——opc 会话归它自己的工作区，而它同时是 dsh-plugins 的附加根 |
| 命令列表含内置项 | 会话 `commands/list` 含 `commands-reload`、`init`（以及 `mcp-reload` 等其它插件项） |
| 三层遮蔽（项目遮用户） | 用户级与项目级同名 `uc-live`：列表显示项目级说明「线上探针：项目级（应遮蔽用户级）」，执行提交的是项目级正文 |
| fail-closed 只剩全局层 | 未登记目录 `/tmp/uc-live-probe` 的会话只见 `uc-live: 线上探针：用户级`（项目级同名文件对它不可见），也看不到只存在于项目级的 `uc-read` |
| 现读不缓存 | `uc-read.md` 为「第一版」时 `/uc-read 甲` 提交第一版正文；改写文件后 `/uc-read 乙` 提交「第二版」正文 |
| `/init` 创建 | 探针仓库执行 `/init 重点写清测试与 lint 命令`：生成主根 `AGENTS.md` **51 行**、简体中文，按「目录结构 / 工具链 / 常用命令 / 测试与 Lint / 代码约定」组织；三条命令都实测并写明真实输出，还查证出一条环境事实（`npm` 包装脚本只挂载宿主家目录，`/tmp` 下的仓库不能用 `npm run`） |
| `/init` 合并更新 | 同一仓库再执行一次 `/init`：51 行 → 51 行，仅 1 行改得更精确（补上容器实际挂载项），其余原样保留，未推倒重写 |
| 热刷新与手动兜底 | 探针命令文件落盘即出现在 `commands/list`、删除即消失（watcher 生效）；手动 `/commands-reload` 返回 `已重扫：加载 0、更新 0、移除 0、跳过 0`，表示声明式重扫已无遗留差量 |

## 安装到 profile

```bash
# 发布后按 tag 装（任何 profile 均可单独安装本包）
docker exec dsh dsh plugin --profile web add \
  "github:exponentxqq/dsh-plugins#v1.0.0&path:plugins/user-commands"

# 本地开发调试（改源码后重建 + 重启 profile 生效）
docker exec dsh dsh plugin --profile web add \
  /home/xuqinqin/develop/person/dsh-plugins/plugins/user-commands

docker exec dsh dsh --profile web --dump-config-schema   # 校验组合可加载（会 import 插件）
docker exec dsh dsh --profile web --dump-config | grep -A2 'id: user-commands'
```

`dsh plugin add` 会把包追加进 profile `package.json` 的 `dsh.profile.bundles`，从而激活本包的 `cordis.patch.yml`（插入 `id: user-commands` 的 bare 包名行）。源码改动要重启 profile：`link:` 安装的插件不在 profile 目录内，dsh-hmr 默认的模块监听根不含它（命令**文件**的热刷新不受影响，那是本插件自己的监听）。

## 非目标（本版本）

- 不做 shell 预执行（`!`cmd``）、`@file` 文件引用、`allowed-tools` 白名单。
- 不做位置参数（`$1`/`$2`）与上下文变量（`${CWD}` 等）。
- 不做子目录命名空间（命令名文法不含冒号，隐式改名不可取）。
- 不内置 `/init` 之外的命令；不做命令级模型 / persona 覆盖。
- 不做 watch 失效时的自动轮询（用 `/commands-reload` 兜底）。

## 许可

Apache-2.0。
