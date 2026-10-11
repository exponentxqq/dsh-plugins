/**
 * 命令文件格式与命名文法测试（规范：dsh-user-commands —— 命令文件格式与命名文法）。
 *
 * 前半段直接打 `parseCommandDocument` 的边界（BOM、CRLF、未收尾的 `---`、空块），
 * 后半段经由真实发现管线验证「哪些文件被跳过、日志里说了什么」。
 */
import { describe, expect, it } from 'vitest'
import { discoverCommands } from '../src/host/discovery.ts'
import { parseCommandDocument, splitFrontmatter } from '../src/host/frontmatter.ts'
import { fakeIo, dirEntry, primaryWorkspace, recordingLog } from './helpers.ts'

/** 只有主根的一工作区发现请求。 */
const atRoot = { userDir: '/nope', workspaces: [primaryWorkspace('/work/a')] }

describe('frontmatter 解析', () => {
  it('识别 description 与 argument-hint，并剥掉块本身', () => {
    const parsed = parseCommandDocument('---\ndescription: 部署到预发\nargument-hint: [环境]\n---\n把 $ARGUMENTS 部署到预发')

    expect(parsed.document.frontmatter).toEqual({ description: '部署到预发', hint: '[环境]' })
    expect(parsed.document.body).toBe('把 $ARGUMENTS 部署到预发')
    expect(parsed.warnings).toEqual([])
  })

  it('没有 frontmatter 时正文就是全文，元数据为空', () => {
    const parsed = parseCommandDocument('审查这次改动')

    expect(parsed.document.frontmatter).toEqual({})
    expect(parsed.document.body).toBe('审查这次改动')
  })

  it('空的 frontmatter 块等同于没有元数据', () => {
    const parsed = parseCommandDocument('---\n---\n正文')

    expect(parsed.document.frontmatter).toEqual({})
    expect(parsed.document.body).toBe('正文')
  })

  it('未知字段只记警告，命令照常可用', () => {
    const parsed = parseCommandDocument('---\ndescription: 审查\nallowed-tools: bash\n---\n正文')

    expect(parsed.document.frontmatter.description).toBe('审查')
    expect(parsed.warnings).toEqual(['frontmatter 字段 allowed-tools 未识别，已忽略'])
  })

  it('argument-hint 写成 YAML 列表时还原成展示文案', () => {
    expect(parseCommandDocument('---\nargument-hint: [环境]\n---\n正文').document.frontmatter.hint).toBe('[环境]')
    expect(parseCommandDocument('---\nargument-hint: [issue-number, priority]\n---\n正文').document.frontmatter.hint)
      .toBe('[issue-number, priority]')
    expect(parseCommandDocument('---\nargument-hint: "[a] [b]"\n---\n正文').document.frontmatter.hint).toBe('[a] [b]')
    expect(parseCommandDocument('---\nargument-hint: []\n---\n正文').document.frontmatter.hint).toBeUndefined()
  })

  it('argument-hint 类型不对（映射等）只记警告', () => {
    const parsed = parseCommandDocument('---\nargument-hint:\n  a: b\n---\n正文')

    expect(parsed.document.frontmatter.hint).toBeUndefined()
    expect(parsed.warnings).toEqual(['frontmatter 字段 argument-hint 不是字符串或字符串列表，已忽略'])
  })

  it('已知字段类型不对按未识别处理', () => {
    const parsed = parseCommandDocument('---\ndescription: [a, b]\n---\n正文')

    expect(parsed.document.frontmatter).toEqual({})
    expect(parsed.warnings).toEqual(['frontmatter 字段 description 不是字符串，已忽略'])
  })

  it('frontmatter 不是合法 YAML 时抛错', () => {
    expect(() => parseCommandDocument('---\ndescription: "未闭合\n---\n正文')).toThrow(/不是合法 YAML/)
  })

  it('frontmatter 不是字段映射时抛错', () => {
    expect(() => parseCommandDocument('---\n- a\n- b\n---\n正文')).toThrow(/必须是一个字段映射/)
  })

  it('未收尾的 --- 按普通正文处理', () => {
    const split = splitFrontmatter('---\n还以为是 frontmatter')

    expect(split.raw).toBeUndefined()
    expect(split.body).toBe('---\n还以为是 frontmatter')
  })

  it('容忍 BOM 与 CRLF', () => {
    const parsed = parseCommandDocument('\ufeff---\r\ndescription: 部署\r\n---\r\n正文行')

    expect(parsed.document.frontmatter.description).toBe('部署')
    expect(parsed.document.body).toBe('正文行')
  })
})

describe('命令文件文法（经发现管线）', () => {
  it('完整 frontmatter 的命令带上说明与参数提示', async () => {
    const io = fakeIo({ '/work/a/.dsh/commands': ['deploy.md'] }, {
      '/work/a/.dsh/commands/deploy.md': '---\ndescription: 部署到预发\nargument-hint: [环境]\n---\n部署 $ARGUMENTS',
    })
    const { log, errors } = recordingLog()

    const scan = await discoverCommands(atRoot, io, log)

    expect(scan.projects[0]?.commands[0]).toMatchObject({ name: 'deploy', description: '部署到预发', hint: '[环境]' })
    expect(errors).toEqual([])
  })

  it('缺 description 时回退为「用户自定义命令 <文件名>」，正文不泄漏进说明', async () => {
    const io = fakeIo({ '/work/a/.dsh/commands': ['deploy.md'] }, {
      '/work/a/.dsh/commands/deploy.md': '这段正文只应该进 prompt，不该进发现菜单',
    })
    const { log } = recordingLog()

    const scan = await discoverCommands(atRoot, io, log)

    expect(scan.projects[0]?.commands[0]?.description).toBe('用户自定义命令 deploy.md')
  })

  it('非法 frontmatter 记错误并跳过，同目录其余命令不受影响', async () => {
    const io = fakeIo({ '/work/a/.dsh/commands': ['broken.md', 'ok.md'] }, {
      '/work/a/.dsh/commands/broken.md': '---\ndescription: "未闭合\n---\n正文',
      '/work/a/.dsh/commands/ok.md': '没问题',
    })
    const { log, errors } = recordingLog()

    const scan = await discoverCommands(atRoot, io, log)

    expect(scan.projects[0]?.commands.map((command) => command.name)).toEqual(['ok'])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('/work/a/.dsh/commands/broken.md')
    expect(errors[0]).toContain('已跳过')
  })

  it('命令名不符文法（大写、数字开头）记错误并跳过', async () => {
    const io = fakeIo({ '/work/a/.dsh/commands': ['Deploy.md', '2fast.md', 'ok.md'] }, {
      '/work/a/.dsh/commands/Deploy.md': '大写开头',
      '/work/a/.dsh/commands/2fast.md': '数字开头',
      '/work/a/.dsh/commands/ok.md': '合法',
    })
    const { log, errors } = recordingLog()

    const scan = await discoverCommands(atRoot, io, log)

    expect(scan.projects[0]?.commands.map((command) => command.name)).toEqual(['ok'])
    expect(errors).toHaveLength(2)
    // 文件按名字排序读取：'2fast.md' 在 'Deploy.md' 之前。
    expect(errors[0]).toContain('"2fast"')
    expect(errors[1]).toContain('"Deploy"')
  })

  it('正文为空白时记错误并跳过', async () => {
    const io = fakeIo({ '/work/a/.dsh/commands': ['empty.md'] }, {
      '/work/a/.dsh/commands/empty.md': '---\ndescription: 只有元数据\n---\n\n   \n',
    })
    const { log, errors } = recordingLog()

    const scan = await discoverCommands(atRoot, io, log)

    expect(scan.projects[0]?.commands).toEqual([])
    expect(errors[0]).toContain('正文为空')
  })

  it('子目录整体忽略并记警告，不产生 git 或 git:commit 之类的命令', async () => {
    const io = fakeIo({ '/work/a/.dsh/commands': [dirEntry('git'), 'ok.md'] }, {
      '/work/a/.dsh/commands/ok.md': '合法',
    })
    const { log, warnings, errors } = recordingLog()

    const scan = await discoverCommands(atRoot, io, log)

    expect(scan.projects[0]?.commands.map((command) => command.name)).toEqual(['ok'])
    expect(warnings).toEqual(['/work/a/.dsh/commands/git 是子目录，已忽略：命令只取 .dsh/commands 平铺一层的 .md 文件'])
    expect(errors).toEqual([])
  })

  it('未知字段记警告但命令仍注册', async () => {
    const io = fakeIo({ '/work/a/.dsh/commands': ['review.md'] }, {
      '/work/a/.dsh/commands/review.md': '---\ndescription: 审查\nallowed-tools: bash\n---\n审查 $ARGUMENTS',
    })
    const { log, warnings, errors } = recordingLog()

    const scan = await discoverCommands(atRoot, io, log)

    expect(scan.projects[0]?.commands.map((command) => command.name)).toEqual(['review'])
    expect(warnings).toEqual(['/work/a/.dsh/commands/review.md：frontmatter 字段 allowed-tools 未识别，已忽略'])
    expect(errors).toEqual([])
  })

  it('保留命令名（commands-reload）被拒绝，用户级与项目级一视同仁', async () => {
    const io = fakeIo(
      {
        '/home/u/.dsh/commands': ['commands-reload.md'],
        '/work/a/.dsh/commands': ['commands-reload.md'],
      },
      {
        '/home/u/.dsh/commands/commands-reload.md': '伪造的兜底命令',
        '/work/a/.dsh/commands/commands-reload.md': '伪造的兜底命令',
      },
    )
    const { log, errors } = recordingLog()

    const scan = await discoverCommands({ userDir: '/home/u/.dsh/commands', workspaces: [primaryWorkspace('/work/a')] }, io, log)

    expect(scan.user).toEqual([])
    expect(scan.projects[0]?.commands).toEqual([])
    expect(errors).toHaveLength(2)
    expect(errors[0]).toContain('插件保留的命令名 commands-reload')
  })
})
