/**
 * Configured common roots (`commonRoots`): the directories the plugin
 * configuration grants to EVERY workspace — a machine-wide cache, say — without
 * registering them per project.
 *
 * Four properties are the point of the feature, and each is asserted here
 * against the real stack (JSON backend, domain, scope, compat gate, registry):
 *
 * 1. A primary root the store has never seen gets them, and the store stays
 *    untouched: the configuration is the grant, never a record.
 * 2. A registration always comes first, so its displayed number never moves; a
 *    directory that is both registered and configured is still granted once.
 * 3. A common root is withheld exactly like a registration — absent directory,
 *    replaced path, or the session's own workspace root — and a directory that
 *    appears later is granted without a restart.
 * 4. No surface can mutate one: the panel and the command answer `common-root`,
 *    and `add` refuses a directory the configuration already grants.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { canonicalPath } from '@deepseek-ai/dsh-sandbox'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { COMMON_ROOT_ID_PREFIX, DOMAIN_NAME, type Config } from '../src/registry.ts'
import { mountRegistryStack, type RegistryStack } from './support/registry-stack.ts'
import { createFixtureWorkspace, symlinkUnsupportedReason, type FixtureWorkspace } from './support/temp-workspace.ts'

let fixture: FixtureWorkspace
let storeRoot: string
let storeFile: string
let primary: string
let stacks: RegistryStack[] = []

/** The `path` values one primary root's records hold, read back from the store. */
function storedPaths(): string[] {
  if (!existsSync(storeFile)) return []
  const document = JSON.parse(readFileSync(storeFile, 'utf8')) as {
    tables: { roots: Record<string, { roots: { path: string }[] } | undefined> }
  }
  return (document.tables.roots[canonicalPath(primary)]?.roots ?? []).map(entry => entry.path)
}

/** The primary roots the store's seed ledger records. */
function ledgeredPrimaryRoots(): string[] {
  const file = join(storeRoot, `${DOMAIN_NAME}.seeded.json`)
  if (!existsSync(file)) return []
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as { seeded?: string[] }
  return parsed.seeded ?? []
}

/** Create a sibling directory usable as an additional root. */
function makeRoot(name: string): string {
  const path = join(fixture.base, name)
  mkdirSync(path, { recursive: true })
  return canonicalPath(path)
}

/** Mount the shared stack over this test's private store root, with the given config. */
async function mount(config: Partial<Config> = {}): Promise<RegistryStack> {
  const stack = await mountRegistryStack(storeRoot, config)
  stacks.push(stack)
  return stack
}

/** Dispose every stack this test created, newest first. */
async function disposeAll(): Promise<void> {
  const pending = stacks
  stacks = []
  for (const stack of pending.reverse()) await stack.dispose()
}

beforeEach(() => {
  fixture = createFixtureWorkspace('registry-common')
  storeRoot = join(fixture.base, 'storages')
  storeFile = join(storeRoot, `${DOMAIN_NAME}.json`)
  mkdirSync(storeRoot)
  primary = canonicalPath(fixture.workspace)
})

afterEach(async () => {
  await disposeAll()
  fixture.dispose()
})

describe('configured common roots', () => {
  it('grants a configured root to a primary root the store has never seen', async () => {
    const cache = makeRoot('cache')

    const { registry, scope } = await mount({ commonRoots: [cache] })

    // The store is not involved at all: no record, no ledger, nothing to seed.
    expect(storedPaths()).toEqual([])
    expect(registry.granted(primary)).toEqual([])
    expect(scope.scopeOf(primary)).toEqual([cache])
    expect(registry.list(primary).map(status => status.path)).toEqual([cache])
  })

  it('grants it to every primary root, and reports it as a common root', async () => {
    const cache = makeRoot('cache')
    const other = makeRoot('other-workspace')

    const { registry, scope } = await mount({ commonRoots: [cache] })

    expect(scope.scopeOf(other)).toEqual([cache])
    const [listed] = registry.list(other)
    expect(listed?.path).toBe(cache)
    expect(listed?.state).toBe('available')
    expect(listed?.source).toBe('common')
    expect(listed?.id).toBe(`${COMMON_ROOT_ID_PREFIX}${cache}`)
    expect(Number.isNaN(Date.parse(listed?.addedAt ?? ''))).toBe(false)
  })

  it('lists registrations first, so a stored root keeps its number', async () => {
    const registered = makeRoot('registered')
    const cache = makeRoot('cache')

    const { registry } = await mount({ commonRoots: [cache] })
    await registry.add(primary, { path: registered })

    expect(registry.list(primary).map(status => [status.path, status.source]))
      .toEqual([[registered, undefined], [cache, 'common']])

    // Numbering is positional over that list: removing #1 must remove the
    // REGISTRATION, because the common root is appended, never interleaved.
    await registry.removeAt(primary, { kind: 'ordinal', ordinal: 1 })
    expect(registry.granted(primary)).toEqual([])
    expect(registry.list(primary).map(status => status.path)).toEqual([cache])
    expect(storedPaths()).toEqual([])
  })

  it('grants a directory that is both registered and configured exactly once', async () => {
    const cache = makeRoot('cache')

    // The migration shape: a store that registered the directory earlier (when it
    // was a seed target) and a configuration that now grants it to everyone.
    await mount({ seedRoots: [cache], seedPrimaryRoots: [primary] })
    await disposeAll()
    const { registry, scope } = await mount({ commonRoots: [cache] })

    expect(storedPaths()).toEqual([cache])
    // One grant, one row: the registration wins the position, the common entry
    // adds nothing to the enforced set and is therefore not repeated.
    expect(scope.scopeOf(primary)).toEqual([cache])
    expect(registry.list(primary).map(status => [status.path, status.source])).toEqual([[cache, undefined]])
  })

  it('satisfies a seed the configuration already grants, without writing a record', async () => {
    const cache = makeRoot('cache')

    const { registry, scope } = await mount({
      seedRoots: [cache],
      seedPrimaryRoots: [primary],
      commonRoots: [cache],
    })

    // No duplicate record: the directory is granted either way, so seeding has
    // nothing to add — and the pass still counts as settled, so it is not retried
    // at every start.
    expect(storedPaths()).toEqual([])
    expect(scope.scopeOf(primary)).toEqual([cache])
    expect(registry.list(primary).map(status => [status.path, status.source])).toEqual([[cache, 'common']])
    expect(ledgeredPrimaryRoots()).toEqual([primary])
  })

  it('keeps a missing common root and grants it as soon as it exists', async () => {
    const late = join(fixture.base, 'late-cache')

    const { registry, scope } = await mount({ commonRoots: [late] })

    expect(scope.scopeOf(primary)).toEqual([])
    expect(registry.list(primary).map(status => status.state)).toEqual(['missing'])

    // No restart, no re-mount, no `recheck`: the directory shows up and the very
    // next resolution grants it, which is what makes this configuration rather
    // than a one-shot registration.
    mkdirSync(late)
    expect((await registry.refresh(primary)).map(status => status.state)).toEqual(['available'])
    expect(scope.scopeOf(primary)).toEqual([canonicalPath(late)])
  })

  it('withholds a common root whose path was replaced by a symlink', async (context) => {
    const reason = symlinkUnsupportedReason()
    if (reason !== undefined) {
      context.skip(reason)
      return
    }
    const cache = makeRoot('cache')
    const elsewhere = makeRoot('elsewhere')

    const { registry, scope } = await mount({ commonRoots: [cache] })
    expect(scope.scopeOf(primary)).toEqual([cache])

    rmSync(cache, { recursive: true, force: true })
    symlinkSync(elsewhere, cache)

    // Re-resolving a path is not re-authorizing it: the grant was captured for
    // the directory the configuration named, and it stays withheld until that
    // directory is back.
    expect(scope.scopeOf(primary)).toEqual([])
    expect((await registry.refresh(primary)).map(status => status.state)).toEqual(['redirected'])
  })

  it('withholds a common root that is one session\'s own workspace root, for that session only', async () => {
    const other = makeRoot('other-workspace')

    const { registry, scope } = await mount({ commonRoots: [primary] })

    expect(scope.scopeOf(primary)).toEqual([])
    expect(registry.list(primary).map(status => status.state)).toEqual(['invalid'])
    // The same configured directory is a legitimate additional root anywhere else.
    expect(scope.scopeOf(other)).toEqual([primary])
    expect(registry.list(other).map(status => status.state)).toEqual(['available'])
  })

  it('grants a common root that lies under a primary root (a redundant range, not a denial)', async () => {
    const nested = join(fixture.workspace, 'nested-cache')
    mkdirSync(nested)

    const { scope } = await mount({ commonRoots: [nested] })

    expect(scope.scopeOf(primary)).toEqual([canonicalPath(nested)])
  })

  it('refuses to remove, rename or reorder a common root, naming the configuration', async () => {
    const cache = makeRoot('cache')
    const { registry } = await mount({ commonRoots: [cache] })
    const [listed] = await registry.refresh(primary)
    const entry = {
      kind: 'entry' as const,
      ordinal: 1,
      id: listed?.id ?? '',
      path: listed?.path ?? '',
      addedAt: listed?.addedAt ?? '',
    }

    // Every way a surface can name a row: the panel sends `entry`, the command
    // accepts a number, a path or an id.
    await expect(registry.removeAt(primary, entry)).rejects.toMatchObject({ code: 'common-root' })
    await expect(registry.removeAt(primary, { kind: 'ordinal', ordinal: 1 }))
      .rejects.toMatchObject({ code: 'common-root' })
    await expect(registry.removeAt(primary, { kind: 'path', path: cache }))
      .rejects.toMatchObject({ code: 'common-root' })
    await expect(registry.setAlias(primary, { kind: 'id', id: `${COMMON_ROOT_ID_PREFIX}${cache}` }, 'cache'))
      .rejects.toMatchObject({ code: 'common-root' })
    await expect(registry.move(primary, { kind: 'path', path: cache }))
      .rejects.toMatchObject({ code: 'common-root' })

    // Refused means untouched: the store still holds nothing for this workspace.
    expect(storedPaths()).toEqual([])
  })

  it('refuses to register a directory the configuration already grants', async () => {
    const cache = makeRoot('cache')
    const { registry } = await mount({ commonRoots: [cache] })

    await expect(registry.add(primary, { path: cache })).rejects.toMatchObject({
      code: 'duplicate',
      message: expect.stringContaining('commonRoots'),
    })
    expect(storedPaths()).toEqual([])
  })

  it('grants nothing while another process holds the lease, and grants after it takes over', async () => {
    const cache = makeRoot('cache')
    const holder = await mountRegistryStack(storeRoot, { commonRoots: [cache] })
    const waiter = await mountRegistryStack(storeRoot, { commonRoots: [cache] })
    stacks.push(waiter)

    // Fail closed like the store itself: a process that is not the Registry
    // Authority grants no additional root, configured ones included.
    expect(waiter.registry.authority.kind).toBe('contended')
    expect(waiter.scope.scopeOf(primary)).toEqual([])
    expect(waiter.registry.list(primary)).toEqual([])

    await holder.dispose()
    // `refresh` is the takeover path, and it publishes the configured roots too.
    expect((await waiter.registry.refresh(primary)).map(status => status.path)).toEqual([cache])
    expect(waiter.scope.scopeOf(primary)).toEqual([cache])
  })

  it('withdraws the published common roots when this process stops being the authority', async () => {
    const cache = makeRoot('cache')
    const stack = await mountRegistryStack(storeRoot, { commonRoots: [cache] })
    stacks.push(stack)
    expect(stack.scope.scopeOf(primary)).toEqual([cache])

    await stack.dispose()

    expect(stack.scope.scopeOf(primary)).toEqual([])
  })

  it('grants nothing extra while no common root is configured', async () => {
    const { registry, scope } = await mount({})

    expect(scope.scopeOf(primary)).toEqual([])
    expect(registry.list(primary)).toEqual([])
  })
})
