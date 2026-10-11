/**
 * Attribution tests (spec: dsh-project-mcp — 工作区可见性隔离).
 *
 * Canonicalization is faked as a path table, so the cases cover the walk-up
 * rule itself — including the symlink case a real `realpath` exists to solve —
 * without depending on the test machine's own directory layout.
 */
import { describe, expect, it } from 'vitest'
import { Attributor } from '../src/host/attribution.ts'
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

/** A workspace with its primary root and one granted additional root. */
function workspace(primaryRoot: string, additional: readonly string[] = []): WorkspaceRoots {
  return { primaryRoot, roots: [primaryRoot, ...additional] }
}

describe('session attribution', () => {
  it('attributes a session created exactly at a workspace root', async () => {
    const attributor = new Attributor(fakeRealpath({ '/work/a': '/work/a', '/work': '/work', '/': '/' }))
    await attributor.update([workspace('/work/a')])

    expect(await attributor.attribute('/work/a')).toEqual({ workspaceRoot: '/work/a', roots: ['/work/a'] })
  })

  it('attributes a session created in a subdirectory to the owning workspace', async () => {
    const attributor = new Attributor(fakeRealpath({
      '/work/a/src/deep': '/work/a/src/deep',
      '/work/a/src': '/work/a/src',
      '/work/a': '/work/a',
      '/work': '/work',
      '/': '/',
    }))
    await attributor.update([workspace('/work/a')])

    expect(await attributor.attribute('/work/a/src/deep')).toEqual({ workspaceRoot: '/work/a', roots: ['/work/a'] })
  })

  it('attributes a session inside an additional root to that root\'s workspace', async () => {
    const attributor = new Attributor(fakeRealpath({
      '/extra/pkg': '/extra/pkg',
      '/extra': '/extra',
      '/': '/',
    }))
    await attributor.update([workspace('/work/a', ['/extra'])])

    expect(await attributor.attribute('/extra/pkg')).toEqual({
      workspaceRoot: '/work/a',
      roots: ['/work/a', '/extra'],
    })
  })

  it('fails closed when no registered root claims the directory', async () => {
    const attributor = new Attributor(fakeRealpath({ '/elsewhere': '/elsewhere', '/': '/' }))
    await attributor.update([workspace('/work/a')])

    expect(await attributor.attribute('/elsewhere')).toBeNull()
  })

  it('canonicalizes through a symlink before matching a root', async () => {
    const attributor = new Attributor(fakeRealpath({
      '/work/link/sub': '/work/real/sub',
      '/work/real/sub': '/work/real/sub',
      '/work/link': '/work/real',
      '/work/real': '/work/real',
      '/work': '/work',
      '/': '/',
    }))
    await attributor.update([workspace('/work/real')])

    expect(await attributor.attribute('/work/link/sub')).toEqual({ workspaceRoot: '/work/real', roots: ['/work/real'] })
  })

  it('picks the nearest root when roots are nested', async () => {
    const attributor = new Attributor(fakeRealpath({
      '/work/a/inner/sub': '/work/a/inner/sub',
      '/work/a/inner': '/work/a/inner',
      '/work/a': '/work/a',
      '/work': '/work',
      '/': '/',
    }))
    await attributor.update([workspace('/work/a'), workspace('/work/a/inner')])

    expect((await attributor.attribute('/work/a/inner/sub'))?.workspaceRoot).toBe('/work/a/inner')
  })

  it('attributes nothing before the root sets are known', async () => {
    const attributor = new Attributor(fakeRealpath({ '/work/a': '/work/a' }))

    expect(await attributor.attribute('/work/a')).toBeNull()
  })
})
