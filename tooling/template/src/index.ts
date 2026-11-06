/**
 * {{PACKAGE_NAME}} —— host 半入口（`exports "."`）。
 *
 * dsh 的 loader 只从**包入口**读 `name` / `inject` / `Config` / `apply` 四个符号
 * （`--dump-config-schema` 与 fiber 的配置校验都走同一条路）；装配逻辑写在本文件，
 * 或拆到 `src/host/` 后在这里转发，不要在别处另建入口。
 *
 * @module {{PACKAGE_NAME}}
 */

import type { Context } from '@deepseek-ai/cordis'

/** loader 诊断与 bundle 行 id 使用的 Cordis 插件名。 */
export const name = '{{NAME}}'

/** 本行激活所需的服务；空数组表示不依赖任何宿主服务。 */
export const inject: string[] = []

/**
 * 插件入口：模板只写一条加载日志，业务逻辑从这里开始。
 * @param ctx - 本行挂载的宿主上下文。
 */
export function apply(ctx: Context): void {
  ctx.logger.info('{{NAME}}: loaded')
}
