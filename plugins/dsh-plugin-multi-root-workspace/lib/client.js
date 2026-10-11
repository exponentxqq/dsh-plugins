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
		//#region src/compat/client-session.ts
		/**
		* The session the composed client is showing, when it can name one.
		* @param sessions - the client `sessions` service, or whatever this
		*   composition provided under that name. Absence is a supported state.
		* @returns the session id, or `undefined` when no main view holds one.
		*/
		function currentSessionIdOf(sessions) {
			const snapshot = listSnapshotOf(sessions);
			if (snapshot === void 0) return void 0;
			const current = snapshot.current;
			if (typeof current === "string" && current !== "") return current;
			return mainViewSessionId(snapshot.byId);
		}
		/**
		* The list snapshot, when the service actually exposes one.
		*
		* `getSnapshot` is invoked as a method so a real store can read `this`.
		* Extracting the function and calling it unbound drops that binding and
		* yields `undefined` even when a session is selected.
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
		* The first catalog row retained by the main view.
		*
		* Enumeration order is the catalog's insertion order, which is the order
		* upstream's own main-binding projection scans. A row counts only while
		* `retainedBy.mainView` is a positive number: zero, a missing source, and a
		* non-numeric value are not a selection.
		* @param byId - the catalog map, or anything else the snapshot happened to carry.
		* @returns that row's session id.
		*/
		function mainViewSessionId(byId) {
			if (byId === null || typeof byId !== "object") return void 0;
			for (const [key, row] of Object.entries(byId)) {
				if (!isMainViewRow(row)) continue;
				const id = row.id;
				if (typeof id === "string" && id !== "") return id;
				if (key !== "") return key;
			}
		}
		/** Whether one catalog value is a row the main view currently retains. */
		function isMainViewRow(row) {
			if (row === null || typeof row !== "object") return false;
			const retainedBy = row.retainedBy;
			if (retainedBy === null || typeof retainedBy !== "object") return false;
			const count = retainedBy.mainView;
			return typeof count === "number" && count > 0;
		}
		//#endregion
		//#region ../../node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js
		function getEnumValues(entries) {
			const numericValues = Object.values(entries).filter((v) => typeof v === "number");
			return Object.entries(entries).filter(([k, _]) => numericValues.indexOf(+k) === -1).map(([_, v]) => v);
		}
		function joinValues(array, separator = "|") {
			return array.map((val) => stringifyPrimitive(val)).join(separator);
		}
		function jsonStringifyReplacer(_, value) {
			if (typeof value === "bigint") return value.toString();
			return value;
		}
		var Cached = class {
			constructor(getter) {
				this._getter = getter;
				this._value = void 0;
			}
			get value() {
				const getter = this._getter;
				if (getter !== void 0) {
					this._value = getter();
					this._getter = void 0;
				}
				return this._value;
			}
		};
		function cached(getter) {
			return new Cached(getter);
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
			const tolerance = 4 * Number.EPSILON * Math.max(Math.abs(ratio), 1);
			if (Math.abs(ratio - roundedRatio) < tolerance) return 0;
			return ratio - roundedRatio;
		}
		function assignProp(target, prop, value) {
			Object.defineProperty(target, prop, {
				value,
				writable: true,
				enumerable: true,
				configurable: true
			});
		}
		/**
		* Whichever object a def's `shape` currently answers from: the one the caller passed until the first read, the frozen copy after it.
		*
		* Its keys and descriptors read without invoking anything, which is what lets a discriminated union check its discriminator, and the cycle walk read a shape, without resolving a getter that references the schema being constructed. A def that answers `shape` from an accessor of its own has none.
		*/
		function rawShape(def) {
			const desc = Object.getOwnPropertyDescriptor(def, "shape");
			return desc?.get ? desc.get.raw : desc?.value;
		}
		function sourceShape(schema) {
			return rawShape(schema._zod.def) ?? schema._zod.def.shape;
		}
		function deferProp(target, key, getter) {
			Object.defineProperty(target, key, {
				get() {
					const value = getter();
					assignProp(this, key, value);
					return value;
				},
				enumerable: true,
				configurable: true
			});
		}
		function putProp(target, key, value) {
			if (key in target) assignProp(target, key, value);
			else target[key] = value;
		}
		/**
		* Copies `keys` of `source`'s shape onto `target`, each value passed through `wrap`.
		*
		* A key the source has resolved is copied through now, so the derived shape states it outright and nothing has to resolve it to learn what it holds. A key the source still defers stays deferred, and reads back through the source's own `shape`, so it resolves once and both shapes get that one schema.
		*/
		function mirrorShape(target, source, keys, wrap) {
			const raw = sourceShape(source);
			for (const key of keys) {
				const desc = Object.getOwnPropertyDescriptor(raw, key);
				if (!desc.enumerable) continue;
				if (desc.get) deferProp(target, key, () => {
					const value = source._zod.def.shape[key];
					return wrap ? wrap(value, key) : value;
				});
				else putProp(target, key, wrap ? wrap(desc.value, key) : desc.value);
			}
		}
		function mirrorProps(target, source) {
			for (const key of Reflect.ownKeys(source)) {
				const desc = Object.getOwnPropertyDescriptor(source, key);
				if (!desc.enumerable) continue;
				if (desc.get) deferProp(target, key, () => source[key]);
				else putProp(target, key, desc.value);
			}
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
		function stringifyPrimitive(value) {
			if (typeof value === "bigint") return value.toString() + "n";
			if (typeof value === "string") return `"${value}"`;
			return `${value}`;
		}
		function optionalKeys(shape) {
			return Object.keys(shape).filter((k) => {
				return shape[k]._zod.optin !== void 0 && shape[k]._zod.optout === "optional";
			});
		}
		const NUMBER_FORMAT_RANGES = /*@__PURE__*/ (() => ({
			safeint: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
			int32: [-2147483648, 2147483647],
			uint32: [0, 4294967295],
			float32: [-34028234663852886e22, 34028234663852886e22],
			float64: [-Number.MAX_VALUE, Number.MAX_VALUE]
		}))();
		const BIGINT_FORMAT_RANGES = {
			int64: [/* @__PURE__*/ BigInt("-9223372036854775808"), /* @__PURE__*/ BigInt("9223372036854775807")],
			uint64: [/* @__PURE__*/ BigInt(0), /* @__PURE__*/ BigInt("18446744073709551615")]
		};
		function pick(schema, mask) {
			const currDef = schema._zod.def;
			const checks = currDef.checks;
			if (checks && checks.length > 0) throw new Error(".pick() cannot be used on object schemas containing refinements");
			const newShape = {};
			mirrorShape(newShape, schema, maskedKeys(schema, mask));
			return clone(schema, mergeDefs(currDef, {
				shape: newShape,
				checks: []
			}));
		}
		function maskedKeys(schema, mask) {
			const raw = sourceShape(schema);
			const keys = [];
			for (const key of Reflect.ownKeys(mask)) {
				if (!Object.getOwnPropertyDescriptor(raw, key)?.enumerable) throw new Error(`Unrecognized key: "${String(key)}"`);
				if (mask[key]) keys.push(key);
			}
			return keys;
		}
		function omit(schema, mask) {
			const currDef = schema._zod.def;
			const checks = currDef.checks;
			if (checks && checks.length > 0) throw new Error(".omit() cannot be used on object schemas containing refinements");
			const omitted = new Set(maskedKeys(schema, mask));
			const newShape = {};
			mirrorShape(newShape, schema, Reflect.ownKeys(sourceShape(schema)).filter((key) => !omitted.has(key)));
			return clone(schema, mergeDefs(currDef, {
				shape: newShape,
				checks: []
			}));
		}
		function extend(schema, shape) {
			if (!isPlainObject(shape)) throw new Error("Invalid input to extend: expected a plain object");
			const checks = schema._zod.def.checks;
			if (checks && checks.length > 0) {
				const existingShape = sourceShape(schema);
				for (const key of Reflect.ownKeys(shape)) if (Object.getOwnPropertyDescriptor(existingShape, key) !== void 0) throw new Error("Cannot overwrite keys on object schemas containing refinements. Use `.safeExtend()` instead.");
			}
			return clone(schema, mergeDefs(schema._zod.def, { shape: extended(schema, shape) }));
		}
		function extended(schema, shape) {
			const newShape = {};
			mirrorShape(newShape, schema, Reflect.ownKeys(sourceShape(schema)));
			mirrorProps(newShape, shape);
			return newShape;
		}
		function safeExtend(schema, shape) {
			if (!isPlainObject(shape)) throw new Error("Invalid input to safeExtend: expected a plain object");
			return clone(schema, mergeDefs(schema._zod.def, { shape: extended(schema, shape) }));
		}
		function merge(a, b) {
			if (!b?._zod?.def) throw new Error("Invalid input to merge: expected an object schema. To merge a plain shape, use `.extend()`.");
			if (a._zod.def.checks?.length) throw new Error(".merge() cannot be used on object schemas containing refinements. Use .safeExtend() instead.");
			const newShape = {};
			mirrorShape(newShape, a, Reflect.ownKeys(sourceShape(a)));
			mirrorShape(newShape, b, Reflect.ownKeys(sourceShape(b)));
			return clone(a, mergeDefs(a._zod.def, {
				shape: newShape,
				get catchall() {
					return b._zod.def.catchall;
				},
				checks: b._zod.def.checks ?? []
			}));
		}
		function partial(Class, schema, mask, name = "partial") {
			const checks = schema._zod.def.checks;
			if (checks && checks.length > 0) throw new Error(`.${name}() cannot be used on object schemas containing refinements`);
			const selected = mask ? new Set(maskedKeys(schema, mask)) : void 0;
			const newShape = {};
			mirrorShape(newShape, schema, Reflect.ownKeys(sourceShape(schema)), Class && ((value, key) => selected && !selected.has(key) ? value : new Class({
				type: "optional",
				innerType: value
			})));
			return clone(schema, mergeDefs(schema._zod.def, {
				shape: newShape,
				checks: []
			}));
		}
		function required(Class, schema, mask) {
			const selected = mask ? new Set(maskedKeys(schema, mask)) : void 0;
			const newShape = {};
			mirrorShape(newShape, schema, Reflect.ownKeys(sourceShape(schema)), (value, key) => selected && !selected.has(key) ? value : new Class({
				type: "nonoptional",
				innerType: value
			}));
			return clone(schema, mergeDefs(schema._zod.def, { shape: newShape }));
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
		function attachSchema(issues, start, inst) {
			var _a;
			for (let i = start; i < issues.length; i++) (_a = issues[i]).schema ?? (_a.schema = inst);
		}
		function finalizeIssue(iss, ctx, config) {
			var _a;
			const traits = iss.inst?._zod?.traits;
			if (traits?.has("$ZodType")) {
				if (traits.has("$ZodCheck")) (_a = iss).schema ?? (_a.schema = iss.inst);
				else iss.schema = iss.inst;
			}
			const schemaError = iss.schema !== iss.inst ? iss.schema?._zod.def?.error : void 0;
			const message = iss.message ? iss.message : unwrapMessage(iss.inst?._zod.def?.error?.(iss)) ?? unwrapMessage(schemaError?.(iss)) ?? unwrapMessage(ctx?.error?.(iss)) ?? unwrapMessage(config.customError?.(iss)) ?? unwrapMessage(config.localeError?.(iss)) ?? "Invalid input";
			const full = {};
			for (const k of Object.keys(iss)) {
				if (k === "inst" || k === "schema" || k === "continue" || k === "input" || k === "__proto__") continue;
				full[k] = iss[k];
			}
			full.path ?? (full.path = []);
			full.message = message;
			if (ctx?.reportInput) full.input = iss.input;
			return full;
		}
		const highSurrogate = /[\uD800-\uDBFF]/;
		function codePointLength(str) {
			const units = str.length;
			if (!highSurrogate.test(str)) return units;
			let count = units;
			for (let i = 0; i < units - 1; i++) if ((str.charCodeAt(i) & 64512) === 55296 && (str.charCodeAt(i + 1) & 64512) === 56320) {
				count--;
				i++;
			}
			return count;
		}
		function getLengthableOrigin(input) {
			if (Array.isArray(input)) return "array";
			if (typeof input === "string") return "string";
			return "unknown";
		}
		function parsedType(data) {
			const t = typeof data;
			switch (t) {
				case "number": return Number.isNaN(data) ? "nan" : "number";
				case "object": {
					if (data === null) return "null";
					if (Array.isArray(data)) return "array";
					const obj = data;
					if (obj && Object.getPrototypeOf(obj) !== Object.prototype && "constructor" in obj && obj.constructor) return obj.constructor.name;
				}
			}
			return t;
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
		/**
		* Installs a trait's members on its prototype. Each value builds that member for the instance on first read; the built value shadows the accessor as an own property, so a detached `const { parse } = schema` keeps working.
		*
		* Call this from a `proto` initializer, which runs once per prototype — never per instance.
		*/
		function members(proto, table) {
			for (const key in table) {
				const desc = Object.getOwnPropertyDescriptor(table, key);
				if (desc.get) Object.defineProperty(proto, key, {
					...desc,
					enumerable: false
				});
				else defineBound(proto, key, desc.value);
			}
		}
		/** Shadows a prototype member with an own value, so a getter that builds from the instance runs once. */
		function own(inst, key, value, enumerable = true) {
			Object.defineProperty(inst, key, {
				configurable: true,
				writable: true,
				enumerable,
				value
			});
			return value;
		}
		/** Like {@link own}, for a member that was never an own data property and has to stay out of `Object.keys`. */
		function hide(inst, key, value) {
			return own(inst, key, value, false);
		}
		/** Adds members a table derives from the instance: each builds on first read and shadows as own data, and assignment shadows the same way, as when these were own properties. */
		function derived(computes, table) {
			for (const key in computes) {
				const compute = computes[key];
				Object.defineProperty(table, key, {
					configurable: true,
					enumerable: true,
					get() {
						return own(this, key, compute(this));
					},
					set(value) {
						own(this, key, value);
					}
				});
			}
			return table;
		}
		function defineBound(proto, key, fn) {
			Object.defineProperty(proto, key, {
				configurable: true,
				get() {
					return this == null ? fn : own(this, key, fn.bind(this));
				},
				set(value) {
					own(this, key, value);
				}
			});
		}
		/** Returns the prototype to install on, or `undefined` if this group is already installed on it. */
		function claim(inst, sentinel) {
			const proto = Object.getPrototypeOf(inst);
			return sentinel in proto ? void 0 : proto;
		}
		let installing;
		let broke = false;
		const breaker = {
			configurable: true,
			get() {
				broke = true;
			}
		};
		/**
		* Installs a lazily-derived internal on the `_zod` prototype of `inst`'s
		* constructor, computed from the internals object itself and cached there on
		* first read. One accessor per constructor rather than one per instance.
		*/
		function defineLazyInternal(inst, key, compute) {
			const proto = Object.getPrototypeOf(inst._zod);
			if (key in proto && installing !== inst._zod) {
				installing = void 0;
				return;
			}
			installing = inst._zod;
			Object.defineProperty(proto, key, {
				configurable: true,
				get() {
					Object.defineProperty(this, key, breaker);
					const outer = broke;
					broke = false;
					try {
						const value = compute(this);
						if (broke) delete this[key];
						else Object.defineProperty(this, key, {
							configurable: true,
							writable: true,
							value
						});
						broke = broke || outer;
						return value;
					} catch (err) {
						delete this[key];
						broke = broke || outer;
						throw err;
					}
				},
				set(value) {
					Object.defineProperty(this, key, {
						configurable: true,
						writable: true,
						value
					});
				}
			});
		}
		/**
		* Installs `key` on `inst`'s prototype, computed by `make` on first read and cached there as an own
		* data property. One accessor per constructor rather than one per instance, because an own accessor
		* puts every instance after the first into v8 dictionary mode. The key doubles as the sentinel.
		*/
		function installLazyProp(inst, key, make, enumerable) {
			const proto = claim(inst, key);
			if (!proto) return;
			Object.defineProperty(proto, key, {
				configurable: true,
				get() {
					const desc = {
						configurable: true,
						writable: true,
						enumerable,
						value: void 0
					};
					Object.defineProperty(this, key, desc);
					desc.value = make(this);
					Object.defineProperty(this, key, desc);
					return desc.value;
				},
				set(value) {
					Object.defineProperty(this, key, {
						configurable: true,
						writable: true,
						enumerable,
						value
					});
				}
			});
		}
		/** Marks the thunk `_catch` synthesises for a constant catch value. `Function.length` cannot tell that thunk from a user callback — rest and defaulted parameters both report arity 0 — and a user callback reads `ctx.error`, whose issues only finalize correctly against the caller's per-parse error map. Provenance can say what arity cannot. A plain string key rather than `Symbol.for`, whose call at module scope no bundler can prove pure — the same shape that anchored `urlCanParse` into every build. */
		const CONSTANT_CATCH = "~constantCatch";
		/** Wraps a constant catch value in a thunk tagged with {@link CONSTANT_CATCH}. */
		function constantCatch(value) {
			const fn = () => value;
			fn[CONSTANT_CATCH] = true;
			return fn;
		}
		//#endregion
		//#region ../../node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/core.js
		var _a$1;
		const _zodDesc = {
			value: void 0,
			enumerable: false
		};
		let _E = "captureStackTrace" in Error ? Error : null;
		function newError(Definition) {
			const E = _E;
			if (E) {
				const saved = E.stackTraceLimit;
				if (typeof saved === "number") {
					try {
						E.stackTraceLimit = 0;
					} catch {
						_E = null;
						return new Definition();
					}
					try {
						return new Definition();
					} finally {
						E.stackTraceLimit = saved;
					}
				}
			}
			return new Definition();
		}
		function $constructor(name, initializer, proto, params) {
			const zodProto = {};
			function Internals(def) {
				this.def = def;
				this.constr = _;
				this.traits = /* @__PURE__ */ new Set();
			}
			Internals.prototype = zodProto;
			const protoMembers = proto;
			const initialized = protoMembers && /* @__PURE__ */ new WeakSet();
			function init(inst, def) {
				if (!inst._zod) {
					_zodDesc.value = new Internals(def);
					try {
						Object.defineProperty(inst, "_zod", _zodDesc);
					} finally {
						_zodDesc.value = void 0;
					}
				} else if (inst._zod.traits.has(name)) return;
				inst._zod.traits.add(name);
				initializer(inst, def);
				if (initialized) {
					const own = Object.getPrototypeOf(inst);
					const ctorProto = inst._zod.constr.prototype;
					let up = own;
					while (up && up !== ctorProto) up = Object.getPrototypeOf(up);
					const target = up ?? own;
					if (!initialized.has(target)) {
						initialized.add(target);
						members(target, protoMembers);
					}
				}
				const proto = _.prototype;
				for (const k in proto) {
					if (!Object.prototype.hasOwnProperty.call(proto, k)) continue;
					if (!(k in inst)) inst[k] = proto[k].bind(inst);
				}
			}
			const Parent = params?.Parent ?? Object;
			class Definition extends Parent {}
			Object.defineProperty(Definition, "name", { value: name });
			function _(def) {
				const inst = params?.Parent ? newError(Definition) : this;
				init(inst, def);
				const deferred = inst._zod.deferred;
				if (deferred) {
					for (const fn of deferred) fn();
					inst._zod.deferred = void 0;
				}
				const pp = globalThis.__zod_globalConfig?.postProcessor;
				if (pp) pp(inst);
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
		//#region ../../node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/errors.js
		function _getMessage() {
			const internals = this._zod;
			internals.message ?? (internals.message = JSON.stringify(internals.def, jsonStringifyReplacer, 2));
			return internals.message;
		}
		function _setMessage(value) {
			this._zod.message = value;
		}
		const _messageDesc = {
			get: _getMessage,
			set: _setMessage,
			enumerable: true,
			configurable: true
		};
		const _issuesDesc = {
			value: void 0,
			enumerable: false
		};
		const _installedToString = /* @__PURE__ */ new WeakSet([Object.prototype, Error.prototype]);
		const initializer$1 = (inst, def) => {
			inst.name = "$ZodError";
			_issuesDesc.value = def;
			Object.defineProperty(inst, "issues", _issuesDesc);
			_issuesDesc.value = void 0;
			Object.defineProperty(inst, "message", _messageDesc);
			const proto = Object.getPrototypeOf(inst);
			if (!_installedToString.has(proto)) {
				_installedToString.add(proto);
				Object.defineProperty(proto, "toString", {
					configurable: true,
					enumerable: false,
					get() {
						const value = () => this.message;
						Object.defineProperty(this, "toString", {
							value,
							configurable: true,
							writable: true
						});
						return value;
					},
					set(value) {
						Object.defineProperty(this, "toString", {
							value,
							configurable: true,
							writable: true
						});
					}
				});
			}
		};
		const $ZodError = $constructor("$ZodError", initializer$1);
		$constructor("$ZodError", initializer$1, void 0, { Parent: Error });
		/** Get-or-create `obj[key]` as an own data property. A path segment naming an inherited member
		* ("toString", "constructor") would otherwise read through to the prototype, and assigning
		* "__proto__" would hit the setter instead of creating a key. */
		function node(obj, key, make) {
			if (!Object.prototype.hasOwnProperty.call(obj, key)) {
				if (key === "__proto__") Object.defineProperty(obj, key, {
					value: make(),
					writable: true,
					enumerable: true,
					configurable: true
				});
				else obj[key] = make();
			}
			return obj[key];
		}
		function flattenError(error, mapper = (issue) => issue.message) {
			const fieldErrors = {};
			const formErrors = [];
			for (const sub of error.issues) if (sub.path.length > 0) node(fieldErrors, sub.path[0], () => []).push(mapper(sub));
			else formErrors.push(mapper(sub));
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
							const terminal = i === fullpath.length - 1;
							if (el === "_errors") {
								if (terminal) curr._errors.push(mapper(issue));
								i++;
								continue;
							}
							if (!Object.prototype.hasOwnProperty.call(curr, el)) Object.defineProperty(curr, el, {
								value: { _errors: [] },
								enumerable: true,
								writable: true,
								configurable: true
							});
							const node = curr[el];
							if (terminal) node._errors.push(mapper(issue));
							curr = node;
							i++;
						}
					}
				}
			};
			processError(error);
			return fieldErrors;
		}
		//#endregion
		//#region ../../node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/parse.js
		function finalizeParams(callee, params) {
			return {
				callee: params?.callee ?? callee,
				Err: params?.Err
			};
		}
		const _parse = (_Err) => {
			const fn = (schema, value, _ctx, _params) => {
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
					captureStackTrace(e, _params?.callee ?? fn);
					throw e;
				}
				return result.value;
			};
			return fn;
		};
		const _parseAsync = (_Err) => {
			const fn = async (schema, value, _ctx, params) => {
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
					captureStackTrace(e, params?.callee ?? fn);
					throw e;
				}
				return result.value;
			};
			return fn;
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
			return result.issues.length ? failure(_Err, result.issues, ctx) : {
				success: true,
				data: result.value
			};
		};
		function failure(Err, issues, ctx) {
			let error;
			return {
				success: false,
				get error() {
					if (!error) {
						error = new Err(issues.map((iss) => finalizeIssue(iss, ctx, config())));
						issues = void 0;
						ctx = void 0;
					}
					return error;
				},
				set error(e) {
					error = e;
					issues = void 0;
					ctx = void 0;
				}
			};
		}
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
			return result.issues.length ? failure(_Err, result.issues, ctx) : {
				success: true,
				data: result.value
			};
		};
		const COMPILE_INVALID = /* @__PURE__ */ Symbol.for("zod.compile.invalid");
		const COMPILE_FALLBACK = /* @__PURE__ */ Symbol.for("zod.compile.fallback");
		const validate = ((schema, value, _ctx) => {
			const validator = schema._zod.bag.validator;
			if (validator !== void 0) {
				if (validator(value) !== COMPILE_INVALID) return true;
				if (validator.definite === true && _ctx === void 0) return false;
			}
			return validateFallback(schema, value, _ctx);
		});
		function validateFallback(schema, value, _ctx) {
			const ctx = _ctx ? {
				..._ctx,
				async: false,
				abortEarly: true
			} : {
				async: false,
				abortEarly: true
			};
			const fallbackRun = schema._zod.bag.fallbackRun;
			let result;
			if (fallbackRun) {
				ctx[COMPILE_FALLBACK] = true;
				result = fallbackRun({
					value,
					issues: []
				}, ctx);
			} else result = schema._zod.run({
				value,
				issues: []
			}, ctx);
			if (result instanceof Promise) throw new $ZodAsyncError();
			return result.issues.length === 0;
		}
		const validateAsync$1 = async (schema, value, _ctx) => {
			const ctx = _ctx ? {
				..._ctx,
				async: true,
				abortEarly: true
			} : {
				async: true,
				abortEarly: true
			};
			let result = schema._zod.run({
				value,
				issues: []
			}, ctx);
			if (result instanceof Promise) result = await result;
			return result.issues.length === 0;
		};
		const _encode = (_Err) => {
			const parse = _parse(_Err);
			const fn = (schema, value, _ctx, _params) => {
				const ctx = _ctx ? {
					..._ctx,
					direction: "backward"
				} : { direction: "backward" };
				return parse(schema, value, ctx, finalizeParams(fn, _params));
			};
			return fn;
		};
		const _decode = (_Err) => {
			const parse = _parse(_Err);
			const fn = (schema, value, _ctx, _params) => {
				return parse(schema, value, _ctx, finalizeParams(fn, _params));
			};
			return fn;
		};
		const _encodeAsync = (_Err) => {
			const parseAsync = _parseAsync(_Err);
			const fn = async (schema, value, _ctx, _params) => {
				const ctx = _ctx ? {
					..._ctx,
					direction: "backward"
				} : { direction: "backward" };
				return await parseAsync(schema, value, ctx, finalizeParams(fn, _params));
			};
			return fn;
		};
		const _decodeAsync = (_Err) => {
			const parseAsync = _parseAsync(_Err);
			const fn = async (schema, value, _ctx, _params) => {
				return await parseAsync(schema, value, _ctx, finalizeParams(fn, _params));
			};
			return fn;
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
		//#region ../../node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js
		/**
		* @deprecated CUID v1 is deprecated by its authors due to information leakage
		* (timestamps embedded in the id). Use {@link cuid2} instead.
		* See https://github.com/paralleldrive/cuid.
		*/
		const cuid = /^[cC][0-9a-z]{6,}$/;
		const cuid2 = /^[0-9a-z]+$/;
		const ulid = /^[0-7][0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{25}$/;
		const xid = /^[0-9a-vA-V]{20}$/;
		const ksuid = /^[A-Za-z0-9]{27}$/;
		const nanoid = /^[a-zA-Z0-9_-]{21}$/;
		function nanoidOfLength(length) {
			return new RegExp(`^[a-zA-Z0-9_-]{${length}}$`);
		}
		/** ISO 8601-1 duration regex. Does not support the 8601-2 extensions like negative durations or fractional/negative components. */
		const duration = /^P(?:(\d+W)|(?!.*W)(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?)$/;
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
		const email = /^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;
		const _emoji$1 = `^(?=[\\s\\S]*[\\p{Extended_Pictographic}\\p{Regional_Indicator}\\u20E3])[\\p{Extended_Pictographic}\\p{Emoji_Component}]+$`;
		function emoji() {
			return new RegExp(_emoji$1, "u");
		}
		const ipv4 = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
		const ipv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/;
		const cidrv4 = /^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/([0-9]|[1-2][0-9]|3[0-2])$/;
		const cidrv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
		const base64 = /^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$/;
		const base64url = /^(?:[A-Za-z0-9_-]{4})*(?:[A-Za-z0-9_-]{2,3})?$/;
		const httpProtocol = /^https?$/;
		const e164 = /^\+[1-9]\d{6,14}$/;
		const dateSource = `(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))`;
		/** Anchors a pattern source. The interpolation lives here rather than at the call site because
		* esbuild will not drop a `@__PURE__` call whose own argument interpolates a variable, but it
		* will drop `anchor(dateSource)`. Keeping it inline pinned `date` into every bundle. */
		function anchor(source) {
			return new RegExp(`^${source}$`);
		}
		const date = /*@__PURE__*/ anchor(dateSource);
		function timeSource(args) {
			const hhmm = `(?:[01]\\d|2[0-3]):[0-5]\\d`;
			return typeof args.precision === "number" ? args.precision === -1 ? `${hhmm}` : args.precision === 0 ? `${hhmm}:[0-5]\\d` : `${hhmm}:[0-5]\\d\\.\\d{${args.precision}}` : args.seconds ? `${hhmm}:[0-5]\\d(?:\\.\\d+)?` : `${hhmm}(?::[0-5]\\d(?:\\.\\d+)?)?`;
		}
		function time(args) {
			return new RegExp(`^${timeSource(args)}$`);
		}
		function datetime(args) {
			const opts = ["Z"];
			if (args.offset) opts.push(`([+-](?:[01]\\d|2[0-3]):[0-5]\\d)`);
			const qualified = `${timeSource({
				precision: args.precision,
				seconds: true
			})}(?:${opts.join("|")})`;
			const timeRegex = args.local ? `${qualified}|${timeSource({ precision: args.precision })}` : qualified;
			return new RegExp(`^${dateSource}T(?:${timeRegex})$`);
		}
		const anyString = /^[\s\S]{0,}$/;
		const number$1 = /^-?\d+(?:\.\d+)?$/;
		const boolean$1 = /^(?:true|false)$/i;
		const lowercase = /^[^A-Z]*$/;
		const uppercase = /^[^a-z]*$/;
		//#endregion
		//#region ../../node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/checks.js
		const $ZodCheck = /*@__PURE__*/ $constructor("$ZodCheck", (inst, def) => {
			var _a;
			inst._zod ?? (inst._zod = {});
			inst._zod.def = def;
			(_a = inst._zod).onattach ?? (_a.onattach = []);
		});
		/** Default `when` for length-based checks: run only on non-nullish values with a `length`. */
		const _whenHasLength = (payload) => {
			const val = payload.value;
			return !nullish(val) && val.length !== void 0;
		};
		const numericOriginMap = {
			number: "number",
			bigint: "bigint",
			object: "date"
		};
		const $ZodCheckLessThan = /*@__PURE__*/ $constructor("$ZodCheckLessThan", (inst, def) => {
			$ZodCheck.init(inst, def);
			const origin = numericOriginMap[typeof def.value];
			inst._zod.check = (payload) => {
				if (def.inclusive ? payload.value <= def.value : payload.value < def.value) return;
				payload.issues.push({
					origin: numericOriginMap[typeof payload.value] ?? origin,
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
			inst._zod.check = (payload) => {
				if (def.inclusive ? payload.value >= def.value : payload.value > def.value) return;
				payload.issues.push({
					origin: numericOriginMap[typeof payload.value] ?? origin,
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
			inst._zod.check = (payload) => {
				if (typeof payload.value !== typeof def.value) throw new Error("Cannot mix number and bigint in multiple_of check.");
				if (typeof payload.value === "bigint" ? def.value !== BigInt(0) && payload.value % def.value === BigInt(0) : floatSafeRemainder(payload.value, def.value) === 0) return;
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
			(_a = inst._zod.def).when ?? (_a.when = _whenHasLength);
			inst._zod.check = (payload) => {
				const input = payload.value;
				const units = input.length;
				if ((typeof input === "string" && units > def.maximum ? codePointLength(input) : units) <= def.maximum) return;
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
			(_a = inst._zod.def).when ?? (_a.when = _whenHasLength);
			inst._zod.check = (payload) => {
				const input = payload.value;
				const units = input.length;
				if ((typeof input === "string" && units >= def.minimum && units < def.minimum * 2 ? codePointLength(input) : units) >= def.minimum) return;
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
			(_a = inst._zod.def).when ?? (_a.when = _whenHasLength);
			inst._zod.check = (payload) => {
				const input = payload.value;
				const units = input.length;
				const length = typeof input === "string" && units >= def.length && units <= def.length * 2 ? codePointLength(input) : units;
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
			def.pattern = new RegExp(typeof def.position === "number" ? `^.{${def.position},}${escapedRegex}` : escapedRegex);
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
		//#region ../../node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/doc.js
		var Doc = class {
			constructor(args = [], closed = {}) {
				this.content = [];
				this.indent = 0;
				this.args = args;
				this.closed = closed;
			}
			indented(fn) {
				this.indent += 1;
				try {
					fn(this);
				} finally {
					this.indent -= 1;
				}
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
				const content = this?.content ?? [``];
				return new F(...Object.keys(this.closed), `return function (${this.args.join(", ")}) {\n${content.join("\n")}\n};`)(...Object.values(this.closed));
			}
		};
		//#endregion
		//#region ../../node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/versions.js
		const version = {
			major: 4,
			minor: 6,
			patch: 5
		};
		//#endregion
		//#region ../../node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/schemas.js
		const $ZodType = /*@__PURE__*/ $constructor("$ZodType", (inst, def) => {
			var _a;
			inst ?? (inst = {});
			inst._zod.def = def;
			inst._zod.bag = inst._zod.bag || {};
			inst._zod.version = version;
			const defChecks = inst._zod.def.checks;
			const checks = inst._zod.traits.has("$ZodCheck") ? [inst, ...defChecks ?? []] : defChecks?.length ? [...defChecks] : [];
			for (const ch of checks) for (const fn of ch._zod.onattach) fn(inst);
			if (checks.length === 0) {
				(_a = inst._zod).deferred ?? (_a.deferred = []);
				inst._zod.deferred?.push(() => {
					inst._zod.run = inst._zod.parse;
				});
			} else {
				const runChecks = (payload, checks, ctx) => {
					if (payload.memo) return payload;
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
							attachSchema(payload.issues, currLen, inst);
							if (!isAborted) isAborted = aborted(payload, currLen);
						});
						else {
							if (payload.issues.length === currLen) continue;
							attachSchema(payload.issues, currLen, inst);
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
		}, {
			get "~standard"() {
				return hide(this, "~standard", standardProps(this));
			},
			set "~standard"(value) {
				own(this, "~standard", value);
			}
		});
		/** The Standard Schema surface for `inst`. Shared so wrappers can extend it without forcing it. */
		const toStandardResult = (r, ctx) => r.issues.length ? { issues: r.issues.map((iss) => finalizeIssue(iss, ctx, config())) } : { value: r.value };
		async function validateAsync(inst, value) {
			const ctx = { async: true };
			return toStandardResult(await inst._zod.run({
				value,
				issues: []
			}, ctx), ctx);
		}
		function standardProps(inst) {
			return {
				validate: (value) => {
					const ctx = { async: false };
					try {
						const r = inst._zod.run({
							value,
							issues: []
						}, ctx);
						if (!(r instanceof Promise)) return toStandardResult(r, ctx);
					} catch (_) {}
					return validateAsync(inst, value);
				},
				vendor: "zod",
				version: 1
			};
		}
		const $ZodString = /*@__PURE__*/ $constructor("$ZodString", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.pattern = def.pattern ?? anyString;
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
		function canParseURL(input) {
			try {
				if (typeof URL !== "undefined" && typeof URL.canParse === "function") return URL.canParse(input);
				new URL(input);
				return true;
			} catch {
				return false;
			}
		}
		function validateURL(trimmed, def) {
			if (!("normalize" in def) && !("hostname" in def) && !("protocol" in def)) return canParseURL(trimmed) || 2;
			return parseURLObject(trimmed, def);
		}
		/** Parses a URL while preserving the non-normalizing HTTP guard. */
		function parseURLObject(trimmed, def) {
			if (!def.normalize && def.protocol?.source === httpProtocol.source && !/^https?:\/\//i.test(trimmed)) return 1;
			try {
				if (typeof URL !== "undefined") {
					const URLStatic = URL;
					if (typeof URLStatic.parse === "function") return URLStatic.parse(trimmed) ?? 2;
				}
				return new URL(trimmed);
			} catch {
				return 2;
			}
		}
		const asciiTabOrNewline = /[\t\n\r]/g;
		/** The URL parser deletes every ASCII tab, LF and CR from its input before it parses, so `new URL("https://exa\nmple.com")` reports on `example.com`. Applying the same deletion to the returned value closes the half of that divergence which can move the host; the parser's other rewrite, stripping C0 controls at the edges, cannot. */
		function stripTabAndNewline(value) {
			return value.replace(asciiTabOrNewline, "");
		}
		function urlHostnameOk(url, hostname) {
			hostname.lastIndex = 0;
			return hostname.test(url.hostname);
		}
		function urlProtocolOk(url, protocol) {
			protocol.lastIndex = 0;
			return protocol.test(url.protocol.endsWith(":") ? url.protocol.slice(0, -1) : url.protocol);
		}
		const $ZodURL = /*@__PURE__*/ $constructor("$ZodURL", (inst, def) => {
			$ZodStringFormat.init(inst, def);
			inst._zod.check = (payload) => {
				try {
					const trimmed = payload.value.trim();
					const url = validateURL(trimmed, def);
					if (url === 1) {
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
					if (url === 2) {
						payload.issues.push({
							code: "invalid_format",
							format: "url",
							input: payload.value,
							inst,
							continue: !def.abort
						});
						return;
					}
					if (url === true) {
						payload.value = stripTabAndNewline(trimmed);
						return;
					}
					if (def.hostname && !urlHostnameOk(url, def.hostname)) payload.issues.push({
						code: "invalid_format",
						format: "url",
						note: "Invalid hostname",
						pattern: def.hostname.source,
						input: payload.value,
						inst,
						continue: !def.abort
					});
					if (def.protocol && !urlProtocolOk(url, def.protocol)) payload.issues.push({
						code: "invalid_format",
						format: "url",
						note: "Invalid protocol",
						pattern: def.protocol.source,
						input: payload.value,
						inst,
						continue: !def.abort
					});
					payload.value = def.normalize ? url.href : stripTabAndNewline(trimmed);
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
			if (def.length !== void 0 && (!Number.isInteger(def.length) || def.length < 1)) throw new Error(`Invalid nanoid length: ${def.length}`);
			def.pattern ?? (def.pattern = def.length === void 0 ? nanoid : nanoidOfLength(def.length));
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
			def.pattern ?? (def.pattern = datetime(def));
			$ZodStringFormat.init(inst, def);
		});
		const $ZodISODate = /*@__PURE__*/ $constructor("$ZodISODate", (inst, def) => {
			def.pattern ?? (def.pattern = date);
			$ZodStringFormat.init(inst, def);
		});
		const $ZodISOTime = /*@__PURE__*/ $constructor("$ZodISOTime", (inst, def) => {
			def.pattern ?? (def.pattern = time(def));
			$ZodStringFormat.init(inst, def);
		});
		const $ZodISODuration = /*@__PURE__*/ $constructor("$ZodISODuration", (inst, def) => {
			def.pattern ?? (def.pattern = duration);
			$ZodStringFormat.init(inst, def);
		});
		const $ZodIPv4 = /*@__PURE__*/ $constructor("$ZodIPv4", (inst, def) => {
			def.pattern ?? (def.pattern = ipv4);
			$ZodStringFormat.init(inst, def);
		});
		/** An IPv6 address is written with hex digits, colons and dots, and nothing else. The guard is what makes the check below an IPv6 check: `new URL("http://[...]")` parses an authority, not an address, so `@` and `\` re-delimit it and `"::@1\\"` validates against the host `0.0.0.1`. The URL parser also deletes ASCII tab, LF and CR rather than failing, which is how `"::1\n"` validated as `::1`. */
		const ipv6Alphabet = /^[0-9a-fA-F:.]+$/;
		function isValidIPv6(value) {
			if (!ipv6Alphabet.test(value)) return false;
			return canParseURL(`http://[${value}]`);
		}
		const $ZodIPv6 = /*@__PURE__*/ $constructor("$ZodIPv6", (inst, def) => {
			def.pattern ?? (def.pattern = ipv6);
			$ZodStringFormat.init(inst, def);
			inst._zod.check = (payload) => {
				if (!isValidIPv6(payload.value)) payload.issues.push({
					code: "invalid_format",
					format: "ipv6",
					input: payload.value,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCIDRv4 = /*@__PURE__*/ $constructor("$ZodCIDRv4", (inst, def) => {
			def.pattern ?? (def.pattern = cidrv4);
			$ZodStringFormat.init(inst, def);
		});
		function isValidCIDRv6(value) {
			const parts = value.split("/");
			if (parts.length !== 2) return false;
			const [address, prefix] = parts;
			if (!prefix) return false;
			const prefixNum = Number(prefix);
			if (`${prefixNum}` !== prefix) return false;
			if (prefixNum < 0 || prefixNum > 128) return false;
			return isValidIPv6(address);
		}
		const $ZodCIDRv6 = /*@__PURE__*/ $constructor("$ZodCIDRv6", (inst, def) => {
			def.pattern ?? (def.pattern = cidrv6);
			$ZodStringFormat.init(inst, def);
			inst._zod.check = (payload) => {
				if (!isValidCIDRv6(payload.value)) payload.issues.push({
					code: "invalid_format",
					format: "cidrv6",
					input: payload.value,
					inst,
					continue: !def.abort
				});
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
		const base64Charset = /^[0-9a-zA-Z+/]*={0,2}$/;
		const $ZodBase64 = /*@__PURE__*/ $constructor("$ZodBase64", (inst, def) => {
			def.pattern ?? (def.pattern = base64Charset);
			$ZodStringFormat.init(inst, def);
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
		const base64urlCharset = /^[A-Za-z0-9_-]*$/;
		function isValidBase64URL(data) {
			if (!base64urlCharset.test(data)) return false;
			const base64 = data.replace(/[-_]/g, (c) => c === "-" ? "+" : "/");
			return isValidBase64(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
		}
		const $ZodBase64URL = /*@__PURE__*/ $constructor("$ZodBase64URL", (inst, def) => {
			def.pattern ?? (def.pattern = base64urlCharset);
			$ZodStringFormat.init(inst, def);
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
			inst._zod.pattern = number$1;
			inst._zod.parse = (payload, _ctx) => {
				if (def.coerce) try {
					payload.value = Number(payload.value);
				} catch (_) {}
				const input = payload.value;
				if (typeof input === "number" && !Number.isNaN(input) && Number.isFinite(input)) return payload;
				const received = typeof input === "number" ? Number.isNaN(input) ? "NaN" : !Number.isFinite(input) ? String(input) : void 0 : void 0;
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
			const memo = globalConfig.memoizer;
			memo?.attach(inst);
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
				payload.value = memo ? memo.alloc(inst, payload, Array(input.length), ctx) : Array(input.length);
				const proms = [];
				const abortEarly = ctx?.abortEarly;
				for (let i = 0; i < input.length; i++) {
					const item = input[i];
					const result = def.element._zod.run({
						value: item,
						issues: []
					}, ctx);
					if (result instanceof Promise) proms.push(result.then((result) => handleArrayResult(result, payload, i)));
					else {
						handleArrayResult(result, payload, i);
						if (abortEarly && result.issues.length !== 0 && aborted(result)) break;
					}
				}
				if (proms.length) return Promise.all(proms).then(() => payload);
				return payload;
			};
		});
		function handlePropertyResult(result, final, key, input, optin, optout) {
			const isPresent = key in input;
			const isOptionalOut = optout === "optional";
			if (!isPresent && isOptionalOut && optin === "optional") return;
			if (result.issues.length) {
				if (optin !== void 0 && isOptionalOut && !isPresent) return;
				final.issues.push(...prefixIssues(key, result.issues));
			}
			if (!isPresent && optin === void 0) {
				if (!result.issues.length) final.issues.push({
					code: "invalid_type",
					expected: "nonoptional",
					input: void 0,
					path: [key]
				});
				return;
			}
			if (result.value === void 0) {
				if (isPresent || optin === "defaulted" && !isOptionalOut) final.value[key] = void 0;
			} else final.value[key] = result.value;
		}
		const NO_SYMBOL_KEYS = [];
		function normalizeDef(def) {
			const keys = Object.keys(def.shape);
			const ownSymbols = Object.getOwnPropertySymbols(def.shape);
			const symbolKeys = ownSymbols.length ? ownSymbols : NO_SYMBOL_KEYS;
			const allKeys = symbolKeys.length ? [...keys, ...symbolKeys] : keys;
			for (const k of allKeys) if (!def.shape?.[k]?._zod?.traits?.has("$ZodType")) throw new Error(`Invalid element at key "${String(k)}": expected a Zod schema`);
			const okeys = optionalKeys(def.shape);
			return {
				...def,
				allKeys,
				symbolKeys,
				keySet: new Set(keys),
				numKeys: keys.length,
				optionalKeys: new Set(okeys)
			};
		}
		function handleCatchall(proms, input, payload, ctx, def, inst, abortEarly) {
			const unrecognized = [];
			const keySet = def.keySet;
			const _catchall = def.catchall._zod;
			const t = _catchall.def.type;
			const optin = _catchall.optin;
			const optout = _catchall.optout;
			let seen = 0;
			for (const key in input) {
				if (abortEarly && payload.issues.length !== seen) {
					if (aborted(payload, seen)) break;
					seen = payload.issues.length;
				}
				if (keySet.has(key)) continue;
				if (key === "__proto__") {
					if (t === "never") unrecognized.push(key);
					continue;
				}
				if (t === "never") {
					unrecognized.push(key);
					continue;
				}
				const r = _catchall.run({
					value: input[key],
					issues: []
				}, ctx);
				if (r instanceof Promise) proms.push(r.then((r) => handlePropertyResult(r, payload, key, input, optin, optout)));
				else handlePropertyResult(r, payload, key, input, optin, optout);
			}
			if (unrecognized.length) payload.issues.push({
				code: "unrecognized_keys",
				keys: unrecognized,
				input,
				inst,
				continue: true
			});
			if (!proms.length) return payload;
			return Promise.all(proms).then(() => {
				return payload;
			});
		}
		const $ZodObject = /*@__PURE__*/ $constructor("$ZodObject", (inst, def) => {
			$ZodType.init(inst, def);
			const desc = Object.getOwnPropertyDescriptor(def, "shape");
			const sh = desc?.get ? desc.get.raw : def.shape ?? {};
			if (sh) {
				const get = () => {
					const newSh = { ...sh };
					Object.defineProperty(def, "shape", { value: newSh });
					get.raw = newSh;
					return newSh;
				};
				get.raw = sh;
				Object.defineProperty(def, "shape", { get });
			}
			const _normalized = cached(() => normalizeDef(def));
			defineLazyInternal(inst, "propValues", (zod) => {
				const shape = zod.def.shape;
				const propValues = {};
				for (const key in shape) {
					const field = shape[key]._zod;
					if (field.values) {
						if (!Object.prototype.hasOwnProperty.call(propValues, key)) assignProp(propValues, key, /* @__PURE__ */ new Set());
						for (const v of field.values) propValues[key].add(v);
						if (field.optin !== void 0) propValues[key].add(void 0);
					}
				}
				return propValues;
			});
			const isObject$2 = isObject;
			const catchall = def.catchall;
			let value;
			const memo = globalConfig.memoizer;
			memo?.attach(inst);
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
				payload.value = memo ? memo.alloc(inst, payload, {}, ctx) : {};
				const proms = [];
				const shape = value.shape;
				const abortEarly = ctx?.abortEarly;
				let seen = payload.issues.length;
				for (const key of value.allKeys) {
					if (abortEarly && payload.issues.length !== seen) {
						if (aborted(payload, seen)) break;
						seen = payload.issues.length;
					}
					if (key === "__proto__") continue;
					const el = shape[key];
					const optin = el._zod.optin;
					const optout = el._zod.optout;
					const r = el._zod.run({
						value: input[key],
						issues: []
					}, ctx);
					if (r instanceof Promise) proms.push(r.then((r) => handlePropertyResult(r, payload, key, input, optin, optout)));
					else handlePropertyResult(r, payload, key, input, optin, optout);
				}
				if (!catchall) return proms.length ? Promise.all(proms).then(() => payload) : payload;
				return handleCatchall(proms, input, payload, ctx, _normalized.value, inst, abortEarly === true);
			};
		});
		const $ZodObjectJIT = /*@__PURE__*/ $constructor("$ZodObjectJIT", (inst, def) => {
			$ZodObject.init(inst, def);
			const superParse = inst._zod.parse;
			const _normalized = cached(() => normalizeDef(def));
			const memo = globalConfig.memoizer;
			const generateFastpass = (shape) => {
				const normalized = _normalized.value;
				const syms = normalized.symbolKeys;
				const doc = new Doc(["payload", "ctx"], {
					shape,
					inst,
					memo,
					syms
				});
				const parseStr = (k) => `shape[${k}]._zod.run({ value: input[${k}], issues: [] }, ctx)`;
				const prefixStr = (id, k) => `
          let ${id}_ab = false;
          for (let i = 0; i < ${id}.issues.length; i++) {
            const iss = ${id}.issues[i];
            iss.path = iss.path ? [${k}, ...iss.path] : [${k}];
            payload.issues.push(iss);
            if (iss.continue !== true) ${id}_ab = true;
          }
          if (${id}_ab && ctx && ctx.abortEarly) {
            payload.value = newResult;
            return payload;
          }`;
				doc.write(`const input = payload.value;`);
				const ids = Object.create(null);
				let counter = 0;
				for (const key of normalized.allKeys) ids[key] = `key_${counter++}`;
				doc.write(memo ? `const newResult = memo.alloc(inst, payload, {}, ctx);` : `const newResult = {};`);
				for (const key of normalized.allKeys) {
					if (key === "__proto__") continue;
					const id = ids[key];
					const k = typeof key === "symbol" ? `syms[${syms.indexOf(key)}]` : esc(key);
					const isPresent = `${k} in input`;
					const schema = shape[key];
					const optin = schema?._zod?.optin;
					const isOptionalIn = optin !== void 0;
					const isOptionalOut = schema?._zod?.optout === "optional";
					doc.write(`const ${id} = ${parseStr(k)};`);
					if (isOptionalIn && isOptionalOut) {
						const assign = optin === "optional" ? `${id}_present` : `${id}.value !== undefined || ${id}_present`;
						doc.write(`
        const ${id}_present = ${isPresent};
        if (!${id}.issues.length || ${id}_present) {
          if (${id}.issues.length) {${prefixStr(id, k)}
          }

          if (${assign}) {
            newResult[${k}] = ${id}.value;
          }
        }

      `);
					} else if (!isOptionalIn) doc.write(`
        const ${id}_present = ${isPresent};
        if (${id}.issues.length) {${prefixStr(id, k)}
        }
        if (!${id}_present && !${id}.issues.length) {
          payload.issues.push({
            code: "invalid_type",
            expected: "nonoptional",
            input: undefined,
            path: [${k}]
          });
          if (ctx && ctx.abortEarly) {
            payload.value = newResult;
            return payload;
          }
        }

        if (${id}_present) {
          newResult[${k}] = ${id}.value;
        }

      `);
					else {
						doc.write(`
        if (${id}.issues.length) {${prefixStr(id, k)}
        }
      `);
						if (optin === "defaulted") doc.write(`newResult[${k}] = ${id}.value;`);
						else doc.write(`
        if (${id}.value !== undefined || ${isPresent}) {
          newResult[${k}] = ${id}.value;
        }
      `);
					}
				}
				doc.write(`payload.value = newResult;`);
				doc.write(`return payload;`);
				return doc.compile();
			};
			let fastpass;
			const isObject$1 = isObject;
			const jit = !globalConfig.jitless;
			const fastEnabled = jit && allowsEval.value;
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
				if (jit && fastEnabled && ctx?.async === false && ctx.jitless !== true) {
					if (!fastpass) fastpass = generateFastpass(def.shape);
					payload = fastpass(payload, ctx);
					if (!catchall) return payload;
					return handleCatchall([], input, payload, ctx, value, inst, ctx?.abortEarly === true);
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
			defineLazyInternal(inst, "optin", (zod) => zod.def.options.some((o) => o._zod.optin === "defaulted") ? "defaulted" : zod.def.options.some((o) => o._zod.optin !== void 0) ? "optional" : void 0);
			defineLazyInternal(inst, "optout", (zod) => zod.def.options.some((o) => o._zod.optout === "optional") ? "optional" : void 0);
			defineLazyInternal(inst, "values", (zod) => {
				if (zod.def.options.every((o) => o._zod.values)) return new Set(zod.def.options.flatMap((option) => Array.from(option._zod.values)));
			});
			defineLazyInternal(inst, "pattern", (zod) => {
				if (zod.def.options.every((o) => o._zod.pattern)) {
					const patterns = zod.def.options.map((o) => o._zod.pattern);
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
				if (Object.prototype.hasOwnProperty.call(newObj, "__proto__")) delete newObj.__proto__;
				for (const key of sharedKeys) {
					if (key === "__proto__") continue;
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
			const keyIssues = /* @__PURE__ */ new Map();
			const collect = (iss, side) => {
				let keys;
				if (iss.code === "unrecognized_keys" && !iss.path?.length) {
					unrecIssue ?? (unrecIssue = iss);
					keys = iss.keys;
				} else if (iss.code === "invalid_key" && iss.origin === "record" && iss.path?.length === 1) {
					const k = String(iss.path[0]);
					if (!keyIssues.has(k)) keyIssues.set(k, iss);
					keys = [k];
				} else return false;
				for (const k of keys) {
					if (!unrecKeys.has(k)) unrecKeys.set(k, {});
					unrecKeys.get(k)[side] = true;
				}
				return true;
			};
			for (const iss of left.issues) if (!collect(iss, "l")) result.issues.push(iss);
			for (const iss of right.issues) if (!collect(iss, "r")) result.issues.push(iss);
			const bothKeys = [...unrecKeys].filter(([, f]) => f.l && f.r).map(([k]) => k);
			if (bothKeys.length) {
				const aggregated = unrecIssue ? bothKeys.filter((k) => unrecIssue.keys.includes(k)) : [];
				if (aggregated.length) result.issues.push({
					...unrecIssue,
					keys: aggregated
				});
				for (const k of bothKeys) if (!aggregated.includes(k) && keyIssues.has(k)) result.issues.push(keyIssues.get(k));
			}
			const merged = mergeValues(left.value, right.value);
			if (!merged.valid) {
				if (aborted(result)) return result;
				throw new Error(`Unmergable intersection. Error path: ${JSON.stringify(merged.mergeErrorPath)}`);
			}
			result.value = merged.data;
			return result;
		}
		const $ZodEnum = /*@__PURE__*/ $constructor("$ZodEnum", (inst, def) => {
			$ZodType.init(inst, def);
			const values = getEnumValues(def.entries);
			const valuesSet = new Set(values);
			inst._zod.values = valuesSet;
			defineLazyInternal(inst, "pattern", (zod) => {
				const patternValues = getEnumValues(zod.def.entries).filter((k) => propertyKeyTypes.has(typeof k));
				return new RegExp(patternValues.length ? `^(${patternValues.map((o) => escapeRegex(o.toString())).join("|")})$` : "^[^\\s\\S]$");
			});
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
			const values = new Set(def.values);
			inst._zod.values = values;
			defineLazyInternal(inst, "pattern", (zod) => {
				const vals = zod.def.values;
				return new RegExp(vals.length ? `^(${vals.map((o) => typeof o === "string" ? escapeRegex(o) : o ? escapeRegex(o.toString()) : String(o)).join("|")})$` : "^[^\\s\\S]$");
			});
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
			globalConfig.memoizer?.guard(inst);
			inst._zod.parse = (payload, ctx) => {
				if (ctx.direction === "backward") throw new $ZodEncodeError(inst.constructor.name);
				const _out = def.transform(payload.value, payload);
				if (ctx.async) return (_out instanceof Promise ? _out : Promise.resolve(_out)).then((output) => {
					payload.value = output;
					return payload;
				});
				if (_out instanceof Promise) throw new $ZodAsyncError();
				payload.value = _out;
				return payload;
			};
		});
		function handleOptionalResult(payload, result) {
			payload.value = result.issues.length ? void 0 : result.value;
			return payload;
		}
		const $ZodOptional = /*@__PURE__*/ $constructor("$ZodOptional", (inst, def) => {
			$ZodType.init(inst, def);
			defineLazyInternal(inst, "optin", (zod) => zod.def.innerType._zod.optin === "defaulted" ? "defaulted" : "optional");
			inst._zod.optout = "optional";
			defineLazyInternal(inst, "values", (zod) => {
				const values = zod.def.innerType._zod.values;
				return values ? /* @__PURE__ */ new Set([...values, void 0]) : void 0;
			});
			defineLazyInternal(inst, "pattern", (zod) => {
				const pattern = zod.def.innerType._zod.pattern;
				return pattern ? new RegExp(`^(${cleanRegex(pattern.source)})?$`) : void 0;
			});
			inst._zod.parse = (payload, ctx) => {
				if (payload.value === void 0) {
					if (def.innerType._zod.optin !== "defaulted") return payload;
					const result = def.innerType._zod.run({
						value: payload.value,
						issues: []
					}, ctx);
					if (result instanceof Promise) return result.then((result) => handleOptionalResult(payload, result));
					return handleOptionalResult(payload, result);
				}
				return def.innerType._zod.run(payload, ctx);
			};
		});
		const $ZodExactOptional = /*@__PURE__*/ $constructor("$ZodExactOptional", (inst, def) => {
			$ZodOptional.init(inst, def);
			defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
			defineLazyInternal(inst, "pattern", (zod) => zod.def.innerType._zod.pattern);
			inst._zod.parse = (payload, ctx) => {
				return def.innerType._zod.run(payload, ctx);
			};
		});
		const $ZodNullable = /*@__PURE__*/ $constructor("$ZodNullable", (inst, def) => {
			$ZodType.init(inst, def);
			defineLazyInternal(inst, "optin", (zod) => zod.def.innerType._zod.optin);
			defineLazyInternal(inst, "optout", (zod) => zod.def.innerType._zod.optout);
			defineLazyInternal(inst, "pattern", (zod) => {
				const pattern = zod.def.innerType._zod.pattern;
				return pattern ? new RegExp(`^(${cleanRegex(pattern.source)}|null)$`) : void 0;
			});
			defineLazyInternal(inst, "values", (zod) => {
				return zod.def.innerType._zod.values ? /* @__PURE__ */ new Set([...zod.def.innerType._zod.values, null]) : void 0;
			});
			inst._zod.parse = (payload, ctx) => {
				if (payload.value === null) return payload;
				return def.innerType._zod.run(payload, ctx);
			};
		});
		const $ZodDefault = /*@__PURE__*/ $constructor("$ZodDefault", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.optin = "defaulted";
			defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
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
			inst._zod.optin = "defaulted";
			defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
			inst._zod.parse = (payload, ctx) => {
				if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
				if (payload.value === void 0) payload.value = def.defaultValue;
				return def.innerType._zod.run(payload, ctx);
			};
		});
		const $ZodNonOptional = /*@__PURE__*/ $constructor("$ZodNonOptional", (inst, def) => {
			$ZodType.init(inst, def);
			defineLazyInternal(inst, "values", (zod) => {
				const v = zod.def.innerType._zod.values;
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
		function handleCatchResult(payload, result, def, ctx) {
			if (!result.issues.length) {
				payload.value = result.value;
				if (result.memo) payload.memo = true;
				return payload;
			}
			payload.value = def.catchValue({
				...result,
				value: payload.value,
				error: { issues: result.issues.map((iss) => finalizeIssue(iss, ctx, config())) },
				input: payload.value
			});
			return payload;
		}
		const $ZodCatch = /*@__PURE__*/ $constructor("$ZodCatch", (inst, def) => {
			$ZodType.init(inst, def);
			defineLazyInternal(inst, "optin", (zod) => zod.def.innerType._zod.optin === "defaulted" ? "defaulted" : "optional");
			defineLazyInternal(inst, "optout", (zod) => zod.def.innerType._zod.optout);
			defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
			inst._zod.parse = (payload, ctx) => {
				if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
				const result = def.innerType._zod.run({
					value: payload.value,
					issues: []
				}, ctx);
				if (result instanceof Promise) return result.then((result) => handleCatchResult(payload, result, def, ctx));
				return handleCatchResult(payload, result, def, ctx);
			};
		});
		const $ZodPipe = /*@__PURE__*/ $constructor("$ZodPipe", (inst, def) => {
			$ZodType.init(inst, def);
			defineLazyInternal(inst, "values", (zod) => zod.def.in._zod.values);
			defineLazyInternal(inst, "optin", (zod) => zod.def.in._zod.optin);
			defineLazyInternal(inst, "optout", (zod) => zod.def.out._zod.optout);
			defineLazyInternal(inst, "propValues", (zod) => zod.def.in._zod.propValues);
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
			if (left.issues.some((iss) => iss.code !== "unrecognized_keys")) {
				left.aborted = true;
				return left;
			}
			return next._zod.run({
				value: left.value,
				issues: left.issues
			}, ctx);
		}
		const $ZodReadonly = /*@__PURE__*/ $constructor("$ZodReadonly", (inst, def) => {
			$ZodType.init(inst, def);
			defineLazyInternal(inst, "propValues", (zod) => zod.def.innerType._zod.propValues);
			defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
			defineLazyInternal(inst, "optin", (zod) => zod.def.innerType?._zod?.optin);
			defineLazyInternal(inst, "optout", (zod) => zod.def.innerType?._zod?.optout);
			inst._zod.parse = (payload, ctx) => {
				if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
				const result = def.innerType._zod.run(payload, ctx);
				if (result instanceof Promise) return result.then(handleReadonlyResult);
				return handleReadonlyResult(result);
			};
		});
		function handleReadonlyResult(payload) {
			if (!payload.memo) payload.value = Object.freeze(payload.value);
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
		//#region ../../node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/memoizer.js
		var $ZodCyclicError = class extends Error {
			constructor() {
				super(`Cannot parse a reference cycle that closes through a transform`);
				this.name = "ZodCyclicError";
			}
		};
		/** Keyed off the context object every schema in one parse call already shares. */
		const STATE = "~memo";
		const NO_ISSUES = [];
		function isRef(value) {
			return value !== null && typeof value === "object";
		}
		function cloneIssues(issues) {
			return issues.map((iss) => iss.path ? {
				...iss,
				path: iss.path.slice()
			} : { ...iss });
		}
		const recursive = /*@__PURE__*/ new WeakMap();
		/** What the walk established, in order of certainty: ordered so the strongest answer among children wins. */
		const NONE = 0;
		const ASSUMED = 1;
		const PROVEN = 2;
		/** Whether this schema's subtree contains a cycle, so one parse can re-enter it. */
		function isRecursive(inst, stack, resolve) {
			const cached = recursive.get(inst);
			if (cached !== void 0) return cached ? PROVEN : NONE;
			if (stack.has(inst)) return PROVEN;
			stack.add(inst);
			let result = NONE;
			const check = (child) => {
				if (result !== PROVEN && child?._zod) {
					const answer = isRecursive(child, stack, resolve);
					if (answer > result) result = answer;
				}
			};
			const shape = (sh, spread) => {
				let answer = NONE;
				for (const key of Reflect.ownKeys(sh)) {
					const desc = Object.getOwnPropertyDescriptor(sh, key);
					if (spread && !desc.enumerable) continue;
					const child = desc.get ? ASSUMED : desc.value?._zod ? isRecursive(desc.value, stack, resolve) : NONE;
					if (child > answer) answer = child;
				}
				return answer;
			};
			const merge = (answer) => {
				if (answer > result) result = answer;
			};
			const def = inst._zod.def;
			switch (def.type) {
				case "object": {
					const raw = rawShape(def);
					merge(raw ? shape(raw, true) : ASSUMED);
					check(def.catchall);
					break;
				}
				case "array":
					check(def.element);
					break;
				case "tuple":
					for (const el of def.items) check(el);
					check(def.rest);
					break;
				case "record":
				case "map":
					check(def.keyType);
					check(def.valueType);
					break;
				case "set":
					check(def.valueType);
					break;
				case "union":
					for (const el of def.options) check(el);
					break;
				case "intersection":
					check(def.left);
					check(def.right);
					break;
				case "optional":
				case "nullable":
				case "default":
				case "prefault":
				case "catch":
				case "readonly":
				case "nonoptional":
				case "promise":
				case "success":
					check(def.innerType);
					break;
				case "pipe":
					check(def.in);
					check(def.out);
					break;
				case "function":
					check(def.input);
					check(def.output);
					break;
				case "lazy": {
					const inner = def._cachedInner ?? (resolve ? inst._zod.innerType : void 0);
					merge(inner ? isRecursive(inner, stack, false) : ASSUMED);
					break;
				}
				case "template_literal":
				case "string":
				case "number":
				case "int":
				case "boolean":
				case "bigint":
				case "symbol":
				case "undefined":
				case "null":
				case "void":
				case "never":
				case "any":
				case "unknown":
				case "date":
				case "nan":
				case "enum":
				case "literal":
				case "file":
				case "transform":
				case "custom": break;
				default: for (const key in def) {
					const desc = Object.getOwnPropertyDescriptor(def, key);
					if (!desc || desc.get) continue;
					const value = desc.value;
					if (!value || typeof value !== "object") continue;
					if (value._zod) check(value);
					else if (Array.isArray(value)) for (const el of value) check(el);
				}
			}
			stack.delete(inst);
			return settle(inst, result);
		}
		/** An assumed answer must not outlive the resolution that settles it, so only a certain one is cached. */
		function settle(inst, answer) {
			if (answer !== ASSUMED) recursive.set(inst, answer === PROVEN);
			return answer;
		}
		function bucketFor(state, inst) {
			let bucket = state.buckets.get(inst);
			if (!bucket) {
				bucket = /* @__PURE__ */ new WeakMap();
				state.buckets.set(inst, bucket);
			}
			return bucket;
		}
		let handoff;
		const open = [];
		const memo = {
			alloc(_inst, payload, empty) {
				const bucket = handoff;
				if (!bucket) return empty;
				handoff = void 0;
				const entry = {
					value: empty,
					issues: null
				};
				bucket.set(payload.value, entry);
				open.push(entry);
				return empty;
			},
			guard(inst) {
				var _a;
				(_a = inst._zod).deferred ?? (_a.deferred = []);
				inst._zod.deferred.push(() => {
					const base = inst._zod.parse;
					const wrapped = (payload, ctx) => {
						if (ctx.direction !== "backward" && isBackEdge(ctx, payload.value)) throw new $ZodCyclicError();
						return base(payload, ctx);
					};
					inst._zod.parse = wrapped;
					if (inst._zod.run === base) inst._zod.run = wrapped;
				});
			},
			attach(inst) {
				var _a;
				let isRecursiveInst;
				let rechecked = false;
				let lastCtx;
				let lastBucket;
				(_a = inst._zod).deferred ?? (_a.deferred = []);
				inst._zod.deferred.push(() => {
					const base = inst._zod.parse;
					const wrapped = (payload, ctx) => {
						if (isRecursiveInst === void 0) {
							const walked = isRecursive(inst, /* @__PURE__ */ new Set(), false);
							if (walked === NONE) {
								inst._zod.parse = base;
								if (inst._zod.run === wrapped) inst._zod.run = base;
								return base(payload, ctx);
							}
							if (walked === PROVEN || rechecked) isRecursiveInst = true;
							else rechecked = true;
						}
						const input = payload.value;
						if (!isRef(input)) return base(payload, ctx);
						let state = ctx[STATE];
						if (!state) {
							state = {
								buckets: /* @__PURE__ */ new WeakMap(),
								backEdges: void 0
							};
							ctx[STATE] = state;
						}
						let bucket;
						if (lastCtx === ctx) bucket = lastBucket;
						else {
							bucket = bucketFor(state, inst);
							lastCtx = ctx;
							lastBucket = bucket;
						}
						const hit = bucket.get(input);
						if (hit) {
							payload.value = hit.value;
							if (hit.issues) {
								if (hit.issues.length) payload.issues.push(...cloneIssues(hit.issues));
							} else {
								payload.memo = true;
								state.backEdges ?? (state.backEdges = /* @__PURE__ */ new WeakSet());
								state.backEdges.add(hit.value);
							}
							return payload;
						}
						handoff = bucket;
						const depth = open.length;
						const result = base(payload, ctx);
						handoff = void 0;
						const entry = open.length > depth ? open.pop() : void 0;
						if (result instanceof Promise) return result.then((r) => {
							if (entry) entry.issues = r.issues.length ? cloneIssues(r.issues) : NO_ISSUES;
							return r;
						});
						if (entry) entry.issues = result.issues.length ? cloneIssues(result.issues) : NO_ISSUES;
						return result;
					};
					inst._zod.parse = wrapped;
					if (inst._zod.run === base) inst._zod.run = wrapped;
				});
			}
		};
		/** The memoizer that gives containers cycle support. `zod` installs it by default; `zod/mini` opts in with `config({ memoizer: memoizer() })`. */
		function memoizer() {
			return memo;
		}
		/** Whether this value is a node a back-edge resolved to before it finished. */
		function isBackEdge(ctx, value) {
			const backEdges = ctx[STATE]?.backEdges;
			return backEdges !== void 0 && isRef(value) && backEdges.has(value);
		}
		//#endregion
		//#region ../../node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/locales/en.js
		const error = () => {
			const Sizable = {
				string: {
					unit: "characters",
					verb: "to have"
				},
				file: {
					unit: "bytes",
					verb: "to have"
				},
				array: {
					unit: "items",
					verb: "to have"
				},
				set: {
					unit: "items",
					verb: "to have"
				},
				map: {
					unit: "entries",
					verb: "to have"
				}
			};
			function getSizing(origin) {
				return Sizable[origin] ?? null;
			}
			const FormatDictionary = {
				regex: "input",
				email: "email address",
				url: "URL",
				emoji: "emoji",
				uuid: "UUID",
				uuidv4: "UUIDv4",
				uuidv6: "UUIDv6",
				nanoid: "nanoid",
				guid: "GUID",
				cuid: "cuid",
				cuid2: "cuid2",
				ulid: "ULID",
				xid: "XID",
				ksuid: "KSUID",
				datetime: "ISO datetime",
				date: "ISO date",
				time: "ISO time",
				duration: "ISO duration",
				ipv4: "IPv4 address",
				ipv6: "IPv6 address",
				mac: "MAC address",
				cidrv4: "IPv4 range",
				cidrv6: "IPv6 range",
				base64: "base64-encoded string",
				base64url: "base64url-encoded string",
				json_string: "JSON string",
				e164: "E.164 number",
				currency_code: "currency code",
				credit_card: "credit card number",
				iban: "IBAN",
				jwt: "JWT",
				template_literal: "input"
			};
			const TypeDictionary = { nan: "NaN" };
			function getTypeName(type, input) {
				if (type === "number" && typeof input === "number" && !Number.isFinite(input)) return String(input);
				return TypeDictionary[type] ?? type;
			}
			return (issue) => {
				switch (issue.code) {
					case "invalid_type": return `Invalid input: expected ${getTypeName(issue.expected)}, received ${getTypeName(parsedType(issue.input), issue.input)}`;
					case "invalid_value":
						if (issue.values.length === 1) return `Invalid input: expected ${stringifyPrimitive(issue.values[0])}`;
						return `Invalid option: expected one of ${joinValues(issue.values, "|")}`;
					case "too_big": {
						const adj = issue.exact ? "exactly " : issue.inclusive ? "<=" : "<";
						const sizing = getSizing(issue.origin);
						if (sizing) return `Too big: expected ${issue.origin ?? "value"} to have ${adj}${issue.maximum.toString()} ${sizing.unit ?? "elements"}`;
						return `Too big: expected ${issue.origin ?? "value"} to be ${adj}${issue.maximum.toString()}`;
					}
					case "too_small": {
						const adj = issue.exact ? "exactly " : issue.inclusive ? ">=" : ">";
						const sizing = getSizing(issue.origin);
						if (sizing) return `Too small: expected ${issue.origin} to have ${adj}${issue.minimum.toString()} ${sizing.unit}`;
						return `Too small: expected ${issue.origin} to be ${adj}${issue.minimum.toString()}`;
					}
					case "invalid_format": {
						const _issue = issue;
						if (_issue.format === "starts_with") return `Invalid string: must start with "${_issue.prefix}"`;
						if (_issue.format === "ends_with") return `Invalid string: must end with "${_issue.suffix}"`;
						if (_issue.format === "includes") return `Invalid string: must include "${_issue.includes}"`;
						if (_issue.format === "regex") return `Invalid string: must match pattern ${_issue.pattern}`;
						return `Invalid ${FormatDictionary[_issue.format] ?? issue.format}`;
					}
					case "not_multiple_of": return `Invalid number: must be a multiple of ${issue.divisor}`;
					case "unrecognized_keys": return `Unrecognized key${issue.keys.length > 1 ? "s" : ""}: ${joinValues(issue.keys, ", ")}`;
					case "invalid_key": return `Invalid key in ${issue.origin}`;
					case "invalid_union":
						if (issue.options && Array.isArray(issue.options) && issue.options.length > 0) return `Invalid discriminator value. Expected ${issue.options.map((o) => `'${o}'`).join(" | ")}`;
						if (issue.inclusive === false) return "Invalid input: more than one option matched";
						return "Invalid input";
					case "invalid_element": return `Invalid value in ${issue.origin}`;
					default: return `Invalid input`;
				}
			};
		};
		function en_default() {
			return { localeError: error() };
		}
		//#endregion
		//#region ../../node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/registries.js
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
		//#region ../../node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/api.js
		function snapshotChecks(def) {
			if (def.checks) def.checks = [...def.checks];
			return def;
		}
		// @__NO_SIDE_EFFECTS__
		function _string(Class, params) {
			return new Class(snapshotChecks({
				type: "string",
				...normalizeParams(params)
			}));
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
			return new Class(snapshotChecks({
				type: "number",
				checks: [],
				...normalizeParams(params)
			}));
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
						if (!("input" in _issue)) _issue.input = payload.value;
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
		//#region ../../node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/to-json-schema.js
		function assignProps(target, ...sources) {
			for (const source of sources) for (const key of Reflect.ownKeys(source)) if (Object.prototype.propertyIsEnumerable.call(source, key)) assignProp(target, key, source[key]);
			return target;
		}
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
				sharedDefsExtractedFor: void 0,
				sharedEmitDoneFor: void 0,
				cycles: params?.cycles ?? "ref",
				reused: params?.reused ?? "inline",
				intersections: [],
				deferred: [],
				external: params?.external ?? void 0
			};
		}
		/**
		* Applies the `unrepresentable` setting at a site that has no JSON Schema equivalent. Throws
		* `message` unless the setting (or the handler's return value) says otherwise. Returns `true` if a
		* custom JSON Schema was written into `json`, in which case the caller must not write its own.
		*/
		function handleUnrepresentable(schema, ctx, json, params, message) {
			const result = typeof ctx.unrepresentable === "function" ? ctx.unrepresentable({
				zodSchema: schema,
				path: params.path,
				message
			}) : ctx.unrepresentable;
			if (result === "any") return false;
			if (result === void 0 || result === "throw") throw new Error(message);
			Object.assign(json, result);
			return true;
		}
		function processSchema(schema, ctx, _params = {
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
			ctx.sharedDefsExtractedFor = void 0;
			ctx.sharedEmitDoneFor = void 0;
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
					processSchema(parent, ctx, params);
					ctx.seen.get(parent).isParent = true;
				}
			}
			const meta = ctx.metadataRegistry.get(schema);
			if (meta) assignProps(result.schema, meta);
			if (ctx.io === "input" && isTransforming(schema)) {
				delete result.schema.examples;
				delete result.schema.default;
			}
			if (ctx.io === "input" && "_prefault" in result.schema) (_a = result.schema).default ?? (_a.default = result.schema._prefault);
			delete result.schema._prefault;
			return ctx.seen.get(schema).schema;
		}
		function encodeJSONPointerSegment(segment) {
			return segment.replace(/~/g, "~0").replace(/\//g, "~1");
		}
		function extractDefs(ctx, schema) {
			const root = ctx.seen.get(schema);
			if (!root) throw new Error("Unprocessed schema. This is a bug in Zod.");
			if (ctx.external && ctx.sharedDefsExtractedFor === ctx.external) return;
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
						ref: `${uriGenerator("__shared")}#/${defsSegment}/${encodeJSONPointerSegment(id)}`
					};
				}
				const uriPrefix = `#`;
				const defUriPrefix = `${uriPrefix}/${defsSegment}/`;
				if (entry[1] === root && !entry[1].schema.id) return { ref: uriPrefix };
				const defId = entry[1].schema.id ?? `__schema${ctx.counter++}`;
				return {
					defId,
					ref: defUriPrefix + encodeJSONPointerSegment(defId)
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
					if (ctx.reused === "ref") extractToDef(entry);
				}
			}
			if (ctx.external) ctx.sharedDefsExtractedFor = ctx.external;
		}
		/** Rewrites `anyOf: [{type: "a"}, {type: "b"}]` to `type: ["a", "b"]`, which every JSON Schema draft treats as equivalent and most consumers render far better for the nullable case. Only branches that are a bare type assertion qualify — anything carrying a constraint, `$ref`, `const` or metadata is left alone. Runs after `flattenRef`, so a branch an override decorated or `$defs` extraction turned into a `$ref` is no longer bare and correctly stays in `anyOf`. `oneOf` is excluded: `integer` and `number` overlap, so "exactly one" and "at least one" are not the same there. OpenAPI 3.0 is excluded: its `type` must be a single string. */
		function compactTypeUnion(schema) {
			const options = schema.anyOf;
			if (!Array.isArray(options) || options.length === 0 || schema.type !== void 0) return;
			const types = [];
			for (const option of options) {
				if (!option || typeof option !== "object") return;
				compactTypeUnion(option);
				const keys = Object.keys(option);
				if (keys.length !== 1 || keys[0] !== "type") return;
				const type = option.type;
				for (const member of Array.isArray(type) ? type : [type]) {
					if (typeof member !== "string") return;
					if (!types.includes(member)) types.push(member);
				}
			}
			delete schema.anyOf;
			schema.type = types.length === 1 ? types[0] : types;
		}
		/** Keywords `foldIntersection` knows how to combine. Anything else — `$ref`, `patternProperties`,
		* an annotation like `description` — makes a member unfoldable, so a constraint this does not
		* understand leaves the `allOf` alone instead of being silently dropped or misattributed. */
		const FOLDABLE_KEYS = /* @__PURE__ */ new Set([
			"type",
			"properties",
			"required",
			"additionalProperties"
		]);
		const UNION_KEYS = ["oneOf", "anyOf"];
		/** A member's constraint on a key it does not declare itself. A `catchall` states one; `false`, an absent `additionalProperties`, and the empty schema a loose object emits state nothing. */
		function undeclaredConstraint(member) {
			const extra = member.additionalProperties;
			if (extra === void 0 || extra === false || typeof extra !== "object" || extra === null) return null;
			return Object.keys(extra).length ? extra : null;
		}
		/** Combines object members into the single object they describe together, or returns `null` if any of them carries a keyword outside {@link FOLDABLE_KEYS}. */
		function foldObjects(members) {
			const objects = [];
			for (const member of members) {
				if (typeof member !== "object" || member.type !== "object") return null;
				for (const key in member) if (!FOLDABLE_KEYS.has(key)) return null;
				objects.push(member);
			}
			const properties = {};
			const required = /* @__PURE__ */ new Set();
			for (const object of objects) {
				for (const key in object.properties) {
					if (Object.prototype.hasOwnProperty.call(properties, key)) continue;
					const parts = [];
					for (const other of objects) {
						const part = other.properties?.[key] ?? undeclaredConstraint(other);
						if (part === null || part === void 0) continue;
						if (!parts.some((seen) => JSON.stringify(seen) === JSON.stringify(part))) parts.push(part);
					}
					assignProp(properties, key, parts.length === 1 ? parts[0] : foldObjects(parts) ?? { allOf: parts });
				}
				for (const key of object.required ?? []) required.add(key);
			}
			const folded = {
				type: "object",
				properties
			};
			if (required.size) folded.required = [...required];
			if (objects.every((object) => object.additionalProperties === false)) folded.additionalProperties = false;
			else {
				const constraints = [];
				for (const object of objects) {
					const constraint = undeclaredConstraint(object);
					if (constraint && !constraints.some((seen) => JSON.stringify(seen) === JSON.stringify(constraint))) constraints.push(constraint);
				}
				if (constraints.length === 1) folded.additionalProperties = constraints[0];
				else if (constraints.length > 1) folded.additionalProperties = { allOf: constraints };
			}
			return folded;
		}
		/** `additionalProperties` in an `allOf` member sees only that member's own `properties`, so two
		* closed object members reject each other's keys and the schema validates nothing. Zod's parser
		* pools the key sets instead — `handleIntersectionResults` reports a key as unrecognized only when
		* *every* side rejects it — so the emitted schema has to pool them too, and folding the members
		* into one object is the encoding that says so on every target.
		*
		* This runs from `finalize`, after `extractDefs`, which is what keeps it clear of the `$ref`
		* machinery: a member extracted into `$defs` is already a `$ref` by now and declines to fold, so it
		* keeps its reference and its own closedness rather than being inlined as a stale copy. */
		function foldIntersection(json) {
			const allOf = json.allOf;
			if (!Array.isArray(allOf) || allOf.length < 2) return;
			for (const key of FOLDABLE_KEYS) if (key in json) return;
			const unions = allOf.filter((m) => UNION_KEYS.some((k) => Array.isArray(m[k])));
			let folded = null;
			if (!unions.length) folded = foldObjects(allOf);
			else {
				const union = unions[0];
				const keyword = UNION_KEYS.find((k) => Array.isArray(union[k]));
				if (Object.keys(union).length !== 1) return;
				const rest = allOf.filter((m) => m !== union);
				const branches = union[keyword].map((branch) => foldObjects([...rest, branch]));
				if (branches.some((b) => !b)) return;
				folded = { [keyword]: branches };
			}
			if (!folded) return;
			delete json.allOf;
			assignProps(json, folded);
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
					} else assignProps(schema, refSchema);
					assignProps(schema, _cached);
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
			if (!ctx.external || ctx.sharedEmitDoneFor !== ctx.external) {
				for (const entry of [...ctx.seen.entries()].reverse()) flattenRef(entry[0]);
				if (ctx.target !== "openapi-3.0") for (const entry of ctx.seen.entries()) compactTypeUnion(entry[1].def ?? entry[1].schema);
				for (const rewrite of ctx.deferred) rewrite();
				if (ctx.intersections.length) {
					const carriers = /* @__PURE__ */ new Map();
					for (const seen of ctx.seen.values()) for (const json of [seen.schema, seen.def]) {
						const allOf = json?.allOf;
						if (!Array.isArray(allOf)) continue;
						const existing = carriers.get(allOf);
						if (existing) existing.push(json);
						else carriers.set(allOf, [json]);
					}
					for (const allOf of ctx.intersections) for (const json of carriers.get(allOf) ?? []) foldIntersection(json);
				}
			}
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
			assignProps(result, root.defId ? root.schema : root.def ?? root.schema);
			const rootMetaId = ctx.metadataRegistry.get(schema)?.id;
			if (rootMetaId !== void 0 && result.id === rootMetaId) delete result.id;
			const defs = ctx.external?.defs ?? {};
			if (!ctx.external || ctx.sharedEmitDoneFor !== ctx.external) for (const entry of ctx.seen.entries()) {
				const seen = entry[1];
				if (seen.def && seen.defId) {
					if (seen.def.id === seen.defId) delete seen.def.id;
					assignProp(defs, seen.defId, seen.def);
				}
			}
			if (ctx.external) ctx.sharedEmitDoneFor = ctx.external;
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
			if (def.type === "promise" || def.type === "optional" || def.type === "nonoptional" || def.type === "nullable" || def.type === "readonly" || def.type === "default" || def.type === "prefault" || def.type === "catch") return isTransforming(def.innerType, ctx);
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
			processSchema(schema, ctx);
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
			processSchema(schema, ctx);
			extractDefs(ctx, schema);
			return finalize(ctx, schema);
		};
		//#endregion
		//#region ../../node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/json-schema-processors.js
		const narrowMin = (agg, key, value) => {
			if (agg[key] === void 0 || value > agg[key]) agg[key] = value;
		};
		const narrowMax = (agg, key, value) => {
			if (agg[key] === void 0 || value < agg[key]) agg[key] = value;
		};
		const narrowBoth = (agg, value) => {
			narrowMin(agg, "minimum", value);
			narrowMax(agg, "maximum", value);
		};
		const addDivisor = (agg, value) => {
			agg.multipleOf ?? (agg.multipleOf = []);
			if (!agg.multipleOf.includes(value)) agg.multipleOf.push(value);
		};
		const addPattern = (agg, pattern) => {
			agg.patterns ?? (agg.patterns = /* @__PURE__ */ new Set());
			agg.patterns.add(pattern);
		};
		const intersectMime = (agg, mime) => {
			agg.mime = agg.mime ? agg.mime.filter((m) => mime.includes(m)) : [...mime];
		};
		const setFormat = (agg, format) => {
			agg.format = format;
			if (format.includes("int")) agg.isInt = true;
		};
		const minContributor = (agg, def) => narrowMin(agg, "minimum", def.minimum);
		const maxContributor = (agg, def) => narrowMax(agg, "maximum", def.maximum);
		const formatContributor = (ranges) => (agg, def) => {
			setFormat(agg, def.format);
			const [minimum, maximum] = ranges[def.format];
			narrowMin(agg, "minimum", minimum);
			narrowMax(agg, "maximum", maximum);
		};
		const contributors = {
			greater_than: (agg, def) => narrowMin(agg, def.inclusive ? "minimum" : "exclusiveMinimum", def.value),
			less_than: (agg, def) => narrowMax(agg, def.inclusive ? "maximum" : "exclusiveMaximum", def.value),
			multiple_of: (agg, def) => addDivisor(agg, def.value),
			number_format: formatContributor(NUMBER_FORMAT_RANGES),
			bigint_format: formatContributor(BIGINT_FORMAT_RANGES),
			min_length: minContributor,
			max_length: maxContributor,
			length_equals: (agg, def) => narrowBoth(agg, def.length),
			min_size: minContributor,
			max_size: maxContributor,
			size_equals: (agg, def) => narrowBoth(agg, def.size),
			string_format: (agg, def) => {
				setFormat(agg, def.format);
				if (def.pattern) addPattern(agg, def.pattern);
				if (def.format === "base64" || def.format === "base64url") agg.contentEncoding = def.format;
				if (def.local || def.precision === -1) agg.laxFormat = true;
			},
			mime_type: (agg, def) => intersectMime(agg, def.mime)
		};
		function aggregateChecks(schema) {
			const agg = {};
			const def = schema._zod.def;
			const list = schema._zod.traits.has("$ZodCheck") ? [schema, ...def.checks ?? []] : def.checks ?? [];
			for (const ch of list) contributors[ch._zod.def.check]?.(agg, ch._zod.def);
			const bag = schema._zod.bag;
			if (bag.minimum !== void 0) narrowMin(agg, "minimum", bag.minimum);
			if (bag.exclusiveMinimum !== void 0) narrowMin(agg, "exclusiveMinimum", bag.exclusiveMinimum);
			if (bag.maximum !== void 0) narrowMax(agg, "maximum", bag.maximum);
			if (bag.exclusiveMaximum !== void 0) narrowMax(agg, "exclusiveMaximum", bag.exclusiveMaximum);
			if (bag.multipleOf !== void 0) addDivisor(agg, bag.multipleOf);
			if (bag.format !== void 0) {
				agg.format ?? (agg.format = bag.format);
				if (bag.format.includes("int")) agg.isInt = true;
			}
			if (bag.mime) intersectMime(agg, bag.mime);
			for (const pattern of bag.patterns ?? []) addPattern(agg, pattern);
			return agg;
		}
		const formatMap = {
			guid: "uuid",
			url: "uri",
			datetime: "date-time",
			json_string: "json-string",
			regex: ""
		};
		const exactPatterns = /* @__PURE__ */ new Map([[base64Charset, base64], [base64urlCharset, base64url]]);
		const exactPattern = (p) => exactPatterns.get(p) ?? p;
		const stringProcessor = (schema, ctx, _json, _params) => {
			const json = _json;
			json.type = "string";
			const { minimum, maximum, format, patterns, contentEncoding, laxFormat } = aggregateChecks(schema);
			if (typeof minimum === "number") json.minLength = minimum;
			if (typeof maximum === "number") json.maxLength = maximum;
			if (format) {
				json.format = formatMap[format] ?? format;
				if (json.format === "") delete json.format;
				if (format === "time" || laxFormat) delete json.format;
			}
			if (contentEncoding) json.contentEncoding = contentEncoding;
			if (patterns && patterns.size > 0) {
				const patternList = [...patterns].map(exactPattern);
				if (patternList.length === 1) json.pattern = patternList[0].source;
				else if (patternList.length > 1) json.allOf = [...patternList.map((regex) => ({
					...ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0" ? { type: "string" } : {},
					pattern: regex.source
				}))];
			}
		};
		const numberProcessor = (schema, ctx, _json, params) => {
			const json = _json;
			const { minimum, maximum, multipleOf, exclusiveMaximum, exclusiveMinimum, isInt } = aggregateChecks(schema);
			json.type = isInt ? "integer" : "number";
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
			if (multipleOf) {
				const divisors = /* @__PURE__ */ new Set();
				for (const divisor of multipleOf) if (Number.isFinite(divisor) && divisor !== 0) divisors.add(Math.abs(divisor));
				else handleUnrepresentable(schema, ctx, json, params, `A multipleOf divisor of ${divisor} cannot be represented in JSON Schema`);
				const [first, ...rest] = divisors;
				if (first !== void 0) json.multipleOf = first;
				if (rest.length) json.allOf = [...json.allOf ?? [], ...rest.map((m) => ({ multipleOf: m }))];
			}
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
			if (values.length === 0) {
				json.not = {};
				return;
			}
			if (values.every((v) => typeof v === "number")) json.type = "number";
			if (values.every((v) => typeof v === "string")) json.type = "string";
			json.enum = values;
		};
		const literalProcessor = (schema, ctx, json, params) => {
			const def = schema._zod.def;
			if (def.values.length === 0) {
				json.not = {};
				return;
			}
			const vals = [];
			for (const val of def.values) if (val === void 0) {
				if (handleUnrepresentable(schema, ctx, json, params, "Literal `undefined` cannot be represented in JSON Schema")) return;
			} else if (typeof val === "bigint") {
				if (handleUnrepresentable(schema, ctx, json, params, "BigInt literals cannot be represented in JSON Schema")) return;
				vals.push(Number(val));
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
		const customProcessor = (schema, ctx, json, params) => {
			handleUnrepresentable(schema, ctx, json, params, "Custom types cannot be represented in JSON Schema");
		};
		const transformProcessor = (schema, ctx, json, params) => {
			handleUnrepresentable(schema, ctx, json, params, "Transforms cannot be represented in JSON Schema");
		};
		const arrayProcessor = (schema, ctx, _json, params) => {
			const json = _json;
			const def = schema._zod.def;
			const { minimum, maximum } = aggregateChecks(schema);
			if (typeof minimum === "number") json.minItems = minimum;
			if (typeof maximum === "number") json.maxItems = maximum;
			json.type = "array";
			json.items = processSchema(def.element, ctx, {
				...params,
				path: [...params.path, "items"]
			});
		};
		function inputOptin(schema) {
			const def = schema._zod.def;
			if (def.type === "pipe" && def.in._zod.traits.has("$ZodTransform")) return inputOptin(def.out);
			if (def.type === "catch") return inputOptin(def.innerType);
			return schema._zod.optin;
		}
		const objectProcessor = (schema, ctx, _json, params) => {
			const json = _json;
			const def = schema._zod.def;
			const shape = def.shape;
			if (Object.getOwnPropertySymbols(shape).length && handleUnrepresentable(schema, ctx, json, params, "Symbol keys cannot be represented in JSON Schema")) return;
			json.type = "object";
			json.properties = {};
			for (const key in shape) assignProp(json.properties, key, processSchema(shape[key], ctx, {
				...params,
				path: [
					...params.path,
					"properties",
					key
				]
			}));
			const requiredKeys = [];
			for (const key of Object.keys(shape)) {
				const field = def.shape[key];
				if (ctx.io === "input" ? inputOptin(field) === void 0 : field._zod.optout === void 0) requiredKeys.push(key);
			}
			if (requiredKeys.length > 0) json.required = requiredKeys;
			if (def.catchall?._zod.def.type === "never") json.additionalProperties = false;
			else if (!def.catchall) {
				if (ctx.io === "output") json.additionalProperties = false;
			} else if (def.catchall) json.additionalProperties = processSchema(def.catchall, ctx, {
				...params,
				path: [...params.path, "additionalProperties"]
			});
		};
		const unionProcessor = (schema, ctx, json, params) => {
			const def = schema._zod.def;
			const isExclusive = def.inclusive === false;
			const options = def.options.map((x, i) => processSchema(x, ctx, {
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
			const a = processSchema(def.left, ctx, {
				...params,
				path: [
					...params.path,
					"allOf",
					0
				]
			});
			const b = processSchema(def.right, ctx, {
				...params,
				path: [
					...params.path,
					"allOf",
					1
				]
			});
			const isSimpleIntersection = (val) => "allOf" in val && Object.keys(val).length === 1;
			const allOf = [...isSimpleIntersection(a) ? a.allOf : [a], ...isSimpleIntersection(b) ? b.allOf : [b]];
			json.allOf = allOf;
			ctx.intersections.push(allOf);
		};
		const nullableProcessor = (schema, ctx, json, params) => {
			const def = schema._zod.def;
			const inner = processSchema(def.innerType, ctx, params);
			const seen = ctx.seen.get(schema);
			if (ctx.target === "openapi-3.0") {
				seen.ref = def.innerType;
				json.nullable = true;
			} else json.anyOf = [inner, { type: "null" }];
		};
		const nonoptionalProcessor = (schema, ctx, _json, params) => {
			const def = schema._zod.def;
			processSchema(def.innerType, ctx, params);
			const seen = ctx.seen.get(schema);
			seen.ref = def.innerType;
		};
		/** Round-trips a default value through JSON so the emitted schema is guaranteed to be valid JSON.
		* A BigInt has no reliable encoding, so it goes through `unrepresentable` like any other
		* unrepresentable value. Returns a sentinel when the caller must not write a default of its own. */
		const UNREPRESENTABLE_DEFAULT = Symbol();
		function serializeDefaultValue(value, schema, ctx, json, params) {
			let unrepresentable = false;
			const serialized = JSON.stringify(value, (_, val) => {
				if (typeof val !== "bigint") return val;
				unrepresentable = true;
				return null;
			});
			if (!unrepresentable) return JSON.parse(serialized);
			handleUnrepresentable(schema, ctx, json, params, "BigInt defaults cannot be represented in JSON Schema");
			return UNREPRESENTABLE_DEFAULT;
		}
		const defaultProcessor = (schema, ctx, json, params) => {
			const def = schema._zod.def;
			processSchema(def.innerType, ctx, params);
			const seen = ctx.seen.get(schema);
			seen.ref = def.innerType;
			const value = serializeDefaultValue(def.defaultValue, schema, ctx, json, params);
			if (value !== UNREPRESENTABLE_DEFAULT) json.default = value;
		};
		const prefaultProcessor = (schema, ctx, json, params) => {
			const def = schema._zod.def;
			processSchema(def.innerType, ctx, params);
			const seen = ctx.seen.get(schema);
			seen.ref = def.innerType;
			if (ctx.io !== "input") return;
			const value = serializeDefaultValue(def.defaultValue, schema, ctx, json, params);
			if (value !== UNREPRESENTABLE_DEFAULT) json._prefault = value;
		};
		const catchProcessor = (schema, ctx, json, params) => {
			const def = schema._zod.def;
			processSchema(def.innerType, ctx, params);
			const seen = ctx.seen.get(schema);
			seen.ref = def.innerType;
			let catchValue;
			try {
				catchValue = def.catchValue(void 0);
			} catch {
				handleUnrepresentable(schema, ctx, json, params, "Dynamic catch values are not supported in JSON Schema");
				return;
			}
			json.default = catchValue;
		};
		const pipeProcessor = (schema, ctx, _json, params) => {
			const def = schema._zod.def;
			const inIsTransform = def.in._zod.traits.has("$ZodTransform");
			const innerType = ctx.io === "input" ? inIsTransform ? def.out : def.in : def.out;
			processSchema(innerType, ctx, params);
			const seen = ctx.seen.get(schema);
			seen.ref = innerType;
		};
		const readonlyProcessor = (schema, ctx, json, params) => {
			const def = schema._zod.def;
			processSchema(def.innerType, ctx, params);
			const seen = ctx.seen.get(schema);
			seen.ref = def.innerType;
			json.readOnly = true;
		};
		const optionalProcessor = (schema, ctx, _json, params) => {
			const def = schema._zod.def;
			processSchema(def.innerType, ctx, params);
			const seen = ctx.seen.get(schema);
			seen.ref = def.innerType;
		};
		//#endregion
		//#region ../../node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/classic/errors.js
		const _installedErrorProtos = /* @__PURE__ */ new WeakSet([Object.prototype, Error.prototype]);
		function _lazyMethod(proto, key, make) {
			Object.defineProperty(proto, key, {
				configurable: true,
				enumerable: false,
				get() {
					const value = make(this);
					Object.defineProperty(this, key, {
						value,
						configurable: true,
						writable: true
					});
					return value;
				},
				set(value) {
					Object.defineProperty(this, key, {
						value,
						configurable: true,
						writable: true
					});
				}
			});
		}
		const initializer = (inst, issues) => {
			$ZodError.init(inst, issues);
			inst.name = "ZodError";
			const proto = Object.getPrototypeOf(inst);
			if (_installedErrorProtos.has(proto)) return;
			_installedErrorProtos.add(proto);
			_lazyMethod(proto, "format", (self) => (mapper) => formatError(self, mapper));
			_lazyMethod(proto, "flatten", (self) => (mapper) => flattenError(self, mapper));
			_lazyMethod(proto, "addIssue", (self) => (issue) => {
				self.issues.push(issue);
				self.message = JSON.stringify(self.issues, jsonStringifyReplacer, 2);
			});
			_lazyMethod(proto, "addIssues", (self) => (issues) => {
				self.issues.push(...issues);
				self.message = JSON.stringify(self.issues, jsonStringifyReplacer, 2);
			});
			Object.defineProperty(proto, "isEmpty", {
				configurable: true,
				enumerable: false,
				get() {
					return this.issues.length === 0;
				}
			});
		};
		const ZodRealError = /*@__PURE__*/ $constructor("ZodError", initializer, void 0, { Parent: Error });
		//#endregion
		//#region ../../node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/classic/parse.js
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
		//#region ../../node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/classic/schemas.js
		function _ensureDefaultLocale() {
			if (!globalConfig.localeError) config(en_default());
		}
		function _ensureDefaultMemoizer() {
			if (!globalConfig.memoizer) config({ memoizer: memoizer() });
		}
		const ZodType = /*@__PURE__*/ $constructor("ZodType", (inst, def) => {
			_ensureDefaultLocale();
			$ZodType.init(inst, def);
			inst.def = def;
			inst.type = def.type;
			return inst;
		}, {
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
			apply(fn, ...args) {
				return args.length === 0 ? fn(this) : fn(this, ...args);
			},
			get "~standard"() {
				return hide(this, "~standard", {
					...standardProps(this),
					jsonSchema: {
						input: createStandardJSONSchemaMethod(this, "input"),
						output: createStandardJSONSchemaMethod(this, "output")
					}
				});
			},
			set "~standard"(value) {
				own(this, "~standard", value);
			},
			parse: function _parse(data, params) {
				return parse(this, data, params, { callee: _parse });
			},
			parseAsync: async function _parseAsync(data, params) {
				return await parseAsync(this, data, params, { callee: _parseAsync });
			},
			safeParse(data, params) {
				return safeParse(this, data, params);
			},
			async safeParseAsync(data, params) {
				return safeParseAsync(this, data, params);
			},
			get spa() {
				return this?.safeParseAsync;
			},
			set spa(value) {
				own(this, "spa", value);
			},
			validate(data, params) {
				return validate(this, data, params);
			},
			validateAsync(data, params) {
				return validateAsync$1(this, data, params);
			},
			encode: function _encode(data, params) {
				return encode(this, data, params, { callee: _encode });
			},
			decode: function _decode(data, params) {
				return decode(this, data, params, { callee: _decode });
			},
			encodeAsync: async function _encodeAsync(data, params) {
				return await encodeAsync(this, data, params, { callee: _encodeAsync });
			},
			decodeAsync: async function _decodeAsync(data, params) {
				return await decodeAsync(this, data, params, { callee: _decodeAsync });
			},
			safeEncode(data, params) {
				return safeEncode(this, data, params);
			},
			safeDecode(data, params) {
				return safeDecode(this, data, params);
			},
			async safeEncodeAsync(data, params) {
				return safeEncodeAsync(this, data, params);
			},
			async safeDecodeAsync(data, params) {
				return safeDecodeAsync(this, data, params);
			},
			toJSONSchema(params) {
				return createToJSONSchemaMethod(this, {})(params);
			},
			get description() {
				return globalRegistry.get(this)?.description;
			},
			get _def() {
				return this._zod.def;
			}
		});
		/** @internal */
		const _ZodString = /*@__PURE__*/ $constructor("_ZodString", (inst, def) => {
			$ZodString.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => stringProcessor(inst, ctx, json, params);
		}, /*@__PURE__*/ derived({
			format: (inst) => aggregateChecks(inst).format ?? null,
			minLength: (inst) => aggregateChecks(inst).minimum ?? null,
			maxLength: (inst) => aggregateChecks(inst).maximum ?? null
		}, {
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
		}));
		const ZodString = /*@__PURE__*/ $constructor("ZodString", (inst, def) => {
			$ZodString.init(inst, def);
			_ZodString.init(inst, def);
		}, {
			email(params) {
				return this.check(/* @__PURE__ */ _email(ZodEmail, params));
			},
			url(params) {
				return this.check(/* @__PURE__ */ _url(ZodURL, params));
			},
			jwt(params) {
				return this.check(/* @__PURE__ */ _jwt(ZodJWT, params));
			},
			emoji(params) {
				return this.check(/* @__PURE__ */ _emoji(ZodEmoji, params));
			},
			guid(params) {
				return this.check(/* @__PURE__ */ _guid(ZodGUID, params));
			},
			uuid(params) {
				return this.check(/* @__PURE__ */ _uuid(ZodUUID, params));
			},
			uuidv4(params) {
				return this.check(/* @__PURE__ */ _uuidv4(ZodUUID, params));
			},
			uuidv6(params) {
				return this.check(/* @__PURE__ */ _uuidv6(ZodUUID, params));
			},
			uuidv7(params) {
				return this.check(/* @__PURE__ */ _uuidv7(ZodUUID, params));
			},
			nanoid(params) {
				return this.check(/* @__PURE__ */ _nanoid(ZodNanoID, params));
			},
			cuid(params) {
				return this.check(/* @__PURE__ */ _cuid(ZodCUID, params));
			},
			cuid2(params) {
				return this.check(/* @__PURE__ */ _cuid2(ZodCUID2, params));
			},
			ulid(params) {
				return this.check(/* @__PURE__ */ _ulid(ZodULID, params));
			},
			base64(params) {
				return this.check(/* @__PURE__ */ _base64(ZodBase64, params));
			},
			base64url(params) {
				return this.check(/* @__PURE__ */ _base64url(ZodBase64URL, params));
			},
			xid(params) {
				return this.check(/* @__PURE__ */ _xid(ZodXID, params));
			},
			ksuid(params) {
				return this.check(/* @__PURE__ */ _ksuid(ZodKSUID, params));
			},
			ipv4(params) {
				return this.check(/* @__PURE__ */ _ipv4(ZodIPv4, params));
			},
			ipv6(params) {
				return this.check(/* @__PURE__ */ _ipv6(ZodIPv6, params));
			},
			cidrv4(params) {
				return this.check(/* @__PURE__ */ _cidrv4(ZodCIDRv4, params));
			},
			cidrv6(params) {
				return this.check(/* @__PURE__ */ _cidrv6(ZodCIDRv6, params));
			},
			e164(params) {
				return this.check(/* @__PURE__ */ _e164(ZodE164, params));
			},
			datetime(params) {
				return this.check(/* @__PURE__ */ _isoDateTime(ZodISODateTime, params));
			},
			date(params) {
				return this.check(/* @__PURE__ */ _isoDate(ZodISODate, params));
			},
			time(params) {
				return this.check(/* @__PURE__ */ _isoTime(ZodISOTime, params));
			},
			duration(params) {
				return this.check(/* @__PURE__ */ _isoDuration(ZodISODuration, params));
			}
		});
		function string(params) {
			return /* @__PURE__ */ _string(ZodString, params);
		}
		const ZodStringFormat = /*@__PURE__*/ $constructor("ZodStringFormat", (inst, def) => {
			$ZodStringFormat.init(inst, def);
			_ZodString.init(inst, def);
		});
		const ZodISODateTime = /*@__PURE__*/ $constructor("ZodISODateTime", (inst, def) => {
			$ZodISODateTime.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodISODate = /*@__PURE__*/ $constructor("ZodISODate", (inst, def) => {
			$ZodISODate.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodISOTime = /*@__PURE__*/ $constructor("ZodISOTime", (inst, def) => {
			$ZodISOTime.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodISODuration = /*@__PURE__*/ $constructor("ZodISODuration", (inst, def) => {
			$ZodISODuration.init(inst, def);
			ZodStringFormat.init(inst, def);
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
			inst.isFinite = true;
		}, /*@__PURE__*/ derived({
			minValue: (inst) => {
				const { minimum, exclusiveMinimum } = aggregateChecks(inst);
				return Math.max(minimum ?? Number.NEGATIVE_INFINITY, exclusiveMinimum ?? Number.NEGATIVE_INFINITY);
			},
			maxValue: (inst) => {
				const { maximum, exclusiveMaximum } = aggregateChecks(inst);
				return Math.min(maximum ?? Number.POSITIVE_INFINITY, exclusiveMaximum ?? Number.POSITIVE_INFINITY);
			},
			isInt: (inst) => {
				const { isInt, multipleOf } = aggregateChecks(inst);
				return !!isInt || !!multipleOf?.some(Number.isSafeInteger);
			},
			format: (inst) => aggregateChecks(inst).format ?? null
		}, {
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
		}));
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
			_ensureDefaultMemoizer();
			$ZodArray.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => arrayProcessor(inst, ctx, json, params);
			inst.element = def.element;
		}, {
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
		function array(element, params) {
			return /* @__PURE__ */ _array(ZodArray, element, params);
		}
		const ZodObject = /*@__PURE__*/ $constructor("ZodObject", (inst, def) => {
			_ensureDefaultMemoizer();
			$ZodObjectJIT.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => objectProcessor(inst, ctx, json, params);
			installLazyProp(inst, "shape", (self) => self._zod.def.shape, false);
		}, {
			keyof() {
				return _enum(Object.keys(this._zod.def.shape));
			},
			catchall(catchall) {
				return this.clone(mergeDefs(this._zod.def, { catchall }));
			},
			passthrough() {
				return this.clone(mergeDefs(this._zod.def, { catchall: unknown() }));
			},
			loose() {
				return this.clone(mergeDefs(this._zod.def, { catchall: unknown() }));
			},
			strict() {
				return this.clone(mergeDefs(this._zod.def, { catchall: never() }));
			},
			strip() {
				return this.clone(mergeDefs(this._zod.def, { catchall: void 0 }));
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
			exactPartial(...args) {
				return partial(ZodExactOptional, this, args[0], "exactPartial");
			},
			required(...args) {
				return required(ZodNonOptional, this, args[0]);
			}
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
			inst.options = [...inst._zod.values];
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
			_ensureDefaultMemoizer();
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
						if (!("input" in _issue)) _issue.input = payload.value;
						_issue.inst ?? (_issue.inst = inst);
						payload.issues.push(issue(_issue));
					}
				};
				const output = def.transform(payload.value, payload);
				if (output instanceof Promise) return output.then((output) => {
					payload.value = output;
					return payload;
				});
				payload.value = output;
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
				catchValue: typeof catchValue === "function" ? catchValue : constantCatch(catchValue)
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
		* `tests/locale-parity.spec.ts` as well.
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
			"panel.title": "工作区目录",
			"panel.subtitle": "主目录和附加目录遵循当前沙箱模式；workspace-write 可写，read-only 下都不可写。",
			"panel.primary": "主工作目录",
			"panel.primaryNote": "当前工作区主工作目录，不可移除",
			"panel.additional": "附属工作目录",
			"panel.empty": "还没有附属工作目录。",
			"panel.emptyHint": "添加后，Agent 可在同一会话中读写该目录，受限 shell 和终端同步生效。",
			"panel.noSession": "当前没有活动会话",
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
			"panel.title": "Workspace folders",
			"panel.subtitle": "The primary and additional folders follow the current sandbox mode: writable in workspace-write and read-only in read-only.",
			"panel.primary": "Primary working directory",
			"panel.primaryNote": "This workspace's primary working directory; it cannot be removed",
			"panel.additional": "Secondary working directories",
			"panel.empty": "No secondary working directories yet.",
			"panel.emptyHint": "Once added, the agent can use the folder in this session, including confined shells and terminals.",
			"panel.noSession": "No active session",
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
		* theme follow the host automatically. The recipes mirror the native surfaces
		* this UI sits beside — the sidebar footer trigger, the Modal primitive, and
		* the capsule Button (ADR-0006 records the decision).
		*
		* @module dsh-plugin-multi-root-workspace/client/styles
		*/
		/** The stylesheet text; every class is prefixed `mrfw-` to stay collision-free. */
		const STYLES = `
/* Sidebar footer row, mirroring the host ui-settings-general trigger: the row
 * wrapper overhangs each side by 2px (width calc(100% + 4px) against the
 * shell's 12px inline padding) so the icon's ink line lands at 18px from the
 * column edge — exactly where the Settings gear below sits. */
.mrfw-triggerRow {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  width: calc(100% + 4px);
  margin: 4px -2px;
}

.mrfw-triggerRow.mrfw-railRow {
  width: 36px;
  margin: 8px 0 10px;
}

.mrfw-trigger {
  box-sizing: border-box;
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  width: auto;
  height: 42px;
  margin: 0;
  padding: 0 10px 0 8px;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 14px;
  line-height: 22px;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  transition: background-color var(--ds-transition-duration-fast) var(--ds-ease-in-out);
}

.mrfw-trigger:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

.mrfw-triggerIcon {
  flex: none;
  display: inline-flex;
}

.mrfw-triggerLabel {
  overflow: hidden;
  white-space: nowrap;
}

.mrfw-triggerRail {
  flex: none;
  width: 36px;
  height: 36px;
  margin: 0;
  padding: 0;
  gap: 0;
  border-radius: 50%;
  justify-content: center;
}

.mrfw-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.mrfw-mask {
  position: absolute;
  inset: 0;
  background: var(--dsw-alias-bg-mask-1);
  backdrop-filter: var(--dsw-mask-blur);
}

.mrfw-dialog {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  width: min(640px, 100%);
  max-height: 100%;
  overflow: hidden;
  border: none;
  border-radius: 24px;
  background: var(--dsw-alias-bg-layer-2);
  box-shadow: var(--dsw-elevation-prominent);
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  outline: none;
}

.mrfw-header {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 22px 14px 12px 24px;
}

.mrfw-title {
  margin: 0;
  font-size: 16px;
  line-height: 24px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
}

.mrfw-close {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  color: var(--dsw-alias-label-secondary);
  transition: background-color var(--ds-transition-duration-fast) var(--ds-ease-in-out);
}

.mrfw-close:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

.mrfw-body {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
  padding: 0 24px 24px;
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
		const IconChevronUp = icon("IconChevronUpOutline14", "IconChevronUpOutlineRegular");
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
		//#region src/client/WorkspaceFoldersAction.tsx
		/**
		* The Workspace Folders panel: one sidebar footer action that opens a dialog
		* listing this session's workspace root and the additional roots registered for
		* it, with the actions the milestone requires — Add (through the composed
		* directory picker), Remove, Alias, Copy Path, Reveal, and reordering.
		*
		* Why a footer action and its own dialog, instead of a first-class panel: the
		* slots that can host a full panel (`sidebar.panellist` + the keyed `main`
		* panel) exist only in the pinned 0.1.5 surface, while `sidebar.footer.action`
		* exists in both supported runtimes — and `sidebar.workspaces` is a single slot
		* already owned by the workspace browser, so it cannot be extended in place.
		*
		* Styling is the host's, not this file's: the elements carry `mrfw-*` classes
		* resolved by the stylesheet the client entry injects (`styles.ts`), and every
		* color in that sheet is a host `--dsw-*` token, so the panel inherits the
		* native look — sidebar trigger, modal card, capsule buttons — in both themes
		* without naming a single color here (see ADR-0006).
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
		/** The 16px close glyph of the dialog's header button. */
		function CloseIcon() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				width: "16",
				height: "16",
				viewBox: "0 0 16 16",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "1.2",
				strokeLinecap: "round",
				"aria-hidden": "true",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M4 4l8 8M12 4l-8 8" })
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
		/** The sidebar footer action plus the dialog it opens. */
		function WorkspaceFoldersAction(props) {
			const [open, setOpen] = (0, react.useState)(false);
			const rail = props.wide === false;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: props.compact ? "mrfw-fileLauncher" : rail ? "mrfw-triggerRow mrfw-railRow" : "mrfw-triggerRow",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: props.compact ? "mrfw-btn mrfw-btnGhost" : rail ? "mrfw-trigger mrfw-triggerRail" : "mrfw-trigger",
					title: props.t("action.title"),
					"aria-haspopup": "dialog",
					"aria-expanded": open,
					onClick: () => {
						setOpen((value) => !value);
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "mrfw-triggerIcon",
						"aria-hidden": "true",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconFolderClose, { size: rail ? 18 : 16 })
					}), rail ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "mrfw-triggerLabel",
						children: props.t("action.label")
					})]
				})
			}), open ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WorkspaceFoldersDialog, {
				...props,
				onClose: () => {
					setOpen(false);
				}
			}) : null] });
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
		* The dialog: reads the view once per open, then after every mutation.
		*
		* Two shapes travel back over the channel, and they are handled separately on
		* purpose: every mutating endpoint answers with the whole refreshed view, while
		* `reveal` answers with the path it revealed and leaves the list untouched
		* (see `contract.ts`). Treating a reveal answer as a roots view is exactly the
		* contract mismatch this split removes.
		*/
		function WorkspaceFoldersDialog(props) {
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
			const dialogRef = (0, react.useRef)(null);
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
			(0, react.useEffect)(() => {
				dialogRef.current?.focus();
			}, []);
			const onDialogKeyDown = (event) => {
				if (event.key === "Escape") {
					if (menuFor !== void 0) return;
					event.stopPropagation();
					props.onClose();
					return;
				}
				if (event.key !== "Tab") return;
				const dialog = dialogRef.current;
				if (dialog === null) return;
				const focusable = Array.from(dialog.querySelectorAll("button, input, [href], [tabindex]:not([tabindex=\"-1\"])")).filter((element) => !element.hasAttribute("disabled"));
				if (focusable.length === 0) {
					event.preventDefault();
					return;
				}
				const first = focusable[0];
				const last = focusable[focusable.length - 1];
				const active = dialog.ownerDocument.activeElement;
				if (event.shiftKey && (active === first || !(active instanceof HTMLElement) || !dialog.contains(active))) {
					event.preventDefault();
					last.focus();
				} else if (!event.shiftKey && (active === last || !(active instanceof HTMLElement) || !dialog.contains(active))) {
					event.preventDefault();
					first.focus();
				}
			};
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
			* @returns whether the host accepted it (the caller decides whether to clear
			*   the input it came from).
			*/
			const mutate = (0, react.useCallback)(async (endpoint, payload) => {
				if (panel === void 0) return false;
				const base = requestBase();
				if (base === void 0) {
					setState({
						view: void 0,
						error: void 0,
						busy: false,
						noSession: true
					});
					return false;
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
					if (!mounted.current || epoch !== requestEpoch.current) return false;
					setState({
						view,
						error: void 0,
						busy: false,
						noSession: false
					});
					return true;
				} catch (error) {
					if (!mounted.current || epoch !== requestEpoch.current) return false;
					setState((previous) => ({
						...previous,
						error: asPanelError(error),
						busy: false
					}));
					return false;
				}
			}, [panel, requestBase]);
			/**
			* Open the composed picker and add whatever it returns. A picker that is not
			* composed, or a dialog the operator dismissed, adds nothing — it never falls
			* back to the manual field, because the operator who clicked "Add folder…"
			* asked for the picker, not for the text they may have typed earlier.
			*/
			const addViaPicker = (0, react.useCallback)(async () => {
				if (props.pickDirectory === void 0) return;
				let picked = null;
				try {
					picked = await props.pickDirectory();
				} catch (error) {
					setState((previous) => ({
						...previous,
						error: asPanelError(error)
					}));
					return;
				}
				if (picked === null || picked.trim() === "") return;
				await mutate("add", { path: picked });
			}, [mutate, props]);
			/**
			* Add the path in the manual field — the one the operator typed. The picker
			* plays no part here: this is the entry point the confirm button and the
			* Enter key use.
			*/
			const addManualPath = (0, react.useCallback)(async () => {
				const path = manualPath.trim();
				if (path === "") return;
				if (await mutate("add", { path })) setManualPath("");
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
			const copyPath = (0, react.useCallback)(async (root) => {
				try {
					await navigator.clipboard.writeText(root.path);
					const key = rowKey(root);
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
			const roots = state.view?.roots ?? [];
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "mrfw-overlay",
				role: "presentation",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "mrfw-mask",
					role: "presentation",
					onClick: (event) => {
						if (event.target === event.currentTarget) props.onClose();
					}
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					ref: dialogRef,
					tabIndex: -1,
					onKeyDown: onDialogKeyDown,
					className: "mrfw-dialog",
					role: "dialog",
					"aria-modal": "true",
					"aria-label": t("panel.title"),
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "mrfw-header",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
							className: "mrfw-title",
							children: t("panel.title")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "mrfw-close",
							title: t("panel.close"),
							"aria-label": t("panel.close"),
							onClick: props.onClose,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CloseIcon, {})
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "mrfw-body",
						children: [state.noSession ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "mrfw-note",
							children: t("panel.noSession")
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "mrfw-description",
								children: t("panel.subtitle")
							}),
							state.error === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
								role: "alert",
								className: "mrfw-alert",
								children: [t(errorKeyOf(state.error.code)), state.error.code === "unavailable" || state.error.code === "panel/internal" ? ` (${state.error.message})` : ""]
							}),
							state.view?.unavailable === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								role: "alert",
								className: "mrfw-alert",
								children: state.view.unavailable
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
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "mrfw-row mrfw-rowBare",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "mrfw-rootText",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "mrfw-rootName",
											children: state.view === void 0 ? "…" : state.view.primaryName ?? basename(state.view.primaryRoot)
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "mrfw-rootPath",
											children: state.view?.primaryRoot ?? "…"
										})]
									})
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
									state.view === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: "mrfw-note",
										children: t("panel.loading")
									}) : null,
									state.view !== void 0 && roots.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
										className: "mrfw-note",
										children: [
											t("panel.empty"),
											" ",
											t("panel.emptyHint")
										]
									}) : null,
									roots.map((root, index) => {
										const key = rowKey(root);
										const isCommon = root.source === "common";
										const canMoveUp = !isCommon && index > 0;
										const canMoveDown = !isCommon && index < roots.length - 1 && roots[index + 1]?.source !== "common";
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
														copyPath(root);
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
														move(root, roots[index - 1]);
													},
													icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconChevronUp, {}),
													label: t("panel.moveUp")
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconButton, {
													disabled: state.busy || !canMoveDown,
													onClick: () => {
														move(root, roots[index + 2]);
													},
													icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconChevronDown, {}),
													label: t("panel.moveDown")
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
													open: menuFor === key,
													onClose: () => {
														setMenuFor(void 0);
													},
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
													closeOnPointerLeave: true,
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
									})
								]
							})
						] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "mrfw-actions",
							children: [
								state.noSession || props.pickDirectory === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconButton, {
									variant: "outline",
									disabled: state.busy,
									onClick: () => {
										addViaPicker();
									},
									icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconPlus, {}),
									label: t("panel.add")
								}),
								state.noSession ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: "mrfw-input",
									value: manualPath,
									placeholder: t("panel.addManual"),
									onChange: (event) => {
										setManualPath(event.target.value);
									},
									onKeyDown: (event) => {
										if (event.key === "Enter") addManualPath();
									}
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Action, {
									onClick: () => {
										addManualPath();
									},
									disabled: state.busy || manualPath.trim() === "",
									variant: "primary",
									children: t("panel.addConfirm")
								})] }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Action, {
									onClick: () => {
										refresh();
									},
									disabled: state.busy,
									variant: "outline",
									children: t("panel.retry")
								})
							]
						})]
					})]
				})]
			});
		}
		/** Normalize any thrown value into a `PanelError` the dialog can render. */
		function asPanelError(error) {
			if (error instanceof PanelError) return error;
			return new PanelError("fallback", error instanceof Error ? error.message : String(error));
		}
		//#endregion
		//#region src/client/index.ts
		/** The footer-action cell this plugin owns. */
		const SLOT_ID = "multi-root-folders";
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
			const pickDirectory = async () => {
				const workspace = readService(ctx, "uiWorkspace");
				if (workspace?.pickDirectory === void 0) return null;
				return await workspace.pickDirectory();
			};
			const sessionId = () => currentSessionIdOf(readService(ctx, "sessions"));
			const t = ctx.locale.bind(NS);
			ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
				name: "sidebar.footer.action",
				id: SLOT_ID,
				order: 50,
				label: () => t("action.label"),
				locale: NS
			}, (owner) => {
				const wide = owner?.wide;
				return (0, react.createElement)(WorkspaceFoldersAction, {
					panel,
					pickDirectory,
					sessionId,
					t,
					...wide === void 0 ? {} : { wide }
				});
			}));
			ctx.slots.inject("sidebar.right.tab.files.actions", () => ctx.slots.register({
				name: "sidebar.right.tab.files.actions",
				id: SLOT_ID,
				order: 50
			}, () => (0, react.createElement)(WorkspaceFoldersAction, {
				panel,
				pickDirectory,
				sessionId,
				t,
				compact: true
			})));
		}
		/**
		* Read one optional service by name.
		*
		* Both lookups are deliberately untyped reads: the client Session Controller
		* and the workspace UI service are composed by the surface, not by this
		* plugin, and neither is a dependency it may assume (the footer action exists
		* on surfaces where they do not). Absence is a supported state — the panel then
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