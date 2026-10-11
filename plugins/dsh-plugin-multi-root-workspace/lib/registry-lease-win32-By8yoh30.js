import { createHash } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import { realpathSync } from "node:fs";
//#region src/registry-lease-win32.ts
/**
* Windows named-kernel-semaphore adapter for the registry authority lease.
*
* This follows the same kernel-object contract as upstream
* `SessionWriteLease` (published `@deepseek-ai/dsh-session-persistence-jsonl`
* 0.1.5-rc.2): a count-1 named semaphore, a zero-timeout wait, and release by
* restoring the count then closing the handle — the object dies with its last
* handle, including on process death. It is a local reimplementation; it does
* not deep-import `session-persistence-jsonl/src/win32.ts` (ADR-0002).
*
* Koffi is loaded lazily so POSIX processes never load it.
*
* @module dsh-plugin-multi-root-workspace/registry-lease-win32
*/
const WAIT_OBJECT_0 = 0;
const WAIT_TIMEOUT = 258;
const ERROR_SHARING_VIOLATION = 32;
let bindings;
/** Load kernel32 through Koffi the first time a Windows process needs it. */
async function kernel32() {
	if (bindings !== void 0) return bindings;
	const library = (await import("koffi")).default.load("kernel32.dll");
	bindings = {
		createSemaphoreW: library.func("__stdcall", "CreateSemaphoreW", "intptr", [
			"void*",
			"int",
			"int",
			"str16"
		]),
		waitForSingleObject: library.func("__stdcall", "WaitForSingleObject", "uint", ["intptr", "uint"]),
		releaseSemaphore: library.func("__stdcall", "ReleaseSemaphore", "int", [
			"intptr",
			"int",
			"void*"
		]),
		closeHandle: library.func("__stdcall", "CloseHandle", "int", ["intptr"]),
		getLastError: library.func("__stdcall", "GetLastError", "uint", [])
	};
	return bindings;
}
/**
* A syscall-shaped error so POSIX contention (`EAGAIN`) and Windows contention
* (`EBUSY`) can share one `isLockContention` check.
*/
function win32Error(syscall, win32Code, path, dest) {
	const code = win32Code === ERROR_SHARING_VIOLATION ? "EBUSY" : "EIO";
	const error = /* @__PURE__ */ new Error(`${syscall} ${code} (Win32 ${win32Code}): ${path} -> ${dest}`);
	error.code = code;
	error.errno = win32Code;
	error.syscall = syscall;
	error.path = path;
	return error;
}
/**
* Derive the semaphore name from the physical parent directory, resolving
* junctions, symlinks and short path aliases before case folding and hashing.
* @param path - the lock path; its parent exists, but the file need not.
* @returns the store's kernel-object name.
*/
function leaseNameWin32(path) {
	const absolute = resolve(path);
	const physical = join(realpathSync.native(dirname(absolute)), basename(absolute)).toLowerCase();
	return `Local\\dsh-multi-root-registry-${createHash("sha256").update(physical).digest("hex")}`;
}
/** Acquire the semaphore for the physical store directory. */
async function acquireLockHandleWin32(path) {
	const api = await kernel32();
	const name = leaseNameWin32(path);
	const handle = api.createSemaphoreW(null, 1, 1, name);
	if (handle === 0) throw win32Error("CreateSemaphoreW", api.getLastError(), path, name);
	const wait = api.waitForSingleObject(handle, 0);
	if (wait === WAIT_OBJECT_0) return handle;
	api.closeHandle(handle);
	if (wait === WAIT_TIMEOUT) throw win32Error("WaitForSingleObject", ERROR_SHARING_VIOLATION, path, name);
	throw win32Error("WaitForSingleObject", api.getLastError(), path, name);
}
/**
* Restore the semaphore count and close the handle (the object dies with its
* last handle, including on process death).
* @param handle - the open semaphore handle.
*/
async function releaseLockHandleWin32(handle) {
	const api = await kernel32();
	const released = api.releaseSemaphore(handle, 1, null);
	const closed = api.closeHandle(handle);
	if (released === 0 || closed === 0) throw win32Error("ReleaseSemaphore", api.getLastError(), `handle:${String(handle)}`, `handle:${String(handle)}`);
}
//#endregion
export { acquireLockHandleWin32, releaseLockHandleWin32 };
