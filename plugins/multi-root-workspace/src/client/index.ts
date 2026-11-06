/**
 * Browser half of the multi-root workspace plugin.
 *
 * Two soft seats, one panel body:
 *
 * - `workspace-config.section` — the Workspace Folders section inside the
 *   unified workspace-config dialog. This is the panel's mount point since the
 *   footer action was removed (ADR-0013): the holder declares the seat from its
 *   `shell.overlay` registration, registers its own footer entry, and owns the
 *   modal shell, so this registration exists exactly when the holder is
 *   installed.
 * - `sidebar.right.tab.files.actions` — the legacy Files-tab compact entry. On
 *   surfaces that still declare it, the same panel body expands inline in the
 *   tab, which keeps the panel reachable without the holder.
 *
 * Everything the body needs arrives through services the composition already
 * provides — `slots` to contribute, `locale` for its copy, `connection` for the
 * channel to the host half, and (optionally) `uiWorkspace` for the composed
 * directory picker and the client Session Controller for the current session.
 *
 * `slots.inject` is the soft seam: a registration happens when the composition
 * declares the seat and never otherwise, so a runtime whose surfaces differ
 * simply shows no panel instead of failing the client graph. A seat that is
 * declared but refuses the registration is caught per seat: the worst case is
 * "this entry does not show", not a broken client half.
 *
 * The workspace-config holder is a **dev** dependency consumed with `import
 * type` only (D3): no runtime import, and no row in `dsh.client.inject`. The
 * seat literal is held locally and pinned to the holder's
 * `WorkspaceConfigSectionSeat`, so a typo is a type error while the holder's
 * components never reach this bundle.
 *
 * @module dsh-plugin-multi-root-workspace/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: the SlotMap merge this plugin registers against, plus the CLIENT
// faces that publish `ctx.slots` / `ctx.locale` / `ctx.connection` on the
// browser context.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
// Type-only: the seat contract (D-15 — the type authority now lives in
// `@dsh-plugins/contracts`). The named imports pin the local literal below and
// give the local `declare module` block its entry shape; neither reaches the
// bundle (D3).
import type { WorkspaceConfigSectionSeat, WorkspaceConfigSectionSlot } from '@dsh-plugins/contracts'
import { createElement } from 'react'
import { currentSessionIdOf } from '../compat/client-session.ts'
import { createPanelClient, type PanelClient } from './panel-client.ts'
import { NS, en, zh } from './locales.ts'
import { STYLES } from './styles.ts'
import {
  WorkspaceFoldersLauncher,
  WorkspaceFoldersSection,
  type Translate,
  type WorkspaceFoldersSectionInjected,
} from './WorkspaceFoldersAction.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'sidebar.right.tab.files.actions': {
      kind: 'list'
      scope: 'session'
      owner: { readonly absolutePath: string }
    }
    // The unified workspace-config dialog's section seat. The entry shape is the
    // single authority in `@dsh-plugins/contracts`; this one line is the local
    // augmentation (a dep-free type package cannot resolve the slots module).
    'workspace-config.section': WorkspaceConfigSectionSlot
  }
}

/** The cell this plugin owns (an id is unique per seat, so both seats reuse it). */
export const SLOT_ID = 'multi-root-folders'

/**
 * The section's row order in the unified dialog's navigation (D11: 10 / 20 / 30
 * across mrfw / session-tool-toggle / web-ux).
 */
const SECTION_ORDER = 10

/**
 * The unified dialog's section seat, held locally.
 *
 * The literal is pinned to the holder's `WorkspaceConfigSectionSeat`: writing
 * anything else is a compile error. The holder's runtime constant is
 * deliberately not imported (D3).
 */
const SECTION_SEAT: WorkspaceConfigSectionSeat = 'workspace-config.section'

/** The id of the `<style>` element carrying this plugin's sheet. */
const STYLE_ELEMENT_ID = 'multi-root-workspace-styles'

/** Services the client half needs before it may activate. */
export const inject = ['slots', 'locale', 'connection']

/**
 * Register the panel.
 * @param ctx - the client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'multi-root-workspace: dictionaries')

  // The panel's classes resolve against this sheet; removing it on unload keeps
  // a hot-unplugged plugin from leaving dead rules behind.
  ctx.effect(() => {
    let element = document.getElementById(STYLE_ELEMENT_ID)
    if (element === null) {
      element = document.createElement('style')
      element.id = STYLE_ELEMENT_ID
      element.textContent = STYLES
      document.head.append(element)
    }
    return () => { element?.remove() }
  }, 'multi-root-workspace: styles')

  // Cordis binds `this.ctx` to the *caller's* fiber for the registry methods, so
  // reading the injected services here keeps them owned by this plugin.
  const panel: PanelClient | undefined = (() => {
    const connection = ctx.get('connection')
    return connection === undefined ? undefined : createPanelClient(connection)
  })()
  const pickDirectory = async (): Promise<string | null> => {
    const workspace = readService<{ pickDirectory?: () => Promise<string | null> }>(ctx, 'uiWorkspace')
    if (workspace?.pickDirectory === undefined) return null
    return await workspace.pickDirectory()
  }
  // The selection field moved between supported releases; the probe lives in
  // compat so this entry never compares version strings.
  const sessionId = (): string | undefined => currentSessionIdOf(readService(ctx, 'sessions'))
  const t = ctx.locale.bind(NS) as unknown as Translate

  // The unified dialog's section (declared by the workspace-config holder). The
  // registration is soft and separately guarded: a missing seat means the
  // holder is not installed, while a refusing seat must not take the Files-tab
  // entry down with it.
  ctx.slots.inject(SECTION_SEAT, () => {
    try {
      return ctx.slots.register({
        name: SECTION_SEAT,
        id: SLOT_ID,
        order: SECTION_ORDER,
        // A thunk: the holder re-reads it per projection, so the label follows
        // the active locale without re-registering.
        label: () => t('section.label'),
        locale: NS,
        inject: (): WorkspaceFoldersSectionInjected => ({ panel, pickDirectory, sessionId }),
      }, WorkspaceFoldersSection)
    } catch (error) {
      ctx.logger?.warn('multi-root-workspace: 工作区配置分节座位注册失败，本节不显示')
      ctx.logger?.warn(error)
      return () => {}
    }
  })

  // Legacy Files-tab entry: old surfaces without the section seat (or without
  // the holder) can still open the same panel body inline in the tab.
  ctx.slots.inject('sidebar.right.tab.files.actions', () => ctx.slots.register({
    name: 'sidebar.right.tab.files.actions', id: SLOT_ID, order: 50,
  }, () => createElement(WorkspaceFoldersLauncher, { panel, pickDirectory, sessionId, t })))
}

/**
 * Read one optional service by name.
 *
 * Both lookups are deliberately untyped reads: the client Session Controller
 * and the workspace UI service are composed by the surface, not by this
 * plugin, and neither is a dependency it may assume (the panel body exists on
 * surfaces where they do not). Absence is a supported state — the panel then
 * shows "No active session" and does not ask the host to guess a workspace root.
 * @param ctx - the client context.
 * @param name - the service key to read.
 * @returns the service, or `undefined` when this composition has none.
 */
function readService<T>(ctx: ClientContext, name: string): T | undefined {
  const reader = ctx as unknown as { get(key: string): unknown }
  return reader.get(name) as T | undefined
}

export type { PanelClient, Translate }
