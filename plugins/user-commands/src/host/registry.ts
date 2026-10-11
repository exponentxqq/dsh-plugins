/**
 * 一层的命令注册表：把「期望的命令清单」声明式地同步成实际注册。
 *
 * 同步是幂等的差量计算：按名字比对期望与现状，新增的注册、指纹变了的重注册、消失的注销。
 * 因此每次重扫都可以盲调——重扫给出的永远是「现在应该是什么」，而不是「相对上次变了什么」，
 * 这正是不怕重复触发、也不怕事件丢失（watcher 只当触发器）的原因。
 *
 * 注册服务可能还不存在（无命令适配器的部署），也可能稍后才出现：注册器缺席时同步只记住期望清单，
 * 注册器到位时 `setRegistrar` 立刻把这批期望补上，于是启动顺序怎么交错都不会漏注册。
 * @module dsh-plugin-user-commands/host/registry
 */

import type { CommandLog, RegisteredCommand } from './types.ts'

/** 把一条命令注册进某个层，并交回它的注销函数。 */
export interface CommandRegistrar {
  /**
   * 注册一条命令。
   * @param command - 带发现元数据与 prompt 来源的命令。
   * @returns 注销该注册的 disposer。
   * @throws 该层已有同名命令时抛错（由本模块记错误并跳过）。
   */
  register(command: RegisteredCommand): () => void
}

/** 一层重同步改了哪些东西。 */
export interface SyncCounts {
  /** 新注册的命令名。 */
  readonly loaded: readonly string[]
  /** 因指纹变化而重注册的命令名。 */
  readonly updated: readonly string[]
  /** 被注销的命令名。 */
  readonly removed: readonly string[]
  /** 注册失败的命令名（同名冲突、层已销毁等）。 */
  readonly failed: readonly string[]
}

/** 什么都没变的计数。 */
export const EMPTY_COUNTS: SyncCounts = { loaded: [], updated: [], removed: [], failed: [] }

/**
 * 合并多层的计数。
 * @param parts - 各层的结果。
 * @returns 逐项拼接后的总计数。
 */
export function mergeCounts(...parts: readonly SyncCounts[]): SyncCounts {
  return {
    loaded: parts.flatMap((part) => part.loaded),
    updated: parts.flatMap((part) => part.updated),
    removed: parts.flatMap((part) => part.removed),
    failed: parts.flatMap((part) => part.failed),
  }
}

/**
 * `/commands-reload` 反馈给用户的一行计数。
 *
 * 按**命令名**去重后计数：同一份项目级命令会挂到每个归属该工作区的存活会话上，
 * 按注册条数报数会让「加了 1 个文件」显示成「加载 3」，与人的直觉不符。
 * 代价是跨工作区的同名命令也会并成一条——这行计数是给用户看的概览，不是逐工作区的台账。
 * @param counts - 本次重同步的总计数（逐层、逐会话累加）。
 * @param skipped - 发现阶段的跳过数（非法文件、同名冲突等）。
 * @returns 形如「已重扫：加载 1、更新 0、移除 0、跳过 0」的文案。
 */
export function reloadText(counts: SyncCounts, skipped: number): string {
  const distinct = (names: readonly string[]): number => new Set(names).size
  return `已重扫：加载 ${distinct(counts.loaded)}、更新 ${distinct(counts.updated)}、`
    + `移除 ${distinct(counts.removed)}、跳过 ${skipped + counts.failed.length}`
}

/**
 * 一条命令的注册指纹：说明、提示或来源变了就要重注册（发现菜单要跟着变）。
 * @param command - 待计算的命令。
 * @returns 指纹字符串。
 */
function fingerprintOf(command: RegisteredCommand): string {
  const origin = command.origin.kind === 'file' ? command.origin.file : 'builtin'
  return JSON.stringify([command.description, command.hint ?? '', origin])
}

/** 一个作用域上的命令注册集合，跟着期望清单走。 */
export class CommandLayer {
  /** 当前期望清单（注册器缺席时先存着）。 */
  private desired: readonly RegisteredCommand[] = []
  /** 注册器；undefined 表示该部署没有命令服务。 */
  private registrar: CommandRegistrar | undefined
  /** 已注册的命令：名字 → 指纹与 disposer。 */
  private readonly live = new Map<string, { readonly fingerprint: string; readonly dispose: () => void }>()

  /**
   * @param log - 诊断出口。
   * @param label - 日志里标识这一层（例如「用户级命令」）。
   */
  constructor(
    private readonly log: CommandLog,
    private readonly label: string,
  ) {}

  /**
   * 换一个注册器（服务出现或消失），并立刻把已记住的期望清单同步过去。
   * @param registrar - 新注册器；undefined 表示服务不再可用。
   * @returns 本次同步的计数。
   */
  setRegistrar(registrar: CommandRegistrar | undefined): SyncCounts {
    if (registrar === undefined) {
      const removed = [...this.live.keys()]
      this.clear()
      return { ...EMPTY_COUNTS, removed }
    }
    this.registrar = registrar
    return this.sync(this.desired)
  }

  /**
   * 把这一层同步成恰好这批命令。
   * @param desired - 期望的命令清单（同层内命令名唯一）。
   * @returns 本次同步的计数。
   */
  sync(desired: readonly RegisteredCommand[]): SyncCounts {
    this.desired = desired
    const registrar = this.registrar
    if (registrar === undefined) return EMPTY_COUNTS

    const wanted = new Map(desired.map((command) => [command.name, command]))
    const loaded: string[] = []
    const updated: string[] = []
    const removed: string[] = []
    const failed: string[] = []

    // 先用快照遍历：下面的注册/注销会改动 live。
    for (const [name, live] of Array.from(this.live)) {
      const next = wanted.get(name)
      if (next === undefined) {
        this.unregister(name)
        removed.push(name)
        continue
      }
      if (fingerprintOf(next) === live.fingerprint) continue
      this.unregister(name)
      if (this.register(registrar, next, failed)) updated.push(name)
    }
    for (const command of desired) {
      if (this.live.has(command.name)) continue
      if (this.register(registrar, command, failed)) loaded.push(command.name)
    }
    return { loaded, updated, removed, failed }
  }

  /** 当前已注册的命令名。 */
  names(): readonly string[] {
    return [...this.live.keys()]
  }

  /** 注销这一层注册的一切。 */
  dispose(): void {
    this.clear()
  }

  /**
   * 注册一条命令并记账。
   * @param registrar - 注册器。
   * @param command - 待注册的命令。
   * @param failed - 失败命令名的收集器。
   * @returns 是否注册成功。
   */
  private register(registrar: CommandRegistrar, command: RegisteredCommand, failed: string[]): boolean {
    try {
      const dispose = registrar.register(command)
      this.live.set(command.name, { fingerprint: fingerprintOf(command), dispose })
      return true
    } catch (error) {
      // 最常见的原因是别的插件已经注册了同名全局命令（例如用户写了 plan.md 而官方已有 /plan）：
      // 注册表按层拒绝重名，用户命令只能让位，所以这里必须留下可读的错误。
      this.log.error(`${this.label}：注册 /${command.name} 失败，已跳过（${String(error)}）`)
      failed.push(command.name)
      return false
    }
  }

  /**
   * 注销一条已注册的命令。
   * @param name - 命令名。
   */
  private unregister(name: string): void {
    const live = this.live.get(name)
    if (live === undefined) return
    this.live.delete(name)
    try {
      live.dispose()
    } catch (error) {
      this.log.warn(`${this.label}：注销 /${name} 时出错（${String(error)}）`)
    }
  }

  /** 清空已注册集合。 */
  private clear(): void {
    for (const name of Array.from(this.live.keys())) this.unregister(name)
  }
}
