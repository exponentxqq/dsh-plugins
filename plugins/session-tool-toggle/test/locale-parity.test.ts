/**
 * `sessionToolToggle` 文案一致性（任务 10.1 的验收套件）。
 *
 * 类型层的 `satisfies Record<Key, string>` 已经挡住编译期的缺键/多键，这条套件再在运行时
 * 兜四层：
 *
 * 1. **zh/en 键集合双向相等**——有人把 `en` 的类型断言改宽也逃不过；
 * 2. **稳定码全覆盖**——`contract.ts` 的 9 个宿主失败码 + 2 个传输码必须有 `error.<code>`，
 *    `NOTICE_CODES` 五个必须有 `notice.<code>`，`STORE_KINDS` / `TOOL_GROUP_KINDS` 的取值
 *    也必须各有键（否则面板只能写死中文，R6 破防）；
 * 3. **与设计附录 §3.5 表逐字对齐**——失败码文案是规范事实，漂移要在测试里暴露，而不是
 *    等到界面上看到两种说法；
 * 4. **没有隐式覆盖**——对象字面量里重复的键在运行时会被后者盖掉，键集合检查看不出来，
 *    所以直接读源文件按 zh/en 两个区段各数一遍。
 *
 * 另加一条约束：同一条文案的 zh/en `{param}` 占位符集合必须相同（en 漏一个 `{path}` 就是
 * 渲染出字面花括号的 bug）。
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  FAILURE_CODES,
  NOTICE_CODES,
  STORE_KINDS,
  TOOL_GROUP_KINDS,
} from '../src/contract.ts'
import { NS, en, zh, type Key } from '../src/client/locales.ts'

/** 本套件所在的插件根（`test/` 的上一级）。 */
const ROOT = path.resolve(import.meta.dirname, '..')

/** `locales.ts` 的源文本（只用于查重复键，不参与文案断言）。 */
const SOURCE = readFileSync(path.join(ROOT, 'src', 'client', 'locales.ts'), 'utf8')

/** 取一段文本里的字面量键（`'区.键':` 形式的属性名；键里允许驼峰，如 `state.storeKind.record`）。 */
function literalKeys(region: string): string[] {
  return [...region.matchAll(/^\s*'([a-z][A-Za-z0-9.-]*)':/gm)].map((match) => match[1] as string)
}

/** 取一条文案里的 `{param}` 占位符名（排序去重，便于直接比较）。 */
function placeholders(text: string): string[] {
  return [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1] as string))].sort()
}

/** 设计附录 §3.5 的「失败码 → 文案键」表，zh 文案逐字照抄（含反引号与全角标点）。 */
const SECTION_3_5: ReadonlyArray<readonly [FailureKey, string]> = [
  ['error.bad-request', '请求不合法，宿主拒绝了本次调用。'],
  [
    'error.bad-address',
    '地址不合法：{address}。语法见 `/tools` 帮助（`mcp:<server>`、`mcp:<server>::<工具>`、`tool:<名字>`、`skill`）。',
  ],
  ['error.protected', '{names} 在保护名单内，不能关闭。'],
  ['error.reserved', '{names} 是保留工具，不能关闭。'],
  ['error.session-not-live', '该会话未在宿主中运行（可能已归档或已结束），无法调整工具面。'],
  ['error.defaults-unwritable', '默认档写入失败：{path}。'],
  // C10 新增两码：§3.5 表是变更前的旧表，这两条文案由本变更冻结（同样逐字比对，防漂移）。
  ['error.workspace-unresolved', '工作区无法归属：{subject}。'],
  ['error.workspace-unwritable', '工作区默认档写入失败：{path}。'],
  ['error.internal', '宿主内部错误，本次操作未完成。'],
  ['error.unavailable', '无法连接到 dsh 主进程。'],
  ['error.bad-response', '宿主返回了无法识别的响应。'],
  ['error.fallback', '操作失败。'],
]

/** §3.5 表里出现的键名类型（`Key` 的子集，写错键名在编译期就会被抓）。 */
type FailureKey = Extract<Key, `error.${string}`>

/** 面板真正会读的键（入口、骨架、六分区、行级标记、关闭集、默认档、技能、工作区、状态摘要）。 */
const REQUIRED_KEYS: readonly Key[] = [
  // 入口按钮（设计 §3.1）
  'action.label',
  'action.title',
  'action.aria',
  // 面板骨架（设计 §3.2）
  'panel.title',
  'panel.close',
  'panel.loading',
  'panel.empty',
  'panel.refresh',
  // 六分区标题（工作区分区的标题是 `workspace.title`，见下）
  'section.state',
  'section.groups',
  'section.skills',
  'section.defaults',
  'section.disabled',
  // 分组（设计 §3.3）
  'group.mcp',
  'group.skill',
  'group.builtin',
  'group.toolCount',
  'group.disabledCount',
  // 行级标记
  'entry.disabled',
  'entry.protected',
  'entry.reserved',
  'entry.shadowed',
  'entry.intentOnly',
  // 开关操作
  'toggle.failed',
  'toggle.pending',
  // 关闭集
  'disabled.listTitle',
  'disabled.intentOnly',
  'disabled.empty',
  // 默认档（设计 §3.4）
  'defaults.path',
  'defaults.note',
  'defaults.add',
  'defaults.remove',
  'defaults.placeholder',
  'defaults.saved',
  'defaults.empty',
  // 技能分面（设计 §3.3 的技能段 / D-7：行不进 `ToolGroup`）
  'skill.region',
  'skill.unavailable',
  'skill.blocked',
  'skill.empty',
  'skill.pending',
  'skill.switchLabel',
  'skill.effective',
  'skill.intentOnly',
  // 工作区默认档（设计 §3.4 / C2；面板分区与侧栏对话框共用同一组键）
  'workspace.title',
  'workspace.select',
  'workspace.refresh',
  'workspace.loading',
  'workspace.unavailable',
  'workspace.key',
  'workspace.path',
  'workspace.registered',
  'workspace.unregistered',
  'workspace.unresolved',
  'workspace.corrupt',
  'workspace.scope',
  'workspace.union',
  'workspace.empty',
  'workspace.add',
  'workspace.addPlaceholder',
  'workspace.placeholder',
  'workspace.remove',
  'workspace.removeAria',
  'workspace.saved',
  'workspace.clear',
  'workspace.clearConfirm',
  // 状态摘要
  'state.visible',
  'state.catalog',
  'state.denied',
  'state.shadowed',
  'state.storeKind.record',
  'state.storeKind.memory',
  'state.snapshot',
  'state.createdAt',
]

describe('sessionToolToggle 文案', () => {
  it('命名空间固定为 sessionToolToggle', () => {
    expect(NS).toBe('sessionToolToggle')
  })

  it('zh 与 en 的键集合双向相等（两个方向的差集都为空）', () => {
    const zhKeys = Object.keys(zh)
    const enKeys = Object.keys(en)
    expect(zhKeys.filter((key) => !(key in en))).toEqual([])
    expect(enKeys.filter((key) => !(key in zh))).toEqual([])
  })

  it('没有空文案，且值都是字符串', () => {
    for (const [key, value] of Object.entries(zh)) {
      expect(typeof value, `zh.${key}`).toBe('string')
      expect(value.trim(), `zh.${key}`).not.toBe('')
    }
    for (const [key, value] of Object.entries(en)) {
      expect(typeof value, `en.${key}`).toBe('string')
      expect(value.trim(), `en.${key}`).not.toBe('')
    }
  })

  it('源文件里每个键在 zh / en 两个区段各出现恰好一次（没有隐式覆盖）', () => {
    const marker = 'export const en = {'
    const at = SOURCE.indexOf(marker)
    expect(at, 'en 字典的起始行').toBeGreaterThan(0)
    const zhRegion = SOURCE.slice(0, at)
    const enRegion = SOURCE.slice(at)
    const zhLiteral = literalKeys(zhRegion)
    const enLiteral = literalKeys(enRegion)
    // 键集合与运行时对象一致：源文件里多写或少写都会在这里暴露。
    expect([...new Set(zhLiteral)].sort()).toEqual(Object.keys(zh).sort())
    expect([...new Set(enLiteral)].sort()).toEqual(Object.keys(en).sort())
    // 每个键恰好一次：同一区段出现两次 = 后者静默盖掉前者。
    for (const [name, keys] of [['zh', zhLiteral], ['en', enLiteral]] as const) {
      const duplicated = keys.filter((key, index) => keys.indexOf(key) !== index)
      expect(duplicated, `${name} 区段重复的键`).toEqual([])
      expect(keys.length, `${name} 区段的键个数`).toBe(new Set(keys).size)
    }
  })

  it('同一条文案的 zh / en 占位符集合一致', () => {
    for (const key of Object.keys(zh) as Key[]) {
      expect(placeholders(en[key]), `en.${key} 的占位符`).toEqual(placeholders(zh[key]))
    }
  })

  it('面板会读到的键都在', () => {
    for (const key of REQUIRED_KEYS) {
      expect(zh, `zh.${key}`).toHaveProperty(key)
      expect(en, `en.${key}`).toHaveProperty(key)
    }
  })

  it('9 个宿主失败码 + 2 个传输码都有 error.<code> 键', () => {
    expect(FAILURE_CODES).toHaveLength(11)
    for (const code of FAILURE_CODES) {
      const key = `error.${code}`
      expect(zh, `zh.${key}`).toHaveProperty(key)
      expect(en, `en.${key}`).toHaveProperty(key)
    }
  })

  it('5 个提示码都有 notice.<code> 键', () => {
    expect(NOTICE_CODES).toHaveLength(5)
    for (const code of NOTICE_CODES) {
      const key = `notice.${code}`
      expect(zh, `zh.${key}`).toHaveProperty(key)
      expect(en, `en.${key}`).toHaveProperty(key)
    }
  })

  it('持久化通道与分组来源的每个取值都有键', () => {
    for (const kind of STORE_KINDS) {
      const key = `state.storeKind.${kind}`
      expect(zh, `zh.${key}`).toHaveProperty(key)
      expect(en, `en.${key}`).toHaveProperty(key)
    }
    for (const kind of TOOL_GROUP_KINDS) {
      const key = `group.${kind}`
      expect(zh, `zh.${key}`).toHaveProperty(key)
      expect(en, `en.${key}`).toHaveProperty(key)
    }
  })

  it('失败码文案与设计附录 §3.5 表逐字对齐', () => {
    for (const [key, text] of SECTION_3_5) {
      expect(zh[key], `zh.${key}`).toBe(text)
    }
  })
})
