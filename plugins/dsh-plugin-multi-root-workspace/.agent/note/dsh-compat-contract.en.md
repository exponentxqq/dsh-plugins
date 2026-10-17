# The DSH compatibility contract: what an Agent needs to know first

中文：[dsh-compat-contract.md](./dsh-compat-contract.md)

This note records the compatibility machinery you must understand **before changing this repository**, because it is easy to trip over. The reasoning lives in [ADR-0009](../../docs/decisions/ADR-0009-dsh-compat-contract.md) and the operator-facing diagnosis in [the troubleshooting entry](../../docs/troubleshooting/unsupported-dsh-release.md). This note only covers what you, as an Agent, will run into.

## 1. One source of truth for the support matrix

```text
src/compat/dsh-version.ts  →  SUPPORTED_DSH_RELEASES
```

It is an array of **exact versions**, not a semver range. Currently:

```ts
export const SUPPORTED_DSH_RELEASES = ['0.1.5-rc.2', '0.1.6-alpha.1', '0.1.6-alpha.2', '0.1.7-alpha.1', '0.1.7-alpha.2', '0.1.7-rc.1', '0.1.7-rc.2', '0.2.0-rc.1', '0.2.0-rc.2', '0.2.1-rc.2'] as const
```

When you change it, these four must agree or `pnpm compat:check` fails:

```text
src/compat/dsh-version.ts   SUPPORTED_DSH_RELEASES   the allowlist
package.json                peerDependencies         "0.1.5-rc.2 || 0.1.6-alpha.1 || 0.1.6-alpha.2 || 0.1.7-alpha.1 || 0.1.7-alpha.2 || 0.1.7-rc.1 || 0.1.7-rc.2 || 0.2.0-rc.1 || 0.2.0-rc.2 || 0.2.1-rc.2"
package.json                devDependencies          one entry of the allowlist (currently 0.2.1-rc.2)
node_modules                resolved versions        one entry of the allowlist
```

`scripts/check-dsh-compat.mjs` reads that array out of the TypeScript source as **text**, not by importing it. So: **do not rewrite it into anything other than an `export const NAME = [...]` literal** (assembled from elsewhere, wrapped in an expression other than the type assertion, and so on) — the static checker throws outright. The reason is that this check must run before `pnpm build`, on a clean checkout with no `lib/`.

## 2. Your tests may fail because of the gate — and that is correct

`multi-root-compat` is the first row in the patch, and these four inject it:

```text
multi-root-fs
multi-root-sandbox
multi-root-registry
multi-root-instructions
multi-root-lsp
multi-root-workspace-files
```

Cordis will not start a row whose injected service is absent. So before mounting any of those providers in a test you must first:

```ts
import { mountCompat } from './support/compat.ts'

await mountCompat(ctx)
```

Otherwise `ctx.get('fs')` / `ctx.get('sandbox')` are `undefined` and you will see errors like `Cannot read properties of undefined (reading 'confine')`. That is not a bug; it is the gate working (`tests/compat.spec.ts` asserts this behavior explicitly).

`mountCompat` mounts the **real** compat row, gate policy included. So the whole unit suite fails outright on a release that is not on the allowlist — deliberately; see point 5.

## 3. `confine` is synchronous on one release and asynchronous on another

```text
0.1.5-rc.2     confine(argv, policy): ConfinedArgv
0.1.6-alpha.1  confine(argv, policy, signal?): Promise<ConfinedArgv>
0.1.6-alpha.2  same `confine` shape as 0.1.6-alpha.1 (measured 2026-09-22). The session catalog is a different shape; see the next section.
0.1.7-alpha.1  same `confine` shape as 0.1.6-alpha.1 (measured 2026-09-22; other shapes on this release did change, see §4)
0.1.7-alpha.2  same shape as 0.1.7-alpha.1 (measured 2026-09-24)
0.1.7-rc.1     same shape as 0.1.7-alpha.1 (measured 2026-09-24). This release adds an install-time peer gate; see the end of §4
0.1.7-rc.2     same shape as 0.1.7-rc.1 (measured 2026-09-25 against the tags). cordis stays `~4.0.4`
```

**Do not** hand-write a signature in `src/sandbox.ts` that suits one release. Go through `widenConfined()` in `src/compat/sandbox-confine.ts`, which **preserves the shape**: a synchronous base result stays synchronous, a promise stays a promise.

Never "just wrap everything in a promise". On `0.1.5-rc.2` that would turn `ctx.sandbox.confine()` into a thenable for every caller in the composition — the bash executor, the PTY backend — which means the plugin introducing a breaking change of its own.

When reading the result in tests and smokes:

- unit tests use `confined(provider, argv, policy)` from `tests/support/confine.ts`;
- smoke scripts always `await ctx.sandbox.confine(...)`.

**This is a quiet trap**: awaiting a plain value is a no-op, but reading `.argv` off a promise yields `undefined`, and the resulting `Cannot read properties of undefined (reading 'some')` looks nothing like a version problem.

## 4. Upstream API changes may only branch inside `src/compat/`, and only structurally

Business code contains no version checks. The adapters today:

| File | Difference it absorbs |
| --- | --- |
| `src/compat/sandbox-confine.ts` | `confine`'s sync/async shape and arity |
| `src/compat/agent-instructions.ts` | the renderer rename: `renderWorkspaceContext` (0.1.5) → `renderAgentInstructions` (0.1.6; unchanged on 0.1.7) |
| `src/compat/client-session.ts` | current session: `list.current` (0.1.5 / 0.1.6-alpha.1) → catalog row `retainedBy.mainView > 0` (0.1.6-alpha.2 and 0.1.7-alpha.1 through 0.1.7-rc.2; 0.1.7 moved other catalog fields, not this predicate) |
| `src/compat/llm-message.ts` | through session format 3, emit `{ kind: 'plugin', plugin, form: 'instructions' }`; format 4 (`SESSION_FORMAT_VERSION` on `0.1.7`) rejects `kind: 'plugin'` and the adapter emits `{ kind: 'multi-root-workspace', plugin, form: 'instructions' }`. Probe the format constant the session package exports, **not** the renderer name — 0.1.6 already renamed the renderer and still accepts `plugin`. Do not use `agent-instructions`: upstream treats that kind's `changes` array as its own reconciliation authority |
| `src/compat/tool-result.ts` | the failure bit is `content[0].isError` on 0.1.5/0.1.6 and `isError` on the message itself on 0.1.7. `event.data.error` still exists on both |
| `src/compat/client-icons.ts` | panel icons: pixel names on 0.1.5/0.1.6 (`IconFolderClose16`), weight names on 0.1.7. Upstream UI uses Regular, not Medium. Prefer the pixel name, then Regular |
| `scripts/lib/profile-boot.mjs` | call `healProfilesModuleFallback` when it is a function; otherwise `createRuntimeResolution`, then `hostCtx.plugin(PluginPackages, { resolution })` inside `boot`'s prepare. 0.1.7 no longer exports heal |
| `scripts/lib/shell-exec.mjs` | use `shell.run` when it exists; otherwise `shell.execute(spec)` then `execution.result()`. 0.1.7 renamed `SandboxBashExecutor.run` to `execute` |

Always probe **structurally** (is the value a thenable, which export name exists, does the snapshot carry `current`) rather than comparing version strings. Upstream is pre-stable and reshapes things within a release; a structural probe copes with that, a version comparison does not.

`0.1.7-alpha.2`, `0.1.7-rc.1`, and `0.1.7-rc.2` keep every shape in the table above relative to `0.1.7-alpha.1` (measured 2026-09-24 against `alpha.1` / `alpha.2` / `rc.1`, and 2026-09-25 against `rc.1` → `rc.2`). `rc.1` adds an **install-time** gate that does not live in `src/compat/`: `dsh plugin add` and `loadProfile` run `semver.satisfies(runtime, peerRange, { includePrerelease: true })` on every `@deepseek-ai/dsh*` peer, and refuse the install or skip the bundle when it fails. Promoting a `0.1.7-rc.1`-or-later release therefore has to widen `peerDependencies` in the same change, or the smoke's `dsh plugin add` fails before this plugin's runtime gate runs. `DSH_MULTI_ROOT_COMPAT=warn` does not relax that gate.

**This is a quiet trap**: `0.1.6-alpha.2`'s host matrix (`confine`, the instruction renderer, the journey Messages endpoint) matches alpha.1, so it was promoted with "no adapter change". The client Session Controller still dropped `SessionListState.current` in `6830e1460d` and moved navigation onto the main view's `retain(..., { source: 'mainView' })`. A panel that still reads `list.current` then shows "No active session" for an open conversation and **does not call the host**.

Probe order: a non-empty `current` wins (the old shape), otherwise the first catalog row whose `retainedBy.mainView` is a positive number. A populated catalog with nobody retained returns `undefined` — **never** fall back to `ids[0]`, which would act on a session the operator is not looking at. `getSnapshot` must be invoked as a method; extracting the function drops the store's `this`.

`agent-instructions` is an **optional peer**: a minimal composition legitimately has neither it nor an agent. `instructionsApi()` returns `undefined` when the package is absent (contributing nothing), but **throws** when the package is present and carries neither renderer name — that is a compatibility break to fix, not an optional seam.

`@deepseek-ai/dsh-llm` is **also an optional peer, and it may only be loaded on demand**: the barrel (`src/index.ts`) is precisely the module the carrier loader row mounts, so its load-time dependency set must equal the required-package set, and any static value import would make a minimal composition — one that never builds a message at all — fail to load. Message construction goes through `createInstructionMessage()` in `src/compat/llm-message.ts`, which reaches `await import('@deepseek-ai/dsh-llm')` at the moment a message is actually built. `tests/optional-peers.spec.ts` pins this: loading `src/index.ts` and `src/instructions.ts` does not resolve the package.

`instructionsApi()` must also keep **"the package is absent"** and **"the package is present but fails to evaluate"** apart: `isPackageInstalled()` probes installation separately (`createRequire(import.meta.url).resolve`, the same pattern as `readInstalledVersion`), and only `MODULE_NOT_FOUND` / `ERR_MODULE_NOT_FOUND` counts as absence. Every other failure — a missing transitive dependency making the `import()` throw, say — must propagate rather than being cached as `undefined`, which would silently stop the whole process from delivering additional-root instructions.

## 5. `DSH_MULTI_ROOT_COMPAT=warn` is not a debugging switch for you

It exists for the upgrade lane only: to let the full matrix run against a release that is not on the allowlist yet.

It relaxes exactly **one** verdict: `unsupported` (a coherent tree on a release the allowlist simply has not named yet — the only shape the upgrade lane probes). `mixed` and `incomplete` are refused under **both** `enforce` and `warn`.

If the gate refuses locally, **do not** use it to carry on developing. The right move is to check whether your host / `node_modules` really is on the allowlist (`pnpm compat:check`). Use it only when you are genuinely promoting a new upstream release; that process is written down in [the troubleshooting entry](../../docs/troubleshooting/unsupported-dsh-release.md).

The local upgrade tool (`pnpm dsh:upgrade`, backed by the root `scripts/upgrade-dsh.mjs`) sets it during its probe flow; everyday gates do not.

## 6. The upgrade flow never widens the support matrix

The upgrade probe (now the root `pnpm dsh:upgrade`; the upstream weekly lane was removed) neither commits nor pushes, and does not touch `SUPPORTED_DSH_RELEASES`. A green run is **evidence**, not authorization. Promotion is a human act.

`compat:check` does **not** run inside the upgrade probe: the candidate is by design not on the allowlist. After promotion and before release, the root `pnpm dsh:check` and an enforce-mode `verify:all` guard the result.

For upgrading and probing:

```bash
pnpm dsh:upgrade 0.2.1-rc.2 --probe     # repoint pin / soft ranges / allowances, add probe overrides
pnpm dsh:upgrade --latest-prerelease --probe   # pin the newest pre-release
pnpm dsh:upgrade --print-latest-prerelease
pnpm dsh:upgrade --print-installed      # what each plugin actually resolved
pnpm install --no-frozen-lockfile --config.minimumReleaseAge=0
# Inside the container, set warn on the inner command; host env vars are not forwarded into docker:
docker-run node 'DSH_MULTI_ROOT_COMPAT=warn pnpm --filter dsh-plugin-multi-root-workspace verify:all'
pnpm dsh:upgrade 0.2.1-rc.2             # remove the probe overrides
pnpm install --frozen-lockfile
```

Installing a candidate **requires** `--config.minimumReleaseAge=0`. Without it pnpm's release-age gate rejects the lockfile. After the probe, the root `pnpm dsh:check` compares `minimumReleaseAgeExclude` with the exact lockfile resolution set; fix the missing/stale entries it lists.

`0.2.1-rc.2`'s `dsh` depends on cordis `~4.0.5` and exact-pins every internal package to `0.2.1-rc.2`; `upgrade-dsh.mjs` repoints the cordis dev pin and its allowance line to `4.0.5`. The probe also surfaced a cross-version constraint: multi-root's production `zod` dependency must align with `@deepseek-ai/dsh-storage-domain`'s exact `zod@4.4.3`, or `defineDomain`'s types and runtime both fork (`^4.6.2` installs a second zod copy).

Two traps that only bite locally (CI always starts from a clean checkout):

- A `git checkout --` of the four manifests / workspace / lockfile / baseline file discards uncommitted edits with them; commit or stash first. The current flow does not need that revert: rerunning without `--probe` only removes the overrides.
- After a candidate install, pnpm's **pre-run dependency check** still runs a `pnpm install` against the release-age policy. Once the allowances exactly match the lockfile (`pnpm dsh:check`), that check passes. If you see `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` before reconciling, fix the allowances rather than bypassing the policy.

## 7. The journey smoke's model endpoint speaks both wire dialects

`0.1.6-alpha.1` switched the default LLM protocol from chat completions to Messages:

```text
0.1.5-rc.2     POST {base}/chat/completions    choices[].delta, finish_reason
0.1.6-alpha.1  POST {base}/v1/messages         message_start / content_block_* / message_delta / message_stop
0.1.6-alpha.2  same dialect as 0.1.6-alpha.1 (journey 55/55, endpoint unchanged)
0.1.7-alpha.1  same dialect as 0.1.6-alpha.1 (journey 55/55, still `POST /v1/messages`)
0.1.7-alpha.2  same dialect as 0.1.7-alpha.1 (journey 55/55)
0.1.7-rc.1     same dialect as 0.1.7-alpha.1 (journey 55/55)
0.1.7-rc.2     same dialect as 0.1.7-rc.1 (`/v1/messages` is unchanged; a route that does not declare `toolUpdate` strips developer messages)
```

That change does not pass through plugin code, but it breaks the scripted endpoint in `scripts/smoke-journey.mjs`. The endpoint now picks its dialect **by request path**, built by `chatCompletionFrames()` and `messagesFrames()` respectively.

The same place holds a trap already stepped in once: **do not classify which request is an agent step by whether the body contains the title prompt**. Some releases send the whole session log with every request, so every request is classified as a title, the agent runs no steps at all, and the smoke reports two dozen downstream failures like "the model never saw the additional root". The discriminator is now **whether the request offers tools**.

To inspect what the model actually received:

```bash
DSH_SMOKE_KEEP=1 pnpm smoke:journey
# then read .dsh-smoke/journey-<pid>/model-requests.json
```

## 8. One command for the whole matrix

```bash
pnpm verify:all   # lint → typecheck → build → test → kernel:probe → smoke
```

It **deliberately excludes** `compat:check`, because the upgrade lane runs it against an unlisted release. The main CI lane runs `compat:check` separately, before lint.

## 9. DSH 0.2 and the new development baseline

The development pin is `0.2.1-rc.2`, with cordis `4.0.5`; the baseline constant lives in the root `scripts/dsh-baseline.mjs`. Restoring the baseline no longer means restoring `0.1.5-rc.2` / `4.0.2`; the earlier probes are historical records. Treat the four manifests, the workspace file, the lockfile, and the baseline file separately when recovering from a probe, and never discard uncommitted support declarations by restoring HEAD.

`0.2.0-rc.1` and `rc.2` retain the seams handled by the existing adapters. The 0.2 agent loop records conservative failure `tool/result` events before closing a failed step: `message.isError: true`, plain-text content, and `data.error`. These must never count as successful file touches. `tests/instructions.spec.ts` covers old block-level failures, message-level failures, and recovery events. The inherited Windows provider softly registers the new ACL diagnosis skill; this plugin still does not promise Windows kernel multi-root grants.

`0.2.1-rc.2` added no new adapter branch: `dsh-fs` / `dsh-sandbox` / `dsh-sandbox-local` types are unchanged, session format is still 4, and `HostConnectionRpc.handle`, the slots in use, and the primitives exports all remain. The real work was the dependency tree: every internal package is exact-pinned, `zod` must align on `4.4.3`, and `dsh-invariants` is no longer published on this line (which is why the git-graph plugin was removed entirely). The `pnpm-workspace.yaml` allowances are kept exactly equal to the lockfile by `pnpm dsh:check`.

The root `scripts/check-dsh-baseline.mjs` (`pnpm dsh:check`) guards the baseline constant, the four plugins' dev pins, the three soft plugins' unified range, multi-root's `compat:check`, the installed tree, and the allowances before a release; `scripts/release.mjs` runs it as a precondition. The candidate-repoint script's overrides block still belongs to the probe only; rerunning without `--probe` removes it.

On Windows, Node cannot start `npm.cmd` with `execFileSync('npm')`; old-version matrix jobs fail before repointing with `spawnSync npm ENOENT`. The upgrade script uses `scripts/lib/npm-cli.mjs`: Windows runs the installation’s `node_modules/npm/bin/npm-cli.js` through the current Node executable, while POSIX still executes npm directly. No shell command is assembled; regression tests cover paths with spaces and argument boundaries.

## 10. New B1–B3 seams

LSP and workspace-files wrap public methods; unloading must restore original property descriptors. Do not compare Cordis proxy function references. `src/compat/workspace-files.ts` adapts old `changes(scope, signal)` and new `changes(scope, path, signal)` by arity. The Windows runner for a populated scope must use a SID for the entire root set: granting additional roots to the primary SID would retain write access after removal. Optional peers participate in mixed-tree checks and must stay out of carrier-barrel static imports. See [ADR-0011](../../docs/decisions/ADR-0011-multi-root-workspace-consumers.md) for the decision.
