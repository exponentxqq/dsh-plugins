/**
 * 单测公用的假 seam：目录树、文件内容、日志、注册器。
 *
 * 所有发现/注册测试都跑在真实的实现之上，被替换的只有文件系统、日志与命令注册表，
 * 因此断言到的行为就是上线的那份行为。
 */
import path from 'node:path'
import type { CommandRegistrar } from '../src/host/registry.ts'
import type { CommandIo, CommandLog, DirEntry, RegisteredCommand, WorkspaceRoots } from '../src/host/types.ts'

/** 一条文件形式的目录项。 */
export function fileEntry(name: string): DirEntry {
  return { name, isDirectory: () => false }
}

/** 一条子目录形式的目录项。 */
export function dirEntry(name: string): DirEntry {
  return { name, isDirectory: () => true }
}

/**
 * 用字面目录树与文件内容拼出的文件系统 seam。
 *
 * 传入的 `tree` / `files` 对象是**引用**，测试可以在运行中改它们来模拟新增/删除文件。
 * @param tree - 目录 → 目录项（字符串按文件处理）。
 * @param files - 文件路径 → 内容。
 * @returns 文件系统 seam。
 */
export function fakeIo(
  tree: Record<string, readonly (string | DirEntry)[]>,
  files: Record<string, string>,
): CommandIo {
  return {
    readDir: async (dir) => {
      const entries = tree[dir]
      if (entries === undefined) throw new Error(`ENOENT: no such directory ${dir}`)
      return entries.map((entry) => (typeof entry === 'string' ? fileEntry(entry) : entry))
    },
    readFile: async (file) => {
      const text = files[file]
      if (text === undefined) throw new Error(`ENOENT: no such file ${file}`)
      return text
    },
  }
}

/** 记录诊断的日志 seam。 */
export function recordingLog(): {
  log: CommandLog
  infos: string[]
  warnings: string[]
  errors: string[]
} {
  const infos: string[] = []
  const warnings: string[] = []
  const errors: string[] = []
  return {
    log: {
      info: (message) => infos.push(message),
      warn: (message) => warnings.push(message),
      error: (message) => errors.push(message),
    },
    infos,
    warnings,
    errors,
  }
}

/** 只有主根的工作区。 */
export function primaryWorkspace(root: string): WorkspaceRoots {
  return { primaryRoot: root, roots: [root] }
}

/** 造一条文件型命令。 */
export function fileCommand(
  name: string,
  file: string,
  extra: {
    description?: string
    hint?: string
    layer?: 'user' | 'project'
    workspaceRoot?: string
  } = {},
): RegisteredCommand {
  return {
    name,
    description: extra.description ?? `用户自定义命令 ${name}.md`,
    ...(extra.hint === undefined ? {} : { hint: extra.hint }),
    origin: {
      kind: 'file',
      layer: extra.layer ?? 'project',
      dir: path.dirname(file),
      file,
      ...(extra.workspaceRoot === undefined ? {} : { workspaceRoot: extra.workspaceRoot }),
    },
  }
}

/** 造一条内置命令。 */
export function builtinCommand(name: string, prompt = '内置 prompt'): RegisteredCommand {
  return { name, description: `内置命令 ${name}`, origin: { kind: 'builtin', prompt } }
}

/** 收集注册结果的假注册器。 */
export function fakeRegistrar(): {
  registrar: CommandRegistrar
  registered: Map<string, RegisteredCommand>
  disposed: string[]
} {
  const registered = new Map<string, RegisteredCommand>()
  const disposed: string[] = []
  return {
    registrar: {
      register: (command) => {
        registered.set(command.name, command)
        return () => {
          registered.delete(command.name)
          disposed.push(command.name)
        }
      },
    },
    registered,
    disposed,
  }
}

/**
 * 按目录记录监听器的假 watch seam。
 * @returns 监听 seam 与「触发某个目录的事件」的入口。
 */
export function fakeWatchIo(): {
  io: { isDirectory(candidate: string): Promise<boolean>; watch(dir: string, listener: () => void): { close(): void } }
  directories: Set<string>
  fire(dir: string): void
  closed: string[]
} {
  const directories = new Set<string>()
  const listeners = new Map<string, () => void>()
  const closed: string[] = []
  return {
    io: {
      isDirectory: async (candidate) => directories.has(candidate),
      watch: (dir, listener) => {
        // 真实 fs.watch 对不存在的目录会抛错；假 seam 也照此，才能测出 arm 的降级路径。
        if (!directories.has(dir)) throw new Error(`ENOENT: no such directory ${dir}`)
        listeners.set(dir, listener)
        return {
          close: () => {
            listeners.delete(dir)
            closed.push(dir)
          },
        }
      },
    },
    directories,
    fire: (dir) => listeners.get(dir)?.(),
    closed,
  }
}
