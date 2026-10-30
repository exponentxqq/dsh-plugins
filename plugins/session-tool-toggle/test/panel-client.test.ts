/**
 * `panel-client` 的边界行为：四个端点的成功路径与请求 payload 形状、宿主失败信封（码 /
 * 说明 / 细节原样保留）、传输异常归一，以及两种坏形状（坏信封 → `bad-response`、合法信封
 * 但响应过不了 parser → `bad-response`）。
 *
 * 浏览器半的类型只是「宿主承诺」，线上真正到的值不一定是那个形状，所以全部用例都用假
 * Connection 喂原始线值，断言的是调用参数与归一后的失败码 / 细节，而不是类型。
 */
import { describe, expect, it, vi } from 'vitest'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import {
  CHANNEL,
  DEFAULTS_ENDPOINT,
  PANEL_ENDPOINT,
  RESET_ENDPOINT,
  TOGGLE_ENDPOINT,
  type DefaultsValue,
  type Mutation,
  type PanelSnapshot,
  type ToggleValue,
} from '../src/contract.ts'
import { PanelError, createPanelClient } from '../src/client/panel-client.ts'

/** 用例里那个活着的会话 id。 */
const SESSION_ID = 'session-1'

/** 默认档文件的假绝对路径（只用于断言透传，不指向任何真实文件）。 */
const DEFAULTS_PATH = '/fake/dsh-home/session-tool-toggle/defaults.json'

/** 会话创建时间（固定值，让快照可断言）。 */
const CREATED_AT = 1_700_000_000_000

/**
 * 一份最小的合法面板快照（strict 契约：字段不多不少）。
 * @param overrides - 需要改写的顶层字段。
 * @returns 面板快照。
 */
function snapshot(overrides: Partial<PanelSnapshot> = {}): PanelSnapshot {
  return {
    sessionId: SESSION_ID,
    createdAt: CREATED_AT,
    state: { disabled: [], snapshot: [], seeded: false, updatedAt: 0, storeKind: 'memory' },
    groups: [],
    protectedNames: ['bash'],
    defaults: { version: 1, disabled: [], path: DEFAULTS_PATH, readable: false, corrupt: false },
    hiddenByOthers: [],
    intentOnly: [],
    stats: { visible: 4, catalog: 4, denied: 0, shadowed: 0 },
    notices: [],
    ...overrides,
  }
}

/**
 * `toggle` / `reset` 的成功值：一份关闭了一个 MCP 组的快照 + 一条回执。
 * @param overrides - 需要改写的回执字段（`reset` 用例把 `applied[].on` 改成 `true`）。
 * @returns 端点成功值。
 */
function mutationValue(overrides: Partial<Mutation> = {}): ToggleValue {
  return {
    snapshot: snapshot({
      state: { disabled: ['mcp:a'], snapshot: [], seeded: true, updatedAt: 1, storeKind: 'record' },
      stats: { visible: 1, catalog: 4, denied: 3, shadowed: 0 },
    }),
    mutation: {
      applied: [{ address: 'mcp:a', on: false, matched: 3 }],
      hiddenTools: 3,
      visibleBefore: 4,
      visibleAfter: 1,
      kvRebuild: true,
      notices: ['persistence-degraded'],
      ...overrides,
    },
  }
}

/**
 * `defaults` 的成功值。
 * @param changed - 实际写入的地址（缺省一条）。
 * @returns 端点成功值。
 */
function defaultsValue(changed: readonly string[] = ['mcp:a']): DefaultsValue {
  return {
    defaults: { version: 1, disabled: [...changed], path: DEFAULTS_PATH, readable: true, corrupt: false },
    changed: [...changed],
  }
}

/**
 * 一个总是返回同一线值的假 Connection。
 * @param result - 无论怎么调都返回的线上结果。
 * @returns 调用记录 + Connection 替身。
 */
function connectionReturning(result: unknown) {
  const call = vi.fn(async (..._args: unknown[]) => result)
  return { call, connection: { rpc: { call } } as unknown as ConnectionHandle }
}

/**
 * 一个总是抛出的假 Connection（传输层故障）。
 * @param error - 抛出值。
 * @returns 调用记录 + Connection 替身。
 */
function connectionThrowing(error: unknown) {
  const call = vi.fn(async (..._args: unknown[]) => {
    throw error
  })
  return { call, connection: { rpc: { call } } as unknown as ConnectionHandle }
}

/**
 * 跑一次调用并抓住它抛出的值。
 * @param run - 待执行的调用。
 * @returns 断言过身世的失败对象。
 */
async function failureOf(run: () => Promise<unknown>): Promise<PanelError> {
  const error = await run().then(
    () => undefined,
    (reason: unknown) => reason,
  )
  expect(error).toBeInstanceOf(PanelError)
  return error as PanelError
}

describe('panel client：四个端点的成功路径与请求形状', () => {
  it('panel：走 panel 端点、只带 sessionId、返回校验后的快照', async () => {
    const { call, connection } = connectionReturning({ ok: true, value: snapshot() })

    const panel = await createPanelClient(connection).panel(SESSION_ID)

    expect(panel.sessionId).toBe(SESSION_ID)
    expect(panel.createdAt).toBe(CREATED_AT)
    expect(panel.stats.visible).toBe(4)
    expect(panel.defaults.path).toBe(DEFAULTS_PATH)
    expect(call).toHaveBeenCalledWith(CHANNEL, PANEL_ENDPOINT, { sessionId: SESSION_ID })
  })

  it('toggle：payload 带 on 与地址列表、返回新快照与回执', async () => {
    const value = mutationValue()
    const { call, connection } = connectionReturning({ ok: true, value })

    const toggled = await createPanelClient(connection).toggle(SESSION_ID, false, ['mcp:a', 'mcp:b'])

    expect(toggled.snapshot.state.disabled).toEqual(['mcp:a'])
    expect(toggled.mutation).toEqual(value.mutation)
    expect(call).toHaveBeenCalledWith(CHANNEL, TOGGLE_ENDPOINT, {
      sessionId: SESSION_ID,
      on: false,
      addresses: ['mcp:a', 'mcp:b'],
    })
  })

  it('reset：走 reset 端点、payload 只有 sessionId、回执的 on 恒为 true', async () => {
    const value = mutationValue({ applied: [{ address: 'mcp:a', on: true, matched: 3 }], hiddenTools: -3 })
    const { call, connection } = connectionReturning({ ok: true, value })

    const reset = await createPanelClient(connection).reset(SESSION_ID)

    expect(reset.mutation.applied[0]?.on).toBe(true)
    expect(reset.snapshot.sessionId).toBe(SESSION_ID)
    expect(call).toHaveBeenCalledWith(CHANNEL, RESET_ENDPOINT, { sessionId: SESSION_ID })
  })

  it('defaults(set)：payload 是 action + addresses，不携带 sessionId', async () => {
    const { call, connection } = connectionReturning({ ok: true, value: defaultsValue() })

    const written = await createPanelClient(connection).updateDefaults('set', ['mcp:a'])

    expect(written.changed).toEqual(['mcp:a'])
    expect(written.defaults.readable).toBe(true)
    expect(call).toHaveBeenCalledWith(CHANNEL, DEFAULTS_ENDPOINT, { action: 'set', addresses: ['mcp:a'] })
  })

  it('defaults(reset)：payload 只有 action（不补空数组）', async () => {
    const { call, connection } = connectionReturning({ ok: true, value: defaultsValue([]) })

    await createPanelClient(connection).updateDefaults('reset')

    expect(call).toHaveBeenCalledWith(CHANNEL, DEFAULTS_ENDPOINT, { action: 'reset' })
  })

  it('defaults(reset) 即便传了地址也不上发（契约不允许该组合同现）', async () => {
    const { call, connection } = connectionReturning({ ok: true, value: defaultsValue([]) })

    await createPanelClient(connection).updateDefaults('reset', ['mcp:a'])

    expect(call).toHaveBeenCalledWith(CHANNEL, DEFAULTS_ENDPOINT, { action: 'reset' })
  })

  it('defaults 非 reset 缺省地址时只发 action，形状交给宿主拒绝', async () => {
    const { call, connection } = connectionReturning({ ok: true, value: defaultsValue() })

    await createPanelClient(connection).updateDefaults('off')

    expect(call).toHaveBeenCalledWith(CHANNEL, DEFAULTS_ENDPOINT, { action: 'off' })
  })
})

describe('panel client：宿主失败信封', () => {
  it('宿主拒绝：原样保留失败码、说明与细节（protected）', async () => {
    const { connection } = connectionReturning({
      ok: false,
      error: { code: 'protected', message: 'bash 在保护名单内，不能关闭', details: { names: ['bash'] } },
    })

    const error = await failureOf(() =>
      createPanelClient(connection).toggle(SESSION_ID, false, ['tool:bash']),
    )

    expect(error.code).toBe('protected')
    expect(error.message).toBe('bash 在保护名单内，不能关闭')
    expect(error.details).toEqual({ names: ['bash'] })
    expect(error.name).toBe('PanelError')
  })

  it.each([
    ['bad-request', { issues: 'toggle 请求体.addresses 至少 1 条' }],
    ['bad-address', { address: 'mcp::x', parseCode: 'empty-server' }],
    ['session-not-live', { sessionId: SESSION_ID }],
    ['defaults-unwritable', { path: DEFAULTS_PATH, reason: 'EACCES' }],
  ])('宿主码 %s 的 details 按已知形状透传', async (code, details) => {
    const { connection } = connectionReturning({ ok: false, error: { code, message: '拒绝', details } })

    const error = await failureOf(() => createPanelClient(connection).panel(SESSION_ID))

    expect(error.code).toBe(code)
    expect(error.details).toEqual(details)
  })

  it('本版本不认识的宿主码也原样保留（不降级成 internal）', async () => {
    const { connection } = connectionReturning({
      ok: false,
      error: { code: 'future-reason', message: '更新版本宿主的新码', details: {} },
    })

    const error = await failureOf(() => createPanelClient(connection).panel(SESSION_ID))

    expect(error.code).toBe('future-reason')
    expect(error.message).toBe('更新版本宿主的新码')
    // `internal` 的 `{}` 不是已知细节形状：读不出来就缺省，不编造。
    expect(error.details).toBeUndefined()
  })
})

describe('panel client：传输异常归一为 unavailable', () => {
  it('rpc.call 抛 Error', async () => {
    const { connection } = connectionThrowing(new Error('socket closed'))

    const error = await failureOf(() => createPanelClient(connection).panel(SESSION_ID))

    expect(error.code).toBe('unavailable')
    expect(error.message).toBe('socket closed')
  })

  it('rpc.call 抛非 Error 值时说明取字符串形', async () => {
    const { connection } = connectionThrowing('channel not mounted')

    const error = await failureOf(() => createPanelClient(connection).reset(SESSION_ID))

    expect(error.code).toBe('unavailable')
    expect(error.message).toBe('channel not mounted')
  })

  it('connection 上没有 rpc（通道未挂载）也不让 TypeError 穿透', async () => {
    const connection = {} as unknown as ConnectionHandle

    const error = await failureOf(() => createPanelClient(connection).panel(SESSION_ID))

    expect(error.code).toBe('unavailable')
  })
})

describe('panel client：坏信封归一为 bad-response', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['字符串', 'ok'],
    ['数字', 42],
    ['数组', []],
  ])('信封不是对象（%s）', async (_label: string, raw: unknown) => {
    const { connection } = connectionReturning(raw)

    const error = await failureOf(() => createPanelClient(connection).panel(SESSION_ID))

    expect(error.code).toBe('bad-response')
  })

  it('信封缺 ok 标记', async () => {
    const { connection } = connectionReturning({ value: snapshot() })

    const error = await failureOf(() => createPanelClient(connection).panel(SESSION_ID))

    expect(error.code).toBe('bad-response')
    expect(error.message).toContain('ok')
  })

  it.each([
    ['缺 error', { ok: false }],
    ['error 不是对象', { ok: false, error: 'protected' }],
    ['缺 code', { ok: false, error: { message: '拒绝' } }],
    ['code 为空串', { ok: false, error: { code: '', message: '拒绝' } }],
    ['缺 message', { ok: false, error: { code: 'protected' } }],
  ])('失败信封不可读（%s）', async (_label: string, raw: unknown) => {
    const { connection } = connectionReturning(raw)

    const error = await failureOf(() => createPanelClient(connection).toggle(SESSION_ID, true, ['mcp:a']))

    expect(error.code).toBe('bad-response')
  })
})

describe('panel client：合法信封但响应过不了 parser', () => {
  it('四个端点的成功值不合契约时都归一为 bad-response', async () => {
    const { call, connection } = connectionReturning({ ok: true, value: {} })
    const client = createPanelClient(connection)

    const runs = [
      () => client.panel(SESSION_ID),
      () => client.toggle(SESSION_ID, true, ['mcp:a']),
      () => client.reset(SESSION_ID),
      () => client.updateDefaults('on', ['mcp:a']),
    ]
    for (const run of runs) {
      const error = await failureOf(run)
      expect(error.code).toBe('bad-response')
    }
    expect(call).toHaveBeenCalledTimes(runs.length)
  })

  it('panel 的 parser 失败说明里带字段路径前缀', async () => {
    const { connection } = connectionReturning({ ok: true, value: { sessionId: SESSION_ID } })

    const error = await failureOf(() => createPanelClient(connection).panel(SESSION_ID))

    expect(error.code).toBe('bad-response')
    expect(error.message).toContain('panel 快照')
  })

  it('toggle 的新快照里字段类型漂移同样是 bad-response', async () => {
    const value = mutationValue()
    const { connection } = connectionReturning({
      ok: true,
      value: { ...value, mutation: { ...value.mutation, hiddenTools: '3' } },
    })

    const error = await failureOf(() => createPanelClient(connection).toggle(SESSION_ID, false, ['mcp:a']))

    expect(error.code).toBe('bad-response')
  })

  it('defaults 的默认档版本不是 1 时拒绝', async () => {
    const value = defaultsValue()
    const { connection } = connectionReturning({
      ok: true,
      value: { ...value, defaults: { ...value.defaults, version: 2 } },
    })

    const error = await failureOf(() => createPanelClient(connection).updateDefaults('set', ['mcp:a']))

    expect(error.code).toBe('bad-response')
    expect(error.message).toContain('version')
  })

  it('ok:true 但缺 value 时按坏响应处理', async () => {
    const { connection } = connectionReturning({ ok: true })

    const error = await failureOf(() => createPanelClient(connection).panel(SESSION_ID))

    expect(error.code).toBe('bad-response')
  })
})
