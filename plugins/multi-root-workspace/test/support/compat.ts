/**
 * Satisfy the `multiRootCompat` gate for specs that mount a gated provider.
 *
 * It mounts the REAL row — verdict, gate policy and all — rather than a
 * permissive stub. That matters: every spec that mounts a provider therefore
 * also asserts that this suite is allowed to run against the installed release
 * at all. On a release outside the supported range the gate refuses here, and
 * the suite fails loudly instead of quietly producing evidence about a harness
 * nobody verified.
 *
 * There is no way past it: the range is derived from the baseline the code was
 * verified against (`>=<baseline> <next minor>.0`), and the gate has exactly one
 * reaction — a release outside it is refused, never merely warned about
 * (ADR-0009).
 *
 * @module test/support/compat
 */

import type { Context } from '@deepseek-ai/cordis'
import * as Compat from '../../src/compat.ts'

/**
 * Mount `ctx.multiRootCompat` for the installation under test.
 * @param ctx - the context to provide the service on.
 * @throws {DshCompatUnsupportedError} when the installed release is outside the
 *   supported range, or the installation is incomplete or mixed.
 */
export async function mountCompat(ctx: Context): Promise<void> {
  await ctx.plugin(Compat)
}
