# decisions.md — 工作区配置改为独立页面（阶段 1.5 收敛留痕）

> 编排：串行单线。输入：`explore.md` 待决节 + 探索期事实。
> 方法：grill-me 设计树分轮提问（两轮 + 一次重问，共 10 项决策）。

## 设计树总览

```
根：工作区配置 弹窗 → 独立页面
├─ D1 旧入口去留 ─────────── Q1 ✅ 完全移除
├─ D2 页面骨架 ───────────── 需求定死：参照插件页（page/pageBar/pageTabs/tabpanel）
├─ D3 契约传递机制 ────────── Q2 ✅ owner 份额扩展
│   ├─ D3a close 处置 ─────── Q7 ✅ 删除（重问后裁定 B）
│   └─ D3b unassigned 触达 ── Q8 ✅ 选择框保留未分配项
├─ D4 tab 切换行为 ────────── Q3 ✅ 沿用切换即卸载
├─ D5 公共组件 ────────────── Q4 ✅ 不提取，留在插件包内
├─ D6 面板参数 ────────────── Q5/Q6 ✅ id=workspace-config, order=20, 文案沿用
├─ D7 进入记忆 ────────────── Q9 ✅ 接受重置（宿主 keyed 无保活为事实前提）
└─ D8 默认工作区策略 ──────── Q10 ✅ 最近使用 > 当前会话 > 第一项
```

## 第一轮问答（5 问，全部按推荐接受）

| # | 问题 | 答复 | 依据/影响 |
|---|---|---|---|
| Q1 | 旧弹窗与 footer 入口去留 | **完全移除，页面唯一入口** | 删 Trigger/Dialog/open-store/shell.overlay 注册；旧 spec「footer 单入口」requirement 整条改写为「侧栏面板入口」；未装 holder 时三贡献方 GUI 不可达的约定沿用 |
| Q2 | 工作区选择值传递机制 | **owner 份额扩展** | 与 `renderSlot(seat, ownerProps, { only })` 同构；类型进 contracts；时序简单（选择变化 → 重渲染分节） |
| Q3 | tab 切换行为 | **沿用切换即卸载（D8 语义）** | 保留「开页面不齐打三份 RPC」取舍；页面级工作区选择跨 tab 保留；分节未保存草稿切 tab 丢弃与现状一致 |
| Q4 | 公共组件提取 | **不提取，留在插件包内** | 唯一消费者是 workspace-config；AR7 四包清单不动；留演进注记（第二个页面插件出现再提取） |
| Q5+Q6 | 面板 id/文案/位次 | **id=workspace-config, order=20, 文案沿用「工作区配置/Workspace settings」** | 官方面板 plugins=0、schedules=10；20 紧随其后不插队官方位 |

## 第二轮问答（4 问：3 项按推荐 + 1 项重问）

| # | 问题 | 答复 | 依据/影响 |
|---|---|---|---|
| Q7 | close 处置 | **B：删除 close（重问后裁定）** | 首轮用户要求详细说明+按最优架构重荐；补充事实（web-ux 5 处消费 close、A/B 对照、导航权归壳论证）后裁定 B：owner 份额收敛为纯数据 `{ workspace }`；web-ux 按钮改流程内语义（select 阶段「取消」删除、done 阶段「关闭」改「完成」重置回 select、running 禁用态不变） |
| Q8 | 未分配会话触达 | **选择框保留未分配项** | choices = 真实工作区 + 「未分配」特殊项（排最后）；stt/multi-root 对该值按「无有效目标」空态处理 |
| Q9 | 重进页面记忆 | **接受重置** | 事实：宿主 keyed 渲染无保活（renderer 零 keepMounted），切走即卸载；旧 spec「重开记忆上次分节」条款随弹窗改写 |
| Q10 | 默认工作区策略 | **最近使用 > 当前会话 > 第一项** | 合并 web-ux defaultWorkspaceChoice（最近使用）与 stt 当前会话两套既有默认逻辑 |

## 收敛期自行查证的事实（未转提问）

| 事实 | 结论 | 来源 |
|---|---|---|
| main 面板切走是否保活 | **切走即卸载、切回重挂**（`renderSlot('main', {}, { entryKey })`，renderer 无 keepMounted） | dsh-client-ui-layout / dsh-client-ui-renderer client.js |
| web-ux 是否消费 close | **5 处消费**（批量操作流程取消/关闭按钮，D16 关闭语义） | SessionManagerDialog.tsx:815/839/842/847 |
| 官方面板 order 参考值 | plugins=0（PANEL_ID "plugins"）、schedules=10（PANEL_ID "schedules"） | 两包 client.js |

## 落档期遗留小项（并入阶段 2 分歧点提问）

- 变更名确认：建议 `2026-11-08-workspace-config-page`（仓内日期前缀惯例）。
- spec id 去留：建议保留 `dsh-workspace-config-entry`（能力本质未变，delta 改写 requirements），不改 id。

## 执行期验证点（非用户决策，写入 tasks 验证句）

- keyed 座位注册是否强制携带 store（插件页带 navigation store，本页预期不需要）。
- owner 份额变化后旧版贡献方混装行为（本仓统一版本发布，理论无窗口；spec 降级条款写清）。
