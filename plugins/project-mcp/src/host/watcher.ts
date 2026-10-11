/**
 * Directory watching for the project MCP configuration.
 *
 * One watch per workspace root, aimed at the deepest existing level of a
 * fixed ladder:
 *
 * 1. `<root>/.dsh/mcp` — the configuration directory itself, once it exists.
 * 2. `<root>/.dsh` — catches the creation of `mcp/`.
 * 3. `<root>` — catches the creation of `.dsh`.
 *
 * The ladder is what makes the FIRST configuration file in a fresh project
 * load without a restart: a root that has no `.dsh` at all is still watched,
 * at its shallowest level, and the next rescan re-aims the watch deeper.
 *
 * Events are debounced, because one editor save is several filesystem events
 * and every rescan is a full re-read of every configured root.
 * @module dsh-plugin-project-mcp/host/watcher
 */

import path from 'node:path'
import { MCP_DIR } from './scan.ts'
import type { ScanLog } from './types.ts'

/** The watch seam. */
export interface WatchIo {
  /**
   * Whether one path exists and is a directory.
   * @param candidate - the absolute path to test.
   * @returns whether a directory is there.
   */
  isDirectory(candidate: string): Promise<boolean>
  /**
   * Watch one directory.
   * @param dir - the absolute directory path.
   * @param listener - called after any change in that directory.
   * @returns the handle that stops watching.
   * @throws when the directory cannot be watched.
   */
  watch(dir: string, listener: () => void): { close(): void }
}

/** How long to wait after the last filesystem event before rescanning. */
export const DEFAULT_DEBOUNCE_MS = 250

/** The ladder of directories considered for one root, deepest first. */
const LADDER = [MCP_DIR, '.dsh', '.'] as const

/**
 * The directory to watch for each root: the deepest existing ladder step.
 * @param io - the existence seam.
 * @param roots - the workspace roots, in scan order.
 * @returns one watch target per root (the root itself when nothing deeper exists).
 */
export async function watchTargets(
  io: Pick<WatchIo, 'isDirectory'>,
  roots: readonly string[],
): Promise<readonly string[]> {
  const targets: string[] = []
  for (const root of roots) {
    for (const step of LADDER) {
      if (step === '.') {
        targets.push(root)
        break
      }
      const candidate = path.join(root, step)
      if (await io.isDirectory(candidate)) {
        targets.push(candidate)
        break
      }
    }
  }
  return targets
}

/** Debounced watchers over the configuration directories. */
export class DirectoryWatcher {
  /** Live watchers by directory. */
  private readonly watchers = new Map<string, { close(): void }>()
  /** The pending debounce timer, if one is armed. */
  private timer: ReturnType<typeof setTimeout> | undefined

  /**
   * @param io - the watch seam.
   * @param onChange - the rescan to schedule.
   * @param log - sink for unwatchable-directory warnings.
   * @param debounceMs - how long to coalesce filesystem events.
   */
  constructor(
    private readonly io: WatchIo,
    private readonly onChange: () => void,
    private readonly log: ScanLog,
    private readonly debounceMs: number = DEFAULT_DEBOUNCE_MS,
  ) {}

  /**
   * Watch exactly this directory set.
   *
   * Directories that left the set are released and new ones are watched; a
   * directory that cannot be watched is reported without failing the rest.
   * @param dirs - the directories to watch.
   */
  arm(dirs: readonly string[]): void {
    const wanted = new Set(dirs)
    // Materialized because releasing below mutates `watchers` while iterating.
    for (const [dir, watcher] of Array.from(this.watchers)) {
      if (wanted.has(dir)) continue
      this.watchers.delete(dir)
      try {
        watcher.close()
      } catch {
        // A watcher whose directory disappeared is already closed.
      }
    }
    for (const dir of wanted) {
      if (this.watchers.has(dir)) continue
      try {
        this.watchers.set(dir, this.io.watch(dir, () => this.schedule()))
      } catch (error) {
        this.log.warn(`cannot watch ${dir}: ${String(error)}; use /mcp-reload to pick up changes there`)
      }
    }
  }

  /** The directories currently watched. */
  watched(): readonly string[] {
    return [...this.watchers.keys()]
  }

  /** Stop watching everything and drop a pending rescan. */
  dispose(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
    for (const watcher of this.watchers.values()) {
      try {
        watcher.close()
      } catch {
        // Nothing left to release.
      }
    }
    this.watchers.clear()
  }

  /** Coalesce one filesystem event into a single rescan. */
  private schedule(): void {
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = undefined
      this.onChange()
    }, this.debounceMs)
  }
}
