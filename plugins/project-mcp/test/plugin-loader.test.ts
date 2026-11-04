/**
 * plugin-loader 的解析基准与通道测试。
 *
 * 背景：dsh 从 dsh 安装目录解析官方 bundle，profile 树可能不含任何
 * `@deepseek-ai/*` 包；且 cordis-plugin-loader 1.0.x 的公开
 * `ctx.loader.import` 忽略 `parentURL`（恒按 loader 自身 base 解析），
 * 真正尊重 base 的是 `ctx.loader.internal.import`。加载器因此按
 * 「profile → 插件目录 → pluginPackages 安装副本 → dsh host 入口」的
 * base 序列、优先 internal 通道解析官方 MCP client。
 */
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { createServerLoader, entryBaseUrl, hostEntryBaseUrl, MCP_CLIENT_MODULE } from '../src/host/plugin-loader.ts'
import type { ScannedServer } from '../src/host/types.ts'

const scratch = mkdtempSync(join(tmpdir(), 'project-mcp-loader-'))
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

/** 一个最小化的 stdio 服务器描述。 */
function server(): ScannedServer {
  return {
    serverName: 'example',
    config: { transport: 'stdio', command: 'example-mcp', serverName: 'example' },
    source: { workspaceRoot: '/work/example', root: '/work/example', file: '/work/example/.dsh/mcp/example.yaml' },
  }
}

/** 一个记录每次 import 尝试（通道 × 基准）的 ctx 桩。 */
function stubContext(options: {
  rootBase?: string
  selfBase?: string
  withInternal?: boolean
  packageDir?: string
  entriesDir?: string
  /** 按基准判断是否解析成功；缺省表示全部失败。 */
  succeedAt?: (parentURL: string) => boolean
}): { ctx: Context; publicTried: string[]; internalTried: string[] } {
  const publicTried: string[] = []
  const internalTried: string[] = []
  const succeed = options.succeedAt ?? (() => false)
  const attempt = async (parentURL: string): Promise<unknown> => {
    if (succeed(parentURL)) return { apply: () => {} }
    throw new Error(`boom at ${parentURL}`)
  }
  const ctx = {
    root: options.rootBase === undefined ? undefined : { baseUrl: options.rootBase },
    baseUrl: options.selfBase,
    loader: {
      import: async (_specifier: string, parentURL: string) => {
        publicTried.push(parentURL)
        return attempt(parentURL)
      },
      unwrapExports: (value: unknown) => value,
      ...(options.withInternal === true
        ? { internal: { import: async (_specifier: string, parentURL: string) => {
            internalTried.push(parentURL)
            return attempt(parentURL)
          } } }
        : {}),
    },
    plugin: () => ({ then: (resolve: (value: unknown) => void) => { resolve(undefined) }, dispose: async () => {} }),
    get: (name: string) => {
      if (name !== 'pluginPackages') return undefined
      if (options.packageDir === undefined && options.entriesDir === undefined) return undefined
      return {
        ...(options.packageDir === undefined ? {} : {
          packageOf: (specifier: string) => (specifier === MCP_CLIENT_MODULE ? { dir: options.packageDir } : undefined),
        }),
        resolution: options.entriesDir === undefined ? {} : { entries: { [MCP_CLIENT_MODULE]: { packageDir: options.entriesDir } } },
      }
    },
  }
  return { ctx: ctx as unknown as Context, publicTried, internalTried }
}

describe('entryBaseUrl', () => {
  it('把软链入口解析到真实脚本所在目录', () => {
    const target = join(scratch, 'real-bin.js')
    writeFileSync(target, '')
    const link = join(scratch, 'linked-bin')
    symlinkSync(target, link)
    expect(entryBaseUrl(link)).toBe(pathToFileURL(scratch).href)
  })

  it('空入口返回 undefined', () => {
    expect(entryBaseUrl(undefined)).toBeUndefined()
    expect(entryBaseUrl('')).toBeUndefined()
  })

  it('不存在的入口返回 undefined 而不是抛错', () => {
    expect(entryBaseUrl(join(scratch, 'no-such-entry.js'))).toBeUndefined()
  })
})

describe('createServerLoader 解析基准与通道', () => {
  it.skipIf(hostEntryBaseUrl() === undefined)('internal 通道尊重 base：profile 与插件目录失败后落到 host 入口基准', async () => {
    const hostBase = hostEntryBaseUrl() as string
    const { ctx, internalTried, publicTried } = stubContext({
      rootBase: 'file:///profile/',
      selfBase: 'file:///plugin/lib/',
      withInternal: true,
      succeedAt: (parentURL) => parentURL === hostBase,
    })
    const dispose = await createServerLoader(ctx).load(server())
    expect(typeof dispose).toBe('function')
    // 顺序：profile 根 → 插件行 → 插件模块 URL →（无 pluginPackages）→ host 入口。
    expect(internalTried[internalTried.length - 1]).toBe(hostBase)
    expect(internalTried).toContain('file:///profile/')
    expect(internalTried).toContain('file:///plugin/lib/')
    // internal 存在时公开通道不应被使用。
    expect(publicTried).toEqual([])
  })

  it.skipIf(hostEntryBaseUrl() === undefined)('pluginPackages 的安装副本基准排在 host 入口之前', async () => {
    const hostBase = hostEntryBaseUrl() as string
    // 制造一个真实存在的"安装目录"，让 realpathSync 能成功解析。
    const packageDir = join(scratch, 'installation', '@deepseek-ai', MCP_CLIENT_MODULE)
    mkdirSync(packageDir, { recursive: true })
    const installBase = pathToFileURL(dirname(packageDir)).href
    const { ctx, internalTried } = stubContext({
      withInternal: true,
      packageDir,
      succeedAt: (parentURL) => parentURL === installBase,
    })
    await createServerLoader(ctx).load(server())
    expect(internalTried).toContain(installBase)
    // 安装副本基准命中后不再尝试 host 入口基准。
    expect(internalTried[internalTried.length - 1]).toBe(installBase)
    expect(internalTried).not.toContain(hostBase)
  })

  it.skipIf(hostEntryBaseUrl() === undefined)('packageOf 优先于 resolution.entries', async () => {
    const fromPackageOf = join(scratch, 'via-package-of', '@deepseek-ai', MCP_CLIENT_MODULE)
    const fromEntries = join(scratch, 'via-entries', '@deepseek-ai', MCP_CLIENT_MODULE)
    mkdirSync(fromPackageOf, { recursive: true })
    mkdirSync(fromEntries, { recursive: true })
    const wantedBase = pathToFileURL(dirname(fromPackageOf)).href
    const { ctx, internalTried } = stubContext({
      withInternal: true,
      packageDir: fromPackageOf,
      entriesDir: fromEntries,
      succeedAt: (parentURL) => parentURL === wantedBase,
    })
    await createServerLoader(ctx).load(server())
    expect(internalTried).toContain(wantedBase)
    expect(internalTried).not.toContain(pathToFileURL(dirname(fromEntries)).href)
  })

  it.skipIf(hostEntryBaseUrl() === undefined)('无 packageOf 时回退 resolution.entries', async () => {
    const entriesDir = join(scratch, 'entries-only', '@deepseek-ai', MCP_CLIENT_MODULE)
    mkdirSync(entriesDir, { recursive: true })
    const wantedBase = pathToFileURL(dirname(entriesDir)).href
    const { ctx, internalTried } = stubContext({
      withInternal: true,
      entriesDir,
      succeedAt: (parentURL) => parentURL === wantedBase,
    })
    await createServerLoader(ctx).load(server())
    expect(internalTried).toContain(wantedBase)
  })

  it('无 internal 时退回公开 import 通道', async () => {
    const { ctx, publicTried } = stubContext({
      rootBase: 'file:///profile/',
      selfBase: 'file:///plugin/lib/',
      succeedAt: (parentURL) => parentURL === 'file:///profile/',
    })
    await createServerLoader(ctx).load(server())
    expect(publicTried).toEqual(['file:///profile/'])
  })

  it('全部基准失败时报错并标明通道与基准', async () => {
    const { ctx } = stubContext({ rootBase: 'file:///profile/' })
    await expect(createServerLoader(ctx).load(server())).rejects.toThrow(
      /cannot import @deepseek-ai\/dsh-mcp-client \(tried loader\.import at file:\/\/\/profile\//u,
    )
  })

  it('重复的基准只尝试一次', async () => {
    const { ctx, publicTried } = stubContext({
      rootBase: 'file:///same/',
      selfBase: 'file:///same/',
      succeedAt: () => true,
    })
    await createServerLoader(ctx).load(server())
    expect(publicTried.filter((base) => base === 'file:///same/')).toHaveLength(1)
  })
})
