// src/index.ts
import { lstat, readdir, rm, unlink } from "node:fs/promises";

// src/contract.ts
var CHANNEL = "/web-ux";
var PREVIEW_ENDPOINT = "preview-delete";
var DELETE_ENDPOINT = "delete-session";
var ENDPOINTS = [PREVIEW_ENDPOINT, DELETE_ENDPOINT];
var SESSION_ID_MAX = 255;
function readRequest(payload) {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return { ok: false, message: "\u8BF7\u6C42\u4F53\u4E0D\u662F\u5BF9\u8C61" };
  }
  const record = payload;
  const extra = Object.keys(record).filter((key) => key !== "sessionId");
  if (extra.length > 0) return { ok: false, message: `\u8BF7\u6C42\u4F53\u542B\u672A\u77E5\u5B57\u6BB5\uFF1A${extra.join(", ")}` };
  const sessionId = record["sessionId"];
  if (typeof sessionId !== "string" || sessionId === "") return { ok: false, message: "sessionId \u7F3A\u5931\u6216\u4E0D\u662F\u975E\u7A7A\u5B57\u7B26\u4E32" };
  if (sessionId.length > SESSION_ID_MAX) return { ok: false, message: "sessionId \u8D85\u957F" };
  if (/[\u0000-\u001f\u007f]/.test(sessionId)) return { ok: false, message: "sessionId \u542B\u63A7\u5236\u5B57\u7B26" };
  return { ok: true, value: { sessionId } };
}
function parseDeleteRequest(endpoint, payload) {
  if (!ENDPOINTS.includes(endpoint)) {
    return { ok: false, message: `\u672A\u77E5\u7AEF\u70B9 "${endpoint}"` };
  }
  return readRequest(payload);
}

// src/delete-session.ts
import { join } from "node:path";
var SESSION_REMOVED_EVENT = "api-session/removed";
function collectDeleteSet(target, headers) {
  const ids = [target];
  const included = new Set(ids);
  for (let grew = true; grew; ) {
    grew = false;
    for (const header of headers) {
      if (header.origin !== "subagent" || included.has(header.id)) continue;
      const parent = header.parentSession;
      if (parent === void 0 || !included.has(parent)) continue;
      included.add(header.id);
      ids.push(header.id);
      grew = true;
    }
  }
  return ids;
}
async function planDelete(target, ports) {
  const headers = await ports.listStoredHeaders();
  if (!headers.some((header) => header.id === target)) {
    return { ok: false, code: "not-found", message: `session "${target}" is not in session persistence` };
  }
  if (!ports.isArchived(target)) {
    return { ok: false, code: "not-archived", message: `session "${target}" is not archived` };
  }
  const ids = collectDeleteSet(target, headers);
  for (const id of ids) {
    if (ports.isLive(id)) {
      return { ok: false, code: "session-live", message: `session "${id}" is still live on the host` };
    }
  }
  return { ok: true, ids };
}
async function previewDelete(ports, sessionId) {
  const plan = await planDelete(sessionId, ports);
  if (!plan.ok) return plan;
  let logBytes = 0;
  for (const id of plan.ids) {
    try {
      logBytes += await ports.measureFiles(id);
    } catch (error) {
      ports.warn(`web-ux: measuring the stored files of session "${id}" failed`, error);
    }
  }
  return {
    ok: true,
    preview: { sessionCount: plan.ids.length, descendantCount: plan.ids.length - 1, logBytes }
  };
}
async function deleteSession(ports, sessionId) {
  const plan = await planDelete(sessionId, ports);
  if (!plan.ok) return plan;
  const warnings = [];
  for (const id of plan.ids) {
    try {
      await ports.cleanupRegistry(id);
    } catch (error) {
      warnings.push(`registry: ${id}: ${reasonOf(error)}`);
      ports.warn(`web-ux: removing session "${id}" from the workspace registry failed`, error);
    }
    try {
      warnings.push(...await ports.removeFiles(id));
    } catch (error) {
      warnings.push(`files: ${id}: ${reasonOf(error)}`);
      ports.warn(`web-ux: deleting the stored files of session "${id}" failed`, error);
    }
    try {
      ports.emitRemoved(id);
    } catch (error) {
      ports.warn(`web-ux: broadcasting the removal of session "${id}" failed`, error);
    }
  }
  return { ok: true, outcome: { removed: plan.ids, warnings } };
}
var SESSION_ID_MAX2 = 255;
var CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
function isSafeSessionId(sessionId) {
  return sessionId !== "" && sessionId.length <= SESSION_ID_MAX2 && sessionId !== "." && sessionId !== ".." && !sessionId.includes("/") && !sessionId.includes("\\") && !CONTROL_CHARACTERS.test(sessionId);
}
function isMissing(error) {
  return typeof error === "object" && error !== null && error.code === "ENOENT";
}
function reasonOf(error) {
  return error instanceof Error ? error.message : String(error);
}
function createSessionFiles(layout) {
  const { fs } = layout;
  const projCachePath = (sessionId) => layout.homePath("storages", "session_projcache", "sessions", `${sessionId}.json`);
  async function locate(sessionId) {
    const warnings = [];
    const root = layout.homePath("sessions");
    let entries;
    try {
      entries = await fs.readdir(root);
    } catch (error) {
      if (!isMissing(error)) warnings.push(`${root}: ${reasonOf(error)}`);
      return { paths: [], warnings };
    }
    const paths = [];
    for (const entry of entries) {
      if (entry.isSymbolicLink?.() === true) {
        warnings.push(`${layout.homePath("sessions", entry.name)}: symbolic-linked project directory was not followed`);
        continue;
      }
      if (!entry.isDirectory()) continue;
      const candidate = layout.homePath("sessions", entry.name, sessionId);
      try {
        await fs.lstat(candidate);
      } catch (error) {
        if (!isMissing(error)) warnings.push(`${candidate}: ${reasonOf(error)}`);
        continue;
      }
      paths.push(candidate);
    }
    return { paths, warnings };
  }
  async function sizeOf(path) {
    let stats;
    try {
      stats = await fs.lstat(path);
    } catch {
      return 0;
    }
    let total = stats.size;
    if (!stats.isDirectory()) return total;
    let entries;
    try {
      entries = await fs.readdir(path);
    } catch {
      return total;
    }
    for (const entry of entries) total += await sizeOf(join(path, entry.name));
    return total;
  }
  return {
    /** 删除集合里一个会话的磁盘痕迹，返回失败项。 */
    async remove(sessionId) {
      if (!isSafeSessionId(sessionId)) {
        return [`session id ${JSON.stringify(sessionId)} is not a safe path segment; nothing was deleted`];
      }
      const located = await locate(sessionId);
      const warnings = [...located.warnings];
      for (const path of located.paths) {
        try {
          await fs.rm(path, { recursive: true, force: true });
        } catch (error) {
          warnings.push(`${path}: ${reasonOf(error)}`);
        }
      }
      const cachePath = projCachePath(sessionId);
      try {
        await fs.unlink(cachePath);
      } catch (error) {
        if (!isMissing(error)) warnings.push(`${cachePath}: ${reasonOf(error)}`);
      }
      return warnings;
    },
    /** 统计一个会话待释放的字节数（日志目录树 + 投影缓存）。 */
    async measure(sessionId) {
      if (!isSafeSessionId(sessionId)) return 0;
      const located = await locate(sessionId);
      let total = 0;
      for (const path of located.paths) total += await sizeOf(path);
      total += await sizeOf(projCachePath(sessionId));
      return total;
    }
  };
}

// src/index.ts
var name = "web-ux";
var inject = ["workspaceRegistry", "sessionPersistence", "dshHomePath"];
var NO_HOME_MESSAGE = "the host exposes no harness-home path resolver, so stored session files cannot be located";
function apply(ctx) {
  ctx.inject(["connection", "webServer"], (connectionCtx) => {
    const connection = connectionCtx.root.get("connection");
    if (connection === void 0) {
      ctx.logger.warn("web-ux: connection resolved without the service; the session-delete channel is not mounted");
      return;
    }
    const dispose = connection.rpc.handle(CHANNEL, createDispatcher(ctx));
    return () => {
      void dispose();
    };
  });
}
function createDispatcher(ctx) {
  return async (endpoint, payload) => {
    const parsed = parseDeleteRequest(endpoint, payload);
    if (!parsed.ok) return failure("bad-request", parsed.message);
    try {
      const ports = createPorts(ctx);
      if (ports === void 0) return failure("internal", NO_HOME_MESSAGE);
      if (endpoint === PREVIEW_ENDPOINT) {
        const result = await previewDelete(ports, parsed.value.sessionId);
        return result.ok ? { ok: true, value: result.preview } : failure(result.code, result.message);
      }
      if (endpoint === DELETE_ENDPOINT) {
        const result = await deleteSession(ports, parsed.value.sessionId);
        return result.ok ? { ok: true, value: result.outcome } : failure(result.code, result.message);
      }
      return failure("bad-request", `unknown endpoint "${endpoint}"`);
    } catch (error) {
      ctx.logger.warn("web-ux: the session-delete endpoint failed unexpectedly", error);
      return failure("internal", error instanceof Error ? error.message : String(error));
    }
  };
}
var nodeFileSystem = {
  readdir: async (path) => await readdir(path, { withFileTypes: true }),
  lstat: async (path) => await lstat(path),
  rm: async (path, options) => {
    await rm(path, { recursive: options.recursive, force: options.force });
  },
  unlink: async (path) => {
    await unlink(path);
  }
};
function createPorts(ctx) {
  const homePath = ctx.dshHomePath;
  if (homePath === void 0) {
    ctx.logger.warn("web-ux: dshHomePath is unavailable; the session-delete endpoints answer internal");
    return void 0;
  }
  const files = createSessionFiles({ homePath, fs: nodeFileSystem });
  const emitter = ctx;
  return {
    listStoredHeaders: async () => (await ctx.sessionPersistence.list()).map((snapshot) => snapshot.header),
    isLive: (sessionId) => ctx.get("sessions")?.get(sessionId) !== void 0,
    isArchived: (sessionId) => ctx.workspaceRegistry.archivedSessionIds.includes(sessionId),
    cleanupRegistry: async (sessionId) => {
      const registry = ctx.workspaceRegistry;
      await registry.unarchiveSession(sessionId);
      await registry.unpinSession(sessionId);
      for (const workspace of registry.list()) {
        if (workspace.sessionIds.includes(sessionId)) {
          await workspace.detachSession(sessionId);
        }
      }
    },
    measureFiles: async (sessionId) => await files.measure(sessionId),
    removeFiles: async (sessionId) => await files.remove(sessionId),
    emitRemoved: (sessionId) => {
      try {
        emitter.emit(SESSION_REMOVED_EVENT, sessionId);
      } catch (error) {
        ctx.logger.warn("web-ux: broadcasting the session-removed event failed", error);
      }
    },
    warn: (message, error) => {
      ctx.logger.warn(message, error);
    }
  };
}
function failure(code, message) {
  return { ok: false, error: { code, message, details: {} } };
}
export {
  apply,
  createDispatcher,
  inject,
  name
};
