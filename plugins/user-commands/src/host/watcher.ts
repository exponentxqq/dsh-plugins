/**
 * 命令目录的监听。
 *
 * 薄适配器（G4）：防抖监听器、监听 seam 与防抖窗口都来自 `@dsh-plugins/host-kit/watcher`。
 * 本包只保留自己的**双阶梯**（顺序即语义）：
 *
 * 1. 用户级：`$DSH_HOME/commands` → `$DSH_HOME`；
 * 2. 每个工作区根：`<根>/.dsh/commands` → `<根>/.dsh` → `<根>`。
 *
 * 与 dsh-plugin-project-mcp 的唯一语义差是**没有 fallback**：`$DSH_HOME` 可能真的不存在，
 * 这时不监听（只影响新鲜度，`/commands-reload` 仍是兜底）。工作区根在磁盘上总是存在，
 * 所以项目阶梯天然落到根本身。
 *
 * `fs.watch` 存在**静默失聪**类失效（NFS/SMB/FUSE 挂载不投递事件、挂起恢复丢事件、arm 竞态
 * 窗口）：没有异常可 catch、没有日志可打，唯一的发现者是人，因此必须保留 `/commands-reload`
 * 兜底。
 * @module dsh-plugin-user-commands/host/watcher
 */

import path from 'node:path'
import { ladderTargets } from '@dsh-plugins/host-kit/watcher'
import type { WatchIo } from '@dsh-plugins/host-kit/watcher'
import { COMMANDS_DIR } from './discovery.ts'

export { DirectoryWatcher, DEFAULT_DEBOUNCE_MS } from '@dsh-plugins/host-kit/watcher'
export type { WatchIo } from '@dsh-plugins/host-kit/watcher'

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
 * 每条阶梯该盯哪个目录：最深的那个已存在层级；都不存在时不监听（无 fallback）。
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
  return await ladderTargets(io, [userLadder(userDir), ...roots.map(projectLadder)])
}
