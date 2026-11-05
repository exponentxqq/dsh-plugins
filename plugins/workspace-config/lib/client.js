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
		  DIALOG_ID: () => DIALOG_ID,
		  TRIGGER_ID: () => TRIGGER_ID,
		  WORKSPACE_CONFIG_DIALOG_ORDER: () => WORKSPACE_CONFIG_DIALOG_ORDER,
		  WORKSPACE_CONFIG_SECTION: () => WORKSPACE_CONFIG_SECTION,
		  WORKSPACE_CONFIG_TRIGGER_ORDER: () => WORKSPACE_CONFIG_TRIGGER_ORDER,
		  apply: () => apply,
		  inject: () => inject
		});
		module.exports = __toCommonJS(index_exports);

		// src/client/contract.ts
		var WORKSPACE_CONFIG_SECTION = "workspace-config.section";
		var WORKSPACE_CONFIG_TRIGGER_ORDER = 50;
		var WORKSPACE_CONFIG_DIALOG_ORDER = 530;

		// src/client/locales.ts
		var NS = "workspaceConfig";
		var zh = {
		  // —— 侧栏 footer 的唯一入口 ——
		  "entry.label": "\u5DE5\u4F5C\u533A\u914D\u7F6E",
		  // —— 统一弹窗壳：标题、关闭按钮、分节导航的可访问名 ——
		  "dialog.title": "\u5DE5\u4F5C\u533A\u914D\u7F6E",
		  "dialog.close": "\u5173\u95ED",
		  "nav.label": "\u914D\u7F6E\u5206\u8282",
		  // —— 空态：没有任何已注册分节时的标题与提示（D14：不点名具体插件） ——
		  "dialog.empty.title": "\u6682\u65E0\u53EF\u914D\u7F6E\u7684\u5206\u8282",
		  "dialog.empty.hint": "\u5B89\u88C5\u63D0\u4F9B\u914D\u7F6E\u5206\u8282\u7684\u63D2\u4EF6\u540E\uFF0C\u5BF9\u5E94\u5206\u8282\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\u3002",
		  // —— 载入态（预留：弹窗壳在分节来源尚未就绪时可用） ——
		  "dialog.loading": "\u6B63\u5728\u8F7D\u5165\u2026"
		};
		var en = {
		  "entry.label": "Workspace settings",
		  "dialog.title": "Workspace settings",
		  "dialog.close": "Close",
		  "nav.label": "Settings sections",
		  "dialog.empty.title": "No settings sections",
		  "dialog.empty.hint": "Install a plugin that provides a settings section, and it will appear here.",
		  "dialog.loading": "Loading\u2026"
		};

		// src/client/open-store.ts
		function createOpenStore() {
		  let snapshot = false;
		  const listeners = /* @__PURE__ */ new Set();
		  const publish = (next) => {
		    if (next === snapshot) return;
		    snapshot = next;
		    for (const listener of Array.from(listeners)) listener();
		  };
		  return {
		    getSnapshot: () => snapshot,
		    subscribe: (listener) => {
		      listeners.add(listener);
		      return () => {
		        listeners.delete(listener);
		      };
		    },
		    open: () => {
		      publish(true);
		    },
		    close: () => {
		      publish(false);
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

		// src/client/WorkspaceConfigDialog.tsx
		var import_react = require("react");
		var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

		// src/client/dialog.module.css
		var cssText = "/*\n * \u7EDF\u4E00\u300C\u5DE5\u4F5C\u533A\u914D\u7F6E\u300D\u5165\u53E3\uFF08footer trigger\uFF09\u4E0E\u7EDF\u4E00\u5F39\u7A97\uFF08shell.wsc_overlay_1f8481\uFF09\u7684\u6837\u5F0F\u3002\n *\n * \u53EA\u8865\u5B98\u65B9 primitives \u7ED9\u4E0D\u4E86\u7684\u4E1C\u897F\uFF1A\u5165\u53E3\u7684\u4E24\u5F62\u6001\u51E0\u4F55\u3001\u5F39\u7A97\u4E24\u5217\u5E03\u5C40\u4E0E\u7A7A\u6001\u6587\u5B57\u5C42\u7EA7\u3002\n * `Modal` \u7684\u906E\u7F69 / \u5361\u7247\u9AA8\u67B6 / Escape / \u7126\u70B9\u9677\u9631\u5168\u90E8\u7531 primitives \u8D1F\u8D23\uFF0C\u8FD9\u91CC\u4E0D\u590D\u5236\uFF1B\n * \u53EA\u7528\u4E00\u4E2A `.wsc_card_1f8481` \u8986\u76D6\u5B83\u7684\u9ED8\u8BA4\u5BBD\u5EA6\u4E0E\u5E95\u90E8\u5185\u8DDD\uFF08headless \u5F62\u6001\u4E0B\u5361\u7247\u5185\u662F\u81EA\u7ED8 chrome\uFF09\u3002\n *\n * \u989C\u8272\u7EAA\u5F8B\uFF08\u4ED3\u5185\u65E2\u6709\uFF09\uFF1A\u6BCF\u4E00\u5904\u989C\u8272\u90FD\u662F `var(--dsw-alias-*, <\u515C\u5E95>)` \u5F62\u6001\uFF0C\u515C\u5E95\u503C\u53EA\u7528\n * `currentColor` \u4E0E `color-mix()` \u8FD9\u7C7B\u5173\u952E\u5B57/\u6D3E\u751F\u8272\uFF0C\u4E0D\u5199\u6B7B\u5177\u4F53\u8272\u503C\u2014\u2014\u4EE4\u724C\u6574\u4F53\u7F3A\u5E2D\u65F6\n * \u6700\u574F\u9000\u5316\u6210\u300C\u5F53\u524D\u6587\u5B57\u8272\u7684\u6DF1\u6D45\u53D8\u5316\u300D\uFF0C\u6DF1\u8272\u4E3B\u9898\u4E0B\u4E0D\u4F1A\u51FA\u73B0\u767D\u5E95\u767D\u5B57\u3002\n *\n * \u51E0\u4F55\u7EAA\u5F8B\uFF08D6\uFF0C\u4EA7\u7269\u65AD\u8A00\u6709\u5B88\u62A4\uFF09\uFF1A\n * - \u5BBD\u6001\u5165\u53E3 `flex: 1 1 auto` + `min-width: 0`\uFF0C\u53EA\u5360\u884C\u5185\u53EF\u4F38\u7F29\u4EFD\u989D\uFF0C\u4E0D\u6324\u540C\u5217\u5176\u5B83\u5360\u7528\u8005\uFF1B\n * - \u6298\u53E0\u6001\u5165\u53E3\u56FA\u5B9A 28px \u65B9\u5F62\uFF08\u5BBF\u4E3B\u6298\u53E0\u8F68\u5185\u5BB9\u5BBD\u4EC5 32px\uFF0C36px \u4F1A\u8D8A\u754C\uFF09\uFF1B\n * - \u5165\u53E3**\u4E0D\u4F7F\u7528** `flex:none` \u8FD9\u7C7B\u4E0D\u53EF\u7F29\u58F0\u660E\uFF0C\u4E5F\u4E0D\u4F7F\u7528\u8D8A\u8FC7\u5BB9\u5668\u5185\u8FB9\u8DDD\u7684\u6574\u884C\u5BBD\u5EA6\u3002\n *\n * \u7C7B\u540D\u5951\u7EA6\uFF08\u7EC4\u4EF6\u6309\u6B64\u6E05\u5355\u6D88\u8D39\uFF1B\u5747\u6309 CSS Modules \u5C40\u90E8\u7C7B\u5F15\u7528\uFF09\uFF1A\n *   trigger\u3001triggerWide\u3001triggerRail\u3001triggerLabel  \u2014\u2014 footer \u552F\u4E00\u5165\u53E3\uFF08\u4E24\u5F62\u6001\uFF09\n *   card\u3001header\u3001title\u3001close                     \u2014\u2014 \u5F39\u7A97\u5361\u7247\u4E0E\u81EA\u7ED8 header\n *   layout\u3001nav\u3001navItem\u3001panel\u3001empty\u3001emptyTitle\u3001emptyHint \u2014\u2014 \u4E24\u5217\u5E03\u5C40\u4E0E\u7A7A\u6001\n *\n * \u6784\u5EFA\u671F\u7C7B\u540D\u7531\u6784\u5EFA\u811A\u672C\u7684 cssModulesPlugin \u91CD\u5199\u4E3A `wsc_<local>_<hash>`\uFF0C\u6837\u5F0F\u4EE5\n * `<style data-dsh-plugin=\"dsh-plugin-workspace-config\">` \u6CE8\u5165\u5230 document.wsc_head_1f8481\u3002\n */\n\n/* \u2014\u2014 footer \u552F\u4E00\u5165\u53E3\uFF1A\u5BBD\u680F\u662F\u300C\u56FE\u6807 + \u6587\u6848\u300D\u884C\u5185\u6309\u94AE\uFF0C\u6298\u53E0\u680F\u9000\u5316\u6210\u65B9\u5F62\u56FE\u6807\u6309\u94AE \u2014\u2014 */\n.wsc_trigger_1f8481 {\n  box-sizing: border-box;\n  display: inline-flex;\n  align-items: center;\n  justify-content: flex-start;\n  gap: 6px;\n  min-height: 32px;\n  padding: 0 8px;\n  border: 0;\n  border-radius: var(--dsw-radius-md, 8px);\n  background: none;\n  color: var(--dsw-alias-label-secondary, currentColor);\n  font: inherit;\n  font-size: 13px;\n  line-height: 20px;\n  text-align: left;\n  cursor: pointer;\n  max-width: 100%;\n}\n\n.wsc_trigger_1f8481:hover {\n  background: var(--dsw-alias-interactive-bg-hover, color-mix(in srgb, currentColor 8%, transparent));\n  color: var(--dsw-alias-label-primary, currentColor);\n}\n\n.wsc_trigger_1f8481:active {\n  background: var(--dsw-alias-interactive-bg-active, color-mix(in srgb, currentColor 12%, transparent));\n}\n\n/* \u7126\u70B9\u73AF\u4E0E\u5B98\u65B9\u6309\u94AE\u540C\u6B3E\uFF1A\u5185\u7F29 2px\uFF0C\u4E0D\u6491\u7834\u4FA7\u680F\u7684\u7A84\u680F\u5BBD\u5EA6\u3002 */\n.wsc_trigger_1f8481:focus-visible {\n  outline: 2px solid var(--dsw-alias-state-business-primary, currentColor);\n  outline-offset: -2px;\n}\n\n/*\n * \u5BBD\u6001\uFF1A\u53EA\u53D6\u884C\u5185\u53EF\u4F38\u7F29\u4EFD\u989D\u3002`min-width: 0` \u662F\u7701\u7565\u53F7\u751F\u6548\u7684\u524D\u63D0\uFF08\u6CA1\u6709\u5B83\uFF0C\u957F\u6587\u6848\u4F1A\u628A\n * flex item \u7684\u81EA\u52A8\u6700\u5C0F\u5C3A\u5BF8\u6491\u5230\u5185\u5BB9\u5BBD\uFF0C\u540C\u5217\u5176\u5B83\u5165\u53E3\u88AB\u6324\u8D70\u2014\u2014R5 \u7684\u6839\u56E0\uFF09\u3002\n */\n.wsc_triggerWide_1f8481 {\n  flex: 1 1 auto;\n  min-width: 0;\n}\n\n/*\n * \u6298\u53E0\u6001\uFF1A28\xD728 \u65B9\u5F62\u56FE\u6807\uFF0C\u5C45\u4E2D\u7531\u5EA7\u4F4D\u5BB9\u5668\u8D1F\u8D23\u3002\u8FD9\u91CC\u4E0D\u58F0\u660E flex \u7B80\u5199\uFF0C\u4FDD\u6301\u9ED8\u8BA4\u7684\n * \u53EF\u7F29\u884C\u4E3A\uFF1B\u5BBD\u9AD8\u56FA\u5B9A\uFF0C\u4E14\u5185\u8FB9\u8DDD\u6E05\u96F6\uFF0C\u907F\u514D\u56FE\u6807\u5728 32px \u8F68\u9053\u91CC\u8D8A\u754C\u3002\n */\n.wsc_triggerRail_1f8481 {\n  width: 28px;\n  height: 28px;\n  min-height: 28px;\n  padding: 0;\n  justify-content: center;\n}\n\n/* \u6587\u6848\u662F\u552F\u4E00\u7684\u5F39\u6027\u90E8\u5206\uFF1A\u5BBD\u680F\u592A\u7A84\u65F6\u7701\u7565\u53F7\u622A\u65AD\uFF0C\u4E0D\u628A\u4FA7\u680F\u6491\u51FA\u6A2A\u5411\u6EDA\u52A8\u3002 */\n.wsc_triggerLabel_1f8481 {\n  min-width: 0;\n  overflow: hidden;\n  white-space: nowrap;\n  text-overflow: ellipsis;\n}\n\n/* \u2014\u2014 \u5F39\u7A97\u5361\u7247\uFF1A\u8986\u76D6 Modal \u9ED8\u8BA4\u7684 380px \u5BBD\u4E0E 24px \u5E95\u90E8\u5185\u8DDD\uFF08headless \u81EA\u7ED8 chrome\uFF09 \u2014\u2014 */\n.wsc_card_1f8481 {\n  width: min(760px, 100%);\n  max-height: 100%;\n  padding: 0;\n  gap: 0;\n}\n\n/* \u2014\u2014 \u81EA\u7ED8 header\uFF1A\u6807\u9898\u4E0E\u5173\u95ED\u6309\u94AE \u2014\u2014 */\n.wsc_header_1f8481 {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 8px;\n  padding: 20px 16px 12px 24px;\n  border-bottom: 1px solid\n    var(--dsw-alias-border-l3, color-mix(in srgb, currentColor 16%, transparent));\n}\n\n.wsc_title_1f8481 {\n  margin: 0;\n  font-size: 16px;\n  line-height: 24px;\n  font-weight: 500;\n  color: var(--dsw-alias-label-primary, currentColor);\n}\n\n.wsc_close_1f8481 {\n  display: inline-flex;\n  flex: 0 0 auto;\n  align-items: center;\n  justify-content: center;\n  width: 28px;\n  height: 28px;\n  padding: 0;\n  border: 0;\n  border-radius: var(--dsw-radius-sm, 6px);\n  background: none;\n  color: var(--dsw-alias-label-secondary, currentColor);\n  cursor: pointer;\n}\n\n.wsc_close_1f8481:hover {\n  background: var(--dsw-alias-interactive-bg-hover, color-mix(in srgb, currentColor 8%, transparent));\n  color: var(--dsw-alias-label-primary, currentColor);\n}\n\n.wsc_close_1f8481:focus-visible {\n  outline: 2px solid var(--dsw-alias-state-business-primary, currentColor);\n  outline-offset: -2px;\n}\n\n/* \u2014\u2014 \u4E24\u5217\u5E03\u5C40\uFF1A`min-height: 0` \u8BA9\u5185\u5BB9\u5217\u80FD\u5728\u5361\u7247 max-height \u5185\u72EC\u7ACB\u6EDA\u52A8 \u2014\u2014 */\n.wsc_layout_1f8481 {\n  display: flex;\n  flex: 1 1 auto;\n  min-height: 0;\n}\n\n/* \u5DE6\u680F\uFF1A\u56FA\u5B9A\u5BBD\u5EA6\u7684\u5206\u8282\u5BFC\u822A\uFF0C\u81EA\u8EAB\u53EF\u6EDA\u3002 */\n.wsc_nav_1f8481 {\n  display: flex;\n  flex: 0 0 auto;\n  flex-direction: column;\n  gap: 2px;\n  width: 168px;\n  min-width: 0;\n  padding: 12px;\n  border-right: 1px solid\n    var(--dsw-alias-border-l3, color-mix(in srgb, currentColor 16%, transparent));\n  overflow-y: auto;\n}\n\n.wsc_navItem_1f8481 {\n  box-sizing: border-box;\n  width: 100%;\n  padding: 6px 10px;\n  border: 0;\n  border-radius: var(--dsw-radius-sm, 6px);\n  background: none;\n  color: var(--dsw-alias-label-secondary, currentColor);\n  font: inherit;\n  font-size: 13px;\n  line-height: 20px;\n  text-align: left;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  cursor: pointer;\n}\n\n.wsc_navItem_1f8481:hover {\n  background: var(--dsw-alias-interactive-bg-hover, color-mix(in srgb, currentColor 8%, transparent));\n  color: var(--dsw-alias-label-primary, currentColor);\n}\n\n/* \u9009\u4E2D\u6001\u540C\u65F6\u662F aria-current \u7684\u89C6\u89C9\u5BF9\u5E94\u7269\uFF1A\u4E0D\u53EA\u9760\u989C\u8272\uFF0C\u5B57\u91CD\u4E5F\u52A0\u4E00\u7EA7\u3002 */\n.wsc_navItem_1f8481[aria-current='true'] {\n  background: var(--dsw-alias-interactive-bg-active, color-mix(in srgb, currentColor 12%, transparent));\n  color: var(--dsw-alias-label-primary, currentColor);\n  font-weight: 500;\n}\n\n.wsc_navItem_1f8481:focus-visible {\n  outline: 2px solid var(--dsw-alias-state-business-primary, currentColor);\n  outline-offset: -2px;\n}\n\n/* \u53F3\u680F\uFF1A\u5185\u5BB9\u5217\u7684\u6EDA\u52A8\u5F52\u5C5E\u5728\u8FD9\u91CC\uFF08header / nav \u4E0D\u8DDF\u7740\u6EDA\uFF0C\u5361\u7247\u672C\u8EAB overflow hidden\uFF09\u3002 */\n.wsc_panel_1f8481 {\n  flex: 1 1 auto;\n  min-width: 0;\n  min-height: 0;\n  padding: 20px 24px;\n  overflow-y: auto;\n}\n\n/* \u7A7A\u6001\uFF1A\u6CA1\u6709\u8D21\u732E\u65B9 / \u8D21\u732E\u65B9\u5168\u90E8\u9000\u573A\u65F6\u89E3\u91CA\u300C\u4E3A\u4EC0\u4E48\u662F\u7A7A\u7684\u300D\uFF08D14\uFF1A\u4E0D\u70B9\u540D\u5177\u4F53\u63D2\u4EF6\uFF09\u3002 */\n.wsc_empty_1f8481 {\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  justify-content: center;\n  gap: 6px;\n  min-height: 160px;\n  padding: 24px;\n  text-align: center;\n  color: var(--dsw-alias-label-secondary, currentColor);\n}\n\n.wsc_emptyTitle_1f8481 {\n  margin: 0;\n  font-size: 14px;\n  line-height: 22px;\n  font-weight: 500;\n  color: var(--dsw-alias-label-primary, currentColor);\n}\n\n.wsc_emptyHint_1f8481 {\n  margin: 0;\n  font-size: 13px;\n  line-height: 20px;\n}\n";
		if (typeof document !== "undefined" && document.querySelector('style[data-dsh-plugin="dsh-plugin-workspace-config"][data-dsh-css="1f8481"]') === null) {
		  const style = document.createElement("style");
		  style.setAttribute("data-dsh-plugin", "dsh-plugin-workspace-config");
		  style.setAttribute("data-dsh-css", "1f8481");
		  style.textContent = cssText;
		  document.head.appendChild(style);
		}
		var dialog_default = { "overlay": "wsc_overlay_1f8481", "card": "wsc_card_1f8481", "head": "wsc_head_1f8481", "trigger": "wsc_trigger_1f8481", "triggerWide": "wsc_triggerWide_1f8481", "triggerRail": "wsc_triggerRail_1f8481", "triggerLabel": "wsc_triggerLabel_1f8481", "header": "wsc_header_1f8481", "title": "wsc_title_1f8481", "close": "wsc_close_1f8481", "layout": "wsc_layout_1f8481", "nav": "wsc_nav_1f8481", "navItem": "wsc_navItem_1f8481", "panel": "wsc_panel_1f8481", "empty": "wsc_empty_1f8481", "emptyTitle": "wsc_emptyTitle_1f8481", "emptyHint": "wsc_emptyHint_1f8481" };

		// src/client/WorkspaceConfigDialog.tsx
		var import_jsx_runtime = require("react/jsx-runtime");
		function WorkspaceConfigDialog(props) {
		  const { open, sections, t, renderSlot } = props;
		  const expanded = (0, import_react.useSyncExternalStore)(open.subscribe, open.getSnapshot, open.getSnapshot);
		  const rows = (0, import_react.useSyncExternalStore)(sections.subscribe, sections.getSnapshot, sections.getSnapshot);
		  const [selected, setSelected] = (0, import_react.useState)(void 0);
		  const activeId = rows.some((row) => row.id === selected) ? selected : rows[0]?.id;
		  if (!expanded) return null;
		  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
		    import_dsh_client_ui_primitives.Modal,
		    {
		      open: true,
		      onClose: open.close,
		      headless: true,
		      title: t("dialog.title"),
		      className: dialog_default.card,
		      children: [
		        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: dialog_default.header, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { className: dialog_default.title, children: t("dialog.title") }),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		            "button",
		            {
		              type: "button",
		              className: dialog_default.close,
		              "aria-label": t("dialog.close"),
		              onClick: open.close,
		              children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconCloseOutlineRegular, {})
		            }
		          )
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: dialog_default.layout, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("nav", { className: dialog_default.nav, "aria-label": t("nav.label"), children: rows.map((row) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		            "button",
		            {
		              type: "button",
		              className: dialog_default.navItem,
		              "aria-current": row.id === activeId ? "true" : void 0,
		              "data-modal-autofocus": row.id === activeId ? "" : void 0,
		              onClick: () => {
		                setSelected(row.id);
		              },
		              children: row.label
		            },
		            row.id
		          )) }),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: dialog_default.panel, children: activeId === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: dialog_default.empty, role: "status", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: dialog_default.emptyTitle, children: t("dialog.empty.title") }),
		            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: dialog_default.emptyHint, children: t("dialog.empty.hint") })
		          ] }) : (
		            // 座位名**字面量直写**：本行是 `renderSlot` 的真实调用点，也是产物断言
		            // （`lib/client.js` 里 `workspace-config.section` 至少「声明 + 渲染」两处）
		            // 的渲染侧锚点；只引用共享常量时 esbuild 只保留一份字面量，断言会退化。
		            // 字面量由 `PropsRenderSlots<'workspace-config.section'>` 在调用点逐字校验。
		            // owner 份额只有 close（弹窗开合由 holder 拥有）。
		            renderSlot("workspace-config.section", { close: open.close }, { only: activeId })
		          ) })
		        ] })
		      ]
		    }
		  );
		}

		// src/client/WorkspaceConfigTrigger.tsx
		var import_react2 = require("react");
		var import_dsh_client_ui_primitives2 = require("@deepseek-ai/dsh-client-ui-primitives");
		var import_jsx_runtime2 = require("react/jsx-runtime");
		function WorkspaceConfigTrigger({ wide, open, t }) {
		  const expanded = (0, import_react2.useSyncExternalStore)(open.subscribe, open.getSnapshot, open.getSnapshot);
		  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
		    "button",
		    {
		      type: "button",
		      className: wide ? `${dialog_default.trigger} ${dialog_default.triggerWide}` : `${dialog_default.trigger} ${dialog_default.triggerRail}`,
		      "aria-label": t("entry.label"),
		      "aria-haspopup": "dialog",
		      "aria-expanded": expanded,
		      onClick: () => {
		        open.open();
		      },
		      children: [
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconWorkspaceTreeOutlineRegular, {}),
		        wide && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: dialog_default.triggerLabel, children: t("entry.label") })
		      ]
		    }
		  );
		}

		// src/client/index.ts
		var LOG_LABEL = "workspace-config";
		var TRIGGER_ID = "workspace-config-trigger";
		var DIALOG_ID = "workspace-config-dialog";
		var inject = ["slots", "locale"];
		function apply(ctx) {
		  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "workspace-config: \u53CC\u8BED\u6587\u6848");
		  const open = createOpenStore();
		  const sections = createSectionsSource(ctx);
		  ctx.slots.inject("sidebar.footer.action", () => {
		    try {
		      return ctx.slots.register(
		        {
		          name: "sidebar.footer.action",
		          id: TRIGGER_ID,
		          order: WORKSPACE_CONFIG_TRIGGER_ORDER,
		          locale: NS,
		          inject: () => ({ open })
		        },
		        WorkspaceConfigTrigger
		      );
		    } catch (error) {
		      ctx.logger?.warn("%s: \u4FA7\u680F\u5E95\u90E8\u5165\u53E3\u5EA7\u4F4D\u6CE8\u518C\u5931\u8D25\uFF0C\u672C\u5165\u53E3\u4E0D\u663E\u793A", LOG_LABEL);
		      ctx.logger?.warn(error);
		      return () => {
		      };
		    }
		  });
		  ctx.slots.inject("shell.overlay", () => {
		    try {
		      return ctx.slots.register(
		        {
		          name: "shell.overlay",
		          id: DIALOG_ID,
		          order: WORKSPACE_CONFIG_DIALOG_ORDER,
		          locale: NS,
		          children: {
		            // 字面量直写（与 contract.ts 的 WORKSPACE_CONFIG_SECTION 同值）：本行是
		            // 产物断言「`lib/client.js` 里 workspace-config.section 至少出现两次」的
		            // 声明侧锚点；渲染侧锚点在 WorkspaceConfigDialog 的 renderSlot 调用点。
		            "workspace-config.section": { kind: "list", scope: "root" }
		          },
		          inject: () => ({ open, sections })
		        },
		        WorkspaceConfigDialog
		      );
		    } catch (error) {
		      ctx.logger?.warn("%s: \u7EDF\u4E00\u5F39\u7A97\u5EA7\u4F4D\u6CE8\u518C\u5931\u8D25\uFF0C\u672C\u5F39\u7A97\u4E0D\u663E\u793A", LOG_LABEL);
		      ctx.logger?.warn(error);
		      return () => {
		      };
		    }
		  });
		}

		return module.exports;
	}
});
