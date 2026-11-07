#!/usr/bin/env node
/**
 * 结构不变式门禁（R7，G7 8.1 全量开启）。
 *
 * 八组断言（AR1–AR7 契约见 code-design ③.4、AR8 见 ③.2，执行期裁定见 tasks.md 附录）：
 *
 * - AR1：任何 workspace 包（`plugins/*` + `tooling/*`）的 `dependencies` 不得出现
 *   `@dsh-plugins/*`——内部包只能进 devDependencies（构建期内联；profile 侧
 *   git 单目录安装解析不到 workspace 包）；
 * - AR2：`tooling/*` 内部包必须 private + `0.0.0`，`dependencies` / 脚本都走白名单，
 *   且零 `@deepseek-ai/*` 依赖（profile 侧单目录安装解析不到内部包与 DSH 包）；
 * - AR3：六个软插件的核心脚本等于模板值（模板值 = G2 收敛后的当前形态，附加脚本允许）；
 * - AR4：六个软插件的 `build.mjs` 必须是薄入口——唯一 import 来自
 *   `@dsh-plugins/build-kit`、单次 `await buildPlugin({...})`、无 `esbuild` 字样；
 *   设计字面的「≤ 12 行」按去注释后的有效代码行计（各包顶部的文档注释不受限）；
 * - AR5：六个软插件的 tsconfig 只 `extends` 根基准、不重声明编译选项、不带 `composite`；
 *   workspace-config 的 client 半因 declaration emit 需要，`compilerOptions` 走六键白名单
 *   （执行期 R10 裁定①）；
 * - AR6：六个软插件目录不得有本地 `.oxlintrc.json`；根 `.oxlintrc.json` 的 `plugins`
 *   为空数组、`ignorePatterns` 恰为 R4 三条（执行期 R11①②）；
 * - AR7：workspace `packages` 恰为 `plugins/*` + 四个显式 tooling 包
 *   （执行期 R12①），`templates/` 不是包（禁止 `templates` / `templates/*` 进 `packages`）。
 * - AR8：软插件的 Web 测试接线必须收敛到 `@dsh-plugins/test-kit/vitest`——`dsh.client.platform`
 *   为 `web` 的包必须有 `vitest.config.ts`（AR8-1）；该文件是 ≤ 6 行的薄入口：单 import +
 *   单次 `export default defineWebTestConfig({...})`，代码不含 `alias` / `esbuild` / `include` /
 *   `environment` / `jsdom` / primitives 包名（AR8-2）；工厂的 `WEB_TEST_INCLUDE` 必须恰为
 *   `.ts` + `.tsx` 双面，test/ 下测试文件命名与 tsconfig include 覆盖必须闭合（AR8-3）；
 *   存在入口时 `test/stubs/ui-primitives.tsx` 必须薄 re-export test-kit 并集底座（AR8-4）。
 *
 * 全部失败一次列出，不遇到第一个就退出；退出码 0 通过 / 1 断言失败 / 2 用法错误。
 *
 * @module scripts/check-architecture
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 仓库根（`scripts/` 的上一级）。 */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
/** 插件根目录。 */
const PLUGINS_ROOT = join(REPO_ROOT, 'plugins')
/** tooling 包根目录。 */
const TOOLING_ROOT = join(REPO_ROOT, 'tooling')
/** workspace 定义（AR7 只做文本级解析，不引 yaml 依赖）。 */
const WORKSPACE_FILE = join(REPO_ROOT, 'pnpm-workspace.yaml')
/** 六个软插件共用的根编译基准（AR5 的 extends 目标）。 */
const BASE_TSCONFIG = join(REPO_ROOT, 'tsconfig.plugin.base.json')

/** 命令用法。 */
const USAGE = `用法：
  node scripts/check-architecture.mjs    # 结构不变式门禁（AR1–AR8 全量）`

const failures = []
const notes = []

/**
 * 记录一条断言失败。
 * @param message - 中文失败信息，带 AR 编号。
 */
function fail(message) {
  failures.push(message)
}

/**
 * 记录一条通过事实（只在成功路径打印）。
 * @param message - 中文提示。
 */
function note(message) {
  notes.push(message)
}

/**
 * 读取一个目录下的全部包（有 `package.json` 的目录）。
 *
 * 模板素材在顶层 `templates/`（不在 `plugins/` / `tooling/` 两个扫描根内），不会被当成包。
 * @param root - 包根目录（`plugins/` 或 `tooling/`）。
 * @param label - 失败信息里的目录前缀。
 * @returns `{ dir, dirName, manifest }`，按包名排序；清单解析失败的目录已被记录并跳过。
 */
function listPackages(root, label) {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(root, entry.name, 'package.json')))
    .map((entry) => {
      const dir = join(root, entry.name)
      const relative = `${label}/${entry.name}/package.json`
      let manifest
      try {
        manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
      } catch (error) {
        fail(`${relative}: 不是合法的 package.json（${error instanceof Error ? error.message : String(error)}）`)
        return null
      }
      return { dir, dirName: entry.name, manifest }
    })
    .filter((entry) => entry !== null)
    .sort((left, right) => String(left.manifest.name).localeCompare(String(right.manifest.name)))
}

/**
 * 判断一个依赖名是否属于上游 DSH 家族。
 * @param name - 依赖名。
 * @returns 是否以 `@deepseek-ai/` 开头。
 */
function isDshPackage(name) {
  return name.startsWith('@deepseek-ai/')
}

// ---------------------------------------------------------------------------
// AR1：内部包不得进入运行时依赖
// ---------------------------------------------------------------------------

/** 内部包作用域（构建期内联，安装侧单目录解析不到）。 */
const INTERNAL_SCOPE = '@dsh-plugins/'

/**
 * 检查一个 workspace 包的 `dependencies`（AR1）。
 *
 * 内部包（`@dsh-plugins/*`）只允许出现在 `devDependencies`：它们在构建期被内联，
 * 运行时不解析；写进 `dependencies` 会让 profile 侧的 git 单目录安装当场失败
 * （安装铁律 C1/C10，决策 D-12）。
 * @param pkg - `{ dir, dirName, manifest }`。
 * @param label - 失败信息里的目录前缀（`plugins` 或 `tooling`）。
 */
function inspectInternalDependencies(pkg, label) {
  for (const name of Object.keys(pkg.manifest.dependencies ?? {})) {
    if (name.startsWith(INTERNAL_SCOPE)) {
      fail(
        `AR1 ${label}/${pkg.dirName}: dependencies 出现内部包 "${name}"`
        + '——内部包只能进 devDependencies（构建期内联；profile 侧单目录安装解析不到 workspace 包）',
      )
    }
  }
}

// ---------------------------------------------------------------------------
// AR2：tooling 内部包治理契约
// ---------------------------------------------------------------------------

/**
 * 按目录名登记每个 tooling 包的契约（白名单语义：出现白名单外的名字即失败）。
 *
 * - `runtime`：`dependencies` 允许的运行时依赖；`host-kit` 必须为空（零运行时依赖）；
 * - `scripts`：允许的脚本名；白名单外的脚本（如给 build-kit 加 `build`）即失败。
 *
 * `contracts` 是 D-15（G4 5.5）新增的纯类型包，与三个 kit 同属 tooling 治理面
 * （code-design ① 1.4b / 决策 D-15 明写「AR1/AR2 断言自动覆盖」）；提前登记后
 * 建包当刻即被纳管，不需要再改本脚本。
 */
const TOOLING_CONTRACT = {
  'build-kit': {
    // 当前事实：dependencies 恰为 { esbuild }；白名单语义是 ⊆（设计 ③.4 AR2）。
    runtime: ['esbuild'],
    scripts: ['lint', 'test'],
  },
  'host-kit': {
    runtime: [],
    scripts: ['lint', 'typecheck', 'test'],
  },
  'test-kit': {
    runtime: ['react', 'react-dom'],
    scripts: ['lint', 'typecheck', 'test'],
  },
  contracts: {
    runtime: [],
    scripts: ['lint', 'typecheck'],
  },
}

/**
 * devDependencies 允许的工具链名字。
 *
 * AR2 只约束运行时依赖面：vitest / oxlint / typescript 这类工具链 devDeps 是合法的，
 * 但它们不能出现在 `dependencies` 里（那会变成 tooling 包的运行时依赖）。
 */
const TOOLCHAIN_DEV_WHITELIST = new Set([
  'esbuild',
  'typescript',
  'vitest',
  'oxlint',
  '@types/node',
  '@types/react',
  '@types/react-dom',
])

/**
 * 检查一个 tooling 包是否满足 AR2。
 * @param pkg - `{ dir, dirName, manifest }`。
 */
function inspectToolingPackage(pkg) {
  const { dirName, manifest } = pkg
  const contract = TOOLING_CONTRACT[dirName]
  const label = `AR2 tooling/${dirName}`

  if (contract === undefined) {
    fail(
      `${label}: 不在 tooling 治理清单（${Object.keys(TOOLING_CONTRACT).join(' / ')}）里；`
      + '新增内部包必须先把契约登记进 scripts/check-architecture.mjs',
    )
  }

  if (manifest.private !== true) fail(`${label}: private 必须为 true（内部包不发布）`)
  if (manifest.version !== '0.0.0') {
    fail(`${label}: version 必须为 "0.0.0"（当前 ${JSON.stringify(manifest.version)}）`)
  }

  // 任何 @deepseek-ai/* 依赖全禁：内部包必须自包含，安装侧不解析 DSH 包。
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const name of Object.keys(manifest[field] ?? {})) {
      if (isDshPackage(name)) {
        fail(`${label}: ${field} 出现 DSH 包 "${name}"——tooling 包不允许任何 @deepseek-ai/* 依赖`)
      }
    }
  }

  if (contract === undefined) return

  // 运行时依赖白名单（与工具链 devDeps 分开报，失败信息能直接指出是哪一类越界）。
  const runtime = new Set(contract.runtime)
  for (const name of Object.keys(manifest.dependencies ?? {})) {
    if (!isDshPackage(name) && !runtime.has(name)) {
      fail(
        `${label}: 运行时依赖 "${name}" 不在白名单 { ${[...runtime].join(', ')} } 内`
        + '（工具链依赖只能放 devDependencies）',
      )
    }
  }
  for (const name of Object.keys(manifest.devDependencies ?? {})) {
    if (!isDshPackage(name) && !TOOLCHAIN_DEV_WHITELIST.has(name)) {
      fail(
        `${label}: 工具链依赖 "${name}" 不在白名单 { ${[...TOOLCHAIN_DEV_WHITELIST].join(', ')} } 内`,
      )
    }
  }

  // 脚本白名单：不允许给内部包加 build / prepack 等发布或构建入口。
  const scripts = new Set(contract.scripts)
  for (const name of Object.keys(manifest.scripts ?? {})) {
    if (!scripts.has(name)) {
      fail(`${label}: 脚本 "${name}" 不在白名单 { ${[...scripts].join(', ')} } 内`)
    }
  }
}

// ---------------------------------------------------------------------------
// AR3：六个软插件的核心脚本模板
// ---------------------------------------------------------------------------

/** 核心脚本名（设计 ③.4 AR3 列出的六条，允许附加脚本）。 */
const CORE_SCRIPTS = ['build', 'lint', 'test', 'typecheck', 'verify:all', 'prepack']

/**
 * 判断包是否自己拥有类型产物（`exports[*].types` 存在）。
 *
 * 对应 build-kit 的 `dtsOwned` 推导：拥有 d.ts 的包（当前只有 workspace-config）
 * 的 `build` 必须先在 `build:types` 里跑 tsc，再走 esbuild。
 * @param manifest - 包清单。
 * @returns 是否存在任意 `types` 导出。
 */
function hasOwnTypeExports(manifest) {
  let found = false
  /**
   * 递归扫描 `exports` 的任意层级。
   * @param value - 当前节点。
   */
  const walk = (value) => {
    if (found || value === null || typeof value !== 'object') return
    if (typeof value.types === 'string') {
      found = true
      return
    }
    for (const nested of Object.values(value)) walk(nested)
  }
  walk(manifest.exports)
  return found
}

/**
 * 计算一个软插件应有的核心脚本值（模板值 = G2 收敛后的当前形态）。
 *
 * 形态差异全部来自可推导的包事实：双端包（声明 `dsh.client`）检查 host + client
 * 两份 tsconfig；自己发 d.ts 的包 `build` 是两段式。其余脚本六个软插件逐字相同。
 * @param manifest - 包清单。
 * @returns `script 名 → 期望值`。
 */
function expectedCoreScripts(manifest) {
  const dual = manifest.dsh?.client !== undefined
  const dtsOwned = hasOwnTypeExports(manifest)
  return {
    build: dtsOwned ? 'pnpm run build:types && node build.mjs' : 'node build.mjs',
    lint: 'oxlint',
    test: 'vitest run',
    typecheck: dual
      ? 'tsc -p tsconfig.host.json --pretty false && tsc -p tsconfig.client.json --pretty false'
      : 'tsc -p tsconfig.host.json --pretty false',
    'verify:all': 'pnpm lint && pnpm typecheck && pnpm build && pnpm test',
    prepack: 'pnpm run build',
  }
}

/**
 * 检查一个软插件的核心脚本是否等于模板值。
 * @param pkg - `{ dir, dirName, manifest }`。
 */
function inspectCoreScripts(pkg) {
  const expected = expectedCoreScripts(pkg.manifest)
  const actual = pkg.manifest.scripts ?? {}
  for (const script of CORE_SCRIPTS) {
    const value = actual[script]
    if (value === undefined) {
      fail(`AR3 ${pkg.manifest.name}: 缺少核心脚本 "${script}"（模板值："${expected[script]}"）`)
    } else if (value !== expected[script]) {
      fail(`AR3 ${pkg.manifest.name}: 核心脚本 "${script}" 为 "${value}"，模板值为 "${expected[script]}"`)
    }
  }
}

// ---------------------------------------------------------------------------
// AR4：六个软插件的 build.mjs 必须是 build-kit 薄入口
// ---------------------------------------------------------------------------

/** 薄入口唯一允许的 import 源。 */
const BUILD_KIT_PACKAGE = '@dsh-plugins/build-kit'

/** 薄入口有效代码行上限（设计「≤ 12 行」按去注释计，文档注释不受限）。 */
const BUILD_ENTRY_MAX_LINES = 12

/**
 * 去掉 JS 源码里的块注释与行注释，保留字符串字面量。
 *
 * 逐字符扫描而不是用正则盲目替换：`build.mjs` 的文档注释动辄十几行，形态断言只看
 * 代码本身；同时避免字符串里的 `//`（如 URL）或 `/*` 被误删。
 * @param source - 源码文本。
 * @returns 去掉注释后的源码。
 */
function stripComments(source) {
  let out = ''
  let index = 0
  /** 当前所处的引号字符；空串表示代码态。 */
  let quote = ''
  while (index < source.length) {
    const char = source[index]
    const next = source[index + 1]
    if (quote !== '') {
      out += char
      if (char === '\\') {
        out += next ?? ''
        index += 2
        continue
      }
      if (char === quote) quote = ''
      index += 1
      continue
    }
    if (char === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') index += 1
      continue
    }
    if (char === '/' && next === '*') {
      index += 2
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) index += 1
      index += 2
      out += ' '
      continue
    }
    if (char === "'" || char === '"' || char === '`') quote = char
    out += char
    index += 1
  }
  return out
}

/**
 * 从 `{` 开始找配对的 `}`（跳过引号内的花括号）。
 * @param text - 以 `{` 开头的代码片段。
 * @returns 配对 `}` 的下标；没有配对返回 -1。
 */
function findMatchingBrace(text) {
  let depth = 0
  let quote = ''
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quote !== '') {
      if (char === '\\') index += 1
      else if (char === quote) quote = ''
      continue
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char
      continue
    }
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}

/**
 * 判断一行（去注释后）是否是唯一的 build-kit 导入。
 * @param line - 单行代码。
 * @returns 是否匹配 `import { buildPlugin } from '@dsh-plugins/build-kit'`。
 */
function isBuildKitImport(line) {
  return /^import\s*\{\s*buildPlugin\s*\}\s*from\s*(['"])@dsh-plugins\/build-kit\1;?$/u.test(line)
}

/**
 * 检查一个软插件的构建入口（AR4）。
 *
 * 形态契约（语义断言，不是行数指纹）：
 * 1. 有且只有一条 import，且来自 `@dsh-plugins/build-kit`；
 * 2. 有且只有一次顶层 `await buildPlugin({...})`，调用后不得再有任何语句；
 * 3. 全文不出现 `esbuild` 字样（禁止直接操作打包器或手写多段构建逻辑）。
 * @param pkg - `{ dir, dirName, manifest }`。
 */
function inspectBuildEntry(pkg) {
  const label = `AR4 ${pkg.manifest.name}/build.mjs`
  const file = join(pkg.dir, 'build.mjs')
  if (!existsSync(file)) {
    fail(`${label}: 文件不存在（软插件必须使用 @dsh-plugins/build-kit 薄入口）`)
    return
  }
  const source = readFileSync(file, 'utf8')
  if (source.includes('esbuild')) {
    fail(`${label}: 出现 "esbuild" 字样——构建逻辑只能走 ${BUILD_KIT_PACKAGE}，不得直接操作打包器`)
  }

  const codeLines = stripComments(source).split('\n').map((line) => line.trim()).filter((line) => line !== '')
  if (codeLines.length > BUILD_ENTRY_MAX_LINES) {
    fail(`${label}: 有效代码 ${codeLines.length} 行，超过薄入口上限 ${BUILD_ENTRY_MAX_LINES} 行`)
  }

  const imports = codeLines.filter((line) => /^import\b/u.test(line))
  if (imports.length !== 1 || imports.filter(isBuildKitImport).length !== 1) {
    fail(
      `${label}: 必须恰有一条 import，且形如 "import { buildPlugin } from '${BUILD_KIT_PACKAGE}'"；`
      + `当前 import ${imports.length} 条${imports.length === 0 ? '' : `（${imports.join(' / ')}）`}`,
    )
  }
  if (codeLines.some((line) => line.includes('require('))) {
    fail(`${label}: 不得出现 require(...)——ESM 薄入口只 import ${BUILD_KIT_PACKAGE}`)
  }

  const rest = codeLines.filter((line) => !isBuildKitImport(line)).join('\n')
  const head = /^await\s+buildPlugin\(\{/u.exec(rest)
  if (head === null) {
    fail(`${label}: 只允许单次顶层 \`await buildPlugin({...})\` 调用，不得有其它构建语句`)
    return
  }
  // 从参数对象的下标 `{` 开始找配对括号，调用之后只允许空串或一个分号。
  const call = rest.slice(head[0].length - 1)
  const end = findMatchingBrace(call)
  if (end === -1) {
    fail(`${label}: buildPlugin({...}) 的参数括号不配对`)
    return
  }
  const tail = call.slice(end + 1).trim()
  // 参数对象闭合后只允许调用自身的 `)` 与一个可选分号。
  if (!/^\)\s*;?$/u.test(tail)) {
    fail(`${label}: buildPlugin({...}) 之后仍有其它代码——薄入口只允许单次调用`)
  }
  const calls = rest.split('buildPlugin(').length - 1
  if (calls !== 1) fail(`${label}: buildPlugin 出现 ${calls} 次，薄入口只允许一次`)
}

// ---------------------------------------------------------------------------
// AR5：tsconfig 只 extends 根基准
// ---------------------------------------------------------------------------

/** 六个软插件 tsconfig 唯一允许的 extends 目标。 */
const TSCONFIG_EXTENDS = '../../tsconfig.plugin.base.json'

/** 严格文件的顶层键白名单（`include` 是本批唯一允许的差异面）。 */
const TSCONFIG_STRICT_KEYS = new Set(['extends', 'include'])

/**
 * workspace-config client 半的 `compilerOptions` 白名单（执行期 R10 裁定①）。
 *
 * 该文件保留 declaration emit 六键（`build:types` 必需），是本批唯一放行
 * `compilerOptions` 的 tsconfig；extends 指向与「无 composite」照查。
 */
const WSC_CLIENT_TSCONFIG = 'workspace-config/tsconfig.client.json'
const WSC_CLIENT_COMPILER_OPTIONS = new Set([
  'declaration',
  'emitDeclarationOnly',
  'noEmit',
  'rootDir',
  'outDir',
  'rewriteRelativeImportExtensions',
])

/**
 * 递归检查对象里是否出现 `composite` 键。
 * @param value - 任意 JSON 节点。
 * @returns 是否命中 `composite`。
 */
function hasCompositeKey(value) {
  if (value === null || typeof value !== 'object') return false
  if (!Array.isArray(value) && Object.hasOwn(value, 'composite')) return true
  return Object.values(value).some(hasCompositeKey)
}

/**
 * 检查一份软插件 tsconfig。
 * @param pkg - `{ dir, dirName, manifest }`。
 * @param fileName - `tsconfig.host.json` 或 `tsconfig.client.json`。
 */
function inspectTsconfig(pkg, fileName) {
  const label = `AR5 ${pkg.dirName}/${fileName}`
  const file = join(pkg.dir, fileName)
  if (!existsSync(file)) {
    fail(`${label}: 文件不存在`)
    return
  }
  let config
  try {
    config = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    fail(`${label}: 不是合法的 JSON（${error instanceof Error ? error.message : String(error)}）`)
    return
  }
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    fail(`${label}: 顶层必须是一个对象`)
    return
  }

  const whitelisted = `${pkg.dirName}/${fileName}` === WSC_CLIENT_TSCONFIG
  if (config.extends !== TSCONFIG_EXTENDS) {
    fail(`${label}: extends 为 ${JSON.stringify(config.extends)}，必须指向 "${TSCONFIG_EXTENDS}"`)
  }
  if (hasCompositeKey(config)) {
    fail(`${label}: 不得出现 composite（composite + 跨包源会触发 TS6307，共享源模式要求去 composite）`)
  }

  const allowedKeys = whitelisted
    ? new Set([...TSCONFIG_STRICT_KEYS, 'compilerOptions'])
    : TSCONFIG_STRICT_KEYS
  for (const key of Object.keys(config)) {
    if (!allowedKeys.has(key)) {
      fail(`${label}: 出现不允许的顶层键 "${key}"（只允许 ${[...allowedKeys].join(' / ')}）`)
    }
  }

  if (!whitelisted || config.compilerOptions === undefined) return
  if (config.compilerOptions === null || typeof config.compilerOptions !== 'object' || Array.isArray(config.compilerOptions)) {
    fail(`${label}: compilerOptions 必须是对象`)
    return
  }
  for (const key of Object.keys(config.compilerOptions)) {
    if (!WSC_CLIENT_COMPILER_OPTIONS.has(key)) {
      fail(
        `${label}: compilerOptions.${key} 不在 wsc client 白名单 `
        + `{ ${[...WSC_CLIENT_COMPILER_OPTIONS].join(', ')} } 内`,
      )
    }
  }
}

// ---------------------------------------------------------------------------
// AR6：lint 配置唯一基准
// ---------------------------------------------------------------------------

/** 本地 lint 配置文件名（六软插件目录下不得存在）。 */
const LOCAL_OXLINTRC = '.oxlintrc.json'

/** 根 `.oxlintrc.json` 必须包含的 ignorePatterns（R4 三条，R11② 维持不扩）。 */
const REQUIRED_IGNORE_PATTERNS = ['**/lib/**', '**/node_modules/**', '**/*.config.ts']

/**
 * 检查 lint 配置形态（AR6）。
 *
 * - 六个软插件目录不得有本地 `.oxlintrc.json`：全仓唯一基准在根（执行期 R11①/③）；
 * - 根 `.oxlintrc.json` 必须存在，`plugins` 为空数组，`ignorePatterns` 恰为 R4 三条
 *   （执行期 R11②：dist / tsbuildinfo 等超契约条目不加）。
 * @param softPluginList - 六个软插件。
 */
function inspectLintConfig(softPluginList) {
  for (const pkg of softPluginList) {
    if (existsSync(join(pkg.dir, LOCAL_OXLINTRC))) {
      fail(
        `AR6 ${pkg.dirName}/${LOCAL_OXLINTRC}: 软插件不得有本地 lint 配置`
        + '（全仓唯一基准是根 .oxlintrc.json，执行期 R11①）',
      )
    }
  }

  const file = join(REPO_ROOT, LOCAL_OXLINTRC)
  if (!existsSync(file)) {
    fail('AR6 根 .oxlintrc.json 缺失（全仓唯一 lint 基准）')
    return
  }
  let config
  try {
    config = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    fail(`AR6 .oxlintrc.json: 不是合法的 JSON（${error instanceof Error ? error.message : String(error)}）`)
    return
  }
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    fail('AR6 .oxlintrc.json: 顶层必须是一个对象')
    return
  }

  if (!Array.isArray(config.plugins) || config.plugins.length !== 0) {
    fail(
      `AR6 .oxlintrc.json: plugins 必须为空数组（执行期 R11① 最终口径，`
      + `当前 ${JSON.stringify(config.plugins)}）`,
    )
  }

  const patterns = Array.isArray(config.ignorePatterns) ? config.ignorePatterns : []
  if (!Array.isArray(config.ignorePatterns)) {
    fail('AR6 .oxlintrc.json: ignorePatterns 必须是数组')
  }
  const missing = REQUIRED_IGNORE_PATTERNS.filter((pattern) => !patterns.includes(pattern))
  if (missing.length > 0) {
    fail(`AR6 .oxlintrc.json: ignorePatterns 缺少 ${missing.map((pattern) => JSON.stringify(pattern)).join(' / ')}`)
  }
  const extra = patterns.filter((pattern) => !REQUIRED_IGNORE_PATTERNS.includes(pattern))
  if (extra.length > 0) {
    fail(
      `AR6 .oxlintrc.json: ignorePatterns 出现契约外条目 `
      + `${extra.map((pattern) => JSON.stringify(pattern)).join(' / ')}（执行期 R11② 维持三条不扩）`,
    )
  }
  if (patterns.length !== REQUIRED_IGNORE_PATTERNS.length) {
    fail(`AR6 .oxlintrc.json: ignorePatterns 必须恰为 ${REQUIRED_IGNORE_PATTERNS.length} 条（R4 契约）`)
  }
}

// ---------------------------------------------------------------------------
// AR7：workspace packages 列表
// ---------------------------------------------------------------------------

/**
 * `packages` 必须恰为这些条目（顺序即契约顺序）。
 *
 * 执行期 R12①：G7 8.1 收紧为恰五条——`plugins/*` + 四个显式 tooling 包；
 * `tooling/contracts` 是 D-15 新增的纯类型包，与三个 kit 同属 tooling 治理面。
 */
const REQUIRED_PACKAGES = ['plugins/*', 'tooling/build-kit', 'tooling/contracts', 'tooling/host-kit', 'tooling/test-kit']

/**
 * 明确禁止出现在 `packages` 里的条目。
 *
 * 精确值之外还接受 `templates/*` 这种尾缀通配：模板素材在顶层 `templates/`，
 * 其下任何目录都不是 workspace 包。
 */
const FORBIDDEN_PACKAGES = new Map([
  ['tooling/*', 'tooling 包必须逐个显式列出（通配会让「谁是包」不可断言）'],
  ['templates', '模板素材不是包（模板在顶层 templates/，清单是 template.json + *.tmpl）'],
  ['templates/*', '模板素材不是包（templates/<name>/ 不得作为 workspace 包递归）'],
])

/**
 * 判断一条 `packages` 条目是否命中 `FORBIDDEN_PACKAGES`。
 *
 * 精确值直接命中；尾缀通配按前缀命中，但先排除 `REQUIRED_PACKAGES` 里的显式
 * tooling 包，避免 `tooling/*` 误伤四个 kit。返回值里的 `entry` 始终是文件里
 * 实际列入的条目（如 `templates/default`），失败信息据此点名具体包。
 * @param entry - `packages` 列表中的一条原值。
 * @returns `{ entry, reason }`；未命中返回 `null`。
 */
function findForbiddenPackage(entry) {
  const exact = FORBIDDEN_PACKAGES.get(entry)
  if (exact !== undefined) return { entry, reason: exact }
  if (REQUIRED_PACKAGES.includes(entry)) return null
  for (const [pattern, reason] of FORBIDDEN_PACKAGES) {
    if (pattern.endsWith('/*') && entry.startsWith(pattern.slice(0, -1))) return { entry, reason }
  }
  return null
}

/**
 * 文本级解析 `pnpm-workspace.yaml` 的 `packages` 列表。
 *
 * 与 check-dsh-baseline 的 `readCatalog` 同风格：只做行扫描，避免为脚本引入
 * yaml 依赖，也保留文件里的注释。只认顶层 `packages:` 块，遇到下一个顶层键停止。
 * @param source - workspace 文件文本。
 * @returns 列表项（已去引号与行尾注释），按文件顺序。
 */
function readWorkspacePackages(source) {
  const entries = []
  let inBlock = false
  for (const line of source.split('\n')) {
    if (!inBlock) {
      if (/^packages:\s*$/u.test(line)) inBlock = true
      continue
    }
    if (/^\S/u.test(line) && !line.startsWith('#')) break
    if (line.trim() === '' || /^\s*#/u.test(line)) continue
    const match = /^\s+-\s+(.+)$/u.exec(line)
    if (match === null) continue
    const value = match[1].replace(/\s+#.*$/u, '').trim()
    const quoted = /^(['"])(.*)\1$/u.exec(value)
    entries.push(quoted === null ? value : quoted[2])
  }
  return entries
}

/**
 * 检查 `pnpm-workspace.yaml` 的 `packages` 列表（AR7）。
 *
 * 收紧后的口径（执行期 R12①）：列表必须**恰为** `plugins/*` + 四个显式
 * `tooling/<name>`，多一条少一条都失败；每个被列入的 tooling 目录都必须存在且带
 * `package.json`（不再有「未来建包」豁免）。
 */
function inspectWorkspacePackages() {
  const source = readFileSync(WORKSPACE_FILE, 'utf8')
  const listed = readWorkspacePackages(source)
  if (listed.length === 0) {
    fail('AR7 pnpm-workspace.yaml 的 packages 列表为空或无法解析')
    return
  }

  const seen = new Set()
  for (const entry of listed) {
    if (seen.has(entry)) fail(`AR7 packages 重复列出 "${entry}"`)
    seen.add(entry)
  }

  for (const entry of seen) {
    const forbidden = findForbiddenPackage(entry)
    if (forbidden !== null) fail(`AR7 packages 里出现 "${forbidden.entry}"：${forbidden.reason}`)
  }

  for (const entry of REQUIRED_PACKAGES) {
    if (!seen.has(entry)) fail(`AR7 packages 缺少 "${entry}"`)
  }
  if (listed.length !== REQUIRED_PACKAGES.length) {
    fail(
      `AR7 packages 必须恰为 ${REQUIRED_PACKAGES.length} 条`
      + `（${REQUIRED_PACKAGES.join(' / ')}），当前 ${listed.length} 条：${listed.join(' / ')}`,
    )
  }

  for (const entry of listed) {
    // 明确禁止的条目已经单独报过，不再重复报「多余条目」。
    if (findForbiddenPackage(entry) !== null) continue
    if (!REQUIRED_PACKAGES.includes(entry)) {
      fail(`AR7 packages 出现多余条目 "${entry}"：只允许 ${REQUIRED_PACKAGES.join(' / ')}`)
      continue
    }
    if (entry === 'plugins/*') continue
    const dir = join(TOOLING_ROOT, entry.slice('tooling/'.length))
    if (!existsSync(dir)) {
      fail(`AR7 packages 声明了不存在的目录 "${entry}"`)
      continue
    }
    if (!existsSync(join(dir, 'package.json'))) {
      fail(`AR7 packages 列入的 "${entry}" 没有 package.json（列入即声明它是包）`)
    }
  }
}

// ---------------------------------------------------------------------------
// AR8：Web 测试接线（薄入口 / include 双面 / stub 指向）
// ---------------------------------------------------------------------------

/** 双端包测试配置的唯一 import 源（test-kit 的 vitest 子路径）。 */
const WEB_TEST_CONFIG_MODULE = '@dsh-plugins/test-kit/vitest'

/** AR8-2 薄入口有效代码行上限（去注释后计）。 */
const WEB_TEST_CONFIG_MAX_LINES = 6

/** AR8-2 禁止在消费方配置里出现的字面量（配置细节只能由 test-kit 工厂提供）。 */
const WEB_TEST_CONFIG_FORBIDDEN = [
  'alias',
  'esbuild',
  'include',
  'environment',
  'jsdom',
  '@deepseek-ai/dsh-client-ui-primitives',
]

/** AR8-3 include 常量的唯一真源（工厂定义处，门禁只读不抄）。 */
const WEB_TEST_INCLUDE_FILE = join(REPO_ROOT, 'tooling', 'test-kit', 'src', 'vitest.ts')

/** AR8-3 期望的 include 双面值（顺序即契约：`.ts` 在前、`.tsx` 在后）。 */
const WEB_TEST_INCLUDE_EXPECTED = ['test/**/*.test.ts', 'test/**/*.test.tsx']

/** 薄入口文件名、测试目录、stub 相对包根的路径。 */
const WEB_TEST_CONFIG_FILE = 'vitest.config.ts'
const WEB_TEST_DIR = 'test'
const WEB_TEST_STUB = 'test/stubs/ui-primitives.tsx'

/** AR8-4 stub 必须薄 re-export 的模块。 */
const WEB_TEST_STUB_MODULE = '@dsh-plugins/test-kit/ui-primitives'

/** 包内工程 tsconfig（host 必在；client 只有双端包有，只读 include、不解析 extends）。 */
const WEB_TEST_TSCONFIGS = ['tsconfig.host.json', 'tsconfig.client.json']

/**
 * 递归列出一个目录下的全部文件。
 * @param dir - 目录绝对路径。
 * @returns 文件绝对路径列表。
 */
function listFilesRecursively(dir) {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...listFilesRecursively(full))
    else files.push(full)
  }
  return files
}

/**
 * 把 tsconfig `include` 条目按 glob 语义转成正则。
 *
 * 只实现 include 需要的通配：`**`（跨目录，跟随 `/` 时允许零层）与 `*`（目录内任意字符），
 * `?` 按单字符处理；不解析 `extends`，也不展开 include 之外的编译语义。
 * @param pattern - 已规范化的 include 条目。
 * @returns 以 `^` / `$` 包住的正则。
 */
function globToRegExp(pattern) {
  let source = ''
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]
    if (char === '*') {
      if (pattern[index + 1] === '*') {
        // `**/` 允许零层目录：`test/**/*.ts` 也要匹配 `test/a.test.ts`。
        if (pattern[index + 2] === '/') {
          source += '(?:.*/)?'
          index += 2
        } else {
          source += '.*'
          index += 1
        }
      } else {
        source += '[^/]*'
      }
      continue
    }
    if (char === '?') {
      source += '[^/]'
      continue
    }
    source += /[.*+?^${}()|[\]\\]/u.test(char) ? `\\${char}` : char
  }
  return new RegExp(`^${source}$`, 'u')
}

/**
 * 判断一条 tsconfig include 条目是否覆盖包内相对路径。
 *
 * 无通配的条目按 TypeScript 语义同时表示「该文件」与「该目录下的文件」；带通配的条目
 * 只做 glob 匹配（不做目录展开）。
 * @param entry - tsconfig `include` 里的一条字符串。
 * @param filePath - 相对包根、以 `/` 分隔的文件路径。
 * @returns 是否覆盖。
 */
function includeEntryCovers(entry, filePath) {
  const normalized = entry.replaceAll('\\', '/').replace(/^\.\//u, '').replace(/\/+$/u, '')
  if (normalized === '') return false
  if (globToRegExp(normalized).test(filePath)) return true
  return !normalized.includes('*') && filePath.startsWith(`${normalized}/`)
}

/**
 * 从 test-kit 工厂源码提取 `WEB_TEST_INCLUDE` 的数组字面量（AR8-3）。
 *
 * 解析失败返回 `null`，由调用方记为失败——「读不到真源」等于没有双面 include 的证据，
 * 不允许静默跳过。
 * @returns 字符串数组；文件缺失或数组字面量无法解析时返回 `null`。
 */
function readWebTestInclude() {
  if (!existsSync(WEB_TEST_INCLUDE_FILE)) return null
  const source = stripComments(readFileSync(WEB_TEST_INCLUDE_FILE, 'utf8'))
  const array = /export\s+const\s+WEB_TEST_INCLUDE\s*=\s*\[([^\]]*)\]/u.exec(source)
  if (array === null) return null
  return [...array[1].matchAll(/(['"])([^'"]*)\1/gu)].map((match) => match[2])
}

/**
 * 核对工厂 include 常量（AR8-3 的「vitest 工厂 include」面）。
 */
function inspectWebTestInclude() {
  const values = readWebTestInclude()
  if (values === null) {
    fail(
      'AR8 tooling/test-kit/src/vitest.ts: 无法解析 WEB_TEST_INCLUDE 数组字面量'
      + `（应形如 export const WEB_TEST_INCLUDE = ${JSON.stringify(WEB_TEST_INCLUDE_EXPECTED)} as const）`,
    )
    return
  }
  if (JSON.stringify(values) !== JSON.stringify(WEB_TEST_INCLUDE_EXPECTED)) {
    fail(
      'AR8 tooling/test-kit/src/vitest.ts: WEB_TEST_INCLUDE 必须恰为 '
      + `${JSON.stringify(WEB_TEST_INCLUDE_EXPECTED)}，当前 ${JSON.stringify(values)}`
      + '（漏 `.tsx` 会让组件套件静默消失）',
    )
  }
}

/**
 * 检查一个软插件的 Web 测试接线（AR8-1/2/3/4）。
 * @param pkg - `{ dir, dirName, manifest }`。
 */
function inspectWebTestWiring(pkg) {
  const packageName = String(pkg.manifest.name)
  const configFile = join(pkg.dir, WEB_TEST_CONFIG_FILE)
  const label = `AR8 ${packageName}/${WEB_TEST_CONFIG_FILE}`
  const hasConfig = existsSync(configFile)
  const isWeb = pkg.manifest.dsh?.client?.platform === 'web'

  // AR8-1：Web 双端包必须有测试薄入口。
  if (isWeb && !hasConfig) {
    fail(`${label}: 不存在——dsh.client.platform 为 "web" 的包必须有 vitest 薄入口`)
  }

  if (hasConfig) {
    // AR8-2：薄入口形态（≤ 6 行 / 单 import / 单工厂调用 / 无配置字面量）。
    const code = stripComments(readFileSync(configFile, 'utf8'))
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '')
      .join('\n')
    const codeLines = code === '' ? [] : code.split('\n')
    if (codeLines.length > WEB_TEST_CONFIG_MAX_LINES) {
      fail(`${label}: 有效代码 ${codeLines.length} 行，超过薄入口上限 ${WEB_TEST_CONFIG_MAX_LINES} 行`)
    }
    const imports = codeLines.filter((line) => /^import\b/u.test(line))
    const importMatch = /^import\s*\{\s*defineWebTestConfig\s*\}\s*from\s*(['"])([^'"]+)\1;?$/u.exec(imports[0] ?? '')
    if (imports.length !== 1 || importMatch === null || importMatch[2] !== WEB_TEST_CONFIG_MODULE) {
      fail(
        `${label}: 必须恰有一条 import，且形如 "import { defineWebTestConfig } from '${WEB_TEST_CONFIG_MODULE}'"；`
        + `当前 import ${imports.length} 条${imports.length === 0 ? '' : `（${imports.join(' / ')}）`}`,
      )
    }
    if (code.split('export default defineWebTestConfig({').length - 1 !== 1) {
      fail(`${label}: 必须恰有一条 \`export default defineWebTestConfig({ ... })\`（工厂单入口）`)
    }
    const forbidden = WEB_TEST_CONFIG_FORBIDDEN.filter((word) => code.includes(word))
    if (forbidden.length > 0) {
      fail(
        `${label}: 代码出现禁止字面量 ${forbidden.map((word) => `"${word}"`).join(' / ')}`
        + '——配置细节只能由 test-kit 工厂提供，消费方不得覆写',
      )
    }

    // AR8-4：替身只允许薄 re-export test-kit 的并集底座。
    const stubFile = join(pkg.dir, WEB_TEST_STUB)
    if (!existsSync(stubFile)) {
      fail(`AR8 ${packageName}/${WEB_TEST_STUB}: 不存在——双端包的 ui-primitives 替身必须指向 test-kit`)
    } else {
      const stubSource = readFileSync(stubFile, 'utf8')
      const stubImport = new RegExp(`from\\s+['"]${WEB_TEST_STUB_MODULE.replaceAll('/', '\\/')}['"]`, 'u')
      if (!stubImport.test(stubSource)) {
        fail(`AR8 ${packageName}/${WEB_TEST_STUB}: 缺少 "from '${WEB_TEST_STUB_MODULE}'"（替身只能薄 re-export 并集底座）`)
      }
    }
  }

  // AR8-3：磁盘测试命名 + tsconfig include 覆盖（每个 test/ 文件至少被一个工程覆盖）。
  const testDir = join(pkg.dir, WEB_TEST_DIR)
  if (!existsSync(testDir)) return
  const files = listFilesRecursively(testDir)
    .map((file) => relative(pkg.dir, file).replaceAll('\\', '/'))
    .sort()
  const testFiles = files.filter((file) => /\.test\./u.test(file))
  for (const file of testFiles) {
    if (!/\.test\.(?:ts|tsx)$/u.test(file)) {
      fail(`AR8 ${packageName}/${file}: 文件名匹配 ".test." 但不以 .test.ts / .test.tsx 结尾（套件会静默消失）`)
    }
  }

  const includeEntries = []
  for (const fileName of WEB_TEST_TSCONFIGS) {
    const tsconfigFile = join(pkg.dir, fileName)
    if (!existsSync(tsconfigFile)) continue
    let config
    try {
      config = JSON.parse(readFileSync(tsconfigFile, 'utf8'))
    } catch (error) {
      fail(
        `AR8 ${packageName}/${fileName}: 不是合法的 JSON，无法核对 test/ 覆盖`
        + `（${error instanceof Error ? error.message : String(error)}）`,
      )
      continue
    }
    const include = config?.include
    if (!Array.isArray(include)) continue
    for (const entry of include) {
      if (typeof entry === 'string') includeEntries.push(entry)
    }
  }
  const uncovered = files.filter((file) => !includeEntries.some((entry) => includeEntryCovers(entry, file)))
  if (uncovered.length > 0) {
    fail(
      `AR8 ${packageName}/tsconfig: ${uncovered.length} 个 test/ 文件没有被任何工程的 include 覆盖：`
      + uncovered.join(' / '),
    )
  }
  note(`AR8: ${packageName} ${testFiles.length} 个测试文件全部覆盖`)
}

// ---------------------------------------------------------------------------
// 执行
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2)
if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) {
  console.log(USAGE)
  process.exit(0)
}
if (argv.length > 0) {
  console.error(`[architecture] 无法识别的参数：${argv.join(' ')}\n\n${USAGE}`)
  process.exit(2)
}

const plugins = listPackages(PLUGINS_ROOT, 'plugins')
const toolingPackages = existsSync(TOOLING_ROOT) ? listPackages(TOOLING_ROOT, 'tooling') : []

// 软插件 = 没有精确契约文件（src/compat/dsh-version.ts）的插件；multi-root 是唯一硬插件。
const softPlugins = plugins.filter((pkg) => !existsSync(join(pkg.dir, 'src', 'compat', 'dsh-version.ts')))
if (softPlugins.length === 0) fail('AR3/AR5 没有发现任何软插件（plugins/* 下没有 package.json）')

// AR1：workspace 包 = plugins/* + tooling/*，运行时依赖一律不得引用内部包。
const workspacePackages = [
  ...plugins.map((pkg) => ({ pkg, label: 'plugins' })),
  ...toolingPackages.map((pkg) => ({ pkg, label: 'tooling' })),
]
for (const { pkg, label } of workspacePackages) inspectInternalDependencies(pkg, label)
note(`AR1: ${workspacePackages.length} 个 workspace 包的 dependencies 均无 @dsh-plugins/* 内部包`)

// AR2
for (const pkg of toolingPackages) inspectToolingPackage(pkg)
const registered = toolingPackages.map((pkg) => pkg.dirName)
if (!registered.includes('build-kit')) fail('AR2 tooling/build-kit 包缺失（构建骨架是六个软插件的前提）')
note(`AR2: ${registered.length} 个 tooling 包已纳管`)

// AR3
for (const pkg of softPlugins) inspectCoreScripts(pkg)
note(`AR3: ${softPlugins.length} 个软插件的核心脚本按同一模板核对`)

// AR4
for (const pkg of softPlugins) inspectBuildEntry(pkg)
note(`AR4: ${softPlugins.length} 个软插件的 build.mjs 均为 build-kit 薄入口`)

// AR5
if (!existsSync(BASE_TSCONFIG)) fail('AR5 根编译基准 tsconfig.plugin.base.json 缺失')
let tsconfigCount = 0
for (const pkg of softPlugins) {
  inspectTsconfig(pkg, 'tsconfig.host.json')
  tsconfigCount += 1
  const clientFile = join(pkg.dir, 'tsconfig.client.json')
  if (pkg.manifest.dsh?.client !== undefined || existsSync(clientFile)) {
    inspectTsconfig(pkg, 'tsconfig.client.json')
    tsconfigCount += 1
  }
}
note(`AR5: ${tsconfigCount} 份 tsconfig 已核对（wsc client 按 R10 裁定① 放行 compilerOptions 六键）`)

// AR6
inspectLintConfig(softPlugins)
note('AR6: 根 .oxlintrc.json 为唯一基准（plugins: []，ignorePatterns 三条），六软插件无本地配置')

// AR7
inspectWorkspacePackages()
note('AR7: packages 恰为 plugins/* + 四个显式 tooling 包，templates/ 不是包（禁止 templates / templates/*）')

// AR8
inspectWebTestInclude()
for (const pkg of softPlugins) inspectWebTestWiring(pkg)
note(`AR8: ${softPlugins.length} 个软插件的测试接线按 test-kit 工厂与 tsconfig include 核对`)

if (failures.length > 0) {
  console.error('\n[architecture] 结构不变式不成立：\n')
  for (const failure of failures) console.error(`  - ${failure}`)
  console.error(
    '\n按 spec 的 AR 契约修复后重试（AR1–AR8 见 '
    + 'openspec/specs/dsh-plugin-toolchain/spec.md）。\n',
  )
  process.exit(1)
}

for (const message of notes) console.log(`[architecture] ${message}`)
console.log('[architecture] AR1–AR8 通过')
