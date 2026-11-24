/**
 * ZCode 计划路由的注册 / 摘除 / 状态（H12 + code-design §3.8）。
 *
 * 默认目录 {@link ZCODE_PLAN_ROUTE}：bundle patch（`cordis.patch.yml`）不重复
 * 声明该路由（D-1），全部装配由本模块经 config-editor 写进 profile patch 的
 * `providers['zcode-plan']` 键。**profile 的 cordis.patch.yml 是路由事实的最终
 * 真源**：install 只补缺失键、绝不覆盖 profile 已声明键（含手改 `models`），
 * remove 只删本键；两者都不触碰 `agent-default-model`（切默认路由是用户决策，C8/E7）。
 *
 * 上游 API 位点（0.2.1-rc.2 实测）：
 * - `@deepseek-ai/dsh-config-editor`：`entries()` / `configuration()` /
 *   `edit(entry, change)`——README：`edit` 原子替换、**保留注释**、失败回滚；
 * - `@deepseek-ai/dsh-llm`：`listProviders()` 返回 `{ id, name }[]`。
 *
 * 本模块收窄成端口（照 `ports.ts` 的窄面纪律）：{@link ConfigEditorPort} /
 * {@link LlmDirectoryPort} 只声明本插件消费的最小成员面，纯结构类型、不 import
 * 上游类型——装配层（T7 任务 8.1）从 `ctx.configEditor` / `ctx.get('llm')` 适配，
 * 测试用自写 fake。**零新增依赖**：类型面自持，devDependencies 不动。
 *
 * @module dsh-plugin-zcode-plan/host/route-config
 */

import type { LogPort } from './ports.ts'

/** 路由键：profile patch 的 `providers` 下本插件唯一拥有的键。 */
export const ROUTE_ID = 'zcode-plan'

/** 路由宿主条目：llm-pi-ai 在 loader 配置树里的条目 id（providers 段的所有者）。 */
export const ROUTE_ENTRY_ID = 'llm-pi-ai'

/**
 * ZCode 计划路由的单一真源（§3.8，D-1）。
 *
 * - **必须带 `models`**：非 catalog 路由（route id 不在 pi-ai catalog，无继承链）
 *   需要 `api` + `baseURL` + 非空 `models`；glm-5.3 / glm-5.3-flash 两条逐字搬本机
 *   实测可用的 `zai-coding-zcode` 条目（`~/.dsh/profiles/web/cordis.patch.yml` 的
 *   models 段），**去掉 `headers` 段**（零指纹头，C3）；
 * - **glm-5.4 置首且带图片输入**：2026-11-23 官方上线 Coding Plan（1M 上下文、新增视觉；
 *   实测 1M/131072 上限、`input: ['text','image']` 可发图、`reasoning_effort`
 *   low/high/max 均被受理；同日 glm-5.3 曾返回 1305「访问量过大」，其后恢复可用，
 *   保留为纯文本回退档）；
 * - **`retryableCodes` 是整集覆盖**（上游 `dsh-llm` 的 resolved retry policy 对该
 *   字段取整集替换语义，不是增量合并）→ 必须把五个默认码一并重述、只追加
 *   `INVALID_CREDENTIAL`（D-8；`AUTH` 码在本版本码表中不存在）。
 */
export const ZCODE_PLAN_ROUTE = {
  displayName: 'GLM Coding Plan (ZCode PAT)',
  apiKeyEnv: 'ZCODE_PLAN_PAT',
  api: 'openai-completions',
  baseURL: 'https://open.bigmodel.cn/api/coding/paas/v4',
  reasoning: 'max',
  retryPolicy: {
    mode: 'normal',
    retryableCodes: ['EMPTY_RESPONSE', 'RATE_LIMIT', 'SERVER', 'TIMEOUT', 'TRANSPORT', 'INVALID_CREDENTIAL'],
  },
  models: [
    {
      id: 'glm-5.4',
      name: 'GLM-5.4',
      contextWindow: 1_000_000,
      maxTokens: 131_072,
      input: ['text', 'image'],
      reasoningEfforts: { off: null, low: 'low', medium: 'high', high: 'high', max: 'max' },
      compat: {
        thinkingFormat: 'zai',
        supportsReasoningEffort: true,
        supportsStore: false,
        supportsDeveloperRole: false,
        supportsStrictMode: true,
        maxTokensField: 'max_tokens',
      },
    },
    {
      id: 'glm-5.3',
      name: 'GLM-5.3',
      contextWindow: 1_000_000,
      maxTokens: 131_072,
      input: ['text'],
      reasoningEfforts: { off: null, low: 'low', medium: 'high', high: 'high', max: 'max' },
      compat: {
        thinkingFormat: 'zai',
        supportsReasoningEffort: true,
        supportsStore: false,
        supportsDeveloperRole: false,
        supportsStrictMode: true,
        maxTokensField: 'max_tokens',
      },
    },
    {
      id: 'glm-5.3-flash',
      name: 'GLM-5.3 Flash',
      contextWindow: 1_000_000,
      maxTokens: 131_072,
      input: ['text', 'image'],
      reasoningEfforts: { off: null, low: 'low', medium: 'high', high: 'high', max: 'max' },
      compat: {
        thinkingFormat: 'zai',
        supportsReasoningEffort: true,
        supportsStore: false,
        supportsDeveloperRole: false,
        supportsStrictMode: true,
        maxTokensField: 'max_tokens',
      },
    },
  ],
} as const

/** loader 条目的窄面：本模块只读 `options.id`，其余字段一概 opaque。 */
export interface RouteEntry {
  options?: { id?: string }
}

/**
 * config-editor seam 的窄面（§3.8 伪码里 `configEditor` 的消费面）。
 *
 * 与上游 `ConfigEditor` 类结构兼容（方法签名同形），装配层直接把
 * `ctx.configEditor` 传进来即可；`edit` 的 change 回调第一参是 profile 层当前值、
 * 第二参是 inherited 层值（README：原子替换、保留注释、失败回滚）。
 */
export interface ConfigEditorPort {
  entries(): RouteEntry[]
  configuration(): Array<{ entry: RouteEntry; inherited: Record<string, unknown>; override: Record<string, unknown> }>
  edit(
    entry: RouteEntry,
    change: (current: Record<string, unknown>, inherited: Record<string, unknown>) => Record<string, unknown>,
  ): Promise<void>
}

/** llm 目录的窄面（§3.8 伪码里 `ctx.get('llm')` 的消费面）。 */
export interface LlmDirectoryPort {
  listProviders(): Array<{ id: string }>
}

/** 路由装配函数共同的依赖面。 */
export interface RouteDeps {
  /** config-editor 端口（profile patch 的读写口）。 */
  configEditor: ConfigEditorPort
  /** llm 目录端口（可缺席：缺席时 `registered` 恒为 false）。 */
  llm?: LlmDirectoryPort | undefined
  /** 诊断出口。 */
  log: LogPort
}

/** install / remove 的统一结果面。 */
export interface RouteMutationResult {
  /** 请求是否达成：no-row 即 false；install 另要求写盘后路由已在 llm 目录注册。 */
  ok: boolean
  /** 本次是否写了 profile patch（幂等短路时为 false）。 */
  changed: boolean
  /** 写盘后路由是否已在 llm 目录可见（仅 install 携带）。 */
  registered?: boolean
  /** 失败原因：找不到 `llm-pi-ai` 条目（providers 段没有宿主，无从落键）。 */
  reason?: 'no-llm-pi-ai-row'
}

/** routeState 的只读状态面（/zcode-plan route 子命令的展示数据，T7 消费）。 */
export interface RouteState {
  /** profile patch 的 override / inherited 并集里是否声明了本路由。 */
  declared: boolean
  /** llm 目录当前是否已注册本路由（路由实际可用）。 */
  registered: boolean
}

/**
 * 深等比较（幂等短路的判据）。自实现小函数，不引入新依赖：
 * 原始值用 `Object.is`（含 NaN），对象 / 数组递归逐键比较，键集合数不等即不等。
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const recordA = a as Record<string, unknown>
  const recordB = b as Record<string, unknown>
  const keysA = Object.keys(recordA)
  const keysB = Object.keys(recordB)
  if (keysA.length !== keysB.length) return false
  return keysA.every((key) => key in recordB && deepEqual(recordA[key], recordB[key]))
}

/** 把未知形状的 `providers` 段收窄成键值记录；非对象 / null / 数组一律按空表处理。 */
function asProviders(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

/** 在 loader 条目列表里定位 llm-pi-ai 行（providers 段的宿主条目）。 */
function findLlmPiAiEntry(configEditor: ConfigEditorPort): RouteEntry | undefined {
  return configEditor.entries().find((entry) => entry.options?.id === ROUTE_ENTRY_ID)
}

/**
 * 合并出**生效路由**（profile 优先语义的核心纯函数）：合并顺序
 * `插件默认（{@link ZCODE_PLAN_ROUTE}） < bundle(inherited) < profile(override)`，
 * 逐键后者胜——profile 已声明的键（含 `models`、`baseURL` 等手改值）一律保留，
 * 缺失的键由 defaults / inherited 补齐。两参都是 `providers[ROUTE_ID]` 的原始值
 * （非对象按空表处理），缺席即该层无声明。
 *
 * @param inheritedRoute - bundle（inherited）层的本键值。
 * @param overrideRoute - profile（override）层的本键值。
 * @returns 合并后的路由对象（新对象，不改任何入参）。
 */
export function effectiveRoute(inheritedRoute: unknown, overrideRoute: unknown): Record<string, unknown> {
  return { ...ZCODE_PLAN_ROUTE, ...asProviders(inheritedRoute), ...asProviders(overrideRoute) }
}

/**
 * 读取 profile patch 里**当前声明的生效路由**（纯只读）：定位 llm-pi-ai 条目 →
 * `configuration()` 的 override / inherited 两层并集里找本键（任一层声明即算）→
 * {@link effectiveRoute} 合并（profile 胜）。无条目、无快照或两层都未声明返回
 * `undefined`（调用方回落插件默认目录展示）。
 *
 * @param configEditor - config-editor 端口（可缺席：缺席返回 `undefined`）。
 * @returns 生效路由对象，或 `undefined`。
 */
export function declaredRouteOf(configEditor: ConfigEditorPort | undefined): Record<string, unknown> | undefined {
  if (configEditor === undefined) return undefined
  const entry = findLlmPiAiEntry(configEditor)
  if (entry === undefined) return undefined
  const snap = configEditor.configuration().find((layer) => layer.entry === entry)
  if (snap === undefined) return undefined
  const overrideProviders = asProviders(snap.override.providers)
  const inheritedProviders = asProviders(snap.inherited.providers)
  if (!(ROUTE_ID in overrideProviders) && !(ROUTE_ID in inheritedProviders)) return undefined
  return effectiveRoute(inheritedProviders[ROUTE_ID], overrideProviders[ROUTE_ID])
}

/**
 * 从路由对象提取模型 id 清单（status / route status 展示用）：`models` 非数组、
 * 条目非对象或缺 `id` 的条目忽略；提取结果为空时返回 `undefined`（调用方按
 * 「无清单」处理）。
 */
export function routeModelIds(route: Record<string, unknown> | undefined): readonly string[] | undefined {
  const models = route?.models
  if (!Array.isArray(models)) return undefined
  const ids = models
    .map((model) => (model !== null && typeof model === 'object' ? (model as { id?: unknown }).id : undefined))
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
  return ids.length > 0 ? ids : undefined
}

/**
 * 注册 ZCode 计划路由（H12 / §3.8 `installRoute()`）：定位 `llm-pi-ai` 条目 → 读
 * `configuration()` 的 override / inherited → **以 profile 声明为准的补缺合并**
 * （{@link effectiveRoute}：插件默认 < bundle(inherited) < profile(override)，
 * 逐键后者胜、已声明键一律不覆盖——用户手改的 `models` / `baseURL` 等原样保留，
 * 只补 profile 缺失的键）→ `edit()` → 读 `llm.listProviders()` 验证。
 *
 * **幂等**：override 层已声明本键且合并结果与其深等（无缺失键可补）即跳过写盘
 * （`{ok:true, changed:false}`），不扰动注释与无关键。只覆盖本键，
 * 不碰 `agent-default-model`（C8/E7）。
 *
 * @param deps - config-editor / llm 目录端口与诊断出口。
 * @returns `{ok, changed, registered?}`；no-row 时 `{ok:false, reason:'no-llm-pi-ai-row'}`。
 */
export async function installRoute(deps: RouteDeps): Promise<RouteMutationResult> {
  const entry = findLlmPiAiEntry(deps.configEditor)
  if (entry === undefined) {
    deps.log.warn(`未找到 ${ROUTE_ENTRY_ID} 条目：无处落 providers.${ROUTE_ID} 键，路由未注册`)
    return { ok: false, changed: false, reason: 'no-llm-pi-ai-row' }
  }
  const snap = deps.configEditor.configuration().find((layer) => layer.entry === entry)
  if (snap !== undefined) {
    const overrideProviders = asProviders(snap.override.providers)
    if (ROUTE_ID in overrideProviders) {
      const effective = effectiveRoute(asProviders(snap.inherited.providers)[ROUTE_ID], overrideProviders[ROUTE_ID])
      if (deepEqual(effective, overrideProviders[ROUTE_ID])) {
        deps.log.info(`${ROUTE_ID} 路由已按 profile 声明装配齐全：跳过写盘（幂等短路）`)
        return { ok: true, changed: false }
      }
    }
  }
  const profileDeclared = snap !== undefined && ROUTE_ID in asProviders(snap.override.providers)
  await deps.configEditor.edit(entry, (current, inherited) => ({
    ...current,
    providers: {
      ...asProviders(inherited.providers), // 保留 bundle 层路由
      ...asProviders(current.providers), // profile 层已有键优先（逐键 profile 胜）
      // 只补缺失键，已声明键（含手改 models / baseURL）不覆盖
      [ROUTE_ID]: effectiveRoute(asProviders(inherited.providers)[ROUTE_ID], asProviders(current.providers)[ROUTE_ID]),
    },
  }))
  const modelsDesc = routeModelIds(effectiveRoute(asProviders(snap?.inherited.providers)[ROUTE_ID], asProviders(snap?.override.providers)[ROUTE_ID]))
  deps.log.info(
    profileDeclared
      ? `${ROUTE_ID} 路由沿用 profile 声明（${modelsDesc ?? '清单照声明'}），仅补齐缺失键后写盘`
      : `${ROUTE_ID} 路由按插件默认目录（${modelsDesc ?? 'models 段'}）写入 profile patch`,
  )
  const registered = deps.llm?.listProviders().some((provider) => provider.id === ROUTE_ID) ?? false
  if (registered) {
    deps.log.info(`${ROUTE_ID} 路由已写入 profile patch 并在 llm 目录注册`)
  } else {
    deps.log.warn(`${ROUTE_ID} 路由已写入 profile patch，但 llm 目录尚未注册（可能待宿主重载配置生效）`)
  }
  return { ok: registered, changed: true, registered }
}

/**
 * 摘除 ZCode 计划路由（与 {@link installRoute} 对称）：复制 `current` 后
 * `delete providers['zcode-plan']`；`providers` 因此为空时**保留空对象**，不连带
 * 删除 `providers` 键（避免改动用户其它键的存在性）。只删本键，不碰
 * `agent-default-model`。幂等：override 层本无此键时跳过写盘。
 *
 * @param deps - config-editor 端口与诊断出口。
 * @returns `{ok, changed}`；no-row 时 `{ok:false, reason:'no-llm-pi-ai-row'}`。
 */
export async function removeRoute(deps: Pick<RouteDeps, 'configEditor' | 'log'>): Promise<RouteMutationResult> {
  const entry = findLlmPiAiEntry(deps.configEditor)
  if (entry === undefined) {
    deps.log.warn(`未找到 ${ROUTE_ENTRY_ID} 条目：无 ${ROUTE_ID} 路由可摘除`)
    return { ok: false, changed: false, reason: 'no-llm-pi-ai-row' }
  }
  const snap = deps.configEditor.configuration().find((layer) => layer.entry === entry)
  if (snap !== undefined && !(ROUTE_ID in asProviders(snap.override.providers))) {
    deps.log.info(`profile patch 里本无 ${ROUTE_ID} 路由：跳过写盘（幂等短路）`)
    return { ok: true, changed: false }
  }
  await deps.configEditor.edit(entry, (current) => {
    const providers = { ...asProviders(current.providers) }
    delete providers[ROUTE_ID]
    return { ...current, providers }
  })
  deps.log.info(`${ROUTE_ID} 路由已从 profile patch 摘除（仅删本键）`)
  return { ok: true, changed: true }
}

/**
 * 读取路由状态（H12 `routeState({configEditor, llm})`，纯只读、零写盘）：
 * `declared` 看 profile patch 的 override / inherited 并集里是否声明了本键；
 * `registered` 看 llm 目录当前是否注册了本路由。
 *
 * @param deps - config-editor / llm 目录端口（llm 可缺席）。
 * @returns `{declared, registered}`。
 */
export function routeState(deps: Pick<RouteDeps, 'configEditor' | 'llm'>): RouteState {
  const entry = findLlmPiAiEntry(deps.configEditor)
  const snap = entry === undefined ? undefined : deps.configEditor.configuration().find((layer) => layer.entry === entry)
  const declared =
    snap !== undefined &&
    (ROUTE_ID in asProviders(snap.override.providers) || ROUTE_ID in asProviders(snap.inherited.providers))
  const registered = deps.llm?.listProviders().some((provider) => provider.id === ROUTE_ID) ?? false
  return { declared, registered }
}
