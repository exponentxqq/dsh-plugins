/**
 * `webUx` 文案一致性：zh 是 canonical 形状，en 必须一一对应。
 *
 * 类型层的 `satisfies Record<Key, string>` 已经挡住编译期的缺键/多键；这条用例再在运行时
 * 兜一层（例如有人把 `en` 的类型断言改宽），并钉住界面真正会读到的键都在。
 */
import { describe, expect, it } from 'vitest'
import { NS, en, zh } from '../src/client/locales.ts'

describe('webUx 文案', () => {
  it('命名空间固定为 webUx', () => {
    expect(NS).toBe('webUx')
  })

  it('zh 与 en 的键集合一致', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })

  it('没有空文案', () => {
    for (const [key, value] of Object.entries(zh)) expect(value, `zh.${key}`).not.toBe('')
    for (const [key, value] of Object.entries(en)) expect(value, `en.${key}`).not.toBe('')
  })

  it('覆盖入口、对话框、会话管理面与全部失败码', () => {
    const required = [
      'menu.delete',
      'dialog.title',
      'dialog.description',
      'dialog.description.archive',
      'dialog.previewing',
      'dialog.summary.sessions',
      'dialog.summary.descendants',
      'dialog.summary.size',
      'dialog.summary.moveSize',
      'dialog.archive.target',
      'dialog.warning.irreversible',
      'dialog.warning.archive',
      'dialog.mode.legend',
      'dialog.mode.archive',
      'dialog.mode.delete',
      'dialog.deleting',
      'dialog.archiving',
      'dialog.confirm',
      'dialog.confirm.archive',
      'dialog.cancel',
      'dialog.close',
      'dialog.done',
      'dialog.done.archive',
      'dialog.warnings',
      'dialog.warnings.archive',
      'dialog.failed',
      'dialog.failed.archive',
      'format.bytes',
      'format.kb',
      'format.mb',
      'error.not-found',
      'error.not-archived',
      'error.session-live',
      'error.archive-unavailable',
      'error.bad-request',
      'error.internal',
      'error.unavailable',
      'error.bad-response',
      'error.fallback',
      // —— 会话管理面：分节 nav、入口与三 tab ——
      'section.label',
      'manager.action',
      'manager.title',
      'manager.close',
      'manager.unavailable',
      'manager.workspace.label',
      'manager.workspace.unassigned',
      'manager.tab.active',
      'manager.tab.archived',
      'manager.tab.migrated',
      'manager.tabs.label',
      'manager.empty.unassigned.archived',
      'manager.truncated',
      // —— 会话管理面：动作与确认 ——
      'manager.action.archive',
      'manager.action.dispose',
      'manager.action.purge',
      'manager.action.restore',
      'manager.action.unarchive',
      'manager.confirm.title',
      'manager.confirm.rejected',
      'manager.confirm.restoreUnassigned',
      'manager.confirm.run',
      // —— 会话管理面：执行、结果与失败 ——
      'manager.running',
      'manager.done.archive',
      'manager.done.dispose',
      'manager.done.purge',
      'manager.done.restore',
      'manager.done.restoreSplit',
      'manager.partial',
      'manager.warnings',
      'manager.failed',
      'manager.itemFailure',
      // —— 会话管理面：批量取消归档 ——
      'manager.unarchive.confirm',
      'manager.unarchive.run',
      'manager.unarchive.done',
      'manager.unarchive.partial',
      // —— 会话管理面新增失败码 ——
      'error.not-migrated',
      'error.target-exists',
      'error.workspace/session-active',
    ] as const
    for (const key of required) {
      expect(zh, key).toHaveProperty(key)
      expect(en, key).toHaveProperty(key)
    }
  })
})
