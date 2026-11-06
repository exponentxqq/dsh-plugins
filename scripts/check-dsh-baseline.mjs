/**
 * dsh:check — 仓库级 DSH 基线一致性检查。
 *
 * 这是「统一管理」的静态门禁，和 multi-root 自己的 `compat:check` 分工：
 * 后者守它的精确 allowlist / 精确 peer / 安装树（单点在插件内，本脚本不复制），
 * 本脚本守整个 workspace 的其余事实：
 *
 * 1. `scripts/dsh-baseline.mjs` 的基线是唯一版本常量；
 * 2. `pnpm-workspace.yaml` 的 `catalog:` 工具链册与 `catalogs.dsh` 基线册成形，
 *    且后者的 DSH 家族等于基线、cordis 与 schemastery 等于基线派生值；
 * 3. 根与全部插件的 DSH devDependencies 归一化 catalog 引用后等于基线；
 * 4. 六个软插件的 DSH 家族、cordis、schemastery devDependencies 必须引用
 *    `catalog:dsh`，残留字面量即失败（精确契约插件按 upgrade-dsh 同口径豁免）；
 * 5. 六个软插件的 `dsh.engines.dsh` 与全部 DSH peer 都等于派生范围；
 * 6. multi-root 的 `compat:check` 通过，且 allowlist 含基线；
 * 7. 每个插件实际解析到的 DSH 版本都等于基线（不允许混装）；
 * 8. `pnpm-workspace.yaml` 的发布年龄豁免与 lockfile 实际解析集合精确相等；
 * 9. 仓库里没有残留的 git-graph 活引用。
 *
 * 全部失败会一次列出，而不是遇到第一个就退出；这样一次运行就能修完。
 *
 * @module scripts/check-dsh-baseline
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DSH_BASELINE, softDshRange } from './dsh-baseline.mjs'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PLUGINS_ROOT = join(REPO_ROOT, 'plugins')
const WORKSPACE = join(REPO_ROOT, 'pnpm-workspace.yaml')
const LOCKFILE = join(REPO_ROOT, 'pnpm-lock.yaml')
const SOFT_RANGE = softDshRange()

const failures = []
const notes = []

/** Record a violation. */
function fail(message) {
  failures.push(message)
}

/** Record a passing fact worth printing. */
function note(message) {
  notes.push(message)
}

/** Whether a dependency name belongs to the upstream harness. */
function isDshPackage(name) {
  return name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-')
}

/**
 * Whether a dependency name belongs to the DSH baseline catalog's family.
 *
 * The named `dsh` shelf is the single point an upgrade rewrites, so these three
 * families must reference it by name: a literal is silent drift even when its
 * value happens to equal today's baseline. The toolchain shelf (`catalog:`) is
 * deliberately not part of this family — it is raised by hand.
 * @param name - the dependency name.
 * @returns true for the DSH family, cordis and schemastery.
 */
function isBaselineFamily(name) {
  return isDshPackage(name)
    || name === '@deepseek-ai/cordis'
    || name === '@deepseek-ai/schemastery'
}

/**
 * Whether a package name belongs in the release-age allowlist.
 *
 * The allowlist is not "every @deepseek-ai package": it is the DSH release line,
 * the two non-DSH packages the repository pins (cordis, schemastery), and the
 * host document tooling that ships alongside 0.2. Keeping the rule here makes
 * the check and the one-time reconciliation agree on what "exact" means.
 * @param name - the package name.
 * @returns true when the package must have an exact release-age entry.
 */
function isAllowlisted(name) {
  return name.startsWith('@deepseek-ai/dsh')
    || name === '@deepseek-ai/cordis'
    || name === '@deepseek-ai/schemastery'
    || name.startsWith('@deepseek-ai/libreoffice-kit')
}

/**
 * Read every workspace plugin.
 * @returns `{ dir, manifest }` entries sorted by package name.
 */
function listPlugins() {
  return readdirSync(PLUGINS_ROOT, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && existsSync(join(PLUGINS_ROOT, entry.name, 'package.json')))
    .map((entry) => {
      const dir = join(PLUGINS_ROOT, entry.name)
      return { dir, manifest: JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) }
    })
    .sort((left, right) => left.manifest.name.localeCompare(right.manifest.name))
}

/**
 * Read the `minimumReleaseAgeExclude` entries from the workspace YAML as text.
 *
 * A parse-and-dump round trip would drop the comments that explain the two
 * sections; the check only needs the data, so a line scan is enough.
 * @param source - the workspace file's text.
 * @returns the `name@version` entries, in file order.
 */
function readAllowances(source) {
  const entries = []
  let inBlock = false
  for (const line of source.split('\n')) {
    if (!inBlock) {
      if (line.trim() === 'minimumReleaseAgeExclude:') inBlock = true
      continue
    }
    if (/^\S/u.test(line) && !line.startsWith('#')) break
    const match = /^\s*- '([^']+)'$/u.exec(line)
    if (match !== null) entries.push(match[1])
  }
  return entries
}

/**
 * Read the exact `name@version` set resolved in the lockfile's `packages:` block.
 *
 * `packages:` keys are unique by name@version (the peer-context suffixes live in
 * `snapshots:`), which is exactly the granularity the age gate takes.
 * @param source - the lockfile text.
 * @returns the set of resolved package identifiers.
 */
function readLockedPackages(source) {
  const packages = new Set()
  let inBlock = false
  for (const line of source.split('\n')) {
    if (!inBlock) {
      if (line === 'packages:') inBlock = true
      continue
    }
    if (/^\S/u.test(line)) break
    const match = /^  '?((?:@[^/]+\/)?[^@']+)@([^:']+)'?:$/u.exec(line)
    if (match !== null) packages.add(`${match[1]}@${match[2]}`)
  }
  return packages
}

/**
 * Read the two catalogs declared by `pnpm-workspace.yaml`.
 *
 * Both shelves stay small and hand-formatted (the comments explain the split),
 * so a targeted line scan keeps the file's comments intact: the top-level
 * `catalog:` is the toolchain shelf, `catalogs.dsh` is the DSH baseline shelf
 * that `pnpm dsh:upgrade` rewrites as its single source of truth.
 * @param source - the workspace file's text.
 * @returns `{ default: Map, dsh: Map }` of package name → declared version.
 */
function readCatalog(source) {
  const catalogs = { default: new Map(), dsh: new Map() }
  let block = null
  let named = null
  for (const line of source.split('\n')) {
    if (/^\S/u.test(line)) {
      block = line === 'catalog:' ? 'default' : line === 'catalogs:' ? 'named' : null
      named = null
      continue
    }
    if (block === null) continue
    if (block === 'named') {
      const match = /^  ([\w-]+):$/u.exec(line)
      if (match !== null) {
        named = match[1]
        continue
      }
      if (named !== 'dsh') continue
    }
    const entry = /^\s+'?((?:@[^/']+\/)?[^':]+)'?:\s+'?([^'\s]+)'?\s*$/u.exec(line)
    if (entry !== null) {
      const target = block === 'default' ? catalogs.default : catalogs.dsh
      target.set(entry[1], entry[2])
    }
  }
  return catalogs
}

/**
 * Resolve a `catalog:` / `catalog:dsh` reference to the shelf's actual version.
 *
 * A literal version is returned untouched — literals stay legal for the
 * exact-contract plugin (multi-root never joins the catalogs), while the six
 * soft plugins are expected to reference the shelves.
 * @param name - the dependency name the reference belongs to.
 * @param value - the declared devDependency value.
 * @param catalog - the parsed shelves from `readCatalog`.
 * @returns the catalog version, or undefined when the reference has no entry.
 */
function normalizeDep(name, value, catalog) {
  if (value === 'catalog:') return catalog.default.get(name)
  if (value === 'catalog:dsh') return catalog.dsh.get(name)
  const other = /^catalog:([^:]+)$/u.exec(value)
  if (other !== null) throw new Error(`unknown catalog reference "catalog:${other[1]}"`)
  return value
}

/**
 * The exact version a candidate package's tilde/caret declaration resolves to.
 *
 * Mirrors `scripts/upgrade-dsh.mjs`: only a single caret or tilde of one exact
 * version is accepted, so the catalog value is always the package's declared
 * pin rather than a guess.
 * @param declaration - the declared range (or undefined).
 * @returns the exact version, or null when the declaration is not pivoted.
 */
function exactFromDeclaration(declaration) {
  const match = typeof declaration === 'string' ? /^[\^~]?(\d+\.\d+\.\d+)$/u.exec(declaration) : null
  return match === null ? null : match[1]
}

/**
 * The manifest of a package as installed somewhere in the workspace tree.
 *
 * `@deepseek-ai/dsh` and `@deepseek-ai/dsh-tools` are not declared by every
 * plugin, so resolution walks the discovered plugins until one succeeds — the
 * installed tree is the offline source of the baseline-derived pins.
 * @param name - the installed package name.
 * @returns the parsed manifest, or null when nothing resolves it.
 */
function installedManifest(name) {
  for (const plugin of plugins) {
    try {
      return createRequire(join(plugin.dir, 'package.json'))(`${name}/package.json`)
    } catch {
      continue
    }
  }
  return null
}

/**
 * Resolve the DSH version each plugin's declared DSH packages actually load.
 * @param plugin - a discovered plugin.
 * @returns `name → version` (null when resolution fails).
 */
function resolvedByPlugin(plugin) {
  const require = createRequire(join(plugin.dir, 'package.json'))
  const declared = { ...plugin.manifest.dependencies, ...plugin.manifest.devDependencies, ...plugin.manifest.peerDependencies }
  const resolved = {}
  for (const name of Object.keys(declared).filter(isDshPackage).sort()) {
    try {
      resolved[name] = require(`${name}/package.json`).version
    } catch {
      resolved[name] = null
    }
  }
  return resolved
}

const plugins = listPlugins()
const hardPlugins = plugins.filter(plugin => existsSync(join(plugin.dir, 'src', 'compat', 'dsh-version.ts')))
const softPlugins = plugins.filter(plugin => !hardPlugins.includes(plugin))

if (plugins.length === 0) fail('no workspace plugins were discovered')
if (hardPlugins.length !== 1) fail(`expected exactly one exact-contract plugin, found ${hardPlugins.length}`)
if (softPlugins.length === 0) fail('expected at least one soft plugin')

// 1. The baseline itself is one exact version, and the derived range is sane.
if (!/^\d+\.\d+\.\d+(?:-[\w.]+)?$/u.test(DSH_BASELINE)) {
  fail(`DSH_BASELINE "${DSH_BASELINE}" is not an exact version`)
} else {
  note(`baseline: ${DSH_BASELINE} (soft range ${SOFT_RANGE})`)
}

// 2. The catalog shelves name the baseline (and the baseline-derived cordis /
//    schemastery pins).
const workspaceSource = readFileSync(WORKSPACE, 'utf8')
const catalogs = readCatalog(workspaceSource)
const dshManifest = installedManifest('@deepseek-ai/dsh')
const dshToolsManifest = installedManifest('@deepseek-ai/dsh-tools')
const derivedCordis = exactFromDeclaration(dshManifest?.dependencies?.['@deepseek-ai/cordis'])
const derivedSchemastery = exactFromDeclaration(dshToolsManifest?.dependencies?.['@deepseek-ai/schemastery'])

if (derivedCordis === null) {
  fail('cannot derive the cordis pin from the installed @deepseek-ai/dsh tree (run pnpm install)')
}
if (derivedSchemastery === null) {
  fail('cannot derive the schemastery pin from the installed @deepseek-ai/dsh-tools tree (run pnpm install)')
}
if (catalogs.dsh.size === 0) fail('pnpm-workspace.yaml declares no catalogs.dsh entries')
for (const [name, version] of [...catalogs.dsh].sort()) {
  if (isDshPackage(name)) {
    if (version !== DSH_BASELINE) fail(`catalogs.dsh["${name}"] is ${version}, expected ${DSH_BASELINE}`)
  } else if (name === '@deepseek-ai/cordis') {
    if (derivedCordis !== null && version !== derivedCordis) {
      fail(`catalogs.dsh["${name}"] is ${version}, expected the baseline-derived ${derivedCordis}`)
    }
  } else if (name === '@deepseek-ai/schemastery') {
    if (derivedSchemastery !== null && version !== derivedSchemastery) {
      fail(`catalogs.dsh["${name}"] is ${version}, expected the baseline-derived ${derivedSchemastery}`)
    }
  } else {
    fail(`catalogs.dsh["${name}"] is not part of the DSH baseline family`)
  }
}
note(`catalogs: ${catalogs.default.size} toolchain entries, ${catalogs.dsh.size} DSH entries`)

/** Normalize one declared value, recording a failure instead of throwing. */
function normalized(name, value) {
  try {
    const resolved = normalizeDep(name, value, catalogs)
    if (resolved === undefined) {
      fail(`${name}: "${value}" has no matching catalog entry`)
      return value
    }
    return resolved
  } catch (error) {
    fail(`${name}: ${error.message}`)
    return value
  }
}

// 3. Every plugin's DSH devDependencies normalize to exactly the baseline, and
//    every plugin agrees on one exact cordis version.
const pins = new Set()
const cordisVersions = new Set()
for (const plugin of plugins) {
  const devs = plugin.manifest.devDependencies ?? {}
  const dshDevs = Object.entries(devs).filter(([name]) => isDshPackage(name))
  if (dshDevs.length === 0) fail(`${plugin.manifest.name} declares no DSH devDependency`)
  for (const [name, version] of dshDevs) {
    const resolved = normalized(name, version)
    pins.add(resolved)
    if (resolved !== DSH_BASELINE) {
      fail(`${plugin.manifest.name}: devDependencies["${name}"] is ${version} (${resolved}), expected ${DSH_BASELINE}`)
    }
  }
  if (devs['@deepseek-ai/cordis'] !== undefined) {
    cordisVersions.add(normalized('@deepseek-ai/cordis', devs['@deepseek-ai/cordis']))
  }
}
if (pins.size !== 1) fail(`DSH devDependencies span several versions: ${[...pins].sort().join(', ')}`)
if (cordisVersions.size !== 1) fail(`cordis devDependencies span several versions: ${[...cordisVersions].sort().join(', ')}`)

// 4. Soft plugins must reference the named catalog, not a literal version: a
//    literal equal to today's baseline would pass the value assertion above and
//    silently drift on the next upgrade. Same exemption and family scope as
//    `residualLiterals` in scripts/upgrade-dsh.mjs — the exact-contract plugin
//    keeps its literal pins (ADR-0009), and toolchain keys are out of scope.
for (const plugin of softPlugins) {
  const devs = plugin.manifest.devDependencies ?? {}
  for (const [name, version] of Object.entries(devs)) {
    if (!isBaselineFamily(name) || version === 'catalog:dsh') continue
    fail(`${plugin.manifest.name}: devDependencies["${name}"] is "${version}", expected "catalog:dsh"`)
  }
}

// 5. Soft plugins declare the derived range everywhere they advertise DSH.
for (const plugin of softPlugins) {
  const name = plugin.manifest.name
  const declared = plugin.manifest.dsh?.engines?.dsh
  if (declared === undefined) fail(`${name}: dsh.engines.dsh is missing`)
  else if (declared !== SOFT_RANGE) fail(`${name}: dsh.engines.dsh is "${declared}", expected "${SOFT_RANGE}"`)
  const peers = plugin.manifest.peerDependencies ?? {}
  if (!('@deepseek-ai/dsh' in peers)) fail(`${name}: peerDependencies does not declare @deepseek-ai/dsh`)
  for (const [peer, range] of Object.entries(peers)) {
    if (isDshPackage(peer) && range !== SOFT_RANGE) {
      fail(`${name}: peerDependencies["${peer}"] is "${range}", expected "${SOFT_RANGE}"`)
    }
  }
}

// 6. The exact-contract plugin's own gate, and the allowlist entry behind it.
for (const plugin of hardPlugins) {
  const contract = join(plugin.dir, 'src', 'compat', 'dsh-version.ts')
  const source = readFileSync(contract, 'utf8')
  const match = /export const SUPPORTED_DSH_RELEASES = \[([^\]]*)\]/u.exec(source)
  const listed = match === null ? [] : [...match[1].matchAll(/'([^']+)'/gu)].map(token => token[1])
  if (!listed.includes(DSH_BASELINE)) fail(`${plugin.manifest.name}: SUPPORTED_DSH_RELEASES does not include ${DSH_BASELINE}`)
  try {
    execFileSync(process.execPath, [join(plugin.dir, 'scripts', 'check-dsh-compat.mjs')], {
      cwd: plugin.dir,
      stdio: 'inherit',
    })
  } catch {
    fail(`${plugin.manifest.name}: compat:check failed (see its output above)`)
  }
}

// 7. What is installed here is the baseline everywhere, and nowhere mixed.
const installed = new Map()
for (const plugin of plugins) {
  for (const [name, version] of Object.entries(resolvedByPlugin(plugin))) {
    if (!installed.has(name)) installed.set(name, new Set())
    installed.get(name).add(version)
  }
}
for (const [name, versions] of installed) {
  for (const version of versions) {
    if (version === null) fail(`${name} is declared but not installed (run pnpm install)`)
    else if (version !== DSH_BASELINE) fail(`${name} resolves to ${version}, expected ${DSH_BASELINE}`)
  }
}
note(`installed DSH packages: ${installed.size} names, all ${DSH_BASELINE}`)

// 8. The release-age allowlist and the lockfile agree exactly.
const allowances = readAllowances(workspaceSource)
const allowanceSet = new Set(allowances)
if (allowanceSet.size !== allowances.length) fail('pnpm-workspace.yaml contains duplicate release-age entries')
const locked = new Set([...readLockedPackages(readFileSync(LOCKFILE, 'utf8'))]
  .filter(entry => isAllowlisted(entry.slice(0, entry.lastIndexOf('@')))))
const missing = [...locked].filter(entry => !allowanceSet.has(entry)).sort()
const stale = allowances.filter(entry => !locked.has(entry)).sort()
for (const entry of missing) fail(`release-age allowlist is missing ${entry}`)
for (const entry of stale) fail(`release-age allowlist has stale ${entry}`)
note(`release-age allowlist: ${allowances.length} entries, lockfile ${locked.size} relevant packages`)

// 9. The removed plugin stays removed.
if (existsSync(join(PLUGINS_ROOT, 'git-graph-multi'))) fail('plugins/git-graph-multi still exists')
const suspect = ['README.md', 'AGENTS.md']
for (const entry of readdirSync(join(REPO_ROOT, 'scripts'), { withFileTypes: true })) {
  // 本检查器自己的匹配模式就是这些字面量，不能把自己判成残留引用。
  if (entry.isFile() && /\.(?:mjs|js)$/u.test(entry.name) && entry.name !== 'check-dsh-baseline.mjs') {
    suspect.push(join('scripts', entry.name))
  }
}
for (const file of suspect) {
  const text = readFileSync(join(REPO_ROOT, file), 'utf8')
  if (/dsh-plugin-git-graph-multi|dsh-multi-repo-git-graph|git-graph-multi/u.test(text)) {
    fail(`${file} still references the removed git-graph plugin`)
  }
}

for (const message of notes) console.log(`[dsh:check] ${message}`)

if (failures.length > 0) {
  console.error('\n[dsh:check] the DSH baseline is inconsistent:\n')
  for (const failure of failures) console.error(`  - ${failure}`)
  console.error('\nRun `pnpm install --frozen-lockfile` or reconcile the listed files, then retry.\n')
  process.exit(1)
}

console.log('[dsh:check] baseline, pins, soft ranges, allowlist, lockfile and installed tree agree')
