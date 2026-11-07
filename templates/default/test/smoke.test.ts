/**
 * 骨架冒烟：包形状 + 产物形状。
 *
 * 结构层断言（浏览器半的 ModuleLoader 壳、宿主半自包含）已下沉到
 * `@dsh-plugins/build-kit/artifact-contract`（D16），本文件只保留模板特有的包形状与
 * 「产物存在」断言。产物断言读的是已构建字节：`pnpm test` 之前必须先 `pnpm build`
 * （`verify:all` 的顺序是 lint → typecheck → build → test）；仓级 `pnpm dsh:check` 的
 * B1–B5 对同一份产物做更强的契约校验。
 *
 * @module {{PACKAGE_NAME}}/test/smoke
 */

import { readFileSync } from 'node:fs'
import type { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { hostSelfContainmentIssues, loaderShellIssues } from '@dsh-plugins/build-kit/artifact-contract'
// 产物词法器是仓根 `scripts/lib/artifacts.mjs` 的单一实现（R9）：生成为 `plugins/<name>/` 后
// 相对路径指向仓根，与三份真实包的 `test/bundle.test.ts` 同法，不在模板里另抄一份正则。
import { importedWords } from '../../../scripts/lib/artifacts.mjs'
import { apply, inject, name } from '../src/index.ts'

/** 本包目录（`test/` 的上一级）。 */
const ROOT = new URL('..', import.meta.url)

/** 本包名（loader 的 `id` 与契约 issue 的上下文都按它生成）。 */
const PACKAGE_NAME = '{{PACKAGE_NAME}}'

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

describe('{{PACKAGE_NAME}} 产物形状', () => {
  it('宿主产物存在且自包含（模块词只含内建 / 相对块 / 外部词）', () => {
    const source = readFileSync(new URL('lib/index.js', ROOT), 'utf8')
    expect(hostSelfContainmentIssues({ packageName: PACKAGE_NAME, words: importedWords(source) })).toEqual([])
  })

  it('声明 dsh.client 时浏览器半是 ModuleLoader 壳', () => {
    if (manifest.dsh?.client === undefined) return
    const source = readFileSync(new URL('lib/client.js', ROOT), 'utf8')
    expect(loaderShellIssues({ packageName: PACKAGE_NAME, source })).toEqual([])
  })
})
