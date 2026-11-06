/**
 * 根枚举的规范级用例（H11）：主根来源 = 工作区登记顺序、附加根软依赖降级、
 * 主根重复陈述与重复授予都去重且保序。
 */
import { describe, expect, it } from 'vitest'
import type { RootEnumeratorContext } from '../src/roots.ts'
import { workspaceRoots } from '../src/roots.ts'
import type { MultiRootGrant } from '../src/triggers.ts'

/**
 * 造一个结构端口上下文。
 * @param services - 可被 `get(name)` 读到的服务。
 * @returns 上下文。
 */
function contextWith(services: Readonly<Record<string, unknown>>): RootEnumeratorContext {
  return { get: (name) => services[name] }
}

/** 一个只有 `list()` 的假工作区登记服务。 */
function registry(paths: readonly string[]) {
  return { list: () => paths.map((path) => ({ path })) }
}

/** 一个按主根回答授予根的假附加根服务。 */
function grant(table: Readonly<Record<string, readonly string[]>>): MultiRootGrant {
  return {
    granted: (primaryRoot) => table[primaryRoot] ?? [],
    onChange: () => () => {},
  }
}

describe('workspaceRoots：主根 + 软依赖附加根', () => {
  it('工作区登记服务缺席时返回空表（不抛错）', () => {
    expect(workspaceRoots(contextWith({}))).toEqual([])
  })

  it('登记为空时返回空表', () => {
    expect(workspaceRoots(contextWith({ workspaceRegistry: registry([]) }))).toEqual([])
  })

  it('附加根服务缺席时每个工作区只剩主根（软降级）', () => {
    const roots = workspaceRoots(contextWith({ workspaceRegistry: registry(['/work/a', '/work/b']) }))

    expect(roots).toEqual([
      { primaryRoot: '/work/a', roots: ['/work/a'] },
      { primaryRoot: '/work/b', roots: ['/work/b'] },
    ])
  })

  it('附加根按授予顺序跟在主根之后，工作区之间保持登记顺序', () => {
    const roots = workspaceRoots(
      contextWith({
        workspaceRegistry: registry(['/work/b', '/work/a']),
        multiRootRegistry: grant({ '/work/a': ['/extra-a'], '/work/b': ['/extra-b'] }),
      }),
    )

    expect(roots).toEqual([
      { primaryRoot: '/work/b', roots: ['/work/b', '/extra-b'] },
      { primaryRoot: '/work/a', roots: ['/work/a', '/extra-a'] },
    ])
  })

  it('附加根重复陈述主根、或重复授予同一路径时去重且保序', () => {
    const roots = workspaceRoots(
      contextWith({
        workspaceRegistry: registry(['/work/a']),
        multiRootRegistry: grant({ '/work/a': ['/work/a', '/extra', '/extra', '/work/a'] }),
      }),
    )

    expect(roots).toEqual([{ primaryRoot: '/work/a', roots: ['/work/a', '/extra'] }])
  })

  it('没有授予的工作区不受其它工作区的授予影响', () => {
    const roots = workspaceRoots(
      contextWith({
        workspaceRegistry: registry(['/work/a', '/work/b']),
        multiRootRegistry: grant({ '/work/a': ['/extra'] }),
      }),
    )

    expect(roots).toEqual([
      { primaryRoot: '/work/a', roots: ['/work/a', '/extra'] },
      { primaryRoot: '/work/b', roots: ['/work/b'] },
    ])
  })
})
