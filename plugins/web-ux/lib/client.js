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

		// src/client/index.ts
		var inject = ["slots", "modelDirectories"];
		var BADGE_ORDER = 10;
		function apply(ctx) {
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
		}

		return module.exports;
	}
});
