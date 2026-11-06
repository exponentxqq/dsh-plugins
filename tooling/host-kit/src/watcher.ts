/**
 * Directory watching shared by the host halves.
 *
 * One watch per root, aimed at the deepest existing level of a fixed ladder:
 *
 * 1. the configuration directory itself, once it exists;
 * 2. its parent (`.dsh` or `$DSH_HOME`), catching the directory's creation;
 * 3. the root itself, catching the parent's creation.
 *
 * The ladder is what makes the FIRST configuration file in a fresh project load
 * without a restart: a root that has no `.dsh` at all is still watched, at its
 * shallowest level, and the next rescan re-aims the watch deeper.
 *
 * The class body is migrated verbatim from
 * `plugins/project-mcp/src/host/watcher.ts:76-153` (same release/unwatch
 * semantics, same debounce); the ladder itself is supplied by the adapter,
 * because dsh-project-mcp and dsh-plugin-user-commands aim at different
 * directory names.
 *
 * Events are debounced, because one editor save is several filesystem events
 * and every rescan is a full re-read of every configured root.
 * @module @dsh-plugins/host-kit/watcher
 */

import type { LogSink } from './log.ts'

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

/** How a ladder behaves when none of its levels exists right now. */
export interface LadderOptions {
  /**
   * Watch the shallowest (last) ladder level when nothing exists yet.
   *
   * dsh-project-mcp passes `true` (the workspace root always exists, so the
   * wedge case "no `.dsh` yet" still gets a watch); dsh-plugin-user-commands
   * passes `false` (`$DSH_HOME` may genuinely be absent).
   */
  readonly fallbackToLast?: boolean
}

/**
 * The deepest existing level of one ladder, deepest first.
 * @param io - the existence seam.
 * @param ladder - absolute candidate directories, deepest first.
 * @param options - fallback policy for a ladder with nothing on disk.
 * @returns the chosen directory, or undefined when nothing exists and the
 *   fallback is off.
 */
export async function deepestExisting(
  io: Pick<WatchIo, 'isDirectory'>,
  ladder: readonly string[],
  options: LadderOptions = {},
): Promise<string | undefined> {
  for (const candidate of ladder) {
    if (await io.isDirectory(candidate)) return candidate
  }
  return options.fallbackToLast === true ? ladder[ladder.length - 1] : undefined
}

/**
 * Resolve several ladders into one watch-target list, preserving order and
 * de-duplicating exact strings (two ladders may aim at the same shallow parent).
 * @param io - the existence seam.
 * @param ladders - one ladder per root, deepest first.
 * @param options - fallback policy for ladders with nothing on disk.
 * @returns the watch targets, in ladder order, without duplicates.
 */
export async function ladderTargets(
  io: Pick<WatchIo, 'isDirectory'>,
  ladders: readonly (readonly string[])[],
  options: LadderOptions = {},
): Promise<readonly string[]> {
  const targets: string[] = []
  for (const ladder of ladders) {
    const target = await deepestExisting(io, ladder, options)
    if (target !== undefined && !targets.includes(target)) targets.push(target)
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
    private readonly log: LogSink,
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
