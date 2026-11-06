/**
 * `@dsh-plugins/build-kit` 的编排器：六个软插件（三个 host-only + 三个双端）
 * 共用的构建入口。
 *
 * 设计要点（openspec/changes/optimize-architecture 的 D-2）：
 *
 * - 策略从**包事实**推导，不引入新的 manifest 键：`kind` ← `dsh.client.platform`
 *   （声明了 web 半则浏览器入口必须存在，缺入口直接抛错，不降级为 host 半）；
 *   `dtsOwned` ← `exports[*].types` 是否存在；
 *   `clean` ← `dtsOwned`（自持 d.ts 只清 JS 面，否则整目录重建）；
 * - 不可推导的运行时判断留作旋钮：`hostExternals`（哪个依赖必须与宿主共用实例）
 *   与 `cjsRequireShim`（产物里是否会出现 CJS `require`）；
 * - `cssClassPrefix` 是保产物字节的旋钮（`stt` / `wux` / `wsc`）。
 *
 * 本模块只负责编排；宿主半 / 浏览器半 / CSS / 守卫分别在 `host.mjs` /
 * `client.mjs` / `css.mjs` / `guards.mjs`。
 *
 * @module @dsh-plugins/build-kit
 */

import { existsSync } from 'node:fs'
import { mkdir, readFile, rm } from 'node:fs/promises'
import path from 'node:path'

import { buildClientHalf, DEFAULT_CLIENT_EXTERNALS } from './client.mjs'
import { assertNoDynamicRequire, assertNoInternalWord } from './guards.mjs'
import { buildHostHalf } from './host.mjs'

/** 产物目录名：六个软插件统一为 `<root>/lib`。 */
const OUT_DIR_NAME = 'lib'
/** 宿主半入口（相对包目录）。 */
const HOST_ENTRY = path.join('src', 'index.ts')
/** 浏览器半入口（相对包目录）。 */
const CLIENT_ENTRY = path.join('src', 'client', 'index.ts')
/** 允许的清理策略。 */
const CLEAN_MODES = new Set(['auto', 'full', 'js-only'])

/**
 * @typedef {object} BuildOptions
 * @property {string} root 调用方包目录（薄入口传 `import.meta.dirname`）。
 * @property {string[]} [hostExternals] 追加到 `['node:*']` 之后的宿主外置词。
 * @property {boolean} [cjsRequireShim] 宿主产物是否需要真实 `require` banner（默认 false）。
 * @property {string[]} [clientExternals] 覆盖浏览器半默认 module-table 清单。
 * @property {string} [cssClassPrefix] 作用域类名前缀（双端必填；保产物字节）。
 * @property {'auto'|'full'|'js-only'} [clean] 默认 `'auto'`：由 `dtsOwned` 推导。
 */

/**
 * @typedef {object} BuildResult
 * @property {string} packageName 包名（同时是 ModuleLoader 的 `id` 与 esbuild 的诊断名）。
 * @property {'host'|'dual'} kind 插件形态。
 * @property {boolean} dtsOwned 包是否自己发射 d.ts（`exports[*].types`）。
 * @property {string[]} artifacts 产物相对路径（如 `lib/index.js`）。
 */

/**
 * 从包事实推导构建策略（全部来自 `package.json` 与磁盘上的入口，不引入新键）。
 * @param {object} manifest 包清单（`package.json` 的解析结果）。
 * @param {string} [root] 包目录（用于判定入口是否存在，默认当前工作目录）。
 * @returns {{
 *   packageName: string,
 *   kind: 'host'|'dual',
 *   dtsOwned: boolean,
 *   hostEntry: string,
 *   clientEntry: string,
 * }} 推导结果。
 */
export function deriveStrategy(manifest, root = process.cwd()) {
  const packageName = manifest?.name
  if (typeof packageName !== 'string' || packageName === '') {
    throw new Error('[build-kit] package.json 缺少 name：无法推导包身份')
  }
  const hostEntry = path.join(root, HOST_ENTRY)
  const clientEntry = path.join(root, CLIENT_ENTRY)
  if (!existsSync(hostEntry)) {
    throw new Error(
      `[${packageName}] 缺失宿主半入口 ${HOST_ENTRY}：每个软插件都必须有宿主半（bundle 行的裸包名锚点）。`,
    )
  }
  // kind 的权威声明是 `dsh.client.platform`（client-module scan 也读它）。声明了 web 半
  // 却没有浏览器入口是**包缺陷**，不是可降级的形态：静默降级会产出缺浏览器半的坏产物，
  // 要等 bundle 测试或运行时才暴露（旧版各双端 `build.mjs` 也在这里 fail-fast）。
  const declaresWeb = manifest.dsh?.client?.platform === 'web'
  if (declaresWeb && !existsSync(clientEntry)) {
    throw new Error(
      `[${packageName}] 声明了 web 半但入口缺失：${clientEntry}（相对包目录 ${CLIENT_ENTRY}）。` +
        '双端插件的宿主半与浏览器半必须同时构建：请创建该入口，或从 dsh.client 撤掉 web 声明。',
    )
  }
  const dual = declaresWeb
  const exportsField = manifest.exports
  const exportEntries = typeof exportsField === 'object' && exportsField !== null ? Object.values(exportsField) : []
  const dtsOwned = exportEntries.some(
    (entry) => typeof entry === 'object' && entry !== null && typeof entry.types === 'string',
  )
  return { packageName, kind: dual ? 'dual' : 'host', dtsOwned, hostEntry, clientEntry }
}

/**
 * 把 `clean` 选项解析成实际清理策略。
 * @param {'auto'|'full'|'js-only'} clean 调用方选项。
 * @param {boolean} dtsOwned 包是否自持 d.ts。
 * @returns {'full'|'js-only'} 实际清理策略。
 */
function resolveCleanMode(clean, dtsOwned) {
  if (!CLEAN_MODES.has(clean)) {
    throw new Error(`[build-kit] 未知的 clean 策略：${String(clean)}（允许 auto / full / js-only）`)
  }
  if (clean !== 'auto') return clean
  return dtsOwned ? 'js-only' : 'full'
}

/**
 * 清理产物目录。
 *
 * `full` 整目录重建；`js-only` 只覆盖本工具产出的两个 JS 文件，保留
 * `lib/types/`（`build:types` 先跑，整目录清空会把刚写好的声明删掉——与
 * multi-root 的 `clean-lib.mjs` 同一理由）。
 * @param {string} outDir 产物目录的绝对路径。
 * @param {'full'|'js-only'} mode 清理策略。
 * @returns {Promise<void>} 清理完成的 Promise。
 */
async function cleanOutDir(outDir, mode) {
  if (mode === 'full') {
    await rm(outDir, { recursive: true, force: true })
    await mkdir(outDir, { recursive: true })
    return
  }
  await mkdir(outDir, { recursive: true })
  await rm(path.join(outDir, 'index.js'), { force: true })
  await rm(path.join(outDir, 'client.js'), { force: true })
}

/**
 * 宿主产物守卫：读取产物并跑守卫；失败时删掉坏产物再抛错——`lib/` 随仓库提交，
 * 不能把未过守卫的字节留在工作区里。
 * @param {object} options 选项。
 * @param {string} options.packageName 包名。
 * @param {string} options.outDir 产物目录的绝对路径。
 * @param {boolean} options.cjsRequireShim 是否开启 shim。
 * @returns {Promise<void>} 通过时静默返回。
 */
async function guardHostArtifact({ packageName, outDir, cjsRequireShim }) {
  const artifact = path.join(outDir, 'index.js')
  const code = await readFile(artifact, 'utf8')
  try {
    assertNoDynamicRequire(code, cjsRequireShim)
    assertNoInternalWord(code)
  } catch (error) {
    await rm(artifact, { force: true })
    throw new Error(`[${packageName}] 宿主产物 lib/index.js 未通过守卫：${error.message}`, { cause: error })
  }
}

/**
 * 浏览器产物守卫：读取产物并跑守卫；失败时删掉坏产物再抛错。
 *
 * 浏览器半固定是 CJS 输出，不会出现 esbuild 的 `__require` 壳，因此这里只守
 * 「内部包词」——`cjsRequireShim` 的语义只对宿主半成立。
 * @param {object} options 选项。
 * @param {string} options.packageName 包名。
 * @param {string} options.outDir 产物目录的绝对路径。
 * @returns {Promise<void>} 通过时静默返回。
 */
async function guardClientArtifact({ packageName, outDir }) {
  const artifact = path.join(outDir, 'client.js')
  const code = await readFile(artifact, 'utf8')
  try {
    assertNoInternalWord(code)
  } catch (error) {
    await rm(artifact, { force: true })
    throw new Error(`[${packageName}] 浏览器产物 lib/client.js 未通过守卫：${error.message}`, { cause: error })
  }
}

/**
 * 构建一个软插件：读包清单 → 推导策略 → 清理 → 宿主半 → 浏览器半（dual）→
 * 产物守卫。
 *
 * 返回值形状是接口断言的一部分：`{ packageName, kind, dtsOwned, artifacts }`。
 * @param {BuildOptions} options 构建选项。
 * @returns {Promise<BuildResult>} 构建结果。
 */
export async function buildPlugin(options = {}) {
  const {
    root,
    hostExternals = [],
    cjsRequireShim = false,
    clientExternals = DEFAULT_CLIENT_EXTERNALS,
    cssClassPrefix,
    clean = 'auto',
  } = options
  if (typeof root !== 'string' || root === '') {
    throw new Error('[build-kit] buildPlugin 需要 root（薄入口传 import.meta.dirname）')
  }
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
  const { packageName, kind, dtsOwned, hostEntry, clientEntry } = deriveStrategy(manifest, root)
  if (kind === 'dual' && (typeof cssClassPrefix !== 'string' || cssClassPrefix === '')) {
    throw new Error(
      `[${packageName}] 双端插件必须传 cssClassPrefix（如 'wux'）：它决定作用域类名前缀，并保证迁移前后产物字节可比。`,
    )
  }

  const outDir = path.join(root, OUT_DIR_NAME)
  await cleanOutDir(outDir, resolveCleanMode(clean, dtsOwned))

  await buildHostHalf({ root, entry: hostEntry, outDir, hostExternals, cjsRequireShim })
  await guardHostArtifact({ packageName, outDir, cjsRequireShim })
  const artifacts = ['lib/index.js']

  if (kind === 'dual') {
    await buildClientHalf({ root, entry: clientEntry, outDir, packageName, clientExternals, cssClassPrefix })
    await guardClientArtifact({ packageName, outDir })
    artifacts.push('lib/client.js')
  }

  console.log(`built ${packageName}: ${artifacts.join(', ')}`)
  return { packageName, kind, dtsOwned, artifacts }
}

export { DEFAULT_CLIENT_EXTERNALS, indentBlock, moduleLoaderShell } from './client.mjs'
export { cssModuleContents, cssModulesPlugin } from './css.mjs'
export { assertNoDynamicRequire, assertNoInternalWord, assertSelfContained } from './guards.mjs'
export { CJS_REQUIRE_BANNER, HOST_BASE_EXTERNALS } from './host.mjs'
