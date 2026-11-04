/**
 * `resolveArchiveRoot()` 的解析矩阵 + `Config` schema 的接受/拒绝边界。
 *
 * 纯 node 单测：解析函数依赖的宿主事实（home 解析器、用户 home、告警出口）全部注入，不触碰
 * 真实文件系统；schema 用例直接调用原生 Schemastery 图（与宿主 `--dump-config-schema` 是同一
 * 张图），因此「archiveRoot 可省略」与「类型错即抛」两条边界在同一层被钉住。
 */
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { Config, resolveArchiveRoot, type ArchiveRootContext } from '../src/config.ts'

/** 宿主 home 目录（`$DSH_HOME`）在测试里的替身。 */
const DSH_HOME = '/srv/dsh-home'

/** 操作系统 home 目录在测试里的替身。 */
const OS_HOME = '/home/tester'

/** 缺省归档根：所有回落分支的期望值。 */
const DEFAULT_ROOT = join(DSH_HOME, 'archive', 'sessions')

/** 一次用例用的注入上下文与告警 mock。 */
interface TestContext {
  readonly context: ArchiveRootContext
  readonly warn: ReturnType<typeof vi.fn>
}

/** 构造注入上下文；每个用例一份，便于断言「warn 恰一次」。 */
function makeContext(): TestContext {
  const warn = vi.fn()
  const context: ArchiveRootContext = {
    homePath: (...segments: string[]) => join(DSH_HOME, ...segments),
    homedir: OS_HOME,
    warn,
  }
  return { context, warn }
}

describe('resolveArchiveRoot：缺省', () => {
  it('未配置 / 空串 / 纯空白都落到 $DSH_HOME/archive/sessions，且不告警', () => {
    for (const configured of [undefined, '', '   ', '\t\n'] as const) {
      const { context, warn } = makeContext()
      expect(resolveArchiveRoot(configured, context), JSON.stringify(configured)).toBe(DEFAULT_ROOT)
      expect(warn).not.toHaveBeenCalled()
    }
  })

  it('缺省根由注入的 homePath 拼出：换一个 $DSH_HOME 就跟着走', () => {
    const context: ArchiveRootContext = {
      homePath: (...segments: string[]) => join('/mnt/other-home', ...segments),
      homedir: OS_HOME,
      warn: vi.fn(),
    }
    expect(resolveArchiveRoot(undefined, context)).toBe('/mnt/other-home/archive/sessions')
  })
})

describe('resolveArchiveRoot：~/ 展开', () => {
  it('~/<rest> 展开到操作系统的 home 目录，且不告警', () => {
    const { context, warn } = makeContext()
    expect(resolveArchiveRoot('~/archive/sessions', context)).toBe(join(OS_HOME, 'archive', 'sessions'))
    expect(warn).not.toHaveBeenCalled()
  })

  it('~/ 里的 .. 被归一', () => {
    const { context } = makeContext()
    expect(resolveArchiveRoot('~/logs/../archive', context)).toBe(join(OS_HOME, 'archive'))
  })

  it('~\\<rest>（反斜杠写法）同样展开', () => {
    const { context } = makeContext()
    expect(resolveArchiveRoot('~\\archive', context)).toBe(join(OS_HOME, 'archive'))
  })
})

describe('resolveArchiveRoot：绝对路径归一', () => {
  it('去掉尾部分隔符，且不告警', () => {
    const { context, warn } = makeContext()
    expect(resolveArchiveRoot('/data/dsh-archive/sessions/', context)).toBe('/data/dsh-archive/sessions')
    expect(warn).not.toHaveBeenCalled()
  })

  it('.. 与重复分隔符被归一', () => {
    const { context } = makeContext()
    expect(resolveArchiveRoot('/data//dsh-archive/../archive', context)).toBe('/data/archive')
  })
})

describe('resolveArchiveRoot：不可用值回落缺省', () => {
  it('相对路径 / 单独的 ~ / 其它写法 → 缺省 + warn 恰一次', () => {
    for (const configured of ['archive/sessions', './archive', '../archive', '~', '~foo/bar', 'file:///x']) {
      const { context, warn } = makeContext()
      expect(resolveArchiveRoot(configured, context), configured).toBe(DEFAULT_ROOT)
      expect(warn, configured).toHaveBeenCalledTimes(1)
      expect(warn, configured).toHaveBeenCalledWith(
        `web-ux: archiveRoot "${configured}" is not an absolute path or ~/ path; falling back to ${DEFAULT_ROOT}`,
      )
    }
  })
})

describe('Config：原生 Schemastery schema', () => {
  it('Config({}) 通过：archiveRoot 可省略', () => {
    const config = Config({})
    expect(config).toEqual({})
    expect(config.archiveRoot).toBeUndefined()
  })

  it('Config({archiveRoot:"/x"}) 通过并原样保留', () => {
    expect(Config({ archiveRoot: '/x' })).toEqual({ archiveRoot: '/x' })
  })

  it('Config({archiveRoot:2}) 抛错：schema 只接受字符串', () => {
    expect(() => Config({ archiveRoot: 2 } as Record<string, unknown>)).toThrow()
  })

  it('resolveArchiveRoot 可直接消费 schema 的输出（缺省 / 显式两态）', () => {
    const { context } = makeContext()
    expect(resolveArchiveRoot(Config({}).archiveRoot, context)).toBe(DEFAULT_ROOT)
    expect(resolveArchiveRoot(Config({ archiveRoot: '/x' }).archiveRoot, context)).toBe('/x')
  })
})
