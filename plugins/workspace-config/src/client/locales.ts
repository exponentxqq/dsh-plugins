/**
 * workspace-config 浏览器半的双语文案（NS `workspaceConfig`）。
 *
 * 与 `plugins/web-ux/src/client/locales.ts`、`plugins/session-tool-toggle/src/client/locales.ts`
 * 同构：扁平 `Record<string, string>`、键不带命名空间前缀、zh 为 canonical 形状，en 用
 * `satisfies Record<Key, string>` 钉住——少一个键或拼错一个键都是编译错误，后续的
 * locale-parity 测试再兜一层运行时一致。模板参数用框架的 `{name}` 占位
 * （`dsh-client-locale` 的插值实现即 `/\{(\w+)\}/g`）；本键面当前没有带参数的文案。
 *
 * 本包是 holder：文案只有独立页面壳（标题 / 简介 / 分节 tab 的可访问名 / 空态）、页面级
 * 工作区选择框与侧栏面板行自身的 9 个键，**不含**任何分节的业务文案——分节文案由各贡献方
 * 自有的 locale 命名空间提供（注册时 `locale: NS` + `label: () => t(...)`）。
 *
 * `entry.label` 与 `page.title` 文案相同但语义位分开：前者是侧栏面板行（`sidebar.panellist`
 * 的 label thunk），后者是页面 `<h1>`——两者消费方不同，不要合并成一个键。
 *
 * **空态文案纪律（沿用 D14）**：`page.empty.hint` 只作泛化说明，**不点名**任何具体插件——
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
  // —— 侧栏面板行与页面标题（同一文案、两个语义位） ——
  'entry.label': '工作区配置',
  'page.title': '工作区配置',

  // —— 页面简介与分节 tab 列表的可访问名 ——
  'page.intro': '按类别管理工作区设置；上方选择框决定本页作用的工作区。',
  'page.tabs.label': '配置分类',

  // —— 空态：没有任何已注册分节时的标题与提示（D14：不点名具体插件） ——
  'page.empty.title': '暂无可配置的分节',
  'page.empty.hint': '安装提供配置分节的插件后，对应分节会出现在这里。',

  // —— 工作区选择框：锚点按钮可访问名 / 菜单末项 / 清单未就绪的降级文案 ——
  'page.workspace.label': '工作区',
  'page.workspace.unassigned': '未分配',
  'page.workspace.unavailable': '工作区列表尚未就绪',
}

/** 文案键的联合类型（zh 是 canonical 形状，en 必须逐键镜像）。 */
export type Key = keyof typeof zh

/** 英文文案：与 zh 同键镜像。 */
export const en = {
  'entry.label': 'Workspace settings',
  'page.title': 'Workspace settings',

  'page.intro':
    'Manage workspace settings by category; the picker above chooses the workspace this page applies to.',
  'page.tabs.label': 'Settings categories',

  'page.empty.title': 'No settings sections',
  'page.empty.hint': 'Install a plugin that provides a settings section, and it will appear here.',

  'page.workspace.label': 'Workspace',
  'page.workspace.unassigned': 'Unassigned',
  'page.workspace.unavailable': 'Workspace list is not ready yet',
} satisfies Record<Key, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** 本插件 Web 界面文案（侧栏面板行、独立页面与工作区选择框）。 */
    workspaceConfig: Key
  }
}
