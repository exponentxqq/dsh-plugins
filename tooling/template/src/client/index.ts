/**
 * {{PACKAGE_NAME}} 的浏览器半入口（`exports "./client"`）。
 *
 * 构建产物是 `window.__ModuleLoader__.load({ id, factory })` 壳包裹的 CJS bundle；
 * 浏览器壳通过 factory 的 `require` 提供 react / react-dom / ui-primitives 等运行时模块。
 * 模板不注册任何座位：座位入口从 `ctx.slots.inject(...)` 开始写（需要座位类型时把
 * `@deepseek-ai/dsh-client-ui-slots` 加进 devDependencies）。
 *
 * @module {{PACKAGE_NAME}}/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'

/** 浏览器半必需的客户端服务；模板不依赖任何服务。 */
export const inject: string[] = []

/**
 * 浏览器半装配入口（模板无操作）。
 * @param _ctx - 客户端根上下文。
 */
export function apply(_ctx: ClientContext): void {
  // 占位：在这里注册座位 / 事件桥 / 组件。
}
