window.__ModuleLoader__.load({
	id: "dsh-plugin-session-tool-toggle",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __export = (target, all) => {
		  for (var name2 in all)
		    __defProp(target, name2, { get: all[name2], enumerable: true });
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
		  SEAT: () => HEADER_SEAT,
		  apply: () => apply,
		  attachFocusListener: () => attachFocusListener,
		  inject: () => inject,
		  name: () => name
		});
		module.exports = __toCommonJS(index_exports);

		// src/client/ToolPanelAction.tsx
		var import_react7 = require("react");
		var import_dsh_client_ui_primitives8 = require("@deepseek-ai/dsh-client-ui-primitives");

		// src/contract.ts
		var CHANNEL = "/session-tool-toggle";
		var PANEL_ENDPOINT = "panel";
		var TOGGLE_ENDPOINT = "toggle";
		var RESET_ENDPOINT = "reset";
		var DEFAULTS_ENDPOINT = "defaults";
		var WORKSPACE_ENDPOINT = "workspace";
		var HOST_FAILURE_CODES = [
		  /** 端点未知 / 请求体不合形状 / 未知 action。 */
		  "bad-request",
		  /** 地址文法解析失败（细节里带 `parseCode`）。 */
		  "bad-address",
		  /** 命中保护名单（整单拒绝，不写任何状态）。 */
		  "protected",
		  /** 保留名（`run_code` 等，`restrict` 会抛）。 */
		  "reserved",
		  /** 会话不在宿主中运行（已归档 / 已结束 / 不存在的 id）。 */
		  "session-not-live",
		  /** 默认档写入失败（权限 / 磁盘 / 目录不可建）。 */
		  "defaults-unwritable",
		  /** 未预期抛错（宿主已 warn）。 */
		  "internal",
		  /** 会话 cwd 无法归属 / 工作区路径未登记或不可 realpath。 */
		  "workspace-unresolved",
		  /** 工作区档写入失败（细节里带 `{path, reason}`）。 */
		  "workspace-unwritable"
		];
		var TRANSPORT_FAILURE_CODES = ["unavailable", "bad-response"];
		var FAILURE_CODES = [...HOST_FAILURE_CODES, ...TRANSPORT_FAILURE_CODES];
		var TOOL_GROUP_KINDS = ["mcp", "skill", "builtin"];
		var GROUP_SOURCES = ["user", "project"];
		var NOTICE_CODES = [
		  /** 记录通道不可用，已降级内存态。 */
		  "persistence-degraded",
		  /** 默认档损坏 / 半写，已按空档处理。 */
		  "defaults-corrupt",
		  /** 子代理会话：不继承父会话的会话级开关。 */
		  "session-subagent",
		  /** 技能服务不可用：技能地址只记意图，影子 stub 不生效。 */
		  "skills-unavailable",
		  /** 影子 stub 注册未胜出（同层先到先得）：该技能行的开关不可用。 */
		  "skill-shadow-failed"
		];
		var STORE_KINDS = ["record", "memory"];
		var DEFAULTS_VERSION = 1;
		var DESCRIPTION_MAX_LENGTH = 160;
		function fail(message) {
		  return { ok: false, message };
		}
		function readObject(value, subject) {
		  if (typeof value !== "object" || value === null || Array.isArray(value)) {
		    return fail(`${subject} \u4E0D\u662F\u5BF9\u8C61`);
		  }
		  return { ok: true, value };
		}
		function readStrictObject(value, subject, allowed) {
		  const object = readObject(value, subject);
		  if (!object.ok) return object;
		  const unknown = Object.keys(object.value).filter((key) => !allowed.includes(key));
		  if (unknown.length > 0) return fail(`${subject} \u542B\u672A\u77E5\u5B57\u6BB5\uFF1A${unknown.join(", ")}`);
		  return object;
		}
		function readStringField(record, key, subject, limits = {}) {
		  const value = record[key];
		  if (typeof value !== "string") return fail(`${subject}.${key} \u4E0D\u662F\u5B57\u7B26\u4E32`);
		  const minLength = limits.minLength ?? 0;
		  if (value.length < minLength) return fail(`${subject}.${key} \u4E3A\u7A7A`);
		  const maxLength = limits.maxLength;
		  if (maxLength !== void 0 && value.length > maxLength) {
		    return fail(`${subject}.${key} \u8D85\u8FC7 ${maxLength} \u5B57\u7B26\uFF08\u5B9E\u9645 ${value.length}\uFF09`);
		  }
		  return { ok: true, value };
		}
		function readOptionalStringField(record, key, subject, limits = {}) {
		  if (record[key] === void 0) return { ok: true, value: void 0 };
		  return readStringField(record, key, subject, limits);
		}
		function readBooleanField(record, key, subject) {
		  const value = record[key];
		  if (typeof value !== "boolean") return fail(`${subject}.${key} \u4E0D\u662F\u5E03\u5C14\u503C`);
		  return { ok: true, value };
		}
		function readOptionalBooleanField(record, key, subject) {
		  if (record[key] === void 0) return { ok: true, value: void 0 };
		  return readBooleanField(record, key, subject);
		}
		function readOptionalEnumField(record, key, subject, allowed) {
		  if (record[key] === void 0) return { ok: true, value: void 0 };
		  return readEnumField(record, key, subject, allowed);
		}
		function readCountField(record, key, subject) {
		  const value = record[key];
		  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
		    return fail(`${subject}.${key} \u4E0D\u662F\u975E\u8D1F\u5B89\u5168\u6574\u6570`);
		  }
		  return { ok: true, value };
		}
		function readOptionalCountField(record, key, subject) {
		  if (record[key] === void 0) return { ok: true, value: void 0 };
		  return readCountField(record, key, subject);
		}
		function readIntField(record, key, subject) {
		  const value = record[key];
		  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
		    return fail(`${subject}.${key} \u4E0D\u662F\u5B89\u5168\u6574\u6570`);
		  }
		  return { ok: true, value };
		}
		function readNullableStringField(record, key, subject) {
		  const value = record[key];
		  if (value === null) return { ok: true, value: null };
		  if (typeof value !== "string") return fail(`${subject}.${key} \u4E0D\u662F\u5B57\u7B26\u4E32\u6216 null`);
		  return { ok: true, value };
		}
		function readStringArrayField(record, key, subject, limits = {}) {
		  const value = record[key];
		  if (!Array.isArray(value)) return fail(`${subject}.${key} \u4E0D\u662F\u6570\u7EC4`);
		  const items = value;
		  const minItems = limits.minItems ?? 0;
		  if (items.length < minItems) return fail(`${subject}.${key} \u81F3\u5C11\u9700\u8981 ${minItems} \u9879\uFF08\u5B9E\u9645 ${items.length}\uFF09`);
		  const maxItems = limits.maxItems;
		  if (maxItems !== void 0 && items.length > maxItems) {
		    return fail(`${subject}.${key} \u8D85\u8FC7\u4E0A\u9650 ${maxItems} \u9879\uFF08\u5B9E\u9645 ${items.length}\uFF09`);
		  }
		  const result = [];
		  const itemMinLength = limits.itemMinLength ?? 0;
		  const itemMaxLength = limits.itemMaxLength;
		  for (const [index, item] of items.entries()) {
		    const itemSubject = `${subject}.${key}[${index}]`;
		    if (typeof item !== "string") return fail(`${itemSubject} \u4E0D\u662F\u5B57\u7B26\u4E32`);
		    if (item.length < itemMinLength) return fail(`${itemSubject} \u4E3A\u7A7A`);
		    if (itemMaxLength !== void 0 && item.length > itemMaxLength) {
		      return fail(`${itemSubject} \u8D85\u8FC7 ${itemMaxLength} \u5B57\u7B26\uFF08\u5B9E\u9645 ${item.length}\uFF09`);
		    }
		    result.push(item);
		  }
		  return { ok: true, value: result };
		}
		function readArrayField(record, key, subject, readItem) {
		  const value = record[key];
		  if (!Array.isArray(value)) return fail(`${subject}.${key} \u4E0D\u662F\u6570\u7EC4`);
		  const result = [];
		  for (const [index, item] of value.entries()) {
		    const parsed = readItem(item, `${subject}.${key}[${index}]`);
		    if (!parsed.ok) return parsed;
		    result.push(parsed.value);
		  }
		  return { ok: true, value: result };
		}
		function readEnumField(record, key, subject, allowed) {
		  const value = record[key];
		  if (typeof value !== "string" || !allowed.includes(value)) {
		    return fail(`${subject}.${key} \u4E0D\u662F\u5DF2\u77E5\u53D6\u503C\uFF08${allowed.join(" / ")}\uFF09`);
		  }
		  return { ok: true, value };
		}
		function readEnumArrayField(record, key, subject, allowed) {
		  return readArrayField(record, key, subject, (item, itemSubject) => {
		    if (typeof item !== "string" || !allowed.includes(item)) {
		      return fail(`${itemSubject} \u4E0D\u662F\u5DF2\u77E5\u53D6\u503C\uFF08${allowed.join(" / ")}\uFF09`);
		    }
		    return { ok: true, value: item };
		  });
		}
		var TOOL_ENTRY_KEYS = [
		  "name",
		  "shortName",
		  "address",
		  "disabled",
		  "protected",
		  "reserved",
		  "description"
		];
		var TOOL_GROUP_KEYS = ["kind", "key", "address", "toolCount", "disabledCount", "disabled", "tools"];
		var STATE_VIEW_KEYS = ["disabled", "snapshot", "seeded", "updatedAt", "storeKind"];
		var DEFAULTS_VIEW_KEYS = ["version", "disabled", "path", "readable", "corrupt"];
		var STATS_VIEW_KEYS = ["visible", "denied"];
		var WORKSPACE_CHOICE_KEYS = ["key", "title"];
		var WORKSPACE_VIEW_KEYS = ["key", "title", "registered", "disabled", "path", "readable", "corrupt"];
		var DEFAULTS_ENTRY_KEYS = [
		  "address",
		  "shortName",
		  "description",
		  "protected",
		  "reserved",
		  "modelInvocable",
		  "userInvocable",
		  "source"
		];
		var DEFAULTS_GROUP_KEYS = ["kind", "key", "address", "tools", "source", "countsTokens"];
		var DEFAULTS_UNIVERSE_KEYS = [
		  "layerReady",
		  "skillsAvailable",
		  "groups",
		  "ungroupedMcp",
		  "skillsComplete",
		  "foreignProjectMcp"
		];
		var SKILL_VIEW_KEYS = ["name", "description", "disabled", "shadowed"];
		var PANEL_SNAPSHOT_KEYS = [
		  "sessionId",
		  "createdAt",
		  "state",
		  "groups",
		  "protectedNames",
		  "defaults",
		  "intentOnly",
		  "stats",
		  "notices",
		  "skills",
		  "workspace"
		];
		var MUTATION_APPLIED_KEYS = ["address", "on", "matched"];
		var MUTATION_KEYS = [
		  "applied",
		  "hiddenTools",
		  "hiddenSkills",
		  "visibleBefore",
		  "visibleAfter",
		  "kvRebuild",
		  "notices"
		];
		function readToolEntry(value, subject) {
		  const object = readStrictObject(value, subject, TOOL_ENTRY_KEYS);
		  if (!object.ok) return object;
		  const record = object.value;
		  const name2 = readStringField(record, "name", subject, { minLength: 1 });
		  if (!name2.ok) return name2;
		  const shortName = readStringField(record, "shortName", subject, { minLength: 1 });
		  if (!shortName.ok) return shortName;
		  const address = readStringField(record, "address", subject, { minLength: 1 });
		  if (!address.ok) return address;
		  const disabled = readBooleanField(record, "disabled", subject);
		  if (!disabled.ok) return disabled;
		  const isProtected = readBooleanField(record, "protected", subject);
		  if (!isProtected.ok) return isProtected;
		  const reserved = readBooleanField(record, "reserved", subject);
		  if (!reserved.ok) return reserved;
		  const description = readOptionalStringField(record, "description", subject, {
		    maxLength: DESCRIPTION_MAX_LENGTH
		  });
		  if (!description.ok) return description;
		  const entry = {
		    name: name2.value,
		    shortName: shortName.value,
		    address: address.value,
		    disabled: disabled.value,
		    protected: isProtected.value,
		    reserved: reserved.value,
		    // 可选字段只在确实带了描述时出现：面板用 `description === undefined` 判断有无描述，
		    // 伪造一个 `description: undefined` 的键会让 `Object.keys` / JSON 序列化多一项。
		    ...description.value === void 0 ? {} : { description: description.value }
		  };
		  return { ok: true, value: entry };
		}
		function readToolGroup(value, subject) {
		  const object = readStrictObject(value, subject, TOOL_GROUP_KEYS);
		  if (!object.ok) return object;
		  const record = object.value;
		  const kind = readEnumField(record, "kind", subject, TOOL_GROUP_KINDS);
		  if (!kind.ok) return kind;
		  const key = readStringField(record, "key", subject, { minLength: 1 });
		  if (!key.ok) return key;
		  const address = readNullableStringField(record, "address", subject);
		  if (!address.ok) return address;
		  const toolCount = readCountField(record, "toolCount", subject);
		  if (!toolCount.ok) return toolCount;
		  const disabledCount = readCountField(record, "disabledCount", subject);
		  if (!disabledCount.ok) return disabledCount;
		  const disabled = readBooleanField(record, "disabled", subject);
		  if (!disabled.ok) return disabled;
		  const tools = readArrayField(record, "tools", subject, readToolEntry);
		  if (!tools.ok) return tools;
		  return {
		    ok: true,
		    value: {
		      kind: kind.value,
		      key: key.value,
		      address: address.value,
		      toolCount: toolCount.value,
		      disabledCount: disabledCount.value,
		      disabled: disabled.value,
		      tools: tools.value
		    }
		  };
		}
		function readStateView(value, subject) {
		  const object = readStrictObject(value, subject, STATE_VIEW_KEYS);
		  if (!object.ok) return object;
		  const record = object.value;
		  const disabled = readStringArrayField(record, "disabled", subject);
		  if (!disabled.ok) return disabled;
		  const snapshot = readStringArrayField(record, "snapshot", subject);
		  if (!snapshot.ok) return snapshot;
		  const seeded = readBooleanField(record, "seeded", subject);
		  if (!seeded.ok) return seeded;
		  const updatedAt = readCountField(record, "updatedAt", subject);
		  if (!updatedAt.ok) return updatedAt;
		  const storeKind = readEnumField(record, "storeKind", subject, STORE_KINDS);
		  if (!storeKind.ok) return storeKind;
		  return {
		    ok: true,
		    value: {
		      disabled: disabled.value,
		      snapshot: snapshot.value,
		      seeded: seeded.value,
		      updatedAt: updatedAt.value,
		      storeKind: storeKind.value
		    }
		  };
		}
		function readDefaultsView(value, subject) {
		  const object = readStrictObject(value, subject, DEFAULTS_VIEW_KEYS);
		  if (!object.ok) return object;
		  const record = object.value;
		  const version = readCountField(record, "version", subject);
		  if (!version.ok) return version;
		  if (version.value !== DEFAULTS_VERSION) {
		    return fail(`${subject}.version \u4E0D\u662F ${DEFAULTS_VERSION}\uFF08\u5B9E\u9645 ${version.value}\uFF09`);
		  }
		  const disabled = readStringArrayField(record, "disabled", subject);
		  if (!disabled.ok) return disabled;
		  const path = readStringField(record, "path", subject, { minLength: 1 });
		  if (!path.ok) return path;
		  const readable = readBooleanField(record, "readable", subject);
		  if (!readable.ok) return readable;
		  const corrupt = readBooleanField(record, "corrupt", subject);
		  if (!corrupt.ok) return corrupt;
		  return {
		    ok: true,
		    value: {
		      version: version.value,
		      disabled: disabled.value,
		      path: path.value,
		      readable: readable.value,
		      corrupt: corrupt.value
		    }
		  };
		}
		function readStatsView(value, subject) {
		  const object = readStrictObject(value, subject, STATS_VIEW_KEYS);
		  if (!object.ok) return object;
		  const record = object.value;
		  const visible = readCountField(record, "visible", subject);
		  if (!visible.ok) return visible;
		  const denied = readCountField(record, "denied", subject);
		  if (!denied.ok) return denied;
		  return {
		    ok: true,
		    value: {
		      visible: visible.value,
		      denied: denied.value
		    }
		  };
		}
		function readSkillView(value, subject) {
		  const object = readStrictObject(value, subject, SKILL_VIEW_KEYS);
		  if (!object.ok) return object;
		  const record = object.value;
		  const name2 = readStringField(record, "name", subject, { minLength: 1 });
		  if (!name2.ok) return name2;
		  const description = readStringField(record, "description", subject, {
		    maxLength: DESCRIPTION_MAX_LENGTH
		  });
		  if (!description.ok) return description;
		  const disabled = readBooleanField(record, "disabled", subject);
		  if (!disabled.ok) return disabled;
		  const shadowed = readBooleanField(record, "shadowed", subject);
		  if (!shadowed.ok) return shadowed;
		  return {
		    ok: true,
		    value: {
		      name: name2.value,
		      description: description.value,
		      disabled: disabled.value,
		      shadowed: shadowed.value
		    }
		  };
		}
		function readWorkspaceChoice(value, subject) {
		  const object = readStrictObject(value, subject, WORKSPACE_CHOICE_KEYS);
		  if (!object.ok) return object;
		  const record = object.value;
		  const key = readStringField(record, "key", subject, { minLength: 1 });
		  if (!key.ok) return key;
		  const title = readStringField(record, "title", subject);
		  if (!title.ok) return title;
		  return { ok: true, value: { key: key.value, title: title.value } };
		}
		function readWorkspaceView(value, subject) {
		  const object = readStrictObject(value, subject, WORKSPACE_VIEW_KEYS);
		  if (!object.ok) return object;
		  const record = object.value;
		  const key = readStringField(record, "key", subject, { minLength: 1 });
		  if (!key.ok) return key;
		  const title = readOptionalStringField(record, "title", subject);
		  if (!title.ok) return title;
		  const registered = readBooleanField(record, "registered", subject);
		  if (!registered.ok) return registered;
		  const disabled = readStringArrayField(record, "disabled", subject);
		  if (!disabled.ok) return disabled;
		  const path = readStringField(record, "path", subject, { minLength: 1 });
		  if (!path.ok) return path;
		  const readable = readBooleanField(record, "readable", subject);
		  if (!readable.ok) return readable;
		  const corrupt = readBooleanField(record, "corrupt", subject);
		  if (!corrupt.ok) return corrupt;
		  return {
		    ok: true,
		    value: {
		      key: key.value,
		      ...title.value === void 0 ? {} : { title: title.value },
		      registered: registered.value,
		      disabled: disabled.value,
		      path: path.value,
		      readable: readable.value,
		      corrupt: corrupt.value
		    }
		  };
		}
		function readNullableWorkspaceView(value, subject) {
		  if (value === null) return { ok: true, value: null };
		  return readWorkspaceView(value, subject);
		}
		function readDefaultsEntry(value, subject) {
		  const object = readStrictObject(value, subject, DEFAULTS_ENTRY_KEYS);
		  if (!object.ok) return object;
		  const record = object.value;
		  const address = readStringField(record, "address", subject, { minLength: 1 });
		  if (!address.ok) return address;
		  const shortName = readStringField(record, "shortName", subject, { minLength: 1 });
		  if (!shortName.ok) return shortName;
		  const description = readOptionalStringField(record, "description", subject, {
		    maxLength: DESCRIPTION_MAX_LENGTH
		  });
		  if (!description.ok) return description;
		  const isProtected = readBooleanField(record, "protected", subject);
		  if (!isProtected.ok) return isProtected;
		  const reserved = readBooleanField(record, "reserved", subject);
		  if (!reserved.ok) return reserved;
		  const modelInvocable = readOptionalBooleanField(record, "modelInvocable", subject);
		  if (!modelInvocable.ok) return modelInvocable;
		  const userInvocable = readOptionalBooleanField(record, "userInvocable", subject);
		  if (!userInvocable.ok) return userInvocable;
		  const source = readOptionalStringField(record, "source", subject, { minLength: 1 });
		  if (!source.ok) return source;
		  const hasPair = modelInvocable.value !== void 0 && userInvocable.value !== void 0;
		  const hasAnyInvocation = modelInvocable.value !== void 0 || userInvocable.value !== void 0;
		  if (hasAnyInvocation && !hasPair) {
		    return fail(`${subject} \u7684 modelInvocable \u4E0E userInvocable \u5FC5\u987B\u6210\u5BF9\u51FA\u73B0`);
		  }
		  if (hasAnyInvocation && !address.value.startsWith("skill:")) {
		    return fail(`${subject} \u53EA\u6709 skill: \u5730\u5740\u5141\u8BB8\u643A\u5E26\u6280\u80FD\u5B57\u6BB5`);
		  }
		  if (source.value !== void 0 && !hasPair) {
		    return fail(`${subject} \u51FA\u73B0 source \u65F6 modelInvocable \u4E0E userInvocable \u5FC5\u987B\u540C\u65F6\u5728\u573A`);
		  }
		  return {
		    ok: true,
		    value: {
		      address: address.value,
		      shortName: shortName.value,
		      ...description.value === void 0 ? {} : { description: description.value },
		      protected: isProtected.value,
		      reserved: reserved.value,
		      ...hasPair ? { modelInvocable: modelInvocable.value, userInvocable: userInvocable.value } : {},
		      ...source.value === void 0 ? {} : { source: source.value }
		    }
		  };
		}
		function readDefaultsGroup(value, subject) {
		  const object = readStrictObject(value, subject, DEFAULTS_GROUP_KEYS);
		  if (!object.ok) return object;
		  const record = object.value;
		  const kind = readEnumField(record, "kind", subject, TOOL_GROUP_KINDS);
		  if (!kind.ok) return kind;
		  const key = readStringField(record, "key", subject, { minLength: 1 });
		  if (!key.ok) return key;
		  const address = readNullableStringField(record, "address", subject);
		  if (!address.ok) return address;
		  const tools = readArrayField(record, "tools", subject, readDefaultsEntry);
		  if (!tools.ok) return tools;
		  const source = readOptionalEnumField(record, "source", subject, GROUP_SOURCES);
		  if (!source.ok) return source;
		  const countsTokens = readOptionalBooleanField(record, "countsTokens", subject);
		  if (!countsTokens.ok) return countsTokens;
		  const hasGroupMeta = source.value !== void 0 || countsTokens.value !== void 0;
		  if (hasGroupMeta && kind.value !== "mcp") {
		    return fail(`${subject} \u7684 source/countsTokens \u53EA\u5141\u8BB8\u51FA\u73B0\u5728 mcp \u5206\u7EC4\u4E0A`);
		  }
		  return {
		    ok: true,
		    value: {
		      kind: kind.value,
		      key: key.value,
		      address: address.value,
		      tools: tools.value,
		      ...source.value === void 0 ? {} : { source: source.value },
		      ...countsTokens.value === void 0 ? {} : { countsTokens: countsTokens.value }
		    }
		  };
		}
		function readNullableDefaultsUniverse(value, subject) {
		  if (value === null) return { ok: true, value: null };
		  const object = readStrictObject(value, subject, DEFAULTS_UNIVERSE_KEYS);
		  if (!object.ok) return object;
		  const record = object.value;
		  const layerReady = readBooleanField(record, "layerReady", subject);
		  if (!layerReady.ok) return layerReady;
		  const skillsAvailable = readBooleanField(record, "skillsAvailable", subject);
		  if (!skillsAvailable.ok) return skillsAvailable;
		  const groups = readArrayField(record, "groups", subject, readDefaultsGroup);
		  if (!groups.ok) return groups;
		  const ungroupedMcp = readOptionalCountField(record, "ungroupedMcp", subject);
		  if (!ungroupedMcp.ok) return ungroupedMcp;
		  const skillsComplete = readOptionalBooleanField(record, "skillsComplete", subject);
		  if (!skillsComplete.ok) return skillsComplete;
		  const foreignProjectMcp = readOptionalCountField(record, "foreignProjectMcp", subject);
		  if (!foreignProjectMcp.ok) return foreignProjectMcp;
		  return {
		    ok: true,
		    value: {
		      layerReady: layerReady.value,
		      skillsAvailable: skillsAvailable.value,
		      groups: groups.value,
		      // 工作区宇宙专属字段缺省不补键：缺省语义由类型注释约定（`ungroupedMcp` = 0、
		      // `skillsComplete` = 未观测 / 旧响应、`foreignProjectMcp` = 0），伪造 `undefined`
		      // 键会让 JSON 多一项。
		      ...ungroupedMcp.value === void 0 ? {} : { ungroupedMcp: ungroupedMcp.value },
		      ...skillsComplete.value === void 0 ? {} : { skillsComplete: skillsComplete.value },
		      ...foreignProjectMcp.value === void 0 ? {} : { foreignProjectMcp: foreignProjectMcp.value }
		    }
		  };
		}
		function readPanelSnapshot(value, subject) {
		  const object = readStrictObject(value, subject, PANEL_SNAPSHOT_KEYS);
		  if (!object.ok) return object;
		  const record = object.value;
		  const sessionId = readStringField(record, "sessionId", subject, { minLength: 1 });
		  if (!sessionId.ok) return sessionId;
		  const createdAt = readCountField(record, "createdAt", subject);
		  if (!createdAt.ok) return createdAt;
		  const state = readStateView(record["state"], `${subject}.state`);
		  if (!state.ok) return state;
		  const groups = readArrayField(record, "groups", subject, readToolGroup);
		  if (!groups.ok) return groups;
		  const protectedNames = readStringArrayField(record, "protectedNames", subject);
		  if (!protectedNames.ok) return protectedNames;
		  const defaults = readDefaultsView(record["defaults"], `${subject}.defaults`);
		  if (!defaults.ok) return defaults;
		  const intentOnly = readStringArrayField(record, "intentOnly", subject);
		  if (!intentOnly.ok) return intentOnly;
		  const stats = readStatsView(record["stats"], `${subject}.stats`);
		  if (!stats.ok) return stats;
		  const notices = readEnumArrayField(record, "notices", subject, NOTICE_CODES);
		  if (!notices.ok) return notices;
		  const skills = readArrayField(record, "skills", subject, readSkillView);
		  if (!skills.ok) return skills;
		  const workspace = readNullableWorkspaceView(record["workspace"], `${subject}.workspace`);
		  if (!workspace.ok) return workspace;
		  return {
		    ok: true,
		    value: {
		      sessionId: sessionId.value,
		      createdAt: createdAt.value,
		      state: state.value,
		      groups: groups.value,
		      protectedNames: protectedNames.value,
		      defaults: defaults.value,
		      intentOnly: intentOnly.value,
		      stats: stats.value,
		      notices: notices.value,
		      skills: skills.value,
		      workspace: workspace.value
		    }
		  };
		}
		function readMutationApplied(value, subject) {
		  const object = readStrictObject(value, subject, MUTATION_APPLIED_KEYS);
		  if (!object.ok) return object;
		  const record = object.value;
		  const address = readStringField(record, "address", subject, { minLength: 1 });
		  if (!address.ok) return address;
		  const on = readBooleanField(record, "on", subject);
		  if (!on.ok) return on;
		  const matched = readCountField(record, "matched", subject);
		  if (!matched.ok) return matched;
		  return { ok: true, value: { address: address.value, on: on.value, matched: matched.value } };
		}
		function readMutation(value, subject) {
		  const object = readStrictObject(value, subject, MUTATION_KEYS);
		  if (!object.ok) return object;
		  const record = object.value;
		  const applied = readArrayField(record, "applied", subject, readMutationApplied);
		  if (!applied.ok) return applied;
		  const hiddenTools = readIntField(record, "hiddenTools", subject);
		  if (!hiddenTools.ok) return hiddenTools;
		  const hiddenSkills = readIntField(record, "hiddenSkills", subject);
		  if (!hiddenSkills.ok) return hiddenSkills;
		  const visibleBefore = readCountField(record, "visibleBefore", subject);
		  if (!visibleBefore.ok) return visibleBefore;
		  const visibleAfter = readCountField(record, "visibleAfter", subject);
		  if (!visibleAfter.ok) return visibleAfter;
		  const kvRebuild = readBooleanField(record, "kvRebuild", subject);
		  if (!kvRebuild.ok) return kvRebuild;
		  const notices = readEnumArrayField(record, "notices", subject, NOTICE_CODES);
		  if (!notices.ok) return notices;
		  return {
		    ok: true,
		    value: {
		      applied: applied.value,
		      hiddenTools: hiddenTools.value,
		      hiddenSkills: hiddenSkills.value,
		      visibleBefore: visibleBefore.value,
		      visibleAfter: visibleAfter.value,
		      kvRebuild: kvRebuild.value,
		      notices: notices.value
		    }
		  };
		}
		function readToggleValue(value, subject) {
		  const object = readStrictObject(value, subject, ["snapshot", "mutation"]);
		  if (!object.ok) return object;
		  const snapshot = readPanelSnapshot(object.value["snapshot"], `${subject}.snapshot`);
		  if (!snapshot.ok) return snapshot;
		  const mutation = readMutation(object.value["mutation"], `${subject}.mutation`);
		  if (!mutation.ok) return mutation;
		  return { ok: true, value: { snapshot: snapshot.value, mutation: mutation.value } };
		}
		function parsePanelSnapshot(raw) {
		  return readPanelSnapshot(raw, "panel \u5FEB\u7167");
		}
		function parseToggleValue(raw) {
		  return readToggleValue(raw, "toggle \u54CD\u5E94");
		}
		function parseResetValue(raw) {
		  return readToggleValue(raw, "reset \u54CD\u5E94");
		}
		function parseDefaultsValue(raw) {
		  const subject = "defaults \u54CD\u5E94";
		  const object = readStrictObject(raw, subject, ["defaults", "changed"]);
		  if (!object.ok) return object;
		  const defaults = readDefaultsView(object.value["defaults"], `${subject}.defaults`);
		  if (!defaults.ok) return defaults;
		  const changed = readStringArrayField(object.value, "changed", subject, { itemMinLength: 1 });
		  if (!changed.ok) return changed;
		  return { ok: true, value: { defaults: defaults.value, changed: changed.value } };
		}
		function parseWorkspaceValue(raw) {
		  const subject = "workspace \u54CD\u5E94";
		  const object = readStrictObject(raw, subject, ["workspace", "choices", "changed", "universe"]);
		  if (!object.ok) return object;
		  const workspace = readNullableWorkspaceView(object.value["workspace"], `${subject}.workspace`);
		  if (!workspace.ok) return workspace;
		  const choices = readArrayField(object.value, "choices", subject, readWorkspaceChoice);
		  if (!choices.ok) return choices;
		  const changed = readStringArrayField(object.value, "changed", subject, { itemMinLength: 1 });
		  if (!changed.ok) return changed;
		  const universe = readNullableDefaultsUniverse(object.value["universe"], `${subject}.universe`);
		  if (!universe.ok) return universe;
		  return {
		    ok: true,
		    value: {
		      workspace: workspace.value,
		      choices: choices.value,
		      changed: changed.value,
		      universe: universe.value
		    }
		  };
		}
		function hasExactKeys(record, expected) {
		  const keys = Object.keys(record);
		  return keys.length === expected.length && expected.every((key) => keys.includes(key));
		}
		function parseFailureDetails(details) {
		  if (typeof details !== "object" || details === null || Array.isArray(details)) return void 0;
		  const record = details;
		  if (hasExactKeys(record, ["issues"]) && typeof record["issues"] === "string") {
		    return { issues: record["issues"] };
		  }
		  if (hasExactKeys(record, ["address", "parseCode"]) && typeof record["address"] === "string" && typeof record["parseCode"] === "string") {
		    return { address: record["address"], parseCode: record["parseCode"] };
		  }
		  if (hasExactKeys(record, ["names"]) && Array.isArray(record["names"])) {
		    const names = [];
		    for (const name2 of record["names"]) {
		      if (typeof name2 !== "string") return void 0;
		      names.push(name2);
		    }
		    return { names };
		  }
		  if (hasExactKeys(record, ["sessionId"]) && typeof record["sessionId"] === "string") {
		    return { sessionId: record["sessionId"] };
		  }
		  if (hasExactKeys(record, ["path", "reason"]) && typeof record["path"] === "string" && typeof record["reason"] === "string") {
		    return { path: record["path"], reason: record["reason"] };
		  }
		  if (hasExactKeys(record, ["subject"]) && typeof record["subject"] === "string") {
		    return { subject: record["subject"] };
		  }
		  return void 0;
		}

		// src/client/panel-client.ts
		var PanelError = class extends Error {
		  /**
		   * @param code - 稳定失败码（7 个宿主码 + `unavailable` / `bad-response`）；宿主未来新增
		   *   的码也原样保留，调用方按 `error.fallback` 渲染。
		   * @param message - 人类可读的兜底说明（不参与本地化，只作二级详情）。
		   * @param details - 已归一的失败细节（文案占位符 `{address}` / `{names}` 用）；读不出来时缺省。
		   */
		  constructor(code, message, details) {
		    super(message);
		    this.code = code;
		    this.details = details;
		    this.name = "PanelError";
		  }
		};
		function messageOf(error) {
		  return error instanceof Error ? error.message : String(error);
		}
		function failureOf(error) {
		  if (typeof error !== "object" || error === null || Array.isArray(error)) {
		    return new PanelError("bad-response", "\u5BBF\u4E3B\u8FD4\u56DE\u7684\u5931\u8D25\u4FE1\u5C01\u7F3A\u5C11 error \u5BF9\u8C61");
		  }
		  const record = error;
		  const code = record["code"];
		  const message = record["message"];
		  if (typeof code !== "string" || code.length === 0) {
		    return new PanelError("bad-response", "\u5BBF\u4E3B\u8FD4\u56DE\u7684\u5931\u8D25\u4FE1\u5C01\u7F3A\u5C11 code");
		  }
		  if (typeof message !== "string") {
		    return new PanelError("bad-response", "\u5BBF\u4E3B\u8FD4\u56DE\u7684\u5931\u8D25\u4FE1\u5C01\u7F3A\u5C11 message");
		  }
		  return new PanelError(code, message, parseFailureDetails(record["details"]));
		}
		function unwrapEnvelope(result) {
		  if (typeof result !== "object" || result === null || Array.isArray(result)) {
		    throw new PanelError("bad-response", "\u5BBF\u4E3B\u8FD4\u56DE\u7684 RPC \u4FE1\u5C01\u4E0D\u662F\u5BF9\u8C61");
		  }
		  const record = result;
		  if (record["ok"] === true) return record["value"];
		  if (record["ok"] === false) throw failureOf(record["error"]);
		  throw new PanelError("bad-response", "\u5BBF\u4E3B\u8FD4\u56DE\u7684 RPC \u4FE1\u5C01\u7F3A\u5C11 ok \u6807\u8BB0");
		}
		function defaultsPayload(action, addresses) {
		  if (action === "reset" || addresses === void 0) return { action };
		  return { action, addresses: [...addresses] };
		}
		function workspacePayload(request) {
		  const payload = {};
		  if (request.sessionId !== void 0) payload.sessionId = request.sessionId;
		  if (request.workspacePath !== void 0) payload.workspacePath = request.workspacePath;
		  if (request.action !== void 0) payload.action = request.action;
		  if (request.addresses !== void 0) payload.addresses = [...request.addresses];
		  return payload;
		}
		function createPanelClient(connection) {
		  const call = async (endpoint, payload, parse) => {
		    let result;
		    try {
		      result = await connection.rpc.call(CHANNEL, endpoint, payload);
		    } catch (error) {
		      throw new PanelError("unavailable", messageOf(error));
		    }
		    const parsed = parse(unwrapEnvelope(result));
		    if (!parsed.ok) throw new PanelError("bad-response", parsed.message);
		    return parsed.value;
		  };
		  return {
		    async panel(sessionId) {
		      return call(PANEL_ENDPOINT, { sessionId }, parsePanelSnapshot);
		    },
		    async toggle(sessionId, on, addresses) {
		      return call(TOGGLE_ENDPOINT, { sessionId, on, addresses: [...addresses] }, parseToggleValue);
		    },
		    async reset(sessionId) {
		      return call(RESET_ENDPOINT, { sessionId }, parseResetValue);
		    },
		    async updateDefaults(action, addresses) {
		      return call(DEFAULTS_ENDPOINT, defaultsPayload(action, addresses), parseDefaultsValue);
		    },
		    async workspace(request) {
		      return call(WORKSPACE_ENDPOINT, workspacePayload(request), parseWorkspaceValue);
		    }
		  };
		}

		// src/client/panel-controller.ts
		var CLIENT_MISSING_MESSAGE = "\u9762\u677F\u5BA2\u6237\u7AEF\u5C1A\u672A\u5C31\u7EEA\uFF1Aconnection \u53EF\u80FD\u665A\u4E8E\u63D2\u4EF6 apply \u6302\u8F7D";
		function asPanelError(error) {
		  if (error instanceof PanelError) return error;
		  return new PanelError("internal", error instanceof Error ? error.message : String(error));
		}
		function withPending(pending, address) {
		  const next = new Set(pending);
		  next.add(address);
		  return next;
		}
		function withoutPending(pending, address) {
		  const next = new Set(pending);
		  next.delete(address);
		  return next;
		}
		var PanelController = class {
		  /** 本控制器服务的会话 id（只读；组件侧 `key` 与调试用）。 */
		  sessionId;
		  options;
		  state = {
		    phase: "idle",
		    pending: /* @__PURE__ */ new Set(),
		    resetting: false,
		    savingDefaults: false,
		    workspaceChoices: [],
		    savingWorkspace: false,
		    workspaceSaved: false,
		    loadedAt: 0
		  };
		  listeners = /* @__PURE__ */ new Set();
		  commandDisposer;
		  focusDisposer;
		  /** 拉取序号：只有最后一次发出的拉取可以落状态（focus / 命令 / 手动刷新可能重叠）。 */
		  loadSeq = 0;
		  /** 工作区读 / 写序号：与 `loadSeq` 同一条纪律，防止迟到的旧读数覆盖新目标。 */
		  workspaceSeq = 0;
		  disposed = false;
		  /**
		   * @param options - 依赖注入面（见 {@link PanelControllerOptions}）。
		   */
		  constructor(options) {
		    this.options = options;
		    this.sessionId = options.sessionId;
		    this.subscribeCommands();
		  }
		  /**
		   * 读取当前状态（identity 稳定；供 `useSyncExternalStore`）。
		   * @returns 当前状态对象，未变化时是同一引用。
		   */
		  getSnapshot = () => this.state;
		  /**
		   * 订阅状态变化（供 `useSyncExternalStore`）。
		   * @param listener - 失效回调。
		   * @returns 退订函数；已 `dispose()` 时是空操作。
		   */
		  subscribe = (listener) => {
		    if (this.disposed) return () => {
		    };
		    this.listeners.add(listener);
		    return () => {
		      this.listeners.delete(listener);
		    };
		  };
		  /**
		   * 打开面板：挂 focus 监听并立即拉取（打开 → 关闭 → 再打开也重拉）。
		   * @returns 本次拉取完成的 promise（失败已落状态，不 reject）。
		   */
		  async open() {
		    if (this.disposed) return;
		    this.attachFocus();
		    await this.refresh();
		  }
		  /**
		   * 关闭面板：摘 focus 监听、回到 `idle`，**保留快照**供下次打开即时渲染。
		   *
		   * 在途拉取会被序号失效（否则它回来时会把已关闭的面板重新置成 `ready`）；
		   * 在途 mutation 仍会清掉自己的 `pending`，但不改变 `idle` 阶段。
		   */
		  close() {
		    if (this.disposed) return;
		    this.detachFocus();
		    this.loadSeq += 1;
		    this.workspaceSeq += 1;
		    if (this.state.phase === "idle" && this.state.error === void 0 && this.state.defaultsError === void 0 && this.state.workspaceError === void 0) {
		      return;
		    }
		    this.patch({ phase: "idle", error: void 0, defaultsError: void 0, workspaceError: void 0 });
		  }
		  /**
		   * 显式重拉面板快照（手动刷新按钮；`open()` 也走这里）。
		   *
		   * 已在 `loading` 时直接返回：重叠的 focus / 命令事件不重复打宿主。失败时进 `failed`
		   * 但保留上一份快照（stale-while-revalidate）。
		   * @returns 本次拉取完成的 promise（失败已落状态，不 reject）。
		   */
		  async refresh() {
		    if (this.disposed || this.state.phase === "loading") return;
		    const client = this.resolveClient();
		    if (client === void 0) {
		      this.loadSeq += 1;
		      this.patch({ phase: "failed", error: new PanelError("unavailable", CLIENT_MISSING_MESSAGE) });
		      return;
		    }
		    const seq = this.loadSeq += 1;
		    this.patch({ phase: "loading", error: void 0 });
		    try {
		      const snapshot = await client.panel(this.sessionId);
		      this.commitLoad(seq, {
		        phase: "ready",
		        snapshot,
		        defaults: snapshot.defaults,
		        workspace: snapshot.workspace ?? void 0,
		        error: void 0,
		        loadedAt: this.now()
		      });
		    } catch (error) {
		      this.commitLoad(seq, { phase: "failed", error: asPanelError(error) });
		    }
		  }
		  /**
		   * 开关一个地址（整组或单工具）。
		   *
		   * 不做乐观更新：在途期间该地址进 `pending`（面板禁用对应开关），成功后用响应里的
		   * `snapshot` 整份替换并清 `error`；失败只清 `pending` 并把失败放进 `error`，旧快照
		   * 原样保留。同一地址在途时重复调用被忽略（避免一次点击发两个互相覆盖的请求）。
		   * @param address - 规范形地址（`mcp:<server>` / `mcp:<server>::<tool>` / `tool:<name>`）。
		   * @param on - `true` 开启（移出关闭集）、`false` 关闭（加入关闭集）。
		   * @returns 本次请求完成的 promise（失败已落状态，不 reject）。
		   */
		  async toggle(address, on) {
		    if (this.disposed || this.state.pending.has(address)) return;
		    const client = this.resolveClient();
		    if (client === void 0) {
		      this.patch({ error: new PanelError("unavailable", CLIENT_MISSING_MESSAGE), phase: this.mutationPhase() });
		      return;
		    }
		    this.patch({ pending: withPending(this.state.pending, address) });
		    try {
		      const value = await client.toggle(this.sessionId, on, [address]);
		      if (this.disposed) return;
		      this.loadSeq += 1;
		      this.patch({
		        pending: withoutPending(this.state.pending, address),
		        snapshot: value.snapshot,
		        defaults: value.snapshot.defaults,
		        workspace: value.snapshot.workspace ?? void 0,
		        error: void 0,
		        phase: this.state.phase === "idle" ? "idle" : "ready",
		        loadedAt: this.now()
		      });
		    } catch (error) {
		      if (this.disposed) return;
		      this.patch({
		        pending: withoutPending(this.state.pending, address),
		        error: asPanelError(error),
		        phase: this.mutationPhase()
		      });
		    }
		  }
		  /**
		   * 本会话回到创建时快照（与 `toggle` 共享 `ToggleValue` 响应形状）。
		   *
		   * `pending` 是按地址的，重置没有地址，因此用独立的 `resetting` 标志让面板整体禁用；
		   * 成功/失败的快照语义与 `toggle` 相同。
		   * @returns 本次请求完成的 promise（失败已落状态，不 reject）。
		   */
		  async reset() {
		    if (this.disposed || this.state.resetting) return;
		    const client = this.resolveClient();
		    if (client === void 0) {
		      this.patch({ error: new PanelError("unavailable", CLIENT_MISSING_MESSAGE), phase: this.mutationPhase() });
		      return;
		    }
		    this.patch({ resetting: true });
		    try {
		      const value = await client.reset(this.sessionId);
		      if (this.disposed) return;
		      this.loadSeq += 1;
		      this.patch({
		        resetting: false,
		        snapshot: value.snapshot,
		        defaults: value.snapshot.defaults,
		        workspace: value.snapshot.workspace ?? void 0,
		        error: void 0,
		        phase: this.state.phase === "idle" ? "idle" : "ready",
		        loadedAt: this.now()
		      });
		    } catch (error) {
		      if (this.disposed) return;
		      this.patch({ resetting: false, error: asPanelError(error), phase: this.mutationPhase() });
		    }
		  }
		  /**
		   * 写用户级默认档（不追溯已存在会话）。
		   *
		   * 与面板级动作的区别：成功后只替换 `state.defaults`，**不重拉 panel 快照**（默认档
		   * 不追溯，§3.4），也不动 `error`；失败进 `defaultsError` 并保持面板可用。在途时
		   * `savingDefaults` 为 `true`。
		   * @param action - `set` / `off` / `on` / `reset`。
		   * @param addresses - 目标地址；`reset` 时不传（契约不允许该组合同现）。
		   * @returns 本次请求完成的 promise（失败已落状态，不 reject）。
		   */
		  async updateDefaults(action, addresses) {
		    if (this.disposed || this.state.savingDefaults) return;
		    const client = this.resolveClient();
		    if (client === void 0) {
		      this.patch({ defaultsError: new PanelError("unavailable", CLIENT_MISSING_MESSAGE) });
		      return;
		    }
		    this.patch({ savingDefaults: true, defaultsError: void 0 });
		    try {
		      const value = await client.updateDefaults(action, addresses);
		      if (this.disposed) return;
		      this.patch({ savingDefaults: false, defaults: value.defaults, defaultsError: void 0 });
		    } catch (error) {
		      if (this.disposed) return;
		      this.patch({ savingDefaults: false, defaultsError: asPanelError(error) });
		    }
		  }
		  /**
		   * 重读本会话所属工作区的默认档（`{sessionId, action:'read'}` 形态）。
		   *
		   * 只动工作区三态（`workspace` / `workspaceChoices` / `workspaceError`）：面板快照、
		   * `defaults` 与面板级 `error` 都不动——工作区档不追溯已存在的会话（§3.4），没必要为一次
		   * 工作区刷新重拉整份快照。失败时保留上一次可用视图（stale-while-revalidate），只把失败
		   * 放进 `workspaceError`：connection 缺席与传输异常都归 `unavailable`，界面据此渲染
		   * `error.unavailable` 降级行；宿主拒绝码（如 `workspace-unresolved`）原样保留。
		   * @returns 本次读取完成的 promise（失败已落状态，不 reject）。
		   */
		  async refreshWorkspace() {
		    if (this.disposed) return;
		    const client = this.resolveClient();
		    if (client === void 0) {
		      this.patch({ workspaceError: new PanelError("unavailable", CLIENT_MISSING_MESSAGE) });
		      return;
		    }
		    const seq = this.workspaceSeq += 1;
		    if (this.state.workspaceError !== void 0) this.patch({ workspaceError: void 0 });
		    try {
		      const value = await client.workspace({ sessionId: this.sessionId, action: "read" });
		      this.commitWorkspace(seq, {
		        workspace: value.workspace ?? void 0,
		        workspaceChoices: value.choices,
		        workspaceError: void 0
		      });
		    } catch (error) {
		      this.commitWorkspace(seq, { workspaceError: asPanelError(error) });
		    }
		  }
		  /**
		   * 写工作区级默认档；`action: 'read'` + `key` 也用它按路径切到另一个工作区。
		   *
		   * 寻址：`key` 存在 → `{workspacePath: key}`（footer 下拉切换），否则
		   * `{sessionId: this.sessionId}`（面板分区、footer 默认项）。请求体**精确**构造：不传
		   * 缺省 `action`，也不给 `read` / `reset` 带 `addresses`（strict 端点会判 `bad-request`）。
		   *
		   * 成功后直接吃响应里的目标工作区视图与下拉项（写工作区档不追溯当前会话，不重拉
		   * panel 快照），`workspaceSaved` 只在真正的写动作后置 true；失败进 `workspaceError`、
		   * 保留旧视图与面板级 `error`。在途时 `savingWorkspace` 为 `true` 并忽略重复调用。
		   * @param action - `read` / `set` / `off` / `on` / `reset`。
		   * @param addresses - 目标地址（`set` / `off` / `on` 必需；`read` / `reset` 忽略）。
		   * @param key - 工作区规范路径（省略 = 按本会话寻址）。
		   * @returns 本次请求完成的 promise（失败已落状态，不 reject）。
		   */
		  async updateWorkspace(action, addresses, key) {
		    if (this.disposed || this.state.savingWorkspace) return;
		    const client = this.resolveClient();
		    if (client === void 0) {
		      this.patch({ workspaceError: new PanelError("unavailable", CLIENT_MISSING_MESSAGE) });
		      return;
		    }
		    const seq = this.workspaceSeq += 1;
		    this.patch({ savingWorkspace: true, workspaceSaved: false, workspaceError: void 0 });
		    try {
		      const value = await client.workspace(this.workspaceRequest(action, addresses, key));
		      this.commitWorkspace(seq, {
		        savingWorkspace: false,
		        // `read` 不是写：把「已保存」置 true 会让切换工作区的界面谎报一次保存。
		        workspaceSaved: action !== "read",
		        workspace: value.workspace ?? void 0,
		        workspaceChoices: value.choices,
		        workspaceError: void 0
		      });
		    } catch (error) {
		      this.commitWorkspace(seq, {
		        savingWorkspace: false,
		        workspaceSaved: false,
		        workspaceError: asPanelError(error)
		      });
		    }
		  }
		  /**
		   * 摘掉全部订阅（命令事件、focus），清空监听者并丢弃在途响应。
		   *
		   * 幂等；之后所有动作方法都是空操作，不再发请求。
		   */
		  dispose() {
		    if (this.disposed) return;
		    this.disposed = true;
		    this.loadSeq += 1;
		    this.workspaceSeq += 1;
		    this.detachFocus();
		    this.commandDisposer?.();
		    this.commandDisposer = void 0;
		    this.listeners.clear();
		  }
		  /**
		   * 订阅命令事件：仅「本会话 + `tools`」且面板已打开时才刷新。
		   *
		   * 面板关闭时不刷新——下一次 `open()` 必拉，凭空把 `phase` 置成 `loading` 会让
		   * Modal 自己弹出来。订阅面抛错时静默降级（缺一个刷新触发源，不影响面板可用）。
		   */
		  subscribeCommands() {
		    const subscribe = this.options.subscribeCommandExecuted;
		    if (subscribe === void 0) return;
		    try {
		      this.commandDisposer = subscribe((sessionId, name2) => {
		        if (this.disposed || sessionId !== this.sessionId || name2 !== "tools") return;
		        if (this.state.phase === "idle") return;
		        void this.refresh();
		      });
		    } catch {
		      this.commandDisposer = void 0;
		    }
		  }
		  /** 面板打开时挂一次 focus 监听（重复 `open()` 不重复挂，已挂则不动）。 */
		  attachFocus() {
		    if (this.focusDisposer !== void 0) return;
		    const attach = this.options.attachFocusListener;
		    if (attach === void 0) return;
		    try {
		      this.focusDisposer = attach(() => {
		        if (this.disposed || this.state.phase === "idle") return;
		        void this.refresh();
		      });
		    } catch {
		      this.focusDisposer = void 0;
		    }
		  }
		  /** 摘 focus 监听（未挂时是空操作）。 */
		  detachFocus() {
		    this.focusDisposer?.();
		    this.focusDisposer = void 0;
		  }
		  /**
		   * mutation 之后应处的阶段。
		   *
		   * - 面板已关闭（`idle`）：保持关闭，不因为一次迟到的 mutation 响应把 Modal 打开；
		   * - 面板开着且有快照：`ready`（失败只加错误行，不销毁面板，§3.6）；
		   * - 面板开着但还没有过任何快照：`failed`（没有可渲染内容）。
		   * @returns 目标阶段。
		   */
		  mutationPhase() {
		    if (this.state.phase === "idle") return "idle";
		    return this.state.snapshot === void 0 ? "failed" : "ready";
		  }
		  /**
		   * 落一次拉取结果：只允许最后一次发出的拉取提交（`close()` / 新拉取会推进序号）。
		   * @param seq - 该次拉取启动时的序号。
		   * @param change - 要合并进状态的变化。
		   */
		  commitLoad(seq, change) {
		    if (this.disposed || seq !== this.loadSeq) return;
		    this.patch(change);
		  }
		  /**
		   * 落一次工作区读 / 写结果：与 {@link PanelController.commitLoad} 同一条纪律，只允许最后
		   * 一次发出的操作提交（`close()` / 下一次读或写 / `dispose()` 都会推进序号）。
		   * @param seq - 该次操作启动时的序号。
		   * @param change - 要合并进状态的变化。
		   */
		  commitWorkspace(seq, change) {
		    if (this.disposed || seq !== this.workspaceSeq) return;
		    this.patch(change);
		  }
		  /**
		   * 构造 `workspace` 端点的请求体（精确 payload，不多带键）。
		   *
		   * 两种寻址形态恰好出现一个；`addresses` 只在 `set` / `off` / `on` 下采用——`read` /
		   * `reset` 带地址会被宿主 strict parser 拒绝，所以这里直接不给（即使调用方误传空数组）。
		   * @param action - 动作。
		   * @param addresses - 目标地址（可缺省）。
		   * @param key - 工作区规范路径（省略 = 按会话寻址）。
		   * @returns 只含必需 / 显式字段的请求。
		   */
		  workspaceRequest(action, addresses, key) {
		    const target = key === void 0 ? { sessionId: this.sessionId } : { workspacePath: key };
		    const writes = action === "set" || action === "off" || action === "on";
		    if (!writes || addresses === void 0) return { ...target, action };
		    return { ...target, action, addresses: [...addresses] };
		  }
		  /**
		   * 合并状态并通知：先 `onChange`，再逐个 `subscribe` 的监听者。
		   * @param change - 要覆盖的字段。
		   */
		  patch(change) {
		    this.state = { ...this.state, ...change };
		    this.options.onChange?.();
		    for (const listener of Array.from(this.listeners)) listener();
		  }
		  /**
		   * 现取面板客户端。
		   *
		   * 解析器本身抛错（例如装配期读 `connection` 的方式出错）时按「未就绪」处理：
		   * 状态机承诺动作方法不抛错，不能让一个 `TypeError` 漏给渲染层。
		   * @returns 客户端或 `undefined`。
		   */
		  resolveClient() {
		    try {
		      return this.options.resolveClient();
		    } catch {
		      return void 0;
		    }
		  }
		  /**
		   * 取当前时间（测试注入固定值）。
		   * @returns epoch ms。
		   */
		  now() {
		    return this.options.now?.() ?? Date.now();
		  }
		};

		// src/client/defaults-view.ts
		var SKILL_GROUP_ADDRESS = "tool:skill";
		function switchAddressesOf(universe) {
		  const addresses = /* @__PURE__ */ new Set();
		  if (universe === null || !universe.layerReady) return addresses;
		  for (const group of universe.groups) {
		    if (group.address !== null) addresses.add(group.address);
		    for (const entry of group.tools) addresses.add(entry.address);
		  }
		  return addresses;
		}
		function defaultsCountsOf(universe, disabled) {
		  const addresses = switchAddressesOf(universe);
		  const disabledSet = new Set(disabled);
		  let inDefaults = 0;
		  for (const address of addresses) {
		    if (disabledSet.has(address)) inDefaults += 1;
		  }
		  return {
		    listed: addresses.size,
		    inDefaults,
		    residual: residualOf(universe, disabled).length
		  };
		}
		function residualOf(universe, disabled) {
		  const addresses = switchAddressesOf(universe);
		  const residual = /* @__PURE__ */ new Set();
		  for (const address of disabled) {
		    if (!addresses.has(address)) residual.add(address);
		  }
		  return Array.from(residual).sort();
		}
		function filterDefaultsView(universe, disabled, query) {
		  const needle = (query ?? "").trim().toLowerCase();
		  if (needle === "") {
		    return { universe, residual: residualOf(universe, disabled), filtering: false };
		  }
		  const residual = residualOf(universe, disabled).filter(
		    (address) => address.toLowerCase().includes(needle)
		  );
		  if (universe === null) {
		    return { universe, residual, filtering: true };
		  }
		  const groups = [];
		  for (const group of universe.groups) {
		    const filtered = filteredGroupOf(group, needle);
		    if (filtered !== null) groups.push(filtered);
		  }
		  return { universe: { ...universe, groups }, residual, filtering: true };
		}
		function filteredGroupOf(group, needle) {
		  if (group.key.toLowerCase().includes(needle)) return group;
		  const hasRowHit = group.tools.some((entry) => entryMatchesQuery(entry, needle));
		  return hasRowHit ? group : null;
		}
		function entryMatchesQuery(entry, needle) {
		  if (entry.shortName.toLowerCase().includes(needle)) return true;
		  if (entry.address.toLowerCase().includes(needle)) return true;
		  const description = entry.description;
		  return description !== void 0 && description.toLowerCase().includes(needle);
		}
		function universeOfSnapshot(snapshot) {
		  const groups = snapshot.groups.map(
		    (group) => group.kind === "skill" ? skillGroupOf(group, snapshot.skills) : projectedGroupOf(group)
		  );
		  return {
		    layerReady: true,
		    skillsAvailable: !snapshot.notices.includes("skills-unavailable"),
		    groups
		  };
		}
		function projectedGroupOf(group) {
		  return {
		    kind: group.kind,
		    key: group.key,
		    address: group.address,
		    tools: group.tools.map(defaultsEntryOf)
		  };
		}
		function skillGroupOf(group, skills) {
		  return {
		    kind: "skill",
		    key: group.key,
		    address: group.address ?? SKILL_GROUP_ADDRESS,
		    tools: skills.map(skillEntryOf)
		  };
		}
		function defaultsEntryOf(tool) {
		  return {
		    address: tool.address,
		    shortName: tool.shortName,
		    // 条件展开：键存在但值为 undefined 会让「有没有描述」依赖访问方式（`in` 与
		    // `=== undefined` 给出不同答案），与宿主 `defaultsEntryOf` 同一纪律。
		    ...tool.description === void 0 ? {} : { description: tool.description },
		    protected: tool.protected,
		    reserved: tool.reserved
		  };
		}
		function skillEntryOf(skill) {
		  const description = skill.description;
		  return {
		    address: `skill:${skill.name}`,
		    shortName: skill.name,
		    ...description === void 0 || description === "" ? {} : { description },
		    protected: false,
		    reserved: false
		  };
		}

		// src/client/DefaultsEditor.tsx
		var import_react4 = require("react");
		var import_dsh_client_ui_primitives4 = require("@deepseek-ai/dsh-client-ui-primitives");

		// src/client/DefaultsGroupList.tsx
		var import_react2 = require("react");
		var import_dsh_client_ui_primitives2 = require("@deepseek-ai/dsh-client-ui-primitives");

		// src/client/ToolPanelGroups.tsx
		var import_react = require("react");
		var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

		// src/client/panel.module.css
		var cssText = "/*\n * \u4F1A\u8BDD\u5DE5\u5177\u9762\u9762\u677F\u7684\u5C42\u7EA7\u6837\u5F0F\uFF08\u8BBE\u8BA1\u9644\u5F55 \xA71.1 \u7684 `panel.stt_module_41d0f6.stt_css_41d0f6` \u884C\uFF09\u3002\n *\n * \u9AA8\u67B6\uFF08\u906E\u7F69\u3001\u5361\u7247\u3001\u6807\u9898\u3001\u5173\u95ED\u6309\u94AE\u3001\u6309\u94AE\u3001\u5F00\u5173\u3001\u8F93\u5165\u6846\uFF09\u5168\u90E8\u7531\u5B98\u65B9 primitives \u63D0\u4F9B\uFF0C\u672C\u6587\u4EF6\n * \u53EA\u8865 Modal \u9AA8\u67B6\u4E4B\u5916\u7684\u5C42\u7EA7\uFF1A\u5206\u533A\u6807\u9898\u3001\u884C\u9AD8\u3001\u5FBD\u6807\u3001\u7981\u7528\u6001\u3001\u6298\u53E0\u7BAD\u5934\u3001chip\u3002\u989C\u8272\u4E00\u5F8B\u53D6\u5B98\u65B9\n * `--dsw-alias-*` \u8BBE\u8BA1\u4EE4\u724C\u5E76\u5E26\u9759\u6001\u515C\u5E95\u2014\u2014\u4EE4\u724C\u6539\u540D\u65F6\u6700\u574F\u9000\u5316\u6210\u53EF\u8BFB\u7684\u9ED1\u767D\u800C\u4E0D\u662F\u900F\u660E\u3002\n *\n * \u4E24\u5904\u4E0E\u5B98\u65B9\u7EC4\u4EF6\u540C\u540D\u7684\u8986\u76D6\uFF08`.stt_trigger_41d0f6` \u538B Button \u7684\u5C3A\u5BF8\u4E0E\u914D\u8272\uFF09\u6CBF\u7528\u4ED3\u5185\u5148\u4F8B\n * \uFF08`plugins/web-ux/src/client/delete.stt_module_41d0f6.stt_css_41d0f6` \u7684 `.stt_danger_41d0f6`\uFF09\uFF1Aprimitives \u7684\u6837\u5F0F\u540C\u6837\u662F\n * \u5355\u7C7B\u9009\u62E9\u5668\uFF0C\u63D2\u4EF6\u6837\u5F0F\u5728\u5176\u540E\u6CE8\u5165\u5373\u751F\u6548\u3002\n */\n\n/* \u2014\u2014 \u4F1A\u8BDD\u5934\u90E8\u7684\u5165\u53E3\u6309\u94AE\uFF1A28px \u5706\u5F62\uFF0C\u89C6\u89C9\u4E0E\u540C\u5EA7\u4F4D\u7684\u5B98\u65B9\u89E6\u53D1\u5668\u4E00\u81F4\uFF08\u8BBE\u8BA1 \xA73.1\uFF09 \u2014\u2014 */\n.stt_trigger_41d0f6 {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  width: 28px;\n  min-width: 28px;\n  height: 28px;\n  padding: 0;\n  color: var(--dsw-alias-label-tertiary, #7f8287);\n  border-radius: 28px;\n}\n\n.stt_trigger_41d0f6:hover:not(:disabled) {\n  color: var(--dsw-alias-label-primary, #000);\n  background: var(--dsw-alias-interactive-bg-hover, rgb(0 0 0 / 6%));\n}\n\n/* \u2014\u2014 \u9762\u677F\u5361\u7247\u4E0E\u6EDA\u52A8\u533A\uFF1A\u5BBD min(760px, 100vw - 32px)\uFF0C\u6B63\u6587\u533A\u81EA\u5DF1\u6EDA\uFF08\u8BBE\u8BA1 \xA73.2\uFF09 \u2014\u2014 */\n.stt_dialog_41d0f6 {\n  box-sizing: border-box;\n  display: flex;\n  flex-direction: column;\n  width: min(760px, calc(100vw - 32px));\n  max-width: min(760px, calc(100vw - 32px));\n  max-height: calc(100vh - 96px);\n}\n\n.stt_content_41d0f6 {\n  display: flex;\n  flex-direction: column;\n  gap: 18px;\n  min-height: 0;\n  overflow-y: auto;\n}\n\n/* \u2014\u2014 \u5206\u533A\u4E0E\u5206\u533A\u6807\u9898\uFF08\u56DB\u6BB5\u81EA\u4E0A\u800C\u4E0B\uFF09 \u2014\u2014 */\n.stt_section_41d0f6 {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n}\n\n.stt_sectionTitle_41d0f6 {\n  margin: 0;\n  color: var(--dsw-alias-label-secondary, #545557);\n  font-size: 13px;\n  font-weight: 600;\n  line-height: 20px;\n  letter-spacing: 0.01em;\n}\n\n/* \u2014\u2014 \u72B6\u6001\u6458\u8981\uFF1A\u4E24\u8BA1\u6570\u4E00\u884C + \u4E09\u6761\u4E8B\u5B9E\u884C \u2014\u2014 */\n.stt_counters_41d0f6 {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 2px 18px;\n  margin: 0;\n  padding: 0;\n  color: var(--dsw-alias-label-secondary, #545557);\n  font-size: 13px;\n  line-height: 20px;\n  list-style: none;\n}\n\n.stt_meta_41d0f6 {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 2px 12px;\n  margin: 0;\n  color: var(--dsw-alias-label-tertiary, #7f8287);\n  font-size: 12px;\n  line-height: 18px;\n}\n\n.stt_muted_41d0f6 {\n  margin: 0;\n  color: var(--dsw-alias-label-tertiary, #7f8287);\n  font-size: 13px;\n  line-height: 20px;\n}\n\n/* \u53D8\u66F4\u4EE3\u4EF7\u5F62\u72B6\uFF08`mutation.stt_kv_41d0f6`\uFF09\uFF1A\u4FE1\u606F\u6027\u63D0\u793A\uFF0C\u7528\u4E1A\u52A1\u84DD\u800C\u4E0D\u662F\u8B66\u544A\u8272\u3002 */\n.stt_notice_41d0f6 {\n  margin: 0;\n  color: var(--dsw-alias-state-business-primary, #1a67e0);\n  font-size: 12px;\n  line-height: 18px;\n}\n\n/* \u964D\u7EA7\u63D0\u793A\uFF08`persistence-degraded`\uFF09\u4E0E\u9ED8\u8BA4\u6863\u635F\u574F\uFF1A\u5FC5\u987B\u8BFB\u5230\u7684\u574F\u6D88\u606F\u3002 */\n.stt_warning_41d0f6 {\n  margin: 0;\n  color: var(--dsw-alias-state-warn-primary, #dd8629);\n  font-size: 12px;\n  line-height: 18px;\n}\n\n/* \u2014\u2014 \u5931\u8D25\u884C\uFF1A\u4E3B\u6587\u6848\u672C\u5730\u5316\uFF0C\u5BBF\u4E3B\u539F\u6587\u53EA\u4F5C\u4E8C\u7EA7\u7070\u5B57\uFF08\u8BBE\u8BA1 \xA73.5\uFF09 \u2014\u2014 */\n.stt_error_41d0f6 {\n  margin: 0;\n  color: var(--dsw-alias-state-error-primary, #ec1313);\n  font-size: 13px;\n  line-height: 20px;\n}\n\n.stt_detail_41d0f6 {\n  margin: 4px 0 0;\n  color: var(--dsw-alias-label-tertiary, #7f8287);\n  font-size: 12px;\n  line-height: 18px;\n  word-break: break-word;\n}\n\n/* \u4E0D\u53EF\u7528\u964D\u7EA7\uFF1A\u6CA1\u6709\u5FEB\u7167\u65F6\u72EC\u5360\u6B63\u6587\u533A\uFF0C\u7ED9\u8FD9\u5757\u5360\u4F4D\u4E00\u70B9\u5185\u8FB9\u8DDD\u3002 */\n.stt_failureBlock_41d0f6 {\n  padding: 10px 0;\n}\n\n.stt_loading_41d0f6 {\n  margin: 0;\n  color: var(--dsw-alias-label-tertiary, #7f8287);\n  font-size: 14px;\n  line-height: 22px;\n}\n\n/* \u2014\u2014 \u5206\u7EC4\u6E05\u5355 \u2014\u2014 */\n.stt_groups_41d0f6 {\n  display: flex;\n  flex-direction: column;\n  margin: 0;\n  padding: 0;\n  list-style: none;\n}\n\n.stt_group_41d0f6 {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n  border-top: 1px solid var(--dsw-alias-border-l1, rgb(0 0 0 / 6%));\n}\n\n.stt_group_41d0f6:first-child {\n  border-top: none;\n}\n\n.stt_groupHeader_41d0f6 {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  min-height: 32px;\n}\n\n/* \u6807\u9898\u533A\u662F\u6298\u53E0\u76EE\u6807\uFF1A\u94FA\u6EE1\u5269\u4F59\u5BBD\u5EA6\uFF0C\u5F00\u5173\u5728\u53F3\u4FA7\u72EC\u7ACB\u6210\u547D\u4E2D\u533A\uFF08\u70B9\u5F00\u5173\u4E0D\u6298\u53E0\uFF09\u3002 */\n.stt_groupToggle_41d0f6 {\n  display: flex;\n  flex: 1 1 auto;\n  align-items: center;\n  gap: 8px;\n  min-width: 0;\n  padding: 4px 6px;\n  color: inherit;\n  font: inherit;\n  text-align: left;\n  cursor: pointer;\n  background: none;\n  border: 0;\n  border-radius: 8px;\n}\n\n.stt_groupToggle_41d0f6:hover {\n  background: var(--dsw-alias-interactive-bg-hover, rgb(0 0 0 / 6%));\n}\n\n.stt_groupTitle_41d0f6 {\n  color: var(--dsw-alias-label-primary, #000);\n  font-size: 13px;\n  font-weight: 600;\n  white-space: nowrap;\n}\n\n.stt_groupName_41d0f6 {\n  overflow: hidden;\n  color: var(--dsw-alias-label-secondary, #545557);\n  font-family: var(--ds-font-family-code, monospace);\n  font-size: 12px;\n  white-space: nowrap;\n  text-overflow: ellipsis;\n}\n\n.stt_groupCounts_41d0f6 {\n  color: var(--dsw-alias-label-tertiary, #7f8287);\n  font-size: 12px;\n  white-space: nowrap;\n}\n\n/* \u5185\u7F6E\u5DE5\u5177\u5206\u533A\u7684\u672C\u5730\u8FC7\u6EE4\u8F93\u5165\uFF08\u53EA\u5F71\u54CD\u5C55\u793A\uFF09\u3002 */\n.stt_filterRow_41d0f6 {\n  padding: 0 6px 6px;\n}\n\n.stt_filter_41d0f6 {\n  display: inline-flex;\n  width: 100%;\n}\n\n.stt_filter_41d0f6 input {\n  width: 100%;\n}\n\n/* \u7EC4\u5185\u5DE5\u5177\u884C\uFF1A\u4E00\u884C\u4E00\u4E2A\u5F00\u5173\uFF0C\u884C\u9AD8\u5BF9\u9F50 Switch \u7684 28px \u547D\u4E2D\u533A\u3002 */\n.stt_rows_41d0f6 {\n  display: flex;\n  flex-direction: column;\n  margin: 0 0 6px;\n  padding: 0 6px 0 26px;\n  list-style: none;\n}\n\n/* \u2014\u2014 \u6280\u80FD\u884C\uFF08C11 / \u4EFB\u52A1 7.7\uFF09\uFF1A`SkillPanel` \u590D\u7528\u540C\u4E00\u5957 `.stt_rows_41d0f6` / `.stt_row_41d0f6` / `.stt_tag_41d0f6` / `.stt_pending_41d0f6`\uFF0C\n *    \u4F46\u5B83\u7684\u5217\u8868**\u76F4\u63A5\u6302\u5728\u5206\u533A\u4E0B**\uFF08\u6CA1\u6709\u5206\u7EC4\u6807\u9898\u884C\uFF09\uFF0C26px \u7684\u5C42\u7EA7\u7F29\u8FDB\u5728\u8FD9\u91CC\u4F1A\u4E0E\u5206\u533A\u6807\u9898\u9519\u4F4D\uFF0C\n *    \u6240\u4EE5\u53EA\u53D6\u6D88\u7F29\u8FDB\u3001\u5176\u4F59\u4E0E\u5DE5\u5177\u884C\u5B8C\u5168\u4E00\u81F4\uFF08\u4E00\u884C\u4E00\u4E2A\u5F00\u5173\u3001\u7B49\u5BBD\u540D\u5B57\u3001\u72B6\u6001\u6807\u7B7E\uFF09\u3002\n *    \u5DE5\u5177\u884C\u7684 `.stt_rows_41d0f6` \u5D4C\u5728 `.stt_group_41d0f6` \u91CC\uFF0C\u4E0D\u53D7\u8FD9\u6761\u76F4\u63A5\u5B50\u9009\u62E9\u5668\u5F71\u54CD\u3002 \u2014\u2014 */\n.stt_section_41d0f6 > .stt_rows_41d0f6 {\n  padding-left: 0;\n}\n\n.stt_row_41d0f6 {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n  min-height: 30px;\n}\n\n.stt_rowName_41d0f6 {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  min-width: 0;\n}\n\n.stt_name_41d0f6 {\n  overflow: hidden;\n  color: var(--dsw-alias-label-primary, #000);\n  font-family: var(--ds-font-family-code, monospace);\n  font-size: 12px;\n  white-space: nowrap;\n  text-overflow: ellipsis;\n}\n\n/* \u884C\u7EA7\u9501\u5B9A\u77ED\u6807\u7B7E\uFF08`entry.stt_protected_41d0f6` / `entry.stt_reserved_41d0f6`\uFF09\u3002 */\n.stt_tag_41d0f6 {\n  flex: none;\n  padding: 0 6px;\n  color: var(--dsw-alias-label-tertiary, #7f8287);\n  font-size: 11px;\n  line-height: 16px;\n  border: 1px solid var(--dsw-alias-border-l2, rgb(0 0 0 / 12%));\n  border-radius: 999px;\n}\n\n/* \u300C\u6B63\u5728\u5E94\u7528\u2026\u300D\uFF1A\u4E0E\u884C\u6807\u7B7E\u540C\u7EA7\uFF0C\u4E0D\u62A2\u6CE8\u610F\u529B\u3002 */\n.stt_pending_41d0f6 {\n  flex: none;\n  color: var(--dsw-alias-label-tertiary, #7f8287);\n  font-size: 11px;\n  line-height: 16px;\n}\n\n.stt_empty_41d0f6 {\n  padding: 2px 0 6px;\n  color: var(--dsw-alias-label-tertiary, #7f8287);\n  font-size: 12px;\n  line-height: 18px;\n}\n\n/* \u2014\u2014 \u5173\u95ED\u96C6 / \u9ED8\u8BA4\u6863\u5171\u7528\u7684 chip \u5217\u8868 \u2014\u2014 */\n.stt_chips_41d0f6 {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 6px;\n  margin: 0;\n  padding: 0;\n  list-style: none;\n}\n\n.stt_chip_41d0f6 {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  max-width: 100%;\n  padding: 2px 4px 2px 8px;\n  background: var(--dsw-alias-bg-layer-2, #f7f7f8);\n  border: 1px solid var(--dsw-alias-border-l1, rgb(0 0 0 / 6%));\n  border-radius: 999px;\n}\n\n.stt_address_41d0f6 {\n  font-family: var(--ds-font-family-code, monospace);\n  font-size: 12px;\n  color: var(--dsw-alias-label-secondary, #545557);\n  word-break: break-all;\n}\n\n/* `intent` \u5FBD\u6807\uFF1A\u8BE5\u5730\u5740\u5F53\u524D 0 \u5339\u914D\uFF0C\u610F\u56FE\u5DF2\u8BB0\u5F55\uFF08\u8BBE\u8BA1 \xA73.2 \u7B2C 4 \u6BB5\uFF09\u3002 */\n.stt_badge_41d0f6 {\n  flex: none;\n  padding: 0 6px;\n  color: var(--dsw-alias-label-primary-inverted, #fff);\n  font-size: 11px;\n  line-height: 16px;\n  background: var(--dsw-alias-state-business-primary, #1a67e0);\n  border-radius: 999px;\n}\n\n/* \u2014\u2014 \u9ED8\u8BA4\u6863\u7F16\u8F91\u533A \u2014\u2014 */\n.stt_path_41d0f6 {\n  color: var(--dsw-alias-label-secondary, #545557);\n  font-family: var(--ds-font-family-code, monospace);\n  font-size: 12px;\n  word-break: break-all;\n}\n\n.stt_addRow_41d0f6 {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n}\n\n/* \u2014\u2014 \u5DE5\u4F5C\u533A\u9ED8\u8BA4\u6863\u4E0B\u62C9\uFF08\u5BF9\u8BDD\u6846\u5F62\u6001\uFF09\uFF1A\u539F\u751F select\uFF0C\u4E0E\u8F93\u5165\u6846\u540C\u9AD8\uFF08C2\uFF09 \u2014\u2014 */\n.stt_select_41d0f6 {\n  flex: 1 1 auto;\n  min-width: 0;\n  height: 32px;\n  padding: 0 8px;\n  color: var(--dsw-alias-label-secondary, #545557);\n  font-size: 13px;\n  background: var(--dsw-alias-bg-layer-2, #f7f7f8);\n  border: 1px solid var(--dsw-alias-border-l1, rgb(0 0 0 / 6%));\n  border-radius: 6px;\n}\n\n/* \u5DE5\u4F5C\u533A\u9ED8\u8BA4\u6863\u5206\u8282\u7684\u6B63\u6587\u58F3\uFF08\u7EDF\u4E00\u300C\u5DE5\u4F5C\u533A\u914D\u7F6E\u300D\u5F39\u7A97\u7684\u4E00\u4E2A\u5206\u8282\uFF09\uFF1A\u53EA\u505A\u7EB5\u5411\u6392\u5E03\u3002\n * \u5BBD\u5EA6 / \u9AD8\u5EA6 / \u6EDA\u52A8\u7EA6\u675F\u5F52 holder \u5F39\u7A97\u7684\u5185\u5BB9\u5217\uFF08`workspace-config` \u7684 dialog.stt_module_41d0f6.stt_css_41d0f6\uFF09\uFF0C\n * \u672C\u8282**\u4E0D**\u81EA\u5E26\u5361\u7247\u5BBD\u5EA6\uFF0C\u4E5F\u4E0D\u81EA\u5E26 Modal\u3002 */\n.stt_workspaceBody_41d0f6 {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n}\n\n.stt_actions_41d0f6 {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  margin-top: 4px;\n}\n\n/* \u300C\u5DF2\u4FDD\u5B58\uFF08\u672C\u4F1A\u8BDD\u4E0D\u53D8\uFF09\u300D\uFF1A\u4FDD\u5B58\u6210\u529F\u7684\u77AC\u65F6\u786E\u8BA4\uFF0C\u7528\u6210\u529F\u8272\u3002 */\n.stt_saved_41d0f6 {\n  color: var(--dsw-alias-state-success-primary, #16955f);\n  font-size: 12px;\n  line-height: 18px;\n}\n\n/* \u2014\u2014 B \u7684\u9ED8\u8BA4\u6863\u5206\u7EC4\u5F00\u5173\u754C\u9762 \u2014\u2014 */\n\n/* \u9762\u677F\u4E24\u5206\u533A\u7684\u53EF\u6298\u53E0\u58F3\uFF08`DefaultsSectionFrame`\uFF09\uFF1A\u58F3\u672C\u8EAB\u65E0\u80CC\u666F\u65E0\u8FB9\u6846\uFF0C\u89C6\u89C9\u9760\u6807\u9898\u884C\uFF1B\n * \u9876\u90E8\u7559\u767D\u53D6\u5206\u533A\u8282\u594F\uFF0C\u4E0E\u76F8\u90BB\u5206\u533A\u62C9\u5F00\u4E00\u6863\uFF08\u5185\u5BB9\u5217\u53E6\u6709 18px \u7684\u5206\u533A\u95F4\u8DDD\uFF09\u3002 */\n.stt_sectionFrame_41d0f6 {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n  margin-top: 6px;\n  background: none;\n  border: 0;\n}\n\n/* \u6B8B\u7559 chips \u533A\u7684\u6807\u9898\uFF08\u53EA\u53EF\u79FB\u9664\uFF09\uFF1A\u5C0F\u5B57\u53F7\u3001\u6B21\u8981\u8272\uFF0C\u4E0E\u4E0A\u65B9\u7684\u7EC4\u5217\u8868\u62C9\u5F00\u3002 */\n.stt_residual_41d0f6 {\n  margin: 8px 0 0;\n  color: var(--dsw-alias-label-tertiary, #7f8287);\n  font-size: 12px;\n  line-height: 18px;\n}\n\n/* \u2014\u2014 \u5DE5\u4F5C\u533A\u9ED8\u8BA4\u6863\u9875\u9762\uFF08`WorkspaceDefaultsPage`\uFF0CB1 \u4E09\u5361 + \u811A\u6CE8 + \u9875\u811A\uFF1B\u8BBE\u8BA1 \u24623.7\uFF09\u2014\u2014\n * \u9875\u9762\u6B63\u6587\u4ECE\u300C\u516D\u6BB5\u5E73\u94FA\u300D\u91CD\u6392\u4E3A\u5361\u7247\u5E03\u5C40\uFF1A\u6D45\u5E95\u5361\uFF08bg-layer-2\uFF09+ 12px \u5706\u89D2 + \u7EC6\u8FB9\uFF08border-l1\uFF09\uFF0C\n * \u4E0E\u7EDF\u4E00\u300C\u5DE5\u4F5C\u533A\u914D\u7F6E\u300D\u9875\u7684\u5176\u4ED6\u5206\u8282\u540C\u4E00\u89C6\u89C9\u8BED\u8A00\u3002\u4EE4\u724C\u7EAA\u5F8B\u4E0E\u4E0A\u6587\u4E00\u81F4\uFF1A\u6BCF\u5904\n * `var(--dsw-alias-*, <\u9759\u6001\u515C\u5E95>)`\uFF0C\u4EE4\u724C\u6539\u540D\u65F6\u6700\u574F\u9000\u5316\u6210\u53EF\u8BFB\u7684\u9ED1\u767D\u800C\u4E0D\u662F\u900F\u660E\u3002 */\n\n/* \u9875\u9762\u6B63\u6587\u58F3\uFF1A\u4E09\u5361\u3001\u811A\u6CE8\u3001\u9875\u811A\u52A8\u4F5C\u533A\u7EB5\u5411\u6392\u5E03\uFF0C\u5361\u95F4\u4E00\u6863\u95F4\u8DDD\u3002 */\n.stt_workspacePage_41d0f6 {\n  display: flex;\n  flex-direction: column;\n  gap: 16px;\n}\n\n/* \u9875\u9762\u5361\u7247\uFF08\u6982\u8981\u5361 / \u6E05\u5355\u5361 / \u547D\u4EE4\u5361\u5171\u7528\uFF09\uFF1A\u6D45\u5E95\u7EC6\u8FB9\u5706\u89D2\uFF0C\u5361\u5185\u5143\u7D20\u7EB5\u5411\u95F4\u8DDD 10px\u3002 */\n.stt_card_41d0f6 {\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n  padding: 14px 16px;\n  background: var(--dsw-alias-bg-layer-2, #f7f7f8);\n  border: 1px solid var(--dsw-alias-border-l1, rgb(0 0 0 / 6%));\n  border-radius: 12px;\n}\n\n/* \u5361\u5934\uFF1A\u6807\u9898 + \u5FBD\u7AE0 + \u53F3\u63A8\u52A8\u4F5C\u540C\u884C\u6392\u5E03\uFF0C\u7A84\u5904\u5141\u8BB8\u6362\u884C\u3002 */\n.stt_cardHeader_41d0f6 {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  flex-wrap: wrap;\n}\n\n/* \u5361\u6807\u9898\uFF08<p>\uFF0C\u975E heading\u2014\u2014\u53EF\u8BBF\u95EE\u540D\u7531 holder \u7684 tab \u63D0\u4F9B\uFF09\uFF1A\u4E0E\u5206\u533A\u6807\u9898\u540C\u5B57\u53F7\u52A0\u91CD\u3002 */\n.stt_cardTitle_41d0f6 {\n  margin: 0;\n  color: var(--dsw-alias-label-primary, #000);\n  font-size: 13px;\n  font-weight: 600;\n  line-height: 20px;\n}\n\n/* \u767B\u8BB0\u6001\u5FBD\u7AE0\uFF1A`.stt_badge_41d0f6` \u5728\u9762\u677F\u91CC\u5DF2\u662F intent \u5FBD\u6807\uFF08\u84DD\u5E95\u767D\u5B57\uFF0C`.stt_chip_41d0f6` \u5185\uFF09\uFF0CCSS module \u540C\u540D\n * \u5BFC\u51FA\u53EA\u6709\u4E00\u4E2A\u7C7B\u540D\uFF0C\u9875\u9762\u5FBD\u7AE0\u501F\u5B83\u6E32\u67D3\u2014\u2014\u5728 `.stt_cardHeader_41d0f6` \u4F5C\u7528\u57DF\u5185\u5168\u91CF\u6362\u6210\u300C\u7EC6\u8FB9 + \u7070\u5B57 +\n * \u900F\u660E\u5E95\u300D\u7684\u767B\u8BB0\u6001\u89C6\u89C9\uFF1B\u9762\u677F intent \u5FBD\u6807\u4E0D\u5728\u6B64\u4F5C\u7528\u57DF\uFF0C\u96F6\u5F71\u54CD\u3002 */\n.stt_cardHeader_41d0f6 .stt_badge_41d0f6 {\n  padding: 0 6px;\n  color: var(--dsw-alias-label-tertiary, #7f8287);\n  font-size: 11px;\n  line-height: 16px;\n  background: none;\n  border: 1px solid var(--dsw-alias-border-l2, rgb(0 0 0 / 12%));\n  border-radius: 999px;\n}\n\n/* \u5361\u5934\u53F3\u63A8\u5360\u4F4D / \u63A8\u94AE\uFF1A\u628A\u5237\u65B0\u6309\u94AE\u63A8\u5230\u884C\u5C3E\u3002 */\n.stt_push_41d0f6 {\n  margin-left: auto;\n}\n\n/* \u6982\u8981\u4E8B\u5B9E\u884C\uFF08dl\uFF09\uFF1A\u5DE5\u4F5C\u533A key / \u6863\u6587\u4EF6\u8DEF\u5F84\u4E24\u884C\u952E\u503C\u5BF9\u3002 */\n.stt_facts_41d0f6 {\n  display: grid;\n  gap: 4px;\n  margin: 0;\n}\n\n.stt_fact_41d0f6 {\n  display: flex;\n  align-items: baseline;\n  gap: 8px;\n  font-size: 12px;\n  line-height: 18px;\n}\n\n.stt_factTerm_41d0f6 {\n  flex: none;\n  color: var(--dsw-alias-label-tertiary, #7f8287);\n}\n\n/* \u4E8B\u5B9E\u503C\uFF08key / \u8DEF\u5F84\uFF09\uFF1A\u7B49\u5BBD\u3001\u53EF\u65AD\u884C\u2014\u2014\u89C4\u8303\u8DEF\u5F84\u53EF\u80FD\u5F88\u957F\u3002 */\n.stt_factValue_41d0f6 {\n  min-width: 0;\n  color: var(--dsw-alias-label-secondary, #545557);\n  font-family: var(--ds-font-family-code, monospace);\n  word-break: break-all;\n}\n\n/* \u4E09\u8BA1\u6570\u6458\u8981\u884C\uFF08\u6E05\u5355 N \xB7 \u9ED8\u8BA4\u5173 M \xB7 \u6B8B\u7559 K\uFF09\uFF1A\u7B49\u5BBD\u6570\u5B57\u907F\u514D\u5237\u65B0\u65F6\u8DF3\u52A8\u3002 */\n.stt_counts_41d0f6 {\n  margin: 0;\n  color: var(--dsw-alias-label-secondary, #545557);\n  font-size: 12px;\n  line-height: 18px;\n  font-variant-numeric: tabular-nums;\n}\n\n/* \u6E05\u5355\u5361\u5934\uFF08\u24623.7 \u51BB\u7ED3\u540D\uFF09\uFF1A\u4E0E `.stt_cardHeader_41d0f6` \u540C\u6B3E\u6392\u5E03\uFF0C\u4F9B\u7ED3\u6784\u56FE\u7684\u6E05\u5355\u5361\u5934\u4F4D\u53D6\u7528\u3002 */\n.stt_listHeader_41d0f6 {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  flex-wrap: wrap;\n}\n\n/* \u9875\u9762\u7EA7\u5168\u5C40\u8FC7\u6EE4\u6846\uFF1A\u53F3\u63A8\u5230\u5361\u5934\u884C\u5C3E\uFF0C\u5BBD\u4E0A\u9650 280px\u3001\u7A84\u5904\u6536\u7F29\u5230\u6EE1\u5BBD\u3002 */\n.stt_pageFilter_41d0f6 {\n  margin-left: auto;\n  width: min(280px, 100%);\n}\n\n/* \u7A7A\u6001\u5757\uFF08\u7A7A\u6863 / \u7A7A\u5B87\u5B99\uFF09\uFF1A\u865A\u7EBF\u8FB9\u6846 + \u5361\u5185\u6D45\u5E95\uFF0C\u4E0E\u53EF\u4EA4\u4E92\u7684\u6E05\u5355\u4F53\u62C9\u5F00\u3002 */\n.stt_emptyBlock_41d0f6 {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n  padding: 12px;\n  background: var(--dsw-alias-bg-layer-1, #fff);\n  border: 1px dashed var(--dsw-alias-border-l2, rgb(0 0 0 / 12%));\n  border-radius: 8px;\n}\n\n/* \u7A7A\u6001\u6807\u9898\uFF1A\u4E3B\u5B57\u8272\u52A0\u91CD\uFF0C\u4E0E\u4E0B\u65B9\u63D0\u793A\u62C9\u5F00\u4E00\u7EA7\u3002 */\n.stt_emptyTitle_41d0f6 {\n  margin: 0;\n  color: var(--dsw-alias-label-primary, #000);\n  font-size: 13px;\n  font-weight: 600;\n  line-height: 20px;\n}\n\n/* \u7A7A\u6001\u63D0\u793A\uFF1A\u4E09\u7EA7\u7070\uFF0C\u8BB2\u6E05\u4E0B\u4E00\u6B65\u53BB\u54EA\u5173\u7B2C\u4E00\u9879 / \u4E3A\u4EC0\u4E48\u6E05\u5355\u662F\u7A7A\u7684\u3002 */\n.stt_emptyHint_41d0f6 {\n  margin: 0;\n  color: var(--dsw-alias-label-tertiary, #7f8287);\n  font-size: 12px;\n  line-height: 18px;\n}\n\n/* \u547D\u4EE4\u5361\u547D\u4EE4\u884C\uFF1A\u4EE3\u7801\u5757\u5360\u4E3B\u5217\u3001\u590D\u5236\u6309\u94AE\u53F3\u5217\uFF0C\u9876\u5BF9\u9F50\uFF08\u6309\u94AE\u77EE\u4E8E\u591A\u884C\u4EE3\u7801\u5757\uFF09\u3002 */\n.stt_commandRow_41d0f6 {\n  display: flex;\n  align-items: flex-start;\n  gap: 8px;\n}\n\n/* \u547D\u4EE4\u4EE3\u7801\u5757\uFF1A\u6587\u672C\u5373\u590D\u5236\u6587\u672C\uFF08D8\uFF09\u2014\u2014\u6D45\u5E95\u7EC6\u8FB9\u3001\u7B49\u5BBD\u3001\u53EF\u6362\u884C\u4E0D\u65AD\u8BED\u4E49\u3002 */\n.stt_command_41d0f6 {\n  flex: 1;\n  margin: 0;\n  padding: 8px 10px;\n  background: var(--dsw-alias-bg-layer-1, #fff);\n  border: 1px solid var(--dsw-alias-border-l1, rgb(0 0 0 / 6%));\n  border-radius: 8px;\n  font-family: var(--ds-font-family-code, monospace);\n  font-size: 12px;\n  line-height: 18px;\n  white-space: pre-wrap;\n  word-break: break-all;\n}\n\n/* \u811A\u6CE8\u5BB9\u5668\uFF1A\u5F71\u54CD\u8303\u56F4 / \u5E76\u96C6\u8BED\u4E49\u4E24\u53E5\u7EB5\u5411\u7D27\u51D1\u6392\u5217\u3002 */\n.stt_footnotes_41d0f6 {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n}\n\n/* \u6B21\u7EA7\u6CE8\u8BB0\uFF1A\u6E05\u5355\u8BED\u4E49\u53E5\u3001\u4E09\u6761\u6761\u4EF6\u6CE8\u8BB0\u3001\u547D\u4EE4\u8FB9\u754C\u8BF4\u660E\u4E0E\u811A\u6CE8\u6BB5\u5171\u7528\u540C\u6B3E\u3002 */\n.stt_note_41d0f6 {\n  margin: 0;\n  color: var(--dsw-alias-label-tertiary, #7f8287);\n  font-size: 12px;\n  line-height: 18px;\n}\n\n/* \u884C\u8BE6\u60C5\u4E3B\u5217\uFF08`DefaultsGroupList` \u7684 `showDetails` \u8DEF\u5F84\uFF09\uFF1A\u540D\u79F0 + \u63CF\u8FF0 + \u6807\u7B7E\u7EB5\u6392\uFF0C\n * \u5F00\u5173\u4ECD\u5728\u53F3\u5217\uFF1B`min-width: 0` \u8BA9\u7701\u7565\u53F7\u5728 flex \u884C\u5185\u751F\u6548\u3002 */\n.stt_rowMain_41d0f6 {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n  min-width: 0;\n}\n\n/* \u884C\u63CF\u8FF0\u6B21\u884C\uFF1A\u5355\u884C\u7701\u7565\uFF0C\u5168\u6587\u7ECF `title` \u60AC\u505C\u53EF\u89C1\u3002 */\n.stt_rowDescription_41d0f6 {\n  overflow: hidden;\n  color: var(--dsw-alias-label-tertiary, #7f8287);\n  font-size: 12px;\n  line-height: 16px;\n  white-space: nowrap;\n  text-overflow: ellipsis;\n}\n\n/* \u6280\u80FD\u6807\u7B7E\u884C\uFF1A\u6765\u6E90 / \u8C03\u7528\u65B9\u5F0F\u7B49\u5C0F\u6807\u7B7E\u7684\u6362\u884C\u96C6\u5408\u3002 */\n.stt_rowTags_41d0f6 {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 4px;\n}\n\n/* \u6280\u80FD\u6765\u6E90\u6807\u7B7E\uFF1A\u5706\u89D2\u7EC6\u8FB9\u5C0F\u6807\u7B7E\uFF0C\u4E0D\u6362\u884C\uFF08\u6574\u4E2A\u6807\u7B7E\u79FB\u5230\u4E0B\u4E00\u884C\u800C\u4E0D\u662F\u65AD\u5F00\uFF09\u3002 */\n.stt_metaTag_41d0f6 {\n  padding: 0 6px;\n  color: var(--dsw-alias-label-tertiary, #7f8287);\n  font-size: 11px;\n  line-height: 16px;\n  border: 1px solid var(--dsw-alias-border-l1, rgb(0 0 0 / 6%));\n  border-radius: 999px;\n  white-space: nowrap;\n}\n\n/* \u2014\u2014 R15 \u6807\u7B7E\u7740\u8272\u53D8\u4F53\uFF1A\u7EC4\u5408\u7C7B\uFF08\u53E0\u5728 `.stt_tag_41d0f6` / `.stt_metaTag_41d0f6` \u4E0A\uFF09\uFF0C\u53EA\u8986\u76D6\u524D\u666F\u4E0E\u63CF\u8FB9\uFF0C\n   \u5E95\u8272\u4FDD\u6301\u900F\u660E\uFF1B\u8272\u503C\u5168\u90E8\u8D70 alias \u72B6\u6001\u53D8\u91CF\u5E26\u5B57\u9762\u91CF\u56DE\u9000\uFF08\u6697\u8272\u4E3B\u9898\u5B89\u5168\uFF0C\u4E0E\u4ED3\u5185\n   `state-business/warn/error/success` \u5148\u4F8B\u540C\u6E90\uFF09\u3002 \u2014\u2014 */\n.stt_toneInfo_41d0f6 {\n  color: var(--dsw-alias-state-business-primary, #1a67e0);\n  border-color: var(--dsw-alias-state-business-primary, #1a67e0);\n}\n\n.stt_toneSuccess_41d0f6 {\n  color: var(--dsw-alias-state-success-primary, #16955f);\n  border-color: var(--dsw-alias-state-success-primary, #16955f);\n}\n\n.stt_toneWarn_41d0f6 {\n  color: var(--dsw-alias-state-warn-primary, #dd8629);\n  border-color: var(--dsw-alias-state-warn-primary, #dd8629);\n}\n\n.stt_toneDanger_41d0f6 {\n  color: var(--dsw-alias-state-error-primary, #ec1313);\n  border-color: var(--dsw-alias-state-error-primary, #ec1313);\n}\n\n";
		if (typeof document !== "undefined" && document.querySelector('style[data-dsh-plugin="dsh-plugin-session-tool-toggle"][data-dsh-css="41d0f6"]') === null) {
		  const style = document.createElement("style");
		  style.setAttribute("data-dsh-plugin", "dsh-plugin-session-tool-toggle");
		  style.setAttribute("data-dsh-css", "41d0f6");
		  style.textContent = cssText;
		  document.head.appendChild(style);
		}
		var panel_default = { "module": "stt_module_41d0f6", "css": "stt_css_41d0f6", "trigger": "stt_trigger_41d0f6", "danger": "stt_danger_41d0f6", "dialog": "stt_dialog_41d0f6", "content": "stt_content_41d0f6", "section": "stt_section_41d0f6", "sectionTitle": "stt_sectionTitle_41d0f6", "counters": "stt_counters_41d0f6", "meta": "stt_meta_41d0f6", "muted": "stt_muted_41d0f6", "kv": "stt_kv_41d0f6", "notice": "stt_notice_41d0f6", "warning": "stt_warning_41d0f6", "error": "stt_error_41d0f6", "detail": "stt_detail_41d0f6", "failureBlock": "stt_failureBlock_41d0f6", "loading": "stt_loading_41d0f6", "groups": "stt_groups_41d0f6", "group": "stt_group_41d0f6", "groupHeader": "stt_groupHeader_41d0f6", "groupToggle": "stt_groupToggle_41d0f6", "groupTitle": "stt_groupTitle_41d0f6", "groupName": "stt_groupName_41d0f6", "groupCounts": "stt_groupCounts_41d0f6", "filterRow": "stt_filterRow_41d0f6", "filter": "stt_filter_41d0f6", "rows": "stt_rows_41d0f6", "row": "stt_row_41d0f6", "tag": "stt_tag_41d0f6", "pending": "stt_pending_41d0f6", "rowName": "stt_rowName_41d0f6", "name": "stt_name_41d0f6", "protected": "stt_protected_41d0f6", "reserved": "stt_reserved_41d0f6", "empty": "stt_empty_41d0f6", "chips": "stt_chips_41d0f6", "chip": "stt_chip_41d0f6", "address": "stt_address_41d0f6", "badge": "stt_badge_41d0f6", "path": "stt_path_41d0f6", "addRow": "stt_addRow_41d0f6", "select": "stt_select_41d0f6", "workspaceBody": "stt_workspaceBody_41d0f6", "actions": "stt_actions_41d0f6", "saved": "stt_saved_41d0f6", "sectionFrame": "stt_sectionFrame_41d0f6", "residual": "stt_residual_41d0f6", "workspacePage": "stt_workspacePage_41d0f6", "card": "stt_card_41d0f6", "cardHeader": "stt_cardHeader_41d0f6", "cardTitle": "stt_cardTitle_41d0f6", "push": "stt_push_41d0f6", "facts": "stt_facts_41d0f6", "fact": "stt_fact_41d0f6", "factTerm": "stt_factTerm_41d0f6", "factValue": "stt_factValue_41d0f6", "counts": "stt_counts_41d0f6", "listHeader": "stt_listHeader_41d0f6", "pageFilter": "stt_pageFilter_41d0f6", "emptyBlock": "stt_emptyBlock_41d0f6", "emptyTitle": "stt_emptyTitle_41d0f6", "emptyHint": "stt_emptyHint_41d0f6", "commandRow": "stt_commandRow_41d0f6", "command": "stt_command_41d0f6", "footnotes": "stt_footnotes_41d0f6", "note": "stt_note_41d0f6", "rowMain": "stt_rowMain_41d0f6", "rowDescription": "stt_rowDescription_41d0f6", "rowTags": "stt_rowTags_41d0f6", "metaTag": "stt_metaTag_41d0f6", "toneInfo": "stt_toneInfo_41d0f6", "toneSuccess": "stt_toneSuccess_41d0f6", "toneWarn": "stt_toneWarn_41d0f6", "toneDanger": "stt_toneDanger_41d0f6" };

		// src/client/ToolPanelGroups.tsx
		var import_jsx_runtime = require("react/jsx-runtime");
		function groupTitle(kind, t) {
		  switch (kind) {
		    case "mcp":
		      return t("group.mcp");
		    case "skill":
		      return t("group.skill");
		    case "builtin":
		      return t("group.builtin");
		  }
		}
		function defaultExpanded(kind) {
		  return kind !== "mcp";
		}
		function lockOf(tool, t) {
		  if (tool.protected) return { tag: t("entry.protected"), reason: t("badge.protected") };
		  if (tool.reserved) return { tag: t("entry.reserved"), reason: t("badge.reserved") };
		  return void 0;
		}
		function ToolRow({ tool, busy, pending, onToggle, t }) {
		  const lock = lockOf(tool, t);
		  const locked = lock !== void 0;
		  const disabled = busy || locked || pending;
		  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { className: panel_default.row, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: panel_default.rowName, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { className: panel_default.name, title: tool.description ?? tool.name, children: tool.shortName }),
		      lock !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: panel_default.tag, title: lock.reason, children: lock.tag }),
		      pending && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: panel_default.pending, children: t("toggle.pending") })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		      import_dsh_client_ui_primitives.Switch,
		      {
		        checked: !tool.disabled,
		        disabled,
		        title: lock?.reason,
		        label: t("switch.label", { name: tool.shortName }),
		        onChange: (next) => {
		          if (disabled) return;
		          onToggle(tool.address, next);
		        }
		      }
		    )
		  ] });
		}
		function GroupRow({ group, pending, busy, onToggle, t }) {
		  const [expanded, setExpanded] = (0, import_react.useState)(() => defaultExpanded(group.kind));
		  const [filter, setFilter] = (0, import_react.useState)("");
		  const tools = (0, import_react.useMemo)(() => {
		    const needle = filter.trim().toLowerCase();
		    if (group.kind !== "builtin" || needle === "") return group.tools;
		    return group.tools.filter((tool) => tool.shortName.toLowerCase().includes(needle));
		  }, [filter, group.kind, group.tools]);
		  const address = group.address;
		  const groupPending = address !== null && pending.has(address);
		  const groupDisabled = busy || groupPending;
		  const title = groupTitle(group.kind, t);
		  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { className: panel_default.group, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: panel_default.groupHeader, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
		        "button",
		        {
		          type: "button",
		          className: panel_default.groupToggle,
		          "aria-expanded": expanded,
		          title: t("group.summary", { count: group.toolCount, disabled: group.disabledCount }),
		          onClick: () => {
		            setExpanded((value) => !value);
		          },
		          children: [
		            expanded ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconChevronDownOutlineRegular, {}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconChevronRightOutlineRegular, {}),
		            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: panel_default.groupTitle, children: title }),
		            group.kind === "mcp" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: panel_default.groupName, children: group.key }),
		            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: panel_default.groupCounts, children: [
		              t("group.toolCount", { count: group.toolCount }),
		              group.disabledCount > 0 && ` \xB7 ${t("group.disabledCount", { count: group.disabledCount })}`
		            ] })
		          ]
		        }
		      ),
		      address !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		        import_dsh_client_ui_primitives.Switch,
		        {
		          checked: !group.disabled,
		          disabled: groupDisabled,
		          label: t("switch.label", {
		            name: group.kind === "mcp" ? group.key : title
		          }),
		          onChange: (next) => {
		            if (groupDisabled) return;
		            onToggle(address, next);
		          }
		        }
		      )
		    ] }),
		    expanded && group.kind === "builtin" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: panel_default.filterRow, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		      import_dsh_client_ui_primitives.Input,
		      {
		        className: panel_default.filter,
		        value: filter,
		        placeholder: t("group.filter"),
		        "aria-label": t("group.filter"),
		        onChange: (event) => {
		          setFilter(event.target.value);
		        }
		      }
		    ) }),
		    expanded && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { className: panel_default.rows, "aria-label": title, children: tools.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { className: panel_default.empty, children: t("panel.empty") }) : tools.map((tool) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		      ToolRow,
		      {
		        tool,
		        busy,
		        pending: pending.has(tool.address),
		        onToggle,
		        t
		      },
		      tool.address
		    )) })
		  ] });
		}
		function ToolPanelGroups({ groups, pending, busy, onToggle, t }) {
		  if (groups.length === 0) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: panel_default.muted, children: t("panel.empty") });
		  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { className: panel_default.groups, children: groups.map((group) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		    GroupRow,
		    {
		      group,
		      pending,
		      busy,
		      onToggle,
		      t
		    },
		    `${group.kind}:${group.key}`
		  )) });
		}

		// src/client/DefaultsGroupList.tsx
		var import_jsx_runtime2 = require("react/jsx-runtime");
		function tagToneClass(tone) {
		  switch (tone) {
		    case "info":
		      return panel_default.toneInfo;
		    case "success":
		      return panel_default.toneSuccess;
		    case "warn":
		      return panel_default.toneWarn;
		    case "danger":
		      return panel_default.toneDanger;
		    case "neutral":
		      return "";
		  }
		}
		var SOURCE_TAG_KEYS = {
		  "project-dsh": "skill.source.project-dsh",
		  "project-agents": "skill.source.project-agents",
		  "custom": "skill.source.custom",
		  "user-dsh": "skill.source.user-dsh",
		  "user-agents": "skill.source.user-agents",
		  "bundled": "skill.source.bundled",
		  "runtime": "skill.source.runtime"
		};
		function lockOf2(entry, t) {
		  if (entry.protected) return { tag: t("entry.protected"), reason: t("badge.protected"), tone: "danger" };
		  if (entry.reserved) return { tag: t("entry.reserved"), reason: t("badge.reserved"), tone: "warn" };
		  return void 0;
		}
		function sourceTagKeyOf(source) {
		  return SOURCE_TAG_KEYS[source];
		}
		function skillTagsOf(entry, disabledSet, t) {
		  const tags = [];
		  const isSkill = entry.address.startsWith("skill:") || entry.modelInvocable !== void 0 && entry.userInvocable !== void 0;
		  if (!isSkill) return tags;
		  if (entry.modelInvocable !== void 0 && entry.userInvocable !== void 0) {
		    tags.push(entry.modelInvocable ? { text: t("entry.skillTokens"), tone: "warn" } : { text: t("entry.skillNoTokens"), tone: "neutral" });
		    tags.push({
		      text: entry.userInvocable ? t("entry.skillUserInvocable", { name: entry.shortName }) : t("entry.skillUserBlocked"),
		      tone: "neutral"
		    });
		  }
		  if (entry.source !== void 0) {
		    const key = sourceTagKeyOf(entry.source);
		    tags.push({ text: key === void 0 ? entry.source : t(key), tone: "info" });
		  }
		  if (disabledSet.has(entry.address)) tags.push({ text: t("entry.skillHidden"), tone: "neutral" });
		  return tags;
		}
		function DefaultsRow({ entry, disabledSet, blocked, busy, onToggle, t, showDetails }) {
		  const lock = lockOf2(entry, t);
		  const groupOff = blocked ? t("defaults.groupOff") : void 0;
		  const reason = lock?.reason ?? groupOff;
		  const disabled = busy || lock !== void 0 || blocked;
		  const tags = showDetails ? skillTagsOf(entry, disabledSet, t) : [];
		  const nameLine = /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: panel_default.rowName, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("code", { className: panel_default.name, title: entry.description ?? entry.shortName, children: entry.shortName }),
		    lock !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: `${panel_default.tag} ${tagToneClass(lock.tone)}`, title: lock.reason, children: lock.tag }),
		    groupOff !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: `${panel_default.tag} ${tagToneClass("warn")}`, title: groupOff, children: groupOff })
		  ] });
		  const control = /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		    import_dsh_client_ui_primitives2.Switch,
		    {
		      checked: !disabledSet.has(entry.address),
		      disabled,
		      title: reason,
		      label: t("defaults.switchLabel", { name: entry.shortName }),
		      onChange: (next) => {
		        if (disabled) return;
		        onToggle(entry.address, next);
		      }
		    }
		  );
		  if (!showDetails) {
		    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("li", { className: panel_default.row, children: [
		      nameLine,
		      control
		    ] });
		  }
		  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("li", { className: panel_default.row, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: panel_default.rowMain, children: [
		      nameLine,
		      entry.description !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: panel_default.rowDescription, title: entry.description, children: entry.description }),
		      tags.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: panel_default.rowTags, children: tags.map((tag) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		        "span",
		        {
		          className: `${panel_default.metaTag} ${tagToneClass(tag.tone)}`,
		          title: tag.title ?? tag.text,
		          children: tag.text
		        },
		        tag.text
		      )) })
		    ] }),
		    control
		  ] });
		}
		function DefaultsGroupRow({
		  group,
		  disabledSet,
		  skillsAvailable,
		  busy,
		  onToggle,
		  t,
		  filtering,
		  query,
		  showDetails
		}) {
		  const [expanded, setExpanded] = (0, import_react2.useState)(() => defaultExpanded(group.kind));
		  const [filter, setFilter] = (0, import_react2.useState)("");
		  const tools = (0, import_react2.useMemo)(() => {
		    if (filtering) return group.tools;
		    const needle = filter.trim().toLowerCase();
		    if (group.kind !== "builtin" || needle === "") return group.tools;
		    return group.tools.filter((entry) => entry.shortName.toLowerCase().includes(needle));
		  }, [filter, filtering, group.kind, group.tools]);
		  const address = group.address;
		  const blocked = address !== null && disabledSet.has(address);
		  const count = group.tools.length;
		  const inDefaults = group.tools.reduce(
		    (sum, entry) => disabledSet.has(entry.address) ? sum + 1 : sum,
		    0
		  );
		  const title = groupTitle(group.kind, t);
		  const degraded = group.kind === "skill" && !skillsAvailable;
		  const open = filtering || expanded;
		  const headerContent = /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
		    open ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconChevronDownOutlineRegular, {}) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconChevronRightOutlineRegular, {}),
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: panel_default.groupTitle, children: title }),
		    group.kind === "mcp" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: panel_default.groupName, children: group.key }),
		    group.kind === "mcp" && group.source !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		      "span",
		      {
		        className: `${panel_default.tag} ${tagToneClass(group.source === "project" ? "success" : "info")}`,
		        title: group.source === "project" ? t("mcp.sourceProjectHint") : t("mcp.sourceUserHint"),
		        children: group.source === "project" ? t("mcp.sourceProject") : t("mcp.sourceUser")
		      }
		    ),
		    group.kind === "mcp" && group.countsTokens === true && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: `${panel_default.tag} ${tagToneClass("warn")}`, title: t("mcp.tokensHint"), children: t("mcp.tokens") }),
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: panel_default.groupCounts, children: [
		      t("defaults.groupCount", { count }),
		      inDefaults > 0 && ` \xB7 ${t("defaults.groupInDefaults", { count: inDefaults })}`
		    ] })
		  ] });
		  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("li", { className: panel_default.group, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: panel_default.groupHeader, children: [
		      filtering ? (
		        // 过滤态组头：非交互 span——强制展开的清单不再提供折叠手势，`aria-expanded` 与
		        // `onClick` 一并撤掉；读数摘要（`title`）保留，span 复用 `.groupToggle` 的排布样式。
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: panel_default.groupToggle, title: t("defaults.groupSummary", { count, inDefaults }), children: headerContent })
		      ) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		        "button",
		        {
		          type: "button",
		          className: panel_default.groupToggle,
		          "aria-expanded": expanded,
		          title: t("defaults.groupSummary", { count, inDefaults }),
		          onClick: () => {
		            setExpanded((value) => !value);
		          },
		          children: headerContent
		        }
		      ),
		      address !== null && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		        import_dsh_client_ui_primitives2.Switch,
		        {
		          checked: !disabledSet.has(address),
		          disabled: busy,
		          label: t("defaults.groupSwitchLabel", {
		            name: group.kind === "mcp" ? group.key : title
		          }),
		          onChange: (next) => {
		            if (busy) return;
		            onToggle(address, next);
		          }
		        }
		      )
		    ] }),
		    query === void 0 && open && group.kind === "builtin" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: panel_default.filterRow, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		      import_dsh_client_ui_primitives2.Input,
		      {
		        className: panel_default.filter,
		        value: filter,
		        placeholder: t("group.filter"),
		        "aria-label": t("group.filter"),
		        onChange: (event) => {
		          setFilter(event.target.value);
		        }
		      }
		    ) }),
		    open && degraded && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: panel_default.muted, children: t("skill.unavailable") }),
		    open && !degraded && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("ul", { className: panel_default.rows, "aria-label": title, children: tools.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("li", { className: panel_default.empty, children: t("panel.empty") }) : tools.map((entry) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		      DefaultsRow,
		      {
		        entry,
		        disabledSet,
		        blocked,
		        busy,
		        onToggle,
		        t,
		        showDetails
		      },
		      entry.address
		    )) })
		  ] });
		}
		function ResidualChips({ addresses, busy, copy, onToggle }) {
		  if (addresses.length === 0) return null;
		  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: panel_default.residual, children: copy.residualTitle }),
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("ul", { className: panel_default.chips, children: addresses.map((address) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("li", { className: panel_default.chip, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("code", { className: panel_default.address, title: address, children: address }),
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		        import_dsh_client_ui_primitives2.Button,
		        {
		          variant: "ghost",
		          size: "sm",
		          "aria-label": copy.removeAria(address),
		          disabled: busy,
		          onClick: () => {
		            onToggle(address, true);
		          },
		          children: copy.removeLabel
		        }
		      )
		    ] }, address)) })
		  ] });
		}
		function DefaultsGroupList({
		  universe,
		  disabled,
		  busy,
		  onToggle,
		  copy,
		  t,
		  query,
		  showDetails
		}) {
		  const disabledSet = (0, import_react2.useMemo)(() => new Set(disabled), [disabled]);
		  const view = (0, import_react2.useMemo)(
		    () => filterDefaultsView(universe, disabled, query),
		    [universe, disabled, query]
		  );
		  const filtering = view.filtering;
		  const needle = query?.trim() ?? "";
		  if (universe === null || !universe.layerReady) {
		    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: panel_default.warning, children: copy.universeUnavailable ?? t("defaults.universeUnavailable") }),
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ResidualChips, { addresses: view.residual, busy, copy, onToggle }),
		      copy.cliHint !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: panel_default.muted, children: copy.cliHint })
		    ] });
		  }
		  const shownUniverse = view.universe ?? universe;
		  const groups = shownUniverse.groups;
		  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
		    groups.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("ul", { className: panel_default.groups, children: groups.map((group) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		      DefaultsGroupRow,
		      {
		        group,
		        disabledSet,
		        skillsAvailable: shownUniverse.skillsAvailable,
		        busy,
		        onToggle,
		        t,
		        filtering,
		        query,
		        showDetails: showDetails === true
		      },
		      `${group.kind}:${group.key}`
		    )) }) : filtering && // 过滤把组清空：一句无匹配交代，不落 `panel.empty`（那是「宇宙本来就没有条目」
		    // 的面板空态，两者语义不同）；残留 chip 若有命中仍照常展示。
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: panel_default.muted, children: t("defaults.filterEmpty", { query: needle }) }),
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ResidualChips, { addresses: view.residual, busy, copy, onToggle }),
		    copy.cliHint !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: panel_default.muted, children: copy.cliHint })
		  ] });
		}

		// src/client/DefaultsSectionFrame.tsx
		var import_react3 = require("react");
		var import_dsh_client_ui_primitives3 = require("@deepseek-ai/dsh-client-ui-primitives");
		var import_jsx_runtime3 = require("react/jsx-runtime");
		function DefaultsSectionFrame({ title, summary, children }) {
		  const [open, setOpen] = (0, import_react3.useState)(false);
		  return (
		    // 3.19 的壳写 `.section`（分区正文的纵向排布），W12 又为本组件新增了 `.sectionFrame`
		    // （面板两分区的折叠外壳：顶部留白 + 无背景/无边框重置）；两者声明不冲突，并挂同时满足
		    // 这两处口径。
		    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("section", { className: `${panel_default.section} ${panel_default.sectionFrame}`, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: panel_default.groupHeader, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
		        "button",
		        {
		          type: "button",
		          className: panel_default.groupToggle,
		          "aria-expanded": open,
		          onClick: () => {
		            setOpen((value) => !value);
		          },
		          children: [
		            open ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.IconChevronDownOutlineRegular, {}) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.IconChevronRightOutlineRegular, {}),
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: panel_default.groupTitle, children: title }),
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: panel_default.groupCounts, children: summary })
		          ]
		        }
		      ) }),
		      open && children
		    ] })
		  );
		}

		// src/client/DefaultsEditor.tsx
		var import_jsx_runtime4 = require("react/jsx-runtime");
		function formatTime(at) {
		  return new Date(at).toLocaleString();
		}
		function DefaultsEditor({
		  defaults,
		  universe,
		  createdAt,
		  snapshotCount,
		  saving,
		  saved,
		  failure,
		  onUpdate,
		  t
		}) {
		  const [armed, setArmed] = (0, import_react4.useState)(false);
		  const counts = (0, import_react4.useMemo)(
		    () => defaultsCountsOf(universe, defaults.disabled),
		    [universe, defaults.disabled]
		  );
		  const clear = () => {
		    if (!armed) {
		      setArmed(true);
		      return;
		    }
		    setArmed(false);
		    onUpdate("reset");
		  };
		  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
		    DefaultsSectionFrame,
		    {
		      title: t("section.defaults"),
		      summary: t("defaults.summary", { inDefaults: counts.inDefaults, residual: counts.residual }),
		      children: [
		        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("p", { className: panel_default.meta, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { children: t("defaults.path") }),
		          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("code", { className: panel_default.path, children: defaults.path })
		        ] }),
		        defaults.corrupt && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: panel_default.warning, children: t("notice.defaults-corrupt") }),
		        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: panel_default.meta, children: t("defaults.counts", {
		          listed: counts.listed,
		          inDefaults: counts.inDefaults,
		          residual: counts.residual
		        }) }),
		        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
		          DefaultsGroupList,
		          {
		            universe,
		            disabled: defaults.disabled,
		            busy: saving,
		            onToggle: (address, on) => {
		              setArmed(false);
		              onUpdate(on ? "on" : "off", [address]);
		            },
		            copy: {
		              residualTitle: t("defaults.residualTitle"),
		              removeLabel: t("defaults.remove"),
		              removeAria: (a) => `${t("defaults.remove")} ${a}`,
		              cliHint: t("defaults.cliHint")
		            },
		            t
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: panel_default.muted, children: t("defaults.scope") }),
		        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: panel_default.meta, children: t("defaults.snapshot", { time: formatTime(createdAt), count: snapshotCount }) }),
		        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: panel_default.actions, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
		            import_dsh_client_ui_primitives4.Button,
		            {
		              variant: "outline",
		              size: "sm",
		              disabled: saving || defaults.disabled.length === 0,
		              onClick: clear,
		              children: armed ? t("defaults.clearConfirm") : t("defaults.clear")
		            }
		          ),
		          saved && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: panel_default.saved, children: t("defaults.saved") })
		        ] }),
		        failure !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { role: "alert", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: panel_default.error, children: failure.text }),
		          failure.detail !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: panel_default.detail, children: failure.detail })
		        ] })
		      ]
		    }
		  );
		}

		// src/client/SkillPanel.tsx
		var import_dsh_client_ui_primitives5 = require("@deepseek-ai/dsh-client-ui-primitives");
		var import_jsx_runtime5 = require("react/jsx-runtime");
		var SKILL_PREFIX = "skill:";
		function SkillRow({ skill, blocked, busy, pending, onToggle, t }) {
		  const address = `${SKILL_PREFIX}${skill.name}`;
		  const locked = blocked || busy || pending;
		  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("li", { className: panel_default.row, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: panel_default.rowName, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("code", { className: panel_default.name, title: skill.description === "" ? skill.name : skill.description, children: skill.name }),
		      skill.disabled && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: panel_default.tag, children: skill.shadowed ? t("skill.effective") : t("skill.intentOnly") }),
		      pending && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: panel_default.pending, children: t("skill.pending") })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
		      import_dsh_client_ui_primitives5.Switch,
		      {
		        checked: !skill.disabled,
		        disabled: locked,
		        label: t("skill.switchLabel", { name: skill.name }),
		        onChange: (next) => {
		          if (locked) return;
		          onToggle(address, next);
		        }
		      }
		    )
		  ] });
		}
		function SkillPanel({
		  skills,
		  unavailable,
		  blocked,
		  pending,
		  busy,
		  onToggle,
		  t
		}) {
		  if (unavailable) {
		    return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("section", { className: panel_default.section, "aria-label": t("skill.region"), children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: panel_default.warning, children: t("skill.unavailable") }) });
		  }
		  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("section", { className: panel_default.section, "aria-label": t("skill.region"), children: [
		    blocked && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: panel_default.warning, children: t("skill.blocked") }),
		    skills.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: panel_default.empty, children: t("skill.empty") }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("ul", { className: panel_default.rows, children: skills.map((skill) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
		      SkillRow,
		      {
		        skill,
		        blocked,
		        busy,
		        pending: pending.has(`${SKILL_PREFIX}${skill.name}`),
		        onToggle,
		        t
		      },
		      skill.name
		    )) })
		  ] });
		}

		// src/client/WorkspaceDefaultsEditor.tsx
		var import_react6 = require("react");
		var import_dsh_client_ui_primitives7 = require("@deepseek-ai/dsh-client-ui-primitives");

		// src/client/WorkspaceDefaultsPage.tsx
		var import_react5 = require("react");
		var import_dsh_client_ui_primitives6 = require("@deepseek-ai/dsh-client-ui-primitives");
		var import_jsx_runtime6 = require("react/jsx-runtime");
		var COPY_RESET_MS = 2e3;
		var COMMAND_PLACEHOLDER = "<address>";
		var EMPTY_DISABLED = [];
		function WorkspaceDefaultsPage({
		  workspace,
		  universe,
		  counts,
		  saving,
		  saved,
		  failure,
		  armed,
		  onToggle,
		  onClear,
		  onRefresh,
		  t
		}) {
		  const [query, setQuery] = (0, import_react5.useState)("");
		  const [copyState, setCopyState] = (0, import_react5.useState)("idle");
		  const copyTimer = (0, import_react5.useRef)(void 0);
		  (0, import_react5.useEffect)(() => () => window.clearTimeout(copyTimer.current), []);
		  const liveUniverse = universe !== null && universe.layerReady ? universe : null;
		  const universeReady = liveUniverse !== null;
		  const disabled = workspace?.disabled ?? EMPTY_DISABLED;
		  const commandText = workspace === null ? "" : `# ${t("workspace.commandComment", { key: workspace.key })}
		/tools workspace off ${COMMAND_PLACEHOLDER}`;
		  const copyFeedback = copyState === "copied" ? t("workspace.copied") : copyState === "failed" ? t("workspace.copyFailed") : "";
		  const scheduleCopyReset = () => {
		    window.clearTimeout(copyTimer.current);
		    copyTimer.current = window.setTimeout(() => {
		      setCopyState("idle");
		    }, COPY_RESET_MS);
		  };
		  const copyCommand = async () => {
		    try {
		      if (navigator.clipboard === void 0) throw new Error("clipboard unavailable");
		      await navigator.clipboard.writeText(commandText);
		      setCopyState("copied");
		    } catch {
		      setCopyState("failed");
		    }
		    scheduleCopyReset();
		  };
		  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: panel_default.workspacePage, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: panel_default.card, children: workspace === null ? /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_jsx_runtime6.Fragment, { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: panel_default.note, children: t("workspace.unresolved") }),
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: panel_default.cardHeader, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: panel_default.push }),
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
		          import_dsh_client_ui_primitives6.Button,
		          {
		            variant: "ghost",
		            size: "sm",
		            disabled: saving,
		            onClick: onRefresh,
		            children: t("workspace.refresh")
		          }
		        )
		      ] })
		    ] }) : /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_jsx_runtime6.Fragment, { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: panel_default.cardHeader, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: panel_default.cardTitle, children: workspace.title ?? workspace.key }),
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: panel_default.badge, children: workspace.registered ? t("workspace.registered") : t("workspace.unregistered") }),
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: panel_default.push }),
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
		          import_dsh_client_ui_primitives6.Button,
		          {
		            variant: "ghost",
		            size: "sm",
		            disabled: saving,
		            onClick: onRefresh,
		            children: t("workspace.refresh")
		          }
		        )
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("dl", { className: panel_default.facts, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: panel_default.fact, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("dt", { className: panel_default.factTerm, children: t("workspace.key") }),
		          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("dd", { className: panel_default.factValue, children: workspace.key })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: panel_default.fact, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("dt", { className: panel_default.factTerm, children: t("workspace.path") }),
		          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("dd", { className: panel_default.factValue, children: workspace.path })
		        ] })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: panel_default.counts, children: t("defaults.counts", {
		        listed: counts.listed,
		        inDefaults: counts.inDefaults,
		        residual: counts.residual
		      }) }),
		      workspace.corrupt && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: panel_default.warning, children: t("workspace.corrupt") })
		    ] }) }),
		    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: panel_default.card, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: panel_default.cardHeader, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: panel_default.cardTitle, children: t("workspace.listTitle") }),
		        universeReady && counts.listed > 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
		          import_dsh_client_ui_primitives6.Input,
		          {
		            className: panel_default.pageFilter,
		            value: query,
		            placeholder: t("workspace.filter"),
		            "aria-label": t("workspace.filter"),
		            onChange: (event) => {
		              setQuery(event.target.value);
		            }
		          }
		        )
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: panel_default.note, children: t("workspace.listHint") }),
		      workspace !== null && universeReady && disabled.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: panel_default.emptyBlock, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: panel_default.emptyTitle, children: t("workspace.emptyDefaults") }),
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: panel_default.emptyHint, children: t("workspace.emptyDefaultsHint") })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
		        DefaultsGroupList,
		        {
		          universe,
		          disabled,
		          busy: saving,
		          onToggle,
		          copy: {
		            residualTitle: t("defaults.residualTitle"),
		            removeLabel: t("workspace.remove"),
		            removeAria: (address) => t("workspace.removeAria", { address }),
		            universeUnavailable: t("workspace.universeUnavailable")
		          },
		          t,
		          query,
		          showDetails: true
		        }
		      ),
		      counts.listed === 0 && counts.residual === 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: panel_default.emptyBlock, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: panel_default.emptyTitle, children: universeReady ? t("workspace.emptyUniverse") : t("workspace.universeUnavailable") }) }),
		      liveUniverse !== null && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_jsx_runtime6.Fragment, { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: panel_default.note, children: t("workspace.globalUnion") }),
		        liveUniverse.ungroupedMcp !== void 0 && liveUniverse.ungroupedMcp > 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: panel_default.note, children: t("workspace.ungrouped", { count: liveUniverse.ungroupedMcp }) }),
		        liveUniverse.foreignProjectMcp !== void 0 && liveUniverse.foreignProjectMcp > 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: panel_default.note, children: t("workspace.foreignProjectMcp", { count: liveUniverse.foreignProjectMcp }) }),
		        liveUniverse.skillsComplete === false && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: panel_default.note, children: t("workspace.skillsIncomplete") })
		      ] })
		    ] }),
		    workspace !== null && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: panel_default.card, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: panel_default.cardTitle, children: t("workspace.commandTitle") }),
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: panel_default.note, children: t("workspace.commandNote") }),
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: panel_default.commandRow, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("pre", { className: panel_default.command, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("code", { children: commandText }) }),
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
		          import_dsh_client_ui_primitives6.Button,
		          {
		            variant: "outline",
		            size: "sm",
		            disabled: copyState === "copied",
		            onClick: () => {
		              void copyCommand();
		            },
		            children: t("workspace.copyCommand")
		          }
		        )
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: panel_default.note, "aria-live": "polite", children: copyFeedback })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: panel_default.footnotes, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: panel_default.note, children: t("workspace.scope") }),
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: panel_default.note, children: t("workspace.union") })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: panel_default.actions, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
		        import_dsh_client_ui_primitives6.Button,
		        {
		          variant: "outline",
		          size: "sm",
		          disabled: workspace === null || saving || disabled.length === 0,
		          onClick: onClear,
		          children: armed ? t("workspace.clearConfirm") : t("workspace.clear")
		        }
		      ),
		      saved && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: panel_default.saved, children: t("workspace.saved") })
		    ] }),
		    failure !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { role: "alert", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: panel_default.error, children: failure.text }),
		      failure.detail !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: panel_default.detail, children: failure.detail })
		    ] })
		  ] });
		}

		// src/client/WorkspaceDefaultsEditor.tsx
		var import_jsx_runtime7 = require("react/jsx-runtime");
		var EMPTY_DISABLED2 = [];
		function WorkspaceDefaultsEditor({
		  workspace,
		  universe,
		  variant,
		  saving,
		  saved,
		  failure,
		  onUpdate,
		  onRefresh,
		  t
		}) {
		  const [armed, setArmed] = (0, import_react6.useState)(false);
		  const dialog = variant === "dialog";
		  const writable = workspace !== null;
		  const disabled = workspace?.disabled ?? EMPTY_DISABLED2;
		  const counts = (0, import_react6.useMemo)(() => defaultsCountsOf(universe, disabled), [universe, disabled]);
		  const clear = () => {
		    if (!armed) {
		      setArmed(true);
		      return;
		    }
		    setArmed(false);
		    onUpdate("reset");
		  };
		  const body = /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
		    workspace === null ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: panel_default.muted, children: t("workspace.unresolved") }) : /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("p", { className: panel_default.meta, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { children: t("workspace.key") }),
		        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("code", { className: panel_default.path, children: workspace.key }),
		        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { children: workspace.registered ? t("workspace.registered") : t("workspace.unregistered") })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("p", { className: panel_default.meta, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { children: t("workspace.path") }),
		        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("code", { className: panel_default.path, children: workspace.path })
		      ] }),
		      workspace.corrupt && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: panel_default.warning, children: t("workspace.corrupt") }),
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: panel_default.meta, children: t("defaults.counts", {
		        listed: counts.listed,
		        inDefaults: counts.inDefaults,
		        residual: counts.residual
		      }) }),
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
		        DefaultsGroupList,
		        {
		          universe,
		          disabled: workspace.disabled,
		          busy: saving,
		          onToggle: (address, on) => {
		            setArmed(false);
		            onUpdate(on ? "on" : "off", [address]);
		          },
		          copy: {
		            residualTitle: t("defaults.residualTitle"),
		            removeLabel: t("workspace.remove"),
		            removeAria: (a) => t("workspace.removeAria", { address: a }),
		            cliHint: t("workspace.cliHint")
		          },
		          t
		        }
		      )
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: panel_default.muted, children: t("workspace.scope") }),
		    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: panel_default.muted, children: t("workspace.union") }),
		    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: panel_default.actions, children: [
		      !dialog && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
		        import_dsh_client_ui_primitives7.Button,
		        {
		          variant: "ghost",
		          size: "sm",
		          disabled: saving,
		          onClick: () => {
		            onRefresh();
		          },
		          children: t("workspace.refresh")
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
		        import_dsh_client_ui_primitives7.Button,
		        {
		          variant: "outline",
		          size: "sm",
		          disabled: !writable || saving || disabled.length === 0,
		          onClick: clear,
		          children: armed ? t("workspace.clearConfirm") : t("workspace.clear")
		        }
		      ),
		      saved && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: panel_default.saved, children: t("workspace.saved") })
		    ] }),
		    failure !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { role: "alert", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: panel_default.error, children: failure.text }),
		      failure.detail !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: panel_default.detail, children: failure.detail })
		    ] })
		  ] });
		  return dialog ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
		    WorkspaceDefaultsPage,
		    {
		      workspace,
		      universe,
		      counts,
		      saving,
		      saved,
		      failure,
		      armed,
		      onToggle: (address, on) => {
		        setArmed(false);
		        onUpdate(on ? "on" : "off", [address]);
		      },
		      onClear: clear,
		      onRefresh,
		      t
		    }
		  ) : /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
		    DefaultsSectionFrame,
		    {
		      title: t("workspace.title"),
		      summary: t("defaults.summary", { inDefaults: counts.inDefaults, residual: counts.residual }),
		      children: body
		    }
		  );
		}

		// src/client/locales.ts
		var NS = "sessionToolToggle";
		var zh = {
		  // —— 会话头部工具区的入口按钮（设计 §3.1） ——
		  "action.label": "\u5DE5\u5177\u9762",
		  "action.title": "\u4F1A\u8BDD\u5DE5\u5177\u9762",
		  "action.tooltip": "\u4F1A\u8BDD\u5DE5\u5177\u5F00\u5173\uFF1A\u672C\u4F1A\u8BDD\u5185\u7684\u5DE5\u5177\u53EF\u5206\u7EC4\u6216\u9010\u4E2A\u5173\u95ED",
		  "action.aria": "\u6253\u5F00\u4F1A\u8BDD\u5DE5\u5177\u9762\u9762\u677F",
		  // —— 统一「工作区配置」弹窗的分节导航行（code-design ①1.4 #40 / ③3.5） ——
		  //     分节的 label 是 holder nav 每次读取时求值的 thunk；本键是该行的唯一文案来源。
		  "section.label": "\u5DE5\u4F5C\u533A\u9ED8\u8BA4\u6863",
		  // —— 面板骨架（设计 §3.2：title + description + footer 的刷新/关闭） ——
		  "panel.title": "\u4F1A\u8BDD\u5DE5\u5177\u9762",
		  "panel.description": "\u672C\u4F1A\u8BDD\u5185\u53EF\u7528\u7684\u5DE5\u5177\u4E0E\u5F00\u5173\uFF1B\u6539\u52A8\u53EA\u5F71\u54CD\u672C\u4F1A\u8BDD\u4E4B\u540E\u7684\u6A21\u578B\u6B65\u9AA4\u3002",
		  "panel.close": "\u5173\u95ED",
		  "panel.loading": "\u6B63\u5728\u8BFB\u53D6\u5DE5\u5177\u9762\u2026",
		  "panel.empty": "\u672C\u4F1A\u8BDD\u6CA1\u6709\u53EF\u5C55\u793A\u7684\u5DE5\u5177\u3002",
		  "panel.refresh": "\u5237\u65B0",
		  // —— 分区的标题（设计 §3.2 的六段，自上而下；`section.skills` 由 7.7 挂载技能分区时用，
		  //    工作区分区的标题归 `WorkspaceDefaultsEditor` 的 `workspace.title`） ——
		  "section.state": "\u72B6\u6001\u6458\u8981",
		  "section.groups": "\u672C\u4F1A\u8BDD\u5F00\u5173",
		  "section.skills": "\u9010\u6280\u80FD\u5F00\u5173",
		  "section.defaults": "\u7528\u6237\u7EA7\u9ED8\u8BA4\u6863",
		  "section.disabled": "\u5173\u95ED\u96C6",
		  // —— 分组（宿主只给 kind 与计数，中文由这里渲染，设计 §2.5） ——
		  "group.mcp": "MCP \u670D\u52A1\u5668",
		  "group.skill": "\u6280\u80FD",
		  "group.builtin": "\u5185\u7F6E\u5DE5\u5177",
		  "group.toolCount": "{count} \u4E2A\u5DE5\u5177",
		  "group.disabledCount": "\u5DF2\u5173 {count} \u4E2A",
		  "group.summary": "{count} \u4E2A\u5DE5\u5177\uFF0C\u5DF2\u5173 {disabled} \u4E2A",
		  // 内置工具分区的本地过滤输入（纯展示层，不参与任何文法校验）。
		  "group.filter": "\u6309\u5DE5\u5177\u540D\u8FC7\u6EE4\u2026",
		  // —— 技能分区（逐 skill 行开关；`section.skills` 标题由 7.7 负责，这里只有块内文案） ——
		  "skill.region": "\u6280\u80FD\u5F00\u5173",
		  "skill.unavailable": "\u6280\u80FD\u670D\u52A1\u4E0D\u53EF\u7528\uFF0C\u9010\u6280\u80FD\u5F00\u5173\u6682\u4E0D\u53EF\u7528\u3002",
		  "skill.blocked": "\u6280\u80FD\u5DE5\u5177\u5DF2\u6574\u6863\u5173\u95ED\uFF0C\u9010\u9879\u5F00\u5173\u6682\u4E0D\u751F\u6548\u3002",
		  "skill.pending": "\u6B63\u5728\u5E94\u7528\u2026",
		  "skill.switchLabel": "{name} \u7684\u6A21\u578B\u53EF\u89C1\u6027\u5F00\u5173",
		  "skill.empty": "\u672C\u4F1A\u8BDD\u6CA1\u6709\u53EF\u5C55\u793A\u7684\u6280\u80FD\u3002",
		  // 两个状态标签：`effective` = 已关且影子 stub 已生效；`intentOnly` = 意图已记但暂未生效
		  // （技能未安装或影子注册未胜出）。`/name` 手动调用不受模型可见性开关影响（设计 D15 语义）。
		  "skill.effective": "\u6A21\u578B\u4E0D\u53EF\u89C1\uFF08`/name` \u4ECD\u53EF\u7528\uFF09",
		  "skill.intentOnly": "\u5DF2\u8BB0\u5F55\uFF0C\u6682\u672A\u751F\u6548",
		  // —— 技能来源短标签（code-design ③3.5）：映射表在 WorkspaceDefaultsPage.tsx，未知 source 原样显示 ——
		  "skill.source.project-dsh": "\u9879\u76EE",
		  "skill.source.project-agents": "\u9879\u76EE(agents)",
		  "skill.source.custom": "\u81EA\u5B9A\u4E49",
		  "skill.source.user-dsh": "\u7528\u6237",
		  "skill.source.user-agents": "\u7528\u6237(agents)",
		  "skill.source.bundled": "\u5185\u7F6E",
		  "skill.source.runtime": "\u8FD0\u884C\u65F6",
		  // —— 行级标记：组内条目上的短标签（设计 §3.3 的 `[保护]` / `[不可关闭]`） ——
		  "entry.disabled": "\u5DF2\u5173\u95ED",
		  "entry.protected": "\u4FDD\u62A4",
		  "entry.reserved": "\u4E0D\u53EF\u5173\u95ED",
		  "entry.intentOnly": "\u6682\u65E0\u5339\u914D",
		  // 工作区页面的技能行标签（code-design ③3.5）：模型调用代价 / 手动调用方式 / 新会话初始态。
		  "entry.skillTokens": "\u5360\u5BF9\u8BDD token",
		  "entry.skillNoTokens": "\u4E0D\u5360\u5BF9\u8BDD token",
		  "entry.skillUserInvocable": "`/{name}` \u53EF\u7528",
		  "entry.skillUserBlocked": "\u4E0D\u53EF\u624B\u52A8\u8C03\u7528",
		  "entry.skillHidden": "\u65B0\u4F1A\u8BDD\u9ED8\u8BA4\u9690\u85CF",
		  // —— 徽标与禁用理由：禁用开关的 `title` 必须给同一句解释（设计 §3.3） ——
		  "badge.protected": "\u5728\u4FDD\u62A4\u540D\u5355\u5185\uFF0C\u4E0D\u80FD\u5173\u95ED\u3002",
		  "badge.reserved": "\u4FDD\u7559\u5DE5\u5177\uFF0C\u4E0D\u80FD\u5173\u95ED\u3002",
		  "badge.intent": "\u610F\u56FE",
		  // —— 开关的可访问名（`Switch` 的 `label` 是必填 a11y 名称，设计 §3.3） ——
		  "switch.label": "{name} \u7684\u4F1A\u8BDD\u5F00\u5173",
		  // —— 开关操作的进行中/失败态（失败的主文案按错误码取 `error.*`，这里只讲操作本身） ——
		  "toggle.pending": "\u6B63\u5728\u5E94\u7528\u2026",
		  "toggle.failed": "\u5F00\u5173\u672A\u80FD\u5207\u6362\uFF0C\u672C\u6B21\u6539\u52A8\u672A\u751F\u6548\u3002",
		  // —— 关闭集区（已关闭地址的 chip 列表） ——
		  "disabled.listTitle": "\u5173\u95ED\u96C6",
		  "disabled.intentOnly": "\u8FD9\u4E9B\u5730\u5740\u5F53\u524D\u6CA1\u6709\u5339\u914D\u5230\u5DE5\u5177\uFF1A\u610F\u56FE\u5DF2\u8BB0\u5F55\uFF0C\u6682\u65F6\u4E0D\u4EA7\u751F\u6548\u679C\u3002",
		  "disabled.empty": "\u5F53\u524D\u6CA1\u6709\u5173\u95ED\u9879\u3002",
		  // 关闭集 chip 上的「开启」与整区的「恢复创建时快照」（10.4 新增：设计 §3.2 第 4 段）。
		  "disabled.enable": "\u5F00\u542F",
		  "disabled.enableAria": "\u5F00\u542F {address}",
		  "disabled.reset": "\u6062\u590D\u521B\u5EFA\u65F6\u5FEB\u7167",
		  "disabled.resetConfirm": "\u518D\u70B9\u4E00\u6B21\u786E\u8BA4\u6062\u590D",
		  // —— 用户级默认档（设计 §3.4；默认档不追溯已存在会话） ——
		  "defaults.path": "\u9ED8\u8BA4\u6863\u6587\u4EF6",
		  "defaults.note": "\u53EA\u5F71\u54CD\u4E4B\u540E\u65B0\u5EFA\u7684\u4F1A\u8BDD\u3002",
		  "defaults.scope": "\u5F71\u54CD\u8303\u56F4\uFF1A\u53EA\u5F71\u54CD\u4E4B\u540E\u65B0\u5EFA\u7684\u4F1A\u8BDD\uFF0C\u672C\u4F1A\u8BDD\u4E0D\u53D8\u3002",
		  "defaults.snapshot": "\u672C\u4F1A\u8BDD\u521B\u5EFA\u4E8E {time}\uFF0C\u5FEB\u7167 {count} \u9879\u3002",
		  // —— B 的分组开关界面（code-design ③3.20）：自由文本添加链已死（D8），这里只剩清单读数与
		  //     分组开关点的文案；跨清单的新关一律走 `/tools default off <地址>` ——
		  "defaults.counts": "\u6E05\u5355 {listed} \xB7 \u9ED8\u8BA4\u5173 {inDefaults} \xB7 \u6B8B\u7559 {residual}",
		  "defaults.summary": "\u9ED8\u8BA4\u5173 {inDefaults} \xB7 \u6B8B\u7559 {residual}",
		  "defaults.residualTitle": "\u6B8B\u7559\u5730\u5740\uFF08\u4E0D\u5728\u672C\u4F1A\u8BDD\u6E05\u5355\u91CC\uFF0C\u53EA\u80FD\u79FB\u9664\uFF09",
		  "defaults.universeUnavailable": "\u672C\u4F1A\u8BDD\u7684\u5DE5\u5177\u6E05\u5355\u6682\u4E0D\u53EF\u7528\uFF1A\u53EA\u80FD\u67E5\u770B\u4E0E\u79FB\u9664\u6863\u5185\u5DF2\u6709\u6761\u76EE\u3002",
		  // 全局过滤无结果的空态（code-design ③3.5；工作区页面清单卡的 DefaultsGroupList 用）。
		  "defaults.filterEmpty": "\u6CA1\u6709\u5339\u914D\u300C{query}\u300D\u7684\u6761\u76EE\u3002",
		  // 分组标题行：条目数 / 档内计数 / 合成 title（读屏与悬浮共用 groupSummary）。
		  "defaults.groupCount": "{count} \u9879",
		  "defaults.groupInDefaults": "\u9ED8\u8BA4\u5173 {count} \u9879",
		  "defaults.groupSummary": "{count} \u9879\uFF0C\u9ED8\u8BA4\u5173 {inDefaults} \u9879",
		  // 行开关与组开关的可访问名；整组在档时组内行不可切换，改标 `整组默认关`。
		  "defaults.groupOff": "\u6574\u7EC4\u9ED8\u8BA4\u5173",
		  "defaults.switchLabel": "{name} \u7684\u9ED8\u8BA4\u6863\u5F00\u5173",
		  "defaults.groupSwitchLabel": "{name} \u7684\u6574\u7EC4\u9ED8\u8BA4\u6863\u5F00\u5173",
		  // D8 兜底说明：本页只列本会话可见的工具，跨清单的新关走命令。
		  "defaults.cliHint": "\u672C\u9875\u53EA\u5217\u672C\u4F1A\u8BDD\u53EF\u89C1\u7684\u5DE5\u5177\uFF1B\u8DE8\u6E05\u5355\u7684\u65B0\u5173\u7528\u547D\u4EE4 `/tools default off <\u5730\u5740>`\u3002",
		  "defaults.remove": "\u79FB\u9664",
		  "defaults.saved": "\u5DF2\u4FDD\u5B58\uFF08\u672C\u4F1A\u8BDD\u4E0D\u53D8\uFF09\u3002",
		  "defaults.clear": "\u6E05\u7A7A\u9ED8\u8BA4\u6863",
		  "defaults.clearConfirm": "\u518D\u70B9\u4E00\u6B21\u786E\u8BA4\u6E05\u7A7A",
		  // —— 工作区默认档（设计 §3.4 / C2；面板分区与页面分节共用同一组键） ——
		  "workspace.title": "\u5DE5\u4F5C\u533A\u9ED8\u8BA4\u6863",
		  // 页面级选择框没有给出有效目标（未分配 / 工作区服务未就绪）时的空态：本节不发任何寻址
		  // 请求，也不渲染编辑器（选择动作归 holder 页面的唯一选择框，节内不再自带下拉）。
		  "workspace.noTarget": "\u8BF7\u5148\u5728\u4E0A\u65B9\u9009\u62E9\u4E00\u4E2A\u5DE5\u4F5C\u533A",
		  "workspace.key": "\u5DE5\u4F5C\u533A\u952E",
		  "workspace.path": "\u5DE5\u4F5C\u533A\u6863\u6587\u4EF6",
		  "workspace.registered": "\u5DF2\u767B\u8BB0\u5DE5\u4F5C\u533A",
		  "workspace.unregistered": "\u672A\u767B\u8BB0\u5DE5\u4F5C\u533A",
		  "workspace.unresolved": "\u5F53\u524D\u4F1A\u8BDD\u7684\u5DE5\u4F5C\u533A\u65E0\u6CD5\u5F52\u5C5E\uFF1A\u53EA\u6309\u7528\u6237\u7EA7\u9ED8\u8BA4\u6863\u64AD\u79CD\u3002",
		  "workspace.corrupt": "\u5DE5\u4F5C\u533A\u6863\u6587\u4EF6\u635F\u574F\u6216\u534A\u5199\uFF0C\u5DF2\u6309\u7A7A\u6863\u5904\u7406\u3002",
		  "workspace.scope": "\u5F71\u54CD\u8303\u56F4\uFF1A\u53EA\u5F71\u54CD\u5728\u8FD9\u4E2A\u5DE5\u4F5C\u533A\u4E4B\u540E\u65B0\u5EFA\u7684\u4F1A\u8BDD\uFF0C\u672C\u4F1A\u8BDD\u4E0D\u53D8\u3002",
		  "workspace.union": "\u65B0\u4F1A\u8BDD\u521D\u59CB\u5173\u95ED = \u7528\u6237\u7EA7\u9ED8\u8BA4\u6863 \u222A \u672C\u5DE5\u4F5C\u533A\u9ED8\u8BA4\u6863",
		  // B 的分组开关界面：分组/计数/开关点文案与用户级共用 `defaults.*` 一组键，本区只补命令兜底
		  // 说明（D8 + U1：命令只作用本会话所属工作区）。
		  "workspace.cliHint": "\u672C\u9875\u53EA\u5217\u672C\u4F1A\u8BDD\u53EF\u89C1\u7684\u5DE5\u5177\uFF1B\u8DE8\u6E05\u5355\u7684\u65B0\u5173\u7528\u547D\u4EE4 `/tools workspace off <\u5730\u5740>`\uFF08\u53EA\u4F5C\u7528\u672C\u4F1A\u8BDD\u6240\u5C5E\u5DE5\u4F5C\u533A\uFF09\u3002",
		  "workspace.remove": "\u79FB\u9664",
		  "workspace.removeAria": "\u79FB\u9664 {address}",
		  "workspace.saved": "\u5DF2\u4FDD\u5B58\uFF08\u672C\u4F1A\u8BDD\u4E0D\u53D8\uFF09\u3002",
		  "workspace.clear": "\u6E05\u7A7A\u5DE5\u4F5C\u533A\u9ED8\u8BA4\u6863",
		  "workspace.clearConfirm": "\u518D\u70B9\u4E00\u6B21\u786E\u8BA4\u6E05\u7A7A",
		  "workspace.refresh": "\u5237\u65B0\u5DE5\u4F5C\u533A\u6863",
		  // —— 工作区页面（WorkspaceDefaultsPage，code-design ③3.5）：清单卡 ——
		  "workspace.listTitle": "\u9ED8\u8BA4\u5173\u95ED\u9879",
		  "workspace.listHint": "\u5F00\u5173\u53EA\u5199\u672C\u5DE5\u4F5C\u533A\u9ED8\u8BA4\u6863\uFF1A\u5173\u95ED = \u4E4B\u540E\u5728\u6B64\u5DE5\u4F5C\u533A\u65B0\u5EFA\u7684\u4F1A\u8BDD\u521D\u59CB\u4E0D\u53EF\u7528\u3002",
		  "workspace.filter": "\u8FC7\u6EE4\u5DE5\u5177\u3001\u6280\u80FD\u6216\u5730\u5740\u2026",
		  "workspace.emptyDefaults": "\u672C\u5DE5\u4F5C\u533A\u8FD8\u6CA1\u6709\u9ED8\u8BA4\u5173\u95ED\u9879\u3002",
		  "workspace.emptyDefaultsHint": "\u5728\u4E0B\u65B9\u6E05\u5355\u91CC\u5173\u95ED\u4EFB\u610F\u6761\u76EE\u5373\u5199\u5165\uFF1B\u53EA\u5F71\u54CD\u4E4B\u540E\u5728\u6B64\u5DE5\u4F5C\u533A\u65B0\u5EFA\u7684\u4F1A\u8BDD\u3002",
		  "workspace.emptyUniverse": "\u5BBF\u4E3B\u6CA1\u6709\u63D0\u4F9B\u53EF\u5217\u51FA\u7684\u5DE5\u5177\u6E05\u5355\uFF0C\u6682\u65F6\u53EA\u80FD\u67E5\u770B\u4E0E\u79FB\u9664\u6863\u5185\u5DF2\u6709\u6761\u76EE\u3002",
		  "workspace.universeUnavailable": "\u5BBF\u4E3B\u5168\u5C40\u5DE5\u5177\u6CE8\u518C\u8868\u6682\u4E0D\u53EF\u7528\uFF1A\u53EA\u80FD\u67E5\u770B\u4E0E\u79FB\u9664\u6863\u5185\u5DF2\u6709\u6761\u76EE\u3002",
		  "workspace.ungrouped": "\u53E6\u6709 {count} \u4E2A MCP \u5DE5\u5177\u540D\u65E0\u6CD5\u5F52\u7EC4\uFF08\u516C\u5F00\u540D\u5F52\u4E00\u5316/\u622A\u65AD\u540E\u65E0\u6CD5\u8FD8\u539F\u670D\u52A1\u5668\u540D\uFF09\uFF0C\u672C\u9875\u4E0D\u63D0\u4F9B\u5F00\u5173\u3002",
		  "workspace.skillsIncomplete": "\u6280\u80FD\u76EE\u5F55\u89C2\u6D4B\u4E0D\u5B8C\u6574\uFF0C\u6E05\u5355\u53EF\u80FD\u7F3A\u9879\u3002",
		  "workspace.foreignProjectMcp": "\u53E6\u6709 {count} \u4E2A\u5176\u4ED6\u5DE5\u4F5C\u533A\u7684\u9879\u76EE\u7EA7 MCP \u670D\u52A1\u5668\u672A\u5217\u5165\uFF08\u4EC5\u5176\u6240\u5C5E\u5DE5\u4F5C\u533A\u53EF\u89C1\uFF09\u3002",
		  "mcp.sourceUser": "\u7528\u6237\u7EA7",
		  "mcp.sourceUserHint": "profile \u7EA7\u914D\u7F6E\uFF1A\u6240\u6709\u5DE5\u4F5C\u533A\u7684\u4F1A\u8BDD\u90FD\u53EF\u89C1\u3002",
		  "mcp.sourceProject": "\u9879\u76EE\u7EA7",
		  "mcp.sourceProjectHint": "\u672C\u5DE5\u4F5C\u533A .dsh/mcp/ \u7684\u9879\u76EE\u7EA7\u914D\u7F6E\uFF1A\u4EC5\u672C\u5DE5\u4F5C\u533A\u7684\u4F1A\u8BDD\u53EF\u89C1\u3002",
		  "mcp.tokens": "\u8BA1\u5165\u5BF9\u8BDD\u4E0A\u4E0B\u6587",
		  "mcp.tokensHint": "\u6BCF\u4E2A\u53EF\u89C1\u5DE5\u5177\u7684\u53C2\u6570 schema \u4E0E\u670D\u52A1\u5668\u6307\u4EE4\u4F1A\u8BA1\u5165\u6BCF\u6B21\u5BF9\u8BDD\u8BF7\u6C42\u3002",
		  "workspace.globalUnion": "\u5DE5\u5177\u6E05\u5355\u6765\u81EA\u5BBF\u4E3B\u8FDB\u7A0B\u7684\u5168\u5C40\u6CE8\u518C\u8868\uFF08\u6240\u6709\u5DF2\u52A0\u8F7D\u5DE5\u4F5C\u533A\u7684\u5E76\u96C6\uFF09\uFF1A\u53EF\u80FD\u5217\u51FA\u672C\u5DE5\u4F5C\u533A\u770B\u4E0D\u5230\u7684 MCP \u5DE5\u5177\uFF1B\u5199\u5165\u53EA\u4FDD\u7559\u610F\u56FE\uFF0C\u65B0\u4F1A\u8BDD\u4E0D\u5B58\u5728\u8BE5\u5DE5\u5177\u65F6\u4E0D\u751F\u6548\u3002\u6280\u80FD\u6E05\u5355\u6309\u672C\u5DE5\u4F5C\u533A\u76EE\u5F55\u8BFB\u53D6\u3002",
		  // —— 命令卡：跨清单地址的复制兜底（同 ③3.5） ——
		  "workspace.commandTitle": "\u8DE8\u6E05\u5355\u5730\u5740",
		  "workspace.commandNote": "\u8BE5\u547D\u4EE4\u53EA\u5199\u300C\u672C\u4F1A\u8BDD\u6240\u5C5E\u5DE5\u4F5C\u533A\u300D\u7684\u6863\uFF1B\u8981\u7ED9\u5176\u4ED6\u5DE5\u4F5C\u533A\u8865\u6761\u76EE\uFF0C\u8BF7\u76F4\u63A5\u7F16\u8F91\u4E0A\u9762\u7684\u5DE5\u4F5C\u533A\u6863\u6587\u4EF6\u3002",
		  "workspace.commandComment": "\u76EE\u6807\u5DE5\u4F5C\u533A\uFF1A{key}",
		  "workspace.copyCommand": "\u590D\u5236\u547D\u4EE4",
		  "workspace.copied": "\u5DF2\u590D\u5236",
		  "workspace.copyFailed": "\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u9009\u62E9\u6587\u672C\u3002",
		  // 侧栏 footer 入口与自绘对话框（7.3）：标题/范围说明复用上面的 workspace.title / workspace.scope，
		  // 这里只补两处只属于「入口壳」的状态文案。
		  "workspace.loading": "\u6B63\u5728\u8BFB\u53D6\u5DE5\u4F5C\u533A\u9ED8\u8BA4\u6863\u2026",
		  "workspace.unavailable": "\u6682\u65F6\u65E0\u6CD5\u8BFB\u53D6\u5DE5\u4F5C\u533A\u9ED8\u8BA4\u6863\u3002",
		  // —— 状态摘要（两计数 + 创建时快照 + 持久化通道，设计 §3.2 第一段） ——
		  "state.visible": "\u672C\u4F1A\u8BDD\u53EF\u89C1 {visible}",
		  "state.denied": "\u5DF2\u5173 {denied}",
		  "state.storeKind.record": "\u6301\u4E45\u5316\uFF1A\u4F1A\u8BDD\u8BB0\u5F55",
		  "state.storeKind.memory": "\u6301\u4E45\u5316\uFF1A\u5185\u5B58\uFF08\u91CD\u542F\u540E\u4E22\u5931\uFF09",
		  "state.snapshot": "\u521B\u5EFA\u65F6\u5FEB\u7167 {count} \u9879",
		  "state.createdAt": "\u4F1A\u8BDD\u521B\u5EFA\u4E8E {time}",
		  // —— 变更回执的代价形状（设计 §3.6：只报计数与代价形状，D7） ——
		  "mutation.kv": "\u672C\u6B21\u5173\u95ED {hidden} \u4E2A\u5DE5\u5177\uFF1B\u524D\u7F00\u7F13\u5B58\u5C06\u4ECE\u7B2C\u4E00\u4E2A\u53D8\u5316\u7684 schema token \u8D77\u91CD\u5EFA\u4E00\u6B21\u3002",
		  // —— 提示码（`NOTICE_CODES` 五个，宿主只给码） ——
		  "notice.persistence-degraded": "\u8BB0\u5F55\u901A\u9053\u4E0D\u53EF\u7528\uFF0C\u5173\u95ED\u96C6\u5DF2\u964D\u7EA7\u4E3A\u5185\u5B58\u6001\uFF1A\u8FDB\u7A0B\u91CD\u542F\u540E\u4E22\u5931\u3002",
		  "notice.defaults-corrupt": "\u9ED8\u8BA4\u6863\u6587\u4EF6\u635F\u574F\u6216\u534A\u5199\uFF0C\u5DF2\u6309\u7A7A\u6863\u5904\u7406\u3002",
		  "notice.session-subagent": "\u5B50\u4EE3\u7406\u4F1A\u8BDD\u4E0D\u7EE7\u627F\u7236\u4F1A\u8BDD\u7684\u4F1A\u8BDD\u7EA7\u5F00\u5173\uFF0C\u53EA\u6309\u9ED8\u8BA4\u6863\u5FEB\u7167\u3002",
		  "notice.skills-unavailable": "\u6280\u80FD\u670D\u52A1\u4E0D\u53EF\u7528\uFF1A\u6280\u80FD\u5F00\u5173\u53EA\u8BB0\u610F\u56FE\uFF0C\u5F71\u5B50 stub \u4E0D\u751F\u6548\u3002",
		  "notice.skill-shadow-failed": "\u6280\u80FD\u5F71\u5B50\u6CE8\u518C\u672A\u80DC\u51FA\uFF08\u540C\u5C42\u5148\u5230\u5148\u5F97\uFF09\uFF1A\u8BE5\u6280\u80FD\u884C\u7684\u5F00\u5173\u4E0D\u53EF\u7528\u3002",
		  // —— 失败码 → 文案键（设计附录 §3.5 表逐条；未知码回退 error.fallback） ——
		  "error.bad-request": "\u8BF7\u6C42\u4E0D\u5408\u6CD5\uFF0C\u5BBF\u4E3B\u62D2\u7EDD\u4E86\u672C\u6B21\u8C03\u7528\u3002",
		  "error.bad-address": "\u5730\u5740\u4E0D\u5408\u6CD5\uFF1A{address}\u3002\u8BED\u6CD5\u89C1 `/tools` \u5E2E\u52A9\uFF08`mcp:<server>`\u3001`mcp:<server>::<\u5DE5\u5177>`\u3001`tool:<\u540D\u5B57>`\u3001`skill`\uFF09\u3002",
		  "error.protected": "{names} \u5728\u4FDD\u62A4\u540D\u5355\u5185\uFF0C\u4E0D\u80FD\u5173\u95ED\u3002",
		  "error.reserved": "{names} \u662F\u4FDD\u7559\u5DE5\u5177\uFF0C\u4E0D\u80FD\u5173\u95ED\u3002",
		  "error.session-not-live": "\u8BE5\u4F1A\u8BDD\u672A\u5728\u5BBF\u4E3B\u4E2D\u8FD0\u884C\uFF08\u53EF\u80FD\u5DF2\u5F52\u6863\u6216\u5DF2\u7ED3\u675F\uFF09\uFF0C\u65E0\u6CD5\u8C03\u6574\u5DE5\u5177\u9762\u3002",
		  "error.defaults-unwritable": "\u9ED8\u8BA4\u6863\u5199\u5165\u5931\u8D25\uFF1A{path}\u3002",
		  "error.workspace-unresolved": "\u5DE5\u4F5C\u533A\u65E0\u6CD5\u5F52\u5C5E\uFF1A{subject}\u3002",
		  "error.workspace-unwritable": "\u5DE5\u4F5C\u533A\u9ED8\u8BA4\u6863\u5199\u5165\u5931\u8D25\uFF1A{path}\u3002",
		  "error.internal": "\u5BBF\u4E3B\u5185\u90E8\u9519\u8BEF\uFF0C\u672C\u6B21\u64CD\u4F5C\u672A\u5B8C\u6210\u3002",
		  "error.unavailable": "\u65E0\u6CD5\u8FDE\u63A5\u5230 dsh \u4E3B\u8FDB\u7A0B\u3002",
		  "error.bad-response": "\u5BBF\u4E3B\u8FD4\u56DE\u4E86\u65E0\u6CD5\u8BC6\u522B\u7684\u54CD\u5E94\u3002",
		  "error.fallback": "\u64CD\u4F5C\u5931\u8D25\u3002"
		};
		var en = {
		  // —— 入口按钮 ——
		  "action.label": "Tools",
		  "action.title": "Session tool surface",
		  "action.tooltip": "Session tool switches: turn groups or single tools off for this session",
		  "action.aria": "Open the session tool surface panel",
		  // —— Section row of the unified workspace-settings dialog (nav label thunk) ——
		  "section.label": "Workspace defaults",
		  // —— 面板骨架 ——
		  "panel.title": "Session tool surface",
		  "panel.description": "Tools available in this session and their switches; changes only affect this session from the next model step on.",
		  "panel.close": "Close",
		  "panel.loading": "Reading the tool surface\u2026",
		  "panel.empty": "No tool to show in this session.",
		  "panel.refresh": "Refresh",
		  // —— 分区标题（六段） ——
		  "section.state": "Status summary",
		  "section.groups": "Session switches",
		  "section.skills": "Per-skill switches",
		  "section.defaults": "User defaults",
		  "section.disabled": "Off set",
		  // —— 分组 ——
		  "group.mcp": "MCP servers",
		  "group.skill": "Skills",
		  "group.builtin": "Built-in tools",
		  "group.toolCount": "{count} tools",
		  "group.disabledCount": "{count} off",
		  "group.summary": "{count} tools, {disabled} off",
		  // The built-in section's local filter input (display only, never grammar validation).
		  "group.filter": "Filter by tool name\u2026",
		  // —— 技能分区（逐 skill 行开关） ——
		  "skill.region": "Skill switches",
		  "skill.unavailable": "The skill service is unavailable; per-skill switches cannot be used.",
		  "skill.blocked": "The skill tool is turned off as a whole; per-skill switches have no effect until it is turned back on.",
		  "skill.pending": "Applying\u2026",
		  "skill.switchLabel": "Model visibility switch for {name}",
		  "skill.empty": "No skills to show in this session.",
		  // Two state tags: `effective` = turned off and the shadow stub is in effect; `intentOnly` =
		  // the intent is recorded but not effective yet (skill missing or shadow registration lost).
		  "skill.effective": "Hidden from the model (`/name` still works)",
		  "skill.intentOnly": "Recorded; no effect yet",
		  // Skill source short tags (code-design ③3.5); the mapping table lives in
		  // WorkspaceDefaultsPage.tsx and unknown sources render as-is.
		  "skill.source.project-dsh": "Project",
		  "skill.source.project-agents": "Project (agents)",
		  "skill.source.custom": "Custom",
		  "skill.source.user-dsh": "User",
		  "skill.source.user-agents": "User (agents)",
		  "skill.source.bundled": "Bundled",
		  "skill.source.runtime": "Runtime",
		  // —— 行级标记 ——
		  "entry.disabled": "Off",
		  "entry.protected": "Protected",
		  "entry.reserved": "Locked",
		  "entry.intentOnly": "No match yet",
		  // Skill row tags of the workspace page (code-design ③3.5): model invocation cost / manual
		  // invocation / initial state in new sessions.
		  "entry.skillTokens": "Uses dialog tokens",
		  "entry.skillNoTokens": "No dialog tokens",
		  "entry.skillUserInvocable": "`/{name}` available",
		  "entry.skillUserBlocked": "No manual invocation",
		  "entry.skillHidden": "Off in new sessions",
		  // —— 徽标与禁用理由 ——
		  "badge.protected": "On the protected list; cannot be turned off.",
		  "badge.reserved": "A reserved tool; cannot be turned off.",
		  "badge.intent": "Intent",
		  // —— 开关的可访问名 ——
		  "switch.label": "Session switch for {name}",
		  // —— 开关操作 ——
		  "toggle.pending": "Applying\u2026",
		  "toggle.failed": "The switch was not applied; nothing changed.",
		  // —— 关闭集区 ——
		  "disabled.listTitle": "Off set",
		  "disabled.intentOnly": "These addresses match no tool right now: the intent is recorded but has no effect yet.",
		  "disabled.empty": "Nothing is turned off.",
		  // The off-set chip's enable action and the section's restore-to-creation-snapshot action (10.4).
		  "disabled.enable": "Turn on",
		  "disabled.enableAria": "Turn on {address}",
		  "disabled.reset": "Restore the creation snapshot",
		  "disabled.resetConfirm": "Click again to restore",
		  // —— 用户级默认档 ——
		  "defaults.path": "Defaults file",
		  "defaults.note": "Only affects sessions created afterwards.",
		  "defaults.scope": "Scope: only sessions created afterwards; this session stays as it is.",
		  "defaults.snapshot": "This session was created at {time}, with a snapshot of {count} entries.",
		  // —— B's group-switch UI (code-design ③3.20): the free-text add chain is gone (D8), so only the
		  //     list readings and the group-switch labels live here; new entries go through the CLI ——
		  "defaults.counts": "{listed} listed \xB7 {inDefaults} off by default \xB7 {residual} residual",
		  "defaults.summary": "{inDefaults} off by default \xB7 {residual} residual",
		  "defaults.residualTitle": "Residual addresses (not in this session's list; removal only)",
		  "defaults.universeUnavailable": "This session's tool list is unavailable right now: you can only view and remove entries already in the tier.",
		  // Empty state when the global filter matches nothing (code-design ③3.5; used by the
		  // DefaultsGroupList of the workspace page's list card).
		  "defaults.filterEmpty": "No entry matches \u201C{query}\u201D.",
		  // Group header row: entry count / in-tier count / combined title (screen readers and hover).
		  "defaults.groupCount": "{count} items",
		  "defaults.groupInDefaults": "{count} off by default",
		  "defaults.groupSummary": "{count} items, {inDefaults} off by default",
		  // Accessible names for the row and group switches; a group in the tier disables its rows and
		  // labels them `whole group off by default`.
		  "defaults.groupOff": "Whole group off by default",
		  "defaults.switchLabel": "Defaults switch for {name}",
		  "defaults.groupSwitchLabel": "Whole-group defaults switch for {name}",
		  // The D8 fallback line: this page lists only tools visible in this session, so new entries go
		  // through the command.
		  "defaults.cliHint": "This page lists only tools visible in this session; to turn off a new one across lists use the `/tools default off <address>` command.",
		  "defaults.remove": "Remove",
		  "defaults.saved": "Saved (this session is unchanged).",
		  "defaults.clear": "Clear defaults",
		  "defaults.clearConfirm": "Click again to clear",
		  // —— 工作区默认档 ——
		  "workspace.title": "Workspace defaults",
		  // Empty state when the page-level picker gives no valid target (unassigned / service not ready):
		  // the section sends no addressing request and no longer renders a picker of its own.
		  "workspace.noTarget": "Choose a workspace above first",
		  "workspace.key": "Workspace key",
		  "workspace.path": "Workspace file",
		  "workspace.registered": "Registered workspace",
		  "workspace.unregistered": "Unregistered workspace",
		  "workspace.unresolved": "This session's workspace cannot be attributed, so only the user defaults are seeded.",
		  "workspace.corrupt": "The workspace file is corrupt or half-written; it was treated as empty.",
		  "workspace.scope": "Scope: only sessions created in this workspace afterwards; this session stays as it is.",
		  "workspace.union": "A new session starts off with the user defaults \u222A this workspace's defaults",
		  // B's group-switch UI reuses the `defaults.*` group/count/switch labels; only this CLI hint is
		  // workspace-specific (D8 + U1: the command applies to this session's workspace only).
		  "workspace.cliHint": "This page lists only tools visible in this session; to turn off a new one across lists use the `/tools workspace off <address>` command (applies to the workspace of this session only).",
		  "workspace.remove": "Remove",
		  "workspace.removeAria": "Remove {address}",
		  "workspace.saved": "Saved (this session is unchanged).",
		  "workspace.clear": "Clear workspace defaults",
		  "workspace.clearConfirm": "Click again to clear",
		  "workspace.refresh": "Refresh workspace defaults",
		  // —— Workspace page (WorkspaceDefaultsPage, code-design ③3.5): list card ——
		  "workspace.listTitle": "Off-by-default entries",
		  "workspace.listHint": "Switches write this workspace's defaults: off means sessions created here later start with the tool unavailable.",
		  "workspace.filter": "Filter tools, skills, or addresses\u2026",
		  "workspace.emptyDefaults": "No off-by-default entries in this workspace yet.",
		  "workspace.emptyDefaultsHint": "Turn any entry off below to write it to this workspace's defaults; only sessions created here afterwards are affected.",
		  "workspace.emptyUniverse": "The host exposes no tool catalog right now, so only existing entries can be viewed or removed.",
		  "workspace.universeUnavailable": "The host's global tool registry is unavailable: only existing entries can be viewed or removed.",
		  "workspace.ungrouped": "{count} more MCP tool names cannot be grouped (their public names lost the server boundary after normalization/truncation); they are not switchable here.",
		  "workspace.skillsIncomplete": "The skill catalog observation is incomplete; the list may miss entries.",
		  "workspace.foreignProjectMcp": "{count} more project-level MCP server(s) from other workspaces are not listed (visible only to their own workspace).",
		  "mcp.sourceUser": "User-level",
		  "mcp.sourceUserHint": "Profile-level configuration: visible to every workspace's sessions.",
		  "mcp.sourceProject": "Project-level",
		  "mcp.sourceProjectHint": "Project-level configuration in this workspace's .dsh/mcp/: visible only to this workspace's sessions.",
		  "mcp.tokens": "Counts into context",
		  "mcp.tokensHint": "Each visible tool's parameter schema and the server instructions count into every dialog request.",
		  "workspace.globalUnion": "The tool list comes from the host process's global registry (the union of all loaded workspaces): it may include MCP tools this workspace cannot see; a write only records intent and has no effect where the tool does not exist. The skill list is read for this workspace's directory.",
		  // —— Command card: the copy fallback for addresses outside the list (same ③3.5) ——
		  "workspace.commandTitle": "Addresses outside the list",
		  "workspace.commandNote": "The command writes only the workspace this session belongs to; to add entries for another workspace, edit the defaults file shown above.",
		  "workspace.commandComment": "Target workspace: {key}",
		  "workspace.copyCommand": "Copy command",
		  "workspace.copied": "Copied",
		  "workspace.copyFailed": "Copy failed; select the text manually.",
		  // The sidebar footer entry and its own dialog (7.3): the title/scope reuse workspace.title /
		  // workspace.scope above; only these two state lines belong to the entry shell.
		  "workspace.loading": "Reading the workspace defaults\u2026",
		  "workspace.unavailable": "The workspace defaults are not available right now.",
		  // —— 状态摘要（两计数 + 创建时快照 + 持久化通道） ——
		  "state.visible": "{visible} visible here",
		  "state.denied": "{denied} off",
		  "state.storeKind.record": "Persistence: session record",
		  "state.storeKind.memory": "Persistence: memory (lost on restart)",
		  "state.snapshot": "Snapshot at creation: {count} entries",
		  "state.createdAt": "Session created at {time}",
		  // —— 变更回执 ——
		  "mutation.kv": "Turned off {hidden} tools; the prefix cache will be rebuilt once from the first changed schema token.",
		  // —— 提示码 ——
		  "notice.persistence-degraded": "The record channel is unavailable, so the off set fell back to memory and is lost when the process restarts.",
		  "notice.defaults-corrupt": "The defaults file is corrupt or half-written; it was treated as empty.",
		  "notice.session-subagent": "A subagent session does not inherit its parent session switches; it only snapshots the user defaults.",
		  "notice.skills-unavailable": "The skill service is unavailable, so skill switches only record intent and no shadow stub takes effect.",
		  "notice.skill-shadow-failed": "The skill shadow registration lost the first-come-first-served race inside this layer; that skill row cannot be toggled.",
		  // —— 失败码 ——
		  "error.bad-request": "The host rejected the request as malformed.",
		  "error.bad-address": "Invalid address: {address}. The grammar is in the `/tools` help (`mcp:<server>`, `mcp:<server>::<tool>`, `tool:<name>`, `skill`).",
		  "error.protected": "{names} is on the protected list and cannot be turned off.",
		  "error.reserved": "{names} is a reserved tool and cannot be turned off.",
		  "error.session-not-live": "That session is not running in the host (it may be archived or finished); its tool surface cannot be adjusted.",
		  "error.defaults-unwritable": "Could not write the defaults file: {path}.",
		  "error.workspace-unresolved": "The workspace cannot be attributed: {subject}.",
		  "error.workspace-unwritable": "Could not write the workspace defaults file: {path}.",
		  "error.internal": "The host hit an internal error; nothing was applied.",
		  "error.unavailable": "Could not reach the dsh host process.",
		  "error.bad-response": "The host answered with an unrecognized response.",
		  "error.fallback": "The operation failed."
		};

		// src/client/ToolPanelAction.tsx
		var import_jsx_runtime8 = require("react/jsx-runtime");
		var EMPTY_UNIVERSE = { layerReady: false, skillsAvailable: false, groups: [] };
		function errorKeyOf(code) {
		  const candidate = `error.${code}`;
		  return candidate in zh ? candidate : "error.fallback";
		}
		function failureParams(error) {
		  const details = error.details;
		  if (details === void 0) return void 0;
		  if ("names" in details) return { names: details.names.join(", ") };
		  if ("address" in details) return { address: details.address };
		  if ("path" in details) return { path: details.path };
		  if ("subject" in details) return { subject: details.subject };
		  return void 0;
		}
		function failureOf2(error, t) {
		  if (error === void 0) return void 0;
		  const text = t(errorKeyOf(error.code), failureParams(error));
		  return error.message === "" ? { text } : { text, detail: error.message };
		}
		function formatTime2(at) {
		  return new Date(at).toLocaleString();
		}
		function noticeText(code, t) {
		  switch (code) {
		    case "persistence-degraded":
		      return t("notice.persistence-degraded");
		    case "defaults-corrupt":
		      return t("notice.defaults-corrupt");
		    case "session-subagent":
		      return t("notice.session-subagent");
		    case "skills-unavailable":
		      return t("notice.skills-unavailable");
		    case "skill-shadow-failed":
		      return t("notice.skill-shadow-failed");
		  }
		}
		function FailureRow({ failure, className }) {
		  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className, role: "alert", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: panel_default.error, children: failure.text }),
		    failure.detail !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: panel_default.detail, children: failure.detail })
		  ] });
		}
		function StateSection({ snapshot, kvDelta, t }) {
		  const { stats, state } = snapshot;
		  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("section", { className: panel_default.section, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("h3", { className: panel_default.sectionTitle, children: t("section.state") }),
		    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("ul", { className: panel_default.counters, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("li", { children: t("state.visible", { visible: stats.visible }) }),
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("li", { children: t("state.denied", { denied: stats.denied }) })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("p", { className: panel_default.meta, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: t("state.createdAt", { time: formatTime2(snapshot.createdAt) }) }),
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: t("state.snapshot", { count: state.snapshot.length }) }),
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: state.storeKind === "record" ? t("state.storeKind.record") : t("state.storeKind.memory") })
		    ] }),
		    kvDelta !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: panel_default.notice, children: t("mutation.kv", { hidden: kvDelta }) }),
		    snapshot.notices.map((code) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
		      "p",
		      {
		        className: code === "persistence-degraded" ? panel_default.warning : panel_default.notice,
		        children: noticeText(code, t)
		      },
		      code
		    ))
		  ] });
		}
		function DisabledSection({
		  snapshot,
		  pending,
		  resetting,
		  armed,
		  onArm,
		  onReset,
		  onEnable,
		  t
		}) {
		  const intentOnly = (0, import_react7.useMemo)(() => new Set(snapshot.intentOnly), [snapshot.intentOnly]);
		  const addresses = snapshot.state.disabled;
		  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("section", { className: panel_default.section, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("h3", { className: panel_default.sectionTitle, children: t("section.disabled") }),
		    addresses.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: panel_default.muted, children: t("disabled.empty") }) : /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("ul", { className: panel_default.chips, "aria-label": t("disabled.listTitle"), children: addresses.map((address) => {
		      const pendingRow = pending.has(address);
		      return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("li", { className: panel_default.chip, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("code", { className: panel_default.address, title: address, children: address }),
		        intentOnly.has(address) && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: panel_default.badge, title: t("entry.intentOnly"), children: t("badge.intent") }),
		        pendingRow && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: panel_default.pending, children: t("toggle.pending") }),
		        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
		          import_dsh_client_ui_primitives8.Button,
		          {
		            variant: "ghost",
		            size: "sm",
		            "aria-label": t("disabled.enableAria", { address }),
		            disabled: resetting || pendingRow,
		            onClick: () => {
		              onEnable(address);
		            },
		            children: t("disabled.enable")
		          }
		        )
		      ] }, address);
		    }) }),
		    snapshot.intentOnly.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: panel_default.muted, children: t("disabled.intentOnly") }),
		    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: panel_default.actions, children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
		      import_dsh_client_ui_primitives8.Button,
		      {
		        variant: "outline",
		        size: "sm",
		        disabled: resetting || addresses.length === 0,
		        onClick: () => {
		          if (armed) onReset();
		          else onArm();
		        },
		        children: armed ? t("disabled.resetConfirm") : t("disabled.reset")
		      }
		    ) })
		  ] });
		}
		function ToolPanelAction({
		  sessionId,
		  resolveClient,
		  subscribeCommandExecuted,
		  attachFocusListener: attachFocusListener2,
		  t
		}) {
		  const resolve = (0, import_react7.useRef)(resolveClient);
		  resolve.current = resolveClient;
		  const subscribeCommands = (0, import_react7.useRef)(subscribeCommandExecuted);
		  subscribeCommands.current = subscribeCommandExecuted;
		  const attachFocus = (0, import_react7.useRef)(attachFocusListener2);
		  attachFocus.current = attachFocusListener2;
		  const controller = (0, import_react7.useMemo)(
		    () => new PanelController({
		      sessionId,
		      resolveClient: () => resolve.current(),
		      subscribeCommandExecuted: (handler) => subscribeCommands.current?.(handler) ?? (() => {
		      }),
		      attachFocusListener: (handler) => attachFocus.current?.(handler) ?? (() => {
		      })
		    }),
		    [sessionId]
		  );
		  (0, import_react7.useEffect)(() => () => controller.dispose(), [controller]);
		  const state = (0, import_react7.useSyncExternalStore)(controller.subscribe, controller.getSnapshot);
		  const opened = state.phase !== "idle";
		  const snapshot = state.snapshot;
		  const universe = (0, import_react7.useMemo)(
		    () => snapshot === void 0 ? EMPTY_UNIVERSE : universeOfSnapshot(snapshot),
		    [snapshot]
		  );
		  const failure = (0, import_react7.useMemo)(() => failureOf2(state.error, t), [state.error, t]);
		  const defaultsFailure = (0, import_react7.useMemo)(() => failureOf2(state.defaultsError, t), [state.defaultsError, t]);
		  const workspaceFailure = (0, import_react7.useMemo)(() => failureOf2(state.workspaceError, t), [state.workspaceError, t]);
		  const [kvDelta, setKvDelta] = (0, import_react7.useState)(void 0);
		  const previous = (0, import_react7.useRef)(void 0);
		  (0, import_react7.useEffect)(() => {
		    if (snapshot === void 0) return;
		    const before = previous.current;
		    previous.current = snapshot;
		    if (before === void 0 || before === snapshot) return;
		    const hidden = snapshot.stats.denied - before.stats.denied;
		    setKvDelta(hidden > 0 ? hidden : void 0);
		  }, [snapshot]);
		  const [resetArmed, setResetArmed] = (0, import_react7.useState)(false);
		  const [defaultsSaved, setDefaultsSaved] = (0, import_react7.useState)(false);
		  const writeDefaults = (action, addresses) => {
		    setDefaultsSaved(false);
		    void controller.updateDefaults(action, addresses).then(() => {
		      const next = controller.getSnapshot();
		      setDefaultsSaved(!next.savingDefaults && next.defaultsError === void 0);
		    });
		  };
		  const footer = /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(import_jsx_runtime8.Fragment, { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
		      import_dsh_client_ui_primitives8.Button,
		      {
		        variant: "ghost",
		        size: "sm",
		        icon: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_dsh_client_ui_primitives8.IconRefreshOutlineRegular, {}),
		        "aria-label": t("panel.refresh"),
		        disabled: state.phase === "loading",
		        onClick: () => {
		          void controller.refresh();
		        },
		        children: t("panel.refresh")
		      }
		    ),
		    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
		      import_dsh_client_ui_primitives8.Button,
		      {
		        variant: "outline",
		        size: "sm",
		        onClick: () => {
		          controller.close();
		        },
		        children: t("panel.close")
		      }
		    )
		  ] });
		  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(import_jsx_runtime8.Fragment, { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
		      import_dsh_client_ui_primitives8.Button,
		      {
		        variant: "ghost",
		        size: "sm",
		        className: panel_default.trigger,
		        icon: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_dsh_client_ui_primitives8.IconSlidersTwoOutlineRegular, {}),
		        "aria-label": t("action.label"),
		        "aria-description": t("action.aria"),
		        "aria-haspopup": "dialog",
		        "aria-expanded": opened,
		        title: t("action.tooltip"),
		        onClick: () => {
		          if (opened) controller.close();
		          else void controller.open();
		        }
		      }
		    ),
		    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
		      import_dsh_client_ui_primitives8.Modal,
		      {
		        open: opened,
		        onClose: () => {
		          controller.close();
		        },
		        title: t("panel.title"),
		        closeLabel: t("panel.close"),
		        description: t("panel.description"),
		        className: panel_default.dialog,
		        contentClassName: panel_default.content,
		        footer,
		        children: snapshot === void 0 ? failure === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: panel_default.loading, children: t("panel.loading") }) : /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(FailureRow, { failure, className: panel_default.failureBlock }) : /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(import_jsx_runtime8.Fragment, { children: [
		          failure !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(FailureRow, { failure }),
		          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(StateSection, { snapshot, kvDelta, t }),
		          /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("section", { className: panel_default.section, children: [
		            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("h3", { className: panel_default.sectionTitle, children: t("section.groups") }),
		            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
		              ToolPanelGroups,
		              {
		                groups: snapshot.groups,
		                pending: state.pending,
		                busy: state.resetting,
		                onToggle: (address, on) => {
		                  void controller.toggle(address, on);
		                },
		                t
		              }
		            )
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("section", { className: panel_default.section, "aria-label": t("section.skills"), children: [
		            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("h3", { className: panel_default.sectionTitle, children: t("section.skills") }),
		            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
		              SkillPanel,
		              {
		                skills: snapshot.skills,
		                unavailable: snapshot.notices.includes("skills-unavailable"),
		                blocked: snapshot.state.disabled.includes("tool:skill"),
		                pending: state.pending,
		                busy: state.resetting,
		                onToggle: (address, on) => {
		                  void controller.toggle(address, on);
		                },
		                t
		              }
		            )
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
		            WorkspaceDefaultsEditor,
		            {
		              workspace: state.workspace ?? null,
		              universe,
		              variant: "section",
		              saving: state.savingWorkspace,
		              saved: state.workspaceSaved,
		              failure: workspaceFailure,
		              onUpdate: (action, addresses) => {
		                void controller.updateWorkspace(action, addresses);
		              },
		              onRefresh: () => {
		                void controller.refreshWorkspace();
		              },
		              t
		            }
		          ),
		          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
		            DefaultsEditor,
		            {
		              defaults: state.defaults ?? snapshot.defaults,
		              universe,
		              createdAt: snapshot.createdAt,
		              snapshotCount: snapshot.state.snapshot.length,
		              saving: state.savingDefaults,
		              saved: defaultsSaved,
		              failure: defaultsFailure,
		              onUpdate: writeDefaults,
		              t
		            }
		          ),
		          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
		            DisabledSection,
		            {
		              snapshot,
		              pending: state.pending,
		              resetting: state.resetting,
		              armed: resetArmed,
		              onArm: () => {
		                setResetArmed(true);
		              },
		              onReset: () => {
		                setResetArmed(false);
		                void controller.reset();
		              },
		              onEnable: (address) => {
		                void controller.toggle(address, true);
		              },
		              t
		            }
		          )
		        ] })
		      }
		    )
		  ] });
		}

		// src/client/WorkspaceEntry.tsx
		var import_react8 = require("react");
		var import_jsx_runtime9 = require("react/jsx-runtime");
		var CLIENT_MISSING_MESSAGE2 = "\u5DE5\u4F5C\u533A\u9ED8\u8BA4\u6863\u5BA2\u6237\u7AEF\u5C1A\u672A\u5C31\u7EEA\uFF1Aconnection \u53EF\u80FD\u665A\u4E8E\u63D2\u4EF6 apply \u6302\u8F7D";
		var NO_TARGET_MESSAGE = "\u5F53\u524D\u6CA1\u6709\u53EF\u5BFB\u5740\u7684\u76EE\u6807\u5DE5\u4F5C\u533A\uFF1A\u76EE\u6807\u7531\u9875\u9762\u9009\u62E9\u6846\u7ED9\u51FA\uFF0C\u7A7A\u76EE\u6807\u65F6\u672C\u8282\u5448\u73B0\u7A7A\u6001";
		var NO_ADDRESS_MESSAGE = "\u5199\u5165\u5DE5\u4F5C\u533A\u9ED8\u8BA4\u6863\u7F3A\u5C11\u5730\u5740\uFF1A\u7A7A\u5355\u4E0D\u53D1\u8BF7\u6C42\uFF08\u5951\u7EA6\u8981\u6C42 set / off / on \u81F3\u5C11\u5E26\u4E00\u6761\u5730\u5740\uFF09";
		function asPanelError2(error) {
		  if (error instanceof PanelError) return error;
		  return new PanelError("internal", error instanceof Error ? error.message : String(error));
		}
		function hasTarget(request) {
		  return request.sessionId !== void 0 || request.workspacePath !== void 0;
		}
		function writeRequestOf(request, action, addresses) {
		  if (action === "reset") return { ...request, action };
		  if (addresses === void 0 || addresses.length === 0) return void 0;
		  return { ...request, action, addresses };
		}
		function releaseSaving(previous) {
		  return previous.saving ? { ...previous, saving: false } : previous;
		}
		function useWorkspaceDefaults(options) {
		  const resolveRef = (0, import_react8.useRef)(options.resolveClient);
		  resolveRef.current = options.resolveClient;
		  const initialTargetRef = (0, import_react8.useRef)(options.initialTarget);
		  initialTargetRef.current = options.initialTarget;
		  const [state, setState] = (0, import_react8.useState)({
		    phase: "idle",
		    saving: false,
		    saved: false
		  });
		  const seqRef = (0, import_react8.useRef)(0);
		  const mountedRef = (0, import_react8.useRef)(true);
		  (0, import_react8.useEffect)(() => {
		    mountedRef.current = true;
		    return () => {
		      mountedRef.current = false;
		      seqRef.current += 1;
		    };
		  }, []);
		  const clientOf = (0, import_react8.useCallback)(() => {
		    try {
		      return resolveRef.current();
		    } catch {
		      return void 0;
		    }
		  }, []);
		  const failLocally = (0, import_react8.useCallback)((message) => {
		    if (!mountedRef.current) return;
		    seqRef.current += 1;
		    setState((previous) => ({
		      ...previous,
		      // 有旧数据时保持阶段不变（stale-while-revalidate），没有数据时才是 failed。
		      phase: previous.value === void 0 ? "failed" : previous.phase,
		      error: new PanelError("unavailable", message),
		      saving: false,
		      saved: false
		    }));
		  }, []);
		  const read = (0, import_react8.useCallback)(async () => {
		    const client = clientOf();
		    if (client === void 0) {
		      failLocally(CLIENT_MISSING_MESSAGE2);
		      return;
		    }
		    const target = initialTargetRef.current();
		    if (!hasTarget(target)) {
		      failLocally(NO_TARGET_MESSAGE);
		      return;
		    }
		    const seq = seqRef.current += 1;
		    setState((previous) => ({ ...previous, phase: "loading", error: void 0, saved: false }));
		    try {
		      const value = await client.workspace({ ...target, action: "read" });
		      if (!mountedRef.current) return;
		      if (seq !== seqRef.current) return;
		      setState((previous) => ({ ...previous, phase: "ready", value, error: void 0, saved: false }));
		    } catch (error) {
		      if (!mountedRef.current || seq !== seqRef.current) return;
		      setState((previous) => ({ ...previous, phase: "failed", error: asPanelError2(error), saved: false }));
		    }
		  }, [clientOf, failLocally]);
		  const update = (0, import_react8.useCallback)(async (action, addresses) => {
		    if (action === "read") {
		      await read();
		      return;
		    }
		    const client = clientOf();
		    if (client === void 0) {
		      failLocally(CLIENT_MISSING_MESSAGE2);
		      return;
		    }
		    const target = initialTargetRef.current();
		    if (!hasTarget(target)) {
		      failLocally(NO_TARGET_MESSAGE);
		      return;
		    }
		    const request = writeRequestOf(target, action, addresses);
		    if (request === void 0) {
		      failLocally(NO_ADDRESS_MESSAGE);
		      return;
		    }
		    const seq = seqRef.current += 1;
		    setState((previous) => ({ ...previous, saving: true, error: void 0, saved: false }));
		    try {
		      const value = await client.workspace(request);
		      if (!mountedRef.current) return;
		      if (seq !== seqRef.current) {
		        setState(releaseSaving);
		        return;
		      }
		      setState((previous) => ({ ...previous, phase: "ready", value, saving: false, saved: true }));
		    } catch (error) {
		      if (!mountedRef.current) return;
		      if (seq !== seqRef.current) {
		        setState(releaseSaving);
		        return;
		      }
		      setState((previous) => ({ ...previous, saving: false, saved: false, error: asPanelError2(error) }));
		    }
		  }, [clientOf, failLocally, read]);
		  return { ...state, read, update };
		}
		function WorkspaceDefaultsTarget(props) {
		  const { workspacePath, resolveClient, t } = props;
		  const initialTarget = (0, import_react8.useCallback)(() => ({ workspacePath }), [workspacePath]);
		  const { value, error, saving, saved, read, update } = useWorkspaceDefaults({
		    resolveClient,
		    initialTarget
		  });
		  (0, import_react8.useEffect)(() => {
		    void read();
		  }, [read]);
		  const failure = (0, import_react8.useMemo)(() => {
		    if (error === void 0) return void 0;
		    if (error.code === "unavailable") {
		      return error.message === "" ? { text: t("workspace.unavailable") } : { text: t("workspace.unavailable"), detail: error.message };
		    }
		    return failureOf2(error, t);
		  }, [error, t]);
		  return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: panel_default.workspaceBody, children: value === void 0 ? failure === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: panel_default.loading, children: t("workspace.loading") }) : /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: panel_default.failureBlock, role: "alert", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: panel_default.error, children: failure.text }),
		    failure.detail !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: panel_default.detail, children: failure.detail })
		  ] }) : /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
		    WorkspaceDefaultsEditor,
		    {
		      workspace: value.workspace,
		      universe: value.universe,
		      variant: "dialog",
		      saving,
		      saved,
		      failure,
		      onUpdate: (action, addresses) => {
		        void update(action, addresses);
		      },
		      onRefresh: () => {
		        void read();
		      },
		      t
		    }
		  ) });
		}
		function WorkspaceDefaultsSection(props) {
		  const { workspace, resolveClient, t } = props;
		  if (workspace.kind !== "workspace") {
		    return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: panel_default.workspaceBody, children: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: panel_default.empty, children: t("workspace.noTarget") }) });
		  }
		  return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
		    WorkspaceDefaultsTarget,
		    {
		      workspacePath: workspace.path,
		      resolveClient,
		      t
		    },
		    workspace.path
		  );
		}

		// src/client/seats.ts
		var HEADER_SEAT = "conversation.session.header.utilities";
		var PANEL_ID = "session-tool-toggle-panel";
		var PANEL_ORDER = 20;
		var SECTION_SEAT = "workspace-config.section";
		var SECTION_ID = "session-tool-toggle-workspace-defaults";
		var SECTION_ORDER = 20;

		// src/client/index.ts
		var name = "session-tool-toggle";
		var inject = ["slots", "locale"];
		var LOG_LABEL = "session-tool-toggle";
		function attachFocusListener(handler) {
		  if (typeof window === "undefined") return () => {
		  };
		  window.addEventListener("focus", handler);
		  return () => {
		    window.removeEventListener("focus", handler);
		  };
		}
		function apply(ctx) {
		  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "session-tool-toggle: \u53CC\u8BED\u6587\u6848");
		  const handlers = /* @__PURE__ */ new Set();
		  ctx.effect(() => {
		    const off = ctx.on("command/executed", (sessionId, commandName) => {
		      for (const handler of Array.from(handlers)) handler(sessionId, commandName);
		    });
		    return () => {
		      handlers.clear();
		      off();
		    };
		  }, "session-tool-toggle: command/executed \u6865");
		  const t = ctx.locale.bind(NS);
		  const ports = {
		    resolveClient: () => {
		      const connection = ctx.get("connection");
		      return connection === void 0 ? void 0 : createPanelClient(connection);
		    },
		    subscribeCommandExecuted: (handler) => {
		      handlers.add(handler);
		      return () => {
		        handlers.delete(handler);
		      };
		    },
		    attachFocusListener
		  };
		  ctx.slots.inject(HEADER_SEAT, () => {
		    try {
		      return ctx.slots.register(
		        {
		          name: HEADER_SEAT,
		          id: PANEL_ID,
		          order: PANEL_ORDER,
		          locale: NS,
		          inject: () => ports
		        },
		        ToolPanelAction
		      );
		    } catch (error) {
		      ctx.logger.warn("%s: \u4F1A\u8BDD\u5934\u90E8\u5DE5\u5177\u533A\u5EA7\u4F4D\u6CE8\u518C\u5931\u8D25\uFF0C\u672C\u4F1A\u8BDD\u7684\u5165\u53E3\u4E0D\u663E\u793A", LOG_LABEL);
		      ctx.logger.warn(error);
		      return () => {
		      };
		    }
		  });
		  ctx.slots.inject(SECTION_SEAT, () => {
		    try {
		      return ctx.slots.register(
		        {
		          name: SECTION_SEAT,
		          id: SECTION_ID,
		          order: SECTION_ORDER,
		          // thunk：holder 的 nav 每次读取都重新求值，locale 切换无需重注册（上游 SlotLabel 语义）。
		          label: () => t("section.label"),
		          locale: NS,
		          inject: () => ({
		            // 复用头部入口的现取客户端：两个入口对 `connection` 是同一份纪律（同一 RPC 通道、
		            // 同一宿主控制内核，因此与 `/tools` 读到的是同一份状态）。
		            resolveClient: ports.resolveClient
		          })
		        },
		        WorkspaceDefaultsSection
		      );
		    } catch (error) {
		      ctx.logger.warn("%s: \u5DE5\u4F5C\u533A\u914D\u7F6E\u5206\u8282\u5EA7\u4F4D\u6CE8\u518C\u5931\u8D25\uFF0C\u672C\u8282\u4E0D\u663E\u793A", LOG_LABEL);
		      ctx.logger.warn(error);
		      return () => {
		      };
		    }
		  });
		}

		return module.exports;
	}
});
