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
		  apply: () => apply,
		  inject: () => inject
		});
		module.exports = __toCommonJS(index_exports);

		// src/client/ProviderBadge.tsx
		var import_react = require("react");

		// src/client/badge.module.css
		var cssText = "/*\n * The provider badge capsule. Every value mirrors the official StatsPills\n * capsule in `@deepseek-ai/dsh-client-ui-chat` \u2014 same type scale, tertiary\n * label color, 999px radius, and 1px/8px padding \u2014 so the appended entry reads\n * as part of the same status row instead of a foreign control. The\n * `--dsh-content-font-*` and `--dsw-alias-*` custom properties are the shell's\n * own design tokens; the fallbacks keep the capsule legible if a token moves.\n */\n.wux_root_09c5a1 {\n  box-sizing: border-box;\n  min-width: 0;\n  max-width: 100%;\n  display: inline-flex;\n  font-size: calc(var(--dsh-content-font-size-secondary, 13px) - 1px);\n  line-height: calc(20px + var(--dsh-content-font-delta-secondary, 0px));\n}\n\n.wux_pill_09c5a1 {\n  box-sizing: border-box;\n  corner-shape: round;\n  max-width: 100%;\n  color: var(--dsw-alias-label-tertiary);\n  font: inherit;\n  line-height: inherit;\n  white-space: nowrap;\n  background: 0 0;\n  border: none;\n  border-radius: 999px;\n  align-items: center;\n  gap: 6px;\n  padding: 1px 8px;\n  display: inline-flex;\n}\n\n/*\n * Width safety: the label is the only elastic part of the capsule, so an\n * arbitrarily long provider name can never push the status row into\n * horizontal scrolling \u2014 it truncates to an ellipsis instead.\n */\n.wux_label_09c5a1 {\n  min-width: 0;\n  max-width: 10em;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n";
		if (typeof document !== "undefined" && document.querySelector('style[data-dsh-plugin="dsh-plugin-web-ux"]') === null) {
		  const style = document.createElement("style");
		  style.setAttribute("data-dsh-plugin", "dsh-plugin-web-ux");
		  style.textContent = cssText;
		  document.head.appendChild(style);
		}
		var badge_default = { "root": "wux_root_09c5a1", "pill": "wux_pill_09c5a1", "label": "wux_label_09c5a1" };

		// src/client/ProviderBadge.tsx
		var import_jsx_runtime = require("react/jsx-runtime");
		function badgeLabel(state) {
		  const current = state.current;
		  if (current === null) return null;
		  const name = state.groups.find((group) => group.id === current.provider)?.name;
		  return name !== void 0 && name !== "" ? name : current.provider;
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
		  return {
		    ok: true,
		    value: { sessionCount: sessionCount.value, descendantCount: descendantCount.value, logBytes }
		  };
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
		  "dialog.previewing": "\u6B63\u5728\u7EDF\u8BA1\u5220\u9664\u8303\u56F4\u2026",
		  "dialog.summary.sessions": "\u4F1A\u8BDD\uFF1A{count} \u4E2A",
		  "dialog.summary.descendants": "\u5176\u4E2D\u5B50\u4EE3\u7406\u4F1A\u8BDD\uFF1A{count} \u4E2A",
		  "dialog.summary.size": "\u9884\u8BA1\u91CA\u653E\uFF1A{size}",
		  "dialog.warning.irreversible": "\u5220\u9664\u4E0D\u53EF\u64A4\u9500\uFF1A\u4F1A\u8BDD\u65E5\u5FD7\u4E0E\u6295\u5F71\u7F13\u5B58\u4F1A\u88AB\u79FB\u9664\uFF0C\u5DE5\u4F5C\u533A\u8BB0\u5F55\u540C\u6B65\u6E05\u9664\uFF0C\u4EFB\u4F55\u754C\u9762\u90FD\u65E0\u6CD5\u6062\u590D\u3002\u5171\u4EAB\u9644\u4EF6\u5B58\u50A8\u4E0D\u4F1A\u88AB\u6E05\u7406\u3002",
		  // —— 确认对话框：动作与结果 ——
		  "dialog.deleting": "\u6B63\u5728\u5220\u9664\u2026",
		  "dialog.confirm": "\u6C38\u4E45\u5220\u9664",
		  "dialog.cancel": "\u53D6\u6D88",
		  "dialog.close": "\u5173\u95ED",
		  "dialog.done": "\u5DF2\u5220\u9664 {count} \u4E2A\u4F1A\u8BDD\u3002",
		  "dialog.warnings": "\u4EE5\u4E0B\u6587\u4EF6\u5220\u9664\u5931\u8D25\uFF0C\u9700\u8981\u624B\u52A8\u6E05\u7406\uFF1A",
		  "dialog.failed": "\u5220\u9664\u672A\u80FD\u5B8C\u6210\uFF1A{reason}",
		  // —— 体积格式化 ——
		  "format.bytes": "{value} B",
		  "format.kb": "{value} KB",
		  "format.mb": "{value} MB",
		  // —— 失败码 → 文案（未知码回退 error.fallback） ——
		  "error.not-found": "\u8BE5\u4F1A\u8BDD\u5DF2\u4E0D\u5B58\u5728\uFF0C\u53EF\u80FD\u5DF2\u5728\u522B\u5904\u5220\u9664\u3002",
		  "error.not-archived": "\u8BE5\u4F1A\u8BDD\u5DF2\u4E0D\u518D\u5904\u4E8E\u5F52\u6863\u72B6\u6001\uFF1B\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5\u3002",
		  "error.session-live": "\u8BE5\u4F1A\u8BDD\u4ECD\u5728\u5BBF\u4E3B\u673A\u5185\u5B58\u4E2D\u8FD0\u884C\uFF1B\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002",
		  "error.bad-request": "\u8BF7\u6C42\u4E0D\u5408\u6CD5\uFF0C\u5BBF\u4E3B\u62D2\u7EDD\u4E86\u672C\u6B21\u8C03\u7528\u3002",
		  "error.internal": "\u5BBF\u4E3B\u5185\u90E8\u9519\u8BEF\uFF0C\u5220\u9664\u672A\u6267\u884C\u3002",
		  "error.unavailable": "\u65E0\u6CD5\u8FDE\u63A5\u5230 dsh \u4E3B\u8FDB\u7A0B\u3002",
		  "error.bad-response": "\u5BBF\u4E3B\u8FD4\u56DE\u4E86\u65E0\u6CD5\u8BC6\u522B\u7684\u54CD\u5E94\u3002",
		  "error.fallback": "\u64CD\u4F5C\u5931\u8D25\u3002"
		};
		var en = {
		  "menu.delete": "Delete session",
		  "dialog.title": "Delete archived session",
		  "dialog.description": 'Everything archived under "{title}" will be removed permanently.',
		  "dialog.previewing": "Measuring the delete scope\u2026",
		  "dialog.summary.sessions": "Sessions: {count}",
		  "dialog.summary.descendants": "Subagent sessions included: {count}",
		  "dialog.summary.size": "Space to be freed: {size}",
		  "dialog.warning.irreversible": "Deletion is irreversible: session logs and projection caches are removed, workspace records are cleared, and no surface can restore them. The shared attachment store is left untouched.",
		  "dialog.deleting": "Deleting\u2026",
		  "dialog.confirm": "Delete permanently",
		  "dialog.cancel": "Cancel",
		  "dialog.close": "Close",
		  "dialog.done": "Deleted {count} sessions.",
		  "dialog.warnings": "These files could not be removed and need manual cleanup:",
		  "dialog.failed": "Deletion did not complete: {reason}",
		  "format.bytes": "{value} B",
		  "format.kb": "{value} KB",
		  "format.mb": "{value} MB",
		  "error.not-found": "That session no longer exists; it may have been deleted elsewhere.",
		  "error.not-archived": "That session is no longer archived; refresh and try again.",
		  "error.session-live": "That session is still live in the host; try again later.",
		  "error.bad-request": "The host rejected the request as malformed.",
		  "error.internal": "The host hit an internal error; nothing was deleted.",
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
		function createDeleteClient(connection) {
		  const call = async (endpoint, sessionId) => {
		    let result;
		    try {
		      result = await connection.rpc.call(CHANNEL, endpoint, { sessionId });
		    } catch (error) {
		      throw new DeleteError("unavailable", error instanceof Error ? error.message : String(error));
		    }
		    if (!result.ok) {
		      const failure = parseFailure(result.error);
		      if (failure === void 0) throw new DeleteError("unavailable", "\u5BBF\u4E3B\u8FD4\u56DE\u4E86\u65E0\u6CD5\u8BC6\u522B\u7684\u5931\u8D25\u4FE1\u5C01");
		      throw new DeleteError(failure.code, failure.message);
		    }
		    return result.value;
		  };
		  return {
		    async preview(sessionId) {
		      const parsed = parsePreview(await call(PREVIEW_ENDPOINT, sessionId));
		      if (!parsed.ok) throw new DeleteError("bad-response", parsed.message);
		      return parsed.value;
		    },
		    async remove(sessionId) {
		      const parsed = parseOutcome(await call(DELETE_ENDPOINT, sessionId));
		      if (!parsed.ok) throw new DeleteError("bad-response", parsed.message);
		      return parsed.value;
		    }
		  };
		}

		// src/client/delete.module.css
		var cssText2 = "/*\n * \u5220\u9664\u786E\u8BA4\u5BF9\u8BDD\u6846\u7684\u6700\u5C0F\u6837\u5F0F\u3002\n *\n * \u9AA8\u67B6\uFF08\u906E\u7F69\u3001\u5361\u7247\u3001\u6807\u9898\u3001\u5173\u95ED\u6309\u94AE\u3001\u6309\u94AE\u6392\u5E03\uFF09\u5168\u90E8\u7531\u5B98\u65B9 primitives \u7684 Modal / Button\n * \u63D0\u4F9B\uFF0C\u8FD9\u91CC\u53EA\u8865\u4E09\u4EF6\u4E8B\uFF1A\u5371\u9669\u786E\u8BA4\u6309\u94AE\u7684\u914D\u8272\uFF08Button \u6CA1\u6709 danger variant\uFF09\u3001\u9884\u89C8\u6458\u8981\u4E0E\n * \u8B66\u793A\u7684\u6587\u5B57\u5C42\u7EA7\u3001warnings \u6E05\u5355\u7684\u53EF\u8BFB\u6027\u3002\u989C\u8272\u4E00\u5F8B\u53D6\u5B98\u65B9 `--dsw-alias-*` \u8BBE\u8BA1\u4EE4\u724C\u5E76\u5E26\n * \u9759\u6001\u515C\u5E95\uFF0C\u4EE4\u724C\u6539\u540D\u65F6\u6700\u574F\u9000\u5316\u6210\u53EF\u8BFB\u7684\u9ED1\u767D\u800C\u4E0D\u662F\u900F\u660E\u3002\n */\n\n/* \u5371\u9669\u786E\u8BA4\u6309\u94AE\uFF1A\u4E0E\u5B98\u65B9 primary \u540C\u5C3A\u5BF8\u540C\u5706\u89D2\uFF0C\u53EA\u628A\u586B\u5145\u6362\u6210\u9519\u8BEF\u8272\u3002 */\n.wux_danger_0c3afc {\n  color: var(--dsw-alias-label-primary-foreground, #fff);\n  background: var(--dsw-alias-state-error-primary, #ec1313);\n}\n\n.wux_danger_0c3afc:hover:not(:disabled) {\n  background: var(--dsw-alias-state-error-secondary, #f25a5a);\n}\n\n/* \u8FDB\u884C\u4E2D\u7B49\u8FC7\u7A0B\u6587\u6848\uFF1A\u4F4E\u8C03\uFF0C\u4E0D\u4E0E\u9884\u89C8\u6458\u8981\u62A2\u6CE8\u610F\u529B\u3002 */\n.wux_muted_0c3afc {\n  margin: 0;\n  color: var(--dsw-alias-label-tertiary, #7f8287);\n  font-size: 14px;\n  line-height: 22px;\n}\n\n/* \u9884\u89C8\u6458\u8981\uFF1A\u4F1A\u8BDD\u6570 / \u5B50\u4EE3\u7406\u6570 / \u4F53\u79EF\u4E09\u884C\u3002 */\n.wux_summary_0c3afc {\n  margin: 0 0 12px;\n  padding-left: 22px;\n  color: var(--dsw-alias-label-secondary, #545557);\n  font-size: 14px;\n  line-height: 22px;\n}\n\n/* \u4E0D\u53EF\u9006\u8B66\u793A\uFF1A\u7528\u8B66\u544A\u8272\u800C\u975E\u9519\u8BEF\u8272\u2014\u2014\u8FD9\u662F\u5FC5\u987B\u8BFB\u5230\u7684\u4E8B\u5B9E\uFF0C\u4E0D\u662F\u5DF2\u7ECF\u53D1\u751F\u7684\u9519\u8BEF\u3002 */\n.wux_warning_0c3afc {\n  margin: 0;\n  color: var(--dsw-alias-state-warn-label, #dd8629);\n  font-size: 14px;\n  line-height: 22px;\n}\n\n.wux_done_0c3afc {\n  margin: 0;\n  color: var(--dsw-alias-label-primary, #000);\n  font-size: 14px;\n  line-height: 22px;\n}\n\n.wux_failure_0c3afc {\n  margin: 0;\n  color: var(--dsw-alias-state-error-primary, #ec1313);\n  font-size: 14px;\n  line-height: 22px;\n}\n\n/* \u5BBF\u4E3B\u515C\u5E95\u8BF4\u660E\uFF08\u672A\u672C\u5730\u5316\uFF09\uFF1A\u6BD4\u5931\u8D25\u539F\u56E0\u4F4E\u4E00\u5C42\u3002 */\n.wux_detail_0c3afc {\n  margin: 8px 0 0;\n  color: var(--dsw-alias-label-tertiary, #7f8287);\n  font-size: 12px;\n  line-height: 18px;\n  word-break: break-word;\n}\n\n/* \u534A\u5931\u8D25\u6E05\u5355\uFF1Awarnings \u662F\u5BBF\u4E3B\u7ED9\u7684 `<\u8DEF\u5F84>: <\u539F\u56E0>` \u673A\u5668\u53EF\u8BFB\u4E32\uFF0C\u539F\u6837\u5217\u51FA\u3002 */\n.wux_warnings_0c3afc {\n  margin-top: 14px;\n  color: var(--dsw-alias-label-secondary, #545557);\n  font-size: 13px;\n  line-height: 20px;\n}\n\n.wux_warnings_0c3afc p {\n  margin: 0 0 6px;\n}\n\n.wux_warnings_0c3afc ul {\n  margin: 0;\n  padding-left: 22px;\n}\n\n.wux_warnings_0c3afc code {\n  font-family: var(--ds-font-family-code, monospace);\n  font-size: 12px;\n  word-break: break-all;\n}\n";
		if (typeof document !== "undefined" && document.querySelector('style[data-dsh-plugin="dsh-plugin-web-ux"]') === null) {
		  const style = document.createElement("style");
		  style.setAttribute("data-dsh-plugin", "dsh-plugin-web-ux");
		  style.textContent = cssText2;
		  document.head.appendChild(style);
		}
		var delete_default = { "danger": "wux_danger_0c3afc", "muted": "wux_muted_0c3afc", "summary": "wux_summary_0c3afc", "warning": "wux_warning_0c3afc", "done": "wux_done_0c3afc", "failure": "wux_failure_0c3afc", "detail": "wux_detail_0c3afc", "warnings": "wux_warnings_0c3afc" };

		// src/client/DeleteSessionDialog.tsx
		var import_jsx_runtime3 = require("react/jsx-runtime");
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
		  const [preview, setPreview] = (0, import_react3.useState)(null);
		  const [failure, setFailure] = (0, import_react3.useState)(null);
		  const [outcome, setOutcome] = (0, import_react3.useState)(null);
		  (0, import_react3.useEffect)(() => {
		    let cancelled = false;
		    void client.preview(target.sessionId).then(
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
		    void client.remove(target.sessionId).then(
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
		  const displayTitle = target.displayTitle === "" ? target.sessionId : target.displayTitle;
		  const footer = phase === "done" || phase === "failed" ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives2.Button, { variant: "outline", onClick: close, children: t("dialog.close") }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives2.Button, { variant: "outline", onClick: close, disabled: phase === "deleting", children: t("dialog.cancel") }),
		    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		      import_dsh_client_ui_primitives2.Button,
		      {
		        variant: "primary",
		        className: delete_default.danger,
		        onClick: confirm,
		        disabled: phase !== "ready",
		        children: phase === "deleting" ? t("dialog.deleting") : t("dialog.confirm")
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
		      description: t("dialog.description", { title: displayTitle }),
		      footer,
		      children: [
		        phase === "previewing" && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: delete_default.muted, children: t("dialog.previewing") }),
		        preview !== null && phase !== "failed" && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("ul", { className: delete_default.summary, children: [
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("li", { children: t("dialog.summary.sessions", { count: preview.sessionCount }) }),
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("li", { children: t("dialog.summary.descendants", { count: preview.descendantCount }) }),
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("li", { children: t("dialog.summary.size", { size: formatSize(preview.logBytes, t) }) })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: delete_default.warning, children: t("dialog.warning.irreversible") })
		        ] }),
		        phase === "deleting" && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: delete_default.muted, children: t("dialog.deleting") }),
		        phase === "done" && outcome !== null && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: delete_default.done, children: t("dialog.done", { count: outcome.removed.length }) }),
		          outcome.warnings.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("section", { className: delete_default.warnings, children: [
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { children: t("dialog.warnings") }),
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("ul", { children: outcome.warnings.map((warning) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("code", { children: warning }) }, warning)) })
		          ] })
		        ] }),
		        phase === "failed" && failure !== null && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: delete_default.failure, children: t("dialog.failed", { reason: t(errorKeyOf(failure.code)) }) }),
		          failure.message !== "" && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: delete_default.detail, children: failure.message })
		        ] })
		      ]
		    }
		  );
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

		// src/client/index.ts
		var inject = ["slots", "locale", "modelDirectories"];
		var BADGE_ORDER = 10;
		var DELETE_MENU_ID = "web-ux-delete-session";
		var DELETE_MENU_ORDER = 500;
		var DELETE_DIALOG_ID = "web-ux-delete-session-dialog";
		var DELETE_DIALOG_ORDER = 500;
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
		}

		return module.exports;
	}
});
