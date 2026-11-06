/**
 * Boot sweep: attach the live sessions that predate this plugin's load.
 *
 * A plugin loaded into a running host meets sessions whose `agent/created`
 * event already fired, so nothing ever attached their workspace isolation and
 * their calls would be judged against no visible set at all. This module is
 * that catch-up pass: it takes the live sessions as plain candidates and
 * attaches every one the isolation layer does not track yet, through the same
 * attach path `agent/created` drives — which is idempotent, so the sweep can
 * never double-track a session the event also reaches.
 *
 * The sweep is serial rather than concurrent on purpose: each attach awaits
 * its own attribution before the next session is touched, so one sweep reads
 * one session directory at a time and the `isolation:` diagnostics come out in
 * registration order. A failure is absorbed into a count and reported with its
 * session id — one unattachable session never stops the rest of the sweep, and
 * the sweep never rejects. With no live sessions it stays silent, exactly as
 * the host did before this pass existed; with any, one summary line accounts
 * for the whole pass.
 *
 * Nothing here knows what an agent, a context, or a fiber is: the candidates
 * and the two effects they need arrive as narrow ports, which keeps the whole
 * orchestration unit-testable without a running host.
 * @module dsh-plugin-project-mcp/host/boot-sweep
 */

import type { ScanLog } from './types.ts'

/** One live session the sweep may attach, as the wiring presents it. */
export interface SweepCandidate {
  /** The agent's scope key (its identity object). */
  readonly key: object
  /** The session id, for diagnostics only. */
  readonly id: string
  /** Attach this session: the SAME path `agent/created` drives; MUST be idempotent. */
  attach(): Promise<void>
}

/** The facts and effects one sweep reads. */
export interface SweepPorts {
  /** Whether the isolation layer already tracks this candidate. */
  isTracked(key: object): boolean
  readonly log: ScanLog
}

/** What one sweep did. */
export interface SweepSummary {
  readonly live: number
  readonly attached: number
  readonly skipped: number
  readonly failed: number
}

/**
 * Attach every live session that predates this plugin's load.
 * Serial: each attach awaits its own attribution, and serial keeps the
 * `isolation:` diagnostics in registration order.
 */
export async function sweepLiveSessions(
  candidates: readonly SweepCandidate[],
  ports: SweepPorts,
): Promise<SweepSummary> {
  const live = candidates.length
  let attached = 0
  let skipped = 0
  let failed = 0

  for (const candidate of candidates) {
    if (ports.isTracked(candidate.key)) {
      skipped += 1
      continue
    }
    try {
      await candidate.attach()
      attached += 1
    } catch (error) {
      failed += 1
      ports.log.error(
        `boot: cannot attach the workspace isolation of session ${candidate.id}: ${String(error)}`,
      )
    }
  }

  if (live > 0) {
    ports.log.info(
      `boot: swept ${live} live session(s): attached ${attached}, already tracked ${skipped}, failed ${failed}`,
    )
  }

  return { live, attached, skipped, failed }
}
