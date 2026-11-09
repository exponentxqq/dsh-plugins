# Tasks

> 执行批次契约：`## N.` 编号即执行顺序，**组间严格串行**；组内任务互不依赖可并行、无同文件写冲突。每任务描述引用 `code-design.md` 触达面清单条目（§1.1 源码 / §1.2 测试 / §1.3 文档，格式「§1.1-<文件名>」）。验证句均为第三方可核对命令或断言。拓扑依据：code-design.md ⑤「TG 依赖与提交切分」（文案/样式是组件的编译与视觉前提，故 G2 先于 G3/G4）。

## 1. 能力降级模块与装配

- [x] 1.1 新建 §1.1-`src/client/directory-picker.ts`：按 code-design §3.1 实现 `DirectoryPickOutcome` 五态、`DirectoryBrowser` 端口、`DirectoryBrowseError`（本地码映射）与 `createDirectoryPicker(read)`，能力判定按 §3.2 三级信号、缓存按服务实例身份失效；验证：`pnpm --filter dsh-plugin-multi-root-workspace exec vitest run test/client-directory-picker.spec.ts` 退出码 0，且用例覆盖「browse 判定后第二次不再调 pick」「message 失配走探测」「探测拒绝且 capability=native → failed」「read()→undefined → unavailable 不缓存」四条分支
- [x] 1.2 改 §1.1-`src/client/index.ts`：删除旧四行 `pickDirectory` 闭包，改为 `createDirectoryPicker(() => readService<DirectoryPickerService>(ctx, 'uiWorkspace'))` 装配，注入面与 launcher 同步换型（字段名不变）；验证：`grep -c "createDirectoryPicker" plugins/multi-root-workspace/src/client/index.ts` 命中 ≥1，且 `test/client-panel.spec.tsx` 既有断言 `"declares the services it needs"`（`inject` 仍为 `['slots','locale','connection']`）通过
- [x] 1.3 改 §1.1-`src/client/WorkspaceFoldersAction.tsx` 类型对齐：`WorkspaceFoldersSectionProps.pickDirectory` 换型为 `PickDirectory`，`addViaPicker` 消费五态结局做最小适配（行为升级留组 4）；验证：`pnpm --filter dsh-plugin-multi-root-workspace typecheck` 退出码 0
- [x] 1.4 新建 §1.2-`test/client-directory-picker.spec.ts`：假服务注入覆盖能力三态、缓存、错误归一化、abort 透传（用例清单见 code-design TG1 验收）；验证：`pnpm --filter dsh-plugin-multi-root-workspace exec vitest run test/client-directory-picker.spec.ts` 退出码 0 且无跳过用例

## 2. 文案与样式（组件的前提）

- [x] 2.1 改 §1.1-`src/client/locales.ts`：按 code-design §3.7 一次补齐 21 键 × zh/en（`panel.common/commonHint/commonEmpty` + `picker.*` 18 键），`Translate` 类型迁至本模块并保留旧导出路径；验证：`pnpm --filter dsh-plugin-multi-root-workspace exec vitest run test/locale-parity.spec.ts` 退出码 0
- [x] 2.2 改 §1.1-`src/client/styles.ts`：新增 `.mrfw-picker*` 族（约 10 类，§3.8）与组说明样式，全部走 `--dsw-*` 令牌、复用 `.mrfw-btn/.mrfw-input/.mrfw-note`；验证：`grep -nE '#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|data-ds-dark-theme' plugins/multi-root-workspace/src/client/styles.ts` 无输出（exit 1）且 `grep -c "mrfw-picker" plugins/multi-root-workspace/src/client/styles.ts` ≥ 10

## 3. 对话框组件

- [x] 3.1 新建 §1.1-`src/client/DirectoryPickerDialog.tsx`：按 §3.3 props/状态机/行为契约（首帧 Home、面包屑跳转、隐藏开关、截断提示、新建成功导航进入、`onConfirm` 失败句原地显示不关闭、Esc/取消/遮罩不采纳、焦点环与焦点归还、portal 到 body）；验证：`pnpm --filter dsh-plugin-multi-root-workspace exec vitest run test/client-directory-dialog.spec.tsx` 退出码 0
- [x] 3.2 改 §1.1-`src/compat/client-icons.ts`：新增 `IconClose` / `IconChevronRight` 两字形（沿用 `icon()` 按名探测对）；验证：`pnpm --filter dsh-plugin-multi-root-workspace exec vitest run test/client-icons.spec` 退出码 0
- [x] 3.3 改 §1.2-`test/stubs/ui-primitives.tsx`：替身补 `IconCloseOutline16` / `IconChevronRightOutline14` 两个导出；验证：`grep -c "IconCloseOutline16\|IconChevronRightOutline14" plugins/multi-root-workspace/test/stubs/ui-primitives.tsx` ≥ 2
- [x] 3.4 新建 §1.2-`test/client-directory-dialog.spec.tsx`：行为契约逐条断言（首帧 0/1 次 list、过期响应丢弃、新建参数与 exists 错误、取消路径 0 次 onConfirm、焦点归还、`role="dialog"` a11y）；验证：`pnpm --filter dsh-plugin-multi-root-workspace exec vitest run test/client-directory-dialog.spec.tsx` 退出码 0 且用例数 ≥ 12

## 4. 分节分组渲染与动作升级

- [x] 4.1 改 §1.1-`src/client/WorkspaceFoldersAction.tsx` 行为面：`roots` 按 `source==='common'` 拆两组渲染（通用组标题+常驻说明、move 锚点改按组内数组、动作行移入附属组末尾）、拾取状态机（五态分派 + `picking` 防双击）、`mutate` 返回 `PanelError|undefined`、`copyPath(path,key)` 泛化 + primary 行补复制、拾取主按钮（带文案 primary）+ 手输确认降 outline、对话框挂载与 `onConfirm` 接线；验证：`pnpm --filter dsh-plugin-multi-root-workspace typecheck && pnpm --filter dsh-plugin-multi-root-workspace exec vitest run test/client-panel.spec.tsx` 均退出码 0
- [x] 4.2 改 §1.2-`test/client-panel.spec.tsx`：harness 的 `uiWorkspace` 替身扩三态（native/browse/unavailable），新增分组四态、动作行归属（`within(section)`）、browse 结局对话确认、unavailable 隐藏入口、primary 复制与无 reveal 等用例；验证：`pnpm --filter dsh-plugin-multi-root-workspace exec vitest run test/client-panel.spec.tsx` 退出码 0，且混合态断言「附属行 DOM 顺序先于通用行」「通用行上移/下移 disabled」均存在

## 5. 产物契约与全量回归

- [x] 5.1 改 §1.2-`test/client-bundle.spec.ts`：required 词数组两处更新为 `['@deepseek-ai/dsh-client-ui-primitives','react','react-dom','react/jsx-runtime']`，补「对话框只在打开时出现在 DOM」断言；验证：`pnpm --filter dsh-plugin-multi-root-workspace build && pnpm --filter dsh-plugin-multi-root-workspace exec vitest run test/client-bundle.spec.ts` 退出码 0
- [x] 5.2 全量回归：包级门禁与仓级门禁一次通过；验证：`pnpm --filter dsh-plugin-multi-root-workspace verify:all && pnpm dsh:check` 均退出码 0

## 6. 文档与留痕

- [x] 6.1 改 §1.3-`README.md`（面板段 / client 结构行 / 已知限制 3 处）与 §1.3-`docs/architecture/multi-root-workspace.md` §7（改写「底部添加目录为仅图标按钮」句、补双模拾取与两组呈现、对话框归属与 portal 事实）；验证：`pnpm --filter dsh-plugin-multi-root-workspace docs:check` 退出码 0
- [x] 6.2 新建 §1.3-`docs/decisions/ADR-0015-in-app-directory-picker.md`（七节骨架；Context 必须留痕 P-1 实测事实「pickDirectory 只抛 message」；Decision 对齐 code-design D-01/D-03/D-05；**不得出现绝对路径**）并改 §1.3-`docs/decisions/README.md` 索引追加一行；验证：`pnpm --filter dsh-plugin-multi-root-workspace docs:check` 退出码 0（`adr-names` 校验文件名格式）
- [x] 6.3 改 §1.3-`docs/reference/common-additional-roots.md`：面板呈现段补一句「通用根单独成组、组说明取自配置」并相对路径链 ADR-0015；验证：`pnpm docs:check`（根仓递归）退出码 0
- [x] 6.4 真机装载冒烟（browse 分支）：link: 装入 profile 后页面实测拾取链路；验证：`docker exec dsh dsh plugin --profile web add /home/xuqinqin/develop/person/dsh-plugins/plugins/multi-root-workspace` 成功且 `docker exec dsh dsh --profile web --dump-config` 退出码 0，浏览器 Network 断言 `directoryPicker.pick` 失败 → `directoryPicker.list` 成功 → `/multi-root-workspace` 通道 `add` 成功，DOM 出现 `role="dialog"`；native 分支为验证缺口（A-8），在 tasks 附录留痕

## 执行期留痕（附录）

- **R2（2026-11-09，组 3，用户裁定）multi-root 的 `package.json` 允许为类型面补 `@types/*` devDependency（catalog:）**：任务 3.1 对话框 portal（D-10）`import { createPortal } from 'react-dom'` 需要类型，包内缺 `@types/react-dom` 致 typecheck TS7016；用户裁定加 `"@types/react-dom": "catalog:"` 一行（依据：同仓 `plugins/workspace-config` 与 `tooling/test-kit` 均有同款先例；只影响类型检查、不进产物、不改发布面）。原触达面声明「package.json 不新增行、不新增依赖」据此修订为「除类型面 `@types/*` 外不新增行、不新增运行时依赖」（code-design §1.1 已同步注记）。连锁面：任务 4.1 / 5.2 的 typecheck 依赖本修复；后续变更触达面声明凡涉 portal/react-dom 应预列类型包。
- **R1（2026-11-09，组 1）测试 fixture 构造 DSH wire 错误的写法纪律**：必须用 `Object.assign(new Error('<message>'), { rpcError: { code, details? } })`（或标识符承载后 throw），不得 `throw { rpcError: … }` 对象字面量——oxlint `no-throw-literal` 拒绝（任务 1.4 spec 初稿实测 3 处红）；fixture 变量「`let` 无初始化声明 + 闭包先读 + 后续重赋值」须显式 `= undefined` 初始化，规避 oxlint `prefer-const` 误报（改 `const` 会破坏用例语义，实测 1 处）。依据：任务 1.4 修复回执。适用范围：本包 `test/` 全部 spec。连锁面：任务 3.4（dialog spec）与 4.2（panel spec 三态替身）写作按本纪律构造 wire 错误；无既有工件需回改。上游 rejection 真实形状 = Error 子类实例（`message` 在顶层）+ `rpcError` 载体（wire 码与 `details` 在载体上），fixture 应按此形状构造。

### TG6 组段终形态化（2026-11-09，组 6 核对通过）

**执行期终形态（2026-11-09，lead 亲做——原派 4 个组 6 子代理因上下文压缩丢失运行记录，回执未到、文件系统核查全部未落痕，由 lead 降级补做并在呈证披露）**：验收全绿——插件级 `docs:check` exit 0（`adr-names` / `absolute-paths` / `markdown-links` 全 PASS）、根仓递归 `docs:check` exit 0（0 errors）。落实事实：① 6.1 README 三处（面板段改自适应双模拾取 + 两组呈现 + 主行仅复制；client 结构行补 `directory-picker` / `DirectoryPickerDialog` 两模块；已知限制补真机集成断点条目）与架构文档 §7 Client 半部段改写（带文案主按钮、三级信号降级、对话框自绘 portal 到 `document.body` 与 ADR-0013 拾取浮层边界、分组两组渲染）；② 6.2 ADR-0015 七节骨架落地（Status/Date/Context/Decision/Alternatives/Consequences/Related），Context 留痕 P-1（「包名+文件+符号」表述，零绝对路径）并如实记录真机集成断点；decisions/README.md 索引追加一行；③ 6.3 commonRoots 参考补「面板单独成组」条目并相对链 ADR-0015；④ 根仓 docs:check 首跑暴露 worktree openspec 旧快照中 code-design 示例占位链接 2 处断链（主仓工件已修、worktree 副本滞后）——按主仓文本对齐修复后 exit 0（archive/ 归档档案权衡的 5 条 WARNING 为基点既有、不计入 fail）。**6.4 装载与页面实测（lead 经 chrome MCP 执行，用户裁定 link 安装 + 自测）**：装载冒烟 add（link: 指向 worktree 路径——任务字面路径为主仓，此为隔离要求的已知偏差）成功（pnpm install 6.5s，`Packages: +3 -10`）且 `--dump-config` exit 0；profile 于 10:28 由用户重启，新代码确认加载（boot graph 聚合 bundle 含 `dsh-plugin-multi-root-workspace/client.js`）。页面实测达成：分节两组渲染新形态上屏（附属/通用两组、主行仅 Copy path、单行组 move 锚点 disabled、组尾行 Move up enabled / Move down disabled 的组内动态语义）；Files tab `Folders` 紧凑入口就地展开同一分节；「添加目录」打开自绘对话框（`role="dialog"` 上屏、portal 生效、Close/Cancel/Use this folder 齐备）。**Network 断言三取二**：`directoryPicker.pick` 失败 ✓（结构化拒绝，`details.capability: "browse"` 正确引导）；`/multi-root-workspace` 通道 `add` 成功 ✓（手输路径探针 `/home/docker/mrfw-smoke-2` 注册成功——会话 additional roots 实时出现该根为铁证；互包含错误路径探测返回结构化文案且手输框保留，Remove 链路同样实时生效）；**`directoryPicker.list` 成功未达成**——host 端点手动 wire-level 探活完全健康（`args:{}` 返回完整 home listing），但浏览器侧 `list` 调用在**上游 client 集成面**中断、从未发出网络请求（fetch 嗅探三轮对话框仅 `directoryPicker/pick`，无任何 list 形态请求），与 pick 无参可走、list 带 cancellation 参数的特征吻合；该断点不在本插件代码路径内（本插件为 `uiWorkspace` 服务的纯消费方，调用签名与上游一致），上游修复后三级降级链自动恢复。已知限制（README）、ADR-0015 Context/Consequences 已如实留痕。**A-8 留痕（native 分支验证缺口）**：容器 headless 无 OS 选择框，`directoryPicker/pick` 在真机永远走「capability=browse 拒绝」路径，native 成功路径真机不可覆盖——由适配器 spec 的 pick 成功分支（`test/client-directory-picker.spec.ts`：pick 成功 → `picked`、`list` 调用 0 次）单测模拟覆盖，真机缺口的弥合依赖桌面部署的人工验证。

### 沉淀回流清单（spec-apply §6）

执行期沉淀到本附录的规则与事实（供后续变更与 workflow 层复用）：**R1**（wire 错误 fixture 纪律，组 1）、**R2**（`@types/*` 类型面 devDependency 豁免，组 3，用户裁定）、**R3**（真机冒烟的分层证据方法：wire-level 手动探活区分 host 健康与 client 集成断点 + 运行时上下文 additional roots 变化作为注册生效铁证 + React 受控组件按钮的「原生 `.click()` 绕过 MCP 合成点击时序」手法，组 6）。无其他 workflow-repo 层改动需回流：`@types/react-dom` 为包内 devDep（随代码提交）、`pnpm-lock.yaml` 同步更新（随代码提交）、组 6 文档均为包内文档（随代码提交），主仓工件（tasks.md / code-design.md / design.md）的更新即本仓沉淀本体。
