# Tasks

## 1. 前置验证

- [x] 1.1 在真机 GUI 验证 design D7 假设：空会话首屏执行命令后，`conversation.input.overlay` 实例绑定 `session/create` 产生的新会话 id（可先以最小探针条目 + console 临时观察）；证伪则在 design.md 记录结论并启用 fallback（`shell.overlay` 非模态卡片），后续任务按实际挂载点执行

## 2. 纯逻辑模块

- [x] 2.1 实现主视图可见性投影纯函数（`retainedBy.mainView` 防御解构为计数：缺字段/非数值一律 0），配单测：正常计数、缺 `retainedBy`、非数值、null/undefined 输入
- [x] 2.2 实现命令通知 store（`Map<sessionId, 通知>`：同会话新替旧、成功卡 TTL 过期清除、错误卡不设 TTL 仅手动关闭、手动关闭、事件负载宽松解构——`commandName` 非字符串、`result` 缺 `kind`/`text` 结构、或无文本成功一律丢弃并允许记 warn），配单测覆盖上述全部路径
- [x] 2.3 实现摘要截断纯函数（首行提取 + 超长加 `…`），配单测：多行文本、超长单行、空文本

## 3. 组件与词典

- [x] 3.1 实现 `CommandNoticeCard` 组件与 CSS module：折叠态一行（命令名 + 摘要）、点击展开限高滚动全文（`pre-wrap`）、关闭按钮、错误样式（错误色边框区分）、无通知渲染 `null`
- [x] 3.2 `locales.ts` 新增词条（标题、展开/收起、关闭 aria）zh/en 双语，`locale-parity` 测试通过

## 4. 装配

- [x] 4.1 `client/index.ts` 装配两件事，全部软挂载：`ctx.on("command/executed")` 事件桥接（防御解构后写入通知 store）；`conversation.input.overlay` 卡片条目（`order: 10`，注入通知 store 读取面与可见性源——`ctx.get('sessions')` 渲染期延迟解析 + try/catch）；既有徽章与删除入口行为不变

## 5. 测试补齐

- [x] 5.1 `client-apply.test.ts` 扩展：apply 注册卡片 slot 条目与 `command/executed` 事件监听、词典注入、事件缺席/触发下的行为、既有条目不受影响
- [x] 5.2 组件测试（沿用 RTL 模式与 `test/stubs`）：渲染条件（可见性计数为零才弹）、展开冻结计时/收起恢复、错误卡不自动消失、可见性计数变正（视图挂载）后卡片隐藏、手动关闭、错误样式
- [x] 5.3 `bundle.test.ts` 扩展：产物包含新组件与词条

## 6. 门禁与真机冒烟

- [x] 6.1 `pnpm --filter dsh-plugin-web-ux verify:all` 与 `pnpm dsh:check` 全绿
- [x] 6.2 真机 GUI 冒烟（link 安装后重启）：空会话首屏 `/inventory` 弹卡且可展开全文；已打开会话内执行不弹；`/inventory foo` 错误样式；自动消失与手动关闭；既有徽章/删除入口回归；证据写入 `artifacts/command-feedback-smoke.md`

## 7. 文档

- [x] 7.1 更新 `plugins/web-ux/README.md`（第三个能力：命令结果通知）与根 `README.md` / `AGENTS.md` 插件清单描述
