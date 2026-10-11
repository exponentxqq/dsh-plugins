/**
 * Rescan trigger tests (spec: dsh-web-ux-project-mcp — 热重载与手动重载;
 * task 6.2).
 *
 * The triggers are installed through a context slice, so a case can fire each
 * signal by hand and assert that it reaches the rescan — and that the rescan
 * then sees the registry's new state, which is the only thing that decides the
 * outcome.
 */
import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { workspaceRoots } from '../src/host/roots.ts'
import { installTriggers, type TriggerContext } from '../src/host/triggers.ts'

describe('rescan triggers', () => {
  it('rescans when the additional-root registry reports a change', () => {
    let listener: (() => void) | undefined
    const ctx: TriggerContext = {
      get: (name) => (name === 'multiRootRegistry'
        ? {
            onChange: (next: () => void) => {
              listener = next
              return () => {
                listener = undefined
              }
            },
          }
        : undefined),
      on: () => () => {},
    }
    let rescans = 0

    const disposers = installTriggers(ctx, () => {
      rescans += 1
    })
    expect(listener).toBeDefined()

    listener?.()
    expect(rescans).toBe(1)

    for (const dispose of disposers) dispose()
    expect(listener).toBeUndefined()
  })

  it('rescans on a durable domain change without reading the payload', () => {
    let domain: (() => void) | undefined
    const ctx: TriggerContext = {
      get: () => undefined,
      on: (event, listener) => {
        expect(event).toBe('domain/changed')
        domain = listener
        return () => {
          domain = undefined
        }
      },
    }
    let rescans = 0

    const disposers = installTriggers(ctx, () => {
      rescans += 1
    })
    domain?.()
    expect(rescans).toBe(1)

    for (const dispose of disposers) dispose()
    expect(domain).toBeUndefined()
  })

  it('keeps the domain trigger when the additional-root registry is absent', () => {
    let subscribed = false
    const ctx: TriggerContext = {
      get: () => undefined,
      on: () => {
        subscribed = true
        return () => {}
      },
    }

    const disposers = installTriggers(ctx, () => {})

    expect(subscribed).toBe(true)
    expect(disposers).toHaveLength(1)
  })

  it('sees a newly registered workspace on the next rescan', () => {
    let workspaces: { path: string }[] = [{ path: '/work/a' }]
    const ctx = {
      get: (name: string) => (name === 'workspaceRegistry' ? { list: () => workspaces } : undefined),
    } as unknown as Context
    const seen: string[][] = []

    const rescan = (): void => {
      seen.push(workspaceRoots(ctx).map((workspace) => workspace.primaryRoot))
    }

    rescan()
    workspaces = [...workspaces, { path: '/work/b' }]
    rescan()

    expect(seen).toEqual([['/work/a'], ['/work/a', '/work/b']])
  })
})
