import { buildPlugin } from '@dsh-plugins/build-kit'

await buildPlugin({ root: import.meta.dirname, cjsRequireShim: true })
