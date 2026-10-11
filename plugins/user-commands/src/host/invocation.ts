/**
 * 调用语义：把一条命令变成会话里的一条用户消息。
 *
 * 执行时**现读文件**——注册表只承载名称、说明与参数提示，正文永远从磁盘重新读。
 * 于是「改文件 → 下次调用即生效」不需要任何缓存失效逻辑，也没有注册表与磁盘不一致的窗口；
 * 代价是文件可能在注册之后被删掉，那种情况返回错误结果，绝不提交半截内容。
 *
 * 占位符只有 `$ARGUMENTS` 一个：其全部出现处替换为去首尾空白的调用参数，无参数代入空串。
 * 不做位置参数、不做上下文变量——少一个占位符就少一处注入面与转义语义。
 *
 * 提交走 `agent.steer(...)`（与 `/plan` 同一条通道）：命令自己不是模型消息，
 * 但 prompt 型命令的**产物**是一条货真价实的用户消息，空闲会话也会因此开启轮次。
 * @module dsh-plugin-user-commands/host/invocation
 */

import type { CommandResult } from '@deepseek-ai/dsh-commands'
import { parseCommandDocument } from './frontmatter.ts'
import type { CommandLog, RegisteredCommand } from './types.ts'

/** 唯一支持的占位符。 */
export const ARGUMENTS_PLACEHOLDER = '$ARGUMENTS'

/** 调用一条命令所需的外部能力。 */
export interface InvocationDeps {
  /**
   * 读一个命令文件。
   * @param file - 绝对文件路径。
   * @returns 文件 UTF-8 文本。
   * @throws 文件不可读时抛错。
   */
  readFile(file: string): Promise<string>
  /**
   * 提交展开后的 prompt（host 侧就是 `agent.steer(createUserMessage(...))`）。
   * @param text - 展开后的正文。
   */
  submit(text: string): void
  /** 诊断出口。 */
  log: CommandLog
}

/**
 * 展开 `$ARGUMENTS`。
 * @param template - 命令正文模板。
 * @param rawInput - 命令名之后的原始输入（含分隔空白）。
 * @returns 展开后的文本。
 */
export function expandArguments(template: string, rawInput: string): string {
  return template.replaceAll(ARGUMENTS_PLACEHOLDER, rawInput.trim())
}

/**
 * 取出一条命令此刻的正文模板。
 * @param command - 待执行的命令。
 * @param deps - 调用所需的外部能力。
 * @returns 模板正文。
 * @throws 文件不可读或不再是合法命令定义时抛错。
 */
async function resolveTemplate(command: RegisteredCommand, deps: InvocationDeps): Promise<string> {
  if (command.origin.kind === 'builtin') return command.origin.prompt
  const text = await deps.readFile(command.origin.file)
  return parseCommandDocument(text).document.body
}

/**
 * 执行一条命令。
 * @param command - 待执行的命令。
 * @param rawInput - 用户输入中命令名之后的原始文本。
 * @param deps - 调用所需的外部能力。
 * @returns 命令结果：成功表示 prompt 已提交，错误带可读原因且未提交任何内容。
 */
export async function invokeCommand(
  command: RegisteredCommand,
  rawInput: string,
  deps: InvocationDeps,
): Promise<CommandResult> {
  let template: string
  try {
    template = await resolveTemplate(command, deps)
  } catch (error) {
    const message = `命令 /${command.name} 无法读取：${error instanceof Error ? error.message : String(error)}`
    deps.log.error(message)
    return { kind: 'error', text: message }
  }

  if (template.trim() === '') {
    const message = `命令 /${command.name} 的正文为空，未提交任何内容`
    deps.log.error(message)
    return { kind: 'error', text: message }
  }

  const text = expandArguments(template, rawInput)
  if (text.trim() === '') {
    const message = `命令 /${command.name} 展开后为空，未提交任何内容`
    deps.log.error(message)
    return { kind: 'error', text: message }
  }

  try {
    deps.submit(text)
  } catch (error) {
    const message = `命令 /${command.name} 的 prompt 无法提交到当前会话：${String(error)}`
    deps.log.error(message)
    return { kind: 'error', text: message }
  }
  return { kind: 'success', text: `已提交 /${command.name}` }
}
