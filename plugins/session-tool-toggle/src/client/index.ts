/**
 * 浏览器半的装配入口（设计附录 §1.1 的 `src/client/index.ts` 行 + §3.1 / 任务 10.5）。
 *
 * **双端职责**：宿主半（`src/host/index.ts`）承载 `/tools` 命令面与 Connection RPC 通道
 * `/session-tool-toggle`——工具面的状态、校验、落盘全在那边；本文件只把**同一份状态**
 * 接到 Web：会话头部工具区放一个入口按钮，点开就是 `/tools` 的可视面。两半共用
 * `src/contract.ts` 的通道/端点常量，client 侧的 `panel-client.ts` 直接内联同一组字面量
 * （D16：两端各持一份手写 parser），因此浏览器 bundle 不依赖宿主产物、也不需要运行时
 * 解析彼此的模块。
 *
 * 装配三件事，按依赖顺序：
 *
 * 1. **文案注册**：`ctx.effect(() => ctx.locale.register(NS, { zh, en }))`。座位 entry 声明
 *    `locale: NS`，渲染时由框架合成 `t` 座；字典缺席会 fail loud，所以它必须排在注册之前，
 *    且挂在 `ctx.effect` 上（插件卸载即摘）。
 * 2. **`command/executed` 桥**：一个 `ctx.effect(() => ctx.on(…))` 监听跨整个插件生命周期，
 *    处理函数按面板开合进出集合——多会话的头部可能同时挂着多份入口，共用一份宿主事件即可，
 *    不必每开一次面板往 fiber 上叠一个 effect（`ctx.on` 本身已经是一个 effect，见
 *    `@deepseek-ai/cordis/lib/index.js:335-345`）。
 * 3. **座位软注册**：`conversation.session.header.utilities`（list / scope `session`，设计
 *    §3.1 的 order 20）。`register` 整体包 `try/catch`：**座位缺席或拒绝注册时，最坏结果
 *    是入口不出现**，而不是 client 半整体装配失败——同一个 shell 里还有别的插件、别的座位
 *    （设计 §4 R2：utilities 座位的会话由框架保证，座位本身却可能不在这个壳里）。
 *
 * **`connection` 为什么不在 `inject` 里**：Web 壳的 `connection` 由 api-gateway 在 remote
 * 网关就绪后才 provide，**晚于**本插件 `apply`（web-ux v1.2.0 的踩坑，
 * `plugins/web-ux/src/client/index.ts:95-101` 里有同一段教训）。写进 `inject` 会让整行插件
 * 等到服务就位才 `apply`，入口座位也随之迟到；更糟的是 `ctx.get` 一旦在 `apply` 期读到
 * `undefined`，被闭包缓存下来就是「永远没有连接」。所以注入面的 `resolveClient`
 * **每次动作现取** `ctx.get('connection')`：`undefined` 时返回 `undefined`，控制器据此渲染
 * `error.unavailable` 降级（不渲染任何开关，见设计 §3.5），连接随后就绪时下一次打开/刷新
 * 自然恢复。
 *
 * **端口投递方式（设计 R22 ① 的裁定点）：注册级 `inject` 面**。`SlotCore.register` 的
 * inject 重载（`@deepseek-ai/dsh-client-ui-slots/lib/types/index.d.ts:806-808`）接受
 * `inject: (...args: InjectParams<K, H>) => I`，`I` 会并进组件的组合 props；session 作用域的
 * `InjectParams` 是 `[sessionId]`（同文件 `:487`），而本组件的三个端口都不需要 sessionId。
 * 组件侧早已按这个面声明（`ToolPanelAction.tsx` 的 `ToolPanelActionInjected`，并用 ref 骑住
 * 每次渲染的新对象），web-ux 也是同一写法，所以**不需要**模块级单例端口，**也不需要**自造
 * React context 包一层；座位注册与注入面在同一个 `register` 调用里落地，生命期天然一致。
 *
 * @module dsh-plugin-session-tool-toggle/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// 类型专用 import：把 renderer 的 ctx.slots、conversation 的座位契约（SlotMap 键）、
// session 的 SessionStandardProps（sessionId 座）、locale 的 ctx.locale、commands 的
// `command/executed` 事件声明并进本文件的程序。少任何一个，下面 register / on / locale
// 的调用点都会类型不成立（这些合并声明只在被 import 后才可见）。
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-commands/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { CommandExecutedHandler } from './panel-controller.ts'
import type { PanelClient } from './panel-client.ts'
import type { ToolPanelActionInjected } from './ToolPanelAction.tsx'
import { ToolPanelAction } from './ToolPanelAction.tsx'
import { NS, en, zh } from './locales.ts'
import { createPanelClient } from './panel-client.ts'

/** 浏览器半的插件名（与宿主半同名；bundle 身份由 build.mjs 的 `PACKAGE_NAME` 决定）。 */
export const name = 'session-tool-toggle'

/**
 * 依赖服务名单。
 *
 * 只有座位注册表与字典服务；`connection` **故意缺席**——它在渲染期软读（见模块头）。
 */
export const inject: readonly string[] = ['slots', 'locale']

/** 入口的 SlotMap 键：会话头部工具区（list / scope `session`，设计 §3.1）。 */
export const SEAT = 'conversation.session.header.utilities'

/** 入口 entry 的 id（list 座位的 cell 身份；同 cell 同优先级重复注册会 fail loud）。 */
export const PANEL_ID = 'session-tool-toggle-panel'

/**
 * 入口的显示顺序。
 *
 * 官方三项是 `-10`（open-in-app）/ `-5`（schedule）/ 缺省 `0`（session-log-export），
 * 见设计 §3.1 的取值论证。取 `20`：保持「越靠右越大」的单调关系、与最大官方值留出间隔，
 * 又不与缺省的 `0` 并列（并列时的先后取决于注册时序，不稳定）。
 */
export const PANEL_ORDER = 20

/** 诊断日志里的子系统名。 */
const LOG_LABEL = 'session-tool-toggle'

/**
 * 把 `window` 的 `focus` 事件接到一个回调上。
 *
 * 面板打开时挂、关闭即摘（`panel-controller.ts` 的 `attachFocusListener` 契约）。
 * @param handler - focus 回调。
 * @returns 摘除函数（重复调用安全）。
 */
export function attachFocusListener(handler: () => void): () => void {
  // 非浏览器组合（node 环境的套件、SSR 预渲染）没有 window：软降级成空订阅而不是抛。
  if (typeof window === 'undefined') return () => {}
  window.addEventListener('focus', handler)
  return () => {
    window.removeEventListener('focus', handler)
  }
}

/**
 * 浏览器半的装配入口。
 * @param ctx - 浏览器侧根上下文。
 */
export function apply(ctx: ClientContext): void {
  // ① 字典先于座位：entry 声明 `locale: NS`，渲染时缺字典会 fail loud。
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'session-tool-toggle: 双语文案')

  // ② 跨 entry 的命令事件订阅面：全插件只挂一个 `ctx.on`，面板进出只改这个集合。
  const handlers = new Set<CommandExecutedHandler>()
  ctx.effect(() => {
    const off = ctx.on('command/executed', (sessionId, commandName) => {
      // 先快照再派发：处理函数里退订自己（面板关闭）不会打乱本轮迭代。
      for (const handler of Array.from(handlers)) handler(sessionId, commandName)
    })
    return () => {
      handlers.clear()
      off()
    }
  }, 'session-tool-toggle: command/executed 桥')

  // ③ 注入面：三个端口都是稳定单例（组件用 ref 骑住注入面，稳定引用让订阅/摘除更省心）。
  const ports: ToolPanelActionInjected = {
    resolveClient: (): PanelClient | undefined => {
      // 每次动作现取：connection 可能晚于 apply 就绪，取不到就返回 undefined 让控制器降级。
      const connection: ConnectionHandle | undefined = ctx.get('connection')
      return connection === undefined ? undefined : createPanelClient(connection)
    },
    subscribeCommandExecuted: (handler) => {
      handlers.add(handler)
      return () => {
        handlers.delete(handler)
      }
    },
    attachFocusListener,
  }

  // ④ 座位软注册：座位被声明时回调才执行；被拒绝时只丢这个入口。
  ctx.slots.inject(SEAT, () => {
    try {
      return ctx.slots.register(
        {
          name: SEAT,
          id: PANEL_ID,
          order: PANEL_ORDER,
          locale: NS,
          inject: (): ToolPanelActionInjected => ports,
        },
        ToolPanelAction,
      )
    } catch (error) {
      // 座位在但拒绝了这次注册（例如同 cell 同优先级已被占用）：入口不显示，其余照常。
      ctx.logger.warn('%s: 会话头部工具区座位注册失败，本会话的入口不显示', LOG_LABEL)
      ctx.logger.warn(error)
      return () => {}
    }
  })
}
