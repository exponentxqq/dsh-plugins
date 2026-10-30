import type { Context } from '@deepseek-ai/cordis';
import type { PanelCall, FilePreview, FilesView } from './contract.ts';
export declare function browseRoot(ctx: Context, primaryRoot: string, request: PanelCall, signal: AbortSignal): Promise<FilesView | FilePreview>;
