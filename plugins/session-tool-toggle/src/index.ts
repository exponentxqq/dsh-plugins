/**
 * 包入口：只做形状转发。
 *
 * 包根导出（`exports "."` → `lib/index.js`）必须提供 `name` / `inject` / `apply`
 * 三个符号，`Config` 则是可选但必需的第四个——dsh 的 loader 只从**包入口**读
 * `plugin.Config`（`--dump-config-schema` 与 fiber 的配置校验都走同一条路），装配层导出的
 * schema 不在这里转发就等于不存在。真正的装配逻辑在 `./host/index.ts`，本文件不承担任何
 * 实质职责。
 *
 * @module dsh-plugin-session-tool-toggle
 */

export { name, inject, Config, apply } from './host/index.ts'
