# code-design.md —「工作区文件夹」分节优化 · 阶段 1.7 代码级蓝图

> 角色：代码设计线（阶段 1.7）。输入：`explore.md`、`decisions.md`（已逐字读完）。
> 本文件只回答「改哪些文件、怎么改、接口与数据长什么样、为什么这么定、怎么验」，不复述探索结论。
> 硬约束：`dsh-plugin-writer`（已通过 skill 工具加载，名称即 `dsh-plugin-writer`）+ 目标包
> `plugins/multi-root-workspace/AGENTS.md` 11 条不变量 + ADR-0006（样式只走 `--dsw-*`）+
> ADR-0008（面板权威宿主派生）+ ADR-0013（分节挂载）。`decisions.md` 的已定结论不重开；
> 发现的一处**事实偏差**见文末「待决问题 P-1」。

## 0. 设计摘要

一句话：**client 半部新增「能力自适应目录拾取」与「单栏浏览对话框」两个模块，把分节 body 按
`source === 'common'` 拆成两组渲染；host 半、wire 契约、命令面、样式 token 纪律全部零改动。**

| 收敛留痕 | 代码落点 | 本文决策 |
| --- | --- | --- |
| D1 能力自适应双模（pick → browse 降级） | 新建 `src/client/directory-picker.ts` + `index.ts` 装配 | D-01 / D-02 / D-09 |
| D1a 单栏列表 + 面包屑对话框 | 新建 `src/client/DirectoryPickerDialog.tsx` | D-03 / D-04 / D-10 |
| D1a-1 起点 Host home | 对话框首帧 `listDirectory()` 零参调用 | D-04 |
| D1a-2 新建文件夹 | 对话框内 `createDirectory(parent, name)` → 导航进入 | D-04 |
| D1d 手动输入保留为兜底 | 动作行：picker 主动作 + 手输次要入口 | D-07 |
| D2 纯客户端拆组 | `WorkspaceFoldersAction.tsx` 两组渲染 | D-05 / D-06 |
| D2a 通用组空态常驻 | 组标题常驻 + 差额说明文案 | D-05 |
| D3① 「+」升级为带文案主动作 | `Action` 替代 `IconButton` | D-07 / D-09 |
| D3② primary 仅补「复制路径」 | primary 行补 copy，不补 reveal | D-08 |

改动规模：新增 2 个源文件（约 420 行）、修改 5 个源文件（约 +180 行 / -40 行）、
新增 2 个测试文件、修改 3 个测试/替身文件、文档 5 处（含 1 篇新 ADR）。host 半 0 行。

---

## ① 触达面清单

> 路径一律相对本仓根 `/home/xuqinqin/develop/person/dsh-plugins`；「仓」列区分**根仓**与
> **子仓 `plugins/multi-root-workspace`**（包名 `dsh-plugin-multi-root-workspace`）。

### 1.1 源码（全在子仓 `plugins/multi-root-workspace`）

| 仓 | 文件 | 类型 | 改动意图 | 关键改动点 |
| --- | --- | --- | --- | --- |
| 子仓 | `plugins/multi-root-workspace/src/client/directory-picker.ts` | **新建**（约 190 行） | 能力判定与降级适配器：把「pick 失败」翻译成结构化的拾取结局，把 browse 原语包成可注入的浏览端口 | `DirectoryListing` 结构镜像；`createDirectoryPicker(read)`；`DirectoryPickOutcome` 五态；能力缓存按服务实例身份失效；wire 错误码 → 本地错误码归一化；message 正则只做兜底，不当契约 |
| 子仓 | `plugins/multi-root-workspace/src/client/DirectoryPickerDialog.tsx` | **新建**（约 230 行） | 应用内单栏目录浏览器（面包屑 + 一级子目录 + 隐藏开关 + 截断提示 + 新建文件夹 + 采纳当前路径） | 自绘模态（遮罩/卡片/Escape/Tab 焦点环/焦点归还）；portal 到 `document.body`；`AbortController` + epoch 防过期覆盖；新建成功后导航进入新目录；`onConfirm` 返回本地化失败句时原地显示、不关闭 |
| 子仓 | `plugins/multi-root-workspace/src/client/WorkspaceFoldersAction.tsx` | 改（+约 120 / -约 40 行） | 分组渲染 + 主动作升级 + primary 复制路径 + 对话框接线 | `roots` 拆 `registered` / `commons` 两数组，行渲染复用一个闭包并只用组内邻居算 move 锚点；动作行移入附属组内部；`Action`（带文案）替代 `IconButton`；`mutate` 返回失败对象而不是布尔；`copyPath(path, key)` 泛化；拾取状态机（closed/open/unavailable） |
| 子仓 | `plugins/multi-root-workspace/src/client/index.ts` | 改（约 +8 / -6 行） | 装配面：用适配器替换裸 `pickDirectory` 包装 | `createDirectoryPicker(() => readService<DirectoryPickerService>(ctx, 'uiWorkspace'))`；注入面字段 `pickDirectory` 替代旧闭包；`dsh.client.inject` **不增项**；`readService` 保持原样 |
| 子仓 | `plugins/multi-root-workspace/src/client/locales.ts` | 改（+21 键 × 2 语言） | 分组文案 + 对话框文案 + 浏览失败文案 | `panel.common` / `panel.commonHint` / `panel.commonEmpty`；`picker.*` 18 键（见 3.7）；`Translate` 类型迁到本模块并保持旧导出路径；`en` 仍由 `satisfies Record<Key, string>` 钉死 |
| 子仓 | `plugins/multi-root-workspace/src/client/styles.ts` | 改（+约 120 行） | 新样式族：picker 模态 + 组标题说明 | 新增 `.mrfw-picker*` 族（约 10 个类）；组说明优先复用既有 `.mrfw-note`；所有颜色 `var(--dsw-*)`、圆角 `var(--dsw-radius-*)`、阴影 `var(--dsw-elevation-prominent)`、遮罩 `var(--dsw-alias-bg-mask-1)` + `var(--dsw-mask-blur)`；不写主题选择器、不写字面色；既有类名与几何一律不动 |
| 子仓 | `plugins/multi-root-workspace/src/compat/client-icons.ts` | 改（+2 行） | 对话框需要「关闭」「面包屑分隔」字形 | 新增 `IconClose = icon('IconCloseOutline16', 'IconCloseOutlineRegular')`、`IconChevronRight = icon('IconChevronRightOutline14', 'IconChevronRightOutlineRegular')`；仍走 `selectIcon` 的按名探测 |

**明确零改动的源码面**（写出来是为了让实施期不接受「顺手也改一下」）：

- `plugins/multi-root-workspace/src/contract.ts`：`RootView.source?: 'common'` 已存在，`RootsView.roots` 仍单数组（invariant 10 的 append-after 顺序恰好保证两组有序）、`PanelEndpoint` 不增项。
- `plugins/multi-root-workspace/src/command.ts`：`add` 及全部验证词汇（`not-absolute` / `missing` / `not-a-directory` / `equals-primary` / `primary-overlap` / `duplicate` / `nested` / `common-root`）、`reveal` 的 `requireEntry` 都不动；选择器只是换一种方式产出候选 path。
- `plugins/multi-root-workspace/cordis.patch.yml`、`package.json`、`tsdown.config.ts`：不新增行、不新增依赖、不改 client 入口（新模块经 `index.ts` 被内联进 `lib/client.js`）。
- 上游 `@deepseek-ai/*` 任何包：只读消费 `uiWorkspace.pickDirectory/listDirectory/createDirectory`。
- 根仓 `plugins/workspace-config`（holder）：零改动；分节契约（`workspace-config.section`、owner share 三态）不变。
- 根仓 `openspec/`：本仓当前没有 multi-root 业务规格，holder 规格只约束分节座位契约；本次**无 spec 增量**，且本设计不写 openspec 文件。

### 1.2 测试（子仓 `plugins/multi-root-workspace`）

| 仓 | 文件 | 类型 | 改动意图 | 关键改动点 |
| --- | --- | --- | --- | --- |
| 子仓 | `plugins/multi-root-workspace/test/client-directory-picker.spec.ts` | **新建**（约 150 行） | 适配器单测：能力三态 + 缓存 + 错误归一化 | 用可变 supplier 注入假服务；断言 `pick` 调用次数（缓存生效）、message/结构化/探测三条分支、`DirectoryBrowseError.code` 映射、abort 透传 |
| 子仓 | `plugins/multi-root-workspace/test/client-directory-dialog.spec.tsx` | **新建**（约 230 行，jsdom） | 对话框行为契约 | 首帧 `list(undefined)`、面包屑跳转、隐藏开关、截断提示、新建（含 `exists`）、`Esc`/取消不触发 `onConfirm`、`onConfirm` 返回失败句时保持打开、打开重置到 Home、过期响应不覆盖 |
| 子仓 | `plugins/multi-root-workspace/test/client-panel.spec.tsx` | 改（+约 150 行，改 harness） | 分节契约：分组四态、动作行、primary 复制、三种拾取结局 | harness 的 `uiWorkspace` 替身从「只有 `pickDirectory`」扩成可切三态（native 成功 / browse 抛错 + list 可用 / 都不可用）；新增分组用例；现有 picker 用例保持原生路径语义 |
| 子仓 | `plugins/multi-root-workspace/test/stubs/ui-primitives.tsx` | 改（+2 行） | 替身补两个图标导出 | `IconCloseOutline16`、`IconChevronRightOutline14`；与 `src/compat/client-icons.ts` 的候选名一致（替身只提供首选名即可） |
| 子仓 | `plugins/multi-root-workspace/test/client-bundle.spec.ts` | 改（2 处断言 + 注释） | 产物契约：新增 `react-dom` 模块词 | `required` 期望数组改为 `['@deepseek-ai/dsh-client-ui-primitives', 'react', 'react-dom', 'react/jsx-runtime']`（两处，line 52 / line 70）；注释说明 portal 需要 shell 的 `react-dom` 词 |
| 子仓 | `plugins/multi-root-workspace/test/locale-parity.spec.ts` | **不改** | 词典键集合仍两语一致；`root.sourceCommon*` 仍保留 | 只有在移除通用徽章时才需改；本设计保留徽章（D-05） |

### 1.3 文档（子仓 `plugins/multi-root-workspace`）

| 仓 | 文件 | 类型 | 改动意图 | 关键改动点 |
| --- | --- | --- | --- | --- |
| 子仓 | `plugins/multi-root-workspace/README.md` | 改 3 段 | 用户可见能力描述 | 「面板」段（line 161）：选择器双模、分组、主动作、primary 复制、手输为兜底；项目结构 `client/`（line 186）补一句「能力自适应拾取 + 应用内浏览对话框」；已知限制（line 215 一带）补「native 部署走 OS 选择框、本仓 CI 只覆盖 browse 降级分支」 |
| 子仓 | `plugins/multi-root-workspace/docs/architecture/multi-root-workspace.md` | 改 §7 client 段（line 228） | 架构事实 | 「底部添加目录为仅图标按钮」改为主动作 + 双模拾取 + 两组呈现；补对话框归属（本插件自绘，不是 holder 的壳）与 portal 事实 |
| 子仓 | `plugins/multi-root-workspace/scripts/check-docs.mjs` | 不改（门禁） | 实施时必须遵守的文档硬格式（门禁行，非改动文件） | `:15-38` 的 `absolute-paths: true` / `adr-names: true` / `exemptions.absolutePaths: []` 决定 ADR-0015 与 README 的写法（见 TG6） |
| 子仓 | `plugins/multi-root-workspace/docs/decisions/ADR-0015-in-app-directory-picker.md` | **新建** | 记录三个真实决策：能力信号取得方式、自绘模态与 ADR-0006 边界、分组为纯客户端 | Context 必须写清「ui-workspace 的 `pickDirectory` 丢弃 code/details」这条实测事实（P-1 的留痕），Decision 写 D-01/D-03/D-05，Alternatives 抄本文 ④ 的被否方案与反例 |
| 子仓 | `plugins/multi-root-workspace/docs/decisions/README.md` | 改 1 行 | ADR 索引 | 在「当前状态」表末追加 ADR-0015 一行（`docs:check` 的 `markdown-links` 要求链接可解析） |
| 子仓 | `plugins/multi-root-workspace/docs/reference/common-additional-roots.md` | 改 1 句 | 通用根的呈现事实 | 「面板/命令都无法移除（见下）」段后补：面板把通用根单独成组、组标题说明取自配置，并链到 ADR-0015（单一真源，不复述正文） |

**不改** `AGENTS.md`：11 条不变量无一条涉及面板拾取/呈现（invariant 5 的载体行、10 的 append-after
都不变），改它只会制造与 invariant 正文不一致的冗余。`docs/README.md` 文档地图也不需要新条目
（ADR 走 `docs/decisions/README.md` 索引）。

### 1.4 根仓

| 仓 | 文件 | 类型 | 说明 |
| --- | --- | --- | --- |
| 根仓 | 无 | — | 本变更不触碰根仓脚本、门禁、workspace 配置；`openspec/` 不做增量（1.1 已说明）。 |

---

## ② 证据锚

> 每条都是**代码事实**，不是探索散文。上游路径为安装树绝对路径
> `/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/`（下称 `$UP`），
> 版本 `0.2.2-rc.1`（= `scripts/dsh-baseline.mjs` 基线）。

### 2.1 目标子仓

> 表中 `...<文件名>:行号` 承接该行首列给出的完整路径（同一文件不重复写全路径）。

| 模块 | 证据 | 在设计里的作用 |
| --- | --- | --- |
| 分节 props 与拾取入口 | `plugins/multi-root-workspace/src/client/WorkspaceFoldersAction.tsx:91`（`pickDirectory: (() => Promise<string \| null>) \| undefined`） | 端口类型要换成结构化结局；「有无端口」不再表达「有无能力」 |
| 拾取失败当前处置 | `...WorkspaceFoldersAction.tsx:362-373`（`addViaPicker` 只把异常交给 `asPanelError`，取不到 code） | 这就是 browse 部署下报「操作失败。」的原因；TG1 要在这里换结局分派 |
| 行身份与 entry | `...WorkspaceFoldersAction.tsx:229-231`（`entryOf` 只从 `RootView` 造 entry） | primary 无 entry → reveal 不能补（D-08） |
| 单列表渲染 | `...WorkspaceFoldersAction.tsx:432`（`const roots = ...`）、`:476-570`（单循环 + `source === 'common'` 分支） | 分组的唯一改动点 |
| 通用行操作 | `...WorkspaceFoldersAction.tsx:485-487`（move 锚点按混排邻居算）、`:493-497`（徽章）、`:526-552`（菜单全禁用） | 分组后 move 锚点必须改按组内数组算；徽章与禁用操作集保留（D-05） |
| 动作行 | `...WorkspaceFoldersAction.tsx:575-600`；`:576-584` 是 icon-only 的「+」 | 主动作升级 + 动作行归入附属组（D-06/D-07） |
| primary 行 | `...WorkspaceFoldersAction.tsx:451-464`（只有文本，无动作） | 补复制路径（D-08） |
| 复制实现 | `...WorkspaceFoldersAction.tsx:408-424`（`copyPath(root: RootView)` + `copiedId`） | 泛化为 `(path, key)`，primary 才能复用 |
| 变更提交 | `...WorkspaceFoldersAction.tsx:335-354`（`mutate` 返回 boolean） | 对话框需要失败原因 → 返回 `PanelError \| undefined` |
| 错误码→文案 | `...src/client/panel-client.ts:63-66`（`errorKeyOf` 未知码落 `error.fallback`） | 对话框的 `add` 失败句复用同一词表 |
| 装配 | `...src/client/index.ts:128-132`（裸包装：无服务返回 null，异常原样抛） | 改成适配器；`:144-161` 分节注册、`:154` 注入面；`:165-167` launcher |
| 延迟读服务 | `...src/client/index.ts:182-185`（`readService` untyped read） | 适配器通过 thunk 复用它，保持「服务晚到也能用」 |
| 线协议契约 | `...src/contract.ts:63-85`（`RootView.source?: 'common'`）、`:96-109`（`RootsView`） | wire 零改动（分组纯客户端） |
| 文案 | `...src/client/locales.ts:29-31`（`panel.additional/empty/emptyHint`）、`:56-57`（`root.sourceCommon*`）、`:47-48`（`copyPath/copied`） | 新增键的落点与「保留徽章」的键依赖 |
| 样式 | `...src/client/styles.ts:48-75`（section/titleRow）、`:77-84`（row）、`:131-142`（badge）、`:198-205`（iconBtn）、`:242-256`（actions） | 分组只复用现有几何；新族必须同 token 纪律 |
| 样式边界 | `...docs/decisions/ADR-0006-client-ui-host-tokens.md` 决策 6 末段（「仅限无状态的展示型组件……Button/Modal 等结构组件仍按本 ADR 决策 3 自绘」） | 对话框**自绘**的硬依据（D-03） |
| 面板权威 | `...docs/decisions/ADR-0008-panel-session-derived-authority.md`（`resolvePanelPrimaryRoot`；客户端无 `primaryRoot`） | 对话框只产出候选 path，授权仍走 `add` 的 session 寻址 |
| 挂载座位 | `...docs/decisions/ADR-0013-workspace-config-section-mount.md` 决策 4（弹窗壳归 holder，本插件只渲染正文） | 新对话框是**拾取浮层**而非分节壳，必须与 holder 的页面壳区分（D-03） |
| 构建外置面 | `...tsdown.config.ts:46-55`（`CLIENT_EXTERNALS` 含 `react-dom`）、`:98-101`（`neverBundle`/`alwaysBundle`） | 允许 `createPortal`；但会新增一个 `require("react-dom")`，必须同批改产物断言（D-10） |
| 访问服务 | `...src/client/index.ts:46`（`import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'`） | 说明该包已是类型可见的 devDependency；但**不**用它导出 `DirectoryListing`（见 D-11） |

### 2.2 上游（只读依赖，全部零改动）

| 事实 | 证据 | 设计含义 |
| --- | --- | --- |
| `pickDirectory()` 失败时**只抛出 `message`**，code/details 被丢弃 | `$UP/dsh-client-ui-workspace/lib/client.js:1562-1566`：`if (!result.ok) throw new Error(\`directory picker failed: ${result.error.message}\`)` | 决策留痕里「details.capability 是唯一信号」在代码层**取不到**；这是 P-1 的直接证据 |
| browse 原语失败时抛 `DirectoryBrowseError` 且**保留 `rpcError`** | `$UP/dsh-client-ui-workspace/lib/client.js:1351-1357`（类定义）、`:1567-1575`（`listDirectory` / `createDirectory` 的 `throw new DirectoryBrowseError(result.error)`） | 探测分支可以读 `rpcError.code` / `rpcError.details.capability` |
| 服务签名 | `$UP/dsh-client-ui-workspace/lib/types/client/navigation.d.ts:91-105`（`pickDirectory()` / `listDirectory(path?, signal?)` / `createDirectory(path, name)`） | 端口类型逐字对齐 |
| 能力互斥与错误文案模板 | `$UP/dsh-api-workspace-controller/lib/index.js:525-528`：`directoryPicker.${method} needs the ${kind} capability; the composed picker serves "${capability.kind}"`，`code = 'directory-picker/unavailable'`，`details = { capability }` | message 兜底正则锚定 `serves "browse"`；details 从 `rpcError` 读 |
| wire 错误码表 | `$UP/dsh-api-workspace-controller/lib/index.js:537-541`（`directory-unreadable → directory-picker/unreadable`、`directory-exists → directory-picker/exists`、`directory-create-failed → directory-picker/create-failed`）、`:548-551`（非业务错误 → `gateway/internal`） | 本地错误码映射表的真源 |
| details 类型 | `$UP/dsh-api-workspace-controller/lib/types/types.d.ts:50-62` | 结构读取的字段名 |
| 目录层级形状 | `$UP/dsh-host-directory-picker/lib/types/types.d.ts:12-45`（`name` / `path` / `hidden` / `home` / `crumbs` / `entries` / `truncated`） | `DirectoryListing` 结构镜像逐字对齐（不新增依赖） |
| 能力判别联合与官方默认 | `$UP/dsh-host-directory-picker/lib/types/index.d.ts:17-55`（`native` 只有 `pick`；`browse` 只有 `list`/`createDirectory`）、`:68-78`（`DirectoryPickerErrorCode` 与 `DirectoryPickerError`） | 「未知 kind 隐藏拾取入口」的官方约定出处（D-09） |
| 浏览表面可被复用 | `$UP/dsh-client-ui-directory-picker-browse/lib/client.js:1116-1117`（该包也直接委托 `ctx.uiWorkspace.listDirectory/createDirectory`） | 证明我们自建对话框用的是同一条公共原语，不 fork 上游 |
| 宿主 Modal 的视觉配方 | `$UP/dsh-client-ui-primitives/lib/Modal.module.css`（遮罩 `--dsw-alias-bg-mask-1` + `--dsw-mask-blur`；卡片 `--dsw-alias-bg-layer-2` / `--dsw-radius-panel` / `--dsw-elevation-prominent`）；token 定义见 `$UP/dsh-client-ui-theme/lib/client.js:1464,1470,1482` | 自绘时逐值复刻；token 均真实存在 |
| 宿主结构原语（被否方案的证据） | `$UP/dsh-client-ui-primitives/lib/types/Modal.d.ts`（`open/onClose/title/...`；`useModalLayer` 处理 Escape 与焦点归还） | 用它可以少写 a11y，但踩 ADR-0006 边界且测试替身无法复现（D-03 反例） |

### 2.3 新建文件与其余触达面的锚

| 模块 | 证据 | 在设计里的作用 |
| --- | --- | --- |
| `plugins/multi-root-workspace/src/client/directory-picker.ts` | **新建**；读型依据 = `$UP/dsh-client-ui-workspace/lib/client.js:1562-1566`（pick 丢 code/details）、`:1567-1575`（browse 抛 `rpcError`）、`$UP/dsh-api-workspace-controller/lib/index.js:537-541`（wire 码表） | 三级信号分类与错误归一化的直接依据 |
| `plugins/multi-root-workspace/src/client/DirectoryPickerDialog.tsx` | **新建**；数据形状依据 = `$UP/dsh-host-directory-picker/lib/types/types.d.ts:12-45`；视觉配方 = `$UP/dsh-client-ui-primitives/lib/Modal.module.css`；边界依据 = `docs/decisions/ADR-0006-client-ui-host-tokens.md` 决策 6 | 对话框的 props / 状态机 / 样式来源 |
| `plugins/multi-root-workspace/test/client-directory-picker.spec.ts`、`test/client-directory-dialog.spec.tsx` | **新建**；写法范式 = `plugins/multi-root-workspace/test/client-panel.spec.tsx:520-592`（picker 交互用例）、`:672-713`（common 行用例） | 测试粒度与替身用法 |
| `plugins/multi-root-workspace/src/compat/client-icons.ts` | `:56-68`（`icon(pixelName, regularName)` 按名探测，`selectIcon` 失败即抛） | 新增两个字形必须沿用同一对名，否则启动即抛 |
| `plugins/multi-root-workspace/test/stubs/ui-primitives.tsx` | `:34-42`（替身只导出 9 个图标） | 新图标不同步进替身，jsdom 渲染会 `undefined is not a function` |
| `plugins/multi-root-workspace/test/client-bundle.spec.ts` | `:49-52`、`:69-70`（`require` 词逐字断言两处） | `react-dom` 词必须同批更新，否则产物门禁红 |
| `plugins/multi-root-workspace/test/locale-parity.spec.ts` | `:76-82`（`root.sourceCommon` / `root.sourceCommonTitle` 存在性断言） | 保留徽章 → 该用例零改动 |
| `plugins/multi-root-workspace/README.md` | `:161`（面板段）、`:186`（`client/` 结构行）、`:215` 一带（已知限制） | 文档更新的确切落点 |
| `plugins/multi-root-workspace/docs/architecture/multi-root-workspace.md` | `:228`（client 段落，含「底部『添加目录』为仅图标按钮」这句与实现直接冲突） | 必须同批改写的既有句子 |
| `plugins/multi-root-workspace/docs/decisions/README.md` | `:31`（ADR-0014 行，当前索引末项） | 新 ADR 的索引位置与编号事实（0014 已占用） |
| `plugins/multi-root-workspace/docs/reference/common-additional-roots.md` | `:50`（「面板对通用行只提供复制/显示/浏览，改名、移除、上下移动均置灰」）、`:53`（「列表标记：…面板都以 `[common]` / "通用" 标记来源」） | 保留徽章与禁用操作集后这两句仍成立，只需补一句分组说明 |
| `plugins/multi-root-workspace/scripts/check-docs.mjs` | `:15-38`（`absolute-paths: true`、`adr-names: true`、`exemptions.absolutePaths: []`） | 新 ADR / README 的硬格式：不得出现绝对路径、ADR 文件名 `ADR-NNNN-短名.md` |
| `plugins/multi-root-workspace/docs/decisions/ADR-0015-in-app-directory-picker.md` | **新建**；体例依据 = `docs/decisions/README.md:16-31` 的索引格式与 `ADR-0014` 的单语化决策行文 | 决策留痕载体（D-01/D-03/D-05 + P-1 事实） |

---

## ③ 接口与数据形状

### 3.1 新模块 `src/client/directory-picker.ts`

```ts
/* ---------- 上游原语的结构镜像（刻意不 import 上游类型包） ---------- */

/** 上游 DirectoryEntry 的结构镜像（$UP/dsh-host-directory-picker/lib/types/types.d.ts:12-28）。 */
export interface DirectoryEntry {
  readonly name: string
  /** 绝对宿主路径；客户端永不自行拼接路径段。 */
  readonly path: string
  /** 宿主平台约定的隐藏项（POSIX 点开头）；是否展示由客户端决定。 */
  readonly hidden: boolean
}

/** 上游 DirectoryListing 的结构镜像。 */
export interface DirectoryListing {
  readonly path: string
  /** 宿主账户 home，面包屑「主目录」的锚点。 */
  readonly home: string
  /** 文件系统根 → 当前层的祖先链（含当前层，每段都可跳转）。 */
  readonly crumbs: readonly DirectoryEntry[]
  /** 直接子目录（按名排序，含指向目录的符号链接）。 */
  readonly entries: readonly DirectoryEntry[]
  /** 后端在完整结果上界处截断 entries 时为 true。 */
  readonly truncated: boolean
}

/** `ctx.uiWorkspace` 中本插件用到的方法；三项都可缺席（组合由表面决定）。 */
export interface DirectoryPickerService {
  readonly pickDirectory?: () => Promise<string | null>
  readonly listDirectory?: (path?: string, signal?: AbortSignal) => Promise<DirectoryListing>
  readonly createDirectory?: (path: string, name: string) => Promise<string>
}

/** 浏览端口：只暴露对话框需要的两个原语，且失败已归一化。 */
export interface DirectoryBrowser {
  /** 列一层；`path` 缺席 = 宿主 home；`signal` 中止底层扫描。 */
  readonly list: (path?: string, signal?: AbortSignal) => Promise<DirectoryListing>
  /** 在已存在的父目录下新建一个子目录，返回创建出的绝对路径。 */
  readonly create: (path: string, name: string) => Promise<string>
}

/** 一次「选择目录」的结局。 */
export type DirectoryPickOutcome =
  | { readonly kind: 'picked'; readonly path: string }            // native 成功且非空
  | { readonly kind: 'cancelled' }                                // 操作员取消（null/空串）
  | { readonly kind: 'browse'; readonly browsing: DirectoryBrowser; readonly listing?: DirectoryListing }
  | { readonly kind: 'unavailable' }                              // 无法判定能力：隐藏拾取入口 + 提示手输
  | { readonly kind: 'failed'; readonly error: unknown }          // 有拾取能力但本次失败：照常报错

export type PickDirectory = () => Promise<DirectoryPickOutcome>

/** 浏览失败：`code` 是本地稳定码（不是 wire 码），`message` 保留上游原文供诊断。 */
export class DirectoryBrowseError extends Error {
  readonly name = 'DirectoryBrowseError'
  constructor(readonly code: DirectoryBrowseCode, message: string) {
    super(message)
  }
}

export type DirectoryBrowseCode =
  | 'picker-unreadable'
  | 'picker-exists'
  | 'picker-create-failed'
  | 'picker-failed'

/**
 * 构造拾取端口。
 * @param read 每次调用现取 `ctx.uiWorkspace`（服务可能晚于 apply 就绪，也可能被替换）。
 */
export function createDirectoryPicker(read: () => DirectoryPickerService | undefined): PickDirectory
```

**行为契约（逐条可测）**

1. `read()` 返回 `undefined` → `{ kind: 'unavailable' }`，**不缓存**（服务之后到达仍可用）。
2. 已知能力 `browse` 且服务实例未换 → 直接返回 `{ kind: 'browse', browsing }`，**不再调用 `pickDirectory`**。
3. 服务有 `pickDirectory`：先调用。返回非空串 → `picked` 并缓存 `native`；返回 `null`/空串 → `cancelled`。
4. 调用抛错 → 按三级信号分类（见 3.2），命中 browse → 返回 `browse`（可带探测得到的 `listing`）。
5. 服务**没有** `pickDirectory` 但有 `list+create` → 直接 `browse`（结构探测，不发失败 RPC）。
6. 能力缓存以「服务实例身份」为键：`read()` 返回另一对象即失效（HMR / 组合替换安全）。
7. `browsing.list/create` 的失败一律转成 `DirectoryBrowseError`；`signal.aborted` 时保留 `gateway/cancelled → picker-failed` 但对话框据 `signal.aborted` 忽略渲染。

### 3.2 能力判定：三级信号（顺序固定）

```
pick 抛错 e
├─ ① 结构化：failureOf(e)  // e 本身或 e.rpcError 带 isDSHRemoteError/code/details
│    details.capability === 'browse'  → browse
│    details.capability === 'native'  → failed(e)          // pick 真的失败，报原错
├─ ② message 兜底：/\bserves\s+["']?browse["']?/i  或  /["']capability["']\s*:\s*["']browse["']/i
│    → browse（不探测：省一次 RPC；对话框首帧自己 list）
└─ ③ 结构探测：browsing.list()  // 零参 = home，同时充当对话框首帧
     成功            → browse（带 listing）
     抛错且 details.capability === 'native' → failed(e)
     其他            → unavailable
```

任意一支在返回 `browse` 之前都必须满足 `browserOf(service) !== undefined`，否则一律 `unavailable`
（防御「只暴露 pick 的旧组合」：能 pick 的部署不该被误判成能浏览）。

`failureOf(value)` 的结构判据（写进实现，不依赖 `instanceof`）：

```ts
type RemoteFailureView = {
  readonly code?: unknown
  readonly message?: unknown
  readonly details?: { readonly capability?: unknown } | undefined
  readonly isDSHRemoteError?: unknown
}
function failureOf(value: unknown): RemoteFailureView | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const direct = value as RemoteFailureView
  if (typeof direct.code === 'string') return direct
  const carrier = (value as { rpcError?: unknown }).rpcError
  return carrier !== null && typeof carrier === 'object' && typeof (carrier as RemoteFailureView).code === 'string'
    ? carrier as RemoteFailureView
    : undefined
}
```

### 3.3 新组件 `src/client/DirectoryPickerDialog.tsx`

```ts
export interface DirectoryPickerDialogProps {
  /** 是否显示（父组件只在需要时挂载，但仍保留该开关便于动画/清理语义）。 */
  readonly open: boolean
  readonly t: Translate
  /** 浏览端口；理论上打开时必有，防御性允许缺席（退化为失败提示）。 */
  readonly browser: DirectoryBrowser | undefined
  /** 能力探测已取得的 home 层，复用为对话框首帧，避免重复请求。 */
  readonly initialListing?: DirectoryListing
  /**
   * 采纳一个绝对路径。
   * @returns undefined = 已成功（对话框自行关闭）；字符串 = 已本地化的失败句（原地显示并保持打开）。
   */
  readonly onConfirm: (path: string) => Promise<string | undefined>
  /** 取消（取消按钮 / Esc / 遮罩点击）。 */
  readonly onClose: () => void
}

type ScanState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly listing: DirectoryListing }
  | { readonly kind: 'failed'; readonly code: DirectoryBrowseCode; readonly message: string }

interface CreateState {
  readonly open: boolean
  readonly name: string
  readonly busy: boolean
  readonly error: string | undefined
}
```

内部 state：`scan`、`showHidden`、`create`、`commitError`、`confirming`；
refs：`dialogRef`、`openerRef`（打开时的 `document.activeElement`）、`scanAbort`、`scanEpoch`。

**行为契约**

1. `open` 由 false → true：重置 `showHidden=false`、`create` 关闭、`commitError=undefined`、
   `confirming=false`；有 `initialListing` 直接 `ready`，否则 `list()`（零参 = Host home）；
   记录 opener 并把焦点移到对话框根（`tabIndex={-1}`）。
2. 导航（点行 / 点面包屑）：`scanEpoch++`、abort 上一次、`list(path)`；过期响应与 abort 响应都丢弃。
3. 隐藏项：默认过滤 `entry.hidden`；开关 `aria-pressed`，只改渲染。
4. 截断：`listing.truncated` 时显示 `picker.truncated`。
5. 新建：对**当前层** `listing.path` 调 `create(parent, name)`；成功 → 关闭新建行并导航进入创建出的目录；失败 → `create.error` 显示对应文案，保持新建行。
6. 采纳：`confirming=true`，`await onConfirm(listing.path)`；返回字符串 → `commitError` 渲染在卡片内、按钮恢复；返回 `undefined` → `onClose()`。
7. 关闭：Esc、取消按钮、遮罩点击；关闭时 `openerRef.current?.focus()` 归还焦点（卸载前执行）。
8. 焦点环：`Tab` / `Shift+Tab` 在卡片内可聚焦元素间环绕；`role="dialog" aria-modal="true" aria-labelledby`。
9. 父组件卸载即 abort 当前扫描。

**对话框不负责**：`add` 请求、错误码→文案（除浏览错误）、能力判定、记住上次目录（Q3 裁定起点恒为 Host home）。

### 3.4 分节注入面与组件 props 变化

```ts
// 之前
export interface WorkspaceFoldersSectionProps {
  readonly panel: PanelClient | undefined
  readonly pickDirectory: (() => Promise<string | null>) | undefined
  readonly sessionId?: () => string | undefined
}
// 之后（其余字段不变）
export interface WorkspaceFoldersSectionProps {
  readonly panel: PanelClient | undefined
  /** 拾取端口：永远存在（无服务时调用返回 unavailable）。 */
  readonly pickDirectory: PickDirectory
  readonly sessionId?: () => string | undefined
}
```

`index.ts` 装配：

```ts
const pickDirectory = createDirectoryPicker(
  () => readService<DirectoryPickerService>(ctx, 'uiWorkspace'),
)
// 分节注入面 / launcher props 均传 pickDirectory（替代旧闭包）
```

适配器在 `apply` 期创建一次：能力缓存跨分节重挂载（页面切 tab / 换工作区）继续有效，
而 `read()` 仍在每次调用时现取服务，服务被替换时按实例身份失效。

`WorkspaceFoldersSectionInjected = Omit<WorkspaceFoldersSectionProps, 'workspace' | 't'>` 不变式保持；
`Translate` 类型迁移到 `locales.ts`（`export type Translate = (key: Key, params?: Record<string, unknown>) => string`），
`WorkspaceFoldersAction.tsx` 保留 `export type { Translate } from './locales.ts'`（type-only，零运行时环），
`RootFileTree.tsx` / `index.ts` 的既有 import 路径因此不变。

### 3.5 既有函数签名变化（`WorkspaceFoldersAction.tsx` 内部）

```ts
// 提交一次根变更：成功 undefined；失败返回可渲染的错误（不再返回 boolean）
const mutate = useCallback(async (
  endpoint: 'add' | 'remove' | 'alias' | 'move',
  payload: Record<string, unknown>,
): Promise<PanelError | undefined> => { /* ... */ }

// 复制路径：primary 与行共用（key 用于「已复制」高亮身份）
const copyPath = useCallback(async (path: string, key: string): Promise<void> => { /* ... */ }, [])

// 分组：只按 source 拆分，wire 顺序不变
const roots = state.view?.roots ?? []
const registered = roots.filter(root => root.source !== 'common')
const commons = roots.filter(root => root.source === 'common')

// 行渲染：一个闭包吃一个数组，move 锚点只取组内邻居
const renderRows = (rows: readonly RootView[]): ReactNode[] => rows.map((root, index) => { /* ... */ })

// 拾取状态机
type PickerState =
  | { readonly kind: 'closed' }
  | { readonly kind: 'open'; readonly browsing: DirectoryBrowser; readonly listing?: DirectoryListing }
  | { readonly kind: 'unavailable' }
const [picker, setPicker] = useState<PickerState>({ kind: 'closed' })
const [picking, setPicking] = useState(false)
```

`PanelError` 渲染句抽成一个本地函数，分节 alert 与对话框 `onConfirm` 共用：

```ts
function sentenceOf(error: PanelError, t: Translate): string {
  const base = t(errorKeyOf(error.code))
  return error.code === 'unavailable' || error.code === 'panel/internal'
    ? `${base} (${error.message})`
    : base
}
```

### 3.6 配置键与 wire 契约

| 面 | 变化 | 说明 |
| --- | --- | --- |
| `cordis.patch.yml` / `commonRoots` | **零新增** | 通用组说明只指向既有 `multi-root-registry.config.commonRoots`；不引入新配置键、不读新环境变量 |
| 面板 wire（`/multi-root-workspace`） | **零改动** | 端点仍 8 个；`RootsView.roots` 单数组；`RootView.source?: 'common'` 已有（`src/contract.ts:84`） |
| `dsh.client.inject` | **零改动** | 仍 `['@deepseek-ai/dsh-client-connection','@deepseek-ai/dsh-client-locale','@deepseek-ai/dsh-client-ui-renderer']`；`uiWorkspace` 继续是 untyped 可选读 |
| 产物模块词 | **+1**：`react-dom` | 仅由 `createPortal` 引入；`tsdown.config.ts:49` 已外置，shell 已 seed（`dsh-client-ui-renderer/lib/client.js:11` 同样 require） |
| 对外导出 | **零改动** | `exports` 不变；新模块被内联，不新增子路径 |

### 3.7 文案键（`locales.ts`，zh 为准、en 同键）

| 键 | zh | en | 用途 |
| --- | --- | --- | --- |
| `panel.common` | 通用工作目录 | Common working directories | 第二组标题（常驻） |
| `panel.commonHint` | 由插件配置的 commonRoots 授予，对所有工作空间生效；修改请编辑插件配置（cordis.patch.yml）。 | Granted by the plugin's commonRoots configuration and applied to every workspace; edit that configuration (cordis.patch.yml) to change it. | 有通用根时的组说明 |
| `panel.commonEmpty` | 没有配置通用工作目录；在插件配置（cordis.patch.yml）的 commonRoots 中添加即可对所有工作空间生效。 | No common working directories are configured; add them under commonRoots in the plugin configuration (cordis.patch.yml) to apply them to every workspace. | 通用组空态（与标题一起常驻） |
| `picker.title` | 选择工作目录 | Choose a working directory | 对话框标题 / aria-labelledby |
| `picker.close` | 关闭 | Close | 关闭按钮 |
| `picker.crumbs` | 目录层级 | Directory path | 面包屑 nav 的 aria-label |
| `picker.home` | 主目录 | Home | 面包屑首项（`listing.home`） |
| `picker.current` | 当前路径 | Current path | 底部路径行的 aria-label |
| `picker.showHidden` | 显示隐藏目录 | Show hidden folders | `aria-pressed` 开关 |
| `picker.empty` | 这里没有子目录 | No subfolders here | 空层提示 |
| `picker.truncated` | 条目过多，列表已截断 | Too many entries; the list is truncated | `truncated` 提示 |
| `picker.create` | 新建文件夹 | New folder | 新建入口 |
| `picker.createName` | 文件夹名称 | Folder name | 新建输入框 placeholder |
| `picker.createConfirm` | 创建 | Create | 新建确认 |
| `picker.cancel` | 取消 | Cancel | 新建取消 + 对话框取消共用 |
| `picker.confirm` | 选择此目录 | Use this folder | 采纳当前层 |
| `picker.unavailable` | 当前部署没有可用的目录选择器；请直接在下方输入绝对路径。 | This deployment offers no directory picker; enter an absolute path below. | 能力不可用提示（+ 按钮隐藏后的常驻说明） |
| `picker.error.unreadable` | 无法读取该目录；它可能已不存在或没有访问权限。 | That directory could not be read; it may no longer exist or not be accessible. | `picker-unreadable` |
| `picker.error.exists` | 该目录下已有同名文件夹。 | A folder with that name already exists. | `picker-exists` |
| `picker.error.create-failed` | 新建文件夹失败。 | Could not create the folder. | `picker-create-failed` |
| `picker.error.failed` | 目录浏览失败。 | Browsing failed. | `picker-failed` / 未知码 |

保留既有键不动（含 `root.sourceCommon` / `root.sourceCommonTitle`、`panel.additional`、`panel.empty`、`panel.emptyHint`）；
英文随 `satisfies Record<Key, string>` 强制补齐，`test/locale-parity.spec.ts` 零改动即通过。

### 3.8 样式类名（`styles.ts`）

| 类 | 关键声明（全部 token） | 用途 |
| --- | --- | --- |
| `.mrfw-pickerOverlay` | `position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 24px` | portal 根（与宿主 Modal 的层级/内边距同值） |
| `.mrfw-pickerMask` | `position: absolute; inset: 0; background: var(--dsw-alias-bg-mask-1); backdrop-filter: var(--dsw-mask-blur)` | 遮罩（点击关闭） |
| `.mrfw-pickerCard` | `position: relative; display: flex; flex-direction: column; width: min(560px, 100%); max-height: min(560px, 100%); border-radius: var(--dsw-radius-panel); background: var(--dsw-alias-bg-layer-2); box-shadow: var(--dsw-elevation-prominent); overflow: hidden` | 卡片 |
| `.mrfw-pickerHeader` / `.mrfw-pickerTitle` | flex 行；`font-size: 16px; line-height: 24px; font-weight: 500; color: var(--dsw-alias-label-primary)` | 标题 + 关闭 |
| `.mrfw-pickerCrumbs` / `.mrfw-pickerCrumb` / `.mrfw-pickerCrumbSeparator` | `display: flex; flex-wrap: wrap; gap: 4px`；面包屑按钮复用 `.mrfw-btn` 幽灵配方 + 当前段 `aria-current` 用 `label-secondary` | 面包屑 |
| `.mrfw-pickerList` | `flex: 1 1 auto; min-height: 160px; max-height: 320px; overflow-y: auto; padding: 4px 0` | 列表 |
| `.mrfw-pickerRow` | `display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 16px; border: none; background: transparent; text-align: left; cursor: pointer`；hover `var(--dsw-alias-interactive-bg-hover)` | 子目录行 |
| `.mrfw-pickerFooter` | `display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-top: 0.5px solid var(--dsw-alias-border-l2)` | 底部 |
| `.mrfw-pickerPath` | `flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--ds-font-family-code); font-size: 12px; color: var(--dsw-alias-label-tertiary)` | 当前路径 |
| `.mrfw-pickerCreate` | flex 行 + `.mrfw-input` 复用 | 新建行 |
| `.mrfw-groupHint` | `margin: 0 0 4px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary)` | 组说明（`.mrfw-note` 已有，可复用；若复用则**不新增**此类） |

实现时优先复用 `.mrfw-note` / `.mrfw-btn` / `.mrfw-input`，真正新增的只有 picker 族约 10 个类。

---

## ④ 决策记录

### D-00 栈识别（必须留痕）

**结论**：writer skill = `dsh-plugin-writer`（已加载并按其执行）。

**证据**：① 目标仓是 `dsh-plugins` pnpm workspace（`pnpm-workspace.yaml` 的 `packages: plugins/*` +
五个 tooling 包、`pnpm-lock.yaml`、`packageManager: pnpm@…`），`plugins/*` 七个 DSH 组合包；
② Spring 判据全未命中（仓内无 `pom.xml` / `build.gradle*`，无 Java 源码）；Nuxt 判据全未命中
（无 `nuxt.config.*`，无 Vue 依赖，client 侧是 React + cordis）；③ 聚合层存在锚定本仓的专属
skill（`/home/docker/.agents/skills/dsh-plugin-writer/SKILL.md`，其 §1 明写「唯一锚点
`/home/xuqinqin/develop/person/dsh-plugins`」），且用户在 2026-11-08 的任务里直接指认该 skill。

**影响**：构建/验证命令按 skill 的 §5 生命周期（`pnpm --filter … verify:all` → `pnpm dsh:check` →
`dsh plugin --profile web add` → `--dump-config`）；多根插件按 skill §3 的「特例」路线判定（既有
tsc + tsdown，不走 build-kit），本次**不新建插件、不改形态**，因此只消费它的构建/验证纪律。

**被否**：Spring（仓内无 `pom.xml`/`build.gradle*`/Java 源）与 Nuxt（无 `nuxt.config.*`/Vue 依赖，
client 是 React + cordis）两个判据皆未命中，不选；也不把 multi-root 当「通用前端插件」套
`build-kit` 模板（它是 skill §3 明列的特例路线）。

**反例**：若按「有 React 就套软插件模板」误判，会去跑 `pnpm gen:plugin` 或改 `build-kit`——
multi-root 是既有特例包、生成器不覆盖它，改构建反而踩 `dsh:check` 的 AR/B 门禁。

### D-01 能力判定 = pick 先行 + 三级信号 + 结构探测兜底

**决策**：先 `pickDirectory()`；失败后按「结构化 details → message 正则 → `listDirectory()` 探测」
三级分类；browse 判定成立才降级，且探测拿到的 home 层直接复用为对话框首帧；能力按服务实例缓存。

**被否方案与理由**
- **只靠 `details.capability`**（决策留痕的字面读法）：代码层取不到——ui-workspace 的
  `pickDirectory` 把 `RemoteFailure` 折成 `new Error(message)`（`$UP/dsh-client-ui-workspace/lib/client.js:1562-1566`）。
  单靠它，pick 失败时读不到任何信号 → 无法降级，等于功能缺失。
- **只靠 message 正则**：非契约文案（上游改词/本地化/pick 因别的原生错误失败）会误判。
- **先 `listDirectory()` 探测再决定是否 pick**：反转了收敛裁定的「先试 pick」；native 部署每次
  点「添加目录」先打一次必然失败的 RPC。
- **新增 host 端点暴露 `capability()`**：要改宿主半 + wire 契约 + 版本门，体量与收益不成比例。

**反例（实测路径）**：若上游把 `serves "browse"` 改成中文，②失配 → 走 ③探测：browse 部署
`list()` 成功 → 仍降级（结果正确，代价是一次多余 RPC）；native 部署 `list()` 拒绝且
`rpcError.details.capability === 'native'` → 报原始 pick 错误（不会误开空对话框）。

### D-02 降级逻辑全部留在 client 半的独立模块，不碰 wire

**决策**：新增 `src/client/directory-picker.ts`，通过 `read()` thunk 现取 `ctx.uiWorkspace`；
`index.ts` 只做一行装配。

**被否**：把判定塞进 `index.ts` 内联闭包（不可单测、与装配耦合）；放进 `WorkspaceFoldersAction.tsx`
（React 组件里做 RPC 分类，违反现有「组件只发面板通道」的分层）；改 `contract.ts` 让 host 参与能力判定（D-01 已否）。

**理由**：该模块零 React 依赖、零 `@deepseek-ai/*` 运行时 import，可在 node 环境直接单测；
`read()` 保持「服务晚到仍可用」的既有属性（`index.ts:182-185` 的同一纪律）。

**反例**：把分类写进 `WorkspaceFoldersAction` 的渲染路径，React 严格模式的双渲染会各触发一次
必然失败的 `pickDirectory()` RPC；组件测试还得为 `uiWorkspace` 造替身。现在分类是纯闭包，
`test/client-directory-picker.spec.ts` 在 node 环境直接喂假服务即可。

### D-03 对话框自绘（不用 ui-primitives 的 `Modal`）

**决策**：`DirectoryPickerDialog.tsx` 自绘遮罩/卡片/Escape/Tab 焦点环/焦点归还；视觉逐值复刻
`$UP/dsh-client-ui-primitives/lib/Modal.module.css`（mask/layer-2/radius-panel/elevation-prominent）。

**被否方案与理由**
- **import `@deepseek-ai/dsh-client-ui-primitives` 的 `Modal`**：ADR-0006 决策 6 末段明确
  「Button/Modal 等结构组件仍按本 ADR 决策 3 自绘」，用它需要在本变更里修订一条 Accepted ADR；
  且 `vitest.config.ts:6-10` 把 primitives alias 到 `test/stubs/ui-primitives.tsx`，替身不会复现
  `useModalLayer` 的 Escape/Tab/焦点归还——**测试面反而变薄**，a11y 只能靠人眼。
- **内联展开（非模态）**：与收敛裁定的「对话框」形态冲突；页面滚动时浏览状态易被带出视口。
- **复用上游 browse 包**：它填充的是 ui-workspace 自己的两个 **single** slot（explore 已证），
  multi-root 不是 owner，重复注册会被拒。

**与 ADR-0013 的边界**：ADR-0013 删掉的是**分节壳**（遮罩/卡片/header/Escape 归 holder 的页面）；
本对话框是分节内部的**拾取浮层**，只在用户点「添加目录」时出现、只服务一次目录选择，
与 holder 的页面壳不重叠——解除的是「壳归 holder」的重复，不是「任何浮层都不许自绘」。

**反例**：若改走 `Modal`，为了「Escape 关闭的是浏览器而不是整页」还要额外处理 `shortcutModal`
与宿主 modal 层叠；当前页面不是 modal，自绘层的 Escape 归属是确定的，反而更简单。

### D-04 单栏 + 面包屑 + 「采纳当前目录」；新建后导航进入新目录

**决策**：`listDirectory` 一次列一层；点行即进入；底部「选择此目录」采纳 `listing.path`；
新建成功后 `list(created)` 进入新目录（用户随即可以确认它）。

**被否**：Miller 双栏（Q2 已否，体量大）；「先选中行再确认」（多一层选中态、键盘语义更复杂）；
新建后只把名字加进列表（还需再点一次，且列表不许本地伪造条目——宿主才是真源）。

**反例**：如果新建后不导航，用户会看到新目录出现在列表里但「选择此目录」仍指向父目录，
一次误点就添加了父目录——导航进入是防误采纳的最小代价。

### D-05 分组 = 纯客户端按 `source === 'common'` 拆分；通用行保留既有禁用操作集与徽章

**决策**：`registered` / `commons` 两数组；两组各渲染自己的 `mrfw-section`（标题常驻）；通用组
标题下方常驻说明（有根 → `panel.commonHint`；无根 → `panel.commonEmpty`）；通用行保留
「复制 / 显示 / 上一级禁用 / 菜单项禁用 / 通用徽章」与既有文件树。

**被否方案与理由**
- **wire 加 `commonRoots` 第二数组**：breaking、双端 zod 契约与两个消费方都要改，且没有消费方收益。
- **隐藏通用行的管理控件**（彻底去掉全禁用的上下移/菜单）：更干净，但收敛验证句写的是
  「通用组操作集**禁用不变**」；隐藏属另一轮打磨，不在本次重开。
- **删除通用徽章**：分组标题已表达分类，徽章确实冗余；但它同时承载 `root.sourceCommonTitle`
  的「这是配置授予、不可在此编辑」提示，删它要同步改 `docs/reference/common-additional-roots.md:53`
  与 parity 用例，功能收益为零。保留，留给后续打磨记录。

**反例**：若把分组放到 wire 层（`roots` 拆成两个数组），旧面板遇新宿主会因缺 `roots` 被判
`panel/bad-response`（`panel-client.ts:118-123` 的边界校验）；新面板遇旧宿主则拿不到第二个数组——
两个方向都得补兼容垫片。现方案对两个方向都退化为「忽略未知字段」，无需垫片。

### D-06 「添加目录」动作行归入附属组内部（两组之前后顺序不变）

**决策**：动作行（拾取按钮、手输、重试、能力提示）放在「附属工作目录」组内、列表之后；
「通用工作目录」组在其后独立呈现。

**被否**：动作行留在两组之后——视觉上它属于最后一个组（通用组），而它只能添加**附属**根，
会造成「在通用组里添加」的误导。

**理由**：动作与它所影响的集合同区；通用组是配置只读面，不应与可写动作混在一起。

**反例**：动作行留在两组之后时，`picker.unavailable` 提示会渲染在「通用工作目录」组下方，
读者会把它读成「通用组不可用」，而不是「拾取能力不可用」。

### D-07 拾取升级为带文案主按钮；手输确认降为次要变体

**决策**：`+` 从 `IconButton`（仅 title）改为 `Action variant="primary"`，内容 `<IconPlus/> + t('panel.add')`；
手输「添加」从 `primary` 降为 `outline`；手输框占位与行为不变。

**被否**：保留 icon-only（可发现性差，正是需求 ③ 的候选项）；移除手输（Q5 已裁定保留）；
把两个「添加」都做成 primary（同级两个主按钮，层级失效）。

**反例**：若拾取按钮也做成 `outline`，在 browse 部署下用户第一眼看到的是两个同等权重的入口，
手输（兜底）反而更显眼，与「选择器为主」的目标相反。

### D-08 primary 行只补「复制路径」，不补 reveal

**决策**：primary 行在路径文本右侧加一个 `IconButton`（`IconCopy`），`copyPath(state.view.primaryRoot, 'primary')`；
不加「在文件管理器中显示」。

**被否**：补 reveal——`reveal` endpoint 用 `requireEntry` + `resolveRootRef` 只寻址登记的附加根
（`src/command.ts:495-500`），primary 不在 registry、`entryOf` 也造不出 entry
（`WorkspaceFoldersAction.tsx:229-231`）；补它需要 host 小改，Q7② 已否。

**反例**：若为了「对称」把 reveal 按钮渲染出来但调用 `reveal`，host 会以 `invalid-ref` 失败，
用户得到一次必然失败的点击——比没有按钮更糟。

### D-09 能力不可用时隐藏拾取入口 + 常驻手输提示

**决策**：`{ kind: 'unavailable' }` 后把 `picker` 置为 `unavailable`：+ 按钮不再渲染，
动作行显示 `picker.unavailable`（指向手输）；若服务恢复（重挂载后），入口自然回来。

**被否**：禁用按钮但保留（与上游「未知 kind 隐藏拾取入口」的官方默认相反，且点了没反应）；
静默 no-op（**现状缺陷**：`index.ts:128-132` 在无 `uiWorkspace` 时返回 `null`，点了什么都不发生）；
弹错误框（每次点击都报错，噪声）。

**反例**：如果保持按钮禁用而不隐藏，用户会反复点一个永远不可用的控件；隐藏 + 一句说明把
注意力引到手输，正是兜底入口该承接的路径。

### D-10 对话框 portal 到 `document.body`（接受新增一个模块词 `react-dom`）

**决策**：`createPortal(<overlay/>, document.body)`；同批更新 `test/client-bundle.spec.ts` 的 require 词断言。

**被否**：就地 `position: fixed`（祖先若有 `transform`/`filter`/`contain`，fixed 会退化为相对祖先定位，
宿主侧栏抽屉就有 transform 动画；页面容器未来也可能加）；把对话框注册成全局 overlay 座位
（本插件不是 holder，且会增加宿主契约面）。

**理由**：`react-dom` 在 `tsdown.config.ts:49` 的 `CLIENT_EXTERNALS` 与 shell 的平台模块表里
（`dsh-client-ui-renderer/lib/client.js:11` 同样 `require("react-dom")`），portal 不引入新身份。

**反例**：若坚持不新增模块词，就得自造 portal（`document.body.append` + React root 双份挂载），
那才是真正的身份/生命周期风险。

### D-11 数据结构：`DirectoryListing` 用本地结构镜像，不 import 上游类型包

**决策**：在 `directory-picker.ts` 声明 `DirectoryEntry` / `DirectoryListing`，逐字对齐
`$UP/dsh-host-directory-picker/lib/types/types.d.ts`；**不** `import type { UiWorkspace }`，
也**不**新增 `@deepseek-ai/dsh-api-remotes` 等 devDependency。

**被否**：`import type { UiWorkspace } from '@deepseek-ai/dsh-client-ui-workspace/client'` 再用
`Awaited<ReturnType<…>>` 取类型——`UiWorkspace` 的 d.ts 链会 import `@deepseek-ai/dsh-api-remotes/client`，
该包不在本包 `node_modules`（`node_modules/@deepseek-ai` 里只有 `dsh-client-ui-workspace` /
`dsh-typert-protocol` 等，无 `dsh-api-remotes`），其 d.ts 链的解析目前依赖 `skipLibCheck: true`；
换成严格消费者即存在解析失败风险。且会让本包发布的 client `.d.ts` 多一条
它没有声明的类型依赖。

**反例**：结构镜像的唯一风险是上游加字段——`DirectoryListing` 是**返回值**，多字段对我们是
无害的（TS 结构类型允许额外字段）；缺字段则由对话框的防御性读取兜住。

### D-12 探测只做一次、缓存在适配器闭包里

**决策**：`cached = { service, kind }`；`read()` 返回同一服务实例时直接复判结果。

**被否**：每次点击都探测（browse 部署每次多一次 `list`）；放进 React state
（页面切 tab 重挂载即丢失，且把「能力」变成渲染状态）。

**反例**：若缓存不按服务实例失效，宿主热替换 `uiWorkspace`（或 HMR 重建）后可能把一个
已经变成 browse 的部署永远判成 native——按实例身份失效正好覆盖这个反例。

---

## ⑤ 逐任务组实现要点

分组沿用建议的六组（与收敛留痕的 D1/D2/D3 一一可追）；**执行顺序是拓扑序，不是编号序**：
`TG1 → TG4 → TG2 → TG3 → TG5 → TG6`。TG4 先于 TG2/TG3 的理由：文案键是后两者的**编译前提**
（`Key` 是字面量联合，缺键即类型错误），样式类是它们的**视觉前提**（类名先存在，组件才有样式可挂）。

### TG1 能力降级模块

**文件**：新建 `src/client/directory-picker.ts`；改 `src/client/index.ts`（装配）。图标属对话框依赖，归 TG2。

**要点**
1. 类型与导出严格按 3.1；`DirectoryPickOutcome` 用 `readonly` 字面量联合，禁止 `any`。
2. `createDirectoryPicker(read)` 内实现 3.2 的三级分类与 3.1 的 7 条行为契约；能力缓存按服务实例。
3. `failureOf` 用结构判据（`code` / `details.capability` / `rpcError` 载体），不 `instanceof`。
4. `normalizeBrowseFailure` 映射表：`directory-picker/unreadable → picker-unreadable`、
   `…/exists → picker-exists`、`…/create-failed → picker-create-failed`，其余（含 `gateway/internal`）
   → `picker-failed`；`DirectoryBrowseError` 带 `code` + 原始 `message`（诊断用）。
5. `index.ts`：删掉旧的四行闭包（`index.ts:128-132`），改为
   `const pickDirectory = createDirectoryPicker(() => readService<DirectoryPickerService>(ctx, 'uiWorkspace'))`；
   注入面与 launcher 同步换型（字段名仍是 `pickDirectory`）。`readService` 与 `sessionId` 不动。

**验收（命令 + 断言）**

```bash
pnpm --filter dsh-plugin-multi-root-workspace typecheck
pnpm --filter dsh-plugin-multi-root-workspace exec vitest run test/client-directory-picker.spec.ts
```

- `read() → undefined` 两次调用都返回 `unavailable`（无缓存）。
- `pickDirectory` 调用计数：`browse` 判定后第二次 `pick()` **不再调用** pick（fake 计数 1）。
- `pick throws Error('… serves "browse"')` → `browse`（`browsing` 非空，`listing` 未定义）；
  message 改形到不含 `serves`（如 `'the composed picker is browse; pick needs native'`）时走探测分支
  → `browse` 且 `listing` 存在（探测成功的那一层）。
- `pick throws { rpcError: { code: 'directory-picker/unavailable', details: { capability: 'browse' } } }` → `browse`。
- `pick throws` + `list` 拒绝且 `details.capability === 'native'` → `failed`（error 是原错误对象）。
- `pick throws` + `list` 拒绝（无 details） → `unavailable`。
- 服务无 `pickDirectory` 有 `list+create` → `browse`，且 `pickDirectory` 根本不存在也不报错。
- `list/create` 拒绝 → `DirectoryBrowseError.code` 符合映射；`signal.aborted` 时抛
  `DirectoryBrowseError('picker-failed')`（对话框据 `signal.aborted` 丢弃，不渲染错误）。
- `index.ts` 装配：`client.inject` 仍等于 `['slots','locale','connection']`
  （`test/client-panel.spec.tsx` 的既有断言 `"declares the services it needs"` 必须仍通过）。

### TG2 对话框组件

**文件**：新建 `src/client/DirectoryPickerDialog.tsx`；改 `src/compat/client-icons.ts`（+2）；
改 `test/stubs/ui-primitives.tsx`（+2 替身导出）。

**要点**
1. 组件签名与内部状态按 3.3；`open` 翻转副作用只跑一次（`useEffect(..., [open])`，带注释说明
   `initialListing`/`browser` 在打开瞬间快照，不随属性变化重扫）。
2. 渲染结构（语义顺序固定）：
   `div.mrfw-pickerOverlay > div.mrfw-pickerMask(onClick=onClose) + div.mrfw-pickerCard(role=dialog aria-modal tabIndex=-1)`
   → header（`h2#title` + 关闭 `IconButton`）→ `nav.mrfw-pickerCrumbs`（Home + crumbs + 当前段
   `aria-current="page"`）→ `ul.mrfw-pickerList`（每行 `button`：`IconFolderClose` + `name`；空层
   `picker.empty`；`truncated` 说明）→ 新建行（`picker.create` 按钮 / 输入 + 创建 + 取消）→
   footer（当前路径 + 取消 + `picker.confirm`）。
3. 错误分两层：`scan.failed` 的 `picker.error.*` 显示在列表区；`commitError`（add 失败句）显示在
   footer 上方；`create.error` 显示在新建行下方。
4. a11y：Esc 关闭、Tab/Shift+Tab 环绕、打开聚焦卡片、关闭归还 opener、`aria-pressed` 隐藏开关。
5. 取消/关闭路径不得调用 `onConfirm`；`confirming` 期间禁用确认按钮与关闭按钮（防重复提交）。

**验收**

```bash
pnpm --filter dsh-plugin-multi-root-workspace exec vitest run test/client-directory-dialog.spec.tsx
pnpm --filter dsh-plugin-multi-root-workspace exec vitest run test/client-icons.spec.ts
```

- 首帧只调一次 `list()`（零参）；`initialListing` 给出时 **0 次** `list`，直接渲染其 `entries`。
- 点 `entries[0]` → `list(path0)`；点面包屑某段 → `list(crumb.path)`；返回后列表更新。
- 默认不渲染 `hidden: true` 的行；点开关后渲染；再点隐藏。
- `truncated: true` → `picker.truncated` 文本出现。
- 新建：`create(listing.path, '新目录')` 精确参数；成功后 `list('<listing.path>/新目录')` 被调用。
  上游返回 `picker-exists` → 显示 `picker.error.exists`，不导航、不关闭。
- `onConfirm` 返回 `'失败句'` → 对话框仍在（`role="dialog"` 可查）、显示该句、确认按钮恢复可点；
  返回 `undefined` → `onClose` 被调用一次。
- `Esc` / 取消 / 点遮罩 → `onClose` 一次，`onConfirm` 0 次。
- 快速连点两个目录：只有后一次 `list` 的结果生效（用 `holdNextCall` 式延迟 fake）。
- 关闭后焦点回到打开前的元素（`document.activeElement` 断言）。
- `role="dialog"` + `aria-modal="true"` + `aria-labelledby` 指向标题 id。

### TG3 分组渲染与按钮升级

**文件**：改 `src/client/WorkspaceFoldersAction.tsx`（分组、动作行、primary 复制、拾取状态机）；
改 `test/client-panel.spec.tsx`（harness + 新用例）。

**要点**
1. 分组按 3.5；`renderRows(rows)` 内 `canMoveUp = !isCommon && index > 0`、
   `canMoveDown = !isCommon && index < rows.length - 1`（**数组换成组内数组**，这是唯一的行为修正点）。
2. 附属组：标题 `panel.additional`；`state.view === undefined` → `panel.loading`；
   `registered.length === 0` → `panel.empty` + `panel.emptyHint`；随后 `renderRows(registered)`；
   **动作行移入本组末尾**。
3. 通用组：标题 `panel.common`（`title={t('root.sourceCommonTitle')}`）+ 说明
   （`commons.length === 0 ? panel.commonEmpty : panel.commonHint`），随后 `renderRows(commons)`；
   加载中不渲染说明（避免把「还没读到」说成「没配置」）。
4. primary 行：`state.view !== undefined` 时渲染复制按钮（`copyPath(state.view.primaryRoot, 'primary')`），
   `copiedId === 'primary'` 时 label 切 `panel.copied`。
5. 拾取状态机按 3.5：`picked` → `mutate('add')`；`browse` → `setPicker({kind:'open', browsing, ...(outcome.listing ? {listing: outcome.listing} : {})})`
   （`exactOptionalPropertyTypes` 下**必须**用条件展开，不能写 `listing: undefined`）；
   `cancelled` → 无动作；`unavailable` → `{kind:'unavailable'}`；`failed` → `state.error`。
   `picking` 期间按钮禁用（防双击）；`picking` 的清理放 `finally`，异常路径也要复位。
6. 对话框挂载：`picker.kind === 'open'` 时渲染 `<DirectoryPickerDialog open …/>`；
   `onConfirm` 用 `confirmPickedPath`（内部 `mutate('add', {path})` → 失败返回 `sentenceOf`）。
7. `mutate` / `copyPath` 签名按 3.5；`addManualPath` 用 `failure === undefined` 决定是否清空输入。

**验收**

```bash
pnpm --filter dsh-plugin-multi-root-workspace exec vitest run test/client-panel.spec.tsx
```

- 四态：纯附属（通用组只有标题+`panel.commonEmpty`）、纯通用（附属组空态 + 通用组行）、
  混合（两组各 1+ 行）、双空（两个标题都在，两组说明各不相同）。
- 混合时 DOM 顺序 = 附属行在前、通用行在后；通用行仍在第二组（用 `within(section)` 断言）。
- 通用行：`panel.copyPath` / `panel.reveal` 两个按钮存在且点击后分别触发剪贴板写入与 `reveal` 调用；上移/下移 disabled；菜单项 disabled（`test/client-panel.spec.tsx` 既有断言原样通过）；
  `root.sourceCommon` 徽章仍在。
- 动作行位于附属组 `section` 内（`within` 断言），不在通用组内。
- `+` 按钮：可访问名 = `t('panel.add')`，class 含 `mrfw-btnPrimary`；点击后走 `pick()`。
- native 结局：`add` payload = `{sessionId, path:'/repos/picked'}`；手输确认按钮 class 含 `mrfw-btnOutline`，且仍以输入框内容发 `add`（既有两条用例断言不变）。
- browse 结局：对话出现（`role="dialog"`），点「选择此目录」→ `add` payload 为 home；`onConfirm` 失败
  （host 返回 `nested`）→ 对话框内显示 `error.nested`，且不关闭。
- unavailable 结局：`+` 不在 DOM、`picker.unavailable` 文本出现、手输框仍在且 Enter 能发 `add`；同一挂载内再点不到拾取按钮（无重复请求）。
- primary 复制：点击后 `navigator.clipboard.writeText` 收到 `state.view.primaryRoot`；
  primary 行**没有** reveal 按钮。

### TG4 文案与样式

**文件**：改 `src/client/locales.ts`（3.7 表）；改 `src/client/styles.ts`（3.8 表）。

**要点**
1. 21 个新键一次补齐 zh/en；`en` 的 `satisfies` 会强制同形；不新增空串。
2. `Translate` 类型搬到 `locales.ts`，`WorkspaceFoldersAction.tsx` 保留 type-only re-export。
3. 样式只加 picker 族 + 组说明；不写死颜色、不写主题选择器；圆角/阴影/遮罩用宿主 token。
4. 复用 `.mrfw-btn` / `.mrfw-input` / `.mrfw-note`，避免第二套按钮几何。

**验收**

```bash
pnpm --filter dsh-plugin-multi-root-workspace exec vitest run test/locale-parity.spec.ts
# 样式纪律（ADR-0006）：新样式族不得出现字面色值 / 主题选择器
grep -nE '#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|data-ds-dark-theme' plugins/multi-root-workspace/src/client/styles.ts
# 期望：无输出（exit 1）。若 picker 族引入了字面色，这里会打印命中行
grep -c "mrfw-picker" plugins/multi-root-workspace/src/client/styles.ts   # 期望 >= 10
```

### TG5 测试

**文件**：新建两个 spec、改 `client-panel.spec.tsx` / `stubs/ui-primitives.tsx` / `client-bundle.spec.ts`
（TG1/TG2/TG3 已各自列出用例；这里只补**跨组**与**产物**）。

**要点**
1. harness 的 `uiWorkspace` 替身扩成三态（`setPickerMode('native'|'browse'|'unavailable')`），
   `browse` 模式提供 `listDirectory`（返回 fixture：home `/home/me`、crumbs、entries、truncated 可切）
   与 `createDirectory`（可注入 `exists` 失败）；native 模式保持返回 `/repos/picked`。
2. 产物门禁：`react-dom` 进入 required 数组；补一条「对话框只在打开时出现在 DOM」的断言
   （初始 `queryByRole('dialog')` 为 null，browse 结局后出现）。
3. 不做冒烟脚本改动：journey smoke 已覆盖「client bundle 被服务 + 通道可用」
   （`scripts/smoke-journey.mjs:557-560`），UI 交互不在它的能力面；新增 UI 行为由 jsdom 覆盖。

**验收**

```bash
pnpm --filter dsh-plugin-multi-root-workspace build
pnpm --filter dsh-plugin-multi-root-workspace exec vitest run test/client-bundle.spec.ts
pnpm --filter dsh-plugin-multi-root-workspace test        # 全量
```

- `require` 词集合逐字等于 4 项；`workspace-config.section` / `sidebar.right.tab.files.actions` 仍在；
  `sidebar.footer.action` 仍不出现。
- `pnpm test` 退出码 0（全部用例通过）；`client-bundle.spec.ts` 必须在 `build` 之后跑（它读 `lib/client.js`）。

### TG6 文档

**文件**：README（3 段）、`docs/architecture/multi-root-workspace.md`（§7）、新 ADR-0015、
`docs/decisions/README.md`（索引）、`docs/reference/common-additional-roots.md`（1 句）。

**要点**
1. ADR-0015 的 Context 必须写 P-1 的实测事实（`pickDirectory` 丢 code/details）与三级信号；
   Decision 与本文 D-01/D-03/D-05 对齐；Alternatives 抄 ④ 的被否方案，不复制探索结论。
2. ADR 骨架按包内 `check-docs` 的既有体例补齐七节（Status / Date / Context / Decision /
   Alternatives Considered / Consequences / Related Documents）；`docs:check` 的 `adr-names`
   还会校验文件名 `ADR-NNNN-短名.md`。
3. **文档里不得出现绝对路径**：包内 `docs:check` 的 `absolute-paths` 为启用且无豁免
   （`plugins/multi-root-workspace/scripts/check-docs.mjs:15-38`，`absolute-paths: true` 且 `exemptions.absolutePaths: []`），`/usr/local/...`、`/home/...`
   一律判红。上游证据改写为「包名 + 文件 + 符号」（如「`@deepseek-ai/dsh-client-ui-workspace` 的
   `pickDirectory` 只抛 message」）；确需贴原始安装路径时落 `plugins/multi-root-workspace/artifacts/`
   （仓级扫描的 `noScanPaths` 覆盖该目录），README 侧按「验证证据：[…](artifacts/…)——结论：…」行引用。
4. 文档不复制 11 条不变量，只链接 `AGENTS.md` / ADR 索引（Single Source of Truth）；
   引用 ADR 一律带相对路径（如 `[ADR-0006](./decisions/ADR-0006-client-ui-host-tokens.md)`），不裸写编号。
5. 所有文档链接用相对路径（`docs:check` 的 `markdown-links` 会校验目标存在）。

**验收**

```bash
pnpm --filter dsh-plugin-multi-root-workspace docs:check
pnpm docs:check        # 根仓递归（含 multi-root dual 入口）
```

### TG 依赖与提交切分

| 顺序 | 提交 | 依赖 | 说明 |
| --- | --- | --- | --- |
| 1 | TG1 适配器 + 单测 + `index.ts` 装配 + TG3 的类型对齐 | 无 | `pickDirectory` 是 `WorkspaceFoldersSectionProps` 的字段，换型必须与消费方同提交，否则 typecheck 红；行为切换仍留在第 4 步 |
| 2 | TG4 文案 + 样式 | 无 | `Key` 字面量先落地 |
| 3 | TG2 对话框 + 单测 | TG1、TG4 | 新增文件，不动既有行为 |
| 4 | TG3 分节改造 + panel spec | TG1、TG2、TG4 | 行为切换点，单测与 UI 同提交 |
| 5 | TG5 产物断言补齐 | TG2（react-dom） | 必须 `build` 后跑 |
| 6 | TG6 文档 + ADR | 全部 | 与代码同批（AGENTS.md 要求文档随变更） |

### 验证矩阵（需求 → 断言 → 命令）

> 下表命令均以本仓根为 cwd。

| 需求/决策 | 可判定的断言 | 命令 |
| --- | --- | --- |
| 需求① browse 部署可选取 | 面板 spec：browse 结局打开 `role=dialog` → 确认后 `add` payload 为选中路径 | `pnpm --filter dsh-plugin-multi-root-workspace exec vitest run test/client-panel.spec.tsx` |
| 需求① native 部署不被破坏 | 适配器 spec：pick 成功 → `picked`，`list` 调用 0 次 | `pnpm --filter dsh-plugin-multi-root-workspace exec vitest run test/client-directory-picker.spec.ts` |
| 需求① 手动输入保留 | 面板 spec：手输 + Enter / 按钮仍发 `add`；picker 不清空输入 | `pnpm --filter dsh-plugin-multi-root-workspace exec vitest run test/client-panel.spec.tsx` |
| 需求② 两组分离 | 面板 spec 四态（纯附属/纯通用/混合/双空）+ `within(section)` 断言 | `pnpm --filter dsh-plugin-multi-root-workspace exec vitest run test/client-panel.spec.tsx` |
| 需求② 通用组常驻说明 | `panel.common` 标题恒在；空/非空分别命中 `panel.commonEmpty` / `panel.commonHint` | `pnpm --filter dsh-plugin-multi-root-workspace exec vitest run test/client-panel.spec.tsx` |
| 需求③ 主动作 + 能力提示 | `+` 可访问名 = `panel.add` 且 class 含 `mrfw-btnPrimary`；unavailable 后按钮不在 DOM、提示出现 | `pnpm --filter dsh-plugin-multi-root-workspace exec vitest run test/client-panel.spec.tsx` |
| 需求③ primary 复制 | `clipboard.writeText` 收到 `primaryRoot`；primary 行无 reveal 按钮 | `pnpm --filter dsh-plugin-multi-root-workspace exec vitest run test/client-panel.spec.tsx` |
| 对话框浏览契约 | 首帧/面包屑/隐藏/截断/新建/取消/Esc/焦点归还逐条断言 | `pnpm --filter dsh-plugin-multi-root-workspace exec vitest run test/client-directory-dialog.spec.tsx` |
| 不变量 10 不破 | 面板只读 `roots` 单数组；common 行不可增删改（既有断言）；宿主侧 common 语义 | `pnpm --filter dsh-plugin-multi-root-workspace exec vitest run test/registry-common.spec.ts` |
| ADR-0006 样式纪律 | picker 族 0 字面色值、0 主题选择器 | 见 TG4 的两条 `grep` 命令（期望：字面色检查无输出 exit 1；`mrfw-picker` 计数 ≥ 10） |
| 产物契约 | `require` 词 = `['@deepseek-ai/dsh-client-ui-primitives','react','react-dom','react/jsx-runtime']`；两个座位注册仍在 | `pnpm --filter dsh-plugin-multi-root-workspace build && pnpm --filter dsh-plugin-multi-root-workspace exec vitest run test/client-bundle.spec.ts` |
| 全量回归 | `verify:all` 退出码 0（lint/compat/typecheck/build/kernel/test/smoke 依次通过） | `pnpm --filter dsh-plugin-multi-root-workspace verify:all` |
| 仓级门禁 | `pnpm dsh:check` 退出码 0（DSH 基线 + AR1–AR8 + B1–B5 全过） | `pnpm dsh:check` |
| 装载性（真机） | `--dump-config` exit 0；页面分节可见 | `docker exec dsh dsh plugin --profile web add /home/xuqinqin/develop/person/dsh-plugins/plugins/multi-root-workspace` 后 `docker exec dsh dsh --profile web --dump-config` |
| 真机 browse 冒烟 | 点「添加目录」：先 pick 失败、再 list 成功、弹「选择工作目录」；确认后 `add` 成功并出现行 | 浏览器 Network 观察 `directoryPicker.pick`（失败）→ `directoryPicker.list`（成功）→ `/multi-root-workspace` 的 `add`（成功）；DOM 断言 `role=dialog` + 标题 |
| 真机 native 语义 | **不可覆盖**（容器无 OS 选择框）——只由适配器单测模拟 | —（记录为 A-8 验证缺口） |

---

## ⑥ 设计假设与未决项

### 6.1 设计假设

- **A-1（上游事实）**：`uiWorkspace.pickDirectory` 在 `0.2.2-rc.1` 只透传 message；
  `listDirectory`/`createDirectory` 的失败保留 `rpcError`。见 ② 上游证据。若上游在下个补丁
  保留 details，①结构化分支自动接管，无需改代码。
- **A-2（权限面）**：browse 的 `list/create` 不受 remoteAccess 门限制（decisions.md 收敛期已查证，
  本设计不新增加权/门禁，不重开该结论）。
- **A-3（通用行呈现）**：保留既有徽章与「禁用不变」的操作集（D-05）；若要隐藏全禁用控件，
  属后续打磨项，不在本轮重开收敛。
- **A-4（动作归属）**：动作行放在附属组内部（D-06）；不改变动作集合与顺序语义。
- **A-5（起点）**：对话框每次打开都回到 Host home（Q3 裁定），不做「记住上次目录」。
- **A-6（ADR 编号）**：插件级 ADR 已用到 `ADR-0014`，新增为 `ADR-0015-in-app-directory-picker.md`；
  仓级 ADR 是另一套编号，引用时带路径（AGENTS.md 明示）。
- **A-7（不改宿主/命令）**：`/workspace-folders add` 无参数仍走宿主原生 `capability.pick(signal)`
  （`src/command.ts:538-542`），与 GUI 拾取是两条独立路径；本次不动命令面。
- **A-8（验证缺口）**：native 部署的 OS 选择框无法在容器/CI 复现，只有适配器单测模拟；
  真机验收只覆盖 browse 分支。

### 6.2 未决项摘要

本设计**没有**会阻塞开工的未决项；两项需要上游角色确认或接受（详见文末「待决问题」）：

- **P-1** 能力信号与 `decisions.md` 的事实假设不一致（`details.capability` 在 pick 层取不到）。
- **P-2** 用户可见文案的术语（「工作目录」 vs 需求原文的「工作区」）。

另外两条**已在本设计内裁定、不需要再问**，记录备查：对话框自绘而非用 `Modal`（D-03，ADR-0006 边界）；
分组不进 wire（D-05，invariant 10 与双端 zod 边界）。

---

## 待决问题

### P-1 能力信号的取得方式（事实偏差，需确认后落 ADR）

- **问题**：`decisions.md` 写「详情 `details.capability === 'browse'`（`message` 兜底）」，但代码事实是
  `ui-workspace` 的 `pickDirectory()` 只抛 `new Error(\`directory picker failed: ${rpcError.message}\`)`，
  **code 与 details 都拿不到**（`$UP/dsh-client-ui-workspace/lib/client.js:1562-1566`）。若按字面实现，
  降级永远不触发。此问题**不动摇** D1 的「pick 失败 → 降级」结论，只影响信号的取得路径。
- **选项**：
  - **a（推荐）** 采纳本文 D-01：pick 层用 message 正则 + `listDirectory()` 结构探测兜底；
    details 只从 `list/create` 的 `rpcError` 读；在 ADR-0015 的 Context 与 evidence 里留痕，
    并在 decisions 留痕加一条注记（不改原裁定文字）。
  - **b** 先向上游提 issue（保留 `rpcError` 或暴露 `capability()`），本轮等上游。
  - **c** 在适配器里绕过服务、直接访问 Typert Remote `directoryPicker`：不可行——出树包没有
    Remote 命名空间装配面（ADR-0005 的既有结论），且 `pick` 的 remoteAccess 门也不在 owner 手里。
- **推荐**：a。降级能力现在就可用；②/③ 两级让「message 改形」的后果从「功能消失」降为
  「多一次 `list` 调用」。等上游 b 落地后，①分支自动接管，message 兜底可删。
- **影响面**：适配器分类逻辑（约 25 行）、`client-directory-picker.spec.ts` 的三条分支用例、
  ADR-0015 的 Context、decisions 留痕注记；不影响 wire / host / 对话框。

### P-2 分组文案的术语：继续用「工作目录」还是改成「工作区」

- **问题**：需求原文写「附属工作区 / 通用工作区」；现有页面（本插件）一律用「目录」
  （`panel.primary` = 主工作目录、`panel.additional` = 附属工作目录、错误文案均说目录），
  而分节标题是「工作区文件夹」。
- **选项**：
  - **a（推荐）** 保持「目录」：新增 `panel.common` = 「通用工作目录」；与既有一批键、错误词表、
    README/架构文档的用词一致，零迁移。
  - **b** 全部改成「工作区」：更贴需求原文，但要改十余处既有文案键（`panel.primary` / `panel.additional` /
    `panel.empty` / `panel.emptyHint` / `panel.add` / `error.*` 等）+ 相关文档与测试断言，且与「工作区」
    在宿主里指 Workspace（一个登记实体）混淆。
- **推荐**：a。理由：分节里列的是**目录路径**，宿主「工作区」是另一个概念（`WorkspaceId` + 标题）；
  用「目录」避免概念撞名。
- **影响面**：仅文案与文档；若选 b，追加约 10 处文案/文档改动与 2 处测试断言更新，不动代码结构。

---

## 附：阶段 1.75 界面演示（判定与确认）

- **判定**：C1 ✓（新对话框 + 分组改版均为界面产出）；C2 ✓（用户未提供设计稿/截图/原型，也无完整可照抄页面——对话框为新增布局）；C3 ✓（单栏+面包屑+新建行是**新布局决策**，排除表「仅 token 替换/无新布局」不命中）→ **触发演示**。
- **分档**：L2（对话框含关键交互流与多状态：浏览/新建/错误/截断/隐藏开关/确认/取消；分组含混合/纯空/降级多态）。
- **产物**：`/tmp/spec-flow/2026-11-08-workspace-folders-picker/demos/workspace-folders-picker-l2.html`（18.6KB，四状态屏：①分节布局混合态 ②对话框浏览态 ③对话框新建与错误 ④空态与降级）。
- **自检证据**（2026-11-08 23:2x）：chrome-shared 程序化断言——约束条 sticky、4 tabs/4 sections、桌面 1440 与窄屏 390 均零横向溢出、零外链请求、console 无 error；主会话模型无读图能力（能力事实，非故障），按规则改走 `vision` 路由（zcode-plan/glm-5.3-flash）子代理读 5 张截图按 A–F 清单核对**全部通过**（备注：fullPage 截图 sticky 条叠压为截图伪影，图 1 同区域完整）。截图存 `/tmp/spec-flow/<change>/demo-*.png`（证据，不落库）。
- **确认结论**：**已确认**（2026-11-08 23:31，用户三选一选①「确认，转入落档」，无改稿轮次）。
