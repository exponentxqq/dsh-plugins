# 真机冒烟：命令结果通知卡（add-command-result-feedback）

- 日期：2026-11-02
- 环境：dsh 容器（0.2.1-rc.2，`docker restart` 后 link 安装生效）+ 无头 Chrome（chrome-devtools MCP，locale=en-US，故界面文案显示英文——zh/en 词典双语由 `locale-parity` 单测守恒）
- 会话：`session-bedae7c5-9521-490b-b35a-8b414d281885`（空白会话，被宿主复用）

## 结论

任务 1.1（D7 假设）与任务 6.2 全部通过；过程中发现并修正了两个实施问题（见「实施期发现」）。

## 逐项验证

| # | 场景 | 预期 | 实测 |
| --- | --- | --- | --- |
| 1 | D7 假设：空会话首屏执行 `/inventory` | 事件 sessionId 与 composer 浮层座位一致，卡在欢迎视图挂载 | ✅ 事件桥收到 `session-bedae7c5…`，卡片在同一 sessionId 的座位挂载 |
| 2 | 欢迎视图弹卡 | 命令名 + 首行摘要 + 展开入口 + 关闭按钮 | ✅ 截图：`Command succeeded /inventory 会话清单（cwd：…` 摘要截断带省略号 |
| 3 | 卡片形态 | 不透明背景、浮于 composer 上方不遮挡输入区 | ✅ toast 定位（`bottom: calc(100% + 4px)`）+ `--dsw-alias-bg-layer-2` 不透明底 + 官方面板阴影 |
| 4 | 展开全文 | 限高滚动区渲染完整文本 | ✅ `<pre>` 2693 字符全文、`max-height: 240px`、`overflow-y: auto`（截图） |
| 5 | 展开冻结计时（共识④） | 展开期间不到时消失 | ✅ 挂载后远超 10s 仍保留（多轮工具往返后才消失于收起之后） |
| 6 | 成功卡 10s 自动消失 | 未交互 10s 后消失 | ✅ 多次实测：卡片恰在 TTL 后从 DOM 移除 |
| 7 | 错误卡不自动消失（共识⑤） | >10s 仍保留、错误色边框 | ✅ `/tools definitely-not-a-tool-xyz` → `Command failed` 卡，12s 后仍在；边框 `rgb(213, 69, 92)`（截图） |
| 8 | 手动关闭 | 关闭按钮立即移除卡片 | ✅ 成功卡与错误卡均验证 |
| 9 | 会话内执行不打扰 | 已有内容的会话里执行命令不弹卡 | ✅ 6s 观察窗内无 `wux_card`（结果走 transcript flow node） |
| 10 | 既有能力回归 | 徽章照常 | ✅ 状态行 `zai-coding-cn/glm-5.3` 胶囊在位（删除入口未逐一交互，其注册契约由 client-apply 单测覆盖） |
| 11 | 另一命令面走通 | 非清单命令同样弹卡 | ✅ `/tools`（session-tool-toggle）成功卡 |

## 实施期发现（已修正并回归）

1. **可见性判定精化（design 修正②）**：首版实现只看 `retainedBy.mainView > 0`，真机暴露误判——空会话执行命令时宿主创建/复用空白会话并选进主视图，计数为正但 transcript 零内容，卡被压掉（正是要兜底的场景）。修正为合取判定：`mainView > 0` **且** `SessionSnapshot.blank === false`。`blank` 即品牌页驱动标记（`blankBit`：命令不置位、首个提交/轮次清零），与「transcript 有无内容行」严格同构。
2. **构建脚本 css 注入护栏 bug（既有，非本变更引入）**：`build.mjs` 的 css-modules 防重护栏只按包名查询——包内第一个 css 模块注入后，同包其余模块（v1.4.0 起的 `delete.module.css`、本次的 `notice.module.css`）的样式从未被注入。修正为按「包 + 模块哈希」双属性防重，并加 bundle 断言（三个模块各带一个注入器）防回归。修复后删除对话框样式也首次真正生效。

## 边界说明

- **`/inventory foo` 不会产生错误卡**：带参的 `/inventory` 不被宿主命令准入（落为普通文本交给模型），不广播 `command/executed`。spec 的带参报错场景已改用真实可达路径（`/tools` 无法识别的子命令）。冒烟期间误将该文本提交进了 harness 会话「Inventory foo command」（两轮模型回复，约 60K tok）——该会话可随手删除，无其他副作用。
- prompt 型命令的「提交即隐藏」路径（blank 清零）由组件单测覆盖（可翻转的 `useSession` 桩驱动）；真机未单独验证 `/init`（会真实发起模型轮次）。
