# Reference

中文：[README.md](./README.md)

## What Belongs Here

Stable reference material, such as:

- Configuration reference;
- API reference;
- Schemas;
- Protocols;
- File formats.

## What Does Not Belong Here

- Proposals or target designs;
- Brainstorming and scratch discussions;
- Development plans;
- Unsettled ideas.

Only established, relatively stable factual reference content belongs here.

## Current State

- [additional-root-seeding.md](./additional-root-seeding.md) — This branch's one-shot additional-root seeding: the config keys, the ledger semantics, and how to verify it (not an upstream feature).
- [common-additional-roots.md](./common-additional-roots.md) — This branch's common additional roots: the `commonRoots` configuration that applies to every primary root, its grant/dedup/failure semantics, and how it divides the work with seeding (not an upstream feature).
- [multi-root-workspace-research.md](./multi-root-workspace-research.md) — Snapshot research of the upstream repository's Workspace / Sandbox / plugin system (master `c291e7961a`; §8 covers the supplementary research on the no-upstream-changes mechanism).

## Naming Convention

Use lowercase kebab-case, for example:

```text
<topic>.md
```
