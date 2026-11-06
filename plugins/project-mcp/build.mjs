/**
 * The MCP client (`@deepseek-ai/dsh-mcp-client`) is deliberately NOT bundled: the plugin imports it at runtime
 * through `ctx.loader.import`, so it always matches the installed dsh version instead of freezing a peer copy —
 * and, by resolving against the profile's own directory, it shares ONE module instance with the profile-level
 * MCP rows (which is what lets mcp-client itself reject a project server that collides with a profile server name).
 */
import { buildPlugin } from '@dsh-plugins/build-kit'

await buildPlugin({ root: import.meta.dirname, cjsRequireShim: true })
