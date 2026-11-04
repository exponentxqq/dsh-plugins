// src/index.ts
import { copyFile, lstat, mkdir, readdir, rename, rm, unlink } from "node:fs/promises";
import { homedir } from "node:os";

// src/config.ts
import { isAbsolute, resolve as resolve2 } from "node:path";

// ../../node_modules/.pnpm/@deepseek-ai+cosmokit@1.8.6/node_modules/@deepseek-ai/cosmokit/lib/index.js
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

// ../../node_modules/.pnpm/@deepseek-ai+schemastery@3.18.5/node_modules/@deepseek-ai/schemastery/lib/index.mjs
var kSchema = Symbol.for("schemastery");
var kValidationError = Symbol.for("ValidationError");
globalThis.__schemastery_index__ ??= 0;
globalThis.__schemastery_refs__ = void 0;
var ValidationError = class extends TypeError {
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
    return !!error?.[kValidationError];
  }
};
Object.defineProperty(ValidationError.prototype, kValidationError, { value: true });
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
        if (ValidationError.is(error)) return { issues: [{
          message: error.message,
          path: error.options.path
        }] };
        throw error;
      }
    }
  };
} });
Schema.ValidationError = ValidationError;
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
  if (schema.meta?.volatile && blocked) throw new ValidationError("volatile fields require a fixed object path without an enclosing volatile field", { path });
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
      throw new ValidationError(error instanceof Error ? error.message : String(error), options);
    }
  }
  if (options.ignore?.(data, schema)) return [data];
  if (isNullable(data) && schema.type !== "lazy") {
    if (schema.meta.required) throw new ValidationError(`missing required value`, options);
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
  if (!callback) throw new ValidationError(`unsupported type "${schema.type}"`, options);
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
    if (isNaN(+date2)) throw new ValidationError(`invalid date "${value}"`, options);
    return date2;
  }, true)]);
};
Schema.regExp = function regExp(flag = "") {
  return Schema.union([Schema.is(RegExp), Schema.transform(Schema.string().role("regexp", { flag }), (value, options) => {
    try {
      return new RegExp(value, flag);
    } catch (e) {
      throw new ValidationError(e.message, options);
    }
  }, true)]);
};
Schema.arrayBuffer = function arrayBuffer(encoding) {
  return Schema.union([
    Schema.is(ArrayBuffer),
    Schema.is(SharedArrayBuffer),
    Schema.transform(Schema.any(), (value, options) => {
      if (Binary.isSource(value)) return Binary.fromSource(value);
      throw new ValidationError(`expected ArrayBufferSource but got ${value}`, options);
    }, true),
    ...encoding ? [Schema.transform(Schema.string(), (value, options) => {
      try {
        return encoding === "base64" ? Binary.fromBase64(value) : Binary.fromHex(value);
      } catch (e) {
        throw new ValidationError(e.message, options);
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
  throw new ValidationError(`expected nullable but got ${data}`, options);
});
Schema.extend("const", (data, { value }, options) => {
  if (deepEqual(data, value)) return [value];
  throw new ValidationError(`expected ${value} but got ${data}`, options);
});
function checkWithinRange(data, meta, description, options, skipMin = false) {
  const { max = Infinity, min = -Infinity } = meta;
  if (data > max) throw new ValidationError(`expected ${description} <= ${max} but got ${data}`, options);
  if (data < min && !skipMin) throw new ValidationError(`expected ${description} >= ${min} but got ${data}`, options);
}
Schema.extend("string", (data, { meta }, options) => {
  if (typeof data !== "string") throw new ValidationError(`expected string but got ${data}`, options);
  if (meta.pattern) {
    const regexp = new RegExp(meta.pattern.source, meta.pattern.flags);
    if (!regexp.test(data)) throw new ValidationError(`expect string to match regexp ${regexp}`, options);
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
  if (typeof data !== "number") throw new ValidationError(`expected number but got ${data}`, options);
  checkWithinRange(data, meta, "number", options);
  const { step } = meta;
  if (step && !isMultipleOf(data, meta.min ?? 0, step)) throw new ValidationError(`expected number multiple of ${step} but got ${data}`, options);
  return [data];
});
Schema.extend("boolean", (data, _, options) => {
  if (typeof data === "boolean") return [data];
  throw new ValidationError(`expected boolean but got ${data}`, options);
});
Schema.extend("bitset", (data, { bits, meta }, options) => {
  let value = 0, keys = [];
  if (typeof data === "number") {
    value = data;
    for (const key in bits) if (data & bits[key]) keys.push(key);
  } else if (Array.isArray(data)) {
    keys = data;
    for (const key of keys) {
      if (typeof key !== "string") throw new ValidationError(`expected string but got ${key}`, options);
      if (key in bits) value |= bits[key];
    }
  } else throw new ValidationError(`expected number or array but got ${data}`, options);
  if (value === meta.default) return [value];
  return [value, keys];
});
Schema.extend("function", (data, _, options) => {
  if (typeof data === "function") return [data];
  throw new ValidationError(`expected function but got ${data}`, options);
});
Schema.extend("is", (data, { constructor }, options) => {
  if (typeof constructor === "function") {
    if (data instanceof constructor) return [data];
    throw new ValidationError(`expected ${constructor.name} but got ${data}`, options);
  } else {
    if (isNullable(data)) throw new ValidationError(`expected ${constructor} but got ${data}`, options);
    let prototype = Object.getPrototypeOf(data);
    while (prototype) {
      if (prototype.constructor?.name === constructor) return [data];
      prototype = Object.getPrototypeOf(prototype);
    }
    throw new ValidationError(`expected ${constructor} but got ${data}`, options);
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
  if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
  checkWithinRange(data.length, meta, "array length", options, !isNullable(inner.meta.default));
  return [data.map((_, index) => property(data, index, inner, options))];
});
Schema.extend("dict", (data, { inner, sKey }, options, strict) => {
  if (!isPlainObject(data)) throw new ValidationError(`expected object but got ${data}`, options);
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
  if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
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
  if (!isPlainObject(data)) throw new ValidationError(`expected object but got ${data}`, options);
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
  throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
});
Schema.extend("intersect", (data, { list, toString: toString2 }, options, strict) => {
  if (!list.length) return [data];
  let result;
  for (const inner of list) {
    const value = Schema.resolve(data, inner, options, true)[0];
    if (isNullable(value)) continue;
    if (isNullable(result)) result = value;
    else if (typeof result !== typeof value) throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
    else if (typeof value === "object") merge(result ??= {}, value);
    else if (result !== value) throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
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
var ENDPOINTS = [PREVIEW_ENDPOINT, DELETE_ENDPOINT];
var DISPOSAL_MODES = ["delete", "archive"];
function isDisposalMode(value) {
  return typeof value === "string" && DISPOSAL_MODES.includes(value);
}
var SESSION_ID_MAX = 255;
function readRequest(payload) {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return { ok: false, message: "\u8BF7\u6C42\u4F53\u4E0D\u662F\u5BF9\u8C61" };
  }
  const record = payload;
  const extra2 = Object.keys(record).filter((key) => key !== "sessionId" && key !== "mode");
  if (extra2.length > 0) return { ok: false, message: `\u8BF7\u6C42\u4F53\u542B\u672A\u77E5\u5B57\u6BB5\uFF1A${extra2.join(", ")}` };
  const sessionId = record["sessionId"];
  if (typeof sessionId !== "string" || sessionId === "") return { ok: false, message: "sessionId \u7F3A\u5931\u6216\u4E0D\u662F\u975E\u7A7A\u5B57\u7B26\u4E32" };
  if (sessionId.length > SESSION_ID_MAX) return { ok: false, message: "sessionId \u8D85\u957F" };
  if (/[\u0000-\u001f\u007f]/.test(sessionId)) return { ok: false, message: "sessionId \u542B\u63A7\u5236\u5B57\u7B26" };
  const mode = record["mode"];
  if (!isDisposalMode(mode)) return { ok: false, message: "mode \u7F3A\u5931\u6216\u4E0D\u662F delete / archive" };
  return { ok: true, value: { sessionId, mode } };
}
function parseDeleteRequest(endpoint, payload) {
  if (!ENDPOINTS.includes(endpoint)) {
    return { ok: false, message: `\u672A\u77E5\u7AEF\u70B9 "${endpoint}"` };
  }
  return readRequest(payload);
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
var SESSION_ID_MAX2 = 255;
var CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
function isSafeSessionId(sessionId) {
  return sessionId !== "" && sessionId.length <= SESSION_ID_MAX2 && sessionId !== "." && sessionId !== ".." && !sessionId.includes("/") && !sessionId.includes("\\") && !CONTROL_CHARACTERS.test(sessionId);
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
  async function copyTree(from2, to) {
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
        warnings.push(...await copyTree(src, dest));
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
        const copyWarnings = await copyTree(src, dest);
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

// src/index.ts
var name = "web-ux";
var inject = ["workspaceRegistry", "sessionPersistence", "dshHomePath"];
var NO_HOME_MESSAGE = "the host exposes no harness-home path resolver, so stored session files cannot be located";
function apply(ctx, config) {
  ctx.inject(["connection", "webServer"], (connectionCtx) => {
    const connection = connectionCtx.root.get("connection");
    if (connection === void 0) {
      ctx.logger.warn("web-ux: connection resolved without the service; the session-delete channel is not mounted");
      return;
    }
    const dispose = connection.rpc.handle(CHANNEL, createDispatcher(ctx, config));
    return () => {
      void dispose();
    };
  });
}
function createDispatcher(ctx, config) {
  return async (endpoint, payload) => {
    const parsed = parseDeleteRequest(endpoint, payload);
    if (!parsed.ok) return failure("bad-request", parsed.message);
    try {
      const ports = createPorts(ctx, config);
      if (ports === void 0) return failure("internal", NO_HOME_MESSAGE);
      if (endpoint === PREVIEW_ENDPOINT) {
        const result = await previewDelete(ports, parsed.value.sessionId, ports.archiveRoot);
        return result.ok ? { ok: true, value: result.preview } : failure(result.code, result.message);
      }
      if (endpoint === DELETE_ENDPOINT) {
        const result = parsed.value.mode === "archive" ? await archiveSession(ports, parsed.value.sessionId, ports.archiveRoot) : await deleteSession(ports, parsed.value.sessionId);
        return result.ok ? { ok: true, value: result.outcome } : failure(result.code, result.message);
      }
      return failure("bad-request", `unknown endpoint "${endpoint}"`);
    } catch (error) {
      ctx.logger.warn("web-ux: the session-delete endpoint failed unexpectedly", error);
      return failure("internal", error instanceof Error ? error.message : String(error));
    }
  };
}
var nodeFileSystem = {
  readdir: async (path) => await readdir(path, { withFileTypes: true }),
  lstat: async (path) => await lstat(path),
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
    ctx.logger.warn("web-ux: dshHomePath is unavailable; the session-delete endpoints answer internal");
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
