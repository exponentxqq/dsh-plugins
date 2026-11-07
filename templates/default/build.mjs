/**
 * {{PACKAGE_NAME}} 的薄构建入口。
 *
 * 构建策略全部由 `@dsh-plugins/build-kit` 从包事实推导（`dsh.client.platform` 决定是否
 * 产浏览器半、`exports[*].types` 决定 d.ts 清理策略）；本文件只声明不可推导的旋钮。
 * 模板开 `cjsRequireShim`：产物里一旦出现 CJS `require` 就不会在运行期抛
 * “Dynamic require of ... is not supported”。
 */
import { buildPlugin } from '@dsh-plugins/build-kit'

await buildPlugin({ root: import.meta.dirname, cjsRequireShim: true{{CSS_CLASS_PREFIX_OPTION}} })
