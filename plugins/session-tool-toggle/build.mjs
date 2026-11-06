/**
 * dsh-plugin-session-tool-toggle 的薄构建入口（双端）。
 *
 * `cjsRequireShim: true`：宿主产物里的 `banner` 注入真实 `require`——被一起打进来的纯 CJS
 * 依赖（`zod` 等）会在模块求值期调用 `require('process')` 之类的核心模块，构建器的
 * `__require` 壳会直接抛 “Dynamic require of ... is not supported”。绑定到 bundle 自身 URL 的
 * `require` 让这些调用可解析，同时产物仍然自包含（不在运行时解析本包 node_modules）。
 */
import { buildPlugin } from '@dsh-plugins/build-kit'

await buildPlugin({ root: import.meta.dirname, cssClassPrefix: 'stt', cjsRequireShim: true })
