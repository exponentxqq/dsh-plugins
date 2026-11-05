/**
 * workspace-config 浏览器半的双语文案（NS `workspaceConfig`）。
 *
 * 与 `plugins/web-ux/src/client/locales.ts`、`plugins/session-tool-toggle/src/client/locales.ts`
 * 同构：扁平 `Record<string, string>`、键不带命名空间前缀、zh 为 canonical 形状，en 用
 * `satisfies Record<Key, string>` 钉住——少一个键或拼错一个键都是编译错误，后续的
 * locale-parity 测试再兜一层运行时一致。模板参数用框架的 `{name}` 占位
 * （`dsh-client-locale` 的插值实现即 `/\{(\w+)\}/g`）。
 *
 * 本包是 holder：文案只有弹窗壳与入口自身的 7 个键，**不含**任何分节的业务文案——分节
 * 文案由各贡献方自有的 locale 命名空间提供（注册时 `locale: NS` + `label: () => t(...)`）。
 *
 * **空态文案纪律（D14）**：`dialog.empty.hint` 只作泛化说明，**不点名**任何具体插件——
 * holder 不应在文案里维护一份「插件清单」，否则新增分节时文案立刻过期。用户要知道装什么，
 * 由仓库 README / 安装文档回答，而不是由空态回答。
 *
 * @module dsh-plugin-workspace-config/client/locales
 */

// 类型专用 import：`declare module` 是模块增强（augmentation），目标模块必须先作为本文件的
// 依赖被解析一次，否则 tsc 报 TS2664「module cannot be found」。`import type {}` 在编译期
// 被完全擦除，不进 bundle。
import type {} from '@deepseek-ai/dsh-client-ui-slots'

/** 本插件独占的 locale 命名空间。 */
export const NS = 'workspaceConfig'

/** 中文文案（canonical 形状）。 */
export const zh = {
  // —— 侧栏 footer 的唯一入口 ——
  'entry.label': '工作区配置',

  // —— 统一弹窗壳：标题、关闭按钮、分节导航的可访问名 ——
  'dialog.title': '工作区配置',
  'dialog.close': '关闭',
  'nav.label': '配置分节',

  // —— 空态：没有任何已注册分节时的标题与提示（D14：不点名具体插件） ——
  'dialog.empty.title': '暂无可配置的分节',
  'dialog.empty.hint': '安装提供配置分节的插件后，对应分节会出现在这里。',

  // —— 载入态（预留：弹窗壳在分节来源尚未就绪时可用） ——
  'dialog.loading': '正在载入…',
}

/** 文案键的联合类型（zh 是 canonical 形状，en 必须逐键镜像）。 */
export type Key = keyof typeof zh

/** 英文文案：与 zh 同键镜像。 */
export const en = {
  'entry.label': 'Workspace settings',

  'dialog.title': 'Workspace settings',
  'dialog.close': 'Close',
  'nav.label': 'Settings sections',

  'dialog.empty.title': 'No settings sections',
  'dialog.empty.hint': 'Install a plugin that provides a settings section, and it will appear here.',

  'dialog.loading': 'Loading…',
} satisfies Record<Key, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** 本插件 Web 界面文案（统一入口与弹窗壳）。 */
    workspaceConfig: Key
  }
}
