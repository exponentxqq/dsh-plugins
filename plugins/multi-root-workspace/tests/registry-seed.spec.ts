/**
 * Additional-root seeding (local extension): the configured directories are
 * registered the first time a primary root is seen, a candidate the root rules
 * reject is skipped rather than smuggled past validation, and nothing is
 * re-seeded afterwards — so a root the operator removed stays removed.
 *
 * The stack is the real one (JSON backend, domain, scope, compat gate,
 * registry), so every assertion reads what the store and the scope hold.
 */

import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { canonicalPath } from '@deepseek-ai/dsh-sandbox'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DOMAIN_NAME, type Config } from '../src/registry.ts'
import { mountRegistryStack, type RegistryStack } from './support/registry-stack.ts'
import { createFixtureWorkspace, type FixtureWorkspace } from './support/temp-workspace.ts'

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

/** Mount the shared stack over this test's private store root, with seed config. */
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
  fixture = createFixtureWorkspace('registry-seed')
  storeRoot = join(fixture.base, 'storages')
  storeFile = join(storeRoot, `${DOMAIN_NAME}.json`)
  mkdirSync(storeRoot)
  primary = canonicalPath(fixture.workspace)
})

afterEach(async () => {
  await disposeAll()
  fixture.dispose()
})

describe('additional-root seeding', () => {
  it('registers every configured root for a primary root that has no record', async () => {
    const alpha = makeRoot('alpha')
    const beta = makeRoot('beta')

    const { registry, scope } = await mount({ seedRoots: [alpha, beta], seedPrimaryRoots: [primary] })

    expect(storedPaths()).toEqual([alpha, beta])
    expect(registry.granted(primary)).toEqual([alpha, beta])
    expect(scope.scopeOf(primary)).toEqual([alpha, beta])
    expect(ledgeredPrimaryRoots()).toEqual([primary])
  })

  it('skips a seed the root rules reject, and keeps the rest', async () => {
    const usable = makeRoot('usable')
    const missing = join(fixture.base, 'never-created')
    const insidePrimary = join(fixture.workspace, 'inside')
    mkdirSync(insidePrimary)

    const { registry } = await mount({
      seedRoots: [missing, canonicalPath(insidePrimary), usable],
      seedPrimaryRoots: [primary],
    })

    // `missing` fails "the directory exists" and `insidePrimary` fails "overlaps
    // the workspace root"; neither may be stored, and neither may take the
    // usable candidate down with it.
    expect(storedPaths()).toEqual([usable])
    expect(registry.granted(primary)).toEqual([usable])

    // A pass that skipped a candidate is not ledgered, so a typo stays fixable:
    // the next start retries, and re-registering the usable root is idempotent.
    expect(ledgeredPrimaryRoots()).toEqual([])
    await disposeAll()
    const restarted = await mount({
      seedRoots: [missing, canonicalPath(insidePrimary), usable],
      seedPrimaryRoots: [primary],
    })
    expect(storedPaths()).toEqual([usable])
    expect(restarted.registry.granted(primary)).toEqual([usable])
    expect(ledgeredPrimaryRoots()).toEqual([])
  })

  it('never re-seeds a primary root that already has a record, even an empty one', async () => {
    const seeded = makeRoot('seeded')
    const config = { seedRoots: [seeded], seedPrimaryRoots: [primary] }

    const first = await mount(config)
    expect(storedPaths()).toEqual([seeded])

    // Removing the seeded root leaves the primary root's record in place,
    // holding zero roots.
    await first.registry.removeAt(primary, { kind: 'ordinal', ordinal: 1 })
    expect(storedPaths()).toEqual([])
    await disposeAll()

    // A restart must not undo the operator's removal.
    const second = await mount(config)
    expect(storedPaths()).toEqual([])
    expect(second.registry.granted(primary)).toEqual([])
  })

  it('seeds nothing while either list is empty', async () => {
    const ignored = makeRoot('ignored')

    await mount({ seedPrimaryRoots: [primary] })
    expect(storedPaths()).toEqual([])
    await disposeAll()

    await mount({ seedRoots: [ignored] })
    expect(storedPaths()).toEqual([])
  })
})
