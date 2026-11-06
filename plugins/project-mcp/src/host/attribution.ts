/**
 * Session-to-workspace attribution: thin re-export (G4).
 *
 * Rules, the #3 ruling and the atomic index live in
 * `@dsh-plugins/host-kit/attribution`. The package policy stays **fail
 * closed**: take the walk-up `hit` verbatim (null on a miss, no degraded key).
 * @module dsh-plugin-project-mcp/host/attribution
 */

export { RootAttributor, RootAttributor as Attributor } from '@dsh-plugins/host-kit/attribution'
export type { Attribution, RealpathPort as RealpathIo } from '@dsh-plugins/host-kit/attribution'
