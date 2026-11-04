/**
 * Name-face isolation: keep the project MCP servers an agent may not use out of
 * the model-visible prompt text.
 *
 * Two surfaces carry server names into a model's context, and this module owns
 * the text half only:
 *
 * - **The resource-name section** (`mcp-resource-servers`): one sentence with a
 *   trailing JSON array of server names, contributed by the MCP resources
 *   provider. The names this agent must not see are dropped from that array,
 *   and a section whose array ends up empty is removed entirely — the same
 *   shape upstream produces when no server is configured.
 * - **The instruction sections** (`mcp:<server>`): one section per server.
 *   A section whose server is hidden is dropped by name.
 *
 * Upstream text is parsed leniently (a trailing array or the last array in the
 * text), but never fail-open: text that cannot be recognized as a string array
 * makes its section disappear. The rules live in pure functions; the second
 * half of this module, {@link createAssembleListener}, only sequences them
 * along the prompt-assembly waterfall — await the rest of the chain, attribute
 * the assembly, filter, diagnose.
 *
 * The module imports one type and no runtime value: `ScanLog` from
 * `./types.ts` is the host half's logging seam. No upstream package is
 * imported (the waterfall event is declared locally), so the pure half still
 * needs no cordis context to be exercised.
 * @module dsh-plugin-project-mcp/host/prompt-isolation
 */

import type { ScanLog } from './types.ts'

/** The section name the MCP resources provider publishes its name list under. */
export const RESOURCE_NAMES_SECTION = 'mcp-resource-servers'

/** The prefix of the per-server instruction section names. */
export const SERVER_SECTION_PREFIX = 'mcp:'

/**
 * The structural slice of a prompt section this layer reads and preserves.
 *
 * Deliberately narrow and structural: the real section objects carry more
 * fields (`render`, `complete`, …), and every untouched field must survive a
 * rewrite. {@link planNameFilter} copies a rewritten section with a spread, so
 * nothing outside `text` is ever dropped.
 */
export interface SectionLike {
  readonly name: string
  readonly text: string
  /** Whether the prompt renderer interpolates `{{…}}` in `text`. */
  readonly interpolate?: boolean
}

/** The structural slice of one prompt assembly this layer reads. */
export interface PromptAssemblyLike {
  readonly sections: readonly SectionLike[]
}

/** The session-bearing part of an assemble context's agent. */
export interface AssembleAgentLike {
  readonly session: { readonly header: { readonly id: string; readonly cwd?: string } }
}

/**
 * The assemble context this layer reads.
 *
 * `agent` and `scope` are the same object when both are present; `scope` is
 * the fallback identity for an assembly that has no agent yet.
 */
export interface AssembleContextLike {
  readonly agent?: AssembleAgentLike
  readonly scope?: object
}

/**
 * How one resource-name section was treated.
 *
 * Callers MUST exhaust the union: `empty` and `unparsable` both mean "drop the
 * section", while `kept` means "leave the section object alone".
 */
export type NamesRewrite =
  /** Empty text (no configured server) or nothing to remove: keep the section. */
  | { readonly kind: 'kept' }
  /** Rewritten text; `kept` and `removed` preserve the input order. */
  | {
      readonly kind: 'rewritten'
      readonly text: string
      readonly kept: readonly string[]
      readonly removed: readonly string[]
    }
  /** Every name was removed: the caller drops the whole section. */
  | { readonly kind: 'empty'; readonly removed: readonly string[] }
  /** No parseable string array: the caller drops the section (fail-closed). */
  | { readonly kind: 'unparsable' }

/** One located JSON-array candidate inside the section text. */
interface ArraySpan {
  readonly raw: string
  readonly start: number
  readonly end: number
}

/**
 * Strategy A — the array that closes the sentence, optionally followed by the
 * sentence's period.
 *
 * The `server argument: ` lead is matched as part of the strategy rather than
 * assumed at a fixed offset, so surrounding prose may change. The lookahead
 * lets the array and the period be separated by whitespace or newlines.
 */
const TRAILING_NAME_ARRAY = /server argument:[^[\]]*(\[[^[\]]*\])(?=\s*\.?\s*$)/u

/**
 * Strategy B — any JSON array; the caller takes the last match.
 *
 * Names cannot contain `[`, `]` or `{` under the server-name contract, so a
 * non-nested array is the whole surface a name list can take.
 */
const ANY_NAME_ARRAY = /\[[^[\]]*\]/gu

/**
 * Locate the array that closes the text after `server argument: `.
 * @param text - the section text.
 * @returns the array's span, or undefined when the text does not have that shape.
 */
function trailingArray(text: string): ArraySpan | undefined {
  const match = TRAILING_NAME_ARRAY.exec(text)
  if (match === null) return undefined
  const raw = match[1]
  const start = (match.index ?? 0) + match[0].lastIndexOf('[')
  return { raw, start, end: start + raw.length }
}

/**
 * Locate the last array anywhere in the text.
 * @param text - the section text.
 * @returns the last array's span, or undefined when the text holds none.
 */
function lastArray(text: string): ArraySpan | undefined {
  let found: ArraySpan | undefined
  for (const match of text.matchAll(ANY_NAME_ARRAY)) {
    const start = match.index ?? 0
    found = { raw: match[0], start, end: start + match[0].length }
  }
  return found
}

/**
 * Parse a candidate array, accepting only a non-empty-string array.
 * @param raw - the candidate array's source text.
 * @returns the names, or undefined when it is not a string array.
 */
function parseNameArray(raw: string): readonly string[] | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (!Array.isArray(parsed)) return undefined
  if (!parsed.every((item): item is string => typeof item === 'string')) return undefined
  return parsed
}

/**
 * Drop hidden server names from one resource-name section's text.
 *
 * Resolution order (each step falls through to the next):
 * 1. empty text → `kept` (upstream contributes `''` when nothing is configured;
 *    it is not a parse failure and must not warn on every assembly);
 * 2. no hidden name → `kept`, zero allocation;
 * 3. the array closing the text after `server argument: `;
 * 4. the last array anywhere in the text;
 * 5. neither candidate is a string array → `unparsable`.
 *
 * A rewrite keeps the text before the array and the text after it (upstream's
 * period and newline) verbatim, and serializes the kept names exactly as
 * upstream does. Rewriting an untouched list is therefore byte-identical, and
 * filtering the result again is a no-op.
 * @param text - the assembled section text.
 * @param hidden - project server names this agent must not see.
 * @returns how the text changed; `unparsable` means "delete the section".
 */
export function rewriteResourceNames(text: string, hidden: ReadonlySet<string>): NamesRewrite {
  if (text.trim() === '') return { kind: 'kept' }
  if (hidden.size === 0) return { kind: 'kept' }

  const candidates: ArraySpan[] = []
  const trailing = trailingArray(text)
  if (trailing !== undefined) candidates.push(trailing)
  const last = lastArray(text)
  if (last !== undefined && (trailing === undefined || last.start !== trailing.start)) candidates.push(last)

  let span: ArraySpan | undefined
  let names: readonly string[] | undefined
  for (const candidate of candidates) {
    const parsed = parseNameArray(candidate.raw)
    if (parsed !== undefined) {
      span = candidate
      names = parsed
      break
    }
  }
  if (span === undefined || names === undefined) return { kind: 'unparsable' }

  const kept = names.filter((name) => !hidden.has(name))
  const removed = names.filter((name) => hidden.has(name))
  if (removed.length === 0) return { kind: 'kept' }
  if (kept.length === 0) return { kind: 'empty', removed }

  return {
    kind: 'rewritten',
    text: text.slice(0, span.start) + JSON.stringify(kept) + text.slice(span.end),
    kept,
    removed,
  }
}

/** What one assembly's name-face pass decided. */
export interface NameFilterPlan {
  /** The filtered sections; the input reference when `changed === false`. */
  readonly sections: readonly SectionLike[]
  /** Whether a section was rewritten or dropped. */
  readonly changed: boolean
  /** Names left inside the resource-name array, in input order. */
  readonly keptNames: readonly string[]
  /** Names removed from the resource-name array, in input order. */
  readonly removedNames: readonly string[]
  /** Dropped `mcp:<server>` section names, in input order. */
  readonly removedSections: readonly string[]
  /** A resource-name section was dropped because its text did not parse. */
  readonly unparsable: boolean
}

/**
 * Plan one assembly's name-face filtering.
 *
 * Rules, per section:
 * - `mcp-resource-servers`: `kept` keeps the same object; `rewritten` produces
 *   a spread copy with the new text (so `interpolate` and any field this
 *   module does not know survive); `empty` and `unparsable` drop the section;
 * - `mcp:<hidden name>`: drop the section by name;
 * - everything else (including a visible server's section): same reference.
 *
 * When nothing changes — an empty hidden set, no relevant section, or a name
 * list with no hidden name — the input `sections` reference is returned
 * unchanged. A duplicated resource-name section is handled per section
 * (defensive): names are concatenated and `unparsable` is sticky.
 * @param sections - the sections the prompt waterfall produced.
 * @param hidden - project server names this agent must not see.
 * @returns the plan; `changed === false` means "return the assembly untouched".
 */
export function planNameFilter(
  sections: readonly SectionLike[],
  hidden: ReadonlySet<string>,
): NameFilterPlan {
  const keptNames: string[] = []
  const removedNames: string[] = []
  const removedSections: string[] = []
  let unparsable = false
  let changed = false

  if (hidden.size === 0) {
    return { sections, changed, keptNames, removedNames, removedSections, unparsable }
  }

  const filtered: SectionLike[] = []
  for (const section of sections) {
    if (section.name === RESOURCE_NAMES_SECTION) {
      const rewrite = rewriteResourceNames(section.text, hidden)
      if (rewrite.kind === 'kept') {
        filtered.push(section)
        continue
      }
      changed = true
      if (rewrite.kind === 'rewritten') {
        filtered.push({ ...section, text: rewrite.text })
        keptNames.push(...rewrite.kept)
        removedNames.push(...rewrite.removed)
        continue
      }
      if (rewrite.kind === 'empty') {
        removedNames.push(...rewrite.removed)
        continue
      }
      unparsable = true
      continue
    }

    if (section.name.startsWith(SERVER_SECTION_PREFIX)) {
      const serverName = section.name.slice(SERVER_SECTION_PREFIX.length)
      if (hidden.has(serverName)) {
        changed = true
        removedSections.push(section.name)
        continue
      }
    }

    filtered.push(section)
  }

  return {
    sections: changed ? filtered : sections,
    changed,
    keptNames,
    removedNames,
    removedSections,
    unparsable,
  }
}

/**
 * The project servers that must stay out of this assembly: `blocked \ visible`.
 *
 * `visible === undefined` means the calling agent is not tracked, so fail
 * closed and hide every blocked server. The result is always a fresh set (a
 * copy of `blocked` in the untracked case), so callers cannot mutate a set the
 * registry owns.
 * @param blocked - project server names this plugin holds but may not show (loaded or loading).
 * @param visible - the agent's workspace servers, or undefined when untracked.
 * @returns the names to hide.
 */
export function hiddenServers(
  blocked: ReadonlySet<string>,
  visible: ReadonlySet<string> | undefined,
): ReadonlySet<string> {
  const hidden = new Set<string>()
  if (visible === undefined) {
    for (const name of blocked) hidden.add(name)
    return hidden
  }
  for (const name of blocked) {
    if (!visible.has(name)) hidden.add(name)
  }
  return hidden
}

/** How many names one diagnostic line spells out before it counts the rest. */
const REPORTED_NAMES = 6

/**
 * Spell out a few names and count the remainder, so one log line stays
 * readable whatever the size of the registry.
 *
 * Exported for the assemble listener below; the `sample` in `isolation.ts`
 * keeps its own private copy by design, and the two must stay behaviourally
 * identical: the first six names joined by commas, then `,+N` for the
 * remainder.
 * @param names - the names to render.
 * @returns the rendered sample.
 */
export function sample(names: readonly string[]): string {
  const head = names.slice(0, REPORTED_NAMES).join(',')
  return names.length > REPORTED_NAMES ? `${head},+${names.length - REPORTED_NAMES}` : head
}

/** How many unparsable-section warnings one listener instance emits. */
const UNPARSABLE_WARNINGS = 3

/**
 * The live readings the assemble listener needs.
 *
 * Both ports are read per assembly and never cached: a rescan must change the
 * very next prompt (D-12), and an untracked agent must fail closed.
 */
export interface PromptIsolationPorts {
  /**
   * The project servers one agent may see.
   * @param agent - the assembly's agent (or its scope as the fallback).
   * @returns the agent's visible set, or undefined when it is untracked.
   */
  visibleFor(agent: object): ReadonlySet<string> | undefined
  /**
   * The project servers this plugin holds but may not show (loaded or loading).
   * @returns the blocked set (`claimed \ failedClaims`).
   */
  blockedServerNames(): ReadonlySet<string>
  /** Where the listener reports what one assembly decided. */
  readonly log: ScanLog
}

/**
 * The prompt-assembly waterfall listener this plugin installs.
 *
 * Shaped like the waterfall signature: the raw assembly, the assemble context,
 * and the continuation that runs the rest of the chain. The assembly type is a
 * parameter so the listener hands back exactly the type it was given: the host
 * declares this event itself (in `@deepseek-ai/dsh-system-prompt`), and its
 * concrete `PromptAssembly` is only assignable to a listener that preserves
 * that type. The narrow `PromptAssemblyLike` stays the bound, so this module
 * still needs no upstream package.
 */
export type AssembleListener = <A extends PromptAssemblyLike>(
  assembly: A,
  context: AssembleContextLike,
  next: () => Promise<A>,
) => Promise<A>

/**
 * Whether one section carries a project server name.
 * @param section - one prompt section.
 * @returns true for the resource-name section and every `mcp:<server>` section.
 */
export function isNameSurface(section: SectionLike): boolean {
  return section.name === RESOURCE_NAMES_SECTION || section.name.startsWith(SERVER_SECTION_PREFIX)
}

/**
 * Drop every name-bearing section.
 *
 * The fail-closed fallback (D-11): only section names are read, so nothing here
 * can throw on text the listener failed to parse or on a set it failed to read.
 * @param sections - the sections to strip.
 * @returns the unrelated sections, in input order, as a new array.
 */
export function overHide(sections: readonly SectionLike[]): SectionLike[] {
  return sections.filter((section) => !isNameSurface(section))
}

/**
 * The session identity one assembly's diagnostics name.
 * @param context - the assemble context.
 * @returns the session id (`(none)` without an agent) and its cwd.
 */
function sessionOf(context: AssembleContextLike): { readonly id: string; readonly cwd: string | undefined } {
  const header = context.agent?.session.header
  return { id: header?.id ?? '(none)', cwd: header?.cwd }
}

/**
 * The throttle key of one tracked assembly.
 * @param plan - the name filter plan.
 * @returns the content fingerprint; session identity is excluded on purpose.
 */
function trackedShape(plan: NameFilterPlan): string {
  const kept = plan.keptNames.join(',')
  const removed = plan.removedNames.join(',')
  const sections = plan.removedSections.join(',')
  return `tracked|${kept}|${removed}|${sections}|${plan.unparsable ? 1 : 0}`
}

/**
 * The `tracked=yes` diagnostic line.
 * @param location - the `session=… cwd=…` prefix.
 * @param plan - the name filter plan.
 * @returns the line.
 */
function trackedLine(location: string, plan: NameFilterPlan): string {
  return `prompt: resource names ${location} tracked=yes `
    + `kept=[${sample(plan.keptNames)}] removed=[${sample(plan.removedNames)}] `
    + `sections=[${sample(plan.removedSections)}] unparsable=${plan.unparsable ? 1 : 0}`
}

/**
 * Create the prompt-assembly listener: await the rest of the chain, then hide
 * the project servers this assembly's agent may not see.
 *
 * The order is the contract (D-10, D-11):
 *
 * 1. `await next()` first, so a later listener's rewrite is filtered too, and a
 *    rejection thrown by the chain is propagated untouched (this plugin never
 *    swallows someone else's failure);
 * 2. an assembly with no name-bearing section returns the `next()` result
 *    unchanged: zero port reads, zero diagnostics (a deployment without
 *    project servers pays nothing);
 * 3. attribution is `context.agent ?? context.scope`; a missing key or an
 *    undefined `visibleFor` result means "untracked" and hides every blocked
 *    name (fail closed);
 * 4. a port read or the filtering itself failing is fail-closed too: the
 *    failure is logged and every name-bearing section is dropped;
 * 5. an assembly nothing changed in returns the `next()` result itself, so a
 *    no-op pass allocates no new object.
 *
 * Diagnostics are throttled by shape — the content fingerprint of the kept
 * names, the removed names, the dropped sections, and the unparsable flag. A
 * shape is reported when it first appears and again only after it changes, so
 * six identical assemblies leave one line while another workspace's assembly
 * still shows up. An unparsable section warns at most three times.
 * @param ports - the live readings and the log.
 * @returns the waterfall listener.
 */
export function createAssembleListener(ports: PromptIsolationPorts): AssembleListener {
  let lastShape: string | undefined
  let warnings = 0

  return async <A extends PromptAssemblyLike>(
    _assembly: A,
    context: AssembleContextLike,
    next: () => Promise<A>,
  ): Promise<A> => {
    // The raw first argument is never read: the chain's result is authoritative.
    const resolved = await next()
    if (!resolved.sections.some(isNameSurface)) return resolved

    let visible: ReadonlySet<string> | undefined
    let hidden: ReadonlySet<string>
    try {
      const key = context.agent ?? context.scope
      visible = key === undefined ? undefined : ports.visibleFor(key)
      hidden = hiddenServers(ports.blockedServerNames(), visible)
    } catch (error) {
      ports.log.error(`prompt: cannot read the project server sets of one assembly: ${String(error)}`)
      return { ...resolved, sections: overHide(resolved.sections) } as A
    }

    let plan: NameFilterPlan
    try {
      plan = planNameFilter(resolved.sections, hidden)
    } catch (error) {
      ports.log.error(`prompt: cannot filter the resource server names of one assembly: ${String(error)}`)
      return { ...resolved, sections: overHide(resolved.sections) } as A
    }

    const tracked = visible !== undefined
    const { id, cwd } = sessionOf(context)
    if (plan.unparsable && warnings < UNPARSABLE_WARNINGS) {
      warnings += 1
      ports.log.warn(
        `prompt: resource names section unparsable (deleted), upstream text drifted: session=${id} cwd=${cwd ?? 'none'}`,
      )
    }

    const shape = tracked ? trackedShape(plan) : `untracked|${hidden.size}`
    if (shape !== lastShape) {
      lastShape = shape
      ports.log.info(
        tracked
          ? trackedLine(`session=${id} cwd=${cwd ?? 'none'}`, plan)
          // An untracked assembly has no known cwd: `cwd=none` is the marker.
          : `prompt: resource names session=${id} cwd=none tracked=no hidden=${hidden.size}`,
      )
    }

    // The spread carries every field of the incoming assembly; only `sections`
    // is replaced (with a fresh mutable array), so the pass-through type holds.
    return plan.changed ? ({ ...resolved, sections: plan.sections } as A) : resolved
  }
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * Waterfall over the assembled prompt: each listener wraps the rest of the
     * chain and the returned assembly is authoritative.
     *
     * Declared locally because this package does not import the package that
     * owns the declaration (`@deepseek-ai/dsh-system-prompt`): the running host
     * emits the event either way, and only the fields this plugin reads are
     * modelled. That package can still enter this package's type graph through
     * `@deepseek-ai/dsh-agent`, in which case both method declarations merge as
     * overloads; {@link AssembleListener} is generic precisely so one listener
     * satisfies the host's concrete signature too. A signature that stops
     * matching fails the typecheck instead of drifting silently.
     */
    'system-prompt/assemble'(
      assembly: PromptAssemblyLike,
      context: AssembleContextLike,
      next: () => Promise<PromptAssemblyLike>,
    ): Promise<PromptAssemblyLike>
  }
}
