# Proposal

## Why

在 Web GUI 的**空会话**（New Session 欢迎视图）直接执行斜杠命令（如 `/inventory`）时，命令在宿主侧真实执行成功、结果完整落盘，但用户**当场看不到任何反馈**：

- 真机抓包证据：`session/create` → `commands/execute` HTTP 200，RPC 返回 `result.ok=true` 与完整结果文本，命令生命周期事件（`command/run`/`command/done`）正常写入会话日志；
- 但 DSH web 客户端（`dsh-client-ui-commands`）的设计是**命令结果从不回显在输入框**（源码注释 "the composer never echoes it"），只通过事件流渲染成会话 transcript 里的持久 flow node；
- 空会话欢迎视图没有挂载 transcript 容器，事件无处渲染 → 零可见反馈。该行为对**所有命令**成立（含原生命令），不是 `/inventory` 特有；
- 次要问题：即使 transcript 在渲染，命令结果也是折叠态的单行节点，长文本（如 25 个 skill 的清单）不展开几乎不可读，用户容易误以为命令没执行。

这直接伤害了 `/inventory` 这类「执行即查看」命令的可用性——用户第一次在空会话里试用就撞上「无输出」，对命令是否生效产生怀疑（真实发生：用户报告了该问题并要求修复）。

## What Changes

在 **web-ux 插件的浏览器半**新增一层「命令结果可见性反馈」：

- 监听浏览器侧公共事件 `command/executed`（`dsh-session-log-export` 已用同一模式：`ctx.on("command/executed", (sessionId, commandName, result) => …)`），拿到每次命令执行的名称与结果；
- 当**结果在当前视图不可见**（判定：该会话的 conversation 视图未在渲染，即欢迎视图/空会话场景）时，以一张**临时通知卡**（toast 形态，可展开全文）展示命令名 + 结果文本；会话视图挂载后卡片自动隐藏（不分成败）；
- 仅携带文本的结果产生通知（无文本的成功不弹）；成功卡自动消失（展开冻结计时）、错误卡仅手动关闭、均可展开查看全文；
- prompt 型命令与宿主求值型命令统一适用（事件通道无法区分也不必区分——prompt 型提交后模型轮次使会话视图挂载，卡片随即自隐）；
- 全部触点软依赖：事件、slot、locale 任一缺席时静默降级，不影响徽章与删除入口两个既有能力。

不改宿主半、不新增 RPC 通道、不改 `/inventory` 本身——这是纯浏览器侧的展示层增强，对命令执行语义零影响。

## Capabilities

### New Capabilities

- `dsh-web-ux-command-feedback`: Web GUI 中命令执行结果的可见性反馈——在结果无处渲染的视图（空会话首屏）以临时通知卡展示命令名与结果文本，视图内已可见时不打扰。

### Modified Capabilities

（无——徽章与删除入口两个既有能力的需求不变，仅共享插件入口。）
