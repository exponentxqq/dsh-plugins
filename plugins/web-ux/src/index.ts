/**
 * dsh-plugin-web-ux — host half entry (exports "."). The plugin body lives in
 * `./host/index.ts`; this module is the bundle entry so the built artifact
 * keeps the package's public shape (named `name` / `inject` / `apply`).
 *
 * Project-level MCP servers found under each registered workspace root's
 * `.dsh/mcp/` directory are loaded into the host process, and every agent gets
 * its tool surface restricted to the servers of its own workspace. The browser
 * half (exports "./client") is served by client-modules from the same
 * package's `dsh.client` declaration and only contributes the provider badge.
 * @module dsh-plugin-web-ux
 */

export { name, inject, apply } from './host/index.ts'
