/**
 * `@deepseek-ai/dsh-llm` is deliberately NOT bundled: `createUserMessage` comes
 * from the running harness, resolved by the harness's own module router (the
 * established multi-root-workspace pattern), so this plugin and the host share
 * ONE message-identity implementation instead of freezing a private copy of it.
 */
import { buildPlugin } from '@dsh-plugins/build-kit'

await buildPlugin({ root: import.meta.dirname, hostExternals: ['@deepseek-ai/dsh-llm'], cjsRequireShim: true })
