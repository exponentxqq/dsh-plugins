/**
 * `.dsh/commands/` 与 `$DSH_HOME/commands/` 的发现、解析与同名仲裁。
 *
 * 发现是对一份有序目录清单的纯遍历，顺序本身就是仲裁顺序，且是有意为之的事实而非调度巧合：
 * 工作区内主根先于附加根、同一目录内文件按名字排序。第一个认领某个命令名者胜出，
 * 后来者连着自己的来源一起记进错误日志并被跳过。
 * 命令名绝不被改写——它是用户输入 `/name` 的字面契约，改名等于把命令变成另一个命令。
 *
 * 仲裁的作用域是**一个工作区**（主根 + 附加根），而不是整个进程：每个工作区各自构成一个
 * 独立的项目级命名空间，工作区之间同名命令互不串扰——A 的 `deploy.md` 与 B 的 `deploy.md`
 * 两份都生效，各工作区的会话执行自己那一份，既不记错误也不跳过任何一方。
 * 这一点与 project-mcp 的 serverName 仲裁**刻意不同**（那边同名要在进程里唯一：
 * MCP 服务器名是单进程资源，命令名不是），提案的「多工作区同名命令互不串扰」优先。
 * 推论：同一个物理根被授予给多个工作区时，每个工作区各自独立发现它，而不是谁先扫到谁独占。
 *
 * 同一层内的同名是**冲突**（后者记错误并跳过）；跨层同名是**遮蔽**（项目级遮用户级、
 * 用户级遮内置），不记错误，由注册层处理。
 *
 * 这里不碰 `node:fs`、不碰 console：文件系统与日志都是参数，因此上面每条规则都能单测。
 * @module dsh-plugin-user-commands/host/discovery
 */

import path from 'node:path'
import { parseCommandDocument } from './frontmatter.ts'
import type {
  CommandIo,
  CommandLog,
  CommandScan,
  DirEntry,
  RegisteredCommand,
  WorkspaceCommands,
  WorkspaceRoots,
} from './types.ts'

/** 每个根下持有项目级命令的目录（相对该根）。 */
export const COMMANDS_DIR = '.dsh/commands'

/** `$DSH_HOME` 下持有用户级命令的目录名。 */
export const USER_COMMANDS_DIR_NAME = 'commands'

/** 唯一定义命令的文件后缀。 */
export const COMMAND_EXTENSION = '.md'

/** 命令名文法：与 dsh-commands 自己的命令解析正则一致。 */
export const COMMAND_NAME_PATTERN = /^[a-z][a-z0-9_-]*$/

/**
 * 插件自己注册的命令名：命令文件不得占用。
 *
 * `/commands-reload` 是 `fs.watch` 静默失聪时的唯一兜底（见 `watcher.ts`），
 * 一旦允许命令文件遮蔽它，兜底就会在用户最需要它的时候消失，所以这里保留。
 */
export const RESERVED_COMMAND_NAMES: readonly string[] = ['commands-reload']

/**
 * 没有 `description` 时的说明回退。
 * @param fileName - 命令文件名（含 `.md`）。
 * @returns 形如「用户自定义命令 deploy.md」的说明。
 */
export function defaultDescription(fileName: string): string {
  return `用户自定义命令 ${fileName}`
}

/** 一个待遍历的命令目录。 */
interface DirectoryTarget {
  /** 绝对目录路径。 */
  readonly dir: string
  /** 该目录属于哪一层。 */
  readonly layer: 'user' | 'project'
  /** 项目级目录所属工作区的主根。 */
  readonly workspaceRoot?: string
}

/** 一次发现要看的范围。 */
export interface DiscoveryRequest {
  /** 用户级命令目录（`$DSH_HOME/commands`）。 */
  readonly userDir: string
  /** 各工作区的有序根集合，按登记顺序。 */
  readonly workspaces: readonly WorkspaceRoots[]
}

/**
 * 列出一个目录；不存在或不可读都只当「这层没有命令」。
 * @param dir - 绝对目录路径。
 * @param io - 文件系统 seam。
 * @returns 目录项，或 undefined。
 */
async function readDirectory(dir: string, io: CommandIo): Promise<readonly DirEntry[] | undefined> {
  try {
    return await io.readDir(dir)
  } catch {
    // 目录不存在是最常见的情况（大多数工作区没有 .dsh/commands），不是降级条件。
    return undefined
  }
}

/**
 * 遍历一个命令目录，返回其中胜出的命令。
 * @param target - 要遍历的目录及其层次归属。
 * @param io - 文件系统 seam。
 * @param log - 诊断出口。
 * @param claimed - 该**工作区**的同层仲裁表（命令名 → 胜出者来源描述），不传表示该层无需跨目录仲裁。
 * @param visited - 该**工作区**已读过的文件（同一根被重复枚举时只读一次）。
 * @returns 该目录里胜出的命令，按文件名字典序。
 */
async function scanDirectory(
  target: DirectoryTarget,
  io: CommandIo,
  log: CommandLog,
  claimed: Map<string, string> | undefined,
  visited: Set<string>,
): Promise<readonly RegisteredCommand[]> {
  const entries = await readDirectory(target.dir, io)
  if (entries === undefined) return []

  const commands: RegisteredCommand[] = []
  for (const entry of [...entries].sort((left, right) => (left.name < right.name ? -1 : 1))) {
    if (entry.isDirectory()) {
      log.warn(`${path.join(target.dir, entry.name)} 是子目录，已忽略：命令只取 ${COMMANDS_DIR} 平铺一层的 .md 文件`)
      continue
    }
    if (!entry.name.endsWith(COMMAND_EXTENSION)) continue

    const file = path.join(target.dir, entry.name)
    if (visited.has(file)) continue
    visited.add(file)

    const name = entry.name.slice(0, -COMMAND_EXTENSION.length)
    if (!COMMAND_NAME_PATTERN.test(name)) {
      log.error(`${file} 的命令名 ${JSON.stringify(name)} 不合法（需匹配 ${String(COMMAND_NAME_PATTERN)}），已跳过`)
      continue
    }
    if (RESERVED_COMMAND_NAMES.includes(name)) {
      log.error(`${file} 使用了插件保留的命令名 ${name}（/${name} 由插件自己注册），已跳过`)
      continue
    }

    let text: string
    try {
      text = await io.readFile(file)
    } catch (error) {
      log.error(`无法读取 ${file}：${String(error)}`)
      continue
    }

    let document
    let warnings: readonly string[]
    try {
      const parsed = parseCommandDocument(text)
      document = parsed.document
      warnings = parsed.warnings
    } catch (error) {
      log.error(`${file} 已跳过：${error instanceof Error ? error.message : String(error)}`)
      continue
    }
    for (const warning of warnings) log.warn(`${file}：${warning}`)

    if (document.body === '') {
      log.error(`${file} 去掉 frontmatter 后正文为空，已跳过`)
      continue
    }

    const origin: RegisteredCommand['origin'] = {
      kind: 'file',
      layer: target.layer,
      dir: target.dir,
      file,
      ...(target.workspaceRoot === undefined ? {} : { workspaceRoot: target.workspaceRoot }),
    }
    const claimedBy = claimed?.get(name)
    if (claimedBy !== undefined) {
      log.error(`命令名冲突：${file} 的 /${name} 已跳过；该名称已由 ${claimedBy} 提供（插件不改名）`)
      continue
    }
    claimed?.set(name, file)

    commands.push({
      name,
      description: document.frontmatter.description ?? defaultDescription(entry.name),
      ...(document.frontmatter.hint === undefined ? {} : { hint: document.frontmatter.hint }),
      origin,
    })
  }
  return commands
}

/**
 * 做一次完整发现。
 * @param request - 用户级目录与各工作区根集合。
 * @param io - 文件系统 seam。
 * @param log - 诊断出口。
 * @returns 仲裁后的用户级命令与各工作区各自的项目级命令。
 */
export async function discoverCommands(
  request: DiscoveryRequest,
  io: CommandIo,
  log: CommandLog,
): Promise<CommandScan> {
  // 用户级只有一个目录，不存在跨目录同层冲突，因此不需要仲裁表（同名只可能来自重复枚举）。
  const user = await scanDirectory({ dir: request.userDir, layer: 'user' }, io, log, undefined, new Set())

  const projects: WorkspaceCommands[] = []
  for (const workspace of request.workspaces) {
    // 仲裁表与已读集合都是**每工作区一份**：工作区之间不共享命名空间，所以同名不是冲突；
    // 同一个物理根被两个工作区共享时两边各自发现自己那一份，而不是先扫到的独占。
    const claimed = new Map<string, string>()
    const visited = new Set<string>()
    const commands: RegisteredCommand[] = []
    // roots[0] 是主根，其后是附加根：遍历顺序即「主根 > 附加根 > 授予顺序」。
    for (const root of workspace.roots) {
      const dir = path.join(root, COMMANDS_DIR)
      commands.push(...await scanDirectory(
        { dir, layer: 'project', workspaceRoot: workspace.primaryRoot },
        io,
        log,
        claimed,
        visited,
      ))
    }
    projects.push({ workspaceRoot: workspace.primaryRoot, commands })
  }
  return { user, projects }
}
