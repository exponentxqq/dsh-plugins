/**
 * Compatibility adapter for the product icons the panel renders.
 *
 * ```text
 * 0.1.5-rc.2 / 0.1.6   IconFolderClose16, IconChevronDownOutline14, …  (pixel size in the name)
 * 0.1.7-alpha.1 through 0.2.1-rc.2   IconFolderCloseRegular, IconChevronDownOutlineRegular, …  (weight in the name)
 * ```
 *
 * `0.1.7-alpha.1` kept `size` as a prop and split each glyph into a Regular
 * (1px) and a Medium (1.3px) weight. Upstream's own client surfaces use
 * Regular for these glyphs, so that is the name this probe prefers after the
 * pixel-sized one. The lookup is by export name, not by release string.
 *
 * @module dsh-plugin-multi-root-workspace/compat/client-icons
 */
import type { ReactNode } from 'react';
import type { IconProps } from '@deepseek-ai/dsh-client-ui-primitives';
/** One icon component, spelled the way both releases spell `IconProps`. */
export type PanelIcon = (props: IconProps) => ReactNode;
/** Exports addressed by name. A release carries one name from each pair. */
type IconModule = Readonly<Record<string, PanelIcon | undefined>>;
/**
 * Pick the first export name this release actually provides.
 * @param module - the icon module to read.
 * @param names - candidate export names, preferred first.
 * @returns the component.
 * @throws {Error} when none of the names is exported. That is a compatibility
 *   break to adapt here, not a missing optional peer.
 */
export declare function selectIcon(module: IconModule, names: readonly string[]): PanelIcon;
export declare const IconChevronDown: PanelIcon;
export declare const IconChevronUp: PanelIcon;
export declare const IconCopy: PanelIcon;
export declare const IconEdit: PanelIcon;
export declare const IconEllipsis: PanelIcon;
export declare const IconFolderClose: PanelIcon;
export declare const IconFolderOpen: PanelIcon;
export declare const IconPlus: PanelIcon;
export declare const IconTrash: PanelIcon;
export {};
