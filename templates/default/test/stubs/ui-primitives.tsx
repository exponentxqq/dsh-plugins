/**
 * `@deepseek-ai/dsh-client-ui-primitives` 的测试替身（薄入口）。
 *
 * 实现全部在 `@dsh-plugins/test-kit/ui-primitives`（三个双端插件替身的并集底座）；
 * `vitest.config.ts` 的 `resolve.alias` 指向本文件，测试文件因此零改动。本包若需要底座
 * 之外的 DOM 形状，在本文件 re-export 之后做**本地覆盖**——不要往底座里加 per-package 分支。
 *
 * @module stubs/ui-primitives
 */

export * from '@dsh-plugins/test-kit/ui-primitives'
