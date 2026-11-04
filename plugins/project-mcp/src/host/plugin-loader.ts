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
 *
 * Two facts of the running stack shape the loading strategy:
 *
 * 1. `ctx.loader.import(specifier, parentURL, attrs)` on
 *    cordis-plugin-loader 1.0.x IGNORES `parentURL` — it resolves every
 *    specifier against the loader context's own base (the profile directory).
 *    The underlying `ctx.loader.internal.import` is the real three-argument
 *    channel that honors the base, so it is preferred whenever present.
 * 2. Since dsh resolves the official bundles from the dsh installation itself,
 *    a profile tree may carry no `@deepseek-ai/*` package at all. The
 *    `pluginPackages` service (dsh-app-boot) exposes the very resolution table
 *    the profile rows use, including the installation-scope copy of the MCP
 *    client; the dsh host entry directory is the structural last resort.
 *
 * @module dsh-plugin-project-mcp/host/plugin-loader
 */

import { realpathSync } from 'node:fs'
import { dirname } from 'node:path'
import { pathToFileURL } from 'node:url'

import type { Context } from '@deepseek-ai/cordis'
import type { ServerLoader } from './mcp-manager.ts'
import type { ScannedServer } from './types.ts'

/**
 * The underlying import channel of cordis-plugin-loader, which — unlike the
 * public `import` — resolves the specifier against the given base URL.
 */
export interface LoaderInternalService {
  /**
   * Import one module against a base URL.
   * @param specifier - the module id.
   * @param parentURL - the base URL used to resolve it.
   * @param importAttributes - import attributes (none are used here).
   * @returns the module namespace.
   */
  import(specifier: string, parentURL: string, importAttributes: Record<string, string>): Promise<unknown>
}

/**
 * The slice of the running Loader this module uses. Declared locally because
 * this package does not depend on `@deepseek-ai/cordis-plugin-loader`, the
 * package that owns the `ctx.loader` declaration — the running host provides
 * the service either way (the same reasoning as the other host-only plugins'
 * service declarations).
 *
 * `unwrapExports` is typed as returning `any` on purpose: the module comes
 * from the running installation at an unknown version, and `ctx.plugin`
 * validates its shape (missing `apply` fails loudly at load time).
 *
 * `internal` is optional: it is the real three-argument channel this loader
 * prefers, but a future cordis-plugin-loader may rename or remove it, in which
 * case the public `import` stays as the compatibility path.
 */
export interface PluginLoaderService {
  /**
   * Import one module against a base URL.
   *
   * NOTE: cordis-plugin-loader 1.0.x ignores `parentURL` here and resolves
   * against the loader context's own base; callers that need the base honored
   * must use {@link LoaderInternalService.import} via `internal`.
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
  /** The base-honoring import channel, when the running loader exposes it. */
  readonly internal?: LoaderInternalService
}

/** The slice of the `pluginPackages` service (dsh-app-boot) used here. */
export interface PluginPackagesLike {
  /**
   * Locate a package the way the running profile resolves it, interception
   * routing included (this is how an installation-scope copy is found from a
   * profile-relative base).
   * @param specifier - the module specifier to locate.
   * @param parentURL - the base URL whose Node lookup order applies.
   * @returns the parsed package, or `undefined` when nothing owns the request.
   */
  packageOf?(specifier: string, parentURL: string): { readonly dir?: string } | undefined
  /** The frozen name → resolution table the profile rows resolve through. */
  readonly resolution?: {
    readonly entries?: Readonly<Record<string, { readonly packageDir?: string }>>
  }
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
 * Derive the directory URL the running dsh host's entry script lives in.
 *
 * The host starts as `node /usr/local/bin/dsh web …` (or an equivalent bin),
 * where the argv entry is usually a symlink into the installed `dsh` package
 * (`…/@deepseek-ai/dsh/lib/bin.js`). Resolving that symlink and taking the
 * directory yields a base from which the `@deepseek-ai/*` packages the running
 * dsh ships — including {@link MCP_CLIENT_MODULE} — are resolvable, even when
 * the profile tree itself carries none of them.
 *
 * This is a fallback base: the running dsh always ships the client next to its
 * entry script, and resolving from there yields the same instance the
 * profile-level MCP rows use.
 * @returns the directory URL, or `undefined` when it cannot be derived.
 */
export function hostEntryBaseUrl(): string | undefined {
  return entryBaseUrl(process.argv[1])
}

/**
 * Resolve one explicit entry path to the directory URL it lives in.
 * @param entry - the host entry path to resolve.
 * @returns the directory URL, or `undefined` when it cannot be derived.
 */
export function entryBaseUrl(entry: string | undefined): string | undefined {
  if (entry === undefined || entry === '') return undefined
  try {
    return pathToFileURL(dirname(realpathSync(entry))).href
  } catch {
    return undefined
  }
}

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
   * The base URL of the installation-scope copy of the MCP client, as known to
   * the official `pluginPackages` service — the same resolution the
   * profile-level MCP rows go through.
   *
   * `packageOf` is preferred: it consults the running interception routing, so
   * it also answers when the interception is what makes the copy visible. The
   * frozen `resolution.entries` table is the fallback shape.
   * @returns the parent-directory URL of the package, or `undefined`.
   */
  function installationBase(): string | undefined {
    try {
      const packages = ctx.get('pluginPackages') as PluginPackagesLike | undefined
      if (packages === undefined) return undefined
      const parentBase = ctx.baseUrl ?? ctx.root?.baseUrl ?? import.meta.url
      const packageDir = packages.packageOf?.(MCP_CLIENT_MODULE, parentBase)?.dir
        ?? packages.resolution?.entries?.[MCP_CLIENT_MODULE]?.packageDir
      if (packageDir === undefined || packageDir === '') return undefined
      return pathToFileURL(dirname(realpathSync(packageDir))).href
    } catch {
      return undefined
    }
  }

  /**
   * The import bases to try, in order of preference.
   *
   * The profile-level rows resolve against the profile directory, so trying
   * that base first makes the profile's own rows and this loader share one
   * module instance. The plugin's own directory and URL are the fallbacks that
   * keep a `link:` or git install working when the profile base can see the
   * package. The `pluginPackages` installation base names the exact copy the
   * official rows use, and the host entry base is the structural last resort
   * for hosts without the service. Bases are deduplicated, and a failing base
   * is not cached.
   * @returns the candidate bases.
   */
  function importBases(): readonly string[] {
    const candidates = [ctx.root?.baseUrl, ctx.baseUrl, import.meta.url, installationBase(), hostEntryBaseUrl()]
    const bases: string[] = []
    for (const candidate of candidates) {
      if (candidate !== undefined && candidate !== '' && !bases.includes(candidate)) bases.push(candidate)
    }
    return bases
  }

  /**
   * Import the MCP client against one base URL.
   *
   * The loader's `internal` channel is preferred because it honors the base;
   * the public `import` (which may resolve against its own base regardless of
   * the argument) is the compatibility path.
   * @param base - the base URL to resolve against.
   * @returns the module namespace.
   */
  async function importThrough(base: string): Promise<unknown> {
    const internal = ctx.loader.internal
    if (internal !== undefined) {
      try {
        return await internal.import(MCP_CLIENT_MODULE, base, {})
      } catch (error) {
        throw new Error(`internal.import at ${base}: ${String(error)}`)
      }
    }
    try {
      return await ctx.loader.import(MCP_CLIENT_MODULE, base, {})
    } catch (error) {
      throw new Error(`loader.import at ${base}: ${String(error)}`)
    }
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
          return await importThrough(base)
        } catch (error) {
          failures.push(error instanceof Error ? error.message : String(error))
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
