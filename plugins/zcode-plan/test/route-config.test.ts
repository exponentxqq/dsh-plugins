import { describe, expect, it, vi } from 'vitest'
import type { LogPort } from '../src/host/ports.ts'
import type { ConfigEditorPort, LlmDirectoryPort, RouteEntry } from '../src/host/route-config.ts'
import {
  ROUTE_ENTRY_ID,
  ROUTE_ID,
  ZCODE_PLAN_ROUTE,
  deepEqual,
  installRoute,
  removeRoute,
  routeState,
} from '../src/host/route-config.ts'

/**
 * 路由注册 / 摘除 / 状态单测（X7）：
 * - 并集合并（inherited + override 逐键 profile 胜，X7-1/X7-2）；
 * - 幂等短路（override 深等单一真源即跳过写盘，X7-4；remove 无键对称短路，X7-6）；
 * - remove 只删本键、providers 删空仍是空对象（X7-5）；
 * - 无 llm-pi-ai 行 → no-row 且不写盘（X7-7）；
 * - 单一真源常量断言（X7-8：六码整集顺序、models 两条、零 headers）；
 * - routeState 的 registered 判定（X7-9）。
 */

/** edit 的 change 回调类型别名（测试里手动调用以断言合并算法）。 */
type ChangeFn = Parameters<ConfigEditorPort['edit']>[1]

/** 假 log：三通道全桩。 */
function makeLog(): LogPort {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}

/** 假 config-editor：单条 llm-pi-ai 行（或无行），edit 按真实语义回写 override 层。 */
function makeFakeEditor(options: { inherited?: Record<string, unknown>; override?: Record<string, unknown>; rows?: RouteEntry[] } = {}) {
  const entry: RouteEntry = { options: { id: ROUTE_ENTRY_ID } }
  const rows = options.rows ?? [entry]
  let inherited = options.inherited ?? {}
  let override = options.override ?? {}
  const edit = vi.fn(async (_entry: RouteEntry, change: ChangeFn) => {
    override = change(override, inherited)
  })
  const configEditor: ConfigEditorPort = {
    entries: () => rows,
    configuration: () => [{ entry, inherited, override }],
    edit,
  }
  return { entry, configEditor, edit, readOverride: (): Record<string, unknown> => override }
}

/** 假 llm 目录：按给定 id 列表产出 provider 元数据。 */
function makeFakeLlm(ids: readonly string[]): LlmDirectoryPort {
  return { listProviders: () => ids.map((id) => ({ id, name: `provider-${id}` })) }
}

/** 单一真源的深拷贝（结构相同、引用不同——验证深等而非引用等）。 */
function cloneRoute(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(ZCODE_PLAN_ROUTE)) as Record<string, unknown>
}

describe('installRoute：并集合并（X7-1 / X7-2）', () => {
  it('X7-1 两侧都有 providers：inherited 与 override 的键都保留，再落 zcode-plan 本键', async () => {
    const fake = makeFakeEditor({
      inherited: { providers: { 'bundle-route': { apiKeyEnv: 'BUNDLE' } } },
      override: { providers: { 'user-route': { apiKeyEnv: 'USER' } } },
    })
    const result = await installRoute({ configEditor: fake.configEditor, llm: makeFakeLlm([ROUTE_ID]), log: makeLog() })
    expect(result).toEqual({ ok: true, changed: true, registered: true })
    expect(fake.edit).toHaveBeenCalledTimes(1)
    const providers = fake.readOverride().providers as Record<string, unknown>
    expect(providers['bundle-route']).toEqual({ apiKeyEnv: 'BUNDLE' })
    expect(providers['user-route']).toEqual({ apiKeyEnv: 'USER' })
    expect(providers[ROUTE_ID]).toEqual(ZCODE_PLAN_ROUTE)
  })

  it('X7-2 同名键两侧不同值：逐键 profile 胜，profile 值保留、不被 inherited 覆盖', async () => {
    const fake = makeFakeEditor({
      inherited: { providers: { shared: { api: 'bundle-version' } } },
      override: { providers: { shared: { api: 'profile-version' } } },
    })
    const result = await installRoute({ configEditor: fake.configEditor, llm: makeFakeLlm([]), log: makeLog() })
    expect(result.changed).toBe(true)
    const providers = fake.readOverride().providers as Record<string, unknown>
    expect(providers['shared']).toEqual({ api: 'profile-version' })
    expect(providers[ROUTE_ID]).toEqual(ZCODE_PLAN_ROUTE)
  })
})

describe('installRoute：幂等短路（X7-3 / X7-4）', () => {
  it('X7-3 override 的 zcode-plan 深等单一真源（引用不同）→ changed:false 且 edit 未调用', async () => {
    const fake = makeFakeEditor({ override: { providers: { [ROUTE_ID]: cloneRoute() } } })
    const result = await installRoute({ configEditor: fake.configEditor, llm: makeFakeLlm([ROUTE_ID]), log: makeLog() })
    expect(result).toEqual({ ok: true, changed: false })
    expect(fake.edit).not.toHaveBeenCalled()
    expect(fake.readOverride().providers).toEqual({ [ROUTE_ID]: cloneRoute() })
  })

  it('X7-4 override 的 zcode-plan 与真源值不同（如用户手改 baseURL）→ 照常写盘归一', async () => {
    const drifted = cloneRoute()
    ;(drifted as { baseURL: string }).baseURL = 'https://example.invalid/v1'
    const fake = makeFakeEditor({ override: { providers: { [ROUTE_ID]: drifted } } })
    const result = await installRoute({ configEditor: fake.configEditor, llm: makeFakeLlm([ROUTE_ID]), log: makeLog() })
    expect(result).toEqual({ ok: true, changed: true, registered: true })
    expect(fake.edit).toHaveBeenCalledTimes(1)
    expect((fake.readOverride().providers as Record<string, unknown>)[ROUTE_ID]).toEqual(ZCODE_PLAN_ROUTE)
  })
})

describe('removeRoute：只删本键（X7-5 / X7-6）', () => {
  it('X7-5 override 有 zcode-plan 与他人键：只删本键、他人键原样保留', async () => {
    const fake = makeFakeEditor({ override: { providers: { [ROUTE_ID]: cloneRoute(), 'user-route': { apiKeyEnv: 'USER' } } } })
    const result = await removeRoute({ configEditor: fake.configEditor, log: makeLog() })
    expect(result).toEqual({ ok: true, changed: true })
    expect(fake.edit).toHaveBeenCalledTimes(1)
    expect(fake.readOverride().providers).toEqual({ 'user-route': { apiKeyEnv: 'USER' } })
  })

  it('X7-5b providers 删空后仍是空对象：providers 键本身不被删除', async () => {
    const fake = makeFakeEditor({ override: { providers: { [ROUTE_ID]: cloneRoute() } } })
    await removeRoute({ configEditor: fake.configEditor, log: makeLog() })
    const nextOverride = fake.readOverride()
    expect(Object.keys(nextOverride)).toContain('providers')
    expect(nextOverride.providers).toEqual({})
  })

  it('X7-6 override 本无 zcode-plan → 幂等短路：changed:false 且 edit 未调用', async () => {
    const fake = makeFakeEditor({ override: { providers: { 'user-route': { apiKeyEnv: 'USER' } } } })
    const result = await removeRoute({ configEditor: fake.configEditor, log: makeLog() })
    expect(result).toEqual({ ok: true, changed: false })
    expect(fake.edit).not.toHaveBeenCalled()
  })
})

describe('无 llm-pi-ai 条目（X7-7）', () => {
  it('X7-7 installRoute → {ok:false, reason:"no-llm-pi-ai-row"} 且 edit 未调用', async () => {
    const fake = makeFakeEditor({ rows: [] })
    const result = await installRoute({ configEditor: fake.configEditor, llm: makeFakeLlm([ROUTE_ID]), log: makeLog() })
    expect(result).toEqual({ ok: false, changed: false, reason: 'no-llm-pi-ai-row' })
    expect(fake.edit).not.toHaveBeenCalled()
  })

  it('X7-7b removeRoute 同样 no-row 且 edit 未调用', async () => {
    const fake = makeFakeEditor({ rows: [] })
    const result = await removeRoute({ configEditor: fake.configEditor, log: makeLog() })
    expect(result).toEqual({ ok: false, changed: false, reason: 'no-llm-pi-ai-row' })
    expect(fake.edit).not.toHaveBeenCalled()
  })
})

describe('ZCODE_PLAN_ROUTE 单一真源（X7-8）', () => {
  it('X7-8 顶层字段：apiKeyEnv / api / baseURL / reasoning 与 retryPolicy 六码整集（顺序照 §3.8）', () => {
    expect(ZCODE_PLAN_ROUTE.apiKeyEnv).toBe('ZCODE_PLAN_PAT')
    expect(ZCODE_PLAN_ROUTE.api).toBe('openai-completions')
    expect(ZCODE_PLAN_ROUTE.baseURL).toBe('https://open.bigmodel.cn/api/coding/paas/v4')
    expect(ZCODE_PLAN_ROUTE.reasoning).toBe('max')
    expect(ZCODE_PLAN_ROUTE.retryPolicy.mode).toBe('normal')
    expect([...ZCODE_PLAN_ROUTE.retryPolicy.retryableCodes]).toEqual([
      'EMPTY_RESPONSE',
      'RATE_LIMIT',
      'SERVER',
      'TIMEOUT',
      'TRANSPORT',
      'INVALID_CREDENTIAL',
    ])
  })

  it('X7-8b models 恰两条：glm-5.3 / glm-5.3-flash，条目形状照实测 profile', () => {
    expect(ZCODE_PLAN_ROUTE.models).toHaveLength(2)
    expect(ZCODE_PLAN_ROUTE.models.map((model) => model.id)).toEqual(['glm-5.3', 'glm-5.3-flash'])
    for (const model of ZCODE_PLAN_ROUTE.models) {
      expect(model.contextWindow).toBe(1_000_000)
      expect(model.maxTokens).toBe(131_072)
      expect(model.reasoningEfforts.medium).toBe('high')
      expect(model.compat.thinkingFormat).toBe('zai')
      expect(model.compat.maxTokensField).toBe('max_tokens')
    }
    expect(ZCODE_PLAN_ROUTE.models[0].input).toEqual(['text'])
    expect(ZCODE_PLAN_ROUTE.models[1].input).toEqual(['text', 'image'])
  })

  it('X7-8c 全树零 headers：指纹头不进单一真源（C3）', () => {
    const keys: string[] = []
    const walk = (value: unknown): void => {
      if (value === null || typeof value !== 'object') return
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        keys.push(key)
        walk(child)
      }
    }
    walk(ZCODE_PLAN_ROUTE)
    expect(keys).not.toContain('headers')
  })
})

describe('routeState（X7-9）', () => {
  it('X7-9 llm 目录含 zcode-plan → registered true', () => {
    const fake = makeFakeEditor({ override: { providers: { [ROUTE_ID]: cloneRoute() } } })
    const state = routeState({ configEditor: fake.configEditor, llm: makeFakeLlm(['other', ROUTE_ID]) })
    expect(state).toEqual({ declared: true, registered: true })
  })

  it('X7-9b llm 目录不含 zcode-plan → registered false；inherited 层声明也算 declared', () => {
    const fake = makeFakeEditor({ inherited: { providers: { [ROUTE_ID]: cloneRoute() } } })
    const state = routeState({ configEditor: fake.configEditor, llm: makeFakeLlm(['other']) })
    expect(state).toEqual({ declared: true, registered: false })
  })

  it('X7-9c llm 端口缺席 → registered false；两侧都无本键 → declared false', () => {
    const fake = makeFakeEditor({})
    const state = routeState({ configEditor: fake.configEditor })
    expect(state).toEqual({ declared: false, registered: false })
  })
})

describe('deepEqual（幂等短路的判据）', () => {
  it('结构相同的不同引用为等；数组 vs 对象、键数不同、嵌套差异为不等', () => {
    expect(deepEqual(cloneRoute(), cloneRoute())).toBe(true)
    expect(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true)
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false)
    expect(deepEqual([1, 2], { 0: 1, 1: 2 })).toBe(false)
    expect(deepEqual({ a: { b: 1 } }, { a: { b: 2 } })).toBe(false)
    expect(deepEqual(undefined, undefined)).toBe(true)
    expect(deepEqual(undefined, null)).toBe(false)
  })
})
