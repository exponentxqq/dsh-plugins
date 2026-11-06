/**
 * `scripts/lib/artifacts.mjs` 的类型声明（R9 / R14④）。
 *
 * 产物词法器是 node 侧脚本的单一实现：`scripts/check-artifacts.mjs`（仓级门禁）与三个
 * 软插件的 `test/bundle.test.ts`（vitest）都从 `.mjs` 导入。`.mjs` 本身没有声明文件，
 * 而 `scripts/**` 不在任何包的 `tsconfig` 覆盖外——没有本文件时，测试侧的 import 只能
 * 靠 `// @ts-expect-error` 压掉「无声明文件」，抑制一旦失效（或反过来变成多余）就
 * 会静默漂移。声明面与实现逐字对应：两个词法器 + 路径读取 + sha256 证据。
 *
 * 只声明公开导出；实现内部的路径约定（`root/lib/<name>`）写在 `readArtifact` 的注释里。
 *
 * @module scripts/lib/artifacts
 */

/**
 * 读取一个构建产物。
 * @param root - 包目录（`lib/` 的上一级）。
 * @param name - `lib/` 下的文件名（如 `index.js` / `client.js`）。
 * @returns 产物文本。
 */
export function readArtifact(root: string, name: string): string

/**
 * 取出一段代码里全部静态 `require("…")` 的模块词（去重排序）。
 * @param source - 产物文本。
 * @returns 模块词。
 */
export function requiredWords(source: string): string[]

/**
 * 取出一段代码里全部静态 import/require 的模块词（去重排序）。
 * @param source - 产物文本。
 * @returns 模块词。
 */
export function importedWords(source: string): string[]

/**
 * 取出一段代码的模块词集合（静态 require 与 import/require/import() 的并集）。
 * @param source - 产物文本。
 * @returns 去重排序后的模块词。
 */
export function moduleWords(source: string): string[]

/**
 * 计算文本的 sha256 十六进制摘要。
 * @param text - 产物文本。
 * @returns 小写十六进制摘要。
 */
export function sha256(text: string): string
