// src/index.ts
import { copyFile, lstat, mkdir, readdir, rename, rm, unlink } from "node:fs/promises";
import { homedir } from "node:os";

// ../../node_modules/.pnpm/@deepseek-ai+cosmokit@1.9.0/node_modules/@deepseek-ai/cosmokit/lib/index.js
function isNullable(value) {
  return value === null || value === void 0;
}
function isPlainObject(data) {
  return data && typeof data === "object" && !Array.isArray(data);
}
function filterKeys(object, filter) {
  return Object.fromEntries(Object.entries(object).filter(([key, value]) => filter(key, value)));
}
function mapValues(object, transform) {
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, transform(value, key)]));
}
function pick(source, keys, forced) {
  if (!keys) return { ...source };
  const result = {};
  for (const key of keys) if (forced || source[key] !== void 0) result[key] = source[key];
  return result;
}
function defineProperty(object, key, value) {
  return Object.defineProperty(object, key, {
    writable: true,
    value,
    enumerable: false
  });
}
var write = Symbol.for("cosmokit.volatile.write");
function snapshot(value, ancestors = /* @__PURE__ */ new Set()) {
  if (typeof value === "function") throw new TypeError("volatile config cannot contain functions");
  if (value === null || typeof value !== "object") return value;
  if (ancestors.has(value)) throw new TypeError("volatile config cannot contain cycles");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return Object.freeze(value.map((item) => snapshot(item, ancestors)));
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError("volatile config objects must be plain objects or arrays");
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, snapshot(item, ancestors)])));
  } finally {
    ancestors.delete(value);
  }
}
function createVolatile(value) {
  let current = snapshot(value);
  return Object.freeze({
    get: () => current,
    [write]: (value2) => {
      current = value2;
    }
  });
}
function isVolatile(value) {
  return typeof value === "object" && value !== null && write in value;
}
function is(type, value) {
  if (arguments.length === 1) return (value2) => is(type, value2);
  return type in globalThis && value instanceof globalThis[type] || Object.prototype.toString.call(value).slice(8, -1) === type;
}
function isArrayBufferLike(value) {
  return is("ArrayBuffer", value) || is("SharedArrayBuffer", value);
}
function isArrayBufferSource(value) {
  return isArrayBufferLike(value) || ArrayBuffer.isView(value);
}
var Binary;
(function(Binary2) {
  Binary2.is = isArrayBufferLike;
  Binary2.isSource = isArrayBufferSource;
  function fromSource(source) {
    if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
    else return source;
  }
  Binary2.fromSource = fromSource;
  function toBase64(source) {
    source = fromSource(source);
    if (typeof Buffer !== "undefined") return Buffer.from(source).toString("base64");
    let binary = "";
    const bytes = new Uint8Array(source);
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }
  Binary2.toBase64 = toBase64;
  function fromBase64(source) {
    if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "base64"));
    return Uint8Array.from(atob(source), (c) => c.charCodeAt(0));
  }
  Binary2.fromBase64 = fromBase64;
  function toHex(source) {
    source = fromSource(source);
    if (typeof Buffer !== "undefined") return Buffer.from(source).toString("hex");
    return Array.from(new Uint8Array(source), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  Binary2.toHex = toHex;
  function fromHex(source) {
    if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "hex"));
    const hex = source.length % 2 === 0 ? source : source.slice(0, source.length - 1);
    const buffer = [];
    for (let i = 0; i < hex.length; i += 2) buffer.push(parseInt(`${hex[i]}${hex[i + 1]}`, 16));
    return Uint8Array.from(buffer).buffer;
  }
  Binary2.fromHex = fromHex;
})(Binary || (Binary = {}));
var base64ToArrayBuffer = Binary.fromBase64;
var arrayBufferToBase64 = Binary.toBase64;
var hexToArrayBuffer = Binary.fromHex;
var arrayBufferToHex = Binary.toHex;
function clone(source, refs = /* @__PURE__ */ new Map()) {
  if (!source || typeof source !== "object") return source;
  if (is("Date", source)) return new Date(source.valueOf());
  if (is("RegExp", source)) return new RegExp(source.source, source.flags);
  if (isArrayBufferLike(source)) return source.slice(0);
  if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
  const cached = refs.get(source);
  if (cached) return cached;
  if (Array.isArray(source)) {
    const result2 = [];
    refs.set(source, result2);
    source.forEach((value, index) => {
      result2[index] = Reflect.apply(clone, null, [value, refs]);
    });
    return result2;
  }
  const result = Object.create(Object.getPrototypeOf(source));
  refs.set(source, result);
  for (const key of Reflect.ownKeys(source)) {
    const descriptor = { ...Reflect.getOwnPropertyDescriptor(source, key) };
    if ("value" in descriptor) descriptor.value = Reflect.apply(clone, null, [descriptor.value, refs]);
    Reflect.defineProperty(result, key, descriptor);
  }
  return result;
}
function deepEqual(a, b, strict) {
  const ancestors = /* @__PURE__ */ new Set();
  function compare(a2, b2) {
    if (a2 === b2) return true;
    if (isVolatile(a2) || isVolatile(b2)) return isVolatile(a2) && isVolatile(b2);
    if (!strict && isNullable(a2) && isNullable(b2)) return true;
    if (typeof a2 !== typeof b2 || typeof a2 !== "object" || !a2 || !b2) return false;
    if (ancestors.has(a2)) return false;
    function check(test, then) {
      return test(a2) ? test(b2) ? then(a2, b2) : false : test(b2) ? false : void 0;
    }
    ancestors.add(a2);
    try {
      return check(Array.isArray, (a3, b3) => {
        if (a3.length !== b3.length) return false;
        for (let index = 0; index < a3.length; index++) if (!compare(a3[index], b3[index])) return false;
        return true;
      }) ?? check(is("Date"), (a3, b3) => a3.valueOf() === b3.valueOf()) ?? check(is("URL"), (a3, b3) => a3.href === b3.href) ?? check(is("RegExp"), (a3, b3) => a3.source === b3.source && a3.flags === b3.flags) ?? check(isArrayBufferLike, (a3, b3) => {
        if (a3.byteLength !== b3.byteLength) return false;
        const viewA = new Uint8Array(a3);
        const viewB = new Uint8Array(b3);
        for (let i = 0; i < viewA.length; i++) if (viewA[i] !== viewB[i]) return false;
        return true;
      }) ?? ((!strict || [a2, b2].every((value) => Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) && Object.keys({
        ...a2,
        ...b2
      }).every((key) => compare(a2[key], b2[key])));
    } finally {
      ancestors.delete(a2);
    }
  }
  return compare(a, b);
}
function tokenize(source, delimiters, delimiter) {
  const output = [];
  let state = 0;
  for (let i = 0; i < source.length; i++) {
    const code = source.charCodeAt(i);
    if (code >= 65 && code <= 90) {
      if (state === 1) {
        const next = source.charCodeAt(i + 1);
        if (next >= 97 && next <= 122) output.push(delimiter);
        output.push(code + 32);
      } else {
        if (state !== 0) output.push(delimiter);
        output.push(code + 32);
      }
      state = 1;
    } else if (code >= 97 && code <= 122) {
      output.push(code);
      state = 2;
    } else if (delimiters.includes(code)) {
      if (state !== 0) output.push(delimiter);
      state = 0;
    } else output.push(code);
  }
  return String.fromCharCode(...output);
}
function paramCase(source) {
  return tokenize(source, [45, 95], 45);
}
var hyphenate = paramCase;
var Time;
(function(Time2) {
  Time2.millisecond = 1;
  Time2.second = 1e3;
  Time2.minute = Time2.second * 60;
  Time2.hour = Time2.minute * 60;
  Time2.day = Time2.hour * 24;
  Time2.week = Time2.day * 7;
  let timezoneOffset = (/* @__PURE__ */ new Date()).getTimezoneOffset();
  function setTimezoneOffset(offset) {
    timezoneOffset = offset;
  }
  Time2.setTimezoneOffset = setTimezoneOffset;
  function getTimezoneOffset() {
    return timezoneOffset;
  }
  Time2.getTimezoneOffset = getTimezoneOffset;
  function getDateNumber(date2 = /* @__PURE__ */ new Date(), offset) {
    if (typeof date2 === "number") date2 = new Date(date2);
    if (offset === void 0) offset = timezoneOffset;
    return Math.floor((date2.valueOf() / Time2.minute - offset) / 1440);
  }
  Time2.getDateNumber = getDateNumber;
  function fromDateNumber(value, offset) {
    const date2 = new Date(value * Time2.day);
    if (offset === void 0) offset = timezoneOffset;
    return new Date(+date2 + offset * Time2.minute);
  }
  Time2.fromDateNumber = fromDateNumber;
  const numeric = /\d+(?:\.\d+)?/.source;
  const timeRegExp = new RegExp(`^${[
    "w(?:eek(?:s)?)?",
    "d(?:ay(?:s)?)?",
    "h(?:our(?:s)?)?",
    "m(?:in(?:ute)?(?:s)?)?",
    "s(?:ec(?:ond)?(?:s)?)?"
  ].map((unit) => `(${numeric}${unit})?`).join("")}$`);
  function parseTime(source) {
    const capture = timeRegExp.exec(source);
    if (!capture) return 0;
    return (parseFloat(capture[1]) * Time2.week || 0) + (parseFloat(capture[2]) * Time2.day || 0) + (parseFloat(capture[3]) * Time2.hour || 0) + (parseFloat(capture[4]) * Time2.minute || 0) + (parseFloat(capture[5]) * Time2.second || 0);
  }
  Time2.parseTime = parseTime;
  function parseDate(date2) {
    const parsed = parseTime(date2);
    if (parsed) date2 = Date.now() + parsed;
    else if (/^\d{1,2}(:\d{1,2}){1,2}$/.test(date2)) date2 = `${(/* @__PURE__ */ new Date()).toLocaleDateString()}-${date2}`;
    else if (/^\d{1,2}-\d{1,2}-\d{1,2}(:\d{1,2}){1,2}$/.test(date2)) date2 = `${(/* @__PURE__ */ new Date()).getFullYear()}-${date2}`;
    return date2 ? new Date(date2) : /* @__PURE__ */ new Date();
  }
  Time2.parseDate = parseDate;
  function format(ms) {
    const abs = Math.abs(ms);
    if (abs >= Time2.day - Time2.hour / 2) return Math.round(ms / Time2.day) + "d";
    else if (abs >= Time2.hour - Time2.minute / 2) return Math.round(ms / Time2.hour) + "h";
    else if (abs >= Time2.minute - Time2.second / 2) return Math.round(ms / Time2.minute) + "m";
    else if (abs >= Time2.second) return Math.round(ms / Time2.second) + "s";
    return ms + "ms";
  }
  Time2.format = format;
  function toDigits(source, length = 2) {
    return source.toString().padStart(length, "0");
  }
  Time2.toDigits = toDigits;
  function template(template2, time = /* @__PURE__ */ new Date()) {
    return template2.replace("yyyy", time.getFullYear().toString()).replace("yy", time.getFullYear().toString().slice(2)).replace("MM", toDigits(time.getMonth() + 1)).replace("dd", toDigits(time.getDate())).replace("hh", toDigits(time.getHours())).replace("mm", toDigits(time.getMinutes())).replace("ss", toDigits(time.getSeconds())).replace("SSS", toDigits(time.getMilliseconds(), 3));
  }
  Time2.template = template;
})(Time || (Time = {}));

// ../../node_modules/.pnpm/@deepseek-ai+cordis@4.1.0_@deepseek-ai+cordis-plugin-include@1.1.0_@deepseek-ai+cordis-plugin-loader@1.1.0/node_modules/@deepseek-ai/cordis/lib/index.js
var DisposableList = class {
  sn = 0;
  map = /* @__PURE__ */ new Map();
  weak = /* @__PURE__ */ new WeakMap();
  get length() {
    return this.map.size;
  }
  push(value) {
    const sn = ++this.sn;
    this.map.set(sn, value);
    this.weak.set(value, sn);
    return () => this.map.delete(sn);
  }
  delete(value) {
    const sn = this.weak.get(value);
    if (!sn) return false;
    return this.map.delete(sn);
  }
  clear() {
    const values = [...this.map.values()];
    this.map.clear();
    return values.reverse();
  }
  [Symbol.iterator]() {
    return this.map.values();
  }
  [Symbol.for("nodejs.util.inspect.custom")]() {
    return [...this];
  }
};
var symbols = {
  shadow: Symbol.for("cordis.shadow"),
  caller: Symbol.for("cordis.caller"),
  receiver: Symbol.for("cordis.receiver"),
  original: Symbol.for("cordis.original"),
  metadata: Symbol.for("cordis.metadata"),
  initHooks: Symbol.for("cordis.initHooks"),
  checkProto: Symbol.for("cordis.checkProto"),
  effect: Symbol.for("cordis.effect"),
  filter: Symbol.for("cordis.filter"),
  isolate: Symbol.for("cordis.isolate"),
  intercept: Symbol.for("cordis.intercept"),
  init: Symbol.for("cordis.init"),
  check: Symbol.for("cordis.check"),
  config: Symbol.for("cordis.config"),
  invoke: Symbol.for("cordis.invoke"),
  extend: Symbol.for("cordis.extend"),
  tracker: Symbol.for("cordis.tracker"),
  resolveConfig: Symbol.for("cordis.resolveConfig")
};
var GeneratorFunction = function* () {
}.constructor;
var AsyncGeneratorFunction = async function* () {
}.constructor;
function isConstructor(func) {
  if (!func.prototype) return false;
  if (func instanceof GeneratorFunction) return false;
  if (AsyncGeneratorFunction !== Function && func instanceof AsyncGeneratorFunction) return false;
  return true;
}
function joinPrototype(proto1, proto2) {
  if (proto1 === Object.prototype) return proto2;
  const result = Object.create(joinPrototype(Object.getPrototypeOf(proto1), proto2));
  for (const key of Reflect.ownKeys(proto1)) Object.defineProperty(result, key, Object.getOwnPropertyDescriptor(proto1, key));
  return result;
}
function isObject(value) {
  return value && (typeof value === "object" || typeof value === "function");
}
function getPropertyDescriptor(target, prop) {
  let proto = target;
  while (proto) {
    const desc = Reflect.getOwnPropertyDescriptor(proto, prop);
    if (desc) return desc;
    proto = Object.getPrototypeOf(proto);
  }
}
function getTraceable(ctx, value) {
  if (!isObject(value)) return value;
  if (Object.hasOwn(value, symbols.shadow)) return Object.getPrototypeOf(value);
  const tracker = value[symbols.tracker];
  if (!tracker) return value;
  return createTraceable(ctx, value, tracker);
}
function withProps(target, props) {
  if (!props) return target;
  return new Proxy(target, {
    get: (target2, prop, receiver) => {
      if (prop in props && prop !== "constructor") return Reflect.get(props, prop, receiver);
      return Reflect.get(target2, prop, receiver);
    },
    set: (target2, prop, value, receiver) => {
      if (prop in props && prop !== "constructor") return Reflect.set(props, prop, value, receiver);
      return Reflect.set(target2, prop, value, receiver);
    }
  });
}
function withProp(target, prop, value) {
  return withProps(target, Object.defineProperty(/* @__PURE__ */ Object.create(null), prop, {
    value,
    writable: false
  }));
}
function createShadow(useSite, target, property2, receiver) {
  if (!property2) return receiver;
  const value = getPropertyDescriptor(target, property2)?.value;
  if (!value) return receiver;
  const defSite = value[symbols.shadow] ?? value;
  return withProp(receiver, property2, useSite.extend({ [symbols.shadow]: defSite }));
}
function createShadowMethod(ctx, value, outer, shadow) {
  return new Proxy(value, { apply: (target, thisArg, args) => {
    if (thisArg === outer) thisArg = shadow;
    return getTraceable(ctx, Reflect.apply(target, thisArg, args));
  } });
}
function createTraceable(ctx, value, tracker) {
  const defSite = ctx[symbols.shadow] ?? ctx;
  const useSite = ctx[symbols.shadow] ? Object.getPrototypeOf(ctx) : ctx;
  const proxy = new Proxy(value, {
    get: (target, prop, receiver) => {
      if (prop === symbols.original) return target;
      if (prop === symbols.caller) return defSite;
      if (prop === tracker.property) return useSite;
      if (typeof prop === "symbol") return Reflect.get(target, prop, receiver);
      if (tracker.associate && useSite.reflect.props[`${tracker.associate}.${prop}`]) return Reflect.get(ctx, `${tracker.associate}.${prop}`, withProp(ctx, symbols.receiver, receiver));
      let shadow, innerValue;
      const desc = getPropertyDescriptor(target, prop);
      if (desc && "value" in desc) innerValue = desc.value;
      else {
        shadow = createShadow(useSite, target, tracker.property, receiver);
        innerValue = Reflect.get(target, prop, shadow);
      }
      const innerTracker = innerValue?.[symbols.tracker];
      if (innerTracker) return createTraceable(useSite, innerValue, innerTracker);
      else if (!tracker.noShadow && typeof innerValue === "function") {
        shadow ??= createShadow(useSite, target, tracker.property, receiver);
        return createShadowMethod(useSite, innerValue, receiver, shadow);
      } else return innerValue;
    },
    set: (target, prop, value2, receiver) => {
      if (prop === symbols.original) return false;
      if (prop === symbols.caller) return false;
      if (prop === tracker.property) return false;
      if (typeof prop === "symbol") return Reflect.set(target, prop, value2, receiver);
      if (tracker.associate && useSite.reflect.props[`${tracker.associate}.${prop}`]) return Reflect.set(ctx, `${tracker.associate}.${prop}`, value2, withProp(ctx, symbols.receiver, receiver));
      const shadow = createShadow(useSite, target, tracker.property, receiver);
      return Reflect.set(target, prop, value2, shadow);
    },
    apply: (target, thisArg, args) => {
      return applyTraceable(tracker.noShadow ? proxy : createShadow(useSite, target, tracker.property, proxy), target, thisArg, args);
    }
  });
  return proxy;
}
function applyTraceable(proxy, value, thisArg, args) {
  if (!value[symbols.invoke]) return Reflect.apply(value, thisArg, args);
  return value[symbols.invoke].apply(proxy, args);
}
function createCallable(name2, proto, tracker) {
  const self = function(...args) {
    const proxy = createTraceable(self["ctx"], self, tracker);
    return Reflect.apply(proxy, this, args);
  };
  defineProperty(self, "name", name2);
  return Object.setPrototypeOf(self, proto);
}
function handleError(info, reason, getOuterStack) {
  const innerLines = info.error.stack.split("\n");
  if (typeof reason?.stack !== "string") {
    const outerError = new Error(reason);
    const lines2 = outerError.stack.split("\n");
    lines2.splice(1, Infinity, ...getOuterStack());
    outerError.stack = lines2.join("\n");
    throw outerError;
  }
  const lines = reason.stack.split("\n");
  let index = lines.indexOf(innerLines[2]);
  if (index === -1) throw reason;
  index -= info.offset;
  while (index > 0) {
    if (!lines[index - 1].endsWith(" (<anonymous>)")) break;
    index -= 1;
  }
  lines.splice(index, Infinity, ...getOuterStack());
  reason.stack = lines.join("\n");
  throw reason;
}
function composeError(callback, getOuterStack = buildOuterStack()) {
  const info = {
    offset: 1,
    error: /* @__PURE__ */ new Error()
  };
  try {
    const result = callback(info);
    if (isObject(result) && "then" in result) return result.then(void 0, (reason) => handleError(info, reason, getOuterStack));
    else return result;
  } catch (reason) {
    handleError(info, reason, getOuterStack);
  }
}
function buildOuterStack(offset = 0) {
  const outerError = /* @__PURE__ */ new Error();
  return () => outerError.stack.split("\n").slice(3 + offset);
}
var kValidationError = Symbol.for("ValidationError");
var ValidationError = class extends TypeError {
  name = "ValidationError";
  /**
  * Build the aggregated message from schema issues.
  *
  * @param issues — the standard-schema issues, one message line each.
  */
  constructor(issues) {
    super(`invalid config:
` + issues.map((issue) => {
      if (issue.path) return `  - ${issue.message} (at ${issue.path.join(".")})`;
      else return `  - ${issue.message}`;
    }).join("\n"));
  }
};
Object.defineProperty(ValidationError.prototype, kValidationError, { value: true });
function resolveConfig(runtime, config) {
  if (!runtime.Config) return config;
  const result = runtime.Config["~standard"].validate(config);
  if ("then" in result) throw new TypeError("Async config validation is not supported");
  if (result.issues) throw new ValidationError(result.issues);
  else return result.value;
}
var effectInertia = /* @__PURE__ */ new WeakMap();
function runDisposable(dispose) {
  const result = dispose();
  return effectInertia.get(dispose)?.() ?? result;
}
function emitPluginDisposed(context, fiber) {
  const args = ["internal/plugin", fiber];
  let callbacks;
  try {
    callbacks = context.events.dispatch("emit", args);
  } catch (error) {
    context.logger.error(error);
    return;
  }
  for (const callback of callbacks) try {
    const returned = callback(...args);
    Promise.resolve(returned).catch((error) => context.logger.error(error));
  } catch (error) {
    context.logger.error(error);
  }
}
var CordisError = class CordisError2 extends Error {
  code;
  /**
  * @param code — the stable error code; also the default message.
  * @param message — optional human-readable override.
  */
  constructor(code, message) {
    super(message ?? CordisError2.Code[code]);
    this.code = code;
  }
};
(function(CordisError3) {
  CordisError3.Code = { INACTIVE_EFFECT: "cannot create effect on inactive context" };
})(CordisError || (CordisError = {}));
var INACTIVE = "__INACTIVE__";
var Fiber = class {
  parent;
  inject;
  runtime;
  /** Unique id within the registry; 0 for the root fiber, `null` once disposed. */
  uid;
  /** The context this fiber's plugin runs in (extends the parent context). */
  ctx;
  /** Raw plugin input retained for the next activation. */
  config;
  /** Current lifecycle state; transitions emit `internal/status`. */
  state = 0;
  /** Dispose this fiber: unload the plugin, then settle once cleanup finished. */
  dispose;
  /** Required implementations retained through dependent teardown. */
  committed;
  /** Service implementations owned by this fiber, including isolated provisions. */
  provisions = /* @__PURE__ */ new Set();
  /** The in-flight load/unload transition, if one is currently running. */
  inertia;
  _hooks = /* @__PURE__ */ Object.create(null);
  _disposables = new DisposableList();
  context;
  _error;
  _revision = 0;
  _configRevision = 0;
  _effectiveConfig;
  _runner;
  _store = /* @__PURE__ */ Object.create(null);
  _release;
  /**
  * Create a fiber. Plugin authors normally obtain fibers from `ctx.plugin()`
  * rather than constructing them directly.
  *
  * @param parent — the context the plugin was loaded from.
  * @param config — raw config, validated against the runtime's schema.
  * @param inject — resolved dependency map (service name → intercept config).
  * @param runtime — the shared plugin runtime, or `null` for the root fiber.
  * @param getOuterStack — captures the caller stack for effect diagnostics.
  */
  constructor(parent, config, inject2, runtime, getOuterStack) {
    this.parent = parent;
    this.inject = inject2;
    this.runtime = runtime;
    this.config = config;
    const collect = (dispose) => {
      this._disposables.push(dispose);
    };
    if (runtime) {
      this.uid = parent.registry.counter;
      this.ctx = this.context = parent.extend({ fiber: this });
      const injectEntries = Object.entries(this.inject);
      if (injectEntries.length) {
        this.ctx[Context.intercept] = Object.create(parent[Context.intercept]);
        for (const [name2, config2] of injectEntries) {
          if (isNullable(config2)) continue;
          this.ctx[Context.intercept][name2] = config2;
        }
      }
      this._runner = {
        epoch: INACTIVE,
        getOuterStack,
        execute: function() {
          const config2 = this.resolveConfig(this.config);
          this._effectiveConfig = config2;
          if (isConstructor(runtime.callback)) {
            const instance = new runtime.callback(this.ctx, config2);
            for (const hook of instance?.[symbols.initHooks] ?? []) hook();
            return instance?.[symbols.init]?.();
          } else return runtime.callback(this.ctx, config2);
        },
        collect
      };
      this.dispose = parent.fiber.effect(() => {
        const remove = runtime.fibers.push(this);
        return async () => {
          this.uid = null;
          emitPluginDisposed(this.context, this);
          if (this.ctx.registry.has(runtime.callback)) {
            remove();
            if (!runtime.fibers.length) this.ctx.registry.delete(runtime.callback);
          }
          this._setEpoch(INACTIVE);
          if (!this.inertia) this._updateState(() => {
            this.inertia = this._unload();
            return 5;
          });
          while (this.inertia) await this.inertia;
        };
      }, "ctx.plugin()");
      try {
        this.context.emit("internal/plugin", this);
      } catch (error) {
        Promise.resolve(this.dispose()).catch((reason) => this.ctx.logger.error(reason));
        throw error;
      }
      if (this.uid !== null && parent.fiber.state !== 5) {
        for (const name2 of Object.keys(this.inject)) this._checkImpl(name2);
        this._refresh();
      }
    } else {
      this.uid = 0;
      this.ctx = this.context = parent;
      this.state = 2;
      this.committed = /* @__PURE__ */ Object.create(null);
      this._runner = {
        epoch: "0",
        getOuterStack,
        execute: () => {
        },
        collect
      };
      this.dispose = () => this.restart();
    }
  }
  /** The plugin's display name, inherited from the nearest named ancestor, else `'root'`. */
  get name() {
    let fiber = this;
    do {
      if (fiber.runtime?.name) return fiber.runtime.name;
      fiber = fiber.parent.fiber;
    } while (fiber !== fiber.parent.fiber);
    return "root";
  }
  /**
  * Throw if the fiber has already been disposed.
  *
  * @returns nothing when the fiber is still active.
  * @throws {CordisError} `INACTIVE_EFFECT` when the fiber's uid has been cleared.
  */
  assertActive() {
    if (this.uid !== null) return;
    throw new CordisError("INACTIVE_EFFECT");
  }
  _execute(runner) {
    const oldEpoch = runner.epoch;
    return composeError((info) => {
      const safeCollect = (dispose) => {
        if (typeof dispose === "function") runner.collect(dispose);
        else if (!isNullable(dispose)) throw new TypeError("Invalid effect");
      };
      const effect = runner.execute.call(this);
      if (typeof effect === "function") return runner.collect(effect);
      else if (isNullable(effect)) {
      } else if (!isObject(effect)) throw new TypeError("Invalid effect");
      else if ("then" in effect) return effect.then(safeCollect);
      else if (Symbol.iterator in effect) {
        info.error = /* @__PURE__ */ new Error();
        const iter = effect[Symbol.iterator]();
        while (true) {
          const result = iter.next();
          safeCollect(result.value);
          if (result.done) return;
        }
      } else if (Symbol.asyncIterator in effect) {
        const iter = effect[Symbol.asyncIterator]();
        return (async () => {
          await Promise.resolve();
          info.error = /* @__PURE__ */ new Error();
          while (true) {
            if (runner.epoch !== oldEpoch) return;
            const result = await iter.next();
            safeCollect(result.value);
            if (result.done) return;
          }
        })();
      } else throw new TypeError("Invalid effect");
    }, runner.getOuterStack);
  }
  effect(execute, label = "anonymous") {
    this.assertActive();
    if (this.state === 5) throw new CordisError("INACTIVE_EFFECT");
    const disposables = [];
    let disposing = false;
    let disposalTask;
    const dispose = () => {
      if (disposing) return disposalTask;
      disposing = true;
      let task2;
      for (const disposable of disposables.splice(0).reverse()) if (task2) task2 = task2.then(() => runDisposable(disposable));
      else {
        const result = runDisposable(disposable);
        if (isObject(result) && "then" in result) task2 = result;
      }
      return disposalTask = task2;
    };
    const meta = {
      label,
      children: []
    };
    const runner = {
      execute,
      epoch: true,
      collect: (dispose2) => {
        disposables.push(dispose2);
        this._disposables.delete(dispose2);
        if (dispose2[symbols.effect]) meta.children.push(dispose2[symbols.effect]);
      },
      getOuterStack: buildOuterStack()
    };
    let task;
    let executing = true;
    let resolveSetup;
    let rejectSetup;
    let setupBarrier;
    let setupFailed = false;
    let inFlight;
    let removeWrapper = () => false;
    const waitForSetup = () => {
      setupBarrier ??= new Promise((resolve3, reject) => {
        resolveSetup = resolve3;
        rejectSetup = reject;
      });
      return setupBarrier;
    };
    const disposeAfter = (setup) => {
      return Promise.resolve(setup).then(() => dispose(), async (reason) => {
        await dispose();
        throw reason;
      });
    };
    const finalizeDisposal = (callback) => {
      let result;
      try {
        result = callback();
      } catch (error) {
        removeWrapper();
        throw error;
      }
      if (isObject(result) && "then" in result) {
        const pending = Promise.resolve(result).finally(() => {
          removeWrapper();
          if (inFlight === pending) inFlight = void 0;
        });
        return inFlight = pending;
      }
      removeWrapper();
      return result;
    };
    const wrapper = defineProperty(() => {
      if (!runner.epoch) return setupFailed ? inFlight : void 0;
      runner.epoch = false;
      return finalizeDisposal(() => {
        if (executing) return disposeAfter(waitForSetup());
        return task ? disposeAfter(task) : dispose();
      });
    }, symbols.effect, meta);
    effectInertia.set(wrapper, () => inFlight);
    removeWrapper = this._disposables.push(wrapper);
    try {
      task = this._execute(runner);
    } catch (reason) {
      executing = false;
      setupFailed = true;
      runner.epoch = false;
      let cleanup;
      try {
        cleanup = finalizeDisposal(dispose);
      } finally {
        rejectSetup?.(reason);
      }
      if (isObject(cleanup) && "then" in cleanup) cleanup.catch((error) => this.ctx.logger.error(error));
      throw reason;
    }
    executing = false;
    if (setupBarrier) Promise.resolve(task).then(resolveSetup, rejectSetup);
    task?.catch(() => {
      if (!runner.epoch) return dispose();
      return finalizeDisposal(dispose);
    }).catch((error) => this.ctx.logger.error(error));
    const disposeAsync = () => {
      if (!runner.epoch) return;
      runner.epoch = false;
      return finalizeDisposal(dispose);
    };
    wrapper.then = async (onFulfilled, onRejected) => {
      return Promise.resolve(task).then(() => disposeAsync).then(onFulfilled, onRejected);
    };
    return wrapper;
  }
  /**
  * Return metadata for currently registered effects.
  *
  * @returns one {@link EffectMeta} tree per labeled live effect.
  */
  getEffects() {
    return [...this._disposables].map((dispose) => dispose[symbols.effect]).filter(Boolean);
  }
  _getState() {
    if (this.uid === null) return 4;
    if (this._error) return 3;
    if (this._runner.epoch !== INACTIVE) return 2;
    return 0;
  }
  _updateState(callback) {
    const oldState = this.state;
    this.state = callback() ?? this._getState();
    if (oldState === this.state) return;
    this.context.emit("internal/status", this, oldState);
    if (oldState !== 2 && this.state !== 2) return;
    for (const key of Reflect.ownKeys(this.ctx.reflect.store)) {
      const impl = this.ctx.reflect.store[key];
      if (impl.ctx.fiber !== this) continue;
      this.ctx.isolate(impl.name, impl.isolate).reflect.notify([impl.name]);
    }
  }
  _checkImpl(name2) {
    const impl = this.ctx.reflect._getImpl(name2, true);
    if (!impl) return delete this._store[name2];
    try {
      if (impl.check && !impl.check.call(getTraceable(this.ctx, impl.value))) return delete this._store[name2];
    } catch (error) {
      impl.ctx.logger.error(error);
      return delete this._store[name2];
    }
    this._store[name2] = impl;
  }
  _refresh() {
    let epoch = `${this._revision}`;
    for (const name2 of Object.keys(this.inject)) {
      const impl = this._store[name2];
      if (!impl) {
        epoch = INACTIVE;
        break;
      }
      epoch += ":" + impl.uid;
    }
    this._setEpoch(epoch);
  }
  _setEpoch(epoch) {
    const oldEpoch = this._runner.epoch;
    if (epoch === oldEpoch) return;
    if (this._error) return;
    this._runner.epoch = epoch;
    if (this.inertia) return;
    this._updateState(() => {
      if (epoch !== INACTIVE && oldEpoch === INACTIVE) {
        this.inertia = this._reload();
        return 1;
      } else {
        this.inertia = this._unload();
        return 5;
      }
    });
  }
  /** Raw input retained for the next activation, without evaluating expressions or validating it. */
  get rawConfig() {
    return this.ctx.fiber.config;
  }
  /** Retain raw input without changing the running config or triggering an update. */
  set rawConfig(config) {
    this.ctx.fiber.config = config;
    this.ctx.fiber._configRevision++;
  }
  /**
  * The object passed to plugin activation or the latest successful update that retained the instance.
  * Candidate resolution does not publish it; volatile updates retain its references.
  * Undefined before activation and readable after unload; callers requiring a live instance check `state`.
  */
  get effectiveConfig() {
    return this.ctx.fiber._effectiveConfig;
  }
  /**
  * Evaluate and validate a candidate using this fiber's `internal/config` hooks and runtime schema.
  * Does not publish the result, replace raw input, or commit running volatile references.
  * Required injections must be available when a hook uses them.
  * @param config Raw candidate input.
  * @returns The candidate's resolved config, retaining the schema's result identity.
  * @throws {ValidationError} when the runtime schema rejects the candidate; hook errors propagate.
  */
  resolveConfig(config) {
    const fiber = this.ctx.fiber;
    return fiber.context.waterfall("internal/config", fiber, () => config);
  }
  async _reload() {
    this.committed = { ...this._store };
    for (const impl of Object.values(this.committed)) {
      if (impl.ctx.fiber === this) continue;
      impl.dependents.add(this);
    }
    const oldEpoch = this._runner.epoch;
    try {
      await Promise.resolve();
      if (this._runner.epoch === oldEpoch) await this._execute(this._runner);
    } catch (reason) {
      this.ctx.logger.error(reason);
      if (this._runner.epoch === oldEpoch) {
        this._error = reason;
        this._runner.epoch = INACTIVE;
      }
    }
    this._updateState(() => {
      if (this._runner.epoch === oldEpoch) this.inertia = void 0;
      else {
        this.inertia = this._unload();
        return 5;
      }
    });
  }
  async _unload() {
    while ([...this.provisions].some((impl) => impl.dependents.size)) await new Promise((resolve3) => this._release = resolve3);
    this._release = void 0;
    await Promise.all(this._disposables.clear().map(async (dispose) => {
      try {
        await composeError(async (info) => {
          await Promise.resolve();
          info.error = /* @__PURE__ */ new Error();
          await runDisposable(dispose);
        }, this._runner.getOuterStack);
      } catch (reason) {
        this.ctx.logger.error(reason);
      }
    }));
    for (const impl of Object.values(this.committed ?? {})) {
      if (!impl.dependents.delete(this) || impl.dependents.size) continue;
      impl.release?.();
      impl.ctx.fiber._release?.();
    }
    this.committed = void 0;
    this._updateState(() => {
      if (this._runner.epoch === INACTIVE) this.inertia = void 0;
      else {
        this.inertia = this._reload();
        return 1;
      }
    });
  }
  /**
  * Wait for current lifecycle work and rethrow startup errors.
  *
  * @returns this fiber, once it has settled into a stable state.
  * @throws the config-validation or plugin-startup error, if any.
  */
  async await() {
    while (this.inertia) await this.inertia;
    if (this._error) throw this._error;
    return this;
  }
  /**
  * Dispose and immediately reload this plugin with its current config.
  *
  * @returns a promise resolving once the reload settled.
  * @throws {CordisError} `INACTIVE_EFFECT` when the fiber is already disposed.
  */
  async restart() {
    const fiber = this.ctx.fiber;
    fiber.assertActive();
    fiber._revision++;
    fiber._refresh();
    await fiber.await();
  }
  /**
  * Resolve a candidate, retain its raw config and apply it through the update waterfall.
  * @param config Raw config; pending fibers defer resolution until activation.
  * @param noSave Suppress the persistence notification when true.
  * @returns The awaited update/restart result, or undefined when a synchronous listener handles it.
  * @throws {ValidationError} when an active fiber's candidate is invalid.
  */
  update(config, noSave = false) {
    const fiber = this.ctx.fiber;
    fiber.assertActive();
    const loaded = fiber._runner.epoch !== INACTIVE;
    const resolved = loaded ? fiber.resolveConfig(config) : void 0;
    if (!noSave) fiber.context.emit("internal/commit", fiber, config);
    fiber.config = config;
    fiber._error = void 0;
    const configRevision = ++fiber._configRevision;
    const epoch = fiber._runner.epoch;
    const committed = fiber.committed;
    let restarted = false;
    const restart = () => {
      restarted = true;
      return fiber.restart();
    };
    const publish = () => {
      if (!restarted && fiber.uid !== null && fiber._configRevision === configRevision && fiber._runner.epoch === epoch && fiber.committed === committed) fiber._effectiveConfig = resolved;
    };
    const result = loaded ? fiber.context.waterfall(fiber, "internal/update", resolved, restart) : restart();
    if (result === void 0) {
      publish();
      return;
    }
    const task = Promise.resolve(result).then(publish);
    task.catch(() => {
    });
    return task;
  }
};
function isBailed(value) {
  return value !== null && value !== false && value !== void 0;
}
var EventsService = class {
  ctx;
  _hooks = /* @__PURE__ */ Object.create(null);
  constructor(ctx) {
    this.ctx = ctx;
    defineProperty(this, symbols.tracker, {
      property: "ctx",
      noShadow: true
    });
    this.on("internal/listener", function(name2, listener, options) {
      if (name2 === "internal/update" && !options.global) {
        const hooks = this.fiber._hooks["internal/update"] ??= new DisposableList();
        const method = options.prepend ? "unshift" : "push";
        return this.fiber.effect(() => hooks[method](listener), 'ctx.on("internal/update")');
      }
    });
    this.on("internal/update", function(config, next) {
      const cbs = [...this._hooks["internal/update"] || []];
      const _next = () => {
        return (cbs.shift() ?? next).call(this, config, _next);
      };
      return _next();
    }, {
      global: true,
      prepend: true
    });
    this.on("internal/config", (fiber, next) => {
      const config = next();
      return fiber.runtime ? resolveConfig(fiber.runtime, config) : config;
    });
  }
  _resolve(type, args) {
    const thisArg = typeof args[0] === "object" || typeof args[0] === "function" ? args.shift() : null;
    const name2 = args.shift();
    if ((typeof name2 !== "string" || !name2.startsWith("internal/")) && this._hooks["internal/dispatch"]?.length) this.emit("internal/dispatch", type, name2, args, thisArg);
    const filter = thisArg?.[Context.filter];
    return [thisArg, (this._hooks[name2] || []).filter((hook) => hook.global || !filter || filter.call(thisArg, hook.ctx)).map((hook) => hook.callback)];
  }
  /**
  * Resolve bound callbacks using the event's context filter.
  * @param type Dispatch mode reported to observers.
  * @param args Dispatch arguments, consumed through the event name.
  * @returns Matching callbacks bound to the dispatch receiver.
  * DSH retains callback enumeration for per-listener error containment.
  */
  dispatch(type, args) {
    const [thisArg, callbacks] = this._resolve(type, args);
    return callbacks.map((callback) => callback.bind(thisArg));
  }
  /**
  * Run listeners concurrently and wait for all of them.
  *
  * @param args — optional `this`, the event name, then listener arguments.
  * @returns a promise resolving once every listener has settled.
  */
  async parallel(...args) {
    const [thisArg, callbacks] = this._resolve("parallel", args);
    const errors = (await Promise.allSettled(callbacks.map(async (callback) => Reflect.apply(callback, thisArg, args)))).filter((result) => result.status === "rejected");
    if (errors.length) throw new AggregateError(errors.map((error) => error.reason));
  }
  /**
  * Run listeners synchronously without waiting for returned promises.
  *
  * @param args — optional `this`, the event name, then listener arguments.
  */
  emit(...args) {
    const [thisArg, callbacks] = this._resolve("emit", args);
    for (const callback of callbacks) Reflect.apply(callback, thisArg, args);
  }
  /**
  * Run listeners in order, awaiting each, until one returns a bail value.
  *
  * @param args — optional `this`, the event name, then listener arguments.
  * @returns the first bail value (see {@link isBailed}), if any.
  */
  async serial(...args) {
    const [thisArg, callbacks] = this._resolve("serial", args);
    for (const callback of callbacks) {
      const result = await Reflect.apply(callback, thisArg, args);
      if (isBailed(result)) return result;
    }
  }
  /**
  * Run listeners synchronously until one returns a bail value.
  *
  * @param args — optional `this`, the event name, then listener arguments.
  * @returns the first bail value (see {@link isBailed}), if any.
  */
  bail(...args) {
    const [thisArg, callbacks] = this._resolve("bail", args);
    for (const callback of callbacks) {
      const result = Reflect.apply(callback, thisArg, args);
      if (isBailed(result)) return result;
    }
  }
  /**
  * Compose listeners around the final `next` callback.
  *
  * The last dispatch argument is treated as the innermost `next`. Listeners
  * run outermost-first; a listener that does not call `next()` vetoes the
  * rest of the chain, including the built-in behavior.
  *
  * @param args — optional `this`, the event name, listener arguments, then `next`.
  * @returns the outermost listener's return value.
  */
  waterfall(...args) {
    const [thisArg, callbacks] = this._resolve("waterfall", args);
    const inner = args.pop();
    const dispatch = () => {
      const callback = callbacks.shift();
      if (!callback) return inner();
      let called = false;
      const next = () => {
        if (called) throw new Error("next() called multiple times");
        called = true;
        return dispatch();
      };
      return Reflect.apply(callback, thisArg, [...args, next]);
    };
    return dispatch();
  }
  register(label, name2, callback, options) {
    const method = options.prepend ? "unshift" : "push";
    return this.ctx.fiber.effect(() => {
      (this._hooks[name2] ??= [])[method]({
        ctx: this.ctx,
        callback,
        ...options
      });
      return () => this.unregister(name2, callback);
    }, label);
  }
  unregister(name2, callback) {
    const hooks = this._hooks[name2];
    if (!hooks) return;
    const index = hooks.findIndex((hook) => hook.callback === callback);
    if (index >= 0) {
      hooks.splice(index, 1);
      if (!hooks.length) delete this._hooks[name2];
      return true;
    }
  }
  /**
  * Register an event listener owned by the current fiber.
  *
  * The listener is removed automatically when the fiber unloads. Throws
  * `CordisError('INACTIVE_EFFECT')` if the fiber is already disposed.
  *
  * @param name — the event name to listen for.
  * @param listener — called with the dispatch arguments.
  * @param options — listener options; a boolean is shorthand for `prepend`.
  * @returns a disposer removing the listener; `true` if it was still registered.
  */
  on(name2, listener, options) {
    if (typeof options !== "object") options = { prepend: options };
    this.ctx.fiber.assertActive();
    listener = this.ctx.reflect.bind(listener);
    const result = this.bail(this.ctx, "internal/listener", name2, listener, options);
    if (result) return result;
    const label = `ctx.on(${typeof name2 === "string" ? JSON.stringify(name2) : name2.toString()})`;
    return this.register(label, name2, listener, options);
  }
  /**
  * Register an event listener that disposes itself after the first call.
  *
  * @param name — the event name to listen for.
  * @param listener — called at most once with the dispatch arguments.
  * @param options — listener options; a boolean is shorthand for `prepend`.
  * @returns a disposer removing the listener; `true` if it was still registered.
  */
  once(name2, listener, options) {
    const dispose = this.on(name2, function(...args) {
      dispose();
      return listener.apply(this, args);
    }, options);
    return dispose;
  }
};
var defaultFormatters = {
  s: (value) => String(value),
  d: (value) => Math.trunc(Number(value)),
  i: (value) => Math.trunc(Number(value)),
  f: (value) => Number(value),
  o: (value) => JSON.stringify(value),
  O: (value) => JSON.stringify(value),
  c: () => "",
  C: (value, exporter, message) => {
    return Logger.color(exporter, Logger.code(message.name, exporter.colors), value);
  }
};
function isAggregateError(error) {
  return error instanceof Error && Array.isArray(error["errors"]);
}
var Logger = class {
  service;
  static color(exporter, code, value, decoration = "") {
    if (!exporter.colors) return "" + value;
    return `\x1B[3${code < 8 ? code : "8;5;" + code}${exporter.colors >= 2 ? decoration : ""}m${value}\x1B[0m`;
  }
  static code(name2, level) {
    let hash = 0;
    for (let i = 0; i < name2.length; i++) {
      hash = (hash << 3) - hash + name2.charCodeAt(i) + 13;
      hash |= 0;
    }
    const colors = !level ? [] : level >= 2 ? c256 : c16;
    return colors[Math.abs(hash) % colors.length];
  }
  static format(exporter, message) {
    const args = message.args.slice();
    if (args[0] instanceof Error) {
      args[0] = args[0].stack || args[0].message;
      args.unshift("%s");
    } else if (typeof args[0] !== "string") args.unshift("%o");
    let format = args.shift();
    format = format.replace(/%([a-zA-Z%])/g, (match, char) => {
      if (match === "%%") return "%";
      const formatter = exporter.formatters?.[char] ?? defaultFormatters[char];
      if (typeof formatter === "function") return formatter(args.shift(), exporter, message);
      return match;
    });
    const oFormatter = exporter.formatters?.o ?? defaultFormatters.o;
    for (let arg of args) {
      if (typeof arg === "object" && arg) arg = oFormatter(arg, exporter, message);
      format += " " + arg;
    }
    const { maxLength = 10240 } = exporter;
    return format.split(/\r?\n/g).map((line) => {
      return line.slice(0, maxLength) + (line.length > maxLength ? "..." : "");
    }).join("\n");
  }
  constructor(options, service) {
    this.service = service;
    Object.assign(this, options);
    this.error = this._method("error", 0);
    this.info = this._method("info", 2);
    this.warn = this._method("warn", 1);
    this.debug = this._method("debug", 3);
  }
  _method(type, level) {
    return (...args) => {
      if (args.length === 1 && args[0] instanceof Error) {
        if (args[0].cause) this[type](args[0].cause);
        else if (isAggregateError(args[0])) {
          args[0].errors.forEach((error) => this[type](error));
          return;
        }
      }
      const sn = ++this.service._snMessage;
      const ts = Date.now();
      for (const exporter of this.service.exporters.values()) {
        if ((exporter.levels?.[this.name] ?? exporter.levels?.default ?? this.level ?? 2) < level) continue;
        const message = {
          sn,
          ts,
          type,
          level,
          name: this.name,
          ...this.meta,
          args
        };
        exporter.export(message);
      }
    };
  }
};
var c16 = [
  6,
  2,
  3,
  4,
  5,
  1
];
var c256 = [
  20,
  21,
  26,
  27,
  32,
  33,
  38,
  39,
  40,
  41,
  42,
  43,
  44,
  45,
  56,
  57,
  62,
  63,
  68,
  69,
  74,
  75,
  76,
  77,
  78,
  79,
  80,
  81,
  92,
  93,
  98,
  99,
  112,
  113,
  129,
  134,
  135,
  148,
  149,
  160,
  161,
  162,
  163,
  164,
  165,
  166,
  167,
  168,
  169,
  170,
  171,
  172,
  173,
  178,
  179,
  184,
  185,
  196,
  197,
  198,
  199,
  200,
  201,
  202,
  203,
  204,
  205,
  206,
  207,
  208,
  209,
  214,
  215,
  220,
  221
];
var LoggerService = class LoggerService2 {
  bufferSize = 1e3;
  buffer = [];
  ctx;
  _snMessage = 0;
  _snExporter = 0;
  exporters = /* @__PURE__ */ new Map();
  constructor(ctx) {
    const tracker = {
      property: "ctx",
      noShadow: true
    };
    const self = createCallable("logger", joinPrototype(Object.getPrototypeOf(this), Function.prototype), tracker);
    Object.assign(self, this);
    self.ctx = ctx;
    defineProperty(self, symbols.tracker, tracker);
    self.exporter({
      colors: 3,
      export: (message) => {
        self.buffer.push(message);
        const overflow = self.buffer.length - self.bufferSize;
        if (overflow === 1) self.buffer.shift();
        else if (overflow > 1) self.buffer.splice(0, overflow);
      }
    });
    return self;
  }
  /**
  * Register an exporter and dispose it with the current fiber.
  *
  * @param exporter — the sink that receives structured log messages.
  * @returns a disposer that removes the exporter.
  */
  exporter(exporter) {
    return this.ctx.effect(() => {
      const id = ++this._snExporter;
      this.exporters.set(id, exporter);
      return () => this.exporters.delete(id);
    }, "ctx.logger.exporter()");
  }
  _resolveConfig() {
    let intercept = this.ctx[symbols.intercept];
    const configs = [];
    while ("logger" in intercept) {
      if (Object.hasOwn(intercept, "logger")) configs.unshift(intercept["logger"]);
      intercept = Object.getPrototypeOf(intercept);
    }
    return Object.assign({}, ...configs);
  }
  [symbols.invoke](name2) {
    const config = this._resolveConfig();
    const fiber = (this[symbols.caller] ?? this.ctx).fiber;
    name2 ??= config.name;
    name2 ??= hyphenate(fiber.name);
    return new Logger({
      name: name2,
      level: config.level,
      meta: { fiber: new WeakRef(fiber) }
    }, this);
  }
  static {
    for (const type of [
      "error",
      "info",
      "warn",
      "debug"
    ]) LoggerService2.prototype[type] = function(...args) {
      return this()[type](...args);
    };
  }
};
function enhanceError(error) {
  const lines = error.stack.split("\n");
  lines.splice(0, 2, `Error: ${error.message}`);
  error.stack = lines.join("\n");
  return error;
}
var RESERVED_WORDS = ["prototype", "then"];
function isSpecialProperty(prop) {
  return typeof prop === "symbol" || RESERVED_WORDS.includes(prop) || parseInt(prop).toString() === prop || prop.startsWith("_");
}
var ReflectService = class {
  ctx;
  /** Proxy traps implementing service resolution for every context object. */
  static handler = {
    get: (target, prop, ctx) => {
      if (isSpecialProperty(prop)) return Reflect.get(target, prop, ctx);
      if (Reflect.has(target, prop)) return getTraceable(ctx, Reflect.get(target, prop, ctx));
      const error = /* @__PURE__ */ new Error(`cannot get property "${prop}" without inject`);
      try {
        const def = target.reflect.props[prop];
        if (def?.type === "accessor") return def.get.call(ctx, ctx[symbols.receiver], error);
        const defSite = ctx[symbols.shadow] ?? ctx;
        if (!defSite.fiber.runtime) return ctx.reflect.get(prop, false);
        return ctx.events.waterfall("internal/get", ctx, prop, error, () => {
          const key = defSite[symbols.isolate][prop];
          let fiber = defSite.fiber;
          while (true) {
            let impl = fiber.committed?.[prop];
            for (const provision of fiber.provisions) if (provision.name === prop && provision.ctx[symbols.isolate][prop] === key) impl = provision;
            if (impl) return getTraceable(ctx, impl.value);
            if (prop in fiber.inject) {
              error.message = `cannot get required service "${prop}" in inactive context`;
              throw error;
            }
            if (!fiber.runtime) throw error;
            if (fiber.parent[symbols.isolate][prop] !== key) throw error;
            fiber = fiber.parent.fiber;
          }
        });
      } catch (e) {
        throw e === error ? enhanceError(e) : e;
      }
    },
    set: (target, prop, value, ctx) => {
      if (isSpecialProperty(prop)) return Reflect.set(target, prop, value, ctx);
      const error = /* @__PURE__ */ new Error(`cannot set property "${prop}" without provide`);
      const def = target.reflect.props[prop];
      if (!def) {
        if (!ctx.fiber.runtime) return Reflect.set(target, prop, value, ctx);
        throw enhanceError(error);
      }
      try {
        if (def.type === "accessor") {
          if (!def.set) return false;
          return def.set.call(ctx, value, ctx[symbols.receiver], error);
        }
        return ctx.events.waterfall("internal/set", ctx, prop, value, error, () => {
          return ctx.reflect.set(prop, value, error);
        });
      } catch (e) {
        throw e === error ? enhanceError(e) : e;
      }
    },
    has: (target, prop) => {
      if (isSpecialProperty(prop)) return Reflect.has(target, prop);
      if (Reflect.has(target, prop)) return true;
      return !!target.reflect.props[prop];
    }
  };
  /** Service implementations, keyed by isolation label. */
  store = /* @__PURE__ */ Object.create(null);
  /** Declared context properties (services and accessors), by name. */
  props = /* @__PURE__ */ Object.create(null);
  _implCounter = 0;
  constructor(ctx) {
    this.ctx = ctx;
    defineProperty(this, symbols.tracker, {
      property: "ctx",
      noShadow: true
    });
    this.mixin("reflect", [
      "get",
      "set",
      "provide",
      "accessor",
      "mixin"
    ]);
    this.mixin("fiber", ["runtime", "effect"]);
    this.mixin("registry", ["inject", "plugin"]);
    this.mixin("events", [
      "on",
      "once",
      "parallel",
      "emit",
      "serial",
      "bail",
      "waterfall"
    ]);
  }
  /**
  * Read a service from the store without the inject requirement.
  *
  * @param name — the service name.
  * @param strict — when `true`, only return implementations whose providing
  * fiber is currently active.
  * @returns the service value, or `undefined` when not (yet) provided.
  */
  get(name2, strict = true) {
    return getTraceable(this.ctx, this._getImpl(name2, strict)?.value);
  }
  _getImpl(name2, strict = true) {
    const key = this.ctx[symbols.isolate][name2];
    const impl = key && this.store[key];
    if (!impl) return;
    if (strict && impl.ctx.fiber.state !== 2) return;
    return impl;
  }
  /**
  * Overwrite a provided service's value.
  *
  * @param name — the service name.
  * @param value — the new service value.
  * @param error — carrier for the caller stack in diagnostics.
  * @returns `true` on success.
  * @throws when `name` was never provided, or was provided by another fiber.
  */
  set(name2, value, error) {
    const key = this.ctx[symbols.isolate][name2];
    const impl = this.store[key];
    if (!impl) throw new Error(`cannot set property "${name2}" without provide`);
    if (impl.ctx.fiber !== this.ctx.fiber) throw new Error(`cannot set property "${name2}" in multiple fibers`);
    impl.value = value;
    return true;
  }
  /**
  * Register a service implementation owned by the current fiber.
  *
  * See the `ctx.provide()` overload above for the full contract.
  *
  * @param name — the service name.
  * @param value — the service value.
  * @param check — optional availability predicate for dependents.
  * @returns a disposer that unregisters the service.
  */
  provide(name2, value, check) {
    return this.ctx.fiber.effect(() => {
      if (!this.props[name2]) this.props[name2] ??= { type: "service" };
      else if (this.props[name2].type !== "service") throw new Error(`property "${name2}" is already declared as ${this.props[name2].type}`);
      this.props[name2] = { type: "service" };
      this.ctx.root[symbols.isolate][name2] ??= Symbol(name2);
      const key = this.ctx[symbols.isolate][name2];
      const impl = {
        uid: ++this._implCounter,
        name: name2,
        value,
        ctx: this.ctx,
        check,
        isolate: key,
        dependents: /* @__PURE__ */ new Set()
      };
      if (this.store[key]) throw new Error(`service "${name2}" has been registered at <${this.store[key].ctx.fiber.name}>`);
      this.store[key] = impl;
      this.ctx.fiber.provisions.add(impl);
      if (this.ctx.fiber.state === 2) this.notify([name2]);
      return async () => {
        if (this.store[impl.isolate] === impl) delete this.store[impl.isolate];
        this.ctx.isolate(name2, impl.isolate).reflect.notify([name2]);
        await new Promise((resolve3) => {
          impl.release = resolve3;
          if (!impl.dependents.size) resolve3();
        });
        impl.release = void 0;
        this.ctx.fiber.provisions.delete(impl);
      };
    }, `ctx.provide(${JSON.stringify(name2)})`);
  }
  /**
  * Re-evaluate every fiber that requires one of the given services.
  *
  * @param names — the service names that changed.
  * @param filter — restricts notification to matching isolation scopes.
  */
  notify(names, filter = (ctx, name2) => ctx[symbols.isolate][name2] === this.ctx[symbols.isolate][name2]) {
    for (const runtime of this.ctx.registry.values()) for (const fiber of runtime.fibers) {
      let hasUpdate = false;
      for (const name2 of names) {
        if (!(name2 in fiber.inject)) continue;
        if (!filter(fiber.ctx, name2)) continue;
        hasUpdate = true;
        fiber._checkImpl(name2);
      }
      if (!hasUpdate) continue;
      fiber._refresh();
    }
    for (const name2 of names) {
      const self = Object.create(this.ctx);
      self[symbols.filter] = (target) => filter(target, name2);
      this.ctx.events.emit(self, "internal/service", name2, this._getImpl(name2, false)?.value);
    }
  }
  /**
  * Define a computed context property backed by get/set hooks.
  *
  * @param name — the context property name.
  * @param options — the `get` hook and optional `set` hook.
  * @returns a disposer that removes the accessor.
  */
  accessor(name2, options) {
    return this.ctx.fiber.effect(() => {
      if (name2 in this.props) throw new Error(`property "${name2}" is already declared as ${this.props[name2].type}`);
      this.props[name2] = {
        type: "accessor",
        ...options
      };
      return () => delete this.props[name2];
    }, `ctx.accessor(${JSON.stringify(name2)})`);
  }
  /**
  * Expose selected members of a service directly on `ctx`.
  *
  * See the `ctx.mixin()` overload above for the full contract.
  *
  * @param source — a context property name or a source object.
  * @param mixins — keys to forward, or a source-key → ctx-key map.
  * @returns a disposer that removes all created accessors.
  */
  mixin(source, mixins) {
    const self = this;
    return this.ctx.fiber.effect(function* () {
      const entries = Array.isArray(mixins) ? mixins.map((key) => [key, key]) : Object.entries(mixins);
      const getTarget = (ctx, error) => {
        return ctx[source];
      };
      for (const [key, value] of entries) yield self.accessor(value, {
        get(receiver, error) {
          const service = getTarget(this, error);
          if (isNullable(service)) return service;
          const mixin = receiver ? withProps(receiver, service) : service;
          const value2 = Reflect.get(service, key, mixin);
          if (typeof value2 !== "function") return value2;
          return value2.bind(mixin ?? service);
        },
        set(value2, receiver, error) {
          const service = getTarget(this, error);
          const mixin = receiver ? withProps(receiver, service) : service;
          return Reflect.set(service, key, value2, mixin);
        }
      });
    }, `ctx.mixin(${JSON.stringify(source)})`);
  }
  /**
  * Attach this context's tracing wrapper to a value.
  *
  * @param value — the value to wrap.
  * @returns the traceable wrapper (or the value itself when not applicable).
  */
  trace(value) {
    return getTraceable(this.ctx, value);
  }
  /**
  * Wrap a callback so calls trace `this` and arguments to this context.
  *
  * @param callback — the function to wrap.
  * @returns a proxy delegating to `callback` with traced values.
  */
  bind(callback) {
    return new Proxy(callback, {
      apply: (target, thisArg, args) => {
        return Reflect.apply(target, this.trace(thisArg), args.map((arg) => this.trace(arg)));
      },
      construct: (target, args, newTarget) => {
        return Reflect.construct(target, args.map((arg) => this.trace(arg)), newTarget);
      }
    });
  }
};
function isApplicable(object) {
  return object && typeof object === "object" && typeof object.apply === "function";
}
function Inject(name2, config) {
  return function(value, decorator) {
    if (decorator.kind === "class") {
      if (!Object.hasOwn(value, "inject")) {
        defineProperty(value, "inject", Object.create(Object.getPrototypeOf(value).inject ?? null));
        defineProperty(value.inject, symbols.checkProto, true);
      }
      value.inject[name2] = config;
    } else if (decorator.kind === "method") {
      const inject2 = (value[symbols.metadata] ??= {}).inject ??= /* @__PURE__ */ Object.create(null);
      inject2[name2] = config;
      decorator.addInitializer(function() {
        const property2 = this[symbols.tracker]?.property;
        (this[symbols.initHooks] ??= []).push(() => {
          this.ctx.inject(inject2, (ctx) => {
            return value.call(property2 ? withProps(this, { [property2]: ctx }) : this);
          });
        });
      });
    } else throw new Error("@Inject() can only be used on class or class methods");
  };
}
(function(Inject2) {
  function resolve3(inject2, result = /* @__PURE__ */ Object.create(null)) {
    if (!inject2) return result;
    if (Array.isArray(inject2)) for (const name2 of inject2) result[name2] = null;
    else if (Reflect.has(inject2, symbols.checkProto)) {
      Object.assign(result, resolve3(Object.getPrototypeOf(inject2)));
      for (const name2 of Object.keys(inject2)) result[name2] = inject2[name2] ?? null;
    } else for (const name2 of Object.keys(inject2)) result[name2] = inject2[name2] ?? null;
    return result;
  }
  Inject2.resolve = resolve3;
})(Inject || (Inject = {}));
var RegistryService = class {
  ctx;
  _counter = 0;
  _internal = /* @__PURE__ */ new Map();
  constructor(ctx) {
    this.ctx = ctx;
    defineProperty(this, symbols.tracker, {
      property: "ctx",
      noShadow: true
    });
  }
  /** Allocate the next fiber uid (increments on every read). */
  get counter() {
    return ++this._counter;
  }
  /** Number of registered plugin runtimes. */
  get size() {
    return this._internal.size;
  }
  /**
  * Resolve a supported plugin shape to its executable callback.
  *
  * @param plugin — a function, class, or `{ apply }` object plugin.
  * @returns the callback identifying the plugin, or `undefined` if invalid.
  */
  resolve(plugin) {
    try {
      if (typeof plugin === "function") return plugin;
      if (isApplicable(plugin)) return plugin.apply;
    } catch {
    }
  }
  /**
  * Look up the runtime record for a plugin.
  *
  * @param plugin — any supported plugin shape.
  * @returns the runtime, or `undefined` when the plugin is not registered.
  */
  get(plugin) {
    const key = this.resolve(plugin);
    return key && this._internal.get(key);
  }
  /**
  * Check whether a plugin has a registered runtime.
  *
  * @param plugin — any supported plugin shape.
  * @returns `true` when at least one fiber of the plugin exists.
  */
  has(plugin) {
    const key = this.resolve(plugin);
    return !!key && this._internal.has(key);
  }
  /**
  * Dispose every running fiber for a plugin and remove its runtime record.
  *
  * @param plugin — any supported plugin shape.
  * @returns the removed runtime, or `undefined` when none was registered.
  */
  delete(plugin) {
    const key = this.resolve(plugin);
    const runtime = key && this._internal.get(key);
    if (!runtime) return;
    this._internal.delete(key);
    for (const fiber of runtime.fibers) fiber.dispose();
    return runtime;
  }
  /** Iterate the registered plugin callbacks. */
  keys() {
    return this._internal.keys();
  }
  /** Iterate the registered plugin runtimes. */
  values() {
    return this._internal.values();
  }
  /** Iterate `[callback, runtime]` pairs. */
  entries() {
    return this._internal.entries();
  }
  /**
  * Visit every registered runtime.
  *
  * @param callback — receives each runtime and its identifying callback.
  */
  forEach(callback) {
    return this._internal.forEach(callback);
  }
  /**
  * Start a callback once the requested dependencies are available.
  *
  * @param inject — required services, as an array or a name → config map.
  * @param callback — plugin body called with `(ctx, config)`.
  * @returns the fiber; awaiting it settles once loading finished.
  */
  inject(inject2, callback) {
    return this.plugin({
      inject: inject2,
      apply: callback,
      name: callback.name
    });
  }
  /**
  * Start a plugin in the current context and return its fiber.
  *
  * Creates (or reuses) the plugin's runtime record, then starts a new fiber
  * under the current context. Throws if `plugin` is not a supported shape or
  * if the current fiber is already disposed.
  *
  * @param plugin — a function, class, or `{ apply }` object plugin.
  * @param config — the plugin config, validated against its `Config` schema.
  * @param getOuterStack — captures the caller stack for effect diagnostics.
  * @returns the fiber; awaiting it settles once loading finished.
  */
  plugin(plugin, config, getOuterStack = buildOuterStack()) {
    const callback = this.resolve(plugin);
    if (!callback) throw new Error('invalid plugin, expect function or object with an "apply" method, received ' + typeof plugin);
    this.ctx.fiber.assertActive();
    let runtime = this._internal.get(callback);
    if (!runtime) {
      let name2 = plugin.name;
      if (name2 === "apply") name2 = void 0;
      runtime = {
        name: name2,
        callback,
        fibers: new DisposableList(),
        Config: plugin.Config
      };
      this._internal.set(callback, runtime);
    }
    const fiber = new Fiber(this.ctx, config, Inject.resolve(plugin.inject), runtime, getOuterStack);
    const wrapped = Object.create(fiber);
    wrapped.then = (onFulfilled, onRejected) => {
      return fiber.await().then(onFulfilled, onRejected);
    };
    return wrapped;
  }
};
var Context = class Context2 {
  /** Symbol key under which a disposer exposes its {@link EffectMeta} diagnostics tree. */
  static effect = symbols.effect;
  /** Symbol key for a context's listener filter, consulted on every event dispatch. */
  static filter = symbols.filter;
  /** Symbol key of the isolation map (see the `Context[symbols.isolate]` property). */
  static isolate = symbols.isolate;
  /** Symbol key of the intercept map (see the `Context[symbols.intercept]` property). */
  static intercept = symbols.intercept;
  /**
  * Returns true for Cordis context proxies and context prototypes.
  *
  * Works across realms and across multiple copies of cordis, because the
  * brand is keyed by a global symbol rather than by `instanceof`.
  *
  * @param value — the value to test.
  * @returns `true` if `value` is a Cordis context, narrowing its type.
  */
  static is(value) {
    return !!value?.[Context2.is];
  }
  static {
    Context2.is[Symbol.toPrimitive] = () => Symbol.for("cordis.is");
    Context2.prototype[Context2.is] = true;
  }
  /** Create the root context and install the built-in services. */
  constructor() {
    this[symbols.isolate] = /* @__PURE__ */ Object.create(null);
    this[symbols.intercept] = /* @__PURE__ */ Object.create(null);
    const self = new Proxy(this, ReflectService.handler);
    this.root = self;
    this.baseUrl = void 0;
    this.fiber = new Fiber(self, {}, /* @__PURE__ */ Object.create(null), null, () => []);
    this.reflect = new ReflectService(self);
    this.registry = new RegistryService(self);
    this.events = new EventsService(self);
    this.logger = new LoggerService(self);
    this.fiber._disposables.clear();
    return self;
  }
  [Symbol.for("nodejs.util.inspect.custom")]() {
    return `Context <${this.fiber.name}>`;
  }
  /**
  * Create a child context with extra metadata on top of the current scope.
  *
  * The child prototypally inherits every property of this context; own
  * properties of `meta` shadow the inherited ones. The parent is not mutated.
  *
  * @param meta — own properties (including symbol keys) to define on the child.
  * @returns a child context inheriting from this one.
  */
  extend(meta = {}) {
    const shadow = Reflect.getOwnPropertyDescriptor(this, symbols.shadow)?.value;
    const self = Object.create(getTraceable(this, this));
    for (const prop of Reflect.ownKeys(meta)) Object.defineProperty(self, prop, Reflect.getOwnPropertyDescriptor(meta, prop));
    if (!shadow) return self;
    return Object.assign(Object.create(self), { [symbols.shadow]: shadow });
  }
  /**
  * Create a child context with an independent service scope for `name`.
  *
  * Below the returned context, reads and writes of the service `name`
  * resolve against the new label instead of the parent's, so a different
  * implementation can be provided without affecting the parent scope.
  * Passing the same `label` to two `isolate()` calls joins their scopes.
  *
  * @param name — the service name to isolate.
  * @param label — scope label to join; defaults to a fresh unique symbol.
  * @returns a child context whose `name` service resolves in the new scope.
  */
  isolate(name2, label) {
    const shadow = Object.create(this[symbols.isolate]);
    shadow[name2] = label ?? Symbol(name2);
    return this.extend({ [symbols.isolate]: shadow });
  }
  intercept(name2, config) {
    const intercept = Object.create(this[symbols.intercept]);
    intercept[name2] = config;
    return this.extend({ [symbols.intercept]: intercept });
  }
};
var Service = class Service2 {
  ctx;
  /** Symbol key of an instance method run after construction (class plugins). */
  static init = symbols.init;
  /** Symbol key of the availability predicate passed to `ctx.provide()`. */
  static check = symbols.check;
  /** Symbol key of the phantom intercept-config type parameter. */
  static config = symbols.config;
  /** Symbol key of the call body making a service callable (e.g. `ctx.logger()`). */
  static invoke = symbols.invoke;
  /** Symbol key of the helper deriving an extended service instance. */
  static extend = symbols.extend;
  /** Symbol key of the tracker metadata used for context tracing. */
  static tracker = symbols.tracker;
  /** Symbol key of the intercept-config resolution helper below. */
  static resolveConfig = symbols.resolveConfig;
  /** The service name this instance is registered under. */
  name;
  /**
  * Register this instance as `name` in the current context.
  *
  * Calls `ctx.reflect.provide(name, this, this[Service.check])`, so the
  * service is unregistered automatically when the owning fiber unloads.
  * Services with a `[Service.invoke]` body return a callable instance.
  *
  * @param ctx — the context to register in (stored as `this.ctx`).
  * @param name — the service name; defaults to the static `provide` field.
  */
  constructor(ctx, name2) {
    this.ctx = ctx;
    name2 ??= this.constructor["provide"];
    let self = this;
    const tracker = {
      associate: name2,
      property: "ctx"
    };
    if (self[symbols.invoke]) self = createCallable(name2, joinPrototype(Object.getPrototypeOf(this), Function.prototype), tracker);
    self.ctx = ctx;
    self.name = name2;
    defineProperty(self, symbols.tracker, tracker);
    self.ctx.reflect.provide(name2, self, this[symbols.check]);
    return self;
  }
  [symbols.filter](ctx) {
    return ctx[symbols.isolate][this.name] === this.ctx[symbols.isolate][this.name];
  }
  [symbols.extend](props) {
    let self;
    if (this[Service2.invoke]) self = createCallable(this.name, this, this[symbols.tracker]);
    else self = Object.create(this);
    return Object.assign(self, props);
  }
  /**
  * Merge intercept config from ancestors with optional base and head values.
  *
  * Entries added closer to the root apply first; `base` is prepended and
  * `head` appended. Uses `Config.merge` when the service declares one,
  * otherwise a shallow `Object.assign`.
  *
  * @param base — lowest-precedence config merged before all intercepts.
  * @param head — highest-precedence config merged after all intercepts.
  * @returns the merged config.
  */
  [symbols.resolveConfig](base, head) {
    let intercept = this.ctx[Context.intercept];
    const configs = [];
    while (this.name in intercept) {
      if (Object.hasOwn(intercept, this.name)) configs.unshift(intercept[this.name]);
      intercept = Object.getPrototypeOf(intercept);
    }
    if (base) configs.unshift(base);
    if (head) configs.push(head);
    if (this["Config"]?.merge) return this["Config"].merge(...configs);
    else return Object.assign({}, ...configs);
  }
  static [Symbol.hasInstance](instance) {
    if (!instance) return false;
    let constructor = instance.constructor;
    while (constructor) {
      constructor = constructor.prototype?.constructor;
      if (constructor === this) return true;
      constructor &&= Object.getPrototypeOf(constructor);
    }
    return false;
  }
};

// src/config.ts
import { isAbsolute, resolve as resolve2 } from "node:path";

// ../../node_modules/.pnpm/@deepseek-ai+schemastery@3.19.0/node_modules/@deepseek-ai/schemastery/lib/index.mjs
var kSchema = Symbol.for("schemastery");
var kValidationError2 = Symbol.for("ValidationError");
globalThis.__schemastery_index__ ??= 0;
globalThis.__schemastery_refs__ = void 0;
var ValidationError2 = class extends TypeError {
  options;
  name = "ValidationError";
  constructor(message, options) {
    let prefix = "$";
    for (const segment of options.path || []) if (typeof segment === "string") prefix += "." + segment;
    else if (typeof segment === "number") prefix += "[" + segment + "]";
    else if (typeof segment === "symbol") prefix += `[Symbol(${segment.toString()})]`;
    if (prefix.startsWith(".")) prefix = prefix.slice(1);
    super((prefix === "$" ? "" : `${prefix} `) + message);
    this.options = options;
  }
  static is(error) {
    return !!error?.[kValidationError2];
  }
};
Object.defineProperty(ValidationError2.prototype, kValidationError2, { value: true });
var Schema = function(options) {
  const schema = function(data, options2 = {}) {
    return Schema.resolve(data, schema, options2)[0];
  };
  if (options.refs) {
    const refs = mapValues(options.refs, (options2) => new Schema(options2));
    const getRef = (uid) => refs[uid];
    for (const key in refs) {
      const options2 = refs[key];
      options2.sKey = getRef(options2.sKey);
      options2.inner = getRef(options2.inner);
      options2.list = options2.list && options2.list.map(getRef);
      options2.dict = options2.dict && mapValues(options2.dict, getRef);
    }
    return refs[options.uid];
  }
  Object.assign(schema, options);
  if (typeof schema.callback === "string") try {
    schema.callback = new Function("return " + schema.callback)();
  } catch {
  }
  Object.defineProperty(schema, "uid", { value: globalThis.__schemastery_index__++ });
  Object.setPrototypeOf(schema, Schema.prototype);
  schema.meta ||= {};
  schema.toString = schema.toString.bind(schema);
  return schema;
};
Schema.prototype = Object.create(Function.prototype);
Schema.prototype[kSchema] = true;
Object.defineProperty(Schema.prototype, "~standard", { get() {
  return {
    version: 1,
    vendor: "schemastery",
    validate: (value) => {
      try {
        return { value: Schema.resolve(value, this, {})[0] };
      } catch (error) {
        if (ValidationError2.is(error)) return { issues: [{
          message: error.message,
          path: error.options.path
        }] };
        throw error;
      }
    }
  };
} });
Schema.ValidationError = ValidationError2;
Schema.prototype.toJSON = function toJSON() {
  if (globalThis.__schemastery_refs__) {
    globalThis.__schemastery_refs__[this.uid] ??= JSON.parse(JSON.stringify({ ...this }));
    return this.uid;
  }
  globalThis.__schemastery_refs__ = { [this.uid]: { ...this } };
  globalThis.__schemastery_refs__[this.uid] = JSON.parse(JSON.stringify({ ...this }));
  const result = {
    uid: this.uid,
    refs: globalThis.__schemastery_refs__
  };
  globalThis.__schemastery_refs__ = void 0;
  return result;
};
Schema.prototype.set = function set(key, value) {
  this.dict[key] = value;
  return this;
};
Schema.prototype.push = function push(value) {
  this.list.push(value);
  return this;
};
function mergeDesc(original, messages) {
  const result = typeof original === "string" ? { "": original } : { ...original };
  for (const locale in messages) {
    const value = messages[locale];
    if (value?.$description || value?.$desc) result[locale] = value.$description || value.$desc;
    else if (typeof value === "string") result[locale] = value;
  }
  return result;
}
function getInner(value) {
  return value?.$value ?? value?.$inner;
}
function extractKeys(data) {
  return filterKeys(data ?? {}, (key) => !key.startsWith("$"));
}
Schema.prototype.i18n = function i18n(messages) {
  const schema = Schema(this);
  const desc = mergeDesc(schema.meta.description, messages);
  if (Object.keys(desc).length) schema.meta.description = desc;
  if (schema.dict) schema.dict = mapValues(schema.dict, (inner, key) => {
    return inner.i18n(mapValues(messages, (data) => getInner(data)?.[key] ?? data?.[key]));
  });
  if (schema.list) schema.list = schema.list.map((inner, index) => {
    return inner.i18n(mapValues(messages, (data = {}) => {
      if (Array.isArray(getInner(data))) return getInner(data)[index];
      if (Array.isArray(data)) return data[index];
      return extractKeys(data);
    }));
  });
  if (schema.inner) schema.inner = schema.inner.i18n(mapValues(messages, (data) => {
    if (getInner(data)) return getInner(data);
    return extractKeys(data);
  }));
  if (schema.sKey) schema.sKey = schema.sKey.i18n(mapValues(messages, (data) => data?.$key));
  return schema;
};
Schema.prototype.extra = function extra(key, value) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    [key]: value
  };
  return schema;
};
for (const key of [
  "required",
  "disabled",
  "collapse",
  "hidden",
  "loose"
]) Object.assign(Schema.prototype, { [key](value = true) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    [key]: value
  };
  return schema;
} });
Schema.prototype.deprecated = function deprecated() {
  const schema = Schema(this);
  schema.meta.badges ||= [];
  schema.meta.badges.push({
    text: "deprecated",
    type: "danger"
  });
  return schema;
};
Schema.prototype.experimental = function experimental() {
  const schema = Schema(this);
  schema.meta.badges ||= [];
  schema.meta.badges.push({
    text: "experimental",
    type: "warning"
  });
  return schema;
};
Schema.prototype.pattern = function pattern(regexp) {
  const schema = Schema(this);
  const pattern2 = pick(regexp, ["source", "flags"]);
  schema.meta = {
    ...schema.meta,
    pattern: pattern2
  };
  return schema;
};
Schema.prototype.simplify = function simplify(value) {
  if (isVolatile(value)) value = value.get();
  if (deepEqual(value, this.meta.default, this.type === "dict")) return null;
  if (isNullable(value)) return value;
  if (this.type === "object" || this.type === "dict") {
    const result = {};
    for (const key in value) {
      const item = (this.type === "object" ? this.dict[key] : this.inner)?.simplify(value[key]);
      if (this.type === "dict" || !isNullable(item)) result[key] = item;
    }
    if (deepEqual(result, this.meta.default, this.type === "dict")) return null;
    return result;
  } else if (this.type === "array" || this.type === "tuple") {
    const result = [];
    value.forEach((value2, index) => {
      const schema = this.type === "array" ? this.inner : this.list[index];
      const item = schema ? schema.simplify(value2) : value2;
      result.push(item);
    });
    return result;
  } else if (this.type === "intersect") {
    const result = {};
    for (const item of this.list) Object.assign(result, item.simplify(value));
    return result;
  } else if (this.type === "union") for (const schema of this.list) try {
    Schema.resolve(value, schema, {});
    return schema.simplify(value);
  } catch {
  }
  return value;
};
Schema.prototype.toString = function toString(inline) {
  return formatters[this.type]?.(this, inline) ?? `Schema<${this.type}>`;
};
Schema.prototype.role = function role(role, extra2) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    role,
    extra: extra2
  };
  return schema;
};
for (const key of [
  "default",
  "link",
  "comment",
  "description",
  "max",
  "min",
  "step"
]) Object.assign(Schema.prototype, { [key](value) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    [key]: value
  };
  return schema;
} });
Schema.prototype.volatile = function volatile() {
  if (this.meta.volatile) throw new TypeError("volatile schema is already wrapped");
  return this.extra("volatile", true);
};
var resolvers = {};
var checkedVolatile = Symbol("checked-volatile-schema");
function validateVolatileSchema(schema, path = [], blocked = false, seen = /* @__PURE__ */ new Map()) {
  const states = seen.get(schema) ?? /* @__PURE__ */ new Set();
  if (states.has(blocked)) return;
  states.add(blocked);
  seen.set(schema, states);
  if (schema.meta?.volatile && blocked) throw new ValidationError2("volatile fields require a fixed object path without an enclosing volatile field", { path });
  const nested = blocked || !!schema.meta?.volatile;
  if (schema.dict) for (const [key, child] of Object.entries(schema.dict)) validateVolatileSchema(child, [...path, key], nested, seen);
  if (schema.sKey) validateVolatileSchema(schema.sKey, [...path, "<key>"], true, seen);
  if (schema.inner && (schema.type !== "lazy" || schema.inner[kSchema])) validateVolatileSchema(schema.inner, [...path, "*"], true, seen);
  if (schema.list) for (let index = 0; index < schema.list.length; index++) validateVolatileSchema(schema.list[index], [...path, String(index)], true, seen);
}
Schema.extend = function extend(type, resolve3) {
  resolvers[type] = resolve3;
};
Schema.resolve = function resolve(data, schema, options = {}, strict = false) {
  if (!schema) return [data];
  if (!options[checkedVolatile]) {
    validateVolatileSchema(schema, options.path);
    options = {
      ...options,
      [checkedVolatile]: true
    };
  }
  if (schema.meta?.volatile) {
    const inner = Schema(schema);
    inner.meta = {
      ...schema.meta,
      volatile: false
    };
    const [value, adapted] = Schema.resolve(data, inner, options, strict);
    try {
      return [createVolatile(value), adapted];
    } catch (error) {
      throw new ValidationError2(error instanceof Error ? error.message : String(error), options);
    }
  }
  if (options.ignore?.(data, schema)) return [data];
  if (isNullable(data) && schema.type !== "lazy") {
    if (schema.meta.required) throw new ValidationError2(`missing required value`, options);
    let current = schema;
    let fallback = schema.meta.default;
    while (current?.type === "intersect" && isNullable(fallback)) {
      current = current.list[0];
      fallback = current?.meta.default;
    }
    if (isNullable(fallback)) return [data];
    data = clone(fallback);
  }
  const callback = resolvers[schema.type];
  if (!callback) throw new ValidationError2(`unsupported type "${schema.type}"`, options);
  try {
    return callback(data, schema, options, strict);
  } catch (error) {
    if (!schema.meta.loose) throw error;
    return [schema.meta.default];
  }
};
Schema.from = function from(source) {
  if (isNullable(source)) return Schema.any();
  else if ([
    "string",
    "number",
    "boolean"
  ].includes(typeof source)) return Schema.const(source).required();
  else if (source[kSchema]) return source;
  else if (typeof source === "function") switch (source) {
    case String:
      return Schema.string().required();
    case Number:
      return Schema.number().required();
    case Boolean:
      return Schema.boolean().required();
    case Function:
      return Schema.function().required();
    default:
      return Schema.is(source).required();
  }
  else throw new TypeError(`cannot infer schema from ${source}`);
};
Schema.lazy = function lazy(builder) {
  const toJSON2 = () => {
    if (!schema.inner[kSchema]) {
      schema.inner = schema.builder();
      schema.inner.meta = {
        ...schema.meta,
        ...schema.inner.meta
      };
    }
    return schema.inner.toJSON();
  };
  const schema = new Schema({
    type: "lazy",
    builder,
    inner: { toJSON: toJSON2 }
  });
  return schema;
};
Schema.natural = function natural() {
  return Schema.number().step(1).min(0);
};
Schema.percent = function percent() {
  return Schema.number().step(0.01).min(0).max(1).role("slider");
};
Schema.date = function date() {
  return Schema.union([Schema.is(Date), Schema.transform(Schema.string().role("datetime"), (value, options) => {
    const date2 = new Date(value);
    if (isNaN(+date2)) throw new ValidationError2(`invalid date "${value}"`, options);
    return date2;
  }, true)]);
};
Schema.regExp = function regExp(flag = "") {
  return Schema.union([Schema.is(RegExp), Schema.transform(Schema.string().role("regexp", { flag }), (value, options) => {
    try {
      return new RegExp(value, flag);
    } catch (e) {
      throw new ValidationError2(e.message, options);
    }
  }, true)]);
};
Schema.arrayBuffer = function arrayBuffer(encoding) {
  return Schema.union([
    Schema.is(ArrayBuffer),
    Schema.is(SharedArrayBuffer),
    Schema.transform(Schema.any(), (value, options) => {
      if (Binary.isSource(value)) return Binary.fromSource(value);
      throw new ValidationError2(`expected ArrayBufferSource but got ${value}`, options);
    }, true),
    ...encoding ? [Schema.transform(Schema.string(), (value, options) => {
      try {
        return encoding === "base64" ? Binary.fromBase64(value) : Binary.fromHex(value);
      } catch (e) {
        throw new ValidationError2(e.message, options);
      }
    }, true)] : []
  ]);
};
Schema.extend("lazy", (data, schema, options, strict) => {
  if (!schema.inner[kSchema]) {
    schema.inner = schema.builder();
    schema.inner.meta = {
      ...schema.meta,
      ...schema.inner.meta
    };
    validateVolatileSchema(schema.inner, options.path, true);
  }
  return Schema.resolve(data, schema.inner, options, strict);
});
Schema.extend("any", (data) => {
  return [data];
});
Schema.extend("never", (data, _, options) => {
  throw new ValidationError2(`expected nullable but got ${data}`, options);
});
Schema.extend("const", (data, { value }, options) => {
  if (deepEqual(data, value)) return [value];
  throw new ValidationError2(`expected ${value} but got ${data}`, options);
});
function checkWithinRange(data, meta, description, options, skipMin = false) {
  const { max = Infinity, min = -Infinity } = meta;
  if (data > max) throw new ValidationError2(`expected ${description} <= ${max} but got ${data}`, options);
  if (data < min && !skipMin) throw new ValidationError2(`expected ${description} >= ${min} but got ${data}`, options);
}
Schema.extend("string", (data, { meta }, options) => {
  if (typeof data !== "string") throw new ValidationError2(`expected string but got ${data}`, options);
  if (meta.pattern) {
    const regexp = new RegExp(meta.pattern.source, meta.pattern.flags);
    if (!regexp.test(data)) throw new ValidationError2(`expect string to match regexp ${regexp}`, options);
  }
  checkWithinRange(data.length, meta, "string length", options);
  return [data];
});
function decimalShift(data, digits) {
  const str = data.toString();
  if (str.includes("e")) return data * Math.pow(10, digits);
  const index = str.indexOf(".");
  if (index === -1) return data * Math.pow(10, digits);
  const frac = str.slice(index + 1);
  const integer = str.slice(0, index);
  if (frac.length <= digits) return +(integer + frac.padEnd(digits, "0"));
  return +(integer + frac.slice(0, digits) + "." + frac.slice(digits));
}
function isMultipleOf(data, min, step) {
  step = Math.abs(step);
  if (!/^\d+\.\d+$/.test(step.toString())) return (data - min) % step === 0;
  const index = step.toString().indexOf(".");
  const digits = step.toString().slice(index + 1).length;
  return Math.abs(decimalShift(data, digits) - decimalShift(min, digits)) % decimalShift(step, digits) === 0;
}
Schema.extend("number", (data, { meta }, options) => {
  if (typeof data !== "number") throw new ValidationError2(`expected number but got ${data}`, options);
  checkWithinRange(data, meta, "number", options);
  const { step } = meta;
  if (step && !isMultipleOf(data, meta.min ?? 0, step)) throw new ValidationError2(`expected number multiple of ${step} but got ${data}`, options);
  return [data];
});
Schema.extend("boolean", (data, _, options) => {
  if (typeof data === "boolean") return [data];
  throw new ValidationError2(`expected boolean but got ${data}`, options);
});
Schema.extend("bitset", (data, { bits, meta }, options) => {
  let value = 0, keys = [];
  if (typeof data === "number") {
    value = data;
    for (const key in bits) if (data & bits[key]) keys.push(key);
  } else if (Array.isArray(data)) {
    keys = data;
    for (const key of keys) {
      if (typeof key !== "string") throw new ValidationError2(`expected string but got ${key}`, options);
      if (key in bits) value |= bits[key];
    }
  } else throw new ValidationError2(`expected number or array but got ${data}`, options);
  if (value === meta.default) return [value];
  return [value, keys];
});
Schema.extend("function", (data, _, options) => {
  if (typeof data === "function") return [data];
  throw new ValidationError2(`expected function but got ${data}`, options);
});
Schema.extend("is", (data, { constructor }, options) => {
  if (typeof constructor === "function") {
    if (data instanceof constructor) return [data];
    throw new ValidationError2(`expected ${constructor.name} but got ${data}`, options);
  } else {
    if (isNullable(data)) throw new ValidationError2(`expected ${constructor} but got ${data}`, options);
    let prototype = Object.getPrototypeOf(data);
    while (prototype) {
      if (prototype.constructor?.name === constructor) return [data];
      prototype = Object.getPrototypeOf(prototype);
    }
    throw new ValidationError2(`expected ${constructor} but got ${data}`, options);
  }
});
function property(data, key, schema, options) {
  try {
    const [value, adapted] = Schema.resolve(data[key], schema, {
      ...options,
      path: [...options.path || [], key]
    });
    if (adapted !== void 0) data[key] = adapted;
    return value;
  } catch (e) {
    if (!options?.autofix) throw e;
    delete data[key];
    return schema.meta.volatile ? createVolatile(schema.meta.default) : schema.meta.default;
  }
}
Schema.extend("array", (data, { inner, meta }, options) => {
  if (!Array.isArray(data)) throw new ValidationError2(`expected array but got ${data}`, options);
  checkWithinRange(data.length, meta, "array length", options, !isNullable(inner.meta.default));
  return [data.map((_, index) => property(data, index, inner, options))];
});
Schema.extend("dict", (data, { inner, sKey }, options, strict) => {
  if (!isPlainObject(data)) throw new ValidationError2(`expected object but got ${data}`, options);
  const result = {};
  for (const key in data) {
    let rKey;
    try {
      rKey = Schema.resolve(key, sKey, options)[0];
    } catch (error) {
      if (strict) continue;
      throw error;
    }
    result[rKey] = property(data, key, inner, options);
    data[rKey] = data[key];
    if (key !== rKey) delete data[key];
  }
  return [result];
});
Schema.extend("tuple", (data, { list }, options, strict) => {
  if (!Array.isArray(data)) throw new ValidationError2(`expected array but got ${data}`, options);
  const result = list.map((inner, index) => property(data, index, inner, options));
  if (strict) return [result];
  result.push(...data.slice(list.length));
  return [result];
});
function merge(result, data) {
  for (const key in data) {
    if (key in result) continue;
    result[key] = data[key];
  }
}
Schema.extend("object", (data, { dict }, options, strict) => {
  if (!isPlainObject(data)) throw new ValidationError2(`expected object but got ${data}`, options);
  const result = {};
  for (const key in dict) {
    const value = property(data, key, dict[key], options);
    if (!isNullable(value) || key in data) result[key] = value;
  }
  if (!strict) merge(result, data);
  return [result];
});
Schema.extend("union", (data, { list, toString: toString2 }, options, strict) => {
  const messages = [];
  for (const inner of list) try {
    return Schema.resolve(data, inner, options, strict);
  } catch (error) {
    messages.push(error);
  }
  throw new ValidationError2(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
});
Schema.extend("intersect", (data, { list, toString: toString2 }, options, strict) => {
  if (!list.length) return [data];
  let result;
  for (const inner of list) {
    const value = Schema.resolve(data, inner, options, true)[0];
    if (isNullable(value)) continue;
    if (isNullable(result)) result = value;
    else if (typeof result !== typeof value) throw new ValidationError2(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
    else if (typeof value === "object") merge(result ??= {}, value);
    else if (result !== value) throw new ValidationError2(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
  }
  if (!strict && isPlainObject(data)) merge(result, data);
  return [result];
});
Schema.extend("transform", (data, { inner, callback, preserve }, options) => {
  const [result, adapted = data] = Schema.resolve(data, inner, options, true);
  if (preserve) return [callback(result)];
  else return [callback(result), callback(adapted)];
});
var formatters = {};
function defineMethod(name2, keys, format) {
  formatters[name2] = format;
  Object.assign(Schema, { [name2](...args) {
    const schema = new Schema({ type: name2 });
    keys.forEach((key, index) => {
      switch (key) {
        case "sKey":
          schema.sKey = args[index] ?? Schema.string();
          break;
        case "inner":
          schema.inner = Schema.from(args[index]);
          break;
        case "list":
          schema.list = args[index].map(Schema.from);
          break;
        case "dict":
          schema.dict = mapValues(args[index], Schema.from);
          break;
        case "bits":
          schema.bits = {};
          for (const key2 in args[index]) {
            if (typeof args[index][key2] !== "number") continue;
            schema.bits[key2] = args[index][key2];
          }
          break;
        case "callback": {
          const callback = schema.callback = args[index];
          callback["toJSON"] ||= () => callback.toString();
          break;
        }
        case "constructor": {
          const constructor = schema.constructor = args[index];
          if (typeof constructor === "function") constructor["toJSON"] ||= () => constructor["name"];
          break;
        }
        default:
          schema[key] = args[index];
      }
    });
    if (name2 === "object" || name2 === "dict") schema.meta.default = {};
    else if (name2 === "array" || name2 === "tuple") schema.meta.default = [];
    else if (name2 === "bitset") schema.meta.default = 0;
    return schema;
  } });
}
defineMethod("is", ["constructor"], ({ constructor }) => {
  if (typeof constructor === "function") return constructor.name;
  else return constructor;
});
defineMethod("any", [], () => "any");
defineMethod("never", [], () => "never");
defineMethod("const", ["value"], ({ value }) => typeof value === "string" ? JSON.stringify(value) : value);
defineMethod("string", [], () => "string");
defineMethod("number", [], () => "number");
defineMethod("boolean", [], () => "boolean");
defineMethod("bitset", ["bits"], () => "bitset");
defineMethod("function", [], () => "function");
defineMethod("array", ["inner"], ({ inner }) => `${inner.toString(true)}[]`);
defineMethod("dict", ["inner", "sKey"], ({ inner, sKey }) => `{ [key: ${sKey.toString()}]: ${inner.toString()} }`);
defineMethod("tuple", ["list"], ({ list }) => `[${list.map((inner) => inner.toString()).join(", ")}]`);
defineMethod("object", ["dict"], ({ dict }) => {
  if (Object.keys(dict).length === 0) return "{}";
  return `{ ${Object.entries(dict).map(([key, inner]) => {
    return `${key}${inner.meta.required ? "" : "?"}: ${inner.toString()}`;
  }).join(", ")} }`;
});
defineMethod("union", ["list"], ({ list }, inline) => {
  const result = list.map(({ toString: format }) => format()).join(" | ");
  return inline ? `(${result})` : result;
});
defineMethod("intersect", ["list"], ({ list }) => {
  return `${list.map((inner) => inner.toString(true)).join(" & ")}`;
});
defineMethod("transform", [
  "inner",
  "callback",
  "preserve"
], ({ inner }, isInner) => inner.toString(isInner));

// src/config.ts
var Config = Schema.object({
  archiveRoot: Schema.string().description("\u4F1A\u8BDD\u65E5\u5FD7\u7684\u5F52\u6863\u6839\u76EE\u5F55\uFF08\u7EDD\u5BF9\u8DEF\u5F84\u6216 ~/ \u5F00\u5934\uFF09\uFF1B\u7F3A\u7701\u4E3A $DSH_HOME/archive/sessions")
}).description("web-ux \u7684\u5220\u9664/\u5F52\u6863\u914D\u7F6E\uFF1A\u5F52\u6863\u6839\u76EE\u5F55\u53EF\u914D");
function defaultArchiveRoot(context) {
  return context.homePath("archive", "sessions");
}
function resolveArchiveRoot(configured, context) {
  const fallback = defaultArchiveRoot(context);
  const raw = typeof configured === "string" ? configured.trim() : "";
  if (raw === "") return fallback;
  if (raw.startsWith("~/") || raw.startsWith("~\\")) return resolve2(context.homedir, raw.slice(2));
  if (isAbsolute(raw)) return resolve2(raw);
  context.warn(`web-ux: archiveRoot "${raw}" is not an absolute path or ~/ path; falling back to ${fallback}`);
  return fallback;
}

// src/contract.ts
var CHANNEL = "/web-ux";
var PREVIEW_ENDPOINT = "preview-delete";
var DELETE_ENDPOINT = "delete-session";
var PREVIEW_BATCH_ENDPOINT = "preview-delete-batch";
var DELETE_BATCH_ENDPOINT = "delete-session-batch";
var LIST_MIGRATED_ENDPOINT = "list-migrated";
var DELETE_MIGRATED_ENDPOINT = "delete-migrated";
var RESTORE_MIGRATED_ENDPOINT = "restore-migrated";
var FAILURE_CODES = [
  "bad-request",
  "not-found",
  "not-archived",
  "not-migrated",
  "target-exists",
  "session-live",
  "archive-unavailable",
  "internal"
];
function isFailureCode(code) {
  return FAILURE_CODES.includes(code);
}
var DISPOSAL_MODES = ["delete", "archive"];
function isDisposalMode(value) {
  return typeof value === "string" && DISPOSAL_MODES.includes(value);
}
var MAX_BATCH_TARGETS = 500;
var MAX_LISTED_MIGRATED = 2e3;
var MAX_PATH_SEGMENT = 255;
function readObject(value, subject) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, message: `${subject}\u4E0D\u662F\u5BF9\u8C61` };
  }
  return { ok: true, value };
}
function readExactFields(record, allowed, subject) {
  const extra2 = Object.keys(record).filter((key) => !allowed.includes(key));
  if (extra2.length > 0) return { ok: false, message: `${subject}\u542B\u672A\u77E5\u5B57\u6BB5\uFF1A${extra2.join(", ")}` };
  return { ok: true, value: record };
}
function readPathSegment(value, subject) {
  if (typeof value !== "string" || value === "") return { ok: false, message: `${subject} \u7F3A\u5931\u6216\u4E0D\u662F\u975E\u7A7A\u5B57\u7B26\u4E32` };
  if (value.length > MAX_PATH_SEGMENT) return { ok: false, message: `${subject} \u8D85\u957F` };
  if (/[\u0000-\u001f\u007f]/.test(value)) return { ok: false, message: `${subject} \u542B\u63A7\u5236\u5B57\u7B26` };
  if (value === "." || value === "..") return { ok: false, message: `${subject} \u4E0D\u80FD\u662F . \u6216 ..` };
  if (value.includes("/") || value.includes("\\")) return { ok: false, message: `${subject} \u542B\u8DEF\u5F84\u5206\u9694\u7B26` };
  return { ok: true, value };
}
function readDeleteRequest(payload) {
  const object = readObject(payload, "\u8BF7\u6C42\u4F53");
  if (!object.ok) return object;
  const fields = readExactFields(object.value, ["sessionId", "mode"], "\u8BF7\u6C42\u4F53");
  if (!fields.ok) return fields;
  const record = fields.value;
  const sessionId = readPathSegment(record["sessionId"], "sessionId");
  if (!sessionId.ok) return sessionId;
  const mode = record["mode"];
  if (!isDisposalMode(mode)) return { ok: false, message: "mode \u7F3A\u5931\u6216\u4E0D\u662F delete / archive" };
  return { ok: true, value: { sessionId: sessionId.value, mode } };
}
function readBatchRequest(payload) {
  const object = readObject(payload, "\u8BF7\u6C42\u4F53");
  if (!object.ok) return object;
  const fields = readExactFields(object.value, ["sessionIds", "mode"], "\u8BF7\u6C42\u4F53");
  if (!fields.ok) return fields;
  const record = fields.value;
  const sessionIds = record["sessionIds"];
  if (!Array.isArray(sessionIds)) return { ok: false, message: "sessionIds \u7F3A\u5931\u6216\u4E0D\u662F\u6570\u7EC4" };
  if (sessionIds.length === 0) return { ok: false, message: "sessionIds \u4E0D\u80FD\u4E3A\u7A7A\u6570\u7EC4" };
  if (sessionIds.length > MAX_BATCH_TARGETS) {
    return { ok: false, message: `sessionIds \u8D85\u8FC7\u5355\u6279\u4E0A\u9650 ${MAX_BATCH_TARGETS}` };
  }
  const ids = [];
  for (let index = 0; index < sessionIds.length; index += 1) {
    const id = readPathSegment(sessionIds[index], `sessionIds[${index}]`);
    if (!id.ok) return id;
    ids.push(id.value);
  }
  const mode = record["mode"];
  if (!isDisposalMode(mode)) return { ok: false, message: "mode \u7F3A\u5931\u6216\u4E0D\u662F delete / archive" };
  return { ok: true, value: { sessionIds: ids, mode } };
}
function readMigratedRequest(payload) {
  const object = readObject(payload, "\u8BF7\u6C42\u4F53");
  if (!object.ok) return object;
  const fields = readExactFields(object.value, ["entries"], "\u8BF7\u6C42\u4F53");
  if (!fields.ok) return fields;
  const entries = fields.value["entries"];
  if (!Array.isArray(entries)) return { ok: false, message: "entries \u7F3A\u5931\u6216\u4E0D\u662F\u6570\u7EC4" };
  if (entries.length === 0) return { ok: false, message: "entries \u4E0D\u80FD\u4E3A\u7A7A\u6570\u7EC4" };
  if (entries.length > MAX_BATCH_TARGETS) {
    return { ok: false, message: `entries \u8D85\u8FC7\u5355\u6279\u4E0A\u9650 ${MAX_BATCH_TARGETS}` };
  }
  const targets = [];
  for (let index = 0; index < entries.length; index += 1) {
    const subject = `entries[${index}]`;
    const entry = readObject(entries[index], subject);
    if (!entry.ok) return entry;
    const exact = readExactFields(entry.value, ["projectDir", "dirName"], subject);
    if (!exact.ok) return exact;
    const projectDir = readPathSegment(exact.value["projectDir"], `${subject}.projectDir`);
    if (!projectDir.ok) return projectDir;
    const dirName = readPathSegment(exact.value["dirName"], `${subject}.dirName`);
    if (!dirName.ok) return dirName;
    targets.push({ projectDir: projectDir.value, dirName: dirName.value });
  }
  return { ok: true, value: { entries: targets } };
}
function readEmptyRequest(payload) {
  const object = readObject(payload, "\u8BF7\u6C42\u4F53");
  if (!object.ok) return object;
  const keys = Object.keys(object.value);
  if (keys.length > 0) return { ok: false, message: `\u8BF7\u6C42\u4F53\u542B\u672A\u77E5\u5B57\u6BB5\uFF1A${keys.join(", ")}` };
  return { ok: true, value: {} };
}
function parseRequest(endpoint, payload) {
  switch (endpoint) {
    case PREVIEW_ENDPOINT: {
      const body = readDeleteRequest(payload);
      if (!body.ok) return body;
      return { ok: true, value: { endpoint: PREVIEW_ENDPOINT, body: body.value } };
    }
    case DELETE_ENDPOINT: {
      const body = readDeleteRequest(payload);
      if (!body.ok) return body;
      return { ok: true, value: { endpoint: DELETE_ENDPOINT, body: body.value } };
    }
    case PREVIEW_BATCH_ENDPOINT: {
      const body = readBatchRequest(payload);
      if (!body.ok) return body;
      return { ok: true, value: { endpoint: PREVIEW_BATCH_ENDPOINT, body: body.value } };
    }
    case DELETE_BATCH_ENDPOINT: {
      const body = readBatchRequest(payload);
      if (!body.ok) return body;
      return { ok: true, value: { endpoint: DELETE_BATCH_ENDPOINT, body: body.value } };
    }
    case LIST_MIGRATED_ENDPOINT: {
      const body = readEmptyRequest(payload);
      if (!body.ok) return body;
      return { ok: true, value: { endpoint: LIST_MIGRATED_ENDPOINT, body: body.value } };
    }
    case DELETE_MIGRATED_ENDPOINT: {
      const body = readMigratedRequest(payload);
      if (!body.ok) return body;
      return { ok: true, value: { endpoint: DELETE_MIGRATED_ENDPOINT, body: body.value } };
    }
    case RESTORE_MIGRATED_ENDPOINT: {
      const body = readMigratedRequest(payload);
      if (!body.ok) return body;
      return { ok: true, value: { endpoint: RESTORE_MIGRATED_ENDPOINT, body: body.value } };
    }
    default:
      return { ok: false, message: `\u672A\u77E5\u7AEF\u70B9 "${endpoint}"` };
  }
}

// src/delete-session.ts
import { basename, dirname, isAbsolute as isAbsolute2, join } from "node:path";
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
async function previewDelete(ports, sessionId, archiveRoot) {
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
    preview: { sessionCount: plan.ids.length, descendantCount: plan.ids.length - 1, logBytes, archiveRoot }
  };
}
async function deleteSession(ports, sessionId) {
  const plan = await planDelete(sessionId, ports);
  if (!plan.ok) return plan;
  return { ok: true, outcome: await disposeAll(ports, plan.ids, (id) => ports.removeFiles(id)) };
}
async function archiveSession(ports, sessionId, archiveRoot) {
  const plan = await planDelete(sessionId, ports);
  if (!plan.ok) return plan;
  if (!isAbsolute2(archiveRoot)) {
    return { ok: false, code: "archive-unavailable", message: `archive root "${archiveRoot}" is not an absolute path` };
  }
  try {
    await ports.prepareArchive(archiveRoot);
  } catch (error) {
    return { ok: false, code: "archive-unavailable", message: `archive root "${archiveRoot}" is not usable: ${reasonOf(error)}` };
  }
  return { ok: true, outcome: await disposeAll(ports, plan.ids, (id) => ports.archiveFiles(id, archiveRoot)) };
}
function collectDeleteSetMany(targets, headers) {
  const ids = [];
  const included = /* @__PURE__ */ new Set();
  for (const target of targets) {
    for (const id of collectDeleteSet(target, headers)) {
      if (included.has(id)) continue;
      included.add(id);
      ids.push(id);
    }
  }
  return ids;
}
async function planDeleteBatch(targets, ports) {
  const headers = await ports.listStoredHeaders();
  const stored = new Set(headers.map((header) => header.id));
  const accepted = [];
  const rejected = [];
  for (const target of uniqueTargets(targets)) {
    if (!stored.has(target)) {
      rejected.push({ sessionId: target, code: "not-found", message: `session "${target}" is not in session persistence` });
      continue;
    }
    if (!ports.isArchived(target)) {
      rejected.push({ sessionId: target, code: "not-archived", message: `session "${target}" is not archived` });
      continue;
    }
    const live = collectDeleteSet(target, headers).find((id) => ports.isLive(id));
    if (live !== void 0) {
      rejected.push({ sessionId: target, code: "session-live", message: `session "${live}" is still live on the host` });
      continue;
    }
    accepted.push(target);
  }
  return { accepted, union: collectDeleteSetMany(accepted, headers), rejected };
}
async function previewDeleteBatch(ports, targets, archiveRoot) {
  const plan = await planDeleteBatch(targets, ports);
  let logBytes = 0;
  for (const id of plan.union) {
    try {
      logBytes += await ports.measureFiles(id);
    } catch (error) {
      ports.warn(`web-ux: measuring the stored files of session "${id}" failed`, error);
    }
  }
  return {
    targetCount: uniqueTargets(targets).length,
    sessionCount: plan.union.length,
    descendantCount: plan.union.length - plan.accepted.length,
    logBytes,
    archiveRoot,
    rejected: plan.rejected
  };
}
async function deleteSessionBatch(ports, targets) {
  return disposeBatch(ports, targets, { mode: "delete" });
}
async function archiveSessionBatch(ports, targets, archiveRoot) {
  return disposeBatch(ports, targets, { mode: "archive", archiveRoot });
}
async function disposeBatch(ports, targets, disposal) {
  const plan = await planDeleteBatch(targets, ports);
  if (plan.rejected.length > 0) {
    const [first] = plan.rejected;
    return { ok: false, code: isFailureCode(first.code) ? first.code : "internal", message: first.message };
  }
  const archiveRoot = disposal.mode === "archive" ? disposal.archiveRoot : void 0;
  if (archiveRoot !== void 0) {
    if (!isAbsolute2(archiveRoot)) {
      return { ok: false, code: "archive-unavailable", message: `archive root "${archiveRoot}" is not an absolute path` };
    }
    try {
      await ports.prepareArchive(archiveRoot);
    } catch (error) {
      return { ok: false, code: "archive-unavailable", message: `archive root "${archiveRoot}" is not usable: ${reasonOf(error)}` };
    }
  }
  const outcome = archiveRoot === void 0 ? await disposeAll(ports, plan.union, (id) => ports.removeFiles(id)) : await disposeAll(ports, plan.union, (id) => ports.archiveFiles(id, archiveRoot));
  return { ok: true, outcome };
}
function uniqueTargets(targets) {
  return [...new Set(targets)];
}
async function disposeAll(ports, ids, disposeFiles) {
  const warnings = [];
  for (const id of ids) {
    try {
      await ports.cleanupRegistry(id);
    } catch (error) {
      warnings.push(`registry: ${id}: ${reasonOf(error)}`);
      ports.warn(`web-ux: removing session "${id}" from the workspace registry failed`, error);
    }
    try {
      warnings.push(...await disposeFiles(id));
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
  return { removed: ids, warnings };
}
var SESSION_ID_MAX = 255;
var CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
function isSafePathSegment(value) {
  return value !== "" && value.length <= SESSION_ID_MAX && value !== "." && value !== ".." && !value.includes("/") && !value.includes("\\") && !CONTROL_CHARACTERS.test(value);
}
function isSafeSessionId(sessionId) {
  return isSafePathSegment(sessionId);
}
function isMissing(error) {
  return typeof error === "object" && error !== null && error.code === "ENOENT";
}
function isCrossDevice(error) {
  return typeof error === "object" && error !== null && error.code === "EXDEV";
}
function reasonOf(error) {
  return error instanceof Error ? error.message : String(error);
}
function copyFailure(src, dest, error) {
  return `copy ${src} -> ${dest}: ${reasonOf(error)} (the source was kept; the partial copy at the destination needs manual cleanup)`;
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
  async function copyTree2(from2, to) {
    const warnings = [];
    try {
      await fs.mkdir(to, { recursive: false });
    } catch (error) {
      warnings.push(`${from2} -> ${to}: ${reasonOf(error)}`);
      return warnings;
    }
    let entries;
    try {
      entries = await fs.readdir(from2);
    } catch (error) {
      warnings.push(`${from2} -> ${to}: ${reasonOf(error)}`);
      return warnings;
    }
    for (const entry of entries) {
      const src = join(from2, entry.name);
      const dest = join(to, entry.name);
      if (entry.isSymbolicLink?.() === true) {
        warnings.push(`${src}: symbolic link was not copied (the source directory was kept)`);
        continue;
      }
      if (entry.isDirectory()) {
        warnings.push(...await copyTree2(src, dest));
        continue;
      }
      try {
        await fs.copyFile(src, dest);
      } catch (error) {
        warnings.push(copyFailure(src, dest, error));
      }
    }
    return warnings;
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
    /** 递归建出归档根；失败直接抛出，由 {@link archiveSession} 映射为 `archive-unavailable`。 */
    async prepareArchive(archiveRoot) {
      await fs.mkdir(archiveRoot, { recursive: true });
    },
    /**
     * 迁移集合里一个会话的磁盘痕迹：每个命中的日志目录移动到
     * `<archiveRoot>/<项目目录>/<sessionId>`，随后删除投影缓存；返回失败项。
     */
    async archive(sessionId, archiveRoot) {
      if (!isSafeSessionId(sessionId)) {
        return [`session id ${JSON.stringify(sessionId)} is not a safe path segment; nothing was moved`];
      }
      const located = await locate(sessionId);
      const warnings = [...located.warnings];
      for (const src of located.paths) {
        const dest = join(archiveRoot, basename(dirname(src)), sessionId);
        try {
          await fs.lstat(dest);
          warnings.push(`${dest} already exists; the session directory was not moved (source kept at ${src})`);
          continue;
        } catch (error) {
          if (!isMissing(error)) {
            warnings.push(`${src} -> ${dest}: ${reasonOf(error)}`);
            continue;
          }
        }
        try {
          await fs.mkdir(dirname(dest), { recursive: true });
        } catch (error) {
          warnings.push(`${src} -> ${dest}: ${reasonOf(error)}`);
          continue;
        }
        try {
          await fs.rename(src, dest);
          continue;
        } catch (error) {
          if (!isCrossDevice(error)) {
            warnings.push(`${src} -> ${dest}: ${reasonOf(error)}`);
            continue;
          }
        }
        const copyWarnings = await copyTree2(src, dest);
        if (copyWarnings.length > 0) {
          warnings.push(...copyWarnings);
          continue;
        }
        try {
          await fs.rm(src, { recursive: true, force: false });
        } catch (error) {
          warnings.push(`moved to ${dest} but the source could not be removed: ${src}: ${reasonOf(error)}`);
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

// src/migrated.ts
var SESSION_ADDED_EVENT = "api-session/added";
function ownerOfProjectDir(projectDir, workspaces) {
  return workspaceForProjectDir(projectDir, workspaces);
}
function sessionIdOfEntry(dirName) {
  return dirName;
}
function joinUnder(base, ...segments) {
  const separator = base.includes("\\") && !base.includes("/") ? "\\" : "/";
  let path = base;
  while (path.length > 1 && (path.endsWith("/") || path.endsWith("\\"))) path = path.slice(0, -1);
  for (const segment of segments) {
    if (path === "" || path === "/") path = `${path}${segment}`;
    else path = `${path}${separator}${segment}`;
  }
  return path;
}
function archivePathOf(archiveRoot, target) {
  return joinUnder(archiveRoot, target.projectDir, target.dirName);
}
function isMissing2(error) {
  return typeof error === "object" && error !== null && error.code === "ENOENT";
}
function isCrossDevice2(error) {
  return typeof error === "object" && error !== null && error.code === "EXDEV";
}
function reasonOf2(error) {
  return error instanceof Error ? error.message : String(error);
}
function updatedAtOf(stats) {
  const value = stats.mtimeMs;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}
function copyFailure2(src, dest, error) {
  return `copy ${src} -> ${dest}: ${reasonOf2(error)} (the source was kept; the partial copy at the destination needs manual cleanup)`;
}
async function copyTree(fs, from2, to) {
  const warnings = [];
  try {
    await fs.mkdir(to, { recursive: false });
  } catch (error) {
    return [`${from2} -> ${to}: ${reasonOf2(error)}`];
  }
  let entries;
  try {
    entries = await fs.readdir(from2);
  } catch (error) {
    return [`${from2} -> ${to}: ${reasonOf2(error)}`];
  }
  for (const entry of entries) {
    const src = joinUnder(from2, entry.name);
    const dest = joinUnder(to, entry.name);
    if (entry.isSymbolicLink?.() === true) {
      warnings.push(`${src}: symbolic link was not copied (the source directory was kept)`);
      continue;
    }
    if (entry.isDirectory()) {
      warnings.push(...await copyTree(fs, src, dest));
      continue;
    }
    try {
      await fs.copyFile(src, dest);
    } catch (error) {
      warnings.push(copyFailure2(src, dest, error));
    }
  }
  return warnings;
}
async function inspectArchiveEntry(fs, archiveRoot, target) {
  if (!isSafePathSegment(target.projectDir)) {
    return { ok: false, code: "bad-request", message: `project directory ${JSON.stringify(target.projectDir)} is not a safe path segment` };
  }
  if (!isSafePathSegment(target.dirName)) {
    return { ok: false, code: "bad-request", message: `archive entry name ${JSON.stringify(target.dirName)} is not a safe path segment` };
  }
  const path = archivePathOf(archiveRoot, target);
  let stats;
  try {
    stats = await fs.lstat(path);
  } catch (error) {
    if (isMissing2(error)) {
      return { ok: false, code: "not-migrated", message: `archive entry "${path}" does not exist` };
    }
    return { ok: false, code: "archive-unavailable", message: `archive entry "${path}" is not readable: ${reasonOf2(error)}` };
  }
  if (!stats.isDirectory()) {
    return { ok: false, code: "not-migrated", message: `archive entry "${path}" is not a directory` };
  }
  return { ok: true, path, updatedAt: updatedAtOf(stats) };
}
async function inspectRestoreTarget(fs, path) {
  try {
    await fs.lstat(path);
    return { ok: false, code: "target-exists", message: `restore target "${path}" already exists` };
  } catch (error) {
    if (isMissing2(error)) return { ok: true };
    return { ok: false, code: "internal", message: `restore target "${path}" cannot be inspected: ${reasonOf2(error)}` };
  }
}
function uniqueTargets2(targets) {
  const seen = /* @__PURE__ */ new Set();
  const unique = [];
  for (const target of targets) {
    const key = `${target.projectDir}\0${target.dirName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(target);
  }
  return unique;
}
async function listArchiveEntries(fs, archiveRoot, warn) {
  let projects;
  try {
    projects = await fs.readdir(archiveRoot);
  } catch (error) {
    if (isMissing2(error)) return { entries: [], truncated: false };
    throw error;
  }
  const entries = [];
  let truncated = false;
  projectLoop: for (const project of projects) {
    const projectPath = joinUnder(archiveRoot, project.name);
    if (project.isSymbolicLink?.() === true) {
      warn(`${projectPath}: symbolic-linked project directory was not followed`);
      continue;
    }
    if (!project.isDirectory()) {
      warn(`${projectPath}: not a directory; skipped`);
      continue;
    }
    let sessions;
    try {
      sessions = await fs.readdir(projectPath);
    } catch (error) {
      if (!isMissing2(error)) warn(`${projectPath}: ${reasonOf2(error)}`);
      continue;
    }
    for (const session of sessions) {
      const sessionPath = joinUnder(projectPath, session.name);
      if (session.isSymbolicLink?.() === true) {
        warn(`${sessionPath}: symbolic-linked session directory was not followed`);
        continue;
      }
      if (!session.isDirectory()) {
        warn(`${sessionPath}: not a directory; skipped`);
        continue;
      }
      let stats;
      try {
        stats = await fs.lstat(sessionPath);
      } catch (error) {
        if (!isMissing2(error)) warn(`${sessionPath}: ${reasonOf2(error)}`);
        continue;
      }
      if (!stats.isDirectory()) {
        warn(`${sessionPath}: not a directory; skipped`);
        continue;
      }
      if (entries.length >= MAX_LISTED_MIGRATED) {
        truncated = true;
        break projectLoop;
      }
      let bytes = 0;
      let members;
      try {
        members = await fs.readdir(sessionPath);
      } catch (error) {
        warn(`${sessionPath}: ${reasonOf2(error)}`);
        members = [];
      }
      for (const member of members) {
        if (member.isDirectory()) continue;
        try {
          const fileStats = await fs.lstat(joinUnder(sessionPath, member.name));
          bytes += fileStats.size > 0 ? fileStats.size : 0;
        } catch {
        }
      }
      entries.push({
        sessionId: sessionIdOfEntry(session.name),
        dirName: session.name,
        projectDir: project.name,
        bytes,
        updatedAt: updatedAtOf(stats)
      });
    }
  }
  return { entries, truncated };
}
async function removeEntries(fs, archiveRoot, targets) {
  const warnings = [];
  for (const target of targets) {
    const path = archivePathOf(archiveRoot, target);
    try {
      await fs.rm(path, { recursive: true, force: true });
    } catch (error) {
      warnings.push(`${path}: ${reasonOf2(error)}`);
    }
  }
  return warnings;
}
async function moveArchiveEntry(fs, source, parent, destination) {
  try {
    await fs.mkdir(parent, { recursive: true });
  } catch (error) {
    return { moved: false, warnings: [`${source} -> ${destination}: ${reasonOf2(error)}`] };
  }
  try {
    await fs.rename(source, destination);
    return { moved: true, warnings: [] };
  } catch (error) {
    if (!isCrossDevice2(error)) {
      return { moved: false, warnings: [`${source} -> ${destination}: ${reasonOf2(error)}`] };
    }
  }
  const copyWarnings = await copyTree(fs, source, destination);
  if (copyWarnings.length > 0) return { moved: false, warnings: copyWarnings };
  const warnings = [];
  try {
    await fs.rm(source, { recursive: true, force: false });
  } catch (error) {
    warnings.push(`moved to ${destination} but the source could not be removed: ${source}: ${reasonOf2(error)}`);
  }
  return { moved: true, warnings };
}
async function restoreEntries(fs, homePath, archiveRoot, targets) {
  const moved = [];
  const warnings = [];
  for (const target of targets) {
    const result = await moveArchiveEntry(
      fs,
      archivePathOf(archiveRoot, target),
      homePath("sessions", target.projectDir),
      homePath("sessions", target.projectDir, target.dirName)
    );
    warnings.push(...result.warnings);
    if (result.moved) moved.push(target);
  }
  return { moved, warnings };
}
function createArchiveFiles(layout) {
  const { fs, homePath } = layout;
  return {
    /** 列出归档根下的条目；未建归档根（ENOENT）按空列表处理。 */
    async list(archiveRoot, warn = () => {
    }) {
      return await listArchiveEntries(fs, archiveRoot, warn);
    },
    /** 物理删除条目；逐条失败只进 warnings。 */
    async remove(targets, archiveRoot) {
      return await removeEntries(fs, archiveRoot, targets);
    },
    /** 把条目搬回 `sessions/`；逐条失败只进 warnings。 */
    async restore(targets, archiveRoot) {
      return await restoreEntries(fs, homePath, archiveRoot, targets);
    }
  };
}
async function listMigrated(ports) {
  if (ports.archiveRoot === "") {
    return { ok: false, code: "archive-unavailable", message: "the archive root is empty" };
  }
  try {
    const { entries, truncated } = await listArchiveEntries(ports.fs, ports.archiveRoot, ports.warn);
    return { ok: true, listing: { archiveRoot: ports.archiveRoot, entries, truncated } };
  } catch (error) {
    return {
      ok: false,
      code: "archive-unavailable",
      message: `archive root "${ports.archiveRoot}" is not readable: ${reasonOf2(error)}`
    };
  }
}
async function deleteMigrated(ports, targets) {
  const unique = uniqueTargets2(targets);
  if (unique.length === 0) {
    return { ok: false, code: "bad-request", message: "no archive entries were selected" };
  }
  if (ports.archiveRoot === "") {
    return { ok: false, code: "archive-unavailable", message: "the archive root is empty" };
  }
  for (const target of unique) {
    const checked = await inspectArchiveEntry(ports.fs, ports.archiveRoot, target);
    if (!checked.ok) return checked;
  }
  const files = createArchiveFiles({ homePath: ports.homePath, fs: ports.fs });
  const warnings = await files.remove(unique, ports.archiveRoot);
  return {
    ok: true,
    outcome: { removed: unique.map((target) => sessionIdOfEntry(target.dirName)), warnings }
  };
}
async function restoreMigrated(ports, targets) {
  const unique = uniqueTargets2(targets);
  if (unique.length === 0) {
    return { ok: false, code: "bad-request", message: "no archive entries were selected" };
  }
  if (ports.archiveRoot === "") {
    return { ok: false, code: "archive-unavailable", message: "the archive root is empty" };
  }
  const checked = [];
  for (const target of unique) {
    const entry = await inspectArchiveEntry(ports.fs, ports.archiveRoot, target);
    if (!entry.ok) return entry;
    const destination = ports.homePath("sessions", target.projectDir, target.dirName);
    const targetCheck = await inspectRestoreTarget(ports.fs, destination);
    if (!targetCheck.ok) return targetCheck;
    checked.push({ target, updatedAt: entry.updatedAt });
  }
  const warnings = [];
  let workspaces = [];
  try {
    workspaces = ports.listWorkspaces();
  } catch (error) {
    warnings.push(`workspaces: ${reasonOf2(error)}`);
    ports.warn("web-ux: listing the workspaces for restoring archived sessions failed", error);
  }
  const files = createArchiveFiles({ homePath: ports.homePath, fs: ports.fs });
  const restored = [];
  const announced = [];
  for (const entry of checked) {
    const sessionId = sessionIdOfEntry(entry.target.dirName);
    const moved = await files.restore([entry.target], ports.archiveRoot);
    warnings.push(...moved.warnings);
    if (moved.moved.length === 0) continue;
    let workspaceId = null;
    try {
      const matched = ownerOfProjectDir(entry.target.projectDir, workspaces);
      if (matched === null) {
        warnings.push(`attach: ${sessionId}: no workspace matches project directory "${entry.target.projectDir}"`);
        ports.warn(`web-ux: restored session "${sessionId}" has no matching workspace; it stays ungrouped`);
      } else {
        await ports.attachToWorkspace(matched, sessionId);
        workspaceId = matched;
      }
    } catch (error) {
      warnings.push(`attach: ${sessionId}: ${reasonOf2(error)}`);
      ports.warn(`web-ux: attaching the restored session "${sessionId}" to its workspace failed`, error);
    }
    try {
      await ports.readdToArchiveSet(sessionId);
    } catch (error) {
      warnings.push(`archive-set: ${sessionId}: ${reasonOf2(error)}`);
      ports.warn(`web-ux: putting the restored session "${sessionId}" back into the archive set failed`, error);
    }
    restored.push({ sessionId, workspaceId });
    announced.push({ sessionId, updatedAt: entry.updatedAt });
  }
  try {
    await ports.announceRestored(announced);
  } catch (error) {
    warnings.push(`announce: ${reasonOf2(error)}`);
    ports.warn("web-ux: broadcasting the restored sessions failed", error);
  }
  return { ok: true, outcome: { restored, warnings } };
}

// src/index.ts
var name = "web-ux";
var inject = ["workspaceRegistry", "sessionPersistence", "dshHomePath"];
var NO_HOME_MESSAGE = "the host exposes no harness-home path resolver, so stored session files cannot be located";
function apply(ctx, config) {
  ctx.inject(["connection", "webServer"], (connectionCtx) => {
    const connection = connectionCtx.root.get("connection");
    if (connection === void 0) {
      ctx.logger.warn("web-ux: connection resolved without the service; the session-management channel is not mounted");
      return;
    }
    const dispose = callerConnectionOf(connectionCtx, connection).rpc.handle(CHANNEL, createDispatcher(ctx, config));
    return () => {
      void dispose();
    };
  });
}
function callerConnectionOf(ctx, connection) {
  const unwrapped = connection[symbols.original];
  const raw = unwrapped ?? connection;
  return new Proxy(raw, {
    get(target, property2, receiver) {
      if (property2 === "ctx") return ctx;
      return Reflect.get(target, property2, receiver);
    }
  });
}
function createDispatcher(ctx, config) {
  return async (endpoint, payload) => {
    const parsed = parseRequest(endpoint, payload);
    if (!parsed.ok) return failure("bad-request", parsed.message);
    const request = parsed.value;
    try {
      const ports = createPorts(ctx, config);
      if (ports === void 0) return failure("internal", NO_HOME_MESSAGE);
      switch (request.endpoint) {
        case PREVIEW_ENDPOINT: {
          const result = await previewDelete(ports, request.body.sessionId, ports.archiveRoot);
          return result.ok ? { ok: true, value: result.preview } : failure(result.code, result.message);
        }
        case DELETE_ENDPOINT: {
          const result = request.body.mode === "archive" ? await archiveSession(ports, request.body.sessionId, ports.archiveRoot) : await deleteSession(ports, request.body.sessionId);
          return result.ok ? { ok: true, value: result.outcome } : failure(result.code, result.message);
        }
        case PREVIEW_BATCH_ENDPOINT:
          return { ok: true, value: await previewDeleteBatch(ports, request.body.sessionIds, ports.archiveRoot) };
        case DELETE_BATCH_ENDPOINT: {
          const result = request.body.mode === "archive" ? await archiveSessionBatch(ports, request.body.sessionIds, ports.archiveRoot) : await deleteSessionBatch(ports, request.body.sessionIds);
          return result.ok ? { ok: true, value: result.outcome } : failure(result.code, result.message);
        }
        case LIST_MIGRATED_ENDPOINT: {
          const result = await listMigrated(ports);
          return result.ok ? { ok: true, value: result.listing } : failure(result.code, result.message);
        }
        case DELETE_MIGRATED_ENDPOINT: {
          const result = await deleteMigrated(ports, request.body.entries);
          return result.ok ? { ok: true, value: result.outcome } : failure(result.code, result.message);
        }
        case RESTORE_MIGRATED_ENDPOINT: {
          const result = await restoreMigrated(ports, request.body.entries);
          return result.ok ? { ok: true, value: result.outcome } : failure(result.code, result.message);
        }
        default:
          return failure("bad-request", `unknown endpoint "${endpoint}"`);
      }
    } catch (error) {
      ctx.logger.warn("web-ux: a session-management endpoint failed unexpectedly", error);
      return failure("internal", error instanceof Error ? error.message : String(error));
    }
  };
}
var nodeFileSystem = {
  readdir: async (path) => await readdir(path, { withFileTypes: true }),
  lstat: async (path) => {
    const stats = await lstat(path);
    return { size: stats.size, mtimeMs: stats.mtimeMs, isDirectory: () => stats.isDirectory() };
  },
  rm: async (path, options) => {
    await rm(path, { recursive: options.recursive, force: options.force });
  },
  unlink: async (path) => {
    await unlink(path);
  },
  mkdir: async (path, options) => {
    await mkdir(path, { recursive: options.recursive });
  },
  rename: async (from2, to) => {
    await rename(from2, to);
  },
  copyFile: async (from2, to) => {
    await copyFile(from2, to);
  }
};
function createPorts(ctx, config) {
  const homePath = ctx.dshHomePath;
  if (homePath === void 0) {
    ctx.logger.warn("web-ux: dshHomePath is unavailable; the session-management endpoints answer internal");
    return void 0;
  }
  const archiveRoot = resolveArchiveRoot(config?.archiveRoot, {
    homePath,
    homedir: homedir(),
    warn: (message) => {
      ctx.logger.warn(message);
    }
  });
  const files = createSessionFiles({ homePath, fs: nodeFileSystem });
  const emitter = ctx;
  return {
    archiveRoot,
    homePath,
    fs: nodeFileSystem,
    listStoredHeaders: async () => (await ctx.sessionPersistence.list()).map((snapshot2) => snapshot2.header),
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
    // 归档根可用性由流程层在写动作之前判定：这里让 `prepareArchive` 的失败原样抛出，
    // `archiveSession` 才会把它映射成 `archive-unavailable`。
    prepareArchive: async (root) => {
      await files.prepareArchive(root);
    },
    archiveFiles: async (sessionId, root) => await files.archive(sessionId, root),
    emitRemoved: (sessionId) => {
      try {
        emitter.emit(SESSION_REMOVED_EVENT, sessionId);
      } catch (error) {
        ctx.logger.warn("web-ux: broadcasting the session-removed event failed", error);
      }
    },
    listWorkspaces: () => ctx.workspaceRegistry.list().map((workspace) => ({
      workspaceId: workspace.id,
      path: workspace.path
    })),
    attachToWorkspace: async (workspaceId, sessionId) => {
      const workspace = ctx.workspaceRegistry.get(workspaceId);
      if (workspace === void 0) throw new Error(`workspace "${workspaceId}" is not registered`);
      await workspace.attachSession(sessionId);
    },
    readdToArchiveSet: async (sessionId) => {
      await ctx.workspaceRegistry.archiveSession(sessionId);
    },
    announceRestored: async (entries) => {
      const headers = new Map(
        (await ctx.sessionPersistence.list()).map((snapshot2) => [snapshot2.header.id, snapshot2.header])
      );
      for (const entry of entries) {
        const header = headers.get(entry.sessionId);
        if (header === void 0) {
          ctx.logger.warn(`web-ux: the restored session "${entry.sessionId}" is missing from session persistence; the session-added event was skipped`);
          continue;
        }
        try {
          emitter.emit(SESSION_ADDED_EVENT, {
            sessionId: entry.sessionId,
            updatedAt: entry.updatedAt,
            running: false,
            blank: false,
            agentAvailable: false,
            cwd: header.cwd,
            parentSessionId: header.parentSession,
            origin: header.origin
          });
        } catch (error) {
          ctx.logger.warn("web-ux: broadcasting the session-added event failed", error);
        }
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
  Config,
  apply,
  createDispatcher,
  inject,
  name
};
