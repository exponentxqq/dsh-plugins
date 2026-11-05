/**
 * dsh-plugin-workspace-config 的宿主半入口（bundle 行锚点，no-op）。
 *
 * 本行存在**只为**让 Web 侧的 client-module scan 读到 package.json 的 `dsh.client` 声明：
 * scan 只从「裸包名」的 loader 行读取包根的 `dsh.client`，而注册行由 `cordis.patch.yml`
 * 以裸包名插入。因此这里必须有一个合法的包入口（`exports "."` → `lib/index.js`），但
 * holder **没有任何宿主职责**：
 *
 * - 不挂 Connection RPC 通道（分节业务全部留在三个贡献方的宿主半里）；
 * - 不读写任何落盘文件（`workspaces.json` / `defaults.json` 与 holder 无关）；
 * - 不新增任何配置键（`cordis.patch.yml` 不带 `config:` 段，`Config` 也不导出）。
 *
 * 浏览器半（footer 入口 + 统一弹窗 + 分节座位声明）在 `exports "./client"` → `lib/client.js`，
 * 由 `src/client/index.ts` 装配；本文件不 import 它，宿主产物因此仍是零 `@deepseek-ai/*`
 * 运行时依赖、external 只有 `node:*`。
 *
 * @module dsh-plugin-workspace-config
 */

/** 本插件不依赖任何宿主服务（no-op 载体）。 */
export const inject: string[] = []

/** 空实现：holder 的宿主侧没有可做的装配。 */
export function apply(): void {}
