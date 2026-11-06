/**
 * `@deepseek-ai/dsh-client-ui-primitives` 的测试替身（薄入口）。
 *
 * 实现已收敛到 `@dsh-plugins/test-kit/ui-primitives`——三个双端插件替身的**并集底座**
 * （386 行的本地副本在此收口）。本包的弹窗壳只需要 `Modal`（含 `className` /
 * `contentClassName` 与 `data-modal-body` / `data-modal-footer` 标记）、`Button` 与两个
 * 图标；「四格安装组合矩阵」导入三个贡献方浏览器半时需要的其余具名导出（Input / Switch /
 * Checkbox / SegmentedTabs / Menu / MenuItemButton / 全部图标）也都在底座里，因此没有
 * 本地覆盖。
 *
 * `vitest.config.ts` 的 `resolve.alias` 仍指向本文件，因此测试文件与 alias 配置零改动；
 * 运行时类型检查仍然对着真包的 `.d.ts`，所以替身不会掩盖 props 形状的漂移。
 *
 * @module stubs/ui-primitives
 */

export * from '@dsh-plugins/test-kit/ui-primitives'
