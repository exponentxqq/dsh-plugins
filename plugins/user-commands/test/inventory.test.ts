/**
 * `/inventory` 纯逻辑测试（规范：dsh-user-commands —— 内置 inventory 命令、
 * inventory 的 MCP 可见面、inventory 的 skill 目录、inventory 的软依赖降级）。
 *
 * 只测纯函数：归组（D3）、skill 投影（D4）与两段渲染（D5）的全部可观察口径。
 * 服务读取与降级判定由 `inventory-command.test.ts` 用假端口覆盖。
 */
import { describe, expect, it } from 'vitest'
import {
  groupMcpTools,
  renderInventory,
  skillRows,
  SKILL_DESCRIPTION_MAX_LENGTH,
  type InventoryReading,
  type SkillSummaryLike,
} from '../src/host/inventory.ts'

/** 造一条 skill 摘要（默认两侧可调用）。 */
function skill(
  name: string,
  extra: {
    description?: string
    modelInvocable?: boolean
    userInvocable?: boolean
    source?: string
  } = {},
): SkillSummaryLike {
  return {
    name,
    description: extra.description ?? `${name} 的描述`,
    invocation: {
      modelInvocable: extra.modelInvocable ?? true,
      userInvocable: extra.userInvocable ?? true,
    },
    source: extra.source ?? 'user-agents',
  }
}

describe('MCP 工具归组', () => {
  it('按 mcp__<server>__<tool> 归组并按服务器名升序、组内工具名升序', () => {
    const grouping = groupMcpTools([
      'mcp__beta__ping',
      'mcp__alpha__search',
      'mcp__alpha__fetch',
      'read_file',
      'mcp__gamma__query',
    ])

    expect(grouping.servers.map((server) => server.name)).toEqual(['alpha', 'beta', 'gamma'])
    expect(grouping.servers[0]?.tools).toEqual(['mcp__alpha__fetch', 'mcp__alpha__search'])
    expect(grouping.totalTools).toBe(4)
    expect(grouping.ungrouped).toEqual([])
  })

  it('忽略非 mcp__ 前缀的工具名（内置工具与 MCP 资源工具）', () => {
    const grouping = groupMcpTools(['read_file', 'list_mcp_resources', 'mcp__a__x'])

    expect(grouping.servers).toHaveLength(1)
    expect(grouping.totalTools).toBe(1)
  })

  it('serverName 含单个下划线时仍归到正确服务器', () => {
    const grouping = groupMcpTools(['mcp__my_server__tool', 'mcp__my_server__other'])

    expect(grouping.servers).toEqual([{ name: 'my_server', tools: ['mcp__my_server__other', 'mcp__my_server__tool'] }])
  })

  it('公开名被归一化/截断（缺少服务器边界）时进未归组计数，不猜测服务器名', () => {
    const grouping = groupMcpTools([
      'mcp__alpha__x',
      'mcp__verylongservername_abcdef123456',
    ])

    expect(grouping.servers.map((server) => server.name)).toEqual(['alpha'])
    expect(grouping.ungrouped).toEqual(['mcp__verylongservername_abcdef123456'])
    // 总数包含未归组者：它们确实是本会话可见的 MCP 工具。
    expect(grouping.totalTools).toBe(2)
  })

  it('空输入得到空归组', () => {
    expect(groupMcpTools([])).toEqual({ servers: [], ungrouped: [], totalTools: 0 })
  })
})

describe('Skill 投影', () => {
  it('保留模型或用户任一可调用的条目，过滤两者皆不可用者', () => {
    const rows = skillRows([
      skill('both'),
      skill('model-only', { userInvocable: false }),
      skill('user-only', { modelInvocable: false }),
      skill('unusable', { modelInvocable: false, userInvocable: false }),
    ])

    expect(rows.map((row) => row.name)).toEqual(['both', 'model-only', 'user-only'])
  })

  it('描述折叠空白并截断到上限（含省略号）', () => {
    const long = '很长的描述'.repeat(30)
    const [row] = skillRows([skill('long', { description: `  多行\n描述  ${long}` })])

    expect(row?.description.startsWith('多行 描述 很长的描述')).toBe(true)
    expect(row?.description.endsWith('…')).toBe(true)
    expect(row?.description).toHaveLength(SKILL_DESCRIPTION_MAX_LENGTH)
  })

  it('空描述保持空串', () => {
    const [row] = skillRows([skill('empty', { description: '   ' })])

    expect(row?.description).toBe('')
  })

  it('按名称升序输出', () => {
    const rows = skillRows([skill('zebra'), skill('alpha'), skill('middle')])

    expect(rows.map((row) => row.name)).toEqual(['alpha', 'middle', 'zebra'])
  })
})

describe('清单渲染', () => {
  const full: InventoryReading = {
    cwd: '/home/xu/work',
    mcp: groupMcpTools(['mcp__alpha__search', 'mcp__alpha__fetch', 'mcp__beta__ping']),
    skills: {
      rows: skillRows([
        skill('both', { source: 'project-dsh', description: '两侧都可调用' }),
        skill('model-only', { userInvocable: false, source: 'user-agents', description: '只给模型' }),
        skill('user-only', { modelInvocable: false, source: 'custom', description: '' }),
      ]),
      complete: true,
    },
  }

  it('首行 cwd，随后固定 MCP 段与 Skill 段', () => {
    const lines = renderInventory(full).split('\n')

    expect(lines[0]).toBe('会话清单（cwd：/home/xu/work）')
    expect(lines[2]).toBe('MCP 服务器（2 台，共 3 个工具）')
    expect(lines[3]).toBe('- alpha：2 个工具')
    expect(lines[4]).toBe('- beta：1 个工具')
    expect(lines[6]).toBe('Skill（3 个）')
  })

  it('skill 行带调用方式与来源标记，空描述省略破折号', () => {
    const text = renderInventory(full)

    expect(text).toContain('- both — 两侧都可调用（模型+/name，项目）')
    expect(text).toContain('- model-only — 只给模型（仅模型，用户(agents)）')
    expect(text).toContain('- user-only（仅 /name，自定义）')
  })

  it('未归组的 MCP 工具单独成行', () => {
    const text = renderInventory({
      cwd: '/w',
      mcp: groupMcpTools(['mcp__alpha__x', 'mcp__truncatedname_0123456789ab']),
      skills: { rows: [], complete: true },
    })

    expect(text).toContain('MCP 服务器（1 台，共 2 个工具）')
    expect(text).toContain('未归组：1 个 MCP 工具')
  })

  it('空工具面与空 skill 目录给出明确说明', () => {
    const text = renderInventory({
      cwd: '/w',
      mcp: groupMcpTools([]),
      skills: { rows: [], complete: true },
    })

    expect(text).toContain('MCP 服务器（0 台）：本会话当前没有可见的 MCP 工具')
    expect(text).toContain('Skill（0 个）：本会话当前没有可用 skill')
  })

  it('服务缺席时按段降级，另一段照常输出', () => {
    const text = renderInventory({
      cwd: '/w',
      mcp: undefined,
      mcpNote: '当前部署未提供 tools 服务，无法读取',
      skills: { rows: skillRows([skill('alpha')]), complete: true },
    })

    expect(text).toContain('MCP 服务器：当前部署未提供 tools 服务，无法读取')
    expect(text).toContain('Skill（1 个）')
  })

  it('skill 段不可读时 MCP 段照常输出', () => {
    const text = renderInventory({
      cwd: '/w',
      mcp: groupMcpTools(['mcp__alpha__x']),
      skills: undefined,
      skillsNote: '当前部署未提供 skills 服务，无法读取',
    })

    expect(text).toContain('MCP 服务器（1 台，共 1 个工具）')
    expect(text).toContain('Skill：当前部署未提供 skills 服务，无法读取')
  })

  it('观测不完整与 cwd 缺失各自标注', () => {
    const text = renderInventory({
      cwd: undefined,
      mcp: groupMcpTools([]),
      skills: { rows: skillRows([skill('alpha')]), complete: false },
    })

    expect(text).toContain('会话清单（cwd：未知）')
    expect(text).toContain('技能目录观测不完整，列表可能缺项')
    expect(text).toContain('未能解析会话工作目录，项目级 skill 可能缺失')
  })
})
