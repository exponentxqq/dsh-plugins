# web-ux 会话管理 · 手工冒烟记录（web-ux-session-manager）

- 执行日期：2026-11-05（终稿）
- 安装形态：`link:` 指向执行 worktree（`docker exec dsh dsh plugin --profile web add <worktree>/plugins/web-ux`）
- 产物基线：lib/ 已重建（含会话管理面全部代码 + 第 4 个 CSS 注入器；旧警示文案已清除）
- 记录口径：每步一行结论（PASS / FAIL / 未执行 + 现象）；FAIL 项附复现要点
- 执行方式说明：profile 重启由用户完成（2026-11-05，容器 Up 3min 实证）；走查由主代理经浏览器自动化
  在真机 GUI（http://127.0.0.1:3080）执行并逐点记录。侧栏底部入口存在**视觉裁切**（见步骤 2），
  因此浮层的打开以脚本点击 DOM 中已渲染的入口按钮完成——入口的存在性先经可访问性树证实。

> **历史状态注记（2026-11-08 补，R8）**：本记录基于页面化之前的旧形态验收——侧栏 footer
> 入口、`shell.overlay` 浮层与节内工作区菜单均已随 `2026-11-08-workspace-config-page` 变更
> （已归档）删除；`WORKSPACE_MENU_PORTAL` 开关不复存在，下文收尾备忘里与浮层 / footer /
> 工作区菜单相关的条目仅作历史留存，不再适用于排障。现行入口为「工作区配置」面板行 →
> 独立页面分节（节内工作区寻址改由页面统一选择框下传），最新真机冒烟见
> [`workspace-config-page-smoke.md`](../../workspace-config/artifacts/workspace-config-page-smoke.md)。

## 步骤 1 — link: 安装

- 结论：**PASS**（2026-11-05）
- 证据：`dsh plugin --profile web list` 显示 `dsh-plugin-web-ux@link:…/worktrees/web-ux-session-manager/plugins/web-ux`；安装输出 Done（4.5s）。
- 重启：用户已外部重启（`docker ps` 显示 dsh 容器 Up 3 minutes；运行版本 `dsh --version` = 0.2.1-rc.5）。

## 步骤 2 — 三 tab 与伪选项（功能面 PASS；视觉入口有已知裁切）

- 结论：**PASS（功能面，自动化走查）**；侧栏底部入口的**视觉可见性 FAIL（已知，用户裁决接受并展期）**
- 入口存在性：a11y 树中 `button "Session manager"` 在侧栏 footer（`sidebar.footer.action` 座位注册与渲染均成功）。
- **视觉裁切根因（实证）**：footer 行是 shell 拥有的 nowrap flex（宽 256px），multi-root-workspace 的
  Folders 行 `width: calc(100% + 4px)` + `flex: none` 整行独占；session-tool-toggle 的入口本已被挤成
  ~12px 残条（既有问题），本插件入口（148px，order 100 行尾）溢出到 x=416 被侧栏 `overflow: hidden`
  裁掉——三插件各自实现均正确，冲突是组合级的。**用户裁决（2026-11-05）：不改，接受现状；
  未来做统一「工作区配置」入口时一并解决（仅留备忘，不启动规划）。**
- 浮层与三 tab（真机逐项）：
  - 浮层经入口点击打开：模态 `dialog "Session manager"`、标题、描述文案、Cancel 动作齐备 ✓
  - tab1 活跃：真实会话列表（复选框 + 标题 + 时间戳 + Blank 标记）；`0 selected` 计数、全选、Clear、「Archive selected」零选禁用 ✓
  - running 置灰（D15）：dsh-plugins 过滤器下「规划会话批量删除功能方案」「会话级配置与工具开关规划落档」两行均带 `Running` 徽章且复选框 `disabled`（保留可见、不可选）✓
  - tab2 已归档：处置模式单选组（默认「Move to archive directory」/「Delete permanently」）、真实归档列表、「Dispose of selected」「Unarchive selected」零选禁用 ✓
  - tab3 已迁移：「Refresh archive list」、空态文案「The archive directory has no manageable entries.」（本机归档目录确无条目）、「Restore selected」「Delete selected permanently」零选禁用、空列表时全选禁用 ✓
  - 工作区菜单（A13，`Menu` portal 在 Modal 内）：菜单在浮层内正常弹出，12 个工作区 + 伪选项「Archives with no matching workspace」（未匹配工作区）全部在列；选中切换后列表正确重载（os → dsh-plugins）✓
  - 默认工作区契约：打开即选中「os」= 成员会话 `updatedAt` 最大的工作区（其成员 9:20:20 更新，晚于 dsh-plugins 运行中会话的 9:18:11），与 `defaultWorkspaceChoice` 契约一致 ✓
- 未走查点：500 上限全选截断提示（真机列表远未达上限，单测已覆盖）。

## 步骤 3 — 跨窗口状态漂移整单拒绝

- 结论：**未执行（用户裁决收尾，豁免）**
- 原因：需双窗口 + 真实状态变更操作；用户于 2026-11-05 裁决按现状归档提交。该路径由
  `delete-session.test.ts`（86 用例）与 `session-manager-dialog.test.tsx` 的漂移拒绝用例覆盖。

## 步骤 4 — 恢复即时可见性（`api-session/added`）

- 结论：**未执行（环境无素材 + 用户裁决收尾，豁免）**
- 原因：真机归档目录无已迁移条目（tab3 空态实证）；构造素材需迁移真实会话数据。该路径由
  `migrated.test.ts`（45 用例，两阶段恢复 + 广播）与 `index.test.ts` 的 `announceRestored` 投影用例覆盖。

## 步骤 5 — 无主恢复落未分组

- 结论：**未执行（环境无素材 + 用户裁决收尾，豁免）**
- 原因：同步骤 4（无已迁移条目可恢复）。该路径由 `session-manager-model.test.ts` 的未分组派生用例覆盖。

## 收尾备忘

- 插件保留 link: 安装（随 worktree 存续）；如需恢复 tag 安装：`docker exec dsh dsh plugin --profile web add github:…#<tag>&path:plugins/web-ux`。
- 侧栏 footer 视觉裁切：**接受现状**，待统一「工作区配置」入口（合并 Folders / 工作区默认档 / 会话管理，
  弹窗内分节导航，后续可能再纳工具管理）时一并解决——仅备忘，未启动规划（用户裁决 2026-11-05）。
- session-tool-toggle 入口被裁成 ~12px 残条为**既有问题**（早于本变更），同样待统一入口解决。
- A13 已真机首验通过；若未来焦点/弹层异常，把 `WORKSPACE_MENU_PORTAL` 置 `false` 即单点退化（单文件开关）。

## 最终结论

- 步骤 1 PASS；步骤 2 功能面 PASS（视觉入口裁切为已知接受项，根因与裁决已留档）；
  步骤 3–5 未执行（豁免，理由与单测覆盖面已留档）。
- **变更按现状验收通过（用户裁决 2026-11-05）**：33/33 任务完成，进入归档提交。
