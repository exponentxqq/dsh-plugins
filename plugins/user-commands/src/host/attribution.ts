/**
 * 会话到工作区的归属判定：一个会话能用哪些项目级命令。
 *
 * 会话是在某个目录（`cwd`）里创建的，而这个目录常常是工作区的子目录，有时还经过符号链接。
 * 所以归属从会话自己的目录逐级向上走，每一级都做 canonical 化，停在第一个**正好等于**某个
 * 已登记根的层级；拥有该根的工作区胜出，会话因此拿到该工作区完整的根集合（主根 + 授予它的附加根）。
 *
 * 一个 canonical 根被多个工作区认领时，**主根拥有者压倒附加根认领者**：某目录是哪个工作区的
 * 主根，它就是哪个工作区的「家」；把根授予成附加根只是给那个会话的访问权，不等于把在别人的
 * 「家」里开的会话收编过来。都不当家（只被当成附加根授予）时，才按工作区登记顺序先到先得。
 * 于是「在 `opc/` 里开的会话」永远是 opc 工作区的会话、用 opc 的命令集合，不会因为别的会话
 * 把 `opc/` 授成附加根而换一套——命令可见性因此与工作区一一对应，同名互不串扰。
 *
 * 什么都匹配不上就是什么都不授予：调用方 fail-closed，该会话只剩用户级与内置命令。
 *
 * 与 dsh-plugin-project-mcp 的同名判定是**同一思路的独立实现**（约 60 行）：两个插件互不依赖，
 * 可以各自单独安装，因此不共享代码。MCP 那边的 serverName 需要在进程里唯一，命令名不需要，
 * 所以只有归属规则（谁的根是谁的）两边一致，命令的分层语义是本插件自己的。
 * @module dsh-plugin-user-commands/host/attribution
 */

import path from 'node:path'
import type { WorkspaceRoots } from './types.ts'

/** canonical 化 seam（host 里就是 node:fs 的 realpath）。 */
export interface RealpathIo {
  /**
   * canonical 化一个路径，解析符号链接。
   * @param candidate - 待 canonical 化的路径。
   * @returns canonical 绝对路径。
   * @throws 路径不存在时抛错。
   */
  realpath(candidate: string): Promise<string>
}

/** 一个会话的 cwd 归属到的工作区。 */
export interface Attribution {
  /** 拥有最近匹配根的工作区（canonical 主根）。 */
  readonly workspaceRoot: string
  /** 该工作区的完整根集合，用的是登记时的拼写。 */
  readonly roots: readonly string[]
}

/** 按登记根集合做的会话归属判定。 */
export class Attributor {
  /** canonical 根 → 拥有它的工作区主根。 */
  private readonly owners = new Map<string, string>()
  /** 工作区主根 → 它的根集合（登记拼写）。 */
  private readonly rootSets = new Map<string, readonly string[]>()

  /**
   * @param io - canonical 化 seam。
   */
  constructor(private readonly io: RealpathIo) {}

  /**
   * 按当前工作区根集合重建索引。
   *
   * 分两遍认领：先各自的主根（谁的「家」谁做主，多工作区认领同一个主根时按登记顺序先到先得），
   * 再补各附加根（只认领还没有主的根，彼此仍按登记顺序先到先得）。
   *
   * 此刻 canonical 化失败（路径不存在）的根被略过：把会话归属到一个谁都进不去的目录是虚构，
   * 扫描层也因为同一个原因跳过了它。
   * @param workspaces - 按登记顺序排列的根集合。
   */
  async update(workspaces: readonly WorkspaceRoots[]): Promise<void> {
    this.owners.clear()
    this.rootSets.clear()
    /** 待认领的附加根，按「工作区登记顺序 + 授予顺序」排列。 */
    const granted: { readonly root: string; readonly owner: string }[] = []
    for (const workspace of workspaces) {
      this.rootSets.set(workspace.primaryRoot, workspace.roots)
      for (const root of workspace.roots) {
        if (root === workspace.primaryRoot) continue
        granted.push({ root, owner: workspace.primaryRoot })
      }
    }
    for (const workspace of workspaces) {
      await this.claim(workspace.primaryRoot, workspace.primaryRoot)
    }
    for (const entry of granted) {
      await this.claim(entry.root, entry.owner)
    }
  }

  /**
   * 认领一个根：已经是别人的就不动。
   * @param root - 待认领的根（任意拼写）。
   * @param owner - 认领它的工作区主根。
   */
  private async claim(root: string, owner: string): Promise<void> {
    const canonical = await this.canonical(root)
    if (canonical !== undefined && !this.owners.has(canonical)) this.owners.set(canonical, owner)
  }

  /**
   * 归属一个会话目录。
   * @param cwd - 会话创建目录（绝对路径）。
   * @returns 归属结果；没有任何工作区认领时为 null。
   */
  async attribute(cwd: string): Promise<Attribution | null> {
    if (cwd === '' || this.owners.size === 0) return null
    let current = path.resolve(cwd)
    for (;;) {
      const canonical = await this.canonical(current)
      const owner = canonical === undefined ? undefined : this.owners.get(canonical)
      if (owner !== undefined) return { workspaceRoot: owner, roots: this.rootSets.get(owner) ?? [] }
      const parent = path.dirname(current)
      if (parent === current) return null
      current = parent
    }
  }

  /**
   * canonical 化一个路径，失败即「不是根」。
   * @param candidate - 待尝试的路径。
   * @returns canonical 路径，或 undefined。
   */
  private async canonical(candidate: string): Promise<string | undefined> {
    try {
      return await this.io.realpath(candidate)
    } catch {
      return undefined
    }
  }
}
