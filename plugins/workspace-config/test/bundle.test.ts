/**
 * 构建产物的形状、座位标记与包声明：结构层三组（壳 / require 面 / 宿主自包含）由 build-kit 的
 * 产物契约断言（③.3 / ④ D5）；本文件保留包独有事实——座名字面量与出现次数、注入器、
 * `exports['./client'].types`、软插件基线范围（D2/D4/D13）。
 * `pnpm test` 之前必须先 `pnpm build`（`verify:all` 的顺序是 lint → typecheck → build → test）。
 * @module dsh-plugin-workspace-config/test/bundle
 */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { hostSelfContainmentIssues, loaderShellIssues, requireSurfaceIssues } from '@dsh-plugins/build-kit/artifact-contract'
// 词法器仍是 `scripts/lib/artifacts.mjs` 的单一实现（R9）；声明见同目录 `artifacts.d.mts`。
import { importedWords, readArtifact, requiredWords } from '../../../scripts/lib/artifacts.mjs'
// 软插件基线范围（R4③ 收口）：从仓库根唯一版本常量派生，`pnpm dsh:upgrade` 重指后本套件自动对齐；
// 声明见同目录 `dsh-baseline.d.mts`。
import { SOFT_DSH_RANGE } from '../../../scripts/dsh-baseline.mjs'

/** 本包目录（`test/` 的上一级）与浏览器 loader 期望的包身份。 */
const ROOT = path.resolve(import.meta.dirname, '..')
const PACKAGE_NAME = 'dsh-plugin-workspace-config'
/** 浏览器 bundle 模块词（`CLIENT_EXTERNALS` 里实际被用的三项）；三份词集是独立证据，不共享常量（D5）。 */
const CLIENT_EXTERNALS = ['@deepseek-ai/dsh-client-ui-primitives', 'react', 'react/jsx-runtime']

/** 包清单的形状（只取本套件断言到的字段）。 */
interface Manifest {
  main?: string
  exports?: Record<string, { default?: string; types?: string } | undefined>
  dsh?: { engines?: { dsh?: string }; client?: { platform?: string; inject?: string[] } }
  peerDependencies?: Record<string, string>
}

describe('浏览器半产物', () => {
  it('按包名注册进模块加载器，且是 factory 形态', () => {
    expect(loaderShellIssues({ packageName: PACKAGE_NAME, source: readArtifact(ROOT, 'client.js') })).toEqual([])
  })

  it('只 require 浏览器壳提供的模块词，且不 require slots 包（D2 硬错防线）', () => {
    const source = readArtifact(ROOT, 'client.js')
    expect(requireSurfaceIssues({ packageName: PACKAGE_NAME, expected: CLIENT_EXTERNALS,
      required: requiredWords(source), imported: importedWords(source) })).toEqual([])
    // slots 没有 `./client` 导出、也不在 loader 模块表里，require 它命中「missed the module table」硬错（D2）。
    expect(requiredWords(source)).not.toContain('@deepseek-ai/dsh-client-ui-slots')
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
    for (const dependency of ['dsh-plugin-multi-root-workspace', 'dsh-plugin-session-tool-toggle', 'dsh-plugin-web-ux']) {
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
    const words = importedWords(readArtifact(ROOT, 'index.js'))
    // 契约管「无未声明外部词」（`node:*` 豁免）；host 半是 no-op 锚点，连内建也不许出现，故两条并存。
    expect(hostSelfContainmentIssues({ packageName: PACKAGE_NAME, words })).toEqual([])
    expect(words).toEqual([])
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
      '@deepseek-ai/dsh-client-ui-renderer', '@deepseek-ai/dsh-client-locale',
      '@deepseek-ai/dsh-client-ui-sidebar', '@deepseek-ai/dsh-client-ui-layout',
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
