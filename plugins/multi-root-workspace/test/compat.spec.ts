/**
 * The DSH compatibility contract.
 *
 * Three properties are pinned here, because each of them is a way the contract
 * could quietly stop being a contract:
 *
 * 1. the contract is a RANGE derived from one verified baseline (same
 *    `major.minor`, at or above it), and the release this suite runs against
 *    falls inside that range — a suite passing against an unverified release is
 *    the exact failure this whole mechanism exists to prevent;
 * 2. `package.json`'s `dsh.engines.dsh` and `peerDependencies` say the same
 *    thing as that range — npm metadata that over-promises is what started this
 *    work;
 * 3. incomplete, mixed and unsupported installations are each refused, loudly,
 *    with the offending versions named, and there is no relaxed mode: the gate
 *    has exactly one reaction.
 *
 * The boundary table in the middle is the eight-row table from
 * `openspec/changes/unify-deps-and-templates/code-design.md` §3.1, one case per
 * row, so a red row says which boundary moved.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SandboxPolicyService from '@deepseek-ai/dsh-sandbox-policy'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { assertSupportedInstallation, DshCompatUnsupportedError } from '../src/compat.ts'
import {
  classifyInstallation,
  compareVersions,
  CORE_PACKAGES,
  DSH_BASELINE,
  isSupportedDshRelease,
  OPTIONAL_CORE_PACKAGES,
  parseVersion,
  readInstalledVersion,
  REQUIRED_CORE_PACKAGES,
  SUPPORTED_DSH_RANGE,
  type VersionReader,
} from '../src/compat/dsh-version.ts'
import { MultiRootFileSystem } from '../src/fs.ts'
import * as Instructions from '../src/instructions.ts'
import { MultiRootRegistry } from '../src/registry.ts'
import { MultiRootSandboxProvider } from '../src/sandbox.ts'
import { MultiRootScopeService } from '../src/scope.ts'
import { mountCompat } from './support/compat.ts'
import { createFixtureWorkspace, REPO_ROOT } from './support/temp-workspace.ts'

/** A reader that reports one version for everything, then applies overrides. */
function reader(base: string | undefined, overrides: Record<string, string | undefined> = {}): VersionReader {
  return name => (name in overrides ? overrides[name] : base)
}

/** Parse a version literal, failing the calling case when the grammar rejects it. */
function parsed(value: string): NonNullable<ReturnType<typeof parseVersion>> {
  const result = parseVersion(value)
  if (result === undefined) throw new Error(`${value} must be inside the version grammar`)
  return result
}

/** The comparator's sign for two version literals (`-1` / `0` / `1`). */
function rank(left: string, right: string): number {
  return Math.sign(compareVersions(parsed(left), parsed(right)))
}

const manifest = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
  peerDependencies: Record<string, string>
  devDependencies: Record<string, string>
  dsh?: { engines?: { dsh?: string } }
}

describe('the supported-release range', () => {
  it('is derived from the baseline: lower bound included, the next minor excluded', () => {
    const baseline = parsed(DSH_BASELINE)
    expect(SUPPORTED_DSH_RANGE).toBe(`>=${DSH_BASELINE} <${baseline.major}.${baseline.minor + 1}.0`)
  })

  it('is pinned to 0.2.2-rc.1, which is what makes the boundary table below concrete', () => {
    // The eight rows below are literal versions: they only mean what they say
    // against this baseline. When the baseline moves, re-derive the table
    // (code-design §3.1) and update this pin with it — this failure is the
    // reminder, never drift to be papered over.
    expect(DSH_BASELINE).toBe('0.2.2-rc.1')
    expect(SUPPORTED_DSH_RANGE).toBe('>=0.2.2-rc.1 <0.3.0')
  })
})

describe("the contract's package inventory", () => {
  it('inspects every package this plugin couples to, required before optional', () => {
    expect(CORE_PACKAGES).toEqual([...REQUIRED_CORE_PACKAGES, ...OPTIONAL_CORE_PACKAGES])
    expect(new Set(CORE_PACKAGES).size).toBe(CORE_PACKAGES.length)
  })
})

/**
 * The boundary table from `code-design.md` §3.1, baseline `0.2.2-rc.1`, one
 * case per row:
 *
 * | # | input(s)                          | expected | why                                        |
 * |---|-----------------------------------|----------|--------------------------------------------|
 * | 1 | `0.2.2-rc.1`                      | true     | the lower bound is inclusive               |
 * | 2 | `0.2.2-rc.2`, `0.2.2-rc.10`       | true     | same minor, ≥ baseline; `rc.10 > rc.2`     |
 * | 3 | `0.2.2`                           | true     | a final release outranks its prerelease    |
 * | 4 | `0.2.3-alpha.1`                   | true     | same minor, later patch: prereleases pass  |
 * | 5 | `0.2.1-rc.5`                      | false    | same minor but below the baseline          |
 * | 6 | `0.1.7-rc.2`, `0.2.0`             | false    | below the baseline                         |
 * | 7 | `0.3.0`, `0.3.0-alpha.1`          | false    | different minor (upper bound is exclusive) |
 * | 8 | `1.0.0`, `0.9.9`, `''`, `latest`  | false    | out of domain / outside the grammar        |
 */
describe('the supported-range boundary table', () => {
  it('accepts the baseline itself: the lower bound is inclusive', () => {
    expect(isSupportedDshRelease('0.2.2-rc.1')).toBe(true)
    expect(isSupportedDshRelease(DSH_BASELINE)).toBe(true)
  })

  it('accepts later prereleases on the same minor, ranking rc.10 above rc.2 by value', () => {
    for (const release of ['0.2.2-rc.2', '0.2.2-rc.10']) {
      expect(isSupportedDshRelease(release), release).toBe(true)
    }
    expect(rank('0.2.2-rc.10', '0.2.2-rc.2')).toBe(1)
  })

  it('accepts the final release above its own prerelease', () => {
    expect(isSupportedDshRelease('0.2.2')).toBe(true)
    expect(rank('0.2.2', '0.2.2-rc.1')).toBe(1)
  })

  it('accepts a prerelease of a later patch on the same minor', () => {
    expect(isSupportedDshRelease('0.2.3-alpha.1')).toBe(true)
  })

  it('rejects a prerelease below the baseline on the same minor', () => {
    expect(isSupportedDshRelease('0.2.1-rc.5')).toBe(false)
  })

  it('rejects releases below the baseline, including a lower minor', () => {
    for (const release of ['0.1.7-rc.2', '0.2.0']) {
      expect(isSupportedDshRelease(release), release).toBe(false)
    }
  })

  it('rejects the next minor, even when it is numerically below the upper bound', () => {
    for (const release of ['0.3.0', '0.3.0-alpha.1']) {
      expect(isSupportedDshRelease(release), release).toBe(false)
    }
  })

  it('rejects out-of-domain and unparsable input without throwing', () => {
    for (const release of ['1.0.0', '0.9.9', '', 'latest']) {
      expect(isSupportedDshRelease(release), release).toBe(false)
    }
  })
})

describe('the handwritten comparator', () => {
  it('ranks major, minor and patch numerically (rule 1)', () => {
    expect(rank('0.3.0', '0.2.9')).toBe(1)
    expect(rank('0.2.10', '0.2.9')).toBe(1)
    expect(rank('1.0.0', '0.9.9')).toBe(1)
    expect(rank('0.2.2-rc.1', '0.2.2-rc.1')).toBe(0)
  })

  it('ranks a final release above its own prerelease (rule 2)', () => {
    expect(rank('0.2.2', '0.2.2-rc.1')).toBe(1)
    expect(rank('0.2.2-rc.1', '0.2.2')).toBe(-1)
  })

  it('compares prerelease identifiers by value, a numeric segment below any letter one (rule 3)', () => {
    expect(rank('0.2.2-rc.10', '0.2.2-rc.2')).toBe(1)
    expect(rank('0.2.2-2', '0.2.2-rc.1')).toBe(-1)
    expect(rank('0.2.2-alpha.1', '0.2.2-beta.1')).toBe(-1)
  })

  it('ranks a shorter prerelease below its own extension (rule 4)', () => {
    expect(rank('0.2.2-rc', '0.2.2-rc.1')).toBe(-1)
  })
})

describe('the version grammar', () => {
  it('accepts <major>.<minor>.<patch> with an optional dotted prerelease', () => {
    expect(parseVersion('0.2.2-rc.1')).toEqual({ major: 0, minor: 2, patch: 2, prerelease: ['rc', 1] })
    expect(parseVersion('0.2.2')).toEqual({ major: 0, minor: 2, patch: 2, prerelease: [] })
  })

  it('returns undefined — never throws — outside the grammar', () => {
    for (const value of ['0.9', '1.2.3+build', '', 'latest']) {
      expect(parseVersion(value), value).toBeUndefined()
    }
  })
})

describe('the release this suite runs against', () => {
  it('is inside the supported range, with every core package agreeing on it', () => {
    const report = classifyInstallation()
    expect(report.message).toContain('is a supported release')
    expect(report.verdict).toBe('supported')
    const release = report.release
    if (release === undefined) throw new Error('the installation must resolve to one release')
    expect(isSupportedDshRelease(release), release).toBe(true)
  })

  it('resolves through the same peer copy the providers will subclass', () => {
    for (const name of REQUIRED_CORE_PACKAGES) {
      expect(readInstalledVersion(name), `${name} must resolve`).toBeTypeOf('string')
    }
  })
})

describe('the manifest agrees with the supported range', () => {
  it('requires the derived range through dsh.engines.dsh', () => {
    expect(manifest.dsh?.engines?.dsh).toBe(SUPPORTED_DSH_RANGE)
  })

  it('declares the same range for every one of the DSH peers', () => {
    const dshPeers = Object.entries(manifest.peerDependencies)
      .filter(([name]) => name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-'))
    // The umbrella package plus the 21 packages this plugin couples to: a
    // missing peer would be resolved from whatever the host happens to hoist.
    expect(dshPeers.length, 'the DSH peer set is the umbrella plus 21 coupled packages').toBe(22)
    for (const [name, range] of dshPeers) {
      expect(range, `${name} must promise exactly the derived range`).toBe(SUPPORTED_DSH_RANGE)
    }
  })

  it('declares every required core package as a peer', () => {
    for (const name of REQUIRED_CORE_PACKAGES) {
      expect(Object.keys(manifest.peerDependencies), `${name} must be a peer`).toContain(name)
    }
  })

  it('pins every @deepseek-ai dependency for development through the shared catalog', () => {
    const pinned = Object.entries(manifest.devDependencies).filter(([name]) => name.startsWith('@deepseek-ai/'))
    expect(pinned.length).toBeGreaterThan(0)
    for (const [name, spec] of pinned) {
      expect(spec, `${name} must be pinned through the dsh catalog`).toBe('catalog:dsh')
    }
  })
})

describe('an installation that cannot be judged', () => {
  it('is incomplete when a required package is absent, and names it', () => {
    const report = classifyInstallation(reader(DSH_BASELINE, { '@deepseek-ai/dsh-sandbox-local': undefined }))
    expect(report.verdict).toBe('incomplete')
    expect(report.release).toBeUndefined()
    expect(report.message).toContain('@deepseek-ai/dsh-sandbox-local')
  })

  it('stays supported when only an optional package is absent', () => {
    const report = classifyInstallation(reader(DSH_BASELINE, { '@deepseek-ai/dsh-client-connection': undefined }))
    expect(report.verdict).toBe('supported')
    expect(report.release).toBe(DSH_BASELINE)
  })
})

describe('a mixed installation', () => {
  it('is refused when two required packages disagree, and both releases are named', () => {
    const report = classifyInstallation(reader(DSH_BASELINE, { '@deepseek-ai/dsh-fs-local': '0.2.3-alpha.1' }))
    expect(report.verdict).toBe('mixed')
    expect(report.release).toBeUndefined()
    expect(report.message).toContain(DSH_BASELINE)
    expect(report.message).toContain('0.2.3-alpha.1')
  })

  it('is refused when an OPTIONAL package disagrees, not just a required one', () => {
    const report = classifyInstallation(reader(DSH_BASELINE, { '@deepseek-ai/dsh-agent-instructions': '0.2.3-alpha.1' }))
    expect(report.verdict).toBe('mixed')
  })

  it('is refused even when both releases are inside the supported range', () => {
    const report = classifyInstallation(reader(DSH_BASELINE, { '@deepseek-ai/dsh-fs-local': '0.2.3-alpha.1' }))
    expect(isSupportedDshRelease(DSH_BASELINE)).toBe(true)
    expect(isSupportedDshRelease('0.2.3-alpha.1')).toBe(true)
    expect(report.verdict).toBe('mixed')
  })

  it('reports the inspected inventory so the odd package out is visible', () => {
    const report = classifyInstallation(reader(DSH_BASELINE, { '@deepseek-ai/dsh-fs-local': '0.2.3-alpha.1' }))
    expect(report.message).toContain('@deepseek-ai/dsh-fs-local 0.2.3-alpha.1')
    expect(report.message).toContain(`@deepseek-ai/dsh-sandbox-local ${DSH_BASELINE}`)
  })
})

describe('an unsupported release', () => {
  it('is refused even when every package agrees on it', () => {
    const report = classifyInstallation(reader('0.9.9'))
    expect(report.verdict).toBe('unsupported')
    expect(report.release).toBe('0.9.9')
  })

  it('names the installed release, the supported range, and where to recover', () => {
    const report = classifyInstallation(reader('0.9.9'))
    expect(report.message).toContain('outside the supported range')
    expect(report.message).toContain(`supported: ${SUPPORTED_DSH_RANGE}`)
    expect(report.message).toContain('installed: 0.9.9')
    expect(report.message).toContain('docs/troubleshooting/unsupported-dsh-release.md')
  })

  it('is refused BELOW the baseline and on the next minor too, not just far above it', () => {
    for (const release of ['0.2.1-rc.5', '0.1.7-rc.2', '0.3.0', '0.3.0-alpha.1']) {
      const report = classifyInstallation(reader(release))
      expect(report.verdict, release).toBe('unsupported')
      expect(report.release).toBe(release)
    }
  })
})

describe('the gate policy', () => {
  it('lets a supported installation through', () => {
    const report = classifyInstallation(reader(DSH_BASELINE))
    expect(assertSupportedInstallation(report)).toBeUndefined()
  })

  it('refuses an unsupported installation, carrying the report', () => {
    const report = classifyInstallation(reader('0.9.9'))
    try {
      assertSupportedInstallation(report)
      expect.unreachable('the gate must refuse an unsupported installation')
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(DshCompatUnsupportedError)
      expect((error as DshCompatUnsupportedError).report).toBe(report)
      expect((error as Error).message).toContain('0.9.9')
    }
  })

  it('refuses a mixed installation', () => {
    const report = classifyInstallation(reader(DSH_BASELINE, { '@deepseek-ai/dsh-fs-local': '0.2.3-alpha.1' }))
    expect(() => assertSupportedInstallation(report)).toThrow(DshCompatUnsupportedError)
  })

  it('refuses an incomplete installation', () => {
    const report = classifyInstallation(reader(DSH_BASELINE, { '@deepseek-ai/dsh-sandbox-local': undefined }))
    expect(report.verdict).toBe('incomplete')
    expect(() => assertSupportedInstallation(report)).toThrow(DshCompatUnsupportedError)
  })
})

describe('the gate is what the providers actually wait on', () => {
  it('is injected by every security-relevant row, so none can start without it', () => {
    for (const provider of [MultiRootFileSystem, MultiRootSandboxProvider, MultiRootRegistry]) {
      expect(provider.inject, provider.name).toContain('multiRootCompat')
    }
    expect(Instructions.inject).toContain('multiRootCompat')
  })

  it('leaves the fence and the sandbox unmounted while the service is absent', async () => {
    const fixture = createFixtureWorkspace('compat-gate')
    const ctx = new Context()
    const fibers = [
      await ctx.plugin(SessionProjectionRegistry),
      await ctx.plugin(SandboxPolicyService, { mode: 'workspace-write', workspaceRoot: fixture.workspace }),
      await ctx.plugin(MultiRootScopeService),
      await ctx.plugin(MultiRootFileSystem, { cwd: fixture.workspace }),
      await ctx.plugin(MultiRootSandboxProvider, { cwd: fixture.workspace }),
    ]
    try {
      // Cordis holds a row whose injected service is missing, so neither
      // provider ever claims its service key — the composition degrades to an
      // uninstalled harness instead of to an unguarded one.
      expect(ctx.get('fs')).toBeUndefined()
      expect(ctx.get('sandbox')).toBeUndefined()

      await mountCompat(ctx)
      expect(ctx.get('fs')).toBeDefined()
      expect(ctx.get('sandbox')).toBeDefined()
    } finally {
      while (fibers.length > 0) await fibers.pop()?.dispose()
      fixture.dispose()
    }
  })

  it('reports the release it started under once mounted', async () => {
    const ctx = new Context()
    await mountCompat(ctx)
    const report = classifyInstallation()
    expect(ctx.multiRootCompat.release).toBe(report.release)
    expect(ctx.multiRootCompat.supported).toBe(report.verdict === 'supported')
  })
})
