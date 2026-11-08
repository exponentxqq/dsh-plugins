/**
 * 选择值纯投影层（`src/client/workspace-choice.ts`）的单测。
 *
 * 本套件不渲染任何组件、不碰 React——纯函数直接跑在 node 环境里，逐条钉住 code-design
 * ③ 3.7 的四个面：
 *
 * 1. **候选与行 id**：`pickerItems` 保持 Host 顺序且「未分配」恒排最后（空清单只有它）；
 *    `selectionKeyOf` / `selectionFromKey` 在三种选择值上往返无损，未知 id 与已删工作区
 *    一律 `undefined`（页面据此回退到 Q10 默认档）。
 * 2. **默认选择的 Q10 三档**：最近使用（按每个工作区的**成员会话最大值**比较，并列取 Host
 *    顺序在前）> 当前会话所属工作区 > 第一项；清单为空恒为「未分配」。
 * 3. **读数的保守语义**：`updatedAt` 非有限值 / 非正值不算最近使用，否则一条坏读数会永久
 *    压制全部工作区；读数缺席（`usage === undefined`）直接落到下一档。
 * 4. **显示文案**：`title` 非空用它，否则 `path`，二者皆空用调用方兜底；「未分配」与
 *    「无上下文」恒用兜底文案。
 *
 * @module dsh-plugin-workspace-config/test/workspace-choice
 */

import { describe, expect, it } from 'vitest'
import type { WorkspaceConfigWorkspaceContext } from '@dsh-plugins/contracts'
import type { WorkspaceChoiceItem } from '../src/client/workspace-source.ts'
import {
  NO_CONTEXT,
  UNASSIGNED,
  defaultSelection,
  pickerItems,
  selectionFromKey,
  selectionKeyOf,
  selectionLabelOf,
  selectionOfItem,
} from '../src/client/workspace-choice.ts'

/**
 * 三行清单（Host 顺序）：alpha 有两个成员会话（用来验证「取最大值」而不是「取第一个」），
 * beta 的标题为空（用来验证 path 兜底），gamma 没有成员会话（不参与最近使用比较）。
 */
const ITEMS: readonly WorkspaceChoiceItem[] = [
  { id: 'w-alpha', title: 'alpha', path: '/repos/alpha', sessionIds: ['s-alpha-old', 's-alpha-new'] },
  { id: 'w-beta', title: '', path: '/repos/beta', sessionIds: ['s-beta'] },
  { id: 'w-gamma', title: 'gamma', path: '/repos/gamma', sessionIds: [] },
]

/** 三条清单行的简写（顺序即 Host 顺序）。 */
const [ALPHA, BETA, GAMMA] = ITEMS

/** 候选里每一项的稳定标识：工作区取 id，特殊项取 kind（断言用）。 */
function idsOf(selections: readonly WorkspaceConfigWorkspaceContext[]): readonly string[] {
  return selections.map((selection) => (selection.kind === 'workspace' ? selection.id : selection.kind))
}

describe('三态常量', () => {
  it('未分配与无上下文是形状固定的常量', () => {
    expect(UNASSIGNED).toEqual({ kind: 'unassigned' })
    expect(NO_CONTEXT).toEqual({ kind: 'none' })
  })
})

describe('pickerItems', () => {
  it('真实工作区保持 Host 顺序，未分配恒排最后', () => {
    const picked = pickerItems(ITEMS)
    expect(idsOf(picked)).toEqual(['w-alpha', 'w-beta', 'w-gamma', 'unassigned'])
    expect(picked[picked.length - 1]).toBe(UNASSIGNED)
  })

  it('空清单时候选只剩「未分配」', () => {
    const picked = pickerItems([])
    expect(picked).toHaveLength(1)
    expect(picked[0]).toBe(UNASSIGNED)
  })

  it('不排序、不改写输入', () => {
    const picked = pickerItems(ITEMS)
    expect(picked).not.toBe(ITEMS)
    expect(ITEMS.map((item) => item.id)).toEqual(['w-alpha', 'w-beta', 'w-gamma'])
    // 乱序输入按原样投影：顺序由清单源（Host）决定，本层不插手。
    expect(idsOf(pickerItems([GAMMA, ALPHA]))).toEqual(['w-gamma', 'w-alpha', 'unassigned'])
  })
})

describe('selectionOfItem', () => {
  it('只投影 owner 份额需要的三栏，不携带 sessionIds', () => {
    const selection = selectionOfItem(BETA)
    expect(selection).toEqual({ kind: 'workspace', id: 'w-beta', title: '', path: '/repos/beta' })
    expect(Object.keys(selection).sort()).toEqual(['id', 'kind', 'path', 'title'])
  })
})

describe('selectionKeyOf / selectionFromKey', () => {
  it('三态编码成稳定行 id', () => {
    expect(selectionKeyOf(selectionOfItem(ALPHA))).toBe('workspace:w-alpha')
    expect(selectionKeyOf(UNASSIGNED)).toBe('unassigned')
    expect(selectionKeyOf(NO_CONTEXT)).toBe('none')
  })

  it('候选上往返无损（workspace 与 unassigned）', () => {
    const candidates = pickerItems(ITEMS)
    for (const selection of candidates) {
      expect(selectionFromKey(selectionKeyOf(selection), candidates)).toEqual(selection)
    }
  })

  it('none 不在候选里也能解出常量（编解码对称）', () => {
    expect(selectionFromKey('none', pickerItems(ITEMS))).toBe(NO_CONTEXT)
  })

  it('未知 id / 已删工作区 / 空候选一律 undefined', () => {
    const candidates = pickerItems(ITEMS)
    expect(selectionFromKey('workspace:w-deleted', candidates)).toBeUndefined()
    expect(selectionFromKey('workspace:', candidates)).toBeUndefined()
    expect(selectionFromKey('whatever', candidates)).toBeUndefined()
    expect(selectionFromKey('workspace:w-alpha', pickerItems([]))).toBeUndefined()
  })
})

describe('defaultSelection — Q10 第一档：最近使用', () => {
  it('取每个工作区成员会话的最大 updatedAt 比较，且压过当前会话档', () => {
    // alpha 的最大值是 900（不是先出现的 100）；当前会话属于 beta 也不影响第一档先命中。
    const usage = {
      's-alpha-old': { updatedAt: 100 },
      's-alpha-new': { updatedAt: 900 },
      's-beta': { updatedAt: 500 },
    }
    expect(defaultSelection(ITEMS, usage, 's-beta')).toEqual(selectionOfItem(ALPHA))
  })

  it('并列时取 Host 顺序在前的工作区', () => {
    const usage = {
      's-alpha-new': { updatedAt: 700 },
      's-beta': { updatedAt: 700 },
    }
    expect(defaultSelection(ITEMS, usage, 's-beta')).toEqual(selectionOfItem(ALPHA))
  })

  it('没有成员会话的工作区不参与比较', () => {
    const usage = { 's-beta': { updatedAt: 1 } }
    expect(defaultSelection(ITEMS, usage, 's-gamma-session')).toEqual(selectionOfItem(BETA))
  })

  it('非有限读数不夺魁（NaN / Infinity 视同无读数）', () => {
    const usage = {
      's-alpha-new': { updatedAt: Number.NaN },
      's-beta': { updatedAt: 5 },
    }
    expect(defaultSelection(ITEMS, usage, undefined)).toEqual(selectionOfItem(BETA))
  })

  it('没有任何正读数时落到当前会话档', () => {
    const usage = {
      's-alpha-new': { updatedAt: 0 },
      's-beta': { updatedAt: -100 },
    }
    expect(defaultSelection(ITEMS, usage, 's-beta')).toEqual(selectionOfItem(BETA))
  })
})

describe('defaultSelection — Q10 第二档：当前会话', () => {
  it('读数缺席时取当前会话所属工作区', () => {
    expect(defaultSelection(ITEMS, undefined, 's-beta')).toEqual(selectionOfItem(BETA))
  })

  it('当前会话探测不出或不属于任何工作区时取第一项', () => {
    expect(defaultSelection(ITEMS, undefined, undefined)).toEqual(selectionOfItem(ALPHA))
    expect(defaultSelection(ITEMS, undefined, 's-unknown')).toEqual(selectionOfItem(ALPHA))
    // 读数里有一条「当前会话」的 updatedAt，但它不属于任何候选行：仍然落到第二/三档。
    expect(defaultSelection(ITEMS, { 's-unknown': { updatedAt: 9 } }, 's-unknown')).toEqual(
      selectionOfItem(ALPHA),
    )
  })

  it('成员会话为空的清单行不会被当前会话命中', () => {
    expect(defaultSelection([GAMMA], undefined, 's-anything')).toEqual(selectionOfItem(GAMMA))
  })
})

describe('defaultSelection — Q10 第三档与空表', () => {
  it('清单为空恒为「未分配」，与读数无关', () => {
    expect(defaultSelection([], undefined, 's-beta')).toEqual(UNASSIGNED)
    expect(defaultSelection([], { 's-beta': { updatedAt: 10 } }, 's-beta')).toEqual(UNASSIGNED)
  })
})

describe('selectionLabelOf', () => {
  it('title 优先于 path', () => {
    expect(selectionLabelOf(selectionOfItem(ALPHA), '未分配')).toBe('alpha')
  })

  it('title 为空时退回 path', () => {
    expect(selectionLabelOf(selectionOfItem(BETA), '未分配')).toBe('/repos/beta')
  })

  it('title 与 path 皆空时用调用方兜底', () => {
    const empty: WorkspaceConfigWorkspaceContext = { kind: 'workspace', id: 'w-empty', title: '', path: '' }
    expect(selectionLabelOf(empty, '未分配')).toBe('未分配')
  })

  it('未分配与无上下文恒用调用方兜底文案', () => {
    expect(selectionLabelOf(UNASSIGNED, '未分配')).toBe('未分配')
    expect(selectionLabelOf(NO_CONTEXT, '工作区列表尚未就绪')).toBe('工作区列表尚未就绪')
  })
})
