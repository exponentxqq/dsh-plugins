window.__ModuleLoader__.load({
	id: "dsh-plugin-git-graph-multi",
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
		  BranchChip: () => BranchChip,
		  CONTEXT_FALLBACK_MS: () => CONTEXT_FALLBACK_MS,
		  apply: () => apply,
		  inject: () => inject
		});
		module.exports = __toCommonJS(index_exports);

		// src/client/sse-leader.ts
		var relays = /* @__PURE__ */ new Map();
		function subscribeSharedEvents(url, eventName, onEvent, seams = {}) {
		  const key = eventName + " " + url;
		  let relay = relays.get(key);
		  if (relay === void 0) {
		    relay = createRelay(key, url, eventName, seams);
		    relays.set(key, relay);
		  }
		  relay.listeners.add(onEvent);
		  return () => {
		    const current = relays.get(key);
		    if (current === void 0) return;
		    current.listeners.delete(onEvent);
		    if (current.listeners.size === 0) {
		      current.destroy();
		      relays.delete(key);
		    }
		  };
		}
		function createRelay(key, url, eventName, seams) {
		  const listeners = /* @__PURE__ */ new Set();
		  const dispatch = (data) => {
		    for (const listener of [...listeners]) listener(data);
		  };
		  const EventSourceImpl = seams.eventSource ?? EventSource;
		  const ChannelImpl = seams.broadcastChannel ?? (typeof BroadcastChannel === "undefined" ? void 0 : BroadcastChannel);
		  const locks = seams.locks ?? (typeof navigator === "undefined" || navigator.locks === void 0 ? void 0 : navigator.locks);
		  if (ChannelImpl === void 0 || locks === void 0) {
		    const source2 = new EventSourceImpl(url);
		    source2.addEventListener(eventName, (raw) => {
		      dispatch(raw.data);
		    });
		    return { listeners, destroy: () => {
		      source2.close();
		    } };
		  }
		  const channel = new ChannelImpl("dsh-sse:" + key);
		  channel.addEventListener("message", (raw) => {
		    dispatch(raw.data);
		  });
		  const abort = new AbortController();
		  let release;
		  let source;
		  void locks.request("dsh-sse:" + key, { signal: abort.signal }, () => {
		    source = new EventSourceImpl(url);
		    source.addEventListener(eventName, (raw) => {
		      const data = raw.data;
		      channel.postMessage(data);
		      dispatch(data);
		    });
		    return new Promise((resolve) => {
		      release = resolve;
		    });
		  }).catch(() => {
		  });
		  return {
		    listeners,
		    destroy() {
		      channel.close();
		      abort.abort();
		      release?.();
		      source?.close();
		    }
		  };
		}

		// src/client/api.ts
		var TRANSPORT_ERROR = { code: "internal", message: "git route unavailable" };
		async function post(path, payload) {
		  let response;
		  try {
		    response = await fetch(path, {
		      method: "POST",
		      headers: { "content-type": "application/json" },
		      body: JSON.stringify(payload)
		    });
		  } catch {
		    return { ok: false, error: TRANSPORT_ERROR };
		  }
		  try {
		    const envelope = await response.json();
		    if (typeof envelope !== "object" || envelope === null) return { ok: false, error: TRANSPORT_ERROR };
		    const record = envelope;
		    if (record.ok === true) return { ok: true, value: record.value };
		    return { ok: false, error: record.error ?? TRANSPORT_ERROR };
		  } catch {
		    return { ok: false, error: TRANSPORT_ERROR };
		  }
		}
		var GitApi = class {
		  /** The repository snapshot (null: not a git repository / not a workspace). */
		  status(path) {
		    return post("git/status", { path });
		  }
		  /** Local branch list with the current branch marked. */
		  branches(path) {
		    return post("git/branches", { path });
		  }
		  /** Workspace-level `git switch --no-guess <branch>` (host guards first). */
		  switchBranch(path, branch) {
		    return post("git/switch", { path, branch });
		  }
		  /** `git switch --no-guess -c <name>` from the current HEAD. */
		  createBranch(path, name) {
		    return post("git/create-branch", { path, name });
		  }
		  /** Group switch: switch every repository of the workspace that has `branch` (guarded, preflight-atomic). */
		  groupSwitch(path, branch) {
		    return post("git/group-switch", { path, branch });
		  }
		  /** Group create: create `name` in the selected repositories, from each one's `base`. */
		  groupCreate(path, repos, name, base) {
		    return post("git/group-create", { path, repos, name, base });
		  }
		  /** Topo-ordered commit graph across branches/tags/remotes. */
		  graph(path, limit) {
		    return post("git/graph", limit === void 0 ? { path } : { path, limit });
		  }
		  /** All linked worktrees of the workspace's repository. */
		  worktrees(path) {
		    return post("git/worktrees", { path });
		  }
		  /** Every repository of the workspace with its status snapshot (the overview; null: not a workspace). */
		  repos(path) {
		    return post("git/repos", { path });
		  }
		  /** Create a managed worktree on a new wt/<name> branch (host picks the path). */
		  addWorktree(path, name, baseRef) {
		    return post("git/worktree-add", baseRef === void 0 ? { path, name } : { path, name, baseRef });
		  }
		  /** Remove a managed worktree (dirty rejects unless force; deleteBranch drops the wt/ branch). */
		  removeWorktree(path, worktreePath, opts) {
		    return post("git/worktree-remove", { path, worktreePath, force: opts?.force === true, deleteBranch: opts?.deleteBranch === true });
		  }
		  /** The live feature config (auto-isolation flags + managed worktree home). */
		  config() {
		    return post("git/config", {});
		  }
		};
		function subscribeChanges(paths, onChange) {
		  const watched = [...new Set(paths.filter((path) => path !== ""))].sort();
		  if (watched.length === 0) return () => {
		  };
		  const query = watched.map((path) => `path=${encodeURIComponent(path)}`).join("&");
		  return subscribeSharedEvents(`git/events?${query}`, "change", () => {
		    onChange();
		  });
		}

		// src/client/chips/BranchChip.tsx
		var import_react9 = require("react");
		var import_dsh_client_ui_primitives10 = require("@deepseek-ai/dsh-client-ui-primitives");

		// src/client/repos/selection.ts
		function unionBranches(views) {
		  const counts = /* @__PURE__ */ new Map();
		  for (const view of views) {
		    if (view === null) continue;
		    for (const branch of view.branches) counts.set(branch.name, (counts.get(branch.name) ?? 0) + 1);
		  }
		  return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
		}
		function orderRows(rows) {
		  return [...rows].sort((a, b) => {
		    if (a.repo.primary !== b.repo.primary) return a.repo.primary ? -1 : 1;
		    return a.repo.name.localeCompare(b.repo.name);
		  });
		}
		function entryOf(row, showName, path) {
		  return {
		    path,
		    name: row.repo.name,
		    showName,
		    branch: row.status === null ? null : row.status.branch,
		    dirty: row.status === null ? 0 : row.status.dirtyFiles,
		    available: row.status !== null,
		    primary: row.repo.primary
		  };
		}
		function planChips(view, fallback) {
		  if (view === void 0) return [];
		  if (view === null) {
		    if (fallback === void 0 || fallback === null) return [];
		    return [{
		      path: void 0,
		      name: "",
		      showName: false,
		      branch: fallback.branch,
		      dirty: fallback.dirtyFiles,
		      available: true,
		      primary: true
		    }];
		  }
		  const rows = view.repos;
		  if (rows.length === 0) return [];
		  if (rows.length === 1) {
		    const row = rows[0];
		    if (row.status === null) return [];
		    return [entryOf(row, false, row.repo.primary ? void 0 : row.repo.path)];
		  }
		  return orderRows(rows).map((row) => entryOf(row, true, row.repo.path));
		}
		function chipLabel(entry, copy) {
		  const branch = entry.branch === null ? copy.unavailable : entry.branch === "" ? copy.detached : entry.branch;
		  return entry.showName ? `${entry.name} \xB7 ${branch}` : branch;
		}

		// src/client/chips/Chip.tsx
		var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

		// src/client/chips/context.module.css
		var cssText = "/* Branch selector chip for blank sessions. Tokens by default; the stock-light\n   fallback defines a small literal palette because the unskinned shell tokens\n   are too low-contrast.\n   Controls and surfaces come from @deepseek-ai/dsh-client-ui-primitives: this\n   module keeps layout, positioning, sizing, scrolling, and text truncation. */\n\n.ggm_anchor_076f0a {\n  position: relative;\n}\n\n/* The flat repository chip row: one slot per enumerated repository, wrapping\n   onto a second line when the row runs out of width. */\n.ggm_chipWrap_076f0a {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 6px;\n  row-gap: 6px;\n  max-width: 100%;\n}\n\n/* One chip together with the panel it opens: the positioning context. */\n.ggm_chipSlot_076f0a {\n  position: relative;\n  display: inline-flex;\n  max-width: 100%;\n}\n\n/* Hero phase (dock seat): the chip row takes its own line directly under the\n   official hero workspace row, and copies that row's content box so the two\n   rows' first chips share one left edge. The shell's hero workspace row rule\n   (ui-conversation's ConversationRoot CSS module) is `padding: 0 16px 0 20px`;\n   these values mirror it deliberately, and the row's own width makes every\n   wrapped chip line start on that same edge. */\n.ggm_anchorHero_076f0a {\n  padding: 0 16px 0 20px;\n}\n\n.ggm_chip_076f0a {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  height: 24px;\n  padding: 0 10px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 999px;\n  background: var(--dsw-alias-button-tool-bar-fill);\n  color: var(--dsw-alias-label-secondary);\n  cursor: pointer;\n  font-size: 12px;\n  line-height: 1;\n  white-space: nowrap;\n  transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease,\n    gap 120ms ease, padding 120ms ease;\n}\n\n.ggm_chip_076f0a:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.ggm_chip_076f0a:active {\n  background: var(--dsw-alias-interactive-bg-active);\n}\n\n.ggm_chip_076f0a:focus-visible {\n  outline: none;\n  box-shadow: 0 0 0 2px var(--dsw-alias-brand-primary);\n}\n\n.ggm_chip_076f0a:disabled {\n  opacity: 0.55;\n  cursor: not-allowed;\n}\n\n.ggm_chip_076f0a:disabled:hover {\n  background: var(--dsw-alias-button-tool-bar-fill);\n}\n\n/* Leading icon slot: the workspace root checkout's icon is brand-tinted. */\n.ggm_chipIcon_076f0a {\n  display: inline-flex;\n  flex: none;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.ggm_chipIconPrimary_076f0a {\n  color: var(--dsw-alias-brand-primary);\n}\n\n/* Dirty-file badge inside the chip: the count alone, the hover text carries\n   the sentence. */\n.ggm_chipBadge_076f0a {\n  flex: none;\n  padding: 1px 5px;\n  border-radius: 999px;\n  background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 18%, transparent);\n  color: var(--dsw-alias-state-warn-primary);\n  font-size: 10px;\n  line-height: 1.4;\n  font-variant-numeric: tabular-nums;\n}\n\n/* An unusable repository: inert, dashed, and dimmed. Declared after the\n   `:hover` rules so it wins at equal specificity. */\n.ggm_chipDisabled_076f0a,\n.ggm_chipDisabled_076f0a:hover {\n  opacity: 0.55;\n  border-style: dashed;\n  background: var(--dsw-alias-button-tool-bar-fill);\n  cursor: not-allowed;\n}\n\n.ggm_chipOpen_076f0a {\n  border-color: var(--dsw-alias-brand-primary);\n  color: var(--dsw-alias-label-primary);\n}\n\n.ggm_chipLabel_076f0a {\n  max-width: 220px;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n\n.ggm_chipChevron_076f0a {\n  color: var(--dsw-alias-label-tertiary);\n  transition: transform 120ms ease;\n}\n\n/* An expanded chip points its chevron back up at the panel it opened. */\n.ggm_chipOpen_076f0a .ggm_chipChevron_076f0a {\n  transform: rotate(180deg);\n}\n\n/* Hero phase: the same pill recipe as the official hero-row chips\n   (WorkspaceChip and AgentPresetSeat in the official UI packages) \u2014\n   transparent 28px pill, label-primary text, interactive-bg hover/open. */\n.ggm_chipHero_076f0a {\n  height: auto;\n  min-height: 28px;\n  max-width: min(100%, 240px);\n  padding: 0 8px;\n  border: none;\n  border-radius: 16px;\n  background: transparent;\n  color: var(--dsw-alias-label-primary);\n  gap: 4px;\n  font-size: 13px;\n  font-weight: 500;\n  line-height: 20px;\n  overflow: hidden;\n}\n\n.ggm_chipHero_076f0a:hover,\n.ggm_chipHero_076f0a:active,\n.ggm_chipHero_076f0a.ggm_chipOpen_076f0a {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.ggm_chipHero_076f0a .ggm_chipLabel_076f0a {\n  max-width: 180px;\n}\n\n.ggm_chipHero_076f0a .ggm_chipChevron_076f0a {\n  color: var(--dsw-alias-label-caption);\n}\n\n.ggm_backdrop_076f0a {\n  position: fixed;\n  inset: 0;\n  z-index: 30;\n}\n\n/* The menu surface (host `MenuSurface compact`) paints the material; this\n   class only places and sizes the panel. `:where(.ggm_surface_076f0a)` pins the host's\n   own `position: relative` at zero specificity, so this absolute positioning\n   wins without `!important`. */\n.ggm_popover_076f0a {\n  position: absolute;\n  /* The chip row sits above the input card: the popover opens UPWARD, capped\n     at the same 360px as the workspace picker menu beside it. */\n  bottom: calc(100% + 8px);\n  left: 0;\n  z-index: 100;\n  display: flex;\n  flex-direction: column;\n  width: 300px;\n  max-height: 360px;\n  padding: 4px;\n  overflow: hidden;\n}\n\n/* The pushed operations panel needs a little more room than the branch list. */\n.ggm_popoverOps_076f0a {\n  width: 320px;\n}\n\n/* Operations panel header: the back entry and the repository label. */\n.ggm_panelHeader_076f0a {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  padding: 6px 8px 0;\n}\n\n/* Back entry: the host ghost button paints itself; this only keeps it from\n   being squeezed by the repository label beside it. */\n.ggm_backEntry_076f0a {\n  flex: none;\n}\n\n.ggm_panelRepoLabel_076f0a {\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  color: var(--dsw-alias-label-primary);\n  font-size: 12px;\n  font-weight: 500;\n}\n\n/* Search slot: the host `Input` paints the field, this only spaces it. */\n.ggm_search_076f0a {\n  margin: 8px;\n}\n\n.ggm_searchField_076f0a {\n  width: 100%;\n  box-sizing: border-box;\n}\n\n.ggm_list_076f0a {\n  flex: 1;\n  min-height: 64px;\n  overflow-x: hidden;\n  overflow-y: auto;\n  padding: 2px 6px 6px;\n  scrollbar-width: thin;\n  scrollbar-color: var(--dsw-alias-scrollbar-bg-l2) transparent;\n}\n.ggm_list_076f0a::-webkit-scrollbar {\n  width: 6px;\n}\n.ggm_list_076f0a::-webkit-scrollbar-thumb {\n  background: var(--dsw-alias-scrollbar-bg-l2);\n  border-radius: 3px;\n}\n.ggm_list_076f0a::-webkit-scrollbar-track {\n  background: transparent;\n}\n\n.ggm_item_076f0a {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  padding: 7px 8px;\n  border: none;\n  /* UA buttons paint a surface color (buttonface); pin transparent so\n     only hover/active tints show.  Full-width so long names ellipsize\n     in place and the trailing check stays visible. */\n  background: transparent;\n  min-width: 0;\n  width: 100%;\n  max-width: 100%;\n  box-sizing: border-box;\n  border-radius: 8px;\n  cursor: pointer;\n  text-align: left;\n  position: relative;\n  transition: background-color 120ms ease;\n}\n\n.ggm_item_076f0a:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.ggm_item_076f0a:active {\n  background: var(--dsw-alias-interactive-bg-active);\n}\n\n.ggm_item_076f0a:focus-visible {\n  outline: none;\n  box-shadow: 0 0 0 2px var(--dsw-alias-brand-primary);\n}\n\n.ggm_item_076f0a:disabled {\n  opacity: 0.55;\n  cursor: not-allowed;\n}\n\n.ggm_item_076f0a:disabled:hover {\n  background: none;\n}\n\n/* The checked-out branch: brand-tinted row, with the layer fill as the\n   fallback for engines without color-mix. */\n.ggm_itemActive_076f0a {\n  background: var(--dsw-alias-bg-layer-2);\n  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent);\n}\n\n.ggm_itemText_076f0a {\n  flex: 1;\n  min-width: 0;\n}\n\n.ggm_itemName_076f0a {\n  display: block;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  color: var(--dsw-alias-label-primary);\n  font-size: 13px;\n}\n\n.ggm_check_076f0a {\n  color: var(--dsw-alias-brand-primary);\n  flex: none;\n}\n\n.ggm_empty_076f0a {\n  padding: 14px 10px;\n  text-align: center;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 12px;\n}\n\n.ggm_dirty_076f0a {\n  margin: 0 10px 4px;\n  color: var(--dsw-alias-state-warn-primary);\n  font-size: 11px;\n}\n\n/* Busy glyph for the row (or action) whose request is in flight. */\n.ggm_spinner_076f0a {\n  flex: none;\n  color: var(--dsw-alias-label-tertiary);\n  animation: gitgraphSpin 900ms linear infinite;\n}\n\n@keyframes gitgraphSpin {\n  from { transform: rotate(0deg); }\n  to { transform: rotate(360deg); }\n}\n\n.ggm_notice_076f0a {\n  margin: 0 8px 8px;\n  padding: 6px 10px;\n  border-radius: 8px;\n  /* Never pair a solid state-secondary fill with state-primary text: dark\n     themes alias both onto the same static color (the official dark theme\n     maps both error tokens to red-400), which renders the message invisible.\n     Tint the banner from the primary token instead (the aionui-panel scm\n     banner idiom). */\n  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 14%, transparent);\n  color: var(--dsw-alias-state-error-primary);\n  font-size: 12px;\n}\n\n.ggm_footer_076f0a {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n  border-top: 1px solid var(--dsw-alias-border-l1);\n  padding: 6px;\n}\n\n/* Host ghost buttons as full-width menu rows. */\n.ggm_footerButton_076f0a {\n  justify-content: flex-start;\n  width: 100%;\n}\n\n/* Operations panel (pushed from the branch view): grouped rows, each a\n   full-width host ghost button carrying a title and a one-line description. */\n.ggm_opsStack_076f0a {\n  flex: 1;\n  min-height: 64px;\n  overflow-x: hidden;\n  overflow-y: auto;\n  padding: 2px 6px 8px;\n  scrollbar-width: thin;\n  scrollbar-color: var(--dsw-alias-scrollbar-bg-l2) transparent;\n}\n\n.ggm_opsStack_076f0a::-webkit-scrollbar {\n  width: 6px;\n}\n\n.ggm_opsStack_076f0a::-webkit-scrollbar-thumb {\n  background: var(--dsw-alias-scrollbar-bg-l2);\n  border-radius: 3px;\n}\n\n.ggm_opsStack_076f0a::-webkit-scrollbar-track {\n  background: transparent;\n}\n\n.ggm_opsGroup_076f0a {\n  padding: 8px 8px 4px;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 11px;\n}\n\n.ggm_opsItem_076f0a {\n  justify-content: flex-start;\n  width: 100%;\n  height: auto;\n  padding-top: 6px;\n  padding-bottom: 6px;\n}\n\n.ggm_opsItemText_076f0a {\n  display: flex;\n  flex-direction: column;\n  align-items: flex-start;\n  gap: 1px;\n  min-width: 0;\n}\n\n.ggm_opsItemTitle_076f0a {\n  max-width: 100%;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.ggm_opsItemDesc_076f0a {\n  max-width: 100%;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 11px;\n  font-weight: 400;\n}\n\n/* Dialog bodies: the host modal supplies the chrome; these keep the field\n   stack, its labels, and the inline error line. */\n.ggm_form_076f0a {\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n}\n\n.ggm_field_076f0a {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n}\n\n.ggm_fieldLabel_076f0a {\n  color: var(--dsw-alias-label-secondary);\n  font-size: 12px;\n}\n\n.ggm_fieldInput_076f0a {\n  width: 100%;\n  box-sizing: border-box;\n}\n\n.ggm_baseValue_076f0a {\n  max-width: 240px;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.ggm_formError_076f0a {\n  color: var(--dsw-alias-state-error-primary);\n  font-size: 13px;\n  line-height: 20px;\n}\n\n.ggm_graphBody_076f0a {\n  flex: 1;\n  min-height: 240px;\n  overflow-y: auto;\n  padding: 4px 0;\n}\n\n.ggm_graphRow_076f0a {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  padding: 7px 8px;\n  border-radius: 8px;\n  font-size: 12px;\n}\n\n.ggm_graphRow_076f0a:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.ggm_graphLanes_076f0a {\n  display: flex;\n  flex: none;\n  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;\n  font-size: 12px;\n  line-height: 1.4;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.ggm_graphLaneCell_076f0a {\n  display: inline-block;\n  width: 15px;\n  text-align: center;\n  flex: none;\n}\n\n.ggm_graphLaneNode_076f0a {\n  color: var(--dsw-alias-brand-primary);\n  font-weight: 700;\n}\n\n.ggm_graphLaneMerge_076f0a {\n  color: var(--dsw-alias-brand-primary);\n  font-weight: 700;\n}\n\n.ggm_graphLanePass_076f0a {\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.ggm_graphOid_076f0a {\n  flex: none;\n  min-width: 58px;\n  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;\n  font-size: 11px;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.ggm_graphMain_076f0a {\n  flex: 1;\n  min-width: 0;\n  display: flex;\n  flex-direction: column;\n  gap: 3px;\n}\n\n.ggm_graphSubject_076f0a {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  color: var(--dsw-alias-label-primary);\n  font-size: 13px;\n  font-weight: 500;\n}\n\n.ggm_graphMeta_076f0a {\n  display: flex;\n  align-items: center;\n  flex-wrap: wrap;\n  gap: 4px 6px;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 11px;\n}\n\n.ggm_graphMetaSep_076f0a {\n  flex: none;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n/* Ref labels carry the walkthrough hook on this slot, because the host `Tag`\n   capsule takes no attributes of its own. */\n.ggm_graphRefSlot_076f0a {\n  flex: none;\n  display: inline-flex;\n  max-width: 140px;\n  min-width: 0;\n}\n\n.ggm_graphRefTag_076f0a {\n  max-width: 100%;\n  overflow: hidden;\n}\n\n.ggm_graphRefText_076f0a {\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n/* Modal width override: the host modal sets `width: min(380px, 100%)` on the\n   very element this class lands on, so the class is doubled to outrank it\n   without `!important`. `max-height: 100%` is the host's documented cap (the\n   overlay's 24px padding box), which keeps the scrolling list inside the\n   viewport. */\n.ggm_graphDialog_076f0a.ggm_graphDialog_076f0a {\n  width: min(760px, calc(100vw - 48px));\n}\n\n.ggm_graphDialog_076f0a,\n.ggm_managerDialog_076f0a {\n  max-height: 100%;\n}\n\n/* Stock light fallback: BranchChip marks the unskinned light page at\n   runtime. */\n[data-gitgraph-chip-anchor][data-gitgraph-stock-light] {\n  --gitgraph-stock-ink-rgb: 15, 17, 21;\n  --gitgraph-stock-ink: #0f1115;\n  --gitgraph-stock-on-success: #ffffff;\n  --dsw-alias-button-tool-bar-fill: rgba(var(--gitgraph-stock-ink-rgb), 0.04);\n  --dsw-alias-button-tool-bar-hover: rgba(var(--gitgraph-stock-ink-rgb), 0.08);\n  --dsw-alias-border-l2: rgba(var(--gitgraph-stock-ink-rgb), 0.16);\n  --dsw-alias-interactive-bg-hover: rgba(var(--gitgraph-stock-ink-rgb), 0.06);\n  --dsw-alias-interactive-bg-active: rgba(var(--gitgraph-stock-ink-rgb), 0.1);\n  --dsw-alias-label-primary: var(--gitgraph-stock-ink);\n  --dsw-alias-label-secondary: var(--gitgraph-stock-ink);\n  --dsw-alias-label-tertiary: rgba(var(--gitgraph-stock-ink-rgb), 0.56);\n  --dsw-alias-button-contrast-fill: var(--gitgraph-stock-on-success);\n  /* The unskinned shell may ship no menu-surface token: without one the host\n     menu surface would paint nothing behind the popover. */\n  --dsw-menu-surface-fill: rgba(255, 255, 255, 0.86);\n}\n\n.ggm_graphEmpty_076f0a {\n  padding: 24px 10px;\n  text-align: center;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 12px;\n}\n\n/* Reduced motion: the spinner stops and interactive transitions snap.\n   The CSS-module build pass rewrites class selectors only when they follow a\n   closing brace, so a class rule that opens an at-rule block would ship\n   unscoped and inert: this block therefore opens with hook-based selectors. */\n@media (prefers-reduced-motion: reduce) {\n  [data-gitgraph-chip-anchor] button,\n  [data-gitgraph-chip-anchor] svg,\n  [data-gitgraph-dialog] svg,\n  [data-gitgraph-worktree-dialog] svg,\n  [data-gitgraph-worktree-manager] svg {\n    transition: none;\n  }\n\n  .ggm_spinner_076f0a {\n    animation: none;\n  }\n}\n\n/* Worktree manager rows. */\n\n.ggm_managerList_076f0a {\n  flex: 1;\n  min-height: 120px;\n  overflow-y: auto;\n  padding: 4px 0;\n}\n\n.ggm_managerRow_076f0a {\n  display: flex;\n  align-items: flex-start;\n  justify-content: space-between;\n  gap: 10px;\n  padding: 8px;\n  border-radius: 8px;\n  font-size: 12px;\n}\n\n.ggm_managerRow_076f0a:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.ggm_managerInfo_076f0a {\n  flex: 1;\n  min-width: 0;\n  display: flex;\n  flex-direction: column;\n  gap: 3px;\n}\n\n.ggm_managerHeadline_076f0a {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  color: var(--dsw-alias-label-primary);\n}\n\n.ggm_managerBranch_076f0a {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  font-weight: 500;\n}\n\n/* Host Tag capsules must not be squeezed by a long branch name beside them. */\n.ggm_tagFixed_076f0a {\n  flex: none;\n}\n\n.ggm_managerOid_076f0a {\n  flex: none;\n  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;\n  font-size: 11px;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.ggm_managerPath_076f0a {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;\n  font-size: 11px;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.ggm_managerConfirm_076f0a {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  margin-top: 2px;\n  color: var(--dsw-alias-state-error-primary);\n  font-size: 12px;\n}\n\n/* Force-remove action: the host ghost variant carries no destructive tone. */\n.ggm_managerConfirm_076f0a .ggm_managerDanger_076f0a {\n  color: var(--dsw-alias-state-error-primary);\n}\n\n.ggm_managerActions_076f0a {\n  flex: none;\n  display: flex;\n  flex-direction: column;\n  align-items: flex-end;\n  gap: 6px;\n}\n\n.ggm_managerRowActions_076f0a {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n}\n";
		if (typeof document !== "undefined" && document.querySelector('style[data-dsh-plugin="dsh-plugin-git-graph-multi"]') === null) {
		  const style = document.createElement("style");
		  style.setAttribute("data-dsh-plugin", "dsh-plugin-git-graph-multi");
		  style.textContent = cssText;
		  document.head.appendChild(style);
		}
		var context_default = { "anchor": "ggm_anchor_076f0a", "chipWrap": "ggm_chipWrap_076f0a", "chipSlot": "ggm_chipSlot_076f0a", "anchorHero": "ggm_anchorHero_076f0a", "chip": "ggm_chip_076f0a", "chipIcon": "ggm_chipIcon_076f0a", "chipIconPrimary": "ggm_chipIconPrimary_076f0a", "chipBadge": "ggm_chipBadge_076f0a", "chipDisabled": "ggm_chipDisabled_076f0a", "chipOpen": "ggm_chipOpen_076f0a", "chipLabel": "ggm_chipLabel_076f0a", "chipChevron": "ggm_chipChevron_076f0a", "chipHero": "ggm_chipHero_076f0a", "backdrop": "ggm_backdrop_076f0a", "surface": "ggm_surface_076f0a", "popover": "ggm_popover_076f0a", "popoverOps": "ggm_popoverOps_076f0a", "panelHeader": "ggm_panelHeader_076f0a", "backEntry": "ggm_backEntry_076f0a", "panelRepoLabel": "ggm_panelRepoLabel_076f0a", "search": "ggm_search_076f0a", "searchField": "ggm_searchField_076f0a", "list": "ggm_list_076f0a", "item": "ggm_item_076f0a", "itemActive": "ggm_itemActive_076f0a", "itemText": "ggm_itemText_076f0a", "itemName": "ggm_itemName_076f0a", "check": "ggm_check_076f0a", "empty": "ggm_empty_076f0a", "dirty": "ggm_dirty_076f0a", "spinner": "ggm_spinner_076f0a", "notice": "ggm_notice_076f0a", "footer": "ggm_footer_076f0a", "footerButton": "ggm_footerButton_076f0a", "opsStack": "ggm_opsStack_076f0a", "opsGroup": "ggm_opsGroup_076f0a", "opsItem": "ggm_opsItem_076f0a", "opsItemText": "ggm_opsItemText_076f0a", "opsItemTitle": "ggm_opsItemTitle_076f0a", "opsItemDesc": "ggm_opsItemDesc_076f0a", "form": "ggm_form_076f0a", "field": "ggm_field_076f0a", "fieldLabel": "ggm_fieldLabel_076f0a", "fieldInput": "ggm_fieldInput_076f0a", "baseValue": "ggm_baseValue_076f0a", "formError": "ggm_formError_076f0a", "graphBody": "ggm_graphBody_076f0a", "graphRow": "ggm_graphRow_076f0a", "graphLanes": "ggm_graphLanes_076f0a", "graphLaneCell": "ggm_graphLaneCell_076f0a", "graphLaneNode": "ggm_graphLaneNode_076f0a", "graphLaneMerge": "ggm_graphLaneMerge_076f0a", "graphLanePass": "ggm_graphLanePass_076f0a", "graphOid": "ggm_graphOid_076f0a", "graphMain": "ggm_graphMain_076f0a", "graphSubject": "ggm_graphSubject_076f0a", "graphMeta": "ggm_graphMeta_076f0a", "graphMetaSep": "ggm_graphMetaSep_076f0a", "graphRefSlot": "ggm_graphRefSlot_076f0a", "graphRefTag": "ggm_graphRefTag_076f0a", "graphRefText": "ggm_graphRefText_076f0a", "graphDialog": "ggm_graphDialog_076f0a", "managerDialog": "ggm_managerDialog_076f0a", "graphEmpty": "ggm_graphEmpty_076f0a", "managerList": "ggm_managerList_076f0a", "managerRow": "ggm_managerRow_076f0a", "managerInfo": "ggm_managerInfo_076f0a", "managerHeadline": "ggm_managerHeadline_076f0a", "managerBranch": "ggm_managerBranch_076f0a", "tagFixed": "ggm_tagFixed_076f0a", "managerOid": "ggm_managerOid_076f0a", "managerPath": "ggm_managerPath_076f0a", "managerConfirm": "ggm_managerConfirm_076f0a", "managerDanger": "ggm_managerDanger_076f0a", "managerActions": "ggm_managerActions_076f0a", "managerRowActions": "ggm_managerRowActions_076f0a" };

		// src/client/chips/Chip.tsx
		var import_jsx_runtime = require("react/jsx-runtime");
		function cx(...parts) {
		  return parts.filter((part) => typeof part === "string" && part !== "").join(" ");
		}
		function Chip({ icon, label, ariaLabel, open, onClick, hero = false, badge, disabled = false, title, primary = false, repoPath }) {
		  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
		    "button",
		    {
		      type: "button",
		      "data-gitgraph-chip": true,
		      "data-gitgraph-chip-repo": repoPath,
		      className: cx(context_default.chip, open && context_default.chipOpen, hero && context_default.chipHero, disabled && context_default.chipDisabled),
		      onClick: disabled ? void 0 : onClick,
		      "aria-label": ariaLabel,
		      "aria-expanded": open,
		      disabled,
		      title,
		      children: [
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: cx(context_default.chipIcon, primary && context_default.chipIconPrimary), children: icon }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: context_default.chipLabel, title: label, children: label }),
		        badge,
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconChevronDownOutlineMedium, { className: context_default.chipChevron, size: 12 })
		      ]
		    }
		  );
		}
		function Backdrop({ onClose }) {
		  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: context_default.backdrop, onClick: onClose });
		}

		// src/client/chips/BranchPopover.tsx
		var import_react = require("react");
		var import_dsh_client_ui_primitives2 = require("@deepseek-ai/dsh-client-ui-primitives");

		// src/client/chips/error-copy.ts
		function pathsText(error, t) {
		  const listed = (error.paths ?? []).map((path) => `"${path}"`).join(t("error.pathsSeparator"));
		  const more = error.moreFiles !== void 0 && error.moreFiles > 0 ? ` ${t("error.moreFiles", { count: error.moreFiles })}` : "";
		  return `${listed}${more}`;
		}
		function errorMessage(error, t) {
		  switch (error.code) {
		    case "conflicts-present":
		      return t("error.conflictsPresent");
		    case "operation-in-progress":
		      return t("error.operationInProgress");
		    case "branch-in-other-worktree":
		      return t("error.branchInOtherWorktree");
		    case "tracked-changes-would-be-overwritten":
		      return t("error.trackedOverwrite", { paths: pathsText(error, t) });
		    case "untracked-changes-would-be-overwritten":
		      return t("error.untrackedOverwrite", { paths: pathsText(error, t) });
		    case "target-branch-not-found":
		      return t("error.targetBranchNotFound");
		    case "invalid-branch-name":
		      return t("error.invalidBranchName");
		    case "branch-already-exists":
		      return t("error.branchAlreadyExists");
		    case "workspace-unknown":
		      return t("error.workspaceUnknown");
		    case "invalid-worktree-name":
		      return t("error.invalidWorktreeName");
		    case "worktree-already-exists":
		      return t("error.worktreeAlreadyExists");
		    case "worktree-dirty":
		      return t("error.worktreeDirty");
		    case "worktree-not-found":
		      return t("error.worktreeNotFound");
		    case "worktree-is-main":
		      return t("error.worktreeIsMain");
		    case "base-ref-not-found":
		      return t("error.baseRefNotFound");
		    case "internal":
		      return t("error.requestFailed", { error: error.message });
		  }
		}

		// src/client/chips/BranchPopover.tsx
		var import_jsx_runtime2 = require("react/jsx-runtime");
		var TOOLTIP_NAME_THRESHOLD = 18;
		var TOOLTIP_DELAY_MS = 400;
		var TOOLTIP_MAX_WIDTH = 320;
		function BranchPopover({ view, onSwitch, onSwitched, onCreate, onGraph, onCreateWorktree, onManageWorktrees, groupOps, onClose, t, repoLabel }) {
		  const [query, setQuery] = (0, import_react.useState)("");
		  const [pending, setPending] = (0, import_react.useState)(null);
		  const [error, setError] = (0, import_react.useState)(null);
		  const [panel, setPanel] = (0, import_react.useState)("list");
		  const busy = pending !== null;
		  const filtered = (0, import_react.useMemo)(() => {
		    const needle = query.trim().toLowerCase();
		    if (needle === "") return view.branches;
		    return view.branches.filter((branch) => branch.name.toLowerCase().includes(needle));
		  }, [view.branches, query]);
		  const switchTo = (branch) => {
		    if (busy) return;
		    setPending(branch);
		    setError(null);
		    void onSwitch(branch).then((result) => {
		      if (result.ok) {
		        onSwitched(result.branch);
		        onClose();
		        return;
		      }
		      setError(errorMessage(result.error, t));
		    }).finally(() => {
		      setPending(null);
		    });
		  };
		  const opsRow = (key, icon, title, description, onClick, part) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		    import_dsh_client_ui_primitives2.Button,
		    {
		      variant: "ghost",
		      size: "sm",
		      className: context_default.opsItem,
		      icon,
		      onClick,
		      disabled: busy,
		      "data-gitgraph-ops-item": key,
		      "data-dsh-part": part,
		      children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: context_default.opsItemText, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: context_default.opsItemTitle, children: title }),
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: context_default.opsItemDesc, children: description })
		      ] })
		    },
		    key
		  );
		  const listFace = /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: context_default.search, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		      import_dsh_client_ui_primitives2.Input,
		      {
		        className: context_default.searchField,
		        icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconSearchOutlineRegular, { size: 14 }),
		        value: query,
		        onChange: (event) => {
		          setQuery(event.target.value);
		        },
		        placeholder: t("branch.search"),
		        autoFocus: true
		      }
		    ) }),
		    view.dirtyFiles > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: context_default.dirty, children: t("branch.dirty", { count: view.dirtyFiles }) }),
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: context_default.list, children: filtered.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: context_default.empty, children: t("branch.empty") }) : filtered.map((branch) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		      import_dsh_client_ui_primitives2.Tooltip,
		      {
		        label: branch.name,
		        portal: true,
		        delayMs: TOOLTIP_DELAY_MS,
		        maxWidth: TOOLTIP_MAX_WIDTH,
		        disabled: branch.name.length <= TOOLTIP_NAME_THRESHOLD,
		        children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
		          "button",
		          {
		            type: "button",
		            className: cx(context_default.item, branch.current && context_default.itemActive),
		            onClick: () => {
		              switchTo(branch.name);
		            },
		            role: "option",
		            "aria-selected": branch.current,
		            "aria-label": branch.name,
		            disabled: busy,
		            children: [
		              pending === branch.name ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconLoadingOutlineRegular, { className: context_default.spinner, size: 14 }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconBranchOutlineRegular, { size: 14 }),
		              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: context_default.itemText, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: context_default.itemName, children: branch.name }) }),
		              branch.current && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconCheckOutlineMedium, { className: context_default.check, size: 14 })
		            ]
		          }
		        )
		      },
		      branch.name
		    )) }),
		    error !== null && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: context_default.notice, children: error }),
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: context_default.footer, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		      import_dsh_client_ui_primitives2.Button,
		      {
		        variant: "ghost",
		        size: "sm",
		        className: context_default.footerButton,
		        icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconEllipsisOutlineRegular, { size: 14 }),
		        onClick: () => {
		          setPanel("ops");
		        },
		        disabled: busy,
		        "data-gitgraph-more": true,
		        children: t("ops.more")
		      }
		    ) })
		  ] });
		  const opsFace = /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: context_default.panelHeader, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		        import_dsh_client_ui_primitives2.Button,
		        {
		          variant: "ghost",
		          size: "sm",
		          className: context_default.backEntry,
		          icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconChevronLeftOutlineMedium, { size: 14 }),
		          onClick: () => {
		            setPanel("list");
		          },
		          "aria-label": t("ops.back"),
		          "data-gitgraph-back": true,
		          children: t("ops.back")
		        }
		      ),
		      repoLabel !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: context_default.panelRepoLabel, title: repoLabel, children: repoLabel })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: context_default.opsStack, "data-gitgraph-ops": true, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: context_default.opsGroup, children: t("ops.group.branch") }),
		      opsRow("create", /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconPlusOutlineRegular, { size: 14 }), t("branch.create"), t("ops.create.desc"), onCreate),
		      opsRow("graph", /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconListPenOutlineRegular, { size: 14 }), t("branch.graph"), t("ops.graph.desc"), onGraph),
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: context_default.opsGroup, children: t("ops.group.worktree") }),
		      opsRow("worktree-create", /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconFlatListOutlineRegular, { size: 14 }), t("worktree.create"), t("ops.worktreeCreate.desc"), onCreateWorktree, "worktree-create"),
		      opsRow("worktree-manage", /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconWorkspaceTreeOutlineRegular, { size: 14 }), t("worktree.manage"), t("ops.worktreeManage.desc"), onManageWorktrees, "worktree-manage"),
		      groupOps !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: context_default.opsGroup, children: t("ops.group.group") }),
		        opsRow("group-switch", /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconRefreshOutlineRegular, { size: 14 }), t("ops.groupSwitch"), t("ops.groupSwitch.desc"), groupOps.onSwitch),
		        opsRow("group-create", /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconPlusOutlineRegular, { size: 14 }), t("ops.groupCreate"), t("ops.groupCreate.desc"), groupOps.onCreate, "group-create")
		      ] })
		    ] })
		  ] });
		  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Backdrop, { onClose }),
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		      import_dsh_client_ui_primitives2.MenuSurface,
		      {
		        compact: true,
		        className: cx(context_default.popover, panel === "ops" && context_default.popoverOps),
		        role: panel === "list" ? "listbox" : "dialog",
		        "aria-label": panel === "list" ? t("branch.search") : t("ops.more"),
		        "data-gitgraph-popover": true,
		        children: panel === "list" ? listFace : opsFace
		      }
		    )
		  ] });
		}

		// src/client/chips/CreateBranchDialog.tsx
		var import_react2 = require("react");
		var import_dsh_client_ui_primitives3 = require("@deepseek-ai/dsh-client-ui-primitives");

		// src/core/git-command.ts
		var WORKTREE_BRANCH_PREFIX = "wt/";
		function sanitizeWorktreeName(raw) {
		  const cleaned = raw.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/-{2,}/g, "-").replace(/^[-.]+/, "").replace(/[-.]+$/, "").slice(0, 64);
		  if (cleaned === "" || cleaned === "." || cleaned === "..") return null;
		  return cleaned;
		}
		var gitPathEncoder = new TextEncoder();
		var gitPathDecoder = new TextDecoder();
		function validateBranchName(name) {
		  if (name === "") return "empty";
		  if (name === "@") return "at-sign";
		  if (name.startsWith("-")) return "leading-dash";
		  if (name.endsWith(".")) return "trailing-dot";
		  if (name.endsWith(".lock")) return "lock-suffix";
		  if (name.includes("..")) return "double-dot";
		  if (name.includes("@{")) return "at-brace";
		  if (name.includes("//")) return "double-slash";
		  if (name.includes(" ")) return "space";
		  if (name.includes("~") || name.includes("^") || name.includes(":")) return "forbidden-char";
		  if (name.includes("?") || name.includes("*") || name.includes("[") || name.includes("\\")) return "forbidden-char";
		  for (const ch of name) {
		    const code = ch.codePointAt(0);
		    if (code !== void 0 && (code < 32 || code === 127)) return "control-char";
		  }
		  for (const component of name.split("/")) {
		    if (component === "") return "empty-component";
		    if (component.startsWith(".")) return "dot-component";
		    if (component.endsWith(".lock")) return "lock-suffix";
		  }
		  if (name.length > 1e3) return "too-long";
		  return null;
		}

		// src/client/chips/CreateBranchDialog.tsx
		var import_jsx_runtime3 = require("react/jsx-runtime");
		function CreateBranchDialog({ onCreate, onClose, t }) {
		  const [name, setName] = (0, import_react2.useState)("");
		  const [pending, setPending] = (0, import_react2.useState)(false);
		  const [error, setError] = (0, import_react2.useState)(null);
		  const requestClose = () => {
		    if (!pending) onClose();
		  };
		  const submit = () => {
		    if (pending) return;
		    const trimmed = name.trim();
		    if (validateBranchName(trimmed) !== null) {
		      setError(t("error.invalidBranchName"));
		      return;
		    }
		    setPending(true);
		    setError(null);
		    void onCreate(trimmed).then((result) => {
		      if (result.ok) {
		        onClose();
		        return;
		      }
		      setError(errorMessage(result.error, t));
		    }).finally(() => {
		      setPending(false);
		    });
		  };
		  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		    import_dsh_client_ui_primitives3.Modal,
		    {
		      open: true,
		      onClose: requestClose,
		      title: t("branch.createDialog.title"),
		      description: t("branch.createDialog.description"),
		      closeLabel: t("branch.createDialog.cancel"),
		      footer: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Button, { variant: "ghost", onClick: onClose, disabled: pending, children: t("branch.createDialog.cancel") }),
		        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		          import_dsh_client_ui_primitives3.Button,
		          {
		            variant: "primary",
		            onClick: submit,
		            disabled: pending || name.trim() === "",
		            children: t("branch.createDialog.confirm")
		          }
		        )
		      ] }),
		      children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: context_default.form, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: context_default.field, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { className: context_default.fieldLabel, htmlFor: "git-graph-branch-name", children: t("branch.createDialog.nameLabel") }),
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		            import_dsh_client_ui_primitives3.Input,
		            {
		              id: "git-graph-branch-name",
		              className: context_default.fieldInput,
		              value: name,
		              onChange: (event) => {
		                setName(event.target.value);
		              },
		              placeholder: t("branch.createDialog.placeholder"),
		              onKeyDown: (event) => {
		                if (event.key === "Enter") submit();
		              },
		              "data-modal-autofocus": true
		            }
		          )
		        ] }),
		        error !== null && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: context_default.formError, role: "alert", children: error })
		      ] })
		    }
		  );
		}

		// src/client/chips/CreateWorktreeDialog.tsx
		var import_react3 = require("react");
		var import_dsh_client_ui_primitives4 = require("@deepseek-ai/dsh-client-ui-primitives");
		var import_jsx_runtime4 = require("react/jsx-runtime");
		function CreateWorktreeDialog({ branches, currentBranch, onCreate, onClose, t }) {
		  const [name, setName] = (0, import_react3.useState)("");
		  const [baseRef, setBaseRef] = (0, import_react3.useState)(currentBranch);
		  const [baseOpen, setBaseOpen] = (0, import_react3.useState)(false);
		  const [pending, setPending] = (0, import_react3.useState)(false);
		  const [error, setError] = (0, import_react3.useState)(null);
		  const sanitized = sanitizeWorktreeName(name);
		  const baseLabel = baseRef === "" ? t("branch.detached") : baseRef;
		  const requestClose = () => {
		    if (!pending) onClose();
		  };
		  const submit = () => {
		    if (pending) return;
		    if (sanitized === null) {
		      setError(t("error.invalidWorktreeName"));
		      return;
		    }
		    setPending(true);
		    setError(null);
		    void onCreate(sanitized, baseRef === "" ? void 0 : baseRef).then((result) => {
		      if (result.ok) {
		        onClose();
		        return;
		      }
		      setError(errorMessage(result.error, t));
		    }).finally(() => {
		      setPending(false);
		    });
		  };
		  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
		    import_dsh_client_ui_primitives4.Modal,
		    {
		      open: true,
		      onClose: requestClose,
		      title: t("worktree.dialog.title"),
		      description: t("worktree.dialog.description"),
		      closeLabel: t("worktree.dialog.cancel"),
		      footer: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.Button, { variant: "ghost", onClick: onClose, disabled: pending, children: t("worktree.dialog.cancel") }),
		        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
		          import_dsh_client_ui_primitives4.Button,
		          {
		            variant: "primary",
		            onClick: submit,
		            disabled: pending || name.trim() === "",
		            children: t("worktree.dialog.confirm")
		          }
		        )
		      ] }),
		      children: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: context_default.form, "data-gitgraph-worktree-dialog": true, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: context_default.field, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("label", { className: context_default.fieldLabel, htmlFor: "git-graph-worktree-name", children: t("worktree.dialog.nameLabel") }),
		          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
		            import_dsh_client_ui_primitives4.Input,
		            {
		              id: "git-graph-worktree-name",
		              className: context_default.fieldInput,
		              value: name,
		              onChange: (event) => {
		                setName(event.target.value);
		              },
		              placeholder: t("worktree.dialog.namePlaceholder"),
		              onKeyDown: (event) => {
		                if (event.key === "Enter") submit();
		              },
		              "data-modal-autofocus": true
		            }
		          )
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: context_default.field, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: context_default.fieldLabel, children: t("worktree.dialog.baseLabel") }),
		          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
		            import_dsh_client_ui_primitives4.Menu,
		            {
		              open: baseOpen,
		              anchor: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
		                import_dsh_client_ui_primitives4.Button,
		                {
		                  variant: "outline",
		                  size: "sm",
		                  onClick: () => {
		                    setBaseOpen((open) => !open);
		                  },
		                  disabled: pending,
		                  "aria-haspopup": "menu",
		                  "aria-expanded": baseOpen,
		                  children: [
		                    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: context_default.baseValue, children: baseLabel }),
		                    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.IconChevronDownOutlineRegular, { size: 12 })
		                  ]
		                }
		              ),
		              items: branches.map((branch) => ({ id: branch.name, label: branch.name })),
		              selectedId: baseRef === "" ? void 0 : baseRef,
		              onSelect: (id) => {
		                setBaseRef(id);
		                setBaseOpen(false);
		              },
		              onClose: () => {
		                setBaseOpen(false);
		              },
		              portal: true
		            }
		          )
		        ] }),
		        error !== null && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: context_default.formError, role: "alert", children: error })
		      ] })
		    }
		  );
		}

		// src/client/worktrees/WorktreeManager.tsx
		var import_react4 = require("react");
		var import_dsh_client_ui_primitives5 = require("@deepseek-ai/dsh-client-ui-primitives");
		var import_jsx_runtime5 = require("react/jsx-runtime");
		function WorktreeManager({ fetchWorktrees, onRemove, onClose, t }) {
		  const [view, setView] = (0, import_react4.useState)(null);
		  const [loading, setLoading] = (0, import_react4.useState)(true);
		  const [error, setError] = (0, import_react4.useState)(null);
		  const [forcePath, setForcePath] = (0, import_react4.useState)(null);
		  const [branchDelete, setBranchDelete] = (0, import_react4.useState)(/* @__PURE__ */ new Set());
		  const [pending, setPending] = (0, import_react4.useState)(null);
		  const busy = pending !== null;
		  const reload = (0, import_react4.useCallback)(() => {
		    let live = true;
		    setLoading(true);
		    void fetchWorktrees().then((fresh) => {
		      if (!live) return;
		      setView(fresh);
		      setLoading(false);
		    });
		    return () => {
		      live = false;
		    };
		  }, [fetchWorktrees]);
		  (0, import_react4.useEffect)(() => reload(), [reload]);
		  const requestClose = () => {
		    if (!busy) onClose();
		  };
		  const remove = (item, force) => {
		    if (busy) return;
		    setPending(item.path);
		    setError(null);
		    void onRemove(item.path, { force, deleteBranch: branchDelete.has(item.path) }).then((result) => {
		      if (result.ok) {
		        setForcePath(null);
		        reload();
		        return;
		      }
		      if (result.error.code === "worktree-dirty" && !force) {
		        setForcePath(item.path);
		        return;
		      }
		      setError(errorMessage(result.error, t));
		    }).finally(() => {
		      setPending(null);
		    });
		  };
		  const toggleBranchDelete = (path) => {
		    setBranchDelete((previous) => {
		      const next = new Set(previous);
		      if (next.has(path)) next.delete(path);
		      else next.add(path);
		      return next;
		    });
		  };
		  const rows = view?.worktrees ?? [];
		  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
		    import_dsh_client_ui_primitives5.Modal,
		    {
		      open: true,
		      onClose: requestClose,
		      title: t("worktree.manager.title"),
		      closeLabel: t("worktree.manager.close"),
		      className: context_default.managerDialog,
		      footer: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.Button, { variant: "ghost", onClick: onClose, disabled: busy, children: t("worktree.manager.close") }),
		      children: [
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: context_default.managerList, "data-gitgraph-worktree-manager": true, children: [
		          loading && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: context_default.graphEmpty, children: t("worktree.manager.loading") }),
		          !loading && rows.length <= 1 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: context_default.graphEmpty, children: t("worktree.manager.empty") }),
		          !loading && rows.map((item) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: context_default.managerRow, "data-main": item.main || void 0, children: [
		            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: context_default.managerInfo, children: [
		              /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: context_default.managerHeadline, children: [
		                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.IconBranchOutlineRegular, { size: 13 }),
		                item.branch === "" ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.Tag, { tone: "quiet", className: context_default.tagFixed, children: t("worktree.manager.detached") }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: context_default.managerBranch, children: item.branch }),
		                item.main && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.Tag, { tone: "neutral", className: context_default.tagFixed, children: t("worktree.manager.main") }),
		                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: context_default.managerOid, children: item.head.slice(0, 7) })
		              ] }),
		              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: context_default.managerPath, title: item.path, children: item.path }),
		              forcePath === item.path && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: context_default.managerConfirm, children: [
		                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: t("worktree.manager.forceConfirm") }),
		                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
		                  import_dsh_client_ui_primitives5.Button,
		                  {
		                    variant: "ghost",
		                    size: "sm",
		                    className: context_default.managerDanger,
		                    disabled: busy,
		                    onClick: () => {
		                      remove(item, true);
		                    },
		                    children: t("worktree.manager.forceYes")
		                  }
		                )
		              ] })
		            ] }),
		            !item.main && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: context_default.managerActions, children: [
		              item.branch.startsWith(WORKTREE_BRANCH_PREFIX) && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
		                import_dsh_client_ui_primitives5.Checkbox,
		                {
		                  checked: branchDelete.has(item.path),
		                  onChange: () => {
		                    toggleBranchDelete(item.path);
		                  },
		                  label: t("worktree.manager.deleteBranch"),
		                  disabled: busy
		                }
		              ),
		              /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: context_default.managerRowActions, children: [
		                pending === item.path && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.IconLoadingOutlineRegular, { className: context_default.spinner, size: 14 }),
		                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
		                  import_dsh_client_ui_primitives5.Button,
		                  {
		                    variant: "ghost",
		                    size: "sm",
		                    disabled: busy,
		                    onClick: () => {
		                      remove(item, false);
		                    },
		                    children: t("worktree.manager.remove")
		                  }
		                )
		              ] })
		            ] })
		          ] }, item.path))
		        ] }),
		        error !== null && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: context_default.formError, role: "alert", children: error })
		      ]
		    }
		  );
		}

		// src/client/graph/GraphDialog.tsx
		var import_react5 = require("react");
		var import_dsh_client_ui_primitives6 = require("@deepseek-ai/dsh-client-ui-primitives");

		// src/core/types.ts
		function computeLanes(rows) {
		  const later = /* @__PURE__ */ new Set();
		  for (const row of rows) {
		    for (const parent of row.parents) later.add(parent);
		  }
		  const lanes = [];
		  const result = [];
		  for (const row of rows) {
		    let nodeColumn = lanes.findIndex((pending) => pending === row.oid);
		    if (nodeColumn === -1) {
		      lanes.push(row.oid);
		      nodeColumn = lanes.length - 1;
		    }
		    const columns = [];
		    for (let i = 0; i < lanes.length; i += 1) {
		      const pending = lanes[i];
		      if (pending === null) columns.push("gap");
		      else if (i === nodeColumn) columns.push(row.parents.length > 1 ? "merge" : "node");
		      else if (pending === row.oid) columns.push("gap");
		      else if (typeof pending === "string" && later.has(pending)) columns.push("pass");
		      else columns.push("gap");
		    }
		    const parents = row.parents.filter((parent) => later.has(parent));
		    const [first, ...rest] = parents;
		    for (let i = 0; i < lanes.length; i += 1) {
		      if (lanes[i] === row.oid && i !== nodeColumn) lanes[i] = null;
		    }
		    lanes[nodeColumn] = first ?? null;
		    for (const parent of rest) {
		      if (!lanes.includes(parent)) lanes.push(parent);
		    }
		    while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop();
		    result.push({ columns, nodeColumn, merge: row.parents.length > 1 });
		  }
		  return result;
		}

		// src/client/graph/GraphDialog.tsx
		var import_jsx_runtime6 = require("react/jsx-runtime");
		var INITIAL_LIMIT = 200;
		var PAGE_STEP = 100;
		function glyphChar(glyph) {
		  switch (glyph) {
		    case "node":
		      return "\u25CF";
		    case "merge":
		      return "\u25C6";
		    case "pass":
		      return "\u2502";
		    case "gap":
		      return " ";
		  }
		}
		var MINUTE = 60;
		var HOUR = 60 * MINUTE;
		var DAY = 24 * HOUR;
		function formatTime(epochSeconds, t) {
		  const elapsed = Math.max(0, Math.floor(Date.now() / 1e3) - epochSeconds);
		  if (elapsed < MINUTE) return t("graph.time.justNow");
		  if (elapsed < HOUR) return t("graph.time.minutesAgo", { count: Math.floor(elapsed / MINUTE) });
		  if (elapsed < DAY) return t("graph.time.hoursAgo", { count: Math.floor(elapsed / HOUR) });
		  if (elapsed < 30 * DAY) return t("graph.time.daysAgo", { count: Math.floor(elapsed / DAY) });
		  const date = new Date(epochSeconds * 1e3);
		  const pad = (n) => String(n).padStart(2, "0");
		  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
		}
		function GraphDialog({ graph, onClose, t }) {
		  const [view, setView] = (0, import_react5.useState)(null);
		  const [error, setError] = (0, import_react5.useState)(null);
		  const [loading, setLoading] = (0, import_react5.useState)(true);
		  const requestSeq = (0, import_react5.useRef)(0);
		  const load = (0, import_react5.useCallback)((limit) => {
		    const seq = requestSeq.current + 1;
		    requestSeq.current = seq;
		    setLoading(true);
		    void graph(limit).then((next) => {
		      if (seq !== requestSeq.current) return;
		      setView(next);
		      setError(next === null ? t("error.internal") : null);
		    }).catch(() => {
		      if (seq !== requestSeq.current) return;
		      setError(t("error.internal"));
		    }).finally(() => {
		      if (seq === requestSeq.current) setLoading(false);
		    });
		  }, [graph, t]);
		  const loadRef = (0, import_react5.useRef)(load);
		  loadRef.current = load;
		  (0, import_react5.useEffect)(() => {
		    loadRef.current(INITIAL_LIMIT);
		  }, []);
		  const lanes = (0, import_react5.useMemo)(() => {
		    if (view === null) return [];
		    return computeLanes(view.commits);
		  }, [view]);
		  const laneCount = (0, import_react5.useMemo)(() => {
		    let count = 0;
		    for (const row of lanes) count = Math.max(count, row.columns.length);
		    return count;
		  }, [lanes]);
		  const loaded = view === null ? 0 : view.commits.length;
		  return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
		    import_dsh_client_ui_primitives6.Modal,
		    {
		      open: true,
		      onClose,
		      title: t("graph.title"),
		      description: t("graph.subtitle", { count: loaded, lanes: laneCount }),
		      closeLabel: t("graph.close"),
		      className: context_default.graphDialog,
		      footer: view !== null && view.hasMore ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
		        import_dsh_client_ui_primitives6.Button,
		        {
		          variant: "outline",
		          onClick: () => {
		            load(loaded + PAGE_STEP);
		          },
		          disabled: loading,
		          icon: loading ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives6.IconLoadingOutlineRegular, { className: context_default.spinner, size: 14 }) : void 0,
		          children: t("graph.loadMore")
		        }
		      ) : void 0,
		      children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: context_default.graphBody, "data-gitgraph-dialog": true, "data-dsh-plugin": "git-graph", "data-dsh-part": "dialog", children: loading && view === null ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: context_default.graphEmpty, children: t("graph.loading") }) : error !== null ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: context_default.graphEmpty, children: error }) : view === null || view.commits.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: context_default.graphEmpty, children: t("graph.empty") }) : view.commits.map((commit, index) => {
		        const row = lanes[index];
		        if (row === void 0) return null;
		        return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: context_default.graphRow, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: context_default.graphLanes, "aria-hidden": "true", "data-gitgraph-lanes": true, children: row.columns.map((glyph, column) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
		            "span",
		            {
		              "data-gitgraph-glyph": glyph,
		              className: cx(
		                context_default.graphLaneCell,
		                glyph === "node" && context_default.graphLaneNode,
		                glyph === "merge" && context_default.graphLaneMerge,
		                glyph === "pass" && context_default.graphLanePass
		              ),
		              children: glyphChar(glyph)
		            },
		            column
		          )) }),
		          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: context_default.graphOid, title: commit.oid, children: commit.oid.slice(0, 7) }),
		          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { className: context_default.graphMain, children: [
		            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: context_default.graphSubject, title: commit.subject, children: commit.subject }),
		            /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { className: context_default.graphMeta, children: [
		              commit.refs.map((ref) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
		                "span",
		                {
		                  title: ref,
		                  className: context_default.graphRefSlot,
		                  "data-gitgraph-ref": true,
		                  "data-gitgraph-ref-current": ref === view.branch || void 0,
		                  children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives6.Tag, { tone: ref === view.branch ? "info" : "outline", className: context_default.graphRefTag, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: context_default.graphRefText, children: ref }) })
		                },
		                ref
		              )),
		              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: commit.author }),
		              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: context_default.graphMetaSep, children: "\xB7" }),
		              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: formatTime(commit.authorTime, t) })
		            ] })
		          ] })
		        ] }, commit.oid);
		      }) })
		    }
		  );
		}

		// src/client/repos/GroupCreateDialog.tsx
		var import_react6 = require("react");
		var import_dsh_client_ui_primitives7 = require("@deepseek-ai/dsh-client-ui-primitives");

		// src/client/repos/repos.module.css
		var cssText2 = "/* Multi-repository dialogs: the group-switch candidate list, the group-create\n   dialog, and the group-operation result panel. Layout only \u2014 the modal chrome,\n   controls, pills, tags, and material come from the host primitives and carry\n   their own styling. Tokens by default; the stock-light fallback in\n   chips/context.ggm_module_92b7ba.ggm_css_92b7ba scopes its variable overrides to the chip anchor\n   these dialogs are opened from. */\n\n/* ------------------------------------------------------------------------ *\n * Group-switch candidates (host pills with their coverage suffix)\n * ------------------------------------------------------------------------ */\n\n/* Tiled candidates: wrap, and scroll instead of growing the dialog. */\n.ggm_pillWrap_92b7ba {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 4px;\n  max-height: 168px;\n  overflow-y: auto;\n  scrollbar-width: thin;\n  scrollbar-color: var(--dsw-alias-scrollbar-bg-l2) transparent;\n}\n\n.ggm_pillWrap_92b7ba::-webkit-scrollbar {\n  width: 6px;\n}\n\n.ggm_pillWrap_92b7ba::-webkit-scrollbar-thumb {\n  background: var(--dsw-alias-scrollbar-bg-l2);\n  border-radius: 3px;\n}\n\n.ggm_pillWrap_92b7ba::-webkit-scrollbar-track {\n  background: transparent;\n}\n\n/* Tooltip anchor around one pill; inline-flex keeps the wrap layout intact.\n   (The host pill is not a ref-forwarding component, so the tooltip anchors\n   this slot span instead of the pill itself.) */\n.ggm_pillSlot_92b7ba {\n  display: inline-flex;\n  max-width: 100%;\n}\n\n/* The pill stays on one line: a long branch name truncates, its ratio does not. */\n.ggm_pill_92b7ba {\n  max-width: 100%;\n}\n\n.ggm_pillName_92b7ba {\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.ggm_pillRatio_92b7ba {\n  flex: none;\n  color: var(--dsw-alias-label-tertiary);\n  font-variant-numeric: tabular-nums;\n}\n\n/* ------------------------------------------------------------------------ *\n * Host modal bodies (group-switch dialog, group-create dialog, result panel)\n * ------------------------------------------------------------------------ */\n\n/* The host modal owns the card (width, material, chrome); the plugin only\n   widens it and caps its growth. Doubled class: the host card's own width rule\n   has the same single-class specificity, so the plugin must outrank it rather\n   than depend on stylesheet order. */\n.ggm_groupDialog_92b7ba.ggm_groupDialog_92b7ba {\n  width: min(520px, 100%);\n  max-height: 100%;\n}\n\n.ggm_groupDialogBody_92b7ba {\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n}\n\n.ggm_field_92b7ba {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n}\n\n.ggm_fieldLabel_92b7ba {\n  color: var(--dsw-alias-label-secondary);\n  font-size: 12px;\n}\n\n/* The host segmented control keeps its intrinsic width instead of stretching. */\n.ggm_baseControl_92b7ba {\n  align-self: flex-start;\n}\n\n.ggm_formError_92b7ba {\n  color: var(--dsw-alias-state-error-primary);\n  font-size: 13px;\n  line-height: 20px;\n}\n\n.ggm_hint_92b7ba {\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 11px;\n}\n\n/* Repository check list (group create). */\n\n.ggm_checkList_92b7ba {\n  max-height: 180px;\n  overflow-y: auto;\n  border: 1px solid var(--dsw-alias-border-l1);\n  border-radius: 8px;\n  padding: 4px;\n}\n\n.ggm_checkRow_92b7ba {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  padding: 5px 6px;\n  border-radius: 6px;\n}\n\n/* The host checkbox label takes the row width; its own text span truncates. */\n.ggm_checkLabel_92b7ba {\n  flex: 1;\n  min-width: 0;\n}\n\n.ggm_checkLabel_92b7ba > span {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.ggm_repoTag_92b7ba {\n  flex: none;\n}\n\n/* ------------------------------------------------------------------------ *\n * Group result rows\n * ------------------------------------------------------------------------ */\n\n.ggm_resultBody_92b7ba {\n  display: flex;\n  flex-direction: column;\n  min-width: 0;\n}\n\n/* The result list scrolls on its own so the modal header and footer stay put. */\n.ggm_resultList_92b7ba {\n  max-height: min(46vh, 420px);\n  overflow-y: auto;\n  border: 1px solid var(--dsw-alias-border-l1);\n  border-radius: 10px;\n  padding: 4px;\n}\n\n.ggm_resultRow_92b7ba {\n  display: flex;\n  align-items: flex-start;\n  justify-content: space-between;\n  gap: 10px;\n  padding: 8px;\n  border-radius: 8px;\n}\n\n.ggm_resultRow_92b7ba:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.ggm_resultInfo_92b7ba {\n  flex: 1;\n  min-width: 0;\n  display: flex;\n  flex-direction: column;\n  gap: 3px;\n}\n\n.ggm_resultHeadline_92b7ba {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  min-width: 0;\n}\n\n.ggm_resultName_92b7ba {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  color: var(--dsw-alias-label-primary);\n  font-size: 13px;\n  font-weight: 500;\n}\n\n.ggm_outcomeBadge_92b7ba {\n  display: inline-flex;\n  flex: none;\n}\n\n.ggm_resultError_92b7ba {\n  color: var(--dsw-alias-state-error-primary);\n  font-size: 12px;\n  line-height: 1.5;\n}\n\n.ggm_resultHint_92b7ba {\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 11px;\n}\n";
		if (typeof document !== "undefined" && document.querySelector('style[data-dsh-plugin="dsh-plugin-git-graph-multi"]') === null) {
		  const style = document.createElement("style");
		  style.setAttribute("data-dsh-plugin", "dsh-plugin-git-graph-multi");
		  style.textContent = cssText2;
		  document.head.appendChild(style);
		}
		var repos_default = { "module": "ggm_module_92b7ba", "css": "ggm_css_92b7ba", "pillWrap": "ggm_pillWrap_92b7ba", "pillSlot": "ggm_pillSlot_92b7ba", "pill": "ggm_pill_92b7ba", "pillName": "ggm_pillName_92b7ba", "pillRatio": "ggm_pillRatio_92b7ba", "groupDialog": "ggm_groupDialog_92b7ba", "groupDialogBody": "ggm_groupDialogBody_92b7ba", "field": "ggm_field_92b7ba", "fieldLabel": "ggm_fieldLabel_92b7ba", "baseControl": "ggm_baseControl_92b7ba", "formError": "ggm_formError_92b7ba", "hint": "ggm_hint_92b7ba", "checkList": "ggm_checkList_92b7ba", "checkRow": "ggm_checkRow_92b7ba", "checkLabel": "ggm_checkLabel_92b7ba", "repoTag": "ggm_repoTag_92b7ba", "resultBody": "ggm_resultBody_92b7ba", "resultList": "ggm_resultList_92b7ba", "resultRow": "ggm_resultRow_92b7ba", "resultInfo": "ggm_resultInfo_92b7ba", "resultHeadline": "ggm_resultHeadline_92b7ba", "resultName": "ggm_resultName_92b7ba", "outcomeBadge": "ggm_outcomeBadge_92b7ba", "resultError": "ggm_resultError_92b7ba", "resultHint": "ggm_resultHint_92b7ba" };

		// src/client/repos/GroupCreateDialog.tsx
		var import_jsx_runtime7 = require("react/jsx-runtime");
		var BASE_CONTROL_ID = "gitgraph-group-base";
		function GroupCreateDialog({ repos, initialSelection, busy, error, onSubmit, onClose, t }) {
		  const [selected, setSelected] = (0, import_react6.useState)(initialSelection);
		  const [name, setName] = (0, import_react6.useState)("");
		  const [base, setBase] = (0, import_react6.useState)("mainline");
		  const toggle = (path) => {
		    setSelected((prev) => prev.includes(path) ? prev.filter((item) => item !== path) : [...prev, path]);
		  };
		  const requestClose = () => {
		    if (!busy) onClose();
		  };
		  const baseOptions = [
		    { value: "mainline", label: t("group.base.mainline") },
		    { value: "head", label: t("group.base.head") }
		  ];
		  const trimmed = name.trim();
		  const canSubmit = !busy && trimmed !== "" && selected.length > 0;
		  return /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
		    import_dsh_client_ui_primitives7.Modal,
		    {
		      open: true,
		      onClose: requestClose,
		      title: t("group.create.title"),
		      description: t("group.create.description"),
		      closeLabel: t("group.close"),
		      className: repos_default.groupDialog,
		      footer: /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_dsh_client_ui_primitives7.Button, { variant: "outline", onClick: onClose, disabled: busy, children: t("group.create.cancel") }),
		        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
		          import_dsh_client_ui_primitives7.Button,
		          {
		            variant: "primary",
		            onClick: () => {
		              if (canSubmit) onSubmit(selected, trimmed, base);
		            },
		            disabled: !canSubmit,
		            "data-gitgraph-group-submit": true,
		            children: t("group.create.confirm")
		          }
		        )
		      ] }),
		      children: /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
		        "div",
		        {
		          className: repos_default.groupDialogBody,
		          "aria-busy": busy || void 0,
		          "data-gitgraph-group-dialog": true,
		          "data-dsh-plugin": "git-graph",
		          "data-dsh-part": "group-create",
		          children: [
		            /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: repos_default.field, children: [
		              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: repos_default.fieldLabel, children: t("group.create.reposLabel") }),
		              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: repos_default.checkList, children: repos.map((repo) => (
		                // The host checkbox does not forward DOM props, so both row hooks
		                // ride the wrapper the checkbox is rendered in.
		                /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
		                  "div",
		                  {
		                    className: repos_default.checkRow,
		                    title: repo.path,
		                    "data-gitgraph-group-repo": repo.path,
		                    "data-gitgraph-group-check": true,
		                    children: [
		                      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
		                        import_dsh_client_ui_primitives7.Checkbox,
		                        {
		                          checked: selected.includes(repo.path),
		                          onChange: () => {
		                            toggle(repo.path);
		                          },
		                          label: repo.name,
		                          disabled: busy,
		                          className: repos_default.checkLabel
		                        }
		                      ),
		                      repo.primary && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_dsh_client_ui_primitives7.Tag, { tone: "neutral", className: repos_default.repoTag, children: t("repos.primaryBadge") })
		                    ]
		                  },
		                  repo.path
		                )
		              )) }),
		              selected.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: repos_default.hint, children: t("group.create.noSelection") })
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: repos_default.field, children: [
		              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: repos_default.fieldLabel, children: t("group.create.nameLabel") }),
		              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
		                import_dsh_client_ui_primitives7.Input,
		                {
		                  value: name,
		                  onChange: (event) => {
		                    setName(event.target.value);
		                  },
		                  placeholder: t("group.create.namePlaceholder"),
		                  "aria-label": t("group.create.nameLabel"),
		                  disabled: busy,
		                  "data-modal-autofocus": true,
		                  "data-gitgraph-group-name": true
		                }
		              )
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: repos_default.field, "data-gitgraph-group-base": true, children: [
		              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: repos_default.fieldLabel, children: t("group.create.baseLabel") }),
		              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
		                import_dsh_client_ui_primitives7.SegmentedControl,
		                {
		                  id: BASE_CONTROL_ID,
		                  value: base,
		                  options: baseOptions,
		                  onChange: (next) => {
		                    setBase(next);
		                  },
		                  label: t("group.create.baseLabel"),
		                  disabled: busy,
		                  className: repos_default.baseControl
		                }
		              )
		            ] }),
		            error !== null && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: repos_default.formError, role: "alert", "data-gitgraph-group-error": true, children: error })
		          ]
		        }
		      )
		    }
		  );
		}

		// src/client/repos/GroupSwitchDialog.tsx
		var import_react7 = require("react");
		var import_dsh_client_ui_primitives8 = require("@deepseek-ai/dsh-client-ui-primitives");
		var import_jsx_runtime8 = require("react/jsx-runtime");
		var TOOLTIP_NAME_THRESHOLD2 = 18;
		var TOOLTIP_DELAY_MS2 = 400;
		var TOOLTIP_MAX_WIDTH2 = 320;
		function GroupSwitchDialog({ branches, total, busy, error, onSubmit, onClose, t }) {
		  const [branch, setBranch] = (0, import_react7.useState)("");
		  const entries = branches ?? [];
		  (0, import_react7.useEffect)(() => {
		    if (branch !== "" && !entries.some((entry) => entry.name === branch)) setBranch("");
		  }, [entries, branch]);
		  const requestClose = () => {
		    if (!busy) onClose();
		  };
		  const canSubmit = !busy && branch !== "" && entries.length > 0;
		  return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
		    import_dsh_client_ui_primitives8.Modal,
		    {
		      open: true,
		      onClose: requestClose,
		      title: t("group.switch.title"),
		      description: t("group.switch.description"),
		      closeLabel: t("group.close"),
		      className: repos_default.groupDialog,
		      footer: /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(import_jsx_runtime8.Fragment, { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_dsh_client_ui_primitives8.Button, { variant: "outline", onClick: onClose, disabled: busy, children: t("group.switch.cancel") }),
		        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
		          import_dsh_client_ui_primitives8.Button,
		          {
		            variant: "primary",
		            onClick: () => {
		              if (canSubmit) onSubmit(branch);
		            },
		            disabled: !canSubmit,
		            "data-gitgraph-group-switch": true,
		            children: t("group.switch.confirm")
		          }
		        )
		      ] }),
		      children: /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(
		        "div",
		        {
		          className: repos_default.groupDialogBody,
		          "aria-busy": busy || void 0,
		          "data-gitgraph-group-switch-dialog": true,
		          "data-dsh-plugin": "git-graph",
		          "data-dsh-part": "group-switch",
		          children: [
		            /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: repos_default.field, children: [
		              /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: repos_default.fieldLabel, children: t("group.switch.branchLabel") }),
		              branches === null ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: repos_default.hint, "data-gitgraph-group-notice": true, children: t("group.switch.loading") }) : entries.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: repos_default.hint, "data-gitgraph-group-notice": true, children: t("repos.noUnion") }) : /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: repos_default.pillWrap, role: "group", "aria-label": t("group.switch.branchLabel"), children: entries.map((entry) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
		                import_dsh_client_ui_primitives8.Tooltip,
		                {
		                  label: entry.name,
		                  portal: true,
		                  delayMs: TOOLTIP_DELAY_MS2,
		                  maxWidth: TOOLTIP_MAX_WIDTH2,
		                  disabled: entry.name.length <= TOOLTIP_NAME_THRESHOLD2,
		                  children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: repos_default.pillSlot, children: /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(
		                    import_dsh_client_ui_primitives8.Pill,
		                    {
		                      className: repos_default.pill,
		                      active: entry.name === branch,
		                      "aria-pressed": entry.name === branch,
		                      "aria-label": `${entry.name} \xB7 ${t("repos.branchCoverage", { count: entry.count, total })}`,
		                      disabled: busy,
		                      onClick: () => {
		                        setBranch(entry.name);
		                      },
		                      children: [
		                        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: repos_default.pillName, children: entry.name }),
		                        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: repos_default.pillRatio, children: `\xB7 ${entry.count}/${total}` })
		                      ]
		                    }
		                  ) })
		                },
		                entry.name
		              )) })
		            ] }),
		            error !== null && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: repos_default.formError, role: "alert", "data-gitgraph-group-error": true, children: error })
		          ]
		        }
		      )
		    }
		  );
		}

		// src/client/repos/GroupResultPanel.tsx
		var import_react8 = require("react");
		var import_dsh_client_ui_primitives9 = require("@deepseek-ai/dsh-client-ui-primitives");
		var import_jsx_runtime9 = require("react/jsx-runtime");
		function outcomeLabelKey(outcome) {
		  switch (outcome) {
		    case "ok":
		      return "group.outcome.ok";
		    case "skipped":
		      return "group.outcome.skipped";
		    case "failed":
		      return "group.outcome.failed";
		    case "not-run":
		      return "group.outcome.notRun";
		  }
		}
		function outcomeTone(outcome) {
		  switch (outcome) {
		    case "ok":
		      return "success";
		    case "skipped":
		      return "neutral";
		    case "failed":
		      return "danger";
		    case "not-run":
		      return "warning";
		  }
		}
		function GroupResultPanel({ result, busy, onRetry, onClose, t }) {
		  const counts = (0, import_react8.useMemo)(() => {
		    let ok = 0;
		    let skipped = 0;
		    let failed = 0;
		    let notRun = 0;
		    for (const row of result.results) {
		      if (row.outcome === "ok") ok += 1;
		      else if (row.outcome === "skipped") skipped += 1;
		      else if (row.outcome === "failed") failed += 1;
		      else notRun += 1;
		    }
		    return { ok, skipped, failed, notRun };
		  }, [result]);
		  const requestClose = () => {
		    if (!busy) onClose();
		  };
		  const title = result.action === "switch" ? t("group.result.switchTitle", { branch: result.branch }) : t("group.result.createTitle", { branch: result.branch });
		  return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
		    import_dsh_client_ui_primitives9.Modal,
		    {
		      open: true,
		      onClose: requestClose,
		      title,
		      description: t("group.result.summary", counts),
		      closeLabel: t("group.close"),
		      className: repos_default.groupDialog,
		      footer: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(import_dsh_client_ui_primitives9.Button, { variant: "outline", onClick: onClose, disabled: busy, children: t("group.close") }),
		      children: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
		        "div",
		        {
		          className: repos_default.resultBody,
		          "aria-busy": busy || void 0,
		          "data-gitgraph-group-result": true,
		          "data-gitgraph-group-action": result.action,
		          "data-dsh-plugin": "git-graph",
		          "data-dsh-part": "group-result",
		          children: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: repos_default.resultList, children: result.results.map((row) => /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
		            "div",
		            {
		              className: repos_default.resultRow,
		              title: row.repo.path,
		              "data-gitgraph-group-result-row": true,
		              "data-gitgraph-outcome": row.outcome,
		              "data-gitgraph-repo-path": row.repo.path,
		              children: [
		                /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: repos_default.resultInfo, children: [
		                  /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: repos_default.resultHeadline, children: [
		                    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: repos_default.resultName, children: row.repo.name }),
		                    row.repo.primary && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(import_dsh_client_ui_primitives9.Tag, { tone: "neutral", className: repos_default.repoTag, children: t("repos.primaryBadge") }),
		                    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: repos_default.outcomeBadge, "data-gitgraph-outcome-badge": true, children: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(import_dsh_client_ui_primitives9.Tag, { tone: outcomeTone(row.outcome), children: t(outcomeLabelKey(row.outcome)) }) })
		                  ] }),
		                  row.error !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: repos_default.resultError, "data-gitgraph-outcome-error": true, children: errorMessage(row.error, t) }),
		                  row.outcome === "not-run" && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: repos_default.resultHint, children: t("group.outcome.notRunHint") })
		                ] }),
		                row.outcome === "failed" && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
		                  import_dsh_client_ui_primitives9.Button,
		                  {
		                    variant: "outline",
		                    size: "sm",
		                    icon: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(import_dsh_client_ui_primitives9.IconRefreshOutlineRegular, { size: 16 }),
		                    onClick: () => {
		                      onRetry(row.repo.path);
		                    },
		                    disabled: busy,
		                    "data-gitgraph-group-retry": true,
		                    children: t("group.retry")
		                  }
		                )
		              ]
		            },
		            row.repo.path
		          )) })
		        }
		      )
		    }
		  );
		}

		// src/client/chips/BranchChip.tsx
		var import_jsx_runtime10 = require("react/jsx-runtime");
		var FOCUS_REFRESH_MIN_MS = 5e3;
		var SKIN_CENTER_BODY_ATTR = "data-dsh-skin-center";
		var DARK_THEME_BODY_ATTR = "data-ds-dark-theme";
		var DSH_BODY_ATTR_PREFIX = "data-dsh-";
		function hasAppliedSkinBodyAttr(name) {
		  return name.startsWith(DSH_BODY_ATTR_PREFIX) && name !== SKIN_CENTER_BODY_ATTR;
		}
		function readStockLightTheme() {
		  if (typeof document === "undefined") return false;
		  const body = document.body;
		  if (!body.hasAttribute(SKIN_CENTER_BODY_ATTR) || body.hasAttribute(DARK_THEME_BODY_ATTR)) return false;
		  return !body.getAttributeNames().some(hasAppliedSkinBodyAttr);
		}
		function useStockLightTheme() {
		  const [stockLightTheme, setStockLightTheme] = (0, import_react9.useState)(readStockLightTheme);
		  (0, import_react9.useEffect)(() => {
		    const update = () => {
		      setStockLightTheme(readStockLightTheme());
		    };
		    update();
		    if (typeof document === "undefined" || typeof MutationObserver !== "function") return void 0;
		    const observer = new MutationObserver(update);
		    observer.observe(document.body, { attributes: true });
		    return () => {
		      observer.disconnect();
		    };
		  }, []);
		  return stockLightTheme;
		}
		function BranchChip(props) {
		  const sessionId = props.sessionId;
		  const blankSession = props.useSessions((state) => {
		    if (sessionId === void 0) return false;
		    const sessions = state;
		    return sessions.byId?.[sessionId]?.blank === true;
		  });
		  const dockSeat = "session" in props && "input" in props;
		  const sessionSnapshot = dockSeat ? props.session : void 0;
		  const heroSeat = sessionSnapshot?.blank === true && (sessionSnapshot.openState === "open" || blankSession === true);
		  const showBranchSelector = dockSeat ? heroSeat : blankSession;
		  const stockLightTheme = useStockLightTheme();
		  const [reposView, setReposView] = (0, import_react9.useState)(void 0);
		  const [fallbackRepo, setFallbackRepo] = (0, import_react9.useState)(void 0);
		  const [openPath, setOpenPath] = (0, import_react9.useState)(null);
		  const [branches, setBranches] = (0, import_react9.useState)(null);
		  const [dialogPath, setDialogPath] = (0, import_react9.useState)(void 0);
		  const [createOpen, setCreateOpen] = (0, import_react9.useState)(false);
		  const [graphOpen, setGraphOpen] = (0, import_react9.useState)(false);
		  const [worktreeCreateOpen, setWorktreeCreateOpen] = (0, import_react9.useState)(false);
		  const [worktreeManageOpen, setWorktreeManageOpen] = (0, import_react9.useState)(false);
		  const [groupSwitchOpen, setGroupSwitchOpen] = (0, import_react9.useState)(false);
		  const [groupCreateOpen, setGroupCreateOpen] = (0, import_react9.useState)(false);
		  const [groupUnion, setGroupUnion] = (0, import_react9.useState)(null);
		  const [groupBusy, setGroupBusy] = (0, import_react9.useState)(false);
		  const [groupResult, setGroupResult] = (0, import_react9.useState)(null);
		  const [groupError, setGroupError] = (0, import_react9.useState)(null);
		  const [refreshToken, setRefreshToken] = (0, import_react9.useState)(0);
		  const [toast, setToast] = (0, import_react9.useState)(null);
		  const toastSeq = (0, import_react9.useRef)(0);
		  const lastGroupRef = (0, import_react9.useRef)(null);
		  const repoRows = reposView === void 0 || reposView === null ? [] : reposView.repos;
		  const chips = planChips(reposView, fallbackRepo);
		  const multi = chips.length > 1;
		  const groupOwner = multi ? chips.find((entry) => entry.primary) ?? chips[0] : void 0;
		  const watchPaths = (0, import_react9.useMemo)(
		    () => reposView === null || reposView === void 0 ? void 0 : reposView.repos.map((row) => row.repo.path),
		    [reposView]
		  );
		  const watchKey = watchPaths === void 0 ? "" : watchPaths.join("\n");
		  const watchPathsRef = (0, import_react9.useRef)(void 0);
		  watchPathsRef.current = watchPaths;
		  const refreshAll = (0, import_react9.useCallback)(() => {
		    setRefreshToken((token) => token + 1);
		  }, []);
		  (0, import_react9.useEffect)(() => {
		    if (!showBranchSelector) return void 0;
		    let live = true;
		    props.repos(sessionId).then((view) => {
		      if (live) setReposView(view);
		    }).catch(() => {
		      if (live) setReposView(null);
		    });
		    return () => {
		      live = false;
		    };
		  }, [showBranchSelector, props.repos, sessionId, refreshToken]);
		  (0, import_react9.useEffect)(() => {
		    if (!showBranchSelector || reposView !== null) return void 0;
		    let live = true;
		    setFallbackRepo(void 0);
		    props.repoStatus(sessionId).then((status) => {
		      if (live) setFallbackRepo(status);
		    }).catch(() => {
		      if (live) setFallbackRepo(null);
		    });
		    return () => {
		      live = false;
		    };
		  }, [showBranchSelector, reposView, props.repoStatus, sessionId, refreshToken]);
		  const lastFocusRefetch = (0, import_react9.useRef)(0);
		  (0, import_react9.useEffect)(() => {
		    if (!showBranchSelector) return void 0;
		    const unsubscribe = props.subscribeChanges(sessionId, refreshAll, watchPathsRef.current);
		    const onFocus = () => {
		      const now = Date.now();
		      if (now - lastFocusRefetch.current < FOCUS_REFRESH_MIN_MS) return;
		      lastFocusRefetch.current = now;
		      refreshAll();
		    };
		    window.addEventListener("focus", onFocus);
		    return () => {
		      unsubscribe();
		      window.removeEventListener("focus", onFocus);
		    };
		  }, [showBranchSelector, props.subscribeChanges, sessionId, watchKey, refreshAll]);
		  (0, import_react9.useEffect)(() => {
		    if (!showBranchSelector || openPath === null) return void 0;
		    const key = openPath;
		    let live = true;
		    setBranches(null);
		    props.branches(sessionId, key === "" ? void 0 : key).then((view) => {
		      if (live) setBranches({ key, view });
		    }).catch(() => {
		      if (live) setBranches({ key, view: null });
		    });
		    return () => {
		      live = false;
		    };
		  }, [showBranchSelector, openPath, props.branches, sessionId, refreshToken]);
		  if (!showBranchSelector || chips.length === 0) return null;
		  const copy = { detached: props.t("branch.detached"), unavailable: props.t("repos.unavailable") };
		  const openKey = openPath ?? "";
		  const panelBranches = branches !== null && branches.key === openKey ? branches.view : null;
		  const dialogBranches = branches !== null && branches.key === (dialogPath ?? "") ? branches.view : null;
		  const toggleChip = (entry) => {
		    const key = entry.path ?? "";
		    setOpenPath((prev) => prev === key ? null : key);
		  };
		  const closePopover = () => {
		    setOpenPath(null);
		  };
		  const reportSwitched = (branch) => {
		    refreshAll();
		    toastSeq.current += 1;
		    setToast({ seq: toastSeq.current, text: props.t("toast.switchSuccess", { branchName: branch }) });
		  };
		  const openRepoDialog = (path, dialog) => {
		    setDialogPath(path);
		    setOpenPath(null);
		    if (dialog === "create") setCreateOpen(true);
		    if (dialog === "graph") setGraphOpen(true);
		    if (dialog === "worktree-create") setWorktreeCreateOpen(true);
		    if (dialog === "worktree-manage") setWorktreeManageOpen(true);
		  };
		  const openGroupSwitch = () => {
		    setDialogPath(void 0);
		    setOpenPath(null);
		    setGroupError(null);
		    setGroupUnion(null);
		    setGroupSwitchOpen(true);
		    void Promise.all(repoRows.map((row) => props.branches(sessionId, row.repo.path))).then((views) => {
		      setGroupUnion(unionBranches(views));
		    }).catch(() => {
		      setGroupUnion([]);
		    });
		  };
		  const openGroupCreate = () => {
		    setDialogPath(void 0);
		    setOpenPath(null);
		    setGroupError(null);
		    setGroupCreateOpen(true);
		  };
		  const submitGroupSwitch = (branch) => {
		    setGroupBusy(true);
		    setGroupError(null);
		    void props.groupSwitch(sessionId, branch).then((result) => {
		      if (result === null) {
		        setGroupError(props.t("repos.groupFailed"));
		        return;
		      }
		      lastGroupRef.current = { action: "switch", branch, base: "mainline" };
		      setGroupSwitchOpen(false);
		      setGroupResult(result);
		      refreshAll();
		    }).catch(() => {
		      setGroupError(props.t("repos.groupFailed"));
		    }).finally(() => {
		      setGroupBusy(false);
		    });
		  };
		  const submitGroupCreate = (paths, name, base) => {
		    setGroupBusy(true);
		    setGroupError(null);
		    void props.groupCreate(sessionId, paths, name, base).then((result) => {
		      if (result === null) {
		        setGroupError(props.t("repos.groupFailed"));
		        return;
		      }
		      lastGroupRef.current = { action: "create", branch: name, base };
		      setGroupCreateOpen(false);
		      setGroupResult(result);
		      refreshAll();
		    }).catch(() => {
		      setGroupError(props.t("repos.groupFailed"));
		    }).finally(() => {
		      setGroupBusy(false);
		    });
		  };
		  const retryRepo = (repoPath) => {
		    const last = lastGroupRef.current;
		    const rows = groupResult === null ? [] : groupResult.results;
		    const existing = rows.find((row) => row.repo.path === repoPath);
		    if (last === null || existing === void 0) return;
		    const target = existing.repo;
		    setGroupBusy(true);
		    const settle = (row) => {
		      setGroupResult((prev) => prev === null ? prev : { ...prev, results: prev.results.map((item) => item.repo.path === row.repo.path ? row : item) });
		    };
		    const fail = () => {
		      settle({ repo: target, outcome: "failed", error: { code: "internal", message: props.t("repos.groupFailed") } });
		    };
		    if (last.action === "switch") {
		      void props.switchBranch(sessionId, last.branch, repoPath).then((result) => {
		        if (result.ok) {
		          settle({ repo: target, outcome: "ok" });
		          refreshAll();
		          return;
		        }
		        settle({ repo: target, outcome: "failed", error: result.error });
		      }).catch(fail).finally(() => {
		        setGroupBusy(false);
		      });
		      return;
		    }
		    void props.groupCreate(sessionId, [repoPath], last.branch, last.base).then((result) => {
		      const row = result === null ? void 0 : result.results.find((item) => item.repo.path === repoPath);
		      if (row === void 0) {
		        fail();
		        return;
		      }
		      settle(row);
		      if (row.outcome === "ok") refreshAll();
		    }).catch(fail).finally(() => {
		      setGroupBusy(false);
		    });
		  };
		  const chipNode = /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(
		    "div",
		    {
		      "data-gitgraph-chip-anchor": true,
		      "data-dsh-plugin": "git-graph",
		      "data-dsh-part": "chip",
		      "data-gitgraph-stock-light": stockLightTheme || void 0,
		      "data-gitgraph-multi": multi || void 0,
		      className: cx(context_default.anchor, heroSeat && context_default.anchorHero),
		      children: [
		        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: context_default.chipWrap, "data-gitgraph-chips": true, children: chips.map((entry) => {
		          const key = entry.path ?? "";
		          const open = openPath === key;
		          const ownsGroupOps = groupOwner !== void 0 && entry === groupOwner;
		          return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("span", { className: context_default.chipSlot, children: [
		            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
		              Chip,
		              {
		                hero: heroSeat,
		                icon: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(import_dsh_client_ui_primitives10.IconBranchOutlineRegular, { size: 14 }),
		                label: chipLabel(entry, copy),
		                ariaLabel: multi ? props.t("chip.aria.branchRepo", { name: entry.name }) : props.t("chip.aria.branch"),
		                open,
		                onClick: () => {
		                  toggleChip(entry);
		                },
		                disabled: !entry.available,
		                primary: multi && entry.primary,
		                title: entry.path ?? entry.name,
		                repoPath: entry.path,
		                badge: entry.dirty > 0 ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: context_default.chipBadge, title: props.t("branch.dirty", { count: entry.dirty }), children: entry.dirty }) : void 0
		              }
		            ),
		            open && panelBranches !== null && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
		              BranchPopover,
		              {
		                view: panelBranches,
		                repoLabel: multi ? entry.name : void 0,
		                onSwitch: (branch) => props.switchBranch(sessionId, branch, entry.path),
		                onSwitched: reportSwitched,
		                onCreate: () => {
		                  openRepoDialog(entry.path, "create");
		                },
		                onGraph: () => {
		                  openRepoDialog(entry.path, "graph");
		                },
		                onCreateWorktree: () => {
		                  openRepoDialog(entry.path, "worktree-create");
		                },
		                onManageWorktrees: () => {
		                  openRepoDialog(entry.path, "worktree-manage");
		                },
		                groupOps: ownsGroupOps ? { onSwitch: openGroupSwitch, onCreate: openGroupCreate } : void 0,
		                onClose: closePopover,
		                t: props.t
		              }
		            )
		          ] }, key === "" ? "root" : key);
		        }) }),
		        createOpen && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
		          CreateBranchDialog,
		          {
		            onCreate: (name) => props.createBranch(sessionId, name, dialogPath),
		            onClose: () => {
		              setCreateOpen(false);
		              refreshAll();
		            },
		            t: props.t
		          }
		        ),
		        graphOpen && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
		          GraphDialog,
		          {
		            graph: (limit) => props.graph(sessionId, limit, dialogPath),
		            onClose: () => {
		              setGraphOpen(false);
		            },
		            t: props.t
		          }
		        ),
		        worktreeCreateOpen && dialogBranches !== null && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
		          CreateWorktreeDialog,
		          {
		            branches: dialogBranches.branches,
		            currentBranch: dialogBranches.branch,
		            onCreate: (name, baseRef) => props.createWorktreeSession(sessionId, name, baseRef, dialogPath),
		            onClose: () => {
		              setWorktreeCreateOpen(false);
		              refreshAll();
		            },
		            t: props.t
		          }
		        ),
		        worktreeManageOpen && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
		          WorktreeManager,
		          {
		            fetchWorktrees: () => props.worktrees(sessionId, dialogPath),
		            onRemove: (worktreePath, opts) => props.removeWorktree(sessionId, worktreePath, opts, dialogPath),
		            onClose: () => {
		              setWorktreeManageOpen(false);
		            },
		            t: props.t
		          }
		        ),
		        groupSwitchOpen && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
		          GroupSwitchDialog,
		          {
		            branches: groupUnion,
		            total: repoRows.length,
		            busy: groupBusy,
		            error: groupError,
		            onSubmit: submitGroupSwitch,
		            onClose: () => {
		              setGroupSwitchOpen(false);
		            },
		            t: props.t
		          }
		        ),
		        groupCreateOpen && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
		          GroupCreateDialog,
		          {
		            repos: repoRows.map((row) => row.repo),
		            initialSelection: repoRows.filter((row) => !row.repo.primary).map((row) => row.repo.path),
		            busy: groupBusy,
		            error: groupError,
		            onSubmit: submitGroupCreate,
		            onClose: () => {
		              setGroupCreateOpen(false);
		            },
		            t: props.t
		          }
		        ),
		        groupResult !== null && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
		          GroupResultPanel,
		          {
		            result: groupResult,
		            busy: groupBusy,
		            onRetry: retryRepo,
		            onClose: () => {
		              setGroupResult(null);
		            },
		            t: props.t
		          }
		        ),
		        toast !== null && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
		          import_dsh_client_ui_primitives10.Toast,
		          {
		            text: toast.text,
		            tone: "success",
		            onDone: () => {
		              setToast(null);
		            }
		          },
		          toast.seq
		        )
		      ]
		    }
		  );
		  return chipNode;
		}

		// src/client/main-session.ts
		function mainViewSessionId(byId) {
		  if (byId === void 0 || byId === null) return void 0;
		  for (const row of Object.values(byId)) {
		    if (row !== void 0 && (row.retainedBy?.mainView ?? 0) > 0) return row.id;
		  }
		  return void 0;
		}

		// src/client/auto-isolation.ts
		var TAG = "[git-graph] auto-isolation";
		function probeWorkspaces(navigation, registry) {
		  if (typeof navigation !== "object" || navigation === null) return null;
		  if (typeof registry !== "object" || registry === null) return null;
		  const nav = navigation;
		  const reg = registry;
		  if (typeof nav.startSession !== "function") return null;
		  if (typeof reg.create !== "function" || typeof reg.list?.getSnapshot !== "function") return null;
		  return { navigation: nav, registry: reg };
		}
		function installAutoIsolation(scope, git) {
		  const probe = probeWorkspaces(scope.uiWorkspace, scope.workspaces);
		  if (probe === null) {
		    console.warn(`${TAG} disabled: the uiWorkspace/workspaces service shape changed; using the official new-session behavior`);
		    return () => {
		    };
		  }
		  const { navigation, registry } = probe;
		  let original;
		  try {
		    original = navigation.startSession;
		  } catch {
		    console.warn(`${TAG} disabled: startSession is not readable`);
		    return () => {
		    };
		  }
		  const resolveTarget = (workspaceId) => {
		    const snapshot = registry.list.getSnapshot();
		    const current = mainViewSessionId(scope.sessions.list.getSnapshot().byId);
		    const currentWorkspaceId = current === void 0 ? void 0 : snapshot.items.find((item) => item.sessionIds.includes(current))?.workspaceId;
		    return workspaceId ?? currentWorkspaceId ?? snapshot.items[0]?.workspaceId;
		  };
		  const routing = /* @__PURE__ */ new Set();
		  const routed = (workspaceId) => {
		    const target = resolveTarget(workspaceId);
		    if (target === void 0) {
		      original.call(navigation);
		      return;
		    }
		    if (routing.has(target)) return;
		    routing.add(target);
		    void (async () => {
		      const configResult = await git.config();
		      if (!configResult.ok || !configResult.value.autoIsolate) {
		        original.call(navigation, target);
		        return;
		      }
		      const config = configResult.value;
		      const item = registry.list.getSnapshot().items.find((entry) => entry.workspaceId === target);
		      if (item === void 0) {
		        original.call(navigation, target);
		        return;
		      }
		      const home = config.worktreesHome;
		      if (item.path.startsWith(home + "/") || item.path.startsWith(home + "\\")) {
		        original.call(navigation, target);
		        return;
		      }
		      const status = await git.status(item.path);
		      if (!status.ok || status.value === null) {
		        original.call(navigation, target);
		        return;
		      }
		      const name = `s-${Date.now().toString(36)}`;
		      const baseRef = config.autoBaseline === "default" ? "origin/HEAD" : void 0;
		      const created = await git.addWorktree(item.path, name, baseRef);
		      if (!created.ok) {
		        console.warn(`${TAG} worktree creation failed; starting the session in the main checkout instead`, created.error);
		        original.call(navigation, target);
		        return;
		      }
		      let registeredId;
		      try {
		        const workspace = await registry.create({ path: created.value.path });
		        registeredId = workspace.workspaceId;
		        original.call(navigation, workspace.workspaceId);
		      } catch (error) {
		        if (registeredId !== void 0 && typeof registry.delete === "function") {
		          try {
		            await registry.delete(registeredId);
		          } catch (cleanupError) {
		            console.warn(`${TAG} could not drop the failed workspace registration`, cleanupError);
		          }
		        }
		        await git.removeWorktree(item.path, created.value.path, { force: true });
		        console.warn(`${TAG} workspace registration failed; rolled back the worktree`, error);
		        original.call(navigation, target);
		      }
		    })().catch((error) => {
		      console.warn(`${TAG} routing failed; using the official behavior`, error);
		      original.call(navigation, target);
		    }).finally(() => {
		      routing.delete(target);
		    });
		  };
		  try {
		    navigation.startSession = routed;
		  } catch {
		    console.warn(`${TAG} disabled: startSession is not writable`);
		    return () => {
		    };
		  }
		  return () => {
		    try {
		      navigation.startSession = original;
		    } catch {
		    }
		  };
		}

		// src/client/locales.ts
		var zh = {
		  "branch.search": "\u641C\u7D22\u5206\u652F",
		  "branch.empty": "\u672A\u627E\u5230\u5339\u914D\u5206\u652F",
		  "branch.detached": "\u5206\u79BB HEAD",
		  "branch.dirty": "\u672A\u63D0\u4EA4\u7684\u66F4\u6539\uFF1A{count} \u4E2A\u6587\u4EF6",
		  "branch.create": "\u521B\u5EFA\u5E76\u68C0\u51FA\u65B0\u5206\u652F\u2026",
		  "branch.graph": "Git \u56FE\u8C31",
		  "branch.createDialog.title": "\u521B\u5EFA\u5E76\u68C0\u51FA\u65B0\u5206\u652F",
		  "branch.createDialog.description": "\u57FA\u4E8E\u5F53\u524D HEAD \u521B\u5EFA\u4E00\u4E2A\u65B0\u7684\u672C\u5730\u5206\u652F\uFF0C\u5E76\u5728\u521B\u5EFA\u6210\u529F\u540E\u7ACB\u5373\u5207\u6362\u8FC7\u53BB\u3002",
		  "branch.createDialog.nameLabel": "\u5206\u652F\u540D",
		  "branch.createDialog.placeholder": "\u4F8B\u5982 feature/git-branch-switcher",
		  "branch.createDialog.confirm": "\u521B\u5EFA\u5E76\u5207\u6362",
		  "branch.createDialog.cancel": "\u53D6\u6D88",
		  "graph.title": "Git \u56FE\u8C31",
		  "graph.subtitle": "{count} \u4E2A\u63D0\u4EA4\uFF0C{lanes} \u6761\u6CF3\u9053",
		  "graph.loading": "\u52A0\u8F7D\u4E2D\u2026",
		  "graph.loadMore": "\u52A0\u8F7D\u66F4\u591A",
		  "graph.close": "\u5173\u95ED",
		  "graph.empty": "\u6CA1\u6709\u63D0\u4EA4\u8BB0\u5F55",
		  "graph.time.justNow": "\u521A\u521A",
		  "graph.time.minutesAgo": "{count} \u5206\u949F\u524D",
		  "graph.time.hoursAgo": "{count} \u5C0F\u65F6\u524D",
		  "graph.time.daysAgo": "{count} \u5929\u524D",
		  "error.conflictsPresent": "\u5F53\u524D\u4ED3\u5E93\u8FD8\u6709\u672A\u89E3\u51B3\u7684\u51B2\u7A81\uFF0C\u5148\u5904\u7406\u5B8C\u518D\u5207\u6362\u5206\u652F\u3002",
		  "error.operationInProgress": "\u5F53\u524D\u4ED3\u5E93\u8FD8\u6709\u8FDB\u884C\u4E2D\u7684 Git \u64CD\u4F5C\uFF0C\u5B8C\u6210\u540E\u518D\u5207\u6362\u5206\u652F\u3002",
		  "error.branchInOtherWorktree": "\u76EE\u6807\u5206\u652F\u5DF2\u5728\u5176\u4ED6 worktree \u4E2D\u88AB\u68C0\u51FA\uFF0C\u5F53\u524D\u5DE5\u4F5C\u533A\u65E0\u6CD5\u76F4\u63A5\u5207\u6362\u3002",
		  "error.trackedOverwrite": "\u5207\u6362\u5931\u8D25\uFF0C\u4EE5\u4E0B\u5DF2\u8DDF\u8E2A\u6587\u4EF6\u7684\u4FEE\u6539\u4F1A\u88AB\u76EE\u6807\u5206\u652F\u8986\u76D6\uFF1A{paths}\u3002",
		  "error.untrackedOverwrite": "\u5207\u6362\u5931\u8D25\uFF0C\u4EE5\u4E0B\u672A\u8DDF\u8E2A\u6587\u4EF6\u4F1A\u88AB\u76EE\u6807\u5206\u652F\u8986\u76D6\uFF1A{paths}\u3002",
		  "error.moreFiles": "\u7B49\u53E6\u5916 {count} \u4E2A\u6587\u4EF6",
		  "error.pathsSeparator": "\u3001",
		  "error.targetBranchNotFound": "\u76EE\u6807\u5206\u652F\u4E0D\u5B58\u5728\u4E8E\u672C\u5730\u4ED3\u5E93\u3002",
		  "error.invalidBranchName": "\u5206\u652F\u540D\u65E0\u6548\uFF0C\u8BF7\u91CD\u65B0\u8F93\u5165\u3002",
		  "error.branchAlreadyExists": "\u5206\u652F\u5DF2\u5B58\u5728\uFF0C\u8BF7\u6362\u4E00\u4E2A\u540D\u79F0\u3002",
		  "error.workspaceUnknown": "\u5F53\u524D\u76EE\u5F55\u4E0D\u662F\u5DF2\u6CE8\u518C\u7684\u5DE5\u4F5C\u533A\u3002",
		  "error.internal": "\u64CD\u4F5C\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002",
		  "error.requestFailed": "\u5206\u652F\u64CD\u4F5C\u5931\u8D25\uFF1A{error}",
		  "toast.switchSuccess": "\u5DF2\u5207\u6362\u5230\u5206\u652F {branchName}",
		  "chip.aria.branch": "\u5206\u652F",
		  "chip.aria.branchRepo": "\u4ED3\u5E93 {name} \u7684\u5206\u652F",
		  "worktree.create": "\u5728 worktree \u4E2D\u5F00\u59CB\u65B0\u4F1A\u8BDD\u2026",
		  "worktree.manage": "\u7BA1\u7406 worktree\u2026",
		  "worktree.dialog.title": "\u5728 worktree \u4E2D\u5F00\u59CB\u65B0\u4F1A\u8BDD",
		  "worktree.dialog.description": "\u5728 DSH \u6258\u7BA1\u76EE\u5F55\uFF08$DSH_HOME/worktrees/\uFF09\u521B\u5EFA\u9694\u79BB worktree\uFF0C\u643A\u5E26\u65B0\u5206\u652F wt/<\u540D\u79F0>\uFF0C\u5E76\u5728\u5176\u4E2D\u6253\u5F00\u65B0\u4F1A\u8BDD\u3002\u5F53\u524D\u68C0\u51FA\u4E0D\u53D7\u5F71\u54CD\u3002",
		  "worktree.dialog.nameLabel": "worktree \u540D\u79F0",
		  "worktree.dialog.namePlaceholder": "\u4F8B\u5982 fix-login-race",
		  "worktree.dialog.baseLabel": "\u57FA\u7EBF\u5206\u652F",
		  "worktree.dialog.confirm": "\u521B\u5EFA\u5E76\u5F00\u59CB\u4F1A\u8BDD",
		  "worktree.dialog.cancel": "\u53D6\u6D88",
		  "worktree.manager.title": "Worktree \u7BA1\u7406",
		  "worktree.manager.loading": "\u52A0\u8F7D\u4E2D\u2026",
		  "worktree.manager.empty": "\u6CA1\u6709\u6258\u7BA1\u7684 worktree",
		  "worktree.manager.main": "\u4E3B\u68C0\u51FA",
		  "worktree.manager.detached": "\u5206\u79BB HEAD",
		  "worktree.manager.remove": "\u5220\u9664",
		  "worktree.manager.forceConfirm": "\u8BE5 worktree \u6709\u672A\u63D0\u4EA4\u66F4\u6539\uFF0C\u786E\u8BA4\u5F3A\u5236\u5220\u9664\uFF1F",
		  "worktree.manager.forceYes": "\u5F3A\u5236\u5220\u9664",
		  "worktree.manager.deleteBranch": "\u540C\u65F6\u5220\u9664\u5206\u652F",
		  "worktree.manager.close": "\u5173\u95ED",
		  "toast.worktreeCreated": "\u5DF2\u521B\u5EFA worktree {name}",
		  "error.invalidWorktreeName": "worktree \u540D\u79F0\u65E0\u6548\uFF0C\u8BF7\u91CD\u65B0\u8F93\u5165\u3002",
		  "error.worktreeAlreadyExists": "\u540C\u540D worktree \u6216\u5206\u652F\u5DF2\u5B58\u5728\uFF0C\u8BF7\u6362\u4E00\u4E2A\u540D\u79F0\u3002",
		  "error.worktreeDirty": "\u8BE5 worktree \u6709\u672A\u63D0\u4EA4\u7684\u66F4\u6539\u3002",
		  "error.worktreeNotFound": "\u627E\u4E0D\u5230\u8BE5 worktree\uFF08\u53EF\u80FD\u5DF2\u88AB\u5220\u9664\uFF09\u3002",
		  "error.worktreeIsMain": "\u4E3B\u68C0\u51FA\u4E0D\u80FD\u5220\u9664\u3002",
		  "error.baseRefNotFound": "\u57FA\u7EBF\u5206\u652F\u6216\u4FEE\u8BA2\u4E0D\u5B58\u5728\u3002",
		  "repos.primaryBadge": "\u6839\u4ED3",
		  "repos.unavailable": "\u4E0D\u53EF\u7528",
		  "repos.noUnion": "\u6CA1\u6709\u53EF\u7528\u4E8E\u7EC4\u5207\u6362\u7684\u5206\u652F\u540D",
		  "repos.branchCoverage": "{count}/{total} \u4E2A\u4ED3\u5E93",
		  "repos.groupFailed": "\u7EC4\u64CD\u4F5C\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002",
		  "ops.more": "\u66F4\u591A\u64CD\u4F5C",
		  "ops.back": "\u8FD4\u56DE\u5206\u652F\u5217\u8868",
		  "ops.group.branch": "\u5206\u652F",
		  "ops.group.worktree": "Worktree",
		  "ops.group.group": "\u7EC4\u64CD\u4F5C",
		  "ops.create.desc": "\u57FA\u4E8E\u5F53\u524D HEAD \u521B\u5EFA\u5E76\u7ACB\u5373\u5207\u6362",
		  "ops.graph.desc": "\u53EA\u8BFB\u6D4F\u89C8\u63D0\u4EA4\u5386\u53F2\u4E0E\u6CF3\u9053",
		  "ops.worktreeCreate.desc": "\u9694\u79BB worktree + wt/<\u540D\u79F0> \u5206\u652F",
		  "ops.worktreeManage.desc": "\u67E5\u770B\u5E76\u5220\u9664\u6258\u7BA1 worktree",
		  "ops.groupSwitch": "\u7EC4\u5207\u6362\u2026",
		  "ops.groupSwitch.desc": "\u6309\u5206\u652F\u540D\u8DE8\u4ED3\u5E93\u5207\u6362",
		  "ops.groupCreate": "\u7EC4\u65B0\u5EFA\u2026",
		  "ops.groupCreate.desc": "\u5728\u591A\u4E2A\u4ED3\u5E93\u521B\u5EFA\u540C\u540D\u5206\u652F",
		  "group.switch.title": "\u7EC4\u5207\u6362",
		  "group.switch.description": "\u5BF9\u5DE5\u4F5C\u533A\u5185\u62E5\u6709\u8BE5\u5206\u652F\u540D\u7684\u4ED3\u5E93\u6267\u884C\u5207\u6362\uFF1B\u7F3A\u5C11\u8BE5\u5206\u652F\u7684\u4ED3\u5E93\u4F1A\u88AB\u8DF3\u8FC7\uFF0C\u4E0D\u4F1A\u4E3A\u5176\u521B\u5EFA\u5206\u652F\u3002\u7ED3\u679C\u9010\u4ED3\u6C47\u62A5\u3002",
		  "group.switch.branchLabel": "\u8981\u5207\u6362\u7684\u5206\u652F",
		  "group.switch.loading": "\u6B63\u5728\u6536\u96C6\u5404\u4ED3\u5206\u652F\u2026",
		  "group.switch.confirm": "\u7EC4\u5207\u6362",
		  "group.switch.cancel": "\u53D6\u6D88",
		  "group.create.title": "\u7EC4\u65B0\u5EFA\u5206\u652F",
		  "group.create.description": "\u5728\u52FE\u9009\u7684\u4ED3\u5E93\u4E2D\u521B\u5EFA\u540C\u540D\u5206\u652F\uFF1B\u67D0\u4E2A\u4ED3\u5E93\u5931\u8D25\u4E0D\u4F1A\u963B\u6B62\u5176\u4ED6\u4ED3\u5E93\u5B8C\u6210\uFF0C\u4E5F\u4E0D\u4F1A\u81EA\u52A8\u56DE\u6EDA\u3002",
		  "group.create.reposLabel": "\u4ED3\u5E93",
		  "group.create.nameLabel": "\u5206\u652F\u540D",
		  "group.create.namePlaceholder": "\u4F8B\u5982 feature/multi-repo",
		  "group.create.baseLabel": "\u57FA\u51C6",
		  "group.create.confirm": "\u521B\u5EFA\u5206\u652F",
		  "group.create.cancel": "\u53D6\u6D88",
		  "group.create.noSelection": "\u81F3\u5C11\u52FE\u9009\u4E00\u4E2A\u4ED3\u5E93\u3002",
		  "group.base.mainline": "\u5404\u4ED3\u9ED8\u8BA4\u4E3B\u7EBF",
		  "group.base.head": "\u5404\u4ED3\u5F53\u524D HEAD",
		  "group.result.switchTitle": "\u7EC4\u5207\u6362\u7ED3\u679C\uFF1A{branch}",
		  "group.result.createTitle": "\u7EC4\u65B0\u5EFA\u7ED3\u679C\uFF1A{branch}",
		  "group.result.summary": "{ok} \u6210\u529F \xB7 {skipped} \u8DF3\u8FC7 \xB7 {failed} \u5931\u8D25 \xB7 {notRun} \u672A\u6267\u884C",
		  "group.outcome.ok": "\u6210\u529F",
		  "group.outcome.skipped": "\u8DF3\u8FC7\uFF08\u672A\u5305\u542B\uFF09",
		  "group.outcome.failed": "\u5931\u8D25",
		  "group.outcome.notRun": "\u672A\u6267\u884C",
		  "group.outcome.notRunHint": "\u672C\u4ED3\u672A\u6267\u884C\uFF1A\u5176\u4ED6\u53C2\u4E0E\u4ED3\u672A\u901A\u8FC7\u9884\u68C0\u3002",
		  "group.retry": "\u91CD\u8BD5",
		  "group.close": "\u5173\u95ED"
		};
		var en = {
		  "branch.search": "Search branches",
		  "branch.empty": "No matching branches",
		  "branch.detached": "Detached HEAD",
		  "branch.dirty": "Uncommitted changes: {count} files",
		  "branch.create": "Create and switch to new branch\u2026",
		  "branch.graph": "Git Graph",
		  "branch.createDialog.title": "Create and switch to new branch",
		  "branch.createDialog.description": "Create a new local branch from the current HEAD and switch to it immediately.",
		  "branch.createDialog.nameLabel": "Branch name",
		  "branch.createDialog.placeholder": "For example, feature/git-branch-switcher",
		  "branch.createDialog.confirm": "Create and switch",
		  "branch.createDialog.cancel": "Cancel",
		  "graph.title": "Git Graph",
		  "graph.subtitle": "{count} commits across {lanes} lanes",
		  "graph.loading": "Loading\u2026",
		  "graph.loadMore": "Load more",
		  "graph.close": "Close",
		  "graph.empty": "No commits",
		  "graph.time.justNow": "just now",
		  "graph.time.minutesAgo": "{count} minutes ago",
		  "graph.time.hoursAgo": "{count} hours ago",
		  "graph.time.daysAgo": "{count} days ago",
		  "error.conflictsPresent": "The repository still has unresolved conflicts. Resolve them before switching branches.",
		  "error.operationInProgress": "Another Git operation is still in progress. Finish it before switching branches.",
		  "error.branchInOtherWorktree": "That branch is already checked out in another worktree.",
		  "error.trackedOverwrite": "Switch failed because tracked files would be overwritten: {paths}.",
		  "error.untrackedOverwrite": "Switch failed because untracked files would be overwritten: {paths}.",
		  "error.moreFiles": "{count} more files",
		  "error.pathsSeparator": ", ",
		  "error.targetBranchNotFound": "The target branch does not exist locally.",
		  "error.invalidBranchName": "The branch name is invalid. Enter a different name.",
		  "error.branchAlreadyExists": "That branch already exists. Choose another name.",
		  "error.workspaceUnknown": "This directory is not a registered workspace.",
		  "error.internal": "The operation failed. Please try again.",
		  "error.requestFailed": "Branch operation failed: {error}",
		  "toast.switchSuccess": "Switched to branch {branchName}",
		  "chip.aria.branch": "Branch",
		  "chip.aria.branchRepo": "Branch of repository {name}",
		  "worktree.create": "Start a new session in a worktree\u2026",
		  "worktree.manage": "Manage worktrees\u2026",
		  "worktree.dialog.title": "Start a new session in a worktree",
		  "worktree.dialog.description": "Create an isolated worktree in the DSH-managed home ($DSH_HOME/worktrees/) on a new wt/<name> branch, and open a new session in it. The current checkout is untouched.",
		  "worktree.dialog.nameLabel": "Worktree name",
		  "worktree.dialog.namePlaceholder": "For example, fix-login-race",
		  "worktree.dialog.baseLabel": "Base branch",
		  "worktree.dialog.confirm": "Create and start session",
		  "worktree.dialog.cancel": "Cancel",
		  "worktree.manager.title": "Worktree Manager",
		  "worktree.manager.loading": "Loading\u2026",
		  "worktree.manager.empty": "No managed worktrees",
		  "worktree.manager.main": "main checkout",
		  "worktree.manager.detached": "detached HEAD",
		  "worktree.manager.remove": "Remove",
		  "worktree.manager.forceConfirm": "This worktree has uncommitted changes. Force-remove it?",
		  "worktree.manager.forceYes": "Force remove",
		  "worktree.manager.deleteBranch": "Also delete the branch",
		  "worktree.manager.close": "Close",
		  "toast.worktreeCreated": "Created worktree {name}",
		  "error.invalidWorktreeName": "The worktree name is invalid. Enter a different name.",
		  "error.worktreeAlreadyExists": "A worktree or branch with that name already exists. Choose another name.",
		  "error.worktreeDirty": "The worktree has uncommitted changes.",
		  "error.worktreeNotFound": "That worktree was not found (it may already be gone).",
		  "error.worktreeIsMain": "The primary checkout cannot be removed.",
		  "error.baseRefNotFound": "The base branch or revision does not exist.",
		  "repos.primaryBadge": "root",
		  "repos.unavailable": "Unavailable",
		  "repos.noUnion": "No branch name is available for a group switch",
		  "repos.branchCoverage": "{count}/{total} repositories",
		  "repos.groupFailed": "The group operation failed. Please try again.",
		  "ops.more": "More actions",
		  "ops.back": "Back to branches",
		  "ops.group.branch": "Branches",
		  "ops.group.worktree": "Worktrees",
		  "ops.group.group": "Group operations",
		  "ops.create.desc": "Create from the current HEAD and switch to it",
		  "ops.graph.desc": "Read-only commit history and lanes",
		  "ops.worktreeCreate.desc": "Isolated worktree on a wt/<name> branch",
		  "ops.worktreeManage.desc": "Inspect and remove managed worktrees",
		  "ops.groupSwitch": "Group switch\u2026",
		  "ops.groupSwitch.desc": "Switch every repository that has the branch",
		  "ops.groupCreate": "Group create\u2026",
		  "ops.groupCreate.desc": "Create the same branch in several repositories",
		  "group.switch.title": "Group switch",
		  "group.switch.description": "Switch every repository that has the picked branch. Repositories without it are skipped and no branch is created for them. Results are reported per repository.",
		  "group.switch.branchLabel": "Branch to switch to",
		  "group.switch.loading": "Collecting branches\u2026",
		  "group.switch.confirm": "Group switch",
		  "group.switch.cancel": "Cancel",
		  "group.create.title": "Create a branch across repositories",
		  "group.create.description": "Create the same branch in the checked repositories. One repository failing neither stops the others nor triggers a rollback.",
		  "group.create.reposLabel": "Repositories",
		  "group.create.nameLabel": "Branch name",
		  "group.create.namePlaceholder": "For example, feature/multi-repo",
		  "group.create.baseLabel": "Base",
		  "group.create.confirm": "Create branches",
		  "group.create.cancel": "Cancel",
		  "group.create.noSelection": "Check at least one repository.",
		  "group.base.mainline": "Each repository's default mainline",
		  "group.base.head": "Each repository's current HEAD",
		  "group.result.switchTitle": "Group switch result: {branch}",
		  "group.result.createTitle": "Group create result: {branch}",
		  "group.result.summary": "{ok} succeeded \xB7 {skipped} skipped \xB7 {failed} failed \xB7 {notRun} not run",
		  "group.outcome.ok": "Succeeded",
		  "group.outcome.skipped": "Skipped (not included)",
		  "group.outcome.failed": "Failed",
		  "group.outcome.notRun": "Not run",
		  "group.outcome.notRunHint": "Not run: another participating repository failed the preflight.",
		  "group.retry": "Retry",
		  "group.close": "Close"
		};

		// src/client/index.ts
		var NS = "git-graph";
		var inject = ["slots", "sessions", "workspaces", "connection", "locale"];
		var NO_WORKSPACE = { code: "workspace-unknown", message: "session has no workspace" };
		async function viewOrNull(call) {
		  try {
		    const result = await call();
		    return result.ok ? result.value : null;
		  } catch {
		    return null;
		  }
		}
		var CONTEXT_FALLBACK_MS = 2e3;
		function apply(ctx) {
		  ctx.effect(() => {
		    try {
		      return ctx.locale.register(NS, { zh, en });
		    } catch {
		      return () => {
		      };
		    }
		  }, "dsh-git-graph-multi: dictionaries");
		  const git = new GitApi();
		  ctx.inject(["workspaces", "sessions", "uiWorkspace"], (worktreeScope) => {
		    worktreeScope.effect(() => installAutoIsolation(worktreeScope, git), "dsh-git-graph-multi: auto-isolation");
		  });
		  let fallbackTimer;
		  ctx.effect(() => () => {
		    if (fallbackTimer !== void 0) clearTimeout(fallbackTimer);
		  }, "dsh-git-graph-multi: context fallback timer");
		  ctx.inject(["slots", "conversation", "sessions", "uiWorkspace"], (scope) => {
		    const sessions = scope.sessions;
		    const cwdOf = (sessionId) => sessionId === void 0 ? void 0 : sessions.list.getSnapshot().byId[sessionId]?.cwd;
		    const injected = () => {
		      const pathOf = (sessionId, repoPath) => {
		        const selected = repoPath === void 0 || repoPath === "" ? void 0 : repoPath;
		        const path = selected ?? cwdOf(sessionId);
		        if (path === void 0 || path === "") return { ok: false, error: NO_WORKSPACE };
		        return { ok: true, path };
		      };
		      return {
		        repoStatus: async (sessionId, repoPath) => {
		          const resolved = pathOf(sessionId, repoPath);
		          if (!resolved.ok) return null;
		          const result = await git.status(resolved.path);
		          return result.ok ? result.value : null;
		        },
		        branches: async (sessionId, repoPath) => {
		          const resolved = pathOf(sessionId, repoPath);
		          if (!resolved.ok) return null;
		          const result = await git.branches(resolved.path);
		          return result.ok ? result.value : null;
		        },
		        switchBranch: async (sessionId, branch, repoPath) => {
		          const resolved = pathOf(sessionId, repoPath);
		          if (!resolved.ok) return { ok: false, error: resolved.error };
		          const result = await git.switchBranch(resolved.path, branch);
		          return result.ok ? { ok: true, branch: result.value.branch } : result;
		        },
		        createBranch: async (sessionId, name, repoPath) => {
		          const resolved = pathOf(sessionId, repoPath);
		          if (!resolved.ok) return { ok: false, error: resolved.error };
		          const result = await git.createBranch(resolved.path, name);
		          return result.ok ? { ok: true, branch: result.value.branch } : result;
		        },
		        graph: async (sessionId, limit, repoPath) => {
		          const resolved = pathOf(sessionId, repoPath);
		          if (!resolved.ok) return null;
		          const result = await git.graph(resolved.path, limit);
		          return result.ok ? result.value : null;
		        },
		        worktrees: async (sessionId, repoPath) => {
		          const resolved = pathOf(sessionId, repoPath);
		          if (!resolved.ok) return null;
		          const result = await git.worktrees(resolved.path);
		          return result.ok ? result.value : null;
		        },
		        createWorktreeSession: async (sessionId, name, baseRef, repoPath) => {
		          const resolved = pathOf(sessionId, repoPath);
		          if (!resolved.ok) return { ok: false, error: resolved.error };
		          const created = await git.addWorktree(resolved.path, name, baseRef);
		          if (!created.ok) return { ok: false, error: created.error };
		          try {
		            const workspace = await scope.workspaces.create({ path: created.value.path });
		            const createdSessionId = await scope.sessions.create({ workspaceId: workspace.workspaceId });
		            scope.uiWorkspace.openSession(createdSessionId);
		          } catch (error) {
		            await git.removeWorktree(resolved.path, created.value.path, { force: true });
		            return { ok: false, error: { code: "internal", message: `workspace registration failed: ${String(error)}` } };
		          }
		          return { ok: true, path: created.value.path, branch: created.value.branch, name: created.value.name };
		        },
		        removeWorktree: async (sessionId, worktreePath, opts, repoPath) => {
		          const resolved = pathOf(sessionId, repoPath);
		          if (!resolved.ok) return { ok: false, error: resolved.error };
		          const removed = await git.removeWorktree(resolved.path, worktreePath, opts);
		          if (!removed.ok) return { ok: false, error: removed.error };
		          const linked = scope.workspaces.list.getSnapshot().items.find((item) => item.path === worktreePath);
		          if (linked !== void 0) {
		            await scope.workspaces.delete(linked.workspaceId);
		          }
		          return { ok: true };
		        },
		        gitConfig: async () => {
		          const result = await git.config();
		          return result.ok ? result.value : null;
		        },
		        subscribeChanges: (sessionId, onChange, repoPaths) => {
		          if (repoPaths !== void 0 && repoPaths.length > 0) return subscribeChanges([...repoPaths], onChange);
		          const resolved = pathOf(sessionId);
		          if (!resolved.ok) return () => {
		          };
		          return subscribeChanges([resolved.path], onChange);
		        },
		        repos: async (sessionId) => {
		          const resolved = pathOf(sessionId);
		          if (!resolved.ok) return null;
		          return viewOrNull(() => git.repos(resolved.path));
		        },
		        groupSwitch: async (sessionId, branch) => {
		          const resolved = pathOf(sessionId);
		          if (!resolved.ok) return null;
		          return viewOrNull(() => git.groupSwitch(resolved.path, branch));
		        },
		        groupCreate: async (sessionId, repos, name, base) => {
		          const resolved = pathOf(sessionId);
		          if (!resolved.ok) return null;
		          return viewOrNull(() => git.groupCreate(resolved.path, repos, name, base));
		        }
		      };
		    };
		    const chipEntry = { id: "git-graph", order: 100, locale: NS, inject: injected };
		    let mounted = false;
		    const disposeContextWait = scope.slots.inject("conversation.input.selector.context", () => {
		      mounted = true;
		      try {
		        return scope.slots.register(
		          { name: "conversation.input.selector.context", ...chipEntry },
		          BranchChip
		        );
		      } catch {
		        return () => {
		        };
		      }
		    });
		    fallbackTimer = setTimeout(() => {
		      if (mounted) return;
		      disposeContextWait();
		      scope.slots.inject("conversation.input.dock", () => {
		        try {
		          return scope.slots.register(
		            { name: "conversation.input.dock", ...chipEntry },
		            BranchChip
		          );
		        } catch {
		          return () => {
		          };
		        }
		      });
		    }, CONTEXT_FALLBACK_MS);
		  });
		}

		return module.exports;
	}
});
