/**
 * 持久化通道测试（规范：dsh-session-tool-toggle —— 整值记录、host-only 投影、读判定与降级）。
 *
 * 覆盖四类事实：
 *
 * 1. **记录契约**：`recordOf` 的判定与宿主 `pluginRecordOf` 同构；`write` 一次写入整值
 *    载荷且 `type === STATE_RECORD_TYPE`（D1）。
 * 2. **读判定顺序**：投影优先 → `snapshotEvents()` 重放兜底 → 空态 + 一次 warn（D10）。
 * 3. **降级**：宿主模块身份断言失败 → `MemoryStateStore`（`kind === 'memory'`，从不调
 *    append）；`appendPluginRecord` 抛错 → 内存后备、`kind` 切 `memory`、开关不丢。
 * 4. **fork 语义**：父会话前缀记录 + fork 后自身记录，折叠结果等价于只取 fork 后自身
 *    最后一条整值记录（整值事件规则）。
 *
 * 真实 `import()` 只用一个落盘 fixture 验证（`modulePath` 分支）；其余用假模块命名
 * 空间直接驱动 `adoptHostModule`，不需要拉起宿主。
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { adoptHostModule, loadHostSessionApi } from '../src/host/host-runtime.ts'
import {
  MemoryStateStore,
  RecordStateStore,
  createSessionToolToggleUnit,
  createStateStore,
  recordOf,
  sessionToolToggle,
  type SessionProjectionsLike,
} from '../src/host/record-store.ts'
import { EMPTY_STATE, STATE_RECORD_TYPE, foldStatus } from '../src/host/state.ts'
import type {
  HostSessionApi,
  SessionEventLike,
  SessionLike,
  SessionToolState,
  SpecLog,
} from '../src/host/types.ts'

/** 只关心返回值、不关心诊断的用例用它。 */
const QUIET_LOG: SpecLog = { info: () => {}, warn: () => {}, error: () => {} }

/** 收集 info / warn 的假日志（与仓库其他套件同形）。 */
function recordingLog(): { log: SpecLog; warnings: string[]; infos: string[] } {
  const warnings: string[] = []
  const infos: string[] = []
  return {
    log: {
      info: (message) => infos.push(message),
      warn: (message) => warnings.push(message),
      error: () => {},
    },
    warnings,
    infos,
  }
}

/** 构造一份状态；只覆盖用例关心的字段。 */
function stateOf(overrides: Partial<SessionToolState> = {}): SessionToolState {
  return { version: 1, disabled: [], snapshot: [], seeded: false, updatedAt: 0, ...overrides }
}

/** 构造一条本插件的整值记录事件。 */
function recordEvent(seq: number, data: unknown): SessionEventLike {
  return { type: STATE_RECORD_TYPE, seq, time: 1_700_000_000_000 + seq, data, ignorable: true }
}

/** 构造一条非本插件事件（哪怕载荷像状态也不该被折叠）。 */
function foreignEvent(seq: number): SessionEventLike {
  return { type: 'user/message', seq, time: 1_700_000_000_000 + seq, data: { text: '你好' } }
}

/**
 * 假会话：只实现本插件用到的会话面。
 *
 * 类实例的 `constructor` 就是 `FakeSession` 本身，因此 `adoptHostModule({ Session:
 * FakeSession, … })` 能通过身份断言——这正是单测里「宿主那一份」的替身。
 */
class FakeSession {
  readonly id: string
  readonly header = { isSeeded: true, createdAt: 1_700_000_000_000 }
  private readonly events: readonly SessionEventLike[]

  constructor(id: string, events: readonly SessionEventLike[] = []) {
    this.id = id
    this.events = events
  }

  eventAt(seq: number): SessionEventLike | undefined {
    return this.events.find((event) => event.seq === seq)
  }

  snapshotEvents(
    fromSeq = Number.NEGATIVE_INFINITY,
    toSeqExclusive = Number.POSITIVE_INFINITY,
  ): readonly SessionEventLike[] {
    return this.events.filter((event) => event.seq >= fromSeq && event.seq < toSeqExclusive)
  }
}

/** 读面不可用的会话：`snapshotEvents` 抛错（投影也缺席时的最后一条兜底路径）。 */
class UnreadableSession extends FakeSession {
  override snapshotEvents(): readonly SessionEventLike[] {
    throw new Error('会话已关闭，日志读面不可用')
  }
}

/** 一次 append 的调用记录。 */
interface AppendCall {
  readonly session: SessionLike
  readonly type: string
  readonly data: unknown
}

/**
 * 假宿主写入面。
 * @param fail - true 时抛错（模拟 reenter / brand 错误）。
 */
function recordingHost(fail = false): { host: HostSessionApi; calls: AppendCall[] } {
  const calls: AppendCall[] = []
  return {
    calls,
    host: {
      appendPluginRecord(session, type, data) {
        calls.push({ session, type, data })
        if (fail) throw new Error('reenter another append publication')
        return calls.length
      },
    },
  }
}

/** 假投影驱动：`state` 为 undefined 模拟 key 未注册。 */
function projectionsOf(state: SessionToolState | undefined): SessionProjectionsLike {
  return { stateOf: () => state }
}

describe('recordOf：插件记录判定（宿主 pluginRecordOf 的最小子集）', () => {
  it('ignorable === true 且 type 合法时返回 type/seq/time/data', () => {
    const event = recordEvent(3, { version: 1 })
    expect(recordOf(event)).toEqual({
      type: STATE_RECORD_TYPE,
      seq: 3,
      time: event.time,
      data: { version: 1 },
    })
  })

  it('缺 ignorable 返回 undefined（未知必填事件不是插件记录）', () => {
    expect(recordOf({ type: STATE_RECORD_TYPE, seq: 1, time: 1, data: {} })).toBeUndefined()
  })

  it('type 不匹配插件记录文法返回 undefined', () => {
    expect(
      recordOf({ type: 'user/message', seq: 1, time: 1, data: {}, ignorable: true }),
    ).toBeUndefined()
    expect(
      recordOf({ type: 'plugin:Bad', seq: 1, time: 1, data: {}, ignorable: true }),
    ).toBeUndefined()
  })
})

describe('投影单元 sessionToolToggle：形状与纯折叠', () => {
  it('key / stateVersion 与设计一致，init 返回 EMPTY_STATE（默认实例亦然）', () => {
    const unit = createSessionToolToggleUnit(QUIET_LOG)
    expect(unit.key).toBe('sessionToolToggle')
    expect(unit.stateVersion).toBe(1)
    expect(unit.init()).toBe(EMPTY_STATE)
    expect(sessionToolToggle.key).toBe('sessionToolToggle')
    expect(sessionToolToggle.stateVersion).toBe(1)
    expect(sessionToolToggle.init()).toBe(EMPTY_STATE)
  })

  it('非本插件事件（含其他插件记录、缺 ignorable）返回同一引用', () => {
    const unit = createSessionToolToggleUnit(QUIET_LOG)
    const state = stateOf({ disabled: ['mcp:a'], seeded: true })
    expect(unit.apply(state, foreignEvent(1))).toBe(state)
    expect(
      unit.apply(state, {
        type: 'plugin:other/state',
        seq: 2,
        time: 2,
        data: state,
        ignorable: true,
      }),
    ).toBe(state)
    expect(
      unit.apply(state, { type: STATE_RECORD_TYPE, seq: 3, time: 3, data: state }),
    ).toBe(state)
  })

  it('本插件合法记录折出 owner 自校验后的规范形状态', () => {
    const unit = createSessionToolToggleUnit(QUIET_LOG)
    const next = unit.apply(
      stateOf(),
      recordEvent(4, stateOf({ disabled: ['mcp:b', 'mcp:a'], seeded: true, updatedAt: 9 })),
    )
    expect(next).toEqual({
      version: 1,
      disabled: ['mcp:a', 'mcp:b'],
      snapshot: [],
      seeded: true,
      updatedAt: 9,
    })
  })

  it('本插件坏载荷 → EMPTY_STATE + 一条 warn（不回退到更早记录）', () => {
    const { log, warnings } = recordingLog()
    const unit = createSessionToolToggleUnit(log)
    expect(unit.apply(stateOf({ disabled: ['mcp:a'], seeded: true }), recordEvent(4, { version: 2 })))
      .toBe(EMPTY_STATE)
    expect(warnings).toHaveLength(1)
  })
})

describe('RecordStateStore.write：整值记录', () => {
  it('写一次后 payload 是整值引用、type 是 STATE_RECORD_TYPE、session 是目标会话', () => {
    const { host, calls } = recordingHost()
    const store = new RecordStateStore({ host, log: QUIET_LOG })
    const session = new FakeSession('s1')
    const state = stateOf({ disabled: ['mcp:a'], seeded: true, updatedAt: 12 })

    store.write(session, state)

    expect(calls).toHaveLength(1)
    expect(calls[0]?.type).toBe(STATE_RECORD_TYPE)
    expect(calls[0]?.data).toBe(state)
    expect(calls[0]?.session).toBe(session)
    expect(store.kind).toBe('record')
  })

  it('已播种状态的 snapshot 也随整值一起写（不是增量）', () => {
    const { host, calls } = recordingHost()
    const store = new RecordStateStore({ host, log: QUIET_LOG })
    const state = stateOf({ disabled: ['mcp:a'], snapshot: ['mcp:b'], seeded: true })
    store.write(new FakeSession('s1'), state)
    expect(calls[0]?.data).toEqual({
      version: 1,
      disabled: ['mcp:a'],
      snapshot: ['mcp:b'],
      seeded: true,
      updatedAt: 0,
    })
  })
})

describe('读判定顺序：投影优先（D10 第 1 步）', () => {
  it('投影有效时用它，且不触碰日志读面', () => {
    const projected = stateOf({ disabled: ['mcp:b'], seeded: true })
    const store = new RecordStateStore({
      host: recordingHost().host,
      projections: projectionsOf(projected),
      log: QUIET_LOG,
    })
    // 日志读面抛错：若实现先读日志，这个用例会变成空态而不是投影值。
    const session = new UnreadableSession('s1', [
      recordEvent(1, stateOf({ disabled: ['mcp:a'], seeded: true })),
    ])
    expect(store.read(session)).toBe(projected)
  })

  it('投影读取抛错 → 回落日志重放（不误报降级）', () => {
    const { log, warnings } = recordingLog()
    const session = new FakeSession('s1', [
      recordEvent(1, stateOf({ disabled: ['mcp:a'], seeded: true })),
    ])
    const store = new RecordStateStore({
      host: recordingHost().host,
      projections: {
        stateOf: () => {
          throw new Error('投影服务已卸载')
        },
      },
      log,
    })
    expect(store.read(session).disabled).toEqual(['mcp:a'])
    expect(warnings).toHaveLength(0)
  })
})

describe('读判定顺序：投影缺失时日志重放兜底（D10 第 2 步）', () => {
  it('无 sessionProjections + 两条记录 → 最后一条的折叠结果', () => {
    const session = new FakeSession('s1', [
      recordEvent(1, stateOf({ disabled: ['mcp:a'], seeded: true })),
      recordEvent(2, stateOf({ disabled: ['mcp:a', 'mcp:b'], seeded: true })),
    ])
    const store = new RecordStateStore({ host: recordingHost().host, log: QUIET_LOG })
    expect(store.read(session).disabled).toEqual(['mcp:a', 'mcp:b'])
  })

  it('投影存在但 stateOf 返回 undefined（key 未注册）→ 同样重放', () => {
    const session = new FakeSession('s1', [
      recordEvent(1, stateOf({ disabled: ['mcp:a'], seeded: true })),
      recordEvent(2, stateOf({ disabled: ['mcp:b'], seeded: true })),
    ])
    const store = new RecordStateStore({
      host: recordingHost().host,
      projections: projectionsOf(undefined),
      log: QUIET_LOG,
    })
    expect(store.read(session).disabled).toEqual(['mcp:b'])
  })

  it('日志里没有本插件记录 → EMPTY_STATE（空日志不告警）', () => {
    const { log, warnings } = recordingLog()
    const session = new FakeSession('s1', [foreignEvent(1)])
    const store = new RecordStateStore({ host: recordingHost().host, log })
    expect(store.read(session)).toBe(EMPTY_STATE)
    expect(warnings).toHaveLength(0)
  })

  it('两种读面都不可用 → EMPTY_STATE 且只 warn 一次（D10 第 3 步）', () => {
    const { log, warnings } = recordingLog()
    const session = new UnreadableSession('s1')
    const store = new RecordStateStore({ host: recordingHost().host, log })
    expect(store.read(session)).toBe(EMPTY_STATE)
    expect(store.read(session)).toBe(EMPTY_STATE)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('没有可用的读面')
  })
})

describe('写失败降级：内存态且不丢开关', () => {
  it('append 抛错 → kind 变 memory、read 返回刚写入的整值、只 warn 一次', () => {
    const { log, warnings } = recordingLog()
    const { host, calls } = recordingHost(true)
    const store = new RecordStateStore({ host, log })
    const session = new FakeSession('s1')
    const state = stateOf({ disabled: ['mcp:a'], seeded: true, updatedAt: 7 })

    // 写失败不向上抛：命令面的成功语义是「开关已生效」。
    expect(() => store.write(session, state)).not.toThrow()

    expect(store.kind).toBe('memory')
    expect(calls).toHaveLength(1)
    expect(store.read(session)).toBe(state)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('已降级为内存态')
  })

  it('降级后 write 只更内存、不再尝试 append；read 始终读到最新开关', () => {
    const { log, warnings } = recordingLog()
    const { host, calls } = recordingHost(true)
    const store = new RecordStateStore({ host, log })
    const session = new FakeSession('s1')

    store.write(session, stateOf({ disabled: ['mcp:a'], seeded: true }))
    const next = stateOf({ disabled: ['mcp:b'], seeded: true })
    store.write(session, next)

    expect(calls).toHaveLength(1)
    expect(store.kind).toBe('memory')
    expect(store.read(session)).toBe(next)
    expect(warnings).toHaveLength(1)
  })

  it('降级后其他会话仍按投影 / 日志读（内存后备按会话分槽）', () => {
    const { host } = recordingHost(true)
    const store = new RecordStateStore({ host, log: QUIET_LOG })
    const failed = new FakeSession('failed')
    const other = new FakeSession('other', [
      recordEvent(1, stateOf({ disabled: ['mcp:b'], seeded: true })),
    ])

    store.write(failed, stateOf({ disabled: ['mcp:a'], seeded: true }))

    expect(store.kind).toBe('memory')
    expect(store.read(failed).disabled).toEqual(['mcp:a'])
    expect(store.read(other).disabled).toEqual(['mcp:b'])
  })
})

describe('宿主身份断言失败 → 降级内存态（D1）', () => {
  it('mod.Session !== session.constructor → adopt 返回 undefined 且 warn 一次', () => {
    const { log, warnings } = recordingLog()
    const session = new FakeSession('s1')
    class ForeignSession {}
    const api = adoptHostModule(
      { Session: ForeignSession, appendPluginRecord: () => 1 },
      session,
      log,
    )
    expect(api).toBeUndefined()
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('身份断言')
  })

  it('断言失败后 createStateStore 给 MemoryStateStore：kind === memory 且 append 调用数 0', () => {
    const { host, calls } = recordingHost()
    const session = new FakeSession('s1')
    class ForeignSession {}
    const api = adoptHostModule(
      { Session: ForeignSession, appendPluginRecord: host.appendPluginRecord },
      session,
      QUIET_LOG,
    )
    const store = createStateStore({ host: api, log: QUIET_LOG })

    expect(store.kind).toBe('memory')
    store.write(session, stateOf({ disabled: ['mcp:a'], seeded: true }))
    expect(calls).toHaveLength(0)
    // 内存态闭环：降级通道的写入仍然可读回（开关不丢）。
    expect(store.read(session).disabled).toEqual(['mcp:a'])
  })

  it('身份匹配且导出 appendPluginRecord 时给 RecordStateStore', () => {
    const { host } = recordingHost()
    const api = adoptHostModule(
      { Session: FakeSession, appendPluginRecord: host.appendPluginRecord },
      new FakeSession('s1'),
      QUIET_LOG,
    )
    expect(api).toBeDefined()
    expect(createStateStore({ host: api, log: QUIET_LOG })).toBeInstanceOf(RecordStateStore)
  })

  it('身份匹配但缺 appendPluginRecord 导出 → undefined + warn', () => {
    const { log, warnings } = recordingLog()
    const api = adoptHostModule({ Session: FakeSession }, new FakeSession('s1'), log)
    expect(api).toBeUndefined()
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('appendPluginRecord')
  })
})

describe('MemoryStateStore：内存态闭环', () => {
  it('read 空为 EMPTY_STATE；write 后按会话读回，不串其他会话', () => {
    const store = new MemoryStateStore()
    const a = new FakeSession('a')
    const b = new FakeSession('b')
    expect(store.kind).toBe('memory')
    expect(store.read(a)).toBe(EMPTY_STATE)

    const state = stateOf({ disabled: ['mcp:a'], seeded: true })
    store.write(a, state)
    expect(store.read(a)).toBe(state)
    expect(store.read(b)).toBe(EMPTY_STATE)
  })
})

describe('fork 前缀折叠等价（整值事件规则）', () => {
  it('父会话前缀 + fork 后自身记录 === 只取自身最后一条整值记录', () => {
    // 父会话在 fork 点前写过两条（a，然后 a+b）；子会话 fork 后自己又写了一条只关 b 的整值。
    const prefix = [
      recordEvent(1, stateOf({ disabled: ['mcp:a'], seeded: true })),
      recordEvent(2, stateOf({ disabled: ['mcp:a', 'mcp:b'], seeded: true })),
    ]
    const own = [recordEvent(3, stateOf({ disabled: ['mcp:b'], seeded: true }))]

    // 整值语义下最后一条即全部：前缀历史不参与折叠（若误做增量合并会得到 ['mcp:a','mcp:b']）。
    expect(foldStatus([...prefix, ...own], QUIET_LOG)).toEqual(foldStatus(own, QUIET_LOG))
    expect(foldStatus([...prefix, ...own], QUIET_LOG).disabled).toEqual(['mcp:b'])
  })

  it('RecordStateStore 的重放兜底同样与「只取自身日志」等价', () => {
    const forked = new FakeSession('forked', [
      recordEvent(1, stateOf({ disabled: ['mcp:a'], seeded: true })),
      recordEvent(2, stateOf({ disabled: ['mcp:a', 'mcp:b'], seeded: true })),
      recordEvent(3, stateOf({ disabled: ['mcp:b'], seeded: true })),
    ])
    const own = new FakeSession('own', [
      recordEvent(3, stateOf({ disabled: ['mcp:b'], seeded: true })),
    ])
    const store = new RecordStateStore({ host: recordingHost().host, log: QUIET_LOG })
    expect(store.read(forked)).toEqual(store.read(own))
  })
})

describe('loadHostSessionApi：解析梯形与身份断言', () => {
  it('modulePath 指向不存在的文件 → undefined，失败原因汇总成一条 warn', async () => {
    const { log, warnings } = recordingLog()
    const api = await loadHostSessionApi(new FakeSession('s1'), {
      modulePath: join(tmpdir(), 'stt-missing-session-module.mjs'),
      log,
    })
    expect(api).toBeUndefined()
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('已降级为内存态')
    expect(warnings[0]).toContain('hostModuleBase')
  })

  it('modulePath 指向真实模块 → 适配出写入面并通过身份断言', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'stt-host-runtime-'))
    try {
      const fixture = join(dir, 'session.mjs')
      await writeFile(
        fixture,
        [
          'export class Session {}',
          'export function appendPluginRecord() { return 42 }',
          '',
        ].join('\n'),
        'utf8',
      )
      const { Session } = (await import(pathToFileURL(fixture).href)) as {
        Session: new () => object
      }
      // fixture 的 Session 实例：身份断言的右值就是 session.constructor。
      const session = new Session() as unknown as SessionLike
      const { log, warnings } = recordingLog()

      const api = await loadHostSessionApi(session, { modulePath: fixture, log })

      expect(api).toBeDefined()
      expect(api?.appendPluginRecord(session, STATE_RECORD_TYPE, {})).toBe(42)
      expect(warnings).toHaveLength(0)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('modulePath 指向解析锚点目录 → 从该目录解析 dsh-session（hostModuleBase 语义）', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'stt-host-anchor-'))
    try {
      const packageDir = join(dir, 'node_modules', '@deepseek-ai', 'dsh-session')
      await mkdir(packageDir, { recursive: true })
      await writeFile(
        join(dir, 'package.json'),
        JSON.stringify({ name: 'stt-anchor-fixture', private: true }),
        'utf8',
      )
      await writeFile(
        join(packageDir, 'package.json'),
        JSON.stringify({ name: '@deepseek-ai/dsh-session', type: 'module', main: 'index.mjs' }),
        'utf8',
      )
      const fixture = join(packageDir, 'index.mjs')
      await writeFile(
        fixture,
        'export class Session {}\nexport function appendPluginRecord() { return 7 }\n',
        'utf8',
      )
      const { Session } = (await import(pathToFileURL(fixture).href)) as {
        Session: new () => object
      }
      const session = new Session() as unknown as SessionLike
      const { log } = recordingLog()

      const api = await loadHostSessionApi(session, { modulePath: dir, log })

      expect(api).toBeDefined()
      expect(api?.appendPluginRecord(session, STATE_RECORD_TYPE, {})).toBe(7)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('modulePath 加载的模块身份不匹配 → undefined + warn 含身份断言', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'stt-host-runtime-'))
    try {
      const fixture = join(dir, 'session.mjs')
      await writeFile(fixture, 'export class Session {}\nexport function appendPluginRecord() { return 1 }\n', 'utf8')
      const { log, warnings } = recordingLog()
      // 假会话的 constructor 是 FakeSession，与 fixture 的 Session 不是同一个类。
      const api = await loadHostSessionApi(new FakeSession('s1'), { modulePath: fixture, log })
      expect(api).toBeUndefined()
      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toContain('身份断言')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
