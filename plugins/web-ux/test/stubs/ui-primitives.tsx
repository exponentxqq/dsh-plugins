/**
 * `@deepseek-ai/dsh-client-ui-primitives` 的测试替身（薄入口）。
 *
 * 实现已收敛到 `@dsh-plugins/test-kit/ui-primitives`——三个双端插件替身的**并集底座**。
 * 本包用到的 `Menu`（锚定下拉：数据行 / `data-selected` / `portal`）、`SegmentedTabs`
 * （含方向键 / Home / End 的键盘行为）、`Checkbox`、`MenuItemButton`（`data-danger`）与
 * 六个图标都已由底座承载（底座采纳的正是本包版形状），因此没有本地覆盖。
 *
 * `vitest.config.ts` 的 `resolve.alias` 仍指向本文件，因此测试文件与 alias 配置零改动；
 * 运行时类型检查仍然对着真包的 `.d.ts`，所以替身不会掩盖 props 形状的漂移。
 *
 * @module stubs/ui-primitives
 */

export * from '@dsh-plugins/test-kit/ui-primitives'
