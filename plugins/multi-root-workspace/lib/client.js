window.__ModuleLoader__.load({
	id: "dsh-plugin-multi-root-workspace",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region \0rolldown/runtime.js
		var __create = Object.create;
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __getProtoOf = Object.getPrototypeOf;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __copyProps = (to, from, except, desc) => {
			if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
				key = keys[i];
				if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
					get: ((k) => from[k]).bind(null, key),
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
				});
			}
			return to;
		};
		var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
			value: mod,
			enumerable: true
		}) : target, mod));
		//#endregion
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		_deepseek_ai_dsh_client_ui_primitives = __toESM(_deepseek_ai_dsh_client_ui_primitives, 1);
		let react_jsx_runtime = require("react/jsx-runtime");
		let react_dom = require("react-dom");
		//#region ../../tooling/client-kit/src/client-session.ts
		/**
		* 读取当前会话 id。
		*
		* **每次动作现取**：`sessions` 服务可能晚于 `apply` 就绪；在 `apply` 期把服务或快照
		* 闭包缓存下来，服务晚到时这条探测就永远读不到。
		*
		* @param sessions - 客户端 `sessions` 服务（消费方传 `ctx.get('sessions')` 的结果），或
		*   组合里挂在这个名字下的任何值。缺席是受支持状态。
		* @returns 当前会话 id；没有主视图持有的会话时为 `undefined`。
		*/
		function currentSessionIdOf(sessions) {
			const snapshot = listSnapshotOf(sessions);
			if (snapshot === void 0) return void 0;
			const current = snapshot.current;
			if (typeof current === "string" && current !== "") return current;
			return mainViewSessionId(snapshot.byId);
		}
		/**
		* 列表快照，仅当服务确实暴露了一个。
		*
		* `getSnapshot` 以**方法**方式调用：真实 store 要读 `this`。把函数摘出来裸调会丢
		* 绑定，即使会话已选中也返回 `undefined`（stt 原实现的既有教训，回归用例钉住）。
		* @param sessions - 客户端 `sessions` 服务，或组合里挂在这个名字下的任何值。
		* @returns 快照对象，或缺席 / 不可读时为 `undefined`。
		*/
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
				return;
			}
			if (snapshot === null || typeof snapshot !== "object") return void 0;
			return snapshot;
		}
		/**
		* 目录里第一行被主视图持有的会话。
		*
		* 一行只有在 `retainedBy.mainView` 是正数时才算选中：`0`、缺这个来源、非数值
		* 都不是选择。
		* @param byId - 目录映射，或快照里恰好携带的任何值。
		* @returns 该行的会话 id；没有任何主视图持有的行时为 `undefined`。
		*/
		function mainViewSessionId(byId) {
			if (byId === null || typeof byId !== "object") return void 0;
			for (const [key, row] of Object.entries(byId)) {
				if (!isMainViewRow(row)) continue;
				const id = rowIdOf(row, key);
				if (id !== void 0) return id;
			}
		}
		/**
		* 一行的会话 id：行上非空 `id` 优先，否则回退目录键。
		* @param row - 目录值（调用方已确认是对象）。
		* @param key - 目录里这一行的键。
		* @returns 会话 id；两边都空时 `undefined`。
		*/
		function rowIdOf(row, key) {
			const id = row.id;
			if (typeof id === "string" && id !== "") return id;
			return key !== "" ? key : void 0;
		}
		/** 某个目录值是不是主视图当前持有的一行。 */
		function isMainViewRow(row) {
			if (row === null || typeof row !== "object") return false;
			const retainedBy = row.retainedBy;
			if (retainedBy === null || typeof retainedBy !== "object") return false;
			const count = retainedBy.mainView;
			return typeof count === "number" && count > 0;
		}
		//#endregion
		//#region src/client/directory-picker.ts
		/** 浏览失败：`code` 是本地稳定码（不是 wire 码），`message` 保留上游原文供诊断。 */
		var DirectoryBrowseError = class extends Error {
			name = "DirectoryBrowseError";
			code;
			constructor(code, message) {
				super(message);
				this.code = code;
			}
		};
		/**
		* 构造拾取端口。
		* @param read - 每次调用现取 `ctx.uiWorkspace`（服务可能晚于 apply 就绪，也可能被替换）。
		* @returns 可直接注入分节的 `pickDirectory`（永远存在；无服务时调用返回 unavailable）。
		*/
		function createDirectoryPicker(read) {
			/** 能力缓存：以上次判定的服务实例为键（D-12），实例更换即失效。 */
			let cached;
			const remember = (service, kind) => {
				cached = {
					service,
					kind
				};
			};
			return async () => {
				const service = read();
				if (service === void 0) return { kind: "unavailable" };
				if ((cached !== void 0 && cached.service === service ? cached.kind : void 0) === "browse") {
					const browsing = browseOf(service);
					return browsing === void 0 ? { kind: "unavailable" } : {
						kind: "browse",
						browsing
					};
				}
				if (service.pickDirectory === void 0) {
					const browsing = browseOf(service);
					if (browsing === void 0) return { kind: "unavailable" };
					remember(service, "browse");
					return {
						kind: "browse",
						browsing
					};
				}
				try {
					const path = await service.pickDirectory();
					if (path !== null && path !== "") {
						remember(service, "native");
						return {
							kind: "picked",
							path
						};
					}
					return { kind: "cancelled" };
				} catch (error) {
					return await classifyPickFailure(service, error, remember);
				}
			};
		}
		/**
		* pick 抛错后的三级信号分类（顺序固定）。
		*
		* 任意一支返回 browse 之前都要求服务确有 list+create（`browseOf` / 窄化门）：
		* 只暴露 pick 的旧组合不许被误判成能浏览。
		* @param service - 本次判定的服务实例。
		* @param error - pick 原始错误（`failed` 结局必须原样上报）。
		* @param remember - 判定成立时写入能力缓存。
		*/
		async function classifyPickFailure(service, error, remember) {
			const capability = capabilityOf(failureOf(error));
			if (capability === "native") return {
				kind: "failed",
				error
			};
			if (capability === "browse") return degradeToBrowse(service, remember);
			const message = messageOf(error);
			if (BROWSE_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))) return degradeToBrowse(service, remember);
			const list = service.listDirectory;
			const create = service.createDirectory;
			if (list === void 0 || create === void 0) return { kind: "unavailable" };
			const browsing = browsePort(list.bind(service), create.bind(service));
			try {
				const listing = await list.call(service);
				remember(service, "browse");
				return {
					kind: "browse",
					browsing,
					listing
				};
			} catch (probeError) {
				if (capabilityOf(failureOf(probeError)) === "native") return {
					kind: "failed",
					error
				};
				return { kind: "unavailable" };
			}
		}
		/** ①② 命中 browse 后的统一降级出口：先过 browseOf 门，再缓存并返回（不带探测 listing）。 */
		function degradeToBrowse(service, remember) {
			const browsing = browseOf(service);
			if (browsing === void 0) return { kind: "unavailable" };
			remember(service, "browse");
			return {
				kind: "browse",
				browsing
			};
		}
		/** 服务的浏览端口（list+create 齐备才有）；失败经 `wrapBrowse` 归一化。 */
		function browseOf(service) {
			const { listDirectory: list, createDirectory: create } = service;
			if (list === void 0 || create === void 0) return void 0;
			return browsePort(list.bind(service), create.bind(service));
		}
		/**
		* 在已窄化的两个原语上构造浏览端口（`browseOf` 与探测分支共用）。
		*
		* 两个原语必须先 `bind(service)` 再传入：上游 `uiWorkspace` 的 `listDirectory`
		* / `createDirectory` 是读实例状态（`this.directoryPicker`）的实例方法，解构
		* 成裸引用调用会丢 `this` 并以 TypeError 收场——pick 走方法调用语法幸免，
		* 端口路径必须显式保留 receiver（2026-11-09 真机修复，ADR-0015 Consequences）。
		*/
		function browsePort(list, create) {
			return {
				list: (path, signal) => wrapBrowse(list(path, signal)),
				create: (path, name) => wrapBrowse(create(path, name))
			};
		}
		/**
		* browse 原语的失败一律转成 `DirectoryBrowseError`（行为契约 7）；abort 也落
		* `picker-failed`，对话框据 `signal.aborted` 丢弃、不渲染错误。
		*/
		function wrapBrowse(invocation) {
			return invocation.catch((error) => {
				throw normalizeBrowseFailure(error);
			});
		}
		/** wire 错误码 → 本地稳定码；表外（含 `gateway/internal`、`gateway/cancelled`）一律 `picker-failed`。 */
		const WIRE_CODE_TO_LOCAL = {
			"directory-picker/unreadable": "picker-unreadable",
			"directory-picker/exists": "picker-exists",
			"directory-picker/create-failed": "picker-create-failed"
		};
		/** 把上游 browse 原语的拒绝归一化成本地错误：`code` 稳定、`message` 保留上游原文供诊断。 */
		function normalizeBrowseFailure(error) {
			const failure = failureOf(error);
			const wireCode = typeof failure?.code === "string" ? failure.code : void 0;
			const code = wireCode !== void 0 ? WIRE_CODE_TO_LOCAL[wireCode] ?? "picker-failed" : "picker-failed";
			const topLevel = messageOf(error);
			const message = topLevel !== "" ? topLevel : typeof failure?.message === "string" ? failure.message : "";
			return new DirectoryBrowseError(code, message !== "" ? message : `directory browse failed: ${wireCode ?? "unknown failure"}`);
		}
		/** 读取一个值上的 DSH 远程失败视图：值本身带 string `code`，或经 `rpcError` 载体携带；都不是则 undefined。 */
		function failureOf(value) {
			if (value === null || typeof value !== "object") return void 0;
			const direct = value;
			if (typeof direct.code === "string") return direct;
			const carrier = value.rpcError;
			return carrier !== null && typeof carrier === "object" && typeof carrier.code === "string" ? carrier : void 0;
		}
		/** 结构化信号里的 `details.capability`（details 缺席或非对象 → undefined）。 */
		function capabilityOf(failure) {
			const details = failure?.details;
			if (details === null || typeof details !== "object") return void 0;
			return details.capability;
		}
		/** 任意失败上的 message 原文（Error 或带 string message 的对象；取不到返回空串）。 */
		function messageOf(value) {
			if (value instanceof Error) return value.message;
			if (value !== null && typeof value === "object") {
				const message = value.message;
				if (typeof message === "string") return message;
			}
			return "";
		}
		/** message 兜底正则：锚定上游「composed picker serves "browse"」模板的两处片段；上游文案非契约。 */
		const BROWSE_MESSAGE_PATTERNS = [/\bserves\s+["']?browse["']?/i, /["']capability["']\s*:\s*["']browse["']/i];
		//#endregion
		//#region ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/core.js
		var _a$1;
		function $constructor(name, initializer, params) {
			function init(inst, def) {
				if (!inst._zod) Object.defineProperty(inst, "_zod", {
					value: {
						def,
						constr: _,
						traits: /* @__PURE__ */ new Set()
					},
					enumerable: false
				});
				if (inst._zod.traits.has(name)) return;
				inst._zod.traits.add(name);
				initializer(inst, def);
				const proto = _.prototype;
				const keys = Object.keys(proto);
				for (let i = 0; i < keys.length; i++) {
					const k = keys[i];
					if (!(k in inst)) inst[k] = proto[k].bind(inst);
				}
			}
			const Parent = params?.Parent ?? Object;
			class Definition extends Parent {}
			Object.defineProperty(Definition, "name", { value: name });
			function _(def) {
				var _a;
				const inst = params?.Parent ? new Definition() : this;
				init(inst, def);
				(_a = inst._zod).deferred ?? (_a.deferred = []);
				for (const fn of inst._zod.deferred) fn();
				return inst;
			}
			Object.defineProperty(_, "init", { value: init });
			Object.defineProperty(_, Symbol.hasInstance, { value: (inst) => {
				if (params?.Parent && inst instanceof params.Parent) return true;
				return inst?._zod?.traits?.has(name);
			} });
			Object.defineProperty(_, "name", { value: name });
			return _;
		}
		var $ZodAsyncError = class extends Error {
			constructor() {
				super(`Encountered Promise during synchronous parse. Use .parseAsync() instead.`);
			}
		};
		var $ZodEncodeError = class extends Error {
			constructor(name) {
				super(`Encountered unidirectional transform during encode: ${name}`);
				this.name = "ZodEncodeError";
			}
		};
		(_a$1 = globalThis).__zod_globalConfig ?? (_a$1.__zod_globalConfig = {});
		const globalConfig = globalThis.__zod_globalConfig;
		function config(newConfig) {
			if (newConfig) Object.assign(globalConfig, newConfig);
			return globalConfig;
		}
		//#endregion
		//#region ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/util.js
		function getEnumValues(entries) {
			const numericValues = Object.values(entries).filter((v) => typeof v === "number");
			return Object.entries(entries).filter(([k, _]) => numericValues.indexOf(+k) === -1).map(([_, v]) => v);
		}
		function jsonStringifyReplacer(_, value) {
			if (typeof value === "bigint") return value.toString();
			return value;
		}
		function cached(getter) {
			return { get value() {
				{
					const value = getter();
					Object.defineProperty(this, "value", { value });
					return value;
				}
			} };
		}
		function nullish(input) {
			return input === null || input === void 0;
		}
		function cleanRegex(source) {
			const start = source.startsWith("^") ? 1 : 0;
			const end = source.endsWith("$") ? source.length - 1 : source.length;
			return source.slice(start, end);
		}
		function floatSafeRemainder(val, step) {
			const ratio = val / step;
			const roundedRatio = Math.round(ratio);
			const tolerance = Number.EPSILON * Math.max(Math.abs(ratio), 1);
			if (Math.abs(ratio - roundedRatio) < tolerance) return 0;
			return ratio - roundedRatio;
		}
		const EVALUATING = /* @__PURE__*/ Symbol("evaluating");
		function defineLazy(object, key, getter) {
			let value = void 0;
			Object.defineProperty(object, key, {
				get() {
					if (value === EVALUATING) return;
					if (value === void 0) {
						value = EVALUATING;
						value = getter();
					}
					return value;
				},
				set(v) {
					Object.defineProperty(object, key, { value: v });
				},
				configurable: true
			});
		}
		function assignProp(target, prop, value) {
			Object.defineProperty(target, prop, {
				value,
				writable: true,
				enumerable: true,
				configurable: true
			});
		}
		function mergeDefs(...defs) {
			const mergedDescriptors = {};
			for (const def of defs) {
				const descriptors = Object.getOwnPropertyDescriptors(def);
				Object.assign(mergedDescriptors, descriptors);
			}
			return Object.defineProperties({}, mergedDescriptors);
		}
		function esc(str) {
			return JSON.stringify(str);
		}
		function slugify(input) {
			return input.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
		}
		const captureStackTrace = "captureStackTrace" in Error ? Error.captureStackTrace : (..._args) => {};
		function isObject(data) {
			return typeof data === "object" && data !== null && !Array.isArray(data);
		}
		const allowsEval = /* @__PURE__*/ cached(() => {
			if (globalConfig.jitless) return false;
			if (typeof navigator !== "undefined" && navigator?.userAgent?.includes("Cloudflare")) return false;
			try {
				new Function("");
				return true;
			} catch (_) {
				return false;
			}
		});
		function isPlainObject(o) {
			if (isObject(o) === false) return false;
			const ctor = o.constructor;
			if (ctor === void 0) return true;
			if (typeof ctor !== "function") return true;
			const prot = ctor.prototype;
			if (isObject(prot) === false) return false;
			if (Object.prototype.hasOwnProperty.call(prot, "isPrototypeOf") === false) return false;
			return true;
		}
		function shallowClone(o) {
			if (isPlainObject(o)) return { ...o };
			if (Array.isArray(o)) return [...o];
			if (o instanceof Map) return new Map(o);
			if (o instanceof Set) return new Set(o);
			return o;
		}
		const propertyKeyTypes = /* @__PURE__*/ new Set([
			"string",
			"number",
			"symbol"
		]);
		function escapeRegex(str) {
			return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		}
		function clone(inst, def, params) {
			const cl = new inst._zod.constr(def ?? inst._zod.def);
			if (!def || params?.parent) cl._zod.parent = inst;
			return cl;
		}
		function normalizeParams(_params) {
			const params = _params;
			if (!params) return {};
			if (typeof params === "string") return { error: () => params };
			if (params?.message !== void 0) {
				if (params?.error !== void 0) throw new Error("Cannot specify both `message` and `error` params");
				params.error = params.message;
			}
			delete params.message;
			if (typeof params.error === "string") return {
				...params,
				error: () => params.error
			};
			return params;
		}
		function optionalKeys(shape) {
			return Object.keys(shape).filter((k) => {
				return shape[k]._zod.optin === "optional" && shape[k]._zod.optout === "optional";
			});
		}
		const NUMBER_FORMAT_RANGES = {
			safeint: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
			int32: [-2147483648, 2147483647],
			uint32: [0, 4294967295],
			float32: [-34028234663852886e22, 34028234663852886e22],
			float64: [-Number.MAX_VALUE, Number.MAX_VALUE]
		};
		function pick(schema, mask) {
			const currDef = schema._zod.def;
			const checks = currDef.checks;
			if (checks && checks.length > 0) throw new Error(".pick() cannot be used on object schemas containing refinements");
			return clone(schema, mergeDefs(schema._zod.def, {
				get shape() {
					const newShape = {};
					for (const key in mask) {
						if (!(key in currDef.shape)) throw new Error(`Unrecognized key: "${key}"`);
						if (!mask[key]) continue;
						newShape[key] = currDef.shape[key];
					}
					assignProp(this, "shape", newShape);
					return newShape;
				},
				checks: []
			}));
		}
		function omit(schema, mask) {
			const currDef = schema._zod.def;
			const checks = currDef.checks;
			if (checks && checks.length > 0) throw new Error(".omit() cannot be used on object schemas containing refinements");
			return clone(schema, mergeDefs(schema._zod.def, {
				get shape() {
					const newShape = { ...schema._zod.def.shape };
					for (const key in mask) {
						if (!(key in currDef.shape)) throw new Error(`Unrecognized key: "${key}"`);
						if (!mask[key]) continue;
						delete newShape[key];
					}
					assignProp(this, "shape", newShape);
					return newShape;
				},
				checks: []
			}));
		}
		function extend(schema, shape) {
			if (!isPlainObject(shape)) throw new Error("Invalid input to extend: expected a plain object");
			const checks = schema._zod.def.checks;
			if (checks && checks.length > 0) {
				const existingShape = schema._zod.def.shape;
				for (const key in shape) if (Object.getOwnPropertyDescriptor(existingShape, key) !== void 0) throw new Error("Cannot overwrite keys on object schemas containing refinements. Use `.safeExtend()` instead.");
			}
			return clone(schema, mergeDefs(schema._zod.def, { get shape() {
				const _shape = {
					...schema._zod.def.shape,
					...shape
				};
				assignProp(this, "shape", _shape);
				return _shape;
			} }));
		}
		function safeExtend(schema, shape) {
			if (!isPlainObject(shape)) throw new Error("Invalid input to safeExtend: expected a plain object");
			return clone(schema, mergeDefs(schema._zod.def, { get shape() {
				const _shape = {
					...schema._zod.def.shape,
					...shape
				};
				assignProp(this, "shape", _shape);
				return _shape;
			} }));
		}
		function merge(a, b) {
			if (a._zod.def.checks?.length) throw new Error(".merge() cannot be used on object schemas containing refinements. Use .safeExtend() instead.");
			return clone(a, mergeDefs(a._zod.def, {
				get shape() {
					const _shape = {
						...a._zod.def.shape,
						...b._zod.def.shape
					};
					assignProp(this, "shape", _shape);
					return _shape;
				},
				get catchall() {
					return b._zod.def.catchall;
				},
				checks: b._zod.def.checks ?? []
			}));
		}
		function partial(Class, schema, mask) {
			const checks = schema._zod.def.checks;
			if (checks && checks.length > 0) throw new Error(".partial() cannot be used on object schemas containing refinements");
			return clone(schema, mergeDefs(schema._zod.def, {
				get shape() {
					const oldShape = schema._zod.def.shape;
					const shape = { ...oldShape };
					if (mask) for (const key in mask) {
						if (!(key in oldShape)) throw new Error(`Unrecognized key: "${key}"`);
						if (!mask[key]) continue;
						shape[key] = Class ? new Class({
							type: "optional",
							innerType: oldShape[key]
						}) : oldShape[key];
					}
					else for (const key in oldShape) shape[key] = Class ? new Class({
						type: "optional",
						innerType: oldShape[key]
					}) : oldShape[key];
					assignProp(this, "shape", shape);
					return shape;
				},
				checks: []
			}));
		}
		function required(Class, schema, mask) {
			return clone(schema, mergeDefs(schema._zod.def, { get shape() {
				const oldShape = schema._zod.def.shape;
				const shape = { ...oldShape };
				if (mask) for (const key in mask) {
					if (!(key in shape)) throw new Error(`Unrecognized key: "${key}"`);
					if (!mask[key]) continue;
					shape[key] = new Class({
						type: "nonoptional",
						innerType: oldShape[key]
					});
				}
				else for (const key in oldShape) shape[key] = new Class({
					type: "nonoptional",
					innerType: oldShape[key]
				});
				assignProp(this, "shape", shape);
				return shape;
			} }));
		}
		function aborted(x, startIndex = 0) {
			if (x.aborted === true) return true;
			for (let i = startIndex; i < x.issues.length; i++) if (x.issues[i]?.continue !== true) return true;
			return false;
		}
		function explicitlyAborted(x, startIndex = 0) {
			if (x.aborted === true) return true;
			for (let i = startIndex; i < x.issues.length; i++) if (x.issues[i]?.continue === false) return true;
			return false;
		}
		function prefixIssues(path, issues) {
			return issues.map((iss) => {
				var _a;
				(_a = iss).path ?? (_a.path = []);
				iss.path.unshift(path);
				return iss;
			});
		}
		function unwrapMessage(message) {
			return typeof message === "string" ? message : message?.message;
		}
		function finalizeIssue(iss, ctx, config) {
			const message = iss.message ? iss.message : unwrapMessage(iss.inst?._zod.def?.error?.(iss)) ?? unwrapMessage(ctx?.error?.(iss)) ?? unwrapMessage(config.customError?.(iss)) ?? unwrapMessage(config.localeError?.(iss)) ?? "Invalid input";
			const { inst: _inst, continue: _continue, input: _input, ...rest } = iss;
			rest.path ?? (rest.path = []);
			rest.message = message;
			if (ctx?.reportInput) rest.input = _input;
			return rest;
		}
		function getLengthableOrigin(input) {
			if (Array.isArray(input)) return "array";
			if (typeof input === "string") return "string";
			return "unknown";
		}
		function issue(...args) {
			const [iss, input, inst] = args;
			if (typeof iss === "string") return {
				message: iss,
				code: "custom",
				input,
				inst
			};
			return { ...iss };
		}
		//#endregion
		//#region ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/errors.js
		const initializer$1 = (inst, def) => {
			inst.name = "$ZodError";
			Object.defineProperty(inst, "_zod", {
				value: inst._zod,
				enumerable: false
			});
			Object.defineProperty(inst, "issues", {
				value: def,
				enumerable: false
			});
			inst.message = JSON.stringify(def, jsonStringifyReplacer, 2);
			Object.defineProperty(inst, "toString", {
				value: () => inst.message,
				enumerable: false
			});
		};
		const $ZodError = $constructor("$ZodError", initializer$1);
		const $ZodRealError = $constructor("$ZodError", initializer$1, { Parent: Error });
		function flattenError(error, mapper = (issue) => issue.message) {
			const fieldErrors = {};
			const formErrors = [];
			for (const sub of error.issues) if (sub.path.length > 0) {
				fieldErrors[sub.path[0]] = fieldErrors[sub.path[0]] || [];
				fieldErrors[sub.path[0]].push(mapper(sub));
			} else formErrors.push(mapper(sub));
			return {
				formErrors,
				fieldErrors
			};
		}
		function formatError(error, mapper = (issue) => issue.message) {
			const fieldErrors = { _errors: [] };
			const processError = (error, path = []) => {
				for (const issue of error.issues) if (issue.code === "invalid_union" && issue.errors.length) issue.errors.map((issues) => processError({ issues }, [...path, ...issue.path]));
				else if (issue.code === "invalid_key") processError({ issues: issue.issues }, [...path, ...issue.path]);
				else if (issue.code === "invalid_element") processError({ issues: issue.issues }, [...path, ...issue.path]);
				else {
					const fullpath = [...path, ...issue.path];
					if (fullpath.length === 0) fieldErrors._errors.push(mapper(issue));
					else {
						let curr = fieldErrors;
						let i = 0;
						while (i < fullpath.length) {
							const el = fullpath[i];
							if (!(i === fullpath.length - 1)) curr[el] = curr[el] || { _errors: [] };
							else {
								curr[el] = curr[el] || { _errors: [] };
								curr[el]._errors.push(mapper(issue));
							}
							curr = curr[el];
							i++;
						}
					}
				}
			};
			processError(error);
			return fieldErrors;
		}
		//#endregion
		//#region ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/parse.js
		const _parse = (_Err) => (schema, value, _ctx, _params) => {
			const ctx = _ctx ? {
				..._ctx,
				async: false
			} : { async: false };
			const result = schema._zod.run({
				value,
				issues: []
			}, ctx);
			if (result instanceof Promise) throw new $ZodAsyncError();
			if (result.issues.length) {
				const e = new ((_params?.Err) ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
				captureStackTrace(e, _params?.callee);
				throw e;
			}
			return result.value;
		};
		const _parseAsync = (_Err) => async (schema, value, _ctx, params) => {
			const ctx = _ctx ? {
				..._ctx,
				async: true
			} : { async: true };
			let result = schema._zod.run({
				value,
				issues: []
			}, ctx);
			if (result instanceof Promise) result = await result;
			if (result.issues.length) {
				const e = new ((params?.Err) ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
				captureStackTrace(e, params?.callee);
				throw e;
			}
			return result.value;
		};
		const _safeParse = (_Err) => (schema, value, _ctx) => {
			const ctx = _ctx ? {
				..._ctx,
				async: false
			} : { async: false };
			const result = schema._zod.run({
				value,
				issues: []
			}, ctx);
			if (result instanceof Promise) throw new $ZodAsyncError();
			return result.issues.length ? {
				success: false,
				error: new (_Err ?? $ZodError)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
			} : {
				success: true,
				data: result.value
			};
		};
		const safeParse$1 = /* @__PURE__*/ _safeParse($ZodRealError);
		const _safeParseAsync = (_Err) => async (schema, value, _ctx) => {
			const ctx = _ctx ? {
				..._ctx,
				async: true
			} : { async: true };
			let result = schema._zod.run({
				value,
				issues: []
			}, ctx);
			if (result instanceof Promise) result = await result;
			return result.issues.length ? {
				success: false,
				error: new _Err(result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
			} : {
				success: true,
				data: result.value
			};
		};
		const safeParseAsync$1 = /* @__PURE__*/ _safeParseAsync($ZodRealError);
		const _encode = (_Err) => (schema, value, _ctx) => {
			const ctx = _ctx ? {
				..._ctx,
				direction: "backward"
			} : { direction: "backward" };
			return _parse(_Err)(schema, value, ctx);
		};
		const _decode = (_Err) => (schema, value, _ctx) => {
			return _parse(_Err)(schema, value, _ctx);
		};
		const _encodeAsync = (_Err) => async (schema, value, _ctx) => {
			const ctx = _ctx ? {
				..._ctx,
				direction: "backward"
			} : { direction: "backward" };
			return _parseAsync(_Err)(schema, value, ctx);
		};
		const _decodeAsync = (_Err) => async (schema, value, _ctx) => {
			return _parseAsync(_Err)(schema, value, _ctx);
		};
		const _safeEncode = (_Err) => (schema, value, _ctx) => {
			const ctx = _ctx ? {
				..._ctx,
				direction: "backward"
			} : { direction: "backward" };
			return _safeParse(_Err)(schema, value, ctx);
		};
		const _safeDecode = (_Err) => (schema, value, _ctx) => {
			return _safeParse(_Err)(schema, value, _ctx);
		};
		const _safeEncodeAsync = (_Err) => async (schema, value, _ctx) => {
			const ctx = _ctx ? {
				..._ctx,
				direction: "backward"
			} : { direction: "backward" };
			return _safeParseAsync(_Err)(schema, value, ctx);
		};
		const _safeDecodeAsync = (_Err) => async (schema, value, _ctx) => {
			return _safeParseAsync(_Err)(schema, value, _ctx);
		};
		//#endregion
		//#region ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/regexes.js
		/**
		* @deprecated CUID v1 is deprecated by its authors due to information leakage
		* (timestamps embedded in the id). Use {@link cuid2} instead.
		* See https://github.com/paralleldrive/cuid.
		*/
		const cuid = /^[cC][0-9a-z]{6,}$/;
		const cuid2 = /^[0-9a-z]+$/;
		const ulid = /^[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{26}$/;
		const xid = /^[0-9a-vA-V]{20}$/;
		const ksuid = /^[A-Za-z0-9]{27}$/;
		const nanoid = /^[a-zA-Z0-9_-]{21}$/;
		/** ISO 8601-1 duration regex. Does not support the 8601-2 extensions like negative durations or fractional/negative components. */
		const duration$1 = /^P(?:(\d+W)|(?!.*W)(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?)$/;
		/** A regex for any UUID-like identifier: 8-4-4-4-12 hex pattern */
		const guid = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;
		/** Returns a regex for validating an RFC 9562/4122 UUID.
		*
		* @param version Optionally specify a version 1-8. If no version is specified, all versions are supported. */
		const uuid = (version) => {
			if (!version) return /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;
			return new RegExp(`^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${version}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$`);
		};
		/** Practical email validation */
		const email = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;
		const _emoji$1 = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
		function emoji() {
			return new RegExp(_emoji$1, "u");
		}
		const ipv4 = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
		const ipv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/;
		const cidrv4 = /^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/([0-9]|[1-2][0-9]|3[0-2])$/;
		const cidrv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::|([0-9a-fA-F]{1,4})?::([0-9a-fA-F]{1,4}:?){0,6})\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
		const base64 = /^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$/;
		const base64url = /^[A-Za-z0-9_-]*$/;
		const httpProtocol = /^https?$/;
		const e164 = /^\+[1-9]\d{6,14}$/;
		const dateSource = `(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))`;
		const date$1 = /*@__PURE__*/ new RegExp(`^${dateSource}$`);
		function timeSource(args) {
			const hhmm = `(?:[01]\\d|2[0-3]):[0-5]\\d`;
			return typeof args.precision === "number" ? args.precision === -1 ? `${hhmm}` : args.precision === 0 ? `${hhmm}:[0-5]\\d` : `${hhmm}:[0-5]\\d\\.\\d{${args.precision}}` : `${hhmm}(?::[0-5]\\d(?:\\.\\d+)?)?`;
		}
		function time$1(args) {
			return new RegExp(`^${timeSource(args)}$`);
		}
		function datetime$1(args) {
			const time = timeSource({ precision: args.precision });
			const opts = ["Z"];
			if (args.local) opts.push("");
			if (args.offset) opts.push(`([+-](?:[01]\\d|2[0-3]):[0-5]\\d)`);
			const timeRegex = `${time}(?:${opts.join("|")})`;
			return new RegExp(`^${dateSource}T(?:${timeRegex})$`);
		}
		const string$1 = (params) => {
			const regex = params ? `[\\s\\S]{${params?.minimum ?? 0},${params?.maximum ?? ""}}` : `[\\s\\S]*`;
			return new RegExp(`^${regex}$`);
		};
		const integer = /^-?\d+$/;
		const number$1 = /^-?\d+(?:\.\d+)?$/;
		const boolean$1 = /^(?:true|false)$/i;
		const lowercase = /^[^A-Z]*$/;
		const uppercase = /^[^a-z]*$/;
		//#endregion
		//#region ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/checks.js
		const $ZodCheck = /*@__PURE__*/ $constructor("$ZodCheck", (inst, def) => {
			var _a;
			inst._zod ?? (inst._zod = {});
			inst._zod.def = def;
			(_a = inst._zod).onattach ?? (_a.onattach = []);
		});
		const numericOriginMap = {
			number: "number",
			bigint: "bigint",
			object: "date"
		};
		const $ZodCheckLessThan = /*@__PURE__*/ $constructor("$ZodCheckLessThan", (inst, def) => {
			$ZodCheck.init(inst, def);
			const origin = numericOriginMap[typeof def.value];
			inst._zod.onattach.push((inst) => {
				const bag = inst._zod.bag;
				const curr = (def.inclusive ? bag.maximum : bag.exclusiveMaximum) ?? Number.POSITIVE_INFINITY;
				if (def.value < curr) {
					if (def.inclusive) bag.maximum = def.value;
					else bag.exclusiveMaximum = def.value;
				}
			});
			inst._zod.check = (payload) => {
				if (def.inclusive ? payload.value <= def.value : payload.value < def.value) return;
				payload.issues.push({
					origin,
					code: "too_big",
					maximum: typeof def.value === "object" ? def.value.getTime() : def.value,
					input: payload.value,
					inclusive: def.inclusive,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckGreaterThan = /*@__PURE__*/ $constructor("$ZodCheckGreaterThan", (inst, def) => {
			$ZodCheck.init(inst, def);
			const origin = numericOriginMap[typeof def.value];
			inst._zod.onattach.push((inst) => {
				const bag = inst._zod.bag;
				const curr = (def.inclusive ? bag.minimum : bag.exclusiveMinimum) ?? Number.NEGATIVE_INFINITY;
				if (def.value > curr) {
					if (def.inclusive) bag.minimum = def.value;
					else bag.exclusiveMinimum = def.value;
				}
			});
			inst._zod.check = (payload) => {
				if (def.inclusive ? payload.value >= def.value : payload.value > def.value) return;
				payload.issues.push({
					origin,
					code: "too_small",
					minimum: typeof def.value === "object" ? def.value.getTime() : def.value,
					input: payload.value,
					inclusive: def.inclusive,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckMultipleOf = /*@__PURE__*/ $constructor("$ZodCheckMultipleOf", (inst, def) => {
			$ZodCheck.init(inst, def);
			inst._zod.onattach.push((inst) => {
				var _a;
				(_a = inst._zod.bag).multipleOf ?? (_a.multipleOf = def.value);
			});
			inst._zod.check = (payload) => {
				if (typeof payload.value !== typeof def.value) throw new Error("Cannot mix number and bigint in multiple_of check.");
				if (typeof payload.value === "bigint" ? payload.value % def.value === BigInt(0) : floatSafeRemainder(payload.value, def.value) === 0) return;
				payload.issues.push({
					origin: typeof payload.value,
					code: "not_multiple_of",
					divisor: def.value,
					input: payload.value,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckNumberFormat = /*@__PURE__*/ $constructor("$ZodCheckNumberFormat", (inst, def) => {
			$ZodCheck.init(inst, def);
			def.format = def.format || "float64";
			const isInt = def.format?.includes("int");
			const origin = isInt ? "int" : "number";
			const [minimum, maximum] = NUMBER_FORMAT_RANGES[def.format];
			inst._zod.onattach.push((inst) => {
				const bag = inst._zod.bag;
				bag.format = def.format;
				bag.minimum = minimum;
				bag.maximum = maximum;
				if (isInt) bag.pattern = integer;
			});
			inst._zod.check = (payload) => {
				const input = payload.value;
				if (isInt) {
					if (!Number.isInteger(input)) {
						payload.issues.push({
							expected: origin,
							format: def.format,
							code: "invalid_type",
							continue: false,
							input,
							inst
						});
						return;
					}
					if (!Number.isSafeInteger(input)) {
						if (input > 0) payload.issues.push({
							input,
							code: "too_big",
							maximum: Number.MAX_SAFE_INTEGER,
							note: "Integers must be within the safe integer range.",
							inst,
							origin,
							inclusive: true,
							continue: !def.abort
						});
						else payload.issues.push({
							input,
							code: "too_small",
							minimum: Number.MIN_SAFE_INTEGER,
							note: "Integers must be within the safe integer range.",
							inst,
							origin,
							inclusive: true,
							continue: !def.abort
						});
						return;
					}
				}
				if (input < minimum) payload.issues.push({
					origin: "number",
					input,
					code: "too_small",
					minimum,
					inclusive: true,
					inst,
					continue: !def.abort
				});
				if (input > maximum) payload.issues.push({
					origin: "number",
					input,
					code: "too_big",
					maximum,
					inclusive: true,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckMaxLength = /*@__PURE__*/ $constructor("$ZodCheckMaxLength", (inst, def) => {
			var _a;
			$ZodCheck.init(inst, def);
			(_a = inst._zod.def).when ?? (_a.when = (payload) => {
				const val = payload.value;
				return !nullish(val) && val.length !== void 0;
			});
			inst._zod.onattach.push((inst) => {
				const curr = inst._zod.bag.maximum ?? Number.POSITIVE_INFINITY;
				if (def.maximum < curr) inst._zod.bag.maximum = def.maximum;
			});
			inst._zod.check = (payload) => {
				const input = payload.value;
				if (input.length <= def.maximum) return;
				const origin = getLengthableOrigin(input);
				payload.issues.push({
					origin,
					code: "too_big",
					maximum: def.maximum,
					inclusive: true,
					input,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckMinLength = /*@__PURE__*/ $constructor("$ZodCheckMinLength", (inst, def) => {
			var _a;
			$ZodCheck.init(inst, def);
			(_a = inst._zod.def).when ?? (_a.when = (payload) => {
				const val = payload.value;
				return !nullish(val) && val.length !== void 0;
			});
			inst._zod.onattach.push((inst) => {
				const curr = inst._zod.bag.minimum ?? Number.NEGATIVE_INFINITY;
				if (def.minimum > curr) inst._zod.bag.minimum = def.minimum;
			});
			inst._zod.check = (payload) => {
				const input = payload.value;
				if (input.length >= def.minimum) return;
				const origin = getLengthableOrigin(input);
				payload.issues.push({
					origin,
					code: "too_small",
					minimum: def.minimum,
					inclusive: true,
					input,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckLengthEquals = /*@__PURE__*/ $constructor("$ZodCheckLengthEquals", (inst, def) => {
			var _a;
			$ZodCheck.init(inst, def);
			(_a = inst._zod.def).when ?? (_a.when = (payload) => {
				const val = payload.value;
				return !nullish(val) && val.length !== void 0;
			});
			inst._zod.onattach.push((inst) => {
				const bag = inst._zod.bag;
				bag.minimum = def.length;
				bag.maximum = def.length;
				bag.length = def.length;
			});
			inst._zod.check = (payload) => {
				const input = payload.value;
				const length = input.length;
				if (length === def.length) return;
				const origin = getLengthableOrigin(input);
				const tooBig = length > def.length;
				payload.issues.push({
					origin,
					...tooBig ? {
						code: "too_big",
						maximum: def.length
					} : {
						code: "too_small",
						minimum: def.length
					},
					inclusive: true,
					exact: true,
					input: payload.value,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckStringFormat = /*@__PURE__*/ $constructor("$ZodCheckStringFormat", (inst, def) => {
			var _a, _b;
			$ZodCheck.init(inst, def);
			inst._zod.onattach.push((inst) => {
				const bag = inst._zod.bag;
				bag.format = def.format;
				if (def.pattern) {
					bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
					bag.patterns.add(def.pattern);
				}
			});
			if (def.pattern) (_a = inst._zod).check ?? (_a.check = (payload) => {
				def.pattern.lastIndex = 0;
				if (def.pattern.test(payload.value)) return;
				payload.issues.push({
					origin: "string",
					code: "invalid_format",
					format: def.format,
					input: payload.value,
					...def.pattern ? { pattern: def.pattern.toString() } : {},
					inst,
					continue: !def.abort
				});
			});
			else (_b = inst._zod).check ?? (_b.check = () => {});
		});
		const $ZodCheckRegex = /*@__PURE__*/ $constructor("$ZodCheckRegex", (inst, def) => {
			$ZodCheckStringFormat.init(inst, def);
			inst._zod.check = (payload) => {
				def.pattern.lastIndex = 0;
				if (def.pattern.test(payload.value)) return;
				payload.issues.push({
					origin: "string",
					code: "invalid_format",
					format: "regex",
					input: payload.value,
					pattern: def.pattern.toString(),
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckLowerCase = /*@__PURE__*/ $constructor("$ZodCheckLowerCase", (inst, def) => {
			def.pattern ?? (def.pattern = lowercase);
			$ZodCheckStringFormat.init(inst, def);
		});
		const $ZodCheckUpperCase = /*@__PURE__*/ $constructor("$ZodCheckUpperCase", (inst, def) => {
			def.pattern ?? (def.pattern = uppercase);
			$ZodCheckStringFormat.init(inst, def);
		});
		const $ZodCheckIncludes = /*@__PURE__*/ $constructor("$ZodCheckIncludes", (inst, def) => {
			$ZodCheck.init(inst, def);
			const escapedRegex = escapeRegex(def.includes);
			const pattern = new RegExp(typeof def.position === "number" ? `^.{${def.position}}${escapedRegex}` : escapedRegex);
			def.pattern = pattern;
			inst._zod.onattach.push((inst) => {
				const bag = inst._zod.bag;
				bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
				bag.patterns.add(pattern);
			});
			inst._zod.check = (payload) => {
				if (payload.value.includes(def.includes, def.position)) return;
				payload.issues.push({
					origin: "string",
					code: "invalid_format",
					format: "includes",
					includes: def.includes,
					input: payload.value,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckStartsWith = /*@__PURE__*/ $constructor("$ZodCheckStartsWith", (inst, def) => {
			$ZodCheck.init(inst, def);
			const pattern = new RegExp(`^${escapeRegex(def.prefix)}.*`);
			def.pattern ?? (def.pattern = pattern);
			inst._zod.onattach.push((inst) => {
				const bag = inst._zod.bag;
				bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
				bag.patterns.add(pattern);
			});
			inst._zod.check = (payload) => {
				if (payload.value.startsWith(def.prefix)) return;
				payload.issues.push({
					origin: "string",
					code: "invalid_format",
					format: "starts_with",
					prefix: def.prefix,
					input: payload.value,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckEndsWith = /*@__PURE__*/ $constructor("$ZodCheckEndsWith", (inst, def) => {
			$ZodCheck.init(inst, def);
			const pattern = new RegExp(`.*${escapeRegex(def.suffix)}$`);
			def.pattern ?? (def.pattern = pattern);
			inst._zod.onattach.push((inst) => {
				const bag = inst._zod.bag;
				bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
				bag.patterns.add(pattern);
			});
			inst._zod.check = (payload) => {
				if (payload.value.endsWith(def.suffix)) return;
				payload.issues.push({
					origin: "string",
					code: "invalid_format",
					format: "ends_with",
					suffix: def.suffix,
					input: payload.value,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckOverwrite = /*@__PURE__*/ $constructor("$ZodCheckOverwrite", (inst, def) => {
			$ZodCheck.init(inst, def);
			inst._zod.check = (payload) => {
				payload.value = def.tx(payload.value);
			};
		});
		//#endregion
		//#region ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/doc.js
		var Doc = class {
			constructor(args = []) {
				this.content = [];
				this.indent = 0;
				if (this) this.args = args;
			}
			indented(fn) {
				this.indent += 1;
				fn(this);
				this.indent -= 1;
			}
			write(arg) {
				if (typeof arg === "function") {
					arg(this, { execution: "sync" });
					arg(this, { execution: "async" });
					return;
				}
				const lines = arg.split("\n").filter((x) => x);
				const minIndent = Math.min(...lines.map((x) => x.length - x.trimStart().length));
				const dedented = lines.map((x) => x.slice(minIndent)).map((x) => " ".repeat(this.indent * 2) + x);
				for (const line of dedented) this.content.push(line);
			}
			compile() {
				const F = Function;
				const args = this?.args;
				const lines = [...(this?.content ?? [``]).map((x) => `  ${x}`)];
				return new F(...args, lines.join("\n"));
			}
		};
		//#endregion
		//#region ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/versions.js
		const version = {
			major: 4,
			minor: 4,
			patch: 3
		};
		//#endregion
		//#region ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/schemas.js
		const $ZodType = /*@__PURE__*/ $constructor("$ZodType", (inst, def) => {
			var _a;
			inst ?? (inst = {});
			inst._zod.def = def;
			inst._zod.bag = inst._zod.bag || {};
			inst._zod.version = version;
			const checks = [...inst._zod.def.checks ?? []];
			if (inst._zod.traits.has("$ZodCheck")) checks.unshift(inst);
			for (const ch of checks) for (const fn of ch._zod.onattach) fn(inst);
			if (checks.length === 0) {
				(_a = inst._zod).deferred ?? (_a.deferred = []);
				inst._zod.deferred?.push(() => {
					inst._zod.run = inst._zod.parse;
				});
			} else {
				const runChecks = (payload, checks, ctx) => {
					let isAborted = aborted(payload);
					let asyncResult;
					for (const ch of checks) {
						if (ch._zod.def.when) {
							if (explicitlyAborted(payload)) continue;
							if (!ch._zod.def.when(payload)) continue;
						} else if (isAborted) continue;
						const currLen = payload.issues.length;
						const _ = ch._zod.check(payload);
						if (_ instanceof Promise && ctx?.async === false) throw new $ZodAsyncError();
						if (asyncResult || _ instanceof Promise) asyncResult = (asyncResult ?? Promise.resolve()).then(async () => {
							await _;
							if (payload.issues.length === currLen) return;
							if (!isAborted) isAborted = aborted(payload, currLen);
						});
						else {
							if (payload.issues.length === currLen) continue;
							if (!isAborted) isAborted = aborted(payload, currLen);
						}
					}
					if (asyncResult) return asyncResult.then(() => {
						return payload;
					});
					return payload;
				};
				const handleCanaryResult = (canary, payload, ctx) => {
					if (aborted(canary)) {
						canary.aborted = true;
						return canary;
					}
					const checkResult = runChecks(payload, checks, ctx);
					if (checkResult instanceof Promise) {
						if (ctx.async === false) throw new $ZodAsyncError();
						return checkResult.then((checkResult) => inst._zod.parse(checkResult, ctx));
					}
					return inst._zod.parse(checkResult, ctx);
				};
				inst._zod.run = (payload, ctx) => {
					if (ctx.skipChecks) return inst._zod.parse(payload, ctx);
					if (ctx.direction === "backward") {
						const canary = inst._zod.parse({
							value: payload.value,
							issues: []
						}, {
							...ctx,
							skipChecks: true
						});
						if (canary instanceof Promise) return canary.then((canary) => {
							return handleCanaryResult(canary, payload, ctx);
						});
						return handleCanaryResult(canary, payload, ctx);
					}
					const result = inst._zod.parse(payload, ctx);
					if (result instanceof Promise) {
						if (ctx.async === false) throw new $ZodAsyncError();
						return result.then((result) => runChecks(result, checks, ctx));
					}
					return runChecks(result, checks, ctx);
				};
			}
			defineLazy(inst, "~standard", () => ({
				validate: (value) => {
					try {
						const r = safeParse$1(inst, value);
						return r.success ? { value: r.data } : { issues: r.error?.issues };
					} catch (_) {
						return safeParseAsync$1(inst, value).then((r) => r.success ? { value: r.data } : { issues: r.error?.issues });
					}
				},
				vendor: "zod",
				version: 1
			}));
		});
		const $ZodString = /*@__PURE__*/ $constructor("$ZodString", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.pattern = [...inst?._zod.bag?.patterns ?? []].pop() ?? string$1(inst._zod.bag);
			inst._zod.parse = (payload, _) => {
				if (def.coerce) try {
					payload.value = String(payload.value);
				} catch (_) {}
				if (typeof payload.value === "string") return payload;
				payload.issues.push({
					expected: "string",
					code: "invalid_type",
					input: payload.value,
					inst
				});
				return payload;
			};
		});
		const $ZodStringFormat = /*@__PURE__*/ $constructor("$ZodStringFormat", (inst, def) => {
			$ZodCheckStringFormat.init(inst, def);
			$ZodString.init(inst, def);
		});
		const $ZodGUID = /*@__PURE__*/ $constructor("$ZodGUID", (inst, def) => {
			def.pattern ?? (def.pattern = guid);
			$ZodStringFormat.init(inst, def);
		});
		const $ZodUUID = /*@__PURE__*/ $constructor("$ZodUUID", (inst, def) => {
			if (def.version) {
				const v = {
					v1: 1,
					v2: 2,
					v3: 3,
					v4: 4,
					v5: 5,
					v6: 6,
					v7: 7,
					v8: 8
				}[def.version];
				if (v === void 0) throw new Error(`Invalid UUID version: "${def.version}"`);
				def.pattern ?? (def.pattern = uuid(v));
			} else def.pattern ?? (def.pattern = uuid());
			$ZodStringFormat.init(inst, def);
		});
		const $ZodEmail = /*@__PURE__*/ $constructor("$ZodEmail", (inst, def) => {
			def.pattern ?? (def.pattern = email);
			$ZodStringFormat.init(inst, def);
		});
		const $ZodURL = /*@__PURE__*/ $constructor("$ZodURL", (inst, def) => {
			$ZodStringFormat.init(inst, def);
			inst._zod.check = (payload) => {
				try {
					const trimmed = payload.value.trim();
					if (!def.normalize && def.protocol?.source === httpProtocol.source) {
						if (!/^https?:\/\//i.test(trimmed)) {
							payload.issues.push({
								code: "invalid_format",
								format: "url",
								note: "Invalid URL format",
								input: payload.value,
								inst,
								continue: !def.abort
							});
							return;
						}
					}
					const url = new URL(trimmed);
					if (def.hostname) {
						def.hostname.lastIndex = 0;
						if (!def.hostname.test(url.hostname)) payload.issues.push({
							code: "invalid_format",
							format: "url",
							note: "Invalid hostname",
							pattern: def.hostname.source,
							input: payload.value,
							inst,
							continue: !def.abort
						});
					}
					if (def.protocol) {
						def.protocol.lastIndex = 0;
						if (!def.protocol.test(url.protocol.endsWith(":") ? url.protocol.slice(0, -1) : url.protocol)) payload.issues.push({
							code: "invalid_format",
							format: "url",
							note: "Invalid protocol",
							pattern: def.protocol.source,
							input: payload.value,
							inst,
							continue: !def.abort
						});
					}
					if (def.normalize) payload.value = url.href;
					else payload.value = trimmed;
					return;
				} catch (_) {
					payload.issues.push({
						code: "invalid_format",
						format: "url",
						input: payload.value,
						inst,
						continue: !def.abort
					});
				}
			};
		});
		const $ZodEmoji = /*@__PURE__*/ $constructor("$ZodEmoji", (inst, def) => {
			def.pattern ?? (def.pattern = emoji());
			$ZodStringFormat.init(inst, def);
		});
		const $ZodNanoID = /*@__PURE__*/ $constructor("$ZodNanoID", (inst, def) => {
			def.pattern ?? (def.pattern = nanoid);
			$ZodStringFormat.init(inst, def);
		});
		/**
		* @deprecated CUID v1 is deprecated by its authors due to information leakage
		* (timestamps embedded in the id). Use {@link $ZodCUID2} instead.
		* See https://github.com/paralleldrive/cuid.
		*/
		const $ZodCUID = /*@__PURE__*/ $constructor("$ZodCUID", (inst, def) => {
			def.pattern ?? (def.pattern = cuid);
			$ZodStringFormat.init(inst, def);
		});
		const $ZodCUID2 = /*@__PURE__*/ $constructor("$ZodCUID2", (inst, def) => {
			def.pattern ?? (def.pattern = cuid2);
			$ZodStringFormat.init(inst, def);
		});
		const $ZodULID = /*@__PURE__*/ $constructor("$ZodULID", (inst, def) => {
			def.pattern ?? (def.pattern = ulid);
			$ZodStringFormat.init(inst, def);
		});
		const $ZodXID = /*@__PURE__*/ $constructor("$ZodXID", (inst, def) => {
			def.pattern ?? (def.pattern = xid);
			$ZodStringFormat.init(inst, def);
		});
		const $ZodKSUID = /*@__PURE__*/ $constructor("$ZodKSUID", (inst, def) => {
			def.pattern ?? (def.pattern = ksuid);
			$ZodStringFormat.init(inst, def);
		});
		const $ZodISODateTime = /*@__PURE__*/ $constructor("$ZodISODateTime", (inst, def) => {
			def.pattern ?? (def.pattern = datetime$1(def));
			$ZodStringFormat.init(inst, def);
		});
		const $ZodISODate = /*@__PURE__*/ $constructor("$ZodISODate", (inst, def) => {
			def.pattern ?? (def.pattern = date$1);
			$ZodStringFormat.init(inst, def);
		});
		const $ZodISOTime = /*@__PURE__*/ $constructor("$ZodISOTime", (inst, def) => {
			def.pattern ?? (def.pattern = time$1(def));
			$ZodStringFormat.init(inst, def);
		});
		const $ZodISODuration = /*@__PURE__*/ $constructor("$ZodISODuration", (inst, def) => {
			def.pattern ?? (def.pattern = duration$1);
			$ZodStringFormat.init(inst, def);
		});
		const $ZodIPv4 = /*@__PURE__*/ $constructor("$ZodIPv4", (inst, def) => {
			def.pattern ?? (def.pattern = ipv4);
			$ZodStringFormat.init(inst, def);
			inst._zod.bag.format = `ipv4`;
		});
		const $ZodIPv6 = /*@__PURE__*/ $constructor("$ZodIPv6", (inst, def) => {
			def.pattern ?? (def.pattern = ipv6);
			$ZodStringFormat.init(inst, def);
			inst._zod.bag.format = `ipv6`;
			inst._zod.check = (payload) => {
				try {
					new URL(`http://[${payload.value}]`);
				} catch {
					payload.issues.push({
						code: "invalid_format",
						format: "ipv6",
						input: payload.value,
						inst,
						continue: !def.abort
					});
				}
			};
		});
		const $ZodCIDRv4 = /*@__PURE__*/ $constructor("$ZodCIDRv4", (inst, def) => {
			def.pattern ?? (def.pattern = cidrv4);
			$ZodStringFormat.init(inst, def);
		});
		const $ZodCIDRv6 = /*@__PURE__*/ $constructor("$ZodCIDRv6", (inst, def) => {
			def.pattern ?? (def.pattern = cidrv6);
			$ZodStringFormat.init(inst, def);
			inst._zod.check = (payload) => {
				const parts = payload.value.split("/");
				try {
					if (parts.length !== 2) throw new Error();
					const [address, prefix] = parts;
					if (!prefix) throw new Error();
					const prefixNum = Number(prefix);
					if (`${prefixNum}` !== prefix) throw new Error();
					if (prefixNum < 0 || prefixNum > 128) throw new Error();
					new URL(`http://[${address}]`);
				} catch {
					payload.issues.push({
						code: "invalid_format",
						format: "cidrv6",
						input: payload.value,
						inst,
						continue: !def.abort
					});
				}
			};
		});
		function isValidBase64(data) {
			if (data === "") return true;
			if (/\s/.test(data)) return false;
			if (data.length % 4 !== 0) return false;
			try {
				atob(data);
				return true;
			} catch {
				return false;
			}
		}
		const $ZodBase64 = /*@__PURE__*/ $constructor("$ZodBase64", (inst, def) => {
			def.pattern ?? (def.pattern = base64);
			$ZodStringFormat.init(inst, def);
			inst._zod.bag.contentEncoding = "base64";
			inst._zod.check = (payload) => {
				if (isValidBase64(payload.value)) return;
				payload.issues.push({
					code: "invalid_format",
					format: "base64",
					input: payload.value,
					inst,
					continue: !def.abort
				});
			};
		});
		function isValidBase64URL(data) {
			if (!base64url.test(data)) return false;
			const base64 = data.replace(/[-_]/g, (c) => c === "-" ? "+" : "/");
			return isValidBase64(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
		}
		const $ZodBase64URL = /*@__PURE__*/ $constructor("$ZodBase64URL", (inst, def) => {
			def.pattern ?? (def.pattern = base64url);
			$ZodStringFormat.init(inst, def);
			inst._zod.bag.contentEncoding = "base64url";
			inst._zod.check = (payload) => {
				if (isValidBase64URL(payload.value)) return;
				payload.issues.push({
					code: "invalid_format",
					format: "base64url",
					input: payload.value,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodE164 = /*@__PURE__*/ $constructor("$ZodE164", (inst, def) => {
			def.pattern ?? (def.pattern = e164);
			$ZodStringFormat.init(inst, def);
		});
		function isValidJWT(token, algorithm = null) {
			try {
				const tokensParts = token.split(".");
				if (tokensParts.length !== 3) return false;
				const [header] = tokensParts;
				if (!header) return false;
				const parsedHeader = JSON.parse(atob(header));
				if ("typ" in parsedHeader && parsedHeader?.typ !== "JWT") return false;
				if (!parsedHeader.alg) return false;
				if (algorithm && (!("alg" in parsedHeader) || parsedHeader.alg !== algorithm)) return false;
				return true;
			} catch {
				return false;
			}
		}
		const $ZodJWT = /*@__PURE__*/ $constructor("$ZodJWT", (inst, def) => {
			$ZodStringFormat.init(inst, def);
			inst._zod.check = (payload) => {
				if (isValidJWT(payload.value, def.alg)) return;
				payload.issues.push({
					code: "invalid_format",
					format: "jwt",
					input: payload.value,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodNumber = /*@__PURE__*/ $constructor("$ZodNumber", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.pattern = inst._zod.bag.pattern ?? number$1;
			inst._zod.parse = (payload, _ctx) => {
				if (def.coerce) try {
					payload.value = Number(payload.value);
				} catch (_) {}
				const input = payload.value;
				if (typeof input === "number" && !Number.isNaN(input) && Number.isFinite(input)) return payload;
				const received = typeof input === "number" ? Number.isNaN(input) ? "NaN" : !Number.isFinite(input) ? "Infinity" : void 0 : void 0;
				payload.issues.push({
					expected: "number",
					code: "invalid_type",
					input,
					inst,
					...received ? { received } : {}
				});
				return payload;
			};
		});
		const $ZodNumberFormat = /*@__PURE__*/ $constructor("$ZodNumberFormat", (inst, def) => {
			$ZodCheckNumberFormat.init(inst, def);
			$ZodNumber.init(inst, def);
		});
		const $ZodBoolean = /*@__PURE__*/ $constructor("$ZodBoolean", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.pattern = boolean$1;
			inst._zod.parse = (payload, _ctx) => {
				if (def.coerce) try {
					payload.value = Boolean(payload.value);
				} catch (_) {}
				const input = payload.value;
				if (typeof input === "boolean") return payload;
				payload.issues.push({
					expected: "boolean",
					code: "invalid_type",
					input,
					inst
				});
				return payload;
			};
		});
		const $ZodUnknown = /*@__PURE__*/ $constructor("$ZodUnknown", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.parse = (payload) => payload;
		});
		const $ZodNever = /*@__PURE__*/ $constructor("$ZodNever", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.parse = (payload, _ctx) => {
				payload.issues.push({
					expected: "never",
					code: "invalid_type",
					input: payload.value,
					inst
				});
				return payload;
			};
		});
		function handleArrayResult(result, final, index) {
			if (result.issues.length) final.issues.push(...prefixIssues(index, result.issues));
			final.value[index] = result.value;
		}
		const $ZodArray = /*@__PURE__*/ $constructor("$ZodArray", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.parse = (payload, ctx) => {
				const input = payload.value;
				if (!Array.isArray(input)) {
					payload.issues.push({
						expected: "array",
						code: "invalid_type",
						input,
						inst
					});
					return payload;
				}
				payload.value = Array(input.length);
				const proms = [];
				for (let i = 0; i < input.length; i++) {
					const item = input[i];
					const result = def.element._zod.run({
						value: item,
						issues: []
					}, ctx);
					if (result instanceof Promise) proms.push(result.then((result) => handleArrayResult(result, payload, i)));
					else handleArrayResult(result, payload, i);
				}
				if (proms.length) return Promise.all(proms).then(() => payload);
				return payload;
			};
		});
		function handlePropertyResult(result, final, key, input, isOptionalIn, isOptionalOut) {
			const isPresent = key in input;
			if (result.issues.length) {
				if (isOptionalIn && isOptionalOut && !isPresent) return;
				final.issues.push(...prefixIssues(key, result.issues));
			}
			if (!isPresent && !isOptionalIn) {
				if (!result.issues.length) final.issues.push({
					code: "invalid_type",
					expected: "nonoptional",
					input: void 0,
					path: [key]
				});
				return;
			}
			if (result.value === void 0) {
				if (isPresent) final.value[key] = void 0;
			} else final.value[key] = result.value;
		}
		function normalizeDef(def) {
			const keys = Object.keys(def.shape);
			for (const k of keys) if (!def.shape?.[k]?._zod?.traits?.has("$ZodType")) throw new Error(`Invalid element at key "${k}": expected a Zod schema`);
			const okeys = optionalKeys(def.shape);
			return {
				...def,
				keys,
				keySet: new Set(keys),
				numKeys: keys.length,
				optionalKeys: new Set(okeys)
			};
		}
		function handleCatchall(proms, input, payload, ctx, def, inst) {
			const unrecognized = [];
			const keySet = def.keySet;
			const _catchall = def.catchall._zod;
			const t = _catchall.def.type;
			const isOptionalIn = _catchall.optin === "optional";
			const isOptionalOut = _catchall.optout === "optional";
			for (const key in input) {
				if (key === "__proto__") continue;
				if (keySet.has(key)) continue;
				if (t === "never") {
					unrecognized.push(key);
					continue;
				}
				const r = _catchall.run({
					value: input[key],
					issues: []
				}, ctx);
				if (r instanceof Promise) proms.push(r.then((r) => handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut)));
				else handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut);
			}
			if (unrecognized.length) payload.issues.push({
				code: "unrecognized_keys",
				keys: unrecognized,
				input,
				inst
			});
			if (!proms.length) return payload;
			return Promise.all(proms).then(() => {
				return payload;
			});
		}
		const $ZodObject = /*@__PURE__*/ $constructor("$ZodObject", (inst, def) => {
			$ZodType.init(inst, def);
			if (!Object.getOwnPropertyDescriptor(def, "shape")?.get) {
				const sh = def.shape;
				Object.defineProperty(def, "shape", { get: () => {
					const newSh = { ...sh };
					Object.defineProperty(def, "shape", { value: newSh });
					return newSh;
				} });
			}
			const _normalized = cached(() => normalizeDef(def));
			defineLazy(inst._zod, "propValues", () => {
				const shape = def.shape;
				const propValues = {};
				for (const key in shape) {
					const field = shape[key]._zod;
					if (field.values) {
						propValues[key] ?? (propValues[key] = /* @__PURE__ */ new Set());
						for (const v of field.values) propValues[key].add(v);
					}
				}
				return propValues;
			});
			const isObject$1 = isObject;
			const catchall = def.catchall;
			let value;
			inst._zod.parse = (payload, ctx) => {
				value ?? (value = _normalized.value);
				const input = payload.value;
				if (!isObject$1(input)) {
					payload.issues.push({
						expected: "object",
						code: "invalid_type",
						input,
						inst
					});
					return payload;
				}
				payload.value = {};
				const proms = [];
				const shape = value.shape;
				for (const key of value.keys) {
					const el = shape[key];
					const isOptionalIn = el._zod.optin === "optional";
					const isOptionalOut = el._zod.optout === "optional";
					const r = el._zod.run({
						value: input[key],
						issues: []
					}, ctx);
					if (r instanceof Promise) proms.push(r.then((r) => handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut)));
					else handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut);
				}
				if (!catchall) return proms.length ? Promise.all(proms).then(() => payload) : payload;
				return handleCatchall(proms, input, payload, ctx, _normalized.value, inst);
			};
		});
		const $ZodObjectJIT = /*@__PURE__*/ $constructor("$ZodObjectJIT", (inst, def) => {
			$ZodObject.init(inst, def);
			const superParse = inst._zod.parse;
			const _normalized = cached(() => normalizeDef(def));
			const generateFastpass = (shape) => {
				const doc = new Doc([
					"shape",
					"payload",
					"ctx"
				]);
				const normalized = _normalized.value;
				const parseStr = (key) => {
					const k = esc(key);
					return `shape[${k}]._zod.run({ value: input[${k}], issues: [] }, ctx)`;
				};
				doc.write(`const input = payload.value;`);
				const ids = Object.create(null);
				let counter = 0;
				for (const key of normalized.keys) ids[key] = `key_${counter++}`;
				doc.write(`const newResult = {};`);
				for (const key of normalized.keys) {
					const id = ids[key];
					const k = esc(key);
					const schema = shape[key];
					const isOptionalIn = schema?._zod?.optin === "optional";
					const isOptionalOut = schema?._zod?.optout === "optional";
					doc.write(`const ${id} = ${parseStr(key)};`);
					if (isOptionalIn && isOptionalOut) doc.write(`
        if (${id}.issues.length) {
          if (${k} in input) {
            payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
              ...iss,
              path: iss.path ? [${k}, ...iss.path] : [${k}]
            })));
          }
        }
        
        if (${id}.value === undefined) {
          if (${k} in input) {
            newResult[${k}] = undefined;
          }
        } else {
          newResult[${k}] = ${id}.value;
        }
        
      `);
					else if (!isOptionalIn) doc.write(`
        const ${id}_present = ${k} in input;
        if (${id}.issues.length) {
          payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${k}, ...iss.path] : [${k}]
          })));
        }
        if (!${id}_present && !${id}.issues.length) {
          payload.issues.push({
            code: "invalid_type",
            expected: "nonoptional",
            input: undefined,
            path: [${k}]
          });
        }

        if (${id}_present) {
          if (${id}.value === undefined) {
            newResult[${k}] = undefined;
          } else {
            newResult[${k}] = ${id}.value;
          }
        }

      `);
					else doc.write(`
        if (${id}.issues.length) {
          payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${k}, ...iss.path] : [${k}]
          })));
        }
        
        if (${id}.value === undefined) {
          if (${k} in input) {
            newResult[${k}] = undefined;
          }
        } else {
          newResult[${k}] = ${id}.value;
        }
        
      `);
				}
				doc.write(`payload.value = newResult;`);
				doc.write(`return payload;`);
				const fn = doc.compile();
				return (payload, ctx) => fn(shape, payload, ctx);
			};
			let fastpass;
			const isObject$2 = isObject;
			const jit = !globalConfig.jitless;
			const fastEnabled = jit && allowsEval.value;
			const catchall = def.catchall;
			let value;
			inst._zod.parse = (payload, ctx) => {
				value ?? (value = _normalized.value);
				const input = payload.value;
				if (!isObject$2(input)) {
					payload.issues.push({
						expected: "object",
						code: "invalid_type",
						input,
						inst
					});
					return payload;
				}
				if (jit && fastEnabled && ctx?.async === false && ctx.jitless !== true) {
					if (!fastpass) fastpass = generateFastpass(def.shape);
					payload = fastpass(payload, ctx);
					if (!catchall) return payload;
					return handleCatchall([], input, payload, ctx, value, inst);
				}
				return superParse(payload, ctx);
			};
		});
		function handleUnionResults(results, final, inst, ctx) {
			for (const result of results) if (result.issues.length === 0) {
				final.value = result.value;
				return final;
			}
			const nonaborted = results.filter((r) => !aborted(r));
			if (nonaborted.length === 1) {
				final.value = nonaborted[0].value;
				return nonaborted[0];
			}
			final.issues.push({
				code: "invalid_union",
				input: final.value,
				inst,
				errors: results.map((result) => result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
			});
			return final;
		}
		const $ZodUnion = /*@__PURE__*/ $constructor("$ZodUnion", (inst, def) => {
			$ZodType.init(inst, def);
			defineLazy(inst._zod, "optin", () => def.options.some((o) => o._zod.optin === "optional") ? "optional" : void 0);
			defineLazy(inst._zod, "optout", () => def.options.some((o) => o._zod.optout === "optional") ? "optional" : void 0);
			defineLazy(inst._zod, "values", () => {
				if (def.options.every((o) => o._zod.values)) return new Set(def.options.flatMap((option) => Array.from(option._zod.values)));
			});
			defineLazy(inst._zod, "pattern", () => {
				if (def.options.every((o) => o._zod.pattern)) {
					const patterns = def.options.map((o) => o._zod.pattern);
					return new RegExp(`^(${patterns.map((p) => cleanRegex(p.source)).join("|")})$`);
				}
			});
			const first = def.options.length === 1 ? def.options[0]._zod.run : null;
			inst._zod.parse = (payload, ctx) => {
				if (first) return first(payload, ctx);
				let async = false;
				const results = [];
				for (const option of def.options) {
					const result = option._zod.run({
						value: payload.value,
						issues: []
					}, ctx);
					if (result instanceof Promise) {
						results.push(result);
						async = true;
					} else {
						if (result.issues.length === 0) return result;
						results.push(result);
					}
				}
				if (!async) return handleUnionResults(results, payload, inst, ctx);
				return Promise.all(results).then((results) => {
					return handleUnionResults(results, payload, inst, ctx);
				});
			};
		});
		const $ZodIntersection = /*@__PURE__*/ $constructor("$ZodIntersection", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.parse = (payload, ctx) => {
				const input = payload.value;
				const left = def.left._zod.run({
					value: input,
					issues: []
				}, ctx);
				const right = def.right._zod.run({
					value: input,
					issues: []
				}, ctx);
				if (left instanceof Promise || right instanceof Promise) return Promise.all([left, right]).then(([left, right]) => {
					return handleIntersectionResults(payload, left, right);
				});
				return handleIntersectionResults(payload, left, right);
			};
		});
		function mergeValues(a, b) {
			if (a === b) return {
				valid: true,
				data: a
			};
			if (a instanceof Date && b instanceof Date && +a === +b) return {
				valid: true,
				data: a
			};
			if (isPlainObject(a) && isPlainObject(b)) {
				const bKeys = Object.keys(b);
				const sharedKeys = Object.keys(a).filter((key) => bKeys.indexOf(key) !== -1);
				const newObj = {
					...a,
					...b
				};
				for (const key of sharedKeys) {
					const sharedValue = mergeValues(a[key], b[key]);
					if (!sharedValue.valid) return {
						valid: false,
						mergeErrorPath: [key, ...sharedValue.mergeErrorPath]
					};
					newObj[key] = sharedValue.data;
				}
				return {
					valid: true,
					data: newObj
				};
			}
			if (Array.isArray(a) && Array.isArray(b)) {
				if (a.length !== b.length) return {
					valid: false,
					mergeErrorPath: []
				};
				const newArray = [];
				for (let index = 0; index < a.length; index++) {
					const itemA = a[index];
					const itemB = b[index];
					const sharedValue = mergeValues(itemA, itemB);
					if (!sharedValue.valid) return {
						valid: false,
						mergeErrorPath: [index, ...sharedValue.mergeErrorPath]
					};
					newArray.push(sharedValue.data);
				}
				return {
					valid: true,
					data: newArray
				};
			}
			return {
				valid: false,
				mergeErrorPath: []
			};
		}
		function handleIntersectionResults(result, left, right) {
			const unrecKeys = /* @__PURE__ */ new Map();
			let unrecIssue;
			for (const iss of left.issues) if (iss.code === "unrecognized_keys") {
				unrecIssue ?? (unrecIssue = iss);
				for (const k of iss.keys) {
					if (!unrecKeys.has(k)) unrecKeys.set(k, {});
					unrecKeys.get(k).l = true;
				}
			} else result.issues.push(iss);
			for (const iss of right.issues) if (iss.code === "unrecognized_keys") for (const k of iss.keys) {
				if (!unrecKeys.has(k)) unrecKeys.set(k, {});
				unrecKeys.get(k).r = true;
			}
			else result.issues.push(iss);
			const bothKeys = [...unrecKeys].filter(([, f]) => f.l && f.r).map(([k]) => k);
			if (bothKeys.length && unrecIssue) result.issues.push({
				...unrecIssue,
				keys: bothKeys
			});
			if (aborted(result)) return result;
			const merged = mergeValues(left.value, right.value);
			if (!merged.valid) throw new Error(`Unmergable intersection. Error path: ${JSON.stringify(merged.mergeErrorPath)}`);
			result.value = merged.data;
			return result;
		}
		const $ZodEnum = /*@__PURE__*/ $constructor("$ZodEnum", (inst, def) => {
			$ZodType.init(inst, def);
			const values = getEnumValues(def.entries);
			const valuesSet = new Set(values);
			inst._zod.values = valuesSet;
			inst._zod.pattern = new RegExp(`^(${values.filter((k) => propertyKeyTypes.has(typeof k)).map((o) => typeof o === "string" ? escapeRegex(o) : o.toString()).join("|")})$`);
			inst._zod.parse = (payload, _ctx) => {
				const input = payload.value;
				if (valuesSet.has(input)) return payload;
				payload.issues.push({
					code: "invalid_value",
					values,
					input,
					inst
				});
				return payload;
			};
		});
		const $ZodLiteral = /*@__PURE__*/ $constructor("$ZodLiteral", (inst, def) => {
			$ZodType.init(inst, def);
			if (def.values.length === 0) throw new Error("Cannot create literal schema with no valid values");
			const values = new Set(def.values);
			inst._zod.values = values;
			inst._zod.pattern = new RegExp(`^(${def.values.map((o) => typeof o === "string" ? escapeRegex(o) : o ? escapeRegex(o.toString()) : String(o)).join("|")})$`);
			inst._zod.parse = (payload, _ctx) => {
				const input = payload.value;
				if (values.has(input)) return payload;
				payload.issues.push({
					code: "invalid_value",
					values: def.values,
					input,
					inst
				});
				return payload;
			};
		});
		const $ZodTransform = /*@__PURE__*/ $constructor("$ZodTransform", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.optin = "optional";
			inst._zod.parse = (payload, ctx) => {
				if (ctx.direction === "backward") throw new $ZodEncodeError(inst.constructor.name);
				const _out = def.transform(payload.value, payload);
				if (ctx.async) return (_out instanceof Promise ? _out : Promise.resolve(_out)).then((output) => {
					payload.value = output;
					payload.fallback = true;
					return payload;
				});
				if (_out instanceof Promise) throw new $ZodAsyncError();
				payload.value = _out;
				payload.fallback = true;
				return payload;
			};
		});
		function handleOptionalResult(result, input) {
			if (input === void 0 && (result.issues.length || result.fallback)) return {
				issues: [],
				value: void 0
			};
			return result;
		}
		const $ZodOptional = /*@__PURE__*/ $constructor("$ZodOptional", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.optin = "optional";
			inst._zod.optout = "optional";
			defineLazy(inst._zod, "values", () => {
				return def.innerType._zod.values ? /* @__PURE__ */ new Set([...def.innerType._zod.values, void 0]) : void 0;
			});
			defineLazy(inst._zod, "pattern", () => {
				const pattern = def.innerType._zod.pattern;
				return pattern ? new RegExp(`^(${cleanRegex(pattern.source)})?$`) : void 0;
			});
			inst._zod.parse = (payload, ctx) => {
				if (def.innerType._zod.optin === "optional") {
					const input = payload.value;
					const result = def.innerType._zod.run(payload, ctx);
					if (result instanceof Promise) return result.then((r) => handleOptionalResult(r, input));
					return handleOptionalResult(result, input);
				}
				if (payload.value === void 0) return payload;
				return def.innerType._zod.run(payload, ctx);
			};
		});
		const $ZodExactOptional = /*@__PURE__*/ $constructor("$ZodExactOptional", (inst, def) => {
			$ZodOptional.init(inst, def);
			defineLazy(inst._zod, "values", () => def.innerType._zod.values);
			defineLazy(inst._zod, "pattern", () => def.innerType._zod.pattern);
			inst._zod.parse = (payload, ctx) => {
				return def.innerType._zod.run(payload, ctx);
			};
		});
		const $ZodNullable = /*@__PURE__*/ $constructor("$ZodNullable", (inst, def) => {
			$ZodType.init(inst, def);
			defineLazy(inst._zod, "optin", () => def.innerType._zod.optin);
			defineLazy(inst._zod, "optout", () => def.innerType._zod.optout);
			defineLazy(inst._zod, "pattern", () => {
				const pattern = def.innerType._zod.pattern;
				return pattern ? new RegExp(`^(${cleanRegex(pattern.source)}|null)$`) : void 0;
			});
			defineLazy(inst._zod, "values", () => {
				return def.innerType._zod.values ? /* @__PURE__ */ new Set([...def.innerType._zod.values, null]) : void 0;
			});
			inst._zod.parse = (payload, ctx) => {
				if (payload.value === null) return payload;
				return def.innerType._zod.run(payload, ctx);
			};
		});
		const $ZodDefault = /*@__PURE__*/ $constructor("$ZodDefault", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.optin = "optional";
			defineLazy(inst._zod, "values", () => def.innerType._zod.values);
			inst._zod.parse = (payload, ctx) => {
				if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
				if (payload.value === void 0) {
					payload.value = def.defaultValue;
					/**
					* $ZodDefault returns the default value immediately in forward direction.
					* It doesn't pass the default value into the validator ("prefault"). There's no reason to pass the default value through validation. The validity of the default is enforced by TypeScript statically. Otherwise, it's the responsibility of the user to ensure the default is valid. In the case of pipes with divergent in/out types, you can specify the default on the `in` schema of your ZodPipe to set a "prefault" for the pipe.   */
					return payload;
				}
				const result = def.innerType._zod.run(payload, ctx);
				if (result instanceof Promise) return result.then((result) => handleDefaultResult(result, def));
				return handleDefaultResult(result, def);
			};
		});
		function handleDefaultResult(payload, def) {
			if (payload.value === void 0) payload.value = def.defaultValue;
			return payload;
		}
		const $ZodPrefault = /*@__PURE__*/ $constructor("$ZodPrefault", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.optin = "optional";
			defineLazy(inst._zod, "values", () => def.innerType._zod.values);
			inst._zod.parse = (payload, ctx) => {
				if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
				if (payload.value === void 0) payload.value = def.defaultValue;
				return def.innerType._zod.run(payload, ctx);
			};
		});
		const $ZodNonOptional = /*@__PURE__*/ $constructor("$ZodNonOptional", (inst, def) => {
			$ZodType.init(inst, def);
			defineLazy(inst._zod, "values", () => {
				const v = def.innerType._zod.values;
				return v ? new Set([...v].filter((x) => x !== void 0)) : void 0;
			});
			inst._zod.parse = (payload, ctx) => {
				const result = def.innerType._zod.run(payload, ctx);
				if (result instanceof Promise) return result.then((result) => handleNonOptionalResult(result, inst));
				return handleNonOptionalResult(result, inst);
			};
		});
		function handleNonOptionalResult(payload, inst) {
			if (!payload.issues.length && payload.value === void 0) payload.issues.push({
				code: "invalid_type",
				expected: "nonoptional",
				input: payload.value,
				inst
			});
			return payload;
		}
		const $ZodCatch = /*@__PURE__*/ $constructor("$ZodCatch", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.optin = "optional";
			defineLazy(inst._zod, "optout", () => def.innerType._zod.optout);
			defineLazy(inst._zod, "values", () => def.innerType._zod.values);
			inst._zod.parse = (payload, ctx) => {
				if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
				const result = def.innerType._zod.run(payload, ctx);
				if (result instanceof Promise) return result.then((result) => {
					payload.value = result.value;
					if (result.issues.length) {
						payload.value = def.catchValue({
							...payload,
							error: { issues: result.issues.map((iss) => finalizeIssue(iss, ctx, config())) },
							input: payload.value
						});
						payload.issues = [];
						payload.fallback = true;
					}
					return payload;
				});
				payload.value = result.value;
				if (result.issues.length) {
					payload.value = def.catchValue({
						...payload,
						error: { issues: result.issues.map((iss) => finalizeIssue(iss, ctx, config())) },
						input: payload.value
					});
					payload.issues = [];
					payload.fallback = true;
				}
				return payload;
			};
		});
		const $ZodPipe = /*@__PURE__*/ $constructor("$ZodPipe", (inst, def) => {
			$ZodType.init(inst, def);
			defineLazy(inst._zod, "values", () => def.in._zod.values);
			defineLazy(inst._zod, "optin", () => def.in._zod.optin);
			defineLazy(inst._zod, "optout", () => def.out._zod.optout);
			defineLazy(inst._zod, "propValues", () => def.in._zod.propValues);
			inst._zod.parse = (payload, ctx) => {
				if (ctx.direction === "backward") {
					const right = def.out._zod.run(payload, ctx);
					if (right instanceof Promise) return right.then((right) => handlePipeResult(right, def.in, ctx));
					return handlePipeResult(right, def.in, ctx);
				}
				const left = def.in._zod.run(payload, ctx);
				if (left instanceof Promise) return left.then((left) => handlePipeResult(left, def.out, ctx));
				return handlePipeResult(left, def.out, ctx);
			};
		});
		function handlePipeResult(left, next, ctx) {
			if (left.issues.length) {
				left.aborted = true;
				return left;
			}
			return next._zod.run({
				value: left.value,
				issues: left.issues,
				fallback: left.fallback
			}, ctx);
		}
		const $ZodReadonly = /*@__PURE__*/ $constructor("$ZodReadonly", (inst, def) => {
			$ZodType.init(inst, def);
			defineLazy(inst._zod, "propValues", () => def.innerType._zod.propValues);
			defineLazy(inst._zod, "values", () => def.innerType._zod.values);
			defineLazy(inst._zod, "optin", () => def.innerType?._zod?.optin);
			defineLazy(inst._zod, "optout", () => def.innerType?._zod?.optout);
			inst._zod.parse = (payload, ctx) => {
				if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
				const result = def.innerType._zod.run(payload, ctx);
				if (result instanceof Promise) return result.then(handleReadonlyResult);
				return handleReadonlyResult(result);
			};
		});
		function handleReadonlyResult(payload) {
			payload.value = Object.freeze(payload.value);
			return payload;
		}
		const $ZodCustom = /*@__PURE__*/ $constructor("$ZodCustom", (inst, def) => {
			$ZodCheck.init(inst, def);
			$ZodType.init(inst, def);
			inst._zod.parse = (payload, _) => {
				return payload;
			};
			inst._zod.check = (payload) => {
				const input = payload.value;
				const r = def.fn(input);
				if (r instanceof Promise) return r.then((r) => handleRefineResult(r, payload, input, inst));
				handleRefineResult(r, payload, input, inst);
			};
		});
		function handleRefineResult(result, payload, input, inst) {
			if (!result) {
				const _iss = {
					code: "custom",
					input,
					inst,
					path: [...inst._zod.def.path ?? []],
					continue: !inst._zod.def.abort
				};
				if (inst._zod.def.params) _iss.params = inst._zod.def.params;
				payload.issues.push(issue(_iss));
			}
		}
		//#endregion
		//#region ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/registries.js
		var _a;
		var $ZodRegistry = class {
			constructor() {
				this._map = /* @__PURE__ */ new WeakMap();
				this._idmap = /* @__PURE__ */ new Map();
			}
			add(schema, ..._meta) {
				const meta = _meta[0];
				this._map.set(schema, meta);
				if (meta && typeof meta === "object" && "id" in meta) this._idmap.set(meta.id, schema);
				return this;
			}
			clear() {
				this._map = /* @__PURE__ */ new WeakMap();
				this._idmap = /* @__PURE__ */ new Map();
				return this;
			}
			remove(schema) {
				const meta = this._map.get(schema);
				if (meta && typeof meta === "object" && "id" in meta) this._idmap.delete(meta.id);
				this._map.delete(schema);
				return this;
			}
			get(schema) {
				const p = schema._zod.parent;
				if (p) {
					const pm = { ...this.get(p) ?? {} };
					delete pm.id;
					const f = {
						...pm,
						...this._map.get(schema)
					};
					return Object.keys(f).length ? f : void 0;
				}
				return this._map.get(schema);
			}
			has(schema) {
				return this._map.has(schema);
			}
		};
		function registry() {
			return new $ZodRegistry();
		}
		(_a = globalThis).__zod_globalRegistry ?? (_a.__zod_globalRegistry = registry());
		const globalRegistry = globalThis.__zod_globalRegistry;
		//#endregion
		//#region ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/api.js
		// @__NO_SIDE_EFFECTS__
		function _string(Class, params) {
			return new Class({
				type: "string",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _email(Class, params) {
			return new Class({
				type: "string",
				format: "email",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _guid(Class, params) {
			return new Class({
				type: "string",
				format: "guid",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _uuid(Class, params) {
			return new Class({
				type: "string",
				format: "uuid",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _uuidv4(Class, params) {
			return new Class({
				type: "string",
				format: "uuid",
				check: "string_format",
				abort: false,
				version: "v4",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _uuidv6(Class, params) {
			return new Class({
				type: "string",
				format: "uuid",
				check: "string_format",
				abort: false,
				version: "v6",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _uuidv7(Class, params) {
			return new Class({
				type: "string",
				format: "uuid",
				check: "string_format",
				abort: false,
				version: "v7",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _url(Class, params) {
			return new Class({
				type: "string",
				format: "url",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _emoji(Class, params) {
			return new Class({
				type: "string",
				format: "emoji",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _nanoid(Class, params) {
			return new Class({
				type: "string",
				format: "nanoid",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		/**
		* @deprecated CUID v1 is deprecated by its authors due to information leakage
		* (timestamps embedded in the id). Use {@link _cuid2} instead.
		* See https://github.com/paralleldrive/cuid.
		*/
		// @__NO_SIDE_EFFECTS__
		function _cuid(Class, params) {
			return new Class({
				type: "string",
				format: "cuid",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _cuid2(Class, params) {
			return new Class({
				type: "string",
				format: "cuid2",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _ulid(Class, params) {
			return new Class({
				type: "string",
				format: "ulid",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _xid(Class, params) {
			return new Class({
				type: "string",
				format: "xid",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _ksuid(Class, params) {
			return new Class({
				type: "string",
				format: "ksuid",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _ipv4(Class, params) {
			return new Class({
				type: "string",
				format: "ipv4",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _ipv6(Class, params) {
			return new Class({
				type: "string",
				format: "ipv6",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _cidrv4(Class, params) {
			return new Class({
				type: "string",
				format: "cidrv4",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _cidrv6(Class, params) {
			return new Class({
				type: "string",
				format: "cidrv6",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _base64(Class, params) {
			return new Class({
				type: "string",
				format: "base64",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _base64url(Class, params) {
			return new Class({
				type: "string",
				format: "base64url",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _e164(Class, params) {
			return new Class({
				type: "string",
				format: "e164",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _jwt(Class, params) {
			return new Class({
				type: "string",
				format: "jwt",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _isoDateTime(Class, params) {
			return new Class({
				type: "string",
				format: "datetime",
				check: "string_format",
				offset: false,
				local: false,
				precision: null,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _isoDate(Class, params) {
			return new Class({
				type: "string",
				format: "date",
				check: "string_format",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _isoTime(Class, params) {
			return new Class({
				type: "string",
				format: "time",
				check: "string_format",
				precision: null,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _isoDuration(Class, params) {
			return new Class({
				type: "string",
				format: "duration",
				check: "string_format",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _number(Class, params) {
			return new Class({
				type: "number",
				checks: [],
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _int(Class, params) {
			return new Class({
				type: "number",
				check: "number_format",
				abort: false,
				format: "safeint",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _boolean(Class, params) {
			return new Class({
				type: "boolean",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _unknown(Class) {
			return new Class({ type: "unknown" });
		}
		// @__NO_SIDE_EFFECTS__
		function _never(Class, params) {
			return new Class({
				type: "never",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _lt(value, params) {
			return new $ZodCheckLessThan({
				check: "less_than",
				...normalizeParams(params),
				value,
				inclusive: false
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _lte(value, params) {
			return new $ZodCheckLessThan({
				check: "less_than",
				...normalizeParams(params),
				value,
				inclusive: true
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _gt(value, params) {
			return new $ZodCheckGreaterThan({
				check: "greater_than",
				...normalizeParams(params),
				value,
				inclusive: false
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _gte(value, params) {
			return new $ZodCheckGreaterThan({
				check: "greater_than",
				...normalizeParams(params),
				value,
				inclusive: true
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _multipleOf(value, params) {
			return new $ZodCheckMultipleOf({
				check: "multiple_of",
				...normalizeParams(params),
				value
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _maxLength(maximum, params) {
			return new $ZodCheckMaxLength({
				check: "max_length",
				...normalizeParams(params),
				maximum
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _minLength(minimum, params) {
			return new $ZodCheckMinLength({
				check: "min_length",
				...normalizeParams(params),
				minimum
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _length(length, params) {
			return new $ZodCheckLengthEquals({
				check: "length_equals",
				...normalizeParams(params),
				length
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _regex(pattern, params) {
			return new $ZodCheckRegex({
				check: "string_format",
				format: "regex",
				...normalizeParams(params),
				pattern
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _lowercase(params) {
			return new $ZodCheckLowerCase({
				check: "string_format",
				format: "lowercase",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _uppercase(params) {
			return new $ZodCheckUpperCase({
				check: "string_format",
				format: "uppercase",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _includes(includes, params) {
			return new $ZodCheckIncludes({
				check: "string_format",
				format: "includes",
				...normalizeParams(params),
				includes
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _startsWith(prefix, params) {
			return new $ZodCheckStartsWith({
				check: "string_format",
				format: "starts_with",
				...normalizeParams(params),
				prefix
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _endsWith(suffix, params) {
			return new $ZodCheckEndsWith({
				check: "string_format",
				format: "ends_with",
				...normalizeParams(params),
				suffix
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _overwrite(tx) {
			return new $ZodCheckOverwrite({
				check: "overwrite",
				tx
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _normalize(form) {
			return /* @__PURE__ */ _overwrite((input) => input.normalize(form));
		}
		// @__NO_SIDE_EFFECTS__
		function _trim() {
			return /* @__PURE__ */ _overwrite((input) => input.trim());
		}
		// @__NO_SIDE_EFFECTS__
		function _toLowerCase() {
			return /* @__PURE__ */ _overwrite((input) => input.toLowerCase());
		}
		// @__NO_SIDE_EFFECTS__
		function _toUpperCase() {
			return /* @__PURE__ */ _overwrite((input) => input.toUpperCase());
		}
		// @__NO_SIDE_EFFECTS__
		function _slugify() {
			return /* @__PURE__ */ _overwrite((input) => slugify(input));
		}
		// @__NO_SIDE_EFFECTS__
		function _array(Class, element, params) {
			return new Class({
				type: "array",
				element,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _refine(Class, fn, _params) {
			return new Class({
				type: "custom",
				check: "custom",
				fn,
				...normalizeParams(_params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _superRefine(fn, params) {
			const ch = /* @__PURE__ */ _check((payload) => {
				payload.addIssue = (issue$2) => {
					if (typeof issue$2 === "string") payload.issues.push(issue(issue$2, payload.value, ch._zod.def));
					else {
						const _issue = issue$2;
						if (_issue.fatal) _issue.continue = false;
						_issue.code ?? (_issue.code = "custom");
						_issue.input ?? (_issue.input = payload.value);
						_issue.inst ?? (_issue.inst = ch);
						_issue.continue ?? (_issue.continue = !ch._zod.def.abort);
						payload.issues.push(issue(_issue));
					}
				};
				return fn(payload.value, payload);
			}, params);
			return ch;
		}
		// @__NO_SIDE_EFFECTS__
		function _check(fn, params) {
			const ch = new $ZodCheck({
				check: "custom",
				...normalizeParams(params)
			});
			ch._zod.check = fn;
			return ch;
		}
		//#endregion
		//#region ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/to-json-schema.js
		function initializeContext(params) {
			let target = params?.target ?? "draft-2020-12";
			if (target === "draft-4") target = "draft-04";
			if (target === "draft-7") target = "draft-07";
			return {
				processors: params.processors ?? {},
				metadataRegistry: params?.metadata ?? globalRegistry,
				target,
				unrepresentable: params?.unrepresentable ?? "throw",
				override: params?.override ?? (() => {}),
				io: params?.io ?? "output",
				counter: 0,
				seen: /* @__PURE__ */ new Map(),
				cycles: params?.cycles ?? "ref",
				reused: params?.reused ?? "inline",
				external: params?.external ?? void 0
			};
		}
		function process(schema, ctx, _params = {
			path: [],
			schemaPath: []
		}) {
			var _a;
			const def = schema._zod.def;
			const seen = ctx.seen.get(schema);
			if (seen) {
				seen.count++;
				if (_params.schemaPath.includes(schema)) seen.cycle = _params.path;
				return seen.schema;
			}
			const result = {
				schema: {},
				count: 1,
				cycle: void 0,
				path: _params.path
			};
			ctx.seen.set(schema, result);
			const overrideSchema = schema._zod.toJSONSchema?.();
			if (overrideSchema) result.schema = overrideSchema;
			else {
				const params = {
					..._params,
					schemaPath: [..._params.schemaPath, schema],
					path: _params.path
				};
				if (schema._zod.processJSONSchema) schema._zod.processJSONSchema(ctx, result.schema, params);
				else {
					const _json = result.schema;
					const processor = ctx.processors[def.type];
					if (!processor) throw new Error(`[toJSONSchema]: Non-representable type encountered: ${def.type}`);
					processor(schema, ctx, _json, params);
				}
				const parent = schema._zod.parent;
				if (parent) {
					if (!result.ref) result.ref = parent;
					process(parent, ctx, params);
					ctx.seen.get(parent).isParent = true;
				}
			}
			const meta = ctx.metadataRegistry.get(schema);
			if (meta) Object.assign(result.schema, meta);
			if (ctx.io === "input" && isTransforming(schema)) {
				delete result.schema.examples;
				delete result.schema.default;
			}
			if (ctx.io === "input" && "_prefault" in result.schema) (_a = result.schema).default ?? (_a.default = result.schema._prefault);
			delete result.schema._prefault;
			return ctx.seen.get(schema).schema;
		}
		function extractDefs(ctx, schema) {
			const root = ctx.seen.get(schema);
			if (!root) throw new Error("Unprocessed schema. This is a bug in Zod.");
			const idToSchema = /* @__PURE__ */ new Map();
			for (const entry of ctx.seen.entries()) {
				const id = ctx.metadataRegistry.get(entry[0])?.id;
				if (id) {
					const existing = idToSchema.get(id);
					if (existing && existing !== entry[0]) throw new Error(`Duplicate schema id "${id}" detected during JSON Schema conversion. Two different schemas cannot share the same id when converted together.`);
					idToSchema.set(id, entry[0]);
				}
			}
			const makeURI = (entry) => {
				const defsSegment = ctx.target === "draft-2020-12" ? "$defs" : "definitions";
				if (ctx.external) {
					const externalId = ctx.external.registry.get(entry[0])?.id;
					const uriGenerator = ctx.external.uri ?? ((id) => id);
					if (externalId) return { ref: uriGenerator(externalId) };
					const id = entry[1].defId ?? entry[1].schema.id ?? `schema${ctx.counter++}`;
					entry[1].defId = id;
					return {
						defId: id,
						ref: `${uriGenerator("__shared")}#/${defsSegment}/${id}`
					};
				}
				if (entry[1] === root) return { ref: "#" };
				const defUriPrefix = `#/${defsSegment}/`;
				const defId = entry[1].schema.id ?? `__schema${ctx.counter++}`;
				return {
					defId,
					ref: defUriPrefix + defId
				};
			};
			const extractToDef = (entry) => {
				if (entry[1].schema.$ref) return;
				const seen = entry[1];
				const { ref, defId } = makeURI(entry);
				seen.def = { ...seen.schema };
				if (defId) seen.defId = defId;
				const schema = seen.schema;
				for (const key in schema) delete schema[key];
				schema.$ref = ref;
			};
			if (ctx.cycles === "throw") for (const entry of ctx.seen.entries()) {
				const seen = entry[1];
				if (seen.cycle) throw new Error(`Cycle detected: #/${seen.cycle?.join("/")}/<root>

Set the \`cycles\` parameter to \`"ref"\` to resolve cyclical schemas with defs.`);
			}
			for (const entry of ctx.seen.entries()) {
				const seen = entry[1];
				if (schema === entry[0]) {
					extractToDef(entry);
					continue;
				}
				if (ctx.external) {
					const ext = ctx.external.registry.get(entry[0])?.id;
					if (schema !== entry[0] && ext) {
						extractToDef(entry);
						continue;
					}
				}
				if (ctx.metadataRegistry.get(entry[0])?.id) {
					extractToDef(entry);
					continue;
				}
				if (seen.cycle) {
					extractToDef(entry);
					continue;
				}
				if (seen.count > 1) {
					if (ctx.reused === "ref") {
						extractToDef(entry);
						continue;
					}
				}
			}
		}
		function finalize(ctx, schema) {
			const root = ctx.seen.get(schema);
			if (!root) throw new Error("Unprocessed schema. This is a bug in Zod.");
			const flattenRef = (zodSchema) => {
				const seen = ctx.seen.get(zodSchema);
				if (seen.ref === null) return;
				const schema = seen.def ?? seen.schema;
				const _cached = { ...schema };
				const ref = seen.ref;
				seen.ref = null;
				if (ref) {
					flattenRef(ref);
					const refSeen = ctx.seen.get(ref);
					const refSchema = refSeen.schema;
					if (refSchema.$ref && (ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0")) {
						schema.allOf = schema.allOf ?? [];
						schema.allOf.push(refSchema);
					} else Object.assign(schema, refSchema);
					Object.assign(schema, _cached);
					if (zodSchema._zod.parent === ref) for (const key in schema) {
						if (key === "$ref" || key === "allOf") continue;
						if (!(key in _cached)) delete schema[key];
					}
					if (refSchema.$ref && refSeen.def) for (const key in schema) {
						if (key === "$ref" || key === "allOf") continue;
						if (key in refSeen.def && JSON.stringify(schema[key]) === JSON.stringify(refSeen.def[key])) delete schema[key];
					}
				}
				const parent = zodSchema._zod.parent;
				if (parent && parent !== ref) {
					flattenRef(parent);
					const parentSeen = ctx.seen.get(parent);
					if (parentSeen?.schema.$ref) {
						schema.$ref = parentSeen.schema.$ref;
						if (parentSeen.def) for (const key in schema) {
							if (key === "$ref" || key === "allOf") continue;
							if (key in parentSeen.def && JSON.stringify(schema[key]) === JSON.stringify(parentSeen.def[key])) delete schema[key];
						}
					}
				}
				ctx.override({
					zodSchema,
					jsonSchema: schema,
					path: seen.path ?? []
				});
			};
			for (const entry of [...ctx.seen.entries()].reverse()) flattenRef(entry[0]);
			const result = {};
			if (ctx.target === "draft-2020-12") result.$schema = "https://json-schema.org/draft/2020-12/schema";
			else if (ctx.target === "draft-07") result.$schema = "http://json-schema.org/draft-07/schema#";
			else if (ctx.target === "draft-04") result.$schema = "http://json-schema.org/draft-04/schema#";
			else if (ctx.target === "openapi-3.0") {}
			if (ctx.external?.uri) {
				const id = ctx.external.registry.get(schema)?.id;
				if (!id) throw new Error("Schema is missing an `id` property");
				result.$id = ctx.external.uri(id);
			}
			Object.assign(result, root.def ?? root.schema);
			const rootMetaId = ctx.metadataRegistry.get(schema)?.id;
			if (rootMetaId !== void 0 && result.id === rootMetaId) delete result.id;
			const defs = ctx.external?.defs ?? {};
			for (const entry of ctx.seen.entries()) {
				const seen = entry[1];
				if (seen.def && seen.defId) {
					if (seen.def.id === seen.defId) delete seen.def.id;
					defs[seen.defId] = seen.def;
				}
			}
			if (ctx.external) {} else if (Object.keys(defs).length > 0) {
				if (ctx.target === "draft-2020-12") result.$defs = defs;
				else result.definitions = defs;
			}
			try {
				const finalized = JSON.parse(JSON.stringify(result));
				Object.defineProperty(finalized, "~standard", {
					value: {
						...schema["~standard"],
						jsonSchema: {
							input: createStandardJSONSchemaMethod(schema, "input", ctx.processors),
							output: createStandardJSONSchemaMethod(schema, "output", ctx.processors)
						}
					},
					enumerable: false,
					writable: false
				});
				return finalized;
			} catch (_err) {
				throw new Error("Error converting schema to JSON.");
			}
		}
		function isTransforming(_schema, _ctx) {
			const ctx = _ctx ?? { seen: /* @__PURE__ */ new Set() };
			if (ctx.seen.has(_schema)) return false;
			ctx.seen.add(_schema);
			const def = _schema._zod.def;
			if (def.type === "transform") return true;
			if (def.type === "array") return isTransforming(def.element, ctx);
			if (def.type === "set") return isTransforming(def.valueType, ctx);
			if (def.type === "lazy") return isTransforming(def.getter(), ctx);
			if (def.type === "promise" || def.type === "optional" || def.type === "nonoptional" || def.type === "nullable" || def.type === "readonly" || def.type === "default" || def.type === "prefault") return isTransforming(def.innerType, ctx);
			if (def.type === "intersection") return isTransforming(def.left, ctx) || isTransforming(def.right, ctx);
			if (def.type === "record" || def.type === "map") return isTransforming(def.keyType, ctx) || isTransforming(def.valueType, ctx);
			if (def.type === "pipe") {
				if (_schema._zod.traits.has("$ZodCodec")) return true;
				return isTransforming(def.in, ctx) || isTransforming(def.out, ctx);
			}
			if (def.type === "object") {
				for (const key in def.shape) if (isTransforming(def.shape[key], ctx)) return true;
				return false;
			}
			if (def.type === "union") {
				for (const option of def.options) if (isTransforming(option, ctx)) return true;
				return false;
			}
			if (def.type === "tuple") {
				for (const item of def.items) if (isTransforming(item, ctx)) return true;
				if (def.rest && isTransforming(def.rest, ctx)) return true;
				return false;
			}
			return false;
		}
		/**
		* Creates a toJSONSchema method for a schema instance.
		* This encapsulates the logic of initializing context, processing, extracting defs, and finalizing.
		*/
		const createToJSONSchemaMethod = (schema, processors = {}) => (params) => {
			const ctx = initializeContext({
				...params,
				processors
			});
			process(schema, ctx);
			extractDefs(ctx, schema);
			return finalize(ctx, schema);
		};
		const createStandardJSONSchemaMethod = (schema, io, processors = {}) => (params) => {
			const { libraryOptions, target } = params ?? {};
			const ctx = initializeContext({
				...libraryOptions ?? {},
				target,
				io,
				processors
			});
			process(schema, ctx);
			extractDefs(ctx, schema);
			return finalize(ctx, schema);
		};
		//#endregion
		//#region ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/json-schema-processors.js
		const formatMap = {
			guid: "uuid",
			url: "uri",
			datetime: "date-time",
			json_string: "json-string",
			regex: ""
		};
		const stringProcessor = (schema, ctx, _json, _params) => {
			const json = _json;
			json.type = "string";
			const { minimum, maximum, format, patterns, contentEncoding } = schema._zod.bag;
			if (typeof minimum === "number") json.minLength = minimum;
			if (typeof maximum === "number") json.maxLength = maximum;
			if (format) {
				json.format = formatMap[format] ?? format;
				if (json.format === "") delete json.format;
				if (format === "time") delete json.format;
			}
			if (contentEncoding) json.contentEncoding = contentEncoding;
			if (patterns && patterns.size > 0) {
				const regexes = [...patterns];
				if (regexes.length === 1) json.pattern = regexes[0].source;
				else if (regexes.length > 1) json.allOf = [...regexes.map((regex) => ({
					...ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0" ? { type: "string" } : {},
					pattern: regex.source
				}))];
			}
		};
		const numberProcessor = (schema, ctx, _json, _params) => {
			const json = _json;
			const { minimum, maximum, format, multipleOf, exclusiveMaximum, exclusiveMinimum } = schema._zod.bag;
			if (typeof format === "string" && format.includes("int")) json.type = "integer";
			else json.type = "number";
			const exMin = typeof exclusiveMinimum === "number" && exclusiveMinimum >= (minimum ?? Number.NEGATIVE_INFINITY);
			const exMax = typeof exclusiveMaximum === "number" && exclusiveMaximum <= (maximum ?? Number.POSITIVE_INFINITY);
			const legacy = ctx.target === "draft-04" || ctx.target === "openapi-3.0";
			if (exMin) {
				if (legacy) {
					json.minimum = exclusiveMinimum;
					json.exclusiveMinimum = true;
				} else json.exclusiveMinimum = exclusiveMinimum;
			} else if (typeof minimum === "number") json.minimum = minimum;
			if (exMax) {
				if (legacy) {
					json.maximum = exclusiveMaximum;
					json.exclusiveMaximum = true;
				} else json.exclusiveMaximum = exclusiveMaximum;
			} else if (typeof maximum === "number") json.maximum = maximum;
			if (typeof multipleOf === "number") json.multipleOf = multipleOf;
		};
		const booleanProcessor = (_schema, _ctx, json, _params) => {
			json.type = "boolean";
		};
		const neverProcessor = (_schema, _ctx, json, _params) => {
			json.not = {};
		};
		const enumProcessor = (schema, _ctx, json, _params) => {
			const def = schema._zod.def;
			const values = getEnumValues(def.entries);
			if (values.every((v) => typeof v === "number")) json.type = "number";
			if (values.every((v) => typeof v === "string")) json.type = "string";
			json.enum = values;
		};
		const literalProcessor = (schema, ctx, json, _params) => {
			const def = schema._zod.def;
			const vals = [];
			for (const val of def.values) if (val === void 0) {
				if (ctx.unrepresentable === "throw") throw new Error("Literal `undefined` cannot be represented in JSON Schema");
			} else if (typeof val === "bigint") {
				if (ctx.unrepresentable === "throw") throw new Error("BigInt literals cannot be represented in JSON Schema");
				else vals.push(Number(val));
			} else vals.push(val);
			if (vals.length === 0) {} else if (vals.length === 1) {
				const val = vals[0];
				json.type = val === null ? "null" : typeof val;
				if (ctx.target === "draft-04" || ctx.target === "openapi-3.0") json.enum = [val];
				else json.const = val;
			} else {
				if (vals.every((v) => typeof v === "number")) json.type = "number";
				if (vals.every((v) => typeof v === "string")) json.type = "string";
				if (vals.every((v) => typeof v === "boolean")) json.type = "boolean";
				if (vals.every((v) => v === null)) json.type = "null";
				json.enum = vals;
			}
		};
		const customProcessor = (_schema, ctx, _json, _params) => {
			if (ctx.unrepresentable === "throw") throw new Error("Custom types cannot be represented in JSON Schema");
		};
		const transformProcessor = (_schema, ctx, _json, _params) => {
			if (ctx.unrepresentable === "throw") throw new Error("Transforms cannot be represented in JSON Schema");
		};
		const arrayProcessor = (schema, ctx, _json, params) => {
			const json = _json;
			const def = schema._zod.def;
			const { minimum, maximum } = schema._zod.bag;
			if (typeof minimum === "number") json.minItems = minimum;
			if (typeof maximum === "number") json.maxItems = maximum;
			json.type = "array";
			json.items = process(def.element, ctx, {
				...params,
				path: [...params.path, "items"]
			});
		};
		const objectProcessor = (schema, ctx, _json, params) => {
			const json = _json;
			const def = schema._zod.def;
			json.type = "object";
			json.properties = {};
			const shape = def.shape;
			for (const key in shape) json.properties[key] = process(shape[key], ctx, {
				...params,
				path: [
					...params.path,
					"properties",
					key
				]
			});
			const allKeys = new Set(Object.keys(shape));
			const requiredKeys = new Set([...allKeys].filter((key) => {
				const v = def.shape[key]._zod;
				if (ctx.io === "input") return v.optin === void 0;
				else return v.optout === void 0;
			}));
			if (requiredKeys.size > 0) json.required = Array.from(requiredKeys);
			if (def.catchall?._zod.def.type === "never") json.additionalProperties = false;
			else if (!def.catchall) {
				if (ctx.io === "output") json.additionalProperties = false;
			} else if (def.catchall) json.additionalProperties = process(def.catchall, ctx, {
				...params,
				path: [...params.path, "additionalProperties"]
			});
		};
		const unionProcessor = (schema, ctx, json, params) => {
			const def = schema._zod.def;
			const isExclusive = def.inclusive === false;
			const options = def.options.map((x, i) => process(x, ctx, {
				...params,
				path: [
					...params.path,
					isExclusive ? "oneOf" : "anyOf",
					i
				]
			}));
			if (isExclusive) json.oneOf = options;
			else json.anyOf = options;
		};
		const intersectionProcessor = (schema, ctx, json, params) => {
			const def = schema._zod.def;
			const a = process(def.left, ctx, {
				...params,
				path: [
					...params.path,
					"allOf",
					0
				]
			});
			const b = process(def.right, ctx, {
				...params,
				path: [
					...params.path,
					"allOf",
					1
				]
			});
			const isSimpleIntersection = (val) => "allOf" in val && Object.keys(val).length === 1;
			json.allOf = [...isSimpleIntersection(a) ? a.allOf : [a], ...isSimpleIntersection(b) ? b.allOf : [b]];
		};
		const nullableProcessor = (schema, ctx, json, params) => {
			const def = schema._zod.def;
			const inner = process(def.innerType, ctx, params);
			const seen = ctx.seen.get(schema);
			if (ctx.target === "openapi-3.0") {
				seen.ref = def.innerType;
				json.nullable = true;
			} else json.anyOf = [inner, { type: "null" }];
		};
		const nonoptionalProcessor = (schema, ctx, _json, params) => {
			const def = schema._zod.def;
			process(def.innerType, ctx, params);
			const seen = ctx.seen.get(schema);
			seen.ref = def.innerType;
		};
		const defaultProcessor = (schema, ctx, json, params) => {
			const def = schema._zod.def;
			process(def.innerType, ctx, params);
			const seen = ctx.seen.get(schema);
			seen.ref = def.innerType;
			json.default = JSON.parse(JSON.stringify(def.defaultValue));
		};
		const prefaultProcessor = (schema, ctx, json, params) => {
			const def = schema._zod.def;
			process(def.innerType, ctx, params);
			const seen = ctx.seen.get(schema);
			seen.ref = def.innerType;
			if (ctx.io === "input") json._prefault = JSON.parse(JSON.stringify(def.defaultValue));
		};
		const catchProcessor = (schema, ctx, json, params) => {
			const def = schema._zod.def;
			process(def.innerType, ctx, params);
			const seen = ctx.seen.get(schema);
			seen.ref = def.innerType;
			let catchValue;
			try {
				catchValue = def.catchValue(void 0);
			} catch {
				throw new Error("Dynamic catch values are not supported in JSON Schema");
			}
			json.default = catchValue;
		};
		const pipeProcessor = (schema, ctx, _json, params) => {
			const def = schema._zod.def;
			const inIsTransform = def.in._zod.traits.has("$ZodTransform");
			const innerType = ctx.io === "input" ? inIsTransform ? def.out : def.in : def.out;
			process(innerType, ctx, params);
			const seen = ctx.seen.get(schema);
			seen.ref = innerType;
		};
		const readonlyProcessor = (schema, ctx, json, params) => {
			const def = schema._zod.def;
			process(def.innerType, ctx, params);
			const seen = ctx.seen.get(schema);
			seen.ref = def.innerType;
			json.readOnly = true;
		};
		const optionalProcessor = (schema, ctx, _json, params) => {
			const def = schema._zod.def;
			process(def.innerType, ctx, params);
			const seen = ctx.seen.get(schema);
			seen.ref = def.innerType;
		};
		//#endregion
		//#region ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/classic/iso.js
		const ZodISODateTime = /*@__PURE__*/ $constructor("ZodISODateTime", (inst, def) => {
			$ZodISODateTime.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		function datetime(params) {
			return /* @__PURE__ */ _isoDateTime(ZodISODateTime, params);
		}
		const ZodISODate = /*@__PURE__*/ $constructor("ZodISODate", (inst, def) => {
			$ZodISODate.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		function date(params) {
			return /* @__PURE__ */ _isoDate(ZodISODate, params);
		}
		const ZodISOTime = /*@__PURE__*/ $constructor("ZodISOTime", (inst, def) => {
			$ZodISOTime.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		function time(params) {
			return /* @__PURE__ */ _isoTime(ZodISOTime, params);
		}
		const ZodISODuration = /*@__PURE__*/ $constructor("ZodISODuration", (inst, def) => {
			$ZodISODuration.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		function duration(params) {
			return /* @__PURE__ */ _isoDuration(ZodISODuration, params);
		}
		//#endregion
		//#region ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/classic/errors.js
		const initializer = (inst, issues) => {
			$ZodError.init(inst, issues);
			inst.name = "ZodError";
			Object.defineProperties(inst, {
				format: { value: (mapper) => formatError(inst, mapper) },
				flatten: { value: (mapper) => flattenError(inst, mapper) },
				addIssue: { value: (issue) => {
					inst.issues.push(issue);
					inst.message = JSON.stringify(inst.issues, jsonStringifyReplacer, 2);
				} },
				addIssues: { value: (issues) => {
					inst.issues.push(...issues);
					inst.message = JSON.stringify(inst.issues, jsonStringifyReplacer, 2);
				} },
				isEmpty: { get() {
					return inst.issues.length === 0;
				} }
			});
		};
		const ZodRealError = /*@__PURE__*/ $constructor("ZodError", initializer, { Parent: Error });
		//#endregion
		//#region ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/classic/parse.js
		const parse = /* @__PURE__ */ _parse(ZodRealError);
		const parseAsync = /* @__PURE__ */ _parseAsync(ZodRealError);
		const safeParse = /* @__PURE__ */ _safeParse(ZodRealError);
		const safeParseAsync = /* @__PURE__ */ _safeParseAsync(ZodRealError);
		const encode = /* @__PURE__ */ _encode(ZodRealError);
		const decode = /* @__PURE__ */ _decode(ZodRealError);
		const encodeAsync = /* @__PURE__ */ _encodeAsync(ZodRealError);
		const decodeAsync = /* @__PURE__ */ _decodeAsync(ZodRealError);
		const safeEncode = /* @__PURE__ */ _safeEncode(ZodRealError);
		const safeDecode = /* @__PURE__ */ _safeDecode(ZodRealError);
		const safeEncodeAsync = /* @__PURE__ */ _safeEncodeAsync(ZodRealError);
		const safeDecodeAsync = /* @__PURE__ */ _safeDecodeAsync(ZodRealError);
		//#endregion
		//#region ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/classic/schemas.js
		const _installedGroups = /* @__PURE__ */ new WeakMap();
		function _installLazyMethods(inst, group, methods) {
			const proto = Object.getPrototypeOf(inst);
			let installed = _installedGroups.get(proto);
			if (!installed) {
				installed = /* @__PURE__ */ new Set();
				_installedGroups.set(proto, installed);
			}
			if (installed.has(group)) return;
			installed.add(group);
			for (const key in methods) {
				const fn = methods[key];
				Object.defineProperty(proto, key, {
					configurable: true,
					enumerable: false,
					get() {
						const bound = fn.bind(this);
						Object.defineProperty(this, key, {
							configurable: true,
							writable: true,
							enumerable: true,
							value: bound
						});
						return bound;
					},
					set(v) {
						Object.defineProperty(this, key, {
							configurable: true,
							writable: true,
							enumerable: true,
							value: v
						});
					}
				});
			}
		}
		const ZodType = /*@__PURE__*/ $constructor("ZodType", (inst, def) => {
			$ZodType.init(inst, def);
			Object.assign(inst["~standard"], { jsonSchema: {
				input: createStandardJSONSchemaMethod(inst, "input"),
				output: createStandardJSONSchemaMethod(inst, "output")
			} });
			inst.toJSONSchema = createToJSONSchemaMethod(inst, {});
			inst.def = def;
			inst.type = def.type;
			Object.defineProperty(inst, "_def", { value: def });
			inst.parse = (data, params) => parse(inst, data, params, { callee: inst.parse });
			inst.safeParse = (data, params) => safeParse(inst, data, params);
			inst.parseAsync = async (data, params) => parseAsync(inst, data, params, { callee: inst.parseAsync });
			inst.safeParseAsync = async (data, params) => safeParseAsync(inst, data, params);
			inst.spa = inst.safeParseAsync;
			inst.encode = (data, params) => encode(inst, data, params);
			inst.decode = (data, params) => decode(inst, data, params);
			inst.encodeAsync = async (data, params) => encodeAsync(inst, data, params);
			inst.decodeAsync = async (data, params) => decodeAsync(inst, data, params);
			inst.safeEncode = (data, params) => safeEncode(inst, data, params);
			inst.safeDecode = (data, params) => safeDecode(inst, data, params);
			inst.safeEncodeAsync = async (data, params) => safeEncodeAsync(inst, data, params);
			inst.safeDecodeAsync = async (data, params) => safeDecodeAsync(inst, data, params);
			_installLazyMethods(inst, "ZodType", {
				check(...chks) {
					const def = this.def;
					return this.clone(mergeDefs(def, { checks: [...def.checks ?? [], ...chks.map((ch) => typeof ch === "function" ? { _zod: {
						check: ch,
						def: { check: "custom" },
						onattach: []
					} } : ch)] }), { parent: true });
				},
				with(...chks) {
					return this.check(...chks);
				},
				clone(def, params) {
					return clone(this, def, params);
				},
				brand() {
					return this;
				},
				register(reg, meta) {
					reg.add(this, meta);
					return this;
				},
				refine(check, params) {
					return this.check(refine(check, params));
				},
				superRefine(refinement, params) {
					return this.check(superRefine(refinement, params));
				},
				overwrite(fn) {
					return this.check(/* @__PURE__ */ _overwrite(fn));
				},
				optional() {
					return optional(this);
				},
				exactOptional() {
					return exactOptional(this);
				},
				nullable() {
					return nullable(this);
				},
				nullish() {
					return optional(nullable(this));
				},
				nonoptional(params) {
					return nonoptional(this, params);
				},
				array() {
					return array(this);
				},
				or(arg) {
					return union([this, arg]);
				},
				and(arg) {
					return intersection(this, arg);
				},
				transform(tx) {
					return pipe(this, transform(tx));
				},
				default(d) {
					return _default(this, d);
				},
				prefault(d) {
					return prefault(this, d);
				},
				catch(params) {
					return _catch(this, params);
				},
				pipe(target) {
					return pipe(this, target);
				},
				readonly() {
					return readonly(this);
				},
				describe(description) {
					const cl = this.clone();
					globalRegistry.add(cl, { description });
					return cl;
				},
				meta(...args) {
					if (args.length === 0) return globalRegistry.get(this);
					const cl = this.clone();
					globalRegistry.add(cl, args[0]);
					return cl;
				},
				isOptional() {
					return this.safeParse(void 0).success;
				},
				isNullable() {
					return this.safeParse(null).success;
				},
				apply(fn) {
					return fn(this);
				}
			});
			Object.defineProperty(inst, "description", {
				get() {
					return globalRegistry.get(inst)?.description;
				},
				configurable: true
			});
			return inst;
		});
		/** @internal */
		const _ZodString = /*@__PURE__*/ $constructor("_ZodString", (inst, def) => {
			$ZodString.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => stringProcessor(inst, ctx, json, params);
			const bag = inst._zod.bag;
			inst.format = bag.format ?? null;
			inst.minLength = bag.minimum ?? null;
			inst.maxLength = bag.maximum ?? null;
			_installLazyMethods(inst, "_ZodString", {
				regex(...args) {
					return this.check(/* @__PURE__ */ _regex(...args));
				},
				includes(...args) {
					return this.check(/* @__PURE__ */ _includes(...args));
				},
				startsWith(...args) {
					return this.check(/* @__PURE__ */ _startsWith(...args));
				},
				endsWith(...args) {
					return this.check(/* @__PURE__ */ _endsWith(...args));
				},
				min(...args) {
					return this.check(/* @__PURE__ */ _minLength(...args));
				},
				max(...args) {
					return this.check(/* @__PURE__ */ _maxLength(...args));
				},
				length(...args) {
					return this.check(/* @__PURE__ */ _length(...args));
				},
				nonempty(...args) {
					return this.check(/* @__PURE__ */ _minLength(1, ...args));
				},
				lowercase(params) {
					return this.check(/* @__PURE__ */ _lowercase(params));
				},
				uppercase(params) {
					return this.check(/* @__PURE__ */ _uppercase(params));
				},
				trim() {
					return this.check(/* @__PURE__ */ _trim());
				},
				normalize(...args) {
					return this.check(/* @__PURE__ */ _normalize(...args));
				},
				toLowerCase() {
					return this.check(/* @__PURE__ */ _toLowerCase());
				},
				toUpperCase() {
					return this.check(/* @__PURE__ */ _toUpperCase());
				},
				slugify() {
					return this.check(/* @__PURE__ */ _slugify());
				}
			});
		});
		const ZodString = /*@__PURE__*/ $constructor("ZodString", (inst, def) => {
			$ZodString.init(inst, def);
			_ZodString.init(inst, def);
			inst.email = (params) => inst.check(/* @__PURE__ */ _email(ZodEmail, params));
			inst.url = (params) => inst.check(/* @__PURE__ */ _url(ZodURL, params));
			inst.jwt = (params) => inst.check(/* @__PURE__ */ _jwt(ZodJWT, params));
			inst.emoji = (params) => inst.check(/* @__PURE__ */ _emoji(ZodEmoji, params));
			inst.guid = (params) => inst.check(/* @__PURE__ */ _guid(ZodGUID, params));
			inst.uuid = (params) => inst.check(/* @__PURE__ */ _uuid(ZodUUID, params));
			inst.uuidv4 = (params) => inst.check(/* @__PURE__ */ _uuidv4(ZodUUID, params));
			inst.uuidv6 = (params) => inst.check(/* @__PURE__ */ _uuidv6(ZodUUID, params));
			inst.uuidv7 = (params) => inst.check(/* @__PURE__ */ _uuidv7(ZodUUID, params));
			inst.nanoid = (params) => inst.check(/* @__PURE__ */ _nanoid(ZodNanoID, params));
			inst.guid = (params) => inst.check(/* @__PURE__ */ _guid(ZodGUID, params));
			inst.cuid = (params) => inst.check(/* @__PURE__ */ _cuid(ZodCUID, params));
			inst.cuid2 = (params) => inst.check(/* @__PURE__ */ _cuid2(ZodCUID2, params));
			inst.ulid = (params) => inst.check(/* @__PURE__ */ _ulid(ZodULID, params));
			inst.base64 = (params) => inst.check(/* @__PURE__ */ _base64(ZodBase64, params));
			inst.base64url = (params) => inst.check(/* @__PURE__ */ _base64url(ZodBase64URL, params));
			inst.xid = (params) => inst.check(/* @__PURE__ */ _xid(ZodXID, params));
			inst.ksuid = (params) => inst.check(/* @__PURE__ */ _ksuid(ZodKSUID, params));
			inst.ipv4 = (params) => inst.check(/* @__PURE__ */ _ipv4(ZodIPv4, params));
			inst.ipv6 = (params) => inst.check(/* @__PURE__ */ _ipv6(ZodIPv6, params));
			inst.cidrv4 = (params) => inst.check(/* @__PURE__ */ _cidrv4(ZodCIDRv4, params));
			inst.cidrv6 = (params) => inst.check(/* @__PURE__ */ _cidrv6(ZodCIDRv6, params));
			inst.e164 = (params) => inst.check(/* @__PURE__ */ _e164(ZodE164, params));
			inst.datetime = (params) => inst.check(datetime(params));
			inst.date = (params) => inst.check(date(params));
			inst.time = (params) => inst.check(time(params));
			inst.duration = (params) => inst.check(duration(params));
		});
		function string(params) {
			return /* @__PURE__ */ _string(ZodString, params);
		}
		const ZodStringFormat = /*@__PURE__*/ $constructor("ZodStringFormat", (inst, def) => {
			$ZodStringFormat.init(inst, def);
			_ZodString.init(inst, def);
		});
		const ZodEmail = /*@__PURE__*/ $constructor("ZodEmail", (inst, def) => {
			$ZodEmail.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodGUID = /*@__PURE__*/ $constructor("ZodGUID", (inst, def) => {
			$ZodGUID.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodUUID = /*@__PURE__*/ $constructor("ZodUUID", (inst, def) => {
			$ZodUUID.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodURL = /*@__PURE__*/ $constructor("ZodURL", (inst, def) => {
			$ZodURL.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodEmoji = /*@__PURE__*/ $constructor("ZodEmoji", (inst, def) => {
			$ZodEmoji.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodNanoID = /*@__PURE__*/ $constructor("ZodNanoID", (inst, def) => {
			$ZodNanoID.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		/**
		* @deprecated CUID v1 is deprecated by its authors due to information leakage
		* (timestamps embedded in the id). Use {@link ZodCUID2} instead.
		* See https://github.com/paralleldrive/cuid.
		*/
		const ZodCUID = /*@__PURE__*/ $constructor("ZodCUID", (inst, def) => {
			$ZodCUID.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodCUID2 = /*@__PURE__*/ $constructor("ZodCUID2", (inst, def) => {
			$ZodCUID2.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodULID = /*@__PURE__*/ $constructor("ZodULID", (inst, def) => {
			$ZodULID.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodXID = /*@__PURE__*/ $constructor("ZodXID", (inst, def) => {
			$ZodXID.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodKSUID = /*@__PURE__*/ $constructor("ZodKSUID", (inst, def) => {
			$ZodKSUID.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodIPv4 = /*@__PURE__*/ $constructor("ZodIPv4", (inst, def) => {
			$ZodIPv4.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodIPv6 = /*@__PURE__*/ $constructor("ZodIPv6", (inst, def) => {
			$ZodIPv6.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodCIDRv4 = /*@__PURE__*/ $constructor("ZodCIDRv4", (inst, def) => {
			$ZodCIDRv4.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodCIDRv6 = /*@__PURE__*/ $constructor("ZodCIDRv6", (inst, def) => {
			$ZodCIDRv6.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodBase64 = /*@__PURE__*/ $constructor("ZodBase64", (inst, def) => {
			$ZodBase64.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodBase64URL = /*@__PURE__*/ $constructor("ZodBase64URL", (inst, def) => {
			$ZodBase64URL.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodE164 = /*@__PURE__*/ $constructor("ZodE164", (inst, def) => {
			$ZodE164.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodJWT = /*@__PURE__*/ $constructor("ZodJWT", (inst, def) => {
			$ZodJWT.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodNumber = /*@__PURE__*/ $constructor("ZodNumber", (inst, def) => {
			$ZodNumber.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => numberProcessor(inst, ctx, json, params);
			_installLazyMethods(inst, "ZodNumber", {
				gt(value, params) {
					return this.check(/* @__PURE__ */ _gt(value, params));
				},
				gte(value, params) {
					return this.check(/* @__PURE__ */ _gte(value, params));
				},
				min(value, params) {
					return this.check(/* @__PURE__ */ _gte(value, params));
				},
				lt(value, params) {
					return this.check(/* @__PURE__ */ _lt(value, params));
				},
				lte(value, params) {
					return this.check(/* @__PURE__ */ _lte(value, params));
				},
				max(value, params) {
					return this.check(/* @__PURE__ */ _lte(value, params));
				},
				int(params) {
					return this.check(int(params));
				},
				safe(params) {
					return this.check(int(params));
				},
				positive(params) {
					return this.check(/* @__PURE__ */ _gt(0, params));
				},
				nonnegative(params) {
					return this.check(/* @__PURE__ */ _gte(0, params));
				},
				negative(params) {
					return this.check(/* @__PURE__ */ _lt(0, params));
				},
				nonpositive(params) {
					return this.check(/* @__PURE__ */ _lte(0, params));
				},
				multipleOf(value, params) {
					return this.check(/* @__PURE__ */ _multipleOf(value, params));
				},
				step(value, params) {
					return this.check(/* @__PURE__ */ _multipleOf(value, params));
				},
				finite() {
					return this;
				}
			});
			const bag = inst._zod.bag;
			inst.minValue = Math.max(bag.minimum ?? Number.NEGATIVE_INFINITY, bag.exclusiveMinimum ?? Number.NEGATIVE_INFINITY) ?? null;
			inst.maxValue = Math.min(bag.maximum ?? Number.POSITIVE_INFINITY, bag.exclusiveMaximum ?? Number.POSITIVE_INFINITY) ?? null;
			inst.isInt = (bag.format ?? "").includes("int") || Number.isSafeInteger(bag.multipleOf ?? .5);
			inst.isFinite = true;
			inst.format = bag.format ?? null;
		});
		function number(params) {
			return /* @__PURE__ */ _number(ZodNumber, params);
		}
		const ZodNumberFormat = /*@__PURE__*/ $constructor("ZodNumberFormat", (inst, def) => {
			$ZodNumberFormat.init(inst, def);
			ZodNumber.init(inst, def);
		});
		function int(params) {
			return /* @__PURE__ */ _int(ZodNumberFormat, params);
		}
		const ZodBoolean = /*@__PURE__*/ $constructor("ZodBoolean", (inst, def) => {
			$ZodBoolean.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => booleanProcessor(inst, ctx, json, params);
		});
		function boolean(params) {
			return /* @__PURE__ */ _boolean(ZodBoolean, params);
		}
		const ZodUnknown = /*@__PURE__*/ $constructor("ZodUnknown", (inst, def) => {
			$ZodUnknown.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => void 0;
		});
		function unknown() {
			return /* @__PURE__ */ _unknown(ZodUnknown);
		}
		const ZodNever = /*@__PURE__*/ $constructor("ZodNever", (inst, def) => {
			$ZodNever.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => neverProcessor(inst, ctx, json, params);
		});
		function never(params) {
			return /* @__PURE__ */ _never(ZodNever, params);
		}
		const ZodArray = /*@__PURE__*/ $constructor("ZodArray", (inst, def) => {
			$ZodArray.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => arrayProcessor(inst, ctx, json, params);
			inst.element = def.element;
			_installLazyMethods(inst, "ZodArray", {
				min(n, params) {
					return this.check(/* @__PURE__ */ _minLength(n, params));
				},
				nonempty(params) {
					return this.check(/* @__PURE__ */ _minLength(1, params));
				},
				max(n, params) {
					return this.check(/* @__PURE__ */ _maxLength(n, params));
				},
				length(n, params) {
					return this.check(/* @__PURE__ */ _length(n, params));
				},
				unwrap() {
					return this.element;
				}
			});
		});
		function array(element, params) {
			return /* @__PURE__ */ _array(ZodArray, element, params);
		}
		const ZodObject = /*@__PURE__*/ $constructor("ZodObject", (inst, def) => {
			$ZodObjectJIT.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => objectProcessor(inst, ctx, json, params);
			defineLazy(inst, "shape", () => {
				return def.shape;
			});
			_installLazyMethods(inst, "ZodObject", {
				keyof() {
					return _enum(Object.keys(this._zod.def.shape));
				},
				catchall(catchall) {
					return this.clone({
						...this._zod.def,
						catchall
					});
				},
				passthrough() {
					return this.clone({
						...this._zod.def,
						catchall: unknown()
					});
				},
				loose() {
					return this.clone({
						...this._zod.def,
						catchall: unknown()
					});
				},
				strict() {
					return this.clone({
						...this._zod.def,
						catchall: never()
					});
				},
				strip() {
					return this.clone({
						...this._zod.def,
						catchall: void 0
					});
				},
				extend(incoming) {
					return extend(this, incoming);
				},
				safeExtend(incoming) {
					return safeExtend(this, incoming);
				},
				merge(other) {
					return merge(this, other);
				},
				pick(mask) {
					return pick(this, mask);
				},
				omit(mask) {
					return omit(this, mask);
				},
				partial(...args) {
					return partial(ZodOptional, this, args[0]);
				},
				required(...args) {
					return required(ZodNonOptional, this, args[0]);
				}
			});
		});
		function object(shape, params) {
			const def = {
				type: "object",
				shape: shape ?? {},
				...normalizeParams(params)
			};
			return new ZodObject(def);
		}
		const ZodUnion = /*@__PURE__*/ $constructor("ZodUnion", (inst, def) => {
			$ZodUnion.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => unionProcessor(inst, ctx, json, params);
			inst.options = def.options;
		});
		function union(options, params) {
			return new ZodUnion({
				type: "union",
				options,
				...normalizeParams(params)
			});
		}
		const ZodIntersection = /*@__PURE__*/ $constructor("ZodIntersection", (inst, def) => {
			$ZodIntersection.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => intersectionProcessor(inst, ctx, json, params);
		});
		function intersection(left, right) {
			return new ZodIntersection({
				type: "intersection",
				left,
				right
			});
		}
		const ZodEnum = /*@__PURE__*/ $constructor("ZodEnum", (inst, def) => {
			$ZodEnum.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => enumProcessor(inst, ctx, json, params);
			inst.enum = def.entries;
			inst.options = Object.values(def.entries);
			const keys = new Set(Object.keys(def.entries));
			inst.extract = (values, params) => {
				const newEntries = {};
				for (const value of values) if (keys.has(value)) newEntries[value] = def.entries[value];
				else throw new Error(`Key ${value} not found in enum`);
				return new ZodEnum({
					...def,
					checks: [],
					...normalizeParams(params),
					entries: newEntries
				});
			};
			inst.exclude = (values, params) => {
				const newEntries = { ...def.entries };
				for (const value of values) if (keys.has(value)) delete newEntries[value];
				else throw new Error(`Key ${value} not found in enum`);
				return new ZodEnum({
					...def,
					checks: [],
					...normalizeParams(params),
					entries: newEntries
				});
			};
		});
		function _enum(values, params) {
			const entries = Array.isArray(values) ? Object.fromEntries(values.map((v) => [v, v])) : values;
			return new ZodEnum({
				type: "enum",
				entries,
				...normalizeParams(params)
			});
		}
		const ZodLiteral = /*@__PURE__*/ $constructor("ZodLiteral", (inst, def) => {
			$ZodLiteral.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => literalProcessor(inst, ctx, json, params);
			inst.values = new Set(def.values);
			Object.defineProperty(inst, "value", { get() {
				if (def.values.length > 1) throw new Error("This schema contains multiple valid literal values. Use `.values` instead.");
				return def.values[0];
			} });
		});
		function literal(value, params) {
			return new ZodLiteral({
				type: "literal",
				values: Array.isArray(value) ? value : [value],
				...normalizeParams(params)
			});
		}
		const ZodTransform = /*@__PURE__*/ $constructor("ZodTransform", (inst, def) => {
			$ZodTransform.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => transformProcessor(inst, ctx, json, params);
			inst._zod.parse = (payload, _ctx) => {
				if (_ctx.direction === "backward") throw new $ZodEncodeError(inst.constructor.name);
				payload.addIssue = (issue$1) => {
					if (typeof issue$1 === "string") payload.issues.push(issue(issue$1, payload.value, def));
					else {
						const _issue = issue$1;
						if (_issue.fatal) _issue.continue = false;
						_issue.code ?? (_issue.code = "custom");
						_issue.input ?? (_issue.input = payload.value);
						_issue.inst ?? (_issue.inst = inst);
						payload.issues.push(issue(_issue));
					}
				};
				const output = def.transform(payload.value, payload);
				if (output instanceof Promise) return output.then((output) => {
					payload.value = output;
					payload.fallback = true;
					return payload;
				});
				payload.value = output;
				payload.fallback = true;
				return payload;
			};
		});
		function transform(fn) {
			return new ZodTransform({
				type: "transform",
				transform: fn
			});
		}
		const ZodOptional = /*@__PURE__*/ $constructor("ZodOptional", (inst, def) => {
			$ZodOptional.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
			inst.unwrap = () => inst._zod.def.innerType;
		});
		function optional(innerType) {
			return new ZodOptional({
				type: "optional",
				innerType
			});
		}
		const ZodExactOptional = /*@__PURE__*/ $constructor("ZodExactOptional", (inst, def) => {
			$ZodExactOptional.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
			inst.unwrap = () => inst._zod.def.innerType;
		});
		function exactOptional(innerType) {
			return new ZodExactOptional({
				type: "optional",
				innerType
			});
		}
		const ZodNullable = /*@__PURE__*/ $constructor("ZodNullable", (inst, def) => {
			$ZodNullable.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => nullableProcessor(inst, ctx, json, params);
			inst.unwrap = () => inst._zod.def.innerType;
		});
		function nullable(innerType) {
			return new ZodNullable({
				type: "nullable",
				innerType
			});
		}
		const ZodDefault = /*@__PURE__*/ $constructor("ZodDefault", (inst, def) => {
			$ZodDefault.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => defaultProcessor(inst, ctx, json, params);
			inst.unwrap = () => inst._zod.def.innerType;
			inst.removeDefault = inst.unwrap;
		});
		function _default(innerType, defaultValue) {
			return new ZodDefault({
				type: "default",
				innerType,
				get defaultValue() {
					return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
				}
			});
		}
		const ZodPrefault = /*@__PURE__*/ $constructor("ZodPrefault", (inst, def) => {
			$ZodPrefault.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => prefaultProcessor(inst, ctx, json, params);
			inst.unwrap = () => inst._zod.def.innerType;
		});
		function prefault(innerType, defaultValue) {
			return new ZodPrefault({
				type: "prefault",
				innerType,
				get defaultValue() {
					return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
				}
			});
		}
		const ZodNonOptional = /*@__PURE__*/ $constructor("ZodNonOptional", (inst, def) => {
			$ZodNonOptional.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => nonoptionalProcessor(inst, ctx, json, params);
			inst.unwrap = () => inst._zod.def.innerType;
		});
		function nonoptional(innerType, params) {
			return new ZodNonOptional({
				type: "nonoptional",
				innerType,
				...normalizeParams(params)
			});
		}
		const ZodCatch = /*@__PURE__*/ $constructor("ZodCatch", (inst, def) => {
			$ZodCatch.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => catchProcessor(inst, ctx, json, params);
			inst.unwrap = () => inst._zod.def.innerType;
			inst.removeCatch = inst.unwrap;
		});
		function _catch(innerType, catchValue) {
			return new ZodCatch({
				type: "catch",
				innerType,
				catchValue: typeof catchValue === "function" ? catchValue : () => catchValue
			});
		}
		const ZodPipe = /*@__PURE__*/ $constructor("ZodPipe", (inst, def) => {
			$ZodPipe.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => pipeProcessor(inst, ctx, json, params);
			inst.in = def.in;
			inst.out = def.out;
		});
		function pipe(in_, out) {
			return new ZodPipe({
				type: "pipe",
				in: in_,
				out
			});
		}
		const ZodReadonly = /*@__PURE__*/ $constructor("ZodReadonly", (inst, def) => {
			$ZodReadonly.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => readonlyProcessor(inst, ctx, json, params);
			inst.unwrap = () => inst._zod.def.innerType;
		});
		function readonly(innerType) {
			return new ZodReadonly({
				type: "readonly",
				innerType
			});
		}
		const ZodCustom = /*@__PURE__*/ $constructor("ZodCustom", (inst, def) => {
			$ZodCustom.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => customProcessor(inst, ctx, json, params);
		});
		function refine(fn, _params = {}) {
			return /* @__PURE__ */ _refine(ZodCustom, fn, _params);
		}
		function superRefine(fn, params) {
			return /* @__PURE__ */ _superRefine(fn, params);
		}
		//#endregion
		//#region src/contract.ts
		/**
		* The wire contract between the browser panel and this plugin's host half.
		*
		* It is deliberately transport-agnostic plain data: the host registers one
		* Connection RPC channel (see `command.ts`) and the client bundle inlines this
		* module, so both sides agree on endpoint names and payload shapes without
		* sharing any runtime identity. Error codes are the stable half of the
		* contract; `message` is only a fallback the panel does not have to show.
		*
		* Two properties this module owns:
		*
		* - **One shape per endpoint.** {@link PanelResponseMap} is the single mapping
		*   from endpoint to response type, so the panel cannot silently decode one
		*   endpoint's answer as another's. `reveal` answers with
		*   {@link RevealedView}; root-management endpoints answer with
		*   {@link RootsView}, and browsing returns {@link FilesView} or {@link FilePreview}.
		*   The host builds those answers in `command.ts` and the
		*   panel parses them here — one definition, two consumers.
		* - **Runtime validation at the boundary.** The payload arrives from a browser
		*   and the answer arrives from the host; neither is trusted to match the
		*   TypeScript types. {@link parsePanelCall} and the `parse*View` functions
		*   check the shapes and report structural failures as a message, so a
		*   mismatch becomes a visible, localized error instead of a crash or a
		*   silently wrong render.
		*
		* Nothing here may import `node:*` or `@deepseek-ai/*`: this module is inlined
		* into the browser bundle.
		*
		* @module dsh-plugin-multi-root-workspace/contract
		*/
		/** The absolute logical channel both halves speak over. */
		const PANEL_CHANNEL = "/multi-root-workspace";
		object({
			sessionId: string().min(1),
			entry: object({
				ordinal: number().int().positive(),
				id: string(),
				path: string(),
				addedAt: string()
			}).strict().optional(),
			id: string().optional(),
			path: string().optional(),
			alias: string().optional(),
			beforeEntry: object({
				ordinal: number().int().positive(),
				id: string(),
				path: string(),
				addedAt: string()
			}).strict().optional(),
			beforeId: string().optional()
		}).strict();
		/**
		* One root as it travels over the channel. Deliberately NOT strict, in both
		* directions: a newer host that adds a field must not brick an older panel, and
		* the field that matters is the state it reports.
		*/
		const rootViewSchema = object({
			ordinal: number().int().positive(),
			id: string(),
			path: string(),
			alias: string().optional(),
			addedAt: string(),
			state: _enum([
				"available",
				"missing",
				"redirected",
				"invalid"
			]),
			detail: string().optional(),
			source: literal("common").optional()
		});
		const rootsViewSchema = object({
			primaryRoot: string(),
			primaryName: string().optional(),
			roots: array(rootViewSchema),
			unavailable: string().optional()
		});
		const revealedViewSchema = object({ revealed: string() });
		const filesViewSchema = object({
			path: string(),
			entries: array(object({
				name: string().min(1).refine((name) => name !== "." && name !== ".." && !/[\\/]/.test(name) && !name.includes(String.fromCharCode(0))),
				type: _enum([
					"file",
					"directory",
					"other"
				])
			})),
			truncated: boolean()
		});
		const filePreviewSchema = object({
			text: string(),
			eof: boolean()
		});
		function parseFilesView(value) {
			const parsed = filesViewSchema.safeParse(value);
			return parsed.success ? {
				ok: true,
				value: parsed.data
			} : {
				ok: false,
				message: firstIssue(parsed.error)
			};
		}
		function parseFilePreview(value) {
			const parsed = filePreviewSchema.safeParse(value);
			return parsed.success ? {
				ok: true,
				value: parsed.data
			} : {
				ok: false,
				message: firstIssue(parsed.error)
			};
		}
		const errorViewSchema = object({
			code: string(),
			message: string(),
			details: unknown().optional()
		});
		/**
		* Validate a `RootsView` when it arrives.
		* @param value - the raw endpoint value.
		* @returns the view, or the reason it is not one.
		*/
		function parseRootsView(value) {
			const parsed = rootsViewSchema.safeParse(value);
			if (!parsed.success) return {
				ok: false,
				message: `the answer is not a roots view: ${firstIssue(parsed.error)}`
			};
			const view = parsed.data;
			return {
				ok: true,
				value: {
					primaryRoot: view.primaryRoot,
					...view.primaryName === void 0 ? {} : { primaryName: view.primaryName },
					roots: view.roots.map(narrowRootView),
					...view.unavailable === void 0 ? {} : { unavailable: view.unavailable }
				}
			};
		}
		/**
		* Validate a `RevealedView` when it arrives.
		* @param value - the raw endpoint value.
		* @returns the view, or the reason it is not one.
		*/
		function parseRevealedView(value) {
			const parsed = revealedViewSchema.safeParse(value);
			if (!parsed.success) return {
				ok: false,
				message: `the answer is not a reveal result: ${firstIssue(parsed.error)}`
			};
			return {
				ok: true,
				value: parsed.data
			};
		}
		/**
		* Validate the `{ code, message }` envelope of a failed call.
		* @param value - the raw error value.
		* @returns the failure, or `undefined` when the value is not one.
		*/
		function parseErrorView(value) {
			const parsed = errorViewSchema.safeParse(value);
			if (!parsed.success) return void 0;
			return {
				code: parsed.data.code,
				message: parsed.data.message
			};
		}
		/** Rebuild one parsed root as the declared `RootView`. */
		function narrowRootView(value) {
			return {
				ordinal: value.ordinal,
				id: value.id,
				path: value.path,
				addedAt: value.addedAt,
				state: value.state,
				...value.alias === void 0 ? {} : { alias: value.alias },
				...value.detail === void 0 ? {} : { detail: value.detail },
				...value.source === void 0 ? {} : { source: value.source }
			};
		}
		/** Render the first zod issue as one short sentence. */
		function firstIssue(error) {
			const issue = error.issues[0];
			if (issue === void 0) return "invalid";
			return `${issue.path.length === 0 ? "" : `${issue.path.join(".")}: `}${issue.message}`;
		}
		//#endregion
		//#region src/client/locales.ts
		/**
		* The panel's bilingual copy.
		*
		* Flat `Record<string, string>` dictionaries keyed by a bare key (never
		* `ns.key`), `zh` as the canonical shape and `en` pinned to it by `satisfies`,
		* so a missing translation is a type error and a divergence is caught by
		* `test/locale-parity.spec.ts` as well.
		*
		* @module dsh-plugin-multi-root-workspace/client/locales
		*/
		/** The locale namespace this plugin owns. */
		const NS = "multiRootWorkspace";
		/** Chinese copy (the canonical shape). */
		const zh = {
			"files.browse": "浏览文件",
			"files.reload": "刷新文件树",
			"files.empty": "目录为空",
			"files.truncated": "条目过多，列表已截断",
			"files.previewTruncated": "仅显示前 200 行",
			"action.label": "工作区目录",
			"action.title": "管理本会话的附属工作目录",
			"section.label": "工作区文件夹",
			"panel.title": "工作区目录",
			"panel.subtitle": "主目录和附加目录遵循当前沙箱模式；workspace-write 可写，read-only 下都不可写。",
			"panel.primary": "主工作目录",
			"panel.primaryNote": "当前工作区主工作目录，不可移除",
			"panel.additional": "附属工作目录",
			"panel.empty": "还没有附属工作目录。",
			"panel.emptyHint": "添加后，Agent 可在同一会话中读写该目录，受限 shell 和终端同步生效。",
			"panel.noSession": "当前没有活动会话",
			"panel.noWorkspace": "尚未选择工作区",
			"panel.loading": "正在读取…",
			"panel.retry": "重试",
			"panel.close": "关闭",
			"panel.add": "添加目录",
			"panel.addManual": "输入绝对路径",
			"panel.addConfirm": "添加",
			"panel.remove": "移除",
			"panel.removeConfirm": "确认移除",
			"panel.more": "更多操作",
			"panel.rename": "重命名",
			"panel.aliasPlaceholder": "显示名（留空清除）",
			"panel.aliasSave": "保存",
			"panel.aliasCancel": "取消",
			"panel.copyPath": "复制路径",
			"panel.copied": "已复制",
			"panel.reveal": "在文件管理器中显示",
			"panel.moveUp": "上移",
			"panel.moveDown": "下移",
			"panel.common": "通用工作目录",
			"panel.commonHint": "由插件配置的 commonRoots 授予，对所有工作空间生效；修改请编辑插件配置（cordis.patch.yml）。",
			"panel.commonEmpty": "没有配置通用工作目录；在插件配置（cordis.patch.yml）的 commonRoots 中添加即可对所有工作空间生效。",
			"picker.title": "选择工作目录",
			"picker.close": "关闭",
			"picker.crumbs": "目录层级",
			"picker.home": "主目录",
			"picker.current": "当前路径",
			"picker.showHidden": "显示隐藏目录",
			"picker.empty": "这里没有子目录",
			"picker.truncated": "条目过多，列表已截断",
			"picker.create": "新建文件夹",
			"picker.createName": "文件夹名称",
			"picker.createConfirm": "创建",
			"picker.cancel": "取消",
			"picker.confirm": "选择此目录",
			"picker.unavailable": "当前部署没有可用的目录选择器；请直接在下方输入绝对路径。",
			"picker.error.unreadable": "无法读取该目录；它可能已不存在或没有访问权限。",
			"picker.error.exists": "该目录下已有同名文件夹。",
			"picker.error.create-failed": "新建文件夹失败。",
			"picker.error.failed": "目录浏览失败。",
			"state.available": "可写",
			"state.missing": "目录不存在，暂不授予",
			"state.redirected": "登记目录已被替换（现在指向别处），暂不授予",
			"state.invalid": "登记无效",
			"root.sourceCommon": "通用",
			"root.sourceCommonTitle": "由插件 commonRoots 配置授予，对所有工作空间生效；请在插件配置（cordis.patch.yml）中修改。",
			"error.not-absolute": "请给出绝对路径（或 ~/ 开头的路径）。",
			"error.missing": "该目录不存在。",
			"error.not-a-directory": "该路径不是目录。",
			"error.equals-primary": "这就是本会话的工作目录，无需重复添加。",
			"error.primary-overlap": "该目录与主工作目录互相包含，不会带来新的可写范围。",
			"error.duplicate": "该目录已经登记过了。",
			"error.nested": "该目录与已登记的根互相包含，不会带来新的可写范围。",
			"error.invalid-alias": "别名不能包含控制字符，且不能过长。",
			"error.not-found": "没有找到对应的登记项。",
			"error.invalid-ref": "请求缺少必要的标识。",
			"error.common-root": "该项由插件的 commonRoots 配置授予，对所有工作空间生效，无法在面板中移除或改名；请修改插件配置（cordis.patch.yml）。",
			"error.storage-unavailable": "根目录登记的存储不可用，请检查 $DSH_HOME/storages 下的文件。",
			"error.registry-contended": "根目录登记正由另一个 DSH 进程占用；本进程不会授予附加根。关闭另一个进程后点重试。",
			"error.reveal-unavailable": "无法打开系统的文件管理器；登记项不受影响，路径仍可复制。",
			"error.unavailable": "无法连接到 dsh 主进程。",
			"error.copy-failed": "无法写入剪贴板，请检查浏览器的剪贴板权限。",
			"error.session-not-found": "找不到该会话；请先打开一个工作区会话。",
			"error.fallback": "操作失败。"
		};
		/** English copy, pinned to the Chinese key set. */
		const en = {
			"files.browse": "Browse files",
			"files.reload": "Refresh files",
			"files.empty": "Empty directory",
			"files.truncated": "More entries were omitted",
			"files.previewTruncated": "Showing the first 200 lines",
			"action.label": "Folders",
			"action.title": "Manage this session's secondary working directories",
			"section.label": "Workspace folders",
			"panel.title": "Workspace folders",
			"panel.subtitle": "The primary and additional folders follow the current sandbox mode: writable in workspace-write and read-only in read-only.",
			"panel.primary": "Primary working directory",
			"panel.primaryNote": "This workspace's primary working directory; it cannot be removed",
			"panel.additional": "Secondary working directories",
			"panel.empty": "No secondary working directories yet.",
			"panel.emptyHint": "Once added, the agent can use the folder in this session, including confined shells and terminals.",
			"panel.noSession": "No active session",
			"panel.noWorkspace": "No workspace selected",
			"panel.loading": "Loading…",
			"panel.retry": "Retry",
			"panel.close": "Close",
			"panel.add": "Add folder",
			"panel.addManual": "Enter an absolute path",
			"panel.addConfirm": "Add",
			"panel.remove": "Remove",
			"panel.removeConfirm": "Confirm removal",
			"panel.more": "More actions",
			"panel.rename": "Rename",
			"panel.aliasPlaceholder": "Display name (empty clears it)",
			"panel.aliasSave": "Save",
			"panel.aliasCancel": "Cancel",
			"panel.copyPath": "Copy path",
			"panel.copied": "Copied",
			"panel.reveal": "Reveal in file manager",
			"panel.moveUp": "Move up",
			"panel.moveDown": "Move down",
			"panel.common": "Common working directories",
			"panel.commonHint": "Granted by the plugin's commonRoots configuration and applied to every workspace; edit that configuration (cordis.patch.yml) to change it.",
			"panel.commonEmpty": "No common working directories are configured; add them under commonRoots in the plugin configuration (cordis.patch.yml) to apply them to every workspace.",
			"picker.title": "Choose a working directory",
			"picker.close": "Close",
			"picker.crumbs": "Directory path",
			"picker.home": "Home",
			"picker.current": "Current path",
			"picker.showHidden": "Show hidden folders",
			"picker.empty": "No subfolders here",
			"picker.truncated": "Too many entries; the list is truncated",
			"picker.create": "New folder",
			"picker.createName": "Folder name",
			"picker.createConfirm": "Create",
			"picker.cancel": "Cancel",
			"picker.confirm": "Use this folder",
			"picker.unavailable": "This deployment offers no directory picker; enter an absolute path below.",
			"picker.error.unreadable": "That directory could not be read; it may no longer exist or not be accessible.",
			"picker.error.exists": "A folder with that name already exists.",
			"picker.error.create-failed": "Could not create the folder.",
			"picker.error.failed": "Browsing failed.",
			"state.available": "Writable",
			"state.missing": "Directory is absent; not granted",
			"state.redirected": "Registration was replaced (it now points elsewhere); not granted",
			"state.invalid": "Registration is unusable",
			"root.sourceCommon": "Common",
			"root.sourceCommonTitle": "Granted by the plugin's commonRoots configuration, which applies to every workspace; change it in that configuration (cordis.patch.yml).",
			"error.not-absolute": "Give an absolute path (or one starting with ~/).",
			"error.missing": "That directory does not exist.",
			"error.not-a-directory": "That path is not a directory.",
			"error.equals-primary": "That is this session's workspace root; it needs no registration.",
			"error.primary-overlap": "That directory and the primary working directory contain each other, so it grants nothing new.",
			"error.duplicate": "That directory is already registered.",
			"error.nested": "That directory and a registered root contain each other, so it grants nothing new.",
			"error.invalid-alias": "An alias may not contain control characters or be overly long.",
			"error.not-found": "No registration matches that reference.",
			"error.invalid-ref": "The request is missing a required identity.",
			"error.common-root": "This entry is granted by the plugin's commonRoots configuration, which applies to every workspace; it cannot be removed or renamed here. Edit that configuration (cordis.patch.yml) instead.",
			"error.storage-unavailable": "The root registry store is unavailable; check the files under $DSH_HOME/storages.",
			"error.registry-contended": "The root registry is owned by another DSH process; this process grants no additional roots. Close the other process, then retry.",
			"error.reveal-unavailable": "Could not open the system file manager; the registration is untouched, and the path can still be copied.",
			"error.unavailable": "Could not reach the dsh host process.",
			"error.copy-failed": "Could not write to the clipboard; check the browser's clipboard permission.",
			"error.session-not-found": "That session is not active; open a workspace session first.",
			"error.fallback": "The operation failed."
		};
		//#endregion
		//#region src/client/panel-client.ts
		/** A failure the panel renders from its `code`. */
		var PanelError = class extends Error {
			code;
			/**
			* @param code - stable code from the root vocabulary, or a transport code.
			* @param message - the host's fallback text.
			*/
			constructor(code, message) {
				super(message);
				this.code = code;
				this.name = "PanelError";
			}
		};
		/**
		* The copy key for one failure code, with a safe fallback for codes this build
		* does not know (a newer host, or a transport failure).
		* @param code - the failure code.
		* @returns the locale key to render.
		*/
		function errorKeyOf(code) {
			const candidate = `error.${code}`;
			return candidate in zh ? candidate : "error.fallback";
		}
		/**
		* Build the panel client over a Connection handle.
		* @param connection - the client Connection service.
		* @returns the client, with every transport failure normalized to a `PanelError`.
		*/
		function createPanelClient(connection) {
			return { async call(endpoint, payload) {
				let result;
				try {
					result = await connection.rpc.call(PANEL_CHANNEL, endpoint, payload);
				} catch (error) {
					throw new PanelError("unavailable", error instanceof Error ? error.message : String(error));
				}
				if (!result.ok) {
					const failure = parseErrorView(result.error);
					throw failure === void 0 ? new PanelError("unavailable", "the host answered with an unreadable failure") : new PanelError(failure.code, failure.message);
				}
				return expectShape(endpoint, result.value);
			} };
		}
		/**
		* Read the value one endpoint promised, narrowing it at the boundary so a host
		* that answered a different endpoint — or a shape from another version — cannot
		* crash the render.
		* @param endpoint - the endpoint that was called.
		* @param value - the raw endpoint value.
		* @returns the value as the endpoint's declared type.
		* @throws {PanelError} `panel/bad-response` when the value is not that shape.
		*/
		function expectShape(endpoint, value) {
			const parsed = endpoint === "reveal" ? parseRevealedView(value) : endpoint === "files" ? parseFilesView(value) : endpoint === "readFile" ? parseFilePreview(value) : parseRootsView(value);
			if (!parsed.ok) throw new PanelError("panel/bad-response", parsed.message);
			return parsed.value;
		}
		//#endregion
		//#region src/client/styles.ts
		/**
		* The plugin's one stylesheet, injected into the document by the client entry.
		*
		* The host ships its design tokens as CSS custom properties on `body`
		* (`--dsw-alias-*` semantics, `--dsw-elevation-*` shadows, `--ds-*` motion and
		* code-font tokens), so this sheet names no color of its own: light and dark
		* theme follow the host automatically. It carries the panel body, its capsule
		* controls, and the panel's own directory picker overlay — a self-drawn
		* floating layer whose mask, card and elevation copy the host Modal.module.css
		* recipe token for token (group hints and empty states reuse .mrfw-note).
		* The workspace-config section's dialog shell (mask, card, header, close
		* button) and the sidebar footer trigger still belong to the workspace-config
		* holder since ADR-0013, and the Modal primitive already styles those — this
		* sheet deliberately has no rule for either.
		*
		* @module dsh-plugin-multi-root-workspace/client/styles
		*/
		/** The stylesheet text; every class is prefixed `mrfw-` to stay collision-free. */
		const STYLES = `
/* The section's own column. The holder's dialog content column owns the
 * padding and the scrolling (.panel: 20px 24px padding, overflow-y auto),
 * so this root must not scroll a second time; it only stacks the body blocks
 * and is allowed to shrink inside the dialog's flex column. */
.mrfw-body {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* The section fills the holder's content column (flex: 1 1 auto) while still
 * collapsing to its content height in the Files-tab inline wrapper. */
.mrfw-sectionBody {
  flex: 1 1 auto;
}

.mrfw-description {
  margin: 0 0 8px;
  font-size: 14px;
  line-height: 22px;
  color: var(--dsw-alias-label-tertiary);
}

.mrfw-alert {
  margin: 0 0 8px;
  font-size: 14px;
  line-height: 22px;
  color: var(--dsw-alias-state-error-primary);
}

.mrfw-section {
  display: flex;
  flex-direction: column;
}

.mrfw-section + .mrfw-section {
  margin-top: 8px;
}

.mrfw-sectionTitleRow {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 8px 0 4px;
}

.mrfw-sectionTitle {
  font-size: 14px;
  line-height: 22px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
}

.mrfw-sectionNote {
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
}

.mrfw-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 12px 0;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
}

.mrfw-rowBare {
  border-bottom: none;
}

/* A root entry's two lines: the display name on top, the absolute path under
   it in the tertiary voice (the workspace rows recipe of the host sidebar). */
.mrfw-rootText {
  display: flex;
  flex: 1 1 240px;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.mrfw-rootName {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
}

.mrfw-rootPath {
  font-family: var(--ds-font-family-code);
  font-size: 12px;
  line-height: 18px;
  word-break: break-all;
  color: var(--dsw-alias-label-tertiary);
}

.mrfw-note {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
}

.mrfw-stateWarn {
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-state-warn-primary);
}

/* The "common" badge: a root the plugin configuration grants to every
   workspace. It is a neutral tag, not a warning — the root is perfectly
   usable; only its actions are owned by the configuration instead of the panel. */
.mrfw-sourceBadge {
  flex: none;
  padding: 0 6px;
  border: 1px solid var(--dsw-alias-border-secondary);
  border-radius: 999px;
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-secondary);
}

.mrfw-btn {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 28px;
  padding: 0 10px;
  border: none;
  border-radius: 14px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
  transition: background-color var(--ds-transition-duration-fast) var(--ds-ease-in-out);
}

.mrfw-btn:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.mrfw-btnGhost:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}

.mrfw-btnGhost:active:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-active);
}

.mrfw-btnDanger:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover-danger);
}

.mrfw-btnOutline {
  border: 0.5px solid var(--dsw-alias-border-l3);
  background: transparent;
}

.mrfw-btnOutline:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}

.mrfw-btnPrimary {
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground);
}

.mrfw-btnPrimary:hover:not(:disabled) {
  background: var(--dsw-alias-button-primary-hover);
}

/* One icon-only action: a square of the capsule family, meaning in title.
   Declared after the .mrfw-btn family so its padding wins the cascade tie:
   the capsule's 0 10px padding would otherwise squeeze the icon glyph. */
.mrfw-iconBtn {
  width: 28px;
  padding: 0;
  border-radius: 8px;
}

.mrfw-input {
  flex: 1 1 220px;
  min-width: 0;
  height: 32px;
  padding: 0 8px;
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 14px;
  line-height: 22px;
  outline: none;
  transition: border-color var(--ds-transition-duration-fast) var(--ds-ease-in-out);
}

.mrfw-input:focus {
  border-color: var(--dsw-alias-brand-primary);
}

.mrfw-input::placeholder {
  color: var(--dsw-alias-label-dimmed);
}

.mrfw-inputInline {
  flex: 1 1 auto;
}

.mrfw-aliasEditor {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  flex-basis: 100%;
}

.mrfw-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 0.5px solid var(--dsw-alias-border-l2);
}

/* One control row, one height: the capsule buttons match the 32px input. */
.mrfw-actions .mrfw-btn {
  height: 32px;
  border-radius: 16px;
}

.mrfw-fileTree { flex-basis: 100%; min-width: 0; }
.mrfw-fileLevel { list-style: none; padding-left: 16px; margin: 4px 0; }
.mrfw-fileEntry { display: block; border: 0; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; text-align: left; cursor: pointer; padding: 4px; overflow-wrap: anywhere; }
.mrfw-fileEntry:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); }
.mrfw-filePreview { max-height: 320px; overflow: auto; padding: 8px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font-size: 12px; }
.mrfw-actions .mrfw-iconBtn {
  width: 32px;
}

/* The directory picker's self-drawn overlay. The layer is the panel's own
 * floating surface, not the holder's dialog shell, and its mask, card and
 * elevation copy the host Modal.module.css recipe token for token:
 * mask-1 + mask-blur on the overlay, layer-2 + radius-panel +
 * elevation-prominent on the card. The close button, breadcrumb buttons,
 * inputs and actions all reuse the capsule family and .mrfw-input below. */

/* Portal root: full-viewport, centered, 24px of air on every side — the top
   and bottom widen to the frame's overlay inset when the host declares one.
   The card sizes against this padding box, never a viewport calc of its own. */
.mrfw-pickerOverlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: max(24px, var(--dsh-frame-overlay-top, 24px)) 24px;
}

.mrfw-pickerMask {
  position: absolute;
  inset: 0;
  background: var(--dsw-alias-bg-mask-1);
  backdrop-filter: var(--dsw-mask-blur);
  animation: mrfwPickerEnter var(--ds-transition-duration) var(--ds-ease-in-out);
}

.mrfw-pickerCard {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  width: min(560px, 100%);
  max-height: min(560px, 100%);
  border-radius: var(--dsw-radius-panel);
  background: var(--dsw-alias-bg-layer-2);
  box-shadow: var(--dsw-elevation-prominent);
  overflow: hidden;
  animation: mrfwPickerEnter var(--ds-transition-duration) var(--ds-ease-in-out);
}

@keyframes mrfwPickerEnter {
  from { opacity: 0; }
  to { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .mrfw-pickerMask,
  .mrfw-pickerCard {
    animation: none;
  }
}

/* Header row: title left, close right, the host header's pads. The close
   button reuses .mrfw-btn/.mrfw-iconBtn and only takes the host close's
   secondary ink. */
.mrfw-pickerHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 22px 14px 12px 24px;
}

.mrfw-pickerHeader .mrfw-iconBtn {
  color: var(--dsw-alias-label-secondary);
}

.mrfw-pickerTitle {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 16px;
  line-height: 24px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
}

/* Breadcrumbs: a wrapping flex line of ghost capsule buttons
   (.mrfw-btn .mrfw-btnGhost .mrfw-pickerCrumb) tightened to 24px; the current
   crumb carries aria-current and steps down to the secondary ink. The
   separator is a dimmed chevron glyph. */
.mrfw-pickerCrumbs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding: 0 24px 8px;
}

.mrfw-pickerCrumb {
  height: 24px;
  padding: 0 6px;
  border-radius: 999px;
}

.mrfw-pickerCrumb[aria-current] {
  color: var(--dsw-alias-label-secondary);
}

.mrfw-pickerCrumbSeparator {
  flex: none;
  color: var(--dsw-alias-label-dimmed);
}

/* The one-level listing: a fixed growth band with its own scroll; the empty
   layer speaks through .mrfw-note. */
.mrfw-pickerList {
  flex: 1 1 auto;
  min-height: 160px;
  max-height: 320px;
  overflow-y: auto;
  padding: 4px 0;
}

/* One subfolder row: a full-width transparent button with the file-entry
   recipe (inherited font, left-aligned) and the shared hover wash. */
.mrfw-pickerRow {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 16px;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 14px;
  line-height: 20px;
  text-align: left;
  cursor: pointer;
}

.mrfw-pickerRow:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

.mrfw-pickerRow:focus-visible {
  outline: 1px solid var(--dsw-alias-brand-primary);
}

/* Footer: the current path in the code font's tertiary voice, plus the
   confirm/close actions as reused capsules. */
.mrfw-pickerFooter {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-top: 0.5px solid var(--dsw-alias-border-l2);
}

.mrfw-pickerPath {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--ds-font-family-code);
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
}

/* The inline new-folder row: a wrapping flex line around a reused .mrfw-input
   and capsule buttons. */
.mrfw-pickerCreate {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 0 16px 8px;
}
`;
		//#endregion
		//#region src/compat/client-icons.ts
		/**
		* The installed icon module, addressed by export name.
		*
		* Named imports cannot spell both releases: each name is absent from the
		* other release's declaration, so the compiler is told once, here.
		*/
		const installed = _deepseek_ai_dsh_client_ui_primitives;
		/**
		* Pick the first export name this release actually provides.
		* @param module - the icon module to read.
		* @param names - candidate export names, preferred first.
		* @returns the component.
		* @throws {Error} when none of the names is exported. That is a compatibility
		*   break to adapt here, not a missing optional peer.
		*/
		function selectIcon(module, names) {
			for (const name of names) {
				const found = module[name];
				if (found !== void 0) return found;
			}
			throw new Error(`multi-root workspace: @deepseek-ai/dsh-client-ui-primitives exports none of ${names.join(", ")}; the workspace-folders panel cannot render its icons. Adapt src/compat/client-icons.ts to the installed release.`);
		}
		/** Resolved once, against the installed module. */
		function icon(pixelName, regularName) {
			return selectIcon(installed, [pixelName, regularName]);
		}
		const IconChevronDown = icon("IconChevronDownOutline14", "IconChevronDownOutlineRegular");
		const IconChevronRight = icon("IconChevronRightOutline14", "IconChevronRightOutlineRegular");
		const IconChevronUp = icon("IconChevronUpOutline14", "IconChevronUpOutlineRegular");
		const IconClose = icon("IconCloseOutline16", "IconCloseOutlineRegular");
		const IconCopy = icon("IconCopyOutline16", "IconCopyOutlineRegular");
		const IconEdit = icon("IconEditOutline16", "IconEditOutlineRegular");
		const IconEllipsis = icon("IconEllipsisOutline16", "IconEllipsisOutlineRegular");
		const IconFolderClose = icon("IconFolderClose16", "IconFolderCloseRegular");
		const IconFolderOpen = icon("IconFolderOpenOutline16", "IconFolderOpenOutlineRegular");
		const IconPlus = icon("IconPlusOutline16", "IconPlusOutlineRegular");
		const IconTrash = icon("IconTrashOutline16", "IconTrashOutlineRegular");
		//#endregion
		//#region src/client/RootFileTree.tsx
		/** Lazy additional-root tree and bounded text previews; requests carry a session and exact root. */
		function RootFileTree(props) {
			const [open, setOpen] = (0, react.useState)(false);
			const [generation, setGeneration] = (0, react.useState)(0);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "mrfw-fileTree",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					className: "mrfw-btn mrfw-btnGhost",
					type: "button",
					"aria-expanded": open,
					onClick: () => {
						setOpen((value) => !value);
					},
					children: props.t("files.browse")
				}), open && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					className: "mrfw-btn mrfw-btnGhost",
					type: "button",
					onClick: () => {
						setGeneration((value) => value + 1);
					},
					children: props.t("files.reload")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Directory, {
					...props,
					path: "."
				}, generation)] })]
			});
		}
		function Directory(props) {
			const [listing, setListing] = (0, react.useState)();
			const [error, setError] = (0, react.useState)();
			(0, react.useEffect)(() => {
				let active = true;
				setListing(void 0);
				setError(void 0);
				const session = props.sessionId();
				if (session === void 0) {
					setError(props.t("panel.noSession"));
					return;
				}
				props.panel.call("files", {
					sessionId: session,
					entry: props.entry,
					path: props.path
				}).then((value) => {
					if (active && props.sessionId() === session) setListing(value);
				}, (failure) => {
					if (active) setError(failure instanceof Error ? failure.message : String(failure));
				});
				return () => {
					active = false;
				};
			}, [
				props.panel,
				props.entry,
				props.path,
				props.sessionId,
				props.t
			]);
			if (error !== void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "mrfw-alert",
				role: "alert",
				children: error
			});
			if (listing === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "mrfw-note",
				children: props.t("panel.loading")
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("ul", {
				className: "mrfw-fileLevel",
				children: [
					listing.entries.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", {
						className: "mrfw-note",
						children: props.t("files.empty")
					}),
					[...listing.entries].sort((a, b) => Number(b.type === "directory") - Number(a.type === "directory") || a.name.localeCompare(b.name, void 0, { numeric: true })).map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FileEntry, {
						...props,
						path: props.path === "." ? entry.name : `${props.path}/${entry.name}`,
						name: entry.name,
						kind: entry.type
					}, entry.name)),
					listing.truncated && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", {
						className: "mrfw-note",
						children: props.t("files.truncated")
					})
				]
			});
		}
		function FileEntry(props) {
			const [open, setOpen] = (0, react.useState)(false);
			const [preview, setPreview] = (0, react.useState)();
			const [error, setError] = (0, react.useState)();
			const epoch = (0, react.useRef)(0);
			(0, react.useEffect)(() => () => {
				epoch.current += 1;
			}, []);
			const toggle = async () => {
				setOpen(!open);
				const current = ++epoch.current;
				if (open || props.kind !== "file") return;
				setPreview(void 0);
				setError(void 0);
				const session = props.sessionId();
				if (session === void 0) {
					setError(props.t("panel.noSession"));
					return;
				}
				try {
					const value = await props.panel.call("readFile", {
						sessionId: session,
						entry: props.entry,
						path: props.path
					});
					if (current === epoch.current && props.sessionId() === session) setPreview(value);
				} catch (failure) {
					if (current === epoch.current) setError(failure instanceof Error ? failure.message : String(failure));
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				className: "mrfw-fileEntry",
				type: "button",
				disabled: props.kind === "other",
				"aria-expanded": open,
				onClick: () => {
					toggle();
				},
				children: [props.kind === "directory" ? open ? "▾ " : "▸ " : "", props.name]
			}), open && (props.kind === "directory" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Directory, { ...props }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: error !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				role: "alert",
				className: "mrfw-alert",
				children: error
			}) : preview === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "mrfw-note",
				children: props.t("panel.loading")
			}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
				className: "mrfw-filePreview",
				children: preview.text
			}), !preview.eof && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "mrfw-note",
				children: props.t("files.previewTruncated")
			})] }) }))] });
		}
		//#endregion
		//#region src/client/DirectoryPickerDialog.tsx
		/**
		* 「工作区文件夹」分节的应用内单栏目录拾取对话框（client 半）。
		*
		* D-03：模态自绘（遮罩 / 卡片 / Escape / Tab 焦点环 / 焦点归还），不用
		* ui-primitives 的 `Modal`——测试替身不承载其焦点语义，且分节内的拾取浮层
		* 与 holder 的对话框壳不重叠（ADR-0013 删掉的是分节壳，不是任何浮层）；视觉
		* 逐值复刻宿主 Modal.module.css 配方，token 全部来自 `styles.ts` 的
		* `.mrfw-picker*` 族（ADR-0006：无字面色）。D-10：portal 到 `document.body`，
		* 避开宿主侧栏抽屉的 transform 动画对 fixed 定位的退化。
		*
		* 行为契约（code-design §3.3）：
		*
		* 1. `open` 翻 true：重置全部瞬态；有 `initialListing` 直接 ready，否则零参
		*    `list()`（Host home）；记录 opener 并把焦点移到卡片根。`browser` /
		*    `initialListing` 在打开瞬间快照，打开后属性变化不重扫、不换端口。
		* 2. 导航（点行 / 点面包屑）：`scanEpoch` 递增并 abort 上一次请求；过期响应
		*    与 abort 响应都丢弃。
		* 3. 隐藏项默认过滤（`entry.hidden`），开关（`aria-pressed`）只改渲染。
		* 4. `truncated` 时显示 `picker.truncated`。
		* 5. 新建对当前层 `listing.path` 发起；成功收起新建行并导航进入创建出的目录
		*    （D-04：导航进入是防误采纳父目录的最小代价）；失败原地显示码对应文案。
		* 6. 采纳：`await onConfirm(listing.path)`；返回字符串 = 本地化失败句，原地
		*    显示、保持打开；返回 `undefined` = 成功，关闭。
		* 7. 关闭路径（Esc / 取消 / 遮罩）一律不采纳，且归还 opener 焦点后再通知父
		*    组件（焦点归还发生在父组件可能触发的卸载之前）。
		* 8. Tab / Shift+Tab 在卡片内可聚焦元素间环绕；`role="dialog"` +
		*    `aria-modal="true"` + `aria-labelledby` 指向标题。
		* 9. 父组件卸载即 abort 当前扫描。
		*
		* 对话框不负责：`add` 请求、错误码 → 文案（浏览错误除外）、能力判定、记住
		* 上次目录（每次打开都从 Host home 开始）。
		*
		* @module dsh-plugin-multi-root-workspace/client/DirectoryPickerDialog
		*/
		/** 新建行的收起态（导航/重置共用同一常量，保持引用稳定）。 */
		const CREATE_CLOSED = {
			open: false,
			name: "",
			busy: false,
			error: void 0
		};
		/** 标题元素 id：同一时刻至多一个对话框实例（portal 到 body），常量即可。 */
		const TITLE_ID = "mrfw-directory-picker-title";
		/** 卡片内可聚焦元素的查询选择器（Tab 焦点环用）。 */
		const FOCUSABLE_SELECTOR = "button, input, select, textarea, a[href], [tabindex]";
		/** 浏览失败码 → 文案键：对话框唯一承担的错误映射（§3.7 的 `picker.error.*`）。 */
		function browseErrorKey(code) {
			switch (code) {
				case "picker-unreadable": return "picker.error.unreadable";
				case "picker-exists": return "picker.error.exists";
				case "picker-create-failed": return "picker.error.create-failed";
				case "picker-failed": return "picker.error.failed";
			}
		}
		/** 任意失败上的本地码：适配器契约承诺 `DirectoryBrowseError`，其余归 `picker-failed`。 */
		function browseCodeOf(error) {
			return error instanceof DirectoryBrowseError ? error.code : "picker-failed";
		}
		/** 任意失败上的 message 原文（进 `ScanState.failed.message` 供诊断，不直接渲染）。 */
		function diagnosticMessageOf(error) {
			return error instanceof Error ? error.message : String(error);
		}
		/**
		* 目录拾取对话框。挂载与否由父组件决定；本组件只按 `open` 决定渲染浮层，
		* 全部 hooks 无条件调用以满足 hooks 规则。
		*/
		function DirectoryPickerDialog(props) {
			const [scan, setScan] = (0, react.useState)({ kind: "loading" });
			const [showHidden, setShowHidden] = (0, react.useState)(false);
			const [create, setCreate] = (0, react.useState)(CREATE_CLOSED);
			const [commitError, setCommitError] = (0, react.useState)(void 0);
			const [confirming, setConfirming] = (0, react.useState)(false);
			const dialogRef = (0, react.useRef)(null);
			const openerRef = (0, react.useRef)(null);
			const scanAbortRef = (0, react.useRef)(null);
			/** 扫描序号：只有最新一次导航的响应才允许写 `scan`（行为契约 2）。 */
			const scanEpochRef = (0, react.useRef)(0);
			/** 采纳序号：close 使在途 `onConfirm` 的续体失效，防关闭后写状态（行为契约 6/7）。 */
			const confirmEpochRef = (0, react.useRef)(0);
			/** 打开瞬间快照的浏览端口（TG2 要点 1：不随属性变化换端口）。 */
			const browserRef = (0, react.useRef)(void 0);
			/**
			* 导航到一层：`scanEpoch` 递增、abort 上一次、`list(path)`；`path` 缺席 =
			* 宿主 home（首帧）。过期响应（序号落后）与 abort 响应（`signal.aborted`）
			* 都丢弃——前者防旧覆盖新，后者防「已取消的扫描报错误」。
			*
			* 导航**不清空旧层**（stale-while-revalidate）：`loading` 只属于首帧占位，
			* 旧层渲染保留到新响应或失败覆盖为止。这让「快速连点」真实可用——挂起期间
			* 上一层的行仍可点（React 18 的 discrete 事件在两次点击之间同步 flush，
			* 清空会让第二次点击落空）；旧内容短暂滞留是单栏拾取可接受的代价。
			*/
			const navigate = (path) => {
				const epoch = ++scanEpochRef.current;
				scanAbortRef.current?.abort();
				const controller = new AbortController();
				scanAbortRef.current = controller;
				const browser = browserRef.current;
				if (browser === void 0) {
					setScan({
						kind: "failed",
						code: "picker-failed",
						message: ""
					});
					return;
				}
				browser.list(path, controller.signal).then((listing) => {
					if (epoch === scanEpochRef.current) setScan({
						kind: "ready",
						listing
					});
				}, (error) => {
					if (epoch !== scanEpochRef.current || controller.signal.aborted) return;
					setScan({
						kind: "failed",
						code: browseCodeOf(error),
						message: diagnosticMessageOf(error)
					});
				});
			};
			/**
			* 关闭：使在途采纳失效、归还 opener 焦点（同步，发生在父组件可能触发的
			* 卸载之前——行为契约 7），再通知父组件。
			*/
			const close = () => {
				confirmEpochRef.current += 1;
				const opener = openerRef.current;
				openerRef.current = null;
				opener?.focus();
				props.onClose();
			};
			/** 采纳当前层（行为契约 6）。失败句原地显示并恢复按钮；成功即关闭。 */
			const confirm = async () => {
				if (confirming || scan.kind !== "ready") return;
				const path = scan.listing.path;
				setCommitError(void 0);
				setConfirming(true);
				const epoch = confirmEpochRef.current;
				try {
					const failure = await props.onConfirm(path);
					if (epoch !== confirmEpochRef.current) return;
					if (failure === void 0) {
						close();
						return;
					}
					setCommitError(failure);
					setConfirming(false);
				} catch {
					if (epoch !== confirmEpochRef.current) return;
					setCommitError(props.t("error.fallback"));
					setConfirming(false);
				}
			};
			/** 新建对当前层发起（行为契约 5）：成功导航进入创建出的目录，失败原地显示。 */
			const submitCreate = async () => {
				const browser = browserRef.current;
				if (create.busy || scan.kind !== "ready" || browser === void 0) return;
				const name = create.name;
				if (name.trim() === "") return;
				setCreate({
					open: true,
					name,
					busy: true,
					error: void 0
				});
				try {
					const created = await browser.create(scan.listing.path, name);
					setCreate(CREATE_CLOSED);
					navigate(created);
				} catch (error) {
					setCreate({
						open: true,
						name,
						busy: false,
						error: props.t(browseErrorKey(browseCodeOf(error)))
					});
				}
			};
			/**
			* `open` 的翻转副作用（TG2 要点 1）：只依赖 `open`，`browser` /
			* `initialListing` 在打开瞬间快照，打开后的属性变化不触发重扫。
			*/
			(0, react.useEffect)(() => {
				if (!props.open) return;
				browserRef.current = props.browser;
				setShowHidden(false);
				setCreate(CREATE_CLOSED);
				setCommitError(void 0);
				setConfirming(false);
				confirmEpochRef.current += 1;
				openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
				const initial = props.initialListing;
				if (initial !== void 0) setScan({
					kind: "ready",
					listing: initial
				});
				else navigate(void 0);
				dialogRef.current?.focus();
			}, [props.open]);
			/** 父组件卸载即 abort 当前扫描（行为契约 9）。 */
			(0, react.useEffect)(() => () => {
				scanAbortRef.current?.abort();
			}, []);
			/** Esc 只关本浮层（阻断冒泡，防宿主把同一按键解释成「关闭整页」）；Tab 环绕。 */
			const onKeyDown = (event) => {
				if (event.key === "Escape") {
					event.stopPropagation();
					close();
					return;
				}
				if (event.key !== "Tab") return;
				const card = dialogRef.current;
				if (card === null) return;
				const focusables = Array.from(card.querySelectorAll(FOCUSABLE_SELECTOR)).filter((element) => !element.hasAttribute("disabled") && element.tabIndex >= 0);
				const first = focusables[0];
				const last = focusables[focusables.length - 1];
				if (first === void 0 || last === void 0) return;
				const active = document.activeElement;
				if (event.shiftKey && (active === first || active === card)) {
					event.preventDefault();
					last.focus();
					return;
				}
				if (!event.shiftKey && active === last) {
					event.preventDefault();
					first.focus();
				}
			};
			if (!props.open) return null;
			const listing = scan.kind === "ready" ? scan.listing : void 0;
			const visibleEntries = listing === void 0 ? [] : listing.entries.filter((entry) => showHidden || !entry.hidden);
			const lastCrumbIndex = listing === void 0 ? -1 : listing.crumbs.length - 1;
			return (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "mrfw-pickerOverlay",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "mrfw-pickerMask",
					"aria-hidden": "true",
					onClick: close
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					ref: dialogRef,
					className: "mrfw-pickerCard",
					role: "dialog",
					"aria-modal": "true",
					"aria-labelledby": TITLE_ID,
					tabIndex: -1,
					onKeyDown,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
							className: "mrfw-pickerHeader",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
								id: TITLE_ID,
								className: "mrfw-pickerTitle",
								children: props.t("picker.title")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "mrfw-btn mrfw-iconBtn",
								title: props.t("picker.close"),
								"aria-label": props.t("picker.close"),
								disabled: confirming,
								onClick: close,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconClose, {})
							})]
						}),
						listing === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("nav", {
							className: "mrfw-pickerCrumbs",
							"aria-label": props.t("picker.crumbs"),
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "mrfw-btn mrfw-btnGhost mrfw-pickerCrumb",
									onClick: () => {
										navigate(listing.home);
									},
									children: props.t("picker.home")
								}),
								listing.crumbs.map((crumb, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "mrfw-pickerCrumbSeparator",
									"aria-hidden": "true",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconChevronRight, {})
								}), index === lastCrumbIndex ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "mrfw-btn mrfw-btnGhost mrfw-pickerCrumb",
									"aria-current": "page",
									onClick: () => {
										navigate(crumb.path);
									},
									children: crumb.name
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "mrfw-btn mrfw-btnGhost mrfw-pickerCrumb",
									onClick: () => {
										navigate(crumb.path);
									},
									children: crumb.name
								})] }, crumb.path)),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "mrfw-btn mrfw-btnGhost mrfw-pickerCrumb",
									"aria-pressed": showHidden,
									onClick: () => {
										setShowHidden((value) => !value);
									},
									children: props.t("picker.showHidden")
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("ul", {
							className: "mrfw-pickerList",
							children: [
								scan.kind === "loading" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", {
									className: "mrfw-note",
									children: props.t("panel.loading")
								}) : null,
								scan.kind === "failed" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", {
									role: "alert",
									className: "mrfw-alert",
									children: props.t(browseErrorKey(scan.code))
								}) : null,
								scan.kind === "ready" && visibleEntries.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", {
									className: "mrfw-note",
									children: props.t("picker.empty")
								}) : null,
								scan.kind === "ready" ? visibleEntries.map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: "mrfw-pickerRow",
									onClick: () => {
										navigate(entry.path);
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										"aria-hidden": "true",
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconFolderClose, {})
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: entry.name })]
								}) }, entry.path)) : null,
								scan.kind === "ready" && listing?.truncated === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", {
									className: "mrfw-note",
									children: props.t("picker.truncated")
								}) : null
							]
						}),
						scan.kind === "ready" && create.open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "mrfw-pickerCreate",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									autoFocus: true,
									className: "mrfw-input mrfw-inputInline",
									value: create.name,
									placeholder: props.t("picker.createName"),
									onChange: (event) => {
										setCreate((current) => ({
											...current,
											name: event.target.value
										}));
									},
									onKeyDown: (event) => {
										if (event.key === "Enter") submitCreate();
									}
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "mrfw-btn mrfw-btnPrimary",
									disabled: create.busy || create.name.trim() === "",
									onClick: () => {
										submitCreate();
									},
									children: props.t("picker.createConfirm")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "mrfw-btn mrfw-btnGhost",
									disabled: create.busy,
									onClick: () => {
										setCreate(CREATE_CLOSED);
									},
									children: props.t("picker.cancel")
								})
							]
						}) : null,
						scan.kind === "ready" && !create.open ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "mrfw-pickerCreate",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "mrfw-btn mrfw-btnGhost",
								onClick: () => {
									setCreate({
										open: true,
										name: "",
										busy: false,
										error: void 0
									});
								},
								children: props.t("picker.create")
							})
						}) : null,
						create.error === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							role: "alert",
							className: "mrfw-alert",
							children: create.error
						}),
						commitError === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							role: "alert",
							className: "mrfw-alert",
							children: commitError
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("footer", {
							className: "mrfw-pickerFooter",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "mrfw-pickerPath",
									"aria-label": props.t("picker.current"),
									children: listing?.path ?? ""
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "mrfw-btn mrfw-btnGhost",
									onClick: close,
									children: props.t("picker.cancel")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "mrfw-btn mrfw-btnPrimary",
									disabled: confirming || scan.kind !== "ready",
									onClick: () => {
										confirm();
									},
									children: props.t("picker.confirm")
								})
							]
						})
					]
				})]
			}), document.body);
		}
		//#endregion
		//#region src/client/WorkspaceFoldersAction.tsx
		/**
		* The Workspace Folders panel body: this session's primary workspace root and
		* the additional roots registered for it, with the actions the milestone
		* requires — Add (through the composed directory picker), Remove, Alias, Copy
		* Path, Reveal, reordering, and the additional-root file tree.
		*
		* Since the unified workspace-config entry landed, the panel is a **section**
		* (`workspace-config.section`) rather than a dialog (ADR-0013): the
		* workspace-config holder owns the modal shell — mask, card, header, Escape,
		* the focus trap and the dismissal action — and declares the seat from its
		* `shell.overlay` registration. This module therefore renders only the body:
		* `WorkspaceFoldersSection` has no overlay, no `role="dialog"`, no Escape/Tab
		* handling and no dismissal button. The one modal it does own is the
		* application-side directory picker (`DirectoryPickerDialog`): a browse-capable
		* deployment opens it through the pick state machine below, and it portals
		* itself to `document.body`, so the "no dialog shell" statement is about this
		* section's own chrome, not about overlays it raises on demand.
		*
		* The root list renders in two groups split client-side by
		* `root.source === 'common'` (D-05): registrations first (`panel.additional`),
		* configured common roots after (`panel.common`, a read-only surface whose
		* rows keep their disabled action set and badge). The add actions render at
		* the end of the additional group (D-06) — they can only add registrations,
		* so they must not read as actions on the common group that follows.
		*
		* The seat's owner share is the page-level workspace context (three states,
		* {@link WorkspaceConfigWorkspaceContext}) and the page re-mounts the section
		* whenever the selection changes, so this module never subscribes to it.
		* `{kind:'workspace'}` passes the gate and the original body renders;
		* `unassigned` / `none` render the `panel.noWorkspace` empty state and mount
		* no request-issuing body at all (the page has no valid target). An absent
		* share is the Files-tab form below and renders the original body unchanged —
		* addressing stays session-derived either way, which is out of scope here.
		*
		* `WorkspaceFoldersLauncher` is the legacy Files-tab entry: on surfaces that
		* still offer `sidebar.right.tab.files.actions` it expands the same body
		* inline, keeping the panel reachable without the holder installed.
		*
		* Styling is the host's, not this file's: the elements carry `mrfw-*` classes
		* resolved by the stylesheet the client entry injects (`styles.ts`), and every
		* color in that sheet is a host `--dsw-*` token, so the panel inherits the
		* native look — capsule buttons, native typography — in both themes without
		* naming a single color here (see ADR-0006).
		*
		* @module dsh-plugin-multi-root-workspace/client/WorkspaceFoldersAction
		*/
		const VARIANT_CLASS = {
			ghost: "mrfw-btnGhost",
			outline: "mrfw-btnOutline",
			primary: "mrfw-btnPrimary",
			danger: "mrfw-btnDanger"
		};
		/** One small capsule button matching the panel's own styling. */
		function Action(props) {
			const variant = props.variant ?? "ghost";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: `mrfw-btn ${VARIANT_CLASS[variant]}`,
				onClick: props.onClick,
				disabled: props.disabled === true,
				children: props.children
			});
		}
		/**
		* One icon-only button (a host "iconButton"): a fixed square of the capsule
		* family whose meaning travels in `title`/`aria-label` instead of text.
		*/
		function IconButton(props) {
			const variant = props.variant ?? "ghost";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: `mrfw-btn mrfw-iconBtn ${VARIANT_CLASS[variant]}`,
				title: props.label,
				"aria-label": props.label,
				onClick: props.onClick,
				disabled: props.disabled === true,
				children: props.icon
			});
		}
		/** The locale key for one reported root state. */
		function stateKey(state) {
			switch (state) {
				case "available": return "state.available";
				case "missing": return "state.missing";
				case "redirected": return "state.redirected";
				case "invalid": return "state.invalid";
			}
		}
		/** The final segment of an absolute path, on either platform separator. */
		function basename(path) {
			const segments = path.split(/[\\/]/).filter((segment) => segment !== "");
			return segments[segments.length - 1] ?? path;
		}
		/**
		* The primary text of one row: the stored alias when set, otherwise the
		* directory's own name — the display the registration was added with.
		*/
		function displayNameOf(root) {
			return root.alias ?? basename(root.path);
		}
		/**
		* One failure rendered as a full sentence (§3.5): the localized copy for the
		* code, plus the raw host prose only for the two diagnostic codes — the
		* transport failure and the host's own internal error are the only places
		* where the message carries facts the copy cannot name. The section alert and
		* the picker dialog's `onConfirm` failure share this one renderer, so a
		* failure reads identically no matter which surface reported it.
		*/
		function sentenceOf(error, t) {
			const base = t(errorKeyOf(error.code));
			return error.code === "unavailable" || error.code === "panel/internal" ? `${base} (${error.message})` : base;
		}
		/**
		* The legacy Files-tab entry: a compact capsule that expands the same panel
		* body in place.
		*
		* The Files tab offers no modal shell of its own, and importing the holder's
		* open bridge is exactly the runtime coupling D3 forbids — so the entry owns a
		* local expansion state and renders the section inline. With the holder
		* installed the page is the primary surface; this entry only keeps the
		* older `sidebar.right.tab.files.actions` surface usable on its own.
		*
		* It deliberately passes no owner share: there is no page and no selection in
		* the tab, which is exactly the "absent share" form of the body (the original
		* body, unchanged).
		*/
		function WorkspaceFoldersLauncher(props) {
			const [expanded, setExpanded] = (0, react.useState)(false);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "mrfw-fileLauncher",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: "mrfw-btn mrfw-btnGhost",
					title: props.t("action.title"),
					"aria-label": props.t("action.label"),
					"aria-expanded": expanded,
					onClick: () => {
						setExpanded((value) => !value);
					},
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						"aria-hidden": "true",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconFolderClose, { size: 16 })
					})
				}), expanded ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WorkspaceFoldersSection, { ...props }) : null]
			});
		}
		function entryOf(root) {
			return {
				ordinal: root.ordinal,
				id: root.id,
				path: root.path,
				addedAt: root.addedAt
			};
		}
		function rowKey(root) {
			return `${root.ordinal}\u0000${root.id}\u0000${root.path}\u0000${root.addedAt}`;
		}
		/**
		* The section entry: the page's selection decides whether a body is mounted
		* at all.
		*
		* `{kind:'workspace'}` — and an absent share, which is the Files-tab launcher
		* form — fall through to `WorkspaceFoldersBody`. `unassigned` / `none` render
		* the `panel.noWorkspace` empty state instead: the page has no valid target,
		* so the body and every request it would issue stay unmounted. This gate holds
		* no state of its own, which is what lets the body below call hooks
		* unconditionally — the body is a separate component, mounted only when the
		* gate passes (the same split the other contributors use).
		*/
		function WorkspaceFoldersSection(props) {
			const { workspace, t } = props;
			if (workspace !== void 0 && workspace.kind !== "workspace") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("section", {
				className: "mrfw-body mrfw-sectionBody",
				"aria-label": t("panel.title"),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "mrfw-note",
					children: t("panel.noWorkspace")
				})
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WorkspaceFoldersBody, { ...props });
		}
		/**
		* The panel body: reads the view once per mount, then after every mutation.
		* Mounted only through `WorkspaceFoldersSection`, so it always has a target.
		*
		* Two shapes travel back over the channel, and they are handled separately on
		* purpose: every mutating endpoint answers with the whole refreshed view, while
		* `reveal` answers with the path it revealed and leaves the list untouched
		* (see `contract.ts`). Treating a reveal answer as a roots view is exactly the
		* contract mismatch this split removes.
		*
		* The body's addressing is the current session, not the page's selection: the
		* share only gates rendering here, and re-addressing the endpoints by workspace
		* is a business change outside this one's scope.
		*/
		function WorkspaceFoldersBody(props) {
			const { panel, t } = props;
			const [state, setState] = (0, react.useState)({
				view: void 0,
				error: void 0,
				busy: false,
				noSession: false
			});
			const [manualPath, setManualPath] = (0, react.useState)("");
			const [aliasFor, setAliasFor] = (0, react.useState)(void 0);
			const [aliasDraft, setAliasDraft] = (0, react.useState)("");
			const [copiedId, setCopiedId] = (0, react.useState)(void 0);
			const [menuFor, setMenuFor] = (0, react.useState)(void 0);
			const [picker, setPicker] = (0, react.useState)({ kind: "closed" });
			const [picking, setPicking] = (0, react.useState)(false);
			const requestEpoch = (0, react.useRef)(0);
			const mounted = (0, react.useRef)(true);
			(0, react.useEffect)(() => () => {
				mounted.current = false;
				requestEpoch.current += 1;
			}, []);
			const requestBase = (0, react.useCallback)(() => {
				const current = props.sessionId?.();
				return current === void 0 || current === "" ? void 0 : { sessionId: current };
			}, [props.sessionId]);
			const refresh = (0, react.useCallback)(async () => {
				if (panel === void 0) {
					setState({
						view: void 0,
						error: new PanelError("unavailable", "no connection"),
						busy: false,
						noSession: false
					});
					return;
				}
				const base = requestBase();
				if (base === void 0) {
					setState({
						view: void 0,
						error: void 0,
						busy: false,
						noSession: true
					});
					return;
				}
				const epoch = ++requestEpoch.current;
				setState((previous) => ({
					...previous,
					busy: true,
					noSession: false
				}));
				try {
					const view = await panel.call("list", base);
					if (!mounted.current || epoch !== requestEpoch.current) return;
					setState({
						view,
						error: void 0,
						busy: false,
						noSession: false
					});
				} catch (error) {
					if (!mounted.current || epoch !== requestEpoch.current) return;
					setState({
						view: void 0,
						error: asPanelError(error),
						busy: false,
						noSession: false
					});
				}
			}, [panel, requestBase]);
			(0, react.useEffect)(() => {
				refresh();
			}, [refresh]);
			/**
			* Submit one change to the host and adopt the view it answers with.
			* @returns `undefined` on success; the renderable failure otherwise (the
			*   caller decides whether to clear the input it came from, and the picker
			*   dialog turns it into a sentence shown in place).
			*/
			const mutate = (0, react.useCallback)(async (endpoint, payload) => {
				if (panel === void 0) {
					const failure = new PanelError("unavailable", "no connection");
					setState((previous) => ({
						...previous,
						error: failure,
						busy: false,
						noSession: false
					}));
					return failure;
				}
				const base = requestBase();
				if (base === void 0) {
					setState({
						view: void 0,
						error: void 0,
						busy: false,
						noSession: true
					});
					return;
				}
				const epoch = ++requestEpoch.current;
				setState((previous) => ({
					...previous,
					busy: true,
					noSession: false
				}));
				try {
					const view = await panel.call(endpoint, {
						...base,
						...payload
					});
					if (!mounted.current || epoch !== requestEpoch.current) return void 0;
					setState({
						view,
						error: void 0,
						busy: false,
						noSession: false
					});
					return;
				} catch (error) {
					const failure = asPanelError(error);
					if (!mounted.current || epoch !== requestEpoch.current) return void 0;
					setState((previous) => ({
						...previous,
						error: failure,
						busy: false
					}));
					return failure;
				}
			}, [panel, requestBase]);
			/**
			* 拾取入口（五态分派 + `picking` 防双击）：点「添加目录」后调拾取端口，按
			* 结局分派——`picked` 走既有 `add`；`browse` 打开自建目录对话框（探测已
			* 取得的 home 层复用为首帧，零次重复 `list`）；`cancelled` 无动作；
			* `unavailable` 记入状态机（`+` 消失、显示手输提示，D-09）；`failed` 把
			* 失败句送进分节 alert。拾取从不回落到手输框：点「添加目录」的操作员要的
			* 是拾取器，不是他可能早已输入的文本。
			*/
			const openPicker = (0, react.useCallback)(async () => {
				if (picking) return;
				setPicking(true);
				let outcome;
				try {
					outcome = await props.pickDirectory();
				} catch (error) {
					setState((previous) => ({
						...previous,
						error: asPanelError(error)
					}));
					return;
				} finally {
					setPicking(false);
				}
				switch (outcome.kind) {
					case "picked": {
						const path = outcome.path;
						if (path.trim() === "") return;
						await mutate("add", { path });
						return;
					}
					case "browse":
						setPicker({
							kind: "open",
							browsing: outcome.browsing,
							...outcome.listing ? { listing: outcome.listing } : {}
						});
						return;
					case "cancelled": return;
					case "unavailable":
						setPicker({ kind: "unavailable" });
						return;
					case "failed":
						setState((previous) => ({
							...previous,
							error: asPanelError(outcome.error)
						}));
						return;
				}
			}, [
				picking,
				props.pickDirectory,
				mutate
			]);
			/**
			* The picker dialog's adopt handler: submit the path as an `add` and let the
			* dialog render the failure in place — a string return keeps the dialog open
			* (the operator may want to pick a different directory), `undefined` closes.
			*/
			const confirmPickedPath = (0, react.useCallback)(async (path) => {
				const failure = await mutate("add", { path });
				return failure === void 0 ? void 0 : sentenceOf(failure, t);
			}, [mutate, t]);
			/**
			* Add the path in the manual field — the one the operator typed. The picker
			* plays no part here: this is the entry point the confirm button and the
			* Enter key use.
			*/
			const addManualPath = (0, react.useCallback)(async () => {
				const path = manualPath.trim();
				if (path === "") return;
				if (await mutate("add", { path }) === void 0) setManualPath("");
			}, [manualPath, mutate]);
			/** Reveal one root: the answer is the revealed path, not a new view. */
			const reveal = (0, react.useCallback)(async (root) => {
				if (panel === void 0) return;
				const base = requestBase();
				if (base === void 0) {
					setState({
						view: void 0,
						error: void 0,
						busy: false,
						noSession: true
					});
					return;
				}
				const epoch = ++requestEpoch.current;
				setState((previous) => ({
					...previous,
					busy: true,
					noSession: false
				}));
				try {
					await panel.call("reveal", {
						...base,
						entry: entryOf(root)
					});
					if (!mounted.current || epoch !== requestEpoch.current) return;
					setState((previous) => ({
						...previous,
						error: void 0,
						busy: false
					}));
				} catch (error) {
					if (!mounted.current || epoch !== requestEpoch.current) return;
					setState((previous) => ({
						...previous,
						error: asPanelError(error),
						busy: false
					}));
				}
			}, [panel, requestBase]);
			/**
			* Copy one absolute path to the clipboard. `key` is the highlight identity
			* of the button that asked — a row's `rowKey`, or `'primary'` for the
			* primary row (D-08) — so the 「已复制」 swap lands on the right button even
			* though two rows could otherwise share a path.
			*/
			const copyPath = (0, react.useCallback)(async (path, key) => {
				try {
					await navigator.clipboard.writeText(path);
					setCopiedId(key);
					setState((previous) => ({
						...previous,
						error: void 0
					}));
					window.setTimeout(() => {
						setCopiedId((current) => current === key ? void 0 : current);
					}, 1500);
				} catch (error) {
					setCopiedId(void 0);
					setState((previous) => ({
						...previous,
						error: new PanelError("copy-failed", error instanceof Error ? error.message : String(error))
					}));
				}
			}, []);
			const move = (0, react.useCallback)(async (root, before) => {
				await mutate("move", before === void 0 ? { entry: entryOf(root) } : {
					entry: entryOf(root),
					beforeEntry: entryOf(before)
				});
			}, [mutate]);
			const view = state.view;
			const roots = view?.roots ?? [];
			const registered = roots.filter((root) => root.source !== "common");
			const commons = roots.filter((root) => root.source === "common");
			/**
			* Render one group's rows: one closure consumes one array, and the move
			* anchors are taken from that array's own neighbours (§3.5 — the one real
			* behavior fix of the group split). A common row keeps its full but disabled
			* action set: the group split is presentational, so its rows still cannot
			* move, rename or remove, and the badge still says why.
			*/
			const renderRows = (rows) => rows.map((root, index) => {
				const key = rowKey(root);
				const isCommon = root.source === "common";
				const canMoveUp = !isCommon && index > 0;
				const canMoveDown = !isCommon && index < rows.length - 1;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "mrfw-row",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "mrfw-rootText",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "mrfw-rootName",
								children: displayNameOf(root)
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "mrfw-rootPath",
								children: root.path
							})]
						}),
						isCommon ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							title: t("root.sourceCommonTitle"),
							className: "mrfw-sourceBadge",
							children: t("root.sourceCommon")
						}) : null,
						root.state === "available" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							title: root.detail,
							className: "mrfw-stateWarn",
							children: t(stateKey(root.state))
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconButton, {
							onClick: () => {
								copyPath(root.path, key);
							},
							icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconCopy, {}),
							label: copiedId === key ? t("panel.copied") : t("panel.copyPath")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconButton, {
							disabled: state.busy,
							onClick: () => {
								reveal(root);
							},
							icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconFolderOpen, {}),
							label: t("panel.reveal")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconButton, {
							disabled: state.busy || !canMoveUp,
							onClick: () => {
								move(root, rows[index - 1]);
							},
							icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconChevronUp, {}),
							label: t("panel.moveUp")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconButton, {
							disabled: state.busy || !canMoveDown,
							onClick: () => {
								move(root, rows[index + 2]);
							},
							icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconChevronDown, {}),
							label: t("panel.moveDown")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
							open: menuFor === key,
							onClose: () => {
								setMenuFor(void 0);
							},
							closeOnPointerLeave: true,
							items: [{
								id: "rename",
								label: t("panel.rename"),
								icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconEdit, {}),
								disabled: state.busy || isCommon
							}, {
								id: "remove",
								label: t("panel.remove"),
								icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconTrash, {}),
								danger: true,
								disabled: state.busy || isCommon
							}],
							onSelect: (id) => {
								setMenuFor(void 0);
								if (id === "rename") {
									setAliasFor(key);
									setAliasDraft(root.alias ?? "");
								}
								if (id === "remove") mutate("remove", { entry: entryOf(root) });
							},
							portal: true,
							align: "end",
							anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconButton, {
								disabled: state.busy,
								onClick: () => {
									setMenuFor((current) => current === key ? void 0 : key);
								},
								icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconEllipsis, {}),
								label: t("panel.more")
							})
						}),
						aliasFor === key ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "mrfw-aliasEditor",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									autoFocus: true,
									className: "mrfw-input mrfw-inputInline",
									value: aliasDraft,
									placeholder: t("panel.aliasPlaceholder"),
									onChange: (event) => {
										setAliasDraft(event.target.value);
									}
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Action, {
									disabled: state.busy,
									onClick: () => {
										mutate("alias", {
											entry: entryOf(root),
											alias: aliasDraft
										});
										setAliasFor(void 0);
									},
									children: t("panel.aliasSave")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Action, {
									onClick: () => {
										setAliasFor(void 0);
									},
									children: t("panel.aliasCancel")
								})
							]
						}) : null,
						root.state === "available" && panel !== void 0 && props.sessionId !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RootFileTree, {
							panel,
							entry: entryOf(root),
							sessionId: props.sessionId,
							t
						})
					]
				}, key);
			});
			/** 动作行（D-06）：拾取按钮、手输、重试与能力提示，归入附属组末尾。 */
			const renderActions = () => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "mrfw-actions",
				children: [
					picker.kind !== "unavailable" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Action, {
						variant: "primary",
						disabled: state.busy || picking,
						onClick: () => {
							openPicker();
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							"aria-hidden": "true",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconPlus, {})
						}), t("panel.add")]
					}) : null,
					picker.kind === "unavailable" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "mrfw-note",
						children: t("picker.unavailable")
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						className: "mrfw-input",
						value: manualPath,
						placeholder: t("panel.addManual"),
						onChange: (event) => {
							setManualPath(event.target.value);
						},
						onKeyDown: (event) => {
							if (event.key === "Enter") addManualPath();
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Action, {
						onClick: () => {
							addManualPath();
						},
						disabled: state.busy || manualPath.trim() === "",
						variant: "outline",
						children: t("panel.addConfirm")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Action, {
						onClick: () => {
							refresh();
						},
						disabled: state.busy,
						variant: "outline",
						children: t("panel.retry")
					})
				]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "mrfw-body mrfw-sectionBody",
				"aria-label": t("panel.title"),
				children: [state.noSession ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "mrfw-note",
					children: t("panel.noSession")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "mrfw-actions",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Action, {
						onClick: () => {
							refresh();
						},
						disabled: state.busy,
						variant: "outline",
						children: t("panel.retry")
					})
				})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "mrfw-description",
						children: t("panel.subtitle")
					}),
					state.error === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						role: "alert",
						className: "mrfw-alert",
						children: sentenceOf(state.error, t)
					}),
					view?.unavailable === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						role: "alert",
						className: "mrfw-alert",
						children: view.unavailable
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "mrfw-section",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "mrfw-sectionTitleRow",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "mrfw-sectionTitle",
								children: t("panel.primary")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "mrfw-sectionNote",
								children: t("panel.primaryNote")
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "mrfw-row mrfw-rowBare",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "mrfw-rootText",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "mrfw-rootName",
									children: view === void 0 ? "…" : view.primaryName ?? basename(view.primaryRoot)
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "mrfw-rootPath",
									children: view?.primaryRoot ?? "…"
								})]
							}), view === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconButton, {
								onClick: () => {
									copyPath(view.primaryRoot, "primary");
								},
								icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconCopy, {}),
								label: copiedId === "primary" ? t("panel.copied") : t("panel.copyPath")
							})]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "mrfw-section",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "mrfw-sectionTitleRow",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "mrfw-sectionTitle",
									children: t("panel.additional")
								})
							}),
							view === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "mrfw-note",
								children: t("panel.loading")
							}) : null,
							view !== void 0 && registered.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
								className: "mrfw-note",
								children: [
									t("panel.empty"),
									" ",
									t("panel.emptyHint")
								]
							}) : null,
							renderRows(registered),
							renderActions()
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "mrfw-section",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "mrfw-sectionTitleRow",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "mrfw-sectionTitle",
									title: t("root.sourceCommonTitle"),
									children: t("panel.common")
								})
							}),
							view === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "mrfw-note",
								children: commons.length === 0 ? t("panel.commonEmpty") : t("panel.commonHint")
							}),
							renderRows(commons)
						]
					})
				] }), picker.kind === "open" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DirectoryPickerDialog, {
					open: true,
					t,
					browser: picker.browsing,
					...picker.listing ? { initialListing: picker.listing } : {},
					onConfirm: confirmPickedPath,
					onClose: () => {
						setPicker({ kind: "closed" });
					}
				}) : null]
			});
		}
		/** Normalize any thrown value into a `PanelError` the panel can render. */
		function asPanelError(error) {
			if (error instanceof PanelError) return error;
			return new PanelError("fallback", error instanceof Error ? error.message : String(error));
		}
		//#endregion
		//#region src/client/index.ts
		/** The cell this plugin owns (an id is unique per seat, so both seats reuse it). */
		const SLOT_ID = "multi-root-folders";
		/**
		* The section's row order in the unified dialog's navigation (D11: 10 / 20 / 30
		* across mrfw / session-tool-toggle / web-ux).
		*/
		const SECTION_ORDER = 10;
		/**
		* The unified dialog's section seat, held locally.
		*
		* The literal is pinned to the holder's `WorkspaceConfigSectionSeat`: writing
		* anything else is a compile error. The holder's runtime constant is
		* deliberately not imported (D3).
		*/
		const SECTION_SEAT = "workspace-config.section";
		/** The id of the `<style>` element carrying this plugin's sheet. */
		const STYLE_ELEMENT_ID = "multi-root-workspace-styles";
		/** Services the client half needs before it may activate. */
		const inject = [
			"slots",
			"locale",
			"connection"
		];
		/**
		* Register the panel.
		* @param ctx - the client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "multi-root-workspace: dictionaries");
			ctx.effect(() => {
				let element = document.getElementById(STYLE_ELEMENT_ID);
				if (element === null) {
					element = document.createElement("style");
					element.id = STYLE_ELEMENT_ID;
					element.textContent = STYLES;
					document.head.append(element);
				}
				return () => {
					element?.remove();
				};
			}, "multi-root-workspace: styles");
			const panel = (() => {
				const connection = ctx.get("connection");
				return connection === void 0 ? void 0 : createPanelClient(connection);
			})();
			const pickDirectory = createDirectoryPicker(() => readService(ctx, "uiWorkspace"));
			const sessionId = () => currentSessionIdOf(readService(ctx, "sessions"));
			const t = ctx.locale.bind(NS);
			ctx.slots.inject(SECTION_SEAT, () => {
				try {
					return ctx.slots.register({
						name: SECTION_SEAT,
						id: SLOT_ID,
						order: SECTION_ORDER,
						label: () => t("section.label"),
						locale: NS,
						inject: () => ({
							panel,
							pickDirectory,
							sessionId
						})
					}, WorkspaceFoldersSection);
				} catch (error) {
					ctx.logger?.warn("multi-root-workspace: 工作区配置分节座位注册失败，本节不显示");
					ctx.logger?.warn(error);
					return () => {};
				}
			});
			ctx.slots.inject("sidebar.right.tab.files.actions", () => ctx.slots.register({
				name: "sidebar.right.tab.files.actions",
				id: SLOT_ID,
				order: 50
			}, () => (0, react.createElement)(WorkspaceFoldersLauncher, {
				panel,
				pickDirectory,
				sessionId,
				t
			})));
		}
		/**
		* Read one optional service by name.
		*
		* Both lookups are deliberately untyped reads: the client Session Controller
		* and the workspace UI service are composed by the surface, not by this
		* plugin, and neither is a dependency it may assume (the panel body exists on
		* surfaces where they do not). Absence is a supported state — the panel then
		* shows "No active session" and does not ask the host to guess a workspace root.
		* @param ctx - the client context.
		* @param name - the service key to read.
		* @returns the service, or `undefined` when this composition has none.
		*/
		function readService(ctx, name) {
			return ctx.get(name);
		}
		//#endregion
		exports.SLOT_ID = SLOT_ID;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map