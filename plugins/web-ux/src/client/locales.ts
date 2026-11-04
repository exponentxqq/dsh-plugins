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
    '日志会移动到上述目录（保留项目目录层级），投影缓存与工作区记录同步清除，界面不再显示该会话。需要时可按会话 id 从该目录手动找回；插件不提供恢复入口。',

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

  // —— 失败码 → 文案（未知码回退 error.fallback） ——
  'error.not-found': '该会话已不存在，可能已在别处删除。',
  'error.not-archived': '该会话已不再处于归档状态；请刷新后重试。',
  'error.session-live': '该会话仍在宿主机内存中运行；请稍后重试。',
  'error.archive-unavailable': '归档目录不可用（无法创建或没有写权限），未做任何改动。',
  'error.bad-request': '请求不合法，宿主拒绝了本次调用。',
  'error.internal': '宿主内部错误，删除未执行。',
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
    'The logs move to that directory (project layout preserved); the projection cache and workspace records are cleared and the session disappears from every view. You can recover it by hand from that directory by session id; this plugin offers no restore entry.',

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

  'error.not-found': 'That session no longer exists; it may have been deleted elsewhere.',
  'error.not-archived': 'That session is no longer archived; refresh and try again.',
  'error.session-live': 'That session is still live in the host; try again later.',
  'error.archive-unavailable':
    'The archive directory is unusable (it cannot be created or is not writable); nothing was changed.',
  'error.bad-request': 'The host rejected the request as malformed.',
  'error.internal': 'The host hit an internal error; nothing was deleted.',
  'error.unavailable': 'Could not reach the dsh host process.',
  'error.bad-response': 'The host answered with an unrecognized response.',
  'error.fallback': 'The operation failed.',
} satisfies Record<Key, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** 本插件「删除已归档会话」的文案。 */
    webUx: Key
  }
}
