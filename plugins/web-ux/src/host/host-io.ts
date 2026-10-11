/**
 * The real seams: `node:fs` for the scan and canonicalization, the host logger
 * for diagnostics.
 *
 * Reading the filesystem directly is the established host-face pattern in this
 * repository (git-graph-multi does the same): the host process is trusted
 * code, and the agent sandbox governs the agent's tools, not this plugin's own
 * configuration reader.
 * @module dsh-plugin-web-ux/host/host-io
 */

import { promises as fs } from 'node:fs'
import { watch as watchDirectory } from 'node:fs'
import type { Context } from '@deepseek-ai/cordis'
import type { RealpathIo } from './attribution.ts'
import type { ScanIo, ScanLog } from './types.ts'
import type { WatchIo } from './watcher.ts'

/** Directory and file reads against the real filesystem. */
export const nodeScanIo: ScanIo = {
  readDir: async (dir) => await fs.readdir(dir),
  readFile: async (file) => await fs.readFile(file, 'utf8'),
}

/** Canonicalization against the real filesystem. */
export const nodeRealpathIo: RealpathIo = {
  realpath: async (candidate) => await fs.realpath(candidate),
}

/**
 * Directory watching against the real filesystem.
 *
 * `persistent: false` keeps the watchers from holding the process open, and no
 * recursive option is used: the ladder in `watcher.ts` already aims each watch
 * at the deepest directory that exists.
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
 * Adapt the host logger to the scan's logging seam.
 *
 * Every line goes to BOTH channels on purpose. The web profile registers no
 * logger exporter once boot has finished (app-boot keeps one only to collect
 * startup diagnostics), so a `ctx.logger` call by itself is invisible in the
 * process log a human reads (`docker logs dsh`) — which is exactly where a
 * conflict or a failed restriction has to show up. The console copy is that
 * surface; the logger copy keeps the message in the in-app buffer for any
 * deployment that does wire an exporter.
 * @param ctx - the host context carrying the logger.
 * @returns the logging seam, with this plugin's name on every line.
 */
export function scanLog(ctx: Context): ScanLog {
  const line = (message: string): string => `dsh-plugin-web-ux: ${message}`
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
