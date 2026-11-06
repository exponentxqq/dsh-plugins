/**
 * 构建产物的形状、座位标记与包声明（对照 `build.mjs` 与 `package.json`）。
 *
 * 这里断言的是**已构建的字节**，所以构建配置、external 列表、座位声明或包声明的回归
 * 会在本仓报错，而不是等到浏览器 / profile 里才发现：
 *
 * - 浏览器半必须是 `window.__ModuleLoader__.load({ id, factory })` 形态的 CJS 工厂，
 *   且只 require 浏览器壳能提供的模块词（`react` / `react/jsx-runtime` /
 *   ui-primitives）。**尤其不得** require `@deepseek-ai/dsh-client-ui-slots`：它没有
 *   `./client` 导出、也不是 loader 模块表里的词，运行时 require 它会命中
 *   「missed the module table」硬错，整个客户端模块（入口 + 弹窗）一起消失（D2）。
 * - 座位名 `workspace-config.section` 在产物里**至少出现两次**：`children` 声明侧
 *   （`index.ts`）与 `renderSlot` 渲染侧（`WorkspaceConfigDialog.tsx`）。两处都是字面量
 *   直写（见两个源文件的注释）——只靠共享常量时 esbuild 只保留一份字面量，断言会退化。
 * - 两个宿主座位名（`sidebar.footer.action` / `shell.overlay`）与两个 entry id 在产物里。
 * - 宿主半是 no-op 锚点：**零 import**（自包含，只有包声明让 client-module scan 找到它）。
 * - CSS modules 只有一份（入口与弹窗共用 `dialog.module.css`），因此恰一个样式注入器。
 * - 包声明：`exports['./client'].types` 指向 `lib/types/client/index.d.ts` 且文件存在
 *   （D4：holder 是贡献方的类型权威），`dsh.client` 声明 web 平台与四个座位声明方依赖。
 *
 * 依赖构建产物，故 `pnpm test` 之前必须先 `pnpm build`（`verify:all` 的顺序是
 * lint → typecheck → build → test）。
 *
 * @module dsh-plugin-workspace-config/test/bundle
 */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
// 产物词法器的单一实现（R9）：本套件不再持有本地副本，与仓级
// `scripts/check-artifacts.mjs` 共用同一份正则与路径约定。声明见
// `scripts/lib/artifacts.d.mts`；本套件当前不在 tsconfig 的 include 里。
import { importedWords, readArtifact, requiredWords } from '../../../scripts/lib/artifacts.mjs'
// 软插件基线范围从仓库根唯一版本常量派生（`SOFT_DSH_RANGE`）：基线提升
// （`pnpm dsh:upgrade`）重写 scripts/dsh-baseline.mjs 与各 manifest 之后，
// 本套件的版本断言自动对齐，不再逐次手改字面量。
import { SOFT_DSH_RANGE } from '../../../scripts/dsh-baseline.mjs'

/** 本包目录（`test/` 的上一级）。 */
const ROOT = path.resolve(import.meta.dirname, '..')
/** 浏览器 loader 期望的包身份。 */
const PACKAGE_NAME = 'dsh-plugin-workspace-config'
/** 允许出现在浏览器 bundle 里的模块词（与 build.mjs 的 CLIENT_EXTERNALS 对应）。 */
const CLIENT_EXTERNALS = ['@deepseek-ai/dsh-client-ui-primitives', 'react', 'react/jsx-runtime']

/** 包清单的形状（只取本套件断言到的字段）。 */
interface Manifest {
  main?: string
  exports?: Record<string, { default?: string; types?: string } | undefined>
  dsh?: {
    engines?: { dsh?: string }
    client?: { platform?: string; inject?: string[] }
  }
  peerDependencies?: Record<string, string>
}

describe('浏览器半产物', () => {
  it('按包名注册进模块加载器，且是 factory 形态', () => {
    const source = readArtifact(ROOT, 'client.js')
    expect(source).toContain('window.__ModuleLoader__.load({')
    expect(source).toContain(`id: ${JSON.stringify(PACKAGE_NAME)}`)
    expect(source).toContain('factory: (require) => {')
  })

  it('只 require 浏览器壳提供的模块词，且不 require slots 包（D2 硬错防线）', () => {
    const source = readArtifact(ROOT, 'client.js')
    expect(requiredWords(source)).toEqual(CLIENT_EXTERNALS)
    expect(requiredWords(source)).not.toContain('@deepseek-ai/dsh-client-ui-slots')
    const imports = importedWords(source)
    expect(imports.filter((word) => word.startsWith('node:'))).toEqual([])
    // 自引用会变成对 holder 自己的运行时 require（模块表里没有这个包）。
    expect(imports.filter((word) => word.includes(PACKAGE_NAME))).toEqual([])
  })

  it('座位名在产物里至少出现两次：children 声明 + renderSlot 渲染', () => {
    const source = readArtifact(ROOT, 'client.js')
    const occurrences = source.match(/workspace-config\.section/g) ?? []
    expect(occurrences.length).toBeGreaterThanOrEqual(2)
    // 声明侧与渲染侧是两处不同的语义点，都必须是可 grep 的字面量。
    expect(source).toContain('"workspace-config.section":')
    expect(source).toContain('"workspace-config.section",')
  })

  it('内联了两个宿主座位名与两个 entry id（footer 入口 + 统一弹窗）', () => {
    const source = readArtifact(ROOT, 'client.js')

    expect(source).toContain('sidebar.footer.action')
    expect(source).toContain('shell.overlay')
    expect(source).toContain(JSON.stringify('workspace-config-trigger'))
    expect(source).toContain(JSON.stringify('workspace-config-dialog'))
  })

  it('不含三个贡献方包名：四包之间没有运行时反向依赖（D3）', () => {
    const source = readArtifact(ROOT, 'client.js')
    for (const dependency of [
      'dsh-plugin-multi-root-workspace',
      'dsh-plugin-session-tool-toggle',
      'dsh-plugin-web-ux',
    ]) {
      expect(source).not.toContain(dependency)
    }
  })

  it('内联了弹窗壳与入口的关键文案键（翻译键随产物，文案在 locales.ts）', () => {
    const source = readArtifact(ROOT, 'client.js')
    for (const key of ['entry.label', 'dialog.title', 'dialog.close', 'nav.label', 'dialog.empty.title']) {
      expect(source).toContain(key)
    }
  })

  it('全部 CSS modules 内联为单个样式注入器（入口与弹窗共用 dialog.module.css）', () => {
    const source = readArtifact(ROOT, 'client.js')
    const injectors = source.match(/style\.setAttribute\((["'])data-dsh-css\1/g) ?? []
    expect(injectors).toHaveLength(1)
    expect(source).toContain('data-dsh-plugin')
  })
})

describe('宿主半产物', () => {
  it('完全自包含：零 import（no-op 锚点）', () => {
    expect(importedWords(readArtifact(ROOT, 'index.js'))).toEqual([])
  })

  it('不内联浏览器半（两端产物各自独立）', () => {
    const source = readArtifact(ROOT, 'index.js')
    expect(source).not.toContain('WorkspaceConfigDialog')
    expect(source).not.toContain('window.__ModuleLoader__')
  })
})

describe('包声明', () => {
  const manifest = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as Manifest

  it('导出面同时提供宿主半、浏览器半与类型产物', () => {
    expect(manifest.main).toBe('lib/index.js')
    expect(manifest.exports?.['.']?.default).toBe('./lib/index.js')
    expect(manifest.exports?.['./client']?.default).toBe('./lib/client.js')
    expect(manifest.exports?.['./client']?.types).toBe('./lib/types/client/index.d.ts')
    // D4：类型权威必须真实存在（build:types 的产物）。
    expect(existsSync(path.join(ROOT, 'lib/types/client/index.d.ts'))).toBe(true)
    expect(existsSync(path.join(ROOT, 'lib/types/client/contract.d.ts'))).toBe(true)
  })

  it('声明 web 客户端模块与四个座位声明方依赖（不含 primitives）', () => {
    expect(manifest.dsh?.client?.platform).toBe('web')
    const inject = manifest.dsh?.client?.inject ?? []
    for (const dependency of [
      '@deepseek-ai/dsh-client-ui-renderer',
      '@deepseek-ai/dsh-client-locale',
      '@deepseek-ai/dsh-client-ui-sidebar',
      '@deepseek-ai/dsh-client-ui-layout',
    ]) {
      expect(inject).toContain(dependency)
    }
    expect(inject).not.toContain('@deepseek-ai/dsh-client-ui-primitives')
  })

  it('engines.dsh 与 @deepseek-ai/dsh peer 都是软插件基线范围', () => {
    expect(manifest.dsh?.engines?.dsh).toBe(SOFT_DSH_RANGE)
    expect(manifest.peerDependencies?.['@deepseek-ai/dsh']).toBe(SOFT_DSH_RANGE)
  })
})
