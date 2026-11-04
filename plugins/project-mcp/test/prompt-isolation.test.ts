/**
 * 名字面隔离的测试（spec: dsh-project-mcp — 资源服务器名与资源面的隔离；T1）。
 *
 * 上半部分覆盖纯函数：资源名段文本的改写/删段判定、`mcp:<server>` 指令段的
 * 按名删除，以及 `hiddenServers` / `sample` 两个支撑函数。下半部分覆盖
 * `createAssembleListener` 的装配瀑布行为——先 `next()`、按归属过滤、端口异常
 * over-hide、诊断限流——全部用假 assembly + 假 ports，不启动宿主、不造 cordis
 * 上下文。
 */
import { describe, expect, it } from 'vitest'
import {
  createAssembleListener,
  hiddenServers,
  isNameSurface,
  overHide,
  planNameFilter,
  RESOURCE_NAMES_SECTION,
  rewriteResourceNames,
  sample,
  SERVER_SECTION_PREFIX,
  type NamesRewrite,
  type PromptAssemblyLike,
  type PromptIsolationPorts,
  type SectionLike,
} from '../src/host/prompt-isolation.ts'
import type { ScanLog } from '../src/host/types.ts'

/** G1 实测的段文本：上游 mcp-resources 贡献的逐字形态。 */
const NAMES_TEXT =
  '## MCP resource servers\n\nUse list_mcp_resources, list_mcp_resource_templates, or read_mcp_resource with one of these names as the server argument: ["probe-a","probe-b"].'

/** 过滤掉 `probe-b` 后，同一段文本应有的逐字形态。 */
const NAMES_TEXT_WITHOUT_PROBE_B =
  '## MCP resource servers\n\nUse list_mcp_resources, list_mcp_resource_templates, or read_mcp_resource with one of these names as the server argument: ["probe-a"].'

/** 一行 fixture：名字段 + 两条服务器指令段 + 一条无关段。 */
function fixture(): SectionLike[] {
  return [
    { name: RESOURCE_NAMES_SECTION, text: NAMES_TEXT, interpolate: false },
    { name: 'mcp:probe-b', text: '### MCP server: probe-b\n\nUse probe-b.', interpolate: false },
    { name: 'mcp:probe-a', text: '### MCP server: probe-a\n\nUse probe-a.', interpolate: false },
    { name: 'identity', text: 'You are a helpful assistant.' },
  ]
}

/** 行为表：每个用例只描述文本、隐藏集合与完整期望结果。 */
const REWRITE_CASES: readonly {
  readonly title: string
  readonly text: string
  readonly hidden: readonly string[]
  readonly expected: NamesRewrite
}[] = [
  {
    title: 'removes a hidden name from the trailing sentence array',
    text: '… server argument: ["a","b"].',
    hidden: ['b'],
    expected: {
      kind: 'rewritten',
      text: '… server argument: ["a"].',
      kept: ['a'],
      removed: ['b'],
    },
  },
  {
    title: 'keeps empty text (nothing configured upstream)',
    text: '',
    hidden: ['probe-b'],
    expected: { kind: 'kept' },
  },
  {
    title: 'keeps whitespace-only text',
    text: ' \n\t',
    hidden: ['probe-b'],
    expected: { kind: 'kept' },
  },
  {
    title: 'reports unrecognizable text as unparsable',
    text: 'garbage',
    hidden: ['probe-b'],
    expected: { kind: 'unparsable' },
  },
  {
    title: 'removes the whole list when every name is hidden',
    text: NAMES_TEXT,
    hidden: ['probe-a', 'probe-b'],
    expected: { kind: 'empty', removed: ['probe-a', 'probe-b'] },
  },
  {
    title: 'keeps the text when nothing is hidden',
    text: NAMES_TEXT,
    hidden: [],
    expected: { kind: 'kept' },
  },
  {
    title: 'keeps the text when no listed name is hidden',
    text: NAMES_TEXT,
    hidden: ['probe-z'],
    expected: { kind: 'kept' },
  },
  {
    title: 'parses a pretty-printed array that spans lines',
    text: '## MCP resource servers\n\nUse these names as the server argument: [\n  "probe-a",\n  "probe-b"\n].',
    hidden: ['probe-b'],
    expected: {
      kind: 'rewritten',
      text: '## MCP resource servers\n\nUse these names as the server argument: ["probe-a"].',
      kept: ['probe-a'],
      removed: ['probe-b'],
    },
  },
  {
    title: 'reports a JSON object where the array should be',
    text: '… server argument: {"a":1}.',
    hidden: ['a'],
    expected: { kind: 'unparsable' },
  },
  {
    title: 'reports an array that is not all strings',
    text: '… server argument: ["a",1].',
    hidden: ['a'],
    expected: { kind: 'unparsable' },
  },
  {
    title: 'falls back to the last array when the sentence lead drifted',
    text: 'Available resource servers: ["a","b"].',
    hidden: ['b'],
    expected: {
      kind: 'rewritten',
      text: 'Available resource servers: ["a"].',
      kept: ['a'],
      removed: ['b'],
    },
  },
  {
    title: 'keeps the surviving names in their input order',
    text: '… server argument: ["c","a","b"].',
    hidden: ['b'],
    expected: {
      kind: 'rewritten',
      text: '… server argument: ["c","a"].',
      kept: ['c', 'a'],
      removed: ['b'],
    },
  },
  {
    title: 'accepts a sentence without its closing period',
    text: '… server argument: ["a","b"]',
    hidden: ['b'],
    expected: {
      kind: 'rewritten',
      text: '… server argument: ["a"]',
      kept: ['a'],
      removed: ['b'],
    },
  },
]

describe('rewriteResourceNames', () => {
  it.each(REWRITE_CASES)('$title', ({ text, hidden, expected }) => {
    expect(rewriteResourceNames(text, new Set(hidden))).toEqual(expected)
  })

  it('leaves an already-filtered section byte-identical', () => {
    const hidden = new Set(['probe-b'])
    const first = rewriteResourceNames(NAMES_TEXT, hidden)

    expect(first).toEqual({
      kind: 'rewritten',
      text: NAMES_TEXT_WITHOUT_PROBE_B,
      kept: ['probe-a'],
      removed: ['probe-b'],
    })
    if (first.kind !== 'rewritten') return
    expect(rewriteResourceNames(first.text, hidden)).toEqual({ kind: 'kept' })
  })
})

describe('planNameFilter', () => {
  it('rewrites the name section and drops the hidden server section', () => {
    const input = fixture()
    const plan = planNameFilter(input, new Set(['probe-b']))

    expect(plan.changed).toBe(true)
    expect(plan.removedSections).toEqual(['mcp:probe-b'])
    expect(plan.keptNames).toEqual(['probe-a'])
    expect(plan.removedNames).toEqual(['probe-b'])
    expect(plan.unparsable).toBe(false)

    // 改写段走 spread：文本换新，`interpolate:false` 等其余字段逐字保留。
    const names = plan.sections[0]
    expect(names).not.toBe(input[0])
    expect(names?.interpolate).toBe(false)
    expect(names?.text).toBe(NAMES_TEXT_WITHOUT_PROBE_B)

    expect(plan.sections.find((section) => section.name === 'mcp:probe-b')).toBeUndefined()
    // 可见服务器的指令段与无关段都保持原引用。
    expect(plan.sections.find((section) => section.name === 'mcp:probe-a')).toBe(input[2])
    expect(plan.sections.at(-1)).toBe(input[3])
  })

  it('drops the name section and every hidden server section', () => {
    const input = fixture()
    const plan = planNameFilter(input, new Set(['probe-a', 'probe-b']))

    expect(plan.changed).toBe(true)
    expect(plan.unparsable).toBe(false)
    expect(plan.removedNames).toEqual(['probe-a', 'probe-b'])
    expect(plan.removedSections).toEqual(['mcp:probe-b', 'mcp:probe-a'])
    expect(plan.sections.map((section) => section.name)).toEqual(['identity'])
    expect(plan.sections[0]).toBe(input[3])
  })

  it('drops an unparsable name section and reports it', () => {
    const input = fixture()
    input[0] = { name: RESOURCE_NAMES_SECTION, text: 'garbage', interpolate: false }
    const plan = planNameFilter(input, new Set(['probe-b']))

    expect(plan.changed).toBe(true)
    expect(plan.unparsable).toBe(true)
    expect(plan.sections.some((section) => section.name === RESOURCE_NAMES_SECTION)).toBe(false)
    expect(plan.removedSections).toEqual(['mcp:probe-b'])
  })

  it('returns the input sections unchanged when no listed name is hidden', () => {
    const input = fixture()
    const plan = planNameFilter(input, new Set(['probe-z']))

    expect(plan.changed).toBe(false)
    expect(plan.sections).toBe(input)
    expect(plan.sections[0]).toBe(input[0])
    expect(plan.keptNames).toEqual([])
    expect(plan.removedNames).toEqual([])
    expect(plan.removedSections).toEqual([])
    expect(plan.unparsable).toBe(false)
  })

  it('returns the input sections unchanged for an empty hidden set', () => {
    const input = fixture()
    const plan = planNameFilter(input, new Set())

    expect(plan.changed).toBe(false)
    expect(plan.sections).toBe(input)
  })

  it('returns the input sections unchanged when no section is relevant', () => {
    const input: SectionLike[] = [{ name: 'identity', text: 'You are a helpful assistant.' }]
    const plan = planNameFilter(input, new Set(['probe-b']))

    expect(plan.changed).toBe(false)
    expect(plan.sections).toBe(input)
  })

  it('concatenates names when the name section appears twice (defensive)', () => {
    const input: SectionLike[] = [
      { name: RESOURCE_NAMES_SECTION, text: '… server argument: ["a","b"].' },
      { name: RESOURCE_NAMES_SECTION, text: '… server argument: ["b"].' },
    ]
    const plan = planNameFilter(input, new Set(['b']))

    expect(plan.keptNames).toEqual(['a'])
    expect(plan.removedNames).toEqual(['b', 'b'])
    expect(plan.sections).toHaveLength(1)
  })
})

describe('hiddenServers', () => {
  it('computes blocked minus visible', () => {
    expect(hiddenServers(new Set(['probe-a', 'probe-b', 'probe-c']), new Set(['probe-a']))).toEqual(
      new Set(['probe-b', 'probe-c']),
    )
  })

  it('hides everything for an untracked agent and copies the blocked set', () => {
    const blocked = new Set(['probe-a', 'probe-b'])
    const hidden = hiddenServers(blocked, undefined)

    expect(hidden).toEqual(blocked)
    expect(hidden).not.toBe(blocked)
  })

  it('hides nothing when nothing is blocked', () => {
    expect(hiddenServers(new Set(), new Set())).toEqual(new Set())
    expect(hiddenServers(new Set(), undefined)).toEqual(new Set())
  })
})

describe('sample', () => {
  it('renders up to six names verbatim', () => {
    expect(sample([])).toBe('')
    expect(sample(['a', 'b'])).toBe('a,b')
    expect(sample(['a', 'b', 'c', 'd', 'e', 'f'])).toBe('a,b,c,d,e,f')
  })

  it('counts the names beyond six', () => {
    expect(sample(['a', 'b', 'c', 'd', 'e', 'f', 'g'])).toBe('a,b,c,d,e,f,+1')
    expect(sample(Array.from({ length: 10 }, (_, index) => `s${index}`))).toBe('s0,s1,s2,s3,s4,s5,+4')
  })
})

describe('section constants', () => {
  it('matches the upstream section names', () => {
    expect(RESOURCE_NAMES_SECTION).toBe('mcp-resource-servers')
    expect(SERVER_SECTION_PREFIX).toBe('mcp:')
  })
})

/** 录制型日志：三条通道各自留痕，供断言行数与逐字文本。 */
interface RecordingLog extends ScanLog {
  readonly infos: string[]
  readonly warns: string[]
  readonly errors: string[]
}

/**
 * 造一个录制型日志。
 * @returns 三条通道都是数组的日志。
 */
function recordingLog(): RecordingLog {
  const infos: string[] = []
  const warns: string[] = []
  const errors: string[] = []
  return {
    infos,
    warns,
    errors,
    info: (message) => {
      infos.push(message)
    },
    warn: (message) => {
      warns.push(message)
    },
    error: (message) => {
      errors.push(message)
    },
  }
}

/** 假装配：比窄接口多两个字段，用来验证 spread 不丢字段。 */
interface FakeAssembly extends PromptAssemblyLike {
  readonly tools: readonly string[]
  readonly variables: Readonly<Record<string, string>>
}

/** 假会话头：`AssembleAgentLike` 要求的最小身份。 */
interface FakeAgent {
  readonly session: { readonly header: { readonly id: string; readonly cwd?: string } }
}

/**
 * 造一个假 agent。
 * @param id - 会话 id。
 * @param cwd - 会话工作目录。
 * @returns 只带会话身份的 agent。
 */
function fakeAgent(id = 's1', cwd = '/work/a'): FakeAgent {
  return { session: { header: { id, cwd } } }
}

/** profile 级服务器名：不在 blocked 集合里，任何过滤都必须留住。 */
const PROFILE_NAME = 'codebase-memory'

/** G1 实测段文本 + 一个 profile 名：项目名与 profile 名同段。 */
const LISTENER_TEXT =
  '## MCP resource servers\n\nUse list_mcp_resources, list_mcp_resource_templates, or read_mcp_resource with one of these names as the server argument: ["codebase-memory","probe-a","probe-b"].'

/** 一行 fixture：名字段 + 两条服务器指令段 + 一条无关段。 */
function listenerSections(): SectionLike[] {
  return [
    { name: RESOURCE_NAMES_SECTION, text: LISTENER_TEXT, interpolate: false },
    { name: 'mcp:probe-b', text: '### MCP server: probe-b\n\nUse probe-b.', interpolate: false },
    { name: 'mcp:probe-a', text: '### MCP server: probe-a\n\nUse probe-a.', interpolate: false },
    { name: 'identity', text: 'You are a helpful assistant.' },
  ]
}

/**
 * 造一个假装配。
 * @param sections - 装配段（缺省用 {@link listenerSections}）。
 * @returns 带额外字段的假装配。
 */
function listenerAssembly(sections: readonly SectionLike[] = listenerSections()): FakeAssembly {
  return { sections, tools: ['tool:identity'], variables: { mode: 'test' } }
}

/** 假端口的三件套：端口对象、录制日志、按序记下的端口读。 */
interface PortsFixture {
  readonly ports: PromptIsolationPorts
  readonly log: RecordingLog
  readonly calls: string[]
}

/**
 * 造一组假端口。
 * @param options.visible - `visibleFor` 的返回值（缺省 = 未跟踪）。
 * @param options.blocked - `blockedServerNames` 的返回值（缺省 = 空集）。
 * @param options.onCall - 端口被读时按序回调（断言读序用）。
 * @returns 端口、日志与读序记录。
 */
function portsFixture(options: {
  readonly visible?: (agent: object) => ReadonlySet<string> | undefined
  readonly blocked?: ReadonlySet<string>
  readonly onCall?: (port: string) => void
} = {}): PortsFixture {
  const log = recordingLog()
  const calls: string[] = []
  const visibleFor = (agent: object): ReadonlySet<string> | undefined => {
    calls.push('visibleFor')
    options.onCall?.('visibleFor')
    return options.visible === undefined ? undefined : options.visible(agent)
  }
  const blockedServerNames = (): ReadonlySet<string> => {
    calls.push('blockedServerNames')
    options.onCall?.('blockedServerNames')
    return options.blocked ?? new Set()
  }
  return { ports: { visibleFor, blockedServerNames, log }, log, calls }
}

describe('createAssembleListener', () => {
  it('awaits the chain once, filters a tracked agent, and reports the outcome', async () => {
    const agent = fakeAgent()
    const assembly = listenerAssembly()
    const order: string[] = []
    let seenKey: object | undefined
    const { ports, log, calls } = portsFixture({
      visible: (key) => {
        seenKey = key
        return new Set([PROFILE_NAME, 'probe-a'])
      },
      blocked: new Set(['probe-a', 'probe-b']),
      onCall: (port) => {
        order.push(port)
      },
    })
    const next = async (): Promise<FakeAssembly> => {
      order.push('next')
      return assembly
    }

    const result = await createAssembleListener(ports)(assembly, { agent, scope: { other: true } }, next)

    // next 恰好一次、且先于任何端口读；context.agent 优先于 context.scope。
    expect(calls).toEqual(['visibleFor', 'blockedServerNames'])
    expect(order).toEqual(['next', 'visibleFor', 'blockedServerNames'])
    expect(seenKey).toBe(agent)

    // 项目名移出名字数组、profile 名保留、probe-a 的段留住、probe-b 的段被删。
    expect(result.sections.map((section) => section.name)).toEqual([
      RESOURCE_NAMES_SECTION,
      'mcp:probe-a',
      'identity',
    ])
    expect(result.sections[0]?.text).toContain('["codebase-memory","probe-a"]')
    expect(result.sections[0]?.interpolate).toBe(false)

    // 其余字段随 spread 原样保留（同一引用），入参数组不被修改。
    expect(result.tools).toBe(assembly.tools)
    expect(result.variables).toBe(assembly.variables)
    expect(result).not.toBe(assembly)
    expect(assembly.sections).toHaveLength(4)

    expect(log.infos).toEqual([
      'prompt: resource names session=s1 cwd=/work/a tracked=yes kept=[codebase-memory,probe-a] removed=[probe-b] sections=[mcp:probe-b] unparsable=0',
    ])
    expect(log.warns).toEqual([])
    expect(log.errors).toEqual([])
  })

  it('falls back to context.scope when there is no agent', async () => {
    const scope = { kind: 'scope' }
    const assembly = listenerAssembly()
    let seenKey: object | undefined
    const { ports, log, calls } = portsFixture({
      visible: (key) => {
        seenKey = key
        return new Set(['probe-a'])
      },
      blocked: new Set(['probe-a', 'probe-b']),
    })

    const result = await createAssembleListener(ports)(assembly, { scope }, async () => assembly)

    expect(calls).toEqual(['visibleFor', 'blockedServerNames'])
    expect(seenKey).toBe(scope)
    expect(result.sections.map((section) => section.name)).toEqual([
      RESOURCE_NAMES_SECTION,
      'mcp:probe-a',
      'identity',
    ])
    // 没有 agent 就没有会话身份可写：`session=(none)`、`cwd=none`。
    expect(log.infos).toEqual([
      'prompt: resource names session=(none) cwd=none tracked=yes kept=[codebase-memory,probe-a] removed=[probe-b] sections=[mcp:probe-b] unparsable=0',
    ])
  })

  it('hides every blocked name and reports tracked=no for an untracked agent', async () => {
    const agent = fakeAgent()
    const assembly = listenerAssembly()
    const { ports, log } = portsFixture({
      visible: () => undefined,
      blocked: new Set(['probe-a', 'probe-b']),
    })

    const result = await createAssembleListener(ports)(assembly, { agent }, async () => assembly)

    expect(result.sections.map((section) => section.name)).toEqual([RESOURCE_NAMES_SECTION, 'identity'])
    // profile 名既不在 blocked 里，就仍然留在名字数组中。
    expect(result.sections[0]?.text).toContain('["codebase-memory"]')
    expect(log.infos).toEqual(['prompt: resource names session=s1 cwd=none tracked=no hidden=2'])
  })

  it('treats an assembly with neither agent nor scope as untracked without asking visibleFor', async () => {
    const assembly = listenerAssembly()
    const { ports, log, calls } = portsFixture({ blocked: new Set(['probe-a', 'probe-b']) })

    const result = await createAssembleListener(ports)(assembly, {}, async () => assembly)

    expect(calls).toEqual(['blockedServerNames'])
    expect(result.sections.map((section) => section.name)).toEqual([RESOURCE_NAMES_SECTION, 'identity'])
    expect(log.infos).toEqual(['prompt: resource names session=(none) cwd=none tracked=no hidden=2'])
  })

  it('drops the name section itself when every listed name is a hidden project name', async () => {
    const assembly: FakeAssembly = {
      sections: [
        { name: RESOURCE_NAMES_SECTION, text: '… server argument: ["probe-a","probe-b"].', interpolate: false },
        { name: 'mcp:probe-a', text: '### MCP server: probe-a\n\nUse probe-a.', interpolate: false },
        { name: 'identity', text: 'You are a helpful assistant.' },
      ],
      tools: [],
      variables: {},
    }
    const { ports, log } = portsFixture({
      visible: () => undefined,
      blocked: new Set(['probe-a', 'probe-b']),
    })

    const result = await createAssembleListener(ports)(assembly, { agent: fakeAgent() }, async () => assembly)

    // 名字段与两条 mcp: 段全部消失，只剩无关段。
    expect(result.sections.map((section) => section.name)).toEqual(['identity'])
    expect(log.infos).toEqual(['prompt: resource names session=s1 cwd=none tracked=no hidden=2'])
  })

  it('returns the chain result itself when nothing has to change', async () => {
    const assembly = listenerAssembly()
    const { ports, log } = portsFixture({
      visible: () => new Set([PROFILE_NAME]),
      blocked: new Set(['probe-z']),
    })

    const result = await createAssembleListener(ports)(assembly, { agent: fakeAgent() }, async () => assembly)

    expect(result).toBe(assembly)
    // 有相关段、集合也读到了：仍然留一行，第一次即该形状的全部信息。
    expect(log.infos).toHaveLength(1)
  })

  it('reads no port and logs nothing when no section carries a name', async () => {
    const assembly = listenerAssembly([{ name: 'identity', text: 'You are a helpful assistant.' }])
    const { ports, log, calls } = portsFixture({
      visible: () => {
        throw new Error('must not be read')
      },
      blocked: new Set(['probe-a']),
    })

    const result = await createAssembleListener(ports)(assembly, { agent: fakeAgent() }, async () => assembly)

    expect(result).toBe(assembly)
    expect(calls).toEqual([])
    expect(log.infos).toEqual([])
    expect(log.warns).toEqual([])
    expect(log.errors).toEqual([])
  })

  it('over-hides every name surface when a port read throws', async () => {
    const assembly = listenerAssembly()
    const { ports, log } = portsFixture({
      visible: () => {
        throw new Error('boom')
      },
      blocked: new Set(['probe-a', 'probe-b']),
    })

    const result = await createAssembleListener(ports)(assembly, { agent: fakeAgent() }, async () => assembly)

    expect(result.sections.map((section) => section.name)).toEqual(['identity'])
    expect(log.errors).toEqual([
      'prompt: cannot read the project server sets of one assembly: Error: boom',
    ])
    expect(log.infos).toEqual([])
  })

  it('over-hides every name surface when the filtering throws', async () => {
    const bomb: SectionLike = {
      name: RESOURCE_NAMES_SECTION,
      get text(): string {
        throw new Error('boom')
      },
    }
    const assembly = listenerAssembly([bomb, { name: 'identity', text: 'You are a helpful assistant.' }])
    const { ports, log } = portsFixture({ visible: () => new Set(), blocked: new Set(['probe-a']) })

    const result = await createAssembleListener(ports)(assembly, { agent: fakeAgent() }, async () => assembly)

    expect(result.sections.map((section) => section.name)).toEqual(['identity'])
    expect(log.errors).toEqual([
      'prompt: cannot filter the resource server names of one assembly: Error: boom',
    ])
  })

  it('propagates a chain failure and reads no port', async () => {
    const { ports, calls } = portsFixture({ blocked: new Set(['probe-a']) })
    const next = async (): Promise<FakeAssembly> => {
      throw new Error('chain failed')
    }

    await expect(
      createAssembleListener(ports)(listenerAssembly(), { agent: fakeAgent() }, next),
    ).rejects.toThrow('chain failed')
    expect(calls).toEqual([])
  })

  it('reports one shape once however many assemblies share it', async () => {
    const assembly = listenerAssembly()
    const { ports, log } = portsFixture({
      visible: () => new Set([PROFILE_NAME, 'probe-a']),
      blocked: new Set(['probe-a', 'probe-b']),
    })
    const listener = createAssembleListener(ports)

    for (let index = 0; index < 6; index += 1) {
      const result = await listener(assembly, { agent: fakeAgent() }, async () => assembly)
      expect(result.sections.some((section) => section.name === 'mcp:probe-b')).toBe(false)
    }

    // 同形状连续 6 次：只留第一条。
    expect(log.infos).toHaveLength(1)
  })

  it('reports again when the shape changes', async () => {
    const agentA = fakeAgent('s1', '/work/a')
    const agentB = fakeAgent('s2', '/work/b')
    const assembly = listenerAssembly()
    const { ports, log } = portsFixture({
      visible: (agent) => (
        agent === agentA
          ? new Set([PROFILE_NAME, 'probe-a'])
          : new Set([PROFILE_NAME, 'probe-b'])
      ),
      blocked: new Set(['probe-a', 'probe-b']),
    })
    const listener = createAssembleListener(ports)

    await listener(assembly, { agent: agentA }, async () => assembly)
    await listener(assembly, { agent: agentB }, async () => assembly)

    expect(log.infos).toHaveLength(2)
    expect(log.infos[0]).toContain('removed=[probe-b]')
    expect(log.infos[1]).toContain('removed=[probe-a]')
  })

  it('warns for the first three unparsable sections only', async () => {
    const assembly = listenerAssembly([
      { name: RESOURCE_NAMES_SECTION, text: 'garbage' },
      { name: 'identity', text: 'You are a helpful assistant.' },
    ])
    const { ports, log } = portsFixture({ visible: () => new Set(), blocked: new Set(['probe-a']) })
    const listener = createAssembleListener(ports)

    for (let index = 0; index < 4; index += 1) {
      const result = await listener(assembly, { agent: fakeAgent() }, async () => assembly)
      expect(result.sections.map((section) => section.name)).toEqual(['identity'])
    }

    expect(log.warns).toHaveLength(3)
    expect(log.warns[0]).toBe(
      'prompt: resource names section unparsable (deleted), upstream text drifted: session=s1 cwd=/work/a',
    )
    // 四条装配同形状：解析失败行只留一条，warn 独立计数。
    expect(log.infos).toHaveLength(1)
  })
})

describe('isNameSurface / overHide', () => {
  it('recognizes the resource-name section and the mcp: instruction sections', () => {
    expect(isNameSurface({ name: RESOURCE_NAMES_SECTION, text: 'x' })).toBe(true)
    expect(isNameSurface({ name: 'mcp:probe-a', text: 'x' })).toBe(true)
    expect(isNameSurface({ name: 'identity', text: 'x' })).toBe(false)
    expect(isNameSurface({ name: 'mcp', text: 'x' })).toBe(false)
  })

  it('drops every name surface and keeps unrelated sections in order', () => {
    const sections: SectionLike[] = [
      { name: 'identity', text: 'a' },
      { name: RESOURCE_NAMES_SECTION, text: 'b' },
      { name: 'mcp:probe-a', text: 'c' },
      { name: 'commands', text: 'd' },
    ]

    const kept = overHide(sections)

    expect(kept.map((section) => section.name)).toEqual(['identity', 'commands'])
    expect(kept[0]).toBe(sections[0])
    expect(kept[1]).toBe(sections[3])
  })
})
