/**
 * web-ux 浏览器半的双语文案（NS `webUx`）。
 *
 * 与 multi-root 的 locales.ts 同构：扁平 `Record<string, string>`、键不带命名空间前缀、
 * zh 为 canonical 形状，en 用 `satisfies Record<Key, string>` 钉住——少一个键或拼错一个键
 * 都是编译错误，`test/locale-parity.test.ts` 再兜一层运行时一致。
 *
 * 模板参数用框架的 `{name}` 占位（`dsh-client-locale` 的插值实现即 `/\{(\w+)\}/g`）。
 *
 * @module dsh-plugin-web-ux/client/locales
 */

/** 本插件独占的 locale 命名空间。 */
export const NS = 'webUx'

/** 中文文案（canonical 形状）。 */
export const zh = {
  // —— 侧栏 「...」 菜单入口 ——
  'menu.delete': '删除会话',

  // —— 确认对话框：标题与预览 ——
  'dialog.title': '删除已归档会话',
  'dialog.description': '「{title}」归档的全部内容将被永久移除。',
  'dialog.description.archive': '「{title}」的会话日志将被移动到归档目录。',
  'dialog.previewing': '正在统计删除范围…',
  'dialog.summary.sessions': '会话：{count} 个',
  'dialog.summary.descendants': '其中子代理会话：{count} 个',
  'dialog.summary.size': '预计释放：{size}',
  'dialog.summary.moveSize': '移动体积：{size}',
  'dialog.archive.target': '归档目录：{path}',
  'dialog.warning.irreversible':
    '删除不可撤销：会话日志与投影缓存会被移除，工作区记录同步清除，任何界面都无法恢复。共享附件存储不会被清理。',
  'dialog.warning.archive':
    '日志会移动到上述目录（保留项目目录层级），投影缓存与工作区记录同步清除，界面不再显示该会话。需要时可在侧栏「会话管理 → 已迁移」里恢复（只回到已归档状态），也可按会话 id 从该目录手动找回。',

  // —— 确认对话框：处置方式单选 ——
  'dialog.mode.legend': '处置方式',
  'dialog.mode.archive': '移动到归档目录',
  'dialog.mode.delete': '永久删除',

  // —— 确认对话框：动作与结果 ——
  'dialog.deleting': '正在删除…',
  'dialog.archiving': '正在移动…',
  'dialog.confirm': '永久删除',
  'dialog.confirm.archive': '移动到归档目录',
  'dialog.cancel': '取消',
  'dialog.close': '关闭',
  'dialog.done': '已删除 {count} 个会话。',
  'dialog.done.archive': '已移动 {count} 个会话到归档目录。',
  'dialog.warnings': '以下文件删除失败，需要手动清理：',
  'dialog.warnings.archive': '以下项未能完成，需要手动清理：',
  'dialog.failed': '删除未能完成：{reason}',
  'dialog.failed.archive': '归档未能完成：{reason}',

  // —— 体积格式化 ——
  'format.bytes': '{value} B',
  'format.kb': '{value} KB',
  'format.mb': '{value} MB',

  // —— 命令结果通知卡 ——
  'notice.success.title': '命令执行成功',
  'notice.error.title': '命令执行失败',
  'notice.expand': '展开全文',
  'notice.collapse': '收起',
  'notice.close': '关闭通知',

  // —— 会话管理面：分节入口与外壳 ——
  // `section.label` 是统一「工作区配置」弹窗左 nav 的行标题（label thunk 每次读取）。
  'section.label': '会话管理',
  'manager.action': '会话管理',
  'manager.title': '会话管理',
  'manager.description':
    '按工作区批量管理会话：归档活跃会话、处置已归档会话、清理或恢复已迁移到归档目录的日志。',
  'manager.close': '关闭',
  'manager.unavailable': '会话管理依赖的工作区或会话服务尚未就绪；请稍后重试。',
  'manager.workspace.label': '工作区',
  'manager.workspace.unassigned': '未匹配工作区的归档',
  'manager.workspace.empty': '还没有任何工作区。',
  'manager.tab.active': '活跃',
  'manager.tab.archived': '已归档',
  'manager.tab.migrated': '已迁移',
  'manager.tabs.label': '会话分区',
  'manager.selectAll': '全选',
  'manager.clear': '清空',
  'manager.selected': '已选 {count} 个',

  // —— 会话管理面：三 tab 的空态与行 ——
  'manager.empty.active': '该工作区没有活跃会话。',
  'manager.empty.archived': '该工作区没有已归档会话。',
  'manager.empty.migrated': '归档目录里没有可管理的条目。',
  'manager.empty.unassigned':
    '该选项只包含无法匹配工作区的已迁移归档；当前没有这类条目。',
  'manager.empty.unassigned.archived': '该选项下没有不属于任何工作区的已归档会话。',
  'manager.badge.running': '运行中',
  'manager.badge.blank': '空白',
  'manager.untitled': '（无标题）',
  'manager.meta.size': '{size}',
  'manager.meta.time': '{time}',
  'manager.refresh': '刷新归档列表',
  'manager.truncated': '条目过多，只列出前 {count} 个；请先清理再刷新。',

  // —— 会话管理面：动作与确认 ——
  'manager.action.archive': '归档所选',
  'manager.action.dispose': '处置所选',
  'manager.action.purge': '永久删除所选',
  'manager.action.restore': '恢复所选',
  'manager.action.unarchive': '取消归档所选',
  'manager.confirm.title': '确认执行',
  'manager.confirm.targets': '目标会话 {count} 个',
  'manager.confirm.cascade': '其中级联子代理会话 {count} 个',
  'manager.confirm.rejected': '以下 {count} 项无法处理，已从本批剔除：',
  'manager.confirm.restore':
    '恢复会把日志搬回 sessions/ 并按项目路径重新挂回工作区；匹配不到工作区的条目会落到「未分组」。',
  'manager.confirm.restoreUnassigned':
    '这些条目无法匹配到工作区，恢复后将出现在「未分组」。',
  'manager.confirm.archiveRoot': '归档目录：{path}',
  'manager.confirm.back': '返回',
  'manager.confirm.run': '确认执行',

  // —— 会话管理面：执行与结果 ——
  'manager.running': '正在执行…',
  'manager.done.dispose': '已处置 {count} 个会话。',
  'manager.done.archive': '已归档 {count} 个会话。',
  'manager.done.purge': '已永久删除 {count} 个归档条目。',
  'manager.done.restore': '已恢复 {count} 个归档条目。',
  'manager.done.restoreSplit': '其中 {attached} 个挂回工作区，{unassigned} 个进入未分组。',
  'manager.partial': '成功 {ok} 项，失败 {failed} 项：',
  'manager.warnings': '以下文件操作未完成，需要手动清理：',
  'manager.failed': '操作未能完成：{reason}',
  'manager.itemFailure': '{id}：{reason}',

  // —— 会话管理面：批量取消归档（落档增补） ——
  'manager.unarchive.confirm': '将取消归档 {count} 个会话；它们会离开已归档列表。',
  'manager.unarchive.run': '确认取消归档',
  'manager.unarchive.done': '已取消归档 {count} 个会话。',
  'manager.unarchive.partial': '其中成功 {ok} 项，失败 {failed} 项：',

  // —— 失败码 → 文案（未知码回退 error.fallback） ——
  'error.not-found': '该会话已不存在，可能已在别处删除。',
  'error.not-archived': '该会话已不再处于归档状态；请刷新后重试。',
  'error.session-live': '该会话仍在宿主机内存中运行；请稍后重试。',
  'error.archive-unavailable': '归档目录不可用（无法创建或没有写权限），未做任何改动。',
  'error.bad-request': '请求不合法，宿主拒绝了本次调用。',
  'error.internal': '宿主内部错误，删除未执行。',
  'error.not-migrated': '归档目录里没有该条目（可能已被手工移动或删除）。',
  'error.target-exists': '目标位置已存在同名目录，未做任何改动。',
  'error.workspace/session-active':
    '该会话仍有运行中的工作（本轮对话 / 子代理 / 后台任务），已跳过；请先停止。',
  'error.unavailable': '无法连接到 dsh 主进程。',
  'error.bad-response': '宿主返回了无法识别的响应。',
  'error.fallback': '操作失败。',
} satisfies Record<string, string>

/** canonical 键集合。 */
export type Key = keyof typeof zh

/** 英文文案，钉在中文键集合上。 */
export const en = {
  'menu.delete': 'Delete session',

  'dialog.title': 'Delete archived session',
  'dialog.description': 'Everything archived under "{title}" will be removed permanently.',
  'dialog.description.archive': 'The stored logs of "{title}" will be moved to the archive directory.',
  'dialog.previewing': 'Measuring the delete scope…',
  'dialog.summary.sessions': 'Sessions: {count}',
  'dialog.summary.descendants': 'Subagent sessions included: {count}',
  'dialog.summary.size': 'Space to be freed: {size}',
  'dialog.summary.moveSize': 'Size to move: {size}',
  'dialog.archive.target': 'Archive directory: {path}',
  'dialog.warning.irreversible':
    'Deletion is irreversible: session logs and projection caches are removed, workspace records are cleared, and no surface can restore them. The shared attachment store is left untouched.',
  'dialog.warning.archive':
    'The logs move to that directory (project layout preserved); the projection cache and workspace records are cleared and the session disappears from every view. You can restore it from "Session manager → Migrated" in the sidebar (back to the archived state), or recover it by hand from that directory by session id.',

  'dialog.mode.legend': 'Disposition',
  'dialog.mode.archive': 'Move to archive directory',
  'dialog.mode.delete': 'Delete permanently',

  'dialog.deleting': 'Deleting…',
  'dialog.archiving': 'Moving…',
  'dialog.confirm': 'Delete permanently',
  'dialog.confirm.archive': 'Move to archive directory',
  'dialog.cancel': 'Cancel',
  'dialog.close': 'Close',
  'dialog.done': 'Deleted {count} sessions.',
  'dialog.done.archive': 'Moved {count} sessions to the archive directory.',
  'dialog.warnings': 'These files could not be removed and need manual cleanup:',
  'dialog.warnings.archive': 'These items did not complete and need manual cleanup:',
  'dialog.failed': 'Deletion did not complete: {reason}',
  'dialog.failed.archive': 'Archiving did not complete: {reason}',

  'format.bytes': '{value} B',
  'format.kb': '{value} KB',
  'format.mb': '{value} MB',

  'notice.success.title': 'Command succeeded',
  'notice.error.title': 'Command failed',
  'notice.expand': 'Show full text',
  'notice.collapse': 'Collapse',
  'notice.close': 'Dismiss notice',

  'section.label': 'Session manager',
  'manager.action': 'Session manager',
  'manager.title': 'Session manager',
  'manager.description':
    'Manage sessions per workspace: archive active sessions, dispose of archived sessions, and clean up or restore logs migrated to the archive directory.',
  'manager.close': 'Close',
  'manager.unavailable':
    'The workspace or session service that session management depends on is not ready yet; try again shortly.',
  'manager.workspace.label': 'Workspace',
  'manager.workspace.unassigned': 'Archives with no matching workspace',
  'manager.workspace.empty': 'There are no workspaces yet.',
  'manager.tab.active': 'Active',
  'manager.tab.archived': 'Archived',
  'manager.tab.migrated': 'Migrated',
  'manager.tabs.label': 'Session sections',
  'manager.selectAll': 'Select all',
  'manager.clear': 'Clear',
  'manager.selected': '{count} selected',

  'manager.empty.active': 'This workspace has no active sessions.',
  'manager.empty.archived': 'This workspace has no archived sessions.',
  'manager.empty.migrated': 'The archive directory has no manageable entries.',
  'manager.empty.unassigned':
    'This option only lists migrated archives that match no workspace; there are none right now.',
  'manager.empty.unassigned.archived':
    'This option has no archived sessions outside every workspace.',
  'manager.badge.running': 'Running',
  'manager.badge.blank': 'Blank',
  'manager.untitled': '(untitled)',
  'manager.meta.size': '{size}',
  'manager.meta.time': '{time}',
  'manager.refresh': 'Refresh archive list',
  'manager.truncated':
    'Too many entries; only the first {count} are listed. Clean up, then refresh.',

  'manager.action.archive': 'Archive selected',
  'manager.action.dispose': 'Dispose of selected',
  'manager.action.purge': 'Delete selected permanently',
  'manager.action.restore': 'Restore selected',
  'manager.action.unarchive': 'Unarchive selected',
  'manager.confirm.title': 'Confirm',
  'manager.confirm.targets': 'Target sessions: {count}',
  'manager.confirm.cascade': 'Cascaded subagent sessions included: {count}',
  'manager.confirm.rejected':
    'These {count} items cannot be processed and were removed from this batch:',
  'manager.confirm.restore':
    'Restore moves the logs back into sessions/ and reattaches them to the workspace by project path; entries with no matching workspace land in "Ungrouped".',
  'manager.confirm.restoreUnassigned':
    'These entries match no workspace; after restore they appear under "Ungrouped".',
  'manager.confirm.archiveRoot': 'Archive directory: {path}',
  'manager.confirm.back': 'Back',
  'manager.confirm.run': 'Run',

  'manager.running': 'Running…',
  'manager.done.dispose': 'Disposed of {count} sessions.',
  'manager.done.archive': 'Archived {count} sessions.',
  'manager.done.purge': 'Permanently deleted {count} archive entries.',
  'manager.done.restore': 'Restored {count} archive entries.',
  'manager.done.restoreSplit':
    '{attached} were reattached to a workspace and {unassigned} went to Ungrouped.',
  'manager.partial': 'Succeeded: {ok}; failed: {failed}:',
  'manager.warnings': 'These file operations did not complete and need manual cleanup:',
  'manager.failed': 'The operation did not complete: {reason}',
  'manager.itemFailure': '{id}: {reason}',

  'manager.unarchive.confirm':
    '{count} sessions will be unarchived and leave the archived list.',
  'manager.unarchive.run': 'Confirm unarchive',
  'manager.unarchive.done': 'Unarchived {count} sessions.',
  'manager.unarchive.partial': 'Succeeded: {ok}; failed: {failed}:',

  'error.not-found': 'That session no longer exists; it may have been deleted elsewhere.',
  'error.not-archived': 'That session is no longer archived; refresh and try again.',
  'error.session-live': 'That session is still live in the host; try again later.',
  'error.archive-unavailable':
    'The archive directory is unusable (it cannot be created or is not writable); nothing was changed.',
  'error.bad-request': 'The host rejected the request as malformed.',
  'error.internal': 'The host hit an internal error; nothing was deleted.',
  'error.not-migrated':
    'That entry is not in the archive directory (it may have been moved or deleted by hand).',
  'error.target-exists':
    'A directory with the same name already exists at the target location; nothing was changed.',
  'error.workspace/session-active':
    'That session still has running work (current turn, subagents, or background tasks); it was skipped. Stop it first.',
  'error.unavailable': 'Could not reach the dsh host process.',
  'error.bad-response': 'The host answered with an unrecognized response.',
  'error.fallback': 'The operation failed.',
} satisfies Record<Key, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** 本插件 Web 界面文案（删除对话框、命令通知、会话管理面）。 */
    webUx: Key
  }
}
