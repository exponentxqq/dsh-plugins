/**
 * dsh-plugin-user-commands —— host 半面入口（`exports "."`）。插件主体在 `./host/index.ts`；
 * 本模块是 bundle 入口，用来保住包的公开形状（具名 `name` / `inject` / `apply`）。
 *
 * 本插件是 host 单面：不声明 `dsh.client`，任何 profile（web / acp / headless）都能安装；
 * 没有 `commands` 服务的部署里它零注册、零报错。
 * @module dsh-plugin-user-commands
 */

export { name, inject, apply } from './host/index.ts'
