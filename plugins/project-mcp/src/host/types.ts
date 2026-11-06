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

// The three shapes below are kernel shapes (G4): one declaration shared with
// dsh-plugin-user-commands instead of a structural copy per package. `ScanIo`
// stays local — plain directory-entry names are this package's own port.
export type { WorkspaceRoots } from '@dsh-plugins/host-kit/attribution'
export type { MultiRootGrant } from '@dsh-plugins/host-kit/triggers'
export type { LogSink as ScanLog } from '@dsh-plugins/host-kit/log'

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
