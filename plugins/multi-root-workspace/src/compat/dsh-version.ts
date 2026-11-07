/**
 * DSH 兼容性契约：本插件支持哪一段上游版本，以及一次安装如何被判定。
 *
 * 本模块是支持矩阵在运行时的唯一副本：`DSH_BASELINE` 是仓库基线
 * `scripts/dsh-baseline.mjs` 的同值字面量（由 `pnpm dsh:upgrade` 同批重写），
 * `SUPPORTED_DSH_RANGE` 由它派生。模块刻意保持纯净——不引 cordis、不打日志、不退出
 * 进程——所以运行时门（`src/compat.ts`）、静态门（`scripts/check-dsh-compat.mjs`）与
 * 测试判定一次安装时走的是同一份代码，而不是三份会各自漂移的清单。
 *
 * 为什么需要契约：本插件用上游 provider 的子类替换 `ctx.fs` 与 `ctx.sandbox`，并且
 * `src/dialects.ts` 靠观测 `super.confine` 产出的 argv 形状来识别内核沙箱 profile
 * （ADR-0003）。两处耦合都指向没有 semver 承诺的 pre-stable 内部形状，所以「验证过
 * 哪些版本」必须由代码声明，而不是由文档约定。
 *
 * 2026-11-07 裁定（ADR-0009 修订节）：支持矩阵由「精确版本 allowlist」改为基线派生的
 * 软范围——「与基线同 major.minor 且 ≥ 基线」。同一 minor 线上的新预发布（基线
 * `0.2.2-rc.1` 下的 `0.2.3-alpha.1`）自动放行，minor 之外（`0.3.0`、`0.3.0-alpha.1`）
 * 一律拒绝。同一次裁定废除了升级探测车道（升级不再需要一把绕过精确矩阵的开关），并
 * 删除了按环境变量放行的警告档：不支持即拒绝启动，门禁只有一种反应。范围的
 * 语义由本文件的手写比较器定义，不引 semver 库——库的默认 prerelease 规则会把
 * `0.2.3-alpha.1` 判出范围，与裁定相反。
 *
 * @module dsh-plugin-multi-root-workspace/compat/dsh-version
 */

import { createRequire } from 'node:module'

/** 版本文法：`<主>.<次>.<补丁>[-<预发布>]`；预发布段是以 `.` 分隔的 `[0-9A-Za-z-]+`。 */
const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/u

/** 全数字的 prerelease 标识符按数值比较（见 {@link compareVersions} 规则 3）。 */
const NUMERIC_IDENTIFIER = /^\d+$/u

/**
 * 仓库基线的运行时副本（唯一字面量）。与 `scripts/dsh-baseline.mjs` 的
 * `DSH_BASELINE` 同值，由 `pnpm dsh:upgrade` 同批重写，并由「manifest engines/peers
 * == 本文件派生范围」与「engines == 根基线派生范围」两条断言传递性地钉住相等。
 *
 * 本条必须是单引号字符串常量（`DSH_BASELINE` 后紧跟一次赋值、值两侧为单引号）：
 * 升级脚本（`scripts/upgrade-dsh.mjs` 的 `repointRuntimeBaselines`）按首个文本
 * 出现位置做重写，任何更早的同形状文本（例如注释里的示例）都会让它改错对象。
 */
export const DSH_BASELINE = '0.2.2-rc.1'

/** 由基线派生的支持范围：`>=<基线> <<主>.<次+1>.0`（下界含、上界不含）。 */
export const SUPPORTED_DSH_RANGE = softDshRange(DSH_BASELINE)

/**
 * 从基线推导范围字符串。基线不合 `<主>.<次>.<补丁>[-<预发布>]` 文法时在模块装载期
 * 抛错：范围是装载期常量，宁可拒绝启动也不静默放行一个拼错的范围（fail-closed）。
 * @param baseline - 已校验为字面量的基线版本。
 * @returns `>=<基线> <<主>.<次+1>.0`。
 */
function softDshRange(baseline: string): string {
  const parsed = parseVersion(baseline)
  if (parsed === undefined) {
    throw new Error(`[multi-root] DSH_BASELINE is not a valid version: ${baseline}`)
  }
  return `>=${baseline} <${parsed.major}.${parsed.minor + 1}.0`
}

/** 解析后的精确版本。 */
interface ParsedVersion {
  readonly major: number
  readonly minor: number
  readonly patch: number
  /** 预发布段，按 `.` 切开；全数字段存为 number。空数组表示无预发布。 */
  readonly prerelease: readonly (string | number)[]
}

/**
 * 严格版本文法：`<主>.<次>.<补丁>[-<预发布>]`。
 *
 * 文法外的输入（`'0.9'`、`''`、`'latest'`、带 build metadata 的 `'1.2.3+build'`）
 * 返回 `undefined`，不抛——门禁对不可解析的版本一律按「不支持」处理。
 *
 * 导出仅供 `tests/` 直接钉住文法（不进 barrel）。
 * @param value - 待解析的版本字符串。
 * @returns 解析结果，或 `undefined`（文法外）。
 */
export function parseVersion(value: string): ParsedVersion | undefined {
  const match = VERSION_PATTERN.exec(value)
  if (match === null) return undefined
  const major = match[1]
  const minor = match[2]
  const patch = match[3]
  if (major === undefined || minor === undefined || patch === undefined) return undefined
  const prerelease = match[4]
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    prerelease: prerelease === undefined
      ? []
      : prerelease.split('.').map(identifier => (NUMERIC_IDENTIFIER.test(identifier) ? Number(identifier) : identifier)),
  }
}

/**
 * semver 优先级比较：`<0` / `0` / `>0`。
 *
 * 规则（`tests/compat.spec.ts` 逐条钉住）：
 * 1. `major` / `minor` / `patch` 数值比较；
 * 2. 同 triple 时，无 prerelease 的版本**大于**有 prerelease 的版本（`0.2.2 > 0.2.2-rc.1`）；
 * 3. prerelease 按 `.` 分段逐段比较：两段皆数字→数值比较；仅一方数字→数字段小；
 *    两段皆字母→ASCII 比较；
 * 4. 前缀全等时短者小（`0.2.2-rc < 0.2.2-rc.1`）。
 *
 * 导出仅供 `tests/` 直接钉住比较语义（不进 barrel）。
 * @param left - 左操作数（已解析）。
 * @param right - 右操作数（已解析）。
 * @returns 负数表示 `left` 优先级更低，正数更高，`0` 表示相等。
 */
export function compareVersions(left: ParsedVersion, right: ParsedVersion): number {
  const triple = left.major - right.major || left.minor - right.minor || left.patch - right.patch
  if (triple !== 0) return triple
  if (left.prerelease.length === 0) return right.prerelease.length === 0 ? 0 : 1
  if (right.prerelease.length === 0) return -1
  for (const [index, leftIdentifier] of left.prerelease.entries()) {
    const rightIdentifier = right.prerelease[index]
    if (rightIdentifier === undefined) return 1
    const compared = comparePrereleaseIdentifier(leftIdentifier, rightIdentifier)
    if (compared !== 0) return compared
  }
  return left.prerelease.length === right.prerelease.length ? 0 : -1
}

/**
 * 比较单个 prerelease 标识符。
 *
 * 数字段按数值比较，且**小于**任何字母段；两个字母段按 ASCII 比较。这使
 * `rc.10 > rc.2`（数值，而非字典序）且 `alpha < beta`（ASCII）。
 * @param left - 左标识符。
 * @param right - 右标识符。
 * @returns 比较结果，符号同 {@link compareVersions}。
 */
function comparePrereleaseIdentifier(left: string | number, right: string | number): number {
  if (typeof left === 'number' && typeof right === 'number') return left - right
  if (typeof left === 'number') return -1
  if (typeof right === 'number') return 1
  return left < right ? -1 : left > right ? 1 : 0
}

/**
 * 是否在支持范围内。
 *
 * 语义 = 「与基线同 `major.minor` 且 ≥ 基线」：下界是验证过的地板，上界是同一条
 * minor 线的末端（基线 `0.2.2-rc.1` 时即 `>=0.2.2-rc.1 <0.3.0`）。同 minor 判定
 * 必须单独做——只靠数值比较会放行 `0.3.0-alpha.1`（数值上小于 `0.3.0`，但已在
 * 上界之外）。
 *
 * 文法外或域外的版本一律 `false`（fail closed），不抛。
 * @param release - 待判定的版本字符串（例如安装树解析出的版本）。
 * @returns 是否放行。
 */
export function isSupportedDshRelease(release: string): boolean {
  const parsed = parseVersion(release)
  // 基线在模块装载期已校验（softDshRange 对非法基线直接抛）；这里再判一次只为
  // 让谓词保持全域：不可解析 ⇒ 不支持，绝不因内部不变量而向外抛。
  const baseline = parseVersion(DSH_BASELINE)
  if (parsed === undefined || baseline === undefined) return false
  return parsed.major === baseline.major
    && parsed.minor === baseline.minor
    && compareVersions(parsed, baseline) >= 0
}

/**
 * Packages whose absence means this plugin cannot function at all: every one of
 * them is either subclassed, imported for a value, or the owner of a service
 * key the providers inject.
 */
export const REQUIRED_CORE_PACKAGES = [
  '@deepseek-ai/dsh-fs',
  '@deepseek-ai/dsh-fs-local',
  '@deepseek-ai/dsh-sandbox',
  '@deepseek-ai/dsh-sandbox-local',
  '@deepseek-ai/dsh-sandbox-policy',
  '@deepseek-ai/dsh-storage-domain',
] as const

/**
 * Packages a full composition provides and a minimal one legitimately omits.
 * Absence is fine; a version that DISAGREES with the required packages is not —
 * that is the mixed-installation failure this contract exists to catch.
 */
export const OPTIONAL_CORE_PACKAGES = [
  '@deepseek-ai/dsh-lsp',
  '@deepseek-ai/dsh-lsp-stdio',
  '@deepseek-ai/dsh-api-workspace-files',
  '@deepseek-ai/dsh-typert-protocol',
  '@deepseek-ai/dsh-sandbox-windows-acl',
  '@deepseek-ai/dsh-agent',
  '@deepseek-ai/dsh-agent-instructions',
  '@deepseek-ai/dsh-client-connection',
  '@deepseek-ai/dsh-commands',
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-session',
  '@deepseek-ai/dsh-subprocess',
  '@deepseek-ai/dsh-system-prompt',
  '@deepseek-ai/dsh-file-reference',
  '@deepseek-ai/dsh-file-reference-local',
] as const

/** Every package the contract inspects, required first. */
export const CORE_PACKAGES = [...REQUIRED_CORE_PACKAGES, ...OPTIONAL_CORE_PACKAGES] as const

/** One inspected package and the version actually resolved for it. */
export interface InspectedPackage {
  /** The package specifier. */
  readonly name: string
  /** The resolved `version`, or `undefined` when the package is not installed. */
  readonly version: string | undefined
  /** Whether absence alone is a failure. */
  readonly required: boolean
}

/**
 * Why an installation was accepted or rejected.
 *
 * - `supported` — one release, and it is within the supported range.
 * - `incomplete` — a required package could not be resolved.
 * - `mixed` — the installed core packages do not agree on one release.
 * - `unsupported` — one release, but outside the supported range.
 */
export type CompatVerdict = 'supported' | 'incomplete' | 'mixed' | 'unsupported'

/** The judgement passed on one installation. */
export interface CompatReport {
  /** The verdict. */
  readonly verdict: CompatVerdict
  /** The single release every inspected package agreed on; absent unless they did. */
  readonly release: string | undefined
  /** Every inspected package, in {@link CORE_PACKAGES} order. */
  readonly packages: readonly InspectedPackage[]
  /** Operator-facing explanation, ready to log or print verbatim. */
  readonly message: string
}

/** Reads the installed version of one package, or `undefined` when absent. */
export type VersionReader = (packageName: string) => string | undefined

/**
 * Read one package's declared version through Node resolution.
 *
 * Resolution runs from THIS module, which is what makes the answer meaningful:
 * the upstream packages are peer dependencies, so they resolve to the single
 * copy the host provides — the same copy the providers will subclass at
 * runtime. A package that cannot be resolved is reported absent rather than
 * throwing, because "not installed" is a legitimate answer for every optional
 * package.
 * @param packageName - the package to inspect.
 * @returns the declared version, or `undefined` when the package or its
 *   manifest cannot be resolved.
 */
export function readInstalledVersion(packageName: string): string | undefined {
  try {
    const require = createRequire(import.meta.url)
    const manifest = require(`${packageName}/package.json`) as { version?: unknown }
    return typeof manifest.version === 'string' ? manifest.version : undefined
  } catch {
    return undefined
  }
}

/**
 * Judge one installation against the contract.
 *
 * The three checks run in this order, and the first failure wins, because each
 * later check would report nonsense about an installation that failed an
 * earlier one: a missing required package has no version to compare, and a
 * mixed installation has no single version to judge against the supported
 * range.
 * @param readVersion - version reader; defaults to Node resolution. Tests and
 *   the static checker pass their own.
 * @returns the report; never throws.
 */
export function classifyInstallation(readVersion: VersionReader = readInstalledVersion): CompatReport {
  const packages: InspectedPackage[] = CORE_PACKAGES.map(name => ({
    name,
    version: readVersion(name),
    required: (REQUIRED_CORE_PACKAGES as readonly string[]).includes(name),
  }))

  const missing = packages.filter(entry => entry.required && entry.version === undefined)
  if (missing.length > 0) {
    return report('incomplete', undefined, packages, [
      'multi-root workspace: required DSH packages are not installed.',
      '',
      ...missing.map(entry => `  missing: ${entry.name}`),
    ])
  }

  const releases = [...new Set(packages.flatMap(entry => (entry.version === undefined ? [] : [entry.version])))].sort()
  const [release, ...extra] = releases
  if (release === undefined) {
    // Unreachable while REQUIRED_CORE_PACKAGES is non-empty: the missing check
    // above already returned. Kept so the type narrows without a cast.
    return report('incomplete', undefined, packages, ['multi-root workspace: no DSH package could be inspected.'])
  }
  if (extra.length > 0) {
    return report('mixed', undefined, packages, [
      'multi-root workspace: this installation mixes several DSH releases.',
      '',
      'The filesystem fence and the kernel-sandbox dialects must agree on one upstream',
      'release; a mixed installation means one half of the sandbox was verified against a',
      'shape the other half no longer produces. Align every @deepseek-ai/dsh* package on',
      'one release.',
      '',
      `  releases found: ${releases.join(', ')}`,
    ])
  }
  if (!isSupportedDshRelease(release)) {
    return report('unsupported', release, packages, [
      `multi-root workspace: DSH ${release} is outside the supported range.`,
      '',
      'This plugin replaces the workspace filesystem fence and the kernel-sandbox provider,',
      'and it recognizes the sandbox profile by the argv shape the upstream provider produces.',
      'The supported range is derived from the release this plugin was verified against, so a',
      'release outside it may produce a shape the plugin has never seen. It refuses to grant',
      'additional roots rather than guess at that shape.',
      '',
      `  supported: ${SUPPORTED_DSH_RANGE}`,
      `  installed: ${release}`,
    ])
  }
  return report('supported', release, packages, [`multi-root workspace: DSH ${release} is a supported release.`])
}

/** Compose a report, appending the package inventory and the recovery pointer. */
function report(
  verdict: CompatVerdict,
  release: string | undefined,
  packages: readonly InspectedPackage[],
  lines: readonly string[],
): CompatReport {
  const body = verdict === 'supported'
    ? [...lines]
    : [
        ...lines,
        '',
        'Inspected packages:',
        ...packages.map(entry => `  ${entry.name} ${entry.version ?? '(not installed)'}`),
        '',
        'See docs/troubleshooting/unsupported-dsh-release.md',
      ]
  return { verdict, release, packages, message: body.join('\n') }
}
