/**
 * The panel's bilingual copy.
 *
 * Flat `Record<string, string>` dictionaries keyed by a bare key (never
 * `ns.key`), `zh` as the canonical shape and `en` pinned to it by `satisfies`,
 * so a missing translation is a type error and a divergence is caught by
 * `tests/locale-parity.spec.ts` as well.
 *
 * @module dsh-plugin-multi-root-workspace/client/locales
 */
/** The locale namespace this plugin owns. */
export declare const NS = "multiRootWorkspace";
/** Chinese copy (the canonical shape). */
export declare const zh: {
    'files.browse': string;
    'files.reload': string;
    'files.empty': string;
    'files.truncated': string;
    'files.previewTruncated': string;
    'action.label': string;
    'action.title': string;
    'panel.title': string;
    'panel.subtitle': string;
    'panel.primary': string;
    'panel.primaryNote': string;
    'panel.additional': string;
    'panel.empty': string;
    'panel.emptyHint': string;
    'panel.noSession': string;
    'panel.loading': string;
    'panel.retry': string;
    'panel.close': string;
    'panel.add': string;
    'panel.addManual': string;
    'panel.addConfirm': string;
    'panel.remove': string;
    'panel.removeConfirm': string;
    'panel.more': string;
    'panel.rename': string;
    'panel.aliasPlaceholder': string;
    'panel.aliasSave': string;
    'panel.aliasCancel': string;
    'panel.copyPath': string;
    'panel.copied': string;
    'panel.reveal': string;
    'panel.moveUp': string;
    'panel.moveDown': string;
    'state.available': string;
    'state.missing': string;
    'state.redirected': string;
    'state.invalid': string;
    'root.sourceCommon': string;
    'root.sourceCommonTitle': string;
    'error.not-absolute': string;
    'error.missing': string;
    'error.not-a-directory': string;
    'error.equals-primary': string;
    'error.primary-overlap': string;
    'error.duplicate': string;
    'error.nested': string;
    'error.invalid-alias': string;
    'error.not-found': string;
    'error.invalid-ref': string;
    'error.common-root': string;
    'error.storage-unavailable': string;
    'error.registry-contended': string;
    'error.reveal-unavailable': string;
    'error.unavailable': string;
    'error.copy-failed': string;
    'error.session-not-found': string;
    'error.fallback': string;
};
/** The canonical key set. */
export type Key = keyof typeof zh;
/** English copy, pinned to the Chinese key set. */
export declare const en: {
    'files.browse': string;
    'files.reload': string;
    'files.empty': string;
    'files.truncated': string;
    'files.previewTruncated': string;
    'action.label': string;
    'action.title': string;
    'panel.title': string;
    'panel.subtitle': string;
    'panel.primary': string;
    'panel.primaryNote': string;
    'panel.additional': string;
    'panel.empty': string;
    'panel.emptyHint': string;
    'panel.noSession': string;
    'panel.loading': string;
    'panel.retry': string;
    'panel.close': string;
    'panel.add': string;
    'panel.addManual': string;
    'panel.addConfirm': string;
    'panel.remove': string;
    'panel.removeConfirm': string;
    'panel.more': string;
    'panel.rename': string;
    'panel.aliasPlaceholder': string;
    'panel.aliasSave': string;
    'panel.aliasCancel': string;
    'panel.copyPath': string;
    'panel.copied': string;
    'panel.reveal': string;
    'panel.moveUp': string;
    'panel.moveDown': string;
    'state.available': string;
    'state.missing': string;
    'state.redirected': string;
    'state.invalid': string;
    'root.sourceCommon': string;
    'root.sourceCommonTitle': string;
    'error.not-absolute': string;
    'error.missing': string;
    'error.not-a-directory': string;
    'error.equals-primary': string;
    'error.primary-overlap': string;
    'error.duplicate': string;
    'error.nested': string;
    'error.invalid-alias': string;
    'error.not-found': string;
    'error.invalid-ref': string;
    'error.common-root': string;
    'error.storage-unavailable': string;
    'error.registry-contended': string;
    'error.reveal-unavailable': string;
    'error.unavailable': string;
    'error.copy-failed': string;
    'error.session-not-found': string;
    'error.fallback': string;
};
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** This plugin's panel copy. */
        multiRootWorkspace: Key;
    }
}
