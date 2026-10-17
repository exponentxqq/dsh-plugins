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

  it('覆盖入口、对话框与全部失败码', () => {
    const required = [
      'menu.delete',
      'dialog.title',
      'dialog.description',
      'dialog.previewing',
      'dialog.summary.sessions',
      'dialog.summary.descendants',
      'dialog.summary.size',
      'dialog.warning.irreversible',
      'dialog.deleting',
      'dialog.confirm',
      'dialog.cancel',
      'dialog.close',
      'dialog.done',
      'dialog.warnings',
      'dialog.failed',
      'format.bytes',
      'format.kb',
      'format.mb',
      'error.not-found',
      'error.not-archived',
      'error.session-live',
      'error.bad-request',
      'error.internal',
      'error.unavailable',
      'error.bad-response',
      'error.fallback',
    ] as const
    for (const key of required) {
      expect(zh, key).toHaveProperty(key)
      expect(en, key).toHaveProperty(key)
    }
  })
})
