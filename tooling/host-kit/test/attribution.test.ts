/**
 * 归属内核的**规范级**用例（H10）。
 *
 * 表驱动的并集：`plugins/project-mcp/test/attribution.test.ts` 与
 * `plugins/user-commands/test/attribution.test.ts` 覆盖的每一条规则都在这张表里有对应
 * case（两包的差异只允许在「未命中策略」与「阶梯」，内核原语相同）；表外另有 #3 异常
 * 场景与并发原子性场景——后者是 user-commands 旧实现（clear → 逐个 claim）的结构性
 * 回归点，G6 会把它复现为回归。
 *
 * canonical 化一律用路径表假造，因此用例覆盖的是走法本身（含真实 realpath 存在的意义
 * ——符号链接），不依赖测试机的目录布局。
 */
import { describe, expect, it } from 'vitest'
import {
  RootAttributor,
  buildRootIndex,
  lookupIn,
  walkUp,
  type Attribution,
  type RealpathPort,
  type WorkspaceRoots,
} from '../src/attribution.ts'

/**
 * 用一张「存在的路径 → canonical 路径」表拼出的 realpath seam。
 * @param table - canonical 路径按现有路径索引；缺席即 ENOENT。
 * @returns canonical 化 seam。
 */
function fakeRealpath(table: Record<string, string>): RealpathPort {
  return {
    realpath: async (candidate: string): Promise<string> => {
      const canonical = table[candidate]
      if (canonical === undefined) throw new Error(`ENOENT: ${candidate}`)
      return canonical
    },
  }
}

/** 一个主根 + 若干附加根的工作区。 */
function workspace(primaryRoot: string, additional: readonly string[] = []): WorkspaceRoots {
  return { primaryRoot, roots: [primaryRoot, ...additional] }
}

/** 一个可手动放行的异步闸门（并发用例用）。 */
function deferred(): { readonly promise: Promise<void>; readonly resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

/** 表驱动 case 的形状（`realpath` 是假造的路径表）。 */
interface Case {
  readonly name: string
  readonly workspaces: readonly WorkspaceRoots[]
  readonly cwd: string
  readonly realpath: Record<string, string>
  readonly expected: Attribution | null
}

const CASES: readonly Case[] = [
  {
    name: 'cwd 正是登记根时命中该工作区',
    workspaces: [workspace('/work/a')],
    cwd: '/work/a',
    realpath: { '/work/a': '/work/a' },
    expected: { workspaceRoot: '/work/a', roots: ['/work/a'] },
  },
  {
    name: 'cwd 是工作区子目录时向上归属到最近的登记根',
    workspaces: [workspace('/work/a')],
    cwd: '/work/a/src/deep',
    realpath: {
      '/work/a/src/deep': '/work/a/src/deep',
      '/work/a/src': '/work/a/src',
      '/work/a': '/work/a',
    },
    expected: { workspaceRoot: '/work/a', roots: ['/work/a'] },
  },
  {
    name: 'cwd 在附加根下时归属授予它的工作区，并返回完整根集合',
    workspaces: [workspace('/work/a', ['/extra'])],
    cwd: '/extra/pkg',
    realpath: { '/extra/pkg': '/extra/pkg', '/extra': '/extra' },
    expected: { workspaceRoot: '/work/a', roots: ['/work/a', '/extra'] },
  },
  {
    name: '没有任何登记根认领时未命中（fail-closed 的原始事实）',
    workspaces: [workspace('/work/a')],
    cwd: '/elsewhere',
    realpath: { '/elsewhere': '/elsewhere' },
    expected: null,
  },
  {
    name: '经过符号链接的路径按 canonical 结果归属',
    workspaces: [workspace('/work/real')],
    cwd: '/work/link/sub',
    realpath: {
      '/work/link/sub': '/work/real/sub',
      '/work/link': '/work/real',
      '/work/real/sub': '/work/real/sub',
      '/work/real': '/work/real',
    },
    expected: { workspaceRoot: '/work/real', roots: ['/work/real'] },
  },
  {
    name: '根嵌套时最近层优先（近层主根胜过远层主根）',
    workspaces: [workspace('/work/a'), workspace('/work/a/inner')],
    cwd: '/work/a/inner/sub',
    realpath: {
      '/work/a/inner/sub': '/work/a/inner/sub',
      '/work/a/inner': '/work/a/inner',
      '/work/a': '/work/a',
    },
    expected: { workspaceRoot: '/work/a/inner', roots: ['/work/a/inner'] },
  },
  {
    name: '主根压倒更早登记的授予（谁的「家」谁做主）',
    workspaces: [workspace('/work/b', ['/work/a']), workspace('/work/a')],
    cwd: '/work/a',
    realpath: { '/work/a': '/work/a', '/work/b': '/work/b' },
    expected: { workspaceRoot: '/work/a', roots: ['/work/a'] },
  },
  {
    name: '主根优先在被争目录的子目录里同样成立',
    workspaces: [workspace('/work/b', ['/work/a']), workspace('/work/a')],
    cwd: '/work/a/src',
    realpath: { '/work/a/src': '/work/a/src', '/work/a': '/work/a', '/work/b': '/work/b' },
    expected: { workspaceRoot: '/work/a', roots: ['/work/a'] },
  },
  {
    name: '近层附加根命中优先于远层主根命中',
    workspaces: [workspace('/work/a'), workspace('/work/b', ['/work/a/extras'])],
    cwd: '/work/a/extras/pkg',
    realpath: {
      '/work/a/extras/pkg': '/work/a/extras/pkg',
      '/work/a/extras': '/work/a/extras',
      '/work/a': '/work/a',
      '/work/b': '/work/b',
    },
    expected: { workspaceRoot: '/work/b', roots: ['/work/b', '/work/a/extras'] },
  },
  {
    name: '同一目录被双授予时按登记顺序归第一个（附加根之间先到先得）',
    workspaces: [
      { primaryRoot: '/work/b1', roots: ['/work/b1', '/shared'] },
      { primaryRoot: '/work/b2', roots: ['/work/b2', '/shared'] },
    ],
    cwd: '/shared',
    realpath: { '/shared': '/shared', '/work/b1': '/work/b1', '/work/b2': '/work/b2' },
    expected: { workspaceRoot: '/work/b1', roots: ['/work/b1', '/shared'] },
  },
  {
    name: '附加根重复陈述主根无害（主根层先被问到）',
    workspaces: [{ primaryRoot: '/work/a', roots: ['/work/a', '/work/a'] }],
    cwd: '/work/a',
    realpath: { '/work/a': '/work/a' },
    expected: { workspaceRoot: '/work/a', roots: ['/work/a', '/work/a'] },
  },
  {
    name: '空 cwd 不授予任何东西',
    workspaces: [workspace('/work/a')],
    cwd: '',
    realpath: { '/work/a': '/work/a' },
    expected: null,
  },
  {
    name: '无法 canonical 化的根不进表：该目录不属于任何工作区',
    workspaces: [{ primaryRoot: '/gone', roots: ['/gone'] }, workspace('/work/a')],
    cwd: '/gone',
    realpath: { '/work/a': '/work/a' },
    expected: null,
  },
]

describe('归属内核：两包规则并集（表驱动）', () => {
  for (const testCase of CASES) {
    it(testCase.name, async () => {
      const attributor = new RootAttributor(fakeRealpath(testCase.realpath))
      await attributor.update(testCase.workspaces)

      expect(await attributor.attribute(testCase.cwd)).toEqual(testCase.expected)
    })
  }

  it('根集合未知之前不归属任何目录（空索引）', async () => {
    const attributor = new RootAttributor(fakeRealpath({ '/work/a': '/work/a' }))

    expect(await attributor.attribute('/work/a')).toBeNull()
  })

  it('update 是整表替换：登记移除后上一轮的根不再归属', async () => {
    const attributor = new RootAttributor(fakeRealpath({ '/work/a': '/work/a', '/work/b': '/work/b' }))
    await attributor.update([workspace('/work/a')])
    expect(await attributor.attribute('/work/a')).not.toBeNull()

    await attributor.update([])
    expect(await attributor.attribute('/work/a')).toBeNull()
  })

  it('内核只报告上溯事实：cwd 自己 canonical 化失败时 canonicalCwd 缺席，祖先命中仍返回 hit', async () => {
    const index = await buildRootIndex([workspace('/work/a')], fakeRealpath({ '/work/a': '/work/a' }))

    const result = await walkUp(
      '/work/a/missing',
      lookupIn(index),
      fakeRealpath({ '/work/a': '/work/a' }),
    )

    expect(result.hit).toEqual({ workspaceRoot: '/work/a', roots: ['/work/a'] })
    expect(result.canonicalCwd).toBeUndefined()
  })

  it('内核只报告上溯事实：未命中时 canonicalCwd 仍是适配器可用的退化键', async () => {
    const index = await buildRootIndex([workspace('/work/a')], fakeRealpath({ '/work/a': '/work/a' }))

    const result = await walkUp(
      '/work/elsewhere',
      lookupIn(index),
      fakeRealpath({ '/work/elsewhere': '/work/elsewhere' }),
    )

    expect(result.hit).toBeUndefined()
    expect(result.canonicalCwd).toBe('/work/elsewhere')
  })
})

describe('#3 裁定：roots[0] 不是 primaryRoot 时不丢根 + 诊断', () => {
  it('primaryRoot 仍以主根身份认领、其余根按值进附加根层，且不因更早的授予被抢注', async () => {
    const anomalies: string[] = []
    const attributor = new RootAttributor(
      fakeRealpath({
        '/work/a': '/work/a',
        '/work/other': '/work/other',
        '/work/b': '/work/b',
      }),
      { onAnomaly: (message) => anomalies.push(message) },
    )

    // B 更早把 /work/a 授予成附加根；A 的 roots[0] 却是 /work/other（契约被违反）。
    await attributor.update([
      { primaryRoot: '/work/b', roots: ['/work/b', '/work/a'] },
      { primaryRoot: '/work/a', roots: ['/work/other', '/work/a'] },
    ])

    expect(anomalies).toHaveLength(1)
    expect(anomalies[0]).toContain('roots[0]')
    expect(anomalies[0]).toContain('/work/a')

    // 主根层：A 拥有 /work/a，B 的授予抢不走。
    expect(await attributor.attribute('/work/a')).toEqual({
      workspaceRoot: '/work/a',
      roots: ['/work/other', '/work/a'],
    })
    // 附加根层：roots[0]=/work/other 没被当成「主根占位符」丢弃。
    expect(await attributor.attribute('/work/other')).toEqual({
      workspaceRoot: '/work/a',
      roots: ['/work/other', '/work/a'],
    })
  })

  it('同一 primaryRoot 重复登记：主根层先到先得、根集合取自胜出者，并报一条诊断', async () => {
    const anomalies: string[] = []
    const attributor = new RootAttributor(
      fakeRealpath({
        '/work/a': '/work/a',
        '/from-first': '/from-first',
        '/from-second': '/from-second',
      }),
      { onAnomaly: (message) => anomalies.push(message) },
    )

    await attributor.update([
      { primaryRoot: '/work/a', roots: ['/work/a', '/from-first'] },
      { primaryRoot: '/work/a', roots: ['/work/a', '/from-second'] },
    ])

    expect(anomalies).toHaveLength(1)
    expect(anomalies[0]).toContain('duplicate primary root')
    expect(await attributor.attribute('/work/a')).toEqual({
      workspaceRoot: '/work/a',
      roots: ['/work/a', '/from-first'],
    })
  })
})

describe('并发原子性：重扫期间不退回 fail-closed、不读半表', () => {
  it('update 未提交时 attribute 返回旧索引的完整结果', async () => {
    const table: Record<string, string> = {
      '/work/a': '/work/a',
      '/work/extra-a': '/work/extra-a',
      '/work/b': '/work/b',
    }
    const gate = deferred()
    const reached = deferred()
    let gated = false
    const io: RealpathPort = {
      realpath: async (candidate) => {
        if (candidate === '/work/b' && !gated) {
          gated = true
          reached.resolve()
          await gate.promise
        }
        const canonical = table[candidate]
        if (canonical === undefined) throw new Error(`ENOENT: ${candidate}`)
        return canonical
      },
    }
    const attributor = new RootAttributor(io)
    await attributor.update([
      { primaryRoot: '/work/a', roots: ['/work/a', '/work/extra-a'] },
    ])

    // 重扫被挂在 /work/b 的 canonical 化上：此刻还没有提交任何东西。
    const pending = attributor.update([{ primaryRoot: '/work/b', roots: ['/work/b'] }])
    await reached.promise

    // 旧索引必须完整可用——既不是 null（fail-closed），也不是半边表。
    expect(await attributor.attribute('/work/extra-a')).toEqual({
      workspaceRoot: '/work/a',
      roots: ['/work/a', '/work/extra-a'],
    })
    expect(await attributor.attribute('/work/b')).toBeNull()

    gate.resolve()
    await pending

    expect(await attributor.attribute('/work/b')).toEqual({
      workspaceRoot: '/work/b',
      roots: ['/work/b'],
    })
    expect(await attributor.attribute('/work/extra-a')).toBeNull()
  })

  it('attribute 在途时提交新索引，不改变本次上溯结果（调用开始即快照）', async () => {
    const table: Record<string, string> = {
      '/work/a/src': '/work/a/src',
      '/work/a': '/work/a',
      '/work/b': '/work/b',
    }
    const gate = deferred()
    const reached = deferred()
    let gated = false
    const io: RealpathPort = {
      realpath: async (candidate) => {
        if (candidate === '/work/a/src' && !gated) {
          gated = true
          reached.resolve()
          await gate.promise
        }
        const canonical = table[candidate]
        if (canonical === undefined) throw new Error(`ENOENT: ${candidate}`)
        return canonical
      },
    }
    const attributor = new RootAttributor(io)
    await attributor.update([{ primaryRoot: '/work/a', roots: ['/work/a'] }])

    const inFlight = attributor.attribute('/work/a/src')
    await reached.promise
    // 在途判定被挂住期间，新索引完整提交。
    await attributor.update([{ primaryRoot: '/work/b', roots: ['/work/b'] }])
    gate.resolve()

    // 本次判定仍用调用开始时的快照：A 的完整结果，而不是 null。
    expect(await inFlight).toEqual({ workspaceRoot: '/work/a', roots: ['/work/a'] })
    // 下一次判定看到新索引。
    expect(await attributor.attribute('/work/a/src')).toBeNull()
  })
})
