/**
 * host 半面的共享 seam 与数据模型。
 *
 * 发现层（目录枚举、frontmatter 解析、冲突仲裁）与注册层都写在下面这些窄接口之上，
 * 而不是直接对着 `node:fs` 或 console——文件系统、日志、附加根枚举服务都是参数进来的，
 * 因此每条规则都能用假目录树在单测里跑，跑的就是上线的那份逻辑。
 * @module dsh-plugin-user-commands/host/types
 */

/** 一条目录项：发现层只关心名字与「是不是目录」。 */
export interface DirEntry {
  /** 目录项名字（不含父目录）。 */
  readonly name: string
  /**
   * 该目录项是否为目录。
   * @returns 目录为 true（子目录整体忽略并记警告）。
   */
  isDirectory(): boolean
}

/** 文件系统 seam：发现层做的全部目录与文件读取。 */
export interface CommandIo {
  /**
   * 列出一个目录的目录项。
   * @param dir - 绝对目录路径。
   * @returns 目录项（文件与子目录都在内）。
   * @throws 目录不存在或不可读时抛错。
   */
  readDir(dir: string): Promise<readonly DirEntry[]>
  /**
   * 读出一个命令文件。
   * @param file - 绝对文件路径。
   * @returns 文件 UTF-8 文本。
   * @throws 文件不可读时抛错。
   */
  readFile(file: string): Promise<string>
}

/** 日志 seam：不硬依赖任何 logger 的宿主诊断出口。 */
export interface CommandLog {
  /**
   * 记录一条值得进进程日志的状态变化。
   * @param message - 诊断文本。
   */
  info(message: string): void
  /**
   * 记录一条降级但继续的条件（未知 frontmatter 字段、被忽略的子目录等）。
   * @param message - 诊断文本。
   */
  warn(message: string): void
  /**
   * 记录一次跳过（非法文件、同名冲突、注册失败）。
   * @param message - 诊断文本。
   */
  error(message: string): void
}

/**
 * 本插件软依赖的附加根枚举器（由 dsh-plugin-multi-root-workspace 提供）。
 * 缺席——该插件未安装或未激活——时发现范围就是各工作区主根。
 */
export interface MultiRootGrant {
  /**
   * 授予某个主根的全部可用根路径。
   * @param primaryRoot - 会话工作区主根（任意拼写）。
   * @returns 授予的根，按登记顺序。
   */
  granted(primaryRoot: string): readonly string[]
  /**
   * 订阅登记变化。
   * @param listener - 每次持久化变更后以主根路径调用。
   * @returns 停止订阅的 disposer。
   */
  onChange(listener: (primaryRoot: string) => void): () => void
}

/** 一个工作区的有序根集合。 */
export interface WorkspaceRoots {
  /** 登记的主根（canonical），即 workspace 实体的路径。 */
  readonly primaryRoot: string
  /** 主根在前，其后是按授予顺序排列的附加根。 */
  readonly roots: readonly string[]
}

/** 一条命令的 prompt 来源。 */
export type CommandOrigin =
  | {
      /** 来自命令目录里的文件。 */
      readonly kind: 'file'
      /** 发现层次。 */
      readonly layer: 'user' | 'project'
      /** 持有该文件的命令目录。 */
      readonly dir: string
      /** 命令文件本身。 */
      readonly file: string
      /** 项目级命令：拥有它的工作区（canonical 主根）。 */
      readonly workspaceRoot?: string
    }
  | {
      /** 插件内置常量。 */
      readonly kind: 'builtin'
      /** 内置的 prompt 模板。 */
      readonly prompt: string
    }

/**
 * 一条待注册的命令：只有发现元数据，**不含正文**。
 * 文件型命令的正文在调用时现读（见 `invocation.ts`），注册表只承载发现菜单需要的信息。
 */
export interface RegisteredCommand {
  /** 命令名（文件名去 `.md`），满足 `^[a-z][a-z0-9_-]*$`。 */
  readonly name: string
  /** 发现菜单里的说明。 */
  readonly description: string
  /** `argument-hint`，映射到命令的输入提示。 */
  readonly hint?: string
  /** prompt 来源。 */
  readonly origin: CommandOrigin
}

/** 一个工作区在自己的命名空间内仲裁后的项目级命令（工作区之间不仲裁：同名各自生效）。 */
export interface WorkspaceCommands {
  /** 该工作区的主根（canonical）。 */
  readonly workspaceRoot: string
  /** 该工作区根集合里胜出的命令。 */
  readonly commands: readonly RegisteredCommand[]
}

/** 一次完整发现（各工作区各自仲裁后）的结果。 */
export interface CommandScan {
  /** 用户级命令（`$DSH_HOME/commands/`）。 */
  readonly user: readonly RegisteredCommand[]
  /** 各工作区各自的项目级命令，按工作区登记顺序。 */
  readonly projects: readonly WorkspaceCommands[]
}
