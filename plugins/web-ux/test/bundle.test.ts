/**
 * 构建产物的形状与纯度（对照 `build.mjs` 与 `package.json` 的声明）。
 *
 * 这里断言的是**已构建的字节**，所以构建配置、external 列表或包声明的回归会在本仓
 * 报错，而不是等到浏览器或 profile 里才发现：
 *
 * - 浏览器半必须是 `window.__ModuleLoader__.load({ id, factory })` 形态的 CJS 工厂，
 *   且只 require 浏览器壳能提供的模块词（`react` / `react/jsx-runtime` /
 *   ui-primitives）——多出一个裸包名就意味着它被意外打进/漏进 external。
 * - 宿主半必须自包含：只允许 `node:*` 内建 import，任何 `@deepseek-ai/*` 运行时
 *   依赖都会让 profile 侧的 bare 安装失败。
 *
 * 依赖构建产物，故 `verify:all` 的顺序（lint → typecheck → build → test）是前提。
 *
 * @module dsh-plugin-web-ux/test/bundle
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/** 本包目录（`test/` 的上一级）。 */
const ROOT = path.resolve(import.meta.dirname, '..')
/** 浏览器 loader 期望的包身份。 */
const PACKAGE_NAME = 'dsh-plugin-web-ux'
/** 允许出现在浏览器 bundle 里的模块词（与 build.mjs 的 CLIENT_EXTERNALS 对应）。 */
const CLIENT_EXTERNALS = ['@deepseek-ai/dsh-client-ui-primitives', 'react', 'react/jsx-runtime']

/** 读取一个构建产物。 */
function readArtifact(name: string): string {
  return readFileSync(path.join(ROOT, 'lib', name), 'utf8')
}

/** 取出一段代码里全部静态 require 的模块词（去重排序）。 */
function requiredWords(source: string): string[] {
  return [...new Set([...source.matchAll(/require\("([^"]+)"\)/g)].map((match) => match[1] ?? ''))].sort()
}

/** 取出一段代码里全部静态 import/require 的模块词（去重排序）。 */
function importedWords(source: string): string[] {
  const words = [
    ...source.matchAll(/from\s+"([^"]+)"/g),
    ...source.matchAll(/require\("([^"]+)"\)/g),
    ...source.matchAll(/import\("([^"]+)"\)/g),
  ].map((match) => match[1] ?? '')
  return [...new Set(words)].sort()
}

describe('浏览器半产物', () => {
  it('按包名注册进模块加载器，且是 factory 形态', () => {
    const source = readArtifact('client.js')
    expect(source).toContain('window.__ModuleLoader__.load({')
    expect(source).toContain(`id: ${JSON.stringify(PACKAGE_NAME)}`)
    expect(source).toContain('factory: (require) => {')
  })

  it('只 require 浏览器壳提供的模块词，宿主半与 node 内建都不出现', () => {
    const source = readArtifact('client.js')
    expect(requiredWords(source)).toEqual(CLIENT_EXTERNALS)
    const imports = importedWords(source)
    expect(imports.filter((word) => word.startsWith('node:'))).toEqual([])
    expect(imports.filter((word) => word.includes(PACKAGE_NAME))).toEqual([])
  })

  it('内联了删除与会话管理能力的契约，而不是引用宿主半', () => {
    const source = readArtifact('client.js')
    expect(source).toContain('/web-ux')
    expect(source).toContain('preview-delete')
    expect(source).toContain('delete-session')
    expect(source).toContain('sidebar.workspaces.session.menu.item')
    expect(source).toContain('shell.overlay')
    // 会话管理面：统一「工作区配置」弹窗的分节座位（holder 声明、本包软注册），
    // 以及管理面调用的五个新端点（批量 2 个、迁移域 3 个）。
    expect(source).toContain('workspace-config.section')
    // 加引号是为了区分分节 id 与文案/端点里出现的同名前缀。
    expect(source).toContain(JSON.stringify('web-ux-session-manager'))
    // D3：holder 只以 `import type` 消费，产物里不得出现它的包名。
    expect(source).not.toContain('dsh-plugin-workspace-config')
    for (const endpoint of [
      'preview-delete-batch',
      'delete-session-batch',
      'list-migrated',
      'delete-migrated',
      'restore-migrated',
    ]) {
      expect(source).toContain(endpoint)
    }
  })

  it('内联了命令结果通知能力：事件名、座位与卡片身份', () => {
    const source = readArtifact('client.js')
    expect(source).toContain('command/executed')
    expect(source).toContain('conversation.input.overlay')
    expect(source).toContain('web-ux-command-notice')
  })

  it('每个 css 模块都注入自己的样式表（防重护栏按包+模块，而非只按包）', () => {
    const source = readArtifact('client.js')
    // 四个 css 模块（badge / delete / notice / session-manager）各自携带一个
    // data-dsh-css 注入器；只按包名防重会让第一个模块之后的样式永远被跳过
    // （v1.4.0 的 delete 样式即因此从未生效）。
    const injectors = source.match(/style\.setAttribute\((["'])data-dsh-css\1/g) ?? []
    expect(injectors).toHaveLength(4)
    // 通知卡的样式确实内联（不透明背景变量来自 notice.module.css）。
    expect(source).toContain('--dsw-alias-bg-layer-2')
  })
})

describe('宿主半产物', () => {
  it('完全自包含：除 node 内建外没有任何模块依赖', () => {
    const imports = importedWords(readArtifact('index.js'))
    const foreign = imports.filter((word) => !word.startsWith('node:'))
    expect(foreign).toEqual([])
  })

  it('带有 channel、七个端点与两个会话事件名', () => {
    const source = readArtifact('index.js')
    for (const marker of [
      '/web-ux',
      'preview-delete',
      'delete-session',
      'preview-delete-batch',
      'delete-session-batch',
      'list-migrated',
      'delete-migrated',
      'restore-migrated',
      'api-session/removed',
      'api-session/added',
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
      '@deepseek-ai/dsh-client-ui-workspace',
      '@deepseek-ai/dsh-client-ui-layout',
      '@deepseek-ai/dsh-client-connection',
      '@deepseek-ai/dsh-client-locale',
      '@deepseek-ai/dsh-client-ui-session',
      '@deepseek-ai/dsh-client-ui-commands',
    ]) {
      expect(inject).toContain(dependency)
    }
    // D13：footer 入口删除后不再使用 ui-sidebar，inject 与 devDeps 同步收敛。
    expect(inject).not.toContain('@deepseek-ai/dsh-client-ui-sidebar')
    const devDependencies = (manifest as { devDependencies?: Record<string, string> }).devDependencies ?? {}
    expect(devDependencies).not.toHaveProperty('@deepseek-ai/dsh-client-ui-sidebar')
    expect(devDependencies['dsh-plugin-workspace-config']).toBe('workspace:*')
  })
})
