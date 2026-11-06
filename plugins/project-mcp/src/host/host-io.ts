/**
 * The real seams: `node:fs` for the scan and canonicalization, the host logger
 * for diagnostics.
 *
 * Reading the filesystem directly is the established host-face pattern in this
 * repository (the other host-only plugins do the same): the host process is
 * trusted code, and the agent sandbox governs the agent's tools, not this
 * plugin's own configuration reader.
 *
 * Thin adapter over the kernel (G4): `nodeRealpathIo` and `nodeWatchIo` are the
 * kernel's real seams, shared with dsh-plugin-user-commands. `nodeScanIo`
 * stays local on purpose — reading directory entries as plain name strings is
 * this package's own port, not the kernel's shared shape. The log prefix is
 * unchanged, byte for byte: `dsh-plugin-project-mcp: `.
 * @module dsh-plugin-project-mcp/host/host-io
 */

import { promises as fs } from 'node:fs'
import type { Context } from '@deepseek-ai/cordis'
import { createLog } from '@dsh-plugins/host-kit/log'
import type { ScanIo, ScanLog } from './types.ts'

export { nodeRealpathIo, nodeWatchIo } from '@dsh-plugins/host-kit/host-io'

/** Directory and file reads against the real filesystem. */
export const nodeScanIo: ScanIo = {
  readDir: async (dir) => await fs.readdir(dir),
  readFile: async (file) => await fs.readFile(file, 'utf8'),
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
  return createLog(ctx, 'dsh-plugin-project-mcp')
}
