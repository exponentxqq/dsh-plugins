/**
 * `projectKey` 本地镜像的金表与属性测试（`src/project-key.ts`）。
 *
 * 为什么要有这张金表：`projectKey` 是上游私有实现的**本地镜像**（见 ④ D5——上游
 * `dsh-session-persistence-jsonl` 未导出该函数，纯流程层又禁止 import
 * `@deepseek-ai/*`，宿主产物还必须自包含），规则只能手抄。金表逐条钉住「本地镜像
 * 与上游一致，漂移即红」：前 5 条直接取自真实 `sessions/` 与
 * `archive/sessions/` 目录名实测，其余覆盖折叠、转义、截断与空串。
 *
 * 第 7 条按执行期勘误（R1）取 `--a-b---`：上游只去**前导** `-`，尾部分隔符贡献的
 * `-` 原样保留，因此以分隔符结尾的路径会多出一个尾 `-`。蓝图旧表写作 `--a-b--`
 * 已勘误，勿按旧表改回。
 *
 * 除金表外，这里再用属性断言兜住「任何输入都不会产出一个非法目录名」：输出恒匹配
 * 安全字符集且总长 ≤ 255，主体恰 1..251 个字符。projectKey 本身是有损的（从不用于
 * 反推路径），所以属性断言只钉输出形状，不钉可逆性。
 *
 * @module dsh-plugin-web-ux/test/project-key
 */

import { describe, expect, it } from 'vitest'
import { projectKey, workspaceForProjectDir, type ProjectWorkspace } from '../src/project-key.ts'

/** 合法编码结果：`--` + 安全字符集（`~` 只以 `~XXXX` 转义形态出现）+ `--`。 */
const SAFE_KEY = /^--[A-Za-z0-9._~-]*--$/

/** 取掉首尾两层 `--` 后的主体。 */
function bodyOf(key: string): string {
  return key.slice(2, -2)
}

/** 断言一个编码结果落在安全字符集、≤255 与主体非空边界内。 */
function expectSafeKey(key: string): void {
  expect(key).toMatch(SAFE_KEY)
  expect(key.length).toBeLessThanOrEqual(255)
  expect(key.length).toBeGreaterThanOrEqual(5)
  expect(bodyOf(key).length).toBeGreaterThanOrEqual(1)
  expect(bodyOf(key).length).toBeLessThanOrEqual(251)
}

/** 单个码元样本：ASCII 全量 0x00-0x7f，外加高位 BMP 码元与一个孤立代理项。 */
function unitSamples(): string[] {
  const ascii = Array.from({ length: 0x80 }, (_, code) => String.fromCharCode(code))
  return [
    ...ascii,
    String.fromCharCode(0xe9), // é
    String.fromCharCode(0x4e2d), // 中
    String.fromCharCode(0xfffd), // 替换字符
    String.fromCharCode(0xd83d), // 孤立高位代理项（非法的 UTF-16 串也要有个稳定结果）
  ]
}

/**
 * 线性同余伪随机数（固定种子，用例可复现）：属性用例需要「像任意输入」的取值组合，
 * 又不引第三方依赖，所以自带一个最小生成器。
 */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

/** 混合 ASCII 全字符、三类分隔符、`~` 与星平面字符的随机串（长度 1..60）。 */
function randomInputs(count: number): string[] {
  const random = makeRandom(0x5eed1234)
  const pool = [...unitSamples(), '/', '\\', ':', '~', '-', '.', '_', 'a', 'Z', '0', '\u{1f600}']
  return Array.from({ length: count }, () => {
    const length = 1 + Math.floor(random() * 60)
    let value = ''
    for (let index = 0; index < length; index += 1) {
      value += pool[Math.floor(random() * pool.length)]
    }
    return value
  })
}

describe('金表：⑤G1 实测 12 条', () => {
  // 1-5 条是真实存在的 `sessions/` / `archive/sessions/` 一级目录名，不是推演值。
  it('金表 1：/home/docker → --home-docker--（真实 sessions/ 目录名）', () => {
    expect(projectKey('/home/docker')).toBe('--home-docker--')
  })

  it('金表 2：/home/xuqinqin/develop/company/opc → --home-xuqinqin-develop-company-opc--（真实 archive/sessions/ 目录名）', () => {
    expect(projectKey('/home/xuqinqin/develop/company/opc')).toBe('--home-xuqinqin-develop-company-opc--')
  })

  it('金表 3：/home/xuqinqin/develop/person/dsh-plugins → --home-xuqinqin-develop-person-dsh-plugins--', () => {
    expect(projectKey('/home/xuqinqin/develop/person/dsh-plugins')).toBe(
      '--home-xuqinqin-develop-person-dsh-plugins--',
    )
  })

  it('金表 4：/home/xuqinqin/develop/company/web/cloud-the-sky → --home-xuqinqin-develop-company-web-cloud-the-sky--', () => {
    expect(projectKey('/home/xuqinqin/develop/company/web/cloud-the-sky')).toBe(
      '--home-xuqinqin-develop-company-web-cloud-the-sky--',
    )
  })

  it('金表 5：/tmp → --tmp--', () => {
    expect(projectKey('/tmp')).toBe('--tmp--')
  })

  it('金表 6：/a//b → --a-b--（连续分隔符只留一个）', () => {
    expect(projectKey('/a//b')).toBe('--a-b--')
  })

  it('金表 7：/a/b/ → --a-b---（尾分隔符的 - 保留，勘误后口径）', () => {
    expect(projectKey('/a/b/')).toBe('--a-b---')
  })

  it('金表 8：/home/u/with~tilde → --home-u-with~007Etilde--（~ 也转义）', () => {
    expect(projectKey('/home/u/with~tilde')).toBe('--home-u-with~007Etilde--')
  })

  it('金表 9：C:\\a\\b → --C-a-b--（反斜杠与盘符冒号都折叠）', () => {
    expect(projectKey('C:\\a\\b')).toBe('--C-a-b--')
  })

  it('金表 10：/ → --root--（主体为空时兜底）', () => {
    expect(projectKey('/')).toBe('--root--')
  })

  it('金表 11：300 字符路径（/ + 299×a）→ 主体恰 251、总长恰 255', () => {
    const key = projectKey(`/${'a'.repeat(299)}`)
    expect(key.length).toBe(255)
    expect(bodyOf(key).length).toBe(251)
    expect(key).toBe(`--${'a'.repeat(251)}--`)
  })

  it('金表 12：空串抛错（与上游一致）', () => {
    expect(() => projectKey('')).toThrow(Error)
    expect(() => projectKey('')).toThrow('cannot encode an empty project path')
  })
})

describe('有损用例：折叠、转义、截断与兜底', () => {
  it.each([
    ['三类分隔符混排折叠成一个 -', '/a//\\:b', '--a-b--'],
    ['前导分隔符整段去掉（不产生前导 -）', '///tmp', '--tmp--'],
    ['反斜杠路径与斜杠路径编码相同', '/a/b', '--a-b--'],
    ['盘符冒号折叠，且尾部分隔符贡献一个 -', 'C:', '--C---'],
    ['尾部单个分隔符多出一个 -', '/tmp/', '--tmp---'],
    ['尾部连续分隔符仍只折叠成一个 -', '/tmp//', '--tmp---'],
    ['全分隔符输入兜底为 root', '///', '--root--'],
    ['只有反斜杠也兜底为 root', '\\', '--root--'],
    ['只有冒号也兜底为 root', ':', '--root--'],
    ['仅一个前导分隔符的路径', '/a', '--a--'],
    ['tilde 单独出现也转义', '~', '--~007E--'],
    ['大小写、点、下划线、连字符原样保留', '/a.B_c-D', '--a.B_c-D--'],
    ['NUL 码元转 ~0000', 'a\u0000b', '--a~0000b--'],
    ['DEL 码元转 ~007F', 'a\u007fb', '--a~007Fb--'],
    ['BMP 非 ASCII 码元转四位十六进制', '中', '--~4E2D--'],
    ['星平面字符按 UTF-16 码元逐个转义', '\u{1f600}', '--~D83D~DE00--'],
    ['空格不属于安全字符集', 'a b', '--a~0020b--'],
    ['通配字符不属于安全字符集', 'a*b', '--a~002Ab--'],
    ['换行不属于安全字符集', 'a\nb', '--a~000Ab--'],
  ])('%s：%j → %s', (_label, cwd, expected) => {
    expect(projectKey(cwd)).toBe(expected)
  })

  it('251 字符是主体上限：250 不截断、251 不截断、252 起截到 251', () => {
    const short = projectKey(`/${'a'.repeat(250)}`)
    expect(short.length).toBe(254)
    expect(bodyOf(short)).toBe('a'.repeat(250))

    const exactly = projectKey(`/${'a'.repeat(251)}`)
    expect(exactly.length).toBe(255)
    expect(bodyOf(exactly)).toBe('a'.repeat(251))

    expect(projectKey(`/${'a'.repeat(252)}`)).toBe(exactly)
    expect(projectKey(`/${'a'.repeat(4000)}`)).toBe(exactly)
  })

  it('截断按码元切，可能切断一个转义序列（有损，故不能反推路径）', () => {
    const whole = projectKey(`/${'a'.repeat(246)}~`)
    expect(bodyOf(whole)).toBe(`${'a'.repeat(246)}~007E`)
    expect(whole.length).toBe(255)

    const cut = projectKey(`/${'a'.repeat(249)}~`)
    expect(bodyOf(cut).length).toBe(251)
    expect(bodyOf(cut)).toBe(`${'a'.repeat(249)}~0`)
    expect(cut.endsWith('~0--')).toBe(true)
  })

  it('同一输入重复调用结果稳定（纯函数，无隐藏状态）', () => {
    expect(projectKey('/a//b/')).toBe(projectKey('/a//b/'))
  })
})

describe('属性断言：任何输入的输出都是合法目录名', () => {
  it('单码元全量（ASCII 0x00-0x7f + 高位码元）：输出恒安全', () => {
    for (const unit of unitSamples()) {
      expectSafeKey(projectKey(unit))
      expectSafeKey(projectKey(`/${unit}`))
      expectSafeKey(projectKey(`a${unit}b`))
    }
  })

  it('随机输入（固定种子，可复现）：输出恒安全', () => {
    for (const input of randomInputs(300)) expectSafeKey(projectKey(input))
  })

  it('超长输入（最长 5000 字符）：总长封在 255，主体封在 251', () => {
    for (const length of [252, 255, 300, 1000, 5000]) {
      const key = projectKey(`/${'x'.repeat(length)}`)
      expectSafeKey(key)
      expect(key.length).toBe(255)
      expect(bodyOf(key).length).toBe(251)
    }
  })

  it('输出永不包含分隔符、控制字符或前导 -（root 兜底除外）', () => {
    for (const input of ['/a b/c\nd', 'C:\\Users\\u', '~/.dsh/x', '/', '///', 'a:b/c\\d']) {
      const key = projectKey(input)
      expect(key).not.toContain('/')
      expect(key).not.toContain('\\')
      expect(key).not.toContain(':')
      // 输出只剩可打印 ASCII：没有控制字符（含 NUL / DEL / 换行）。
      expect([...key].every((char) => char.charCodeAt(0) >= 0x20 && char.charCodeAt(0) !== 0x7f)).toBe(true)
      expect(bodyOf(key).startsWith('-')).toBe(false)
    }
  })
})

describe('workspaceForProjectDir：按键反查工作区', () => {
  const WORKSPACES: readonly ProjectWorkspace[] = [
    { workspaceId: 'ws-home', path: '/home/u' },
    { workspaceId: 'ws-dsh', path: '/home/xuqinqin/develop/person/dsh-plugins' },
    { workspaceId: 'ws-tmp', path: '/tmp' },
  ]

  it('命中：projectDir 等于 projectKey(path) 时返回工作区 id', () => {
    expect(workspaceForProjectDir('--home-u--', WORKSPACES)).toBe('ws-home')
    expect(workspaceForProjectDir(projectKey('/tmp'), WORKSPACES)).toBe('ws-tmp')
    expect(workspaceForProjectDir(projectKey(WORKSPACES[1].path), WORKSPACES)).toBe('ws-dsh')
  })

  it('未命中：没有对应工作区时返回 null（归入「未匹配工作区的归档」）', () => {
    expect(workspaceForProjectDir('--home-xuqinqin--', WORKSPACES)).toBeNull()
    expect(workspaceForProjectDir('--home-u--', [])).toBeNull()
    expect(workspaceForProjectDir('', WORKSPACES)).toBeNull()
    expect(workspaceForProjectDir('--tmp--', [{ workspaceId: 'ws-other', path: '/other' }])).toBeNull()
  })

  it('尾斜杠注册路径按上游口径匹配：/a/b/ 的键是 --a-b---，不是 --a-b--', () => {
    const trailing: readonly ProjectWorkspace[] = [{ workspaceId: 'ws-trailing', path: '/a/b/' }]
    expect(projectKey('/a/b/')).toBe('--a-b---')
    expect(workspaceForProjectDir('--a-b---', trailing)).toBe('ws-trailing')
    // 用不带尾斜杠的键去查带尾斜杠的注册路径 → 不命中（勘误语义的核心断言）。
    expect(workspaceForProjectDir('--a-b--', trailing)).toBeNull()
  })

  it('多个工作区经有损编码落到同一个键时，取注册顺序里的第一个', () => {
    const duplicated: readonly ProjectWorkspace[] = [
      { workspaceId: 'ws-first', path: '/a//b' },
      { workspaceId: 'ws-second', path: '/a/b' },
    ]
    expect(projectKey('/a//b')).toBe(projectKey('/a/b'))
    expect(workspaceForProjectDir('--a-b--', duplicated)).toBe('ws-first')
  })

  it('只匹配键，不按原始路径字符串比较', () => {
    const workspace: readonly ProjectWorkspace[] = [{ workspaceId: 'ws-tmp', path: '/tmp/' }]
    expect(workspaceForProjectDir(projectKey('/tmp/'), workspace)).toBe('ws-tmp')
    expect(workspaceForProjectDir('/tmp/', workspace)).toBeNull()
  })
})
