/**
 * 默认档测试（规范：dsh-session-tool-toggle —— 默认档定位、校验降级与原子写）。
 *
 * 一个用例只钉一条规则：路径定位（`$DSH_HOME` / 覆盖值 / 未设时只验形状）、两级降级
 * （字段级 → 整份空档、条目级 → 逐条丢弃 + 汇总一条 warn）、写完读回一致、空数组合法、
 * 生产端口的权限位（0o600 / 0o700），以及快照语义（排序去重、不改 `disabled`/`seeded`）。
 *
 * 全部经假 `DefaultsIo` 与假 `SpecLog` 驱动：**不读写真实 `$DSH_HOME` 或用户目录**，
 * 生产端口本身也用注入的低层假实现断言，因此套件跑在纯内存里。
 */
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULTS_DIR_MODE,
  DEFAULTS_DIR_NAME,
  DEFAULTS_FILE_MODE,
  DEFAULTS_FILE_NAME,
  EMPTY_DEFAULTS,
  createNodeDefaultsIo,
  defaultsPath,
  readDefaults,
  withSnapshot,
  writeDefaults,
} from '../src/host/defaults.ts'
import type { DefaultsFile, DefaultsIo, SessionToolState, SpecLog } from '../src/host/types.ts'

/** 假文件系统里的默认档绝对路径（形状与生产一致，但不指向任何真实文件）。 */
const DEFAULTS_PATH = '/fake/dsh-home/session-tool-toggle/defaults.json'

/** 收集 warn 的假日志（与 state / record-store 套件同形）。 */
function recordingLog(): { log: SpecLog; warnings: string[] } {
  const warnings: string[] = []
  return {
    log: { info: () => {}, warn: (message) => warnings.push(message), error: () => {} },
    warnings,
  }
}

/** 构造 Node 风格错误（只带 `code`，便于断言降级文案）。 */
function fsError(code: string, path: string): NodeJS.ErrnoException {
  const error = new Error(`${code}: 模拟的端口错误，${path}`) as NodeJS.ErrnoException
  error.code = code
  return error
}

/** 假端口的构造参数。 */
interface FakeIoOptions {
  /** 预置文件（路径 → 文本）。 */
  readonly files?: Record<string, string>
  /** 让所有读失败：用于 `EACCES` 这类「非缺失」错误。 */
  readonly readError?: Error
  /** 让所有写失败：用于默认档不可写。 */
  readonly writeError?: Error
}

/** 假端口的读数面。 */
interface FakeIoResult {
  /** 端口本身。 */
  readonly io: DefaultsIo
  /** 端口里的当前文件内容（写成功后可见）。 */
  readonly files: Map<string, string>
  /** 每次写成功的路径与完整内容（原子提交的可见面）。 */
  readonly writes: { readonly path: string; readonly data: string }[]
}

/**
 * 内存版 `DefaultsIo`：读缺失抛 `ENOENT`，写成功即整份替换（与原子写的可观察语义一致）。
 * @param options - 预置内容与故障注入。
 * @returns 端口 + 可断言的内部状态。
 */
function fakeIo(options: FakeIoOptions = {}): FakeIoResult {
  const files = new Map(Object.entries(options.files ?? {}))
  const writes: { path: string; data: string }[] = []
  return {
    files,
    writes,
    io: {
      readFile: async (path) => {
        if (options.readError !== undefined) throw options.readError
        const text = files.get(path)
        if (text === undefined) throw fsError('ENOENT', path)
        return text
      },
      writeFile: async (path, data) => {
        if (options.writeError !== undefined) throw options.writeError
        writes.push({ path, data })
        files.set(path, data)
      },
    },
  }
}

/** 构造一份默认档（只给 `disabled`，版本恒为 1）。 */
function defaultsOf(disabled: readonly string[]): DefaultsFile {
  return { version: 1, disabled }
}

/** 构造一份会话状态；只覆盖用例关心的字段。 */
function stateOf(overrides: Partial<SessionToolState> = {}): SessionToolState {
  return { version: 1, disabled: [], snapshot: [], seeded: false, updatedAt: 0, ...overrides }
}

describe('defaultsPath', () => {
  afterEach(() => {
    // 环境变量在每个用例后复原：路径断言不依赖宿主真实的 $DSH_HOME。
    vi.unstubAllEnvs()
  })

  it('DSH_HOME 有值时落在 `$DSH_HOME/session-tool-toggle/defaults.json`', () => {
    const home = join(tmpdir(), 'stt-defaults-home')
    vi.stubEnv('DSH_HOME', home)

    expect(defaultsPath()).toBe(join(home, DEFAULTS_DIR_NAME, DEFAULTS_FILE_NAME))
  })

  it('config.defaultsFile 非空时原样返回（不拼 home、不做归一）', () => {
    vi.stubEnv('DSH_HOME', join(tmpdir(), 'stt-defaults-home'))
    const configured = join(tmpdir(), 'custom', '..', 'mine.json')

    expect(defaultsPath(configured)).toBe(configured)
    expect(defaultsPath('/opt/stt/my-defaults.json')).toBe('/opt/stt/my-defaults.json')
  })

  it('空串 / 纯空白覆盖值视为未设，回落到 DSH_HOME', () => {
    const home = join(tmpdir(), 'stt-defaults-home')
    vi.stubEnv('DSH_HOME', home)
    const expected = join(home, DEFAULTS_DIR_NAME, DEFAULTS_FILE_NAME)

    expect(defaultsPath('')).toBe(expected)
    expect(defaultsPath('   ')).toBe(expected)
  })

  it('DSH_HOME 未设时落在 ~/.dsh 下（只验证路径形状，不碰文件系统）', () => {
    vi.stubEnv('DSH_HOME', '')

    expect(defaultsPath()).toBe(join(homedir(), '.dsh', DEFAULTS_DIR_NAME, DEFAULTS_FILE_NAME))
  })
})

describe('readDefaults', () => {
  it('正常读取：排序去重后返回，不告警', async () => {
    const fake = fakeIo({
      files: {
        [DEFAULTS_PATH]: JSON.stringify({
          version: 1,
          disabled: ['mcp:b', 'mcp:a', 'mcp:a'],
        }),
      },
    })
    const { log, warnings } = recordingLog()

    await expect(readDefaults(DEFAULTS_PATH, fake.io, log)).resolves.toEqual(
      defaultsOf(['mcp:a', 'mcp:b']),
    )
    expect(warnings).toEqual([])
  })

  it('规范形归一（`skill` / `mcp:a::*`），语义不变因此不告警', async () => {
    const fake = fakeIo({
      files: {
        [DEFAULTS_PATH]: JSON.stringify({
          version: 1,
          disabled: ['mcp:a::*', 'skill', 'mcp:a'],
        }),
      },
    })
    const { log, warnings } = recordingLog()

    await expect(readDefaults(DEFAULTS_PATH, fake.io, log)).resolves.toEqual(
      defaultsOf(['mcp:a', 'tool:skill']),
    )
    expect(warnings).toEqual([])
  })

  it('半写 JSON → 空档 + 一条 warn（含路径与原因）', async () => {
    const fake = fakeIo({ files: { [DEFAULTS_PATH]: '{"version":1,"disabled":["mcp:a"' } })
    const { log, warnings } = recordingLog()

    await expect(readDefaults(DEFAULTS_PATH, fake.io, log)).resolves.toBe(EMPTY_DEFAULTS)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('不是合法 JSON')
    expect(warnings[0]).toContain(DEFAULTS_PATH)
    expect(warnings[0]).toContain('已按空档处理')
  })

  it('完全不是 JSON → 空档 + warn', async () => {
    const fake = fakeIo({ files: { [DEFAULTS_PATH]: 'not json' } })
    const { log, warnings } = recordingLog()

    await expect(readDefaults(DEFAULTS_PATH, fake.io, log)).resolves.toBe(EMPTY_DEFAULTS)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('不是合法 JSON')
  })

  it('空文件 / 纯空白（写到一半被截断）→ 空档 + warn', async () => {
    for (const text of ['', '  \n']) {
      const fake = fakeIo({ files: { [DEFAULTS_PATH]: text } })
      const { log, warnings } = recordingLog()

      await expect(readDefaults(DEFAULTS_PATH, fake.io, log)).resolves.toBe(EMPTY_DEFAULTS)
      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toContain('不是合法 JSON')
    }
  })

  it('文件缺失（ENOENT）→ 空档 + warn，不抛错', async () => {
    const fake = fakeIo()
    const { log, warnings } = recordingLog()

    await expect(readDefaults(DEFAULTS_PATH, fake.io, log)).resolves.toBe(EMPTY_DEFAULTS)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('不可读')
    expect(warnings[0]).toContain('文件不存在（ENOENT）')
  })

  it('其他读错误（EACCES）→ 空档 + warn，不抛错', async () => {
    const fake = fakeIo({ readError: fsError('EACCES', DEFAULTS_PATH) })
    const { log, warnings } = recordingLog()

    await expect(readDefaults(DEFAULTS_PATH, fake.io, log)).resolves.toBe(EMPTY_DEFAULTS)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('EACCES')
  })

  it('version 不是 1 → 整份降级 + warn', async () => {
    for (const payload of [
      { version: 2, disabled: [] },
      { version: '1', disabled: [] },
      { disabled: ['mcp:a'] },
    ]) {
      const fake = fakeIo({ files: { [DEFAULTS_PATH]: JSON.stringify(payload) } })
      const { log, warnings } = recordingLog()

      await expect(readDefaults(DEFAULTS_PATH, fake.io, log)).resolves.toBe(EMPTY_DEFAULTS)
      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toContain('version 不是 1')
    }
  })

  it('disabled 不是数组（含缺字段）→ 整份降级 + warn', async () => {
    for (const payload of [
      { version: 1, disabled: 'mcp:a' },
      { version: 1, disabled: { 0: 'mcp:a' } },
      { version: 1 },
    ]) {
      const fake = fakeIo({ files: { [DEFAULTS_PATH]: JSON.stringify(payload) } })
      const { log, warnings } = recordingLog()

      await expect(readDefaults(DEFAULTS_PATH, fake.io, log)).resolves.toBe(EMPTY_DEFAULTS)
      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toContain('disabled 不是数组')
    }
  })

  it('顶层不是对象 → 整份降级 + warn', async () => {
    for (const text of ['[]', 'null', '"mcp:a"', '42']) {
      const fake = fakeIo({ files: { [DEFAULTS_PATH]: text } })
      const { log, warnings } = recordingLog()

      await expect(readDefaults(DEFAULTS_PATH, fake.io, log)).resolves.toBe(EMPTY_DEFAULTS)
      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toContain('顶层不是对象')
    }
  })

  it('条目级非法只丢那一条（不整份降级），并汇总一条 warn', async () => {
    const fake = fakeIo({
      files: {
        [DEFAULTS_PATH]: JSON.stringify({
          version: 1,
          disabled: ['bogus', 'mcp:a', 42],
        }),
      },
    })
    const { log, warnings } = recordingLog()

    await expect(readDefaults(DEFAULTS_PATH, fake.io, log)).resolves.toEqual(defaultsOf(['mcp:a']))
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('有 2 条条目不合法')
    expect(warnings[0]).toContain('已丢弃')
  })

  it('保护名单内的条目读入时就丢弃（默认档关不掉 bash 这类基础工具）', async () => {
    const fake = fakeIo({
      files: {
        [DEFAULTS_PATH]: JSON.stringify({
          version: 1,
          disabled: ['tool:bash', 'mcp:a'],
        }),
      },
    })
    const { log, warnings } = recordingLog()

    await expect(readDefaults(DEFAULTS_PATH, fake.io, log)).resolves.toEqual(defaultsOf(['mcp:a']))
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('有 1 条条目不合法')
  })

  it('合法空档不告警，且与降级结果是不同对象', async () => {
    const fake = fakeIo({
      files: { [DEFAULTS_PATH]: JSON.stringify({ version: 1, disabled: [] }) },
    })
    const { log, warnings } = recordingLog()

    const file = await readDefaults(DEFAULTS_PATH, fake.io, log)
    expect(file).toEqual(defaultsOf([]))
    expect(file).not.toBe(EMPTY_DEFAULTS)
    expect(warnings).toEqual([])
  })

  it('未知顶层字段被忽略（前向兼容）', async () => {
    const fake = fakeIo({
      files: {
        [DEFAULTS_PATH]: JSON.stringify({
          version: 1,
          disabled: ['mcp:a'],
          future: { note: '以后加的字段' },
        }),
      },
    })
    const { log, warnings } = recordingLog()

    await expect(readDefaults(DEFAULTS_PATH, fake.io, log)).resolves.toEqual(defaultsOf(['mcp:a']))
    expect(warnings).toEqual([])
  })
})

describe('writeDefaults', () => {
  it('写入后读回一致（原子写后集合相同）', async () => {
    const fake = fakeIo()
    await writeDefaults(DEFAULTS_PATH, defaultsOf(['tool:skill', 'mcp:a']), fake.io)

    expect(fake.writes).toHaveLength(1)
    expect(fake.writes[0].path).toBe(DEFAULTS_PATH)

    const { log, warnings } = recordingLog()
    await expect(readDefaults(DEFAULTS_PATH, fake.io, log)).resolves.toEqual(
      defaultsOf(['mcp:a', 'tool:skill']),
    )
    expect(warnings).toEqual([])
  })

  it('写入前排序去重，内容是给人手编的稳定 JSON', async () => {
    const fake = fakeIo()
    await writeDefaults(DEFAULTS_PATH, defaultsOf(['tool:skill', 'mcp:a', 'tool:skill']), fake.io)

    const data = fake.writes[0].data
    expect(JSON.parse(data)).toEqual(defaultsOf(['mcp:a', 'tool:skill']))
    expect(data.startsWith('{\n  "version": 1,\n  "disabled": [')).toBe(true)
    expect(data.endsWith('\n')).toBe(true)
  })

  it('空数组合法：写入成功、读回空档且不告警', async () => {
    const fake = fakeIo()
    await writeDefaults(DEFAULTS_PATH, defaultsOf([]), fake.io)

    expect(JSON.parse(fake.writes[0].data)).toEqual(defaultsOf([]))

    const { log, warnings } = recordingLog()
    await expect(readDefaults(DEFAULTS_PATH, fake.io, log)).resolves.toEqual(defaultsOf([]))
    expect(warnings).toEqual([])
  })

  it('写失败向调用方抛错，且不留下半份内容', async () => {
    const fake = fakeIo({ writeError: fsError('EACCES', DEFAULTS_PATH) })

    await expect(
      writeDefaults(DEFAULTS_PATH, defaultsOf(['mcp:a']), fake.io),
    ).rejects.toThrow('EACCES')
    expect(fake.writes).toEqual([])
    expect(fake.files.has(DEFAULTS_PATH)).toBe(false)
  })
})

describe('createNodeDefaultsIo（生产端口）', () => {
  it('写走 writeFileAtomic，权限位 0o600 / 目录 0o700', async () => {
    const calls: { path: string; data: string; options: unknown }[] = []
    const io = createNodeDefaultsIo({
      writeAtomic: async (path, data, options) => {
        calls.push({ path, data, options: { ...options } })
      },
    })

    await io.writeFile(DEFAULTS_PATH, '{"version":1,"disabled":[]}\n')

    expect(calls).toEqual([
      {
        path: DEFAULTS_PATH,
        data: '{"version":1,"disabled":[]}\n',
        options: { mode: 0o600, dirMode: 0o700 },
      },
    ])
    expect(DEFAULTS_FILE_MODE).toBe(0o600)
    expect(DEFAULTS_DIR_MODE).toBe(0o700)
  })

  it('读走注入的 readFile（生产默认是 node:fs）', async () => {
    const io = createNodeDefaultsIo({ readFile: async (path) => `# ${path}` })

    await expect(io.readFile(DEFAULTS_PATH)).resolves.toBe(`# ${DEFAULTS_PATH}`)
  })

  it('生产写入 → readDefaults 读回一致（完整链路，不碰真实文件系统）', async () => {
    let stored = ''
    const io = createNodeDefaultsIo({
      readFile: async () => stored,
      writeAtomic: async (_path, data) => {
        stored = data
      },
    })
    const { log, warnings } = recordingLog()

    await writeDefaults(DEFAULTS_PATH, defaultsOf(['mcp:a', 'tool:skill']), io)
    await expect(readDefaults(DEFAULTS_PATH, io, log)).resolves.toEqual(
      defaultsOf(['mcp:a', 'tool:skill']),
    )
    expect(warnings).toEqual([])
  })
})

describe('withSnapshot', () => {
  it('排序去重后写进 snapshot，disabled / seeded / updatedAt 原样', () => {
    const state = stateOf({ disabled: ['tool:b'], seeded: true, updatedAt: 42 })

    const next = withSnapshot(state, ['tool:skill', 'mcp:a', 'mcp:a'])

    expect(next).toEqual({
      version: 1,
      disabled: ['tool:b'],
      snapshot: ['mcp:a', 'tool:skill'],
      seeded: true,
      updatedAt: 42,
    })
  })

  it('空快照合法（没有默认关闭时 /tools reset 等价于全开）', () => {
    expect(withSnapshot(stateOf(), []).snapshot).toEqual([])
  })

  it('seeded 保持入参原值（置位由播种写入点负责）', () => {
    expect(withSnapshot(stateOf({ seeded: false }), ['mcp:a']).seeded).toBe(false)
    expect(withSnapshot(stateOf({ seeded: true }), ['mcp:a']).seeded).toBe(true)
  })

  it('纯函数：不改入参，返回新对象且不共享快照数组', () => {
    const snapshot = ['mcp:a']
    const state = stateOf({ disabled: ['tool:b'], updatedAt: 7 })

    const next = withSnapshot(state, snapshot)

    expect(state).toEqual(stateOf({ disabled: ['tool:b'], updatedAt: 7 }))
    expect(next).not.toBe(state)
    expect(next.snapshot).not.toBe(snapshot)
    expect(snapshot).toEqual(['mcp:a'])
  })
})
