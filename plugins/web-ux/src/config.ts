/**
 * web-ux 的宿主侧配置：原生 Schemastery schema + 归档根解析纯函数。
 *
 * 本模块只被宿主半的接线层（`src/index.ts`）消费，纯流程层（`delete-session.ts`）不 import
 * 它：归档根在这里被归一成绝对路径，之后仅作为一个字符串穿过流程，因此迁移算法仍可用假
 * 端口在纯 node 下完整驱动。
 *
 * `Config` 必须是**原生 Schemastery** 图（不是 zod / 手写对象）：dsh 的
 * `--dump-config-schema` 只认原生图（`dsh-app-boot` 的 `isNativeConfigSchema`），非原生
 * `Config` 会被记成 error 诊断，把任何装入了本插件的 profile 的 schema dump 拖红。这张图由
 * esbuild 内联进宿主产物（与 `session-tool-toggle` 同款），运行时不解析任何
 * `@deepseek-ai/*`——这是宿主半「`@deepseek-ai/*` 一律 type-only import」惯例唯一的例外。
 *
 * 键名与语义见 code-design ③.3 / 决策 D7：缺省跟随 `$DSH_HOME`，支持绝对路径与 `~/`，
 * 相对路径**不**按进程 cwd 解析（daemon 进程的 cwd 不可预测），告警后回落缺省。
 *
 * @module dsh-plugin-web-ux/config
 */

import { isAbsolute, resolve } from 'node:path'
import Schema from '@deepseek-ai/schemastery'

/** 插件配置（与 {@link Config} schema 形状一致）。 */
export interface WebUxConfig {
  /** 会话日志的归档根目录：绝对路径或 `~/` 开头；省略 = `$DSH_HOME/archive/sessions`。 */
  readonly archiveRoot?: string
}

/**
 * 插件配置的**原生 Schemastery** schema（profile 里给本插件行的 `config:` 段由它校验）。
 *
 * 唯一键 `archiveRoot` 可选，`cordis.patch.yml` 因此不带 `config:` 段——零配置可跑，缺省
 * 落在 `$DSH_HOME/archive/sessions`（由 {@link resolveArchiveRoot} 解析，schema 只管类型）。
 */
export const Config = Schema.object({
  archiveRoot: Schema.string()
    .description('会话日志的归档根目录（绝对路径或 ~/ 开头）；缺省为 $DSH_HOME/archive/sessions'),
}).description('web-ux 的删除/归档配置：归档根目录可配')

/** 解析归档根所需的宿主事实（全部注入，便于纯 node 单测）。 */
export interface ArchiveRootContext {
  /** 宿主 home 目录解析器（app-boot 行注入的 `ctx.dshHomePath`，解析自 `$DSH_HOME`）。 */
  readonly homePath: (...segments: string[]) => string
  /** 当前用户的操作系统 home 目录（`~/` 展开用，宿主由 `node:os` 的 `homedir()` 提供）。 */
  readonly homedir: string
  /** 诊断出口：配置值不可用时只在这里告警一条，不抛错。 */
  readonly warn: (message: string) => void
}

/** 缺省归档根：`$DSH_HOME/archive/sessions`（跟随 `DSH_HOME` 迁移，绝不写死 `~/.dsh`）。 */
function defaultArchiveRoot(context: ArchiveRootContext): string {
  return context.homePath('archive', 'sessions')
}

/**
 * 把配置值归一成绝对路径；不可用时告警并回落缺省（永不抛错）。
 *
 * 规则（code-design ③.3）：
 *
 * | 输入 | 结果 |
 * |---|---|
 * | `undefined` / 空串 / 纯空白 | `$DSH_HOME/archive/sessions` |
 * | `~/…` 或 `~\…` | `resolve(homedir, rest)`（`..` 归一） |
 * | 绝对路径 | `resolve(configured)`（去掉尾部分隔符与 `..`） |
 * | 相对路径 / 单独的 `~` / 其它 | 告警一条，回落缺省 |
 *
 * 相对路径**不**按进程 cwd 解析：daemon 进程的 cwd 不是用户目录，静默按 cwd 解析会让
 * 「我明明配了归档目录」变成不可解释的行为（D7）。运行时若收到非字符串（绕过 schema 的裸
 * 调用），按未设处理——schema 负责类型，本函数只保证不抛错。
 *
 * @param configured - profile 里给本插件行的 `archiveRoot` 配置值（可能省略）。
 * @param context - 宿主事实：home 目录解析器、用户 home、告警出口。
 * @returns 绝对路径形式的归档根；任何坏值都回落到缺省。
 */
export function resolveArchiveRoot(configured: string | undefined, context: ArchiveRootContext): string {
  const fallback = defaultArchiveRoot(context)
  const raw = typeof configured === 'string' ? configured.trim() : ''
  if (raw === '') return fallback
  // `~/` 与 `~\` 都按用户 home 展开（Windows 风格分隔符在 POSIX 上不是分隔符，但前缀语义一致）。
  if (raw.startsWith('~/') || raw.startsWith('~\\')) return resolve(context.homedir, raw.slice(2))
  if (isAbsolute(raw)) return resolve(raw)
  context.warn(`web-ux: archiveRoot "${raw}" is not an absolute path or ~/ path; falling back to ${fallback}`)
  return fallback
}
