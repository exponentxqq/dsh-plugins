#!/usr/bin/env node
/**
 * compose-check —— zcode-plan 离线组合断言（openspec zcode-plan-bridge T6 / P7）。
 *
 * 不起宿主、不发网络请求：`mkdtemp` 在系统 tmpdir 建隔离 `$DSH_HOME`，profile 的
 * `node_modules/` 里 symlink 官方 `@deepseek-ai/dsh-base` 与本插件目录，再用
 * devDependencies 里同一份 `@deepseek-ai/dsh` 安装（0.2.1-rc.2）的 bin 跑
 * `--dump-config` / `--dump-config-schema`，逐例断言三例组合语义：
 *
 * - **E1 插件行存在**：profile patch 为 `[]`，dump 内 `- id: zcode-plan` 恰 1 行；
 * - **E2 整份替换哨兵**：profile patch 先写成 route install 落盘后的形态
 *   （下层带 `zcode-plan` 路由），再以 `--patch` overlay 叠一条合成用户层
 *   （同 id `llm-pi-ai`，`providers` 只写 `user-route`）→ 断言 dump 里
 *   **没有** `zcode-plan` 路由键。DSH patch 对同 id 条目的 config 是整份替换
 *   （design.md ①），若上游某版本改成深合，下层 `zcode-plan` 会重新出现在
 *   dump 里、本条转红，提醒回看 D-1；
 * - **E3 用户层注入完整路由**：把 `ZCODE_PLAN_ROUTE`（单一真源，经
 *   `node --experimental-strip-types` 直接 import `src/host/route-config.ts`）
 *   序列化成用户层 → dump 里 `providers.zcode-plan` 与常量深等
 *   （api / baseURL / models 两条 / retryPolicy.retryableCodes 六项）→ 再
 *   `--dump-config-schema` 退出码 0（该命令会 import 插件模块，故脚本前置
 *   要求 `pnpm --filter dsh-plugin-zcode-plan build` 的产物存在）。
 *
 * 临时目录在 finally 清理，不在仓内留痕。断言失败时只打印 dump 的
 * `llm-pi-ai` 片段——本脚本合成的 profile 不含任何凭据内容，安全。
 *
 * 用法：`pnpm --filter dsh-plugin-zcode-plan build && pnpm --filter dsh-plugin-zcode-plan compose:check`
 */

import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

const PLUGIN_ROOT = fileURLToPath(new URL('../', import.meta.url))
const PROFILE_NAME = 'compose-check'
const ROUTE_ID = 'zcode-plan'
const ROUTE_ENTRY_ID = 'llm-pi-ai'
/** 官方 bundle 名与入口包名（bundles 数组锚点）。 */
const BASE_BUNDLE = '@deepseek-ai/dsh-base'
const PLUGIN_PACKAGE = 'dsh-plugin-zcode-plan'
/** 覆盖 dsh 安装根的入口（默认从本仓 devDependencies 的 @deepseek-ai/dsh 解析）。 */
const DSH_ROOT_OVERRIDE = process.env.ZCODE_PLAN_DSH_ROOT

/** 与 src/host/route-config.ts 同语义的深等（本脚本自持，不 import 构建产物）。 */
function deepEqual(a, b) {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  return keysA.every((k) => k in b && deepEqual(a[k], b[k]))
}

/**
 * 定位本仓 devDependencies 里的同一份 `@deepseek-ai/dsh` 安装（0.2.1-rc.2）：
 * 从插件 package.json 出发 `require.resolve` 到包根，bin 入口、`dsh-base` bundle
 * 与 `yaml` 库全部取自这一份安装——pnpm（`.pnpm` 虚拟仓）与 `npm -g`（hoisted
 * node_modules）两种形态都命中，且不依赖 PATH（volta 容器内没有全局 dsh）。
 * 可用 `ZCODE_PLAN_DSH_ROOT` 环境变量直接指定安装根（如机器上只有全局安装）。
 */
function locateDsh() {
  const req = createRequire(join(PLUGIN_ROOT, 'package.json'))
  let root
  if (DSH_ROOT_OVERRIDE) {
    root = DSH_ROOT_OVERRIDE
    if (!existsSync(join(root, 'package.json'))) {
      fail(`ZCODE_PLAN_DSH_ROOT=${DSH_ROOT_OVERRIDE} 下没有 package.json`)
    }
  } else {
    try {
      root = dirname(req.resolve('@deepseek-ai/dsh/package.json'))
    } catch {
      fail('无法定位 @deepseek-ai/dsh（devDependencies 未安装？先跑 pnpm install；或用 ZCODE_PLAN_DSH_ROOT 指定安装根）')
    }
  }
  // bin 入口：同一份安装的 bin 字段（`bin: { dsh: 'lib/bin.js' }`），绕开 PATH 差异
  let bin
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    const binRel = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin && pkg.bin.dsh
    if (binRel && existsSync(join(root, binRel))) bin = join(root, binRel)
  } catch {
    // 读不到 bin 就退回 PATH 上的 dsh
  }
  // dsh-base bundle：优先从 dsh 包根解析（pnpm 虚拟仓形态），退回 hoisted 目录（npm -g 形态）
  const hoisted = join(root, 'node_modules', ...BASE_BUNDLE.split('/'))
  let baseDir
  try {
    baseDir = dirname(createRequire(join(root, 'package.json')).resolve(`${BASE_BUNDLE}/package.json`))
  } catch {
    baseDir = hoisted
  }
  if (!existsSync(join(baseDir, 'package.json'))) {
    fail(`dsh 安装根 ${root} 下找不到 ${BASE_BUNDLE}（可用 ZCODE_PLAN_DSH_ROOT 指定安装根）`)
  }
  let yaml
  try {
    yaml = createRequire(join(root, 'package.json'))('yaml')
  } catch {
    fail(`dsh 安装根 ${root} 下解析不到 yaml 库（dump 的用户层序列化需要它）`)
  }
  return { root, bin, baseDir, yaml }
}

/** 统一失败出口：打印原因后以非零码退出。 */
function fail(message) {
  console.error(`[compose-check] ✗ ${message}`)
  process.exit(1)
}

async function main() {
  const startedAt = Date.now()

  // ---- 前置：E3 的 --dump-config-schema 会 import 插件模块，先要构建产物在场 ----
  if (!existsSync(join(PLUGIN_ROOT, 'lib', 'index.js'))) {
    fail('缺 lib/index.js（E3 的 --dump-config-schema 会 import 插件模块）；请先运行 pnpm --filter dsh-plugin-zcode-plan build')
  }

  // ---- 取 ZCODE_PLAN_ROUTE：子进程 node --experimental-strip-types 直接 import TS 源 ----
  // （route-config.ts 对 ports.ts 只有 import type，类型剥离后不会加载它；Node 22 需要
  // 显式标志、Node 24 默认剥离但标志仍合法，子进程方案两端兼容。）
  // URL 在宿主侧转好：子进程的 -e eval 环境没有预置 pathToFileURL（Node 22 实测）
  const routeTsHref = new URL('../src/host/route-config.ts', import.meta.url).href
  const routeProbe = spawnSync(
    process.execPath,
    [
      '--experimental-strip-types',
      '--input-type=module',
      '-e',
      `import(${JSON.stringify(routeTsHref)})` +
        `.then(m => process.stdout.write(JSON.stringify(m.ZCODE_PLAN_ROUTE)))` +
        `.catch(e => { console.error(e && e.message); process.exit(1) })`,
    ],
    { encoding: 'utf8', cwd: PLUGIN_ROOT, timeout: 30_000 },
  )
  if (routeProbe.status !== 0 || !routeProbe.stdout.trim()) {
    fail(`无法从 src/host/route-config.ts 取 ZCODE_PLAN_ROUTE（node --experimental-strip-types）：${routeProbe.stderr.trim()}`)
  }
  const route = JSON.parse(routeProbe.stdout)

  // ---- 借 yaml / dsh-base / dsh bin：全部取自本仓 devDependencies 的同一份 dsh 安装 ----
  const { bin: dshBin, baseDir: baseBundleDir, yaml } = locateDsh()

  // ---- 建隔离 $DSH_HOME：mkdtemp + profiles/compose-check/{package.json, patch, node_modules} ----
  const home = mkdtempSync(join(tmpdir(), 'dsh-zcode-compose-'))
  const profileDir = join(home, 'profiles', PROFILE_NAME)
  mkdirSync(join(profileDir, 'node_modules', '@deepseek-ai'), { recursive: true })
  writeFileSync(
    join(profileDir, 'package.json'),
    `${JSON.stringify(
      {
        name: `dsh-profile-${PROFILE_NAME}`,
        private: true,
        // bundle 双锚：按包名列在 bundles 数组 + node_modules 里 symlink 实体目录
        // （dsh-app-boot 允许 insert name 写绝对路径，本脚本采用 symlink 方案——
        // 与真实 profile 的 node_modules 形态一致，实测无需 dependencies 声明）。
        dsh: { profile: { bundles: [BASE_BUNDLE, PLUGIN_PACKAGE] } },
      },
      null,
      2,
    )}\n`,
  )
  symlinkSync(baseBundleDir, join(profileDir, 'node_modules', ...BASE_BUNDLE.split('/')), 'dir')
  symlinkSync(PLUGIN_ROOT, join(profileDir, 'node_modules', PLUGIN_PACKAGE), 'dir')

  const patchPath = join(profileDir, 'cordis.patch.yml')
  const overlayPath = join(home, 'overlay.patch.yml') // E2 的合成用户层（--patch overlay）
  try {
    const results = []

    /** 跑一次 dsh（隔离 DSH_HOME；bin 直接取自 devDep 安装，PATH 上没有 dsh 也能跑）。 */
    const runDsh = (args) =>
      spawnSync(dshBin ?? 'dsh', ['--profile', PROFILE_NAME, ...args], {
        encoding: 'utf8',
        env: { ...process.env, DSH_HOME: home },
        maxBuffer: 64 * 1024 * 1024,
        timeout: 120_000,
      })

    /**
     * 解析 dump 文档为条目数组。dump 里 dsh-base 层的 `!!js` 表达式不执行
     * （按字符串保留，断言只看 id / name / config）；`logLevel: 'error'`
     * 压掉这些表达式触发 TAG_RESOLVE_FAILED 警告的噪音。
     */
    const parseDump = (text) => yaml.parse(text, { logLevel: 'error' })

    /** 失败诊断：打印 dump 的 llm-pi-ai 片段（合成 profile 无凭据，安全）。 */
    const dumpLlmFragment = (dumpText) => {
      try {
        const llm = parseDump(dumpText).find((e) => e && e.id === ROUTE_ENTRY_ID)
        return llm === undefined ? `（dump 里没有 ${ROUTE_ENTRY_ID} 条目）` : yaml.stringify(llm)
      } catch {
        // parse 失败时退化为原文切片，只取 llm-pi-ai 行起 40 行
        const at = dumpText.indexOf(`id: ${ROUTE_ENTRY_ID}`)
        return at < 0 ? `（dump 里没有 ${ROUTE_ENTRY_ID} 行）` : dumpText.slice(at, at + 2000)
      }
    }

    /** 逐例执行：name = 用例名；fn 返回失败原因（null = 通过）。 */
    const runCase = (name, fn) => {
      try {
        const problem = fn()
        if (problem === null) {
          results.push({ name, ok: true })
          console.log(`[compose-check] ${name} … PASS`)
        } else {
          results.push({ name, ok: false, problem })
          console.log(`[compose-check] ${name} … FAIL`)
          console.log(`[compose-check]   原因：${problem}`)
        }
      } catch (e) {
        results.push({ name, ok: false, problem: String(e && e.message) })
        console.log(`[compose-check] ${name} … FAIL`)
        console.log(`[compose-check]   异常：${e && e.stack}`)
      }
    }

    /** dump 失败的统一诊断。 */
    const dumpProblem = (label, run) =>
      `dsh ${label} 退出码 ${run.status}：${(run.stderr || run.stdout || '').trim().slice(0, 400)}`

    // ---- E1 插件行存在：patch = []（README：空文件会导致启动失败，禁层用 []）----
    runCase('E1 插件行存在（dump 内 - id: zcode-plan 恰 1 行）', () => {
      writeFileSync(patchPath, '[]\n')
      const run = runDsh(['--dump-config'])
      if (run.status !== 0) return dumpProblem('--dump-config', run)
      const idLines = run.stdout.split('\n').filter((line) => line.includes(`id: ${ROUTE_ID}`))
      if (idLines.length !== 1) {
        return `期望 'id: zcode-plan' 恰 1 行，实际 ${idLines.length} 行：\n${idLines.join('\n')}`
      }
      const doc = parseDump(run.stdout)
      const rows = doc.filter((e) => e && e.id === ROUTE_ID)
      if (rows.length !== 1 || rows[0].name !== PLUGIN_PACKAGE) {
        return `插件行结构不符：${JSON.stringify(rows)}`
      }
      return null
    })

    // ---- E2 整份替换哨兵：下层（route install 落盘态）有 zcode-plan，合成用户层只写 user-route ----
    // 任务原文「同一临时 profile 再加一条合成用户层」。实现上把该用户层放 --patch
    // overlay（app-boot README 将 user layer 与 --patch overlays 并列为用户层），
    // profile patch 先写成 route install 的落盘形态——哨兵必须让「下层有
    // zcode-plan」，否则深合语义下它也不会转红（字面形态下层无路由，哨兵无效）。
    runCase('E2 整份替换哨兵（用户层覆盖后无 zcode-plan 路由键）', () => {
      writeFileSync(
        patchPath,
        yaml.stringify([
          {
            id: ROUTE_ENTRY_ID,
            config: { providers: { [ROUTE_ID]: { api: 'openai-completions', baseURL: 'https://example.invalid', models: [{ id: 'sentinel', name: 'sentinel' }] } } },
          },
        ]),
      )
      writeFileSync(
        overlayPath,
        yaml.stringify([{ id: ROUTE_ENTRY_ID, config: { providers: { 'user-route': { apiKeyEnv: 'USER_ROUTE_KEY' } } } }]),
      )
      const run = runDsh(['--patch', overlayPath, '--dump-config'])
      if (run.status !== 0) return dumpProblem('--dump-config --patch', run)
      const doc = parseDump(run.stdout)
      const llm = doc.find((e) => e && e.id === ROUTE_ENTRY_ID)
      const providers = llm && llm.config && llm.config.providers
      if (!providers || !('user-route' in providers)) {
        return `用户层 user-route 未生效：${dumpLlmFragment(run.stdout)}`
      }
      if (ROUTE_ID in providers) {
        return '回归：dump 里出现了 zcode-plan 路由键——上游 patch 合并疑似改成深合，回看 D-1'
      }
      if (Object.keys(providers).length !== 1) {
        return `providers 应恰剩 user-route 一键（整份替换），实际键：${Object.keys(providers).join(', ')}`
      }
      const rows = doc.filter((e) => e && e.id === ROUTE_ID)
      if (rows.length !== 1) {
        return `用户层覆盖不应影响插件行本身：期望 1 行，实际 ${rows.length} 行`
      }
      return null
    })

    // ---- E3 用户层注入完整路由：dump 与 ZCODE_PLAN_ROUTE 深等 + --dump-config-schema 可加载 ----
    runCase('E3 用户层注入完整路由（深等 + --dump-config-schema 退出码 0）', () => {
      writeFileSync(
        patchPath,
        yaml.stringify([{ id: ROUTE_ENTRY_ID, config: { providers: { [ROUTE_ID]: route } } }]),
      )
      const run = runDsh(['--dump-config'])
      if (run.status !== 0) return dumpProblem('--dump-config', run)
      const doc = parseDump(run.stdout)
      const llm = doc.find((e) => e && e.id === ROUTE_ENTRY_ID)
      const dumped = llm && llm.config && llm.config.providers && llm.config.providers[ROUTE_ID]
      if (dumped === undefined || typeof dumped !== 'object') {
        return `dump 里没有 providers.${ROUTE_ID}：${dumpLlmFragment(run.stdout)}`
      }
      const details = []
      if (dumped.api !== route.api) details.push(`api=${dumped.api}`)
      if (dumped.baseURL !== route.baseURL) details.push(`baseURL=${dumped.baseURL}`)
      if (!Array.isArray(dumped.models) || dumped.models.length !== 2) {
        details.push(`models=${JSON.stringify(dumped.models)}`)
      }
      if (!deepEqual(dumped.retryPolicy && dumped.retryPolicy.retryableCodes, route.retryPolicy.retryableCodes)) {
        details.push(`retryableCodes=${JSON.stringify(dumped.retryPolicy && dumped.retryPolicy.retryableCodes)}`)
      }
      if (details.length > 0) return `路由不完整（${details.join('; ')}）：\n${dumpLlmFragment(run.stdout)}`
      if (!deepEqual(dumped, route)) {
        return '路由与 ZCODE_PLAN_ROUTE 常量深等失败（组合过程有字段丢失/变形）：\n' + dumpLlmFragment(run.stdout)
      }
      const schema = runDsh(['--dump-config-schema'])
      if (schema.status !== 0) {
        return `--dump-config-schema 退出码 ${schema.status}：${(schema.stderr || '').trim().slice(0, 400)}`
      }
      return null
    })

    // ---- 汇总：逐例打印摘要，任一不符即非零退出 ----
    const failed = results.filter((r) => !r.ok)
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1)
    if (failed.length > 0) {
      console.log(`[compose-check] ${results.length - failed.length}/${results.length} 通过（耗时 ${elapsed}s）——失败：${failed.map((f) => f.name).join(' / ')}`)
      process.exitCode = 1
    } else {
      console.log(`[compose-check] ${results.length}/${results.length} 通过（耗时 ${elapsed}s）：E1 插件行存在 / E2 整份替换哨兵 / E3 完整路由可加载`)
    }
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
}

main().catch((e) => fail(e && e.stack ? e.stack : String(e)))
