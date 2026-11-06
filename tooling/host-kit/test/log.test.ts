/**
 * 日志适配的规范级用例（H11）：双通道纪律——每一行同时进宿主 logger 与 console，
 * 前缀逐字保留，三个级别一个不少。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LogSink } from '../src/log.ts'
import { createLog } from '../src/log.ts'

/** 一条被记录下来的日志。 */
interface Recorded {
  readonly level: 'info' | 'warn' | 'error'
  readonly message: string
}

/** 收集宿主 logger 通道的假上下文。 */
function collectingContext(): { readonly ctx: { logger: LogSink }; readonly lines: Recorded[] } {
  const lines: Recorded[] = []
  const logger: LogSink = {
    info: (message) => lines.push({ level: 'info', message }),
    warn: (message) => lines.push({ level: 'warn', message }),
    error: (message) => lines.push({ level: 'error', message }),
  }
  return { ctx: { logger }, lines }
}

describe('createLog：双通道纪律', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('info / warn / error 都同时写 logger 与 console，且带同一前缀', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { ctx, lines } = collectingContext()
    const log = createLog(ctx, 'dsh-plugin-example')

    log.info('started')
    log.warn('degraded')
    log.error('failed')

    expect(lines).toEqual([
      { level: 'info', message: 'dsh-plugin-example: started' },
      { level: 'warn', message: 'dsh-plugin-example: degraded' },
      { level: 'error', message: 'dsh-plugin-example: failed' },
    ])
    expect(info).toHaveBeenCalledWith('dsh-plugin-example: started')
    expect(warn).toHaveBeenCalledWith('dsh-plugin-example: degraded')
    expect(error).toHaveBeenCalledWith('dsh-plugin-example: failed')
    expect(info).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalledTimes(1)
  })

  it('前缀是参数而非硬编码：不同插件各带各的前缀', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const { ctx, lines } = collectingContext()

    createLog(ctx, 'dsh-plugin-project-mcp').info('a')
    createLog(ctx, 'dsh-plugin-user-commands').info('b')

    expect(lines.map((line) => line.message)).toEqual([
      'dsh-plugin-project-mcp: a',
      'dsh-plugin-user-commands: b',
    ])
  })
})
