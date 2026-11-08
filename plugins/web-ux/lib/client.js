window.__ModuleLoader__.load({
	id: "dsh-plugin-web-ux",
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
		  BADGE_ORDER: () => BADGE_ORDER,
		  DELETE_DIALOG_ID: () => DELETE_DIALOG_ID,
		  DELETE_DIALOG_ORDER: () => DELETE_DIALOG_ORDER,
		  DELETE_MENU_ID: () => DELETE_MENU_ID,
		  DELETE_MENU_ORDER: () => DELETE_MENU_ORDER,
		  NOTICE_ID: () => NOTICE_ID,
		  NOTICE_ORDER: () => NOTICE_ORDER,
		  SECTION_ID: () => SECTION_ID,
		  SECTION_ORDER: () => SECTION_ORDER,
		  SECTION_SEAT: () => SECTION_SEAT,
		  apply: () => apply,
		  inject: () => inject
		});
		module.exports = __toCommonJS(index_exports);

		// src/client/ProviderBadge.tsx
		var import_react = require("react");

		// src/client/badge.module.css
		var cssText = "/*\n * The provider badge capsule. Every value mirrors the official StatsPills\n * capsule in `@deepseek-ai/dsh-client-ui-chat` \u2014 same type scale, tertiary\n * label color, 999px radius, and 1px/8px padding \u2014 so the appended entry reads\n * as part of the same status row instead of a foreign control. The\n * `--dsh-content-font-*` and `--dsw-alias-*` custom properties are the shell's\n * own design tokens; the fallbacks keep the capsule legible if a token moves.\n */\n.wux_root_09c5a1 {\n  box-sizing: border-box;\n  min-width: 0;\n  max-width: 100%;\n  display: inline-flex;\n  font-size: calc(var(--dsh-content-font-size-secondary, 13px) - 1px);\n  line-height: calc(20px + var(--dsh-content-font-delta-secondary, 0px));\n}\n\n.wux_pill_09c5a1 {\n  box-sizing: border-box;\n  corner-shape: round;\n  max-width: 100%;\n  color: var(--dsw-alias-label-tertiary);\n  font: inherit;\n  line-height: inherit;\n  white-space: nowrap;\n  background: 0 0;\n  border: none;\n  border-radius: 999px;\n  align-items: center;\n  gap: 6px;\n  padding: 1px 8px;\n  display: inline-flex;\n}\n\n/*\n * Width safety: the label is the only elastic part of the capsule, so an\n * arbitrarily long provider name can never push the status row into\n * horizontal scrolling \u2014 it truncates to an ellipsis instead.\n */\n.wux_label_09c5a1 {\n  min-width: 0;\n  max-width: 10em;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n";
		if (typeof document !== "undefined" && document.querySelector('style[data-dsh-plugin="dsh-plugin-web-ux"][data-dsh-css="09c5a1"]') === null) {
		  const style = document.createElement("style");
		  style.setAttribute("data-dsh-plugin", "dsh-plugin-web-ux");
		  style.setAttribute("data-dsh-css", "09c5a1");
		  style.textContent = cssText;
		  document.head.appendChild(style);
		}
		var badge_default = { "root": "wux_root_09c5a1", "pill": "wux_pill_09c5a1", "label": "wux_label_09c5a1" };

		// src/client/ProviderBadge.tsx
		var import_jsx_runtime = require("react/jsx-runtime");
		function badgeLabel(state) {
		  const current = state.current;
		  return current === null ? null : `${current.provider}/${current.model}`;
		}
		function badgeTooltip(state) {
		  const current = state.current;
		  return current === null ? null : `${current.provider} \xB7 ${current.model}`;
		}
		function ProviderBadge({ sessionId, directoryFor }) {
		  const resolver = (0, import_react.useRef)(directoryFor);
		  resolver.current = directoryFor;
		  const store = (0, import_react.useMemo)(() => {
		    try {
		      return resolver.current(sessionId).store;
		    } catch {
		      return void 0;
		    }
		  }, [sessionId]);
		  const subscribe = (0, import_react.useMemo)(
		    () => (onChange) => store === void 0 ? () => {
		    } : store.subscribe(onChange),
		    [store]
		  );
		  const readLabel = (0, import_react.useMemo)(() => () => store === void 0 ? null : badgeLabel(store.getSnapshot()), [store]);
		  const readTooltip = (0, import_react.useMemo)(() => () => store === void 0 ? null : badgeTooltip(store.getSnapshot()), [store]);
		  const label = (0, import_react.useSyncExternalStore)(subscribe, readLabel);
		  const tooltip = (0, import_react.useSyncExternalStore)(subscribe, readTooltip);
		  if (label === null) return null;
		  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: badge_default.root, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: badge_default.pill, title: tooltip ?? void 0, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: badge_default.label, children: label }) }) });
		}

		// src/client/DeleteSessionMenuItem.tsx
		var import_react2 = require("react");
		var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		var import_jsx_runtime2 = require("react/jsx-runtime");
		function DeleteSessionMenuItem({
		  sessionId,
		  displayTitle,
		  useMenuOpenState,
		  requests,
		  archived,
		  t
		}) {
		  const [, setMenuOpen] = useMenuOpenState();
		  const source = (0, import_react2.useRef)(archived);
		  source.current = archived;
		  const subscribe = (0, import_react2.useMemo)(
		    () => (onChange) => source.current?.subscribe(onChange) ?? (() => {
		    }),
		    []
		  );
		  const read = (0, import_react2.useMemo)(() => {
		    let cached = [];
		    return () => {
		      const next = source.current?.getSnapshot().archivedSessionIds;
		      if (next === void 0) return cached;
		      if (next.length !== cached.length || next.some((id, index) => id !== cached[index])) cached = next;
		      return cached;
		    };
		  }, []);
		  const archivedSessionIds = (0, import_react2.useSyncExternalStore)(subscribe, read);
		  if (archived === void 0) return null;
		  if (!archivedSessionIds.includes(sessionId)) return null;
		  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		    import_dsh_client_ui_primitives.MenuItemButton,
		    {
		      icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives.IconTrashOutlineRegular, {}),
		      danger: true,
		      onSelect: () => {
		        setMenuOpen(false);
		        requests.request({ sessionId, displayTitle });
		      },
		      children: t("menu.delete")
		    }
		  );
		}

		// src/client/DeleteSessionDialog.tsx
		var import_react3 = require("react");
		var import_dsh_client_ui_primitives2 = require("@deepseek-ai/dsh-client-ui-primitives");

		// src/contract.ts
		var CHANNEL = "/web-ux";
		var PREVIEW_ENDPOINT = "preview-delete";
		var DELETE_ENDPOINT = "delete-session";
		var PREVIEW_BATCH_ENDPOINT = "preview-delete-batch";
		var DELETE_BATCH_ENDPOINT = "delete-session-batch";
		var LIST_MIGRATED_ENDPOINT = "list-migrated";
		var DELETE_MIGRATED_ENDPOINT = "delete-migrated";
		var RESTORE_MIGRATED_ENDPOINT = "restore-migrated";
		var MAX_BATCH_TARGETS = 500;
		var MAX_LISTED_MIGRATED = 2e3;
		function readObject(value, subject) {
		  if (typeof value !== "object" || value === null || Array.isArray(value)) {
		    return { ok: false, message: `${subject}\u4E0D\u662F\u5BF9\u8C61` };
		  }
		  return { ok: true, value };
		}
		function readNonEmptyString(value, subject) {
		  if (typeof value !== "string" || value === "") return { ok: false, message: `${subject} \u7F3A\u5931\u6216\u4E0D\u662F\u975E\u7A7A\u5B57\u7B26\u4E32` };
		  return { ok: true, value };
		}
		function readNonNegativeNumber(record, key, subject) {
		  const value = record[key];
		  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
		    return { ok: false, message: `${subject} \u7684 ${key} \u4E0D\u662F\u975E\u8D1F\u6709\u9650\u6570` };
		  }
		  return { ok: true, value };
		}
		function readCount(record, key, subject) {
		  const value = record[key];
		  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
		    return { ok: false, message: `${subject} \u7684 ${key} \u4E0D\u662F\u975E\u8D1F\u5B89\u5168\u6574\u6570` };
		  }
		  return { ok: true, value };
		}
		function parsePreview(value) {
		  if (typeof value !== "object" || value === null || Array.isArray(value)) {
		    return { ok: false, message: "\u9884\u89C8\u54CD\u5E94\u4E0D\u662F\u5BF9\u8C61" };
		  }
		  const record = value;
		  const sessionCount = readCount(record, "sessionCount", "\u9884\u89C8\u54CD\u5E94");
		  if (!sessionCount.ok) return sessionCount;
		  const descendantCount = readCount(record, "descendantCount", "\u9884\u89C8\u54CD\u5E94");
		  if (!descendantCount.ok) return descendantCount;
		  const logBytes = record["logBytes"];
		  if (typeof logBytes !== "number" || !Number.isFinite(logBytes) || logBytes < 0) {
		    return { ok: false, message: "\u9884\u89C8\u54CD\u5E94\u7684 logBytes \u4E0D\u662F\u975E\u8D1F\u6709\u9650\u6570" };
		  }
		  const archiveRoot = record["archiveRoot"];
		  if (typeof archiveRoot !== "string" || archiveRoot === "") {
		    return { ok: false, message: "\u9884\u89C8\u54CD\u5E94\u7684 archiveRoot \u7F3A\u5931\u6216\u4E0D\u662F\u975E\u7A7A\u5B57\u7B26\u4E32" };
		  }
		  return {
		    ok: true,
		    value: {
		      sessionCount: sessionCount.value,
		      descendantCount: descendantCount.value,
		      logBytes,
		      archiveRoot
		    }
		  };
		}
		function readRejectedTargets(value) {
		  if (!Array.isArray(value)) return { ok: false, message: "\u6279\u91CF\u9884\u89C8\u54CD\u5E94\u7684 rejected \u4E0D\u662F\u6570\u7EC4" };
		  const items = [];
		  for (let index = 0; index < value.length; index += 1) {
		    const subject = `\u6279\u91CF\u9884\u89C8\u54CD\u5E94\u7684 rejected[${index}]`;
		    const object = readObject(value[index], subject);
		    if (!object.ok) return object;
		    const sessionId = readNonEmptyString(object.value["sessionId"], `${subject}.sessionId`);
		    if (!sessionId.ok) return sessionId;
		    const code = readNonEmptyString(object.value["code"], `${subject}.code`);
		    if (!code.ok) return code;
		    const message = object.value["message"];
		    if (typeof message !== "string") return { ok: false, message: `${subject}.message \u4E0D\u662F\u5B57\u7B26\u4E32` };
		    items.push({ sessionId: sessionId.value, code: code.value, message });
		  }
		  return { ok: true, value: items };
		}
		function parseBatchPreview(value) {
		  const object = readObject(value, "\u6279\u91CF\u9884\u89C8\u54CD\u5E94");
		  if (!object.ok) return object;
		  const record = object.value;
		  const targetCount = readCount(record, "targetCount", "\u6279\u91CF\u9884\u89C8\u54CD\u5E94");
		  if (!targetCount.ok) return targetCount;
		  const sessionCount = readCount(record, "sessionCount", "\u6279\u91CF\u9884\u89C8\u54CD\u5E94");
		  if (!sessionCount.ok) return sessionCount;
		  const descendantCount = readCount(record, "descendantCount", "\u6279\u91CF\u9884\u89C8\u54CD\u5E94");
		  if (!descendantCount.ok) return descendantCount;
		  const logBytes = readNonNegativeNumber(record, "logBytes", "\u6279\u91CF\u9884\u89C8\u54CD\u5E94");
		  if (!logBytes.ok) return logBytes;
		  const archiveRoot = readNonEmptyString(record["archiveRoot"], "\u6279\u91CF\u9884\u89C8\u54CD\u5E94\u7684 archiveRoot");
		  if (!archiveRoot.ok) return archiveRoot;
		  const rejected = readRejectedTargets(record["rejected"]);
		  if (!rejected.ok) return rejected;
		  return {
		    ok: true,
		    value: {
		      targetCount: targetCount.value,
		      sessionCount: sessionCount.value,
		      descendantCount: descendantCount.value,
		      logBytes: logBytes.value,
		      archiveRoot: archiveRoot.value,
		      rejected: rejected.value
		    }
		  };
		}
		function parseMigratedListing(value) {
		  const object = readObject(value, "\u5DF2\u8FC1\u79FB\u5217\u8868\u54CD\u5E94");
		  if (!object.ok) return object;
		  const record = object.value;
		  const archiveRoot = readNonEmptyString(record["archiveRoot"], "\u5DF2\u8FC1\u79FB\u5217\u8868\u54CD\u5E94\u7684 archiveRoot");
		  if (!archiveRoot.ok) return archiveRoot;
		  const entries = record["entries"];
		  if (!Array.isArray(entries)) return { ok: false, message: "\u5DF2\u8FC1\u79FB\u5217\u8868\u54CD\u5E94\u7684 entries \u4E0D\u662F\u6570\u7EC4" };
		  const items = [];
		  for (let index = 0; index < entries.length; index += 1) {
		    const subject = `\u5DF2\u8FC1\u79FB\u5217\u8868\u54CD\u5E94\u7684 entries[${index}]`;
		    const entry = readObject(entries[index], subject);
		    if (!entry.ok) return entry;
		    const sessionId = readNonEmptyString(entry.value["sessionId"], `${subject}.sessionId`);
		    if (!sessionId.ok) return sessionId;
		    const dirName = readNonEmptyString(entry.value["dirName"], `${subject}.dirName`);
		    if (!dirName.ok) return dirName;
		    const projectDir = readNonEmptyString(entry.value["projectDir"], `${subject}.projectDir`);
		    if (!projectDir.ok) return projectDir;
		    const bytes = readNonNegativeNumber(entry.value, "bytes", subject);
		    if (!bytes.ok) return bytes;
		    const updatedAt = readNonNegativeNumber(entry.value, "updatedAt", subject);
		    if (!updatedAt.ok) return updatedAt;
		    items.push({
		      sessionId: sessionId.value,
		      dirName: dirName.value,
		      projectDir: projectDir.value,
		      bytes: bytes.value,
		      updatedAt: updatedAt.value
		    });
		  }
		  const truncated = record["truncated"];
		  if (typeof truncated !== "boolean") return { ok: false, message: "\u5DF2\u8FC1\u79FB\u5217\u8868\u54CD\u5E94\u7684 truncated \u4E0D\u662F\u5E03\u5C14\u503C" };
		  return { ok: true, value: { archiveRoot: archiveRoot.value, entries: items, truncated } };
		}
		function readStringList(record, key, subject) {
		  const value = record[key];
		  if (!Array.isArray(value)) return { ok: false, message: `${subject} \u7684 ${key} \u4E0D\u662F\u6570\u7EC4` };
		  const items = [];
		  for (const item of value) {
		    if (typeof item !== "string") return { ok: false, message: `${subject} \u7684 ${key} \u542B\u975E\u5B57\u7B26\u4E32\u9879` };
		    items.push(item);
		  }
		  return { ok: true, value: items };
		}
		function parseRestoreOutcome(value) {
		  const object = readObject(value, "\u6062\u590D\u54CD\u5E94");
		  if (!object.ok) return object;
		  const record = object.value;
		  const restored = record["restored"];
		  if (!Array.isArray(restored)) return { ok: false, message: "\u6062\u590D\u54CD\u5E94\u7684 restored \u4E0D\u662F\u6570\u7EC4" };
		  const items = [];
		  for (let index = 0; index < restored.length; index += 1) {
		    const subject = `\u6062\u590D\u54CD\u5E94\u7684 restored[${index}]`;
		    const entry = readObject(restored[index], subject);
		    if (!entry.ok) return entry;
		    const sessionId = readNonEmptyString(entry.value["sessionId"], `${subject}.sessionId`);
		    if (!sessionId.ok) return sessionId;
		    const workspaceId = entry.value["workspaceId"];
		    if (workspaceId !== null && typeof workspaceId !== "string") {
		      return { ok: false, message: `${subject}.workspaceId \u65E2\u4E0D\u662F\u5B57\u7B26\u4E32\u4E5F\u4E0D\u662F null` };
		    }
		    items.push({ sessionId: sessionId.value, workspaceId });
		  }
		  const warnings = readStringList(record, "warnings", "\u6062\u590D\u54CD\u5E94");
		  if (!warnings.ok) return warnings;
		  return { ok: true, value: { restored: items, warnings: warnings.value } };
		}
		function parseOutcome(value) {
		  if (typeof value !== "object" || value === null || Array.isArray(value)) {
		    return { ok: false, message: "\u6267\u884C\u54CD\u5E94\u4E0D\u662F\u5BF9\u8C61" };
		  }
		  const record = value;
		  const removed = readStringList(record, "removed", "\u6267\u884C\u54CD\u5E94");
		  if (!removed.ok) return removed;
		  if (removed.value.length === 0) return { ok: false, message: "\u6267\u884C\u54CD\u5E94\u7684 removed \u4E3A\u7A7A" };
		  const warnings = readStringList(record, "warnings", "\u6267\u884C\u54CD\u5E94");
		  if (!warnings.ok) return warnings;
		  return { ok: true, value: { removed: removed.value, warnings: warnings.value } };
		}
		function parseFailure(value) {
		  if (typeof value !== "object" || value === null || Array.isArray(value)) return void 0;
		  const record = value;
		  const code = record["code"];
		  const message = record["message"];
		  if (typeof code !== "string" || code === "" || typeof message !== "string") return void 0;
		  return { code, message };
		}

		// src/client/locales.ts
		var NS = "webUx";
		var zh = {
		  // —— 侧栏 「...」 菜单入口 ——
		  "menu.delete": "\u5220\u9664\u4F1A\u8BDD",
		  // —— 确认对话框：标题与预览 ——
		  "dialog.title": "\u5220\u9664\u5DF2\u5F52\u6863\u4F1A\u8BDD",
		  "dialog.description": "\u300C{title}\u300D\u5F52\u6863\u7684\u5168\u90E8\u5185\u5BB9\u5C06\u88AB\u6C38\u4E45\u79FB\u9664\u3002",
		  "dialog.description.archive": "\u300C{title}\u300D\u7684\u4F1A\u8BDD\u65E5\u5FD7\u5C06\u88AB\u79FB\u52A8\u5230\u5F52\u6863\u76EE\u5F55\u3002",
		  "dialog.previewing": "\u6B63\u5728\u7EDF\u8BA1\u5220\u9664\u8303\u56F4\u2026",
		  "dialog.summary.sessions": "\u4F1A\u8BDD\uFF1A{count} \u4E2A",
		  "dialog.summary.descendants": "\u5176\u4E2D\u5B50\u4EE3\u7406\u4F1A\u8BDD\uFF1A{count} \u4E2A",
		  "dialog.summary.size": "\u9884\u8BA1\u91CA\u653E\uFF1A{size}",
		  "dialog.summary.moveSize": "\u79FB\u52A8\u4F53\u79EF\uFF1A{size}",
		  "dialog.archive.target": "\u5F52\u6863\u76EE\u5F55\uFF1A{path}",
		  "dialog.warning.irreversible": "\u5220\u9664\u4E0D\u53EF\u64A4\u9500\uFF1A\u4F1A\u8BDD\u65E5\u5FD7\u4E0E\u6295\u5F71\u7F13\u5B58\u4F1A\u88AB\u79FB\u9664\uFF0C\u5DE5\u4F5C\u533A\u8BB0\u5F55\u540C\u6B65\u6E05\u9664\uFF0C\u4EFB\u4F55\u754C\u9762\u90FD\u65E0\u6CD5\u6062\u590D\u3002\u5171\u4EAB\u9644\u4EF6\u5B58\u50A8\u4E0D\u4F1A\u88AB\u6E05\u7406\u3002",
		  "dialog.warning.archive": "\u65E5\u5FD7\u4F1A\u79FB\u52A8\u5230\u4E0A\u8FF0\u76EE\u5F55\uFF08\u4FDD\u7559\u9879\u76EE\u76EE\u5F55\u5C42\u7EA7\uFF09\uFF0C\u6295\u5F71\u7F13\u5B58\u4E0E\u5DE5\u4F5C\u533A\u8BB0\u5F55\u540C\u6B65\u6E05\u9664\uFF0C\u754C\u9762\u4E0D\u518D\u663E\u793A\u8BE5\u4F1A\u8BDD\u3002\u9700\u8981\u65F6\u53EF\u5728\u4FA7\u680F\u300C\u4F1A\u8BDD\u7BA1\u7406 \u2192 \u5DF2\u8FC1\u79FB\u300D\u91CC\u6062\u590D\uFF08\u53EA\u56DE\u5230\u5DF2\u5F52\u6863\u72B6\u6001\uFF09\uFF0C\u4E5F\u53EF\u6309\u4F1A\u8BDD id \u4ECE\u8BE5\u76EE\u5F55\u624B\u52A8\u627E\u56DE\u3002",
		  // —— 确认对话框：处置方式单选 ——
		  "dialog.mode.legend": "\u5904\u7F6E\u65B9\u5F0F",
		  "dialog.mode.archive": "\u79FB\u52A8\u5230\u5F52\u6863\u76EE\u5F55",
		  "dialog.mode.delete": "\u6C38\u4E45\u5220\u9664",
		  // —— 确认对话框：动作与结果 ——
		  "dialog.deleting": "\u6B63\u5728\u5220\u9664\u2026",
		  "dialog.archiving": "\u6B63\u5728\u79FB\u52A8\u2026",
		  "dialog.confirm": "\u6C38\u4E45\u5220\u9664",
		  "dialog.confirm.archive": "\u79FB\u52A8\u5230\u5F52\u6863\u76EE\u5F55",
		  "dialog.cancel": "\u53D6\u6D88",
		  "dialog.close": "\u5173\u95ED",
		  "dialog.done": "\u5DF2\u5220\u9664 {count} \u4E2A\u4F1A\u8BDD\u3002",
		  "dialog.done.archive": "\u5DF2\u79FB\u52A8 {count} \u4E2A\u4F1A\u8BDD\u5230\u5F52\u6863\u76EE\u5F55\u3002",
		  "dialog.warnings": "\u4EE5\u4E0B\u6587\u4EF6\u5220\u9664\u5931\u8D25\uFF0C\u9700\u8981\u624B\u52A8\u6E05\u7406\uFF1A",
		  "dialog.warnings.archive": "\u4EE5\u4E0B\u9879\u672A\u80FD\u5B8C\u6210\uFF0C\u9700\u8981\u624B\u52A8\u6E05\u7406\uFF1A",
		  "dialog.failed": "\u5220\u9664\u672A\u80FD\u5B8C\u6210\uFF1A{reason}",
		  "dialog.failed.archive": "\u5F52\u6863\u672A\u80FD\u5B8C\u6210\uFF1A{reason}",
		  // —— 体积格式化 ——
		  "format.bytes": "{value} B",
		  "format.kb": "{value} KB",
		  "format.mb": "{value} MB",
		  // —— 命令结果通知卡 ——
		  "notice.success.title": "\u547D\u4EE4\u6267\u884C\u6210\u529F",
		  "notice.error.title": "\u547D\u4EE4\u6267\u884C\u5931\u8D25",
		  "notice.expand": "\u5C55\u5F00\u5168\u6587",
		  "notice.collapse": "\u6536\u8D77",
		  "notice.close": "\u5173\u95ED\u901A\u77E5",
		  // —— 会话管理面：分节入口与外壳 ——
		  // `section.label` 是统一「工作区配置」弹窗左 nav 的行标题（label thunk 每次读取）。
		  "section.label": "\u4F1A\u8BDD\u7BA1\u7406",
		  "manager.action": "\u4F1A\u8BDD\u7BA1\u7406",
		  "manager.title": "\u4F1A\u8BDD\u7BA1\u7406",
		  "manager.description": "\u6309\u5DE5\u4F5C\u533A\u6279\u91CF\u7BA1\u7406\u4F1A\u8BDD\uFF1A\u5F52\u6863\u6D3B\u8DC3\u4F1A\u8BDD\u3001\u5904\u7F6E\u5DF2\u5F52\u6863\u4F1A\u8BDD\u3001\u6E05\u7406\u6216\u6062\u590D\u5DF2\u8FC1\u79FB\u5230\u5F52\u6863\u76EE\u5F55\u7684\u65E5\u5FD7\u3002",
		  "manager.finish": "\u5B8C\u6210",
		  "manager.unavailable": "\u4F1A\u8BDD\u7BA1\u7406\u4F9D\u8D56\u7684\u5DE5\u4F5C\u533A\u6216\u4F1A\u8BDD\u670D\u52A1\u5C1A\u672A\u5C31\u7EEA\uFF1B\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002",
		  "manager.workspace.empty": "\u8FD8\u6CA1\u6709\u4EFB\u4F55\u5DE5\u4F5C\u533A\u3002",
		  "manager.tab.active": "\u6D3B\u8DC3",
		  "manager.tab.archived": "\u5DF2\u5F52\u6863",
		  "manager.tab.migrated": "\u5DF2\u8FC1\u79FB",
		  "manager.tabs.label": "\u4F1A\u8BDD\u5206\u533A",
		  "manager.selectAll": "\u5168\u9009",
		  "manager.clear": "\u6E05\u7A7A",
		  "manager.selected": "\u5DF2\u9009 {count} \u4E2A",
		  // —— 会话管理面：三 tab 的空态与行 ——
		  "manager.empty.active": "\u8BE5\u5DE5\u4F5C\u533A\u6CA1\u6709\u6D3B\u8DC3\u4F1A\u8BDD\u3002",
		  "manager.empty.archived": "\u8BE5\u5DE5\u4F5C\u533A\u6CA1\u6709\u5DF2\u5F52\u6863\u4F1A\u8BDD\u3002",
		  "manager.empty.migrated": "\u5F52\u6863\u76EE\u5F55\u91CC\u6CA1\u6709\u53EF\u7BA1\u7406\u7684\u6761\u76EE\u3002",
		  "manager.empty.unassigned": "\u8BE5\u9009\u9879\u53EA\u5305\u542B\u65E0\u6CD5\u5339\u914D\u5DE5\u4F5C\u533A\u7684\u5DF2\u8FC1\u79FB\u5F52\u6863\uFF1B\u5F53\u524D\u6CA1\u6709\u8FD9\u7C7B\u6761\u76EE\u3002",
		  "manager.empty.unassigned.archived": "\u8BE5\u9009\u9879\u4E0B\u6CA1\u6709\u4E0D\u5C5E\u4E8E\u4EFB\u4F55\u5DE5\u4F5C\u533A\u7684\u5DF2\u5F52\u6863\u4F1A\u8BDD\u3002",
		  "manager.badge.running": "\u8FD0\u884C\u4E2D",
		  "manager.badge.blank": "\u7A7A\u767D",
		  "manager.untitled": "\uFF08\u65E0\u6807\u9898\uFF09",
		  "manager.meta.size": "{size}",
		  "manager.meta.time": "{time}",
		  "manager.refresh": "\u5237\u65B0\u5F52\u6863\u5217\u8868",
		  "manager.truncated": "\u6761\u76EE\u8FC7\u591A\uFF0C\u53EA\u5217\u51FA\u524D {count} \u4E2A\uFF1B\u8BF7\u5148\u6E05\u7406\u518D\u5237\u65B0\u3002",
		  // —— 会话管理面：动作与确认 ——
		  "manager.action.archive": "\u5F52\u6863\u6240\u9009",
		  "manager.action.dispose": "\u5904\u7F6E\u6240\u9009",
		  "manager.action.purge": "\u6C38\u4E45\u5220\u9664\u6240\u9009",
		  "manager.action.restore": "\u6062\u590D\u6240\u9009",
		  "manager.action.unarchive": "\u53D6\u6D88\u5F52\u6863\u6240\u9009",
		  "manager.confirm.title": "\u786E\u8BA4\u6267\u884C",
		  "manager.confirm.targets": "\u76EE\u6807\u4F1A\u8BDD {count} \u4E2A",
		  "manager.confirm.cascade": "\u5176\u4E2D\u7EA7\u8054\u5B50\u4EE3\u7406\u4F1A\u8BDD {count} \u4E2A",
		  "manager.confirm.rejected": "\u4EE5\u4E0B {count} \u9879\u65E0\u6CD5\u5904\u7406\uFF0C\u5DF2\u4ECE\u672C\u6279\u5254\u9664\uFF1A",
		  "manager.confirm.restore": "\u6062\u590D\u4F1A\u628A\u65E5\u5FD7\u642C\u56DE sessions/ \u5E76\u6309\u9879\u76EE\u8DEF\u5F84\u91CD\u65B0\u6302\u56DE\u5DE5\u4F5C\u533A\uFF1B\u5339\u914D\u4E0D\u5230\u5DE5\u4F5C\u533A\u7684\u6761\u76EE\u4F1A\u843D\u5230\u300C\u672A\u5206\u7EC4\u300D\u3002",
		  "manager.confirm.restoreUnassigned": "\u8FD9\u4E9B\u6761\u76EE\u65E0\u6CD5\u5339\u914D\u5230\u5DE5\u4F5C\u533A\uFF0C\u6062\u590D\u540E\u5C06\u51FA\u73B0\u5728\u300C\u672A\u5206\u7EC4\u300D\u3002",
		  "manager.confirm.archiveRoot": "\u5F52\u6863\u76EE\u5F55\uFF1A{path}",
		  "manager.confirm.back": "\u8FD4\u56DE",
		  "manager.confirm.run": "\u786E\u8BA4\u6267\u884C",
		  // —— 会话管理面：执行与结果 ——
		  "manager.running": "\u6B63\u5728\u6267\u884C\u2026",
		  "manager.done.dispose": "\u5DF2\u5904\u7F6E {count} \u4E2A\u4F1A\u8BDD\u3002",
		  "manager.done.archive": "\u5DF2\u5F52\u6863 {count} \u4E2A\u4F1A\u8BDD\u3002",
		  "manager.done.purge": "\u5DF2\u6C38\u4E45\u5220\u9664 {count} \u4E2A\u5F52\u6863\u6761\u76EE\u3002",
		  "manager.done.restore": "\u5DF2\u6062\u590D {count} \u4E2A\u5F52\u6863\u6761\u76EE\u3002",
		  "manager.done.restoreSplit": "\u5176\u4E2D {attached} \u4E2A\u6302\u56DE\u5DE5\u4F5C\u533A\uFF0C{unassigned} \u4E2A\u8FDB\u5165\u672A\u5206\u7EC4\u3002",
		  "manager.partial": "\u6210\u529F {ok} \u9879\uFF0C\u5931\u8D25 {failed} \u9879\uFF1A",
		  "manager.warnings": "\u4EE5\u4E0B\u6587\u4EF6\u64CD\u4F5C\u672A\u5B8C\u6210\uFF0C\u9700\u8981\u624B\u52A8\u6E05\u7406\uFF1A",
		  "manager.failed": "\u64CD\u4F5C\u672A\u80FD\u5B8C\u6210\uFF1A{reason}",
		  "manager.itemFailure": "{id}\uFF1A{reason}",
		  // —— 会话管理面：批量取消归档（落档增补） ——
		  "manager.unarchive.confirm": "\u5C06\u53D6\u6D88\u5F52\u6863 {count} \u4E2A\u4F1A\u8BDD\uFF1B\u5B83\u4EEC\u4F1A\u79BB\u5F00\u5DF2\u5F52\u6863\u5217\u8868\u3002",
		  "manager.unarchive.run": "\u786E\u8BA4\u53D6\u6D88\u5F52\u6863",
		  "manager.unarchive.done": "\u5DF2\u53D6\u6D88\u5F52\u6863 {count} \u4E2A\u4F1A\u8BDD\u3002",
		  "manager.unarchive.partial": "\u5176\u4E2D\u6210\u529F {ok} \u9879\uFF0C\u5931\u8D25 {failed} \u9879\uFF1A",
		  // —— 失败码 → 文案（未知码回退 error.fallback） ——
		  "error.not-found": "\u8BE5\u4F1A\u8BDD\u5DF2\u4E0D\u5B58\u5728\uFF0C\u53EF\u80FD\u5DF2\u5728\u522B\u5904\u5220\u9664\u3002",
		  "error.not-archived": "\u8BE5\u4F1A\u8BDD\u5DF2\u4E0D\u518D\u5904\u4E8E\u5F52\u6863\u72B6\u6001\uFF1B\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5\u3002",
		  "error.session-live": "\u8BE5\u4F1A\u8BDD\u4ECD\u5728\u5BBF\u4E3B\u673A\u5185\u5B58\u4E2D\u8FD0\u884C\uFF1B\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002",
		  "error.archive-unavailable": "\u5F52\u6863\u76EE\u5F55\u4E0D\u53EF\u7528\uFF08\u65E0\u6CD5\u521B\u5EFA\u6216\u6CA1\u6709\u5199\u6743\u9650\uFF09\uFF0C\u672A\u505A\u4EFB\u4F55\u6539\u52A8\u3002",
		  "error.bad-request": "\u8BF7\u6C42\u4E0D\u5408\u6CD5\uFF0C\u5BBF\u4E3B\u62D2\u7EDD\u4E86\u672C\u6B21\u8C03\u7528\u3002",
		  "error.internal": "\u5BBF\u4E3B\u5185\u90E8\u9519\u8BEF\uFF0C\u5220\u9664\u672A\u6267\u884C\u3002",
		  "error.not-migrated": "\u5F52\u6863\u76EE\u5F55\u91CC\u6CA1\u6709\u8BE5\u6761\u76EE\uFF08\u53EF\u80FD\u5DF2\u88AB\u624B\u5DE5\u79FB\u52A8\u6216\u5220\u9664\uFF09\u3002",
		  "error.target-exists": "\u76EE\u6807\u4F4D\u7F6E\u5DF2\u5B58\u5728\u540C\u540D\u76EE\u5F55\uFF0C\u672A\u505A\u4EFB\u4F55\u6539\u52A8\u3002",
		  "error.workspace/session-active": "\u8BE5\u4F1A\u8BDD\u4ECD\u6709\u8FD0\u884C\u4E2D\u7684\u5DE5\u4F5C\uFF08\u672C\u8F6E\u5BF9\u8BDD / \u5B50\u4EE3\u7406 / \u540E\u53F0\u4EFB\u52A1\uFF09\uFF0C\u5DF2\u8DF3\u8FC7\uFF1B\u8BF7\u5148\u505C\u6B62\u3002",
		  "error.unavailable": "\u65E0\u6CD5\u8FDE\u63A5\u5230 dsh \u4E3B\u8FDB\u7A0B\u3002",
		  "error.bad-response": "\u5BBF\u4E3B\u8FD4\u56DE\u4E86\u65E0\u6CD5\u8BC6\u522B\u7684\u54CD\u5E94\u3002",
		  "error.fallback": "\u64CD\u4F5C\u5931\u8D25\u3002"
		};
		var en = {
		  "menu.delete": "Delete session",
		  "dialog.title": "Delete archived session",
		  "dialog.description": 'Everything archived under "{title}" will be removed permanently.',
		  "dialog.description.archive": 'The stored logs of "{title}" will be moved to the archive directory.',
		  "dialog.previewing": "Measuring the delete scope\u2026",
		  "dialog.summary.sessions": "Sessions: {count}",
		  "dialog.summary.descendants": "Subagent sessions included: {count}",
		  "dialog.summary.size": "Space to be freed: {size}",
		  "dialog.summary.moveSize": "Size to move: {size}",
		  "dialog.archive.target": "Archive directory: {path}",
		  "dialog.warning.irreversible": "Deletion is irreversible: session logs and projection caches are removed, workspace records are cleared, and no surface can restore them. The shared attachment store is left untouched.",
		  "dialog.warning.archive": 'The logs move to that directory (project layout preserved); the projection cache and workspace records are cleared and the session disappears from every view. You can restore it from "Session manager \u2192 Migrated" in the sidebar (back to the archived state), or recover it by hand from that directory by session id.',
		  "dialog.mode.legend": "Disposition",
		  "dialog.mode.archive": "Move to archive directory",
		  "dialog.mode.delete": "Delete permanently",
		  "dialog.deleting": "Deleting\u2026",
		  "dialog.archiving": "Moving\u2026",
		  "dialog.confirm": "Delete permanently",
		  "dialog.confirm.archive": "Move to archive directory",
		  "dialog.cancel": "Cancel",
		  "dialog.close": "Close",
		  "dialog.done": "Deleted {count} sessions.",
		  "dialog.done.archive": "Moved {count} sessions to the archive directory.",
		  "dialog.warnings": "These files could not be removed and need manual cleanup:",
		  "dialog.warnings.archive": "These items did not complete and need manual cleanup:",
		  "dialog.failed": "Deletion did not complete: {reason}",
		  "dialog.failed.archive": "Archiving did not complete: {reason}",
		  "format.bytes": "{value} B",
		  "format.kb": "{value} KB",
		  "format.mb": "{value} MB",
		  "notice.success.title": "Command succeeded",
		  "notice.error.title": "Command failed",
		  "notice.expand": "Show full text",
		  "notice.collapse": "Collapse",
		  "notice.close": "Dismiss notice",
		  "section.label": "Session manager",
		  "manager.action": "Session manager",
		  "manager.title": "Session manager",
		  "manager.description": "Manage sessions per workspace: archive active sessions, dispose of archived sessions, and clean up or restore logs migrated to the archive directory.",
		  "manager.finish": "Done",
		  "manager.unavailable": "The workspace or session service that session management depends on is not ready yet; try again shortly.",
		  "manager.workspace.empty": "There are no workspaces yet.",
		  "manager.tab.active": "Active",
		  "manager.tab.archived": "Archived",
		  "manager.tab.migrated": "Migrated",
		  "manager.tabs.label": "Session sections",
		  "manager.selectAll": "Select all",
		  "manager.clear": "Clear",
		  "manager.selected": "{count} selected",
		  "manager.empty.active": "This workspace has no active sessions.",
		  "manager.empty.archived": "This workspace has no archived sessions.",
		  "manager.empty.migrated": "The archive directory has no manageable entries.",
		  "manager.empty.unassigned": "This option only lists migrated archives that match no workspace; there are none right now.",
		  "manager.empty.unassigned.archived": "This option has no archived sessions outside every workspace.",
		  "manager.badge.running": "Running",
		  "manager.badge.blank": "Blank",
		  "manager.untitled": "(untitled)",
		  "manager.meta.size": "{size}",
		  "manager.meta.time": "{time}",
		  "manager.refresh": "Refresh archive list",
		  "manager.truncated": "Too many entries; only the first {count} are listed. Clean up, then refresh.",
		  "manager.action.archive": "Archive selected",
		  "manager.action.dispose": "Dispose of selected",
		  "manager.action.purge": "Delete selected permanently",
		  "manager.action.restore": "Restore selected",
		  "manager.action.unarchive": "Unarchive selected",
		  "manager.confirm.title": "Confirm",
		  "manager.confirm.targets": "Target sessions: {count}",
		  "manager.confirm.cascade": "Cascaded subagent sessions included: {count}",
		  "manager.confirm.rejected": "These {count} items cannot be processed and were removed from this batch:",
		  "manager.confirm.restore": 'Restore moves the logs back into sessions/ and reattaches them to the workspace by project path; entries with no matching workspace land in "Ungrouped".',
		  "manager.confirm.restoreUnassigned": 'These entries match no workspace; after restore they appear under "Ungrouped".',
		  "manager.confirm.archiveRoot": "Archive directory: {path}",
		  "manager.confirm.back": "Back",
		  "manager.confirm.run": "Run",
		  "manager.running": "Running\u2026",
		  "manager.done.dispose": "Disposed of {count} sessions.",
		  "manager.done.archive": "Archived {count} sessions.",
		  "manager.done.purge": "Permanently deleted {count} archive entries.",
		  "manager.done.restore": "Restored {count} archive entries.",
		  "manager.done.restoreSplit": "{attached} were reattached to a workspace and {unassigned} went to Ungrouped.",
		  "manager.partial": "Succeeded: {ok}; failed: {failed}:",
		  "manager.warnings": "These file operations did not complete and need manual cleanup:",
		  "manager.failed": "The operation did not complete: {reason}",
		  "manager.itemFailure": "{id}: {reason}",
		  "manager.unarchive.confirm": "{count} sessions will be unarchived and leave the archived list.",
		  "manager.unarchive.run": "Confirm unarchive",
		  "manager.unarchive.done": "Unarchived {count} sessions.",
		  "manager.unarchive.partial": "Succeeded: {ok}; failed: {failed}:",
		  "error.not-found": "That session no longer exists; it may have been deleted elsewhere.",
		  "error.not-archived": "That session is no longer archived; refresh and try again.",
		  "error.session-live": "That session is still live in the host; try again later.",
		  "error.archive-unavailable": "The archive directory is unusable (it cannot be created or is not writable); nothing was changed.",
		  "error.bad-request": "The host rejected the request as malformed.",
		  "error.internal": "The host hit an internal error; nothing was deleted.",
		  "error.not-migrated": "That entry is not in the archive directory (it may have been moved or deleted by hand).",
		  "error.target-exists": "A directory with the same name already exists at the target location; nothing was changed.",
		  "error.workspace/session-active": "That session still has running work (current turn, subagents, or background tasks); it was skipped. Stop it first.",
		  "error.unavailable": "Could not reach the dsh host process.",
		  "error.bad-response": "The host answered with an unrecognized response.",
		  "error.fallback": "The operation failed."
		};

		// src/client/delete-client.ts
		var DeleteError = class extends Error {
		  /**
		   * @param code - 稳定失败码（业务拒绝码、`bad-request` / `internal`，或传输侧的 `unavailable` / `bad-response`）。
		   * @param message - 人类可读的兜底说明（不参与本地化，仅作详情展示）。
		   */
		  constructor(code, message) {
		    super(message);
		    this.code = code;
		    this.name = "DeleteError";
		  }
		};
		function errorKeyOf(code) {
		  const candidate = `error.${code}`;
		  return candidate in zh ? candidate : "error.fallback";
		}
		async function callEndpoint(connection, endpoint, body) {
		  let result;
		  try {
		    result = await connection.rpc.call(CHANNEL, endpoint, body);
		  } catch (error) {
		    throw new DeleteError("unavailable", error instanceof Error ? error.message : String(error));
		  }
		  if (!result.ok) {
		    const failure = parseFailure(result.error);
		    if (failure === void 0) throw new DeleteError("unavailable", "\u5BBF\u4E3B\u8FD4\u56DE\u4E86\u65E0\u6CD5\u8BC6\u522B\u7684\u5931\u8D25\u4FE1\u5C01");
		    throw new DeleteError(failure.code, failure.message);
		  }
		  return result.value;
		}
		function createDeleteClient(connection) {
		  return {
		    async preview(sessionId, mode) {
		      const parsed = parsePreview(await callEndpoint(connection, PREVIEW_ENDPOINT, { sessionId, mode }));
		      if (!parsed.ok) throw new DeleteError("bad-response", parsed.message);
		      return parsed.value;
		    },
		    async remove(sessionId, mode) {
		      const parsed = parseOutcome(await callEndpoint(connection, DELETE_ENDPOINT, { sessionId, mode }));
		      if (!parsed.ok) throw new DeleteError("bad-response", parsed.message);
		      return parsed.value;
		    }
		  };
		}
		function createSessionManagerClient(connection) {
		  return {
		    ...createDeleteClient(connection),
		    async previewBatch(sessionIds, mode) {
		      const parsed = parseBatchPreview(
		        await callEndpoint(connection, PREVIEW_BATCH_ENDPOINT, { sessionIds, mode })
		      );
		      if (!parsed.ok) throw new DeleteError("bad-response", parsed.message);
		      return parsed.value;
		    },
		    async disposeBatch(sessionIds, mode) {
		      const parsed = parseOutcome(
		        await callEndpoint(connection, DELETE_BATCH_ENDPOINT, { sessionIds, mode })
		      );
		      if (!parsed.ok) throw new DeleteError("bad-response", parsed.message);
		      return parsed.value;
		    },
		    async listMigrated() {
		      const parsed = parseMigratedListing(await callEndpoint(connection, LIST_MIGRATED_ENDPOINT, {}));
		      if (!parsed.ok) throw new DeleteError("bad-response", parsed.message);
		      return parsed.value;
		    },
		    async deleteMigrated(entries) {
		      const parsed = parseOutcome(
		        await callEndpoint(connection, DELETE_MIGRATED_ENDPOINT, { entries })
		      );
		      if (!parsed.ok) throw new DeleteError("bad-response", parsed.message);
		      return parsed.value;
		    },
		    async restoreMigrated(entries) {
		      const parsed = parseRestoreOutcome(
		        await callEndpoint(connection, RESTORE_MIGRATED_ENDPOINT, { entries })
		      );
		      if (!parsed.ok) throw new DeleteError("bad-response", parsed.message);
		      return parsed.value;
		    }
		  };
		}

		// src/client/delete.module.css
		var cssText2 = "/*\n * \u5220\u9664\u786E\u8BA4\u5BF9\u8BDD\u6846\u7684\u6700\u5C0F\u6837\u5F0F\u3002\n *\n * \u9AA8\u67B6\uFF08\u906E\u7F69\u3001\u5361\u7247\u3001\u6807\u9898\u3001\u5173\u95ED\u6309\u94AE\u3001\u6309\u94AE\u6392\u5E03\uFF09\u5168\u90E8\u7531\u5B98\u65B9 primitives \u7684 Modal / Button\n * \u63D0\u4F9B\uFF0C\u8FD9\u91CC\u53EA\u8865\u56DB\u4EF6\u4E8B\uFF1A\u5371\u9669\u786E\u8BA4\u6309\u94AE\u7684\u914D\u8272\uFF08Button \u6CA1\u6709 danger variant\uFF09\u3001\u9884\u89C8\u6458\u8981\u4E0E\n * \u8B66\u793A\u7684\u6587\u5B57\u5C42\u7EA7\u3001\u5904\u7F6E\u65B9\u5F0F\u5355\u9009\u533A\u5757\uFF08\u539F\u751F fieldset/radio \u4E0E\u5F52\u6863\u76EE\u6807\u884C\uFF09\u3001warnings \u6E05\u5355\n * \u7684\u53EF\u8BFB\u6027\u3002\u989C\u8272\u4E00\u5F8B\u53D6\u5B98\u65B9 `--dsw-alias-*` \u8BBE\u8BA1\u4EE4\u724C\u5E76\u5E26\u9759\u6001\u515C\u5E95\uFF0C\u4EE4\u724C\u6539\u540D\u65F6\u6700\u574F\u9000\u5316\u6210\n * \u53EF\u8BFB\u7684\u9ED1\u767D\u800C\u4E0D\u662F\u900F\u660E\u3002\n */\n\n/* \u5371\u9669\u786E\u8BA4\u6309\u94AE\uFF1A\u4E0E\u5B98\u65B9 primary \u540C\u5C3A\u5BF8\u540C\u5706\u89D2\uFF0C\u53EA\u628A\u586B\u5145\u6362\u6210\u9519\u8BEF\u8272\u3002 */\n.wux_danger_0c3afc {\n  color: var(--dsw-alias-label-primary-foreground, #fff);\n  background: var(--dsw-alias-state-error-primary, #ec1313);\n}\n\n.wux_danger_0c3afc:hover:not(:disabled) {\n  background: var(--dsw-alias-state-error-secondary, #f25a5a);\n}\n\n/* \u8FDB\u884C\u4E2D\u7B49\u8FC7\u7A0B\u6587\u6848\uFF1A\u4F4E\u8C03\uFF0C\u4E0D\u4E0E\u9884\u89C8\u6458\u8981\u62A2\u6CE8\u610F\u529B\u3002 */\n.wux_muted_0c3afc {\n  margin: 0;\n  color: var(--dsw-alias-label-tertiary, #7f8287);\n  font-size: 14px;\n  line-height: 22px;\n}\n\n/* \u9884\u89C8\u6458\u8981\uFF1A\u4F1A\u8BDD\u6570 / \u5B50\u4EE3\u7406\u6570 / \u4F53\u79EF\u4E09\u884C\u3002 */\n.wux_summary_0c3afc {\n  margin: 0 0 12px;\n  padding-left: 22px;\n  color: var(--dsw-alias-label-secondary, #545557);\n  font-size: 14px;\n  line-height: 22px;\n}\n\n/* \u2014\u2014 \u5904\u7F6E\u65B9\u5F0F\u5355\u9009\uFF1Afieldset \u81EA\u5E26\u8FB9\u6846\u4E0E\u5185\u8FB9\u8DDD\uFF0C\u8FD9\u91CC\u5168\u90E8\u62B9\u5E73\u53EA\u7559\u5206\u7EC4\u95F4\u8DDD \u2014\u2014 */\n.wux_modes_0c3afc {\n  margin: 0 0 12px;\n  padding: 0;\n  border: 0;\n  min-inline-size: 0;\n}\n\n/* legend \u662F\u539F\u751F\u8BED\u4E49\u5143\u7D20\u3001\u6CA1\u6709 className\uFF0C\u53EA\u80FD\u5728\u540E\u4EE3\u91CC\u5BF9\u9F50\u5206\u533A\u6807\u9898\u7684\u5B57\u7EA7\u3002 */\n.wux_modes_0c3afc legend {\n  display: block;\n  margin: 0 0 6px;\n  padding: 0;\n  color: var(--dsw-alias-label-secondary, #545557);\n  font-size: 13px;\n  font-weight: 600;\n  line-height: 20px;\n  letter-spacing: 0.01em;\n}\n\n/* \u9009\u9879\u884C\uFF1A\u6574\u884C\u662F label\uFF0C\u70B9\u6587\u5B57\u7B49\u4E8E\u70B9 radio\uFF1Bradio \u4E0E\u9996\u884C\u6587\u5B57\u9876\u5BF9\u9F50\u3002 */\n.wux_modeRow_0c3afc {\n  display: flex;\n  align-items: flex-start;\n  gap: 8px;\n  padding: 3px 0;\n  cursor: pointer;\n}\n\n/* \u539F\u751F radio \u53EA\u6539\u5F3A\u8C03\u8272\uFF08\u5BF9\u9F50\u8BBE\u8BA1\u7CFB\u7EDF\u7684\u54C1\u724C\u8272\uFF09\uFF0C\u5C3A\u5BF8\u4E0E\u547D\u4E2D\u533A\u4FDD\u6301\u7CFB\u7EDF\u9ED8\u8BA4\u3002 */\n.wux_modeRow_0c3afc input {\n  flex: none;\n  margin: 3px 0 0;\n  accent-color: var(--dsw-alias-state-business-primary, #1a67e0);\n}\n\n/* \u9009\u9879\u6587\u5B57\uFF1A\u4E3B\u6807\u9898\u4E00\u884C\uFF1B\u5C06\u6765\u8865\u8BF4\u660E\u884C\u65F6\u6309 2px \u95F4\u8DDD\u5806\u6210\u4E0A\u4E0B\u4E24\u884C\u3002 */\n.wux_modeText_0c3afc {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n  color: var(--dsw-alias-label-primary, #000);\n  font-size: 14px;\n  line-height: 22px;\n}\n\n/* \u8FDB\u884C\u4E2D\uFF08fieldset disabled\uFF09\uFF1A\u6574\u7EC4\u964D\u7EA7\u5230\u5F31\u5316\u8272\uFF0C\u884C\u4E5F\u4E0D\u518D\u663E\u793A\u53EF\u70B9\u624B\u52BF\u3002 */\n.wux_modes_0c3afc:disabled .wux_modeRow_0c3afc {\n  cursor: default;\n}\n\n.wux_modes_0c3afc:disabled .wux_modeText_0c3afc {\n  color: var(--dsw-alias-label-tertiary, #7f8287);\n}\n\n/* \u5F52\u6863\u76EE\u6807\u8DEF\u5F84\uFF1A\u673A\u5668\u4E32\u7528\u7B49\u5BBD\u5B57\u4F53\uFF0C\u957F\u8DEF\u5F84\u6309\u8BCD\u6362\u884C\uFF0C\u989C\u8272\u5F31\u5316\u5230\u8F85\u52A9\u5C42\u7EA7\u3002 */\n.wux_archiveTarget_0c3afc {\n  margin: 0 0 12px;\n  color: var(--dsw-alias-label-tertiary, #7f8287);\n  font-family: var(--ds-font-family-code, monospace);\n  font-size: 12px;\n  line-height: 18px;\n  word-break: break-all;\n}\n\n/* \u4E0D\u53EF\u9006\u8B66\u793A\uFF1A\u7528\u8B66\u544A\u8272\u800C\u975E\u9519\u8BEF\u8272\u2014\u2014\u8FD9\u662F\u5FC5\u987B\u8BFB\u5230\u7684\u4E8B\u5B9E\uFF0C\u4E0D\u662F\u5DF2\u7ECF\u53D1\u751F\u7684\u9519\u8BEF\u3002 */\n.wux_warning_0c3afc {\n  margin: 0;\n  color: var(--dsw-alias-state-warn-label, #dd8629);\n  font-size: 14px;\n  line-height: 22px;\n}\n\n.wux_done_0c3afc {\n  margin: 0;\n  color: var(--dsw-alias-label-primary, #000);\n  font-size: 14px;\n  line-height: 22px;\n}\n\n.wux_failure_0c3afc {\n  margin: 0;\n  color: var(--dsw-alias-state-error-primary, #ec1313);\n  font-size: 14px;\n  line-height: 22px;\n}\n\n/* \u5BBF\u4E3B\u515C\u5E95\u8BF4\u660E\uFF08\u672A\u672C\u5730\u5316\uFF09\uFF1A\u6BD4\u5931\u8D25\u539F\u56E0\u4F4E\u4E00\u5C42\u3002 */\n.wux_detail_0c3afc {\n  margin: 8px 0 0;\n  color: var(--dsw-alias-label-tertiary, #7f8287);\n  font-size: 12px;\n  line-height: 18px;\n  word-break: break-word;\n}\n\n/* \u534A\u5931\u8D25\u6E05\u5355\uFF1Awarnings \u662F\u5BBF\u4E3B\u7ED9\u7684 `<\u8DEF\u5F84>: <\u539F\u56E0>` \u673A\u5668\u53EF\u8BFB\u4E32\uFF0C\u539F\u6837\u5217\u51FA\u3002 */\n.wux_warnings_0c3afc {\n  margin-top: 14px;\n  color: var(--dsw-alias-label-secondary, #545557);\n  font-size: 13px;\n  line-height: 20px;\n}\n\n.wux_warnings_0c3afc p {\n  margin: 0 0 6px;\n}\n\n.wux_warnings_0c3afc ul {\n  margin: 0;\n  padding-left: 22px;\n}\n\n.wux_warnings_0c3afc code {\n  font-family: var(--ds-font-family-code, monospace);\n  font-size: 12px;\n  word-break: break-all;\n}\n";
		if (typeof document !== "undefined" && document.querySelector('style[data-dsh-plugin="dsh-plugin-web-ux"][data-dsh-css="0c3afc"]') === null) {
		  const style = document.createElement("style");
		  style.setAttribute("data-dsh-plugin", "dsh-plugin-web-ux");
		  style.setAttribute("data-dsh-css", "0c3afc");
		  style.textContent = cssText2;
		  document.head.appendChild(style);
		}
		var delete_default = { "danger": "wux_danger_0c3afc", "muted": "wux_muted_0c3afc", "summary": "wux_summary_0c3afc", "modes": "wux_modes_0c3afc", "modeRow": "wux_modeRow_0c3afc", "modeText": "wux_modeText_0c3afc", "archiveTarget": "wux_archiveTarget_0c3afc", "warning": "wux_warning_0c3afc", "done": "wux_done_0c3afc", "failure": "wux_failure_0c3afc", "detail": "wux_detail_0c3afc", "warnings": "wux_warnings_0c3afc" };

		// src/client/DeleteSessionDialog.tsx
		var import_jsx_runtime3 = require("react/jsx-runtime");
		var DEFAULT_DISPOSAL_MODE = "archive";
		function formatSize(bytes, t) {
		  const round1 = (value) => String(Math.round(value * 10) / 10);
		  if (bytes < 1024) return t("format.bytes", { value: String(bytes) });
		  const kb = bytes / 1024;
		  if (kb < 1024) return t("format.kb", { value: round1(kb) });
		  return t("format.mb", { value: round1(kb / 1024) });
		}
		function asDeleteError(error) {
		  if (error instanceof DeleteError) return error;
		  return new DeleteError("fallback", error instanceof Error ? error.message : String(error));
		}
		function DeleteSessionDialog({ requests, client, t }) {
		  const target = (0, import_react3.useSyncExternalStore)(requests.source.subscribe, requests.source.getSnapshot);
		  if (client === void 0) return null;
		  if (target === null) return null;
		  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		    DeleteSessionBody,
		    {
		      target,
		      requests,
		      client,
		      t
		    },
		    `${target.sessionId}#${String(target.seq)}`
		  );
		}
		function DeleteSessionBody({ target, requests, client, t }) {
		  const [phase, setPhase] = (0, import_react3.useState)("previewing");
		  const [mode, setMode] = (0, import_react3.useState)(DEFAULT_DISPOSAL_MODE);
		  const [preview, setPreview] = (0, import_react3.useState)(null);
		  const [failure, setFailure] = (0, import_react3.useState)(null);
		  const [outcome, setOutcome] = (0, import_react3.useState)(null);
		  (0, import_react3.useEffect)(() => {
		    let cancelled = false;
		    void client.preview(target.sessionId, DEFAULT_DISPOSAL_MODE).then(
		      (value) => {
		        if (cancelled) return;
		        setPreview(value);
		        setPhase("ready");
		      },
		      (error) => {
		        if (cancelled) return;
		        setFailure(asDeleteError(error));
		        setPhase("failed");
		      }
		    );
		    return () => {
		      cancelled = true;
		    };
		  }, [client, target.sessionId]);
		  const confirm = () => {
		    if (phase !== "ready") return;
		    setPhase("deleting");
		    void client.remove(target.sessionId, mode).then(
		      (value) => {
		        setOutcome(value);
		        setPhase("done");
		      },
		      (error) => {
		        setFailure(asDeleteError(error));
		        setPhase("failed");
		      }
		    );
		  };
		  const close = () => {
		    if (phase === "deleting") return;
		    requests.settle();
		  };
		  const archiving = mode === "archive";
		  const displayTitle = target.displayTitle === "" ? target.sessionId : target.displayTitle;
		  const footer = phase === "done" || phase === "failed" ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives2.Button, { variant: "outline", onClick: close, children: t("dialog.close") }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives2.Button, { variant: "outline", onClick: close, disabled: phase === "deleting", children: t("dialog.cancel") }),
		    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		      import_dsh_client_ui_primitives2.Button,
		      {
		        variant: "primary",
		        className: archiving ? void 0 : delete_default.danger,
		        onClick: confirm,
		        disabled: phase !== "ready",
		        children: phase === "deleting" ? t(archiving ? "dialog.archiving" : "dialog.deleting") : t(archiving ? "dialog.confirm.archive" : "dialog.confirm")
		      }
		    )
		  ] });
		  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
		    import_dsh_client_ui_primitives2.Modal,
		    {
		      open: true,
		      onClose: close,
		      title: t("dialog.title"),
		      closeLabel: t("dialog.close"),
		      description: t(archiving ? "dialog.description.archive" : "dialog.description", { title: displayTitle }),
		      footer,
		      children: [
		        phase === "previewing" && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: delete_default.muted, children: t("dialog.previewing") }),
		        preview !== null && phase !== "failed" && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("ul", { className: delete_default.summary, children: [
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("li", { children: t("dialog.summary.sessions", { count: preview.sessionCount }) }),
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("li", { children: t("dialog.summary.descendants", { count: preview.descendantCount }) }),
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("li", { children: t(archiving ? "dialog.summary.moveSize" : "dialog.summary.size", {
		              size: formatSize(preview.logBytes, t)
		            }) })
		          ] }),
		          archiving && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: delete_default.archiveTarget, children: t("dialog.archive.target", { path: preview.archiveRoot }) }),
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: delete_default.warning, children: t(archiving ? "dialog.warning.archive" : "dialog.warning.irreversible") })
		        ] }),
		        (phase === "ready" || phase === "deleting") && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("fieldset", { className: delete_default.modes, disabled: phase === "deleting", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("legend", { children: t("dialog.mode.legend") }),
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { className: delete_default.modeRow, children: [
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		              "input",
		              {
		                type: "radio",
		                name: "web-ux-disposal",
		                value: "archive",
		                checked: archiving,
		                disabled: phase === "deleting",
		                onChange: () => {
		                  setMode("archive");
		                }
		              }
		            ),
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: delete_default.modeText, children: t("dialog.mode.archive") })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { className: delete_default.modeRow, children: [
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		              "input",
		              {
		                type: "radio",
		                name: "web-ux-disposal",
		                value: "delete",
		                checked: mode === "delete",
		                disabled: phase === "deleting",
		                onChange: () => {
		                  setMode("delete");
		                }
		              }
		            ),
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: delete_default.modeText, children: t("dialog.mode.delete") })
		          ] })
		        ] }),
		        phase === "deleting" && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: delete_default.muted, children: t(archiving ? "dialog.archiving" : "dialog.deleting") }),
		        phase === "done" && outcome !== null && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: delete_default.done, children: t(archiving ? "dialog.done.archive" : "dialog.done", { count: outcome.removed.length }) }),
		          outcome.warnings.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("section", { className: delete_default.warnings, children: [
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { children: t(archiving ? "dialog.warnings.archive" : "dialog.warnings") }),
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("ul", { children: outcome.warnings.map((warning) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("code", { children: warning }) }, warning)) })
		          ] })
		        ] }),
		        phase === "failed" && failure !== null && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: delete_default.failure, children: t(archiving ? "dialog.failed.archive" : "dialog.failed", {
		            reason: t(errorKeyOf(failure.code))
		          }) }),
		          failure.message !== "" && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: delete_default.detail, children: failure.message })
		        ] })
		      ]
		    }
		  );
		}

		// src/client/CommandNoticeCard.tsx
		var import_react4 = require("react");

		// src/client/notice.module.css
		var cssText3 = "/* \u547D\u4EE4\u7ED3\u679C\u901A\u77E5\u5361\u7684\u6837\u5F0F\uFF08CommandNoticeCard.wux_tsx_7bf2b1\uFF09\u3002\n *\n * \u6302\u5728 composer \u4E0A\u65B9\u7684\u6D6E\u5C42\u91CC\uFF08`conversation.wux_input_7bf2b1.wux_overlay_7bf2b1`\uFF09\uFF0C\u5B98\u65B9\u547D\u4EE4\u8865\u5168\n * \u5F39\u5C42\u540C\u4F4D\uFF08order 1 \u5728\u524D\uFF09\uFF1B\u5361\u7247\u53D6\u6709\u9650\u5BBD\u5EA6\u3001\u4E0D\u62E6\u622A\u6D6E\u5C42\u4EE5\u5916\u7684\u70B9\u51FB\u3002\u6784\u5EFA\u65F6\n * \u7C7B\u540D\u4F1A\u88AB build.wux_mjs_7bf2b1 \u7684 cssModulesPlugin \u91CD\u5199\u4E3A `wux_<local>_<hash>`\u3002 */\n\n.wux_card_7bf2b1 {\n  /* \u951A\u70B9\uFF08overlay \u5EA7\u4F4D\u5BB9\u5668\uFF09\u662F\u8F93\u5165\u533A\u9876\u90E8\u7684\u4E00\u4E2A\u96F6\u9AD8\u7EDD\u5BF9\u5B9A\u4F4D\u70B9\uFF1A\u5361\u7247\u4EE5\u5B83\u4E3A\n   * containing block \u5411\u4E0A\u6D6E\uFF08toast \u5F62\u6001\uFF09\uFF0C\u4E0D\u906E\u6321\u8F93\u5165\u533A\u672C\u8EAB\u3002 */\n  position: absolute;\n  bottom: calc(100% + 4px);\n  left: 0;\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n  max-width: 560px;\n  padding: 8px 10px;\n  border: 1px solid var(--dsw-elevation-stroke-color, rgba(127, 127, 127, 0.35));\n  border-radius: 8px;\n  /* \u4E0D\u900F\u660E\u80CC\u666F\uFF1A\u5361\u7247\u6D6E\u5728\u754C\u9762\u4E0A\u65B9\uFF0C\u534A\u900F\u660E\u4F1A\u8BA9\u4E0B\u5C42\u6587\u5B57\u900F\u51FA\u3002 */\n  background: var(--dsw-alias-bg-layer-2, #2c2c2e);\n  box-shadow: var(--dsw-elevation-panel, 0 0 0 0.5px rgba(255, 255, 255, 0.12), 0 3px 8px 0 rgba(0, 0, 0, 0.08));\n  font-size: 12px;\n  line-height: 1.5;\n  text-align: left;\n}\n\n/* \u9519\u8BEF\u5361\uFF1A\u9519\u8BEF\u8272\u8FB9\u6846 + \u7740\u8272\uFF08\u4E0E\u4E0D\u900F\u660E\u5E95\u8272\u6DF7\u5408\uFF09\uFF0C\u4E0E\u6210\u529F\u5361\u4E00\u773C\u53EF\u5206\u3002 */\n.wux_error_7bf2b1 {\n  border-color: var(--dsh-danger, #d5455c);\n  background: color-mix(in srgb, var(--dsh-danger, #d5455c) 10%, var(--dsw-alias-bg-layer-2, #2c2c2e));\n}\n\n.wux_head_7bf2b1 {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  min-width: 0;\n}\n\n.wux_title_7bf2b1 {\n  flex: none;\n  font-weight: 600;\n}\n\n.wux_command_7bf2b1 {\n  flex: none;\n  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;\n  opacity: 0.85;\n}\n\n/* \u6458\u8981\uFF1A\u5355\u884C\u622A\u65AD\uFF08\u914D\u5408\u7EC4\u4EF6\u4FA7\u9996\u884C + \u7701\u7565\u53F7\u903B\u8F91\uFF0C\u8FD9\u91CC\u662F\u89C6\u89C9\u515C\u5E95\uFF09\u3002 */\n.wux_summary_7bf2b1 {\n  flex: 1 1 auto;\n  min-width: 0;\n  overflow: hidden;\n  white-space: nowrap;\n  text-overflow: ellipsis;\n  opacity: 0.75;\n}\n\n.wux_spring_7bf2b1 {\n  flex: 1 1 auto;\n}\n\n.wux_action_7bf2b1 {\n  flex: none;\n  padding: 0 4px;\n  border: none;\n  background: none;\n  color: inherit;\n  font: inherit;\n  line-height: 1.5;\n  cursor: pointer;\n  opacity: 0.65;\n}\n\n.wux_action_7bf2b1:hover {\n  opacity: 1;\n}\n\n/* \u5168\u6587\uFF1A\u9650\u9AD8\u6EDA\u52A8\u3001\u4FDD\u7559\u6362\u884C\uFF08\u957F\u6E05\u5355\u4E0D\u4E22\u5931\uFF09\u3002 */\n.wux_full_7bf2b1 {\n  max-height: 240px;\n  margin: 0;\n  overflow: auto;\n  white-space: pre-wrap;\n  word-break: break-word;\n  font-family: inherit;\n  border-top: 1px dashed var(--dsh-border, rgba(127, 127, 127, 0.35));\n  padding-top: 4px;\n}\n";
		if (typeof document !== "undefined" && document.querySelector('style[data-dsh-plugin="dsh-plugin-web-ux"][data-dsh-css="7bf2b1"]') === null) {
		  const style = document.createElement("style");
		  style.setAttribute("data-dsh-plugin", "dsh-plugin-web-ux");
		  style.setAttribute("data-dsh-css", "7bf2b1");
		  style.textContent = cssText3;
		  document.head.appendChild(style);
		}
		var notice_default = { "tsx": "wux_tsx_7bf2b1", "input": "wux_input_7bf2b1", "overlay": "wux_overlay_7bf2b1", "mjs": "wux_mjs_7bf2b1", "card": "wux_card_7bf2b1", "error": "wux_error_7bf2b1", "head": "wux_head_7bf2b1", "title": "wux_title_7bf2b1", "command": "wux_command_7bf2b1", "summary": "wux_summary_7bf2b1", "spring": "wux_spring_7bf2b1", "action": "wux_action_7bf2b1", "full": "wux_full_7bf2b1" };

		// src/client/CommandNoticeCard.tsx
		var import_jsx_runtime4 = require("react/jsx-runtime");
		var SUCCESS_TTL_MS = 1e4;
		var SUMMARY_MAX_CHARS = 80;
		function noticeSummary(text, max = SUMMARY_MAX_CHARS) {
		  const firstLine = text.split("\n").find((line) => line.trim() !== "") ?? "";
		  const trimmed = firstLine.trim();
		  return trimmed.length > max ? `${trimmed.slice(0, max)}\u2026` : trimmed;
		}
		function CommandNoticeCard({ sessionId, useSession, notices, visibilityFor, t }) {
		  const notice = (0, import_react4.useSyncExternalStore)(notices.source.subscribe, () => notices.source.noticeOf(sessionId));
		  const visibility = (0, import_react4.useMemo)(() => visibilityFor(sessionId), [visibilityFor, sessionId]);
		  const readCount2 = (0, import_react4.useMemo)(
		    () => () => visibility?.getSnapshot() ?? 0,
		    [visibility]
		  );
		  const subscribeCount = (0, import_react4.useMemo)(
		    () => (onChange) => visibility === void 0 ? () => {
		    } : visibility.subscribe(onChange),
		    [visibility]
		  );
		  const mainViewCount = (0, import_react4.useSyncExternalStore)(subscribeCount, readCount2);
		  const blank = useSession?.((snapshot) => snapshot?.blank ?? true) ?? true;
		  if (mainViewCount > 0 && !blank) return null;
		  if (notice === null) return null;
		  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
		    CommandNoticeBody,
		    {
		      notice,
		      notices,
		      t
		    },
		    notice.seq
		  );
		}
		function CommandNoticeBody({ notice, notices, t }) {
		  const [expanded, setExpanded] = (0, import_react4.useState)(false);
		  const dismissRef = (0, import_react4.useRef)(notices.dismiss);
		  dismissRef.current = notices.dismiss;
		  const budget = (0, import_react4.useRef)({ remaining: SUCCESS_TTL_MS });
		  (0, import_react4.useEffect)(() => {
		    if (notice.kind !== "success" || expanded) return;
		    const remaining = budget.current.remaining;
		    if (remaining <= 0) {
		      dismissRef.current(notice.sessionId);
		      return;
		    }
		    const startedAt = Date.now();
		    const timer = setTimeout(() => {
		      dismissRef.current(notice.sessionId);
		    }, remaining);
		    return () => {
		      clearTimeout(timer);
		      budget.current.remaining = Math.max(0, remaining - (Date.now() - startedAt));
		    };
		  }, [notice.kind, notice.sessionId, expanded]);
		  const summary = noticeSummary(notice.text);
		  const titleKey = notice.kind === "error" ? "notice.error.title" : "notice.success.title";
		  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: `${notice_default.card} ${notice.kind === "error" ? notice_default.error : ""}`, role: "status", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: notice_default.head, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: notice_default.title, children: t(titleKey) }),
		      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: notice_default.command, children: `/${notice.commandName}` }),
		      !expanded && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: notice_default.summary, children: summary }),
		      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: notice_default.spring }),
		      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
		        "button",
		        {
		          type: "button",
		          className: notice_default.action,
		          onClick: () => {
		            setExpanded((value) => !value);
		          },
		          "aria-expanded": expanded,
		          "aria-label": expanded ? t("notice.collapse") : t("notice.expand"),
		          children: expanded ? t("notice.collapse") : t("notice.expand")
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
		        "button",
		        {
		          type: "button",
		          className: notice_default.action,
		          onClick: () => {
		            notices.dismiss(notice.sessionId);
		          },
		          "aria-label": t("notice.close"),
		          children: "\xD7"
		        }
		      )
		    ] }),
		    expanded && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("pre", { className: notice_default.full, children: notice.text })
		  ] });
		}

		// src/client/notice-store.ts
		function createNoticeStore(warn = (message) => {
		  console.warn(`[web-ux] ${message}`);
		}) {
		  const notices = /* @__PURE__ */ new Map();
		  const listeners = /* @__PURE__ */ new Set();
		  let seq = 0;
		  const publish = () => {
		    for (const listener of Array.from(listeners)) listener();
		  };
		  const parse = (sessionId, commandName, result) => {
		    if (typeof sessionId !== "string" || sessionId === "") return "sessionId \u975E\u975E\u7A7A\u5B57\u7B26\u4E32";
		    if (typeof commandName !== "string" || commandName === "") return "commandName \u975E\u975E\u7A7A\u5B57\u7B26\u4E32";
		    if (result === null || typeof result !== "object") return "result \u4E0D\u662F\u5BF9\u8C61";
		    const kind = result.kind;
		    if (kind !== "success" && kind !== "error") return "result.kind \u4E0D\u662F success/error";
		    const text = result.text;
		    if (typeof text !== "string" || text.trim() === "") {
		      return kind === "error" ? "\u9519\u8BEF\u7ED3\u679C\u7F3A text" : "\u6210\u529F\u7ED3\u679C\u65E0\u6587\u672C\uFF08\u5BCC\u5448\u73B0\u8D70 sourceEventSeq\uFF0C\u4E0D\u901A\u77E5\uFF09";
		    }
		    seq += 1;
		    return { sessionId, commandName, kind, text, at: Date.now(), seq };
		  };
		  return {
		    source: {
		      noticeOf: (sessionId) => notices.get(sessionId) ?? null,
		      subscribe: (listener) => {
		        listeners.add(listener);
		        return () => {
		          listeners.delete(listener);
		        };
		      }
		    },
		    offer: (sessionId, commandName, result) => {
		      const parsed = parse(sessionId, commandName, result);
		      if (typeof parsed === "string") {
		        warn(`\u4E22\u5F03 command/executed \u8F7D\u8377\uFF1A${parsed}`);
		        return;
		      }
		      notices.set(parsed.sessionId, parsed);
		      publish();
		    },
		    dismiss: (sessionId) => {
		      if (!notices.delete(sessionId)) return;
		      publish();
		    }
		  };
		}

		// src/client/notice-visibility.ts
		function mainViewCountOf(info) {
		  if (info === null || typeof info !== "object") return 0;
		  const retainedBy = info.retainedBy;
		  if (retainedBy === null || typeof retainedBy !== "object") return 0;
		  const mainView = retainedBy.mainView;
		  return typeof mainView === "number" && Number.isFinite(mainView) && mainView > 0 ? mainView : 0;
		}
		function projectCountSource(raw) {
		  if (raw === null || typeof raw !== "object") return null;
		  const holder = raw;
		  if (typeof holder.getSnapshot !== "function" || typeof holder.subscribe !== "function") return null;
		  return {
		    getSnapshot: () => mainViewCountOf(holder.getSnapshot()),
		    subscribe: (listener) => holder.subscribe(listener)
		  };
		}

		// src/client/delete-store.ts
		function createDeleteRequestStore() {
		  let snapshot = null;
		  let seq = 0;
		  const listeners = /* @__PURE__ */ new Set();
		  const publish = (next) => {
		    snapshot = next;
		    for (const listener of Array.from(listeners)) listener();
		  };
		  return {
		    source: {
		      getSnapshot: () => snapshot,
		      subscribe: (listener) => {
		        listeners.add(listener);
		        return () => {
		          listeners.delete(listener);
		        };
		      }
		    },
		    // 显式点击每次都换新对象并换新序号：重复点同一行也应重启预览，而不是被
		    // identity 比较或 React 的 key 复用吃掉。
		    request: (target) => {
		      seq += 1;
		      publish({ sessionId: target.sessionId, displayTitle: target.displayTitle, seq });
		    },
		    settle: () => {
		      if (snapshot !== null) publish(null);
		    }
		  };
		}

		// src/client/SessionManagerDialog.tsx
		var import_react5 = require("react");
		var import_dsh_client_ui_primitives3 = require("@deepseek-ai/dsh-client-ui-primitives");

		// src/project-key.ts
		function projectKey(cwd) {
		  if (cwd.length === 0) throw new Error("cannot encode an empty project path");
		  let readable = "";
		  let separatorRun = false;
		  for (let index = 0; index < cwd.length; index += 1) {
		    const code = cwd.charCodeAt(index);
		    const ch = String.fromCharCode(code);
		    if (ch === "/" || ch === "\\" || ch === ":") {
		      if (!separatorRun) readable += "-";
		      separatorRun = true;
		    } else if (ch !== "~" && /^[A-Za-z0-9._-]$/.test(ch)) {
		      readable += ch;
		      separatorRun = false;
		    } else {
		      readable += `~${code.toString(16).toUpperCase().padStart(4, "0")}`;
		      separatorRun = false;
		    }
		  }
		  const body = (readable.replace(/^-+/, "") || "root").slice(0, 251);
		  return `--${body}--`;
		}
		function workspaceForProjectDir(projectDir, workspaces) {
		  const owner = workspaces.find((workspace) => projectKey(workspace.path) === projectDir);
		  return owner?.workspaceId ?? null;
		}

		// src/client/session-manager-model.ts
		var UNASSIGNED_CHOICE = "unassigned";
		function workspaceOf(choice, workspaces) {
		  if (choice === UNASSIGNED_CHOICE) return void 0;
		  return workspaces.items.find((workspace) => workspace.workspaceId === choice);
		}
		function memberSet(workspaces) {
		  const members = /* @__PURE__ */ new Set();
		  for (const workspace of workspaces.items) {
		    for (const sessionId of workspace.sessionIds) members.add(sessionId);
		  }
		  return members;
		}
		function sessionRow(tab, workspaceId, sessionId, summary) {
		  return {
		    key: entryKeyOf(tab, sessionId),
		    sessionId,
		    title: summary.displayTitle,
		    updatedAt: summary.updatedAt,
		    running: summary.running,
		    blank: summary.blank,
		    // D15：运行中的行不删，只置灰；全选与动作输入按 selectable 跳过。
		    selectable: !summary.running,
		    workspaceId
		  };
		}
		function migratedRow(entry, workspaceId) {
		  return {
		    key: entryKeyOf("migrated", entry.dirName, entry.projectDir),
		    sessionId: entry.sessionId,
		    dirName: entry.dirName,
		    projectDir: entry.projectDir,
		    bytes: entry.bytes,
		    updatedAt: entry.updatedAt,
		    workspaceId,
		    selectable: true
		  };
		}
		function compareMigrated(left, right) {
		  if (left.updatedAt !== right.updatedAt) return right.updatedAt - left.updatedAt;
		  if (left.dirName !== right.dirName) return left.dirName < right.dirName ? -1 : 1;
		  if (left.projectDir === right.projectDir) return 0;
		  return left.projectDir < right.projectDir ? -1 : 1;
		}
		function selectableKeys(rows) {
		  const keys = [];
		  for (const row of rows) {
		    if (!row.selectable) continue;
		    keys.push(row.key);
		    if (keys.length >= MAX_BATCH_TARGETS) break;
		  }
		  return keys;
		}
		function withTabSelection(selection, tab, next) {
		  return {
		    active: tab === "active" ? next : selection.active,
		    archived: tab === "archived" ? next : selection.archived,
		    migrated: tab === "migrated" ? next : selection.migrated
		  };
		}
		function entryKeyOf(tab, id, projectDir) {
		  return tab === "migrated" ? `${tab}:${projectDir ?? ""}/${id}` : `${tab}:${id}`;
		}
		function activeRows(choice, workspaces, sessions) {
		  const workspace = workspaceOf(choice, workspaces);
		  if (workspace === void 0) return [];
		  const archived = new Set(workspaces.archivedSessionIds);
		  const listed = new Set(sessions.ids);
		  const seen = /* @__PURE__ */ new Set();
		  const rows = [];
		  for (const sessionId of workspace.sessionIds) {
		    if (seen.has(sessionId) || !listed.has(sessionId) || archived.has(sessionId)) continue;
		    const summary = sessions.byId[sessionId];
		    if (summary === void 0 || summary.origin === "subagent") continue;
		    seen.add(sessionId);
		    rows.push(sessionRow("active", workspace.workspaceId, sessionId, summary));
		  }
		  return rows;
		}
		function archivedRows(choice, workspaces, sessions) {
		  const archived = new Set(workspaces.archivedSessionIds);
		  const seen = /* @__PURE__ */ new Set();
		  const rows = [];
		  if (choice === UNASSIGNED_CHOICE) {
		    const members = memberSet(workspaces);
		    for (const sessionId of workspaces.archivedSessionIds) {
		      if (seen.has(sessionId) || members.has(sessionId)) continue;
		      const summary = sessions.byId[sessionId];
		      if (summary === void 0 || summary.origin === "subagent") continue;
		      seen.add(sessionId);
		      rows.push(sessionRow("archived", null, sessionId, summary));
		    }
		    return rows;
		  }
		  const workspace = workspaceOf(choice, workspaces);
		  if (workspace === void 0) return [];
		  for (const sessionId of workspace.sessionIds) {
		    if (seen.has(sessionId) || !archived.has(sessionId)) continue;
		    const summary = sessions.byId[sessionId];
		    if (summary === void 0 || summary.origin === "subagent") continue;
		    seen.add(sessionId);
		    rows.push(sessionRow("archived", workspace.workspaceId, sessionId, summary));
		  }
		  return rows;
		}
		function migratedRows(choice, workspaces, listing) {
		  const seen = /* @__PURE__ */ new Set();
		  const rows = [];
		  for (const entry of listing.entries) {
		    const owner = workspaceForProjectDir(entry.projectDir, workspaces.items);
		    const matched = choice === UNASSIGNED_CHOICE ? owner === null : owner === choice;
		    if (!matched) continue;
		    const row = migratedRow(entry, owner);
		    if (seen.has(row.key)) continue;
		    seen.add(row.key);
		    rows.push(row);
		  }
		  return rows.sort(compareMigrated);
		}
		function actionsForTab(tab, mode = "archive") {
		  switch (tab) {
		    case "active":
		      return [{ kind: "archive" }];
		    case "archived":
		      return [{ kind: "dispose", mode }, { kind: "unarchive" }];
		    case "migrated":
		      return [{ kind: "purge" }, { kind: "restore" }];
		  }
		}
		function emptySelection() {
		  return { active: /* @__PURE__ */ new Set(), archived: /* @__PURE__ */ new Set(), migrated: /* @__PURE__ */ new Set() };
		}
		function toggleSelection(selection, tab, key) {
		  const current = selection[tab];
		  if (current.has(key)) {
		    const next2 = new Set(current);
		    next2.delete(key);
		    return withTabSelection(selection, tab, next2);
		  }
		  if (current.size >= MAX_BATCH_TARGETS) return selection;
		  const next = new Set(current);
		  next.add(key);
		  return withTabSelection(selection, tab, next);
		}
		function clearSelection(selection, tab) {
		  return withTabSelection(selection, tab, /* @__PURE__ */ new Set());
		}
		function selectAllSelection(selection, tab, rows) {
		  return withTabSelection(selection, tab, new Set(selectableKeys(rows)));
		}
		function allSelected(selection, tab, rows) {
		  const keys = selectableKeys(rows);
		  if (keys.length === 0) return false;
		  const current = selection[tab];
		  return current.size === keys.length && keys.every((key) => current.has(key));
		}
		function selectedCount(selection, tab, rows) {
		  const current = selection[tab];
		  let count = 0;
		  for (const row of rows) {
		    if (row.selectable && current.has(row.key)) count += 1;
		  }
		  return count;
		}
		function selectionLimitReached(rows) {
		  let selectable = 0;
		  for (const row of rows) {
		    if (!row.selectable) continue;
		    selectable += 1;
		    if (selectable > MAX_BATCH_TARGETS) return true;
		  }
		  return false;
		}
		function selectedSessionIds(rows, selected) {
		  const ids = [];
		  const seen = /* @__PURE__ */ new Set();
		  for (const row of rows) {
		    if (!row.selectable || !selected.has(row.key) || seen.has(row.sessionId)) continue;
		    seen.add(row.sessionId);
		    ids.push(row.sessionId);
		    if (ids.length >= MAX_BATCH_TARGETS) break;
		  }
		  return ids;
		}
		function unarchiveSelected(selection, rows) {
		  return selectedSessionIds(rows, selection.archived);
		}
		function selectedMigratedTargets(rows, selected) {
		  const targets = [];
		  const seen = /* @__PURE__ */ new Set();
		  for (const row of rows) {
		    if (!selected.has(row.key)) continue;
		    const identity = `${row.projectDir}/${row.dirName}`;
		    if (seen.has(identity)) continue;
		    seen.add(identity);
		    targets.push({ projectDir: row.projectDir, dirName: row.dirName });
		    if (targets.length >= MAX_BATCH_TARGETS) break;
		  }
		  return targets;
		}

		// src/client/session-manager.module.css
		var cssText4 = "/*\n * \u4F1A\u8BDD\u7BA1\u7406\u5206\u8282\u7684\u6837\u5F0F\uFF08\u300C\u5DE5\u4F5C\u533A\u914D\u7F6E\u300D\u9875\u9762\u91CC\u7684\u5206\u8282\u5361\u7247\u4E3B\u4F53\uFF09\u3002\n *\n * \u53EA\u8865\u5B98\u65B9 primitives \u7ED9\u4E0D\u4E86\u7684\u4E1C\u897F\uFF1A\u5206\u8282\u5BB9\u5668\u4E0E\u884C\u5185\u52A8\u4F5C\u6761\u3001\u5DE5\u5177\u680F\uFF08\u8282\u5185\u57DF tab \u884C\uFF09\u3001\n * \u5217\u8868\u884C\u4E0E\u884C\u5185\u5FBD\u6807\u3001\u9009\u62E9\u6761\u3001\u786E\u8BA4\u4E0E\u7ED3\u679C\u533A\u7684\u6587\u5B57\u5C42\u7EA7\u3002\u9875\u9762\u5916\u58F3\uFF08\u9875\u5934\u3001\u5DE5\u5177\u680F\u3001\u9875\u7EA7\n * tab\uFF09\u7531 holder \u7684\u9875\u9762\u8D1F\u8D23\uFF0CButton / SegmentedTabs / Checkbox \u7684\u9AA8\u67B6\u3001\u5C3A\u5BF8\u4E0E\u7126\u70B9\u73AF\n * \u5168\u90E8\u7531 primitives \u8D1F\u8D23\uFF0C\u8FD9\u91CC\u4E0D\u590D\u5236\u5B83\u4EEC\u7684\u914D\u8272\uFF0C\u4E5F\u4E0D\u4E0E\u5220\u9664\u786E\u8BA4\u5BF9\u8BDD\u6846\u7684\u6837\u5F0F\u6587\u4EF6\u6DF7\u7528\n * \uFF08\u4E24\u5904\u89C6\u89C9\u8BED\u4E49\u4E0D\u540C\uFF0C\u4E14 bundle \u7684\u6837\u5F0F\u6CE8\u5165\u5668\u6309\u6A21\u5757\u5404\u81EA\u8BA1\u6570\uFF09\u3002\n *\n * \u989C\u8272\u7EAA\u5F8B\uFF1A\u6BCF\u4E00\u5904\u989C\u8272\u90FD\u662F `var(--dsw-alias-*, <\u515C\u5E95>, )` \u5F62\u6001\u2014\u2014\u515C\u5E95\u503C\u53EA\u7528 CSS \u5173\u952E\u5B57\n * \uFF08`currentColor`\u3001\u5177\u540D\u8272\uFF09\u4E0E `color-mix()`\uFF0C\u4E0D\u5199\u6B7B\u5177\u4F53\u8272\u503C\u3002\u8FD9\u6837\u4EE4\u724C\u6574\u4F53\u7F3A\u5E2D\u65F6\u6700\u574F\n * \u9000\u5316\u6210\u300C\u5F53\u524D\u6587\u5B57\u8272\u7684\u6DF1\u6D45\u53D8\u5316\u300D\uFF0C\u800C\u4E0D\u662F\u67D0\u4E00\u79CD\u4E3B\u9898\u4E0B\u7684\u56FA\u5B9A\u989C\u8272\uFF08\u6DF1\u8272\u4E3B\u9898\u4E0B\u4E0D\u4F1A\u51FA\u73B0\n * \u767D\u5E95\u767D\u5B57\uFF09\u3002\u5C3A\u5BF8\u4E0E\u5706\u89D2\u540C\u6837\u4F18\u5148\u53D6\u4EE4\u724C\uFF0C\u4EE4\u724C\u7F3A\u5931\u65F6\u9000\u56DE px\u3002\n *\n * \u7C7B\u540D\u5951\u7EA6\uFF08\u5206\u8282\u7EC4\u4EF6\u6309\u6B64\u6E05\u5355\u6D88\u8D39\uFF1B\u5747\u6309 CSS Modules \u5C40\u90E8\u7C7B\u5F15\u7528\uFF09\uFF1A\n *   sectionBody\u3001actions                                  \u2014\u2014 \u5206\u8282\u5BB9\u5668\u4E0E\u6B63\u6587\u672B\u5C3E\u52A8\u4F5C\u6761\n *   toolbar\u3001tabsRow                                      \u2014\u2014 \u5DE5\u5177\u680F\u4E0E\u8282\u5185\u57DF tab \u884C\n *   modes\u3001modeRow\u3001modeText                              \u2014\u2014 tab 2 \u7684\u5904\u7F6E\u65B9\u5F0F\u5355\u9009\n *   selectionBar\u3001list\u3001row\u3001rowSelected\u3001rowDisabled     \u2014\u2014 \u9009\u62E9\u6761\u4E0E\u5217\u8868\n *   rowMeta\u3001badge\u3001badgeRunning\u3001badgeBlank              \u2014\u2014 \u884C\u5185\u5143\u4FE1\u606F\u4E0E\u5FBD\u6807\n *   empty\u3001truncated\u3001muted                               \u2014\u2014 \u7A7A\u6001 / \u622A\u65AD / \u8FC7\u7A0B\u6587\u6848\n *   summary\u3001rejected                                     \u2014\u2014 \u786E\u8BA4\u9636\u6BB5\u7684\u6458\u8981\u4E0E\u88AB\u62D2\u6E05\u5355\n *   result\u3001warnings\u3001failure\u3001detail\u3001danger             \u2014\u2014 \u7ED3\u679C\u533A\u4E0E\u5E95\u90E8\u5371\u9669\u6309\u94AE\n *\n * \u6784\u5EFA\u671F\u7C7B\u540D\u7531\u6784\u5EFA\u811A\u672C\u7684 cssModulesPlugin \u91CD\u5199\u4E3A `wux_<local>_<hash>`\u3002\n */\n\n/* \u2014\u2014 \u5206\u8282\u5BB9\u5668\uFF1A\u7EB5\u5411 flex\uFF0C\u6B63\u6587\u4E0E\u52A8\u4F5C\u6761\u4E4B\u95F4\u4E0D\u7559\u9690\u5F0F\u95F4\u9699 \u2014\u2014 */\n.wux_sectionBody_0f32fb {\n  box-sizing: border-box;\n  display: flex;\n  flex-direction: column;\n  gap: 0;\n  min-width: 0;\n  /* \u5185\u5BB9\u5217\u7531 holder \u7684\u9875\u9762\u8D1F\u8D23\u6EDA\u52A8\uFF1B\u8FD9\u91CC\u53EA\u4FDD\u8BC1 flex \u6536\u7F29\u4E0D\u6491\u7834\u5361\u7247\u3002 */\n  min-height: 0;\n}\n\n/* \u2014\u2014 \u884C\u5185\u52A8\u4F5C\u6761\uFF1A\u5206\u8282\u6CA1\u6709\u72EC\u7ACB footer\uFF0C\u9636\u6BB5\u52A8\u4F5C\u8DDF\u5728\u6B63\u6587\u4E4B\u540E\u3001\u53F3\u4E0B\u5BF9\u9F50 \u2014\u2014 */\n.wux_actions_0f32fb {\n  display: flex;\n  flex-wrap: wrap;\n  justify-content: flex-end;\n  gap: 8px;\n  margin-top: 12px;\n  padding-top: 12px;\n  border-top: 1px solid var(--dsw-alias-border-l1, gray);\n}\n\n/* \u2014\u2014 \u5DE5\u5177\u680F\uFF1A\u53EA\u5269\u8282\u5185\u4E09\u4E2A\u57DF tab\uFF08\u5DE5\u4F5C\u533A\u9009\u62E9\u5F52\u9875\u9762\u5DE5\u5177\u680F\u7684\u9009\u62E9\u6846\uFF0C\u6362\u5DE5\u4F5C\u533A = \u5206\u8282\u91CD\u6302\uFF09 \u2014\u2014 */\n.wux_toolbar_0f32fb {\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n  margin: 0 0 12px;\n}\n\n/* SegmentedTabs \u7684\u653E\u7F6E\u7C7B\uFF1A\u4E09\u6BB5\u7B49\u5206\uFF0C\u4E0E\u5DE5\u5177\u680F\u540C\u5BBD\u3002 */\n.wux_tabsRow_0f32fb {\n  width: 100%;\n  min-width: 0;\n}\n\n/* \u2014\u2014 tab 2 \u7684\u5904\u7F6E\u65B9\u5F0F\u5355\u9009\uFF1A\u590D\u7528\u65E2\u6709\u5904\u7F6E\u65B9\u5F0F\u6587\u6848\u952E\uFF0C\u4F46\u7ED3\u6784\u5728\u672C\u6A21\u5757\u5185\u81EA\u7ED8 \u2014\u2014 */\n/* fieldset \u81EA\u5E26\u8FB9\u6846\u4E0E\u5185\u8FB9\u8DDD\uFF0C\u8FD9\u91CC\u5168\u90E8\u62B9\u5E73\u53EA\u7559\u5206\u7EC4\u95F4\u8DDD\u3002 */\n.wux_modes_0f32fb {\n  margin: 0 0 10px;\n  padding: 0;\n  border: 0;\n  min-inline-size: 0;\n}\n\n/* legend \u662F\u539F\u751F\u8BED\u4E49\u5143\u7D20\u3001\u6CA1\u6709 className\uFF0C\u53EA\u80FD\u5728\u540E\u4EE3\u91CC\u5BF9\u9F50\u5206\u533A\u6807\u9898\u7684\u5B57\u7EA7\u3002 */\n.wux_modes_0f32fb legend {\n  display: block;\n  margin: 0 0 4px;\n  padding: 0;\n  color: var(--dsw-alias-label-secondary, currentColor);\n  font-size: 13px;\n  font-weight: 600;\n  line-height: 20px;\n}\n\n/* \u9009\u9879\u884C\uFF1A\u6574\u884C\u662F label\uFF0C\u70B9\u6587\u5B57\u7B49\u4E8E\u70B9 radio\u3002 */\n.wux_modeRow_0f32fb {\n  display: flex;\n  align-items: flex-start;\n  gap: 8px;\n  padding: 2px 0;\n  cursor: pointer;\n}\n\n/* \u539F\u751F radio \u53EA\u6539\u5F3A\u8C03\u8272\uFF0C\u5C3A\u5BF8\u4E0E\u547D\u4E2D\u533A\u4FDD\u6301\u7CFB\u7EDF\u9ED8\u8BA4\u3002 */\n.wux_modeRow_0f32fb input {\n  flex: none;\n  margin: 3px 0 0;\n  accent-color: var(--dsw-alias-state-business-primary, currentColor);\n}\n\n.wux_modeText_0f32fb {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n  color: var(--dsw-alias-label-primary, currentColor);\n  font-size: 13px;\n  line-height: 20px;\n}\n\n/* \u6267\u884C\u4E2D\uFF08fieldset disabled\uFF09\uFF1A\u6574\u7EC4\u964D\u7EA7\u5230\u5F31\u5316\u8272\uFF0C\u884C\u4E5F\u4E0D\u518D\u663E\u793A\u53EF\u70B9\u624B\u52BF\u3002 */\n.wux_modes_0f32fb:disabled .wux_modeRow_0f32fb {\n  cursor: default;\n}\n\n.wux_modes_0f32fb:disabled .wux_modeText_0f32fb {\n  color: var(--dsw-alias-label-tertiary, currentColor);\n}\n\n/* \u2014\u2014 \u9009\u62E9\u6761\uFF1A\u5168\u9009 / \u5DF2\u9009\u8BA1\u6570 / \u6E05\u7A7A\uFF0C\u4E0E\u5217\u8868\u4E4B\u95F4\u7528\u4E00\u6761\u7EC6\u7EBF\u5206\u9694 \u2014\u2014 */\n.wux_selectionBar_0f32fb {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 8px;\n  margin: 0 0 8px;\n  padding: 8px 0;\n  border-top: 1px solid var(--dsw-alias-border-l1, gray);\n  border-bottom: 1px solid var(--dsw-alias-border-l1, gray);\n  color: var(--dsw-alias-label-secondary, currentColor);\n  font-size: 13px;\n  line-height: 20px;\n}\n\n/* \u8BA1\u6570\u9760\u53F3\uFF0C\u300C\u6E05\u7A7A\u300D\u7D27\u968F\u5176\u540E\uFF1B\u9009\u62E9\u6761\u53EA\u6709\u4E00\u4E2A span\uFF0C\u4E0D\u4F1A\u8BEF\u4F24\u6309\u94AE\u3002 */\n.wux_selectionBar_0f32fb > span {\n  min-width: 0;\n  margin-left: auto;\n}\n\n/* \u2014\u2014 \u5217\u8868\u4E0E\u884C\uFF1A\u884C\u5185\u662F Checkbox\uFF08\u6807\u9898\u5373 label\uFF09+ \u5143\u4FE1\u606F + \u5FBD\u6807 \u2014\u2014 */\n.wux_list_0f32fb {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n  margin: 0;\n  padding: 0;\n  list-style: none;\n  /* \u6761\u6570\u4E0A\u9650\u7531 model \u622A\u65AD\uFF0C\u8FD9\u91CC\u53EA\u515C\u4F4F\u89C6\u53E3\u9AD8\u5EA6\uFF1A\u5217\u8868\u81EA\u5DF1\u6EDA\u52A8\uFF0CModal \u4E0D\u6574\u4F53\u957F\u9AD8\u3002 */\n  max-height: min(46vh, 420px);\n  overflow-y: auto;\n  overscroll-behavior: contain;\n}\n\n.wux_row_0f32fb {\n  display: flex;\n  align-items: flex-start;\n  gap: 8px;\n  padding: 6px 8px;\n  border-radius: var(--dsw-radius-sm, 6px);\n}\n\n.wux_row_0f32fb:hover {\n  background: var(--dsw-alias-interactive-bg-hover, color-mix(in srgb, currentColor 6%, transparent));\n}\n\n/* \u9996\u5217\u662F Checkbox\uFF1A\u5403\u6389\u5269\u4F59\u5BBD\u5EA6\uFF0C\u5143\u4FE1\u606F\u4E0E\u5FBD\u6807\u6309\u81EA\u8EAB\u6700\u5927\u5BBD\u5EA6\u9760\u53F3\u6392\u5E03\u3002 */\n.wux_row_0f32fb > :first-child {\n  flex: 1 1 auto;\n  min-width: 0;\n}\n\n/* \u5DF2\u9009\u884C\uFF1A\u54C1\u724C\u8272\u7684\u6D45\u5C42\u5E95\uFF0C\u52FE\u9009\u6001\u4E0E\u6574\u884C\u5E95\u8272\u4E92\u4E0D\u62A2\u6CE8\u610F\u529B\u3002 */\n.wux_rowSelected_0f32fb,\n.wux_rowSelected_0f32fb:hover {\n  background: var(--dsw-alias-state-business-tertiary, color-mix(in srgb, currentColor 10%, transparent));\n}\n\n/* \u8FD0\u884C\u4E2D\u7684\u884C\u4E0D\u53EF\u52FE\u9009\uFF1A\u53D6\u6D88\u60AC\u505C\u53CD\u9988\uFF0C\u52FE\u9009\u6846\u81EA\u8EAB\u7684\u7981\u7528\u964D\u7EA7\u7531 Checkbox \u8D1F\u8D23\u3002 */\n.wux_rowDisabled_0f32fb,\n.wux_rowDisabled_0f32fb:hover {\n  background: none;\n  cursor: default;\n}\n\n/* \u884C\u5185\u5143\u4FE1\u606F\uFF08\u65F6\u95F4 / \u4F53\u79EF\uFF09\uFF1A\u7B49\u5BBD\u6570\u5B57\u5BF9\u9F50\uFF0C\u5F31\u5316\u5230\u8F85\u52A9\u5C42\u7EA7\u3002 */\n.wux_rowMeta_0f32fb {\n  flex: none;\n  align-self: center;\n  color: var(--dsw-alias-label-tertiary, currentColor);\n  font-size: 12px;\n  line-height: 18px;\n  white-space: nowrap;\n  font-variant-numeric: tabular-nums;\n}\n\n/* \u5FBD\u6807\uFF1A\u884C\u5185\u72B6\u6001\u80F6\u56CA\uFF0C\u5E95\u4E0E\u63CF\u8FB9\u90FD\u53D6\u5C42\u53E0\u8272\uFF0C\u4E0D\u5F15\u5165\u7B2C\u4E09\u79CD\u5F3A\u8C03\u8272\u3002 */\n.wux_badge_0f32fb {\n  flex: none;\n  align-self: center;\n  padding: 0 6px;\n  border: 0.5px solid var(--dsw-alias-border-l2, gray);\n  border-radius: var(--dsw-radius-sm, 6px);\n  background: var(--dsw-alias-bg-layer-3, color-mix(in srgb, currentColor 8%, transparent));\n  color: var(--dsw-alias-label-secondary, currentColor);\n  font-size: 12px;\n  line-height: 18px;\n  white-space: nowrap;\n}\n\n/* \u300C\u8FD0\u884C\u4E2D\u300D\u662F\u884C\u4E0D\u53EF\u52FE\u9009\u7684\u552F\u4E00\u539F\u56E0\uFF0C\u7528\u72B6\u6001\u8272\u800C\u4E0D\u662F\u666E\u901A\u5F31\u5316\u8272\u3002 */\n.wux_badgeRunning_0f32fb {\n  color: var(--dsw-alias-state-success-primary, currentColor);\n}\n\n/* \u300C\u7A7A\u767D\u300D\u53EA\u662F\u6CA1\u6709\u5185\u5BB9\uFF0C\u4E0D\u662F\u5F02\u5E38\uFF1A\u4FDD\u6301\u5F31\u5316\uFF0C\u4E0D\u62A5\u8B66\u3002 */\n.wux_badgeBlank_0f32fb {\n  color: var(--dsw-alias-label-tertiary, currentColor);\n}\n\n/* \u2014\u2014 \u7A7A\u6001 / \u622A\u65AD / \u8FC7\u7A0B\u6587\u6848 \u2014\u2014 */\n.wux_empty_0f32fb {\n  margin: 0;\n  padding: 20px 0;\n  color: var(--dsw-alias-label-tertiary, currentColor);\n  font-size: 13px;\n  line-height: 20px;\n  text-align: center;\n}\n\n/* \u5217\u8868\u622A\u65AD\u63D0\u793A\uFF1A\u8FD9\u662F\u9700\u8981\u7528\u6237\u52A8\u624B\u7684\u4E8B\u5B9E\uFF0C\u7528\u8B66\u544A\u8272\u800C\u4E0D\u662F\u7070\u5B57\u3002 */\n.wux_truncated_0f32fb {\n  margin: 8px 0 0;\n  color: var(--dsw-alias-state-warn-label, currentColor);\n  font-size: 12px;\n  line-height: 18px;\n}\n\n/* \u8FDB\u884C\u4E2D\u7B49\u8FC7\u7A0B\u6587\u6848\uFF1A\u4F4E\u8C03\uFF0C\u4E0D\u4E0E\u64CD\u4F5C\u5BF9\u8C61\u62A2\u6CE8\u610F\u529B\u3002 */\n.wux_muted_0f32fb {\n  margin: 0;\n  color: var(--dsw-alias-label-tertiary, currentColor);\n  font-size: 13px;\n  line-height: 20px;\n}\n\n/* \u2014\u2014 \u786E\u8BA4\u9636\u6BB5\uFF1A\u6458\u8981\uFF08\u76EE\u6807\u6570 / \u7EA7\u8054\u6570 / \u4F53\u79EF / \u5F52\u6863\u6839\uFF09\u4E0E\u88AB\u62D2\u6E05\u5355 \u2014\u2014 */\n.wux_summary_0f32fb {\n  margin: 0 0 12px;\n  color: var(--dsw-alias-label-secondary, currentColor);\n  font-size: 13px;\n  line-height: 20px;\n}\n\n.wux_summary_0f32fb p {\n  margin: 0 0 4px;\n}\n\n.wux_summary_0f32fb ul {\n  margin: 0;\n  padding-left: 18px;\n}\n\n.wux_summary_0f32fb li + li {\n  margin-top: 2px;\n}\n\n/* \u88AB\u62D2\u6E05\u5355\uFF1A\u5BBF\u4E3B\u56DE\u7EDD\u7684\u6761\u76EE\uFF0C\u6267\u884C\u6309\u94AE\u4F1A\u628A\u8FD9\u4E9B\u6392\u9664\u5728\u672C\u6279\u4E4B\u5916\u3002 */\n.wux_rejected_0f32fb {\n  margin: 0 0 12px;\n  color: var(--dsw-alias-state-warn-label, currentColor);\n  font-size: 13px;\n  line-height: 20px;\n}\n\n.wux_rejected_0f32fb ul {\n  margin: 4px 0 0;\n  padding-left: 18px;\n}\n\n.wux_rejected_0f32fb li {\n  word-break: break-word;\n}\n\n/* \u2014\u2014 \u7ED3\u679C\u533A\uFF1A\u6210\u529F\u8BA1\u6570 + \u9010\u9879\u5931\u8D25 + \u534A\u5931\u8D25 warnings \u2014\u2014 */\n.wux_result_0f32fb {\n  margin: 0;\n  color: var(--dsw-alias-label-primary, currentColor);\n  font-size: 14px;\n  line-height: 22px;\n}\n\n.wux_result_0f32fb p {\n  margin: 0 0 6px;\n}\n\n.wux_result_0f32fb ul {\n  margin: 0;\n  padding-left: 18px;\n}\n\n.wux_result_0f32fb li {\n  word-break: break-word;\n}\n\n/* warnings \u662F\u5BBF\u4E3B\u7ED9\u7684\u300C\u8DEF\u5F84: \u539F\u56E0\u300D\u673A\u5668\u53EF\u8BFB\u4E32\uFF0C\u7B49\u5BBD\u5B57\u4F53\u539F\u6837\u5217\u51FA\u3002 */\n.wux_warnings_0f32fb {\n  margin: 12px 0 0;\n  color: var(--dsw-alias-label-secondary, currentColor);\n  font-size: 12px;\n  line-height: 18px;\n}\n\n.wux_warnings_0f32fb p {\n  margin: 0 0 4px;\n}\n\n.wux_warnings_0f32fb ul {\n  margin: 0;\n  padding-left: 18px;\n}\n\n.wux_warnings_0f32fb code {\n  font-family: var(--ds-font-family-code, monospace);\n  word-break: break-all;\n}\n\n/* \u6574\u5355\u5931\u8D25\uFF1A\u9519\u8BEF\u8272\u53EA\u7ED9\u771F\u6B63\u5931\u8D25\u7684\u90A3\u4E00\u53E5\u3002 */\n.wux_failure_0f32fb {\n  margin: 0;\n  color: var(--dsw-alias-state-error-primary, crimson);\n  font-size: 14px;\n  line-height: 22px;\n}\n\n/* \u5BBF\u4E3B\u515C\u5E95\u8BF4\u660E\uFF08\u672A\u672C\u5730\u5316\uFF09\uFF1A\u6BD4\u5931\u8D25\u539F\u56E0\u4F4E\u4E00\u5C42\u3002 */\n.wux_detail_0f32fb {\n  margin: 6px 0 0;\n  color: var(--dsw-alias-label-tertiary, currentColor);\n  font-size: 12px;\n  line-height: 18px;\n  word-break: break-word;\n}\n\n/* \u2014\u2014 \u5371\u9669\u6309\u94AE\uFF1AButton \u6CA1\u6709 danger variant\uFF0Ctab 3 \u7684\u300C\u6C38\u4E45\u5220\u9664\u6240\u9009\u300D\u7528\u5B83\u4E0A\u8272 \u2014\u2014 */\n.wux_danger_0f32fb {\n  color: var(--dsw-alias-label-primary-foreground, white);\n  background: var(--dsw-alias-state-error-primary, crimson);\n}\n\n.wux_danger_0f32fb:hover:not(:disabled) {\n  background: var(--dsw-alias-state-error-secondary, indianred);\n}\n";
		if (typeof document !== "undefined" && document.querySelector('style[data-dsh-plugin="dsh-plugin-web-ux"][data-dsh-css="0f32fb"]') === null) {
		  const style = document.createElement("style");
		  style.setAttribute("data-dsh-plugin", "dsh-plugin-web-ux");
		  style.setAttribute("data-dsh-css", "0f32fb");
		  style.textContent = cssText4;
		  document.head.appendChild(style);
		}
		var session_manager_default = { "sectionBody": "wux_sectionBody_0f32fb", "actions": "wux_actions_0f32fb", "toolbar": "wux_toolbar_0f32fb", "tabsRow": "wux_tabsRow_0f32fb", "modes": "wux_modes_0f32fb", "modeRow": "wux_modeRow_0f32fb", "modeText": "wux_modeText_0f32fb", "selectionBar": "wux_selectionBar_0f32fb", "list": "wux_list_0f32fb", "row": "wux_row_0f32fb", "rowSelected": "wux_rowSelected_0f32fb", "rowDisabled": "wux_rowDisabled_0f32fb", "rowMeta": "wux_rowMeta_0f32fb", "badge": "wux_badge_0f32fb", "badgeRunning": "wux_badgeRunning_0f32fb", "badgeBlank": "wux_badgeBlank_0f32fb", "empty": "wux_empty_0f32fb", "truncated": "wux_truncated_0f32fb", "muted": "wux_muted_0f32fb", "summary": "wux_summary_0f32fb", "rejected": "wux_rejected_0f32fb", "result": "wux_result_0f32fb", "warnings": "wux_warnings_0f32fb", "failure": "wux_failure_0f32fb", "detail": "wux_detail_0f32fb", "danger": "wux_danger_0f32fb" };

		// src/client/SessionManagerDialog.tsx
		var import_jsx_runtime5 = require("react/jsx-runtime");
		var TAB_IDS = {
		  active: { tab: "web-ux-manager-tab-active", panel: "web-ux-manager-panel-active" },
		  archived: { tab: "web-ux-manager-tab-archived", panel: "web-ux-manager-panel-archived" },
		  migrated: { tab: "web-ux-manager-tab-migrated", panel: "web-ux-manager-panel-migrated" }
		};
		var ACTION_LABELS = {
		  archive: "manager.action.archive",
		  dispose: "manager.action.dispose",
		  unarchive: "manager.action.unarchive",
		  purge: "manager.action.purge",
		  restore: "manager.action.restore"
		};
		var ACTION_ORDER = ["archive", "dispose", "unarchive", "restore", "purge"];
		function cx(...values) {
		  let result = "";
		  for (const value of values) {
		    if (typeof value !== "string" || value === "") continue;
		    result = result === "" ? value : `${result} ${value}`;
		  }
		  return result;
		}
		function failureCodeOf(error) {
		  if (typeof error !== "object" || error === null) return void 0;
		  const candidate = error;
		  if (typeof candidate.code === "string" && candidate.code !== "") return candidate.code;
		  const rpc = candidate.rpcError;
		  if (rpc !== void 0 && typeof rpc.code === "string" && rpc.code !== "") return rpc.code;
		  return void 0;
		}
		function asManagerError(error) {
		  if (error instanceof DeleteError) return error;
		  const message = error instanceof Error ? error.message : String(error);
		  return new DeleteError(failureCodeOf(error) ?? "fallback", message);
		}
		function reasonOf(error, t) {
		  const code = failureCodeOf(error);
		  if (code !== void 0) return t(errorKeyOf(code));
		  if (error instanceof Error && error.message !== "") return error.message;
		  return String(error);
		}
		function formatTime(updatedAt) {
		  return new Date(updatedAt).toLocaleString();
		}
		function useWorkspacesSnapshot(source) {
		  const ref = (0, import_react5.useRef)(source);
		  ref.current = source;
		  const subscribe = (0, import_react5.useMemo)(() => (listener) => ref.current.list.subscribe(listener), []);
		  const read = (0, import_react5.useMemo)(() => () => ref.current.list.getSnapshot(), []);
		  return (0, import_react5.useSyncExternalStore)(subscribe, read, read);
		}
		function useSessionsSnapshot(source) {
		  const ref = (0, import_react5.useRef)(source);
		  ref.current = source;
		  const subscribe = (0, import_react5.useMemo)(() => (listener) => ref.current.list.subscribe(listener), []);
		  const read = (0, import_react5.useMemo)(() => () => ref.current.list.getSnapshot(), []);
		  return (0, import_react5.useSyncExternalStore)(subscribe, read, read);
		}
		function SessionManagerSection({
		  client,
		  workspaces,
		  sessions,
		  t,
		  workspace
		}) {
		  if (client === void 0 || workspaces === void 0 || sessions === void 0 || workspace.kind === "none") {
		    return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: session_manager_default.sectionBody, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: session_manager_default.empty, children: t("manager.unavailable") }) });
		  }
		  const choice = workspace.kind === "workspace" ? workspace.id : UNASSIGNED_CHOICE;
		  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
		    SessionManagerContent,
		    {
		      choice,
		      client,
		      workspaces,
		      sessions,
		      t
		    },
		    choice
		  );
		}
		function SessionManagerContent({ choice, client, workspaces, sessions, t }) {
		  const workspacesSnapshot = useWorkspacesSnapshot(workspaces);
		  const sessionsSnapshot = useSessionsSnapshot(sessions);
		  const [phase, setPhase] = (0, import_react5.useState)("select");
		  const [tab, setTab] = (0, import_react5.useState)("active");
		  const [selection, setSelection] = (0, import_react5.useState)(emptySelection);
		  const [mode, setMode] = (0, import_react5.useState)(DEFAULT_DISPOSAL_MODE);
		  const [pending, setPending] = (0, import_react5.useState)(null);
		  const [outcome, setOutcome] = (0, import_react5.useState)(null);
		  const [failure, setFailure] = (0, import_react5.useState)(null);
		  const [listing, setListing] = (0, import_react5.useState)(null);
		  const [listingPhase, setListingPhase] = (0, import_react5.useState)("idle");
		  const [listingError, setListingError] = (0, import_react5.useState)(null);
		  const [listingToken, setListingToken] = (0, import_react5.useState)(0);
		  const listingLoaded = (0, import_react5.useRef)(false);
		  (0, import_react5.useEffect)(() => {
		    if (tab !== "migrated" || listingLoaded.current) return;
		    let cancelled = false;
		    setListingPhase("loading");
		    setListingError(null);
		    void client.listMigrated().then(
		      (value) => {
		        if (cancelled) return;
		        listingLoaded.current = true;
		        setListing(value);
		        setListingPhase("ready");
		      },
		      (error) => {
		        if (cancelled) return;
		        setListingError(asManagerError(error));
		        setListingPhase("failed");
		      }
		    );
		    return () => {
		      cancelled = true;
		    };
		  }, [client, listingToken, tab]);
		  const activeRowList = (0, import_react5.useMemo)(
		    () => activeRows(choice, workspacesSnapshot, sessionsSnapshot),
		    [choice, sessionsSnapshot, workspacesSnapshot]
		  );
		  const archivedRowList = (0, import_react5.useMemo)(
		    () => archivedRows(choice, workspacesSnapshot, sessionsSnapshot),
		    [choice, sessionsSnapshot, workspacesSnapshot]
		  );
		  const migratedRowList = (0, import_react5.useMemo)(
		    () => listing === null ? [] : migratedRows(choice, workspacesSnapshot, listing),
		    [choice, listing, workspacesSnapshot]
		  );
		  const sessionRowList = tab === "active" ? activeRowList : archivedRowList;
		  const rows = tab === "migrated" ? migratedRowList : sessionRowList;
		  const effectiveCount = selectedCount(selection, tab, rows);
		  const everySelected = allSelected(selection, tab, rows);
		  const truncatedCount = tab === "migrated" && listing?.truncated === true ? MAX_LISTED_MIGRATED : selectionLimitReached(rows) ? MAX_BATCH_TARGETS : null;
		  const emptyText = (() => {
		    if (tab === "active") {
		      if (workspacesSnapshot.items.length === 0) return t("manager.workspace.empty");
		      return choice === UNASSIGNED_CHOICE ? t("manager.empty.unassigned") : t("manager.empty.active");
		    }
		    if (tab === "archived") {
		      return choice === UNASSIGNED_CHOICE ? t("manager.empty.unassigned.archived") : t("manager.empty.archived");
		    }
		    return choice === UNASSIGNED_CHOICE ? t("manager.empty.unassigned") : t("manager.empty.migrated");
		  })();
		  const tabIds = TAB_IDS[tab];
		  const tabItems = [
		    { value: "active", label: t("manager.tab.active"), id: TAB_IDS.active.tab, panelId: TAB_IDS.active.panel },
		    { value: "archived", label: t("manager.tab.archived"), id: TAB_IDS.archived.tab, panelId: TAB_IDS.archived.panel },
		    { value: "migrated", label: t("manager.tab.migrated"), id: TAB_IDS.migrated.tab, panelId: TAB_IDS.migrated.panel }
		  ];
		  const resetToSelect = () => {
		    setPhase("select");
		    setPending(null);
		    setOutcome(null);
		    setFailure(null);
		  };
		  const changeTab = (next) => {
		    if (phase === "running") return;
		    setTab(next);
		    resetToSelect();
		  };
		  const changeMode = (next) => {
		    setMode(next);
		    resetToSelect();
		  };
		  const reloadListing = () => {
		    listingLoaded.current = false;
		    setListingToken((value) => value + 1);
		  };
		  const migratedBatch = () => {
		    const targets = selectedMigratedTargets(migratedRowList, selection.migrated);
		    if (targets.length === 0) return null;
		    let bytes = 0;
		    for (const row of migratedRowList) {
		      if (selection.migrated.has(row.key)) bytes += row.bytes;
		    }
		    return { targets, bytes };
		  };
		  const runPerItem = async (ids, run) => {
		    let ok = 0;
		    const failures = [];
		    for (const sessionId of ids) {
		      try {
		        await run(sessionId);
		        ok += 1;
		      } catch (error) {
		        failures.push({ id: sessionId, reason: reasonOf(error, t) });
		      }
		    }
		    return { ok, failures };
		  };
		  const acceptedIdsOf = (batch) => {
		    if (batch.preview.rejected.length === 0) return batch.ids;
		    const rejected = new Set(batch.preview.rejected.map((entry) => entry.sessionId));
		    return batch.ids.filter((sessionId) => !rejected.has(sessionId));
		  };
		  const startAction = (action) => {
		    if (phase !== "select") return;
		    switch (action.kind) {
		      case "archive": {
		        const ids = selectedSessionIds(activeRowList, selection.active);
		        if (ids.length === 0) return;
		        setPending({ kind: "archive", ids });
		        setPhase("confirm");
		        return;
		      }
		      case "unarchive": {
		        const ids = unarchiveSelected(selection, archivedRowList);
		        if (ids.length === 0) return;
		        setPending({ kind: "unarchive", ids });
		        setPhase("confirm");
		        return;
		      }
		      case "dispose": {
		        const ids = selectedSessionIds(archivedRowList, selection.archived);
		        if (ids.length === 0) return;
		        setPhase("running");
		        void client.previewBatch(ids, action.mode).then(
		          (preview) => {
		            setPending({ kind: "dispose", ids, mode: action.mode, preview });
		            setPhase("confirm");
		          },
		          (error) => {
		            setFailure(asManagerError(error));
		            setPhase("failed");
		          }
		        );
		        return;
		      }
		      case "purge": {
		        const batch = migratedBatch();
		        if (batch === null) return;
		        setPending({ kind: "purge", targets: batch.targets, bytes: batch.bytes });
		        setPhase("confirm");
		        return;
		      }
		      case "restore": {
		        const batch = migratedBatch();
		        if (batch === null) return;
		        setPending({ kind: "restore", targets: batch.targets, bytes: batch.bytes });
		        setPhase("confirm");
		        return;
		      }
		    }
		  };
		  const runPending = () => {
		    if (phase !== "confirm" || pending === null) return;
		    const batch = pending;
		    if (batch.kind === "dispose" && acceptedIdsOf(batch).length === 0) return;
		    const complete = (next) => {
		      setSelection((current) => clearSelection(current, tab));
		      setOutcome(next);
		      setPhase("done");
		    };
		    const fail = (error) => {
		      setFailure(asManagerError(error));
		      setPhase("failed");
		    };
		    setPhase("running");
		    switch (batch.kind) {
		      case "archive":
		        void runPerItem(batch.ids, (sessionId) => workspaces.archiveSession(sessionId)).then((result) => {
		          complete({ kind: "archive", ok: result.ok, failures: result.failures });
		        });
		        return;
		      case "unarchive":
		        void runPerItem(batch.ids, (sessionId) => workspaces.unarchiveSession(sessionId)).then((result) => {
		          complete({ kind: "unarchive", ok: result.ok, failures: result.failures });
		        });
		        return;
		      case "dispose":
		        void client.disposeBatch(acceptedIdsOf(batch), batch.mode).then(
		          (value) => {
		            complete({ kind: "dispose", ok: value.removed.length, warnings: value.warnings });
		          },
		          fail
		        );
		        return;
		      case "purge":
		        void client.deleteMigrated(batch.targets).then(
		          (value) => {
		            reloadListing();
		            complete({ kind: "purge", ok: value.removed.length, warnings: value.warnings });
		          },
		          fail
		        );
		        return;
		      case "restore":
		        void client.restoreMigrated(batch.targets).then(
		          (value) => {
		            reloadListing();
		            complete({ kind: "restore", restored: value.restored, warnings: value.warnings });
		          },
		          fail
		        );
		        return;
		    }
		  };
		  const confirmArchiveRoot = pending?.kind === "dispose" ? pending.preview.archiveRoot : listing?.archiveRoot ?? null;
		  const runLabel = pending?.kind === "unarchive" ? t("manager.unarchive.run") : t("manager.confirm.run");
		  const runDanger = pending?.kind === "purge" || pending?.kind === "dispose" && pending.mode === "delete";
		  const actionButtons = [...actionsForTab(tab, mode)].sort((left, right) => ACTION_ORDER.indexOf(left.kind) - ACTION_ORDER.indexOf(right.kind)).map((action) => {
		    const danger = action.kind === "purge" || action.kind === "dispose" && action.mode === "delete";
		    return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
		      import_dsh_client_ui_primitives3.Button,
		      {
		        variant: action.kind === "unarchive" ? "outline" : "primary",
		        className: danger ? session_manager_default.danger : void 0,
		        disabled: effectiveCount === 0,
		        onClick: () => {
		          startAction(action);
		        },
		        children: t(ACTION_LABELS[action.kind])
		      },
		      action.kind
		    );
		  });
		  const footer = (() => {
		    if (phase === "select") {
		      return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_jsx_runtime5.Fragment, { children: actionButtons });
		    }
		    if (phase === "confirm") {
		      const runnable = pending !== null && !(pending.kind === "dispose" && acceptedIdsOf(pending).length === 0);
		      return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives3.Button, { variant: "outline", onClick: resetToSelect, children: t("manager.confirm.back") }),
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
		          import_dsh_client_ui_primitives3.Button,
		          {
		            variant: "primary",
		            className: runDanger ? session_manager_default.danger : void 0,
		            onClick: runPending,
		            disabled: !runnable,
		            children: runLabel
		          }
		        )
		      ] });
		    }
		    if (phase === "running") {
		      return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives3.Button, { variant: "outline", disabled: true, children: t("dialog.cancel") });
		    }
		    if (phase === "done") {
		      return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives3.Button, { variant: "outline", onClick: resetToSelect, children: t("manager.finish") });
		    }
		    return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives3.Button, { variant: "outline", onClick: resetToSelect, children: t("manager.confirm.back") }),
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives3.Button, { variant: "outline", onClick: resetToSelect, children: t("manager.finish") })
		    ] });
		  })();
		  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: session_manager_default.sectionBody, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: session_manager_default.toolbar, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
		      import_dsh_client_ui_primitives3.SegmentedTabs,
		      {
		        className: session_manager_default.tabsRow,
		        items: tabItems,
		        value: tab,
		        onChange: changeTab,
		        label: t("manager.tabs.label")
		      }
		    ) }),
		    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { role: "tabpanel", id: tabIds.panel, "aria-labelledby": tabIds.tab, children: [
		      tab === "archived" && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("fieldset", { className: session_manager_default.modes, disabled: phase === "running", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("legend", { children: t("dialog.mode.legend") }),
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("label", { className: session_manager_default.modeRow, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
		            "input",
		            {
		              type: "radio",
		              name: "web-ux-manager-mode",
		              value: "archive",
		              checked: mode === "archive",
		              disabled: phase === "running",
		              onChange: () => {
		                changeMode("archive");
		              }
		            }
		          ),
		          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: session_manager_default.modeText, children: t("dialog.mode.archive") })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("label", { className: session_manager_default.modeRow, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
		            "input",
		            {
		              type: "radio",
		              name: "web-ux-manager-mode",
		              value: "delete",
		              checked: mode === "delete",
		              disabled: phase === "running",
		              onChange: () => {
		                changeMode("delete");
		              }
		            }
		          ),
		          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: session_manager_default.modeText, children: t("dialog.mode.delete") })
		        ] })
		      ] }),
		      tab === "migrated" && phase === "select" && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
		        import_dsh_client_ui_primitives3.Button,
		        {
		          variant: "ghost",
		          icon: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives3.IconRefreshOutlineRegular, {}),
		          onClick: reloadListing,
		          disabled: listingPhase === "loading",
		          children: t("manager.refresh")
		        }
		      ),
		      phase === "select" && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: session_manager_default.selectionBar, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
		            import_dsh_client_ui_primitives3.Checkbox,
		            {
		              label: t("manager.selectAll"),
		              checked: everySelected,
		              disabled: rows.length === 0,
		              onChange: (next) => {
		                setSelection((current) => next ? selectAllSelection(current, tab, rows) : clearSelection(current, tab));
		              }
		            }
		          ),
		          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: t("manager.selected", { count: effectiveCount }) }),
		          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
		            import_dsh_client_ui_primitives3.Button,
		            {
		              variant: "ghost",
		              onClick: () => {
		                setSelection((current) => clearSelection(current, tab));
		              },
		              children: t("manager.clear")
		            }
		          )
		        ] }),
		        tab === "migrated" && listingError !== null && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(FailurePanel, { failure: listingError, t }),
		        tab === "migrated" && listing === null ? (
		          // 拉取中沿用「正在执行…」的过程文案（locales 没有专门的列表加载键）。
		          listingError === null ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: session_manager_default.muted, children: t("manager.running") }) : null
		        ) : rows.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: session_manager_default.empty, children: emptyText }) : tab === "migrated" ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("ul", { className: session_manager_default.list, children: migratedRowList.map((row) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
		          "li",
		          {
		            className: cx(
		              session_manager_default.row,
		              selection.migrated.has(row.key) && session_manager_default.rowSelected,
		              !row.selectable && session_manager_default.rowDisabled
		            ),
		            children: [
		              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
		                import_dsh_client_ui_primitives3.Checkbox,
		                {
		                  label: row.sessionId,
		                  checked: selection.migrated.has(row.key),
		                  disabled: !row.selectable,
		                  onChange: () => {
		                    setSelection((current) => toggleSelection(current, "migrated", row.key));
		                  }
		                }
		              ),
		              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: session_manager_default.rowMeta, title: row.projectDir, children: row.projectDir }),
		              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: session_manager_default.rowMeta, children: t("manager.meta.size", { size: formatSize(row.bytes, t) }) }),
		              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: session_manager_default.rowMeta, children: t("manager.meta.time", { time: formatTime(row.updatedAt) }) })
		            ]
		          },
		          row.key
		        )) }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("ul", { className: session_manager_default.list, children: sessionRowList.map((row) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
		          "li",
		          {
		            className: cx(
		              session_manager_default.row,
		              selection[tab].has(row.key) && session_manager_default.rowSelected,
		              !row.selectable && session_manager_default.rowDisabled
		            ),
		            children: [
		              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
		                import_dsh_client_ui_primitives3.Checkbox,
		                {
		                  label: row.title === "" ? t("manager.untitled") : row.title,
		                  checked: selection[tab].has(row.key),
		                  disabled: !row.selectable,
		                  onChange: () => {
		                    setSelection((current) => toggleSelection(current, tab, row.key));
		                  }
		                }
		              ),
		              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: session_manager_default.rowMeta, children: t("manager.meta.time", { time: formatTime(row.updatedAt) }) }),
		              row.running && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: cx(session_manager_default.badge, session_manager_default.badgeRunning), children: t("manager.badge.running") }),
		              row.blank && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: cx(session_manager_default.badge, session_manager_default.badgeBlank), children: t("manager.badge.blank") })
		            ]
		          },
		          row.key
		        )) }),
		        truncatedCount !== null && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: session_manager_default.truncated, children: t("manager.truncated", { count: truncatedCount }) })
		      ] }),
		      phase === "confirm" && pending !== null && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
		        ConfirmPanel,
		        {
		          pending,
		          archiveRoot: confirmArchiveRoot,
		          unassigned: choice === UNASSIGNED_CHOICE,
		          t
		        }
		      ),
		      phase === "running" && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: session_manager_default.muted, children: t("manager.running") }),
		      phase === "done" && outcome !== null && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(OutcomePanel, { outcome, t }),
		      phase === "failed" && failure !== null && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(FailurePanel, { failure, t })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: session_manager_default.actions, children: footer })
		  ] });
		}
		function ConfirmPanel({ pending, archiveRoot, unassigned, t }) {
		  const heading = /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("strong", { children: t("manager.confirm.title") }) });
		  if (pending.kind === "unarchive") {
		    return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("section", { className: session_manager_default.summary, children: [
		      heading,
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { children: t("manager.unarchive.confirm", { count: pending.ids.length }) })
		    ] });
		  }
		  if (pending.kind === "archive") {
		    return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("section", { className: session_manager_default.summary, children: [
		      heading,
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("ul", { children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("li", { children: t("manager.confirm.targets", { count: pending.ids.length }) }) })
		    ] });
		  }
		  const sizeKey = pending.kind === "restore" || pending.kind === "dispose" && pending.mode === "archive" ? "dialog.summary.moveSize" : "dialog.summary.size";
		  const targetCount = pending.kind === "dispose" ? pending.preview.targetCount : pending.targets.length;
		  const bytes = pending.kind === "dispose" ? pending.preview.logBytes : pending.bytes;
		  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("section", { className: session_manager_default.summary, children: [
		      heading,
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("ul", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("li", { children: t("manager.confirm.targets", { count: targetCount }) }),
		        pending.kind === "dispose" && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("li", { children: t("dialog.summary.sessions", { count: pending.preview.sessionCount }) }),
		          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("li", { children: t("manager.confirm.cascade", { count: pending.preview.descendantCount }) })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("li", { children: t(sizeKey, { size: formatSize(bytes, t) }) }),
		        archiveRoot !== null && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("li", { children: t("manager.confirm.archiveRoot", { path: archiveRoot }) })
		      ] }),
		      pending.kind === "dispose" && pending.mode === "delete" && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { children: t("dialog.warning.irreversible") }),
		      pending.kind === "purge" && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { children: t("dialog.warning.irreversible") }),
		      pending.kind === "restore" && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { children: t("manager.confirm.restore") }),
		      pending.kind === "restore" && unassigned && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { children: t("manager.confirm.restoreUnassigned") })
		    ] }),
		    pending.kind === "dispose" && pending.preview.rejected.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("section", { className: session_manager_default.rejected, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { children: t("manager.confirm.rejected", { count: pending.preview.rejected.length }) }),
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("ul", { children: pending.preview.rejected.map((entry) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("li", { children: t("manager.itemFailure", { id: entry.sessionId, reason: t(errorKeyOf(entry.code)) }) }, entry.sessionId)) })
		    ] })
		  ] });
		}
		function OutcomePanel({ outcome, t }) {
		  const summary = outcome.kind === "archive" ? t("manager.done.archive", { count: outcome.ok }) : outcome.kind === "unarchive" ? t("manager.unarchive.done", { count: outcome.ok }) : outcome.kind === "dispose" ? t("manager.done.dispose", { count: outcome.ok }) : outcome.kind === "purge" ? t("manager.done.purge", { count: outcome.ok }) : t("manager.done.restore", { count: outcome.restored.length });
		  const unassigned = outcome.kind === "restore" ? outcome.restored.filter((entry) => entry.workspaceId === null).length : 0;
		  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: session_manager_default.result, children: summary }),
		    unassigned > 0 && outcome.kind === "restore" && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: session_manager_default.result, children: t("manager.done.restoreSplit", {
		      attached: outcome.restored.length - unassigned,
		      unassigned
		    }) }),
		    (outcome.kind === "archive" || outcome.kind === "unarchive") && outcome.failures.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("section", { className: session_manager_default.result, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { children: t(
		        outcome.kind === "archive" ? "manager.partial" : "manager.unarchive.partial",
		        { ok: outcome.ok, failed: outcome.failures.length }
		      ) }),
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("ul", { children: outcome.failures.map((item) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("li", { children: t("manager.itemFailure", { id: item.id, reason: item.reason }) }, item.id)) })
		    ] }),
		    (outcome.kind === "dispose" || outcome.kind === "purge" || outcome.kind === "restore") && outcome.warnings.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("section", { className: session_manager_default.warnings, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { children: t("manager.warnings") }),
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("ul", { children: outcome.warnings.map((warning) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("code", { children: warning }) }, warning)) })
		    ] })
		  ] });
		}
		function FailurePanel({ failure, t }) {
		  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: session_manager_default.failure, children: t("manager.failed", { reason: t(errorKeyOf(failure.code)) }) }),
		    failure.message !== "" && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: session_manager_default.detail, children: failure.message })
		  ] });
		}

		// src/client/index.ts
		var inject = ["slots", "locale", "modelDirectories"];
		var BADGE_ORDER = 10;
		var DELETE_MENU_ID = "web-ux-delete-session";
		var DELETE_MENU_ORDER = 500;
		var DELETE_DIALOG_ID = "web-ux-delete-session-dialog";
		var DELETE_DIALOG_ORDER = 500;
		var NOTICE_ID = "web-ux-command-notice";
		var NOTICE_ORDER = 10;
		var SECTION_SEAT = "workspace-config.section";
		var SECTION_ID = "web-ux-session-manager";
		var SECTION_ORDER = 30;
		function readService(ctx, name) {
		  const reader = ctx;
		  try {
		    return reader.get(name);
		  } catch {
		    return void 0;
		  }
		}
		function apply(ctx) {
		  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "web-ux: dictionaries");
		  ctx.slots.inject("conversation.composer.dock", () => {
		    try {
		      return ctx.slots.register(
		        {
		          name: "conversation.composer.dock",
		          id: "web-ux-provider",
		          order: BADGE_ORDER,
		          inject: () => ({
		            directoryFor: (sessionId) => ctx.modelDirectories.directoryFor(sessionId)
		          })
		        },
		        ProviderBadge
		      );
		    } catch {
		      return () => {
		      };
		    }
		  });
		  const notices = createNoticeStore((message) => {
		    try {
		      ctx.logger?.warn(`web-ux: ${message}`);
		    } catch {
		    }
		  });
		  try {
		    ctx.on("command/executed", (sessionId, commandName, result) => {
		      notices.offer(sessionId, commandName, result);
		    });
		  } catch {
		  }
		  ctx.slots.inject("conversation.input.overlay", () => {
		    try {
		      return ctx.slots.register(
		        {
		          name: "conversation.input.overlay",
		          id: NOTICE_ID,
		          order: NOTICE_ORDER,
		          locale: NS,
		          inject: () => ({
		            notices,
		            // 可见性源在渲染期解析：sessions 服务按 unknown 软读（同 multi-root
		            // 的 readService），形状不符返回 undefined，卡片跳过隐藏检查。
		            visibilityFor: (sessionId) => {
		              try {
		                const sessions = readService(ctx, "sessions");
		                return projectCountSource(sessions?.retainInfo?.(sessionId)) ?? void 0;
		              } catch {
		                return void 0;
		              }
		            }
		          })
		        },
		        CommandNoticeCard
		      );
		    } catch {
		      return () => {
		      };
		    }
		  });
		  const requests = createDeleteRequestStore();
		  ctx.slots.inject("sidebar.workspaces.session.menu.item", () => {
		    try {
		      return ctx.slots.register(
		        {
		          name: "sidebar.workspaces.session.menu.item",
		          id: DELETE_MENU_ID,
		          order: DELETE_MENU_ORDER,
		          locale: NS,
		          inject: () => {
		            const workspaces = ctx.get("workspaces");
		            return { requests, archived: workspaces?.list };
		          }
		        },
		        DeleteSessionMenuItem
		      );
		    } catch {
		      return () => {
		      };
		    }
		  });
		  ctx.slots.inject("shell.overlay", () => {
		    try {
		      return ctx.slots.register(
		        {
		          name: "shell.overlay",
		          id: DELETE_DIALOG_ID,
		          order: DELETE_DIALOG_ORDER,
		          locale: NS,
		          inject: () => {
		            const connection = ctx.get("connection");
		            return { requests, client: connection === void 0 ? void 0 : createDeleteClient(connection) };
		          }
		        },
		        DeleteSessionDialog
		      );
		    } catch {
		      return () => {
		      };
		    }
		  });
		  const t = ctx.locale.bind(NS);
		  ctx.slots.inject(SECTION_SEAT, () => {
		    try {
		      return ctx.slots.register(
		        {
		          name: SECTION_SEAT,
		          id: SECTION_ID,
		          order: SECTION_ORDER,
		          label: () => t("section.label"),
		          locale: NS,
		          inject: () => {
		            const connection = ctx.get("connection");
		            return {
		              client: connection === void 0 ? void 0 : createSessionManagerClient(connection),
		              workspaces: ctx.get("workspaces"),
		              // sessions 在客户端 Context 的服务类型表里没有声明（只经 ui-session
		              // 传递可达），与通知卡同款 unknown 软读后按分节的结构式声明收敛。
		              sessions: readService(ctx, "sessions")
		            };
		          }
		        },
		        SessionManagerSection
		      );
		    } catch (error) {
		      ctx.logger?.warn("web-ux: \u4F1A\u8BDD\u7BA1\u7406\u5206\u8282\u6CE8\u518C\u5931\u8D25\uFF0C\u672C\u8282\u4E0D\u663E\u793A", error);
		      return () => {
		      };
		    }
		  });
		}

		return module.exports;
	}
});
