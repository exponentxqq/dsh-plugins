/**
 * Directory watching for the project MCP configuration.
 *
 * Thin adapter over the kernel (G4): the debounced watcher class, the watch
 * seam and the debounce live in `@dsh-plugins/host-kit/watcher`. This package
 * keeps only its own three-level ladder and the policy that goes with it:
 *
 * 1. `<root>/.dsh/mcp` — the configuration directory itself, once it exists;
 * 2. `<root>/.dsh` — catches the creation of `mcp/`;
 * 3. `<root>` — catches the creation of `.dsh`.
 *
 * `fallbackToLast: true` is the ONLY semantic difference from
 * dsh-plugin-user-commands' ladder: the workspace root always exists, so a
 * project without `.dsh` yet is watched at its shallowest level, and the first
 * configuration file in a fresh project loads without a restart.
 * @module dsh-plugin-project-mcp/host/watcher
 */

import path from 'node:path'
import { ladderTargets } from '@dsh-plugins/host-kit/watcher'
import type { WatchIo } from '@dsh-plugins/host-kit/watcher'
import { MCP_DIR } from './scan.ts'

export { DirectoryWatcher, DEFAULT_DEBOUNCE_MS } from '@dsh-plugins/host-kit/watcher'
export type { WatchIo } from '@dsh-plugins/host-kit/watcher'

/**
 * The directory to watch for each root: the deepest existing ladder step
 * (the root itself when nothing deeper exists).
 * @param io - the existence seam.
 * @param roots - the workspace roots, in scan order.
 * @returns one watch target per distinct root, in scan order.
 */
export async function watchTargets(
  io: Pick<WatchIo, 'isDirectory'>,
  roots: readonly string[],
): Promise<readonly string[]> {
  return await ladderTargets(
    io,
    roots.map((root) => [path.join(root, MCP_DIR), path.join(root, '.dsh'), root]),
    { fallbackToLast: true },
  )
}
