/**
 * Multi-path `/git/events` subscription tests. The SSE route itself owns HTTP
 * framing and the poll loop; everything that decides *which* paths a stream
 * watches, *what* a path's poll digest is, and *which* paths changed in one
 * round lives in the pure `host/events` module exercised here — one stream
 * must be able to cover every repository of a workspace without a server
 * fixture.
 * @module dsh-git-graph-multi/test/host-events
 */

import { describe, expect, it } from 'vitest'
import type { RepoStatus } from '../src/core/types.ts'
import { MAX_EVENT_PATHS, collectChanges, parseEventPaths, pollDigestKey } from '../src/host/events.ts'

/** A workspace-relative status snapshot; every field overridable per test. */
function status(overrides: Partial<RepoStatus> = {}): RepoStatus {
  return {
    root: '/ws/service',
    branch: 'main',
    head: 'abc1234',
    dirtyFiles: 0,
    untrackedFiles: 0,
    conflicts: 0,
    operationInProgress: false,
    ...overrides,
  }
}

/** Build a digest map from path/digest pairs, preserving insertion order. */
function digests(entries: Array<[string, string]>): Map<string, string> {
  return new Map(entries)
}

describe('parseEventPaths', () => {
  it('reads a single path parameter', () => {
    expect(parseEventPaths(new URLSearchParams('path=/ws/service'))).toEqual(['/ws/service'])
  })

  it('keeps two paths in the order they were sent', () => {
    const params = new URLSearchParams('path=/ws/service&path=/ws/portal')
    expect(parseEventPaths(params)).toEqual(['/ws/service', '/ws/portal'])
  })

  it('drops duplicate paths while keeping the first occurrence position', () => {
    const params = new URLSearchParams('path=/ws/a&path=/ws/b&path=/ws/a&path=/ws/b&path=/ws/c')
    expect(parseEventPaths(params)).toEqual(['/ws/a', '/ws/b', '/ws/c'])
  })

  it('drops empty values but keeps the other paths', () => {
    const params = new URLSearchParams('path=&path=/ws/a&path=')
    expect(parseEventPaths(params)).toEqual(['/ws/a'])
  })

  it('returns an empty list when no path parameter is present', () => {
    expect(parseEventPaths(new URLSearchParams(''))).toEqual([])
    expect(parseEventPaths(new URLSearchParams('other=/ws/a'))).toEqual([])
  })

  it('decodes percent-encoded values instead of trimming them', () => {
    const params = new URLSearchParams('path=%2Fws%2Fmy%20repo&path=%2Fws%2Fplain')
    expect(parseEventPaths(params)).toEqual(['/ws/my repo', '/ws/plain'])
    // A path made of spaces is legal (and must not be mistaken for empty).
    expect(parseEventPaths(new URLSearchParams('path=%20'))).toEqual([' '])
  })

  it(`truncates a longer subscription to the first ${MAX_EVENT_PATHS} paths`, () => {
    const params = new URLSearchParams()
    for (let index = 0; index < MAX_EVENT_PATHS + 5; index += 1) params.append('path', `/ws/repo-${index}`)
    const paths = parseEventPaths(params)
    expect(paths).toHaveLength(MAX_EVENT_PATHS)
    expect(paths[0]).toBe('/ws/repo-0')
    expect(paths[MAX_EVENT_PATHS - 1]).toBe(`/ws/repo-${MAX_EVENT_PATHS - 1}`)
  })
})

describe('pollDigestKey', () => {
  it('is stable for the same status and worktree digest', () => {
    expect(pollDigestKey(status(), 'wt-a')).toBe(pollDigestKey(status(), 'wt-a'))
  })

  it('changes when the branch changes', () => {
    const before = pollDigestKey(status({ branch: 'main' }), 'wt-a')
    const after = pollDigestKey(status({ branch: 'feat/x' }), 'wt-a')
    expect(after).not.toBe(before)
  })

  it('changes when the root or head changes', () => {
    const base = pollDigestKey(status(), 'wt-a')
    expect(pollDigestKey(status({ root: '/ws/other' }), 'wt-a')).not.toBe(base)
    expect(pollDigestKey(status({ head: 'def5678' }), 'wt-a')).not.toBe(base)
  })

  it('folds the worktree digest into the key', () => {
    expect(pollDigestKey(status(), 'wt-a')).not.toBe(pollDigestKey(status(), 'wt-b'))
  })

  it('returns the stable no-repo key for a null status', () => {
    expect(pollDigestKey(null, '')).toBe('no-repo')
    // A failed status probe must not flap the stream through the worktree half.
    expect(pollDigestKey(null, 'wt-a')).toBe(pollDigestKey(null, 'wt-b'))
  })
})

describe('collectChanges', () => {
  it('reports nothing when every digest is unchanged', () => {
    const previous = digests([['/ws/a', 'k1'], ['/ws/b', 'k2']])
    expect(collectChanges(previous, digests([['/ws/a', 'k1'], ['/ws/b', 'k2']]))).toEqual([])
  })

  it('reports only the path whose digest changed', () => {
    const previous = digests([['/ws/a', 'k1'], ['/ws/b', 'k2'], ['/ws/c', 'k3']])
    expect(collectChanges(previous, digests([['/ws/a', 'k1'], ['/ws/b', 'k9'], ['/ws/c', 'k3']])))
      .toEqual(['/ws/b'])
  })

  it('reports a path that is new in the current round', () => {
    const previous = digests([['/ws/a', 'k1']])
    expect(collectChanges(previous, digests([['/ws/a', 'k1'], ['/ws/b', 'k2']]))).toEqual(['/ws/b'])
  })

  it('does not report a path that only the previous round had', () => {
    const previous = digests([['/ws/a', 'k1'], ['/ws/b', 'k2']])
    expect(collectChanges(previous, digests([['/ws/a', 'k1']]))).toEqual([])
  })

  it('orders the result like the current map, not the previous one', () => {
    const previous = digests([['/ws/a', 'k1'], ['/ws/b', 'k2'], ['/ws/c', 'k3']])
    const current = digests([['/ws/c', 'k3'], ['/ws/a', 'k9'], ['/ws/b', 'k8']])
    expect(collectChanges(previous, current)).toEqual(['/ws/a', '/ws/b'])
  })

  it('reports every path on the first round of a fresh subscriber', () => {
    expect(collectChanges(new Map(), digests([['/ws/a', 'k1'], ['/ws/b', 'no-repo']])))
      .toEqual(['/ws/a', '/ws/b'])
  })
})
