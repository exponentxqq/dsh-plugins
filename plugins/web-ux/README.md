# dsh-plugin-web-ux

DSH Web GUI 插件（**双端**，`exports "."` 宿主 + `exports "./client"` 浏览器），承载四项 Web 界面体验：

1. **Provider 徽章**——输入框下方状态行（`conversation.composer.dock`）追加一枚静态胶囊，以 `provider/model` 原始标识符显示当前会话所选模型路由；
2. **删除已归档会话**——侧栏已归档会话行的 "..." 菜单入口 + 两步确认框，框内二选一：**移动到归档目录**（默认）或**永久删除**；宿主半的 Connection RPC 通道 `/web-ux` 承载其预览与执行两个端点（按请求里的处置模式分派）；
3. **会话管理**——统一「工作区配置」页面里的一个分节（`workspace-config.section`，order 30；holder 页面由独立插件 `dsh-plugin-workspace-config` 提供），按工作区（作用域由 holder 页面顶部的统一选择框决定）批量管理活跃 / 已归档 / 已迁移三类会话：批量归档、批量删除（迁移归档 / 永久删除）、批量取消归档、物理删除归档条目与恢复；宿主通道因此从 2 个端点扩到 7 个；
4. **命令结果通知**——命令结果在当前视图无处渲染时（典型：空会话首屏），composer 上方弹一张可展开全文的临时通知卡。

宿主半不再是空壳——它承载会话处置与归档目录管理的 Connection RPC 通道 `/web-ux`（单会话 2 端点 + 批量 / 已迁移 5 端点，共 7 个），同时继续充当 web 客户端模块扫描读取 `dsh.client` 声明的锚点。

本包自 `split-project-mcp-plugin` 变更起**只做 Web 界面体验**——原先同包的「项目级 MCP」宿主能力已拆为独立插件 [`dsh-plugin-project-mcp`](../project-mcp/README.md)（纯宿主面，任何 profile 可单独安装）。自 `add-web-ux-archived-session-delete`（v1.2.0）起宿主半因「删除已归档会话」重新变成实载体：文件系统与工作区注册表只有宿主碰得到，这与拆出去的 MCP 能力互不相干；自 `web-ux-session-delete-archive-option` 起同一入口再补上「移动到归档目录」，宿主半因此多了一个可选配置键 `archiveRoot`（`src/config.ts`）；自 `web-ux-session-manager` 起再叠加「会话管理」——归档目录从「只能手工找回」变成可列出、可清理、可恢复（恢复只回到已归档态），通道扩到 7 个端点，配置面零增量；自 `unify-workspace-config-entry` 起它的 GUI 从侧栏底部入口 + 独立浮层迁为统一「工作区配置」的分节（需与 holder 同装）；自 `2026-11-08-workspace-config-page` 起 holder 的壳由弹窗换成「侧栏面板行 + 独立页面」，本分节随之只消费页面级选择框下传的 `{ workspace }` 份额（节内工作区 Menu 与「关闭」出口一并删除，终点态统一为「完成」）。后续其他 Web 界面体验优化仍落在本包。

## 定位

端性：双端

DSH Web GUI 的**界面体验包**：在官方 Web 壳上以座位软注册叠加四项体验——composer 状态行的 provider 徽章、侧栏已归档会话的删除入口（可移动到归档目录）、统一「工作区配置」页面里的会话管理分节、命令结果无处渲染时的兜底通知卡。宿主半承载 Connection RPC 通道 `/web-ux`（7 个端点），除此之外不提供其他宿主能力；只做 Web 界面体验。

## Provider 徽章

- 数据来自会话共享的模型目录快照（`ctx.modelDirectories.directoryFor(sessionId).store`），切换模型（官方选择器或 `/model` 弹层）后徽章**无需刷新**即跟随；组件只读该快照，不改动任何官方座位。
- 标签为 `provider/model` **原始标识符**（`deepseek/deepseek-chat` 风格），直接取自选择本身，不依赖目录加载状态、不使用显示名；会话没有持久模型选择时**不渲染**。
- 样式对齐官方胶囊（同一套 `--dsh-content-font-*` / `--dsw-alias-*` 变量、`999px` 圆角、`1px 8px` 内边距）；标签有 `max-width` 上限并截断为省略号，不会把状态行撑出横向滚动。
- 空白会话期上游本就不渲染状态行，徽章随之缺席，不产生错误。

## 删除已归档会话

DSH 上游只有「归档」没有删除：持久化层不提供删除接口，归档像一只软删除抽屉，抽屉里的会话日志却在 `~/.dsh/sessions/` 无限累积，用户只能停 Host 后手工删目录、自己清理 `workspace.json` 引用。本能力给已归档会话补上两个出口：**移动到归档目录**（默认——日志搬去可配置的归档根，可在「会话管理 → 已迁移」里恢复，也可按会话 id 手工找回）与**永久删除**（碎纸机——磁盘日志、投影缓存与工作区引用三处一起清掉）。两种处置都会让会话从侧栏与工作区记录中消失，区别只在磁盘上的日志是被**搬走**还是被**销毁**，全程无需停机手工操作。

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
| 警示 | 日志移动到上述目录（保留项目目录层级），投影缓存与工作区记录同步清除；需要时可在侧栏「会话管理 → 已迁移」里恢复（只回到已归档态），也可按会话 id 手工找回。 | **不可撤销**：日志、投影缓存与工作区记录全部移除，任何界面都无法恢复。 |
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

搬家细节（`rename` 优先、跨设备回退复制、失败保留源等搬出与搬回共用的规则，见[「恢复语义」](#恢复语义)第 3 步；warning 形态见「半失败（warnings）与手工清理」）：

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

校验配置（装载冒烟以 `--dump-config` exit 0 为准）：

```bash
docker exec dsh dsh --profile web --dump-config          # 校验组合可加载（安装冒烟探针）
docker exec dsh dsh --profile web --dump-config-schema | grep web-ux   # 本插件条目走原生 Schemastery schema（全局 exit 1 为既有 preset 豁免，勿追全局退出码）
docker exec dsh dsh --profile web --dump-config | grep -A2 'id: web-ux'
```

**恢复与手工找回**：归档目录只是普通目录。插件在侧栏「会话管理 → 已迁移」里提供 GUI 恢复：把条目搬回 `sessions/<项目目录>/<会话id>/`，按项目目录正推匹配工作区并重新挂回，**只回到已归档态**（不恢复置顶，也不会直接变回活跃）；匹配不到工作区的条目落到「未分组」。GUI 恢复只处理归档根下「项目目录 / 会话目录」两层结构里的条目；归档根之外的目录请手工处理。也可以自己搬：

```bash
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
PROJECT_DIR=<原项目目录名>     # 归档根下一层，如 --home-xuqinqin-develop-person-dsh-plugins--
SESSION_ID=<会话id>

# 放回原位置（项目目录与会话 id 必须与归档树里的一致）
mkdir -p "$DSH_HOME/sessions/$PROJECT_DIR"
mv "$DSH_HOME/archive/sessions/$PROJECT_DIR/$SESSION_ID" \
   "$DSH_HOME/sessions/$PROJECT_DIR/"
```

- **搬回日志 ≠ 恢复原样**：处置时工作区记录（成员 / 归档集合 / 置顶）已被清除。走「会话管理 → 已迁移」的 GUI 恢复会按 `projectDir` 正推匹配工作区并 `attachSession`（上游按 header cwd 二次校验），匹配成功即挂回原项目、回到**已归档**列表，匹配不到则落到「未分组」（管理面「未匹配工作区」伪选项下可见）；手工 `mv` 只让日志回到原位置，宿主重启后会重新扫描到它，但它只会落在「未分组」里，**原项目分组不会自动恢复**。两条路径都不恢复置顶，也不建议手改 `workspace.json`。
- **归档目录归用户管理**：插件只在归档时创建目录、搬入条目；「会话管理」会按用户显式操作删除或恢复条目，但不会自动清理空项目目录，也不会在升级 / 卸载 / 回滚时改动它。升级、卸载或回滚后它都是无主数据，可自行备份、移动或删除——**删除归档目录不影响任何 dsh 功能**（旧版本也从不读它）。
- 自定义 `archiveRoot` 时把命令里的缺省路径换成配置值；不确定项目目录名就直接 `ls "$DSH_HOME/archive/sessions"`。

### 拒绝码

预览与执行各自校验，拒绝时返回稳定错误码 + 可读原因（界面按码给本地化文案）。单会话、批量与已迁移域共用这张表：

| 错误码 | 触发条件 | 界面表现 |
| --- | --- | --- |
| `not-found` | 持久化层已无该会话头（例如已在别处删除） | 提示会话不存在；刷新后该行消失 |
| `not-archived` | 目标不在归档集合（含预览后被其它窗口取消归档） | 提示先归档再删除 |
| `not-migrated` | **仅已迁移域**：归档根下没有该条目（已被手工移动 / 删除，或不是目录） | 提示归档条目不存在；刷新列表后该行消失 |
| `target-exists` | **仅已迁移域（恢复）**：恢复目标位 `sessions/<项目目录>/<会话id>` 已存在同名目录 | 提示目标已存在、**未做任何改动**；先处理冲突再重试 |
| `session-live` | 删除集合中任一成员仍存活于宿主内存（消息点名具体 id） | 提示会话仍在运行，稍后重试 |
| `archive-unavailable` | 归档根不可用（不是绝对路径，或无法创建 / 读取 / 没有写权限）；判定发生在**任何写动作之前** | 提示归档目录不可用、**未做任何改动**；会话保持归档状态，可排除原因后重试 |
| `bad-request` | 线上形状不合契约（含旧客户端不带处置模式、未知模式取值、单批超过 500 个目标） | 内部错误文案 |
| `internal` | 宿主未预期故障（服务缺失、I/O 异常等非业务拒绝） | 内部错误文案；失败可能发生在流程中途，以 warnings / 宿主日志为准 |

传输异常与坏响应在浏览器半归一为 `unavailable` / `bad-response`，未知码统一走兜底文案。`archive-unavailable` 与逐项失败的区别是「什么都没发生」与「部分发生」：前者不碰 registry、不搬任何文件；后者只进 warnings（见「半失败」）。批量与已迁移域的**整单拒绝**返回首个被拒目标的码；逐项文件失败不是失败码，只进结果里的 warnings。

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

（批量处置与归档目录的 GUI 恢复见下一节[「会话管理」](#会话管理)——单会话行菜单入口与对话框保留不动，批量是叠加而不是替代。）

- **「停止并删除」**：live/运行中会话一律拒绝，本能力不负责停会话。
- **未归档会话直接删除**：想删先归档——两步防误删的第一道就是归档。
- **附件/图片 GC**：上游没有安全回收路径，见上。
- **多 DSH 版本精确兼容门**：接触点全部软降级，不引入版本 allowlist（与 multi-root 插件的 fail-closed 策略差异源于风险属性——本功能失效的代价只是入口消失）。

## 会话管理

统一「工作区配置」页面里的一处分节：把活跃会话批量归档、把已归档会话批量删除或取消归档、把归档目录里的已迁移日志清理或恢复。它是既有单会话「...」菜单入口的**叠加**而不是替代（D17）——最短路径仍是行菜单，批量与归档目录管理才走这里。宿主通道因此从 2 个端点扩到 7 个，配置面零增量（归档根沿用既有 `archiveRoot`）。

### 入口与降级

本包不再注册侧栏底部入口或独立浮层：会话管理以 `workspace-config.section`（order **30**，`id: web-ux-session-manager`，label thunk「会话管理 / Session manager」）软注册为统一「工作区配置」页面的第三个分节（tab），由 holder 的 `main` 页面按 nav 选中项经 `renderSlot(..., { only })` 渲染。打开与关闭都由 holder 拥有——切页面、切 tab 由宿主的 `main` 座位完成；分节除「完成」把流程复位回选择阶段外不参与任何关闭动作，本身只渲染**行内动作条**（`[返回]` / `[确认执行]` / `[完成]`），不存在第二个 Modal。

**四包同装约定**：统一入口（holder 的侧栏面板行 + 独立页面）与分节座位由 [`dsh-plugin-workspace-config`](../workspace-config/README.md) 声明；未装 holder 时本分节的 `slots.inject` 永不触发，会话管理的 GUI 入口不存在（其余三项能力不受影响，`/web-ux` 通道照常）。建议与 [multi-root-workspace](../multi-root-workspace/README.md)、[session-tool-toggle](../session-tool-toggle/README.md) 及 holder 四个包一起安装。

分节是五阶段机（选择 → 确认 → 执行 → 完成 / 失败），阶段切换只换同一块分节内容，不叠第二个弹窗；分节按 holder 的 `only` 过滤懒渲染，切走即卸载，重新选中 tab、切换页面级工作区（分节随 `key` 重挂）或重进页面都会重置阶段、选择、预览与已迁移列表。

**离开页面（D16）**：请求发出后 `running` 阶段的动作条保持禁用且不再挂 `onClick`（请求无法撤销），但离开页面不再被分节否决——切到侧栏别的面板、切走分节或重进页面都随时可以，请求在宿主侧继续完成，重新进入分节看列表即可验证结果。

全部接触点软注册、服务在**渲染期**解析（理由同既有删除面：web 壳的工作区 / 会话服务晚于本插件 `apply` 就绪）：

| 依赖 | 用途 | 失效表现 |
| --- | --- | --- |
| slot `workspace-config.section`（`dsh-plugin-workspace-config` 声明） | 会话管理分节 | 分节不注册；其余能力不受影响（holder 缺席即无 GUI 入口，符合四包同装约定） |
| Connection RPC `/web-ux`（client `connection`） | 批量 / 已迁移端点调用 | `connection` 服务缺席 → 分节渲染「服务未就绪」空态；通道不可达 → 调用失败并提示传输错误 |
| client 服务 `workspaces` / `sessions`（渲染期软读，不在 cordis `inject`） | 三域行集、选择与动作 | 任一缺席 → 分节保留并显示「服务尚未就绪」空态（不再 return null，D9）；服务晚于 `apply` 就绪也能正常生效 |
| host 事件 `api-session/added`（**借用**） | 恢复后侧栏即时补行 | 恢复仍成功，但需手动刷新页面才看见行（spec 已声明该降级） |
| host 事件 `api-session/removed`（**借用**，批量删除复用既有处置流程） | 批量删除后行即时消失 | 处置成功，但当前页面上的行需手动刷新才消失 |

宿主通道 `/web-ux` 共 7 个端点：既有 `preview-delete` / `delete-session`，新增 `preview-delete-batch` / `delete-session-batch` / `list-migrated` / `delete-migrated` / `restore-migrated`；请求体仍走白名单严格校验（未知字段拒绝、必填处置模式、单批 ≤500、路径片段合法性）。

一个工作区都没有时，页面选择框只剩「未分配」一项（分节与页面共享同一个份额），活跃域给「还没有任何工作区」空态，已归档 / 已迁移域仍按未匹配集合枚举。既有单会话「...」菜单入口与两步确认框**保留不动**，管理面与它互不替代。

### 工作区与三个 tab

作用的工作区由 holder 页面的**统一选择框**决定（分节不再有节内选择），默认按 Q10 解析：最近使用（该工作区成员会话里最大的 `updatedAt`）> 当前会话所属工作区 > Host 顺序第一个；没有任何工作区时取「未分配」。切换工作区、tab 或处置模式都会丢弃当前确认页与结果、回到选择阶段（换工作区 = 分节重挂，由 `key` 驱动，D14）；各 tab 的选择集合分开保存，切 tab 不丢另一边的勾选。

| tab | 行集 | 批量动作 |
| --- | --- | --- |
| **活跃** | 所选工作区的成员、未归档、在 Host 会话列表中，滤掉 `origin === 'subagent'`；运行中的行保留但置灰不可选 | 「归档所选」——客户端逐个调用上游 `archiveSession`，逐项报告 |
| **已归档** | `archivedSessionIds ∩ 所选工作区 sessionIds`（伪选项下改为孤儿集合），滤掉 subagent；运行中的行同样置灰 | 「处置所选」——按当前处置模式删除（**移动到归档目录**（默认）/ **永久删除**，单选复用单会话对话框的文案；预览 → 确认 → 执行）；「取消归档所选」——客户端逐个调用上游 `unarchiveSession`，逐项报告。两动作共享同一选择集合、任一在途时互斥 |
| **已迁移** | 归档根下「项目目录 / 会话目录」两层条目，按 `projectDir` 正推匹配工作区；目录名即会话 id（不做 `session-` 前缀归一），体积只算目录内一层文件、时间取目录 mtime、按 `updatedAt` 倒序；标题从日志前缀**尽力**提取（取首个 `session/title` 事件，缺失回退目录名短码，限制见[「边界与已知限制」](#边界与已知限制)） | 「永久删除所选」与「恢复所选」——确认后一次调用；删除没有预览端点（条数与体积在客户端聚合），恢复有校验阶段（见[「恢复语义」](#恢复语义)） |

行视图为**两行式**：首行 = Checkbox（其可访问名即行内唯一可访问名）+ 徽标（`aria-hidden`，不进可访问名）；次行 `.rowMetaRow` 承载弱化 meta。徽标三种：`running` / `blank` 沿用既有语义，`fork` 判据是 `parentId` 非空且 `origin !== 'subagent'`。**管理面不出现子代理会话**（与侧栏一致）：它们的处置依赖父会话级联；父会话已删的孤立归档子代理因此没有入口（已接受的代价）。运行中的行置灰不可选，服务端拒绝仍是竞态兜底。

首行主标识与次行 meta 按域区分：**活跃 / 已归档**行主标识取 `displayTitle`，空标题显示「（无标题）」，次行 = 项目目录尾段（悬停见全路径工作目录）· 更新时间（悬停完整时间串）；**已迁移**行主标识 = 日志标题（尽力提取，缺失回退目录名短码——会话 id 取 16 字符 + `…`），次行 = 会话 id 短码（仅标题来自日志时显示，回退行的首行标识本身已是短码）· 工作区名或项目目录 · 体积 · 紧凑时间（当年 `MM-DD HH:mm`、跨年带完整日期，悬停完整串；迁移行悬停为迁移时间与创建时间两段）。

每个 tab 配一个**过滤框**（大小写不敏感子串；三域过滤词各自独立保存、互不串扰）：活跃 / 已归档匹配标题 + 会话 id + 工作目录，已迁移匹配标题 + 会话 id + 目录名 + 项目目录 + 工作区名；全选与批量动作只作用过滤后的可见行；被筛空时空态文案回显查询词。tab 名旁的**计数徽标**随过滤实时显示可见行数（`aria-hidden`，不进可访问名；已迁移列表未加载时不渲染）。「已迁移」tab 工具栏 = 刷新按钮 + 归档根路径显示（悬停全路径）。

### 伪选项：未匹配工作区

holder 页面选择框的末项**恒为**「未分配」（伪选项：即使当前没有无主条目，也不忽隐忽现）。选中它时本分节枚举未匹配工作区的集合：

- **已归档**：`archivedSessionIds` 中不属于任何工作区成员位的会话——典型是工作区被删后留下的孤儿归档。这些行没有工作区入口，但在伪选项下同样可删、可取消归档。
- **已迁移**：`projectDir` 正推匹配不到任何工作区的归档条目；可删、可恢复。
- **活跃**：恒为空态并说明原因（孤儿定义即无归属；未归档但不在任何工作区的会话仍显示在侧栏「未分组」，不归本伪选项管）。
- 伪选项下恢复的条目必然匹配不到工作区，恢复后落在「未分组」，可在本伪选项的已归档域再次找到（确认页会显式提示）。

### 批量语义

这些动作按「有没有文件动作」分两档，失败语义刻意不同：

**文件动作类：预览软失败 + 执行整单拒绝**

- **已归档删除**：点「处置所选」先向宿主请求批量预览——宿主对全部勾选目标逐项校验，一次算清目标数、去重后的级联并集会话数、级联子代理数、合并体积与归档根回声，并返回被拒清单（id + 失败码）。预览**不会因为个别目标被拒而失败**：被拒项在确认页列出并从本批剔除，其余目标照常可确认；全部被拒时确认按钮禁用。执行只发送未被拒的目标，宿主**重新校验**——预览后状态漂移（取消归档 / 转为 live）会整单拒绝、零副作用，界面显示首个被拒码。
- **已迁移物理删除**：没有预览端点，确认页的条数与体积由客户端聚合；宿主先逐条校验条目存在且是目录（`not-migrated`），任一失败整单拒绝，然后逐条删除。
- **恢复**：校验阶段先逐条确认条目存在（`not-migrated`）且目标位不存在（`target-exists`），任一失败整单拒绝、一条都不搬；执行阶段逐条搬运（见[「恢复语义」](#恢复语义)）。
- 通过校验后的文件动作**失败不中止、不回滚**（warnings 语义与手工清理见[「半失败（warnings）与手工清理」](#半失败warnings与手工清理)）：已归档删除的工作区记录已先清理（界面行不会回来，磁盘残留由 warnings 点名）；已迁移删除失败时目录仍在，刷新后会重新出现；恢复失败时条目留在归档根、不计入 `restored[]`。批量删除的 `removed` 按校验通过的并集全量计，文件失败不回退这个结论——**结果计数按校验通过的条目计，真实落盘状态以 warnings 为准**。

**registry 可逆类：客户端循环 + 逐项报告**

- **批量归档 / 批量取消归档**：上游单调用面是可逆的 registry 操作，客户端按会话逐个串行执行，绝不因单项失败中断；结果给出成功数与逐条失败原因（如 `workspace/session-active`）。这类动作不适用整单拒绝。运行中的行在选择阶段已置灰，竞态失败按上游码逐项报告。逐项循环中途关闭页面会留下部分已完成的结果，剩余项需重新选择。

**在途互斥与结果**

任一动作执行期间分节进入 `running`：动作按钮与选择条一起消失，同一时刻只有一个动作在飞；动作条保持禁用且不再挂 `onClick`（请求无法撤销），但离开页面（切侧栏面板 / 切分节 tab / 重进页面）随时可以——请求在宿主侧继续完成，重进分节看列表验证结果（D16）。完成后：

- **成功面板**给出计数（归档 / 取消归档 / 处置 / 永久删除 / 恢复）、逐项失败清单与 warnings；恢复成功**停在原 tab** 展示结果（不自动切走，P3=A），已迁移列表在 purge / restore 成功后自动重发一次。
- **失败面板**给出失败码文案与宿主兜底 message；`[返回]` 与 `[完成]` 都回到选择阶段（`manager.finish` → `resetToSelect`，终点态统一出口）。重进页面会重置阶段、选择与列表。

### 500 上限与分批操作

- **单批上限 500**（`MAX_BATCH_TARGETS`）：全选只取当前行序里前 500 个可勾选行并显示「条目过多，只列出前 500 个…」提示；手动勾选到 500 后新行不再进入选择；请求体超过 500 直接 `bad-request`。运行中的行不计入这 500。
- **分批序列**（超出时）：① 先按工作区拆，或选伪选项处理无主条目；② 全选 → 确认执行——已归档行处置后即从列表消失，已迁移列表在成功后自动重发；③ 再次全选剩余 → 重复；已迁移 tab 必要时点「刷新归档列表」；④ 单个范围长期超过 500 时按项目目录 / 伪选项分开处理，或先清理归档根。
- **列表上限 2000**（`MAX_LISTED_MIGRATED`）：已迁移列表一次最多列 2000 条，超出显示截断提示（先清理再刷新）；活跃 / 已归档两 tab 由客户端快照派生，不设此上限，但单批动作仍受 500 限制。
- 量级假设是「数百条」：不做虚拟滚动，列表一次渲染；超过 2000 条请先分批清理。

### 恢复语义

恢复把归档根里的条目搬回会话持久化目录原位，并重新挂回工作区。归档根沿用既有 `archiveRoot`（缺省 `$DSH_HOME/archive/sessions`），本能力不新增配置键。

1. **目标路径取自归档树自身**：`<home>/sessions/<projectDir>/<dirName>`——`projectKey` 只用于「条目 ↔ 工作区」匹配，绝不用于反推目录位置（它有意有损）。
2. **校验阶段零写**：条目必须在归档根下存在且是目录（否则 `not-migrated`）；目标位不得存在（否则 `target-exists`）；任一条失败整单拒绝，一条都不搬。
3. **搬运**：`mkdir -p` 目标父目录 → `rename`（同设备原子完成）；跨文件系统（`EXDEV`）回退到递归复制，全部复制成功后才删源，中途失败源保留、目标可能留半成品（warning 点名）。
4. **挂回工作区**：按 `projectKey(workspace.path) === projectDir` 正推匹配；匹配到就 `attachSession` 挂回（上游按 header cwd 二次校验——即使匹配错也只会被拒，不会写错工作区），匹配不到或上游拒绝则记 warning、条目仍算已恢复并落到「未分组」（管理面「未匹配工作区」伪选项下可见）。随后把会话放回 registry 归档集合，**状态回到已归档**（不是活跃，也不恢复置顶）。
5. **即时可见**：宿主读一次持久化列表拿真实 header，对恢复出的 id 广播 `api-session/added`——匹配到工作区的行在侧栏已归档区无需刷新即出现；广播缺失或失败只记 warning，刷新页面后可见（恢复本身不受影响）。
6. **收尾**：归档根下对应目录消失，已迁移列表自动重发；空项目目录不清理（无害且幂等）。恢复只认归档根下「项目目录 / 会话目录」两层结构里的条目，归档根之外的目录不在列表里，请走[「归档目录与手工找回」](#归档目录与手工找回)的手工流程。

### 失败码

批量与已迁移域沿用上一节[「拒绝码」](#拒绝码)的稳定码表（8 个），本次新增两码：

| 错误码 | 触发场景 | 语义 |
| --- | --- | --- |
| `not-migrated` | 已迁移条目在归档根下不存在 / 不是目录 | 整单拒绝、零副作用 |
| `target-exists` | 恢复目标位已有同名目录 | 整单拒绝、零副作用 |

整单拒绝取首个被拒目标的码（`bad-request` 也用于超限与形状不符）；逐项文件失败只进 warnings，不产生失败码。客户端把宿主码原样透传，未知码走 `error.fallback`。

### 边界与已知限制

- 「已迁移」tab 不轮询：用「刷新归档列表」手动取数；purge / restore 成功后自动重发一次；标题提取也只在列表时对日志前缀读一次，不做轮询或增量重读。
- **标题是尽力显示，不是准确值**：宿主枚举时读日志压缩前缀（128KiB 起、不足再放宽到 512KiB，按 zstd 帧边界截断），解压文本预算 256KiB（帧粒度早停，首个 `session/title` 命中即停）——取的是前缀里**首个**标题事件，不承诺最新，改过题的会话约 6.1% 显示旧题；约 0.5% 的条目在预算内解不出标题，回退目录名短码。
- **环境不支持 zstd 时标题不可得**：Node < 22.15 或宿主 zlib 缺 `zstdDecompressSync` 时，加载期特性探测命中缺失分支，标题功能静默降级（应答中 `title` / `createdAt` 一律缺省），列表行为与变更前逐字节一致。
- 不做 undo：恢复可再归档，物理删除不可逆（danger 色 + 确认页已明示）。
- 其余边界不在此重复：停止并删除与共享附件见[「非目标（本能力）」](#非目标本能力)，subagent 无入口见[「工作区与三个 tab」](#工作区与三个-tab)，虚拟滚动与列表上限见[「500 上限与分批操作」](#500-上限与分批操作)，置顶与空目录见[「恢复语义」](#恢复语义)，`api-session/added` 降级见[「入口与降级」](#入口与降级)。

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
src/index.ts                          宿主半：挂 Connection RPC 通道 /web-ux（7 端点分派）+ 恢复后广播 api-session/added
src/config.ts                         宿主配置：原生 Schemastery `Config`（archiveRoot）+ 归档根解析
src/contract.ts                       双端共享契约：通道 / 7 端点 / 处置模式 / 8 个失败码 / 3 个上限 + 手写边界校验
src/project-key.ts                    双端共享纯函数：projectKey 本地镜像 + projectDir → 工作区正推匹配（零 import）
src/delete-session.ts                 宿主处置流程：单会话与批量删除 / 迁移共用 DI 纯流程 + 文件操作工厂
src/migrated.ts                       宿主已迁移域：枚举归档根、物理删除、恢复（两阶段；rename 优先、EXDEV 回退复制）
src/session-log-title.ts              宿主标题提取纯逻辑：规范日志名挑选 / zstd 帧边界惰性扫描 / 压缩前缀探测（零 import）
src/client/                           浏览器半：provider 徽章 + 删除入口 / 确认框 + 会话管理分节 + 命令通知卡 + locale + CSS module
src/client/session-manager-model.ts   管理面纯派生：三域行集、伪选项聚合、500 上限（工作区选项与默认档已迁 holder 的 workspace-choice）
src/client/display-format.ts          浏览器面展示纯函数：id 短码 / 路径尾段 / 紧凑时间戳（零 import）
src/client/SessionManagerDialog.tsx   会话管理分节：五阶段机 + 三 tab + 批量动作（作用工作区由页面级选择框经份额传入，无 Modal 外壳）
src/client/session-manager.module.css 分节样式（复用 --dsw-alias-* 令牌）
test/                                 单测：宿主 *.test.ts（node 环境）与浏览器 *.test.tsx（jsdom）
```

宿主半对 `@deepseek-ai/*` 一律 **type-only import**，运行时只靠 `inject` 字符串拿服务，产物 `lib/index.js` self-contained（仅 `node:*` 外置）。**唯一例外是 `src/config.ts` 的 Schemastery `Config`**：它必须是**原生 Schemastery** 图（`--dump-config-schema` 只认原生图，换成 zod / 手写对象会把 profile 的 schema dump 拖红），由 esbuild 在构建期**内联**进宿主产物——因此只是构建依赖，运行时不解析任何 `@deepseek-ai/*`（`test/bundle.test.ts` 的模块词断言守护这一点）。它在宿主侧除处置与归档目录管理职责外仍是**客户端模块扫描的锚点**：web 客户端模块扫描只从 **bare 包名行**读取 `dsh.client` 声明，所以 bundle patch 必须继续按包名插入本包，徽章、删除入口与会话管理分节才会被浏览器加载——宿主半因此不能删。

## 构建与测试

双端自包含产物，`build.mjs`（esbuild）一次产出两个文件，external 列表里只有 `node:*` 与浏览器壳提供的运行时模块：

- `lib/client.js` — `src/client/index.ts` 打成单个 CJS bundle 并包进 `window.__ModuleLoader__.load({ id, factory })` 外壳（`react` / `react-dom` / `react/jsx-runtime` / `@deepseek-ai/dsh-client-ui-primitives` 由浏览器壳经 loader `require` 提供），CSS modules 编译为运行时 `<style>` 注入，因此**没有独立样式文件**，也不依赖本包 `dependencies`；bundle 里含徽章、单会话删除入口 / 确认框、会话管理分节与命令通知卡。
- `lib/index.js` — 宿主半的单个 self-contained ESM 产物，承载 `/web-ux` Connection RPC 通道的 7 个端点与恢复后的 `api-session/added` 广播，同时是客户端模块扫描的 bare 包名锚点；Schemastery 已由 esbuild 内联，外置项仍只有 `node:*`。

类型工程是一个 solution（`tsconfig.json` 只汇总 references）+ 两个只 `extends` 根基准 `../../tsconfig.plugin.base.json` 的子工程（`include` 是唯一差异面：不重声明编译选项、不带 `composite`）；两个子工程都是 `noEmit` 纯检查（不产 d.ts，只留 `.tsbuildinfo`，已被 `.gitignore` 忽略）：

- `tsconfig.host.json` — 宿主面（node 环境）：`src/index.ts`、`src/config.ts`、`src/contract.ts`、`src/delete-session.ts`、`src/migrated.ts`、`src/project-key.ts`、`src/session-log-title.ts` 与宿主测试 `test/{bundle,config,contract,delete-session,index,migrated,project-key,session-log-title}.test.ts`。
- `tsconfig.client.json` — 浏览器面（jsdom 环境的用例自带 `// @vitest-environment jsdom`）：`src/client/**`、`src/contract.ts`（两端共享的边界 parser）、`src/project-key.ts`（两端共享的匹配纯函数）、`test/**/*.test.tsx` 与 `test/{client-apply,delete-client,delete-store,display-format,locale-parity,notice-store,notice-visibility,session-manager-model}.test.ts`、`test/stubs/ui-primitives.tsx`（vitest alias 的 primitives 替身）。

两个工程都按宿主 / 浏览器归属逐条列出测试文件：同一份用例只进一个程序（宿主工程要 node 面，浏览器工程要 DOM / JSX），因此不用 `test/**/*.ts` 宽通配把两端混进同一个 program。

```bash
cd /home/xuqinqin/develop/person/dsh-plugins/plugins/web-ux   # 本包是 dsh-plugins workspace 成员
pnpm install
pnpm typecheck     # tsc -p 双调用：host + client 两个工程
pnpm test          # vitest：徽章 + 删除/迁移 + 会话管理流程与界面用例
pnpm lint          # oxlint
pnpm build         # esbuild → lib/index.js（宿主 RPC 载体，Schemastery 内联）、lib/client.js（徽章 + 删除 / 会话管理分节）
pnpm verify:all    # lint + typecheck + build + test

# 只查单侧类型（对应 `typecheck` 的两段调用）
pnpm exec tsc -p tsconfig.host.json --pretty false
pnpm exec tsc -p tsconfig.client.json --pretty false
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

docker exec dsh dsh --profile web --dump-config          # 校验组合可加载（安装冒烟探针）
docker exec dsh dsh --profile web --dump-config | grep -A2 'id: web-ux'
```

`dsh plugin add` 会把包追加进 profile `package.json` 的 `dsh.profile.bundles`，从而激活本包的 `cordis.patch.yml`（插入 `id: web-ux` 的 bare 包名行）。归档根（可选）在 profile patch 里按 id 覆盖本插件行配置，示例见「[归档目录与手工找回](#归档目录与手工找回)」。

### 版本迁移（v1.2.0）

- **升级**：v1.2.0 起本包双端化——新增删除入口与宿主 RPC 通道，provider 徽章行为零变化；`dsh.client.inject` 增补 workspace / connection / locale 依赖，peer 范围统一为 `>=0.2.1-rc.2 <0.3.0`。按 tag 重装即可：`dsh plugin --profile web add "github:exponentxqq/dsh-plugins#v1.2.0&path:plugins/web-ux"`，重启 web profile 生效。
- **回滚**：同一条命令改指 `#v1.1.1` 重装并重启，**只撤掉删除入口、会话管理入口与宿主通道**（徽章照旧）；删除是真实写操作，已被删除的会话日志、投影缓存与工作区引用**不可恢复**，回滚不会让它们回来。

### 版本迁移（含迁移归档）

- **升级**：本能力随下一个发布 tag 生效。`/web-ux` 请求体新增**必填** `mode`（`delete` / `archive`）、预览响应新增 `archiveRoot`，其余契约不变；归档档本身不改 `dsh.client.inject` 与 peer 范围（同一发布 tag 里的「会话管理」会再 +3，见下一节），按 tag 重装并重启 profile 即可。**升级前已打开的旧标签页**跑的是旧客户端（不带 `mode`）：新宿主会在**预览阶段**直接返回 `bad-request`，界面显示失败、不会发生「没选模式就被处置」；刷新页面加载新客户端即恢复。归档根可选，不配就用缺省 `$DSH_HOME/archive/sessions`。
- **回滚**：改指不含本能力的旧 tag（**当前已发布的 `v1.5.0` 及更早版本都没有本能力**）重装并重启。旧宿主不认带 `mode` 的请求，新标签页预览同样得到 `bad-request`，**刷新页面**加载随旧版回落的客户端即恢复「只能永久删除」的旧行为。回滚**不会**把已迁移的日志搬回 `sessions/`，也不会删除归档目录——已迁移数据留在归档目录不受影响（旧版本从不读取它），需要时按[「归档目录与手工找回」](#归档目录与手工找回)手动搬回。

### 版本迁移（会话管理与恢复）

- **升级**：本能力随下一个发布 tag 生效。`dsh.client.inject` 增补 3 项（`dsh-client-ui-sidebar`、`dsh-api-workspace-controller`、`dsh-api-session-controller`，共 12 项），宿主 `/web-ux` 通道扩到 7 个端点（既有两端点一字未动），`archiveRoot` 与 peer 范围不变。按 tag 重装并**重启 web profile**：新增的客户端模块要进 boot 图，只换磁盘产物不重启，入口不会出现。
- **新旧混跑**：新客户端 + 旧宿主 = 新端点一律 `bad-request`（界面显示「请求不合法，宿主拒绝了本次调用」），既有单会话删除 / 迁移照旧——刷新页面只能换客户端，换不掉旧宿主。旧客户端 + 新宿主 = 只调既有两端点，单会话能力完全照旧（旧页面里本来就没有管理面入口）。
- **回滚**：改指不含本能力的旧 tag 重装并重启，入口消失；注意 `v1.5.0` 及更早版本连「移动到归档目录」也还没有，回滚会一并失去该档。回滚**不会**把已恢复的日志再搬回归档根，也不会复活已物理删除的归档条目；归档根数据不受影响（旧版本从不读它）。

两点运维须知：

- **源码改动要重启 profile**：`link:` 安装的插件不在 profile 目录内，dsh-hmr 默认的模块监听根不含它，重建产物不会自动热替换。要免重启，可在 profile patch 里给 hmr 行加模块监听根（`- id: hmr` / `config.root` 指向本包目录）——属开发便利，非必需。
- git 安装形态与 `insteadOf` 陷阱见仓库根 [README](../../README.md#装入-profile)。

### 版本迁移（统一工作区配置入口）

- **升级**：本批变更把会话管理的 GUI 从「侧栏底部入口 + 独立浮层」迁为统一「工作区配置」弹窗的分节：删除 `sidebar.footer.action` 与旧的 `shell.overlay`（order 520）两个 entry、`SessionManagerTrigger` 组件与插件内打开请求 store；新增 `workspace-config.section`（order 30）软注册。`dsh.client.inject` 因此收敛为 11 项（删 `dsh-client-ui-sidebar`），devDependencies 增加 `dsh-plugin-workspace-config`（仅类型，`workspace:*`）。**必须与 holder 四包同装**，否则会话管理没有 GUI 入口；`/web-ux` 七端点、宿主行为与 `archiveRoot` 配置零变化。
- **回滚**：改指上一发布 tag 重装并重启即可（旧入口与旧浮层随旧版客户端回来）；本变更不迁移任何落盘数据、不改配置键，回滚无数据影响。

### 版本迁移（工作区配置改独立页面）

- **升级**：holder 的入口从「侧栏 footer 单入口 + `shell.overlay` 弹窗」换成「侧栏面板行（`sidebar.panellist`）+ `main` 独立页面」，本包的**分节注册面不变**（仍是 `workspace-config.section`、order 30），但 owner 份额从 `{ close }` 换成 `{ workspace }`：节内工作区 Menu、`WORKSPACE_MENU_PORTAL` 与「取消 / 关闭」按钮随之删除，`manager.close` 改为 `manager.finish`（完成），`manager.workspace.label` / `manager.workspace.unassigned` 两条文案出列（`manager.workspace.empty` 保留）；`session-manager-model.ts` 的工作区选项与默认档函数迁至 holder 的 `workspace-choice.ts`。`dsh.client.inject`、peer 范围、`/web-ux` 七端点与 `archiveRoot` 配置零变化。**必须与 holder（及另两个贡献方）同一发布 tag 同装**：旧版 holder 弹窗 ↔ 新版分节的 `close` 缺失组合不受支持（同 tag 安装是唯一受支持组合）。
- **回滚**：改指上一发布 tag 重装并重启，分节随旧版 holder 的弹窗形态回来；本变更不迁移任何落盘数据、不改配置键，回滚无数据影响。

### 版本迁移（会话信息展示）

- **升级**：本批变更给「会话管理」分节补会话信息展示：行视图改两行式（首行 Checkbox + 徽标，次行弱化 meta）、三 tab 各配过滤框与计数徽标、「已迁移」行首行尽力显示日志标题（缺失回退目录名短码）、已迁移 tab 工具栏补归档根显示。`MigratedEntry` 契约新增**可选** `title` / `createdAt`（存在即合法、缺失即不写键），端点集、失败码、配置键与 `dsh.client.inject` 零变化，零新增依赖（标题提取只依赖内建 `node:zlib`；宿主缺该能力时静默降级，列表照常）。按 tag 重装并重启 web profile 即可。
- **回滚**：改指上一发布 tag 重装并重启即可。契约向后兼容：可选字段缺失即不写键，旧 client 按缺省回退渲染（迁移行回退目录名短码，其余 meta 照旧）；本批不迁移任何落盘数据、不改配置键，回滚无数据影响。部署 / 回滚走常规插件 tag 流程。

## 非目标（本版本）

- 徽章不做点击交互（跨插件触发模型菜单无公开 API）。
- 不接管或重排官方 composer 工具行、模型选择器。
- 除「删除已归档会话」与「会话管理」所需的 Connection RPC 通道（7 个端点）外不提供其他宿主能力（项目级 MCP 属 [`dsh-plugin-project-mcp`](../project-mcp/README.md)）；处置能力自身的边界见「[删除已归档会话 → 非目标](#非目标本能力)」，会话管理的边界见「[会话管理 → 边界与已知限制](#边界与已知限制)」。

## 许可

Apache-2.0。
