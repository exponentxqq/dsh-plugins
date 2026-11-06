/**
 * `@dsh-plugins/host-kit` 的桶入口。
 *
 * 消费方多数用子路径（`@dsh-plugins/host-kit/attribution` 等），以便 esbuild 只内联
 * 真正用到的模块；桶本身供根 `tsconfig` 的精确匹配项 `@dsh-plugins/host-kit` 使用，
 * 并作为「内核公开面」的清单。
 * @module @dsh-plugins/host-kit
 */

export * from './attribution.ts'
export * from './host-io.ts'
export * from './log.ts'
export * from './roots.ts'
export * from './triggers.ts'
export * from './watcher.ts'
