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

import { Context, Service } from '@deepseek-ai/cordis'
import {
  classifyInstallation,
  type CompatReport,
} from './compat/dsh-version.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    multiRootCompat: MultiRootCompatService
  }
}

/**
 * Raised when the installation fails the compatibility contract — an
 * `unsupported` release, an `incomplete` installation or a `mixed` one. It is
 * thrown from `apply`, so it surfaces as a plugin load failure with the full
 * diagnosis attached — never as a silently degraded sandbox.
 */
export class DshCompatUnsupportedError extends Error {
  /** The report that produced the refusal. */
  readonly report: CompatReport

  constructor(report: CompatReport) {
    super(report.message)
    this.name = 'DshCompatUnsupportedError'
    this.report = report
  }
}

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
export class MultiRootCompatService extends Service {
  /** The verdict this composition started under. */
  readonly report: CompatReport

  constructor(ctx: Context, report: CompatReport) {
    super(ctx, 'multiRootCompat')
    this.report = report
  }

  /** The single DSH release every inspected core package agreed on. */
  get release(): string | undefined {
    return this.report.release
  }

  /** Whether the installation is within the supported range. */
  get supported(): boolean {
    return this.report.verdict === 'supported'
  }
}

/** This row needs nothing: it is the thing everything else waits for. */
export const inject: string[] = []

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
export function assertSupportedInstallation(report: CompatReport): void {
  if (report.verdict !== 'supported') throw new DshCompatUnsupportedError(report)
}

/**
 * Judge the installation, then either refuse to provide the service or provide
 * it.
 * @param ctx - the row's context.
 */
export function apply(ctx: Context): void {
  const report = classifyInstallation()
  assertSupportedInstallation(report)
  ctx.plugin(MultiRootCompatService, report)
}
