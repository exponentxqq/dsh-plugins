# decisions.md — 「工作区文件夹」分节优化 · 阶段 1.5 收敛留痕（串行）

## 设计树总览

```
根：「工作区文件夹」分节优化
├─ D1 选择器策略 ─────────── Q1 ✔ A 能力自适应双模（pick → browse 降级）
│   ├─ D1a 对话框形态 ─────── Q2 ✔ a 单栏列表 + 面包屑（轻量）
│   │   ├─ D1a-1 起点 ────── Q3 ✔ a Host home（上游缺省 + Home 锚点）
│   │   └─ D1a-2 新建文件夹 ─ Q4 ✔ 带（createDirectory 原语现成）
│   └─ D1d 手动输入去留 ───── Q5 ✔ 保留为兜底（布局弱化为次要入口）
├─ D2 分组呈现 ────────────── 需求② 纯客户端拆组（无争议，探索期即推荐）
│   └─ D2a 通用组空态 ─────── Q6 ✔ a 常驻：组标题 + 指向 commonRoots 配置的说明
└─ D3 优化点范围 ──────────── Q7 ✔ ① +按钮升级为带文案主动作；② primary 仅补「复制路径」
    └─ D3a 寻址不一致 ─────── Q7③ ✔ a 本轮完全不做，落档记录「已知不一致、另立变更」
```

## 第一轮问答（5 问，全部按推荐接受）

| 问 | 裁定 | 依据摘要 |
| --- | --- | --- |
| Q1 选择器策略 | **A 能力自适应双模**：先试 `pickDirectory()`，失败且错误表明 browse 表面（`details.capability === 'browse'`，message 兜底）→ 降级打开自建应用内对话框 | 上游能力互斥（native=只有 pick / browse=只有 list+createDirectory）；上游无 client 探测 API，错误降级是唯一信号；两表面都可用，与上游「native 优先、browse 兜底」意图一致；auto 未知 kind 按官方约定隐藏拾取入口 |
| Q2 对话框形态 | **a 单栏列表 + 面包屑**：面包屑（crumbs 逐级跳转 + Home 锚点）+ 一级子目录列表（hidden 默认藏、开关揭开、truncated 提示）+ 确认按钮采纳当前路径 | 轻量先行，`mrfw-*` 令牌体系一致，测试面小；Miller 双栏体量大，可后续迭代 |
| Q5 手动输入 | **保留为兜底**，布局弱化为次要入口 | 浏览不可达路径 / 高级用户直输场景仍在；需求原文「而不是仅允许」指向并存 |
| Q6 通用组空态 | **常驻显示**：组标题 + 说明文案指向 commonRoots 配置（cordis.patch.yml） | 有配置引导价值；附属组空态沿用既有 `panel.empty`/`emptyHint` |
| Q7 优化点范围 | **① + 按钮升级**（icon-only → 带文案主动作，失败给能力语义提示）+ **② primary 仅补「复制路径」**（纯 client，`state.view.primaryRoot` + 剪贴板）；primary「reveal」不纳入（面板 `reveal` endpoint `requireEntry` 只寻址登记根，补齐需宿主改动） | ①② 低成本高感知；reveal 宿主改动不值当 |

### Q7③ 追问（用户要求详解后裁定）

| 问 | 裁定 | 依据摘要 |
| --- | --- | --- |
| Q7③ 寻址不一致 | **a 本轮完全不做**，proposal 非目标与已知限制中记录，另立变更 | 详解后用户确认：改动触 ADR-0008「不信任客户端路径」安全模型；附属根运行时生效面 per-session（改存储≠改当前沙箱，生效时机需设计）；宿主契约+ADR+安全测试体量独立，与本次客户端为主的优化不同级 |

## 第二轮问答（2 问，全部按推荐接受）

| 问 | 裁定 | 依据摘要 |
| --- | --- | --- |
| Q3 对话框起点 | **a Host home**（`listDirectory()` 缺省） | 零参数、Home 锚点、与上游 browse 对话框锚定一致；主根父目录/主根/记住上次各有缺陷（深层路径 / equals-primary 碰壁 / 需存储） |
| Q4 新建文件夹 | **带**：对话框内新建入口（按钮 + 行内输入），`createDirectory(path, name)` 原语现成 | `directory-exists`/`directory-create-failed` 错误码可归入面板错误文案体系；避免用户离场去终端 mkdir |

## 收敛期自行查证的事实（未转提问）

1. **primary reveal 不可零成本补齐**：面板 `reveal` endpoint 用 `requireEntry` + `resolveRootRef`，只寻址登记的附属根（primary 不在 registry）——故 Q7② 只补「复制路径」。
2. **browse 的 list/createDirectory 无 remoteAccess 门**：`uiWorkspace.listDirectory/createDirectory` 直接委托 `directoryPicker`，`whenAccess` 是按 workspace 的资源通知 API 与 list 无关；remoteAccess 门只在 native `pick` 端点的 slot 注册（owner 恒有权）。实测 `directoryPicker` RPC 端点对当前连接可达。
3. **能力信号非契约承诺**：`details.capability` 未见于上游 d.ts 类型，降级逻辑须以 message 兜底容错（写为设计约束与测试点）。

## 执行期验证点（非用户决策，写入 tasks 验证句）

- pick 失败降级：mock `pickDirectory` 抛 `directory-picker/unavailable`（details.capability='browse'）→ 对话框打开；message 形态变化时兜底仍降级或按未知能力隐藏入口（不崩、不静默成功）。
- 对话框：crumbs 跳转 / hidden 开关 / truncated 提示 / 新建（含 `directory-exists`）/ 取消不改列表 / 确认走 `add` 全套验证词汇。
- 分组：纯附属 / 纯通用 / 混合 / 双空四态渲染 + 通用组操作集禁用不变（host `common-root` 双保险仍生效）。
- primary「复制路径」+ `+` 带文案按钮 + 手动输入保留。

## 落档期注记（阶段 2 · 2026-11-08）

- **P-1 事实修正**：D1 裁定原文「错误详情 `details.capability` 是唯一的能力信号（已实测存在）」——实测所见 details.capability 位于 **wire 响应体**；经 `uiWorkspace.pickDirectory()` 抛出后仅剩 `new Error(message)`（上游 `dsh-client-ui-workspace/lib/client.js:1562-1566`，code/details 被丢弃）。**D1「pick 失败 → 降级」结论不变**，信号取得路径修正为三级分类（结构化 details[仅 list/create 的 rpcError 可取] → message 正则 → listDirectory 结构探测），详见 code-design.md D-01 与 P-1；用户已裁定采纳方案 a（2026-11-08，落档分歧点提问）。
- **P-2 术语裁定**：分组文案保持「目录」（`panel.common` = 「通用工作目录」），避免与宿主 Workspace 概念撞名；需求原文「附属/通用工作区」按此映射理解（2026-11-08，用户裁定方案 a）。
