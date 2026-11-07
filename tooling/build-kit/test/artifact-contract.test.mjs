/**
 * 产物契约断言模块的正面 + 负面单测（D3/D4）。
 *
 * 判据本身是从 `guards.test.mjs` 迁来的「自包含」6 用例（断言强度逐字保留），
 * 另外补三类新内容：
 *
 * - 三个新契约函数的正面（空 issue 列表）与负面（缺标记 / 集合不等 / node: 泄漏 /
 *   自引用 / 未覆盖词）用例——负面用例是这轮下沉的主要收益：共享壳的失败信息
 *   必须自带包名与产物名，而不是让三份测试各自拼上下文；
 * - 探测命令（code-design ⑤组 4）的口径钉住：`expected: ["react"]` +
 *   `required: ["react", "node:fs"]` + `imported: ["react", "p"]` 恰好 2 条 issue；
 * - 契约纪律：实现只允许静态 import `node:module`（不读盘、不 import vitest /
 *   `scripts/lib`），且 `package.json` 的 `./artifact-contract` 子路径指向真实文件。
 */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  hostSelfContainmentIssues,
  loaderShellIssues,
  requireSurfaceIssues,
  selfContainmentIssues,
} from '../src/artifact-contract.mjs'
import { DEFAULT_CLIENT_EXTERNALS } from '../src/client.mjs'

/** 本包目录（`test/` 的上一级）。 */
const ROOT = path.resolve(import.meta.dirname, '..')

describe('loaderShellIssues：ModuleLoader 壳标记', () => {
  /** 一个完整的浏览器半壳（三条标记各出现一次）。 */
  const shell = [
    'window.__ModuleLoader__.load({',
    '  id: "dsh-plugin-fixture",',
    '  factory: (require) => {',
    '    return {}',
    '  },',
    '})',
  ].join('\n')

  it('三条标记齐全 → 空 issue 列表', () => {
    expect(loaderShellIssues({ packageName: 'dsh-plugin-fixture', source: shell })).toEqual([])
  })

  it('只有 loader 入口、缺 id 与 factory → 两条 issue 各自点名缺失标记', () => {
    const issues = loaderShellIssues({
      packageName: 'dsh-plugin-fixture',
      source: 'window.__ModuleLoader__.load({',
    })
    expect(issues).toHaveLength(2)
    expect(issues[0]).toContain('id: "dsh-plugin-fixture"')
    expect(issues[1]).toContain('factory: (require) => {')
    for (const issue of issues) {
      expect(issue).toContain('[dsh-plugin-fixture] lib/client.js:')
      expect(issue).toContain('期望：')
      expect(issue).toContain('实际：')
    }
  })

  it('id 是别的包名 → issue 点名期望的包身份', () => {
    const issues = loaderShellIssues({
      packageName: 'dsh-plugin-fixture',
      source: shell.replace('dsh-plugin-fixture', 'dsh-plugin-other'),
    })
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('id: "dsh-plugin-fixture"')
    expect(issues[0]).toContain('包身份 id')
  })

  it('缺 factory 形态 → issue 点名 factory 标记', () => {
    const issues = loaderShellIssues({
      packageName: 'dsh-plugin-fixture',
      source: shell.replace('  factory: (require) => {\n', ''),
    })
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('factory: (require) => {')
    expect(issues[0]).toContain('factory 形态')
  })
})

describe('requireSurfaceIssues：浏览器半 require 面', () => {
  it('required 与 expected 集合相等、imported 无 node: 与自引用 → 空 issue 列表', () => {
    expect(
      requireSurfaceIssues({
        packageName: 'dsh-plugin-fixture',
        expected: ['react', 'react/jsx-runtime'],
        required: ['react', 'react/jsx-runtime'],
        imported: ['react', 'react/jsx-runtime'],
      }),
    ).toEqual([])
  })

  it('词集多一个少一个 → 一条 issue 同时报「多余 / 缺失」与期望实际', () => {
    const issues = requireSurfaceIssues({
      packageName: 'dsh-plugin-fixture',
      expected: ['react', 'react/jsx-runtime'],
      required: ['react', 'react-dom'],
      imported: ['react', 'react-dom'],
    })
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('多余 [react-dom]')
    expect(issues[0]).toContain('缺失 [react/jsx-runtime]')
    expect(issues[0]).toContain('期望：[react, react/jsx-runtime]')
    expect(issues[0]).toContain('实际：[react, react-dom]')
    expect(issues[0]).toContain('[dsh-plugin-fixture] lib/client.js:')
  })

  it('imported 含 node: → 一条「node: 泄漏」issue', () => {
    const issues = requireSurfaceIssues({
      packageName: 'dsh-plugin-fixture',
      expected: ['react'],
      required: ['react'],
      imported: ['node:fs', 'react'],
    })
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('Node 内建')
    expect(issues[0]).toContain('node:fs')
    expect(issues[0]).toContain('[dsh-plugin-fixture] lib/client.js:')
  })

  it('imported 含本包名 → 一条「自引用」issue', () => {
    const issues = requireSurfaceIssues({
      packageName: 'dsh-plugin-fixture',
      expected: ['react'],
      required: ['react'],
      imported: ['dsh-plugin-fixture/client', 'react'],
    })
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('自引用')
    expect(issues[0]).toContain('dsh-plugin-fixture/client')
  })

  it('探测命令口径：集合不等 + 自引用恰好 2 条 issue，且都带包名与产物名', () => {
    const issues = requireSurfaceIssues({
      packageName: 'p',
      expected: ['react'],
      required: ['react', 'node:fs'],
      imported: ['react', 'p'],
    })
    expect(issues).toHaveLength(2)
    for (const issue of issues) {
      expect(issue).toContain('[p] lib/client.js:')
    }
  })

  it('重复词不影响集合比较（词法器输出去重前的输入也成立）', () => {
    expect(
      requireSurfaceIssues({
        packageName: 'dsh-plugin-fixture',
        expected: ['react'],
        required: ['react', 'react'],
        imported: ['react'],
      }),
    ).toEqual([])
  })
})

describe('selfContainmentIssues：自包含判据（原 assertSelfContained 的 6 用例）', () => {
  it('宿主半：node:* 与裸内建名合法', () => {
    expect(
      selfContainmentIssues({ words: ['node:fs', 'node:path', 'buffer', 'process'], externals: ['node:*'] }),
    ).toEqual([])
  })

  it('浏览器半：默认外部清单与相对内部块合法', () => {
    expect(
      selfContainmentIssues({
        words: ['react', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-primitives', './chunk-abc.js'],
        externals: DEFAULT_CLIENT_EXTERNALS,
      }),
    ).toEqual([])
  })

  it('未声明为外部的包 → 一条 issue，保留原三段失败文案并列出词', () => {
    const issues = selfContainmentIssues({ words: ['@dsh-plugins/build-kit'], externals: ['node:*'] })
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('@dsh-plugins/build-kit')
    expect(issues[0]).toContain('产物含未声明为外部的模块词：')
    expect(issues[0]).toContain('自包含铁律：产物只能引用 Node 内建（node:* / 裸内建名）、相对内部块，或调用方显式声明的外部模块；')
    expect(issues[0]).toContain('其余依赖必须被 esbuild 内联进产物。')
  })

  it('浏览器半不得引用 Node 内建（外部词里没有 node:*）', () => {
    const issues = selfContainmentIssues({ words: ['fs'], externals: [] })
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('fs')
  })

  it('词法器抓到的文案片段不参与判定', () => {
    expect(selfContainmentIssues({ words: ['Session manager → Migrated'], externals: ['node:*'] })).toEqual([])
  })

  it('外部词支持通配', () => {
    expect(selfContainmentIssues({ words: ['icon.png'], externals: ['*.png'] })).toEqual([])
    const issues = selfContainmentIssues({ words: ['icon.png'], externals: [] })
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('icon.png')
  })

  it('外部词支持包名子路径（react → react/jsx-runtime）', () => {
    expect(selfContainmentIssues({ words: ['react/jsx-runtime'], externals: ['react'] })).toEqual([])
  })

  it('未覆盖词去重后只出现一次', () => {
    const issues = selfContainmentIssues({
      words: ['@dsh-plugins/build-kit', '@dsh-plugins/build-kit'],
      externals: ['node:*'],
    })
    expect(issues).toHaveLength(1)
    expect(issues[0].match(/@dsh-plugins\/build-kit/g)).toHaveLength(1)
  })
})

describe('hostSelfContainmentIssues：宿主半自包含', () => {
  it('只有 node:* 与裸内建名 → 空 issue 列表', () => {
    expect(
      hostSelfContainmentIssues({ packageName: 'dsh-plugin-fixture', words: ['node:fs', 'buffer'] }),
    ).toEqual([])
  })

  it('默认外部词没有覆盖的上游包 → issue 带包名 + lib/index.js 前缀，正文保留原三段文案', () => {
    const issues = hostSelfContainmentIssues({
      packageName: 'dsh-plugin-fixture',
      words: ['@deepseek-ai/dsh-llm', 'node:fs'],
    })
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatch(/^\[dsh-plugin-fixture\] lib\/index\.js: /)
    expect(issues[0]).toContain('@deepseek-ai/dsh-llm')
    expect(issues[0]).toContain('自包含铁律：')
  })

  it('显式 externals 覆盖上游包 → 空 issue 列表', () => {
    expect(
      hostSelfContainmentIssues({
        packageName: 'dsh-plugin-fixture',
        words: ['@deepseek-ai/dsh-llm', 'node:fs'],
        externals: ['node:*', '@deepseek-ai/dsh-llm'],
      }),
    ).toEqual([])
  })
})

describe('契约纪律与子路径导出', () => {
  it('实现只静态 import node:module（不读盘、不 import vitest / scripts/lib）', () => {
    const source = readFileSync(path.join(ROOT, 'src', 'artifact-contract.mjs'), 'utf8')
    const specifiers = [...source.matchAll(/^\s*import\s+[^;]*?from\s+['"]([^'"]+)['"]/gm)].map(
      (match) => match[1],
    )
    expect(specifiers).toEqual(['node:module'])
  })

  it('package.json 暴露 ./artifact-contract 子路径且两目标文件存在', () => {
    const manifest = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
    expect(manifest.exports['./artifact-contract']).toEqual({
      types: './src/artifact-contract.d.mts',
      default: './src/artifact-contract.mjs',
    })
    expect(existsSync(path.join(ROOT, 'src', 'artifact-contract.mjs'))).toBe(true)
    expect(existsSync(path.join(ROOT, 'src', 'artifact-contract.d.mts'))).toBe(true)
  })
})
