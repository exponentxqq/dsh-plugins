> 证据类型：真机验证｜采集时点：2026-11-08（迁出时点，原文未标注日期）｜结论：隔离实例两轮探针与线上宿主复核均通过：命令语义、归属 fail-closed、三层遮蔽、跨工作区同名隔离、热刷新与 `/init` 产出全部符合预期，探针残留已清零。

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
