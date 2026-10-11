/**
 * Environment expansion for project MCP configuration values.
 *
 * A configuration file that names a secret keeps the secret out of the
 * repository: `${FIGMA_API_KEY}` is resolved against the dsh process
 * environment when the file is read, never stored. `:-` supplies a fallback
 * for an unset *or empty* variable, matching the shell's own reading of the
 * syntax; a bare reference with no fallback expands to the empty string and
 * warns, so a missing variable is visible in the log instead of silent.
 * @module dsh-plugin-web-ux/host/env-expand
 */

import type { ScanLog } from './types.ts'

/** One `${VAR}` or `${VAR:-default}` reference. */
const ENV_REFERENCE = /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g

/**
 * Expand every environment reference in one string.
 * @param value - the raw string from the configuration file.
 * @param env - the expansion scope (the dsh process environment).
 * @param log - sink for the missing-variable warning.
 * @returns the expanded string.
 */
export function expandEnv(value: string, env: Record<string, string | undefined>, log: ScanLog): string {
  return value.replace(ENV_REFERENCE, (match, name: string, fallback: string | undefined) => {
    const resolved = env[name]
    if (resolved !== undefined && resolved !== '') return resolved
    if (fallback !== undefined) return fallback
    log.warn(`environment variable ${name} is not set; ${match} expands to an empty string`)
    return ''
  })
}

/**
 * Expand every string leaf of a configuration value, preserving structure.
 * @param value - any parsed configuration value.
 * @param env - the expansion scope (the dsh process environment).
 * @param log - sink for missing-variable warnings.
 * @returns the same shape with every string leaf expanded.
 */
export function expandDeep(value: unknown, env: Record<string, string | undefined>, log: ScanLog): unknown {
  if (typeof value === 'string') return expandEnv(value, env, log)
  if (Array.isArray(value)) return value.map((item) => expandDeep(item, env, log))
  if (value !== null && typeof value === 'object') {
    const expanded: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) expanded[key] = expandDeep(item, env, log)
    return expanded
  }
  return value
}
