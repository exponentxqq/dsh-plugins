/** Shared, canonical root selection for read-only workspace consumers. */
import type { Context } from '@deepseek-ai/cordis';
import type { FsTarget } from '@deepseek-ai/dsh-fs';
export interface WorkspaceRoute {
    primaryRoot: string;
    workspaceRoot: string;
    target: FsTarget;
    absolutePath: string;
}
/** Resolve relative paths against the primary cwd; never search other roots by basename. */
export declare function routeWorkspacePath(ctx: Context, primaryRoot: string, path: string, signal?: AbortSignal): Promise<WorkspaceRoute | undefined>;
