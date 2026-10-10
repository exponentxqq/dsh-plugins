# AGENTS.md

## Purpose

This file defines repository-wide instructions for Coding Agents working on this project.

More specific instructions may later be introduced by nested `AGENTS.md` files inside individual modules.

## Before Making Changes

Before modifying the repository:

1. Read this file.
2. Read `docs/README.md`.
3. Read documentation relevant to the task.
4. Inspect the current repository state instead of assuming documentation is perfectly up to date.
5. Prefer extending existing conventions over introducing parallel structures.
6. Check `.agent/note/` for relevant project knowledge when applicable.

## Documentation

Documentation is part of the implementation.

When a change affects documented behavior, architecture, workflows, interfaces, engineering decisions, or development processes, update the corresponding documentation in the same change.

Do not keep important project knowledge only in chat history, issue comments, or temporary Agent context.

## Documentation Locations

- `docs/architecture/` — architecture and system design
- `docs/decisions/` — Architecture Decision Records
- `docs/development/` — development workflow and engineering practices
- `docs/reference/` — stable technical reference
- `docs/troubleshooting/` — recurring problems and verified solutions
- `.agent/note/` — durable Agent-oriented project knowledge
- `.agent/templates/` — templates used by Coding Agents
- `.agent/skills/documentation/SKILL.md` — documentation maintenance rules

## Documentation Maintenance

Documentation maintenance rules are defined in:

`.agent/skills/documentation/SKILL.md`

When creating, modifying, moving, or deleting project documentation, follow the Documentation Skill.

## Documentation Validation

Before completing changes that affect documentation, run the repository documentation check.

Use the canonical package script:

`docs:check`

The package manager adopted by this repository is pnpm, so the command is:

```bash
pnpm docs:check
```

A change with failing documentation checks is incomplete.

## Source of Truth

Avoid duplicating the same information across multiple documents.

Each important concept should have one canonical location.

Other documents should link to that source instead of copying its contents.

## Bilingual Documentation

Chinese is the primary documentation language.

For documents that require bilingual maintenance:

- `<name>.md` is the canonical Chinese version.
- `<name>.en.md` is the corresponding English version.

The two files are treated as one logical document: when you update one, check whether the other needs to be synchronized, and vice versa. If the two versions ever conflict, the Chinese version wins — fix the English version. Do not produce low-quality machine translation; the English version should read naturally and accurately express the meaning of the Chinese version.

All README documents and formal documents under `.agent/note/` must follow this convention. Do not create empty `.en.md` files for other document types unless bilingual maintenance is actually needed.

Other types — ADRs, reference, and troubleshooting entries — stay Chinese-only unless a real need appears.

## Current Project State

The project is an out-of-tree DSH plugin bundle (`dsh-plugin-multi-root-workspace`) that widens the workspace sandbox scope from one root to a primary root plus N additional roots, without modifying any upstream package.

This checkout is a **local fork** vendored in dotfiles (`dsh/plugins/dsh-plugin-multi-root-workspace`); upstream is `cherrchen/dsh-plugin-multi-root-workspace`, baseline `f149fa4` (one commit past `v0.1.5`). Everything upstream shipped through `v0.1.5` — the MVP milestones (M1–M3), the hardening batch (H1–H4), and the `v0.1.2`–`v0.1.5` support-matrix expansions — is included in that baseline. The fork's own deltas (one-shot additional-root seeding, common additional roots via `commonRoots` granted to every primary root, the scope-less package name, and the removal of the upstream release machinery and project-management documents) are recorded in the dotfiles repository's `dsh/README.md`; the upstream-style CHANGELOG, roadmap, and plan documents were removed with it, so this section plus the ADRs are the remaining narrative.

The batch's four items:

- **H1 (= M4) — one Registry Authority Process per store.** A store-wide kernel lease beside the JSON document; a contended process is fail-closed and takes over via `refresh()`. See `docs/decisions/ADR-0007-registry-authority-lease.md`.
- **H2 — panel authority is host-derived.** The client `primaryRoot` field is gone and every endpoint requires a live `sessionId`. See `docs/decisions/ADR-0008-panel-session-derived-authority.md`.
- **H3 — DSH compatibility is a code contract rather than a documented agreement**: `src/compat/dsh-version.ts` holds an exact-version allowlist (`SUPPORTED_DSH_RELEASES`), `peerDependencies` names those same versions, `scripts/check-dsh-compat.mjs` (`pnpm compat:check`) fails when any of allowlist / peers / dev pin / installed tree drift apart, and the `multi-root-compat` row classifies the installation at boot. `0.1.5-rc.2`, `0.1.6-alpha.1`, `0.1.6-alpha.2`, `0.1.7-alpha.1`, `0.1.7-alpha.2`, `0.1.7-rc.1`, `0.1.7-rc.2`, `0.2.0-rc.1`, and `0.2.0-rc.2` are supported; the dev pin is `0.2.0-rc.2`. `0.1.7-alpha.2`, `0.1.7-rc.1`, and `0.1.7-rc.2` kept the `0.1.7-alpha.1` shapes, so promoting them did not add an adapter branch. From `0.1.7-rc.1`, `dsh plugin add` refuses a plugin unless `peerDependencies` names that exact release. `0.1.7-alpha.2` through `0.1.7-rc.2` depend on cordis `~4.0.4`. `0.1.6-alpha.2` kept the `0.1.6-alpha.1` shapes (`confine` stays async, the instruction renderer name is unchanged), so promoting it did not require an adapter edit. `0.1.7-alpha.1` kept those two shapes and still required adapters: session format 4 rejects `kind: 'plugin'`, the tool-failure bit moved onto the message, panel icons use Regular names, in-process boot publishes `PluginPackages`, and bash execution is `execute().result()`. Its `dsh` depends on cordis `^4.0.3`; a probe that also installs `4.0.2` splits `@deepseek-ai/dsh-tools` and the scheduler Symbol misses.
- **H4 — additional roots' own `AGENTS.md` / `CLAUDE.md` now reach the model** through the `multi-root-instructions` row, because upstream's discovery walks upward from the session cwd and can never reach them. Phase 1 injects the root's top-level files; Phase 2 injects the files of the subdirectories the session has actually worked in, driven by the persisted `session/event` feed rather than by upstream's `SessionMessageProjection` semantics. See `docs/decisions/ADR-0010-additional-root-instruction-scope.md`.

Ten invariants that must survive future changes:

1. **Re-resolving a path is not re-authorizing it.** A registration carries the canonical directory it was granted for (`recordedPath`); `ctx.multiRootScope` grants it only while `canonicalPath(path)` still equals that value, and reports `redirected` otherwise. Never make a grant follow a replaced directory or symlink.
2. **One write path, serialized.** Registry mutations run their whole read → validate → persist sequence inside the per-primary-root queue (`serialize`); the storage domain only serializes individual writes. Do not read a snapshot outside the queue.
3. **One revalidation entry point.** `registry.refresh()` re-stats, re-resolves, re-judges, republishes the scope, and writes nothing; the command's `list` and the panel's `list` both call it, and listing must remain enough to notice a directory that disappeared. `publish` stays idempotent. `refresh()` also retries the store-wide authority lease so a waiting process can take over after the previous holder exits.
4. **One response shape per panel endpoint.** `src/contract.ts` owns the endpoint → response mapping (`reveal` answers `{ revealed }`, root-management endpoints answer a `RootsView`, and `files` / `readFile` have their own validated listing / preview shapes), and both halves validate the wire shapes at runtime.
5. **The client-graph anchor stays.** The web client-module scan reads this package's `dsh.client` only from a loader row mounted at the bare package name — subpath rows are never client rows. `cordis.patch.yml` must keep the `multi-root-client` row (`name` = the bare package name, backed by the barrel's no-op `apply`), or `lib/client.js` never reaches the browser and the `sidebar.footer.action` registration silently disappears. See `docs/troubleshooting/client-bundle-not-in-boot-graph.md`.
6. **One Registry Authority Process per store.** The JSON backend is memory-authoritative after open. Only the process holding the store-wide kernel lease (`leasePath`, default `$DSH_HOME/storages/multi_root_workspace.lock`) may open the domain and grant additional roots. A contended process publishes an empty scope and rejects mutations (`registry-contended`). Do not add a TTL/PID lock, and do not open the domain before acquiring the lease. Teardown is the mirror image, and there the order *is* the invariant: the disposer runs the whole sequence inside the authority-transition queue — drain in-flight mutations → close the domain → release the lease — and never grabs anything outside that queue, so a successor can never open a snapshot missing this process's last write, and an acquisition in flight when the fiber disposes cannot finish by opening a domain nothing will ever close. See `docs/decisions/ADR-0007-registry-authority-lease.md`.
7. **The compatibility gate is a precondition, not a diagnostic.** `multi-root-fs`, `multi-root-sandbox`, `multi-root-registry`, `multi-root-instructions`, `multi-root-lsp` and `multi-root-workspace-files` all inject `multiRootCompat`, and cordis will not start a row whose injected service is missing — so an unsupported or mixed installation makes those gated rows simply not exist. Keep that injection on any new row that widens authority. Version-dependent code belongs only in `src/compat/`, and it must probe *structure* (is the return value thenable? which renderer name is exported?) rather than compare version strings. `DSH_MULTI_ROOT_COMPAT=warn` has exactly one legitimate caller, the upgrade lane. Promoting a release is a human act: a green upgrade run is evidence, never authorization. See `docs/decisions/ADR-0009-dsh-compat-contract.md`.
8. **Instructions are user context, never system authority, and revocation is explicit.** `multi-root-instructions` injects each additional root's **top-level** instruction file — and the instruction files of the subdirectories the session has worked in — from `agent/pre-step` as a `form: 'instructions'` user message (source kind `plugin` through session format 3, and this plugin's own `multi-root-workspace` from format 4, which rejects `kind: 'plugin'`) — not through `systemPrompt`, and not from a lifecycle event. Message construction loads the optional peer `@deepseek-ai/dsh-llm` **on demand** through `src/compat/llm-message.ts`, never with a static value import: the barrel is the module the carrier loader row mounts, so its load-time dependency set must equal the required-package set. Discovery is pinned to the root (`projectRoot` is the root, and every candidate must be canonically inside it), which is what keeps `$DSH_HOME`, the primary root (its own nested files included), and any ancestor from being injected a second time. The byte budget is shared across all additional roots, not per root. Touches come from the persisted `session/event` feed: a `tool/call` is paired with its `tool/result` by call id, and only a **successful** `read` / `write` / `edit` makes the directory chain from the root down to the touched file worth examining — a failed call never does. The directories a single touch makes worth examining are the touched file's parent directory and every ancestor of that parent up to the additional root, so an intermediate directory's `AGENTS.md` is visible too. Delivery state is per session and per scope (root + relative directory + file name) and lives in process memory, so after a resume this row may re-tell instructions it already told. When a root is removed, disappears, or is `redirected`, and when a delivered file vanishes, emit an explicit revocation or withdrawal: the earlier instructions are still in the conversation, so going silent does not retract them. With zero additional roots this row must contribute nothing at all. Nested discovery for the **primary** root stays upstream's job, on both supported releases. See `docs/decisions/ADR-0010-additional-root-instruction-scope.md`.
9. **Panel authority is host-derived from the session.** Every panel request requires `sessionId`; `resolvePanelPrimaryRoot` looks up `ctx.get('sessions')?.get(sessionId)` and returns `canonicalPath(session.header.cwd)`. There is no client `primaryRoot` field and no `sandboxPolicy` fallback. A missing or unknown session is rejected; a client with no current session shows "No active session" and does not call the host. The `/workspace-folders` command still uses `invocation.agent.session` (trusted host context). See `docs/decisions/ADR-0008-panel-session-derived-authority.md`.
10. **Configured common roots are granted, never stored.** `Config.commonRoots` names directories every workspace gets (a machine-wide cache, say). The scope captures each directory's `recordedPath` once per authority transition — so a later symlink swap is withheld rather than re-granted — keeps an absent directory (granting it as soon as it exists, with no restart), and writes nothing to the store: deleting the entry is what revokes the root. Common roots are appended AFTER the registrations on every read surface, so an existing ordinal never moves, and one an available registration already grants is not repeated. A contended or storage-failed process grants none of them, and a mutation naming one answers `common-root` (`add` answers `duplicate`) instead of touching the store. See `docs/reference/common-additional-roots.md`.

Before touching the compatibility contract, the adapters, or anything that has to work on more than one upstream release, read `.agent/note/dsh-compat-contract.md` — it records the measured 0.1.5 → 0.1.6 differences and the quiet traps (a `confine` that is sync on one release and async on the next, two LLM wire protocols in the journey smoke, a local `git checkout` revert step that eats uncommitted manifest edits).

Development environment, toolchain, commands, and the smoke mechanism are documented in `docs/development/plugin-development-workflow.md`. Design, upstream facts, and decisions live in `docs/architecture/`, `docs/reference/`, and `docs/decisions/`.

`ctx.multiRootScope` owns exactly two write ports and no data source of its own: `setAdditionalRoots()` per primary root (tests and smoke scripts call it directly; in production the registry does) and `setCommonRoots()` for the configured roots granted to every primary root (the registry publishes it while it holds the authority and clears it when it does not). Do not build a second data source. The browser half talks to the host over the Connection RPC channel `/multi-root-workspace` — not over a Typert Remote namespace (ADR-0005). The client UI's styling is the host's: `src/client/styles.ts` is the single stylesheet, classes are `mrfw-`-prefixed, and every color is a host `var(--dsw-*)` token — never a literal color (ADR-0006). Do not invent constraints that are not written down.

B1–B3 extend the same scope to LSP, Windows ACL and additional-root file browsing. Before changing these consumers, read `docs/decisions/ADR-0011-multi-root-workspace-consumers.md`. Public method wrappers must preserve the caller context and restore property descriptors on disposal. Windows capabilities are per root set, never a primary-root SID granted to all additional roots.
