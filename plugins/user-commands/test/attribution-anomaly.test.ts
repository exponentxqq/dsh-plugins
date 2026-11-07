/**
 * 归属内核接线的异常用例（规范：dsh-user-commands —— 三层优先级与会话遮蔽；G4）。
 *
 * 归属走法本身由 host-kit 内核套件（`tooling/host-kit` 的 `attribution.test.ts`）的 `CASES`
 * 表与「并发原子性」两条用例钉住，插件侧的规则 / 并发套件已随去重删除；包级适配的 wiring
 * 由本文件自证。本文件覆盖：薄导出仍叫 `Attributor`（与 `RootAttributor` 指向同一个类），
 * `{ onAnomaly: log.warn }` 的接线能收到 #3 登记异常（`roots[0] !== primaryRoot`）与重复主根，
 * 且异常不会丢根。
 */
import { describe, expect, it } from 'vitest'
import { Attributor, RootAttributor } from '../src/host/attribution.ts'
import type { WorkspaceRoots } from '../src/host/types.ts'

/**
 * 用「存在的路径集合」拼出的 canonical 化 seam。
 * @param existing - 真实存在的路径。
 * @returns canonical 化 seam。
 */
function fakeRealpath(existing: readonly string[]): {
  realpath(candidate: string): Promise<string>
} {
  const present = new Set(existing)
  return {
    realpath: async (candidate) => {
      if (!present.has(candidate)) throw new Error(`ENOENT: ${candidate}`)
      return candidate
    },
  }
}

/**
 * 收集异常诊断的日志出口（与 `index.ts` 的 `log.warn` 同形）。
 * @returns 日志端口与收集到的行。
 */
function recordingLog(): { log: { warn(message: string): void }; warnings: string[] } {
  const warnings: string[] = []
  return { log: { warn: (message) => warnings.push(message) }, warnings }
}

describe('归属内核接线的异常用例', () => {
  it('两个包内名字指向同一个内核类', () => {
    // oracle 用 `new Attributor(io)`；插件主体用带 onAnomaly 的 `RootAttributor`。
    expect(Attributor).toBe(RootAttributor)
  })

  it('#3：roots[0] !== primaryRoot 时上报异常且不丢任何根', async () => {
    const { log, warnings } = recordingLog()
    const attributor = new RootAttributor(fakeRealpath(['/shared', '/work/a', '/extra']), {
      onAnomaly: log.warn,
    })
    const workspace: WorkspaceRoots = {
      primaryRoot: '/work/a',
      roots: ['/shared', '/work/a', '/extra'],
    }
    await attributor.update([workspace])

    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('primary root /work/a')
    expect(warnings[0]).toContain('"/shared"')

    // 主根仍是它自己的「家」，答复带回原样、完整的根集合。
    const fullRoots = ['/shared', '/work/a', '/extra']
    expect(await attributor.attribute('/work/a')).toEqual({ workspaceRoot: '/work/a', roots: fullRoots })
    // 位置假设被换成了值语义：roots[0] 与其余根仍各归其位，一个都不丢。
    expect(await attributor.attribute('/shared')).toEqual({ workspaceRoot: '/work/a', roots: fullRoots })
    expect(await attributor.attribute('/extra')).toEqual({ workspaceRoot: '/work/a', roots: fullRoots })
  })

  it('重复主根：上报异常并保持先写先得', async () => {
    const { log, warnings } = recordingLog()
    const attributor = new RootAttributor(fakeRealpath(['/work/a']), { onAnomaly: log.warn })
    await attributor.update([
      { primaryRoot: '/work/a', roots: ['/work/a'] },
      { primaryRoot: '/work/a', roots: ['/work/a', '/extra'] },
    ])

    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('duplicate primary root /work/a')
    // 胜出工作区的根集合完整返回（不与其他登记拼接）。
    expect(await attributor.attribute('/work/a')).toEqual({
      workspaceRoot: '/work/a',
      roots: ['/work/a'],
    })
  })

  it('薄导出的 fail-closed 语义不变：无命中仍是 null', async () => {
    const attributor = new Attributor(fakeRealpath(['/elsewhere', '/']))
    await attributor.update([{ primaryRoot: '/work/a', roots: ['/work/a'] }])

    expect(await attributor.attribute('/elsewhere')).toBeNull()
    expect(await attributor.attribute('')).toBeNull()
  })
})
