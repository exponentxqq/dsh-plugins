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
/** 本插件独占的 locale 命名空间。 */
export declare const NS = "workspaceConfig";
/** 中文文案（canonical 形状）。 */
export declare const zh: {
    'entry.label': string;
    'dialog.title': string;
    'dialog.close': string;
    'nav.label': string;
    'dialog.empty.title': string;
    'dialog.empty.hint': string;
    'dialog.loading': string;
};
/** 文案键的联合类型（zh 是 canonical 形状，en 必须逐键镜像）。 */
export type Key = keyof typeof zh;
/** 英文文案：与 zh 同键镜像。 */
export declare const en: {
    'entry.label': string;
    'dialog.title': string;
    'dialog.close': string;
    'nav.label': string;
    'dialog.empty.title': string;
    'dialog.empty.hint': string;
    'dialog.loading': string;
};
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** 本插件 Web 界面文案（统一入口与弹窗壳）。 */
        workspaceConfig: Key;
    }
}
