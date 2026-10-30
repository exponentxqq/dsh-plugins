/** A root-set capability: removing or adding a root changes the token's identity. */
export declare function workspaceScopeSid(roots: readonly string[]): string;
export interface WindowsProfile {
    workspace: string;
    temp: string;
    mode: 'workspace-write';
    additionalRoots: string[];
    writeSid?: string;
    tempWriteSid?: string;
}
/** Strictly recognize the upstream public runner contract, failing closed on new flags. */
export declare function parseWindowsProfile(args: readonly string[], allowAdditional?: boolean): WindowsProfile;
export declare function widenWindowsProfile(profile: readonly string[], roots: readonly string[], primaryRoot?: string): string[];
