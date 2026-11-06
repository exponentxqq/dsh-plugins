/**
 * The real seams: `node:fs` for canonicalization and directory watching.
 *
 * Reading the filesystem directly is the established host-face pattern in this
 * repository (the host-only plugins do the same): the host process is trusted
 * code, and the agent sandbox governs the agent's tools, not a plugin's own
 * configuration reader.
 *
 * Both objects are byte-for-byte the two shared constants previously duplicated
 * in `plugins/project-mcp/src/host/host-io.ts:26-48` and
 * `plugins/user-commands/src/host/host-io.ts:29-50` — the package-specific I/O
 * (`nodeScanIo`, `nodeCommandIo`, `$DSH_HOME` resolution) stays local to each
 * plugin.
 * @module @dsh-plugins/host-kit/host-io
 */

import { promises as fs } from 'node:fs'
import { watch as watchDirectory } from 'node:fs'
import type { RealpathPort } from './attribution.ts'
import type { WatchIo } from './watcher.ts'

/** Canonicalization against the real filesystem. */
export const nodeRealpathIo: RealpathPort = {
  realpath: async (candidate) => await fs.realpath(candidate),
}

/**
 * Directory watching against the real filesystem.
 *
 * `persistent: false` keeps the watchers from holding the process open, and no
 * recursive option is used: the adapter's ladder already aims each watch at the
 * deepest directory that exists.
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
