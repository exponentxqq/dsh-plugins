/**
 * `@deepseek-ai/dsh-client-ui-primitives` 的测试替身（薄入口）。
 *
 * 实现已收敛到 `@dsh-plugins/test-kit/ui-primitives`——三个双端插件替身的**并集底座**
 * （Button / Input / Switch / Modal / Checkbox / SegmentedTabs / Menu / MenuItemButton 与
 * 17 个图标占位，见 `tooling/test-kit/README.md`）。本包没有底座之外的独有组件，故一行
 * 收口；某包将来若需要不同的 DOM 形状，应在本文件 re-export 之后做**本地覆盖**，而不是
 * 往底座里加分支。
 *
 * `vitest.config.ts` 的 `resolve.alias` 仍指向本文件，因此测试文件与 alias 配置零改动；
 * 运行时类型检查仍然对着真包的 `.d.ts`，所以替身不会掩盖 props 形状的漂移。
 *
 * @module stubs/ui-primitives
 */

export * from '@dsh-plugins/test-kit/ui-primitives'
