/**
 * 宿主半骨架：把 `<root>/src/index.ts` 编成一份自包含 ESM 产物（`lib/index.js`）。
 *
 * 六个软插件的宿主半逐字同构（entry / `lib` / esm / node22 / `sourcemap:false`
 * / banner 文案完全一致），差异只有 `external` 一行——这里把骨架固定下来，
 * 调用方只声明不可推导的两件事：`hostExternals` 与 `cjsRequireShim`。
 *
 * @module @dsh-plugins/build-kit/host
 */

import { build } from 'esbuild'

/**
 * 宿主产物需要真实 `require` 时注入的 banner。
 *
 * 文案逐字沿用 `plugins/project-mcp/build.mjs:48-50`，保证迁移前后产物字节可比。
 * 被一起打进来的纯 CJS 依赖会在模块求值期调用 `require('process')` 之类的核心
 * 模块，esbuild 的 `__require` 壳会直接抛 “Dynamic require of ... is not
 * supported”；绑定到 bundle 自身 URL 的 `require` 让这些调用可解析，同时产物
 * 仍然自包含（不在运行时解析本包 node_modules）。
 *
 * @type {string}
 */
export const CJS_REQUIRE_BANNER =
  "import { createRequire as __dshCreateRequire } from 'node:module';\nconst require = __dshCreateRequire(import.meta.url);"

/** 宿主半固定外置词：Node 内建模块（裸内建名由 Node 解析，无需声明）。 */
export const HOST_BASE_EXTERNALS = ['node:*']

/**
 * 构建宿主半。
 * @param {object} options 构建选项。
 * @param {string} options.root 包目录的绝对路径（esbuild 的 `absWorkingDir`，
 *   决定产物里 `// path` 注释的相对基准）。
 * @param {string} options.entry 宿主入口的绝对路径。
 * @param {string} options.outDir 产物目录的绝对路径（通常为 `<root>/lib`）。
 * @param {string[]} [options.hostExternals] 追加到 `node:*` 之后的宿主外置词。
 * @param {boolean} [options.cjsRequireShim] 是否注入 {@link CJS_REQUIRE_BANNER}。
 * @returns {Promise<void>} 构建完成的 Promise。
 */
export async function buildHostHalf({ root, entry, outDir, hostExternals = [], cjsRequireShim = false }) {
  await build({
    // esbuild 的默认 `absWorkingDir` 是**模块被 import 那一刻**的 process.cwd()；
    // 显式钉到包目录，产物里的 `// path` 注释才与「在包目录下跑 build」逐字一致，
    // 调用方从哪个目录触发构建都不影响字节。
    absWorkingDir: root,
    entryPoints: [entry],
    outdir: outDir,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    sourcemap: false,
    external: [...HOST_BASE_EXTERNALS, ...hostExternals],
    ...(cjsRequireShim ? { banner: { js: CJS_REQUIRE_BANNER } } : {}),
    logLevel: 'warning',
  })
}
