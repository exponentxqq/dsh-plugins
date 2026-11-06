/**
 * 壳与推导的单测：钉住 ModuleLoader 壳的形状/缩进（K8）与
 * `deriveStrategy` 的包事实推导（kind / dtsOwned），并附带一个
 * `buildPlugin` 的端到端小集成（host-only + dual 各一）。
 *
 * 壳的期望值逐字取自 `plugins/web-ux/lib/client.js` 的真实尾部形状：
 * esbuild 输出以换行结尾，因此 `return module.exports;` 之前有一行空行。
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { indentBlock, moduleLoaderShell } from '../src/client.mjs'
import { buildPlugin, deriveStrategy } from '../src/index.mjs'

/** 本文件创建的临时目录，测试结束统一清理。 */
const temporaryRoots = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

/**
 * 建一个临时包目录（可选地创建宿主半 / 浏览器半入口）。
 * @param {object} [options] 选项。
 * @param {boolean} [options.host] 是否创建 `src/index.ts`。
 * @param {boolean} [options.client] 是否创建 `src/client/index.ts`。
 * @returns {Promise<string>} 包目录的绝对路径。
 */
async function makeRoot({ host = true, client = false } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'dsh-build-kit-'))
  temporaryRoots.push(root)
  if (host) {
    await mkdir(path.join(root, 'src'), { recursive: true })
    await writeFile(path.join(root, 'src/index.ts'), 'export const host = 1\n')
  }
  if (client) {
    await mkdir(path.join(root, 'src/client'), { recursive: true })
    await writeFile(path.join(root, 'src/client/index.ts'), 'export const client = 1\n')
  }
  return root
}

describe('moduleLoaderShell：壳形状', () => {
  it('逐字生成 loader 壳（id / factory / 缩进 / 结尾换行）', () => {
    const shell = moduleLoaderShell({ packageName: 'dsh-plugin-demo', code: 'var a = 1;\nvar b = 2;\n' })

    expect(shell).toBe(
      [
        'window.__ModuleLoader__.load({',
        '\tid: "dsh-plugin-demo",',
        '\tfactory: (require) => {',
        '\t\tvar module = { exports: {} };',
        '\t\tvar exports = module.exports;',
        '\t\tvar a = 1;',
        '\t\tvar b = 2;',
        '',
        '\t\treturn module.exports;',
        '\t}',
        '});',
        '',
      ].join('\n'),
    )
    expect(shell).toContain('window.__ModuleLoader__.load({')
    expect(shell).toContain('id: "dsh-plugin-demo"')
    expect(shell).toContain('factory: (require) => {')
    expect(shell.endsWith('});\n')).toBe(true)
  })

  it('包名按 JSON 字符串转义（id 不会破壳）', () => {
    const shell = moduleLoaderShell({ packageName: 'dsh-plugin-a"b', code: '' })

    expect(shell).toContain('id: "dsh-plugin-a\\"b",')
  })
})

describe('indentBlock：缩进层级', () => {
  it('每行加 N 个制表符，空行不加尾随空白', () => {
    expect(indentBlock('a\n\nb', 2)).toBe('\t\ta\n\n\t\tb')
    expect(indentBlock('a', 0)).toBe('a')
    expect(indentBlock('', 2)).toBe('')
  })
})

describe('deriveStrategy：包事实推导', () => {
  it('exports[*].types 存在 → dtsOwned 为真', async () => {
    const root = await makeRoot()
    const manifest = {
      name: 'dsh-plugin-demo',
      exports: {
        '.': { default: './lib/index.js' },
        './client': { types: './lib/types/client/index.d.ts', default: './lib/client.js' },
      },
    }

    expect(deriveStrategy(manifest, root).dtsOwned).toBe(true)
  })

  it('exports[*].types 缺席 → dtsOwned 为假', async () => {
    const root = await makeRoot()
    const manifest = {
      name: 'dsh-plugin-demo',
      exports: {
        '.': { default: './lib/index.js' },
        './package.json': './package.json',
      },
    }

    expect(deriveStrategy(manifest, root).dtsOwned).toBe(false)
  })

  it('dsh.client.platform=web 且有 client 入口 → dual', async () => {
    const root = await makeRoot({ client: true })
    const strategy = deriveStrategy({ name: 'dsh-plugin-demo', dsh: { client: { platform: 'web' } } }, root)

    expect(strategy.kind).toBe('dual')
    expect(strategy.clientEntry).toBe(path.join(root, 'src/client/index.ts'))
  })

  it('声明 web 但缺 client 入口 → 抛错（不静默降级为 host）', async () => {
    const root = await makeRoot()
    const clientEntry = path.join(root, 'src/client/index.ts')
    const manifest = { name: 'dsh-plugin-demo', dsh: { client: { platform: 'web' } } }

    expect(() => deriveStrategy(manifest, root)).toThrow(/声明了 web 半但入口缺失/)
    expect(() => deriveStrategy(manifest, root)).toThrow(clientEntry)
    expect(() => deriveStrategy(manifest, root)).toThrow(path.join('src', 'client', 'index.ts'))
  })

  it('有 client 入口但未声明 web → host', async () => {
    const root = await makeRoot({ client: true })
    const strategy = deriveStrategy({ name: 'dsh-plugin-demo' }, root)

    expect(strategy.kind).toBe('host')
  })

  it('缺宿主入口 → 抛错', async () => {
    const root = await makeRoot({ host: false })

    expect(() => deriveStrategy({ name: 'dsh-plugin-demo' }, root)).toThrow(/src\/index\.ts/)
  })
})

describe('buildPlugin：编排器集成', () => {
  it('host-only fixture：整目录清理 → 宿主半 → 守卫 → 返回四字段', async () => {
    const root = await makeRoot()
    await writeFile(
      path.join(root, 'package.json'),
      `${JSON.stringify({ name: 'dsh-plugin-fixture-host', exports: { '.': { default: './lib/index.js' } } }, null, 2)}\n`,
    )
    await writeFile(path.join(root, 'src/index.ts'), 'export const answer: number = 42\n')
    // 预置旧产物：full 清理必须把它删掉。
    await mkdir(path.join(root, 'lib'), { recursive: true })
    await writeFile(path.join(root, 'lib/stale.js'), 'stale\n')

    const result = await buildPlugin({ root })

    expect(result).toEqual({
      packageName: 'dsh-plugin-fixture-host',
      kind: 'host',
      dtsOwned: false,
      artifacts: ['lib/index.js'],
    })
    expect(await readFile(path.join(root, 'lib/index.js'), 'utf8')).toContain('42')
    await expect(readFile(path.join(root, 'lib/stale.js'), 'utf8')).rejects.toThrow()
  })

  it('dual fixture：CSS module 注入 + loader 壳 + js-only 清理保留 lib/types', async () => {
    const root = await makeRoot({ client: true })
    await writeFile(
      path.join(root, 'package.json'),
      `${JSON.stringify(
        {
          name: 'dsh-plugin-fixture-dual',
          exports: {
            '.': { default: './lib/index.js' },
            './client': { types: './lib/types/client/index.d.ts', default: './lib/client.js' },
          },
          dsh: { client: { platform: 'web' } },
        },
        null,
        2,
      )}\n`,
    )
    await writeFile(path.join(root, 'src/index.ts'), 'export const host = 1\n')
    await writeFile(
      path.join(root, 'src/client/index.ts'),
      "import classMap from './style.module.css'\nexport const client = classMap.card\n",
    )
    await writeFile(path.join(root, 'src/client/style.module.css'), '.card { color: red; }\n')
    // 预置 build:types 的产物与旧 JS：js-only 清理只覆盖 JS，必须保留 types。
    await mkdir(path.join(root, 'lib/types/client'), { recursive: true })
    await writeFile(path.join(root, 'lib/types/client/index.d.ts'), 'export {}\n')
    await writeFile(path.join(root, 'lib/client.js'), 'stale\n')

    const result = await buildPlugin({ root, cssClassPrefix: 'fx' })

    expect(result).toEqual({
      packageName: 'dsh-plugin-fixture-dual',
      kind: 'dual',
      dtsOwned: true,
      artifacts: ['lib/index.js', 'lib/client.js'],
    })
    const client = await readFile(path.join(root, 'lib/client.js'), 'utf8')
    expect(client.startsWith('window.__ModuleLoader__.load({')).toBe(true)
    expect(client).toContain('id: "dsh-plugin-fixture-dual"')
    expect(client).toContain('data-dsh-plugin')
    expect(client).toContain('data-dsh-css')
    expect(client).toContain('fx_card_')
    expect(client).not.toContain('stale')
    expect(await readFile(path.join(root, 'lib/types/client/index.d.ts'), 'utf8')).toBe('export {}\n')
  })

  it('宿主产物含 __require 但未开 shim → 守卫失败且不留坏产物', async () => {
    const root = await makeRoot()
    await writeFile(path.join(root, 'package.json'), `${JSON.stringify({ name: 'dsh-plugin-fixture-cjs' })}\n`)
    // 纯 CJS 依赖内联进 ESM 输出会生成 `__require(` 壳；不开 shim 时守卫必须拦下。
    await writeFile(
      path.join(root, 'src/index.ts'),
      "import legacy from './legacy.cjs'\nexport const pid = legacy.pid\n",
    )
    await writeFile(
      path.join(root, 'src/legacy.cjs'),
      "const process = require('process')\nmodule.exports = { pid: process.pid }\n",
    )

    await expect(buildPlugin({ root })).rejects.toThrow(/cjsRequireShim/)
    await expect(readFile(path.join(root, 'lib/index.js'), 'utf8')).rejects.toThrow()
  })

  it('双端缺 cssClassPrefix → 明确抛错', async () => {
    const root = await makeRoot({ client: true })
    await writeFile(
      path.join(root, 'package.json'),
      `${JSON.stringify({ name: 'dsh-plugin-fixture-dual', dsh: { client: { platform: 'web' } } }, null, 2)}\n`,
    )

    await expect(buildPlugin({ root })).rejects.toThrow(/cssClassPrefix/)
  })

  it('声明 web 半但缺浏览器入口 → 写产物前抛错（错误信息含缺失路径）', async () => {
    const root = await makeRoot()
    await writeFile(
      path.join(root, 'package.json'),
      `${JSON.stringify(
        { name: 'dsh-plugin-fixture-missing-client', dsh: { client: { platform: 'web' } } },
        null,
        2,
      )}\n`,
    )

    const failure = buildPlugin({ root, cssClassPrefix: 'fx' })

    await expect(failure).rejects.toThrow(/声明了 web 半但入口缺失/)
    await expect(failure).rejects.toThrow(path.join(root, 'src/client/index.ts'))
    // fail-fast 发生在清理/构建之前：连产物目录都不该被创建。
    await expect(readFile(path.join(root, 'lib/index.js'), 'utf8')).rejects.toThrow()
  })
})
