/**
 * dsh-plugin-zcode-plan —— host 半面入口（`exports "."`）。插件主体在 `./host/index.ts`；
 * 本模块是 bundle 入口，只做形状转发。
 *
 * dsh 的 loader 只从**包入口**读 `name` / `inject` / `Config` / `apply` 四个符号
 * （`--dump-config-schema` 与 fiber 的配置校验都走同一条路），装配层导出的 schema
 * 不在这里转发就等于不存在。本插件是 host 单面：不声明 `dsh.client`，任何
 * profile（web / acp / headless）都能安装。
 *
 * @module dsh-plugin-zcode-plan
 */

export { name, inject, Config, apply } from './host/index.ts'
