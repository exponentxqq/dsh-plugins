/**
 * 产物契约门禁与迁移等价性工具（R8）。
 *
 * 三模式：
 *
 * ```
 * node scripts/check-artifacts.mjs                        # 门禁模式（B1–B5）
 * node scripts/check-artifacts.mjs --write-baseline DIR   # 先过门禁，再冻结基线快照
 * node scripts/check-artifacts.mjs --baseline DIR         # 门禁 + 模块词集合比对（B6）
 * ```
 *
 * B1–B6 的契约见 `openspec/changes/optimize-architecture/code-design.md` ③.4。
 * 快照按包名落盘（`<DIR>/<包名>.json`），形状：
 *
 * ```json
 * {
 *   "package": "dsh-plugin-project-mcp",
 *   "host": { "words": ["node:fs"], "sha256": "…" },
 *   "client": { "words": [], "sha256": null }
 * }
 * ```
 *
 * 语义判定只看**模块词集合**（逐字相等）；`sha256` 只作证据与漂移提示——
 * 迁移期注入顺序与 css 属性变更会改字节，不会改模块词。
 *
 * 退出码：0 通过；1 断言失败；2 用法错误。失败一次列全，不遇到第一个就退出。
 *
 * @module scripts/check-artifacts
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { isBuiltin } from 'node:module'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { moduleWords, readArtifact, requiredWords, sha256 } from './lib/artifacts.mjs'

/** 仓库根（`scripts/` 的上一级）。 */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
/** 插件根目录。 */
const PLUGINS_ROOT = join(REPO_ROOT, 'plugins')

/**
 * 浏览器半允许出现的模块词（B5，与各包 `build.mjs` 的 `CLIENT_EXTERNALS` 对应）。
 *
 * `react-dom` 在 external 名单里但不是每个产物都用到，所以是「允许」而非「必须」。
 */
const CLIENT_ALLOWED_REQUIRES = [
  '@deepseek-ai/dsh-client-ui-primitives',
  'react',
  'react-dom',
  'react/jsx-runtime',
]

/** 浏览器半**绝对不得** require 的模块词（B5/D2）：它没有 client 导出。 */
const CLIENT_FORBIDDEN_REQUIRES = ['@deepseek-ai/dsh-client-ui-slots']

/** 内部包作用域（B3）：运行时出现即说明内部包没被内联干净。 */
const INTERNAL_SCOPE = '@dsh-plugins/'

/** 命令用法。 */
const USAGE = `用法：
  node scripts/check-artifacts.mjs                        # 产物契约门禁（B1–B5）
  node scripts/check-artifacts.mjs --write-baseline DIR   # 先过门禁，再冻结基线快照
  node scripts/check-artifacts.mjs --baseline DIR         # 门禁 + 模块词集合逐字比对（B6）`

/**
 * 读取全部 workspace 插件（`plugins/*` 下有 `package.json` 的目录）。
 * @returns `{ dir, manifest }`，按包名排序。
 */
function listPlugins() {
  return readdirSync(PLUGINS_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(PLUGINS_ROOT, entry.name, 'package.json')))
    .map((entry) => {
      const dir = join(PLUGINS_ROOT, entry.name)
      return { dir, manifest: JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) }
    })
    .sort((left, right) => left.manifest.name.localeCompare(right.manifest.name))
}

/**
 * 列出 `lib/` 下全部 `.js` 产物（递归）。
 * @param root - 包目录。
 * @returns 产物绝对路径，按路径排序。
 */
function listArtifactJs(root) {
  const lib = join(root, 'lib')
  if (!existsSync(lib)) return []
  const files = []
  /** @param {string} dir - 当前目录。 */
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const absolute = join(dir, entry.name)
      if (entry.isDirectory()) walk(absolute)
      else if (entry.isFile() && entry.name.endsWith('.js')) files.push(absolute)
    }
  }
  walk(lib)
  return files.sort()
}

/**
 * 把绝对路径转成相对包目录的 POSIX 路径（`files` 里的写法）。
 * @param root - 包目录。
 * @param absolute - 绝对路径。
 * @returns 相对路径（`/` 分隔）。
 */
function toPosixRelative(root, absolute) {
  return relative(root, absolute).split(sep).join('/')
}

/**
 * 把 `files` 里的 glob 转成正则（只支持 `**`、`*`、`?`，与 npm 的常见用法一致）。
 * @param pattern - 包内相对 glob。
 * @returns 匹配该 glob 的正则。
 */
function globToRegExp(pattern) {
  let source = ''
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]
    if (char === '*') {
      if (pattern[index + 1] === '*') {
        index += 1
        if (pattern[index + 1] === '/') {
          index += 1
          source += '(?:[^/]+/)*'
        } else {
          source += '.*'
        }
      } else {
        source += '[^/]*'
      }
    } else if (char === '?') {
      source += '[^/]'
    } else {
      source += char.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
    }
  }
  return new RegExp(`^${source}$`, 'u')
}

/**
 * 取 `manifest` 的声明入口文件（跳过 `./src/*` 这类 glob 目标）。
 * @param manifest - 包清单。
 * @returns 相对路径列表。
 */
function declaredEntryFiles(manifest) {
  const files = []
  if (typeof manifest.main === 'string') files.push(manifest.main)
  const exportsField = manifest.exports
  if (typeof exportsField === 'string') files.push(exportsField)
  else if (exportsField !== null && typeof exportsField === 'object') {
    for (const value of Object.values(exportsField)) {
      if (typeof value === 'string') files.push(value)
      else if (value !== null && typeof value === 'object') {
        for (const field of ['default', 'types']) {
          if (typeof value[field] === 'string') files.push(value[field])
        }
      }
    }
  }
  return files.filter((file) => !file.includes('*'))
}

/**
 * 一个包声明的全部依赖名（deps / devDeps / peers / optionalDeps）。
 * @param manifest - 包清单。
 * @returns 依赖名集合。
 */
function declaredDependencyNames(manifest) {
  const names = new Set()
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const name of Object.keys(manifest[field] ?? {})) names.add(name)
  }
  return names
}

/**
 * 判断一个模块词是否允许出现在宿主产物里（B2）。
 *
 * 设计的字面表述是「`node:` 前缀或本包声明依赖」。未改动的树上还有两类
 * 合法词，属于断言必须修正的过严（不是跳过）：
 *
 * - Node 内建裸词（`buffer` / `process`）：esbuild 内联 CJS 依赖后的
 *   `require("buffer")`，不是外部包，无需声明；
 * - 相对内部块（`./command-xY2RrFLs.js`）：tsdown 的代码分块，属于包自身。
 * @param word - 模块词。
 * @param declared - 本包声明的依赖名集合。
 * @returns 是否允许。
 */
function isAllowedHostWord(word, declared) {
  if (word.startsWith('node:')) return true
  if (isBuiltin(word)) return true
  if (word.startsWith('./') || word.startsWith('../')) return true
  return declared.has(word)
}

/**
 * 检查一个包的产物契约（B1–B5），并返回基线所需的词集合与摘要。
 * @param plugin - `{ dir, manifest }`。
 * @returns `{ failures, snapshot }`；`snapshot` 形状与基线文件一致。
 */
function inspectPackage(plugin) {
  const { dir, manifest } = plugin
  const name = manifest.name
  const failures = []
  /** @param {string} message - 失败信息。 */
  const fail = (message) => failures.push(`${name}: ${message}`)

  // B1：声明入口在磁盘存在；files 覆盖 cordis.patch.yml 与全部 lib JS 产物。
  for (const file of declaredEntryFiles(manifest)) {
    if (!existsSync(join(dir, file))) fail(`B1 声明入口不存在：${file}`)
  }
  const filePatterns = (Array.isArray(manifest.files) ? manifest.files : []).filter((entry) => typeof entry === 'string')
  const fileMatchers = filePatterns.map(globToRegExp)
  if (!existsSync(join(dir, 'cordis.patch.yml'))) fail('B1 cordis.patch.yml 不在磁盘上')
  if (!fileMatchers.some((matcher) => matcher.test('cordis.patch.yml'))) {
    fail('B1 files 未包含 cordis.patch.yml')
  }
  const artifactFiles = listArtifactJs(dir)
  for (const absolute of artifactFiles) {
    const file = toPosixRelative(dir, absolute)
    if (!fileMatchers.some((matcher) => matcher.test(file))) fail(`B1 files 未覆盖产物：${file}`)
  }

  // B2：宿主产物 lib/index.js 的模块词都是内建 / 相对块 / 已声明依赖。
  /** @type {{ words: string[], sha256: string } | null} */
  let host = null
  if (!existsSync(join(dir, 'lib', 'index.js'))) {
    fail('B2 宿主产物缺失：lib/index.js')
  } else {
    try {
      const source = readArtifact(dir, 'index.js')
      const words = moduleWords(source)
      const declared = declaredDependencyNames(manifest)
      for (const word of words) {
        if (!isAllowedHostWord(word, declared)) fail(`B2 宿主产物含未声明的外部词：${word}`)
      }
      host = { words, sha256: sha256(source) }
    } catch (error) {
      fail(`B2 读取 lib/index.js 失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // B3：任一 JS 产物都不含内部包作用域词。
  for (const absolute of artifactFiles) {
    let source
    try {
      source = readFileSync(absolute, 'utf8')
    } catch (error) {
      fail(`B3 读取 ${toPosixRelative(dir, absolute)} 失败：${error instanceof Error ? error.message : String(error)}`)
      continue
    }
    if (source.includes(INTERNAL_SCOPE)) fail(`B3 产物含内部包作用域词：${toPosixRelative(dir, absolute)}`)
  }

  // B4/B5：声明 dsh.client 的包必须带合规的浏览器半。
  /** @type {{ words: string[], sha256: string | null }} */
  let client = { words: [], sha256: null }
  if (manifest.dsh?.client !== undefined) {
    if (!existsSync(join(dir, 'lib', 'client.js'))) {
      fail('B4 声明了 dsh.client 但缺少 lib/client.js')
    } else {
      try {
        const source = readArtifact(dir, 'client.js')
        if (!source.startsWith('window.__ModuleLoader__.load({')) {
          fail('B4 lib/client.js 不以 window.__ModuleLoader__.load({ 开头')
        }
        if (!source.includes(`id: ${JSON.stringify(name)}`)) {
          fail(`B4 lib/client.js 的 id 不等于包名 ${name}`)
        }
        const head = source.split(/\r?\n/u, 5).join('\n')
        if (!head.includes('factory: (require) => {')) {
          fail('B4 factory: (require) => { 不在 lib/client.js 首 5 行内')
        }
        const requires = requiredWords(source)
        for (const word of requires) {
          if (!CLIENT_ALLOWED_REQUIRES.includes(word)) fail(`B5 浏览器半 require 了不允许的模块词：${word}`)
        }
        for (const word of CLIENT_FORBIDDEN_REQUIRES) {
          if (requires.includes(word)) fail(`B5 浏览器半不得 require ${word}（D2）`)
        }
        client = { words: moduleWords(source), sha256: sha256(source) }
      } catch (error) {
        fail(`B4 读取 lib/client.js 失败：${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  return { failures, snapshot: { package: name, host, client } }
}

/**
 * 读取并校验一个基线快照文件。
 * @param baselineDir - 快照目录。
 * @param name - 包名。
 * @returns `{ snapshot }` 或 `{ failure }`。
 */
function loadSnapshot(baselineDir, name) {
  const file = join(baselineDir, `${name}.json`)
  if (!existsSync(file)) return { failure: `${name}: 基线快照缺失：${file}` }
  try {
    return { snapshot: JSON.parse(readFileSync(file, 'utf8')) }
  } catch (error) {
    return { failure: `${name}: 基线快照不是合法 JSON（${file}）：${error instanceof Error ? error.message : String(error)}` }
  }
}

/**
 * B6：一个包的模块词集合与快照逐字相等（sha256 漂移只提示）。
 * @param snapshot 当前产物快照。
 * @param baseline 冻结的基线快照。
 * @param name 包名。
 * @param shaNotes - 收集 sha256 漂移提示的数组。
 * @returns 失败信息列表。
 */
function compareWords(snapshot, baseline, name, shaNotes) {
  const failures = []
  if (baseline.package !== name) {
    failures.push(`${name}: 基线快照的 package 字段是 ${JSON.stringify(baseline.package)}`)
  }
  const sides = [
    ['host', snapshot.host, baseline.host],
    ['client', snapshot.client, baseline.client],
  ]
  for (const [side, current, frozen] of sides) {
    if (current === null) {
      failures.push(`${name}: 当前没有 ${side} 产物，无法比对`)
      continue
    }
    const currentWords = current.words ?? []
    const frozenWords = Array.isArray(frozen?.words) ? frozen.words : null
    const wordsEqual = frozenWords !== null && JSON.stringify(currentWords) === JSON.stringify(frozenWords)
    if (frozenWords === null) {
      failures.push(`${name}: 基线快照缺少 ${side}.words`)
    } else if (!wordsEqual) {
      failures.push(
        `${name}: ${side}.words 与基线不相等\n      基线：${JSON.stringify(frozenWords)}\n      当前：${JSON.stringify(currentWords)}`,
      )
    }
    if (wordsEqual && current.sha256 !== (frozen?.sha256 ?? null)) {
      shaNotes.push(`${name}: ${side} sha256 变化（模块词不变，仅提示）`)
    }
  }
  return failures
}

/**
 * 解析命令行参数。
 * @param argv - `process.argv.slice(2)`。
 * @returns `{ mode, dir? }` 或 `{ error }`。
 */
function parseArgs(argv) {
  if (argv.length === 0) return { mode: 'gate' }
  if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) return { mode: 'help' }
  if (argv.length === 2 && (argv[0] === '--write-baseline' || argv[0] === '--baseline')) {
    if (argv[1].trim() === '') return { error: `${argv[0]} 需要一个目录参数` }
    return { mode: argv[0] === '--write-baseline' ? 'write' : 'compare', dir: argv[1] }
  }
  return { error: `无法识别的参数：${argv.join(' ')}` }
}

const parsed = parseArgs(process.argv.slice(2))
if (parsed.error !== undefined) {
  console.error(`[artifacts] ${parsed.error}\n\n${USAGE}`)
  process.exit(2)
}
if (parsed.mode === 'help') {
  console.log(USAGE)
  process.exit(0)
}

const plugins = listPlugins()
if (plugins.length === 0) {
  console.error('[artifacts] 没有发现任何插件（plugins/*/package.json）')
  process.exit(1)
}

const failures = []
const notes = []
const inspections = []
for (const plugin of plugins) {
  const inspection = inspectPackage(plugin)
  inspections.push(inspection)
  failures.push(...inspection.failures)
  if (inspection.snapshot.host !== null) {
    notes.push(
      `${inspection.snapshot.package}: host ${inspection.snapshot.host.words.length} 词，`
      + `client ${inspection.snapshot.client.sha256 === null ? '无' : `${inspection.snapshot.client.words.length} 词`}`,
    )
  }
}

// 快照模式下先守住门禁：基线必须冻结在契约成立的树上。
if (parsed.mode === 'write') {
  if (failures.length > 0) {
    console.error('\n[artifacts] 门禁未通过，拒绝写入基线：\n')
    for (const failure of failures) console.error(`  - ${failure}`)
    process.exit(1)
  }
  mkdirSync(parsed.dir, { recursive: true })
  for (const inspection of inspections) {
    const { snapshot } = inspection
    const file = join(parsed.dir, `${snapshot.package}.json`)
    writeFileSync(file, `${JSON.stringify(snapshot, null, 2)}\n`)
    console.log(`[artifacts] 写入 ${file}`)
  }
  console.log(`[artifacts] 已冻结 ${inspections.length} 个包的基线到 ${parsed.dir}`)
  process.exit(0)
}

// 比对模式：B6 只看模块词集合；sha256 变化只提示。
if (parsed.mode === 'compare') {
  if (failures.length > 0) {
    console.error('\n[artifacts] 门禁未通过，无法比对基线：\n')
    for (const failure of failures) console.error(`  - ${failure}`)
    process.exit(1)
  }
  const shaNotes = []
  let mismatched = 0
  for (const inspection of inspections) {
    const name = inspection.snapshot.package
    const loaded = loadSnapshot(parsed.dir, name)
    if (loaded.failure !== undefined) {
      failures.push(loaded.failure)
      mismatched += 1
      continue
    }
    const before = failures.length
    failures.push(...compareWords(inspection.snapshot, loaded.snapshot, name, shaNotes))
    if (failures.length === before) console.log(`[artifacts] ${name}: 模块词与基线逐字相等`)
    else mismatched += 1
  }
  for (const message of shaNotes) console.log(`[artifacts] 提示：${message}`)
  if (failures.length > 0) {
    console.error(`\n[artifacts] ${mismatched}/${inspections.length} 个包的模块词集合与基线不相等：\n`)
    for (const failure of failures) console.error(`  - ${failure}`)
    process.exit(1)
  }
  console.log(`[artifacts] ${inspections.length} 个包的模块词集合与基线逐字相等`)
  process.exit(0)
}

// 门禁模式。
for (const message of notes) console.log(`[artifacts] ${message}`)
if (failures.length > 0) {
  console.error('\n[artifacts] 产物契约不成立：\n')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log(`[artifacts] ${inspections.length} 个包通过 B1–B5`)
