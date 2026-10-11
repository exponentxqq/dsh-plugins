// @vitest-environment jsdom
/**
 * Behaviour tests for the provider badge (spec: dsh-web-ux-provider-badge).
 *
 * The badge is a pure projection of the session's model directory, so every
 * case here drives one directory snapshot through the real component and
 * asserts what a user would see. Real-time following is covered by publishing
 * a second snapshot into the same store — the same path a model switch takes.
 */
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import { ProviderBadge, type ProviderBadgeProps } from '../src/client/ProviderBadge.tsx'

afterEach(cleanup)

/**
 * A directory snapshot with every field defaulted, so each case names only the
 * facts it exercises.
 * @param overrides - the fields this case cares about.
 * @returns a complete directory state.
 */
function directoryState(overrides: Partial<ModelDirectoryState> = {}): ModelDirectoryState {
  return {
    current: null,
    routable: null,
    groups: [],
    failures: [],
    status: 'ready',
    pending: null,
    error: null,
    ...overrides,
  }
}

/** One mutable snapshot store publishing a single directory state. */
function directoryStore(initial: ModelDirectoryState) {
  let snapshot = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: (): ModelDirectoryState => snapshot,
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    /** Publish the next state to every live subscription (a model switch). */
    publish(next: ModelDirectoryState): void {
      snapshot = next
      for (const listener of Array.from(listeners)) listener()
    },
  }
}

/**
 * Render the badge over one directory state.
 * @param state - the directory snapshot the seat sees.
 * @returns the testing-library render result plus the store for follow-up publishes.
 */
function renderBadge(state: ModelDirectoryState) {
  const store = directoryStore(state)
  const props = {
    sessionId: 'session-1',
    directoryFor: () => ({ store }),
  } as unknown as ProviderBadgeProps
  return { ...render(<ProviderBadge {...props} />), store }
}

describe('provider badge', () => {
  it('shows the provider display name of the current selection', () => {
    renderBadge(directoryState({
      current: { provider: 'deepseek', model: 'deepseek-chat' },
      groups: [{ id: 'deepseek', name: 'DeepSeek 官方', models: [] }],
    }))

    expect(screen.getByText('DeepSeek 官方')).toBeDefined()
  })

  it('falls back to the provider identifier when no loaded group claims it', () => {
    renderBadge(directoryState({
      current: { provider: 'acme-internal', model: 'acme-1' },
      groups: [{ id: 'deepseek', name: 'DeepSeek 官方', models: [] }],
    }))

    expect(screen.getByText('acme-internal')).toBeDefined()
  })

  it('renders nothing while the session has no durable selection', () => {
    const { container } = renderBadge(directoryState({ groups: [{ id: 'deepseek', name: 'DeepSeek 官方', models: [] }] }))

    expect(container.innerHTML).toBe('')
  })

  it('exposes the provider and model identifiers as the hover text', () => {
    const { container } = renderBadge(directoryState({
      current: { provider: 'deepseek', model: 'deepseek-chat' },
      groups: [{ id: 'deepseek', name: 'DeepSeek 官方', models: [] }],
    }))

    expect(container.querySelector('[title]')?.getAttribute('title')).toBe('deepseek · deepseek-chat')
  })

  it('caps the label with the truncating class so a long name cannot scroll the row', () => {
    const longName = 'Extremely Long Provider Display Name That Must Be Truncated'
    renderBadge(directoryState({
      current: { provider: 'long', model: 'long-1' },
      groups: [{ id: 'long', name: longName, models: [] }],
    }))

    // The ellipsis rule itself lives in badge.module.css (`max-width` +
    // `overflow: hidden` + `text-overflow: ellipsis`); jsdom applies no
    // stylesheets, so what is asserted here is the structural contract that
    // the label element carries that module's truncating class.
    expect(screen.getByText(longName).className).toMatch(/label/)
  })

  it('follows a model switch to another provider without a reload', () => {
    const { store } = renderBadge(directoryState({
      current: { provider: 'deepseek', model: 'deepseek-chat' },
      groups: [
        { id: 'deepseek', name: 'DeepSeek 官方', models: [] },
        { id: 'zai', name: '智谱 AI', models: [] },
      ],
    }))
    expect(screen.getByText('DeepSeek 官方')).toBeDefined()

    // The publish is the store notification a model switch makes; React only
    // processes external-store updates synchronously inside act().
    act(() => {
      store.publish(directoryState({
        current: { provider: 'zai', model: 'glm-5.3' },
        groups: [
          { id: 'deepseek', name: 'DeepSeek 官方', models: [] },
          { id: 'zai', name: '智谱 AI', models: [] },
        ],
      }))
    })

    expect(screen.getByText('智谱 AI')).toBeDefined()
    expect(screen.queryByText('DeepSeek 官方')).toBeNull()
  })
})
