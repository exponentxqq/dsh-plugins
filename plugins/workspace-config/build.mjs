/**
 * dsh-plugin-workspace-config 的薄构建入口（双端）。
 *
 * 本包是**双端**插件，但两端职责极不对称：
 *
 * - **宿主半**（`src/index.ts` → `lib/index.js`）：不承载任何职责的 no-op 载体，只提供
 *   bundle 行所需的锚点。
 * - **浏览器半**（`src/client/index.ts` → `lib/client.js`）：footer 唯一入口 + 统一弹窗 +
 *   分节座位声明。
 *
 * 类型产物不在这里：`package.json` 的 `build` 先跑 `build:types`（`tsc` 把 d.ts 发到
 * `lib/types/` 下），再进本脚本。本包**必须**发射 d.ts——它是三个贡献方的座位契约
 * 类型权威（`exports["./client"].types` 指向 `lib/types/client/index.d.ts`），而 web-ux /
 * session-tool-toggle 的构建产物不产 d.ts；清理策略由 kit 从 `exports[*].types`
 * 推导为 `js-only`。
 *
 * 外部模块白名单刻意保持极短：`@deepseek-ai/dsh-client-ui-slots` **不能**出现在里面
 * （它没有 `./client` 导出、也不是 loader 模块表里的词），运行时 require 它会命中
 * 「missed the module table」硬错，导致整个客户端模块加载失败（D2）。
 */
import { buildPlugin } from '@dsh-plugins/build-kit'

await buildPlugin({ root: import.meta.dirname, cssClassPrefix: 'wsc' })
