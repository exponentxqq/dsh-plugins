/**
 * 跨插件归属查询服务接线测试（spec: dsh-project-mcp — 工作区可见性隔离的对外查询面）。
 *
 * 归属规则本体由 host-kit 内核测试钉住（`RootAttributor` 的 CASES 表是 oracle）；manager 的
 * claim 语义由 `mcp-manager.test.ts` 钉住。本文件只覆盖**接线**：服务把
 * 「工作区路径 → 根集归属 → manager claim 读数」这条链缝对，`null` 与集合透传不失真，
 * 以及构造即以 `projectMcp` 名注册。
 */
import type { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { RootAttributor } from '../src/host/attribution.ts'
import { PROJECT_MCP_SERVICE_NAME, ProjectMcpAttributionService } from '../src/host/attribution-service.ts'
import { McpManager, type ServerLoader } from '../src/host/mcp-manager.ts'
import type { ScanLog, ScannedServer } from '../src/host/types.ts'

/** 静默日志（服务与 manager 都不打算在用例里说话）。 */
const quietLog: ScanLog = { info: () => {}, warn: () => {}, error: () => {} }

/**
 * 恒成功的加载缝（记录加载对象但不做真装载）。
 * @returns loader 与装载记录。
 */
function okLoader(): { loader: ServerLoader; loaded: string[] } {
  const loaded: string[] = []
  return {
    loaded,
    loader: {
      load: async (candidate) => {
        loaded.push(candidate.serverName)
        return () => {}
      },
    },
  }
}

/**
 * 一台 stdio 服务器声明（归属到给定根下）。
 * @param serverName - 服务器名。
 * @param root - 配置所在根。
 * @returns 扫描产物。
 */
function server(serverName: string, root: string): ScannedServer {
  return {
    serverName,
    config: { transport: 'stdio', command: 'example-mcp', serverName },
    source: { workspaceRoot: root, root, file: `${root}/.dsh/mcp/${serverName}.yaml` },
  }
}

/**
 * 造一个已提交索引的归属器（路径表自环 = 全部路径已 canonical）。
 * @param workspaces - 提交的根集。
 * @returns 归属器。
 */
async function attributorOf(workspaces: readonly { primaryRoot: string; roots: readonly string[] }[]) {
  const table: Record<string, string> = {}
  for (const workspace of workspaces) {
    for (const root of workspace.roots) table[root] = root
  }
  const attributor = new RootAttributor({
    realpath: async (candidate: string) => {
      const canonical = table[candidate]
      if (canonical === undefined) throw new Error(`ENOENT: ${candidate}`)
      return canonical
    },
  })
  await attributor.update(workspaces)
  return attributor
}

/**
 * 造服务（fake ctx：Service 基类只调 `ctx.reflect.provide(name, this, check)`）。
 * @param manager - 已 sync 的 manager。
 * @param attributor - 已提交索引的归属器。
 * @returns 服务与注册记录（名字，供注册名断言）。
 */
function serviceOf(manager: McpManager, attributor: RootAttributor): {
  service: ProjectMcpAttributionService
  registeredAs: string[]
} {
  const registeredAs: string[] = []
  const ctx = {
    reflect: {
      provide: (name: string) => {
        registeredAs.push(name)
      },
    },
  } as unknown as Context
  const service = new ProjectMcpAttributionService(ctx, manager, attributor)
  return { service, registeredAs }
}

describe('projectMcp attribution service wiring', () => {
  it('以 projectMcp 名注册', async () => {
    const loader = okLoader()
    const manager = new McpManager(loader.loader, quietLog)
    await manager.sync([])
    const { registeredAs } = serviceOf(manager, await attributorOf([]))
    expect(registeredAs).toEqual([PROJECT_MCP_SERVICE_NAME])
    expect(PROJECT_MCP_SERVICE_NAME).toBe('projectMcp')
  })

  it('managedServerNames 透传 manager 的全量 claim（含多工作区）', async () => {
    const loader = okLoader()
    const manager = new McpManager(loader.loader, quietLog)
    await manager.sync([server('figma', '/work/opc'), server('dbx', '/work/other')])
    const { service } = serviceOf(manager, await attributorOf([]))
    expect(service.managedServerNames()).toEqual(new Set(['dbx', 'figma']))
  })

  it('serverNamesForWorkspace 按「该工作区根集下的声明」收窄', async () => {
    const loader = okLoader()
    const manager = new McpManager(loader.loader, quietLog)
    await manager.sync([server('figma', '/work/opc'), server('dbx', '/work/other')])
    const { service } = serviceOf(
      manager,
      await attributorOf([{ primaryRoot: '/work/opc', roots: ['/work/opc'] }]),
    )
    expect(await service.serverNamesForWorkspace('/work/opc')).toEqual(new Set(['figma']))
  })

  it('附加根（granted root）下的配置也算本工作区', async () => {
    const loader = okLoader()
    const manager = new McpManager(loader.loader, quietLog)
    await manager.sync([
      server('figma', '/work/opc'),
      server('shared-thing', '/shared'),
      server('dbx', '/work/other'),
    ])
    const { service } = serviceOf(
      manager,
      await attributorOf([{ primaryRoot: '/work/opc', roots: ['/shared', '/work/opc'] }]),
    )
    expect(await service.serverNamesForWorkspace('/work/opc')).toEqual(new Set(['figma', 'shared-thing']))
  })

  it('归属失败返回 null（不是空集）', async () => {
    const loader = okLoader()
    const manager = new McpManager(loader.loader, quietLog)
    await manager.sync([server('figma', '/work/opc')])
    const { service } = serviceOf(
      manager,
      await attributorOf([{ primaryRoot: '/work/opc', roots: ['/work/opc'] }]),
    )
    expect(await service.serverNamesForWorkspace('/somewhere/else')).toBeNull()
  })

  it('无工作区登记时归属失败同为 null（空索引短路）', async () => {
    const loader = okLoader()
    const manager = new McpManager(loader.loader, quietLog)
    await manager.sync([server('figma', '/work/opc')])
    const { service } = serviceOf(manager, await attributorOf([]))
    expect(await service.serverNamesForWorkspace('/work/opc')).toBeNull()
  })
})
