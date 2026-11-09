/**
 * 线上契约测试（规范：dsh-session-tool-toggle —— 通道契约、五端点形状、失败码）。
 *
 * 覆盖六类事实：
 *
 * 1. **常量**：通道名合宿主的 `CHANNEL_PATTERN`、五个端点且端点段单段、9 个宿主码 +
 *    2 个传输码、`isFailureCode` 对未知码返回 false、五处上限值、视图枚举取值。
 * 2. **请求 parser（5 个）**：合法样本通过；缺字段 / **未知字段（strict）** / 类型错 /
 *    超长地址（>200）/ 地址数量越界（>64）/ `defaults` 与 `workspace` 的 action ↔ addresses
 *    约束、`workspace` 的两种寻址形态互斥全部拒绝。
 * 3. **响应 parser（5 个）**：合法样本原样通过（`toStrictEqual`，顺带钉住"不新增键"）；
 *    嵌套形状（工具条目 / 分组 / 技能行 / 工作区视图 / 统计 / 变更回执）逐字段校验；
 *    缺字段与多余字段都拒绝。
 * 4. **失败细节**：六种 `details` 形状可读，未知 / 多字段 / 类型不符降级 `undefined`。
 * 5. **FORK/兼容**：快照不携带工具入参 schema（`parameters`），本文件只断言"出现即拒绝"，
 *    不断言任何字段在未来版本里的存在性。
 * 6. **交叉校验**：宿主侧快照（任务 9.3 的 `panel.ts` 自带一份 host 类型）与本契约的形状
 *    双向可赋值——漂移在构建期暴露，而不是等 9.4 的 dispatcher 在运行时回 `bad-response`。
 *
 * 表驱动：畸形样本用 `setAt` / `dropAt` 从合法夹具派生（一条用例钉一条边界），新增字段时
 * 只需往表里加一行，不必重写样本。
 */
import { describe, expect, it } from 'vitest'
import {
  ADDRESS_MAX_LENGTH,
  CHANNEL,
  DEFAULTS_ACTIONS,
  DEFAULTS_VERSION,
  DESCRIPTION_MAX_LENGTH,
  ENDPOINTS,
  FAILURE_CODES,
  HOST_FAILURE_CODES,
  MAX_ADDRESSES,
  MAX_WORKSPACE_PATH_LENGTH,
  NOTICE_CODES,
  REQUEST_PARSERS,
  SESSION_ID_MAX_LENGTH,
  STORE_KINDS,
  TOOL_GROUP_KINDS,
  TRANSPORT_FAILURE_CODES,
  WORKSPACE_ACTIONS,
  WORKSPACE_ENDPOINT,
  isFailureCode,
  parseDefaultsRequest,
  parseDefaultsValue,
  parseFailureDetails,
  parsePanelRequest,
  parsePanelSnapshot,
  parseResetRequest,
  parseResetValue,
  parseToggleRequest,
  parseToggleValue,
  parseWorkspaceRequest,
  parseWorkspaceValue,
  type DefaultsValue,
  type PanelSnapshot,
  type Parsed,
  type ToggleValue,
  type WorkspaceValue,
} from '../src/contract.ts'
// 交叉校验用的宿主侧类型（任务 9.3 的 `panel.ts`）。`import type` 在运行期被完全抹除，
// 本套件因此仍然只加载 `contract.ts` 一个模块。
import type { PanelSnapshot as HostPanelSnapshot } from '../src/host/panel.ts'

/* ────────────────────────────── 夹具 ────────────────────────────── */

/**
 * 一份"什么都带上"的合法快照：MCP 组（含描述 / 已关两种条目）、skill 组
 * （保护）、builtin 组（保护 + 保留 + 组地址 null），外加两个提示码。
 */
const SNAPSHOT: PanelSnapshot = {
  sessionId: 'session-1',
  createdAt: 1_760_000_000_000,
  state: {
    disabled: ['mcp:yunxiao', 'mcp:yunxiao::list_projects'],
    snapshot: ['mcp:yunxiao'],
    seeded: true,
    updatedAt: 1_760_000_100_000,
    storeKind: 'record',
  },
  groups: [
    {
      kind: 'mcp',
      key: 'yunxiao',
      address: 'mcp:yunxiao',
      toolCount: 2,
      disabledCount: 1,
      disabled: true,
      tools: [
        {
          name: 'mcp__yunxiao__get_current_user',
          shortName: 'get_current_user',
          address: 'mcp:yunxiao::get_current_user',
          disabled: false,
          protected: false,
          reserved: false,
          description: '取当前用户',
        },
        {
          name: 'mcp__yunxiao__list_projects',
          shortName: 'list_projects',
          address: 'mcp:yunxiao::list_projects',
          disabled: true,
          protected: false,
          reserved: false,
        },
      ],
    },
    {
      kind: 'skill',
      key: 'skill',
      address: 'tool:skill',
      toolCount: 1,
      disabledCount: 0,
      disabled: false,
      tools: [
        {
          name: 'skill',
          shortName: 'skill',
          address: 'tool:skill',
          disabled: false,
          protected: true,
          reserved: false,
        },
      ],
    },
    {
      kind: 'builtin',
      key: 'builtin',
      address: null,
      toolCount: 1,
      disabledCount: 0,
      disabled: false,
      tools: [
        {
          name: 'task_board_create',
          shortName: 'task_board_create',
          address: 'tool:task_board_create',
          disabled: false,
          protected: true,
          reserved: true,
        },
      ],
    },
  ],
  protectedNames: ['bash', 'grep', 'skill'],
  defaults: {
    version: 1,
    disabled: ['mcp:b'],
    path: '/home/u/.dsh/session-tool-toggle/defaults.json',
    readable: true,
    corrupt: false,
  },
  intentOnly: ['mcp:gone'],
  stats: { visible: 12, denied: 2 },
  notices: ['persistence-degraded', 'session-subagent'],
  skills: [
    { name: 'openspec-propose', description: '提案工作流', disabled: true, shadowed: true },
    { name: 'skill-creator', description: '', disabled: false, shadowed: false },
  ],
  workspace: {
    key: '/home/u/develop/proj',
    title: 'proj',
    registered: true,
    disabled: ['skill:skill-creator'],
    path: '/home/u/.dsh/session-tool-toggle/workspaces.json',
    readable: true,
    corrupt: false,
  },
}

/** `toggle` 的成功值：新快照 + 逐地址回执（含一条 0 匹配的"意图"）。 */
const TOGGLE_VALUE: ToggleValue = {
  snapshot: SNAPSHOT,
  mutation: {
    applied: [
      { address: 'mcp:yunxiao', on: true, matched: 70 },
      { address: 'mcp:gone', on: true, matched: 0 },
    ],
    hiddenTools: -3,
    hiddenSkills: 1,
    visibleBefore: 12,
    visibleAfter: 15,
    kvRebuild: true,
    notices: [],
  },
}

/** `defaults` 的成功值：默认档视图 + 实际写入的地址（**不含**会话快照）。 */
const DEFAULTS_VALUE: DefaultsValue = {
  defaults: {
    version: 1,
    disabled: ['mcp:b', 'tool:skill'],
    path: '/home/u/.dsh/session-tool-toggle/defaults.json',
    readable: true,
    corrupt: false,
  },
  changed: ['mcp:b', 'tool:skill'],
}

/**
 * 会话视角的工具宇宙最小样本（三组各一条：MCP 一条带描述、技能一条、内置工具一条）；
 * 三组顺序即契约要求（mcp → skill → builtin）。
 */
const WORKSPACE_UNIVERSE: NonNullable<WorkspaceValue['universe']> = {
  layerReady: true,
  skillsAvailable: true,
  groups: [
    {
      kind: 'mcp',
      key: 'yunxiao',
      address: 'mcp:yunxiao',
      tools: [
        {
          address: 'mcp:yunxiao::get_current_user',
          shortName: 'get_current_user',
          description: '取当前用户',
          protected: false,
          reserved: false,
        },
      ],
    },
    {
      kind: 'skill',
      key: 'skill',
      address: 'tool:skill',
      tools: [{ address: 'skill:skill-creator', shortName: 'skill-creator', protected: false, reserved: false }],
    },
    {
      kind: 'builtin',
      key: 'builtin',
      address: null,
      tools: [{ address: 'tool:bash', shortName: 'bash', protected: true, reserved: false }],
    },
  ],
}

/** `workspace` 的成功值：目标工作区视图 + 下拉可选项 + 实际写入项 + 会话视角宇宙。 */
const WORKSPACE_VALUE: WorkspaceValue = {
  workspace: {
    key: '/home/u/develop/proj',
    title: 'proj',
    registered: true,
    disabled: ['mcp:b', 'skill:skill-creator'],
    path: '/home/u/.dsh/session-tool-toggle/workspaces.json',
    readable: true,
    corrupt: false,
  },
  choices: [
    { key: '/home/u/develop/proj', title: 'proj' },
    { key: '/home/u/develop/other', title: 'other' },
  ],
  changed: ['mcp:b'],
  universe: WORKSPACE_UNIVERSE,
}

/* ────────────────────────────── 助手 ────────────────────────────── */

/** 一条拒绝表项：名称 + 畸形样本 + 期望在失败文案里看到的片段（可选）。 */
interface RejectedCase {
  /** 用例名（打印在测试标题里）。 */
  readonly name: string
  /** 畸形样本。 */
  readonly raw: unknown
  /** 失败文案里应出现的片段。 */
  readonly fragment?: RegExp
}

/** JSON 深拷贝：把带类型标注的夹具变成"线上来的原始值"，抹掉 TS 的承诺。 */
function plain(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown
}

/** 取路径上的子值（`a.b.0.c`）。 */
function child(target: unknown, key: string): unknown {
  if (Array.isArray(target)) return (target as unknown[])[Number(key)]
  if (typeof target === 'object' && target !== null) return (target as Record<string, unknown>)[key]
  throw new Error(`路径段 ${key} 落在非对象值上`)
}

/** 给路径上的容器赋值。 */
function assign(target: unknown, key: string, value: unknown): void {
  if (Array.isArray(target)) {
    ;(target as unknown[])[Number(key)] = value
    return
  }
  if (typeof target === 'object' && target !== null) {
    ;(target as Record<string, unknown>)[key] = value
    return
  }
  throw new Error(`路径段 ${key} 落在非对象值上`)
}

/** 按路径写值，返回**新的**畸形样本（原夹具不动）。 */
function setAt(base: unknown, path: string, value: unknown): unknown {
  const copy = plain(base)
  const keys = path.split('.')
  let cursor: unknown = copy
  for (const key of keys.slice(0, -1)) cursor = child(cursor, key)
  assign(cursor, keys[keys.length - 1], value)
  return copy
}

/** 按路径删字段，返回**新的**畸形样本（路径不存在即抛，避免"假删除"的假绿）。 */
function dropAt(base: unknown, path: string): unknown {
  const copy = plain(base)
  const keys = path.split('.')
  let cursor: unknown = copy
  for (const key of keys.slice(0, -1)) cursor = child(cursor, key)
  if (typeof cursor !== 'object' || cursor === null || Array.isArray(cursor)) {
    throw new Error('dropAt 只能删对象字段')
  }
  const last = keys[keys.length - 1]
  const record = cursor as Record<string, unknown>
  if (!(last in record)) throw new Error(`路径 ${path} 不存在，无法删除`)
  delete record[last]
  return copy
}

/** 一条合法表项：名称 + 样本（值为 `undefined` 时不比对返回值）。 */
interface AcceptedCase {
  /** 用例名。 */
  readonly name: string
  /** 合法样本。 */
  readonly raw: unknown
}

/** 跑一张合法表：每项一条用例，断言 `ok === true`。 */
function runAccepted(parse: (raw: unknown) => Parsed<unknown>, cases: readonly AcceptedCase[]): void {
  for (const testCase of cases) {
    it(`通过：${testCase.name}`, () => {
      expect(parse(testCase.raw).ok).toBe(true)
    })
  }
}

/** 跑一张拒绝表：每项一条用例，断言 `ok === false`、文案非空、片段命中。 */
function runRejected(parse: (raw: unknown) => Parsed<unknown>, cases: readonly RejectedCase[]): void {
  for (const testCase of cases) {
    it(`拒绝：${testCase.name}`, () => {
      const result = parse(testCase.raw)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.message.length).toBeGreaterThan(0)
      if (testCase.fragment !== undefined) expect(result.message).toMatch(testCase.fragment)
    })
  }
}

/** 造 `count` 条互不相同的地址（文法由宿主 `address.ts` 负责，这里只要长度合规）。 */
function addressList(count: number): readonly string[] {
  return Array.from({ length: count }, (_unused, index) => `mcp:srv${index}`)
}

/* ────────────────────────────── 常量 ────────────────────────────── */

describe('通道与端点常量', () => {
  it('通道名是包名派生的单段绝对通道（合宿主的 CHANNEL_PATTERN）', () => {
    expect(CHANNEL).toBe('/session-tool-toggle')
    expect(CHANNEL).toMatch(/^\/[A-Za-z0-9._~-]+$/)
    // `/api` 是保留通道，注册即抛：本插件不得占用。
    expect(CHANNEL).not.toBe('/api')
  })

  it('端点集恰好 5 个、各自单段（能被端点段文法接受，不带 /）', () => {
    expect(ENDPOINTS).toHaveLength(5)
    expect(ENDPOINTS).toEqual(['panel', 'toggle', 'reset', 'defaults', 'workspace'])
    expect(WORKSPACE_ENDPOINT).toBe('workspace')
    for (const endpoint of ENDPOINTS) {
      expect(endpoint).toMatch(/^[A-Za-z0-9_$.-]+$/)
      expect(endpoint.includes('/')).toBe(false)
    }
  })

  it('defaults 动作集与 §2.2 草案一致', () => {
    expect(DEFAULTS_ACTIONS).toEqual(['set', 'off', 'on', 'reset'])
  })

  it('workspace 动作集与 §3.6.1 一致（read 是缺省值）', () => {
    expect(WORKSPACE_ACTIONS).toEqual(['read', 'set', 'off', 'on', 'reset'])
  })

  it('视图枚举取值与 §2.2 草案一致', () => {
    expect(TOOL_GROUP_KINDS).toEqual(['mcp', 'skill', 'builtin'])
    expect(NOTICE_CODES).toEqual([
      'persistence-degraded',
      'defaults-corrupt',
      'session-subagent',
      'skills-unavailable',
      'skill-shadow-failed',
    ])
    expect(STORE_KINDS).toEqual(['record', 'memory'])
    expect(DEFAULTS_VERSION).toBe(1)
  })

  it('边界上限的取值与设计一致', () => {
    expect(SESSION_ID_MAX_LENGTH).toBe(255)
    expect(ADDRESS_MAX_LENGTH).toBe(200)
    expect(MAX_ADDRESSES).toBe(64)
    expect(DESCRIPTION_MAX_LENGTH).toBe(160)
    expect(MAX_WORKSPACE_PATH_LENGTH).toBe(4096)
  })
})

describe('失败码常量', () => {
  it('宿主侧 9 个码，顺序即界面兜底顺序（业务拒绝码不合并成 internal）', () => {
    expect(HOST_FAILURE_CODES).toHaveLength(9)
    expect(HOST_FAILURE_CODES).toEqual([
      'bad-request',
      'bad-address',
      'protected',
      'reserved',
      'session-not-live',
      'defaults-unwritable',
      'internal',
      'workspace-unresolved',
      'workspace-unwritable',
    ])
  })

  it('传输侧 2 个码（由 client 合成，不是宿主码）', () => {
    expect(TRANSPORT_FAILURE_CODES).toHaveLength(2)
    expect(TRANSPORT_FAILURE_CODES).toEqual(['unavailable', 'bad-response'])
  })

  it('合表 9 + 2 = 11 且无重复', () => {
    expect(FAILURE_CODES).toHaveLength(11)
    expect(new Set(FAILURE_CODES).size).toBe(11)
    expect(FAILURE_CODES.slice(0, 9)).toEqual([...HOST_FAILURE_CODES])
    expect(FAILURE_CODES.slice(9)).toEqual([...TRANSPORT_FAILURE_CODES])
  })

  it('isFailureCode：11 个已知码为 true，未知码为 false', () => {
    for (const code of FAILURE_CODES) expect(isFailureCode(code)).toBe(true)
    for (const code of ['', 'BAD-REQUEST', 'timeout', 'not-found', 'bad_response', 'internal ']) {
      expect(isFailureCode(code), `未知码 ${code} 应判 false`).toBe(false)
    }
  })
})

describe('REQUEST_PARSERS 端点表', () => {
  it('每个端点都有 parser（漏一个会被类型检查或本用例抓住）', () => {
    expect(Object.keys(REQUEST_PARSERS).sort()).toEqual([...ENDPOINTS].sort())
    expect(REQUEST_PARSERS.panel).toBe(parsePanelRequest)
    expect(REQUEST_PARSERS.toggle).toBe(parseToggleRequest)
    expect(REQUEST_PARSERS.reset).toBe(parseResetRequest)
    expect(REQUEST_PARSERS.defaults).toBe(parseDefaultsRequest)
    expect(REQUEST_PARSERS.workspace).toBe(parseWorkspaceRequest)
  })

  it('每个 parser 都拒绝明显不合契约的输入', () => {
    for (const endpoint of ENDPOINTS) {
      expect(REQUEST_PARSERS[endpoint]('not-a-request').ok).toBe(false)
      expect(REQUEST_PARSERS[endpoint](null).ok).toBe(false)
      expect(REQUEST_PARSERS[endpoint]([]).ok).toBe(false)
    }
  })
})

/* ────────────────────────────── 请求 parser ────────────────────────────── */

describe('parsePanelRequest：strict 请求形状', () => {
  it('合法请求原样通过', () => {
    expect(parsePanelRequest({ sessionId: 'session-1' })).toStrictEqual({
      ok: true,
      value: { sessionId: 'session-1' },
    })
  })

  it('会话 id 取到长度上限（255）仍通过', () => {
    const sessionId = 's'.repeat(SESSION_ID_MAX_LENGTH)
    expect(parsePanelRequest({ sessionId })).toStrictEqual({ ok: true, value: { sessionId } })
  })

  runRejected(parsePanelRequest, [
    { name: '请求体是数组', raw: [] },
    { name: '请求体是 null', raw: null },
    { name: '请求体是字符串', raw: 'session-1' },
    { name: '缺 sessionId', raw: {} },
    { name: 'sessionId 为空串', raw: { sessionId: '' }, fragment: /为空/ },
    {
      name: 'sessionId 超长（256）',
      raw: { sessionId: 's'.repeat(SESSION_ID_MAX_LENGTH + 1) },
      fragment: /超过 255 字符/,
    },
    { name: 'sessionId 不是字符串', raw: { sessionId: 1 }, fragment: /不是字符串/ },
    { name: '未知字段 extra', raw: { sessionId: 's-1', extra: true }, fragment: /未知字段：extra/ },
    { name: '近似但大小写不同的字段', raw: { sessionId: 's-1', sessionID: 's-1' }, fragment: /sessionID/ },
  ])
})

describe('parseResetRequest：与 panel 同形', () => {
  it('合法请求原样通过', () => {
    expect(parseResetRequest({ sessionId: 'session-1' })).toStrictEqual({
      ok: true,
      value: { sessionId: 'session-1' },
    })
  })

  runRejected(parseResetRequest, [
    { name: '请求体是数组', raw: [] },
    { name: '缺 sessionId', raw: {} },
    { name: 'reset 不接受 on 字段', raw: { sessionId: 's-1', on: true }, fragment: /未知字段：on/ },
    { name: 'reset 不接受空 addresses', raw: { sessionId: 's-1', addresses: [] }, fragment: /未知字段/ },
  ])
})

describe('parseToggleRequest：批量开/关', () => {
  it('合法请求原样通过（含 on=false）', () => {
    expect(parseToggleRequest({ sessionId: 's-1', on: false, addresses: ['mcp:a'] })).toStrictEqual({
      ok: true,
      value: { sessionId: 's-1', on: false, addresses: ['mcp:a'] },
    })
  })

  it('条数取到上限（64）通过，且不截断', () => {
    const addresses = addressList(MAX_ADDRESSES)
    const result = parseToggleRequest({ sessionId: 's-1', on: true, addresses })
    expect(result).toStrictEqual({ ok: true, value: { sessionId: 's-1', on: true, addresses } })
  })

  it('单条地址取到上限（200 字符）通过', () => {
    const address = 'x'.repeat(ADDRESS_MAX_LENGTH)
    const result = parseToggleRequest({ sessionId: 's-1', on: true, addresses: [address] })
    expect(result.ok).toBe(true)
  })

  runRejected(parseToggleRequest, [
    { name: '请求体是数组', raw: [] },
    { name: '缺 sessionId', raw: { on: true, addresses: ['mcp:a'] } },
    { name: '缺 on', raw: { sessionId: 's-1', addresses: ['mcp:a'] }, fragment: /\.on 不是布尔值/ },
    { name: 'on 不是布尔值', raw: { sessionId: 's-1', on: 'true', addresses: ['mcp:a'] } },
    { name: '缺 addresses', raw: { sessionId: 's-1', on: true }, fragment: /\.addresses 不是数组/ },
    { name: 'addresses 不是数组', raw: { sessionId: 's-1', on: true, addresses: 'mcp:a' } },
    {
      name: 'addresses 为空数组',
      raw: { sessionId: 's-1', on: true, addresses: [] },
      fragment: /至少需要 1 项/,
    },
    {
      name: '地址数量越界（65 > 64）',
      raw: { sessionId: 's-1', on: true, addresses: addressList(MAX_ADDRESSES + 1) },
      fragment: /超过上限 64 项/,
    },
    {
      name: '地址为空串',
      raw: { sessionId: 's-1', on: true, addresses: ['mcp:a', ''] },
      fragment: /addresses\[1\] 为空/,
    },
    {
      name: '地址超长（201 > 200）',
      raw: { sessionId: 's-1', on: true, addresses: ['x'.repeat(ADDRESS_MAX_LENGTH + 1)] },
      fragment: /超过 200 字符/,
    },
    {
      name: '地址不是字符串',
      raw: { sessionId: 's-1', on: true, addresses: [1] },
      fragment: /addresses\[0\] 不是字符串/,
    },
    {
      name: '未知字段 op',
      raw: { sessionId: 's-1', on: true, addresses: ['mcp:a'], op: 'off' },
      fragment: /未知字段：op/,
    },
  ])
})

describe('parseDefaultsRequest：action ↔ addresses 约束', () => {
  runAccepted(parseDefaultsRequest, [
    { name: 'reset 不带 addresses', raw: { action: 'reset' } },
    { name: 'reset 的 addresses 显式为 undefined（等价于缺省）', raw: { action: 'reset', addresses: undefined } },
    { name: 'set 带一条地址', raw: { action: 'set', addresses: ['mcp:a'] } },
    { name: 'off 带一条地址', raw: { action: 'off', addresses: ['tool:bash'] } },
    { name: 'on 带一条地址', raw: { action: 'on', addresses: ['mcp:a::x'] } },
    { name: 'set 取到条数上限（64）', raw: { action: 'set', addresses: addressList(MAX_ADDRESSES) } },
  ])

  it('合法请求保留动作语义', () => {
    expect(parseDefaultsRequest({ action: 'off', addresses: ['mcp:a'] })).toStrictEqual({
      ok: true,
      value: { action: 'off', addresses: ['mcp:a'] },
    })
    expect(parseDefaultsRequest({ action: 'reset' })).toStrictEqual({ ok: true, value: { action: 'reset' } })
  })

  runRejected(parseDefaultsRequest, [
    { name: '请求体是数组', raw: [] },
    { name: '请求体是 null', raw: null },
    { name: '缺 action', raw: { addresses: ['mcp:a'] }, fragment: /不是已知取值/ },
    { name: '未知 action', raw: { action: 'remove', addresses: ['mcp:a'] }, fragment: /不是已知取值/ },
    { name: 'action 不是字符串', raw: { action: 1, addresses: ['mcp:a'] } },
    {
      name: 'reset 带非空 addresses',
      raw: { action: 'reset', addresses: ['mcp:a'] },
      fragment: /在 action=reset 时不允许出现/,
    },
    {
      name: 'reset 带空 addresses（出现即越界）',
      raw: { action: 'reset', addresses: [] },
      fragment: /在 action=reset 时不允许出现/,
    },
    { name: 'set 缺 addresses', raw: { action: 'set' }, fragment: /在 action=set 时必需/ },
    { name: 'off 缺 addresses', raw: { action: 'off' }, fragment: /在 action=off 时必需/ },
    { name: 'on 缺 addresses', raw: { action: 'on' }, fragment: /在 action=on 时必需/ },
    { name: 'set 带空数组', raw: { action: 'set', addresses: [] }, fragment: /至少需要 1 项/ },
    {
      name: 'set 地址数量越界（65 > 64）',
      raw: { action: 'set', addresses: addressList(MAX_ADDRESSES + 1) },
      fragment: /超过上限 64 项/,
    },
    {
      name: 'set 地址超长（201 > 200）',
      raw: { action: 'set', addresses: ['x'.repeat(ADDRESS_MAX_LENGTH + 1)] },
      fragment: /超过 200 字符/,
    },
    { name: '地址不是字符串', raw: { action: 'set', addresses: [null] }, fragment: /不是字符串/ },
    {
      name: '未知字段 sessionId（defaults 不针对会话）',
      raw: { action: 'set', addresses: ['mcp:a'], sessionId: 's-1' },
      fragment: /未知字段：sessionId/,
    },
    { name: '未知字段 mode', raw: { action: 'set', addresses: ['mcp:a'], mode: 'merge' }, fragment: /未知字段/ },
  ])
})

describe('parseWorkspaceRequest：两种寻址形态 + action ↔ addresses 约束', () => {
  it('{workspacePath} 缺省 action 归一为显式 read', () => {
    expect(parseWorkspaceRequest({ workspacePath: '/w' })).toStrictEqual({
      ok: true,
      value: { workspacePath: '/w', action: 'read' },
    })
  })

  it('{sessionId} 显式 read 原样通过', () => {
    expect(parseWorkspaceRequest({ sessionId: 's-1', action: 'read' })).toStrictEqual({
      ok: true,
      value: { sessionId: 's-1', action: 'read' },
    })
  })

  it('set 带地址保留寻址形态与动作语义', () => {
    expect(parseWorkspaceRequest({ sessionId: 's-1', action: 'set', addresses: ['skill:x'] })).toStrictEqual({
      ok: true,
      value: { sessionId: 's-1', action: 'set', addresses: ['skill:x'] },
    })
  })

  it('sessionId 取到长度上限（255）仍通过', () => {
    const sessionId = 's'.repeat(SESSION_ID_MAX_LENGTH)
    expect(parseWorkspaceRequest({ sessionId })).toStrictEqual({
      ok: true,
      value: { sessionId, action: 'read' },
    })
  })

  it('workspacePath 取到长度上限（4096）仍通过', () => {
    const workspacePath = `/${'w'.repeat(MAX_WORKSPACE_PATH_LENGTH - 1)}`
    expect(parseWorkspaceRequest({ workspacePath })).toStrictEqual({
      ok: true,
      value: { workspacePath, action: 'read' },
    })
  })

  runAccepted(parseWorkspaceRequest, [
    { name: '按会话 read（缺省 action）', raw: { sessionId: 's-1' } },
    { name: '按工作区路径 read（缺省 action）', raw: { workspacePath: '/w' } },
    { name: 'workspacePath 为根 /', raw: { workspacePath: '/' } },
    { name: 'off 带一条地址（按会话）', raw: { sessionId: 's-1', action: 'off', addresses: ['mcp:a'] } },
    { name: 'on 带一条地址（按路径）', raw: { workspacePath: '/w', action: 'on', addresses: ['skill:x'] } },
    { name: 'reset 不带 addresses', raw: { sessionId: 's-1', action: 'reset' } },
    { name: 'set 取到条数上限（64）', raw: { sessionId: 's-1', action: 'set', addresses: addressList(MAX_ADDRESSES) } },
    { name: 'set 单条地址取到上限（200 字符）', raw: { sessionId: 's-1', action: 'set', addresses: ['x'.repeat(ADDRESS_MAX_LENGTH)] } },
  ])

  runRejected(parseWorkspaceRequest, [
    { name: '请求体是数组', raw: [] },
    { name: '请求体是 null', raw: null },
    { name: '请求体是字符串', raw: 'workspace' },
    {
      name: '两种寻址字段同时出现',
      raw: { sessionId: 's', workspacePath: '/w' },
      fragment: /必须且只能出现 sessionId 或 workspacePath 之一/,
    },
    {
      name: '两种寻址字段都缺',
      raw: { action: 'read' },
      fragment: /必须且只能出现 sessionId 或 workspacePath 之一/,
    },
    { name: 'sessionId 为空串', raw: { sessionId: '' }, fragment: /为空/ },
    {
      name: 'sessionId 超长（256）',
      raw: { sessionId: 's'.repeat(SESSION_ID_MAX_LENGTH + 1) },
      fragment: /超过 255 字符/,
    },
    { name: 'sessionId 不是字符串', raw: { sessionId: 1 }, fragment: /不是字符串/ },
    { name: 'workspacePath 为空串', raw: { workspacePath: '' }, fragment: /为空/ },
    {
      name: 'workspacePath 不是绝对路径（不以 / 开头）',
      raw: { workspacePath: 'relative/w' },
      fragment: /必须以 \/ 开头/,
    },
    {
      name: 'workspacePath 超长（4097）',
      raw: { workspacePath: `/${'w'.repeat(MAX_WORKSPACE_PATH_LENGTH)}` },
      fragment: /超过 4096 字符/,
    },
    { name: 'workspacePath 不是字符串', raw: { workspacePath: 1 }, fragment: /不是字符串/ },
    { name: '未知 action', raw: { sessionId: 's', action: 'remove' }, fragment: /不是已知取值/ },
    { name: 'action 不是字符串', raw: { sessionId: 's', action: 1 }, fragment: /不是已知取值/ },
    { name: 'set 缺 addresses', raw: { sessionId: 's', action: 'set' }, fragment: /在 action=set 时必需/ },
    { name: 'off 缺 addresses', raw: { workspacePath: '/w', action: 'off' }, fragment: /在 action=off 时必需/ },
    { name: 'on 缺 addresses', raw: { sessionId: 's', action: 'on' }, fragment: /在 action=on 时必需/ },
    {
      name: 'read 带 addresses',
      raw: { sessionId: 's', action: 'read', addresses: ['a'] },
      fragment: /在 action=read 时不允许出现/,
    },
    {
      name: '缺省 read 带 addresses（出现即越界）',
      raw: { sessionId: 's', addresses: ['a'] },
      fragment: /在 action=read 时不允许出现/,
    },
    {
      name: 'reset 带 addresses',
      raw: { sessionId: 's', action: 'reset', addresses: ['a'] },
      fragment: /在 action=reset 时不允许出现/,
    },
    {
      name: 'set 带空数组',
      raw: { sessionId: 's', action: 'set', addresses: [] },
      fragment: /至少需要 1 项/,
    },
    {
      name: 'set 地址数量越界（65 > 64）',
      raw: { sessionId: 's', action: 'set', addresses: addressList(MAX_ADDRESSES + 1) },
      fragment: /超过上限 64 项/,
    },
    {
      name: 'set 地址为空串',
      raw: { sessionId: 's', action: 'set', addresses: [''] },
      fragment: /为空/,
    },
    {
      name: 'set 地址超长（201 > 200）',
      raw: { sessionId: 's', action: 'set', addresses: ['x'.repeat(ADDRESS_MAX_LENGTH + 1)] },
      fragment: /超过 200 字符/,
    },
    {
      name: 'set 地址不是字符串',
      raw: { sessionId: 's', action: 'set', addresses: [1] },
      fragment: /不是字符串/,
    },
    {
      name: '未知字段 extra',
      raw: { sessionId: 's', extra: true },
      fragment: /未知字段：extra/,
    },
  ])
})

/* ────────────────────────────── 响应 parser ────────────────────────────── */

describe('parsePanelSnapshot：合法快照', () => {
  it('完整快照原样通过（不新增键、不丢键）', () => {
    expect(parsePanelSnapshot(plain(SNAPSHOT))).toStrictEqual({ ok: true, value: SNAPSHOT })
  })

  it('统计只有 visible / denied 两个计数（会话级目录口径）', () => {
    const result = parsePanelSnapshot(plain(SNAPSHOT))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.stats).toStrictEqual({ visible: 12, denied: 2 })
  })

  it('顶层键集合恰为契约字段（已删字段不再回潮）', () => {
    const result = parsePanelSnapshot(plain(SNAPSHOT))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Object.keys(result.value).sort()).toEqual([
      'createdAt',
      'defaults',
      'groups',
      'intentOnly',
      'notices',
      'protectedNames',
      'sessionId',
      'skills',
      'state',
      'stats',
      'workspace',
    ])
  })

  it('工具条目恰有七个键（旧可见性字段不再回潮）', () => {
    const result = parsePanelSnapshot(plain(SNAPSHOT))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Object.keys(result.value.groups[0].tools[0]).sort()).toEqual([
      'address',
      'description',
      'disabled',
      'name',
      'protected',
      'reserved',
      'shortName',
    ])
  })

  it('无描述的条目不带 description 键（可选字段不被伪造）', () => {
    const result = parsePanelSnapshot(plain(SNAPSHOT))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect('description' in result.value.groups[0].tools[0]).toBe(true)
    expect('description' in result.value.groups[0].tools[1]).toBe(false)
  })

  it('描述取到截断上限（160）通过', () => {
    const description = 'd'.repeat(DESCRIPTION_MAX_LENGTH)
    const result = parsePanelSnapshot(setAt(SNAPSHOT, 'groups.0.tools.1.description', description))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.groups[0].tools[1].description).toBe(description)
  })

  it('空分组 / 空关闭集 / 无提示也是合法快照', () => {
    const empty = setAt(setAt(setAt(SNAPSHOT, 'groups', []), 'state.disabled', []), 'notices', [])
    const result = parsePanelSnapshot(empty)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.groups).toEqual([])
    expect(result.value.state.disabled).toEqual([])
    expect(result.value.notices).toEqual([])
  })

  it('workspace 为 null（cwd 无法归属 / 无 registry）与空 skills 合法', () => {
    const empty = setAt(setAt(SNAPSHOT, 'workspace', null), 'skills', [])
    const result = parsePanelSnapshot(empty)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.workspace).toBeNull()
    expect(result.value.skills).toEqual([])
  })

  it('技能行的空描述合法（已关且无缓存）', () => {
    const result = parsePanelSnapshot(SNAPSHOT)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.skills[1]).toStrictEqual({
      name: 'skill-creator',
      description: '',
      disabled: false,
      shadowed: false,
    })
  })

  it('解析不修改输入、也不复用输入的数组（两端都不共享运行时身份）', () => {
    const raw = plain(SNAPSHOT) as PanelSnapshot
    const first = parsePanelSnapshot(raw)
    const second = parsePanelSnapshot(raw)
    expect(raw).toStrictEqual(SNAPSHOT)
    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    if (!first.ok || !second.ok) return
    expect(first.value).toStrictEqual(second.value)
    expect(first.value).not.toBe(second.value)
    expect(first.value.state.disabled).not.toBe(raw.state.disabled)
  })
})

describe('parsePanelSnapshot：strict 拒绝', () => {
  runRejected(parsePanelSnapshot, [
    { name: '快照是数组', raw: [] },
    { name: '快照是 null', raw: null },
    { name: '缺 sessionId', raw: dropAt(SNAPSHOT, 'sessionId'), fragment: /sessionId 不是字符串/ },
    { name: 'sessionId 为空串', raw: setAt(SNAPSHOT, 'sessionId', ''), fragment: /为空/ },
    { name: 'sessionId 不是字符串', raw: setAt(SNAPSHOT, 'sessionId', 42) },
    { name: 'createdAt 为负', raw: setAt(SNAPSHOT, 'createdAt', -1), fragment: /非负安全整数/ },
    { name: 'createdAt 非整数', raw: setAt(SNAPSHOT, 'createdAt', 1.5) },
    { name: '缺 state', raw: dropAt(SNAPSHOT, 'state'), fragment: /state 不是对象/ },
    { name: 'state 不是对象', raw: setAt(SNAPSHOT, 'state', 'state') },
    { name: 'storeKind 未知', raw: setAt(SNAPSHOT, 'state.storeKind', 'disk'), fragment: /不是已知取值/ },
    { name: 'updatedAt 为负', raw: setAt(SNAPSHOT, 'state.updatedAt', -1) },
    { name: 'seeded 不是布尔值', raw: setAt(SNAPSHOT, 'state.seeded', 'yes') },
    { name: '缺 state.snapshot', raw: dropAt(SNAPSHOT, 'state.snapshot') },
    { name: 'state.disabled 含非字符串', raw: setAt(SNAPSHOT, 'state.disabled', ['mcp:a', 1]) },
    { name: 'state 带未知字段', raw: setAt(SNAPSHOT, 'state.version', 1), fragment: /未知字段：version/ },
    { name: 'groups 不是数组', raw: setAt(SNAPSHOT, 'groups', 'mcp') },
    { name: '分组不是对象', raw: setAt(SNAPSHOT, 'groups.0', 'mcp') },
    { name: '分组 kind 未知', raw: setAt(SNAPSHOT, 'groups.0.kind', 'user'), fragment: /不是已知取值/ },
    { name: '分组 key 为空串', raw: setAt(SNAPSHOT, 'groups.0.key', '') },
    { name: '缺分组 address（builtin 组必须显式 null）', raw: dropAt(SNAPSHOT, 'groups.2.address') },
    { name: '分组 toolCount 为负', raw: setAt(SNAPSHOT, 'groups.0.toolCount', -1) },
    { name: '分组 disabledCount 非整数', raw: setAt(SNAPSHOT, 'groups.0.disabledCount', 1.5) },
    { name: '分组 disabled 不是布尔值', raw: setAt(SNAPSHOT, 'groups.0.disabled', 1) },
    { name: '分组带未知字段', raw: setAt(SNAPSHOT, 'groups.0.title', 'MCP'), fragment: /未知字段：title/ },
    { name: 'tools 不是数组', raw: setAt(SNAPSHOT, 'groups.0.tools', {}) },
    { name: '工具条目不是对象', raw: setAt(SNAPSHOT, 'groups.0.tools.0', 'get_current_user') },
    { name: '工具条目缺 shortName', raw: dropAt(SNAPSHOT, 'groups.0.tools.0.shortName') },
    { name: '工具条目 name 为空串', raw: setAt(SNAPSHOT, 'groups.0.tools.0.name', '') },
    { name: '工具条目 address 为空串', raw: setAt(SNAPSHOT, 'groups.0.tools.0.address', '') },
    { name: '工具条目 protected 不是布尔值', raw: setAt(SNAPSHOT, 'groups.0.tools.0.protected', 'no') },
    {
      name: '描述超长（161 > 160）',
      raw: setAt(SNAPSHOT, 'groups.0.tools.1.description', 'd'.repeat(DESCRIPTION_MAX_LENGTH + 1)),
      fragment: /超过 160 字符/,
    },
    { name: '描述不是字符串', raw: setAt(SNAPSHOT, 'groups.0.tools.1.description', 1) },
    {
      name: '工具条目带未知字段',
      raw: setAt(SNAPSHOT, 'groups.0.tools.0.displayName', '取当前用户'),
      fragment: /未知字段：displayName/,
    },
    { name: 'protectedNames 不是数组', raw: setAt(SNAPSHOT, 'protectedNames', 'bash') },
    { name: 'protectedNames 含非字符串', raw: setAt(SNAPSHOT, 'protectedNames', [1]) },
    { name: '缺 defaults', raw: dropAt(SNAPSHOT, 'defaults') },
    { name: 'defaults.version 不是 1', raw: setAt(SNAPSHOT, 'defaults.version', 2), fragment: /不是 1/ },
    { name: 'defaults.path 为空串', raw: setAt(SNAPSHOT, 'defaults.path', '') },
    { name: 'defaults.corrupt 不是布尔值', raw: setAt(SNAPSHOT, 'defaults.corrupt', 'no') },
    { name: 'defaults 带未知字段', raw: setAt(SNAPSHOT, 'defaults.mtime', 1), fragment: /未知字段：mtime/ },
    { name: 'intentOnly 不是数组', raw: setAt(SNAPSHOT, 'intentOnly', 'mcp:gone') },
    { name: 'stats 缺 denied（必填计数）', raw: dropAt(SNAPSHOT, 'stats.denied'), fragment: /denied/ },
    { name: 'stats.denied 为负', raw: setAt(SNAPSHOT, 'stats.denied', -1) },
    { name: 'stats 带未知字段', raw: setAt(SNAPSHOT, 'stats.total', 214), fragment: /未知字段：total/ },
    { name: 'notices 含未知码', raw: setAt(SNAPSHOT, 'notices', ['unknown']), fragment: /不是已知取值/ },
    { name: 'notices 不是数组', raw: setAt(SNAPSHOT, 'notices', 'persistence-degraded') },
    { name: '缺 skills（新增字段不可缺省）', raw: dropAt(SNAPSHOT, 'skills'), fragment: /skills 不是数组/ },
    { name: 'skills 不是数组', raw: setAt(SNAPSHOT, 'skills', {}) },
    { name: '技能行不是对象', raw: setAt(SNAPSHOT, 'skills.0', 'openspec-propose') },
    { name: '技能行 name 为空串', raw: setAt(SNAPSHOT, 'skills.0.name', ''), fragment: /为空/ },
    { name: '技能行缺 description', raw: dropAt(SNAPSHOT, 'skills.0.description'), fragment: /不是字符串/ },
    {
      name: '技能行描述超长（161 > 160）',
      raw: setAt(SNAPSHOT, 'skills.0.description', 'd'.repeat(DESCRIPTION_MAX_LENGTH + 1)),
      fragment: /超过 160 字符/,
    },
    { name: '技能行 disabled 不是布尔值', raw: setAt(SNAPSHOT, 'skills.0.disabled', 'yes') },
    { name: '技能行带未知字段', raw: setAt(SNAPSHOT, 'skills.0.provider', 'x'), fragment: /未知字段：provider/ },
    { name: '缺 workspace（新增字段不可缺省）', raw: dropAt(SNAPSHOT, 'workspace'), fragment: /不是对象/ },
    { name: 'workspace 不是对象', raw: setAt(SNAPSHOT, 'workspace', '/w') },
    { name: 'workspace.key 为空串', raw: setAt(SNAPSHOT, 'workspace.key', '') },
    { name: 'workspace.registered 不是布尔值', raw: setAt(SNAPSHOT, 'workspace.registered', 'yes') },
    { name: 'workspace.disabled 含非字符串', raw: setAt(SNAPSHOT, 'workspace.disabled', ['mcp:a', 1]) },
    { name: 'workspace.path 为空串', raw: setAt(SNAPSHOT, 'workspace.path', '') },
    { name: 'workspace.title 不是字符串', raw: setAt(SNAPSHOT, 'workspace.title', 1) },
    { name: 'workspace 带未知字段', raw: setAt(SNAPSHOT, 'workspace.size', 1), fragment: /未知字段：size/ },
    { name: '未知快照键 groupsX', raw: setAt(SNAPSHOT, 'groupsX', []), fragment: /未知字段：groupsX/ },
    { name: '顶层未知字段 extra', raw: setAt(SNAPSHOT, 'extra', true), fragment: /未知字段：extra/ },
  ])
})

describe('parsePanelSnapshot：旧形状出现即拒绝', () => {
  runRejected(parsePanelSnapshot, [
    { name: 'stats.catalog（旧四计数）', raw: setAt(SNAPSHOT, 'stats.catalog', 9), fragment: /catalog/ },
    {
      name: '工具条目的旧可见性字段',
      raw: setAt(SNAPSHOT, 'groups.0.tools.0.shadowed', false),
      fragment: /shadowed/,
    },
    {
      name: 'hiddenByOthers（旧顶层字段）',
      raw: setAt(SNAPSHOT, 'hiddenByOthers', []),
      fragment: /hiddenByOthers/,
    },
  ])
})

describe('parseToggleValue / parseResetValue：新快照 + 变更回执', () => {
  it('合法成功值原样通过', () => {
    expect(parseToggleValue(plain(TOGGLE_VALUE))).toStrictEqual({ ok: true, value: TOGGLE_VALUE })
  })

  it('reset 与 toggle 共享同一形状（D20）', () => {
    expect(parseResetValue(plain(TOGGLE_VALUE))).toStrictEqual({ ok: true, value: TOGGLE_VALUE })
  })

  it('无变化的 reset 合法：applied 为空、hiddenTools 为 0', () => {
    const noop = setAt(setAt(TOGGLE_VALUE, 'mutation.applied', []), 'mutation.hiddenTools', 0)
    const result = parseResetValue(noop)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.mutation.applied).toEqual([])
  })

  it('hiddenTools 允许为负（开启方向的撤销量）', () => {
    const result = parseToggleValue(setAt(TOGGLE_VALUE, 'mutation.hiddenTools', -70))
    expect(result.ok).toBe(true)
  })

  it('hiddenSkills 允许为负（影子 stub 撤销量）', () => {
    const result = parseToggleValue(setAt(TOGGLE_VALUE, 'mutation.hiddenSkills', -2))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.mutation.hiddenSkills).toBe(-2)
  })

  runRejected(parseToggleValue, [
    {
      name: '缺 snapshot',
      raw: dropAt(TOGGLE_VALUE, 'snapshot'),
      fragment: /snapshot 不是对象/,
    },
    { name: '缺 mutation', raw: dropAt(TOGGLE_VALUE, 'mutation'), fragment: /mutation 不是对象/ },
    { name: 'snapshot 为 null', raw: setAt(TOGGLE_VALUE, 'snapshot', null) },
    {
      name: '嵌套快照不合契约（sessionId 为空）',
      raw: setAt(TOGGLE_VALUE, 'snapshot.sessionId', ''),
      fragment: /snapshot\.sessionId/,
    },
    { name: 'mutation 缺 kvRebuild', raw: dropAt(TOGGLE_VALUE, 'mutation.kvRebuild') },
    { name: 'mutation.kvRebuild 不是布尔值', raw: setAt(TOGGLE_VALUE, 'mutation.kvRebuild', 'yes') },
    { name: 'mutation.applied 不是数组', raw: setAt(TOGGLE_VALUE, 'mutation.applied', {}) },
    { name: '回执条目缺 matched', raw: dropAt(TOGGLE_VALUE, 'mutation.applied.0.matched') },
    {
      name: '回执条目带未知字段',
      raw: setAt(TOGGLE_VALUE, 'mutation.applied.0.matchedNames', ['mcp__a__x']),
      fragment: /未知字段：matchedNames/,
    },
    { name: '回执条目的 address 为空串', raw: setAt(TOGGLE_VALUE, 'mutation.applied.0.address', '') },
    { name: '回执条目的 on 不是布尔值', raw: setAt(TOGGLE_VALUE, 'mutation.applied.0.on', 1) },
    { name: 'mutation.hiddenTools 非整数', raw: setAt(TOGGLE_VALUE, 'mutation.hiddenTools', 1.5) },
    { name: 'mutation 缺 hiddenSkills', raw: dropAt(TOGGLE_VALUE, 'mutation.hiddenSkills'), fragment: /hiddenSkills/ },
    { name: 'mutation.hiddenSkills 非整数', raw: setAt(TOGGLE_VALUE, 'mutation.hiddenSkills', 1.5), fragment: /hiddenSkills/ },
    { name: 'mutation.visibleBefore 为负', raw: setAt(TOGGLE_VALUE, 'mutation.visibleBefore', -1) },
    { name: 'mutation.notices 含未知码', raw: setAt(TOGGLE_VALUE, 'mutation.notices', ['nope']) },
    { name: '顶层未知字段 extra', raw: setAt(TOGGLE_VALUE, 'sessionId', 's-1'), fragment: /未知字段：sessionId/ },
    { name: '把 defaults 成功值当 toggle 解码', raw: plain(DEFAULTS_VALUE) },
  ])
})

describe('parseDefaultsValue：默认档视图', () => {
  it('合法成功值原样通过（不含会话快照）', () => {
    expect(parseDefaultsValue(plain(DEFAULTS_VALUE))).toStrictEqual({ ok: true, value: DEFAULTS_VALUE })
  })

  it('changed 为空数组合法（幂等写入没改变任何项）', () => {
    const result = parseDefaultsValue(setAt(DEFAULTS_VALUE, 'changed', []))
    expect(result.ok).toBe(true)
  })

  runRejected(parseDefaultsValue, [
    { name: '成功值是数组', raw: [] },
    { name: '缺 changed', raw: dropAt(DEFAULTS_VALUE, 'changed'), fragment: /changed 不是数组/ },
    { name: 'changed 不是数组', raw: setAt(DEFAULTS_VALUE, 'changed', 'mcp:b') },
    { name: 'changed 含空串', raw: setAt(DEFAULTS_VALUE, 'changed', ['']), fragment: /为空/ },
    { name: 'changed 含非字符串', raw: setAt(DEFAULTS_VALUE, 'changed', [1]) },
    { name: '缺 defaults', raw: dropAt(DEFAULTS_VALUE, 'defaults'), fragment: /defaults 不是对象/ },
    { name: '缺 defaults.corrupt', raw: dropAt(DEFAULTS_VALUE, 'defaults.corrupt') },
    { name: 'defaults.version 不是 1', raw: setAt(DEFAULTS_VALUE, 'defaults.version', 2) },
    { name: 'defaults 带未知字段', raw: setAt(DEFAULTS_VALUE, 'defaults.size', 2), fragment: /未知字段/ },
    { name: '顶层未知字段 snapshot', raw: setAt(DEFAULTS_VALUE, 'snapshot', plain(SNAPSHOT)) },
    { name: '把 toggle 成功值当 defaults 解码', raw: plain(TOGGLE_VALUE) },
  ])
})

describe('parseWorkspaceValue：工作区档视图', () => {
  it('合法成功值原样通过（不新增键、不丢键）', () => {
    expect(parseWorkspaceValue(plain(WORKSPACE_VALUE))).toStrictEqual({ ok: true, value: WORKSPACE_VALUE })
  })

  it('workspace 为 null 合法（cwd 无法归属 / 无 registry）', () => {
    const result = parseWorkspaceValue(setAt(WORKSPACE_VALUE, 'workspace', null))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.workspace).toBeNull()
  })

  it('choices / changed 为空数组合法（无已登记工作区 / 只读）', () => {
    const result = parseWorkspaceValue(setAt(setAt(WORKSPACE_VALUE, 'choices', []), 'changed', []))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.choices).toEqual([])
    expect(result.value.changed).toEqual([])
  })

  it('无 title 的工作区视图合法（未登记时缺省）', () => {
    const result = parseWorkspaceValue(dropAt(WORKSPACE_VALUE, 'workspace.title'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.workspace === null ? undefined : 'title' in result.value.workspace).toBe(false)
  })

  it('universe 带会话视角的三组（mcp → skill → builtin）与行地址', () => {
    // G7 出口断言：合法样本必须读出宇宙，且组序与行地址原样保留。
    const parsed = parseWorkspaceValue(plain(WORKSPACE_VALUE))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.universe?.groups.map((group) => group.kind)).toEqual(['mcp', 'skill', 'builtin'])
    expect(parsed.value.universe?.groups[0].tools[0].address).toBe('mcp:yunxiao::get_current_user')
    expect(parsed.value.universe?.groups[2].address).toBeNull()
  })

  it('universe 为 null 合法（{workspacePath} 寻址没有会话视角）', () => {
    const result = parseWorkspaceValue(setAt(WORKSPACE_VALUE, 'universe', null))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.universe).toBeNull()
  })

  it('universe 层未就绪是合法读数（layerReady:false 而非 null）', () => {
    const notReady = setAt(setAt(WORKSPACE_VALUE, 'universe.layerReady', false), 'universe.skillsAvailable', false)
    const result = parseWorkspaceValue(setAt(notReady, 'universe.groups', []))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.universe).toStrictEqual({ layerReady: false, skillsAvailable: false, groups: [] })
  })

  runRejected(parseWorkspaceValue, [
    { name: '成功值是数组', raw: [] },
    { name: '成功值是 null', raw: null },
    { name: '缺 workspace', raw: dropAt(WORKSPACE_VALUE, 'workspace'), fragment: /不是对象/ },
    { name: '缺 choices', raw: dropAt(WORKSPACE_VALUE, 'choices'), fragment: /choices 不是数组/ },
    { name: '缺 changed', raw: dropAt(WORKSPACE_VALUE, 'changed'), fragment: /changed 不是数组/ },
    {
      name: '缺 universe（新增字段不可缺省，null 也必须显式给出）',
      raw: dropAt(WORKSPACE_VALUE, 'universe'),
      fragment: /universe 不是对象/,
    },
    { name: 'universe 不是对象（字符串）', raw: setAt(WORKSPACE_VALUE, 'universe', 'universe') },
    { name: 'universe 不是对象（数组）', raw: setAt(WORKSPACE_VALUE, 'universe', []) },
    {
      name: 'universe 缺 layerReady',
      raw: dropAt(WORKSPACE_VALUE, 'universe.layerReady'),
      fragment: /layerReady 不是布尔值/,
    },
    {
      name: 'universe 带未知字段',
      raw: setAt(WORKSPACE_VALUE, 'universe.version', 1),
      fragment: /未知字段：version/,
    },
    {
      name: 'universe.skillsAvailable 不是布尔值',
      raw: setAt(WORKSPACE_VALUE, 'universe.skillsAvailable', 'yes'),
    },
    { name: 'universe.groups 不是数组', raw: setAt(WORKSPACE_VALUE, 'universe.groups', {}) },
    { name: 'universe 分组不是对象', raw: setAt(WORKSPACE_VALUE, 'universe.groups.0', 'mcp') },
    {
      name: 'universe.groups[].kind 非枚举（server）',
      raw: setAt(WORKSPACE_VALUE, 'universe.groups.0.kind', 'server'),
      fragment: /不是已知取值/,
    },
    {
      name: 'universe 分组 key 为空串',
      raw: setAt(WORKSPACE_VALUE, 'universe.groups.0.key', ''),
      fragment: /为空/,
    },
    {
      name: 'universe 分组缺 address（builtin 组必须显式 null）',
      raw: dropAt(WORKSPACE_VALUE, 'universe.groups.2.address'),
      fragment: /不是字符串或 null/,
    },
    { name: 'universe 分组地址不是字符串或 null', raw: setAt(WORKSPACE_VALUE, 'universe.groups.0.address', 1) },
    {
      name: 'universe 分组带未知字段',
      raw: setAt(WORKSPACE_VALUE, 'universe.groups.0.toolCount', 1),
      fragment: /未知字段：toolCount/,
    },
    { name: 'universe 组内 tools 不是数组', raw: setAt(WORKSPACE_VALUE, 'universe.groups.0.tools', {}) },
    { name: 'universe 条目不是对象', raw: setAt(WORKSPACE_VALUE, 'universe.groups.0.tools.0', 'get_current_user') },
    {
      name: '组内 tools[].address 为空串',
      raw: setAt(WORKSPACE_VALUE, 'universe.groups.0.tools.0.address', ''),
      fragment: /为空/,
    },
    {
      name: 'universe 条目 shortName 为空串',
      raw: setAt(WORKSPACE_VALUE, 'universe.groups.0.tools.0.shortName', ''),
      fragment: /为空/,
    },
    {
      name: 'universe 条目 protected 不是布尔值',
      raw: setAt(WORKSPACE_VALUE, 'universe.groups.0.tools.0.protected', 'no'),
    },
    {
      name: 'universe 条目带未知字段（entry 多键）',
      raw: setAt(WORKSPACE_VALUE, 'universe.groups.0.tools.0.extra', 1),
      fragment: /未知字段：extra/,
    },
    {
      name: 'universe 条目描述超长（161 > 160）',
      raw: setAt(
        WORKSPACE_VALUE,
        'universe.groups.0.tools.0.description',
        'd'.repeat(DESCRIPTION_MAX_LENGTH + 1),
      ),
      fragment: /超过 160 字符/,
    },
    { name: 'choices 不是数组', raw: setAt(WORKSPACE_VALUE, 'choices', {}) },
    { name: '下拉项不是对象', raw: setAt(WORKSPACE_VALUE, 'choices.0', '/w') },
    { name: '下拉项缺 title', raw: dropAt(WORKSPACE_VALUE, 'choices.0.title') },
    { name: '下拉项 key 为空串', raw: setAt(WORKSPACE_VALUE, 'choices.0.key', ''), fragment: /为空/ },
    {
      name: '下拉项带未知字段',
      raw: setAt(WORKSPACE_VALUE, 'choices.0.registered', true),
      fragment: /未知字段：registered/,
    },
    { name: 'workspace.key 为空串', raw: setAt(WORKSPACE_VALUE, 'workspace.key', ''), fragment: /为空/ },
    {
      name: 'workspace.registered 不是布尔值',
      raw: setAt(WORKSPACE_VALUE, 'workspace.registered', 'yes'),
    },
    { name: 'workspace.disabled 含非字符串', raw: setAt(WORKSPACE_VALUE, 'workspace.disabled', [1]) },
    { name: 'workspace.path 为空串', raw: setAt(WORKSPACE_VALUE, 'workspace.path', '') },
    { name: 'workspace.corrupt 不是布尔值', raw: setAt(WORKSPACE_VALUE, 'workspace.corrupt', 'no') },
    { name: 'workspace.title 不是字符串', raw: setAt(WORKSPACE_VALUE, 'workspace.title', 1) },
    { name: 'workspace 带未知字段', raw: setAt(WORKSPACE_VALUE, 'workspace.size', 1), fragment: /未知字段：size/ },
    { name: 'changed 含空串', raw: setAt(WORKSPACE_VALUE, 'changed', ['']), fragment: /为空/ },
    { name: 'changed 含非字符串', raw: setAt(WORKSPACE_VALUE, 'changed', [1]) },
    { name: '顶层未知字段 extra', raw: setAt(WORKSPACE_VALUE, 'extra', true), fragment: /未知字段：extra/ },
    { name: '把 defaults 成功值当 workspace 解码', raw: plain(DEFAULTS_VALUE) },
  ])
})

/**
 * 条目技能字段与宇宙扩展（code-design ③3.3 / ⑤G2.3）。
 *
 * 校验规则逐条对应 code-design 3.3 的 parser 规则：
 *
 * - `modelInvocable` / `userInvocable` 必须成对（只给一个 → 拒绝）；
 * - 任一技能字段出现时 `address` 必须 `skill:` 开头（MCP / 内置行 → 拒绝）；
 * - `source` 可选非空字符串，且与 invocation 对**同生**（出现 `source` 缺对 → 拒绝）；
 * - `ungroupedMcp` 可选非负安全整数；`skillsComplete` 可选布尔；
 * - 未知键仍 strict 拒绝（旧字段集不放宽，entry 与 universe 字段集不互通）；
 * - `universe: null` 仍合法（旧宿主兼容，扩键不改变 null 分支）。
 */
describe('parseWorkspaceValue：条目技能字段与宇宙扩展', () => {
  it('技能条目带完整技能字段（invocation 成对 + source）原样通过并读出', () => {
    // 技能字段只落在 `skill:` 行上：夹具的 skill 组条目地址恰为 `skill:skill-creator`。
    const raw = setAt(
      setAt(
        setAt(WORKSPACE_VALUE, 'universe.groups.1.tools.0.modelInvocable', true),
        'universe.groups.1.tools.0.userInvocable',
        true,
      ),
      'universe.groups.1.tools.0.source',
      'openspec',
    )
    const result = parseWorkspaceValue(raw)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const entry = result.value.universe?.groups[1].tools[0]
    expect(entry?.address).toBe('skill:skill-creator')
    expect(entry?.modelInvocable).toBe(true)
    expect(entry?.userInvocable).toBe(true)
    expect(entry?.source).toBe('openspec')
  })

  it('宇宙带两个工作区字段（ungroupedMcp + skillsComplete）原样通过并读出', () => {
    const raw = setAt(setAt(WORKSPACE_VALUE, 'universe.ungroupedMcp', 2), 'universe.skillsComplete', true)
    const result = parseWorkspaceValue(raw)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.universe?.ungroupedMcp).toBe(2)
    expect(result.value.universe?.skillsComplete).toBe(true)
  })

  it('ungroupedMcp 为 0 合法（非负含零）且 skillsComplete 缺省合法', () => {
    const result = parseWorkspaceValue(setAt(WORKSPACE_VALUE, 'universe.ungroupedMcp', 0))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.universe?.ungroupedMcp).toBe(0)
    expect(result.value.universe?.skillsComplete).toBeUndefined()
  })

  it('universe 为 null 仍合法（旧宿主兼容，扩键不改变 null 分支）', () => {
    const result = parseWorkspaceValue(setAt(WORKSPACE_VALUE, 'universe', null))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.universe).toBeNull()
  })

  it('R15：mcp 组带 source + countsTokens 原样通过并读出', () => {
    const raw = setAt(
      setAt(WORKSPACE_VALUE, 'universe.groups.0.source', 'project'),
      'universe.groups.0.countsTokens',
      true,
    )
    const result = parseWorkspaceValue(raw)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const group = result.value.universe?.groups[0]
    expect(group?.source).toBe('project')
    expect(group?.countsTokens).toBe(true)
  })

  it('R15：mcp 组 source 为 user 合法（profile 级）', () => {
    const result = parseWorkspaceValue(setAt(WORKSPACE_VALUE, 'universe.groups.0.source', 'user'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.universe?.groups[0]?.source).toBe('user')
    expect(result.value.universe?.groups[0]?.countsTokens).toBeUndefined()
  })

  it('R15：universe.foreignProjectMcp 原样通过并读出', () => {
    const result = parseWorkspaceValue(setAt(WORKSPACE_VALUE, 'universe.foreignProjectMcp', 3))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.universe?.foreignProjectMcp).toBe(3)
  })

  runRejected(parseWorkspaceValue, [
    {
      name: 'R15：source 取值越界（不是 user/project 枚举）',
      raw: setAt(WORKSPACE_VALUE, 'universe.groups.0.source', 'other'),
      fragment: /不是已知取值/,
    },
    {
      name: 'R15：countsTokens 不是布尔值',
      raw: setAt(WORKSPACE_VALUE, 'universe.groups.0.countsTokens', 'yes'),
    },
    {
      name: 'R15：技能组带 source（组级标注只在 mcp 组合法）',
      raw: setAt(WORKSPACE_VALUE, 'universe.groups.1.source', 'user'),
      fragment: /只允许出现在 mcp 分组/,
    },
    {
      name: 'R15：内置组带 countsTokens（组级标注只在 mcp 组合法）',
      raw: setAt(WORKSPACE_VALUE, 'universe.groups.2.countsTokens', true),
      fragment: /只允许出现在 mcp 分组/,
    },
    {
      name: 'R15：foreignProjectMcp 为负数',
      raw: setAt(WORKSPACE_VALUE, 'universe.foreignProjectMcp', -1),
      fragment: /不是非负安全整数/,
    },
    {
      name: '技能条目只给 modelInvocable（invocation 必须成对）',
      raw: setAt(WORKSPACE_VALUE, 'universe.groups.1.tools.0.modelInvocable', true),
      fragment: /必须成对/,
    },
    {
      name: '技能条目只给 userInvocable（invocation 必须成对）',
      raw: setAt(WORKSPACE_VALUE, 'universe.groups.1.tools.0.userInvocable', true),
      fragment: /必须成对/,
    },
    {
      name: '内置工具行（tool:bash）带成对技能字段（技能字段只在 skill: 地址上合法）',
      raw: setAt(
        setAt(WORKSPACE_VALUE, 'universe.groups.2.tools.0.modelInvocable', true),
        'universe.groups.2.tools.0.userInvocable',
        true,
      ),
      fragment: /只有 skill: 地址/,
    },
    {
      name: 'MCP 工具行带成对技能字段（技能字段只在 skill: 地址上合法）',
      raw: setAt(
        setAt(WORKSPACE_VALUE, 'universe.groups.0.tools.0.modelInvocable', true),
        'universe.groups.0.tools.0.userInvocable',
        true,
      ),
      fragment: /只有 skill: 地址/,
    },
    {
      name: 'source 出现但无 invocation 对（source 与技能字段同生）',
      raw: setAt(WORKSPACE_VALUE, 'universe.groups.1.tools.0.source', 'openspec'),
      fragment: /同时在场/,
    },
    {
      name: 'source 为空串（来源必须非空）',
      raw: setAt(
        setAt(
          setAt(WORKSPACE_VALUE, 'universe.groups.1.tools.0.modelInvocable', true),
          'universe.groups.1.tools.0.userInvocable',
          true,
        ),
        'universe.groups.1.tools.0.source',
        '',
      ),
      fragment: /为空/,
    },
    {
      name: 'ungroupedMcp 为负数（-1）',
      raw: setAt(WORKSPACE_VALUE, 'universe.ungroupedMcp', -1),
      fragment: /不是非负安全整数/,
    },
    {
      name: 'ungroupedMcp 为小数（1.5 非安全整数）',
      raw: setAt(WORKSPACE_VALUE, 'universe.ungroupedMcp', 1.5),
      fragment: /不是非负安全整数/,
    },
    {
      name: 'skillsComplete 不是布尔值',
      raw: setAt(WORKSPACE_VALUE, 'universe.skillsComplete', 'yes'),
    },
    {
      name: '条目带宇宙字段（entry 与 universe 字段集不互通，未知键仍 strict）',
      raw: setAt(WORKSPACE_VALUE, 'universe.groups.1.tools.0.ungroupedMcp', 1),
      fragment: /未知字段：ungroupedMcp/,
    },
  ])
})

describe('端点之间的形状互不串用（一个端点一种响应）', () => {
  it('panel 快照不能被当 toggle / defaults / workspace 成功值解码', () => {
    expect(parseToggleValue(plain(SNAPSHOT)).ok).toBe(false)
    expect(parseDefaultsValue(plain(SNAPSHOT)).ok).toBe(false)
    expect(parseWorkspaceValue(plain(SNAPSHOT)).ok).toBe(false)
  })

  it('toggle 成功值不能被当 panel 快照 / defaults / workspace 成功值解码', () => {
    expect(parsePanelSnapshot(plain(TOGGLE_VALUE)).ok).toBe(false)
    expect(parseDefaultsValue(plain(TOGGLE_VALUE)).ok).toBe(false)
    expect(parseWorkspaceValue(plain(TOGGLE_VALUE)).ok).toBe(false)
  })

  it('defaults 成功值不能被当 panel 快照 / toggle / workspace 成功值解码', () => {
    expect(parsePanelSnapshot(plain(DEFAULTS_VALUE)).ok).toBe(false)
    expect(parseToggleValue(plain(DEFAULTS_VALUE)).ok).toBe(false)
    expect(parseResetValue(plain(DEFAULTS_VALUE)).ok).toBe(false)
    expect(parseWorkspaceValue(plain(DEFAULTS_VALUE)).ok).toBe(false)
  })

  it('workspace 成功值不能被当 panel 快照 / toggle / defaults 成功值解码', () => {
    expect(parsePanelSnapshot(plain(WORKSPACE_VALUE)).ok).toBe(false)
    expect(parseToggleValue(plain(WORKSPACE_VALUE)).ok).toBe(false)
    expect(parseDefaultsValue(plain(WORKSPACE_VALUE)).ok).toBe(false)
  })
})

/* ────────────────────────────── 失败细节 ────────────────────────────── */

describe('parseFailureDetails：§2.3 的 details 形状', () => {
  it('bad-address：address + parseCode', () => {
    expect(parseFailureDetails({ address: 'mcp:', parseCode: 'bad-server' })).toStrictEqual({
      address: 'mcp:',
      parseCode: 'bad-server',
    })
  })

  it('protected / reserved：names 列表', () => {
    expect(parseFailureDetails({ names: ['bash', 'tool:skill'] })).toStrictEqual({
      names: ['bash', 'tool:skill'],
    })
  })

  it('session-not-live：sessionId', () => {
    expect(parseFailureDetails({ sessionId: 'session-1' })).toStrictEqual({ sessionId: 'session-1' })
  })

  it('defaults-unwritable：path + reason', () => {
    const details = { path: '/home/u/.dsh/session-tool-toggle/defaults.json', reason: 'EACCES' }
    expect(parseFailureDetails(details)).toStrictEqual(details)
  })

  it('bad-request：issues', () => {
    const details = { issues: 'panel 请求体.sessionId 不是字符串' }
    expect(parseFailureDetails(details)).toStrictEqual(details)
  })

  it('workspace-unresolved：subject（会话 id 或被拒绝的路径原文）', () => {
    expect(parseFailureDetails({ subject: '/home/u/gone' })).toStrictEqual({ subject: '/home/u/gone' })
    expect(parseFailureDetails({ subject: 'session-1' })).toStrictEqual({ subject: 'session-1' })
  })

  const unrecognized: readonly { readonly name: string; readonly details: unknown }[] = [
    { name: '空对象（internal 的 details）', details: {} },
    { name: '非对象', details: 'oops' },
    { name: 'null', details: null },
    { name: '数组', details: [] },
    { name: '缺 parseCode 的半形状', details: { address: 'mcp:' } },
    { name: 'names 含非字符串', details: { names: ['bash', 1] } },
    { name: '已知形状但多出未知字段', details: { names: ['bash'], extra: true } },
    { name: 'path 非字符串', details: { path: 1, reason: 'EACCES' } },
    { name: 'issues 非字符串', details: { issues: 1 } },
    { name: 'sessionId 非字符串', details: { sessionId: 1 } },
    { name: 'subject 非字符串', details: { subject: 1 } },
    { name: 'subject 形状多出未知字段', details: { subject: '/w', extra: true } },
  ]

  for (const testCase of unrecognized) {
    it(`降级为 undefined：${testCase.name}`, () => {
      expect(parseFailureDetails(testCase.details)).toBeUndefined()
    })
  }
})

/* ────────────────────────────── 与宿主侧快照的交叉校验 ────────────────────────────── */

describe('与宿主侧快照（任务 9.3 的 panel.ts）的形状一致性', () => {
  it('双向可赋值：字段集、可选性、可空性与取值域都一致', () => {
    // 9.3 的 `PanelSnapshot` 是宿主侧的独立类型（它不 import 本模块）。9.4 的 dispatcher 会
    // 把这个对象**直接**交给 `parsePanelSnapshot`：任一侧多/少/改一个字段，下面的三行赋值
    // 会在 typecheck 阶段失败，而不是等到运行时才以 `bad-response` / `internal` 暴露。
    // 组 5 先冻结契约：宿主侧的 `skills` / `workspace` 由 6.1 补齐，在那之前本块 typecheck
    // 红属 diff-matrix R4 的规划内瞬态（运行时本用例仍然通过）。
    const wire: PanelSnapshot = SNAPSHOT
    const host: HostPanelSnapshot = wire
    const back: PanelSnapshot = host
    expect(back).toBe(SNAPSHOT)
  })
})

/* ────────────────────────────── FORK / 兼容 ────────────────────────────── */

describe('FORK/兼容：快照不携带工具入参 schema', () => {
  it('工具条目上的 parameters 被拒（strict 的未知字段一侧）', () => {
    const raw = setAt(SNAPSHOT, 'groups.0.tools.0.parameters', { type: 'object' })
    const result = parsePanelSnapshot(raw)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/未知字段：parameters/)
  })

  it('顶层快照上的 parameters 被拒', () => {
    expect(parsePanelSnapshot(setAt(SNAPSHOT, 'parameters', {})).ok).toBe(false)
  })
})
