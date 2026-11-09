# Design

## Context

「工作区配置」页面重构（2026-11-08-workspace-config-page）已归档：分节软注册、页面级工作区选择框、owner 份额三态下传均已落地。本变更在其「工作区文件夹」分节（multi-root-workspace 贡献）内做**拾取与呈现优化**——完整代码级蓝图见随档 `code-design.md`（966 行，六字段 + 1.75 附录，**与本文冲突处以 code-design.md 为准**）。

宿主事实（实证锚见 code-design.md ②）：上游目录选择是**能力互斥**的判别联合——native 表面只有 `pick`（OS 选择器）、browse 表面只有 `list`/`createDirectory`（`@deepseek-ai/dsh-client-ui-workspace` 的 `uiWorkspace` 服务方法）；`directory-picker-auto` 启动时一次性判定并挂载匹配后端，当前部署判定为 browse。`pickDirectory()` 失败只抛 `new Error(message)`（code/details 被丢弃，client.js:1562-1566）；`listDirectory`/`createDirectory` 失败抛 `DirectoryBrowseError` 且保留 `rpcError`。client 侧无官方能力探测 API。

**栈识别结论（阶段 1.7，D-00）**：writer skill = **dsh-plugin-writer**（证据：本仓为 dsh-plugins pnpm workspace 的 DSH 插件仓，Spring/Nuxt 判据皆未命中，存在锚定本仓的专属 skill，用户于 2026-11-08 指认）。multi-root 属该 skill §3 明列的**特例路线**（既有 tsc + tsdown，不走 build-kit），本次不新建插件、不改形态，只消费其构建/验证纪律（`verify:all` → 仓级 `dsh:check` → link: 装入 profile `--dump-config`）。

## Goals / Non-Goals

**Goals:**

- 「添加目录」在 browse 部署真实可用：pick 失败自动降级为自建应用内目录选择对话框（起点宿主主目录、面包屑、新建文件夹）。
- 附属/通用两类工作目录分组呈现（纯客户端拆分，wire 零改动），通用组标题与说明常驻。
- 拾取升级为带文案主按钮、手输降为次要兜底、主目录行补「复制路径」。

**Non-Goals:**

- 不动宿主半（`command.ts`/registry/scope）、wire 契约（8 端点与 `RootsView` 单数组）、`/workspace-folders` 命令面（A-7：命令仍走宿主原生 `capability.pick`，与 GUI 拾取是两条独立路径）。
- 不改 workspace-config holder 与其他两个分节；不改 11 条不变量任何一条（invariant 10 的 append-after 顺序恰好保证两组天然有序）。
- 页面选择框与分节寻址（当前会话）不一致**本轮不做**（Q7③ 裁定：涉 ADR-0008 安全模型与 per-session 生效语义，另立变更；见 Open Questions）。
- 不补 primary「在文件管理器中显示」（`reveal` endpoint `requireEntry` 只寻址登记根，补齐需宿主改动）；不删通用徽章、不隐藏通用行禁用控件（A-3 后续打磨项）。

## Decisions

（完整决策链与被否方案见 code-design.md ④，D-00–D-12；此处列主干，编号沿用。）

| # | 决策 | 被否方案与理由 |
|---|---|---|
| D-01 | 能力判定 = pick 先行 + 三级信号（结构化 details[仅 list/create 的 rpcError 可取] → message 正则兜底 → `listDirectory` 结构探测）+ 能力按服务实例缓存 | 单靠 details：pick 层取不到（P-1 实测事实）；单靠正则：非契约文案改形即失效；先探测再 pick：native 部署每次多一次必然失败 RPC；新增 host 端点暴露 capability()：体量与收益不成比例 |
| D-02 | 降级逻辑独立为 `src/client/directory-picker.ts`（零 React、零上游运行时 import，node 环境可单测），`index.ts` 一行装配，`read()` thunk 现取服务 | 塞 index.ts 内联（不可单测）；放组件渲染路径（React 严格模式双渲染各触发一次失败 RPC） |
| D-03 | 对话框自绘（遮罩/卡片/Esc/Tab 焦点环/焦点归还），视觉逐值复刻宿主 Modal.module.css 的 token 配方 | 用 ui-primitives `Modal`：ADR-0006 决策 6 明确结构组件自绘，且 vitest 替身不复现 `useModalLayer` 的 a11y（测试面反而变薄）；复用上游 browse 包：其填充的是 ui-workspace 自己的 single slot，非本插件可注入 |
| D-04 | 单栏 + 面包屑 +「采纳当前目录」；新建成功后自动导航进入新目录 | Miller 双栏（Q2 已否）；新建后仅入列表不导航：一次误点就添加父目录（防误采纳） |
| D-05 | 分组 = 纯客户端按 `source === 'common'` 拆两组；通用行保留徽章与既有禁用操作集 | wire 拆双数组：双向混装都要兼容垫片（旧面板判 bad-response）；删徽章：承载配置来源提示，收益为零 |
| D-06 | 动作行（拾取/手输/重试/能力提示）收进附属组内部 | 留在两组之后：视觉上归属通用组，误导「在通用组里添加」 |
| D-07 | 拾取 = `Action variant="primary"` 带文案；手输确认降 `outline` | icon-only 保留（可发现性差，正是现状缺陷）；双 primary（层级失效） |
| D-08 | primary 行只补「复制路径」（`copyPath(path,key)` 泛化复用） | 补 reveal：host `requireEntry` 只寻址登记根，渲染出来即必然失败点击，比没有更糟 |
| D-09 | 能力不可用 → 隐藏拾取入口 + 常驻手输提示（对齐上游「未知 kind 隐藏拾取 affordance」官方约定） | 禁用保留（反复点击永不可用控件）；静默 no-op（现状缺陷：点了什么都不发生） |
| D-10 | 对话框 `createPortal` 到 body；接受产物新增 `react-dom` 模块词，同批改 bundle 断言 | 就地 fixed：祖先 transform/filter 使 fixed 退化（侧栏抽屉即有 transform）；自造 portal：真正的身份/生命周期风险 |
| D-11 | `DirectoryListing` 本地结构镜像（逐字对齐上游类型），不 import 上游类型包 | `import type UiWorkspace`：d.ts 链引入本包没有的 `dsh-api-remotes` 依赖，且发布 d.ts 多一条未声明类型依赖 |
| D-12 | 探测一次、缓存按服务实例身份失效 | 每次探测（browse 每次多一次 list）；放 React state（切 tab 重挂载即丢，能力沦为渲染状态） |

**收敛依据**：需求 3 条 + Q1–Q7③（含追问轮）见 `decisions.md`；落档分歧点 P-1（三级信号 + 留痕）/ P-2（术语保持「目录」）均经用户裁定（2026-11-08，decisions.md 落档期注记）。

**阶段 1.75 界面演示**：**触发（L2）并经用户确认通过**——C1∧C2∧C3 成立（新对话框为新布局决策），产物 `demos/workspace-folders-picker-l2.html`（18.6KB 四状态屏），自检 = chrome-shared 程序化断言（双视口零溢出、零外链、console 无 error）+ vision 子代理读 5 张截图 A–F 清单全过，确认无改稿轮次（2026-11-08 23:31）。判定与证据详见 `code-design.md` 附录。

**执行环境**：隔离。布局：dsh-plugins（单仓多包，触达 `plugins/multi-root-workspace` 子目录，无独立子 git 仓）→ `/home/xuqinqin/develop/person/dsh-plugins/.worktrees/2026-11-08-workspace-folders-picker` @ `feature/2026-11-08-workspace-folders-picker`（基点 main@8916abe）；装配：`pnpm install`（容器包装、pnpm store 共享）；代码批次提交落 worktree 分支，openspec 工件提交落主仓 main；创建于 2026-11-08。

## 接口与数据形状（摘要）

- `createDirectoryPicker(read: () => DirectoryPickerService | undefined): PickDirectory`；`DirectoryPickOutcome` 五态联合：`{kind:'picked',path}` / `{kind:'cancelled'}` / `{kind:'browse',browsing,listing?}` / `{kind:'unavailable'}` / `{kind:'failed',error}`
- `DirectoryBrowser = { list(path?, signal?): Promise<DirectoryListing>; create(path, name): Promise<string> }`；`DirectoryListing/DirectoryEntry` 为上游结构镜像（`path/home/crumbs/entries/truncated`）
- `DirectoryBrowseError`：本地稳定码 `picker-unreadable | picker-exists | picker-create-failed | picker-failed`（wire 码映射：`directory-picker/unreadable→picker-unreadable` 等）
- `WorkspaceFoldersSectionProps.pickDirectory` 换型为 `PickDirectory`（恒存在，无能力时调用返回 unavailable）；注入面字段名不变
- `DirectoryPickerDialogProps = { open, t, browser?, initialListing?, onConfirm(path): Promise<string|undefined>, onClose }`（返回字符串 = 已本地化失败句，原地显示不关闭）
- `mutate` 返回 `PanelError | undefined`（原 boolean）；`copyPath(path, key)` 泛化；文案 +21 键×2 语（`panel.common*` 3 + `picker.*` 18）；样式新增 `.mrfw-picker*` 族约 10 类（全 `--dsw-*` 令牌）
- 完整签名与逐文件改动见 code-design.md ①③

## 逐任务组要点（对齐 tasks.md）

G1 能力降级模块（`directory-picker.ts` + `index.ts` 装配 + 适配器单测 + 类型对齐）→ G2 文案与样式（locales 21 键 + styles picker 族——**编译与视觉前提，先行**）→ G3 对话框组件（Dialog + 图标 + 替身 + 对话框单测）→ G4 分节改造（分组渲染/动作行/拾取状态机 + panel spec）→ G5 产物断言（react-dom 词 + build 后跑）→ G6 文档（README 3 段 + 架构 §7 + **ADR-0015** + 索引 + commonRoots 参考；注意包内 `docs:check` 的 `absolute-paths` 无豁免）。执行顺序为拓扑序（对应 code-design.md ⑤ 的 TG1→TG4→TG2→TG3→TG5→TG6）。每组验证命令与逐条断言见 code-design.md ⑤ 及其验证矩阵。

## Risks / Trade-offs

- **能力信号非契约承诺**（P-1）：message 正则可能随上游改形失配——三级分类使后果从「功能消失」降为「多一次 list 调用」；上游若修复 details，结构化分支自动接管。
- **结构镜像漂移**（D-11）：上游加字段无害（返回值结构类型容忍）；缺字段由对话框防御性读取兜住。
- **native 分支验证缺口**（A-8）：容器/CI 无 OS 选择框，native 路径只有适配器单测模拟；真机验收只覆盖 browse 分支。
- **新增 `react-dom` 模块词**：tsdown 已外置、shell 已 seed（renderer 同样 require），但产物断言必须同批更新否则门禁红。

## Migration Plan

四包同装、统一版本发布形态不变；无配置迁移（零新增配置键）；`commonRoots` 语义与存储完全不动。旧产物断言（bundle required 数组）在 G5 同批更新。

## Open Questions

- **页面选择框 ↔ 分节寻址不一致**（Q7③，本轮明确不做）：分节按当前会话寻址（ADR-0008），页面选择框只 gate 渲染——需按工作区寻址的宿主契约变更与权威论证，待另立变更。
- 上游 `pickDirectory` 丢弃 code/details（P-1 事实）：可向上游提 issue 建议保留 `rpcError` 或暴露 `capability()`；落地后本插件 ① 分支自动接管、message 兜底可删。
- 通用行禁用控件的隐藏化、`listDirectory` 大目录（maxEntries=1000）的前缀过滤，均记为后续打磨项（A-3）。
