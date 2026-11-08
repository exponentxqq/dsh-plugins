window.__ModuleLoader__.load({
	id: "dsh-plugin-workspace-config",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __export = (target, all) => {
		  for (var name in all)
		    __defProp(target, name, { get: all[name], enumerable: true });
		};
		var __copyProps = (to, from, except, desc) => {
		  if (from && typeof from === "object" || typeof from === "function") {
		    for (let key of __getOwnPropNames(from))
		      if (!__hasOwnProp.call(to, key) && key !== except)
		        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
		  }
		  return to;
		};
		var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

		// src/client/index.ts
		var index_exports = {};
		__export(index_exports, {
		  PANEL_ID: () => PANEL_ID,
		  PANEL_ORDER: () => PANEL_ORDER,
		  WORKSPACE_CONFIG_SECTION: () => WORKSPACE_CONFIG_SECTION,
		  apply: () => apply,
		  inject: () => inject
		});
		module.exports = __toCommonJS(index_exports);

		// src/client/contract.ts
		var WORKSPACE_CONFIG_SECTION = "workspace-config.section";
		var PANEL_ID = "workspace-config";
		var PANEL_ORDER = 20;

		// src/client/locales.ts
		var NS = "workspaceConfig";
		var zh = {
		  // —— 侧栏面板行与页面标题（同一文案、两个语义位） ——
		  "entry.label": "\u5DE5\u4F5C\u533A\u914D\u7F6E",
		  "page.title": "\u5DE5\u4F5C\u533A\u914D\u7F6E",
		  // —— 页面简介与分节 tab 列表的可访问名 ——
		  "page.intro": "\u6309\u7C7B\u522B\u7BA1\u7406\u5DE5\u4F5C\u533A\u8BBE\u7F6E\uFF1B\u4E0A\u65B9\u9009\u62E9\u6846\u51B3\u5B9A\u672C\u9875\u4F5C\u7528\u7684\u5DE5\u4F5C\u533A\u3002",
		  "page.tabs.label": "\u914D\u7F6E\u5206\u7C7B",
		  // —— 空态：没有任何已注册分节时的标题与提示（D14：不点名具体插件） ——
		  "page.empty.title": "\u6682\u65E0\u53EF\u914D\u7F6E\u7684\u5206\u8282",
		  "page.empty.hint": "\u5B89\u88C5\u63D0\u4F9B\u914D\u7F6E\u5206\u8282\u7684\u63D2\u4EF6\u540E\uFF0C\u5BF9\u5E94\u5206\u8282\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\u3002",
		  // —— 工作区选择框：锚点按钮可访问名 / 菜单末项 / 清单未就绪的降级文案 ——
		  "page.workspace.label": "\u5DE5\u4F5C\u533A",
		  "page.workspace.unassigned": "\u672A\u5206\u914D",
		  "page.workspace.unavailable": "\u5DE5\u4F5C\u533A\u5217\u8868\u5C1A\u672A\u5C31\u7EEA"
		};
		var en = {
		  "entry.label": "Workspace settings",
		  "page.title": "Workspace settings",
		  "page.intro": "Manage workspace settings by category; the picker above chooses the workspace this page applies to.",
		  "page.tabs.label": "Settings categories",
		  "page.empty.title": "No settings sections",
		  "page.empty.hint": "Install a plugin that provides a settings section, and it will appear here.",
		  "page.workspace.label": "Workspace",
		  "page.workspace.unassigned": "Unassigned",
		  "page.workspace.unavailable": "Workspace list is not ready yet"
		};

		// src/client/panel-pair.ts
		function createPanelPair(warn) {
		  let pageDispose;
		  let rowInstall;
		  let rowDispose;
		  let rowSeatLive = false;
		  const installRow = () => {
		    if (!rowSeatLive || rowDispose !== void 0) return;
		    const install = rowInstall;
		    if (install === void 0) return;
		    try {
		      rowDispose = install();
		    } catch (error) {
		      rowDispose = void 0;
		      warn("\u4FA7\u680F\u9762\u677F\u884C\u6CE8\u518C\u5931\u8D25\uFF0C\u672C\u5165\u53E3\u4E0D\u663E\u793A", error);
		    }
		  };
		  const disposeRow = () => {
		    const dispose = rowDispose;
		    rowDispose = void 0;
		    if (dispose === void 0) return;
		    try {
		      dispose();
		    } catch (error) {
		      warn("\u4FA7\u680F\u9762\u677F\u884C\u6CE8\u9500\u5931\u8D25", error);
		    }
		  };
		  const disposePage = () => {
		    const dispose = pageDispose;
		    pageDispose = void 0;
		    if (dispose === void 0) return;
		    try {
		      dispose();
		    } catch (error) {
		      warn("\u9875\u9762\u5EA7\u4F4D\u6CE8\u9500\u5931\u8D25", error);
		    }
		  };
		  return {
		    page: (install) => {
		      disposeRow();
		      disposePage();
		      try {
		        pageDispose = install();
		      } catch (error) {
		        warn("\u9875\u9762\u5EA7\u4F4D\u6CE8\u518C\u5931\u8D25\uFF0C\u672C\u9875\u9762\u4E0D\u663E\u793A", error);
		        return () => {
		        };
		      }
		      installRow();
		      let disposed = false;
		      return () => {
		        if (disposed) return;
		        disposed = true;
		        disposeRow();
		        disposePage();
		      };
		    },
		    row: (install) => {
		      disposeRow();
		      rowSeatLive = true;
		      rowInstall = install;
		      if (pageDispose !== void 0) installRow();
		      let disposed = false;
		      return () => {
		        if (disposed) return;
		        disposed = true;
		        rowSeatLive = false;
		        rowInstall = void 0;
		        disposeRow();
		      };
		    }
		  };
		}

		// src/client/sections.ts
		function projectRows(entries) {
		  const rows = [];
		  entries.forEach((entry, index) => {
		    const id = entry.options.id;
		    if (typeof id !== "string" || id === "") return;
		    const rawLabel = entry.options.label;
		    rows.push({
		      id,
		      order: entry.options.order ?? 0,
		      // D2 的本地 2 行解析：thunk 每次读取重新求值，locale 切换无需重注册。
		      label: typeof rawLabel === "function" ? rawLabel() : rawLabel ?? "",
		      index
		    });
		  });
		  rows.sort((left, right) => left.order - right.order || left.index - right.index);
		  return rows.map(({ index: _index, ...row }) => row);
		}
		function createSectionsSource(ctx) {
		  const listeners = /* @__PURE__ */ new Set();
		  let cached = [];
		  let cachedSlotVersion = -1;
		  let cachedLocaleRevision = -1;
		  let stopSlots;
		  let stopLocale;
		  const notify = () => {
		    for (const listener of Array.from(listeners)) listener();
		  };
		  const ensureSubscribed = () => {
		    if (stopSlots !== void 0) return;
		    stopSlots = ctx.slots.subscribe(WORKSPACE_CONFIG_SECTION, notify);
		    stopLocale = ctx.locale.subscribe(notify);
		  };
		  const releaseIfIdle = () => {
		    if (listeners.size > 0) return;
		    stopSlots?.();
		    stopSlots = void 0;
		    stopLocale?.();
		    stopLocale = void 0;
		  };
		  const read = () => {
		    const slotVersion = ctx.slots.getVersion(WORKSPACE_CONFIG_SECTION);
		    const localeRevision = ctx.locale.getSnapshot().revision;
		    if (slotVersion === cachedSlotVersion && localeRevision === cachedLocaleRevision) return cached;
		    cached = projectRows(ctx.slots.entries(WORKSPACE_CONFIG_SECTION));
		    cachedSlotVersion = slotVersion;
		    cachedLocaleRevision = localeRevision;
		    return cached;
		  };
		  return {
		    getSnapshot: read,
		    subscribe: (listener) => {
		      listeners.add(listener);
		      ensureSubscribed();
		      return () => {
		        listeners.delete(listener);
		        releaseIfIdle();
		      };
		    }
		  };
		}

		// ../../tooling/client-kit/src/client-session.ts
		function currentSessionIdOf(sessions) {
		  const snapshot = listSnapshotOf(sessions);
		  if (snapshot === void 0) return void 0;
		  const current = snapshot.current;
		  if (typeof current === "string" && current !== "") return current;
		  return mainViewSessionId(snapshot.byId);
		}
		function sessionUsageOf(sessions) {
		  const snapshot = listSnapshotOf(sessions);
		  if (snapshot === void 0) return void 0;
		  const updatedAtById = {};
		  const byId = snapshot.byId;
		  if (byId !== null && typeof byId === "object") {
		    for (const [key, row] of Object.entries(byId)) {
		      if (row === null || typeof row !== "object") continue;
		      const updatedAt = row.updatedAt;
		      if (typeof updatedAt !== "number" || !Number.isFinite(updatedAt)) continue;
		      const id = rowIdOf(row, key);
		      if (id === void 0 || Object.hasOwn(updatedAtById, id)) continue;
		      updatedAtById[id] = { updatedAt };
		    }
		  }
		  return { updatedAtById };
		}
		function listSnapshotOf(sessions) {
		  if (sessions === null || typeof sessions !== "object") return void 0;
		  const list = sessions.list;
		  if (list === null || typeof list !== "object") return void 0;
		  const holder = list;
		  if (typeof holder.getSnapshot !== "function") return void 0;
		  let snapshot;
		  try {
		    snapshot = holder.getSnapshot();
		  } catch {
		    return void 0;
		  }
		  if (snapshot === null || typeof snapshot !== "object") return void 0;
		  return snapshot;
		}
		function mainViewSessionId(byId) {
		  if (byId === null || typeof byId !== "object") return void 0;
		  for (const [key, row] of Object.entries(byId)) {
		    if (!isMainViewRow(row)) continue;
		    const id = rowIdOf(row, key);
		    if (id !== void 0) return id;
		  }
		  return void 0;
		}
		function rowIdOf(row, key) {
		  const id = row.id;
		  if (typeof id === "string" && id !== "") return id;
		  return key !== "" ? key : void 0;
		}
		function isMainViewRow(row) {
		  if (row === null || typeof row !== "object") return false;
		  const retainedBy = row.retainedBy;
		  if (retainedBy === null || typeof retainedBy !== "object") return false;
		  const count = retainedBy.mainView;
		  return typeof count === "number" && count > 0;
		}

		// src/client/session-context.ts
		function currentSessionIdOf2(ctx) {
		  return currentSessionIdOf(ctx.get("sessions"));
		}
		function sessionUsageOf2(ctx) {
		  return sessionUsageOf(ctx.get("sessions"));
		}

		// src/client/workspace-source.ts
		var NO_ITEMS = Object.freeze([]);
		var NO_SESSION_IDS = Object.freeze([]);
		var PENDING = Object.freeze({
		  phase: "pending",
		  items: NO_ITEMS
		});
		var READY_EMPTY = Object.freeze({
		  phase: "ready",
		  items: NO_ITEMS
		});
		var UNSET = Symbol("workspace-source/unset");
		function injectionPortOf(ctx) {
		  if (ctx === null || typeof ctx !== "object") return void 0;
		  return typeof ctx.inject === "function" ? ctx : void 0;
		}
		function listPortOf(service) {
		  if (service === null || typeof service !== "object") return void 0;
		  const list = service.list;
		  if (list === null || typeof list !== "object") return void 0;
		  const candidate = list;
		  if (typeof candidate.getSnapshot !== "function") return void 0;
		  if (typeof candidate.subscribe !== "function") return void 0;
		  return list;
		}
		function projectSnapshot(raw) {
		  if (raw === null || typeof raw !== "object") return PENDING;
		  const items = raw.items;
		  if (!Array.isArray(items)) return PENDING;
		  if (raw.phase === "pending") return PENDING;
		  const projected = [];
		  for (const row of items) {
		    const item = itemOf(row);
		    if (item !== void 0) projected.push(item);
		  }
		  return projected.length === 0 ? READY_EMPTY : { phase: "ready", items: projected };
		}
		function itemOf(row) {
		  if (row === null || typeof row !== "object") return void 0;
		  const view = row;
		  const id = view.workspaceId;
		  if (typeof id !== "string" || id === "") return void 0;
		  return {
		    id,
		    // `title` 允许为空串（消费方用 `path` 兜底显示）；`path` 缺失同样降级成空串。
		    title: typeof view.title === "string" ? view.title : "",
		    path: typeof view.path === "string" ? view.path : "",
		    sessionIds: sessionIdsOf(view.sessionIds)
		  };
		}
		function sessionIdsOf(value) {
		  if (!Array.isArray(value)) return NO_SESSION_IDS;
		  const ids = [];
		  for (const id of value) {
		    if (typeof id === "string" && id !== "") ids.push(id);
		  }
		  return ids.length === 0 ? NO_SESSION_IDS : ids;
		}
		function createWorkspaceListSource(ctx) {
		  const listeners = /* @__PURE__ */ new Set();
		  let bound;
		  let upstream = UNSET;
		  let cached = PENDING;
		  let stopUpstream;
		  const notify = () => {
		    for (const listener of Array.from(listeners)) listener();
		  };
		  const reset = () => {
		    bound = void 0;
		    upstream = UNSET;
		    cached = PENDING;
		  };
		  const attach = (service) => {
		    const list = listPortOf(service);
		    if (list === void 0) return void 0;
		    let stop;
		    try {
		      stop = list.subscribe(notify);
		    } catch {
		      return void 0;
		    }
		    bound = list;
		    upstream = UNSET;
		    cached = PENDING;
		    stopUpstream = stop;
		    let detached = false;
		    notify();
		    return () => {
		      if (detached) return;
		      detached = true;
		      const release = stopUpstream;
		      stopUpstream = void 0;
		      try {
		        release?.();
		      } catch {
		      }
		      reset();
		      notify();
		    };
		  };
		  const source = {
		    getSnapshot: () => {
		      const list = bound;
		      if (list === void 0) return PENDING;
		      let raw;
		      try {
		        raw = list.getSnapshot();
		      } catch {
		        return PENDING;
		      }
		      if (raw === upstream) return cached;
		      upstream = raw;
		      cached = projectSnapshot(raw);
		      return cached;
		    },
		    subscribe: (listener) => {
		      listeners.add(listener);
		      return () => {
		        listeners.delete(listener);
		      };
		    }
		  };
		  injectionPortOf(ctx)?.inject(["workspaces"], (scope) => attach(scope.workspaces));
		  return source;
		}

		// src/client/WorkspaceConfigPage.tsx
		var import_react2 = require("react");
		var import_dsh_client_ui_primitives2 = require("@deepseek-ai/dsh-client-ui-primitives");

		// src/client/workspace-choice.ts
		var UNASSIGNED = { kind: "unassigned" };
		var NO_CONTEXT = { kind: "none" };
		var WORKSPACE_KEY_PREFIX = "workspace:";
		var UNASSIGNED_KEY = "unassigned";
		var NO_CONTEXT_KEY = "none";
		function pickerItems(items) {
		  return [...items.map(selectionOfItem), UNASSIGNED];
		}
		function selectionOfItem(item) {
		  return { kind: "workspace", id: item.id, title: item.title, path: item.path };
		}
		function selectionKeyOf(selection) {
		  switch (selection.kind) {
		    case "workspace":
		      return `${WORKSPACE_KEY_PREFIX}${selection.id}`;
		    case "unassigned":
		      return UNASSIGNED_KEY;
		    case "none":
		      return NO_CONTEXT_KEY;
		  }
		}
		function selectionFromKey(key, items) {
		  if (key === UNASSIGNED_KEY) return UNASSIGNED;
		  if (key === NO_CONTEXT_KEY) return NO_CONTEXT;
		  if (!key.startsWith(WORKSPACE_KEY_PREFIX)) return void 0;
		  const id = key.slice(WORKSPACE_KEY_PREFIX.length);
		  return items.find((item) => item.kind === "workspace" && item.id === id);
		}
		function defaultSelection(items, usage, currentSessionId) {
		  if (items.length === 0) return UNASSIGNED;
		  let mostRecent;
		  let mostRecentUpdatedAt = 0;
		  for (const item of items) {
		    const updatedAt = latestUpdatedAtOf(item, usage);
		    if (updatedAt > mostRecentUpdatedAt) {
		      mostRecent = item;
		      mostRecentUpdatedAt = updatedAt;
		    }
		  }
		  if (mostRecent !== void 0) return selectionOfItem(mostRecent);
		  if (currentSessionId !== void 0) {
		    const own = items.find((item) => item.sessionIds.includes(currentSessionId));
		    if (own !== void 0) return selectionOfItem(own);
		  }
		  const first = items[0];
		  return first === void 0 ? UNASSIGNED : selectionOfItem(first);
		}
		function selectionLabelOf(selection, fallback) {
		  if (selection.kind !== "workspace") return fallback;
		  if (selection.title !== "") return selection.title;
		  if (selection.path !== "") return selection.path;
		  return fallback;
		}
		function latestUpdatedAtOf(item, usage) {
		  if (usage === void 0) return 0;
		  let latest = 0;
		  for (const sessionId of item.sessionIds) {
		    const entry = usage[sessionId];
		    if (entry === void 0) continue;
		    if (Number.isFinite(entry.updatedAt) && entry.updatedAt > latest) latest = entry.updatedAt;
		  }
		  return latest;
		}

		// src/client/WorkspacePicker.tsx
		var import_react = require("react");
		var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

		// src/client/page.module.css
		var cssText = "/*\n * \u300C\u5DE5\u4F5C\u533A\u914D\u7F6E\u300D\u72EC\u7ACB\u9875\u9762\u7684\u9AA8\u67B6\u6837\u5F0F\uFF08\u53D6\u4EE3\u5DF2\u4E0B\u7EBF\u7684\u5F39\u7A97\u6837\u5F0F\uFF09\u3002\n *\n * \u53EA\u8865\u5B98\u65B9 primitives \u7ED9\u4E0D\u4E86\u7684\u4E1C\u897F\uFF1A\u9875\u9762\u7684\u4E09\u6BB5\u51E0\u4F55\uFF08\u9875\u5934 / tab \u884C / \u5185\u5BB9\u5217\uFF09\u3001\u5DE5\u4F5C\u533A\n * \u9009\u62E9\u6846\u7684\u951A\u70B9\u6309\u94AE\u4E0E\u7A7A\u6001\u6587\u5B57\u5C42\u7EA7\u3002primitives \u5DF2\u7ECF\u8D1F\u8D23\u7684\u9AA8\u67B6\u4E00\u5F8B\u4E0D\u590D\u5236\u2014\u2014`SegmentedTabs`\n * \u7684 tablist\u3001\u6307\u793A\u6761\u4E0E\u952E\u76D8\u6F2B\u6E38\uFF0C`Menu` \u7684\u6D6E\u5C42\u4E0E\u884C\u6837\u5F0F\uFF0C\u90FD\u7531\u5B83\u4EEC\u81EA\u5DF1\u63D0\u4F9B\u3002\n *\n * \u51E0\u4F55\u7EAA\u5F8B\uFF08\xA73.12\uFF0CD8\uFF09\uFF1A\n * - page \u7C7B\u5403\u6EE1\u5BBF\u4E3B\u7ED9\u7684\u4E3B\u9762\u677F\u9AD8\u5EA6\uFF0C\u7EB5\u5411 flex\u3001\u5185\u5BB9\u5C45\u4E2D\uFF1B\u5DE6\u53F3\u5185\u8DDD\u8D70\u5C40\u90E8\u94A9\u5B50\n *   `--wc-page-inset`\uFF08\u515C\u5E95 `clamp(24px, 4vw, 48px)`\uFF0C\u5BBF\u4E3B\u6216\u6D4B\u8BD5\u53EF\u6574\u4F53\u8986\u76D6\uFF09\uFF1B\n * - pageBody \u7C7B\u662F\u552F\u4E00\u7684\u6EDA\u52A8\u5BB9\u5668\uFF08`flex:1; min-height:0; overflow-y:auto`\uFF09\uFF0C\u6BCF\u884C\n *   \u5185\u5BB9 `max-width:960px`\uFF08\u4E0E\u63D2\u4EF6\u9875\u540C\u5BBD\uFF0C\u5BBD\u5C4F\u4E0D\u94FA\u6EE1\u3001\u7A84\u5C4F\u4E0D\u6EA2\u51FA\uFF09\uFF1B\n * - **\u4E0D\u590D\u5236**\u63D2\u4EF6\u9875\u7684\u5438\u9876/\u7D27\u51D1\u6D4B\u91CF\uFF08`--plugin-header-*` / `data-natural` /\n *   `data-compact` / \u5BB9\u5668\u67E5\u8BE2\uFF09\uFF1A\u90A3\u5957\u51E0\u4F55\u4F9D\u8D56\u8FD0\u884C\u65F6 `ResizeObserver` \u5199\u56DE\u7684\u5185\u8054\u53D8\u91CF\uFF0C\n *   \u8131\u79BB\u5B83\u7684 JS \u5355\u72EC\u590D\u5236 CSS \u4F1A\u6E32\u67D3\u6210\u9519\u4F4D\u5E03\u5C40\uFF08D8 \u7684\u660E\u786E\u53CD\u4F8B\uFF09\u3002\n *\n * \u989C\u8272\u7EAA\u5F8B\uFF08\u4ED3\u5185\u65E2\u6709\uFF09\uFF1A\u6BCF\u4E00\u5904\u989C\u8272\u90FD\u662F `var(--dsw-alias-*, <\u515C\u5E95>)` \u5F62\u6001\uFF0C\u515C\u5E95\u503C\u53EA\u7528\n * `currentColor` \u4E0E `color-mix()` \u8FD9\u7C7B\u5173\u952E\u5B57/\u6D3E\u751F\u8272\uFF0C\u4E0D\u5199\u6B7B\u5177\u4F53\u8272\u503C\u2014\u2014\u4EE4\u724C\u6574\u4F53\u7F3A\u5E2D\u65F6\n * \u6700\u574F\u9000\u5316\u6210\u300C\u5F53\u524D\u6587\u5B57\u8272\u7684\u6DF1\u6D45\u53D8\u5316\u300D\uFF0C\u6DF1\u8272\u4E3B\u9898\u4E0B\u4E0D\u4F1A\u51FA\u73B0\u767D\u5E95\u767D\u5B57\u3002\n *\n * \u5355\u6587\u4EF6\u7EAA\u5F8B\uFF1A\u672C\u6587\u4EF6\u662F holder **\u552F\u4E00**\u7684 CSS module\uFF08\u9875\u9762\u58F3\u3001\u9009\u62E9\u6846\u3001\u7A7A\u6001\u5171\u7528\u540C\u4E00\u4E2A\n * \u5BFC\u5165\u6E90\uFF09\uFF0C\u4EA7\u7269\u56E0\u6B64\u6070\u6709\u4E00\u4E2A\u6837\u5F0F\u6CE8\u5165\u5668\uFF08\u4EA7\u7269\u65AD\u8A00\u7684\u300C\u6070 1\u300D\u6761\uFF09\u3002\n *\n * \u7C7B\u540D\u5951\u7EA6\uFF08\xA73.12\uFF1B\u7EC4\u4EF6\u6309\u6B64\u6E05\u5355\u6D88\u8D39\uFF0C\u5747\u6309 CSS Modules \u5C40\u90E8\u7C7B\u5F15\u7528\uFF09\uFF1A\n *   page\u3001pageBody\u3001pageBar\u3001pageHead\u3001pageHeading\u3001pageTitle\u3001pageIntro\u3001\n *   toolbar\u3001toolbarLabel\u3001pageTabs\u3001pageTabList\u3001tabPanel\u3001\n *   empty\u3001emptyTitle\u3001emptyHint\u3001\n *   picker\u3001pickerName\u3001pickerUnavailable\n *\n * \u6784\u5EFA\u671F\u7C7B\u540D\u7531\u6784\u5EFA\u811A\u672C\u7684 cssModulesPlugin \u91CD\u5199\u4E3A `wsc_<local>_<hash>`\uFF0C\u6837\u5F0F\u4EE5\n * `<style data-dsh-plugin=\"dsh-plugin-workspace-config\">` \u6CE8\u5165\u5230\u6587\u6863 head\u3002\n */\n\n/* \u2014\u2014 \u9875\u9762\uFF1A\u5BBF\u4E3B\u4E3B\u9762\u677F\u7684\u6574\u5757\u9AD8\u5EA6\uFF1B\u5DE6\u53F3\u7559\u767D\u53EA\u8D70\u5C40\u90E8\u94A9\u5B50\uFF0C\u4FBF\u4E8E\u5BBF\u4E3B\u6574\u4F53\u8986\u76D6 \u2014\u2014 */\n.wsc_page_3ec5c8 {\n  box-sizing: border-box;\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  height: 100%;\n  padding: 0 var(--wc-page-inset, clamp(24px, 4vw, 48px));\n  color: var(--dsw-alias-label-primary, currentColor);\n}\n\n/*\n * \u552F\u4E00\u7684\u6EDA\u52A8\u5BB9\u5668\uFF1A\u9875\u5934\u4E0E\u5185\u5BB9\u4E00\u8D77\u6EDA\u8D70\uFF08\u4E0D\u505A\u5438\u9876\uFF0CD8\uFF09\u3002\n * `align-items:center` \u8BA9 960px \u4E0A\u9650\u7684\u884C\u5728\u5BBD\u5C4F\u5C45\u4E2D\uFF1B`gap` \u662F\u9875\u5934\u4E0E\u5185\u5BB9\u5217\u4E4B\u95F4\u7684\u547C\u5438\u3002\n */\n.wsc_pageBody_3ec5c8 {\n  display: flex;\n  flex: 1;\n  flex-direction: column;\n  align-items: center;\n  gap: 24px;\n  width: 100%;\n  min-height: 0;\n  padding: 0 0 48px;\n  overflow-y: auto;\n}\n\n/* \u6BCF\u4E00\u884C\u5185\u5BB9\u4E0E\u63D2\u4EF6\u9875\u540C\u5BBD\uFF1B`flex:none` \u9632\u6B62\u5185\u5BB9\u5F88\u957F\u65F6\u628A\u9875\u5934\u538B\u6241\u3002 */\n.wsc_pageBody_3ec5c8 > * {\n  flex: none;\n  width: 100%;\n  max-width: 960px;\n}\n\n/* \u2014\u2014 \u9875\u5934\uFF1A\u6807\u9898 + \u7B80\u4ECB\u3001\u5DE5\u4F5C\u533A\u9009\u62E9\u6846\u3001\u5206\u8282 tab \u884C\uFF08flex-wrap \u4E09\u6BB5\u5F0F\uFF09 \u2014\u2014 */\n.wsc_pageBar_3ec5c8 {\n  display: flex;\n  flex-direction: column;\n  padding-top: 24px;\n}\n\n.wsc_pageHead_3ec5c8 {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: flex-start;\n  justify-content: space-between;\n  gap: 16px;\n}\n\n.wsc_pageHeading_3ec5c8 {\n  order: 1;\n  min-width: 0;\n  max-width: 100%;\n}\n\n.wsc_pageTitle_3ec5c8 {\n  margin: 0;\n  color: var(--dsw-alias-label-primary, currentColor);\n  font-size: 20px;\n  font-weight: 500;\n  line-height: 28px;\n}\n\n.wsc_pageIntro_3ec5c8 {\n  margin: 4px 0 0;\n  color: var(--dsw-alias-label-secondary, currentColor);\n  font-size: 13px;\n  line-height: 20px;\n}\n\n/* \u5DE5\u5177\u680F\uFF1A\u53F3\u5BF9\u9F50\u7684\u5DE5\u4F5C\u533A\u9009\u62E9\u6846\uFF1B\u672A\u5C31\u7EEA\u65F6\u8FD9\u91CC\u662F\u4E00\u6BB5\u7EAF\u6587\u6848\uFF08\u89C1 pickerUnavailable \u7C7B\uFF09\u3002 */\n.wsc_toolbar_3ec5c8 {\n  display: flex;\n  flex: 0 auto;\n  flex-wrap: wrap;\n  order: 2;\n  align-items: center;\n  justify-content: flex-end;\n  gap: 8px 16px;\n  min-width: 0;\n  white-space: nowrap;\n}\n\n/* \u300C\u5DE5\u4F5C\u533A\u300D\u5C0F\u6807\u7B7E\uFF1A\u53EA\u89E3\u91CA\u9009\u62E9\u6846\u7684\u4F5C\u7528\u57DF\uFF0C\u4E0D\u62A2\u4E3B\u6807\u9898\u7684\u5C42\u7EA7\u3002 */\n.wsc_toolbarLabel_3ec5c8 {\n  color: var(--dsw-alias-label-secondary, currentColor);\n  font-size: 13px;\n  line-height: 20px;\n}\n\n/* tab \u884C\u72EC\u5360\u4E00\u6574\u884C\uFF1A\u9875\u5934\u6362\u884C\u540E\u843D\u5728\u6807\u9898\u4E0E\u5DE5\u5177\u680F\u4E4B\u4E0B\u3002 */\n.wsc_pageTabs_3ec5c8 {\n  display: flex;\n  flex: 100%;\n  order: 3;\n}\n\n/* \u53EA\u8BA9 tab \u884C\u5BBD\u5230\u5185\u5BB9\uFF0C\u4E0D\u968F\u5DE5\u5177\u680F\u4E00\u8D77\u88AB\u62C9\u4F38\uFF1B240px \u662F\u4E24\u5230\u4E09\u6BB5\u7684\u8212\u9002\u4E0B\u9650\u3002 */\n.wsc_pageTabList_3ec5c8 {\n  width: fit-content;\n  min-width: 240px;\n}\n\n/* \u5185\u5BB9\u5217\uFF1A\u4E00\u6B21\u53EA\u6302\u4E00\u4E2A\u5206\u8282\uFF1B\u5206\u8282\u5185\u90E8\u7684\u7EB5\u5411\u6392\u5E03\u7531\u5206\u8282\u81EA\u5DF1\u51B3\u5B9A\u3002 */\n.wsc_tabPanel_3ec5c8 {\n  display: flex;\n  flex-direction: column;\n  gap: 24px;\n  min-width: 0;\n}\n\n/* \u2014\u2014 \u7A7A\u6001\uFF1A\u6CA1\u6709\u4EFB\u4F55\u5DF2\u6CE8\u518C\u5206\u8282\u65F6\u89E3\u91CA\u300C\u4E3A\u4EC0\u4E48\u662F\u7A7A\u7684\u300D\uFF08\u4E0D\u70B9\u540D\u4EFB\u4F55\u5177\u4F53\u63D2\u4EF6\uFF0CD14\uFF09 \u2014\u2014 */\n.wsc_empty_3ec5c8 {\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  justify-content: center;\n  gap: 6px;\n  min-height: 240px;\n  padding: 64px 24px;\n  color: var(--dsw-alias-label-secondary, currentColor);\n  text-align: center;\n}\n\n.wsc_emptyTitle_3ec5c8 {\n  margin: 0;\n  color: var(--dsw-alias-label-primary, currentColor);\n  font-size: 14px;\n  font-weight: 500;\n  line-height: 22px;\n}\n\n.wsc_emptyHint_3ec5c8 {\n  margin: 0;\n  color: var(--dsw-alias-label-tertiary, currentColor);\n  font-size: 13px;\n  line-height: 20px;\n}\n\n/* \u2014\u2014 \u5DE5\u4F5C\u533A\u9009\u62E9\u6846\uFF1A`Menu` \u7684\u951A\u70B9\u6309\u94AE\uFF08\u6D6E\u5C42\u4E0E\u83DC\u5355\u884C\u7531 primitives \u6E32\u67D3\uFF09 \u2014\u2014 */\n.wsc_picker_3ec5c8 {\n  box-sizing: border-box;\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n  max-width: 100%;\n  padding: 4px 8px;\n  border: 1px solid\n    var(--dsw-alias-border-l3, color-mix(in srgb, currentColor 16%, transparent));\n  border-radius: var(--dsw-radius-sm, 6px);\n  background: none;\n  color: var(--dsw-alias-label-primary, currentColor);\n  font: inherit;\n  font-size: 13px;\n  line-height: 20px;\n  text-align: left;\n  cursor: pointer;\n}\n\n.wsc_picker_3ec5c8:hover,\n.wsc_picker_3ec5c8[aria-expanded='true'] {\n  background: var(--dsw-alias-interactive-bg-hover, color-mix(in srgb, currentColor 8%, transparent));\n}\n\n/* \u7981\u7528\u6001\uFF1A\u6E05\u5355\u6E90\u672A\u5C31\u7EEA\u65F6\u4EE3\u66FF\u300C\u770B\u8D77\u6765\u80FD\u70B9\u4F46\u70B9\u4E86\u6CA1\u53CD\u5E94\u300D\u7684\u534A\u53EF\u7528\u6309\u94AE\u3002 */\n.wsc_picker_3ec5c8:disabled {\n  opacity: 0.6;\n  cursor: default;\n}\n\n.wsc_picker_3ec5c8:focus-visible {\n  outline: 2px solid var(--dsw-alias-state-business-primary, currentColor);\n  outline-offset: -2px;\n}\n\n/* \u5DE5\u4F5C\u533A\u540D\u8FC7\u957F\u65F6\u7701\u7565\uFF0C\u800C\u4E0D\u662F\u628A\u5DE5\u5177\u680F\u6491\u51FA\u5185\u5BB9\u5BBD\u3002 */\n.wsc_pickerName_3ec5c8 {\n  min-width: 0;\n  overflow: hidden;\n  white-space: nowrap;\n  text-overflow: ellipsis;\n}\n\n/* \u6E05\u5355\u6E90\u672A\u5C31\u7EEA\u65F6\u66FF\u4EE3\u9009\u62E9\u6846\u7684\u7EAF\u6587\u6848\uFF08\u672A\u5C31\u7EEA\u662F\u77ED\u6682\u72B6\u6001\uFF0C\u4E0D\u9700\u8981\u4E00\u4E2A\u5047\u6309\u94AE\uFF09\u3002 */\n.wsc_pickerUnavailable_3ec5c8 {\n  color: var(--dsw-alias-label-tertiary, currentColor);\n  font-size: 13px;\n  line-height: 20px;\n}\n";
		if (typeof document !== "undefined" && document.querySelector('style[data-dsh-plugin="dsh-plugin-workspace-config"][data-dsh-css="3ec5c8"]') === null) {
		  const style = document.createElement("style");
		  style.setAttribute("data-dsh-plugin", "dsh-plugin-workspace-config");
		  style.setAttribute("data-dsh-css", "3ec5c8");
		  style.textContent = cssText;
		  document.head.appendChild(style);
		}
		var page_default = { "page": "wsc_page_3ec5c8", "pageBody": "wsc_pageBody_3ec5c8", "pageBar": "wsc_pageBar_3ec5c8", "pageHead": "wsc_pageHead_3ec5c8", "pageHeading": "wsc_pageHeading_3ec5c8", "pageTitle": "wsc_pageTitle_3ec5c8", "pageIntro": "wsc_pageIntro_3ec5c8", "toolbar": "wsc_toolbar_3ec5c8", "toolbarLabel": "wsc_toolbarLabel_3ec5c8", "pageTabs": "wsc_pageTabs_3ec5c8", "pageTabList": "wsc_pageTabList_3ec5c8", "tabPanel": "wsc_tabPanel_3ec5c8", "empty": "wsc_empty_3ec5c8", "emptyTitle": "wsc_emptyTitle_3ec5c8", "emptyHint": "wsc_emptyHint_3ec5c8", "picker": "wsc_picker_3ec5c8", "pickerName": "wsc_pickerName_3ec5c8", "pickerUnavailable": "wsc_pickerUnavailable_3ec5c8" };

		// src/client/WorkspacePicker.tsx
		var import_jsx_runtime = require("react/jsx-runtime");
		function WorkspacePicker({ items, value, disabled, t, onSelect }) {
		  const [open, setOpen] = (0, import_react.useState)(false);
		  const unavailable = value.kind === "none";
		  const locked = disabled === true || unavailable;
		  const menuOpen = open && !locked;
		  const label = unavailable ? t("page.workspace.unavailable") : selectionLabelOf(value, t("page.workspace.unassigned"));
		  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		    import_dsh_client_ui_primitives.Menu,
		    {
		      open: menuOpen,
		      anchor: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
		        "button",
		        {
		          type: "button",
		          className: page_default.picker,
		          "aria-label": t("page.workspace.label"),
		          "aria-haspopup": "menu",
		          "aria-expanded": menuOpen,
		          disabled: locked,
		          onClick: () => {
		            setOpen((previous) => !previous);
		          },
		          children: [
		            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: page_default.pickerName, children: label }),
		            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconChevronDownOutlineRegular, {})
		          ]
		        }
		      ),
		      items: items.map((item) => ({
		        id: selectionKeyOf(item),
		        label: selectionLabelOf(item, t("page.workspace.unassigned"))
		      })),
		      selectedId: selectionKeyOf(value),
		      onSelect: (key) => {
		        const next = selectionFromKey(key, items);
		        setOpen(false);
		        if (next !== void 0) onSelect(next);
		      },
		      onClose: () => {
		        setOpen(false);
		      },
		      portal: true
		    }
		  );
		}

		// src/client/WorkspaceConfigPage.tsx
		var import_jsx_runtime2 = require("react/jsx-runtime");
		function buildTabItems(rows, tabsId) {
		  const items = rows.map((row) => ({
		    value: row.id,
		    label: row.label,
		    id: `${tabsId}-${row.id}`,
		    panelId: `${tabsId}-${row.id}-panel`
		  }));
		  const [first, ...rest] = items;
		  return first === void 0 ? void 0 : [first, ...rest];
		}
		function WorkspaceConfigPage(props) {
		  const { sections, workspaces, currentSessionId, sessionUsage, t, renderSlot } = props;
		  const rows = (0, import_react2.useSyncExternalStore)(sections.subscribe, sections.getSnapshot);
		  const list = (0, import_react2.useSyncExternalStore)(workspaces.subscribe, workspaces.getSnapshot);
		  const [selected, setSelected] = (0, import_react2.useState)(void 0);
		  const [chosen, setChosen] = (0, import_react2.useState)(void 0);
		  const tabsId = (0, import_react2.useId)();
		  const activeId = rows.some((row) => row.id === selected) ? selected : rows[0]?.id;
		  const chosenValid = chosen !== void 0 && (chosen.kind === "unassigned" || chosen.kind === "workspace" && list.items.some((item) => item.id === chosen.id));
		  const workspace = chosenValid ? chosen : list.phase === "ready" ? defaultSelection(list.items, sessionUsage()?.updatedAtById, currentSessionId()) : NO_CONTEXT;
		  const tabItems = buildTabItems(rows, tabsId);
		  if (tabItems === void 0 || activeId === void 0) {
		    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: page_default.page, "data-wc-page": "", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: page_default.pageBody, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: page_default.empty, role: "status", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: page_default.emptyTitle, children: t("page.empty.title") }),
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: page_default.emptyHint, children: t("page.empty.hint") })
		    ] }) }) });
		  }
		  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: page_default.page, "data-wc-page": "", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: page_default.pageBody, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: page_default.pageBar, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("header", { className: page_default.pageHead, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: page_default.pageHeading, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h1", { className: page_default.pageTitle, children: t("page.title") }),
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: page_default.pageIntro, children: t("page.intro") })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: page_default.toolbar, children: list.phase === "ready" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: page_default.toolbarLabel, children: t("page.workspace.label") }),
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		          WorkspacePicker,
		          {
		            items: pickerItems(list.items),
		            value: workspace,
		            t,
		            onSelect: setChosen
		          }
		        )
		      ] }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: page_default.pickerUnavailable, children: t("page.workspace.unavailable") }) }),
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: page_default.pageTabs, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		        import_dsh_client_ui_primitives2.SegmentedTabs,
		        {
		          size: "sm",
		          className: page_default.pageTabList,
		          label: t("page.tabs.label"),
		          items: tabItems,
		          value: activeId,
		          onChange: setSelected
		        }
		      ) })
		    ] }) }),
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		      "div",
		      {
		        role: "tabpanel",
		        id: `${tabsId}-${activeId}-panel`,
		        "aria-labelledby": `${tabsId}-${activeId}`,
		        className: page_default.tabPanel,
		        children: renderSlot("workspace-config.section", { workspace }, { only: activeId })
		      }
		    )
		  ] }) });
		}

		// src/client/WorkspaceConfigPanelIcon.tsx
		var import_dsh_client_ui_primitives3 = require("@deepseek-ai/dsh-client-ui-primitives");
		var import_jsx_runtime3 = require("react/jsx-runtime");
		function WorkspaceConfigPanelIcon({ size }) {
		  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.IconWorkspaceTreeOutlineRegular, { size });
		}

		// src/client/index.ts
		var LOG_LABEL = "workspace-config";
		var inject = ["slots", "locale"];
		function apply(ctx) {
		  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "workspace-config: \u53CC\u8BED\u6587\u6848");
		  const sections = createSectionsSource(ctx);
		  const workspaces = createWorkspaceListSource(ctx);
		  const t = ctx.locale.bind(NS);
		  const pair = createPanelPair((message, error) => {
		    ctx.logger?.warn(`${LOG_LABEL}: ${message}`);
		    if (error !== void 0) ctx.logger?.warn(error);
		  });
		  ctx.slots.inject(
		    "main",
		    () => pair.page(
		      () => ctx.slots.register(
		        {
		          name: "main",
		          key: PANEL_ID,
		          // 'workspace-config'（= panellist 的 id）
		          locale: NS,
		          // 声明即认领：贡献方的软注册回调在此之后才有机会执行；同时这也是页面
		          // `renderSlot` 的渲染授权。
		          //
		          // 字面量直写（与 contract.ts 的 WORKSPACE_CONFIG_SECTION 同值）：本行是
		          // 产物断言「`lib/client.js` 里 workspace-config.section 至少出现两次」的
		          // 声明侧锚点；渲染侧锚点在 WorkspaceConfigPage 的 renderSlot 调用点。
		          children: { "workspace-config.section": { kind: "list", scope: "root" } },
		          // 端口函数（非服务值）：inject 工厂每 entry 只跑一次，服务要现取。
		          inject: () => ({
		            sections,
		            // apply 期构造的 nav 行投影源
		            workspaces,
		            // apply 期构造的工作区清单源
		            currentSessionId: () => currentSessionIdOf2(ctx),
		            sessionUsage: () => sessionUsageOf2(ctx)
		          })
		        },
		        WorkspaceConfigPage
		      )
		    )
		  );
		  ctx.slots.inject(
		    "sidebar.panellist",
		    () => pair.row(
		      () => ctx.slots.register(
		        {
		          name: "sidebar.panellist",
		          id: PANEL_ID,
		          // 必须等于 main 的 key：宿主 selectPanel(id) 直接用它
		          order: PANEL_ORDER,
		          // 20：官方面板 plugins=0 / schedules=10 之后
		          locale: NS,
		          label: () => t("entry.label")
		          // thunk：locale 切换无需重注册
		        },
		        WorkspaceConfigPanelIcon
		      )
		    )
		  );
		}

		return module.exports;
	}
});
