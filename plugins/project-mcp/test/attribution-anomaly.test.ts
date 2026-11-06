/**
 * Attribution wiring tests (spec: dsh-project-mcp — 工作区可见性隔离; G4).
 *
 * The walk-up rules themselves are pinned by `test/attribution.test.ts`
 * (unchanged, the oracle) and by the kernel's own suite. This file covers the
 * PACKAGE adapter: the thin re-export still exposes `Attributor` and
 * `RootAttributor`, the plugin's `{ onAnomaly: log.warn }` wiring receives the
 * #3 registry anomaly (`roots[0] !== primaryRoot`) and duplicate primary roots,
 * and no root is dropped when an anomaly is reported.
 */
import { describe, expect, it } from 'vitest'
import { Attributor, RootAttributor } from '../src/host/attribution.ts'
import type { WorkspaceRoots } from '../src/host/types.ts'

/**
 * A realpath seam over a path table.
 * @param table - canonical path per existing path.
 * @returns the seam.
 */
function fakeRealpath(table: Record<string, string>) {
  return {
    realpath: async (candidate: string): Promise<string> => {
      const canonical = table[candidate]
      if (canonical === undefined) throw new Error(`ENOENT: ${candidate}`)
      return canonical
    },
  }
}

/**
 * The sink shape `index.ts` passes as `{ onAnomaly: log.warn }`.
 * @returns the sink and the collected lines.
 */
function recordingSink(): { sink: { onAnomaly(message: string): void }; lines: string[] } {
  const lines: string[] = []
  return { sink: { onAnomaly: (message) => lines.push(message) }, lines }
}

describe('attribution kernel wiring', () => {
  it('exposes the kernel class through both package names', () => {
    // The oracle constructs `new Attributor(io)`; `RootAttributor` is what the
    // plugin body constructs with the anomaly sink. They must be one class.
    expect(Attributor).toBe(RootAttributor)
  })

  it('reports roots[0] !== primaryRoot without dropping any root (#3)', async () => {
    const { sink, lines } = recordingSink()
    const attributor = new RootAttributor(
      fakeRealpath({
        '/shared': '/shared',
        '/work/a': '/work/a',
        '/extra': '/extra',
      }),
      sink,
    )
    // `roots[0]` is a granted root, not a restatement of the primary root.
    const workspace: WorkspaceRoots = {
      primaryRoot: '/work/a',
      roots: ['/shared', '/work/a', '/extra'],
    }
    await attributor.update([workspace])

    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('primary root /work/a')
    expect(lines[0]).toContain('"/shared"')

    // The primary root still owns its own home, with the full, unchanged root set.
    expect(await attributor.attribute('/work/a')).toEqual({
      workspaceRoot: '/work/a',
      roots: ['/shared', '/work/a', '/extra'],
    })
    // The anomaly did not turn `roots[0]` into a marker: every root is still claimed.
    expect(await attributor.attribute('/shared')).toEqual({
      workspaceRoot: '/work/a',
      roots: ['/shared', '/work/a', '/extra'],
    })
    expect(await attributor.attribute('/extra')).toEqual({
      workspaceRoot: '/work/a',
      roots: ['/shared', '/work/a', '/extra'],
    })
  })

  it('reports a duplicate primary root and keeps the first workspace', async () => {
    const { sink, lines } = recordingSink()
    const attributor = new RootAttributor(fakeRealpath({ '/work/a': '/work/a' }), sink)
    await attributor.update([
      { primaryRoot: '/work/a', roots: ['/work/a'] },
      { primaryRoot: '/work/a', roots: ['/work/a'] },
    ])

    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('duplicate primary root /work/a')
    expect(await attributor.attribute('/work/a')).toEqual({
      workspaceRoot: '/work/a',
      roots: ['/work/a'],
    })
  })

  it('keeps the previous snapshot while an update is in flight (atomic rebuild)', async () => {
    // The kernel builds the next index completely and commits it with one
    // reference assignment; a call between "rebuild started" and "committed"
    // must still answer from the old, complete index.
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const io = {
      realpath: async (candidate: string): Promise<string> => {
        if (candidate === '/work/b') await gate
        if (candidate === '/work/a' || candidate === '/work/b') return candidate
        throw new Error(`ENOENT: ${candidate}`)
      },
    }
    const attributor = new RootAttributor(io)
    await attributor.update([{ primaryRoot: '/work/a', roots: ['/work/a'] }])

    const pending = attributor.update([{ primaryRoot: '/work/b', roots: ['/work/b'] }])
    // Not awaiting `pending`: the old workspace still answers, fail-closed is not
    // entered just because a rescan began.
    expect(await attributor.attribute('/work/a')).toEqual({
      workspaceRoot: '/work/a',
      roots: ['/work/a'],
    })

    release()
    await pending
    expect(await attributor.attribute('/work/a')).toBeNull()
    expect(await attributor.attribute('/work/b')).toEqual({
      workspaceRoot: '/work/b',
      roots: ['/work/b'],
    })
  })

  it('keeps the fail-closed miss policy through the package alias', async () => {
    // No anomaly sink: the one-argument constructor the oracle uses still works,
    // and a directory nothing claims stays null (no degraded canonical-cwd key).
    const attributor = new Attributor(fakeRealpath({ '/elsewhere': '/elsewhere', '/': '/' }))
    await attributor.update([
      { primaryRoot: '/work/a', roots: ['/work/a'] },
    ])

    expect(await attributor.attribute('/elsewhere')).toBeNull()
    expect(await attributor.attribute(undefined)).toBeNull()
  })
})
