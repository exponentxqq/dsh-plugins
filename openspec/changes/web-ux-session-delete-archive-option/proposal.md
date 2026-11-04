# Proposal

## Why

「删除已归档会话」能力目前只有物理删除一种处置：确认即不可逆销毁。部分会话用户并不想
永远失去，只是不想让它们继续留在侧栏与 `~/.dsh/sessions/` 里——现状迫使他们在「留着
无限累积」与「永久删除」之间二选一。给删除入口补一条**迁移归档**出路（把会话日志目录
搬到归档目录、界面与工作区记录同步清掉、数据保留可手工找回），让不可逆销毁成为主动
选择而非唯一选项。

## What Changes

- 确认对话框内新增**处置模式单选**（「移动到归档目录」/「永久删除」），**默认选中迁移
  归档**（不可逆操作必须主动选择）；模式切换即时改变警示文案、体积表述、确认按钮语义
  与结果文案；预览信息与模式无关，切换不重发预览。
- 新增**迁移归档模式**：把目标会话（含级联 subagent 后代、不含 fork）的日志目录
  `~/.dsh/sessions/<项目目录>/<会话id>/` 整体移动到归档根下并**保留项目目录层级**；
  投影缓存直接删除；工作区引用清理与移除事件广播与物理删除完全同构。
- 归档根**可通过插件配置键 `archiveRoot` 指定**（绝对路径或 `~/` 开头），缺省
  `$DSH_HOME/archive/sessions`（即 `~/.dsh/archive/sessions`）；预览响应携带宿主解析
  后的归档根绝对路径供界面展示。
- 迁移失败语义与删除同构：rename 优先，跨设备（EXDEV）回退递归复制后删源；目标同名
  目录绝不覆盖、该项失败记 warning 继续；新增稳定失败码 `archive-unavailable`（归档
  根不可用，发生在任何写动作之前，未做任何改动）。
- 线上契约演进：两端点请求体增加**必填** `mode` 字段（`delete` / `archive`，缺省无、
  缺失即 `bad-request`——防旧标签页在新宿主上静默物理删除）；预览响应增加 `archiveRoot`。
- **BREAKING**（对内契约）：`/web-ux` 通道请求体新增必填字段，旧客户端（v1.4.0 已打开
  的标签页）预览即失败并提示刷新，不会发生无模式删除。

## Capabilities

### New Capabilities

（无——本变更全部落回既有能力边界。）

### Modified Capabilities

- `dsh-web-ux-session-delete`: 从「删除=物理销毁」升级为「删除入口下的两种处置模式」。
  新增 requirement：**处置模式选择**（对话框单选、默认迁移、模式相关文案与确认语义）、
  **迁移归档的执行语义**（日志目录移动保留项目层级、投影缓存删除、级联与引用清理同构）、
  **归档目录可配置**（`archiveRoot` 配置键、缺省值、预览回显解析结果）、**迁移失败语义**
  （rename→EXDEV 回退、同名不覆盖逐条 warning、`archive-unavailable` 前置失败码）；
  修订既有 requirement：**删除前必须经过预览与二次确认**（预览携带归档根、请求带模式、
  默认档为迁移）、**删除移除会话的全部持久化痕迹**（表述扩为两种模式各自的痕迹边界）、
  **不可删除状态必须被拒绝**（新增 `archive-unavailable`）。

## Impact

- **代码**（全部在根仓 `plugins/web-ux/` 单包内）：
  - `src/contract.ts`（契约：mode 必填、`archiveRoot` 预览字段、失败码扩展）；
  - `src/config.ts`（**新建**：Schemastery `Config` + `resolveArchiveRoot()`）；
  - `src/delete-session.ts`（纯流程：`FileSystemOps` 扩 `mkdir`/`rename`/`copyFile`
    三原语、`DeletePorts` 扩 `prepareArchive`/`archiveFiles`、新增 `archiveSession()`、
    抽出 `disposeAll()` 保证删除/迁移逐条语义同构）；
  - `src/index.ts`（实载体：config 读取、按 mode 分派、`nodeFileSystem` 补原语、
    `export { Config }`）；
  - `src/client/delete-client.ts` / `DeleteSessionDialog.tsx` / `locales.ts` /
    `delete.module.css`（调用面带 mode、原生 radio 单选、13 个双语文案键、模式区块样式）；
  - `test/` 下 contract / config（新建）/ delete-session / index / delete-client /
    delete-dialog / locale-parity 同步扩展；
  - `package.json`（devDeps 加 `@deepseek-ai/schemastery@3.18.5`，构建内联、运行时零
    依赖）、`tsconfig.host.json`（include 补新文件）、`README.md`、`cordis.patch.yml`
    注释、`build.mjs` 头注释、`lib/` 产物重建入库。
- **依赖**：仅 devDependencies 增加 `@deepseek-ai/schemastery`（与 session-tool-toggle
  同版本 `3.18.5`，已在根 `minimumReleaseAgeExclude` 白名单）；宿主产物仍只 external
  `node:*`。
- **不受影响**：菜单入口可见性规则、`DeleteSessionMenuItem`、`delete-store`、slot 声明、
  共享附件存储（任何模式都不动）、其他五个插件。
- **回滚提示**：回滚到旧版本后，旧宿主对新标签页（带 mode 的请求）同样预览即
  `bad-request`，刷新到旧客户端即恢复原删除行为；归档目录中已迁移的数据不受影响。
