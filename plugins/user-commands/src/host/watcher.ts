/**
 * 命令目录的监听。
 *
 * 每个根只装一个监听器，且瞄在该根「阶梯」里最深的那个已存在层级上：
 *
 * 1. `<根>/.dsh/commands` —— 命令目录本身（一旦存在）；
 * 2. `<根>/.dsh` —— 抓住 `commands/` 被创建的那一刻；
 * 3. `<根>` —— 抓住 `.dsh` 被创建的那一刻。
 *
 * 阶梯是「全新项目里的第一个命令文件无需重启即可生效」的原因：一个连 `.dsh` 都没有的根
 * 也会在最浅一层被盯着，下一次重扫再把监听器下移。
 *
 * 用户级目录同理：`$DSH_HOME/commands` 不存在时盯着 `$DSH_HOME`。
 *
 * 事件一律防抖，因为一次编辑器保存是若干个文件系统事件，而每次重扫都要重读所有命令目录。
 *
 * `fs.watch` 存在**静默失聪**类失效（NFS/SMB/FUSE 挂载不投递事件、挂起恢复丢事件、arm 竞态窗口）：
 * 没有异常可 catch、没有日志可打，唯一的发现者是人，因此必须保留 `/commands-reload` 兜底。
 * @module dsh-plugin-user-commands/host/watcher
 */

import path from 'node:path'
import { COMMANDS_DIR } from './discovery.ts'
import type { CommandLog } from './types.ts'

/** 监听 seam。 */
export interface WatchIo {
  /**
   * 某个路径是否存在且是目录。
   * @param candidate - 待测的绝对路径。
   * @returns 目录是否存在。
   */
  isDirectory(candidate: string): Promise<boolean>
  /**
   * 监听一个目录。
   * @param dir - 绝对目录路径。
   * @param listener - 该目录内发生任何变化后调用。
   * @returns 停止监听的句柄。
   * @throws 该目录无法监听时抛错。
   */
  watch(dir: string, listener: () => void): { close(): void }
}

/** 最后一次文件系统事件之后等多久才重扫。 */
export const DEFAULT_DEBOUNCE_MS = 250

/**
 * 一个工作区根的监听阶梯（最深在前）。
 * @param root - 工作区根（主根或附加根）。
 * @returns 阶梯上的候选目录。
 */
export function projectLadder(root: string): readonly string[] {
  return [path.join(root, COMMANDS_DIR), path.join(root, '.dsh'), root]
}

/**
 * 用户级命令目录的监听阶梯（最深在前）。
 * @param userDir - `$DSH_HOME/commands`。
 * @returns 阶梯上的候选目录。
 */
export function userLadder(userDir: string): readonly string[] {
  return [userDir, path.dirname(userDir)]
}

/**
 * 每条阶梯该盯哪个目录：最深的那个已存在层级（都不存在时盯最浅一层）。
 * @param io - 存在性 seam。
 * @param userDir - 用户级命令目录。
 * @param roots - 各工作区根，按扫描顺序。
 * @returns 去重后的监听目标。
 */
export async function watchTargets(
  io: Pick<WatchIo, 'isDirectory'>,
  userDir: string,
  roots: readonly string[],
): Promise<readonly string[]> {
  const targets = new Set<string>()
  for (const ladder of [userLadder(userDir), ...roots.map(projectLadder)]) {
    for (const step of ladder) {
      if (await io.isDirectory(step)) {
        targets.add(step)
        break
      }
    }
  }
  return [...targets]
}

/** 命令目录上的防抖监听器集合。 */
export class DirectoryWatcher {
  /** 按目录索引的存活监听器。 */
  private readonly watchers = new Map<string, { close(): void }>()
  /** 已挂起的防抖定时器。 */
  private timer: ReturnType<typeof setTimeout> | undefined

  /**
   * @param io - 监听 seam。
   * @param onChange - 要安排的重扫。
   * @param log - 不可监听目录的警告出口。
   * @param debounceMs - 文件系统事件的合并窗口。
   */
  constructor(
    private readonly io: WatchIo,
    private readonly onChange: () => void,
    private readonly log: CommandLog,
    private readonly debounceMs: number = DEFAULT_DEBOUNCE_MS,
  ) {}

  /**
   * 让监听集合恰好等于这批目录。
   *
   * 离场的目录被释放、新来的被监听；某个目录监不起来只报一条警告，不影响其余目录。
   * @param dirs - 要监听的目录。
   */
  arm(dirs: readonly string[]): void {
    const wanted = new Set(dirs)
    // 先物化再释放：下面的循环会改动 watchers。
    for (const [dir, watcher] of Array.from(this.watchers)) {
      if (wanted.has(dir)) continue
      this.watchers.delete(dir)
      try {
        watcher.close()
      } catch {
        // 目录都没了，监听器早就是关的。
      }
    }
    for (const dir of wanted) {
      if (this.watchers.has(dir)) continue
      try {
        this.watchers.set(dir, this.io.watch(dir, () => {
          this.schedule()
        }))
      } catch (error) {
        this.log.warn(`无法监听 ${dir}：${String(error)}；可执行 /commands-reload 手动刷新`)
      }
    }
  }

  /** 当前正在监听的目录。 */
  watched(): readonly string[] {
    return [...this.watchers.keys()]
  }

  /** 停止一切监听并丢弃挂起的重扫。 */
  dispose(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
    for (const watcher of this.watchers.values()) {
      try {
        watcher.close()
      } catch {
        // 没有东西要释放了。
      }
    }
    this.watchers.clear()
  }

  /** 把一次文件系统事件合并成一次重扫。 */
  private schedule(): void {
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = undefined
      this.onChange()
    }, this.debounceMs)
  }
}
