/**
 * 真实 seam：发现用 `node:fs`，诊断用宿主 logger，用户级目录用 `$DSH_HOME`。
 *
 * 直接读文件系统是本仓库既有的 host 面做法（project-mcp 同样）：
 * host 进程是可信代码，agent 沙箱约束的是 agent 的工具，不是这个插件自己的配置读取。
 *
 * `$DSH_HOME` 的优先级与 `@deepseek-ai/dsh-home-paths` 的 `resolveDshHome` 一致：
 * 显式配置 > `$DSH_HOME`（空串/纯空白视为未设） > `~/.dsh`。这里自己算而不引入该依赖，
 * 因为需要的只是「一个目录」，多一个运行时依赖不值得。
 * @module dsh-plugin-user-commands/host/host-io
 */

import { promises as fs, watch as watchDirectory } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { RealpathIo } from './attribution.ts'
import { USER_COMMANDS_DIR_NAME } from './discovery.ts'
import type { CommandIo, CommandLog } from './types.ts'
import type { WatchIo } from './watcher.ts'

/** 目录与文件读取走真实文件系统。 */
export const nodeCommandIo: CommandIo = {
  readDir: async (dir) => await fs.readdir(dir, { withFileTypes: true }),
  readFile: async (file) => await fs.readFile(file, 'utf8'),
}

/** canonical 化走真实文件系统。 */
export const nodeRealpathIo: RealpathIo = {
  realpath: async (candidate) => await fs.realpath(candidate),
}

/**
 * 目录监听走真实文件系统。
 *
 * `persistent: false` 让监听器不拦着进程退出；不使用 recursive：`watcher.ts` 的阶梯本来就瞄在
 * 最深的已存在目录上。
 */
export const nodeWatchIo: WatchIo = {
  isDirectory: async (candidate) => {
    try {
      return (await fs.stat(candidate)).isDirectory()
    } catch {
      return false
    }
  },
  watch: (dir, listener) => watchDirectory(dir, { persistent: false }, () => {
    listener()
  }),
}

/**
 * 解析 harness 数据根目录。
 * @param env - 环境变量（默认 `process.env`）。
 * @param home - 操作系统 home（默认 `os.homedir()`）。
 * @returns 归一化后的绝对路径。
 */
export function harnessHome(
  env: Record<string, string | undefined> = process.env,
  home: string = os.homedir(),
): string {
  const configured = env.DSH_HOME?.trim()
  if (configured !== undefined && configured !== '') return path.resolve(configured)
  return path.join(home, '.dsh')
}

/**
 * 用户级命令目录。
 * @param env - 环境变量（默认 `process.env`）。
 * @param home - 操作系统 home。
 * @returns `$DSH_HOME/commands` 的绝对路径。
 */
export function userCommandsDir(
  env: Record<string, string | undefined> = process.env,
  home: string = os.homedir(),
): string {
  return path.join(harnessHome(env, home), USER_COMMANDS_DIR_NAME)
}

/**
 * 把宿主 logger 适配成发现层的日志 seam。
 *
 * 每一行都同时走两个通道，这是有意的：web profile 在启动结束后不再注册 logger exporter
 * （app-boot 只留一个收集启动诊断），因此单靠 `ctx.logger` 在人类会看的那份进程日志
 * （`docker logs dsh`）里是看不见的——而冲突与注册失败恰恰必须在那里可见。
 * console 那份就是这个出口；logger 那份让任何真接了 exporter 的部署也能在应用内看到。
 * @param ctx - 携带 logger 的宿主上下文。
 * @returns 带本插件前缀的日志 seam。
 */
export function commandLog(ctx: Context): CommandLog {
  const line = (message: string): string => `dsh-plugin-user-commands: ${message}`
  return {
    info: (message) => {
      ctx.logger.info(line(message))
      console.info(line(message))
    },
    warn: (message) => {
      ctx.logger.warn(line(message))
      console.warn(line(message))
    },
    error: (message) => {
      ctx.logger.error(line(message))
      console.error(line(message))
    },
  }
}
