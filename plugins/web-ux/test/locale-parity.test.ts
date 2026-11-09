/**
 * `webUx` 文案一致性：zh 是 canonical 形状，en 必须一一对应。
 *
 * 类型层的 `satisfies Record<Key, string>` 已经挡住编译期的缺键/多键；运行时这一层
 * （键集合双向相等 / 空文案 / 必读键 / `{param}` 占位符）改调
 * `@dsh-plugins/test-kit/locale-parity` 的纯函数，三个双端插件不再各抄一份逻辑。
 *
 * **必读键的字面量数组与命名空间字面量留在本包**：前者是「界面真正会读哪些键」的包内
 * 事实，后者是命名空间的单点事实；函数只做无分支的夹具计算，`expect` 留在调用点。
 */
import { describe, expect, it } from 'vitest'
import { localeParityIssues } from '@dsh-plugins/test-kit/locale-parity'
import { NS, en, zh } from '../src/client/locales.ts'

/** 界面真正会读的键（字面量直写；少了哪一个由上面的共享检查报出来）。 */
const REQUIRED_KEYS = [
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
  'manager.finish',
  'manager.unavailable',
  'manager.tab.active',
  'manager.tab.archived',
  'manager.tab.migrated',
  'manager.tabs.label',
  'manager.empty.unassigned.archived',
  'manager.truncated',
  // —— 会话管理面：过滤框、徽标与行 meta（两行式行渲染） ——
  'manager.filter.placeholder',
  'manager.empty.filtered',
  'manager.badge.fork',
  'manager.meta.updated',
  'manager.meta.archived',
  'manager.meta.created',
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

/**
 * 取共享检查里某一类问题（`localeParityIssues` 给每条 issue 打了稳定的 `[kind]` 前缀）。
 *
 * 每个 `it` 只断言自己那一类：键集合 / 空文案 / 必读键 / 占位符漂移的失败不会互相污染，
 * 但检查逻辑只有 test-kit 里的一份。命名空间同时由本地字面量断言与共享检查守住。
 * @param kind - 问题类别。
 * @returns 该类问题（空数组 = 该类无问题）。
 */
function issuesOfKind(kind: 'namespace' | 'keys' | 'empty' | 'required' | 'placeholders'): string[] {
  return localeParityIssues({
    ns: NS,
    zh,
    en,
    required: REQUIRED_KEYS,
    expectedNs: 'webUx',
  }).filter((issue) => issue.startsWith(`[${kind}] `))
}

describe('webUx 文案', () => {
  it('命名空间固定为 webUx', () => {
    expect(NS).toBe('webUx')
    expect(issuesOfKind('namespace')).toEqual([])
  })

  it('zh 与 en 的键集合一致', () => {
    expect(issuesOfKind('keys')).toEqual([])
  })

  it('没有空文案', () => {
    expect(issuesOfKind('empty')).toEqual([])
  })

  it('覆盖入口、对话框、会话管理面与全部失败码', () => {
    expect(issuesOfKind('required')).toEqual([])
  })
})
