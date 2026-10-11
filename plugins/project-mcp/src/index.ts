/**
 * dsh-plugin-project-mcp — host half entry (exports "."). The plugin body lives
 * in `./host/index.ts`; this module is the bundle entry so the built artifact
 * keeps the package's public shape (named `name` / `inject` / `apply`).
 *
 * Project-level MCP servers found under each registered workspace root's
 * `.dsh/mcp/` directory are loaded into the host process, and every agent gets
 * its tool surface restricted to the servers of its own workspace. The plugin
 * is host-only: it declares no `dsh.client` face and works on any profile. The
 * sibling browser-experience package (provider badge) ships as its own bundle.
 * @module dsh-plugin-project-mcp
 */

export { name, inject, apply } from './host/index.ts'
