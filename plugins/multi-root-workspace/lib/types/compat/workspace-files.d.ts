/** Old releases watch a session; newer ones watch a path. Probe arity, never version. */
import type { WorkspaceFiles, WorkspaceFileScope, WorkspaceFileWatchFrame } from '@deepseek-ai/dsh-api-workspace-files';
type PathWatch = (this: WorkspaceFiles, scope: WorkspaceFileScope, path: string, signal: AbortSignal) => AsyncIterable<WorkspaceFileWatchFrame>;
export declare function adaptPathWatch(service: WorkspaceFiles, wrap: (original: PathWatch) => PathWatch): () => void;
export {};
