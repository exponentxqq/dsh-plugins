/**
 * `createDirectoryPicker` 适配器单测：能力三态（native / browse / unavailable）、
 * 能力缓存、三级信号错误归一化与 abort 透传。
 *
 * 用例清单 = `openspec/changes/2026-11-08-workspace-folders-picker/code-design.md`
 * ⑤ TG1 验收；判据 = §3.1 行为契约 7 条 + §3.2 三级信号固定顺序。
 *
 * 该模块零 React、零上游运行时 import（D-02），因此本 spec 在 node 环境
 * 直接注入假服务，不经 jsdom、不经组件渲染、不发真实 RPC。
 */

import { describe, expect, it, vi } from 'vitest'
import {
  createDirectoryPicker,
  DirectoryBrowseError,
  type DirectoryListing,
  type DirectoryPickOutcome,
  type DirectoryPickerService,
} from '../src/client/directory-picker.ts'

/** 上游 `DirectoryListing` 的结构镜像 fixture：home 层，含一个隐藏项。 */
const HOME_LISTING: DirectoryListing = {
  path: '/home/me',
  home: '/home/me',
  crumbs: [{ name: '/', path: '/', hidden: false }],
  entries: [
    { name: 'repos', path: '/home/me/repos', hidden: false },
    { name: '.ssh', path: '/home/me/.ssh', hidden: true },
  ],
  truncated: false,
}

/** 上游能力互斥错误的真实 message 模板（P-1：pick 失败只抛 message，code/details 丢失）。 */
const BROWSE_MESSAGE =
  'directoryPicker.pickDirectory needs the pick capability; the composed picker serves "browse"'
/** message 兜底失配时的改形文案（上游换词 / 本地化后 ② 不再命中，转 ③ 探测）。 */
const RESHAPED_MESSAGE = 'the composed picker is browse; pick needs native'

/** 断言结局的 kind 并返回收窄后的值，让后续字段访问带精确类型。 */
function expectKind<K extends DirectoryPickOutcome['kind']>(
  outcome: DirectoryPickOutcome,
  kind: K,
): Extract<DirectoryPickOutcome, { kind: K }> {
  expect(outcome.kind).toBe(kind)
  return outcome as Extract<DirectoryPickOutcome, { kind: K }>
}

/** 取一次浏览调用的拒绝——失败本身就是被测契约。 */
async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('预期的浏览失败没有发生')
}

describe('createDirectoryPicker：能力三态', () => {
  it('native：pick 成功且非空串 → picked，浏览原语零调用', async () => {
    const pick = vi.fn(async () => '/repos/picked')
    const list = vi.fn(async () => HOME_LISTING)
    const outcome = expectKind(
      await createDirectoryPicker(() => ({ pickDirectory: pick, listDirectory: list }))(),
      'picked',
    )
    expect(outcome.path).toBe('/repos/picked')
    expect(list).not.toHaveBeenCalled()
  })

  it('native 的取消：pick 返回 null 或空串 → cancelled', async () => {
    const nullService: DirectoryPickerService = { pickDirectory: vi.fn(async () => null) }
    expectKind(await createDirectoryPicker(() => nullService)(), 'cancelled')
    const emptyService: DirectoryPickerService = { pickDirectory: vi.fn(async () => '') }
    expectKind(await createDirectoryPicker(() => emptyService)(), 'cancelled')
  })

  it('browse（结构判断）：无 pickDirectory 但有 list+create → 直接 browse，零 RPC', async () => {
    const list = vi.fn(async () => HOME_LISTING)
    const create = vi.fn(async (path: string, name: string) => `${path}/${name}`)
    const service: DirectoryPickerService = { listDirectory: list, createDirectory: create }
    const outcome = expectKind(await createDirectoryPicker(() => service)(), 'browse')
    expect(outcome.browsing).toBeDefined()
    expect(outcome.listing).toBeUndefined()
    // 判定只看方法形状，不发任何失败 RPC（TG1 验收：pickDirectory 根本不存在也不报错）。
    expect(list).not.toHaveBeenCalled()
  })

  it('unavailable（防御）：只暴露 pick 的旧组合即使 message 命中 browse 也不误判', async () => {
    const pick = vi.fn(async () => {
      throw new Error(BROWSE_MESSAGE)
    })
    // 无 list/create → browserOf 为 undefined → 一律 unavailable，防误开空对话框。
    const service: DirectoryPickerService = { pickDirectory: pick }
    const outcome = await createDirectoryPicker(() => service)()
    expect(outcome.kind).toBe('unavailable')
  })
})

describe('createDirectoryPicker：能力缓存', () => {
  it('browse 判定后第二次不再调用 pick（fake 计数 1），也不重复探测', async () => {
    // 用 ③ 探测分支造判定（message 失配 → list 探测成功），缓存语义最强：
    // 第二次既不再 pick、也不再探测；② message 兜底「零探测」已由专门用例守住。
    const pick = vi.fn(async () => {
      throw new Error(RESHAPED_MESSAGE)
    })
    const list = vi.fn(async () => HOME_LISTING)
    const service: DirectoryPickerService = {
      pickDirectory: pick,
      listDirectory: list,
      createDirectory: async () => '/unused',
    }
    const picker = createDirectoryPicker(() => service)
    expectKind(await picker(), 'browse')
    expectKind(await picker(), 'browse')
    expect(pick).toHaveBeenCalledTimes(1)
    expect(list).toHaveBeenCalledTimes(1)
  })

  it('read() 返回 undefined → 两次都 unavailable 且不缓存，服务晚到后恢复', async () => {
    let service: DirectoryPickerService | undefined = undefined
    const picker = createDirectoryPicker(() => service)
    expect((await picker()).kind).toBe('unavailable')
    expect((await picker()).kind).toBe('unavailable')
    const pick = vi.fn(async () => '/repos/late')
    service = { pickDirectory: pick }
    const outcome = expectKind(await picker(), 'picked')
    expect(outcome.path).toBe('/repos/late')
    expect(pick).toHaveBeenCalledTimes(1)
  })

  it('能力缓存按服务实例身份失效：read() 返回新对象后重新判定', async () => {
    const pickA = vi.fn(async () => {
      throw new Error(BROWSE_MESSAGE)
    })
    const pickB = vi.fn(async () => {
      throw new Error(BROWSE_MESSAGE)
    })
    let service: DirectoryPickerService = {
      pickDirectory: pickA,
      listDirectory: vi.fn(async () => HOME_LISTING),
      createDirectory: async () => '/unused',
    }
    const picker = createDirectoryPicker(() => service)
    expectKind(await picker(), 'browse') // A 判定并缓存
    service = {
      pickDirectory: pickB,
      listDirectory: vi.fn(async () => HOME_LISTING),
      createDirectory: async () => '/unused',
    }
    expectKind(await picker(), 'browse') // B 是另一实例 → 缓存失效 → 重新走三级信号
    expect(pickB).toHaveBeenCalledTimes(1)
  })

  it('native 判定后每次调用仍先 pick（OS 选择框每次都要弹，缓存只跳过信号分类）', async () => {
    const pick = vi.fn(async () => '/repos/picked')
    const list = vi.fn(async () => HOME_LISTING)
    const picker = createDirectoryPicker(() => ({ pickDirectory: pick, listDirectory: list }))
    expectKind(await picker(), 'picked')
    expectKind(await picker(), 'picked')
    expect(pick).toHaveBeenCalledTimes(2)
    expect(list).not.toHaveBeenCalled()
  })
})

describe('createDirectoryPicker：三级信号分类（顺序固定）', () => {
  it('① 结构化信号：rpcError.details.capability === browse → browse，零探测', async () => {
    const failure = { rpcError: { code: 'directory-picker/unavailable', details: { capability: 'browse' } } }
    const pick = vi.fn(async () => {
      throw failure
    })
    const list = vi.fn(async () => HOME_LISTING)
    const outcome = expectKind(
      await createDirectoryPicker(() => ({ pickDirectory: pick, listDirectory: list, createDirectory: async () => '/unused' }))(),
      'browse',
    )
    expect(outcome.browsing).toBeDefined()
    expect(outcome.listing).toBeUndefined()
    expect(list).not.toHaveBeenCalled()
  })

  it('① 结构化信号：details.capability === native → failed（error 为原错误对象，零探测）', async () => {
    const failure = { rpcError: { code: 'gateway/internal', message: 'pick crashed', details: { capability: 'native' } } }
    const pick = vi.fn(async () => {
      throw failure
    })
    const list = vi.fn(async () => HOME_LISTING)
    const outcome = expectKind(
      await createDirectoryPicker(() => ({ pickDirectory: pick, listDirectory: list, createDirectory: async () => '/unused' }))(),
      'failed',
    )
    expect(outcome.error).toBe(failure)
    expect(list).not.toHaveBeenCalled()
  })

  it('② message 兜底：serves "browse" 文案 → browse（browsing 在、listing 缺席、零探测）', async () => {
    const pick = vi.fn(async () => {
      throw new Error(BROWSE_MESSAGE)
    })
    const list = vi.fn(async () => HOME_LISTING)
    const outcome = expectKind(
      await createDirectoryPicker(() => ({ pickDirectory: pick, listDirectory: list, createDirectory: async () => '/unused' }))(),
      'browse',
    )
    expect(outcome.browsing).toBeDefined()
    expect(outcome.listing).toBeUndefined()
    expect(list).not.toHaveBeenCalled()
  })

  it('② message 兜底的 JSON 形：capability: "browse" 文案也判 browse', async () => {
    const pick = vi.fn(async () => {
      throw new Error('{"capability" : "browse"} picker is composed')
    })
    const list = vi.fn(async () => HOME_LISTING)
    const outcome = expectKind(
      await createDirectoryPicker(() => ({ pickDirectory: pick, listDirectory: list, createDirectory: async () => '/unused' }))(),
      'browse',
    )
    expect(outcome.listing).toBeUndefined()
    expect(list).not.toHaveBeenCalled()
  })

  it('③ message 失配 → 结构探测成功 → browse，listing 为探测到的 home 层', async () => {
    const pick = vi.fn(async () => {
      throw new Error(RESHAPED_MESSAGE)
    })
    const list = vi.fn(async () => HOME_LISTING)
    const outcome = expectKind(
      await createDirectoryPicker(() => ({ pickDirectory: pick, listDirectory: list, createDirectory: async () => '/unused' }))(),
      'browse',
    )
    expect(list).toHaveBeenCalledTimes(1)
    expect(list).toHaveBeenCalledWith() // 零参 = Host home，探测结果复用为对话框首帧
    expect(outcome.listing).toEqual(HOME_LISTING)
  })

  it('③ 探测拒绝且 details.capability === native → failed（error 为原 pick 错误对象）', async () => {
    const original = new Error(RESHAPED_MESSAGE)
    const pick = vi.fn(async () => {
      throw original
    })
    const list = vi.fn(async () => {
      throw Object.assign(new Error('directory scan unavailable'), {
        rpcError: { code: 'directory-picker/unavailable', details: { capability: 'native' } },
      })
    })
    const outcome = expectKind(
      await createDirectoryPicker(() => ({ pickDirectory: pick, listDirectory: list, createDirectory: async () => '/unused' }))(),
      'failed',
    )
    expect(outcome.error).toBe(original)
  })

  it('③ 探测拒绝且无任何能力信号 → unavailable', async () => {
    const pick = vi.fn(async () => {
      throw new Error(RESHAPED_MESSAGE)
    })
    const list = vi.fn(async () => {
      throw new Error('list boom')
    })
    const outcome = await createDirectoryPicker(() => ({
      pickDirectory: pick,
      listDirectory: list,
      createDirectory: async () => '/unused',
    }))()
    expect(outcome.kind).toBe('unavailable')
  })
})

describe('DirectoryBrowser：错误归一化与 abort', () => {
  it.each([
    { via: 'list', wire: 'directory-picker/unreadable', local: 'picker-unreadable', message: 'no such directory' },
    { via: 'create', wire: 'directory-picker/exists', local: 'picker-exists', message: 'already exists' },
    { via: 'create', wire: 'directory-picker/create-failed', local: 'picker-create-failed', message: 'mkdir failed' },
    { via: 'list', wire: 'gateway/internal', local: 'picker-failed', message: 'internal gateway error' },
  ])('浏览失败归一化：$wire → $local，message 保留上游原文', async ({ via, wire, local, message }) => {
    // 上游 browse 原语的真实拒绝形状：Error 子类实例（message 在顶层可读）+
    // `rpcError` 载体携带 wire 码（`@deepseek-ai/dsh-client-ui-workspace` 的
    // `throw new DirectoryBrowseError(result.error)`）。
    const failure = Object.assign(new Error(message), { rpcError: { code: wire } })
    const service: DirectoryPickerService = {
      pickDirectory: async () => {
        throw new Error(BROWSE_MESSAGE)
      },
      listDirectory: async () => {
        if (via !== 'list') throw new Error('list 不应被这条用例调用')
        throw failure
      },
      createDirectory: async () => {
        if (via !== 'create') throw new Error('create 不应被这条用例调用')
        throw failure
      },
    }
    const outcome = expectKind(await createDirectoryPicker(() => service)(), 'browse')
    const rejection =
      via === 'list' ? outcome.browsing.list('/repos/x') : outcome.browsing.create('/repos/x', 'new-folder')
    const error = await rejectionOf(rejection)
    expect(error).toBeInstanceOf(DirectoryBrowseError)
    const browseError = error as DirectoryBrowseError
    expect(browseError.code).toBe(local)
    expect(browseError.message).toContain(message)
  })

  it('拒绝是裸 rpcError 载体（顶层无 message）→ message 退化为含 wire 码的诊断句', async () => {
    const service: DirectoryPickerService = {
      pickDirectory: async () => {
        throw new Error(BROWSE_MESSAGE)
      },
      listDirectory: async () => {
        // 顶层 message 保持取不到（空串）——被测的正是「原文缺失 → 退化为诊断句」分支。
        throw Object.assign(new Error(''), { rpcError: { code: 'directory-picker/unreadable' } })
      },
      createDirectory: async () => '/unused',
    }
    const outcome = expectKind(await createDirectoryPicker(() => service)(), 'browse')
    const error = await rejectionOf(outcome.browsing.list('/repos/x'))
    expect(error).toBeInstanceOf(DirectoryBrowseError)
    expect((error as DirectoryBrowseError).code).toBe('picker-unreadable')
    // 原文取不到时退化为诊断句，wire 码仍可追溯。
    expect((error as DirectoryBrowseError).message).toContain('directory browse failed')
    expect((error as DirectoryBrowseError).message).toContain('directory-picker/unreadable')
  })

  it('浏览失败无任何结构化信号（普通 Error）→ picker-failed', async () => {
    const service: DirectoryPickerService = {
      pickDirectory: async () => {
        throw new Error(BROWSE_MESSAGE)
      },
      listDirectory: async () => {
        throw new Error('EACCES: permission denied')
      },
      createDirectory: async () => '/unused',
    }
    const outcome = expectKind(await createDirectoryPicker(() => service)(), 'browse')
    const error = await rejectionOf(outcome.browsing.list('/repos/x'))
    expect(error).toBeInstanceOf(DirectoryBrowseError)
    expect((error as DirectoryBrowseError).code).toBe('picker-failed')
    expect((error as DirectoryBrowseError).message).toContain('EACCES')
  })

  it('abort 透传：signal 原样传给底层 listDirectory；aborted 后失败归一化为 picker-failed', async () => {
    const controller = new AbortController()
    const seen: Array<readonly [path: string | undefined, signal: AbortSignal | undefined]> = []
    const service: DirectoryPickerService = {
      pickDirectory: async () => {
        throw new Error(BROWSE_MESSAGE)
      },
      listDirectory: async (path, signal) => {
        seen.push([path, signal])
        throw Object.assign(new Error('the scan was cancelled'), {
          rpcError: { code: 'gateway/cancelled', message: 'the scan was cancelled' },
        })
      },
      createDirectory: async () => '/unused',
    }
    const outcome = expectKind(await createDirectoryPicker(() => service)(), 'browse')
    controller.abort()
    const error = await rejectionOf(outcome.browsing.list('/repos/x', controller.signal))
    // 同一个 signal 实例到底层 = 透传成立。
    expect(seen[0]?.[0]).toBe('/repos/x')
    expect(seen[0]?.[1]).toBe(controller.signal)
    expect(error).toBeInstanceOf(DirectoryBrowseError)
    // gateway/cancelled 不在映射表 → picker-failed；对话框据 signal.aborted 丢弃渲染。
    expect((error as DirectoryBrowseError).code).toBe('picker-failed')
  })
})
