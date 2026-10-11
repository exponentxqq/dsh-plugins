/**
 * Shared seams for the host half's scan pipeline.
 *
 * The scanner is written against these narrow interfaces — never against
 * `node:fs` or the console — so every discovery, parsing, arbitration, and
 * attribution rule is exercisable in a unit test with a fake directory tree.
 * @module dsh-plugin-project-mcp/host/types
 */

/** Filesystem seam: the only directory and file reads the scanner performs. */
export interface ScanIo {
  /**
   * List one directory's entries.
   * @param dir - absolute directory path.
   * @returns entry names (files and subdirectories alike).
   * @throws when the directory does not exist or cannot be read.
   */
  readDir(dir: string): Promise<readonly string[]>
  /**
   * Read one configuration file.
   * @param file - absolute file path.
   * @returns the file's UTF-8 text.
   * @throws when the file cannot be read.
   */
  readFile(file: string): Promise<string>
}

/** Logging seam: host diagnostics without a hard dependency on any logger. */
export interface ScanLog {
  /**
   * Record a state change worth seeing in the process log.
   * @param message - the diagnostic text.
   */
  info(message: string): void
  /**
   * Record a degraded-but-continuing condition.
   * @param message - the diagnostic text.
   */
  warn(message: string): void
  /**
   * Record a skipped configuration or a failed server.
   * @param message - the diagnostic text.
   */
  error(message: string): void
}

/**
 * The additional-root enumerator this plugin soft-depends on (provided by
 * dsh-plugin-multi-root-workspace). Absent — that plugin is not installed or
 * not active — the scan simply sees each workspace's primary root alone.
 */
export interface MultiRootGrant {
  /**
   * The canonical paths of every usable root granted to one primary root.
   * @param primaryRoot - the session workspace root (any spelling).
   * @returns the granted roots, in registry order.
   */
  granted(primaryRoot: string): readonly string[]
  /**
   * Observe registry changes.
   * @param listener - called with the canonical primary root after each durable change.
   * @returns the disposer that stops observing.
   */
  onChange(listener: (primaryRoot: string) => void): () => void
}

/** One workspace's ordered root set. */
export interface WorkspaceRoots {
  /** The registered primary root (canonical), i.e. the workspace entity's path. */
  readonly primaryRoot: string
  /** The primary root first, then the roots granted to it, in grant order. */
  readonly roots: readonly string[]
}

/** Where one discovered server configuration came from. */
export interface ServerSource {
  /** The workspace the root belongs to (its canonical primary root). */
  readonly workspaceRoot: string
  /** The exact root directory holding the `.dsh/mcp/` directory. */
  readonly root: string
  /** The configuration file itself. */
  readonly file: string
}

/** One parsed, arbitration-winning server configuration ready to load. */
export interface ScannedServer {
  /** The reserved MCP namespace, unique across the whole scan. */
  readonly serverName: string
  /** The environment-expanded mcp-client config (includes `serverName`). */
  readonly config: Readonly<Record<string, unknown>>
  /** The workspace, root, and file the configuration came from. */
  readonly source: ServerSource
}
