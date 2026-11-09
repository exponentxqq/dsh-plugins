// @vitest-environment jsdom
/**
 * The built browser artifact and the manifest declarations that make the host
 * serve it.
 *
 * The Web client accepts exactly one artifact shape — a CJS closure factory
 * registered under the package name through `window.__ModuleLoader__.load` —
 * and discovers it from `exports["./client"]` on a package whose `dsh.client`
 * platform is `web`. Both are asserted here against the BUILT bytes, so a
 * build-config regression fails in this repository instead of in a browser.
 *
 * 本文件同时钉住字节断言覆盖不了的一条行为事实：对话框只在打开时出现在 DOM
 * （closed 态挂载无 dialog；browse 替身下点「+」后 portal 出现）。渲染走与
 * `client-panel.spec.tsx` 同形的 jsdom 替身，因此整个文件跑在 jsdom 下。
 */

import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import * as client from '../src/client/index.ts'
import { NS } from '../src/client/locales.ts'

// jsdom 没有 file-URL `import.meta.url`（client-panel.spec.tsx 的同一实测），
// 仓库根改取 runner 的工作目录——vitest 一律从包根运行。
const REPO_ROOT = process.cwd()

const PACKAGE_NAME = 'dsh-plugin-multi-root-workspace'
const clientPath = join(REPO_ROOT, 'lib', 'client.js')

const manifest = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
  exports: Record<string, unknown>
  files: string[]
  dsh?: { client?: { platform?: string; inject?: string[]; external?: string[] } }
}

/** 渲染断言用的登记根（与 client-panel.spec.tsx 的 ROOT_A 同值）。 */
const RENDER_ROOT = {
  ordinal: 1,
  id: 'a',
  path: '/repos/payments',
  addedAt: '2026-09-12T00:00:00.000Z',
  state: 'available',
  alias: 'payments',
}

/**
 * browse 替身的宿主 home 层（TG5 要点 1 的 fixture：home `/home/me`、crumbs、
 * entries、含一个隐藏项），与 client-panel.spec.tsx 同值。
 */
const BROWSE_HOME_LISTING = {
  path: '/home/me',
  home: '/home/me',
  crumbs: [{ name: 'me', path: '/home/me', hidden: false }],
  entries: [
    { name: 'repos', path: '/home/me/repos', hidden: false },
    { name: '.cache', path: '/home/me/.cache', hidden: true },
  ],
  truncated: false,
}

/**
 * 上游 `pickDirectory` 失败的实测文案（code-design ②：pick 层只抛 message，
 * code/details 被丢弃）。锚定适配器 message 兜底正则的 `serves "browse"` 片段。
 */
const BROWSE_PICK_MESSAGE =
  'directoryPicker.pickDirectory needs the pick capability; the composed picker serves "browse"'

describe('the client bundle artifact', () => {
  it('exists where the manifest points', () => {
    expect(statSync(clientPath).isFile()).toBe(true)
    const entry = manifest.exports['./client'] as { default?: string } | undefined
    expect(entry?.default).toBe('./lib/client.js')
  })

  it('registers itself through the module loader under the exact package name', () => {
    const source = readFileSync(clientPath, 'utf8')
    expect(source).toContain('window.__ModuleLoader__.load(')
    expect(source).toContain(`id: ${JSON.stringify(PACKAGE_NAME)}`)
    expect(source).toContain('factory: (require) => {')
    expect(source.trimEnd().endsWith('//# sourceMappingURL=client.js.map')).toBe(true)
  })

  it('exports the cordis plugin surface the client graph loads', () => {
    const source = readFileSync(clientPath, 'utf8')
    expect(source).toContain('exports.apply = apply')
    expect(source).toContain('exports.inject = inject')
  })

  it('imports only module-table words, so nothing else needs a shared identity', () => {
    const source = readFileSync(clientPath, 'utf8')
    const required = [...source.matchAll(/require\("([^"]+)"\)/g)].map(match => match[1]).sort()
    // The primitives word carries the row menu and the icons (ADR-0006); the
    // web shell seeds it, so it stays external rather than bundled.
    // `react-dom` 只由对话框的 createPortal(document.body) 引入（D-10）：tsdown
    // 把它留在外置面（CLIENT_EXTERNALS），web shell 的平台模块表已 seed 同词，
    // portal 不引入新身份——产物多出的 require 词必须恰好是它。
    expect(required).toEqual(['@deepseek-ai/dsh-client-ui-primitives', 'react', 'react-dom', 'react/jsx-runtime'])
  })

  it('registers the unified dialog section, never the removed footer seat', () => {
    const source = readFileSync(clientPath, 'utf8')
    // The panel's mount point is the section the workspace-config holder
    // declares (ADR-0013); the footer seat is gone for good.
    expect(source).toContain('workspace-config.section')
    expect(source).not.toContain('sidebar.footer.action')
    // The legacy Files-tab entry is deliberately retained.
    expect(source).toContain('sidebar.right.tab.files.actions')
  })

  it('keeps the holder out of the runtime bundle: the dependency is types-only', () => {
    const source = readFileSync(clientPath, 'utf8')
    // `import type` is erased (D3): no holder code, and the module table is
    // exactly the four seeded platform words（react-dom 是 portal 的，见上一用例）.
    expect(source).not.toContain('dsh-plugin-workspace-config')
    const required = [...source.matchAll(/require\("([^"]+)"\)/g)].map(match => match[1]).sort()
    expect(required).toEqual(['@deepseek-ai/dsh-client-ui-primitives', 'react', 'react-dom', 'react/jsx-runtime'])
  })

  it('inlines its own contract instead of importing the host half', () => {
    const source = readFileSync(clientPath, 'utf8')
    expect(source).not.toContain(`require("${PACKAGE_NAME}`)
    expect(source).not.toContain('node:fs')
    expect(source).toContain('/multi-root-workspace')
  })

  it('ships every file the runtime reads from the package', () => {
    for (const file of ['lib/client.js', 'lib/index.js', 'cordis.patch.yml']) {
      expect(manifest.files.some(pattern => matches(pattern, file)), `${file} must be published`).toBe(true)
    }
  })
})

describe('the dsh.client declaration', () => {
  it('declares the web platform and the client packages it needs', () => {
    expect(manifest.dsh?.client?.platform).toBe('web')
    // No sidebar row any more: the footer seat is gone and the Files-tab
    // actions seat is declared by dsh-client-ui-sidebar-files (D13).
    expect(manifest.dsh?.client?.inject).toEqual([
      '@deepseek-ai/dsh-client-connection',
      '@deepseek-ai/dsh-client-locale',
      '@deepseek-ai/dsh-client-ui-renderer',
    ])
  })

  it('requests no module-table rows beyond the seeded platform words', () => {
    // Anything else would have to be a row this package cannot answer for
    // itself; the panel inlines everything it owns.
    expect(manifest.dsh?.client?.external).toBeUndefined()
  })
})

describe('对话框只在打开时出现在 DOM', () => {
  it('closed 态挂载没有对话框；browse 替身下点「+」后 portal 出现，取消后移除', async () => {
    const harness = mountSectionHarness('browse')
    harness.renderSection()
    await waitFor(() => { expect(screen.getByText('/repos/payments')).toBeTruthy() })
    // 分节挂载即 closed 态：portal 到 document.body（D-10），screen 的查询覆盖 body 全树。
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: `${NS}.panel.add` }))

    const dialog = await screen.findByRole('dialog')
    // 首帧 = 宿主 home：message 兜底分支不带探测 listing，对话框自己零参 list。
    await waitFor(() => { expect(dialog.querySelector('.mrfw-pickerPath')?.textContent).toBe('/home/me') })

    // 取消 → 拾取状态回 closed → portal 卸载：DOM 里只在打开窗口期有对话框。
    fireEvent.click(within(dialog).getByRole('button', { name: `${NS}.picker.cancel` }))
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
  })
})

afterEach(() => {
  // Vitest runs without globals, so the auto-cleanup hook is never installed.
  cleanup()
})

/**
 * 渲染断言所需的最小挂载（复用 client-panel.spec.tsx 的既有替身模式）：把
 * 真实 client entry 应用到记录型 stub ctx，再由调用方渲染登记的分节组件。
 * `uiWorkspace` 支持 native / browse 两态（本文件的断言面只到「打开 ⇔ 在 DOM」，
 * 三态细节与通道 payload 由 client-panel.spec.tsx 覆盖）。
 */
function mountSectionHarness(mode: 'native' | 'browse'): {
  setPickerMode: (next: 'native' | 'browse') => void
  renderSection: () => void
} {
  let pickerMode = mode
  let section: { options: { inject?: () => Record<string, unknown> }; component: () => unknown } | undefined
  const connection = {
    rpc: {
      call: async () => ({
        ok: true as const,
        value: { primaryRoot: '/repos/primary', roots: [RENDER_ROOT] },
      }),
    },
  }
  const ctx = {
    effect: (callback: () => unknown) => {
      const dispose = callback()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    locale: {
      register: () => () => {},
      // 键直译成 ns 限定名——用哪个词典副本由断言键名即可观察。
      bind: (ns: string) => (key: string) => `${ns}.${key}`,
    },
    slots: {
      inject: (name: string, callback: () => unknown) => {
        // 分节座位立即生效；Files-tab 旧入口不在本文件的断言面。
        if (name === 'workspace-config.section') callback()
        return () => {}
      },
      register: (options: { name: string; inject?: () => Record<string, unknown> }, component: () => unknown) => {
        if (options.name === 'workspace-config.section') section = { options, component }
        return () => {}
      },
    },
    logger: { warn: () => {} },
    get: (name: string) => {
      if (name === 'connection') return connection
      if (name === 'uiWorkspace') {
        if (pickerMode === 'browse') {
          return {
            // 上游事实：pick 层只抛 message（Error 实例，无 rpcError 载体）。
            pickDirectory: async () => {
              throw new Error(BROWSE_PICK_MESSAGE)
            },
            listDirectory: async () => ({ ...BROWSE_HOME_LISTING }),
            createDirectory: async () => '/home/me/created',
          }
        }
        return { pickDirectory: async () => '/repos/picked' }
      }
      if (name === 'sessions') {
        return { list: { getSnapshot: () => ({ current: 'session-1' }) } }
      }
      return undefined
    },
  }
  client.apply(ctx as never)
  return {
    setPickerMode: next => { pickerMode = next },
    renderSection: () => {
      if (section === undefined) throw new Error('the workspace-config.section seat was not registered')
      const injected = section.options.inject?.() ?? {}
      render(createElement(section.component as never, {
        workspace: { kind: 'workspace', id: 'ws-primary', title: 'Primary workspace', path: '/repos/primary' },
        t: (key: string) => `${NS}.${key}`,
        ...injected,
      } as never))
    },
  }
}

/** Whether one `files` glob covers a published path. */
function matches(pattern: string, file: string): boolean {
  const globstar = String.fromCharCode(0)
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, globstar)
    .replace(/\*/g, '[^/]*')
    .split(globstar)
    .join('.*')
  return new RegExp(`^${escaped}$`).test(file)
}
