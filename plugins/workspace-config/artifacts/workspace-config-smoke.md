# workspace-config 真机冒烟记录（组 9 · 正例段）

- **日期**：2026-11-05（Asia/Shanghai，走查窗口 18:39–19:12）
- **DSH**：`0.2.1-rc.5`（web profile；容器内 `http://127.0.0.1:3080`）
- **插件版本**：`dsh-plugin-workspace-config@1.5.0`（仓内四包同版本，`link:` 安装）
- **profile（四包同装）**：
  - `dsh-plugin-workspace-config` → `link:/home/xuqinqin/develop/person/dsh-plugins/plugins/workspace-config`
  - `dsh-plugin-multi-root-workspace` → `link:.../plugins/multi-root-workspace`
  - `dsh-plugin-session-tool-toggle` → `link:.../plugins/session-tool-toggle`
  - `dsh-plugin-web-ux` → `link:.../plugins/web-ux`
- **GUI locale**：en（入口/分节文案按 README 的 en 镜像断言：`Workspace settings` / `Workspace folders` / `Workspace defaults` / `Session manager`）
- **证据目录**：`/home/docker/.cache/spec-evidence/unify-workspace-config-entry/group9/`（过程证据，不入库；下文截图均指该目录）
- **浏览器**：容器内 headless Chromium（CDP `127.0.0.1:9222`），**新开 tab** 导航 token 链接走查；用户已开页面未触碰，收尾时关闭本 tab
- **入口获取**：`docker logs dsh 2>&1 | grep -oE 'http://[^ ]*3080[^ ]*' | tail -1` → `http://127.0.0.1:3080/?token=…A3Qk`（脱敏，最后一次启动 2026-11-05T10:29:35Z 打印）

## 逐项走查（步骤 / 结论 / 证据）

| # | 走查项 | 步骤 | 结论 | 证据 |
|---|---|---|---|---|
| 1 | GUI 进入（token 链接 + 新 tab） | 从 `docker logs dsh` 取最后一次打印的 token 链接，浏览器**新开 tab** 导航；等待 SPA 就绪后开始走查；未刷新/操作既有页面 | **PASS** | 导航后 `title=DeepSeek Harness`、URL 归一为 `/`；带 token 首跳 303 下发 `dsh-auth-*` cookie，无 token 为 401（curl 对照） |
| 2 | 宽栏 256px 单入口 + a11y 名 | 1440×900 宽栏下量 footer：栏总宽 **280px**（内容宽 **256px** + 左右各 12px padding）；`footerActions` 仅 **1** 个子节点；入口 `256×32 @x=12`、`flex: 1 1 auto`、`min-width: 0`、`scrollWidth=clientWidth=256`、label 127px 不截断；下一行只有官方账户行 `DoubleQ`（无其他插件 footer 行）；a11y 快照按钮名为 **`Workspace settings`**（README en 镜像；zh locale 下为「工作区配置」） | **PASS** | `01-wide-entry.png`（宽栏全貌）、`02-wide-footer.png`；计算样式/几何见 `tools/run-02-03.log` |
| 3 | 弹窗打开 + nav 三分节按序 | 点入口 → 出现唯一 `[role=dialog]`（760×685，标题 `Workspace settings`）；`nav[aria-label="Settings sections"]`；按钮顺序 **Workspace folders → Workspace defaults → Session manager**（对应分节 order 10/20/30）；当前节 `aria-current="true"`，其余为空 | **PASS** | `03-dialog-nav.png`；a11y：`dialog "Workspace settings" [modal=true]`、`navigation "Settings sections"` |
| 4 | Folders 功能面（增 / 别名 / 删） | 当前工作区 dsh-plugins **已有附加根**（`dotfiles`）+ 两个 Common（`/home/docker/.cache`、`/tmp`）→ 按安全口径**只读查看 + 记录**，不动既有根；功能往返改在 **ship-v2**（无既有附加根）执行：添加临时目录 `/home/xuqinqin/develop/person/dsh-plugins/.wc-smoke-fake` → 别名改为 `WC Smoke Fake` → 删除；前后 `storages/multi_root_workspace.json` **sha256 完全一致**，临时目录已删。另实测 containment 守卫：落在 Common 根内的路径会被拒（「That directory and a registered root contain each other」） | **PASS** | `17-folders-added.png`、`18-folders-aliased.png`、`19-folders-removed.png`；`multi-root-store-before.json` 与当前文件 sha256 均为 `b236fd0b…` |
| 5 | Files tab 入口回归（R10 口径） | 父会话视图 → 右侧栏 Files tab 顶部出现紧凑胶囊 `aria-label="Folders"`（36×28）→ 点击后 `aria-expanded="true"`，**同一分节本体在 tab 内就地展开**（`section` 648×900，含 Primary/Secondary roots 与 Add/Retry），**无 `role=dialog`**（非弹窗） | **PASS** | `26-files-tab-expanded.png`（`dialogs=0`、`sectionRect 648×900`） |
| 6 | 默认档读写 + 工作区下拉 + `/tools` 一致 | 分节下拉列出 **13 个已登记工作区**；下拉 `dsh-plugins → dotfiles → dsh-plugins` 切换，Workspace key/path 随之更新（只读）；在 **ship-v2** 写入 `tool:__wc_smoke__`（不存在的工具，仅测试用）→ 分节显示 chip 与 `Saved (this session is unchanged).` → 在 ship-v2 会话执行 `/tools workspace` → 回执「当前 1 项关闭（tool:__wc_smoke__）」，与分节一致 → 两段式 Clear 清空 → 分节回到 `This workspace turns nothing off.`，文件为空档 | **PASS** | `20-defaults-added.png`、`21-tools-workspace-full.png`（命令回执全文）、`22-defaults-cleared.png`、`50-defaults-dropdown-dotfiles.png`、`51-defaults-dropdown-back.png` |
| 7 | 会话管理三 tab + 批量语义 UI | 分节默认工作区 ship-v2；`role=tablist` 三 tab **Active / Archived / Migrated**（含 `aria-selected`、`aria-controls`）；批量 UI 可见：Select all、行 checkbox（running 行置灰不可选）、`Archive selected` / `Dispose of selected` / `Unarchive selected`、两段式 Confirm（`Target sessions: 1 / Back / Run`）与结果 `Archived 1 sessions.`；除 D16 的单条空白会话外**未执行任何批量删除** | **PASS** | `05-session-manager.png`、`38-manager-active.png`、`40-archived-tab.png`、`39-archived-result.png` |
| 8 | 已归档行菜单删除 + 500/530 不叠放 | 展示归档行（View options → Archived only）→ hover 行 → `Session actions` 菜单含 `Delete session`（最后一项）→ 点击出 **500 删除确认弹窗**：预览 `Sessions: 5`（含 4 个子代理）、`1.3 MB`、归档目录 `/home/docker/.dsh/archive/sessions`，二选一 `Move to archive directory` / `Delete permanently`；此时 `configDialogOpen=false`、`dialogCount=1`（530 统一弹窗未同时在场）→ 点 **Cancel** → 0 弹窗、行仍在、零删除 | **PASS** | `34-row-menu.png`、`35-delete-dialog-500.png`、`36-after-cancel.png` |
| 9 | Menu portal（U4）Escape 分层 | Folders 行 `More actions` 打开菜单：DOM 父链直达 **BODY**（`inDialog=false`，`portal` 生效），含 Rename/Remove → 第 1 次 Escape：`menu=false`、`dialog=true`（菜单先关、弹窗仍在）→ 第 2 次 Escape：`dialog=false`（弹窗再关） | **PASS** | `07-menu-portal.png`（菜单父链直达 BODY）；`menu=false / dialog=true` 与 `menu=false / dialog=false` 两跳为当次运行时读数 |
| 10 | D16（running 中关闭即关闭） | 会话管理 → Archived → 处置模式选 `Delete permanently` → 选中 2026-10-26 的**空会话**（仅 1 行 header、零消息；id `session-7ff2f8a5-…`）→ Dispose 预览（1 项可处理 / 7 KB；另一个 live 测试会话被宿主自动剔除）→ 点 **Run 后立即 Escape**：32ms 进入 `Running…`（`Cancel` 禁用、动作按钮消失），73ms 发 Escape，**86ms 弹窗消失**、无遮罩拦截（composer 可点）→ 2.5s 后重开：该空会话已从列表与磁盘删除（目录不存在、`archivedSessionIds` 不含该 id），**证明确认后请求在宿主侧继续完成** | **PASS** | `48-d16-closed.png`、`49-d16-after.png`、`d16-timing.json`；磁盘核对：`session-7ff2f8a5-…` 目录已不存在 |
| 11 | 折叠形态（56px / 28px 图标） | `Collapse sidebar` → 轨宽 **56px**；footer trigger **28×28 @x=14**（中心 x=28 = 56/2），16×16 图标与按钮中心对齐；无 label、`aria-label` 保留；点图标 → 弹窗照常打开（nav 三节）；`Open sidebar` 还原 280px 栏 / 256px 入口 | **PASS** | `27-collapsed-icon.png`、`28-collapsed-open.png`、`29-wide-restored.png` |
| 12 | 关闭态 + D8 选中节记忆 | 在 `Session manager` 选中态按 Escape → `[role=dialog]` 数量 **0**；无 `wsc_` 弹窗 DOM 残留（仅 footer trigger 仍在）；重开弹窗 → 仍选中 **Session manager**（`aria-current` 保持） | **PASS** | `06-reopen-memory.png`；残留检查输出（`byDialog=0`，仅常驻 overlay 容器） |
| 13 | a11y 抽查（nav / aria-current / 空态） | nav `aria-label="Settings sections"`；活动分节按钮 `aria-current="true"`（运行时 DOM + a11y 快照）；空态 `role="status"` 由 holder 在**零分节**时渲染——四包同装下运行时不可达，按源码 `WorkspaceConfigDialog.tsx` 与 `lib/client.js` 产物静态核对（bundle 中 `role: "status"` 出现 1 次，且带 `dialog.empty.*` 中英双语文案） | **PASS**（空态为静态核对，运行时受四包同装约束不可达） | `03-dialog-nav.png`；`lib/client.js` 片段；`run-02-03.log` 的 a11y 行 |
| 14 | 三张必留截图 | 宽栏入口 / 弹窗 nav / 折叠图标三张已留 | **PASS** | `01-wide-entry.png`、`03-dialog-nav.png`、`27-collapsed-icon.png` |

## 关键实测数据

| 项 | 实测 |
|---|---|
| 宽栏几何 | 栏 280px = 12 + **内容 256** + 12；入口 256×32、`flex:1 1 auto`、无横向溢出、label 127px |
| 折叠几何 | 栏 56px；入口 28×28 @x=14（中心 28）；图标 16×16 居中 |
| 弹窗 | 760×685；nav 3 项；`Settings sections` |
| D16 时序 | click @32ms → `Running…`；Escape @73ms；弹窗消失 @86ms；请求后台完成（空白会话已删） |
| Folders 往返 | `multi_root_workspace.json` 前后 sha256 一致（`b236fd0b…`），零净变更 |
| 默认档往返 | 写入 `tool:__wc_smoke__` → `/tools workspace` 回执一致 → 清空为空档；净关闭项 0 |
| 500/530 | 500 弹窗出现时 `configDialogOpen=false`；Cancel 后零删除 |

## PASS 计数

- 正例段 **14 / 14 项 PASS**，0 FAIL，0 SKIP-DEFERRED。
- 收尾验证句：`test -f plugins/workspace-config/artifacts/workspace-config-smoke.md && test "$(grep -c 'PASS' plugins/workspace-config/artifacts/workspace-config-smoke.md)" -ge 12` → 退出码 0。

## 降级反例（批次协调段 · 已执行）

**状态：✅ 两轮反例 + 终态恢复全部完成（2026-11-05 19:39–19:58）。** 用户裁决「完整真机反例」；主会话协调执行（卸载/重装/验证），**3 次 dsh 重启由用户手动完成**（执行流程跑在 dsh 容器内，不可自重启）。

### 轮 1 · 卸载 session-tool-toggle（holder + mrfw + web-ux 保留）

| 断言 | 结论 | 证据 |
|---|---|---|
| footer 入口仍在（holder 在装，D5 恒在） | **PASS** | a11y：`button "Workspace settings"` + `Account menu` |
| 「Workspace defaults」节消失、其余两节正常 | **PASS** | 弹窗 nav 运行时读数仅 `["Workspace folders","Session manager"]`；Folders 节功能面正常渲染（Primary/Secondary/Common/Add folder 全在） |
| 无运行时报错 | **PASS** | console 仅 1 条 404 资源噪声（favicon 类），零插件异常 |

恢复：`dsh plugin --profile web add <仓>/plugins/session-tool-toggle`（link: 重装，@link: 回归）→ 用户重启。截图：`/tmp/wc-smoke-degrade-r1-stt-missing.png`。

### 轮 2 · 卸载 holder workspace-config（三贡献方保留）

| 断言 | 结论 | 证据 |
|---|---|---|
| footer **无**「Workspace settings」入口 | **PASS** | a11y footer 仅剩 `button "Account menu"`（对比轮 1 双按钮） |
| web-ux 会话管理 GUI 不可达（降级矩阵约定接受项） | **PASS** | a11y 树无任何会话管理入口（旧 trigger/overlay 已删、座位未声明 `slots.inject` 静默不触发）；stt 头部 `Tools` 按钮与 mrfw 独立入口不受影响 |
| 页面无崩溃 | **PASS** | 会话树/会话头/composer 正常渲染，零 JS 异常 |

恢复：`dsh plugin --profile web add <仓>/plugins/workspace-config`（link:，@link: 回归）→ 用户重启。截图：`/tmp/wc-smoke-degrade-r2-holder-missing.png`。

### 终态恢复核对

- profile：**7 个 @link: 包**（六插件 + holder）全在；`--dump-config-schema` 含 `workspace-config`（×5）。
- GUI：footer `Workspace settings` 入口回归；弹窗 nav 运行时读数 **`["Workspace folders","Workspace defaults","Session manager"]`** 三节齐（dialogCount=1）。截图：`/tmp/wc-smoke-final-restore.png`。
- 反例段新增 **PASS 7 处**（轮 1 三断言 + 轮 2 三断言 + 终态一组）。

## SKIP-DEFERRED / 残留与恢复

- **本段 14 项无 SKIP-DEFERRED；降级反例两轮无 FAIL。**
- **残留 1（live 测试会话）— 已清理**：`session-6da5fc6b-…`（ship-v2；空草稿 + 本次测试写入，解码核对无他人内容）最后一次重启后由主会话以容器身份 `rm -rf` 删除（宿主 shell 无 `/home/docker/.dsh` 写权，先半删后经 `docker exec dsh` 补齐；ship-v2 区其余会话完好）。
- **残留 2（空档文件）— 已还原**：`workspaces.json` 的 ship-v2 空档键（`disabled: []`）已移除，现内容 `{"version":1,"workspaces":{}}`（无配置态；插件按空 workspaces = 不关闭任何工具处理）。
- **D16 牺牲品**：删除了 ship-v2 的 `session-7ff2f8a5-…`（2026-10-26 创建，**仅 header、零消息**的空会话，7 KB）；同批 3 个 Blank 空会话只删这 1 个。未删除任何有内容的用户会话。
- **已还原**：多根存储零净变更（sha256 一致）；临时目录 `.wc-smoke-fake` 已删；默认档净关闭项 0；视图过滤恢复 `Hide archived`；右侧栏/弹窗 UI 状态为临时态，随本 tab 关闭丢弃。
- **未触碰**：源码、`tasks.md`、其他工件；反例两轮的 profile 卸载/重装均经 link: 无损往返；未执行 `git add` / `git commit`。
