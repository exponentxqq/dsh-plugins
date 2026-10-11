/**
 * The provider badge: one static capsule appended to the composer status row
 * (`conversation.composer.dock`) showing which model provider the session is
 * running on. The display name is resolved from the session's model directory;
 * hovering shows the provider and model identifiers. The badge owns no click
 * interaction — the model selector itself remains the only switch surface.
 *
 * Nothing here is stored: the component renders from the shared
 * {@link ModelDirectoryState} snapshot, so a model switch made in the official
 * selector (or the /model popup) repaints the badge without a reload.
 * @module dsh-plugin-web-ux/client/ProviderBadge
 */

import { useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
// Type-only: pulls ui-conversation's SlotMap merge (the composer dock key).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls ui-session's SessionStandardProps merge (sessionId on
// session-scope slots); without it PropsRuntime carries no session identity.
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import css from './badge.module.css'

/** The slice of the per-session model directory this badge consumes. */
export interface ProviderBadgeDirectory {
  /** The uSES-safe snapshot both model entries render from. */
  readonly store: ObservableSnapshot<ModelDirectoryState>
}

/** The slot-injected face: the model directory resolver, injected by the client entry. */
export interface ProviderBadgeInjected {
  /**
   * Resolve the session's live model directory.
   * @param sessionId - the seat's session.
   * @returns the directory carrying the shared selection snapshot.
   */
  readonly directoryFor: (sessionId: SessionId) => ProviderBadgeDirectory
}

/** Full props of the badge: the dock seat's runtime share plus the injected resolver. */
export type ProviderBadgeProps = PropsRuntime<'conversation.composer.dock'> & ProviderBadgeInjected

/**
 * The provider label for one directory snapshot: the matching provider group's
 * display name, or the provider identifier itself when no loaded group claims
 * it (an unloaded or retired provider still deserves an honest label).
 * @param state - the model directory snapshot.
 * @returns the label, or null when the session has no durable selection.
 */
export function badgeLabel(state: ModelDirectoryState): string | null {
  const current = state.current
  if (current === null) return null
  const name = state.groups.find((group) => group.id === current.provider)?.name
  return name !== undefined && name !== '' ? name : current.provider
}

/**
 * The hover text for one directory snapshot: the provider and model
 * identifiers the selection actually names.
 * @param state - the model directory snapshot.
 * @returns the tooltip text, or null when the session has no durable selection.
 */
export function badgeTooltip(state: ModelDirectoryState): string | null {
  const current = state.current
  return current === null ? null : `${current.provider} · ${current.model}`
}

/**
 * The badge capsule. Renders nothing while the session has no durable model
 * selection — the status row is upstream's to draw, and this entry never
 * invents a selection to fill the space.
 * @param props - dock runtime props and the injected model directory resolver.
 * @returns the capsule, or null when there is nothing to show.
 */
export function ProviderBadge({ sessionId, directoryFor }: ProviderBadgeProps): ReactNode {
  // The seat may hand a fresh inject face on any render, so the resolver rides
  // a ref while the memo keys on the session alone: the per-session directory
  // is resident, and keying on the face would rebuild — and resubscribe — the
  // store on every render.
  const resolver = useRef(directoryFor)
  resolver.current = directoryFor

  // An unknown session makes `directoryFor` fail loud upstream; a badge is
  // never a reason to break the status row, so the failure reads as "no badge".
  const store = useMemo(() => {
    try {
      return resolver.current(sessionId).store
    } catch {
      return undefined
    }
  }, [sessionId])

  const subscribe = useMemo(
    () => (onChange: () => void) => (store === undefined ? () => {} : store.subscribe(onChange)),
    [store],
  )
  const readLabel = useMemo(() => () => (store === undefined ? null : badgeLabel(store.getSnapshot())), [store])
  const readTooltip = useMemo(() => () => (store === undefined ? null : badgeTooltip(store.getSnapshot())), [store])

  // Both reads return primitives, so the snapshot comparison stays stable and
  // an unrelated directory update never repaints the badge.
  const label = useSyncExternalStore(subscribe, readLabel)
  const tooltip = useSyncExternalStore(subscribe, readTooltip)
  if (label === null) return null

  return (
    <span className={css.root}>
      <span className={css.pill} title={tooltip ?? undefined}>
        <span className={css.label}>{label}</span>
      </span>
    </span>
  )
}
