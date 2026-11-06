/**
 * 构建产物词法器的**单一实现**（R9）。
 *
 * 仓库里有三份逐字相同的本地副本（workspace-config / web-ux /
 * session-tool-toggle 的 `test/bundle.test.ts`）在断言已构建字节的模块词。
 * 第四份不许再出现：`scripts/check-artifacts.mjs`（node）与三个
 * `test/bundle.test.ts`（vitest）都从这里导入，语义以既有副本为准
 * （`plugins/workspace-config/test/bundle.test.ts:43-60`），不重新发明：
 *
 * - `requiredWords` / `importedWords` 的正则、去重与排序逐字保留；
 * - `readArtifact(root, name)` 读 `root/lib/<name>`，与副本的路径约定一致；
 * - `moduleWords` 是两者的并集（静态 require 已含在 imported 里，故等价于
 *   importedWords），供仓级门禁按「模块词集合」比较；
 * - `sha256` 记录产物字节，用于基线快照的证据与漂移提示（**不参与**等价性
 *   判定：注入顺序与 css 属性变更会改字节，不改模块词）。
 *
 * @module scripts/lib/artifacts
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 读取一个构建产物。
 * @param root - 包目录（`lib/` 的上一级）。
 * @param name - `lib/` 下的文件名（如 `index.js` / `client.js`）。
 * @returns 产物文本。
 */
export function readArtifact(root, name) {
  return readFileSync(join(root, 'lib', name), 'utf8')
}

/**
 * 取出一段代码里全部静态 `require("…")` 的模块词（去重排序）。
 * @param source - 产物文本。
 * @returns 模块词。
 */
export function requiredWords(source) {
  return [...new Set([...source.matchAll(/require\("([^"]+)"\)/g)].map((match) => match[1] ?? ''))].sort()
}

/**
 * 取出一段代码里全部静态 import/require 的模块词（去重排序）。
 *
 * 匹配 `from "…"`（ESM）、`require("…")`（CJS）、`import("…")`（字面量动态
 * import）。计算式动态 import 不匹配——它不是静态依赖。
 * @param source - 产物文本。
 * @returns 模块词。
 */
export function importedWords(source) {
  const words = [
    ...source.matchAll(/from\s+"([^"]+)"/g),
    ...source.matchAll(/require\("([^"]+)"\)/g),
    ...source.matchAll(/import\("([^"]+)"\)/g),
  ].map((match) => match[1] ?? '')
  return [...new Set(words)].sort()
}

/**
 * 取出一段代码的模块词集合（静态 require 与 import/require/import() 的并集）。
 *
 * 与 `importedWords` 的差别只在语义命名：`moduleWords` 是仓级门禁与迁移基线
 * 使用的「模块词集合」概念。两者结果相同（required 是 imported 的子集），
 * 保留并集写法是为了让两个来源在将来分开演化时不会漏词。
 * @param source - 产物文本。
 * @returns 去重排序后的模块词。
 */
export function moduleWords(source) {
  return [...new Set([...importedWords(source), ...requiredWords(source)])].sort()
}

/**
 * 计算文本的 sha256 十六进制摘要。
 * @param text - 产物文本。
 * @returns 小写十六进制摘要。
 */
export function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}
