/**
 * 调用语义测试（规范：dsh-user-commands —— 占位符展开、调用语义）。
 *
 * 覆盖展开的四种情形、现读不缓存、提交内容、正文被清空/文件被删时的报错与「不提交半截内容」。
 */
import { describe, expect, it } from 'vitest'
import { expandArguments, invokeCommand } from '../src/host/invocation.ts'
import type { CommandLog } from '../src/host/types.ts'
import { builtinCommand, fileCommand, recordingLog } from './helpers.ts'

/**
 * 造一份调用装置：命令文件来自可变的内容表，提交进 `submitted`。
 * @param files - 文件路径 → 内容（可在测试中改，用来验证现读）。
 * @returns 装置。
 */
function device(files: Record<string, string>) {
  const submitted: string[] = []
  const { log, errors } = recordingLog()
  return {
    submitted,
    errors,
    deps: {
      readFile: async (file: string) => {
        const text = files[file]
        if (text === undefined) throw new Error(`ENOENT: no such file ${file}`)
        return text
      },
      submit: (text: string) => submitted.push(text),
      log: log satisfies CommandLog,
    },
  }
}

describe('$ARGUMENTS 展开', () => {
  it('带参数时替换为去首尾空白的参数', () => {
    expect(expandArguments('审查 $ARGUMENTS 分支', '  feat/x ')).toBe('审查 feat/x 分支')
  })

  it('无参数时替换为空串', () => {
    expect(expandArguments('审查 $ARGUMENTS 分支', '')).toBe('审查  分支')
  })

  it('多处出现全部替换为同一份参数', () => {
    expect(expandArguments('$ARGUMENTS 与 $ARGUMENTS', 'a b')).toBe('a b 与 a b')
  })

  it('除 $ARGUMENTS 之外不认其他占位符', () => {
    expect(expandArguments('$1 ${CWD} $ARGUMENTS', 'x')).toBe('$1 ${CWD} x')
  })
})

describe('命令执行', () => {
  it('现读文件正文（剥掉 frontmatter）并提交展开后的 prompt', async () => {
    const files = {
      '/work/a/.dsh/commands/deploy.md': '---\ndescription: 部署\n---\n把 $ARGUMENTS 部署到预发',
    }
    const harness = device(files)
    const command = fileCommand('deploy', '/work/a/.dsh/commands/deploy.md')

    const result = await invokeCommand(command, ' v1.2.0', harness.deps)

    expect(result).toEqual({ kind: 'success', text: '已提交 /deploy' })
    expect(harness.submitted).toEqual(['把 v1.2.0 部署到预发'])
  })

  it('现读不缓存：两次调用之间改文件，第二次提交新正文', async () => {
    const files = { '/work/a/.dsh/commands/review.md': '第一版正文' }
    const harness = device(files)
    const command = fileCommand('review', '/work/a/.dsh/commands/review.md')

    await invokeCommand(command, '', harness.deps)
    files['/work/a/.dsh/commands/review.md'] = '第二版正文'
    await invokeCommand(command, '', harness.deps)

    expect(harness.submitted).toEqual(['第一版正文', '第二版正文'])
  })

  it('文件被删除时报错且不提交任何内容', async () => {
    const harness = device({})
    const command = fileCommand('deploy', '/work/a/.dsh/commands/deploy.md')

    const result = await invokeCommand(command, '', harness.deps)

    expect(result.kind).toBe('error')
    expect(result.kind === 'error' ? result.text : '').toContain('无法读取')
    expect(harness.submitted).toEqual([])
    expect(harness.errors).toHaveLength(1)
  })

  it('文件正文变成空白时报错且不提交', async () => {
    const files = { '/work/a/.dsh/commands/deploy.md': '---\ndescription: 部署\n---\n  \n' }
    const harness = device(files)
    const command = fileCommand('deploy', '/work/a/.dsh/commands/deploy.md')

    const result = await invokeCommand(command, '', harness.deps)

    expect(result.kind === 'error' ? result.text : '').toContain('正文为空')
    expect(harness.submitted).toEqual([])
  })

  it('展开后为空时报错且不提交', async () => {
    const files = { '/work/a/.dsh/commands/echo.md': '$ARGUMENTS' }
    const harness = device(files)
    const command = fileCommand('echo', '/work/a/.dsh/commands/echo.md')

    const result = await invokeCommand(command, '   ', harness.deps)

    expect(result.kind === 'error' ? result.text : '').toContain('展开后为空')
    expect(harness.submitted).toEqual([])
  })

  it('文件 frontmatter 变成非法 YAML 时报错且不提交', async () => {
    const files = { '/work/a/.dsh/commands/deploy.md': '---\ndescription: "未闭合\n---\n正文' }
    const harness = device(files)
    const command = fileCommand('deploy', '/work/a/.dsh/commands/deploy.md')

    const result = await invokeCommand(command, '', harness.deps)

    expect(result.kind).toBe('error')
    expect(harness.submitted).toEqual([])
  })

  it('内置命令直接用常量 prompt，并同样展开 $ARGUMENTS', async () => {
    const harness = device({})
    const command = builtinCommand('init', '请分析仓库。补充关注点：$ARGUMENTS')

    const result = await invokeCommand(command, ' 重点写发布流程', harness.deps)

    expect(result).toEqual({ kind: 'success', text: '已提交 /init' })
    expect(harness.submitted).toEqual(['请分析仓库。补充关注点：重点写发布流程'])
  })

  it('提交失败时返回错误结果而不是抛出', async () => {
    const files = { '/work/a/.dsh/commands/deploy.md': '正文' }
    const { log, errors } = recordingLog()
    const command = fileCommand('deploy', '/work/a/.dsh/commands/deploy.md')

    const result = await invokeCommand(command, '', {
      readFile: async (file) => files[file as keyof typeof files] ?? '',
      submit: () => {
        throw new Error('agent disposed')
      },
      log,
    })

    expect(result.kind === 'error' ? result.text : '').toContain('无法提交')
    expect(errors).toHaveLength(1)
  })
})
