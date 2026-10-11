/**
 * dsh-plugin-web-ux — host-side carrier row (exports "."). The browser half
 * (exports "./client") is this package's actual payload: the provider badge in
 * the composer status row. The project-level MCP capability that used to live
 * here moved to the standalone `dsh-plugin-project-mcp` package
 * (change: split-project-mcp-plugin) so any profile can install it alone.
 *
 * This entry is kept as a deliberate NO-OP carrier: the web client-module scan
 * reads the `dsh.client` declaration from a BARE PACKAGE NAME row in the
 * profile roster, so the bundle patch must keep inserting this package by name
 * even though it contributes nothing on the host side.
 * @module dsh-plugin-web-ux
 */

/** Cordis plugin name used by loader diagnostics (the bundle's row id). */
export const name = 'web-ux'

/** The badge needs no host service — declared empty on purpose. */
export const inject: string[] = []

/** No-op host half: everything this plugin contributes runs in the browser. */
export function apply(): void {}
