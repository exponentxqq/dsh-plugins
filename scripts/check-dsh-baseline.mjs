/**
 * dsh:check — 仓库级 DSH 基线一致性检查。
 *
 * 这是「统一管理」的静态门禁，和 multi-root 自己的 `compat:check` 分工：
 * 后者守它的精确 allowlist / 精确 peer / 安装树（单点在插件内，本脚本不复制），
 * 本脚本守整个 workspace 的其余事实：
 *
 * 1. `scripts/dsh-baseline.mjs` 的基线是唯一版本常量；
 * 2. 根与四个插件的 DSH devDependencies 都精确 pin 到基线；
 * 3. 三个软插件的 `dsh.engines.dsh` 与全部 DSH peer 都等于派生范围；
 * 4. multi-root 的 `compat:check` 通过，且 allowlist 含基线；
 * 5. 每个插件实际解析到的 DSH 版本都等于基线（不允许混装）；
 * 6. `pnpm-workspace.yaml` 的发布年龄豁免与 lockfile 实际解析集合精确相等；
 * 7. 仓库里没有残留的 git-graph 活引用。
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

// 2. Every plugin's DSH devDependencies pin exactly the baseline, and every
//    plugin agrees on one exact cordis version.
const pins = new Set()
const cordisVersions = new Set()
for (const plugin of plugins) {
  const devs = plugin.manifest.devDependencies ?? {}
  const dshDevs = Object.entries(devs).filter(([name]) => isDshPackage(name))
  if (dshDevs.length === 0) fail(`${plugin.manifest.name} declares no DSH devDependency`)
  for (const [name, version] of dshDevs) {
    pins.add(version)
    if (version !== DSH_BASELINE) fail(`${plugin.manifest.name}: devDependencies["${name}"] is ${version}, expected ${DSH_BASELINE}`)
  }
  if (devs['@deepseek-ai/cordis'] !== undefined) cordisVersions.add(devs['@deepseek-ai/cordis'])
}
if (pins.size !== 1) fail(`DSH devDependencies span several versions: ${[...pins].sort().join(', ')}`)
if (cordisVersions.size !== 1) fail(`cordis devDependencies span several versions: ${[...cordisVersions].sort().join(', ')}`)

// 3. Soft plugins declare the derived range everywhere they advertise DSH.
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

// 4. The exact-contract plugin's own gate, and the allowlist entry behind it.
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

// 5. What is installed here is the baseline everywhere, and nowhere mixed.
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

// 6. The release-age allowlist and the lockfile agree exactly.
const allowances = readAllowances(readFileSync(WORKSPACE, 'utf8'))
const allowanceSet = new Set(allowances)
if (allowanceSet.size !== allowances.length) fail('pnpm-workspace.yaml contains duplicate release-age entries')
const locked = new Set([...readLockedPackages(readFileSync(LOCKFILE, 'utf8'))]
  .filter(entry => isAllowlisted(entry.slice(0, entry.lastIndexOf('@')))))
const missing = [...locked].filter(entry => !allowanceSet.has(entry)).sort()
const stale = allowances.filter(entry => !locked.has(entry)).sort()
for (const entry of missing) fail(`release-age allowlist is missing ${entry}`)
for (const entry of stale) fail(`release-age allowlist has stale ${entry}`)
note(`release-age allowlist: ${allowances.length} entries, lockfile ${locked.size} relevant packages`)

// 7. The removed plugin stays removed.
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
