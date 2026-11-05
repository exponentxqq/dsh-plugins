/**
 * 工作区档测试（规范：dsh-session-tool-toggle —— 工作区级默认档）。
 *
 * 一个用例只钉一条规则：路径定位（`$DSH_HOME` / 覆盖值 / 未设时只验形状）、两级降级
 * （整份不可用 → `EMPTY_WORKSPACES`、条目级 → 逐条丢弃 + 汇总一条 warn）、写路径的稳定
 * 序列化与原子参数（0o600 / 0o700）、写失败原样抛，以及 `disabledOf` / `withEntry` /
 * `mergeSeed` 三个纯函数的语义。
 *
 * 全部经假 `WorkspaceIo`（与 `DefaultsIo` 同一形状）与假 `SpecLog` 驱动：**不读写真实
 * `$DSH_HOME` 或用户目录**，生产端口本身也用注入的低层假实现断言，因此套件跑在纯内存里。
 */
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULTS_DIR_MODE,
  DEFAULTS_DIR_NAME,
  DEFAULTS_FILE_MODE,
  createNodeDefaultsIo,
} from '../src/host/defaults.ts'
import {
  EMPTY_WORKSPACES,
  MAX_WORKSPACE_ENTRIES,
  MAX_WORKSPACE_KEY_LENGTH,
  WORKSPACES_FILE_NAME,
  WORKSPACES_VERSION,
  disabledOf,
  mergeSeed,
  readWorkspaces,
  withEntry,
  workspacesPath,
  writeWorkspaces,
} from '../src/host/workspaces.ts'
import type { WorkspaceDefaultsFile, WorkspaceIo } from '../src/host/workspaces.ts'
import type { SpecLog } from '../src/host/types.ts'

/** 假文件系统里的工作区档绝对路径（形状与生产一致，但不指向任何真实文件）。 */
const WORKSPACES_PATH = '/fake/dsh-home/session-tool-toggle/workspaces.json'

/** 超过键长上限的绝对路径（`/` + 4096 个字符 = 4097 字符）。 */
const TOO_LONG_KEY = `/${'x'.repeat(MAX_WORKSPACE_KEY_LENGTH)}`

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
  /** 让所有写失败：用于工作区档不可写。 */
  readonly writeError?: Error
}

/** 假端口的读数面。 */
interface FakeIoResult {
  /** 端口本身。 */
  readonly io: WorkspaceIo
  /** 端口里的当前文件内容（写成功后可见）。 */
  readonly files: Map<string, string>
  /** 每次写成功的路径与完整内容（原子提交的可见面）。 */
  readonly writes: { readonly path: string; readonly data: string }[]
}

/**
 * 内存版 `WorkspaceIo`：读缺失抛 `ENOENT`，写成功即整份替换（与原子写的可观察语义一致）。
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

/**
 * 构造一份工作区档（`workspaces` 的值只给 `disabled`，版本恒为当前版本）。
 * @param entries - 工作区键 → 关闭集。
 * @returns 完整的工作区档对象。
 */
function workspacesOf(
  entries: Readonly<Record<string, readonly string[]>>,
): WorkspaceDefaultsFile {
  return {
    version: WORKSPACES_VERSION,
    workspaces: Object.fromEntries(
      Object.entries(entries).map(([key, disabled]) => [key, { disabled }] as const),
    ),
  }
}

describe('空档与常量', () => {
  it('EMPTY_WORKSPACES 冻结且形状固定', () => {
    expect(EMPTY_WORKSPACES).toEqual({ version: 1, workspaces: {} })
    expect(Object.isFrozen(EMPTY_WORKSPACES)).toBe(true)
    expect(Object.isFrozen(EMPTY_WORKSPACES.workspaces)).toBe(true)
  })

  it('文件名 / 版本 / 上限常量与蓝图 §3.4 一致', () => {
    expect(WORKSPACES_FILE_NAME).toBe('workspaces.json')
    expect(WORKSPACES_VERSION).toBe(1)
    expect(MAX_WORKSPACE_ENTRIES).toBe(256)
    expect(MAX_WORKSPACE_KEY_LENGTH).toBe(4096)
  })
})

describe('workspacesPath', () => {
  afterEach(() => {
    // 环境变量在每个用例后复原：路径断言不依赖宿主真实的 $DSH_HOME。
    vi.unstubAllEnvs()
  })

  it('DSH_HOME 有值时落在 `$DSH_HOME/session-tool-toggle/workspaces.json`', () => {
    const home = join(tmpdir(), 'stt-workspaces-home')
    vi.stubEnv('DSH_HOME', home)

    expect(workspacesPath()).toBe(join(home, DEFAULTS_DIR_NAME, WORKSPACES_FILE_NAME))
  })

  it('config.workspacesFile 非空时原样返回（不拼 home、不做归一）', () => {
    vi.stubEnv('DSH_HOME', join(tmpdir(), 'stt-workspaces-home'))
    const configured = join(tmpdir(), 'custom', '..', 'mine.json')

    expect(workspacesPath(configured)).toBe(configured)
    expect(workspacesPath('/opt/stt/my-workspaces.json')).toBe('/opt/stt/my-workspaces.json')
  })

  it('空串 / 纯空白覆盖值视为未设，回落到 DSH_HOME', () => {
    const home = join(tmpdir(), 'stt-workspaces-home')
    vi.stubEnv('DSH_HOME', home)
    const expected = join(home, DEFAULTS_DIR_NAME, WORKSPACES_FILE_NAME)

    expect(workspacesPath('')).toBe(expected)
    expect(workspacesPath('   ')).toBe(expected)
  })

  it('DSH_HOME 未设时落在 ~/.dsh 下（只验证路径形状，不碰文件系统）', () => {
    vi.stubEnv('DSH_HOME', '')

    expect(workspacesPath()).toBe(
      join(homedir(), '.dsh', DEFAULTS_DIR_NAME, WORKSPACES_FILE_NAME),
    )
  })
})

/** 整份降级的表驱动用例：ENOENT / 坏 JSON / schema 不符 / 非 ENOENT 读失败。 */
interface WholeFileCase {
  /** 用例名（`it.each` 的 `$label` 插值）。 */
  readonly label: string
  /** 预置文件文本；省略 = 文件缺失。 */
  readonly text?: string
  /** 让读失败的错误；省略 = 走预置文件（或 ENOENT）。 */
  readonly readError?: NodeJS.ErrnoException
  /** 期望的 warn 片段；空数组 = 不告警。 */
  readonly warn: readonly string[]
}

describe('readWorkspaces：整份降级', () => {
  const cases: readonly WholeFileCase[] = [
    { label: 'ENOENT（首次使用）→ 空档且不告警', warn: [] },
    {
      label: '坏 JSON（半写）→ 空档 + 1 条 warn',
      text: '{"version":1,"workspaces":{"',
      warn: ['不是合法 JSON'],
    },
    { label: '完全不是 JSON → 空档 + 1 条 warn', text: 'not json', warn: ['不是合法 JSON'] },
    {
      label: 'version: 2 → 空档 + 1 条 warn',
      text: JSON.stringify({ version: 2, workspaces: {} }),
      warn: ['version 不是 1'],
    },
    {
      label: "version: '1'（字符串）→ 空档 + 1 条 warn",
      text: JSON.stringify({ version: '1', workspaces: {} }),
      warn: ['version 不是 1'],
    },
    {
      label: 'workspaces: [] → 空档 + 1 条 warn',
      text: JSON.stringify({ version: 1, workspaces: [] }),
      warn: ['workspaces 不是对象'],
    },
    {
      label: 'workspaces 缺字段 → 空档 + 1 条 warn',
      text: JSON.stringify({ version: 1 }),
      warn: ['workspaces 不是对象'],
    },
    {
      label: '顶层是数组 → 空档 + 1 条 warn',
      text: '[]',
      warn: ['顶层不是对象'],
    },
    {
      label: '顶层是 null → 空档 + 1 条 warn',
      text: 'null',
      warn: ['顶层不是对象'],
    },
    {
      label: '顶层是字符串 → 空档 + 1 条 warn',
      text: '"mcp:a"',
      warn: ['顶层不是对象'],
    },
    {
      label: '顶层是数字 → 空档 + 1 条 warn',
      text: '42',
      warn: ['顶层不是对象'],
    },
    {
      label: '其他读错误（EACCES）→ 空档 + 1 条 warn',
      readError: fsError('EACCES', WORKSPACES_PATH),
      warn: ['不可读', 'EACCES'],
    },
  ]

  it.each(cases)('$label', async (testCase) => {
    const fake = fakeIo({
      files: testCase.text === undefined ? {} : { [WORKSPACES_PATH]: testCase.text },
      readError: testCase.readError,
    })
    const { log, warnings } = recordingLog()

    // 四种必测输入（ENOENT / 坏 JSON / version:2 / workspaces:[]）都在上表里，
    // 身份断言 `toBe` 是 T6 的硬要求：降级必须返回同一份冻结空档。
    await expect(readWorkspaces(WORKSPACES_PATH, fake.io, log)).resolves.toBe(EMPTY_WORKSPACES)

    if (testCase.warn.length === 0) {
      expect(warnings).toEqual([])
      return
    }
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain(WORKSPACES_PATH)
    expect(warnings[0]).toContain('已按空档处理')
    for (const fragment of testCase.warn) expect(warnings[0]).toContain(fragment)
  })
})

/** 条目级降级的表驱动用例（只丢受影响的键或地址，其余保留）。 */
interface EntryCase {
  /** 用例名。 */
  readonly label: string
  /** 原始 `workspaces` 值（可能是任意 JSON）。 */
  readonly workspaces: unknown
  /** 期望读出的工作区 → 关闭集（已排序去重）。 */
  readonly expected: Readonly<Record<string, readonly string[]>>
  /** 期望的 warn 片段（每条都必须出现在那唯一一条汇总 warn 里）。 */
  readonly warn: readonly string[]
}

describe('readWorkspaces：条目级降级', () => {
  const cases: readonly EntryCase[] = [
    {
      label: '条目值非对象（数字 / null / 字符串 / 数组）→ 只丢该条',
      workspaces: {
        '/abs/num': 42,
        '/abs/null': null,
        '/abs/str': 'mcp:a',
        '/abs/arr': ['mcp:a'],
        '/abs/ok': { disabled: ['mcp:a'] },
      },
      expected: { '/abs/ok': ['mcp:a'] },
      warn: [
        '条目「/abs/num」的值不是对象',
        '条目「/abs/null」的值不是对象',
        '条目「/abs/str」的值不是对象',
        '条目「/abs/arr」的值不是对象',
      ],
    },
    {
      label: 'disabled 非数组（含缺字段）→ 只丢该条',
      workspaces: {
        '/abs/str': { disabled: 'mcp:a' },
        '/abs/obj': { disabled: { 0: 'mcp:a' } },
        '/abs/missing': {},
        '/abs/ok': { disabled: ['mcp:a'] },
      },
      expected: { '/abs/ok': ['mcp:a'] },
      warn: [
        '条目「/abs/str」的 disabled 不是数组',
        '条目「/abs/obj」的 disabled 不是数组',
        '条目「/abs/missing」的 disabled 不是数组',
      ],
    },
    {
      label: '键不是绝对路径（相对路径 / 空键）→ 只丢该条',
      workspaces: {
        'relative/x': { disabled: ['mcp:a'] },
        '': { disabled: ['mcp:a'] },
        '/abs/ok': { disabled: ['mcp:a'] },
      },
      expected: { '/abs/ok': ['mcp:a'] },
      warn: ['键「relative/x」不是绝对路径', '键「」不是绝对路径'],
    },
    {
      label: '键超过长度上限 → 只丢该条',
      workspaces: {
        [TOO_LONG_KEY]: { disabled: ['mcp:a'] },
        '/abs/ok': { disabled: ['mcp:a'] },
      },
      expected: { '/abs/ok': ['mcp:a'] },
      warn: [`超过 ${MAX_WORKSPACE_KEY_LENGTH} 字符`],
    },
    {
      label: 'disabled 条目非字符串或文法不合法 → 丢该地址，其余保留并归一',
      workspaces: {
        '/abs/a': {
          disabled: [
            'mcp:a',
            42,
            null,
            {},
            'bogus',
            '',
            'skill',
            'mcp:b::*',
            'tool:bash',
            'skill:Bad',
            'mcp:a',
          ],
        },
      },
      expected: { '/abs/a': ['mcp:a', 'mcp:b', 'tool:bash', 'tool:skill'] },
      warn: ['条目「/abs/a」有 6 条地址不合法'],
    },
  ]

  it.each(cases)('$label', async (testCase) => {
    const fake = fakeIo({
      files: {
        [WORKSPACES_PATH]: JSON.stringify({ version: 1, workspaces: testCase.workspaces }),
      },
    })
    const { log, warnings } = recordingLog()

    const file = await readWorkspaces(WORKSPACES_PATH, fake.io, log)

    expect(file).not.toBe(EMPTY_WORKSPACES)
    expect(file).toEqual(workspacesOf(testCase.expected))
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('工作区档有不可用条目，已丢弃或归一')
    expect(warnings[0]).toContain(WORKSPACES_PATH)
    for (const fragment of testCase.warn) expect(warnings[0]).toContain(fragment)
  })

  it('地址全部非法仍保留条目本身（空关闭集合法）', async () => {
    const fake = fakeIo({
      files: {
        [WORKSPACES_PATH]: JSON.stringify({
          version: 1,
          workspaces: { '/abs/a': { disabled: ['bogus'] } },
        }),
      },
    })
    const { log, warnings } = recordingLog()

    await expect(readWorkspaces(WORKSPACES_PATH, fake.io, log)).resolves.toEqual(
      workspacesOf({ '/abs/a': [] }),
    )
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('条目「/abs/a」有 1 条地址不合法')
  })

  it('条目数超上限：按键字典序排序后丢弃末尾项', async () => {
    // 倒序插入 257 个键：若实现按插入序截断，保留的会是 /w/001…/w/256。
    const keys = Array.from({ length: MAX_WORKSPACE_ENTRIES + 1 }, (_, index) =>
      `/w/${String(MAX_WORKSPACE_ENTRIES - index).padStart(3, '0')}`,
    )
    const workspaces = Object.fromEntries(keys.map((key) => [key, { disabled: ['mcp:a'] }]))
    const fake = fakeIo({
      files: { [WORKSPACES_PATH]: JSON.stringify({ version: 1, workspaces }) },
    })
    const { log, warnings } = recordingLog()

    const file = await readWorkspaces(WORKSPACES_PATH, fake.io, log)
    const kept = Object.keys(file.workspaces)

    expect(kept).toHaveLength(MAX_WORKSPACE_ENTRIES)
    expect(kept[0]).toBe('/w/000')
    expect(kept.at(-1)).toBe('/w/255')
    expect(file.workspaces).not.toHaveProperty('/w/256')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain(
      `条目数 ${MAX_WORKSPACE_ENTRIES + 1} 超过上限 ${MAX_WORKSPACE_ENTRIES}`,
    )
    expect(warnings[0]).toContain('已丢弃键字典序靠后的 1 个')
  })

  it('可解析但非规范形的地址归一后保留，且不为归一单独告警', async () => {
    const fake = fakeIo({
      files: {
        [WORKSPACES_PATH]: JSON.stringify({
          version: 1,
          workspaces: {
            '/abs/a': { disabled: ['skill', 'mcp:x::*', 'mcp:x::get_*', 'skill:ok-name'] },
          },
        }),
      },
    })
    const { log, warnings } = recordingLog()

    await expect(readWorkspaces(WORKSPACES_PATH, fake.io, log)).resolves.toEqual(
      workspacesOf({ '/abs/a': ['mcp:x', 'mcp:x::get_*', 'skill:ok-name', 'tool:skill'] }),
    )
    expect(warnings).toEqual([])
  })

  it('条目键按字典序稳定排序（与文件里的书写顺序无关）', async () => {
    const fake = fakeIo({
      files: {
        [WORKSPACES_PATH]: JSON.stringify({
          version: 1,
          workspaces: {
            '/abs/z': { disabled: ['mcp:z'] },
            '/abs/a': { disabled: ['mcp:a'] },
            '/abs/m': { disabled: ['mcp:m'] },
          },
        }),
      },
    })
    const { log, warnings } = recordingLog()

    const file = await readWorkspaces(WORKSPACES_PATH, fake.io, log)

    expect(Object.keys(file.workspaces)).toEqual(['/abs/a', '/abs/m', '/abs/z'])
    expect(warnings).toEqual([])
  })

  it('合法空档不告警，且与降级结果是不同对象', async () => {
    const fake = fakeIo({
      files: { [WORKSPACES_PATH]: JSON.stringify({ version: 1, workspaces: {} }) },
    })
    const { log, warnings } = recordingLog()

    const file = await readWorkspaces(WORKSPACES_PATH, fake.io, log)

    expect(file).toEqual(EMPTY_WORKSPACES)
    expect(file).not.toBe(EMPTY_WORKSPACES)
    expect(warnings).toEqual([])
  })

  it('未知顶层字段被忽略（前向兼容）', async () => {
    const fake = fakeIo({
      files: {
        [WORKSPACES_PATH]: JSON.stringify({
          version: 1,
          workspaces: { '/abs/a': { disabled: ['mcp:a'] } },
          future: { note: '以后加的字段' },
        }),
      },
    })
    const { log, warnings } = recordingLog()

    await expect(readWorkspaces(WORKSPACES_PATH, fake.io, log)).resolves.toEqual(
      workspacesOf({ '/abs/a': ['mcp:a'] }),
    )
    expect(warnings).toEqual([])
  })
})

describe('writeWorkspaces', () => {
  it('稳定序列化：2 空格缩进、结尾换行、键与关闭集字典序', async () => {
    const fake = fakeIo()

    await writeWorkspaces(
      WORKSPACES_PATH,
      workspacesOf({
        '/abs/z': ['tool:skill', 'mcp:a', 'mcp:a'],
        '/abs/a': ['mcp:z', 'mcp:a'],
      }),
      fake.io,
    )

    expect(fake.writes).toHaveLength(1)
    expect(fake.writes[0].path).toBe(WORKSPACES_PATH)
    expect(fake.writes[0].data).toBe(
      [
        '{',
        '  "version": 1,',
        '  "workspaces": {',
        '    "/abs/a": {',
        '      "disabled": [',
        '        "mcp:a",',
        '        "mcp:z"',
        '      ]',
        '    },',
        '    "/abs/z": {',
        '      "disabled": [',
        '        "mcp:a",',
        '        "tool:skill"',
        '      ]',
        '    }',
        '  }',
        '}',
        '',
      ].join('\n'),
    )
    expect(fake.writes[0].data.endsWith('\n')).toBe(true)
  })

  it('同内容两次写文件字节不变（与入参键序无关）', async () => {
    const fake = fakeIo()

    await writeWorkspaces(
      WORKSPACES_PATH,
      workspacesOf({ '/abs/a': ['mcp:a'], '/abs/z': ['mcp:z'] }),
      fake.io,
    )
    await writeWorkspaces(
      WORKSPACES_PATH,
      workspacesOf({ '/abs/z': ['mcp:z'], '/abs/a': ['mcp:a'] }),
      fake.io,
    )

    expect(fake.writes).toHaveLength(2)
    expect(fake.writes[1].data).toBe(fake.writes[0].data)
    expect(fake.files.get(WORKSPACES_PATH)).toBe(fake.writes[0].data)
  })

  it('写失败原样抛给调用方，且不留下半份内容', async () => {
    const error = fsError('EACCES', WORKSPACES_PATH)
    const fake = fakeIo({ writeError: error })
    const file = workspacesOf({ '/abs/a': ['mcp:a'] })

    await expect(writeWorkspaces(WORKSPACES_PATH, file, fake.io)).rejects.toThrow('EACCES')
    // 端口错误不做任何包装：调用方（updateWorkspaceDefaults）拿到的就是原错误对象。
    await expect(writeWorkspaces(WORKSPACES_PATH, file, fake.io)).rejects.toBe(error)
    expect(fake.writes).toEqual([])
    expect(fake.files.has(WORKSPACES_PATH)).toBe(false)
  })

  it('生产端口按 defaults.ts 同一实现写：mode 0o600 / dirMode 0o700', async () => {
    const calls: { path: string; data: string; options: unknown }[] = []
    const io = createNodeDefaultsIo({
      writeAtomic: async (path, data, options) => {
        calls.push({ path, data, options: { ...options } })
      },
    })
    const file = workspacesOf({ '/abs/a': ['mcp:a'] })

    await writeWorkspaces(WORKSPACES_PATH, file, io)

    expect(calls).toEqual([
      {
        path: WORKSPACES_PATH,
        data: expect.stringContaining('"workspaces"'),
        options: { mode: 0o600, dirMode: 0o700 },
      },
    ])
    expect(JSON.parse(calls[0].data)).toEqual(file)
    expect(calls[0].data.endsWith('\n')).toBe(true)
    expect(DEFAULTS_FILE_MODE).toBe(0o600)
    expect(DEFAULTS_DIR_MODE).toBe(0o700)
  })

  it('生产端口写入 → readWorkspaces 读回一致（完整链路，不碰真实文件系统）', async () => {
    let stored = ''
    const io = createNodeDefaultsIo({
      readFile: async () => stored,
      writeAtomic: async (_path, data) => {
        stored = data
      },
    })
    const file = workspacesOf({ '/abs/a': ['tool:skill', 'mcp:a'], '/abs/b': [] })
    const { log, warnings } = recordingLog()

    await writeWorkspaces(WORKSPACES_PATH, file, io)

    await expect(readWorkspaces(WORKSPACES_PATH, io, log)).resolves.toEqual(
      workspacesOf({ '/abs/a': ['mcp:a', 'tool:skill'], '/abs/b': [] }),
    )
    expect(warnings).toEqual([])
  })
})

describe('disabledOf', () => {
  it('有该键时返回其关闭集（只读，与档内是同一份）', () => {
    const file = workspacesOf({ '/abs/a': ['mcp:a', 'tool:skill'] })

    expect(disabledOf(file, '/abs/a')).toEqual(['mcp:a', 'tool:skill'])
    expect(disabledOf(file, '/abs/a')).toBe(file.workspaces['/abs/a'].disabled)
  })

  it('无该键时返回共享的冻结空数组', () => {
    const file = workspacesOf({ '/abs/a': ['mcp:a'] })

    const missing = disabledOf(file, '/abs/b')

    expect(missing).toEqual([])
    expect(Object.isFrozen(missing)).toBe(true)
    expect(disabledOf(file, '/abs/c')).toBe(missing)
  })
})

describe('mergeSeed', () => {
  it('用户档 ∪ 工作区档（T6 指定断言）', () => {
    expect(mergeSeed(['mcp:u'], ['skill:s'])).toEqual(['mcp:u', 'skill:s'])
  })

  it('重复条目 / 顺序交错 → 排序去重', () => {
    expect(mergeSeed(['mcp:b', 'mcp:a', 'mcp:a'], ['tool:skill', 'mcp:b'])).toEqual([
      'mcp:a',
      'mcp:b',
      'tool:skill',
    ])
  })

  it('任一为空时是另一份的排序去重副本', () => {
    expect(mergeSeed([], ['mcp:b', 'mcp:a'])).toEqual(['mcp:a', 'mcp:b'])
    expect(mergeSeed(['mcp:b', 'mcp:a'], [])).toEqual(['mcp:a', 'mcp:b'])
    expect(mergeSeed([], [])).toEqual([])
  })

  it('纯函数：不改入参、返回新数组（工作区档只能追加关闭）', () => {
    const user = ['mcp:b']
    const workspace = ['mcp:a']

    const merged = mergeSeed(user, workspace)

    expect(user).toEqual(['mcp:b'])
    expect(workspace).toEqual(['mcp:a'])
    expect(merged).not.toBe(user)
    expect(merged).not.toBe(workspace)
  })
})

describe('withEntry', () => {
  it('T6 指定断言：从空档写入 /abs/b → 排序去重后的单条', () => {
    expect(withEntry(EMPTY_WORKSPACES, '/abs/b', ['mcp:z', 'mcp:a'], QUIET_LOG)).toEqual({
      version: 1,
      workspaces: { '/abs/b': { disabled: ['mcp:a', 'mcp:z'] } },
    })
  })

  it('替换既有键：其它条目原样保留，键与关闭集都排序去重', () => {
    const file = workspacesOf({ '/abs/z': ['mcp:z'], '/abs/a': ['mcp:a'] })

    const next = withEntry(file, '/abs/z', ['tool:skill', 'mcp:q', 'mcp:q'], QUIET_LOG)

    expect(next).toEqual(
      workspacesOf({ '/abs/a': ['mcp:a'], '/abs/z': ['mcp:q', 'tool:skill'] }),
    )
    expect(Object.keys(next.workspaces)).toEqual(['/abs/a', '/abs/z'])
  })

  it('空 disabled 合法：条目保留、值为空数组', () => {
    const next = withEntry(workspacesOf({ '/abs/a': ['mcp:a'] }), '/abs/a', [], QUIET_LOG)

    expect(next.workspaces['/abs/a']).toEqual({ disabled: [] })
  })

  it('键不可用（非绝对路径 / 超长）→ 不写入并 warn，返回入参本身', () => {
    const file = workspacesOf({})

    for (const key of ['relative/x', TOO_LONG_KEY]) {
      const { log, warnings } = recordingLog()

      expect(withEntry(file, key, ['mcp:a'], log)).toBe(file)
      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toContain('工作区键不可用')
      expect(warnings[0]).toContain('未写入工作区档')
    }
  })

  it('条目数已达上限：新增键不写入并 warn，替换既有键不受限', () => {
    const full = workspacesOf(
      Object.fromEntries(
        Array.from({ length: MAX_WORKSPACE_ENTRIES }, (_, index) => [
          `/w/${String(index).padStart(3, '0')}`,
          ['mcp:a'],
        ]),
      ),
    )
    const { log, warnings } = recordingLog()

    expect(withEntry(full, '/w/new', ['mcp:b'], log)).toBe(full)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain(`条目数已达上限 ${MAX_WORKSPACE_ENTRIES}`)
    expect(warnings[0]).toContain('未新增')

    const replaced = withEntry(full, '/w/000', ['mcp:b'], QUIET_LOG)
    expect(replaced).not.toBe(full)
    expect(replaced.workspaces['/w/000']).toEqual({ disabled: ['mcp:b'] })
    expect(Object.keys(replaced.workspaces)).toHaveLength(MAX_WORKSPACE_ENTRIES)
  })

  it('写路径只排序去重、不归一（归一属于读路径；调用方传规范形）', () => {
    const next = withEntry(EMPTY_WORKSPACES, '/abs/a', ['skill', 'mcp:x::*'], QUIET_LOG)

    expect(next.workspaces['/abs/a']).toEqual({ disabled: ['mcp:x::*', 'skill'] })
  })

  it('纯函数：不改入参、返回新对象且不共享关闭集数组', () => {
    const file = workspacesOf({ '/abs/a': ['mcp:z', 'mcp:a'] })
    const disabled = ['mcp:z', 'mcp:a']

    const next = withEntry(file, '/abs/a', disabled, QUIET_LOG)

    expect(file).toEqual(workspacesOf({ '/abs/a': ['mcp:z', 'mcp:a'] }))
    expect(next).not.toBe(file)
    expect(next.workspaces['/abs/a'].disabled).not.toBe(disabled)
    expect(disabled).toEqual(['mcp:z', 'mcp:a'])
  })
})
