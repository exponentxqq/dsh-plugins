# The DSH compatibility contract: what an Agent needs to know first

中文：[dsh-compat-contract.md](./dsh-compat-contract.md)

This note records the compatibility machinery you must understand **before changing this repository**, because it is easy to trip over. The reasoning lives in [ADR-0009](../../docs/decisions/ADR-0009-dsh-compat-contract.md) and the operator-facing diagnosis in [the troubleshooting entry](../../docs/troubleshooting/unsupported-dsh-release.md). This note only covers what you, as an Agent, will run into.

## 1. The supported range: a runtime copy plus a derived range

```text
scripts/dsh-baseline.mjs    →  DSH_BASELINE          (the repository baseline; authoritative)
src/compat/dsh-version.ts   →  DSH_BASELINE          (runtime copy; same value, a literal)
src/compat/dsh-version.ts   →  SUPPORTED_DSH_RANGE   (derived from the copy)
```

The supported surface is no longer a per-release list but a soft range — "the baseline's major.minor, at or above the baseline" — written `>=<baseline> <major>.<minor+1>.0`. The baseline is `0.2.2-rc.1` today and the derived range is `>=0.2.2-rc.1 <0.3.0`. A new prerelease on that minor line (say `0.2.3-alpha.1`) is admitted with no repository edit at all; anything below the baseline, or on the next minor (`0.3.0`, `0.3.0-alpha.1`), is refused.

Why a copy instead of reading the root file: `src/` must ship and load on its own, so the runtime cannot depend on a repository-root script. `pnpm dsh:upgrade`'s `repointRuntimeBaselines()` rewrites the copy in the **same batch** as the root baseline, and the four rows below pin it transitively. The range predicate is that module's own hand-written comparator (no `semver` dependency): the library's default prerelease rules would judge `0.2.3-alpha.1` out of range, while a plain numeric comparison would admit `0.3.0-alpha.1` — so the same-minor guard is separate.

When the baseline moves, these four rows must agree or `pnpm compat:check` fails:

```text
baseline → range   scripts/dsh-baseline.mjs (authoritative) → src/compat/dsh-version.ts (same-value copy) → SUPPORTED_DSH_RANGE (derived)   0.2.2-rc.1 → >=0.2.2-rc.1 <0.3.0
peers              package.json   peerDependencies       all 22 DSH entries carry the derived range (cordis is separate)
engines            package.json   dsh.engines.dsh        the derived range
installed          node_modules   resolved versions      a single release (the runtime gate judges whether it is in range)
```

`pnpm compat:check` asserts exactly those static facts: the 22 DSH peer ranges == `dsh.engines.dsh` == the range derived from the baseline; every `REQUIRED_CORE_PACKAGES` entry is declared as a peer and resolves; and the installed tree holds exactly one release. It does **not** recompute the range predicate (the runtime gate and `test/compat.spec.ts` own it), and it does **not** check the exact development pin (`catalog:dsh` resolves to the baseline; the root `pnpm dsh:check` guards that).

`scripts/check-dsh-compat.mjs` reads the `DSH_BASELINE` literal out of `src/compat/dsh-version.ts` as **text**, not by importing it. It must therefore stay an `export const NAME = '…'` single-quoted string constant: never assembled elsewhere, never an evaluated expression, and no earlier assignment of the same shape — not even one inside a comment — may appear in that file, or the upgrade script rewrites the wrong object. The reason is that this check must run before `pnpm build`, on a clean checkout with no `lib/`.

## 2. Your tests may fail because of the gate — and that is correct

`multi-root-compat` is the first row in the patch, and the following rows inject it:

```text
multi-root-fs
multi-root-sandbox
multi-root-registry
multi-root-instructions
multi-root-lsp
multi-root-workspace-files
multi-root-file-references
```

Cordis will not start a row whose injected service is absent. So before mounting any of those providers in a test you must first:

```ts
import { mountCompat } from './support/compat.ts'

await mountCompat(ctx)
```

Otherwise `ctx.get('fs')` / `ctx.get('sandbox')` are `undefined` and you will see errors like `Cannot read properties of undefined (reading 'confine')`. That is not a bug; it is the gate working (`test/compat.spec.ts` asserts this behavior explicitly).

`mountCompat` mounts the **real** compat row, gate policy included. So the whole unit suite fails outright on an installation that is outside the derived range, missing a required package, or mixing releases — deliberately; see point 5.

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

- unit tests use `confined(provider, argv, policy)` from `test/support/confine.ts`;
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
| `src/compat/caller-connection.ts` | cordis `~4.1.0`'s traceable shadow: property access carries the definition-site slice, so the `get rpc()` registration is bound to the connection's definition-site ctx instead of the calling connection. `callerConnectionOf` unwraps with `symbols.original` and redirects ctx through a Proxy, with no version comparison; the same code covers 4.0.5 / 4.1.0 |
| `scripts/lib/profile-boot.mjs` | call `healProfilesModuleFallback` when it is a function; otherwise `createRuntimeResolution`, then `hostCtx.plugin(PluginPackages, { resolution })` inside `boot`'s prepare. 0.1.7 no longer exports heal |
| `scripts/lib/shell-exec.mjs` | use `shell.run` when it exists; otherwise `shell.execute(spec)` then `execution.result()`. 0.1.7 renamed `SandboxBashExecutor.run` to `execute` |

Always probe **structurally** (is the value a thenable, which export name exists, does the snapshot carry `current`) rather than comparing version strings. Upstream is pre-stable and reshapes things within a release; a structural probe copes with that, a version comparison does not.

`0.1.7-alpha.2`, `0.1.7-rc.1`, and `0.1.7-rc.2` keep every shape in the table above relative to `0.1.7-alpha.1` (measured 2026-09-24 against `alpha.1` / `alpha.2` / `rc.1`, and 2026-09-25 against `rc.1` → `rc.2`). `rc.1` adds an **install-time** gate that does not live in `src/compat/`: `dsh plugin add` and `loadProfile` run `semver.satisfies(runtime, peerRange, { includePrerelease: true })` on every `@deepseek-ai/dsh*` peer, and refuse the install or skip the bundle when it fails. Promoting a `0.1.7-rc.1`-or-later release back then therefore had to widen `peerDependencies` in the same change, or the smoke's `dsh plugin add` failed before this plugin's runtime gate ran. The warning level of that era did not relax that gate either.

**This is a quiet trap**: `0.1.6-alpha.2`'s host matrix (`confine`, the instruction renderer, the journey Messages endpoint) matches alpha.1, so it was promoted with "no adapter change". The client Session Controller still dropped `SessionListState.current` in `6830e1460d` and moved navigation onto the main view's `retain(..., { source: 'mainView' })`. A panel that still reads `list.current` then shows "No active session" for an open conversation and **does not call the host**.

Probe order: a non-empty `current` wins (the old shape), otherwise the first catalog row whose `retainedBy.mainView` is a positive number. A populated catalog with nobody retained returns `undefined` — **never** fall back to `ids[0]`, which would act on a session the operator is not looking at. `getSnapshot` must be invoked as a method; extracting the function drops the store's `this`.

`agent-instructions` is an **optional peer**: a minimal composition legitimately has neither it nor an agent. `instructionsApi()` returns `undefined` when the package is absent (contributing nothing), but **throws** when the package is present and carries neither renderer name — that is a compatibility break to fix, not an optional seam.

`@deepseek-ai/dsh-llm` is **also an optional peer, and it may only be loaded on demand**: the barrel (`src/index.ts`) is precisely the module the carrier loader row mounts, so its load-time dependency set must equal the required-package set, and any static value import would make a minimal composition — one that never builds a message at all — fail to load. Message construction goes through `createInstructionMessage()` in `src/compat/llm-message.ts`, which reaches `await import('@deepseek-ai/dsh-llm')` at the moment a message is actually built. `test/optional-peers.spec.ts` pins this: loading `src/index.ts` and `src/instructions.ts` does not resolve the package.

`instructionsApi()` must also keep **"the package is absent"** and **"the package is present but fails to evaluate"** apart: `isPackageInstalled()` probes installation separately (`createRequire(import.meta.url).resolve`, the same pattern as `readInstalledVersion`), and only `MODULE_NOT_FOUND` / `ERR_MODULE_NOT_FOUND` counts as absence. Every other failure — a missing transitive dependency making the `import()` throw, say — must propagate rather than being cached as `undefined`, which would silently stop the whole process from delivering additional-root instructions.

## 5. There is no relaxation switch: anything but supported refuses to start

The gate has exactly one reaction: `unsupported` (a coherent tree outside the derived range), `incomplete` (a required package does not resolve) and `mixed` (the core packages disagree about their release) all refuse to start — no environment variable, no warning level, no degraded path. The seven rows that inject `multiRootCompat` simply never start, and the composition degrades to "the plugin is not installed" — deliberately fail-closed.

Upgrading no longer needs a switch either: once a candidate is written into the baseline, the derived range's lower bound is the candidate itself, so releases on that minor line are in range by construction; a candidate on another minor line was never entitled to pass itself off as supported. The upgrade lane therefore degrades to **ordinary regression verification**: run the tests and gates as usual, with no special lane and no special environment variable, and a green run is still evidence only.

If the gate refuses locally, **do not** hunt for a switch. Check whether your host / `node_modules` really is inside the derived range (`pnpm compat:check`, and the `supported:` / `installed:` lines in the error message); to move the boundary, move the baseline as described in §6.

## 6. The upgrade flow: move the baseline, re-point the derived surface in the same batch

The upgrade probe (now the root `pnpm dsh:upgrade`; the upstream weekly lane was removed) neither commits nor pushes. It does not widen the supported range itself: the range is a function of the baseline, so **moving the baseline is moving the range**, and that is a human act. `pnpm dsh:upgrade <version>` first rewrites `scripts/dsh-baseline.mjs`, then in the same batch re-points `catalogs.dsh` (which every plugin's devDeps reference as `catalog:dsh`), `dsh.engines.dsh` and the DSH peer ranges, the cordis / schemastery pins, the runtime baseline copies (`plugins/*/src/compat/dsh-version.ts`, via `repointRuntimeBaselines()`) and the release-age allowances. A green run is **evidence**, not authorization — but under the new shape there is no second gate where someone "adds the release to a list": moving the baseline moves the range with it.

`compat:check` is now part of upgrade regression: the candidate is the new baseline, so it sits at the lower bound of the new derived range by construction. It asserts that the 22 DSH peer ranges in `package.json` == `dsh.engines.dsh` == the range derived from the baseline, that every `REQUIRED_CORE_PACKAGES` entry is declared as a peer, and that the installed tree holds a single release; it does **not** recompute the range predicate (the runtime gate and `test/compat.spec.ts` own it), nor does it check the exact development pin (the root `pnpm dsh:check` owns it).

For upgrading and probing:

```bash
pnpm dsh:upgrade 0.2.2-rc.1 --probe     # move the baseline, re-point the derived surface, add probe overrides
pnpm dsh:upgrade --latest-prerelease --probe   # pin the newest pre-release
pnpm dsh:upgrade --print-latest-prerelease
pnpm dsh:upgrade --print-installed      # what each plugin actually resolved
pnpm install --no-frozen-lockfile --config.minimumReleaseAge=0
pnpm --filter dsh-plugin-multi-root-workspace verify:all   # includes compat:check, right after lint
pnpm dsh:upgrade 0.2.2-rc.1             # remove the probe overrides
pnpm install --frozen-lockfile
pnpm dsh:check
```

Installing a candidate **requires** `--config.minimumReleaseAge=0`. Without it pnpm's release-age gate rejects the lockfile. After the probe, the root `pnpm dsh:check` compares `minimumReleaseAgeExclude` with the exact lockfile resolution set; fix the missing/stale entries it lists.

`0.2.1-rc.2`'s `dsh` depends on cordis `~4.0.5` and exact-pins every internal package to `0.2.1-rc.2`; `upgrade-dsh.mjs` repoints the cordis dev pin and its allowance line to `4.0.5`. The probe also surfaced a cross-version constraint: multi-root's production `zod` dependency must align with `@deepseek-ai/dsh-storage-domain`'s exact `zod@4.4.3`, or `defineDomain`'s types and runtime both fork (`^4.6.2` installs a second zod copy).

Two traps that only bite locally (CI always starts from a clean checkout):

- A `git checkout --` of the plugin manifests / workspace / lockfile / the baseline constant / the runtime baseline copies discards uncommitted edits with them; commit or stash first. The current flow does not need that revert: rerunning without `--probe` only removes the overrides.
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
pnpm verify:all   # lint → compat:check → typecheck → build → kernel:probe → test → smoke
```

It **includes** `compat:check`, right after `lint`: the supported range and the runtime gate read the same baseline, so the static contract is no longer an obstacle the upgrade lane has to sidestep — a candidate is written into the baseline and sits at the lower bound of the derived range. The root `.github/workflows/ci.yml` seven-step chain (install → lint → typecheck → build → test → docs:check → dsh:check) does not carry it, and neither does the root `pnpm dsh:check`; the package's `verify:all` owns it.

## 9. DSH 0.2 and the new development baseline

The development pin is `0.2.2-rc.1`, with cordis `~4.1.0`; the baseline constant lives in the root `scripts/dsh-baseline.mjs`. Restoring the baseline no longer means restoring `0.1.5-rc.2` / `4.0.2`; the earlier probes are historical records. Treat the plugin manifests, the workspace file, the lockfile, the baseline constant, and the runtime baseline copies separately when recovering from a probe, and never discard uncommitted support declarations by restoring HEAD.

`0.2.0-rc.1` and `rc.2` retain the seams handled by the existing adapters. The 0.2 agent loop records conservative failure `tool/result` events before closing a failed step: `message.isError: true`, plain-text content, and `data.error`. These must never count as successful file touches. `test/instructions.spec.ts` covers old block-level failures, message-level failures, and recovery events. The inherited Windows provider softly registers the new ACL diagnosis skill; this plugin still does not promise Windows kernel multi-root grants.

`0.2.1-rc.2` added no new adapter branch: `dsh-fs` / `dsh-sandbox` / `dsh-sandbox-local` types are unchanged, session format is still 4, and `HostConnectionRpc.handle`, the slots in use, and the primitives exports all remain. The real work was the dependency tree: every internal package is exact-pinned, `zod` must align on `4.4.3`, and `dsh-invariants` is no longer published on this line (which is why the git-graph plugin was removed entirely). The `pnpm-workspace.yaml` allowances are kept exactly equal to the lockfile by `pnpm dsh:check`.

`0.2.1-rc.5` likewise added no new adapter branch (measured 2026-11-04, Linux container): rc.2 → rc.5 left the type tree unchanged on every surface this plugin consumes, session format stays 4, cordis stays `~4.0.5`, and `zod` stays `4.4.3`. Pre-promotion warn probe: typecheck green, kernel:probe passed, 405 passed / 5 skipped across 32 test files, compose 46/46, behavior 99/99, journey 60/60; post-promotion enforce `verify:all` and `compat:check` stayed green too. Consistent with the rule since `0.1.7-rc.1`, `peerDependencies` carried `0.2.1-rc.5` in the same change — otherwise the smoke's `dsh plugin add` cannot pass the install-time peer gate.

`0.2.2-rc.1`'s shape conclusion (measured 2026-11-06, final): cordis moved to `~4.1.0`, where the traceable shadow breaks — property access carries the definition-site slice, so the `get rpc()` registration is bound to the connection's definition-site ctx instead of the calling connection; mounting goes through the structural probe of `callerConnectionOf` (unwrap with `symbols.original` plus a Proxy redirect of ctx), with no version branch anywhere — the same code covers `~4.0.5` and `~4.1.0`, and the implementation lives in `src/compat/caller-connection.ts`. `dsh-session-projection` reached rc.1: `ProjectionDefinition<K, S>` gained its second type parameter, `register` became async and returns `Promise<ProjectionHandle<S>>`, the registry-level `stateOf(session, key)` is retired in favor of `handle.stateOf(session)`, and `SessionProjectionStateMap` was renamed to `SessionProjectionMap` as the client wire table (host-only keys are no longer merged). schemastery is a single tree on `3.19.0`; `zod` stays `4.4.3`, session format stays 4; upstream declares `engines.node >=24.9.0` for the first time, and this repo's Node toolchain stays 24.21.0. Verification discipline: the `tsc -b` incremental cache is insensitive to dependency type-surface changes — clear `tsconfig.*.tsbuildinfo` before re-checking any type conclusion.

The root `scripts/check-dsh-baseline.mjs` (`pnpm dsh:check`) guards the baseline constant, the `catalogs.dsh` baseline shelf, the root's and every plugin's `catalog:dsh` devDeps, the unified derived range (`dsh.engines.dsh` and the DSH peers), the installed tree version, and the exact equality of the release-age allowances with the lockfile before a release; `scripts/release.mjs` runs it as a precondition. Multi-root's own `compat:check` hangs off its `verify:all` and is not copied into `dsh:check`. The candidate-repoint script's overrides block still belongs to the probe only; rerunning without `--probe` removes it.

On Windows, Node cannot start `npm.cmd` with `execFileSync('npm')`; old-version matrix jobs fail before repointing with `spawnSync npm ENOENT`. The upgrade script uses `scripts/lib/npm-cli.mjs`: Windows runs the installation’s `node_modules/npm/bin/npm-cli.js` through the current Node executable, while POSIX still executes npm directly. No shell command is assembled; regression tests cover paths with spaces and argument boundaries.

## 10. New B1–B3 seams

LSP and workspace-files wrap public methods; unloading must restore original property descriptors. Do not compare Cordis proxy function references. `src/compat/workspace-files.ts` adapts old `changes(scope, signal)` and new `changes(scope, path, signal)` by arity. The Windows runner for a populated scope must use a SID for the entire root set: granting additional roots to the primary SID would retain write access after removal. Optional peers participate in mixed-tree checks and must stay out of carrier-barrel static imports. See [ADR-0011](../../docs/decisions/ADR-0011-multi-root-workspace-consumers.md) for the decision.
