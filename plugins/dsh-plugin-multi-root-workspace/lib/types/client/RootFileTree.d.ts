/** Lazy additional-root tree and bounded text previews; requests carry a session and exact root. */
import { type ReactNode } from 'react';
import type { RootEntryView } from '../contract.ts';
import type { PanelClient } from './panel-client.ts';
import type { Translate } from './WorkspaceFoldersAction.tsx';
export interface RootFileTreeProps {
    panel: PanelClient;
    entry: RootEntryView;
    sessionId: () => string | undefined;
    t: Translate;
}
export declare function RootFileTree(props: RootFileTreeProps): ReactNode;
