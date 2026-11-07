/**
 * 构建产物的形状与纯度（对照 `build.mjs` 与 `package.json`）：结构层三组（壳 / require 面 /
 * 宿主自包含）由 build-kit 的产物契约断言（③.3 / ④ D5）；本文件只留包独有事实——内联标记、
 * css 注入器（四个模块）、宿主 channel 与端点、包声明（inject / 无 sidebar / contracts devDep）。
 * `verify:all` 的顺序（lint → typecheck → build → test）是前提。
 * @module dsh-plugin-web-ux/test/bundle
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { hostSelfContainmentIssues, loaderShellIssues, requireSurfaceIssues } from '@dsh-plugins/build-kit/artifact-contract'
// 词法器仍是 `scripts/lib/artifacts.mjs` 的单一实现（R9），本套件不持有本地副本。
import { importedWords, readArtifact, requiredWords } from '../../../scripts/lib/artifacts.mjs'

/** 本包目录（`test/` 的上一级）与浏览器 loader 期望的包身份。 */
const ROOT = path.resolve(import.meta.dirname, '..')
const PACKAGE_NAME = 'dsh-plugin-web-ux'
/** 浏览器 bundle 模块词（`CLIENT_EXTERNALS` 里实际被用的三项）；三份词集是独立证据，不共享常量（D5）。 */
const CLIENT_EXTERNALS = ['@deepseek-ai/dsh-client-ui-primitives', 'react', 'react/jsx-runtime']

describe('浏览器半产物', () => {
  it('按包名注册进模块加载器，且是 factory 形态', () => {
    expect(loaderShellIssues({ packageName: PACKAGE_NAME, source: readArtifact(ROOT, 'client.js') })).toEqual([])
  })

  it('只 require 浏览器壳提供的模块词，宿主半与 node 内建都不出现', () => {
    const source = readArtifact(ROOT, 'client.js')
    expect(requireSurfaceIssues({ packageName: PACKAGE_NAME, expected: CLIENT_EXTERNALS,
      required: requiredWords(source), imported: importedWords(source) })).toEqual([])
  })

  it('内联了删除与会话管理能力的契约，而不是引用宿主半', () => {
    const source = readArtifact(ROOT, 'client.js')
    expect(source).toContain('/web-ux')
    expect(source).toContain('preview-delete')
    expect(source).toContain('delete-session')
    expect(source).toContain('sidebar.workspaces.session.menu.item')
    expect(source).toContain('shell.overlay')
    expect(source).toContain('workspace-config.section')
    // 加引号是为了区分分节 id 与文案/端点里出现的同名前缀。
    expect(source).toContain(JSON.stringify('web-ux-session-manager'))
    // D3：holder 只以 `import type` 消费，产物里不得出现它的包名。
    expect(source).not.toContain('dsh-plugin-workspace-config')
    // 会话管理面调用的五个新端点（批量 2 个、迁移域 3 个）。
    for (const endpoint of [
      'preview-delete-batch', 'delete-session-batch', 'list-migrated',
      'delete-migrated', 'restore-migrated',
    ]) {
      expect(source).toContain(endpoint)
    }
  })

  it('内联了命令结果通知能力：事件名、座位与卡片身份', () => {
    const source = readArtifact(ROOT, 'client.js')
    expect(source).toContain('command/executed')
    expect(source).toContain('conversation.input.overlay')
    expect(source).toContain('web-ux-command-notice')
  })

  it('每个 css 模块都注入自己的样式表（防重护栏按包+模块，而非只按包）', () => {
    const source = readArtifact(ROOT, 'client.js')
    // 四个 css 模块（badge / delete / notice / session-manager）各一个 data-dsh-css 注入器；
    // 只按包名防重会让第一个模块之后的样式永远被跳过（v1.4.0 的 delete 样式即因此从未生效）。
    const injectors = source.match(/style\.setAttribute\((["'])data-dsh-css\1/g) ?? []
    expect(injectors).toHaveLength(4)
    // 通知卡的样式确实内联（不透明背景变量来自 notice.module.css）。
    expect(source).toContain('--dsw-alias-bg-layer-2')
  })
})

describe('宿主半产物', () => {
  it('完全自包含：除 node 内建外没有任何模块依赖', () => {
    expect(hostSelfContainmentIssues({ packageName: PACKAGE_NAME,
      words: importedWords(readArtifact(ROOT, 'index.js')) })).toEqual([])
  })

  it('带有 channel、七个端点与两个会话事件名', () => {
    const source = readArtifact(ROOT, 'index.js')
    for (const marker of [
      '/web-ux', 'preview-delete', 'delete-session', 'preview-delete-batch',
      'delete-session-batch', 'list-migrated', 'delete-migrated', 'restore-migrated',
      'api-session/removed', 'api-session/added',
    ]) {
      expect(source).toContain(marker)
    }
  })
})

describe('包声明', () => {
  const manifest = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
    main?: string
    exports?: Record<string, { default?: string } | undefined>
    dsh?: { client?: { platform?: string; inject?: string[] } }
  }


  it('导出面同时提供宿主半与浏览器半', () => {
    expect(manifest.main).toBe('lib/index.js')
    expect(manifest.exports?.['.']?.default).toBe('./lib/index.js')
    expect(manifest.exports?.['./client']?.default).toBe('./lib/client.js')
  })

  it('声明 web 客户端模块与它依赖的上游客户端包', () => {
    expect(manifest.dsh?.client?.platform).toBe('web')
    const inject = manifest.dsh?.client?.inject ?? []
    for (const dependency of [
      '@deepseek-ai/dsh-client-ui-workspace', '@deepseek-ai/dsh-client-ui-layout',
      '@deepseek-ai/dsh-client-connection', '@deepseek-ai/dsh-client-locale',
      '@deepseek-ai/dsh-client-ui-session', '@deepseek-ai/dsh-client-ui-commands',
    ]) {
      expect(inject).toContain(dependency)
    }
    // D13：footer 入口删除后不再使用 ui-sidebar，inject 与 devDeps 同步收敛。
    expect(inject).not.toContain('@deepseek-ai/dsh-client-ui-sidebar')
    const devDependencies = (manifest as { devDependencies?: Record<string, string> }).devDependencies ?? {}
    expect(devDependencies).not.toHaveProperty('@deepseek-ai/dsh-client-ui-sidebar')
    expect(devDependencies['@dsh-plugins/contracts']).toBe('workspace:*')
  })
})
