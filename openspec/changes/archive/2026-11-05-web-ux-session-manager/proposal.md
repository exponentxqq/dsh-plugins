# Proposal

## Why

DSH Web GUI 的会话处置目前只有「已归档会话行的 "..." 菜单 → 单会话删除」一条路径：会话堆积时逐个点开菜单确认，操作过于繁琐；迁移到归档目录（`$DSH_HOME/archive/sessions`）之后的会话更是彻底失去界面出口——删除与找回都只能停 Host 手工搬目录。需要一个批量、分域（活跃/已归档/已迁移）的会话管理面，把「归档 → 处置 → 归档目录回收」整条生命周期在界面上闭环。

## What Changes

- 新增全局「会话管理」入口：侧栏底部 Settings 旁（`sidebar.footer.action` slot）。用户原定的两个入口位置（视图选项菜单、工作区 "..." 菜单）经实测在 DSH 上游 `0.2.1-rc.5` 无第三方注入口（items 硬编码），收敛轮已裁定换道至此。
- 新增「会话管理」浮层（`shell.overlay`）：顶部工作区选择框 + 「未匹配工作区」伪选项；三个 tab 分域管理所选工作区的会话：
  - **活跃会话**：批量「归档」；
  - **已归档会话**：批量「删除」（物理删除 / 迁移归档二选一）与批量「取消归档」；
  - **已迁移会话**（归档根下）：批量「物理删除」与「恢复」（搬回原位、回到已归档状态）。
- 失败语义分两档：有文件动作的批量操作（删除/恢复）为**预览软失败（被拒清单剔除并明示）+ 执行整单拒绝（零副作用）**；可逆的 registry 操作（批量归档/批量取消归档）为**客户端循环上游单会话调用、逐项报告结果**。
- 宿主 `/web-ux` 通道新增 5 个端点：`preview-delete-batch` / `delete-session-batch` / `list-migrated` / `delete-migrated` / `restore-migrated`；现有单会话两端点与契约一字不动（向后兼容）。
- 「未匹配工作区」伪选项聚合无主条目：tab 2 的孤儿已归档会话（归属工作区已被删除）与 tab 3 的无主已迁移目录（projectKey 匹配不到任何工作区），均有删除/处置出口。
- 单批处置目标上限 500（全选超限截断并提示）。
- 批量删除完全复用现有单删的处置语义（subagent 级联闭包、fork 不牵连、共享附件不清理、归档根配置 `archiveRoot`、软降级契约）；级联并集在宿主一次算清去重。

## Capabilities

### New Capabilities

- `dsh-web-ux-session-manager`: 会话管理面——全局入口、工作区定向、三域（活跃/已归档/已迁移）批量操作、无主条目聚合、批量失败语义与界面实时性要求。处置的底层语义（级联规则、处置模式、归档根配置）沿用 `dsh-web-ux-session-delete` 已有能力，不在本 spec 重复定义。

### Modified Capabilities

（无——`dsh-web-ux-session-delete` 的 9 条 Requirement 均描述单会话入口行为，本次全部保留不动。）

## Impact

- **代码**（本仓 `plugins/web-ux/`，双端）：`src/contract.ts`（端点 2→7 与新形状）、`src/delete-session.ts`（批量分支）、`src/migrated.ts`（新建，已迁移域）、`src/project-key.ts`（新建，双端共享转义镜像）、`src/index.ts`（dispatcher 与端口装配）、`src/client/`（通道客户端扩容 + 入口/浮层/model/store/css/locales 新文件）、`test/`（新增与扩展约 13 个文件）、两个 tsconfig include、`README.md`。上游 DSH 主包只读不改。
- **线上契约**：`/web-ux` 通道新增 5 端点与 2 个失败码（`not-migrated` / `target-exists`）；旧端点请求/响应形状不变。
- **依赖**：`dsh.client.inject` 增补 `dsh-client-ui-sidebar` / `dsh-api-workspace-controller` / `dsh-api-session-controller`；devDeps 对应 +2（均 `0.2.1-rc.5`）。
- **风险**：上游 slot/服务面语义漂移（软降级契约兜底）；批量体积统计与归档目录枚举为磁盘 I/O（上限与异步预览态兜底）；`projectKey` 上游未导出（本地镜像 + 真实数据金表测试钉住）。
