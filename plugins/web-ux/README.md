# dsh-plugin-web-ux

DSH Web GUI 插件（**双端**，`exports "."` 宿主 + `exports "./client"` 浏览器），承载三项 Web 界面体验：

1. **Provider 徽章**——输入框下方状态行（`conversation.composer.dock`）追加一枚静态胶囊，以 `provider/model` 原始标识符显示当前会话所选模型路由；
2. **删除已归档会话**——侧栏已归档会话行的 "..." 菜单入口 + 两步确认框，框内二选一：**移动到归档目录**（默认）或**永久删除**；宿主半承载 Connection RPC 通道 `/web-ux`（预览与执行两个端点，按请求里的处置模式分派）；
3. **命令结果通知**——命令结果在当前视图无处渲染时（典型：空会话首屏），composer 上方弹一张可展开全文的临时通知卡。

宿主半不再是空壳——它承载会话处置能力的 Connection RPC 通道 `/web-ux`（删除与迁移共用一条通道，按请求里的模式分派），同时继续充当 web 客户端模块扫描读取 `dsh.client` 声明的锚点。

本包自 `split-project-mcp-plugin` 变更起**只做 Web 界面体验**——原先同包的「项目级 MCP」宿主能力已拆为独立插件 [`dsh-plugin-project-mcp`](../project-mcp/README.md)（纯宿主面，任何 profile 可单独安装）。自 `add-web-ux-archived-session-delete`（v1.2.0）起宿主半因「删除已归档会话」重新变成实载体：文件系统与工作区注册表只有宿主碰得到，这与拆出去的 MCP 能力互不相干；自 `web-ux-session-delete-archive-option` 起同一入口再补上「移动到归档目录」，宿主半因此多了一个可选配置键 `archiveRoot`（`src/config.ts`），处置面仍然只有这一条通道。后续其他 Web 界面体验优化仍落在本包。

## Provider 徽章

- 数据来自会话共享的模型目录快照（`ctx.modelDirectories.directoryFor(sessionId).store`），切换模型（官方选择器或 `/model` 弹层）后徽章**无需刷新**即跟随；组件只读该快照，不改动任何官方座位。
- 标签为 `provider/model` **原始标识符**（`deepseek/deepseek-chat` 风格），直接取自选择本身，不依赖目录加载状态、不使用显示名；会话没有持久模型选择时**不渲染**。
- 样式对齐官方胶囊（同一套 `--dsh-content-font-*` / `--dsw-alias-*` 变量、`999px` 圆角、`1px 8px` 内边距）；标签有 `max-width` 上限并截断为省略号，不会把状态行撑出横向滚动。
- 空白会话期上游本就不渲染状态行，徽章随之缺席，不产生错误。

## 删除已归档会话

DSH 上游只有「归档」没有删除：持久化层不提供删除接口，归档像一只软删除抽屉，抽屉里的会话日志却在 `~/.dsh/sessions/` 无限累积，用户只能停 Host 后手工删目录、自己清理 `workspace.json` 引用。本能力给已归档会话补上两个出口：**移动到归档目录**（默认——日志搬去可配置的归档根，随时可按会话 id 手工找回）与**永久删除**（碎纸机——磁盘日志、投影缓存与工作区引用三处一起清掉）。两种处置都会让会话从侧栏与工作区记录中消失，区别只在磁盘上的日志是被**搬走**还是被**销毁**，全程无需停机手工操作。

### 入口规则

- 入口只出现在**已归档**会话行的 "..." 菜单中：菜单项 order **500**（官方 pin 100 / rename 200 / fork 300 / archive 400 之后，即排在「取消归档」后面），图标 `IconTrashOutlineRegular`。未归档行**不渲染任何 DOM**，想删先归档。
- 归档判定取自 client 侧 `workspaces` 服务快照的归档集合：在「全部对话（显示已归档）」/「仅显示已归档」筛选间切换，或被其它窗口归档/取消归档时，入口**即时出现或消失**，无需刷新页面。
- **刻意不做**键盘快捷键，也**不做**行内悬停按钮：不可逆操作只保留菜单里这一条路径，用摩擦换安全。
- 菜单可见性只是展示层：宿主两个端点各自独立校验归档状态（见「拒绝码」），另一窗口改了状态也删不掉。

### 两步确认

点击「删除会话」先向宿主请求**预览**（`preview-delete`），确认框展示：会话标题（取用户所点那一行的显示名——宿主侧归档会话没有 `Session` 实例，`SessionHeader` 也没有 title 字段）、本次处置的会话总数与级联子代理会话数、体积（迁移档为「移动体积」，删除档为「预计释放」；数字与模式无关），以及**处置方式单选**（见下节）。预览固定按默认档请求，结果里还带回宿主解析后的归档目录绝对路径（归档档在摘要下方展示「归档目录：…」）。切换单选**不重发**预览，只即时改变描述、体积行、警示、确认按钮与进行中 / 结果文案。预览被拒绝时对话框只读展示原因，**不提供确认操作**。

只有用户显式确认才发起执行（`delete-session`，请求携带最终选择的模式）；执行端点**重做一遍完整校验**，预览结果不携带任何授权语义——预览与执行之间被取消归档、会话转为 live 等状态漂移都由执行端兜住，不会产生部分处置。

### 处置模式

确认框里用一组单选在两种处置方式间二选一，**默认选中「移动到归档目录」**——不可逆操作必须由用户主动切过去，和「先归档才能删」一起构成两道防误删。单选在预览就绪后出现、执行期间禁用；无论选哪档，前置校验与处置集合计算都完全一致。

| | 移动到归档目录（默认） | 永久删除 |
| --- | --- | --- |
| 描述 | 「{title}」的会话日志将被移动到归档目录。 | 「{title}」归档的全部内容将被永久移除。 |
| 体积行 | 移动体积：… | 预计释放：… |
| 警示 | 日志移动到上述目录（保留项目目录层级），投影缓存与工作区记录同步清除；需要时可按会话 id 手工找回，**插件不提供恢复入口**。 | **不可撤销**：日志、投影缓存与工作区记录全部移除，任何界面都无法恢复。 |
| 确认按钮 | 移动到归档目录（常规色） | 永久删除（危险色） |
| 进行中 / 完成 / 失败 | 正在移动… / 已移动 N 个会话到归档目录。 / 归档未能完成：… | 正在删除… / 已删除 N 个会话。 / 删除未能完成：… |
| warnings 标题 | 以下项未能完成，需要手动清理： | 以下文件删除失败，需要手动清理： |

两模式共享：前置校验、处置集合（含级联 subagent 后代、不含 fork）、工作区引用清理（detach / unarchive / unpin）与移除事件广播；差异只在**文件动作**（搬到归档根 vs 直接删除）与**文案 / 确认语义**。共享附件在两种模式下都**不动**。

### 删除范围

**永久删除档**一次确认后，对目标会话及其全部 subagent 后代执行：

1. **工作区引用**：从所属工作区成员（`detachSession`）、归档集合（`unarchiveSession`）与置顶集合（`unpinSession`）中移除，三步全幂等，并触发官方工作区推送让分组行消失；
2. **磁盘**：删除会话日志目录 `~/.dsh/sessions/*/<会话id>/`（含 `session.v4.jsonl.zstd` 与 `session.lock`）与投影缓存 `~/.dsh/storages/session_projcache/sessions/<会话id>.json`；
3. **运行中 GUI**：逐 id 广播会话移除事件，侧栏对应行即时消失（含未分组行）。

级联与边界：

- **subagent 后代级联**：仅当会话头 `origin === 'subagent'` 且 `parentSession` 已在删除集合内时才递归（迭代到不动点）；子代理日志随父会话一起清理。
- **fork 不级联**：fork 的 `parentSession` 同样命中，但来源不是 subagent——fork 有自己独立的日志与生命周期，删除父会话永不牵连它。
- **共享附件永不清理**：`~/.dsh/attachments/v1` 是内容寻址去重存储，对象跨会话共享（含 fork 继承的历史引用），上游立场是「永远不会自动删除」且没有反向索引；本能力对附件**不做任何 GC**（设计上定为 SHALL NOT）。

**迁移档**的磁盘动作不同：会话日志目录整体搬到归档根而不是删除，投影缓存仍直接删除，工作区引用清理与移除事件广播完全同构（见下节）。

### 迁移范围（移动到归档目录）

迁移档只动「会话日志目录」这一件事：

1. **日志目录搬家**：把 `<DSH_HOME>/sessions/<项目目录>/<会话id>/` 整体移动到 `<归档根>/<项目目录>/<会话id>/`，**保留项目目录层级**——归档树与原 `sessions/` 树同构，同一会话 id 分属不同项目也不会撞名。目录里的 `session.v4.jsonl.zstd`、`session.lock` 等文件原样保留；级联的 subagent 会话各自落到其项目目录下。
2. **投影缓存直接删除**：`<DSH_HOME>/storages/session_projcache/sessions/<会话id>.json` 删除（与永久删除相同）——它是纯缓存：缺失时由日志重建，残留也不构成正确性风险。
3. **工作区引用与界面**：`detachSession` / `unarchiveSession` / `unpinSession` 与移除事件广播和永久删除完全一致；会话从侧栏消失且不会再从工作区记录里冒出来。
4. **共享附件不动**：任何模式都不清理 `~/.dsh/attachments/v1`（见上节边界），归档条目里的历史消息仍按内容寻址引用这些对象。

搬家细节：

- **rename 优先，跨设备回退复制**：同设备 `rename` 原子完成；跨文件系统（`EXDEV`）回退到递归复制，**全部复制成功后才删源**。复制中途失败时源完整保留，目标可能留下半成品，warning 同时点名源与目标（见「半失败」）。
- **目标已存在绝不覆盖**：归档根下已有同名会话目录时，该会话目录**不搬**、源保留，warning 形如 `<目标> already exists; … (source kept at <源>)`，两侧内容都不会被顶掉。归档目录按「本插件独占」设计，正常使用不会出现同名。
- **符号链接不复制**：目录树里出现符号链接时该项迁移失败、源保留（跨设备复制分支），不跟随也不静默丢数据。
- **不预检磁盘空间**：复制失败即该项失败、源保留——与上一条走同一条 warning 通道。

### 归档目录与手工找回

**缺省位置**：`$DSH_HOME/archive/sessions`（`DSH_HOME` 未设时即 `~/.dsh/archive/sessions`）。它跟随 `DSH_HOME` 迁移，不写死 `~/.dsh`；布局与原会话树同构：

```text
$DSH_HOME/archive/sessions/
└── <项目目录>/                 # 与原 sessions/ 下的项目目录名一致
    └── <会话id>/
        ├── session.v4.jsonl.zstd
        └── session.lock
```

**改归档根（可选）**：插件配置键 `archiveRoot`，接受**绝对路径**或 `~/` 开头的路径，省略时用上面的缺省值。在 profile 的 `cordis.patch.yml` 里按 id 覆盖本插件的行即可（bundle patch 只插入裸包名行，不带 `config:` 段；零配置可跑）：

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml（示例）
- id: web-ux
  name: dsh-plugin-web-ux
  config:
    archiveRoot: /data/dsh-archive/sessions   # 或 ~/dsh-archive
```

相对路径**不会**按进程 cwd 解析（daemon 的 cwd 不可预测）：插件会告警并回落到缺省根。宿主在每次处置请求里把配置归一成绝对路径（预览与执行同一套规则），确认框「归档目录：…」一行展示的就是解析结果——以它为准，不要靠猜。改完配置需重启 profile。

校验配置（会 import 插件）：

```bash
docker exec dsh dsh --profile web --dump-config-schema   # 本插件条目走原生 Schemastery schema
docker exec dsh dsh --profile web --dump-config | grep -A2 'id: web-ux'
```

**手工找回**：归档目录只是普通目录，插件**不提供恢复入口**（没有「从归档还原」的 GUI 或命令）。需要拿回数据时自己搬：

```bash
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
PROJECT_DIR=<原项目目录名>     # 归档根下一层，如 --home-xuqinqin-develop-person-dsh-plugins--
SESSION_ID=<会话id>

# 放回原位置（项目目录与会话 id 必须与归档树里的一致）
mkdir -p "$DSH_HOME/sessions/$PROJECT_DIR"
mv "$DSH_HOME/archive/sessions/$PROJECT_DIR/$SESSION_ID" \
   "$DSH_HOME/sessions/$PROJECT_DIR/"
```

- **搬回日志 ≠ 恢复原样**：处置时工作区记录（成员 / 归档集合 / 置顶）已被清除，`mv` 回去只让日志回到原位置；宿主重启后会重新扫描到它，但它只会落在「未分组」里，**原项目分组不会自动恢复**。插件不提供重新挂回原项目的入口，也不建议手改 `workspace.json`。
- **归档目录归用户管理**：插件只创建目录、只搬入；升级、卸载或回滚后它都是无主数据，可自行备份、移动或删除——**删除归档目录不影响任何 dsh 功能**（旧版本也从不读它）。
- 自定义 `archiveRoot` 时把命令里的缺省路径换成配置值；不确定项目目录名就直接 `ls "$DSH_HOME/archive/sessions"`。

### 拒绝码

预览与执行各自校验，拒绝时返回稳定错误码 + 可读原因（界面按码给本地化文案）：

| 错误码 | 触发条件 | 界面表现 |
| --- | --- | --- |
| `not-found` | 持久化层已无该会话头（例如已在别处删除） | 提示会话不存在；刷新后该行消失 |
| `not-archived` | 目标不在归档集合（含预览后被其它窗口取消归档） | 提示先归档再删除 |
| `session-live` | 删除集合中任一成员仍存活于宿主内存（消息点名具体 id） | 提示会话仍在运行，稍后重试 |
| `archive-unavailable` | **仅迁移档**：归档根不可用（不是绝对路径，或无法创建 / 没有写权限）；判定发生在**任何写动作之前** | 提示归档目录不可用、**未做任何改动**；会话保持归档状态，可排除原因后重试 |
| `bad-request` | 线上形状不合契约（含旧客户端不带处置模式、未知模式取值） | 内部错误文案 |

宿主未预期故障归一为 `internal`，传输异常与坏响应在浏览器半归一为 `unavailable` / `bad-response`，未知码统一走兜底文案。`archive-unavailable` 与逐项失败的区别是「什么都没发生」与「部分发生」：前者不碰 registry、不搬任何文件；后者只进 warnings（见「半失败」）。

### 上游依赖与降级

全部接触点均**软注册**：任一缺失只让对应入口或功能静默消失，不会让 Web GUI 报错或崩溃。out-of-tree 插件不能挂 Typert Remote namespace（契约生成属官方组合），因此跨端只走官方公开的 Connection RPC。

| 依赖 | 用途 | 失效表现 |
| --- | --- | --- |
| Connection RPC（host `connection.rpc.handle` / client `connection.rpc.call`，通道 `/web-ux`） | 浏览器↔宿主唯一通道（`preview-delete` / `delete-session`，请求携带处置模式） | 端点不可达，处置失败并提示传输错误 |
| slot `sidebar.workspaces.session.menu.item`（`dsh-client-ui-workspace`） | 会话行 "..." 菜单入口 | 入口不渲染 |
| slot `shell.overlay`（`dsh-client-ui-layout`） | 预览确认对话框 | 对话框不出现（点入口无反应，处置不会发生） |
| client 服务 `workspaces`（归档集合快照） | 入口可见性判定 | 入口不出现（宿主端 `not-archived` 防御独立成立） |
| client 服务 `connection` / `workspaces`（**渲染期软读**，不在 cordis `inject` 名单里） | RPC 调用 / 归档集合快照 | 入口与对话框渲染为 `null`（静默不出现），**既有徽章不受影响**；服务晚于插件 `apply` 就绪时也能正常生效 |
| client 服务 `slots` / `locale` / `modelDirectories`（cordis `inject` 名单） | 座位注册、文案字典、徽章数据 | 客户端半整体不激活（含徽章）；`locale` 缺失时带 `locale: 'webUx'` 的 entry 本就不该渲染，故不注册是正确降级 |
| host 服务 `workspaceRegistry` / `sessionPersistence` / `dshHomePath`（cordis `inject` 名单） | 引用清理、会话头清单、磁盘定位与归档根解析（缺省根） | 宿主行不激活、通道不挂载 → 浏览器侧调用得到 `unavailable` |
| host 服务 `sessions`（软读，未列入 `inject`） | live 判定 | 无该服务时一切会话都按「非 live」处理（archived 且非 live 才可处置，归档语义本身已排除运行中的会话） |
| host 事件 `api-session/removed`（**借用**） | 让运行中 GUI 的会话列表删行 | **处置成功但需手动刷新页面**（见下） |

**注意 `dsh.client.inject` 是模块图顺序依赖，不是运行时 import**：`package.json` 里列的上游客户端包（ui-workspace / ui-layout / ui-renderer / client-connection / client-locale）只用于保证浏览器 boot 图里这些客户端模块先到位（`external` 才表达 bundle 的 `require` 词）。这份声明同时也是**激活面**：web 组合若裁剪掉其中任一个，本插件的客户端半整体不加载，徽章会与删除入口一起消失（而不是 GUI 报错）。已核实 web 组合恒含这几个包，故该分支实际不可达；cordis `inject` 侧同理——`slots` / `locale` / `modelDirectories` 缺失时整半不激活。

**`connection` / `workspaces` 必须在 entry 的注入面（渲染期）读取，不能在 `apply` 里读**：真实 web 组合中 `workspaces` 由 `api-workspace-controller` 在 remote 网关就绪后才 `provide`，晚于本插件 `apply`；若在 `apply` 里 `ctx.get('workspaces')`，拿到的是 `undefined`，删除入口会永久丢失（v1.2.0 即此缺陷，v1.2.1 修复）。改为渲染期读取后，服务缺席时两个 entry 各自渲染 `null`，既有徽章完全不受影响。

**关于借用的 `api-session/removed`**：它是官方 Remote Event Selection 里声明可转发（`mode: "emit"`）的事件，client 会话列表模型正是靠它删行——但事件语义归属官方 session controller，我们只是**借用上游内部行为**，本包的类型声明里也没有它。若上游更名或不再转发，降级表现是：**处置本身照常成功，工作区记录与磁盘也已清理，只是当前页面上的行需要手动刷新才消失**（重新打开页面不会复活）。工作区引用清理引发的官方推送不依赖本事件，分组行的消失不受影响。

### 半失败（warnings）与手工清理

两种模式共用同一条执行循环，顺序刻意是「registry 引用清理 → 文件动作 → 事件广播」：JSON 域写入几乎不失败，文件动作可能因权限 / 挂载 / 跨设备失败；先做可靠步骤、把不可靠步骤降级为**结果里的 warnings**（逐条形如 `<路径>: <原因>` 或 `<源> -> <目标>: <原因>`，机器可读，界面原样列出）。文件动作失败**不中止、不回滚**：会话仍从界面与工作区记录中消失，只是磁盘上留下需要手工收拾的状态。清理顺序保证任何半失败状态都可再处理收敛（detach 幂等、文件可再搬再删），反向顺序则会留下不可重试的死状态。

迁移档的失败形态（warnings 正文为英文，界面原样列出）：

| 警告形状 | 含义 | 手工处理 |
| --- | --- | --- |
| `<源> -> <目标>: <原因>` | 该项移动失败，**源完整保留**；跨设备复制分支下目标可能留下半成品 | 排除原因（权限 / 挂载 / 父级不可建）后按 warning 里的两条路径手动搬；复制半成品要先清掉目标 |
| `<目标> already exists; … (source kept at <源>)` | 归档里已有同名会话目录，**绝不覆盖** | 人工比对两侧，确认归档那份不要后清掉目标，再把源搬过去 |
| `moved to <目标> but the source could not be removed: <源>: <原因>` | 数据已在归档、源没删掉 | 核对目标完整后删除源目录 |
| `<缓存路径>: <原因>` | 投影缓存没删掉 | 残留无害，可忽略或手工删 |

**全项失败**（一个会话目录都没搬成、界面却已让它消失）是本设计接受的已知代价：数据仍完整留在 `sessions/`，warning 逐条点名源与目标，按上表手工搬即可。不要指望在界面重跑——工作区记录已清，再点会得到 `not-archived`（与删除语义一致）。

删除档的 warnings 是文件删除失败，路径可手工清除（工作区记录已收敛，**不要**再手改 `workspace.json`）：

```bash
rm -rf ~/.dsh/sessions/*/<会话id>
rm -f  ~/.dsh/storages/session_projcache/sessions/<会话id>.json
```

- 投影缓存是纯缓存：残留或缺失都由会话日志重建，不构成正确性风险（迁移档同样删缓存，失败也只是留下可忽略的残留）。
- 日志目录扫描不到只记 warning 而非失败（registry 已清理，重启后自愈过滤）；扫描按会话 id 在 `sessions/*/` 下逐项目目录定位，成本与项目目录数线性。
- 附件目录 `~/.dsh/attachments/v1` **不在**手工清理范围内：没有反向索引、对象跨会话共享，除非确认所有会话都不再需要这些对象，否则不要整目录清理。

### 非目标（本能力）

- **批量处置**：V1 一次一个会话，只能从行菜单逐个来（两种模式都是）。
- **「停止并删除」**：live/运行中会话一律拒绝，本能力不负责停会话。
- **未归档会话直接删除**：想删先归档——两步防误删的第一道就是归档。
- **不做恢复 GUI**：归档目录归用户手工管理，本插件只创建与搬入，不提供「从归档还原 / 重新挂回原项目」的界面或命令；找回方式见[「归档目录与手工找回」](#归档目录与手工找回)。
- **附件/图片 GC**：上游没有安全回收路径，见上。
- **多 DSH 版本精确兼容门**：接触点全部软降级，不引入版本 allowlist（与 multi-root 插件的 fail-closed 策略差异源于风险属性——本功能失效的代价只是入口消失）。

## 命令结果通知

DSH 的命令结果只渲染为会话 transcript 里的持久 flow node（composer 从不回显命令结果），而**空会话首屏没有 transcript 容器**——在欢迎视图执行 `/inventory` 这类命令时，结果尽管已正确返回，界面上却无处呈现。本能力给这种「无处渲染」的场景兜底：composer 上方弹一张临时通知卡（`conversation.input.overlay`，order 10，排在官方命令补全弹层之后），展示命令名 + 结果首行摘要，可展开滚动全文。

### 触发与隐藏规则

- **事件源**：浏览器本地公共事件 `command/executed`（`dsh-session-log-export` 同款消费先例）；只有本页面发起的命令执行会广播，跨标签页天然互不干扰。
- **只在结果不可见时弹**：卡片按会话观察两件事的合取——`sessions.retainInfo` 的主视图引用计数（`retainedBy.mainView`，会话是否被选中）与 `SessionSnapshot.blank` 空白标记（会话流有没有可渲染的内容行，品牌页同款信号）。两者皆正（选中且非空白）说明结果已作为 flow node 可见，不打扰；展示期间变为可见（如 prompt 型命令提交后首个落地事件清零空白标记）即自动隐藏，不分成败。注意空会话首屏执行命令时宿主会创建/复用空白会话并把它选进主视图——此时计数虽为正，transcript 仍一行内容都没有，卡照样弹出（这正是要兜底的场景）。
- **prompt 型与宿主求值型统一适用**：两类命令走同一条 execute → 广播通道，负载无类型标记，无法也不必区分——「会话流可见即隐藏」规则天然化解 prompt 型命令的卡片残留。
- **无文本的成功不通知**：富呈现结果（`sourceEventSeq` 指针型）有自己的专用渲染，`success` 且无 `text` 的事件被直接丢弃；不合格载荷（命令名非字符串、结果缺 kind/text 结构）一律丢弃并记 `console.warn` 诊断，最坏情况是「回到现状」，绝不影响命令执行本身。

### 消失路径（按结果类型分治）

- **成功卡**：10 秒自动消失；**展开期间冻结计时、收起后从剩余时间恢复**——读长清单不被打断；
- **错误卡**：不自动消失，仅手动关闭（错误提示常需照着改输入）；错误色边框区分。

每会话至多一张卡，新命令替换旧卡（旧结果已在会话流落盘）；store 不持久化，刷新即空。卡片不持久、不排队、不跨标签页协调——它是兜底反馈，不是归档。

### 非目标（本能力）

- **不改变**命令结果在 transcript 中的既有 flow node 渲染（那是结果的持久家）；
- **不解决**「flow node 折叠态不显眼」的通用可读性问题（高亮/滚动定位属后续独立变更）；
- 准入未命中（unknown command）不广播事件，无卡可弹，属预期。

## 双端结构

```text
src/index.ts           宿主半：挂 Connection RPC 通道 /web-ux（按 mode 分派删除 / 迁移）
src/config.ts          宿主配置：原生 Schemastery `Config`（archiveRoot）+ 归档根解析
src/contract.ts        双端共享契约：通道 / 端点 / 处置模式 / 失败码 + 手写边界校验（不引入 zod）
src/delete-session.ts  宿主处置流程：删除与迁移共用的 DI 纯流程 + 文件操作工厂（可 mock 单测）
src/client/            浏览器半：provider 徽章 + 删除入口 / 模式单选确认框 + 命令通知卡 + locale + CSS module
test/                  单测：宿主 *.test.ts（node 环境，config 用例无需 jsdom）与浏览器 *.test.tsx（jsdom）
```

宿主半对 `@deepseek-ai/*` 一律 **type-only import**，运行时只靠 `inject` 字符串拿服务，产物 `lib/index.js` self-contained（仅 `node:*` 外置）。**唯一例外是 `src/config.ts` 的 Schemastery `Config`**：它必须是**原生 Schemastery** 图（`--dump-config-schema` 只认原生图，换成 zod / 手写对象会把 profile 的 schema dump 拖红），由 esbuild 在构建期**内联**进宿主产物——因此只是构建依赖，运行时不解析任何 `@deepseek-ai/*`（`test/bundle.test.ts` 的模块词断言守护这一点）。它在宿主侧除处置职责外仍是**客户端模块扫描的锚点**：web 客户端模块扫描只从 **bare 包名行**读取 `dsh.client` 声明，所以 bundle patch 必须继续按包名插入本包，徽章与删除入口才会被浏览器加载——宿主半因此不能删。

## 构建

双端自包含产物，`build.mjs`（esbuild）一次产出两个文件，external 列表里只有 `node:*` 与浏览器壳提供的运行时模块：

- `lib/client.js` — `src/client/index.ts` 打成单个 CJS bundle 并包进 `window.__ModuleLoader__.load({ id, factory })` 外壳（`react` / `react-dom` / `react/jsx-runtime` / `@deepseek-ai/dsh-client-ui-primitives` 由浏览器壳经 loader `require` 提供），CSS modules 编译为运行时 `<style>` 注入，因此**没有独立样式文件**，也不依赖本包 `dependencies`。
- `lib/index.js` — 宿主半的单个 self-contained ESM 产物，承载 `/web-ux` Connection RPC 通道，同时是客户端模块扫描的 bare 包名锚点；Schemastery 已由 esbuild 内联，外置项仍只有 `node:*`。

类型工程是一个 solution（`tsconfig.json` 只汇总 references）+ 两个 composite 子工程，共享 `tsconfig.base.json` 的编译选项；两个子工程都是 `noEmit` 纯检查（不产 d.ts，只留 `.tsbuildinfo`，已被 `.gitignore` 忽略）：

- `tsconfig.host.json` — 宿主面（node 环境）：`src/index.ts`、`src/config.ts`、`src/contract.ts`、`src/delete-session.ts` 与宿主测试 `test/{bundle,config,contract,delete-session,index}.test.ts`。
- `tsconfig.client.json` — 浏览器面（jsdom 环境的用例自带 `// @vitest-environment jsdom`）：`src/client/**`、`src/contract.ts`（两端共享的边界 parser）、`test/**/*.test.tsx` 与 `test/{client-apply,delete-client,delete-store,locale-parity}.test.ts`、`test/stubs/ui-primitives.tsx`（vitest alias 的 primitives 替身）。

两个工程都显式列出被 import 的测试文件：composite 工程要求程序里的每个文件都在自己的 `include` 内（`test/**/*.test.ts` 会把客户端 `.ts` 用例拉进宿主工程而报 TS6307），所以按宿主/浏览器归属逐条列名，而不是用宽通配。

```bash
cd /home/xuqinqin/develop/person/dsh-plugins/plugins/web-ux   # 本包是 dsh-plugins workspace 成员
pnpm install
pnpm typecheck     # tsc -b：host + client 双工程
pnpm test          # vitest：徽章 + 删除/迁移流程与界面用例
pnpm lint          # oxlint
pnpm build         # esbuild → lib/index.js（宿主 RPC 载体，Schemastery 内联）、lib/client.js（徽章 + 删除/模式入口）
pnpm verify:all    # lint + typecheck + build + test

# 只查单侧类型（等价于 tsc -b 的对应子工程）
pnpm exec tsc -p tsconfig.host.json --noEmit
pnpm exec tsc -p tsconfig.client.json --noEmit
```

`lib/` 随仓库提交（release 时递归重建保证新鲜），`node_modules/` 不入库（见 `.gitignore`）。依赖由 workspace 统一安装：仓库根 `pnpm install` 一次装齐。

## 安装到 profile

```bash
# 发布后按 tag 装（推荐）
TAG=$(git describe --tags --abbrev=0)   # 当前 tag（也可填任意历史 tag）
docker exec dsh dsh plugin --profile web add \
  "github:exponentxqq/dsh-plugins#${TAG}&path:plugins/web-ux"

# 本地开发调试（改源码后重建 + 重启 profile 生效）
docker exec dsh dsh plugin --profile web add \
  /home/xuqinqin/develop/person/dsh-plugins/plugins/web-ux

docker exec dsh dsh --profile web --dump-config-schema   # 校验组合可加载（会 import 插件；本插件条目走原生 Schemastery schema）
docker exec dsh dsh --profile web --dump-config | grep -A2 'id: web-ux'
```

`dsh plugin add` 会把包追加进 profile `package.json` 的 `dsh.profile.bundles`，从而激活本包的 `cordis.patch.yml`（插入 `id: web-ux` 的 bare 包名行）。归档根（可选）在 profile patch 里按 id 覆盖本插件行配置，示例见「[归档目录与手工找回](#归档目录与手工找回)」。

### 版本迁移（v1.2.0）

- **升级**：v1.2.0 起本包双端化——新增删除入口与宿主 RPC 通道，provider 徽章行为零变化；`dsh.client.inject` 增补 workspace / connection / locale 依赖，peer 范围统一为 `>=0.2.1-rc.2 <0.3.0`。按 tag 重装即可：`dsh plugin --profile web add "github:exponentxqq/dsh-plugins#v1.2.0&path:plugins/web-ux"`，重启 web profile 生效。
- **回滚**：同一条命令改指 `#v1.1.1` 重装并重启，**只撤掉删除入口与宿主通道**（徽章照旧）；删除是真实写操作，已被删除的会话日志、投影缓存与工作区引用**不可恢复**，回滚不会让它们回来。

### 版本迁移（含迁移归档）

- **升级**：本能力随下一个发布 tag 生效。`/web-ux` 请求体新增**必填** `mode`（`delete` / `archive`）、预览响应新增 `archiveRoot`，其余契约不变；`dsh.client.inject` 与 peer 范围不变，按 tag 重装并重启 profile 即可。**升级前已打开的旧标签页**跑的是旧客户端（不带 `mode`）：新宿主会在**预览阶段**直接返回 `bad-request`，界面显示失败、不会发生「没选模式就被处置」；刷新页面加载新客户端即恢复。归档根可选，不配就用缺省 `$DSH_HOME/archive/sessions`。
- **回滚**：改指不含本能力的旧 tag（**当前已发布的 `v1.5.0` 及更早版本都没有本能力**）重装并重启。旧宿主不认带 `mode` 的请求，新标签页预览同样得到 `bad-request`，**刷新页面**加载随旧版回落的客户端即恢复「只能永久删除」的旧行为。回滚**不会**把已迁移的日志搬回 `sessions/`，也不会删除归档目录——已迁移数据留在归档目录不受影响（旧版本从不读取它），需要时按[「归档目录与手工找回」](#归档目录与手工找回)手动搬回。

两点运维须知：

- **源码改动要重启 profile**：`link:` 安装的插件不在 profile 目录内，dsh-hmr 默认的模块监听根不含它，重建产物不会自动热替换。要免重启，可在 profile patch 里给 hmr 行加模块监听根（`- id: hmr` / `config.root` 指向本包目录）——属开发便利，非必需。
- git 安装形态与 `insteadOf` 陷阱见仓库根 [README](../../README.md#装入-profile)。

## 非目标（本版本）

- 徽章不做点击交互（跨插件触发模型菜单无公开 API）。
- 不接管或重排官方 composer 工具行、模型选择器。
- 除「删除已归档会话」（删除 / 迁移处置）所需的 Connection RPC 通道外不提供其他宿主能力（项目级 MCP 属 [`dsh-plugin-project-mcp`](../project-mcp/README.md)）；处置能力自身的边界见「[删除已归档会话 → 非目标](#非目标本能力)」。

## 许可

Apache-2.0。
