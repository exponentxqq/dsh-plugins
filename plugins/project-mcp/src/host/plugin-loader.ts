/**
 * The real {@link ServerLoader}: the official MCP client bridge, loaded at
 * runtime and mounted once per configured server.
 *
 * The client is NOT bundled with this plugin. Bundling would freeze one copy
 * of `@deepseek-ai/dsh-mcp-client` inside this artifact and let it drift from
 * the runtime it is talking to; importing it here always yields the version
 * the running dsh ships.
 *
 * The import base matters for more than resolution: the profile's own MCP rows
 * are imported against the profile directory, so resolving this module from
 * the same base yields the SAME module instance they use. That shared instance
 * is what makes a `serverName` collision with a profile-level server visible —
 * the client rejects the second claimant instead of both living happily in
 * separate copies of its namespace bookkeeping.
 * @module dsh-plugin-project-mcp/host/plugin-loader
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ServerLoader } from './mcp-manager.ts'
import type { ScannedServer } from './types.ts'

/**
 * The slice of the running Loader this module uses. Declared locally because
 * this package does not depend on `@deepseek-ai/cordis-plugin-loader`, the
 * package that owns the `ctx.loader` declaration — the running host provides
 * the service either way (the same reasoning as git-graph-multi's event
 * declaration).
 *
 * `unwrapExports` is typed as returning `any` on purpose: the module comes
 * from the running installation at an unknown version, and `ctx.plugin`
 * validates its shape (missing `apply` fails loudly at load time).
 */
export interface PluginLoaderService {
  /**
   * Import one module against a base URL.
   * @param specifier - the module id.
   * @param parentURL - the base URL used to resolve it.
   * @param importAttributes - import attributes (none are used here).
   * @returns the module namespace.
   */
  import(specifier: string, parentURL: string, importAttributes: Record<string, string>): Promise<unknown>
  /**
   * Normalize ESM/CJS/default export shapes before applying a plugin.
   * @param exports - the raw module namespace.
   * @returns the plugin shape `ctx.plugin` accepts.
   */
  unwrapExports(exports: unknown): any
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The plugin loader service (see {@link PluginLoaderService}). */
    loader: PluginLoaderService
  }
}

/** The module id of the official MCP client bridge plugin. */
export const MCP_CLIENT_MODULE = '@deepseek-ai/dsh-mcp-client'

/**
 * Build the host-side server loader.
 *
 * Loading is `ctx.plugin` under the hood, so the returned disposer is the
 * child fiber's own disposal: MCP disconnects, tool deregistration, and the
 * release of the reserved `serverName` all follow from it.
 * @param ctx - the host context carrying the loader.
 * @returns the loader the manager drives.
 */
export function createServerLoader(ctx: Context): ServerLoader {
  let client: Promise<unknown> | undefined

  /**
   * The import bases to try, in order of preference.
   *
   * The profile-level rows resolve against the profile directory, so trying
   * that base first makes the profile's own rows and this loader share one
   * module instance. The plugin's own directory and URL are the fallbacks that
   * keep a `link:` or git install working when the profile base cannot see the
   * package. Bases are deduplicated, and a failing base is not cached.
   * @returns the candidate bases.
   */
  function importBases(): readonly string[] {
    const candidates = [ctx.root?.baseUrl, ctx.baseUrl, import.meta.url]
    const bases: string[] = []
    for (const candidate of candidates) {
      if (candidate !== undefined && candidate !== '' && !bases.includes(candidate)) bases.push(candidate)
    }
    return bases
  }

  /**
   * Import the MCP client once and reuse the module for every server.
   * @returns the resolved module namespace.
   */
  function loadClient(): Promise<unknown> {
    const cached = client
    if (cached !== undefined) return cached
    const attempt = async (): Promise<unknown> => {
      const failures: string[] = []
      for (const base of importBases()) {
        try {
          return await ctx.loader.import(MCP_CLIENT_MODULE, base, {})
        } catch (error) {
          failures.push(`${base}: ${String(error)}`)
        }
      }
      throw new Error(`cannot import ${MCP_CLIENT_MODULE} (tried ${failures.join(' | ')})`)
    }
    // A failed import must not be cached: a later reconcile may run after the
    // cause (a half-written install, for instance) is gone.
    const guarded = attempt().catch((error: unknown) => {
      if (client === guarded) client = undefined
      throw error
    })
    client = guarded
    return guarded
  }

  return {
    async load(server: ScannedServer): Promise<() => Promise<void>> {
      const plugin = ctx.loader.unwrapExports(await loadClient())
      // Awaiting the fiber settles once the client connected and its tools are
      // registered — a startup failure rejects here instead of surfacing as a
      // half-loaded server with no tools.
      const fiber = ctx.plugin(plugin, server.config)
      await fiber
      return () => fiber.dispose()
    },
  }
}
