/**
 * Boot sweep tests (spec: dsh-project-mcp — 启动补挂).
 *
 * The sweep takes the live sessions and its two effects as narrow ports, so
 * each case fakes both and asserts what one pass did: the four counts, the one
 * summary line, and the single error a failed attach reports. The last case
 * pins down that the pass is serial — each attach begins only after the
 * previous one resolved — because that order is what keeps the `isolation:`
 * diagnostics in registration order.
 */
import { describe, expect, it } from 'vitest'
import { sweepLiveSessions, type SweepCandidate, type SweepPorts } from '../src/host/boot-sweep.ts'
import type { ScanLog } from '../src/host/types.ts'

/** A log that records what the sweep reported. */
function recordingLog(): { log: ScanLog; infos: string[]; errors: string[] } {
  const infos: string[] = []
  const errors: string[] = []
  return { log: { info: (message) => infos.push(message), warn: () => {}, error: (message) => errors.push(message) }, infos, errors }
}

/** One candidate over a bare key; `attach` is the effect each case watches. */
function candidate(id: string, attach: () => Promise<void> = async () => {}): SweepCandidate {
  return { key: { id }, id, attach }
}

/** Ports with an explicit tracked set and log, so a case names only what it changes. */
function ports(log: ScanLog, tracked: ReadonlySet<object> = new Set()): SweepPorts {
  return { isTracked: (key) => tracked.has(key), log }
}

describe('boot sweep', () => {
  it('attaches every live session and accounts for the pass in one line', async () => {
    const { log, infos, errors } = recordingLog()
    const attached: string[] = []
    const candidates = ['a', 'b', 'c'].map((id) => candidate(id, async () => { attached.push(id) }))

    const summary = await sweepLiveSessions(candidates, ports(log))

    expect(summary).toEqual({ live: 3, attached: 3, skipped: 0, failed: 0 })
    expect(attached).toEqual(['a', 'b', 'c'])
    expect(errors).toEqual([])
    expect(infos).toHaveLength(1)
    expect(infos[0]).toBe('boot: swept 3 live session(s): attached 3, already tracked 0, failed 0')
  })

  it('skips the sessions the isolation layer already tracks', async () => {
    const { log, infos } = recordingLog()
    const attached: string[] = []
    const candidates = ['a', 'b', 'c'].map((id) => candidate(id, async () => { attached.push(id) }))
    const tracked = new Set<object>([candidates[0].key, candidates[2].key])

    const summary = await sweepLiveSessions(candidates, ports(log, tracked))

    expect(summary).toEqual({ live: 3, attached: 1, skipped: 2, failed: 0 })
    expect(attached).toEqual(['b'])
    expect(infos).toHaveLength(1)
    expect(infos[0]).toContain('boot: swept 3')
    expect(infos[0]).toContain('attached 1, already tracked 2, failed 0')
  })

  it('keeps sweeping after one session fails to attach', async () => {
    const { log, infos, errors } = recordingLog()
    const attached: string[] = []
    const candidates = [
      candidate('session-a', async () => { attached.push('a') }),
      candidate('session-b', async () => { throw new Error('no workspace root claims the session directory') }),
      candidate('session-c', async () => { attached.push('c') }),
    ]

    const summary = await sweepLiveSessions(candidates, ports(log))

    expect(summary).toEqual({ live: 3, attached: 2, skipped: 0, failed: 1 })
    // The failure is absorbed: the last candidate is still attached.
    expect(attached).toEqual(['a', 'c'])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('boot: cannot attach the workspace isolation of session session-b')
    expect(infos).toHaveLength(1)
    expect(infos[0]).toContain('attached 2, already tracked 0, failed 1')
  })

  it('stays silent when no session is live', async () => {
    const { log, infos, errors } = recordingLog()

    const summary = await sweepLiveSessions([], ports(log))

    expect(summary).toEqual({ live: 0, attached: 0, skipped: 0, failed: 0 })
    expect(infos).toEqual([])
    expect(errors).toEqual([])
  })

  it('sweeps the sessions one at a time, in registration order', async () => {
    const order: string[] = []
    const startedWith: string[][] = []
    const candidates = ['a', 'b', 'c'].map((id) => candidate(id, async () => {
      // What the loop had already completed when this attach began: a serial
      // sweep starts `b` only after `a` resolved, so each snapshot grows by one;
      // a concurrent sweep would start all three from an empty order.
      startedWith.push([...order])
      await Promise.resolve()
      order.push(id)
    }))

    await sweepLiveSessions(candidates, ports(recordingLog().log))

    expect(order).toEqual(['a', 'b', 'c'])
    expect(startedWith).toEqual([[], ['a'], ['a', 'b']])
  })
})
