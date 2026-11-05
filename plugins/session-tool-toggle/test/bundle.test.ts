/**
 * 双端构建产物的形状与纯度（任务 10.5，设计附录 §1.1 的 `test/bundle.test.ts` 行）。
 *
 * 这里断言的是**已构建的字节**，所以 `build.mjs`、external 列表或包声明的回归会在本仓
 * 报错，而不是等到浏览器或 profile 里才发现：
 *
 * - **浏览器半**（`lib/client.js`）必须是 `window.__ModuleLoader__.load({ id, factory })`
 *   形态的 CJS 工厂，且只 `require` 浏览器壳提供的模块词（`react` / `react/jsx-runtime` /
 *   `@deepseek-ai/dsh-client-ui-primitives`）——多出一个裸包名就意味着它被意外打进/漏进
 *   external，少一个则说明组件没被真正打进产物。
 * - **宿主半**（`lib/index.js`）必须自包含：只能 import `node:*` 内建，任何
 *   `@deepseek-ai/*` 运行时 import 都会让 profile 侧的 bare 安装失败（构建把它 inline 了
 *   才算合格）。
 * - **契约字面量内联**：client 端的 `panel-client.ts` 不 import 宿主半（D16：两端各持一份
 *   手写 parser），通道、五个端点、座位键与 locale 命名空间都必须是浏览器 bundle 里的字符串
 *   字面量——否则浏览器要运行时解析宿主模块，双端就缠在一起了。
 *
 * 依赖构建产物，故 `verify:all` 的顺序（lint → typecheck → build → test）是前提。
 *
 * @module dsh-plugin-session-tool-toggle/test/bundle
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CHANNEL,
  DEFAULTS_ENDPOINT,
  ENDPOINTS,
  PANEL_ENDPOINT,
  RESET_ENDPOINT,
  TOGGLE_ENDPOINT,
  WORKSPACE_ENDPOINT,
} from '../src/contract.ts'

/** 本包目录（`test/` 的上一级）。 */
const ROOT = path.resolve(import.meta.dirname, '..')

/** 浏览器 loader 期望的包身份。 */
const PACKAGE_NAME = 'dsh-plugin-session-tool-toggle'

/**
 * 允许出现在浏览器 bundle 里的模块词——与 `build.mjs` 的 `CLIENT_EXTERNALS` 中**实际被用到**
 * 的那三项逐一对应（`react-dom` 在 external 名单里但产物不用它，故不出现）。
 */
const CLIENT_REQUIRES = ['@deepseek-ai/dsh-client-ui-primitives', 'react', 'react/jsx-runtime']

/**
 * 浏览器 bundle 必须以字面量内联的契约事实（通道 / 五端点 / 两个座位 / 命名空间）。
 *
 * 第 5 端点 `'workspace'` 与分节座位 `'workspace-config.section'`（#36/#44）按**字面量**直写：
 * 产物纯度门禁（G8-a）也按这两个字面量 grep `lib/client.js`。字面量与契约常量的对应
 * 由断言里的 `WORKSPACE_ENDPOINT` 等式钉住，防止手写漂移。
 *
 * 旧 footer 座位名**必须不在**产物里（迁移红线，见下一条断言）：它一旦残留，说明还有一份
 * 未迁移的注册/注释被打进 bundle。
 *
 * 一旦它们没被打进 client bundle，浏览器就会在运行时去解析宿主模块（D16 破防）。
 */
const INLINED_MARKERS = [
  CHANNEL,
  PANEL_ENDPOINT,
  TOGGLE_ENDPOINT,
  RESET_ENDPOINT,
  DEFAULTS_ENDPOINT,
  'workspace',
  'session-tool-toggle-panel',
  'conversation.session.header.utilities',
  'workspace-config.section',
  'sessionToolToggle',
]

/**
 * 浏览器 bundle 里**必须缺席**的字面量。
 *
 * - 旧 footer 座位名：迁移后本插件不再占用该座位（已定结论 2「旧入口硬移除」）；
 * - holder 的包名：分节只以 `import type` 消费 holder 的类型（D3），运行时零依赖——产物
 *   里出现包名意味着某处退化成了值 import，会把 holder 打进本包。
 */
const ABSENT_MARKERS = ['sidebar.footer.action', 'dsh-plugin-workspace-config']

/**
 * 读取一个构建产物。
 * @param name - `lib/` 下的文件名。
 * @returns 文件内容。
 */
function readArtifact(name: string): string {
  return readFileSync(path.join(ROOT, 'lib', name), 'utf8')
}

/**
 * 取出一段代码里全部**静态** `require("…")` 的模块词（去重排序）。
 * @param source - 产物文本。
 * @returns 模块词。
 */
function requiredWords(source: string): string[] {
  return [...new Set([...source.matchAll(/require\("([^"]+)"\)/g)].map((match) => match[1] ?? ''))].sort()
}

/**
 * 取出一段代码里全部静态 import/require 的模块词（去重排序）。
 *
 * 匹配 `from "…"`（ESM）、`require("…")`（CJS）、`import("…")`（字面量动态 import）。
 * 计算式动态 import（如宿主运行时那处 `import(pathToFileURL(…).href)`）不匹配——它不是
 * 静态依赖，也不该被当成依赖。
 * @param source - 产物文本。
 * @returns 模块词。
 */
function importedWords(source: string): string[] {
  const words = [
    ...source.matchAll(/from\s+"([^"]+)"/g),
    ...source.matchAll(/require\("([^"]+)"\)/g),
    ...source.matchAll(/import\("([^"]+)"\)/g),
  ].map((match) => match[1] ?? '')
  return [...new Set(words)].sort()
}

describe('浏览器半产物（lib/client.js）', () => {
  it('按包名注册进模块加载器，且是 factory 形态', () => {
    const source = readArtifact('client.js')
    expect(source).toContain('window.__ModuleLoader__.load({')
    expect(source).toContain(`id: ${JSON.stringify(PACKAGE_NAME)}`)
    expect(source).toContain('factory: (require) => {')
  })

  it('只 require 浏览器壳提供的三个模块词，没有 node 内建与自身包名', () => {
    const source = readArtifact('client.js')
    expect(requiredWords(source)).toEqual(CLIENT_REQUIRES)

    const imports = importedWords(source)
    expect(imports.filter((word) => word.startsWith('node:'))).toEqual([])
    expect(imports.filter((word) => word.includes(PACKAGE_NAME))).toEqual([])
  })

  it('通道、五端点、座位与命名空间都是内联字面量（不靠运行时解析宿主半）', () => {
    const source = readArtifact('client.js')
    // 五个端点一个都不能少：contract.ts 的 ENDPOINTS 是唯一权威。
    expect(ENDPOINTS).toHaveLength(5)
    // 白名单里的两个字面量必须与契约常量一致（T18 的 'workspace' 是手写直写）。
    expect(WORKSPACE_ENDPOINT).toBe('workspace')
    for (const marker of INLINED_MARKERS) {
      expect(source).toContain(JSON.stringify(marker))
    }
  })

  it('旧 footer 座位与 holder 包名都不在产物里（迁移红线 + D3 零运行时依赖）', () => {
    const source = readArtifact('client.js')
    for (const marker of ABSENT_MARKERS) {
      expect(source).not.toContain(marker)
    }
    // 显式再说一遍：分节类型只以 `import type` 消费，产物不得出现 holder 的模块词。
    expect(importedWords(source).filter((word) => word.includes('dsh-plugin-workspace-config'))).toEqual([])
  })
})

describe('宿主半产物（lib/index.js）', () => {
  it('完全自包含：除 node 内建外没有任何模块依赖', () => {
    const imports = importedWords(readArtifact('index.js'))
    expect(imports.filter((word) => !word.startsWith('node:'))).toEqual([])
    // 显式再说一遍：任何 @deepseek-ai/* 运行时 import 都是安装期的雷。
    expect(imports.filter((word) => word.startsWith('@deepseek-ai/'))).toEqual([])
  })

  it('带有通道与五个端点（宿主是通道的挂载方）', () => {
    const source = readArtifact('index.js')
    for (const marker of [CHANNEL, ...ENDPOINTS]) {
      expect(source).toContain(JSON.stringify(marker))
    }
  })
})
