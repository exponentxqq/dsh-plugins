/**
 * DSH 基线的唯一来源。
 *
 * 仓库里所有「当前验证的是哪个 DSH」的声明都从这两个值派生：四个插件的
 * devDependencies 精确 pin、三个软插件的 engines/peer 范围、`dsh:check`
 * 的断言，以及根级升级脚本的重写目标。改基线时只改这里，再跑
 * `pnpm dsh:upgrade`（带版本参数时脚本也会同步重写本文件）。
 *
 * @module scripts/dsh-baseline
 */

/** 当前开发与发布验证所针对的 DSH 精确版本。 */
export const DSH_BASELINE = '0.2.1-rc.2'

/**
 * 由基线派生软插件的可安装范围：`>=<基线> <<主>.<次+1>.0`。
 *
 * 钉住当前次版本线（0.2.x），而不是放开整个 0.x：零主版本之间同样有破坏性
 * 变更，软插件不维护精确 allowlist，但也不应该在没有验证的情况下跨次版本安装。
 * @param baseline - 精确基线版本。
 * @returns 软插件的 `engines.dsh` 与 DSH peer 范围。
 */
export function softDshRange(baseline = DSH_BASELINE) {
  const match = /^(\d+)\.(\d+)\.\d+(?:-[\w.]+)?$/u.exec(baseline)
  if (match === null) throw new Error(`[baseline] "${baseline}" is not an exact version`)
  const major = Number(match[1])
  const minor = Number(match[2])
  return `>=${baseline} <${major}.${minor + 1}.0`
}

/** 当前基线对应的软插件范围。 */
export const SOFT_DSH_RANGE = softDshRange()
