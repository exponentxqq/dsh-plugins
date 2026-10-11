/**
 * Compatibility adapter for the one LLM helper this bundle needs.
 *
 * `@deepseek-ai/dsh-llm` is an OPTIONAL peer (see `peerDependenciesMeta`): a
 * minimal composition legitimately has neither it nor an agent, and the
 * instruction row then contributes nothing. That makes the load MOMENT part of
 * the contract — this bundle's business layer is re-exported by the barrel
 * (`src/index.ts`), which is the module the carrier loader row mounts, so a
 * static value import of the package would make that row fail to load in a
 * composition that was never going to build a message at all.
 *
 * `createUserMessage` is therefore reached through this module, at the moment a
 * message actually has to be built. Nothing else in the bundle imports the
 * package for a value.
 *
 * @module dsh-plugin-multi-root-workspace/compat/llm-message
 */
import type { UserMessage } from '@deepseek-ai/dsh-llm';
/** One plugin-attributed instruction message to build. */
export interface InstructionMessageInput {
    /** The message body. */
    readonly text: string;
    /** The plugin credited with the message. */
    readonly plugin: string;
}
/**
 * This plugin's own producer kind.
 *
 * Session format 4 rejects the shared `kind: 'plugin'` (`format v4 message
 * requires a producer-owned source kind`). The kind is ours, not
 * `agent-instructions`: upstream treats that kind's `changes` array as its
 * own reconciliation authority.
 */
export declare const PRODUCER_SOURCE_KIND = "multi-root-workspace";
declare module '@deepseek-ai/dsh-llm' {
    interface MessageSourceMap {
        'multi-root-workspace': {
            kind: 'multi-root-workspace';
            plugin: string;
            form: 'instructions';
        };
    }
}
/** Either spelling of an instruction message's source. */
type InstructionSource = {
    readonly kind: 'plugin';
    readonly plugin: string;
    readonly form: 'instructions';
} | {
    readonly kind: 'multi-root-workspace';
    readonly plugin: string;
    readonly form: 'instructions';
};
/**
 * Which source kind the installed session format will persist.
 * @param formatVersion - `SESSION_FORMAT_VERSION`, when the session package is installed.
 * @returns `plugin` through format 3, and this plugin's own kind from format 4 on.
 */
export declare function instructionSourceKind(formatVersion: number | undefined): InstructionSource['kind'];
/**
 * Build one user-role instruction message.
 *
 * Format 3 and earlier: `{ kind: 'plugin', plugin, form: 'instructions' }`.
 * Format 4 and later: `{ kind: 'multi-root-workspace', plugin, form: 'instructions' }`.
 * @param input - the body and the plugin attribution.
 * @returns the frozen message upstream's helper produced.
 * @throws {Error} when the optional peer is absent: a step that has instruction
 *   text to deliver cannot be served without it, and staying silent would drop
 *   user-visible context instead of reporting a misconfigured composition.
 */
export declare function createInstructionMessage(input: InstructionMessageInput): Promise<UserMessage>;
export {};
