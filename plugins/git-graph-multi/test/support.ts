/**
 * Shared host test fixtures. FROZEN for the duration of the
 * add-git-graph-multi-repo change: several teammates write tests against it
 * at once, so add new helpers inside your own `*.test.ts` file instead of
 * editing this module (ask the Lead when a helper genuinely belongs here).
 *
 * The fixtures are deliberately filesystem-only: the repo scan never runs
 * git (it looks for a `.git` entry), so plain directories are enough, and the
 * gate/service tests drive a scripted runner instead of a real repository.
 * @module dsh-git-graph-multi/test/support
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { GitRunResult, GitRunner } from '../src/host/git-runner.ts'

/** Create a throwaway directory; remove it with {@link cleanup} when done. */
export async function tempDir(prefix = 'ggm-test-'): Promise<string> {
  return await mkdtemp(path.join(tmpdir(), prefix))
}

/**
 * Create directories under `root`. A relative path ending in `.git` is created
 * as an empty marker file when `file` is true, so both the directory form and
 * the worktree/submodule pointer form of a repository can be staged.
 * @param root - the fixture root.
 * @param relativePaths - directories (or `.git` marker files) to create.
 */
export async function makeDirs(root: string, relativePaths: readonly string[]): Promise<void> {
  for (const relative of relativePaths) {
    const target = path.join(root, relative)
    if (relative.endsWith('.git')) {
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, 'gitdir: fixture\n', 'utf8')
      continue
    }
    await mkdir(target, { recursive: true })
  }
}

/** Remove a fixture root (ignore a missing one). */
export async function cleanup(root: string): Promise<void> {
  await rm(root, { recursive: true, force: true })
}

/** One scripted answer: partial results default to a successful empty run. */
export type ScriptedAnswers = Record<string, Partial<GitRunResult>>

/** Build the scripted-runner key for one invocation. */
export function runnerKey(cwd: string, argv: readonly string[]): string {
  return `${cwd}|${argv.join(' ')}`
}

/**
 * A runner answering from a table keyed by `${cwd}|${argv.join(' ')}`. An
 * unscripted invocation returns `{ exitCode: 1 }` with empty output unless a
 * `fallback` is supplied, so an unexpected git call is loud rather than silent.
 * @param answers - the scripted table.
 * @param fallback - result for unscripted invocations.
 */
export function scriptedRunner(answers: ScriptedAnswers, fallback?: Partial<GitRunResult>): GitRunner {
  return {
    async run(argv, cwd) {
      const answer = answers[runnerKey(cwd, argv)] ?? fallback ?? { exitCode: 1 }
      return {
        exitCode: answer.exitCode === undefined ? 0 : answer.exitCode,
        stdout: answer.stdout ?? '',
        stderr: answer.stderr ?? '',
      }
    },
  }
}
