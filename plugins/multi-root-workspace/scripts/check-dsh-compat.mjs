/**
 * compat:check — the static half of the DSH compatibility contract.
 *
 * The runtime gate (`src/compat.ts`) protects an installed harness; this script
 * protects the REPOSITORY. The contract it guards is "baseline → derived range":
 * the code is verified against one exact release in `src/compat/dsh-version.ts`,
 * and that release becomes one installable window (`>=<baseline> <next minor>.0`)
 * that every consumer is asked to satisfy.
 *
 * These declarations must agree, and this script fails when any pair drifts:
 *
 * ```text
 * src/compat/dsh-version.ts   DSH_BASELINE          the release verified here
 * (derived in this script)    >=<baseline> <next>    the window it implies
 * package.json                dsh.engines.dsh       what the harness must provide
 * package.json                peerDependencies      what npm promises
 * node_modules                resolved versions     what is installed here
 * ```
 *
 * It deliberately re-reads the baseline out of the TypeScript source rather than
 * importing it: this script must run before `pnpm build`, on a clean checkout
 * with no `lib/`, so it cannot depend on the bundle existing.
 *
 * What it deliberately does NOT do: recompute the range predicate ("is this
 * release inside the window?"). A second copy of that predicate would silently
 * fork from `isSupportedDshRelease`; the runtime gate and `tests/compat.spec.ts`
 * own the predicate, and the root `pnpm dsh:check` owns "the installed tree is
 * the baseline". This script owns the static facts: the range strings the
 * manifest declares, and that the installed tree holds a single release.
 *
 * @module scripts/check-dsh-compat
 */

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CONTRACT = join(REPO_ROOT, 'src', 'compat', 'dsh-version.ts')

const failures = []

/** Record a violation. */
function fail(message) {
  failures.push(message)
}

/**
 * Extract one `export const NAME = [...]` string array from the contract source.
 *
 * Parsing the source keeps the lists single-sourced without needing a
 * TypeScript loader in a pre-build step. The shapes accepted are exactly the
 * ones the contract file uses; anything else is a hard error rather than a
 * silent empty list, because an empty package list would make every check pass.
 * @param source - the contract file's text.
 * @param name - the exported binding to read.
 * @returns the string entries, in order.
 */
function readStringArray(source, name) {
  const match = new RegExp(String.raw`export const ${name} = \[([^\]]*)\]`, 'u').exec(source)
  if (match === null) throw new Error(`${name} is not declared as an array literal in src/compat/dsh-version.ts`)
  const entries = [...match[1].matchAll(/'([^']+)'/gu)].map(token => token[1])
  if (entries.length === 0) throw new Error(`${name} is empty in src/compat/dsh-version.ts`)
  return entries
}

/**
 * Extract one `export const NAME = 'value'` string literal from the contract source.
 *
 * Same reason as {@link readStringArray}: the baseline must be readable before
 * anything is built. A missing literal is a hard error — falling back to some
 * other source would let the check pass while the runtime copy says anything.
 * @param source - the contract file's text.
 * @param name - the exported binding to read.
 * @returns the literal value.
 */
function readStringLiteral(source, name) {
  const match = new RegExp(String.raw`^export const ${name} = '([^']+)'`, 'mu').exec(source)
  if (match === null) throw new Error(`${name} is not declared as a string literal in src/compat/dsh-version.ts`)
  return match[1]
}

/**
 * Derive the installable window from an exact baseline: `>=<baseline> <major>.<minor+1>.0`.
 *
 * The same three-line rule `src/compat/dsh-version.ts` uses, kept here on
 * purpose: the derivation is trivial, while the PREDICATE it feeds is not
 * (see the module docblock). A malformed baseline throws — a contract file
 * that no longer holds an exact version is broken, not merely out of date.
 * @param baseline - an exact version such as `0.2.2-rc.1`.
 * @returns the lower-inclusive, upper-exclusive range string.
 */
function softRange(baseline) {
  const match = /^(\d+)\.(\d+)\.\d+(?:-[\w.]+)?$/u.exec(baseline)
  if (match === null) throw new Error(`DSH_BASELINE "${baseline}" in src/compat/dsh-version.ts is not an exact version`)
  const major = Number(match[1])
  const minor = Number(match[2])
  return `>=${baseline} <${major}.${minor + 1}.0`
}

/** Whether a dependency name belongs to the DSH release family. */
function isDshPackage(name) {
  return name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-')
}

const contractSource = readFileSync(CONTRACT, 'utf8')
const baseline = readStringLiteral(contractSource, 'DSH_BASELINE')
const range = softRange(baseline)
const required = readStringArray(contractSource, 'REQUIRED_CORE_PACKAGES')
const optional = readStringArray(contractSource, 'OPTIONAL_CORE_PACKAGES')
const core = [...required, ...optional]

const manifest = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'))
const peers = manifest.peerDependencies ?? {}
const engines = manifest.dsh?.engines?.dsh

console.log(`[compat] baseline: ${baseline}`)
console.log(`[compat] range: ${range}`)

// 1. The engines field and every DSH peer name exactly the derived range. A
//    literal version would pass today and silently drift on the next upgrade,
//    which is the failure mode this contract exists to prevent.
if (engines !== range) {
  fail(`dsh.engines.dsh is ${engines === undefined ? 'missing' : `"${engines}"`}, expected "${range}"`)
}
const dshPeers = Object.entries(peers).filter(([name]) => isDshPackage(name))
for (const [name, promised] of dshPeers) {
  if (promised !== range) fail(`peerDependencies["${name}"] is "${promised}", expected "${range}"`)
}

// 2. Every required core package is declared as a peer at all. A package this
//    plugin subclasses but does not declare would be resolved from whatever the
//    host happens to hoist.
for (const name of required) {
  if (!(name in peers)) fail(`${name} is a required core package but is not declared in peerDependencies`)
}

// 3. What is actually installed here holds a single release, and every required
//    package resolves at all. Whether that release is inside the window is the
//    runtime gate's judgement — see the module docblock.
const installed = new Map()
for (const name of core) {
  try {
    installed.set(name, require(`${name}/package.json`).version)
  } catch {
    installed.set(name, undefined)
  }
}
for (const name of required) {
  if (installed.get(name) === undefined) fail(`${name} is required but not installed (run pnpm install)`)
}
const releases = [...new Set([...installed.values()].filter(version => version !== undefined))]
if (releases.length > 1) {
  fail(`the installed tree mixes dsh releases: ${releases.sort().join(', ')}`)
  for (const [name, version] of installed) console.log(`         ${name} ${version ?? '(not installed)'}`)
} else if (releases.length === 1) {
  console.log(`[compat] installed tree: ${releases[0]}`)
}

if (failures.length > 0) {
  console.error('\n[compat] the DSH compatibility contract is violated:\n')
  for (const failure of failures) console.error(`  - ${failure}`)
  console.error('\nSee docs/decisions/ADR-0009-dsh-compat-contract.md for what each of these guards.\n')
  process.exit(1)
}

console.log(`[compat] baseline, ${dshPeers.length} DSH peer ranges, dsh.engines.dsh and the installed tree agree`)
