/**
 * 双端构建产物的形状与纯度：结构层三组（壳 / require 面 / 宿主自包含）由 build-kit 的产物
 * 契约断言（③.3 / ④ D5）；本文件只留包独有事实（内联与缺席标记、css 注入器计数、宿主侧
 * 通道与端点）。`verify:all` 的顺序（lint → typecheck → build → test）是前提。
 * @module dsh-plugin-session-tool-toggle/test/bundle
 */

import { readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { hostSelfContainmentIssues, loaderShellIssues, requireSurfaceIssues } from '@dsh-plugins/build-kit/artifact-contract'
// 词法器仍是 `scripts/lib/artifacts.mjs` 的单一实现（R9），本套件不持有本地副本。
import { importedWords, readArtifact, requiredWords } from '../../../scripts/lib/artifacts.mjs'
import {
  CHANNEL, ENDPOINTS, PANEL_ENDPOINT, RESET_ENDPOINT,
  TOGGLE_ENDPOINT, WORKSPACE_ENDPOINT,
} from '../src/contract.ts'

/** 本包目录（`test/` 的上一级）与浏览器 loader 期望的包身份。 */
const ROOT = path.resolve(import.meta.dirname, '..')
const PACKAGE_NAME = 'dsh-plugin-session-tool-toggle'

/**
 * 浏览器 bundle 模块词（`CLIENT_EXTERNALS` 里实际被用的三项）；三份词集是独立证据，不共享常量（D5）。
 */
const CLIENT_REQUIRES = ['@deepseek-ai/dsh-client-ui-primitives', 'react', 'react/jsx-runtime']

/**
 * 必须内联的契约字面量（通道 / 四端点 / 两个座位 / 命名空间）；第 4 端点与分节座位按字面量直写，
 * 纯度门禁 G8-a 也按它们 grep `lib/client.js`，与常量的对应由 `WORKSPACE_ENDPOINT` 钉住。
 */
const INLINED_MARKERS = [
  CHANNEL,
  PANEL_ENDPOINT,
  TOGGLE_ENDPOINT,
  RESET_ENDPOINT,
  'workspace',
  'session-tool-toggle-panel',
  'conversation.session.header.utilities',
  'workspace-config.section',
  'sessionToolToggle',
]

/**
 * 必须缺席：旧 footer 座位（已定结论 2「旧入口硬移除」）与 holder 包名（D3 只 `import type`，零运行时依赖）。
 */
const ABSENT_MARKERS = ['sidebar.footer.action', 'dsh-plugin-workspace-config']

/**
 * 注入器数量 = css module 数量：护栏固定按「包 + 模块」双维度（`data-dsh-plugin` + `data-dsh-css`），
 * 只按包名会让同包第二个 module 的样式永不注入（v1.4.0 的 delete 样式即因此从未生效）。
 * @returns `src/client` 下 `*.module.css` 的个数。
 */
function cssModuleCount(): number {
  return readdirSync(path.join(ROOT, 'src', 'client'), { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.module.css')).length
}

describe('浏览器半产物（lib/client.js）', () => {
  it('按包名注册进模块加载器，且是 factory 形态', () => {
    expect(loaderShellIssues({ packageName: PACKAGE_NAME, source: readArtifact(ROOT, 'client.js') })).toEqual([])
  })

  it('只 require 浏览器壳提供的三个模块词，没有 node 内建与自身包名', () => {
    const source = readArtifact(ROOT, 'client.js')
    expect(requireSurfaceIssues({ packageName: PACKAGE_NAME, expected: CLIENT_REQUIRES,
      required: requiredWords(source), imported: importedWords(source) })).toEqual([])
  })

  it('通道、四端点、座位与命名空间都是内联字面量（不靠运行时解析宿主半）', () => {
    const source = readArtifact(ROOT, 'client.js')
    // 四个端点一个都不能少：contract.ts 的 ENDPOINTS 是唯一权威（`defaults` 端点已随面板
    // 收缩删除）；两个手写字面量与契约常量一致。
    expect(ENDPOINTS).toHaveLength(4)
    expect(ENDPOINTS).not.toContain('defaults')
    expect(WORKSPACE_ENDPOINT).toBe('workspace')
    for (const marker of INLINED_MARKERS) {
      expect(source).toContain(JSON.stringify(marker))
    }
  })

  it('旧 footer 座位与 holder 包名都不在产物里（迁移红线 + D3 零运行时依赖）', () => {
    const source = readArtifact(ROOT, 'client.js')
    for (const marker of ABSENT_MARKERS) {
      expect(source).not.toContain(marker)
    }
    expect(importedWords(source).filter((word: string) => word.includes('dsh-plugin-workspace-config'))).toEqual([])
  })

  it('每个 css module 一个注入器（防重护栏按包+模块，而非只按包）', () => {
    const source = readArtifact(ROOT, 'client.js')
    // v1.4.0 事故：只按包名防重会让第一个模块之后的样式永远被跳过，故计数必须跟源文件走。
    const injectors = source.match(/style\.setAttribute\((["'])data-dsh-css\1/g) ?? []
    expect(injectors).toHaveLength(cssModuleCount())
  })
})

describe('宿主半产物（lib/index.js）', () => {
  it('完全自包含：除 node 内建外没有任何模块依赖', () => {
    expect(hostSelfContainmentIssues({ packageName: PACKAGE_NAME,
      words: importedWords(readArtifact(ROOT, 'index.js')) })).toEqual([])
  })

  it('带有通道与四个端点（宿主是通道的挂载方）', () => {
    const source = readArtifact(ROOT, 'index.js')
    for (const marker of [CHANNEL, ...ENDPOINTS]) {
      expect(source).toContain(JSON.stringify(marker))
    }
  })
})
