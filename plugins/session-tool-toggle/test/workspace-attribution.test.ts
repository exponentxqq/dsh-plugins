/**
 * 工作区归属测试（规范：dsh-session-tool-toggle —— 工作区级默认档）。
 *
 * 五组必测（任务 4.2 / G4 出口断言）：
 *
 * - **registry 命中优先**：子目录会话归到 registry 的 `path` 与 `title`，而不是 canonical cwd；
 * - **子目录归属**：多级上溯取最近命中根（嵌套根时深者胜）；
 * - **符号链接**：cwd 本身是链接、以及 cwd 经过链接，都按 realpath 后的真实路径归属；
 * - **目录消失**：realpath 全程失败 → `undefined` + 1 条 warn（fail-closed）；
 * - **无 registry 退化**：`registered()` 空数组 → canonical cwd 为键、`registered:false`、无 title。
 *
 * 外加：cwd 缺失（`undefined` / 空串）直接 `undefined` 且不碰端口；中间层级 realpath 失败
 * 继续上溯（祖先的已登记根仍可命中）；registry 路径只做精确匹配（前缀相同不算命中）。
 *
 * 全部经假 realpath 表、假 registry 与假日志驱动：**不碰真实文件系统**，套件跑在纯内存里。
 */
import { describe, expect, it } from 'vitest'
import { resolveWorkspaceAttribution } from '../src/host/attribution.ts'
import type { RealpathPort, WorkspaceRootsPort } from '../src/host/attribution.ts'
import type { SpecLog } from '../src/host/types.ts'

/** 不收集日志的假日志（只关心结果的用例用）。 */
const QUIET_LOG: SpecLog = { info: () => {}, warn: () => {}, error: () => {} }

/** 收集 warn 的假日志（与 defaults / state 套件同形）。 */
function recordingLog(): { log: SpecLog; warnings: string[] } {
  const warnings: string[] = []
  return {
    log: { info: () => {}, warn: (message) => warnings.push(message), error: () => {} },
    warnings,
  }
}

/**
 * 假 realpath：表里有的路径返回规范化值，其余一律抛错（模拟「这一级不存在」）。
 *
 * 同时记录每次调用的入参，供「上溯了哪些层级」「缺失 cwd 不碰端口」这类断言使用。
 * @param table - 路径 → 规范路径的对照表。
 * @returns realpath 端口 + 调用记录。
 */
function fakeRealpath(table: Record<string, string>): RealpathPort & { readonly calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    async realpath(candidate: string): Promise<string> {
      calls.push(candidate)
      const canonical = table[candidate]
      if (canonical === undefined) throw new Error(`ENOENT: 模拟的缺失路径，${candidate}`)
      return canonical
    },
  }
}

/**
 * 假 registry：已登记工作区按给定顺序返回（顺序即同级查找顺序）。
 * @param workspaces - 已登记工作区。
 * @returns registry 端口。
 */
function fakeRoots(
  ...workspaces: readonly { readonly path: string; readonly title: string }[]
): WorkspaceRootsPort {
  return { registered: () => workspaces }
}

describe('resolveWorkspaceAttribution', () => {
  it('registry 命中优先：子目录会话归到 registry 的 path 与 title', async () => {
    const realpath = fakeRealpath({
      '/w/sub/dir': '/w/sub/dir',
      '/w/sub': '/w/sub',
      '/w': '/w',
      '/': '/',
    })
    const { log, warnings } = recordingLog()
    const ports = { roots: fakeRoots({ path: '/w', title: 'W' }), realpath, log }

    expect(await resolveWorkspaceAttribution('/w/sub/dir', ports)).toEqual({
      key: '/w',
      registered: true,
      title: 'W',
    })
    // 命中是正常路径，不告警。
    expect(warnings).toHaveLength(0)
  })

  it('子目录归属：多级上溯取最近命中根', async () => {
    const realpath = fakeRealpath({
      '/w/sub/dir': '/w/sub/dir',
      '/w/sub': '/w/sub',
      '/w': '/w',
      '/': '/',
    })
    const log = QUIET_LOG

    // 唯一根：三级子目录归到它。
    expect(
      await resolveWorkspaceAttribution('/w/sub/dir', {
        roots: fakeRoots({ path: '/w', title: 'W' }),
        realpath,
        log,
      }),
    ).toEqual({ key: '/w', registered: true, title: 'W' })

    // 嵌套根：更近的 /w/sub 胜出（上溯在第一个命中处停止）。
    expect(
      await resolveWorkspaceAttribution('/w/sub/dir', {
        roots: fakeRoots({ path: '/w', title: 'W' }, { path: '/w/sub', title: 'W-Sub' }),
        realpath,
        log,
      }),
    ).toEqual({ key: '/w/sub', registered: true, title: 'W-Sub' })
  })

  it('符号链接：按 realpath 后的真实路径归属', async () => {
    const log = QUIET_LOG

    // cwd 本身是链接（D8 反例场景：~/proj → /home/docker/proj）。
    const linkAsCwd = fakeRealpath({ '/w/link': '/w/real' })
    expect(
      await resolveWorkspaceAttribution('/w/link', {
        roots: fakeRoots({ path: '/w/real', title: 'Real' }),
        realpath: linkAsCwd,
        log,
      }),
    ).toEqual({ key: '/w/real', registered: true, title: 'Real' })

    // cwd 经过链接：祖先 /work/link 规范化成 /work/real（registry 根）后命中。
    const linkInPath = fakeRealpath({
      '/work/link/sub': '/work/real/sub',
      '/work/link': '/work/real',
      '/work/real': '/work/real',
      '/work': '/work',
      '/': '/',
    })
    expect(
      await resolveWorkspaceAttribution('/work/link/sub', {
        roots: fakeRoots({ path: '/work/real', title: 'Real' }),
        realpath: linkInPath,
        log,
      }),
    ).toEqual({ key: '/work/real', registered: true, title: 'Real' })
  })

  it('目录消失：realpath 全程失败 → undefined + 1 条 warn', async () => {
    const realpath = fakeRealpath({})
    const { log, warnings } = recordingLog()

    expect(
      await resolveWorkspaceAttribution('/gone', {
        roots: fakeRoots({ path: '/w', title: 'W' }),
        realpath,
        log,
      }),
    ).toBeUndefined()
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('/gone')
    // 全程失败 = 每一级都试过：/gone 与 /。
    expect(realpath.calls).toEqual(['/gone', '/'])
  })

  it('无 registry 退化：canonical cwd 为键、registered:false、无 title', async () => {
    const log = QUIET_LOG
    const { log: recording, warnings } = recordingLog()

    const result = await resolveWorkspaceAttribution('/w/sub/dir', {
      roots: fakeRoots(),
      realpath: fakeRealpath({
        '/w/sub/dir': '/w/sub/dir',
        '/w/sub': '/w/sub',
        '/w': '/w',
        '/': '/',
      }),
      log: recording,
    })
    expect(result).toEqual({ key: '/w/sub/dir', registered: false })
    expect(result).not.toHaveProperty('title')
    // 未登记不是错误：退化不告警。
    expect(warnings).toHaveLength(0)

    // 键取的是 cwd 的 realpath，不是 cwd 原文（`..` 先被 resolve，再由端口规范化）。
    expect(
      await resolveWorkspaceAttribution('/w/sub/../dir', {
        roots: fakeRoots(),
        realpath: fakeRealpath({ '/w/dir': '/real/dir', '/w': '/w', '/': '/' }),
        log,
      }),
    ).toEqual({ key: '/real/dir', registered: false })
  })

  it('cwd 缺失：undefined / 空串直接 undefined，且不碰任何端口', async () => {
    const realpath = fakeRealpath({})
    // registry 被调用即失败：cwd 缺失时连读数都不该取。
    const roots: WorkspaceRootsPort = {
      registered: () => {
        throw new Error('cwd 缺失时不应读取 registry')
      },
    }

    expect(await resolveWorkspaceAttribution(undefined, { roots, realpath, log: QUIET_LOG })).toBeUndefined()
    expect(await resolveWorkspaceAttribution('', { roots, realpath, log: QUIET_LOG })).toBeUndefined()
    expect(realpath.calls).toHaveLength(0)
  })

  it('中间层级 realpath 失败继续上溯：祖先的已登记根仍可命中', async () => {
    // /w/sub/dir 与 /w/sub 都已不存在（realpath 抛错），/w 仍是已登记根。
    const realpath = fakeRealpath({ '/w': '/w', '/': '/' })

    expect(
      await resolveWorkspaceAttribution('/w/sub/dir', {
        roots: fakeRoots({ path: '/w', title: 'W' }),
        realpath,
        log: QUIET_LOG,
      }),
    ).toEqual({ key: '/w', registered: true, title: 'W' })
    expect(realpath.calls).toEqual(['/w/sub/dir', '/w/sub', '/w'])
  })

  it('registry 路径只做精确匹配：前缀相同不算命中', async () => {
    const realpath = fakeRealpath({ '/work/a2': '/work/a2', '/work': '/work', '/': '/' })

    expect(
      await resolveWorkspaceAttribution('/work/a2', {
        roots: fakeRoots({ path: '/work/a', title: 'A' }),
        realpath,
        log: QUIET_LOG,
      }),
    ).toEqual({ key: '/work/a2', registered: false })
  })
})
