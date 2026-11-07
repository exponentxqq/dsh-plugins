import { createRequire } from "node:module";
import { Service } from "@deepseek-ai/cordis";
//#region src/compat/dsh-version.ts
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
/** 版本文法：`<主>.<次>.<补丁>[-<预发布>]`；预发布段是以 `.` 分隔的 `[0-9A-Za-z-]+`。 */
const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/u;
/** 全数字的 prerelease 标识符按数值比较（见 {@link compareVersions} 规则 3）。 */
const NUMERIC_IDENTIFIER = /^\d+$/u;
/**
* 仓库基线的运行时副本（唯一字面量）。与 `scripts/dsh-baseline.mjs` 的
* `DSH_BASELINE` 同值，由 `pnpm dsh:upgrade` 同批重写，并由「manifest engines/peers
* == 本文件派生范围」与「engines == 根基线派生范围」两条断言传递性地钉住相等。
*
* 本条必须是单引号字符串常量（`DSH_BASELINE` 后紧跟一次赋值、值两侧为单引号）：
* 升级脚本（`scripts/upgrade-dsh.mjs` 的 `repointRuntimeBaselines`）按首个文本
* 出现位置做重写，任何更早的同形状文本（例如注释里的示例）都会让它改错对象。
*/
const DSH_BASELINE = "0.2.2-rc.1";
/** 由基线派生的支持范围：`>=<基线> <<主>.<次+1>.0`（下界含、上界不含）。 */
const SUPPORTED_DSH_RANGE = softDshRange(DSH_BASELINE);
/**
* 从基线推导范围字符串。基线不合 `<主>.<次>.<补丁>[-<预发布>]` 文法时在模块装载期
* 抛错：范围是装载期常量，宁可拒绝启动也不静默放行一个拼错的范围（fail-closed）。
* @param baseline - 已校验为字面量的基线版本。
* @returns `>=<基线> <<主>.<次+1>.0`。
*/
function softDshRange(baseline) {
	const parsed = parseVersion(baseline);
	if (parsed === void 0) throw new Error(`[multi-root] DSH_BASELINE is not a valid version: ${baseline}`);
	return `>=${baseline} <${parsed.major}.${parsed.minor + 1}.0`;
}
/**
* 严格版本文法：`<主>.<次>.<补丁>[-<预发布>]`。
*
* 文法外的输入（`'0.9'`、`''`、`'latest'`、带 build metadata 的 `'1.2.3+build'`）
* 返回 `undefined`，不抛——门禁对不可解析的版本一律按「不支持」处理。
*
* 导出仅供 `test/` 直接钉住文法（不进 barrel）。
* @param value - 待解析的版本字符串。
* @returns 解析结果，或 `undefined`（文法外）。
*/
function parseVersion(value) {
	const match = VERSION_PATTERN.exec(value);
	if (match === null) return void 0;
	const major = match[1];
	const minor = match[2];
	const patch = match[3];
	if (major === void 0 || minor === void 0 || patch === void 0) return void 0;
	const prerelease = match[4];
	return {
		major: Number(major),
		minor: Number(minor),
		patch: Number(patch),
		prerelease: prerelease === void 0 ? [] : prerelease.split(".").map((identifier) => NUMERIC_IDENTIFIER.test(identifier) ? Number(identifier) : identifier)
	};
}
/**
* semver 优先级比较：`<0` / `0` / `>0`。
*
* 规则（`test/compat.spec.ts` 逐条钉住）：
* 1. `major` / `minor` / `patch` 数值比较；
* 2. 同 triple 时，无 prerelease 的版本**大于**有 prerelease 的版本（`0.2.2 > 0.2.2-rc.1`）；
* 3. prerelease 按 `.` 分段逐段比较：两段皆数字→数值比较；仅一方数字→数字段小；
*    两段皆字母→ASCII 比较；
* 4. 前缀全等时短者小（`0.2.2-rc < 0.2.2-rc.1`）。
*
* 导出仅供 `test/` 直接钉住比较语义（不进 barrel）。
* @param left - 左操作数（已解析）。
* @param right - 右操作数（已解析）。
* @returns 负数表示 `left` 优先级更低，正数更高，`0` 表示相等。
*/
function compareVersions(left, right) {
	const triple = left.major - right.major || left.minor - right.minor || left.patch - right.patch;
	if (triple !== 0) return triple;
	if (left.prerelease.length === 0) return right.prerelease.length === 0 ? 0 : 1;
	if (right.prerelease.length === 0) return -1;
	for (const [index, leftIdentifier] of left.prerelease.entries()) {
		const rightIdentifier = right.prerelease[index];
		if (rightIdentifier === void 0) return 1;
		const compared = comparePrereleaseIdentifier(leftIdentifier, rightIdentifier);
		if (compared !== 0) return compared;
	}
	return left.prerelease.length === right.prerelease.length ? 0 : -1;
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
function comparePrereleaseIdentifier(left, right) {
	if (typeof left === "number" && typeof right === "number") return left - right;
	if (typeof left === "number") return -1;
	if (typeof right === "number") return 1;
	return left < right ? -1 : left > right ? 1 : 0;
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
function isSupportedDshRelease(release) {
	const parsed = parseVersion(release);
	const baseline = parseVersion(DSH_BASELINE);
	if (parsed === void 0 || baseline === void 0) return false;
	return parsed.major === baseline.major && parsed.minor === baseline.minor && compareVersions(parsed, baseline) >= 0;
}
/**
* Packages whose absence means this plugin cannot function at all: every one of
* them is either subclassed, imported for a value, or the owner of a service
* key the providers inject.
*/
const REQUIRED_CORE_PACKAGES = [
	"@deepseek-ai/dsh-fs",
	"@deepseek-ai/dsh-fs-local",
	"@deepseek-ai/dsh-sandbox",
	"@deepseek-ai/dsh-sandbox-local",
	"@deepseek-ai/dsh-sandbox-policy",
	"@deepseek-ai/dsh-storage-domain"
];
/**
* Packages a full composition provides and a minimal one legitimately omits.
* Absence is fine; a version that DISAGREES with the required packages is not —
* that is the mixed-installation failure this contract exists to catch.
*/
const OPTIONAL_CORE_PACKAGES = [
	"@deepseek-ai/dsh-lsp",
	"@deepseek-ai/dsh-lsp-stdio",
	"@deepseek-ai/dsh-api-workspace-files",
	"@deepseek-ai/dsh-typert-protocol",
	"@deepseek-ai/dsh-sandbox-windows-acl",
	"@deepseek-ai/dsh-agent",
	"@deepseek-ai/dsh-agent-instructions",
	"@deepseek-ai/dsh-client-connection",
	"@deepseek-ai/dsh-commands",
	"@deepseek-ai/dsh-llm",
	"@deepseek-ai/dsh-session",
	"@deepseek-ai/dsh-subprocess",
	"@deepseek-ai/dsh-system-prompt",
	"@deepseek-ai/dsh-file-reference",
	"@deepseek-ai/dsh-file-reference-local"
];
/** Every package the contract inspects, required first. */
const CORE_PACKAGES = [...REQUIRED_CORE_PACKAGES, ...OPTIONAL_CORE_PACKAGES];
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
function readInstalledVersion(packageName) {
	try {
		const manifest = createRequire(import.meta.url)(`${packageName}/package.json`);
		return typeof manifest.version === "string" ? manifest.version : void 0;
	} catch {
		return;
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
function classifyInstallation(readVersion = readInstalledVersion) {
	const packages = CORE_PACKAGES.map((name) => ({
		name,
		version: readVersion(name),
		required: REQUIRED_CORE_PACKAGES.includes(name)
	}));
	const missing = packages.filter((entry) => entry.required && entry.version === void 0);
	if (missing.length > 0) return report("incomplete", void 0, packages, [
		"multi-root workspace: required DSH packages are not installed.",
		"",
		...missing.map((entry) => `  missing: ${entry.name}`)
	]);
	const releases = [...new Set(packages.flatMap((entry) => entry.version === void 0 ? [] : [entry.version]))].sort();
	const [release, ...extra] = releases;
	if (release === void 0) return report("incomplete", void 0, packages, ["multi-root workspace: no DSH package could be inspected."]);
	if (extra.length > 0) return report("mixed", void 0, packages, [
		"multi-root workspace: this installation mixes several DSH releases.",
		"",
		"The filesystem fence and the kernel-sandbox dialects must agree on one upstream",
		"release; a mixed installation means one half of the sandbox was verified against a",
		"shape the other half no longer produces. Align every @deepseek-ai/dsh* package on",
		"one release.",
		"",
		`  releases found: ${releases.join(", ")}`
	]);
	if (!isSupportedDshRelease(release)) return report("unsupported", release, packages, [
		`multi-root workspace: DSH ${release} is outside the supported range.`,
		"",
		"This plugin replaces the workspace filesystem fence and the kernel-sandbox provider,",
		"and it recognizes the sandbox profile by the argv shape the upstream provider produces.",
		"The supported range is derived from the release this plugin was verified against, so a",
		"release outside it may produce a shape the plugin has never seen. It refuses to grant",
		"additional roots rather than guess at that shape.",
		"",
		`  supported: ${SUPPORTED_DSH_RANGE}`,
		`  installed: ${release}`
	]);
	return report("supported", release, packages, [`multi-root workspace: DSH ${release} is a supported release.`]);
}
/** Compose a report, appending the package inventory and the recovery pointer. */
function report(verdict, release, packages, lines) {
	return {
		verdict,
		release,
		packages,
		message: (verdict === "supported" ? [...lines] : [
			...lines,
			"",
			"Inspected packages:",
			...packages.map((entry) => `  ${entry.name} ${entry.version ?? "(not installed)"}`),
			"",
			"See docs/troubleshooting/unsupported-dsh-release.md"
		]).join("\n")
	};
}
//#endregion
//#region src/compat.ts
/**
* `multi-root-compat`: the startup gate that turns the DSH compatibility
* contract from documentation into a precondition.
*
* The four security-relevant rows of this bundle — `multi-root-fs`,
* `multi-root-sandbox`, `multi-root-registry`, `multi-root-instructions` —
* inject `multiRootCompat`. Cordis will not start a plugin whose injected
* service is absent, so this row is what decides whether they run at all:
*
* ```text
* compat check passes  →  ctx.multiRootCompat exists  →  the providers start
* compat check fails   →  the row throws             →  they never start
* ```
*
* That is why the gate is a plain `apply` and not a `Service` subclass mounted
* directly: the check has to be able to fail BEFORE the service exists. A
* `Service` constructor has already run `super(ctx, name)` — and therefore
* already claimed the service key — by the time it could inspect anything.
*
* The verdict itself, and the supported range it is judged against, live in
* `./compat/dsh-version.ts`. This module owns only the reaction to it.
*
* @module dsh-plugin-multi-root-workspace/compat
*/
/**
* Raised when the installation fails the compatibility contract — an
* `unsupported` release, an `incomplete` installation or a `mixed` one. It is
* thrown from `apply`, so it surfaces as a plugin load failure with the full
* diagnosis attached — never as a silently degraded sandbox.
*/
var DshCompatUnsupportedError = class extends Error {
	/** The report that produced the refusal. */
	report;
	constructor(report) {
		super(report.message);
		this.name = "DshCompatUnsupportedError";
		this.report = report;
	}
};
/**
* The `ctx.multiRootCompat` service: the resolved compatibility verdict, held
* where the gated providers can read it.
*
* It intentionally exposes no per-version capability flags. The adapters under
* `./compat/` detect the shape they need STRUCTURALLY — whether a return value
* is a thenable, which export name a module carries — because a structural
* probe also survives upstream reshaping something within one release, while a
* version comparison does not. The release string here is for the gate and for
* diagnostics.
*/
var MultiRootCompatService = class extends Service {
	/** The verdict this composition started under. */
	report;
	constructor(ctx, report) {
		super(ctx, "multiRootCompat");
		this.report = report;
	}
	/** The single DSH release every inspected core package agreed on. */
	get release() {
		return this.report.release;
	}
	/** Whether the installation is within the supported range. */
	get supported() {
		return this.report.verdict === "supported";
	}
};
/** This row needs nothing: it is the thing everything else waits for. */
const inject = [];
/**
* Apply the gate policy to one report.
*
* `supported` is the only verdict that lets the service mount. `unsupported`,
* `incomplete` and `mixed` all describe an installation whose sandbox shape
* this plugin cannot vouch for, so every one of them is refused: the gate has
* exactly one reaction and there is no degraded path. `report.message` already
* carries the verdict's diagnosis, the inspected package inventory and the
* recovery pointer, so the thrown error needs no wording of its own.
* @param report - the verdict to act on.
* @throws {DshCompatUnsupportedError} when the verdict is not `supported`.
*/
function assertSupportedInstallation(report) {
	if (report.verdict !== "supported") throw new DshCompatUnsupportedError(report);
}
/**
* Judge the installation, then either refuse to provide the service or provide
* it.
* @param ctx - the row's context.
*/
function apply(ctx) {
	const report = classifyInstallation();
	assertSupportedInstallation(report);
	ctx.plugin(MultiRootCompatService, report);
}
//#endregion
export { inject as a, OPTIONAL_CORE_PACKAGES as c, classifyInstallation as d, isSupportedDshRelease as f, assertSupportedInstallation as i, REQUIRED_CORE_PACKAGES as l, MultiRootCompatService as n, CORE_PACKAGES as o, readInstalledVersion as p, apply as r, DSH_BASELINE as s, DshCompatUnsupportedError as t, SUPPORTED_DSH_RANGE as u };
