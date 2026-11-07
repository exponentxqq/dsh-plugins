import { readFileSync } from 'node:fs'
import type { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { apply, inject, name } from '../src/index.ts'

/** 本包目录（`test/` 的上一级）。 */
const ROOT = new URL('..', import.meta.url)

/** 本包清单（产物断言按 `dsh.client` 是否声明分支）。 */
interface Manifest {
  dsh?: { client?: { platform?: string } }
}

const manifest: Manifest = JSON.parse(readFileSync(new URL('package.json', ROOT), 'utf8'))

/** 最小宿主上下文桩（只覆盖模板 `apply` 用到的 logger 面）。 */
function stubContext(): Context {
  return { logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } } as unknown as Context
}

describe('{{PACKAGE_NAME}} 包形状', () => {
  it('导出 cordis 插件三件套', () => {
    expect(name).toBe('{{NAME}}')
    expect(inject).toEqual([])
    expect(typeof apply).toBe('function')
  })

  it('apply：空装配只打一条加载日志', () => {
    const ctx = stubContext()
    apply(ctx)
    expect(ctx.logger.info).toHaveBeenCalledOnce()
    expect(ctx.logger.info).toHaveBeenCalledWith('{{NAME}}: loaded')
  })
})

// 产物断言读的是已构建字节：`pnpm test` 之前必须先 `pnpm build`
// （与六个软插件既有 bundle 套件同一前提；`verify:all` 的顺序是 lint → typecheck →
// build → test）。仓级 `pnpm dsh:check` 的 B1–B5 对同一份产物做更强的契约校验。
describe('{{PACKAGE_NAME}} 产物形状', () => {
  it('宿主产物存在且不含内部包作用域词', () => {
    const source = readFileSync(new URL('lib/index.js', ROOT), 'utf8')
    expect(source).not.toContain('@dsh-plugins/')
  })

  it('声明 dsh.client 时浏览器半是 ModuleLoader 壳', () => {
    if (manifest.dsh?.client === undefined) return
    const source = readFileSync(new URL('lib/client.js', ROOT), 'utf8')
    expect(source.startsWith('window.__ModuleLoader__.load({')).toBe(true)
    expect(source).toContain(`id: ${JSON.stringify('{{PACKAGE_NAME}}')}`)
    expect(source).toContain('factory: (require) => {')
    expect(source).not.toContain('@dsh-plugins/')
  })
})
