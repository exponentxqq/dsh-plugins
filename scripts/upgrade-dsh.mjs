/**
 * 根级 DSH 升级引擎：把整个 workspace 重指到一个上游精确版本。
 *
 * 升级车道只回答一个问题：如果 harness 换成版本 X，这套插件是否仍然正确？
 * 回答它需要把**整个仓库**钉到 X：四个插件的 devDependencies、`pnpm-workspace.yaml`
 * 的发布年龄豁免，以及随后由 pnpm 重写的 lockfile。围栏与内核沙箱的方言是针对
 * 实际安装的那份副本验证的，不是针对一个范围。
 *
 * 本脚本**不碰** multi-root 的 `SUPPORTED_DSH_RELEASES` 与精确 peer 枚举：
 * 升级车道绿灯只是「有可能支持」的证据，提升是之后人工做的事（ADR-0009）。
 * 这条分离是契约的全部意义——自动放宽支持矩阵会重新引入它要消除的过度承诺。
 *
 * 默认模式是永久的：重写四个插件的 devDeps / cordis、三个软插件的 engines 与
 * DSH peer 范围、workspace 豁免，并同步 `scripts/dsh-baseline.mjs`。
 * `--probe` 额外追加 workspace-only 的 `overrides:` 块，避免预发布范围在探测
 * 期间解析出混装树；探测结束后用 `git checkout` 恢复，或重跑一次不带 `--probe`
 * 的升级（脚本会移除该块）。
 *
 * ```bash
 * pnpm dsh:upgrade 0.2.1-rc.2 --probe
 * pnpm install --no-frozen-lockfile --config.minimumReleaseAge=0
 * DSH_MULTI_ROOT_COMPAT=warn pnpm --filter dsh-plugin-multi-root-workspace verify:all
 * pnpm dsh:upgrade 0.2.1-rc.2          # 探测通过后移除 overrides
 * ```
 *
 * @module scripts/upgrade-dsh
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DSH_BASELINE, softDshRange } from './dsh-baseline.mjs'
import { npmOutput } from './lib/npm-cli.mjs'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PLUGINS_ROOT = join(REPO_ROOT, 'plugins')
const WORKSPACE = join(REPO_ROOT, 'pnpm-workspace.yaml')
const BASELINE_FILE = join(REPO_ROOT, 'scripts', 'dsh-baseline.mjs')
const CORDIS = '@deepseek-ai/cordis'
const PROBE_BEGIN = '# BEGIN DSH probe overrides'
const PROBE_END = '# END DSH probe overrides'

/** Whether a dependency name belongs to the upstream harness. */
function isDshPackage(name) {
  return name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-')
}

/**
 * Read every workspace plugin.
 *
 * Discovery is dynamic on purpose: removing or adding a plugin must not leave a
 * second hand-maintained inventory in this tool.
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
 * Whether a plugin carries the exact-allowlist contract instead of a soft range.
 *
 * The contract file is the marker, not a hardcoded package name: a future plugin
 * that grows a version allowlist opts into the same "peers untouched" treatment.
 * @param dir - the plugin directory.
 * @returns true when the plugin owns `src/compat/dsh-version.ts`.
 */
function hasExactContract(dir) {
  return existsSync(join(dir, 'src', 'compat', 'dsh-version.ts'))
}

/**
 * The newest published pre-release of `@deepseek-ai/dsh`.
 *
 * npm's `versions` array is in publish order, so the last pre-release entry is
 * the newest one — publish order is what "newest" means for an upgrade probe.
 * @returns the version string.
 */
function latestPrerelease() {
  const raw = npmOutput(['view', '@deepseek-ai/dsh', 'versions', '--json'])
  const versions = JSON.parse(raw)
  const prereleases = versions.filter(version => version.includes('-'))
  const newest = prereleases.at(-1)
  if (newest === undefined) throw new Error('@deepseek-ai/dsh has published no pre-release')
  return newest
}

/**
 * The exact cordis version the pinned `dsh` package declares.
 *
 * Leaving the repository's old cordis pin in the same tree installs two copies
 * of `dsh-tools`; the tool scheduler is a module-local `Symbol`, so tool calls
 * then die on `reading 'prepare'` of `undefined`. The declared range must be a
 * single caret or tilde of one exact version; a wider range is refused rather
 * than guessed.
 * @param dshVersion - the exact `@deepseek-ai/dsh` release being pinned.
 * @returns the exact cordis version to pin.
 */
function cordisRequiredBy(dshVersion) {
  const raw = npmOutput(['view', `@deepseek-ai/dsh@${dshVersion}`, 'dependencies.@deepseek-ai/cordis', '--json'])
  const range = JSON.parse(raw)
  const exact = typeof range === 'string' ? /^[\^~]?(\d+\.\d+\.\d+)$/u.exec(range) : null
  if (exact === null) {
    throw new Error(
      `[upgrade] @deepseek-ai/dsh@${dshVersion} depends on cordis ${JSON.stringify(range)}, `
      + 'which is not a single caret or tilde this script can pin',
    )
  }
  return exact[1]
}

/**
 * Keep `scripts/dsh-baseline.mjs` equal to the target.
 * @param target - the release being pinned.
 * @returns the baseline the file declared before the rewrite.
 */
function repointBaseline(target) {
  const source = readFileSync(BASELINE_FILE, 'utf8')
  const match = /export const DSH_BASELINE = '([^']+)'/u.exec(source)
  if (match === null) throw new Error('[upgrade] scripts/dsh-baseline.mjs has no DSH_BASELINE literal')
  const previous = match[1]
  if (previous === target) return previous
  writeFileSync(BASELINE_FILE, source.replace(match[0], `export const DSH_BASELINE = '${target}'`))
  return previous
}

/**
 * Repoint one plugin's devDependencies, and — for soft plugins only — its
 * declared install contract.
 *
 * The exact-contract plugin keeps its peer enum and allowlist: those are edited
 * by a human after a green probe (ADR-0009). Only its development pin moves.
 * @param plugin - the discovered plugin.
 * @param target - the release to pin.
 * @param cordisVersion - the exact cordis version the release requires.
 * @param softRange - the range to write into soft plugins.
 * @returns human-readable change descriptions.
 */
function repointPlugin(plugin, target, cordisVersion, softRange) {
  const { manifest } = plugin
  const changed = []
  const devs = manifest.devDependencies ?? {}
  for (const [name, version] of Object.entries(devs)) {
    if (isDshPackage(name)) {
      if (version === target) continue
      changed.push(`${name}: ${version} → ${target}`)
      devs[name] = target
    } else if (name === CORDIS && version !== cordisVersion) {
      changed.push(`${name}: ${version} → ${cordisVersion}`)
      devs[name] = cordisVersion
    }
  }
  if (!hasExactContract(plugin.dir)) {
    if (manifest.dsh?.engines?.dsh !== undefined && manifest.dsh.engines.dsh !== softRange) {
      changed.push(`dsh.engines.dsh: ${manifest.dsh.engines.dsh} → ${softRange}`)
      manifest.dsh.engines.dsh = softRange
    }
    const peers = manifest.peerDependencies ?? {}
    for (const [name, range] of Object.entries(peers)) {
      if (!isDshPackage(name) || range === softRange) continue
      changed.push(`peerDependencies["${name}"]: ${range} → ${softRange}`)
      peers[name] = softRange
    }
  }
  if (changed.length > 0) {
    writeFileSync(join(plugin.dir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  }
  return changed
}

/**
 * Repoint the release-age allowances and, in probe mode, pin the known tree.
 *
 * Every upstream release is published minutes before this repository uses it, so
 * `minimumReleaseAge` would otherwise reject it outright (ADR-0002). The upgrade
 * lane additionally installs with `--config.minimumReleaseAge=0`, because a
 * candidate release drags in transitive `@deepseek-ai/*` packages that this
 * text-level rewrite cannot know yet; `pnpm dsh:check` reconciles the exact set
 * afterwards.
 *
 * The probe overrides pin only the DSH packages the plugins actually declare.
 * The target's internal subpackages are exact-pinned by `dsh` itself, so this is
 * enough to keep a probe tree coherent without inventing a second inventory
 * (which would also try to pin packages that no longer exist).
 * @param target - the release to pin.
 * @param cordisVersion - the exact cordis version to write.
 * @param probe - whether to add the workspace-only overrides block.
 * @param plugins - discovered plugins, for the direct DSH dependency set.
 * @returns `{ allowances, probeEntries }`.
 */
function repointWorkspace(target, cordisVersion, probe, plugins) {
  let updated = readFileSync(WORKSPACE, 'utf8')
  let allowances = 0
  updated = updated.replace(/^(\s*- '@deepseek-ai\/dsh(?:-[\w-]+)?)@[^']+'$/gmu, (line, prefix) => {
    allowances += 1
    return `${prefix}@${target}'`
  })
  const cordisLine = /^(\s*- '@deepseek-ai\/cordis@)[^']+'$/mu
  if (!cordisLine.test(updated)) {
    throw new Error('[upgrade] pnpm-workspace.yaml has no @deepseek-ai/cordis release-age entry to repoint')
  }
  updated = updated.replace(cordisLine, `$1${cordisVersion}'`)
  allowances += 1

  // A rerun without --probe removes the block; a rerun with --probe replaces it.
  updated = updated.replace(/\n# BEGIN DSH probe overrides\n[\s\S]*?# END DSH probe overrides\n?/u, '\n')
  const probeEntries = []
  if (probe) {
    if (/^overrides:/mu.test(updated)) {
      throw new Error('[upgrade] workspace has custom overrides; merge probe pins explicitly instead of replacing them')
    }
    const names = new Set(['@deepseek-ai/dsh'])
    for (const plugin of plugins) {
      for (const field of ['devDependencies', 'peerDependencies']) {
        for (const name of Object.keys(plugin.manifest[field] ?? {})) {
          if (isDshPackage(name)) names.add(name)
        }
      }
    }
    const sorted = [...names].sort()
    probeEntries.push(CORDIS, ...sorted)
    updated = `${updated.trimEnd()}\n\n${PROBE_BEGIN}\noverrides:\n`
      + `  '${CORDIS}': '${cordisVersion}'\n`
      + sorted.map(name => `  '${name}': '${target}'\n`).join('')
      + `${PROBE_END}\n`
  }
  writeFileSync(WORKSPACE, updated)
  return { allowances, probeEntries }
}

/**
 * Report what each declared DSH package actually RESOLVED to, per plugin.
 *
 * The declared pin and the resolved tree are different facts, and only the
 * second one is what the tests ran against.
 */
function printInstalled() {
  const resolved = {}
  for (const plugin of listPlugins()) {
    const require = createRequire(join(plugin.dir, 'package.json'))
    const declared = { ...plugin.manifest.dependencies, ...plugin.manifest.devDependencies, ...plugin.manifest.peerDependencies }
    for (const name of Object.keys(declared).filter(isDshPackage).sort()) {
      let version
      try {
        version = require(`${name}/package.json`).version
      } catch {
        version = null
      }
      const entry = (resolved[name] ??= [])
      if (!entry.includes(version)) entry.push(version)
    }
  }
  for (const versions of Object.values(resolved)) versions.sort()
  console.log(JSON.stringify(resolved, null, 2))
}

const argv = process.argv.slice(2)
let probe = false
const positional = []
for (const argument of argv) {
  if (argument === '--probe') probe = true
  else if (argument === '--print-installed') {
    printInstalled()
    process.exit(0)
  } else if (argument === '--print-latest-prerelease') {
    console.log(latestPrerelease())
    process.exit(0)
  } else if (argument === '--latest-prerelease') {
    positional.push(latestPrerelease())
  } else if (argument.startsWith('--')) {
    console.error(`[upgrade] unknown flag: ${argument}`)
    process.exit(2)
  } else {
    positional.push(argument)
  }
}

const target = positional[0] ?? DSH_BASELINE
if (positional.length > 1) {
  console.error('usage: node scripts/upgrade-dsh.mjs [<version>|--latest-prerelease] [--probe] | --print-installed | --print-latest-prerelease')
  process.exit(2)
}
if (!/^\d+\.\d+\.\d+(?:-[\w.]+)?$/u.test(target)) {
  console.error(`[upgrade] "${target}" is not an exact version`)
  process.exit(2)
}

const softRange = softDshRange(target)
const cordisVersion = cordisRequiredBy(target)
const previousBaseline = repointBaseline(target)
const plugins = listPlugins()
const changes = []
for (const plugin of plugins) {
  for (const entry of repointPlugin(plugin, target, cordisVersion, softRange)) {
    changes.push(`${plugin.manifest.name}: ${entry}`)
  }
}
const { allowances, probeEntries } = repointWorkspace(target, cordisVersion, probe, plugins)

console.log(`[upgrade] baseline: ${previousBaseline} → ${target}`)
console.log(`[upgrade] soft plugin range: ${softRange}`)
console.log(`[upgrade] cordis pin: ${cordisVersion}`)
console.log(`[upgrade] manifest entries rewritten: ${changes.length}`)
for (const entry of changes) console.log(`           ${entry}`)
console.log(`[upgrade] release-age allowances rewritten: ${allowances}`)
if (probe) {
  console.log(`[upgrade] probe overrides written: ${probeEntries.length} entries`)
} else {
  console.log('[upgrade] probe overrides: absent')
}
console.log('[upgrade] next: pnpm install --no-frozen-lockfile --config.minimumReleaseAge=0')
console.log('[upgrade] probe: DSH_MULTI_ROOT_COMPAT=warn pnpm --filter dsh-plugin-multi-root-workspace verify:all')
console.log(`[upgrade] after green (human): append '${target}' to SUPPORTED_DSH_RELEASES and every multi-root peerDependency,`)
console.log('[upgrade]                    then pnpm --filter dsh-plugin-multi-root-workspace compat:check')
console.log('[upgrade] remove probe overrides by rerunning without --probe (or git checkout -- pnpm-workspace.yaml)')
