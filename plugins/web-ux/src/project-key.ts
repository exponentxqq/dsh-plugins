/**
 * `projectKey(cwd)` 的本地镜像：把会话的项目目录编码成 `sessions/` 与
 * `archive/sessions/` 下的一级目录名，并按目录名反查所属工作区。
 *
 * 为什么镜像而不 import 上游（D5）：上游持久化包不导出 `projectKey`，纯流程层也
 * 不许 import DSH 上游包；宿主产物还必须自包含（`test/bundle.test.ts` 断言除 Node
 * 内建外没有模块依赖）。
 *
 * 规则（有意有损，与上游 `projectKey` 逐行对齐）：
 *
 * - `/`、`\`、`:` 折叠成单个 `-`，连续分隔符只留一个；
 * - 其余码元里 `[A-Za-z0-9._-]` 原样保留，`~` 与所有不安全码元转 `~XXXX`（UTF-16
 *   码元的大写十六进制，补足 4 位）；
 * - 主体只去掉**前导** `-`（尾部分隔符贡献的 `-` 保留），为空则取 `root`，截断到
 *   251 个字符，再首尾各包一层 `--`；
 * - 空串抛错（与上游一致）。
 *
 * 本模块零 import（不 import 任何 Node 内建，也不 import 任何 DSH 上游包），因此
 * 可被宿主产物与浏览器 bundle 各自内联，两端不共享运行时身份。它只用于「条目 ↔
 * 工作区」匹配，从不用于推导恢复目标路径（projectKey 有损，反推会落错目录）。
 *
 * @module dsh-plugin-web-ux/project-key
 */

/** 工作区注册表里本模块需要的最小投影：工作区 id 与其项目目录。 */
export interface ProjectWorkspace {
  /** 工作区 id（`workspace.json` 的键）。 */
  readonly workspaceId: string
  /** 工作区的项目目录绝对路径。 */
  readonly path: string
}

/**
 * 把会话的项目目录编码成 `sessions/<目录名>` 的单段目录名。
 *
 * 严格逐行镜像上游 `projectKey`（rc.5 实测）：只去**前导** `-`，尾部分隔符贡献的
 * `-` 原样保留——路径若以分隔符结尾，编码结果尾部会因此多出一个 `-`
 * （`/a/b/` → `--a-b---`，三个尾 `-`）。
 *
 * @param cwd - 会话创建时的项目目录。
 * @returns 单段、文件系统安全、总长不超过 255 的目录名。
 * @throws 当 `cwd` 为空串时抛错（与上游一致）。
 */
export function projectKey(cwd: string): string {
  if (cwd.length === 0) throw new Error('cannot encode an empty project path')
  let readable = ''
  let separatorRun = false
  for (let index = 0; index < cwd.length; index += 1) {
    const code = cwd.charCodeAt(index)
    const ch = String.fromCharCode(code)
    if (ch === '/' || ch === '\\' || ch === ':') {
      if (!separatorRun) readable += '-'
      separatorRun = true
    } else if (ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch)) {
      readable += ch
      separatorRun = false
    } else {
      readable += `~${code.toString(16).toUpperCase().padStart(4, '0')}`
      separatorRun = false
    }
  }
  const body = (readable.replace(/^-+/, '') || 'root').slice(0, 251)
  return `--${body}--`
}

/**
 * 按归档根下的一级目录名反查所属工作区。
 *
 * 匹配规则：`projectKey(workspace.path) === projectDir` 的第一个命中；未命中返回
 * `null`，由调用方归入「未匹配工作区的归档」伪选项。
 *
 * @param projectDir - 归档根下的一级目录名（`projectKey(workspace.path)` 的形态）。
 * @param workspaces - 当前工作区注册表投影，按注册顺序匹配。
 * @returns 命中工作区的 id；无命中时 `null`。
 */
export function workspaceForProjectDir(
  projectDir: string,
  workspaces: readonly ProjectWorkspace[],
): string | null {
  const owner = workspaces.find((workspace) => projectKey(workspace.path) === projectDir)
  return owner?.workspaceId ?? null
}
