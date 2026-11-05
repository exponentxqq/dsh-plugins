/**
 * 浏览器半的装配入口（设计附录 §1.1 的 `src/client/index.ts` 行 + §3.1 / 任务 10.5）。
 *
 * **双端职责**：宿主半（`src/host/index.ts`）承载 `/tools` 命令面与 Connection RPC 通道
 * `/session-tool-toggle`——工具面的状态、校验、落盘全在那边；本文件只把**同一份状态**
 * 接到 Web：会话头部工具区放一个入口按钮，点开就是 `/tools` 的可视面；统一「工作区配置」
 * 弹窗（holder `dsh-plugin-workspace-config`）里再放一个**工作区默认档分节**。两半共用
 * `src/contract.ts` 的通道/端点常量，client 侧的 `panel-client.ts` 直接内联同一组字面量
 * （D16：两端各持一份手写 parser），因此浏览器 bundle 不依赖宿主产物、也不需要运行时解析
 * 彼此的模块。
 *
 * **挂载面迁移（本次变更 #36）**：旧 `sidebar.footer.*` 注册已删除，原地不动的是
 * 会话头部入口；工作区默认档从「自绘 footer 对话框」改为「统一弹窗的一个分节」——弹窗壳
 * 属于 holder，本插件只交付分节正文。三处关系：
 *
 * | 面 | 座位 | 归属 |
 * |---|---|---|
 * | 会话头部工具面入口 | `conversation.session.header.utilities` | 本插件（不变） |
 * | 工作区默认档分节 | `workspace-config.section` | 本插件（新增，旧 footer 的替代） |
 * | 统一弹窗壳 / footer 单入口 | `shell.overlay` / `sidebar.footer.*` | holder（本插件不再占用 footer） |
 *
 * 装配四件事，按依赖顺序：
 *
 * 1. **文案注册**：`ctx.effect(() => ctx.locale.register(NS, { zh, en }))`。座位 entry 声明
 *    `locale: NS`，渲染时由框架合成 `t` 座；字典缺席会 fail loud，所以它必须排在注册之前，
 *    且挂在 `ctx.effect` 上（插件卸载即摘）。
 * 2. **`command/executed` 桥**：一个 `ctx.effect(() => ctx.on(…))` 监听跨整个插件生命周期，
 *    处理函数按面板开合进出集合——多会话的头部可能同时挂着多份入口，共用一份宿主事件即可，
 *    不必每开一次面板往 fiber 上叠一个 effect（`ctx.on` 本身已经是一个 effect，见
 *    `@deepseek-ai/cordis/lib/index.js:335-345`）。
 * 3. **分节 label 的翻译函数**：`const t = ctx.locale.bind(NS)`。分节 nav 行的 `label` 是
 *    注册时给 holder 的 thunk（`() => t('section.label')`），locale 切换无需重注册；旧 footer
 *    入口的文案由框架按 `locale: NS` 合成 `t` 座，本文件从未绑定过翻译函数（#36 新增）。
 * 4. **座位软注册**（两处，按 `seats.ts` 的常量与顺序）：
 *    - 会话头部工具区 `conversation.session.header.utilities`（list / scope `session`，
 *      order 20，设计 §3.1）；
 *    - 工作区默认档分节 `workspace-config.section`（list / scope `root`，order 20）。
 *
 *    两处 `register` 各自整体包 `try/catch`：**座位缺席或拒绝注册时，最坏结果是该入口不出现**，
 *    而不是 client 半整体装配失败——同一个 shell 里还有别的插件、别的座位（设计 §4 R2：
 *    utilities 座位的会话由框架保证，座位本身却可能不在这个壳里）；两处互相独立，一个座位
 *    注册失败不连累另一个。分节座位由 holder 以 `children` 声明：**holder 缺席时
 *    `slots.inject` 回调永不触发**，不报错、不残留 UI（组合矩阵「只贡献方」格）。
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
// session 的 SessionStandardProps（sessionId 座）、locale 的 ctx.locale 与 bind、commands 的
// `command/executed` 事件声明并进本文件的程序。少任何一个，下面 register / on / locale
// 的调用点都会类型不成立（这些合并声明只在被 import 后才可见）。
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-commands/client'
// 类型专用 import：只取 holder 的 `workspace-config.section` 座位契约（SlotMap 增补）。
// `verbatimModuleSyntax` 下零产物，浏览器 bundle 不含 holder 包名（D3 类型纪律）。
import type {} from 'dsh-plugin-workspace-config/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { CommandExecutedHandler } from './panel-controller.ts'
import type { PanelClient } from './panel-client.ts'
import type { WorkspaceDefaultsSectionProps } from './WorkspaceEntry.tsx'
import type { ToolPanelActionInjected } from './ToolPanelAction.tsx'
import { ToolPanelAction } from './ToolPanelAction.tsx'
import { WorkspaceDefaultsSection } from './WorkspaceEntry.tsx'
import { currentSessionIdOf } from './current-session.ts'
import { HEADER_SEAT, PANEL_ID, PANEL_ORDER, SECTION_ID, SECTION_ORDER, SECTION_SEAT } from './seats.ts'
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

/**
 * 座位常量统一由 `seats.ts` 提供（任务 7.4 / 设计 C5）。
 *
 * 这里保留 `SEAT` / `PANEL_ID` / `PANEL_ORDER` 三个旧导出名（值不变）：它们已是本模块
 * 对外的注册契约，外部调用方与既有套件按名引用；新代码应直接从 `seats.ts` 取
 * `HEADER_SEAT` / `SECTION_SEAT` / 各 entry 的 id 与 order。
 */
export { HEADER_SEAT as SEAT, PANEL_ID, PANEL_ORDER }

/** 诊断日志里的子系统名。 */
const LOG_LABEL = 'session-tool-toggle'

/**
 * 分节注册面交给组件的业务份额。
 *
 * `WorkspaceDefaultsSectionProps` 里剩下的部分由框架与座位 owner 提供：`t` 来自注册选项的
 * `locale: NS`（`PropsLocale` 合成），`close` 来自 `workspace-config.section` 的 owner
 * 份额（holder 弹窗注入；本分节没有整窗流程，不使用）。注入面的两个端口都**不缓存服务**：
 * 每次动作现取，与头部入口同一纪律（`connection` / `sessions` 都可能晚于 `apply` 就绪）。
 */
type WorkspaceDefaultsSectionInjected = Pick<WorkspaceDefaultsSectionProps, 'resolveClient' | 'currentSessionId'>

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

  // ③ 分节 nav 行的翻译函数：`label` thunk 需要它（旧 footer 入口的文案由框架按
  //    `locale: NS` 合成 `t` 座，本文件此前没有绑定过翻译函数）。挂在 `apply` 期常量上，
  //    locale 切换时 thunk 每次读取都能拿到当前语言的同一条文案，无需重注册。
  const t = ctx.locale.bind(NS)

  // ④ 注入面：三个端口都是稳定单例（组件用 ref 骑住注入面，稳定引用让订阅/摘除更省心）。
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

  // ⑤ 头部座位软注册：座位被声明时回调才执行；被拒绝时只丢这个入口。
  ctx.slots.inject(HEADER_SEAT, () => {
    try {
      return ctx.slots.register(
        {
          name: HEADER_SEAT,
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

  // ⑥ 工作区默认档分节软注册：holder 以 `children` 声明 `workspace-config.section` 后
  //    回调才执行（Declaring is claiming）；holder 缺席时永不触发、不报错、不留 UI。
  //    与头部各自 try/catch：一个座位拒绝注册不连累另一个，`apply` 始终正常返回。
  ctx.slots.inject(SECTION_SEAT, () => {
    try {
      return ctx.slots.register(
        {
          name: SECTION_SEAT,
          id: SECTION_ID,
          order: SECTION_ORDER,
          // thunk：holder 的 nav 每次读取都重新求值，locale 切换无需重注册（上游 SlotLabel 语义）。
          label: () => t('section.label'),
          locale: NS,
          inject: (): WorkspaceDefaultsSectionInjected => ({
            // 复用头部入口的现取客户端：两个入口对 `connection` 是同一份纪律（同一 RPC 通道、
            // 同一宿主控制内核，因此与 `/tools` 读到的是同一份状态）。
            resolveClient: ports.resolveClient,
            // 每次动作现取当前会话（`current-session.ts` 的两步探测，服务缺席返回 undefined）。
            currentSessionId: () => currentSessionIdOf(ctx),
          }),
        },
        WorkspaceDefaultsSection,
      )
    } catch (error) {
      // 同头部：座位在但拒绝了这次注册时，工作区默认档分节不显示，其余照常。
      ctx.logger.warn('%s: 工作区配置分节座位注册失败，本节不显示', LOG_LABEL)
      ctx.logger.warn(error)
      return () => {}
    }
  })
}
