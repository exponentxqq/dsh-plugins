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
/** 本插件独占的 locale 命名空间。 */
export declare const NS = "workspaceConfig";
/** 中文文案（canonical 形状）。 */
export declare const zh: {
    'entry.label': string;
    'page.title': string;
    'page.intro': string;
    'page.tabs.label': string;
    'page.empty.title': string;
    'page.empty.hint': string;
    'page.workspace.label': string;
    'page.workspace.unassigned': string;
    'page.workspace.unavailable': string;
};
/** 文案键的联合类型（zh 是 canonical 形状，en 必须逐键镜像）。 */
export type Key = keyof typeof zh;
/** 英文文案：与 zh 同键镜像。 */
export declare const en: {
    'entry.label': string;
    'page.title': string;
    'page.intro': string;
    'page.tabs.label': string;
    'page.empty.title': string;
    'page.empty.hint': string;
    'page.workspace.label': string;
    'page.workspace.unassigned': string;
    'page.workspace.unavailable': string;
};
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** 本插件 Web 界面文案（侧栏面板行、独立页面与工作区选择框）。 */
        workspaceConfig: Key;
    }
}
