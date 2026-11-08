# Tasks

> 执行批次契约：`## N.` 编号即执行顺序，**组间严格串行**；组内任务互不依赖可并行、无同文件写冲突。每任务描述引用 `code-design.md` 触达面清单条目（§1.1 源码 / §1.2 测试 / §1.3 文档，格式「§1.1-<文件名>」）。验证句均为第三方可核对命令或断言。拓扑依据：code-design.md ⑤「TG 依赖与提交切分」（文案/样式是组件的编译与视觉前提，故 G2 先于 G3/G4）。

## 1. 能力降级模块与装配

- [ ] 1.1 新建 §1.1-`src/client/directory-picker.ts`：按 code-design §3.1 实现 `DirectoryPickOutcome` 五态、`DirectoryBrowser` 端口、`DirectoryBrowseError`（本地码映射）与 `createDirectoryPicker(read)`，能力判定按 §3.2 三级信号、缓存按服务实例身份失效；验证：`pnpm --filter dsh-plugin-multi-root-workspace exec vitest run test/client-directory-picker.spec.ts` 退出码 0，且用例覆盖「browse 判定后第二次不再调 pick」「message 失配走探测」「探测拒绝且 capability=native → failed」「read()→undefined → unavailable 不缓存」四条分支
- [ ] 1.2 改 §1.1-`src/client/index.ts`：删除旧四行 `pickDirectory` 闭包，改为 `createDirectoryPicker(() => readService<DirectoryPickerService>(ctx, 'uiWorkspace'))` 装配，注入面与 launcher 同步换型（字段名不变）；验证：`grep -c "createDirectoryPicker" plugins/multi-root-workspace/src/client/index.ts` 命中 ≥1，且 `test/client-panel.spec.tsx` 既有断言 `"declares the services it needs"`（`inject` 仍为 `['slots','locale','connection']`）通过
- [ ] 1.3 改 §1.1-`src/client/WorkspaceFoldersAction.tsx` 类型对齐：`WorkspaceFoldersSectionProps.pickDirectory` 换型为 `PickDirectory`，`addViaPicker` 消费五态结局做最小适配（行为升级留组 4）；验证：`pnpm --filter dsh-plugin-multi-root-workspace typecheck` 退出码 0
- [ ] 1.4 新建 §1.2-`test/client-directory-picker.spec.ts`：假服务注入覆盖能力三态、缓存、错误归一化、abort 透传（用例清单见 code-design TG1 验收）；验证：`pnpm --filter dsh-plugin-multi-root-workspace exec vitest run test/client-directory-picker.spec.ts` 退出码 0 且无跳过用例

## 2. 文案与样式（组件的前提）

- [ ] 2.1 改 §1.1-`src/client/locales.ts`：按 code-design §3.7 一次补齐 21 键 × zh/en（`panel.common/commonHint/commonEmpty` + `picker.*` 18 键），`Translate` 类型迁至本模块并保留旧导出路径；验证：`pnpm --filter dsh-plugin-multi-root-workspace exec vitest run test/locale-parity.spec.ts` 退出码 0
- [ ] 2.2 改 §1.1-`src/client/styles.ts`：新增 `.mrfw-picker*` 族（约 10 类，§3.8）与组说明样式，全部走 `--dsw-*` 令牌、复用 `.mrfw-btn/.mrfw-input/.mrfw-note`；验证：`grep -nE '#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|data-ds-dark-theme' plugins/multi-root-workspace/src/client/styles.ts` 无输出（exit 1）且 `grep -c "mrfw-picker" plugins/multi-root-workspace/src/client/styles.ts` ≥ 10

## 3. 对话框组件

- [ ] 3.1 新建 §1.1-`src/client/DirectoryPickerDialog.tsx`：按 §3.3 props/状态机/行为契约（首帧 Home、面包屑跳转、隐藏开关、截断提示、新建成功导航进入、`onConfirm` 失败句原地显示不关闭、Esc/取消/遮罩不采纳、焦点环与焦点归还、portal 到 body）；验证：`pnpm --filter dsh-plugin-multi-root-workspace exec vitest run test/client-directory-dialog.spec.tsx` 退出码 0
- [ ] 3.2 改 §1.1-`src/compat/client-icons.ts`：新增 `IconClose` / `IconChevronRight` 两字形（沿用 `icon()` 按名探测对）；验证：`pnpm --filter dsh-plugin-multi-root-workspace exec vitest run test/client-icons.spec` 退出码 0
- [ ] 3.3 改 §1.2-`test/stubs/ui-primitives.tsx`：替身补 `IconCloseOutline16` / `IconChevronRightOutline14` 两个导出；验证：`grep -c "IconCloseOutline16\|IconChevronRightOutline14" plugins/multi-root-workspace/test/stubs/ui-primitives.tsx` ≥ 2
- [ ] 3.4 新建 §1.2-`test/client-directory-dialog.spec.tsx`：行为契约逐条断言（首帧 0/1 次 list、过期响应丢弃、新建参数与 exists 错误、取消路径 0 次 onConfirm、焦点归还、`role="dialog"` a11y）；验证：`pnpm --filter dsh-plugin-multi-root-workspace exec vitest run test/client-directory-dialog.spec.tsx` 退出码 0 且用例数 ≥ 12

## 4. 分节分组渲染与动作升级

- [ ] 4.1 改 §1.1-`src/client/WorkspaceFoldersAction.tsx` 行为面：`roots` 按 `source==='common'` 拆两组渲染（通用组标题+常驻说明、move 锚点改按组内数组、动作行移入附属组末尾）、拾取状态机（五态分派 + `picking` 防双击）、`mutate` 返回 `PanelError|undefined`、`copyPath(path,key)` 泛化 + primary 行补复制、拾取主按钮（带文案 primary）+ 手输确认降 outline、对话框挂载与 `onConfirm` 接线；验证：`pnpm --filter dsh-plugin-multi-root-workspace typecheck && pnpm --filter dsh-plugin-multi-root-workspace exec vitest run test/client-panel.spec.tsx` 均退出码 0
- [ ] 4.2 改 §1.2-`test/client-panel.spec.tsx`：harness 的 `uiWorkspace` 替身扩三态（native/browse/unavailable），新增分组四态、动作行归属（`within(section)`）、browse 结局对话确认、unavailable 隐藏入口、primary 复制与无 reveal 等用例；验证：`pnpm --filter dsh-plugin-multi-root-workspace exec vitest run test/client-panel.spec.tsx` 退出码 0，且混合态断言「附属行 DOM 顺序先于通用行」「通用行上移/下移 disabled」均存在

## 5. 产物契约与全量回归

- [ ] 5.1 改 §1.2-`test/client-bundle.spec.ts`：required 词数组两处更新为 `['@deepseek-ai/dsh-client-ui-primitives','react','react-dom','react/jsx-runtime']`，补「对话框只在打开时出现在 DOM」断言；验证：`pnpm --filter dsh-plugin-multi-root-workspace build && pnpm --filter dsh-plugin-multi-root-workspace exec vitest run test/client-bundle.spec.ts` 退出码 0
- [ ] 5.2 全量回归：包级门禁与仓级门禁一次通过；验证：`pnpm --filter dsh-plugin-multi-root-workspace verify:all && pnpm dsh:check` 均退出码 0

## 6. 文档与留痕

- [ ] 6.1 改 §1.3-`README.md`（面板段 / client 结构行 / 已知限制 3 处）与 §1.3-`docs/architecture/multi-root-workspace.md` §7（改写「底部添加目录为仅图标按钮」句、补双模拾取与两组呈现、对话框归属与 portal 事实）；验证：`pnpm --filter dsh-plugin-multi-root-workspace docs:check` 退出码 0
- [ ] 6.2 新建 §1.3-`docs/decisions/ADR-0015-in-app-directory-picker.md`（七节骨架；Context 必须留痕 P-1 实测事实「pickDirectory 只抛 message」；Decision 对齐 code-design D-01/D-03/D-05；**不得出现绝对路径**）并改 §1.3-`docs/decisions/README.md` 索引追加一行；验证：`pnpm --filter dsh-plugin-multi-root-workspace docs:check` 退出码 0（`adr-names` 校验文件名格式）
- [ ] 6.3 改 §1.3-`docs/reference/common-additional-roots.md`：面板呈现段补一句「通用根单独成组、组说明取自配置」并相对路径链 ADR-0015；验证：`pnpm docs:check`（根仓递归）退出码 0
- [ ] 6.4 真机装载冒烟（browse 分支）：link: 装入 profile 后页面实测拾取链路；验证：`docker exec dsh dsh plugin --profile web add /home/xuqinqin/develop/person/dsh-plugins/plugins/multi-root-workspace` 成功且 `docker exec dsh dsh --profile web --dump-config` 退出码 0，浏览器 Network 断言 `directoryPicker.pick` 失败 → `directoryPicker.list` 成功 → `/multi-root-workspace` 通道 `add` 成功，DOM 出现 `role="dialog"`；native 分支为验证缺口（A-8），在 tasks 附录留痕
