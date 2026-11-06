import { createRequire as __dshCreateRequire } from 'node:module';
const require = __dshCreateRequire(import.meta.url);

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

// ../../node_modules/.pnpm/@deepseek-ai+schemastery@3.19.0/node_modules/@deepseek-ai/schemastery/lib/index.mjs
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
Schema.extend = function extend(type, resolve2) {
  resolvers[type] = resolve2;
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

// src/host/errors.ts
var DEFAULT_MESSAGES = {
  JWT_EXPIRED: "\u767B\u5F55\u6001\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55",
  KEY_LOST: "\u6865\u63A5 Key \u5DF2\u4E0D\u5B58\u5728\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55\u540E\u91CD\u8BD5",
  PAT_SHAPE: "\u6362\u53D1\u54CD\u5E94\u4E0D\u542B token\uFF08\u4E0A\u6E38\u5951\u7EA6\u53EF\u80FD\u53D8\u66F4\uFF09",
  RISK_3012: "\u89E6\u53D1\u98CE\u63A7\uFF0C\u5DF2\u505C\u6B62\u81EA\u52A8\u7EED\u671F\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5",
  REF_CONFLICT: "ZCODE_PLAN_PAT \u5DF2\u7531\u5916\u90E8\u6765\u6E90\u63D0\u4F9B\uFF0C\u62D2\u7EDD\u8986\u76D6",
  NO_LLM_PI_AI_ROW: "\u5F53\u524D profile \u6CA1\u6709 llm-pi-ai \u884C\uFF0C\u8DEF\u7531\u65E0\u6CD5\u81EA\u52A8\u6CE8\u518C",
  AUTH_STATE: "\u56DE\u8C03 state \u4E0D\u5339\u914D\uFF0C\u5DF2\u62D2\u7EDD\u672C\u6B21\u6388\u6743",
  TIMEOUT: "\u8BF7\u6C42\u8D85\u65F6"
};
var BridgeError = class extends Error {
  /** §3.10 码表成员；owner 的 halt / 退避决策与 status 渲染都以它为键。 */
  code;
  /**
   * @param code - 码表成员。
   * @param message - 对人文案；省略时取码表缺省文案（动态码取码本身）。
   */
  constructor(code, message) {
    super(message ?? DEFAULT_MESSAGES[code] ?? code);
    this.name = "BridgeError";
    this.code = code;
  }
};
function maskSecret(v) {
  return v.length <= 8 ? "***" : `${v.slice(0, 4)}\u2026${v.length}`;
}

// src/host/ports.ts
var LOG_PREFIX = "zcode-plan\uFF1A";
var nodeClock = {
  now: () => Date.now(),
  setTimeout: (handler, timeoutMs) => globalThis.setTimeout(handler, timeoutMs),
  clearTimeout: (handle) => {
    globalThis.clearTimeout(handle);
  }
};
var nodeFetch = (input, init) => globalThis.fetch(input, init);
function createLogPort(ctx) {
  const line = (message) => `${LOG_PREFIX}${message}`;
  return {
    info: (message) => {
      ctx.logger.info(line(message));
      console.info(line(message));
    },
    warn: (message) => {
      ctx.logger.warn(line(message));
      console.warn(line(message));
    },
    error: (message) => {
      ctx.logger.error(line(message));
      console.error(line(message));
    }
  };
}
function createTimeoutSignal(options) {
  const controller = new AbortController();
  let settled = false;
  let rejectTimedOut;
  const timedOut = new Promise((_, reject) => {
    rejectTimedOut = reject;
  });
  const handle = options.clock.setTimeout(() => {
    if (settled) return;
    settled = true;
    controller.abort();
    rejectTimedOut(new BridgeError("TIMEOUT"));
  }, options.timeoutMs);
  return {
    signal: controller.signal,
    timedOut,
    dispose: () => {
      if (settled) return;
      settled = true;
      options.clock.clearTimeout(handle);
    }
  };
}

// src/host/bigmodel/endpoints.ts
var BIGMODEL_WEB = "https://bigmodel.cn";
var BIGMODEL_OPEN = "https://open.bigmodel.cn";
var CODING_BASE_URL = "https://open.bigmodel.cn/api/coding/paas/v4";
var AUTHORIZE_URL = `${BIGMODEL_WEB}/login`;
var TOKEN_BY_AUTH_CODE_URL = "https://zcode.z.ai/api/v1/oauth/token";
var USAGE_LIMIT_URL = "https://www.bigmodel.cn/api/monitor/usage/quota/limit";
var DEFAULT_CLIENT_VERSION = "0.17.0";
var CLIENT_TYPE = "zcode";
var PROVIDER = "bigmodel";
var KEY_USAGE_SCENE = 1;
function keyBasePath(organization, project) {
  return `${BIGMODEL_WEB}/api/biz/v1/organization/${organization}/projects/${project}/api_keys`;
}
function keyListPath(organization, project) {
  return keyBasePath(organization, project);
}
function keyCreatePath(organization, project) {
  return keyListPath(organization, project);
}
function patIssuePath(organization, project, keyId) {
  return `${keyBasePath(organization, project)}/${keyId}/access_tokens`;
}

// src/host/bigmodel/envelope.ts
function successCode(code, success) {
  return code === 0 || code === 200 || code === "0" || code === "200" || success === true;
}
function asObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
function readEnvelopeDiagnostics(json) {
  const envelope = asObject(json);
  if (envelope === void 0) return {};
  const rawCode = envelope.code;
  const code = typeof rawCode === "string" || typeof rawCode === "number" ? String(rawCode) : void 0;
  const msg = typeof envelope.msg === "string" ? envelope.msg : void 0;
  return {
    ...code === void 0 ? {} : { code },
    ...msg === void 0 ? {} : { msg }
  };
}
function unwrap(json, parse) {
  const diagnostics = readEnvelopeDiagnostics(json);
  const envelope = asObject(json);
  if (envelope === void 0) return { ok: false, reason: "shape" };
  if (!successCode(envelope.code, envelope.success)) {
    return { ok: false, reason: "business", ...diagnostics };
  }
  if (envelope.data === void 0 || envelope.data === null) {
    return { ok: false, reason: "shape", ...diagnostics };
  }
  try {
    return { ok: true, value: parse(envelope.data) };
  } catch {
    return { ok: false, reason: "shape", ...diagnostics };
  }
}

// src/host/bigmodel/client.ts
var REQUEST_TIMEOUT_MS = 15e3;
var PAT_MAX_TTL_SECONDS = 18e3;
var PAT_MAX_TTL_MS = PAT_MAX_TTL_SECONDS * 1e3;
var PAT_LEASE_CLAMP_MS = 6 * 60 * 60 * 1e3;
var PAT_TOKEN_FIELDS = ["accessToken", "access_token", "token"];
var OP_EXCHANGE = "\u6362\u767B\u5F55 JWT";
var OP_LIST_KEYS = "\u5217 Key";
var OP_CREATE_KEY = "\u5EFA Key";
var OP_ISSUE_PAT = "\u6362 PAT";
var OP_READ_USAGE = "\u8BFB\u7528\u91CF";
function resolvePatLease(data, requestStartedAt, nowMs) {
  const expiresIn = data.expiresIn;
  if (typeof expiresIn === "number" && Number.isFinite(expiresIn) && expiresIn > 0) {
    return requestStartedAt + expiresIn * 1e3;
  }
  const expiresAtSeconds = data.expiresAt;
  if (typeof expiresAtSeconds === "number" && Number.isFinite(expiresAtSeconds) && expiresAtSeconds > 0) {
    const absoluteMs = expiresAtSeconds * 1e3;
    if (absoluteMs >= nowMs && absoluteMs <= nowMs + PAT_LEASE_CLAMP_MS) return absoluteMs;
  }
  return requestStartedAt + PAT_MAX_TTL_MS;
}
function firstStringField(obj, keys) {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return void 0;
}
function shapeFailure(op) {
  return new BridgeError("PAT_SHAPE", `${op} \u54CD\u5E94\u5F62\u72B6\u4E0D\u7B26\u5408\u5951\u7EA6\uFF08\u4E0A\u6E38\u53EF\u80FD\u5DF2\u53D8\u66F4\uFF09`);
}
function businessMessage(op, code, msg) {
  return `${op} \u4E1A\u52A1\u5931\u8D25\uFF1Acode=${code}${msg === void 0 ? "" : ` msg=${maskSecret(msg)}`}`;
}
async function safeText(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}
async function readJsonBody(response) {
  try {
    return await response.json();
  } catch {
    return void 0;
  }
}
async function httpFailure(response, op) {
  const status = response.status;
  const body = await safeText(response);
  const diagnostics = readEnvelopeDiagnostics(safeJsonParse(body));
  if (status === 401 || status === 403) return new BridgeError("JWT_EXPIRED");
  if (status === 404) return new BridgeError("KEY_LOST");
  if (status === 405 && body.includes("3012")) return new BridgeError("RISK_3012");
  if (diagnostics.code !== void 0) {
    return new BridgeError(`BUSINESS:${diagnostics.code}`, businessMessage(op, diagnostics.code, diagnostics.msg));
  }
  return new BridgeError(`HTTP:${status}`, `${op} HTTP ${status}`);
}
function safeJsonParse(text) {
  if (text === "") return void 0;
  try {
    return JSON.parse(text);
  } catch {
    return void 0;
  }
}
async function requestEnvelope(deps, url, init, op, parse, external) {
  const guard = createTimeoutSignal({ clock: deps.clock, timeoutMs: REQUEST_TIMEOUT_MS });
  const signal = external === void 0 ? guard.signal : AbortSignal.any([guard.signal, external]);
  let response;
  try {
    response = await Promise.race([deps.fetch(url, { ...init, signal }), guard.timedOut]);
  } catch (error) {
    if (error instanceof BridgeError) throw error;
    if (external !== void 0 && external.aborted) throw error;
    throw new BridgeError("HTTP:0", `${op} \u5728\u4F20\u8F93\u5C42\u5931\u8D25\uFF08\u672A\u6536\u5230 HTTP \u54CD\u5E94\uFF09`);
  } finally {
    guard.dispose();
  }
  if (!response.ok) throw await httpFailure(response, op);
  const result = unwrap(await readJsonBody(response), parse);
  if (result.ok) return result.value;
  throw result.reason === "business" ? new BridgeError(`BUSINESS:${result.code ?? "unknown"}`, businessMessage(op, result.code ?? "unknown", result.msg)) : shapeFailure(op);
}
function describeFailure(error) {
  if (error instanceof BridgeError) return `code=${error.code}`;
  return error instanceof Error ? error.name : "unknown";
}
function createBigmodelClient(deps) {
  const effectiveClientVersion = deps.clientVersion ?? DEFAULT_CLIENT_VERSION;
  const transport = { fetch: deps.fetch, clock: deps.clock };
  async function guarded(op, run) {
    try {
      return await run();
    } catch (error) {
      deps.log.warn(`${op} \u5931\u8D25\uFF1A${describeFailure(error)}`);
      throw error;
    }
  }
  return {
    async exchangeAuthCode(input) {
      return await guarded(OP_EXCHANGE, async () => {
        const jwt = await requestEnvelope(
          transport,
          TOKEN_BY_AUTH_CODE_URL,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              provider: PROVIDER,
              code: input.authCode,
              redirect_uri: input.redirectUri,
              state: input.state
            })
          },
          OP_EXCHANGE,
          (data) => {
            const envelopeData = asObject(data);
            const bigmodel = envelopeData === void 0 ? void 0 : asObject(envelopeData.bigmodel);
            const token = bigmodel === void 0 ? void 0 : bigmodel.access_token;
            return typeof token === "string" && token.length > 0 ? token : void 0;
          },
          input.signal
        );
        if (jwt === void 0 || jwt.length === 0) {
          throw new BridgeError("PAT_SHAPE", "\u6362\u767B\u5F55 JWT \u54CD\u5E94\u7F3A data.bigmodel.access_token\uFF08\u4E0A\u6E38\u5951\u7EA6\u53EF\u80FD\u53D8\u66F4\uFF09");
        }
        return jwt;
      });
    },
    async listKeys(input) {
      return await guarded(OP_LIST_KEYS, async () => {
        return await requestEnvelope(
          transport,
          keyListPath(input.organization, input.project),
          {
            method: "GET",
            // 管理面头形态（test-pat.sh:15-17）：`Authorization: Bearer <JWT>`。
            headers: { authorization: `Bearer ${input.jwt}` }
          },
          OP_LIST_KEYS,
          (data) => {
            if (!Array.isArray(data)) throw new Error("data \u4E0D\u662F\u6570\u7EC4");
            return data.map((row) => {
              const obj = asObject(row);
              if (obj === void 0) throw new Error("key \u884C\u4E0D\u662F\u5BF9\u8C61");
              const keyId = obj.apiKey;
              const name2 = obj.name;
              const usageScene = obj.usageScene;
              if (typeof keyId !== "string" || keyId.length === 0) throw new Error("key \u884C\u7F3A apiKey");
              if (typeof name2 !== "string") throw new Error("key \u884C\u7F3A name");
              if (typeof usageScene !== "number") throw new Error("key \u884C\u7F3A usageScene");
              return { keyId, name: name2, usageScene };
            });
          },
          input.signal
        );
      });
    },
    async createKey(input) {
      return await guarded(OP_CREATE_KEY, async () => {
        return await requestEnvelope(
          transport,
          keyCreatePath(input.organization, input.project),
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${input.jwt}`,
              "content-type": "application/json"
            },
            // §3.4 表「建 Key」行：usageScene 固定 1（scene=1 才能换 PAT，C5）。
            body: JSON.stringify({ name: input.name, usageScene: KEY_USAGE_SCENE })
          },
          OP_CREATE_KEY,
          (data) => {
            const obj = asObject(data);
            const apiKey = obj === void 0 ? void 0 : obj.apiKey;
            if (typeof apiKey !== "string" || apiKey.length === 0) throw new Error("data.apiKey \u7F3A\u5931");
            return apiKey;
          },
          input.signal
        );
      });
    },
    async issuePat(input) {
      return await guarded(OP_ISSUE_PAT, async () => {
        const requestStartedAt = deps.clock.now();
        const lease = await requestEnvelope(
          transport,
          patIssuePath(input.organization, input.project, input.keyId),
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${input.jwt}`,
              "content-type": "application/json"
            },
            // §3.4 表「换 PAT」行：{ clientType, clientVersion }（test-pat.sh:14-18）。
            body: JSON.stringify({ clientType: CLIENT_TYPE, clientVersion: effectiveClientVersion })
          },
          OP_ISSUE_PAT,
          (data) => {
            const obj = asObject(data);
            if (obj === void 0) throw new Error("data \u4E0D\u662F\u5BF9\u8C61");
            const pat = firstStringField(obj, PAT_TOKEN_FIELDS);
            const expiresAt = resolvePatLease(obj, requestStartedAt, deps.clock.now());
            return { ...pat === void 0 ? {} : { pat }, expiresAt };
          },
          input.signal
        );
        if (lease.pat === void 0) throw new BridgeError("PAT_SHAPE");
        return { pat: lease.pat, expiresAt: lease.expiresAt };
      });
    },
    async readUsage(input) {
      return await guarded(OP_READ_USAGE, async () => {
        return await requestEnvelope(
          transport,
          USAGE_LIMIT_URL,
          {
            method: "GET",
            headers: {
              // 头形态不对称是实测事实（test-pat.sh:28-30 / test-b.sh:9-11）：
              // 用量接口用**裸 JWT**（无 Bearer 前缀）+ 两个组织头——不得统一成 Bearer。
              authorization: input.jwt,
              "bigmodel-organization": input.organization,
              "bigmodel-project": input.project
            }
          },
          OP_READ_USAGE,
          (data) => {
            const obj = asObject(data);
            if (obj === void 0) throw new Error("data \u4E0D\u662F\u5BF9\u8C61");
            const limits = obj.limits;
            if (!Array.isArray(limits)) throw new Error("data.limits \u4E0D\u662F\u6570\u7EC4");
            return { level: obj.level, limits };
          },
          input.signal
        );
      });
    }
  };
}

// src/host/bigmodel/signer.ts
import { createHash as createHash2, createPrivateKey as createPrivateKey2 } from "node:crypto";

// ../../node_modules/.pnpm/@deepseek-ai+dsh-brand@0.2.2-rc.1_@deepseek-ai+cordis@4.1.0/node_modules/@deepseek-ai/dsh-brand/lib/index.js
function brandString(value) {
  return value;
}

// ../../node_modules/.pnpm/@deepseek-ai+dsh-credentials@0.2.2-rc.1_@deepseek-ai+cordis@4.1.0/node_modules/@deepseek-ai/dsh-credentials/lib/index.js
var REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
var KEY_SEGMENT_PATTERN = /^[a-z][a-z0-9-]*$/;
function credentialRef(value) {
  if (!isCredentialRefName(value)) throw new TypeError(`credential ref "${value}" must match ${String(REF_PATTERN)}`);
  return brandString(value);
}
function isCredentialRefName(value) {
  return REF_PATTERN.test(value);
}
function credentialKey(scope, id) {
  for (const segment of [scope, id]) if (!KEY_SEGMENT_PATTERN.test(segment)) throw new TypeError(`credential key segment "${segment}" must match ${String(KEY_SEGMENT_PATTERN)}`);
  return brandString(`${scope}/${id}`);
}

// src/host/bigmodel/signing.ts
import {
  createDecipheriv,
  createHash,
  createHmac,
  createPrivateKey,
  hkdfSync,
  randomBytes,
  sign as edSign
} from "node:crypto";
var SIGNING_KDF_SALT = "WD_CLIENT_SIGN_KDF_SALT";
var SIGNING_APP_ID = "zcode";
var SIGNING_HANDSHAKE_PATH = "/api/paas/c1f3a7e2/v2/client";
var SIGNING_CLIENT_VERSION = "3.17.2";
var SIGNING_INFO_HANDSHAKE = "getSignKey_hmac";
var SIGNING_INFO_PRIV = "ed25519_priv";
var SIGNING_POW_SALT_BYTES = 12;
var SIGNING_RANDOM_BYTES = 16;
var SigningError = class extends Error {
  /** 失败原因分类（状态面 / 单测的判定键）。 */
  reason;
  /**
   * @param reason - 失败原因分类。
   * @param message - 对人结构描述（**不得含机密值**）。
   */
  constructor(reason, message) {
    super(message ?? reason);
    this.name = "SigningError";
    this.reason = reason;
  }
};
function parseCredential(raw) {
  const segments = raw.split(".");
  if (segments.length === 2) {
    const [id, secret] = segments;
    if (id.length === 0 || secret.length === 0) {
      throw new SigningError("CRED_SHAPE", "\u4E24\u6BB5\u5F0F\u51ED\u8BC1\u5B58\u5728\u7A7A\u6BB5");
    }
    return { field: "apiKey", apiKeyId: id, ikm: secret, raw };
  }
  if (segments.length === 3) {
    const apiKeyId = jwtApiKey(segments[1] ?? "");
    if (apiKeyId === void 0) {
      throw new SigningError("JWT_PAYLOAD", "JWT payload \u7F3A api_key \u5B57\u6BB5");
    }
    return { field: "accessToken", apiKeyId, ikm: raw, raw };
  }
  throw new SigningError("CRED_SHAPE", `\u51ED\u8BC1\u6BB5\u6570 ${segments.length} \u4E0D\u5C5E\u4EFB\u4F55\u5DF2\u77E5\u5F62\u6001\uFF08\u4E24\u6BB5\u5F0F / \u4E09\u6BB5\u5F0F\uFF09`);
}
function jwtApiKey(payloadSegment) {
  try {
    const b64 = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    const value = json.api_key;
    return typeof value === "string" && value.length > 0 ? value : void 0;
  } catch {
    return void 0;
  }
}
function hkdfDerive(ikm, info) {
  return Buffer.from(
    hkdfSync("sha256", Buffer.from(ikm, "utf8"), Buffer.from(SIGNING_KDF_SALT, "utf8"), Buffer.from(info, "utf8"), 32)
  );
}
function handshakeSignature(ikm, apiKeyId, ts, nonce) {
  const key = hkdfDerive(ikm, SIGNING_INFO_HANDSHAKE);
  return createHmac("sha256", key).update(`get_sign_key
${apiKeyId}
${ts}
${nonce}`, "utf8").digest("base64");
}
function handshakeUrl() {
  return `${BIGMODEL_OPEN}${SIGNING_HANDSHAKE_PATH}`;
}
function buildHandshakeBody(cred, ts, nonce) {
  return {
    [cred.field]: cred.raw,
    nonce,
    sig: handshakeSignature(cred.ikm, cred.apiKeyId, ts, nonce),
    ts
  };
}
function decryptPrivateCipher(ikm, apiKeyId, cipherB64) {
  const cipher = Buffer.from(cipherB64, "base64");
  if (cipher.length < 12 + 16 + 1) {
    throw new SigningError("CIPHER", "privateCipher \u957F\u5EA6\u4E0D\u8DB3\uFF08< 29 \u5B57\u8282\uFF09");
  }
  const key = hkdfDerive(ikm, SIGNING_INFO_PRIV);
  const plain = createDecipheriv("aes-256-gcm", key, cipher.subarray(0, 12));
  plain.setAAD(Buffer.from(apiKeyId, "utf8"));
  plain.setAuthTag(cipher.subarray(cipher.length - 16));
  let plainB64;
  try {
    plainB64 = Buffer.concat([plain.update(cipher.subarray(12, cipher.length - 16)), plain.final()]);
  } catch {
    throw new SigningError("CIPHER", "privateCipher \u89E3\u5BC6\u5931\u8D25\uFF08\u5BC6\u94A5\u6216 AAD \u4E0D\u5339\u914D\uFF09");
  }
  let der;
  try {
    der = Buffer.from(plainB64.toString("utf8"), "base64");
  } catch {
    throw new SigningError("CIPHER", "\u89E3\u5BC6\u660E\u6587\u4E0D\u662F\u5408\u6CD5 base64 \u5B57\u7B26\u4E32");
  }
  try {
    return createPrivateKey({ key: der, format: "der", type: "pkcs8" });
  } catch {
    throw new SigningError("CIPHER", "\u89E3\u5BC6\u7ED3\u679C\u4E0D\u662F\u5408\u6CD5 PKCS#8 \u79C1\u94A5");
  }
}
function requestSignature(privateKey, apiKeyId, ts, sessionId, nonce) {
  const message = `${apiKeyId}
${ts}
${SIGNING_CLIENT_VERSION}
${sessionId}
${nonce}`;
  return edSign(null, Buffer.from(message, "utf8"), privateKey).toString("base64");
}
function powChallenge(apiKeyId, sessionId, ts) {
  return createHash("sha256").update(`${apiKeyId}
${SIGNING_APP_ID}
${sessionId}
${ts}`, "utf8").digest("hex").slice(0, 32);
}
function solvePow(apiKeyId, sessionId, ts, signal) {
  const challenge = powChallenge(apiKeyId, sessionId, ts);
  const salt = randomBytes(SIGNING_POW_SALT_BYTES).toString("hex");
  for (let counter = 0; counter <= 4294967295; counter++) {
    if (counter % 1024 === 0 && signal?.aborted === true) {
      throw new SigningError("POW_ABORTED", "PoW \u6C42\u89E3\u88AB\u53D6\u6D88");
    }
    const candidate = `${salt}${counter.toString(16).padStart(8, "0")}`;
    if (createHash("sha256").update(`${challenge}
${candidate}`, "utf8").digest()[0] === 0) {
      return candidate;
    }
  }
  throw new SigningError("POW_EXHAUSTED", "PoW counter \u7A77\u5C3D\u65E0\u89E3");
}
function randomHex(bytes) {
  return randomBytes(bytes).toString("hex");
}

// src/host/bigmodel/signer.ts
var SIGNING_COOLDOWN_MS = 6e4;
var SIGNING_DEGRADED_THRESHOLD = 3;
var SIGNING_RECORD_KEY = credentialKey("zcode-plan", "bigmodel-signing-key");
function boundFingerprint(cred) {
  const hash = createHash2("sha256").update(`${cred.apiKeyId}
${cred.ikm}`, "utf8").digest("hex").slice(0, 16);
  return `${cred.apiKeyId}:${hash}`;
}
var REJECTION_CODES = /* @__PURE__ */ new Set(["VERIFY_SIGNATURE_INVALID", "VERIFY_APIKEY_EXPIRED", "3007"]);
var SESSION_ID = randomHex(SIGNING_RANDOM_BYTES);
var ZCODE_USER_AGENT = "ZCode/3.17.2 ai-sdk/provider-utils/4.0.39 runtime/node.js/24";
var SIGNING_FETCH_GUARD = Symbol.for("zcode-plan.signing-fetch");
function createSigner(deps) {
  let credential;
  let fingerprint;
  let privateKey;
  let epoch = 0;
  let handshakePromise;
  let consecutiveFailures = 0;
  let cooldownUntil = 0;
  let lastHandshakeAt;
  let lastResult;
  const counters = {
    signedOk: 0,
    handshakeFailed: 0,
    resignFailed: 0,
    degradedUnsigned: 0,
    degradedRejected: 0
  };
  function isDegraded() {
    return consecutiveFailures >= SIGNING_DEGRADED_THRESHOLD;
  }
  function noteFailure(kind, reason) {
    if (kind === "handshake") counters.handshakeFailed += 1;
    else counters.resignFailed += 1;
    consecutiveFailures += 1;
    cooldownUntil = deps.clock.now() + SIGNING_COOLDOWN_MS;
    lastResult = `${kind}_failed:${reason}`;
    if (consecutiveFailures === SIGNING_DEGRADED_THRESHOLD) {
      deps.log.warn(
        `\u7B7E\u540D\u901A\u9053\u8FDE\u7EED\u5931\u8D25 ${consecutiveFailures} \u6B21\uFF0C\u8FDB\u5165\u6B62\u635F\u6001\uFF1A\u8DEF\u7531\u6682\u505C\uFF0C\u8BF7\u6267\u884C /zcode-plan refresh \u6216\u91CD\u65B0\u767B\u5F55\u6062\u590D`
      );
    }
  }
  function adoptPrivateKey(key, cred) {
    privateKey = key;
    fingerprint = boundFingerprint(cred);
  }
  function ensurePrivateKey(force) {
    if (credential === void 0) return Promise.resolve(void 0);
    if (!force && privateKey !== void 0 && fingerprint === boundFingerprint(credential)) {
      return Promise.resolve(privateKey);
    }
    if (!force && deps.clock.now() < cooldownUntil) return Promise.resolve(void 0);
    if (!force && isDegraded()) return Promise.resolve(void 0);
    handshakePromise ??= doHandshake(force);
    return handshakePromise;
  }
  async function doHandshake(force) {
    const cred = credential;
    const startedEpoch = epoch;
    try {
      if (cred === void 0) return void 0;
      if (!force) {
        const stored = await deps.record.read().catch(() => void 0);
        if (stored !== void 0 && stored.fingerprint === boundFingerprint(cred)) {
          const restored = createPrivateKey2({
            key: Buffer.from(stored.pkcs8B64, "base64"),
            format: "der",
            type: "pkcs8"
          });
          if (startedEpoch === epoch) adoptPrivateKey(restored, cred);
          deps.log.info("\u7B7E\u540D\u79C1\u94A5\u5DF2\u4ECE credential record \u6062\u590D\uFF08\u514D\u91CD\u63E1\u624B\uFF09");
          return restored;
        }
      }
      const ts = String(deps.clock.now());
      const nonce = randomHex(SIGNING_RANDOM_BYTES);
      const response = await deps.fetch(handshakeUrl(), {
        method: "POST",
        headers: {
          Authorization: cred.field === "accessToken" ? `Bearer ${cred.raw}` : cred.raw,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(buildHandshakeBody(cred, ts, nonce))
      });
      const envelope = asRecord(await response.json().catch(() => void 0));
      const code = envelope?.["code"];
      const data = asRecord(envelope?.["data"]);
      const cipherB64 = typeof data?.["privateCipher"] === "string" ? data["privateCipher"] : void 0;
      if (code !== 200 && code !== "200") {
        const bizCode = code === void 0 ? String(response.status) : String(code);
        const msg = typeof envelope?.["msg"] === "string" ? envelope["msg"] : "";
        throw new Error(`handshake code=${bizCode} msg=${msg}`);
      }
      if (cipherB64 === void 0) throw new Error("handshake \u54CD\u5E94\u7F3A privateCipher");
      const key = decryptPrivateCipher(cred.ikm, cred.apiKeyId, cipherB64);
      if (startedEpoch !== epoch) return void 0;
      const derB64 = key.export({ format: "der", type: "pkcs8" }).toString("base64");
      await deps.record.write({
        v: 1,
        fingerprint: boundFingerprint(cred),
        pkcs8B64: derB64,
        createdAt: deps.clock.now()
      }).catch(() => {
      });
      adoptPrivateKey(key, cred);
      lastHandshakeAt = deps.clock.now();
      consecutiveFailures = 0;
      cooldownUntil = 0;
      lastResult = "handshake_ok";
      deps.log.info("\u7B7E\u540D\u63E1\u624B\u6210\u529F\uFF08\u79C1\u94A5\u5DF2\u7F13\u5B58\uFF09");
      return key;
    } catch (error) {
      if (startedEpoch !== epoch) return void 0;
      noteFailure("handshake", error instanceof Error ? error.message.slice(0, 80) : "unknown");
      return void 0;
    } finally {
      handshakePromise = void 0;
    }
  }
  return {
    setCredential(raw) {
      if (raw === void 0 || raw.length === 0) {
        if (credential !== void 0) deps.log.info("\u7B7E\u540D\u51ED\u8BC1\u5DF2\u6E05\u9664\uFF0C\u79C1\u94A5\u7F13\u5B58\u4E00\u5E76\u5931\u6548");
        credential = void 0;
        fingerprint = void 0;
        privateKey = void 0;
        epoch += 1;
        consecutiveFailures = 0;
        cooldownUntil = 0;
        lastResult = "credential_cleared";
        void deps.record.clear().catch(() => {
        });
        return;
      }
      let parsed;
      try {
        parsed = parseCredential(raw);
      } catch (error) {
        const reason = error instanceof SigningError ? error.reason : "unknown";
        deps.log.warn(`\u7B7E\u540D\u51ED\u8BC1\u89E3\u6790\u5931\u8D25\uFF08${reason}\uFF09\uFF1A\u7B7E\u540D\u901A\u9053\u4E0D\u542F\u7528\uFF0C\u8DEF\u7531\u6309\u57FA\u7EBF\u76F4\u8FDE`);
        lastResult = `credential_shape:${reason}`;
        return;
      }
      const nextFingerprint = boundFingerprint(parsed);
      if (credential !== void 0 && fingerprint === nextFingerprint) return;
      credential = parsed;
      fingerprint = nextFingerprint;
      privateKey = void 0;
      epoch += 1;
      consecutiveFailures = 0;
      cooldownUntil = 0;
      lastResult = "credential_set";
      void ensurePrivateKey(false);
    },
    invalidate(reason) {
      privateKey = void 0;
      epoch += 1;
      lastResult = `invalidated:${reason}`;
    },
    resetFailures() {
      consecutiveFailures = 0;
      cooldownUntil = 0;
      lastResult = "reset";
      deps.log.info("\u7B7E\u540D\u901A\u9053\u8BA1\u6570\u5DF2\u91CD\u7F6E\uFF08\u6062\u590D\u81EA\u52A8\u63E1\u624B\uFF09");
    },
    status() {
      return {
        cached: privateKey !== void 0,
        degraded: isDegraded(),
        consecutiveFailures,
        cooldownUntil,
        lastHandshakeAt,
        lastResult,
        credentialFingerprint: fingerprint,
        counters: { ...counters }
      };
    },
    async intercept(input, init, send) {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const fromRequest = typeof input === "object" && !(input instanceof URL) ? input.method : void 0;
      const method = (init.method ?? fromRequest ?? "GET").toUpperCase();
      if (method !== "POST" || !url.startsWith(CODING_BASE_URL)) return send(input, init);
      if (credential === void 0) return send(input, init);
      if (isDegraded()) {
        counters.degradedRejected += 1;
        throw new Error(
          `\u7B7E\u540D\u901A\u9053\u8FDE\u7EED\u5931\u8D25 ${consecutiveFailures} \u6B21\u5DF2\u6B62\u635F\uFF08\u65E0\u7B7E\u540D\u76F4\u53D1\u4F1A\u6309 ~1.5 \u523B\u5EA6\u591A\u6263 50% \u989D\u5EA6\uFF09\uFF1B\u8BF7\u6267\u884C /zcode-plan refresh \u6216 /zcode-plan login \u91CD\u65B0\u767B\u5F55\u540E\u91CD\u8BD5`
        );
      }
      const key = await ensurePrivateKey(false);
      if (key === void 0 || credential === void 0) {
        counters.degradedUnsigned += 1;
        return send(input, init);
      }
      const signed = injectSignatureHeaders(init, credential, key, deps.clock.now());
      const response = await send(input, signed);
      if (response.ok) {
        counters.signedOk += 1;
        lastResult = "signed";
        return response;
      }
      const rejection = await readRejection(response);
      if (rejection === void 0) return response;
      deps.log.warn(`\u7B7E\u540D\u88AB\u670D\u52A1\u7AEF\u62D2\u7EDD\uFF08${rejection}\uFF09\uFF0C\u91CD\u63E1\u624B\u540E\u91CD\u53D1\u4E00\u6B21`);
      this.invalidate(rejection);
      const refreshed = await ensurePrivateKey(true);
      if (refreshed !== void 0) {
        const retry = await send(input, injectSignatureHeaders(init, credential, refreshed, deps.clock.now()));
        if (retry.ok) {
          counters.signedOk += 1;
          lastResult = "signed_after_resign";
          return retry;
        }
        const retryRejection = await readRejection(retry);
        if (retryRejection !== void 0) {
          counters.resignFailed += 1;
          this.invalidate(retryRejection);
          lastResult = `resign_rejected:${retryRejection}`;
          return send(input, init);
        }
        return retry;
      }
      counters.resignFailed += 1;
      return send(input, init);
    }
  };
}
function injectSignatureHeaders(init, cred, key, now) {
  const ts = String(now);
  const nonce = randomHex(SIGNING_RANDOM_BYTES);
  const headers = new Headers(init.headers);
  headers.set("User-Agent", ZCODE_USER_AGENT);
  headers.set("X-App-Id", SIGNING_APP_ID);
  headers.set("X-Client-Version", SIGNING_CLIENT_VERSION);
  headers.set("X-Client-Ts", ts);
  headers.set("X-Client-Nonce", nonce);
  headers.set("X-Client-Sig", requestSignature(key, cred.apiKeyId, ts, SESSION_ID, nonce));
  headers.set("X-Client-Pow", solvePow(cred.apiKeyId, SESSION_ID, ts));
  headers.set("X-Session-Id", SESSION_ID);
  headers.set("X-Zcode-Agent", "glm");
  headers.set("X-Zcode-App-Version", SIGNING_CLIENT_VERSION);
  headers.set("X-Zcode-Query-Source", "main_turn");
  headers.set("X-Zcode-Session-Type", "main");
  return { ...init, headers };
}
async function readRejection(response) {
  const body = await response.clone().json().catch(() => void 0);
  const record = asRecord(body);
  const error = asRecord(record?.["error"]);
  const candidates = [record?.["code"], error?.["code"], record?.["msg"], error?.["message"]];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && REJECTION_CODES.has(candidate)) return candidate;
    if (typeof candidate === "number" && REJECTION_CODES.has(String(candidate))) return String(candidate);
  }
  return void 0;
}
function asRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function installSigningFetch(signer, log) {
  const host = globalThis;
  if (host[SIGNING_FETCH_GUARD] === true) {
    log.info("\u7B7E\u540D fetch \u5305\u88C5\u5DF2\u5B58\u5728\uFF1A\u8DF3\u8FC7\u91CD\u590D\u5B89\u88C5\uFF08\u91CD\u5165\u5B88\u536B\uFF09");
    return;
  }
  const original = host.fetch.bind(globalThis);
  const wrapped = (input, init) => signer.intercept(
    input,
    init ?? {},
    (i, ini) => original(i, ini)
  ).then((response) => response);
  host.fetch = wrapped;
  host[SIGNING_FETCH_GUARD] = true;
  log.info("\u7B7E\u540D fetch \u5305\u88C5\u5DF2\u5B89\u88C5\uFF08\u4EC5\u62E6 coding \u7AEF\u70B9 POST\uFF0C\u5176\u4F59\u900F\u4F20\uFF09");
}

// src/host/credential-record.ts
var LOGIN_RECORD_KEY = credentialKey("zcode-plan", "bigmodel-login");
var PAT_REF = credentialRef("ZCODE_PLAN_PAT");
var GRANT_VERSION = 1;
var PAT_FILE_SOURCE = "file";
function isPayloadObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}
function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}
function parseGrant(record, log) {
  if (record === void 0) return void 0;
  if (record.kind !== "grant") {
    log?.warn(`\u767B\u5F55\u8BB0\u5F55\uFF08zcode-plan/bigmodel-login\uFF09\u4E0D\u662F grant \u8BB0\u5F55\uFF08kind=${record.kind}\uFF09\uFF0C\u5DF2\u5FFD\u7565`);
    return void 0;
  }
  const payload = record.payload;
  if (!isPayloadObject(payload)) {
    log?.warn("\u767B\u5F55\u8BB0\u5F55 payload \u4E0D\u662F\u5BF9\u8C61\uFF0C\u5DF2\u5FFD\u7565");
    return void 0;
  }
  const warnInvalid = (reason) => {
    log?.warn(`\u767B\u5F55\u8BB0\u5F55 payload \u4E0D\u5408\u6CD5\uFF08${reason}\uFF09\uFF0C\u5DF2\u5FFD\u7565`);
    return void 0;
  };
  if (payload.v !== GRANT_VERSION) return warnInvalid(`v=${String(payload.v)} \u4E0D\u662F ${GRANT_VERSION}`);
  const jwt = payload.jwt;
  if (!isNonEmptyString(jwt)) return warnInvalid("jwt \u4E0D\u662F\u975E\u7A7A\u5B57\u7B26\u4E32");
  const loginAt = payload.loginAt;
  if (!isFiniteNumber(loginAt)) return warnInvalid("loginAt \u4E0D\u662F\u6709\u9650\u6570\u5B57");
  const organization = payload.organization;
  if (organization !== void 0 && !isNonEmptyString(organization)) return warnInvalid("organization \u7C7B\u578B\u6F02\u79FB");
  const project = payload.project;
  if (project !== void 0 && !isNonEmptyString(project)) return warnInvalid("project \u7C7B\u578B\u6F02\u79FB");
  const keyId = payload.keyId;
  if (keyId !== void 0 && !isNonEmptyString(keyId)) return warnInvalid("keyId \u7C7B\u578B\u6F02\u79FB");
  const patExpiresAt = payload.patExpiresAt;
  if (patExpiresAt !== void 0 && !isFiniteNumber(patExpiresAt)) return warnInvalid("patExpiresAt \u7C7B\u578B\u6F02\u79FB");
  return {
    v: GRANT_VERSION,
    jwt,
    loginAt,
    ...organization !== void 0 && { organization },
    ...project !== void 0 && { project },
    ...keyId !== void 0 && { keyId },
    ...patExpiresAt !== void 0 && { patExpiresAt }
  };
}
function mergeGrant(grant, patch) {
  const draft = { ...grant, ...patch };
  for (const key of Object.keys(draft)) {
    if (draft[key] === void 0) delete draft[key];
  }
  return { kind: "grant", payload: draft };
}
async function readGrant(credentials, key, log) {
  return parseGrant(await credentials.readRecord(key), log);
}
async function patchGrant(ctx, key, patch) {
  const updated = await ctx.credentials.modifyRecord(key, (current) => {
    const grant = parseGrant(current);
    const next = grant === void 0 ? current : mergeGrant(grant, patch);
    return Promise.resolve(next);
  });
  return updated === void 0 ? void 0 : parseGrant(updated);
}
function isPatRefConflict(info) {
  return info.configured && info.source !== PAT_FILE_SOURCE;
}

// src/host/route-config.ts
var ROUTE_ID = "zcode-plan";
var ROUTE_ENTRY_ID = "llm-pi-ai";
var ZCODE_PLAN_ROUTE = {
  displayName: "GLM Coding Plan (ZCode PAT)",
  apiKeyEnv: "ZCODE_PLAN_PAT",
  api: "openai-completions",
  baseURL: "https://open.bigmodel.cn/api/coding/paas/v4",
  reasoning: "max",
  retryPolicy: {
    mode: "normal",
    retryableCodes: ["EMPTY_RESPONSE", "RATE_LIMIT", "SERVER", "TIMEOUT", "TRANSPORT", "INVALID_CREDENTIAL"]
  },
  models: [
    {
      id: "glm-5.3",
      name: "GLM-5.3",
      contextWindow: 1e6,
      maxTokens: 131072,
      input: ["text"],
      reasoningEfforts: { off: null, low: "low", medium: "high", high: "high", max: "max" },
      compat: {
        thinkingFormat: "zai",
        supportsReasoningEffort: true,
        supportsStore: false,
        supportsDeveloperRole: false,
        supportsStrictMode: true,
        maxTokensField: "max_tokens"
      }
    },
    {
      id: "glm-5.3-flash",
      name: "GLM-5.3 Flash",
      contextWindow: 1e6,
      maxTokens: 131072,
      input: ["text", "image"],
      reasoningEfforts: { off: null, low: "low", medium: "high", high: "high", max: "max" },
      compat: {
        thinkingFormat: "zai",
        supportsReasoningEffort: true,
        supportsStore: false,
        supportsDeveloperRole: false,
        supportsStrictMode: true,
        maxTokensField: "max_tokens"
      }
    }
  ]
};
function deepEqual2(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const recordA = a;
  const recordB = b;
  const keysA = Object.keys(recordA);
  const keysB = Object.keys(recordB);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => key in recordB && deepEqual2(recordA[key], recordB[key]));
}
function asProviders(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function findLlmPiAiEntry(configEditor) {
  return configEditor.entries().find((entry) => entry.options?.id === ROUTE_ENTRY_ID);
}
async function installRoute(deps) {
  const entry = findLlmPiAiEntry(deps.configEditor);
  if (entry === void 0) {
    deps.log.warn(`\u672A\u627E\u5230 ${ROUTE_ENTRY_ID} \u6761\u76EE\uFF1A\u65E0\u5904\u843D providers.${ROUTE_ID} \u952E\uFF0C\u8DEF\u7531\u672A\u6CE8\u518C`);
    return { ok: false, changed: false, reason: "no-llm-pi-ai-row" };
  }
  const snap = deps.configEditor.configuration().find((layer) => layer.entry === entry);
  if (snap !== void 0 && deepEqual2(asProviders(snap.override.providers)[ROUTE_ID], ZCODE_PLAN_ROUTE)) {
    deps.log.info(`${ROUTE_ID} \u8DEF\u7531\u5DF2\u5B58\u5728\u4E14\u4E0E\u5355\u4E00\u771F\u6E90\u4E00\u81F4\uFF1A\u8DF3\u8FC7\u5199\u76D8\uFF08\u5E42\u7B49\u77ED\u8DEF\uFF09`);
    return { ok: true, changed: false };
  }
  await deps.configEditor.edit(entry, (current, inherited) => ({
    ...current,
    providers: {
      ...asProviders(inherited.providers),
      // 保留 bundle 层路由
      ...asProviders(current.providers),
      // profile 层已有键优先（逐键 profile 胜）
      [ROUTE_ID]: ZCODE_PLAN_ROUTE
      // 只覆盖本键
    }
  }));
  const registered = deps.llm?.listProviders().some((provider) => provider.id === ROUTE_ID) ?? false;
  if (registered) {
    deps.log.info(`${ROUTE_ID} \u8DEF\u7531\u5DF2\u5199\u5165 profile patch \u5E76\u5728 llm \u76EE\u5F55\u6CE8\u518C`);
  } else {
    deps.log.warn(`${ROUTE_ID} \u8DEF\u7531\u5DF2\u5199\u5165 profile patch\uFF0C\u4F46 llm \u76EE\u5F55\u5C1A\u672A\u6CE8\u518C\uFF08\u53EF\u80FD\u5F85\u5BBF\u4E3B\u91CD\u8F7D\u914D\u7F6E\u751F\u6548\uFF09`);
  }
  return { ok: registered, changed: true, registered };
}
async function removeRoute(deps) {
  const entry = findLlmPiAiEntry(deps.configEditor);
  if (entry === void 0) {
    deps.log.warn(`\u672A\u627E\u5230 ${ROUTE_ENTRY_ID} \u6761\u76EE\uFF1A\u65E0 ${ROUTE_ID} \u8DEF\u7531\u53EF\u6458\u9664`);
    return { ok: false, changed: false, reason: "no-llm-pi-ai-row" };
  }
  const snap = deps.configEditor.configuration().find((layer) => layer.entry === entry);
  if (snap !== void 0 && !(ROUTE_ID in asProviders(snap.override.providers))) {
    deps.log.info(`profile patch \u91CC\u672C\u65E0 ${ROUTE_ID} \u8DEF\u7531\uFF1A\u8DF3\u8FC7\u5199\u76D8\uFF08\u5E42\u7B49\u77ED\u8DEF\uFF09`);
    return { ok: true, changed: false };
  }
  await deps.configEditor.edit(entry, (current) => {
    const providers = { ...asProviders(current.providers) };
    delete providers[ROUTE_ID];
    return { ...current, providers };
  });
  deps.log.info(`${ROUTE_ID} \u8DEF\u7531\u5DF2\u4ECE profile patch \u6458\u9664\uFF08\u4EC5\u5220\u672C\u952E\uFF09`);
  return { ok: true, changed: true };
}

// src/host/key-manager.ts
var KEY_NAME = "zcode-plan-bridge";
function createKeyManager(deps) {
  let keyState = { kind: "unknown" };
  let cachedKeyId;
  return {
    async ensureKey(input) {
      if (cachedKeyId !== void 0) {
        keyState = { kind: "ready", keyId: cachedKeyId };
        return cachedKeyId;
      }
      const { jwt, organization, project } = input.grant;
      if (organization === void 0 || project === void 0 || !jwt || jwt.length === 0) {
        throw new BridgeError("AUTH_STATE", "\u767B\u5F55\u8BB0\u5F55\u7F3A\u5C11 organization/project\uFF0C\u65E0\u6CD5\u5B9A\u4F4D\u6865\u63A5 Key\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55");
      }
      keyState = { kind: "creating" };
      try {
        const rows = await input.client.listKeys({ jwt, organization, project });
        const hit = rows.find((row) => row.name === KEY_NAME && row.usageScene === KEY_USAGE_SCENE);
        const keyId = hit !== void 0 ? hit.keyId : await input.client.createKey({ jwt, organization, project, name: KEY_NAME });
        cachedKeyId = keyId;
        keyState = { kind: "ready", keyId };
        deps.log.info(
          hit !== void 0 ? `\u5DF2\u590D\u7528\u6865\u63A5 Key\uFF08${KEY_NAME}\uFF0CusageScene=${KEY_USAGE_SCENE}\uFF09` : `\u5DF2\u65B0\u5EFA\u6865\u63A5 Key\uFF08${KEY_NAME}\uFF0CusageScene=${KEY_USAGE_SCENE}\uFF09`
        );
        return keyId;
      } catch (error) {
        keyState = { kind: "unknown" };
        throw error;
      }
    },
    invalidateKey(keyId) {
      if (cachedKeyId !== keyId) {
        return;
      }
      cachedKeyId = void 0;
      keyState = { kind: "unknown" };
      deps.log.warn(`\u6865\u63A5 Key \u7F13\u5B58\u5DF2\u4F5C\u5E9F\uFF08${KEY_NAME}\uFF09\uFF0C\u4E0B\u8F6E\u5C06\u91CD\u65B0\u67E5\u627E`);
    },
    state() {
      return { ...keyState };
    }
  };
}

// src/host/status.ts
var ROUTE_MODEL_LIST = ZCODE_PLAN_ROUTE.models.map((model) => model.id).join(", ");
function pad2(value) {
  return String(value).padStart(2, "0");
}
function formatFullTime(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function formatClockTime(ms) {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function formatWeekTime(ms) {
  const weekday = ["\u65E5", "\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D"][new Date(ms).getDay()] ?? "\u65E5";
  return `\u5468${weekday} ${formatClockTime(ms)}`;
}
function formatRemaining(deltaMs) {
  if (deltaMs <= 0) return "\u5DF2\u8FC7\u671F";
  const totalSeconds = Math.floor(deltaMs / 1e3);
  const days = Math.floor(totalSeconds / 86400);
  if (days >= 1) return `${days}d`;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds % 3600 / 60);
  if (hours >= 1) return `${hours}h${minutes}m`;
  return `${minutes}m`;
}
function parseEpochMs(value) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value > 1e12 ? value : value * 1e3;
  }
  if (typeof value === "string" && value.length > 0) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : void 0;
  }
  return void 0;
}
function parseUsageLimits(limits) {
  const result = {};
  for (const row of limits) {
    if (row === null || typeof row !== "object" || Array.isArray(row)) continue;
    const record = row;
    const slot = record.unit === 3 ? "fiveHour" : record.unit === 6 ? "weekly" : void 0;
    if (slot === void 0) continue;
    const total = record.number;
    const used = record.currentValue;
    if (typeof total !== "number" || !Number.isFinite(total)) continue;
    if (typeof used !== "number" || !Number.isFinite(used)) continue;
    const percentage = typeof record.percentage === "number" && Number.isFinite(record.percentage) ? record.percentage : void 0;
    const resetAt = parseEpochMs(record.nextResetTime);
    result[slot] = {
      total,
      used,
      ...percentage !== void 0 && { percentage },
      ...resetAt !== void 0 && { resetAt }
    };
  }
  return result;
}
async function readUsage(client, grant, clock, signal) {
  const { jwt, organization, project } = grant;
  if (jwt.length === 0 || organization === void 0 || project === void 0) {
    return { kind: "error", code: "AUTH_STATE" };
  }
  try {
    const data = await client.readUsage({ jwt, organization, project, ...signal !== void 0 && { signal } });
    const parsed = parseUsageLimits(data.limits);
    return {
      kind: "ok",
      ...parsed.fiveHour !== void 0 && { fiveHour: parsed.fiveHour },
      ...parsed.weekly !== void 0 && { weekly: parsed.weekly },
      readAt: clock.now()
    };
  } catch (error) {
    return { kind: "error", code: error instanceof BridgeError ? error.code : "unknown" };
  }
}
function readRouteState(llm) {
  if (llm === void 0) return { registered: false, declared: false };
  let registered = false;
  let declared = false;
  try {
    registered = llm.listProviders().some((provider) => provider.id === ROUTE_ID);
  } catch {
    registered = false;
  }
  if (typeof llm.listConfigurableProviders === "function") {
    try {
      declared = llm.listConfigurableProviders().some((provider) => provider.id === ROUTE_ID);
    } catch {
      declared = false;
    }
  }
  return { registered, declared };
}
function renderLoginLine(grant, now) {
  if (grant === void 0) return "  \u767B\u5F55\uFF1A\u672A\u767B\u5F55\uFF08\u8FD0\u884C /zcode-plan login\uFF09";
  const expiresAt = grant.jwtExpiresAt;
  if (typeof expiresAt === "number" && Number.isFinite(expiresAt) && expiresAt > 0) {
    return `  \u767B\u5F55\uFF1A\u5DF2\u767B\u5F55 \xB7 JWT \u5230\u671F ${formatFullTime(expiresAt)}\uFF08\u5269 ${formatRemaining(expiresAt - now)}\uFF09`;
  }
  return "  \u767B\u5F55\uFF1A\u5DF2\u767B\u5F55";
}
function renderKeyLine(key) {
  if (key.kind === "ready") {
    const id = key.keyId.length > 8 ? `${key.keyId.slice(0, 8)}\u2026` : key.keyId;
    return `  Key \uFF1A${KEY_NAME} \xB7 scene=${KEY_USAGE_SCENE} \xB7 id ${id}`;
  }
  return "  Key \uFF1A\u672A\u77E5\uFF08\u767B\u5F55\u540E\u81EA\u52A8 find-or-create\uFF09";
}
function renderPatLine(pat, now, leadMs) {
  if (pat.kind === "halted") return `  PAT \uFF1A\u5DF2\u505C\u6B62\uFF08${pat.code}\uFF09`;
  if (pat.kind === "none") return "  PAT \uFF1A\u65E0";
  if (pat.kind === "expired" || pat.expiresAt <= now) return "  PAT \uFF1A\u5DF2\u8FC7\u671F";
  const base = `  PAT \uFF1A\u6709\u6548 \xB7 \u5230\u671F ${formatClockTime(pat.expiresAt)}\uFF08\u5269 ${formatRemaining(pat.expiresAt - now)}\uFF09`;
  if (typeof leadMs !== "number" || !Number.isFinite(leadMs) || leadMs <= 0) return base;
  const renewalAt = Math.max(pat.expiresAt - leadMs, now);
  return `${base} \xB7 \u4E0B\u6B21\u7EED\u671F \u2264 ${formatClockTime(renewalAt)}`;
}
function renderRouteLine(route) {
  if (route.registered) return `\u8DEF\u7531\uFF1A\u5DF2\u6CE8\u518C\uFF08${ROUTE_MODEL_LIST}\uFF09`;
  if (route.declared) return "\u8DEF\u7531\uFF1A\u5DF2\u58F0\u660E\u672A\u6CE8\u518C";
  return "\u8DEF\u7531\uFF1A\u672A\u5B89\u88C5\uFF08\u8FD0\u884C /zcode-plan route install\uFF09";
}
function renderSigningLine(signing, now) {
  if (signing === void 0) return "  \u7B7E\u540D\uFF1A\u672A\u542F\u7528\uFF08signing \u914D\u7F6E\u5173\u95ED\u6216\u672A\u88C5\u914D\uFF09";
  if (signing.degraded) {
    return `  \u7B7E\u540D\uFF1A\u26A0 \u6B62\u635F\u4E2D\uFF08\u8FDE\u7EED\u5931\u8D25 ${signing.consecutiveFailures}\uFF09\xB7 \u8FD0\u884C /zcode-plan refresh \u6062\u590D`;
  }
  const cache = signing.cached ? "\u79C1\u94A5\u7F13\u5B58\u547D\u4E2D" : "\u79C1\u94A5\u672A\u63E1\u624B";
  const cooldown = signing.cooldownUntil > now ? ` \xB7 \u51B7\u5374\u81F3 ${formatClockTime(signing.cooldownUntil)}\uFF08\u81EA\u52A8\u81EA\u6108\uFF09` : "";
  return `  \u7B7E\u540D\uFF1A\u5DF2\u542F\u7528 \xB7 ${cache} \xB7 \u4E0A\u6B21 ${signing.lastResult ?? "\u65E0\u8BF7\u6C42"}${cooldown}`;
}
function formatUsageWindow(label, win, reset) {
  if (win === void 0) return `${label} \u65E0\u8BFB\u6570`;
  const raw = win.percentage ?? (win.total > 0 ? win.used / win.total * 100 : Number.NaN);
  const percentage = Number.isFinite(raw) ? `${Math.round(raw)}%` : "\u2014";
  const base = `${label} ${Math.round(win.used)} / ${Math.round(win.total)}\uFF08${percentage}`;
  return win.resetAt !== void 0 ? `${base}\uFF0C\u91CD\u7F6E ${reset(win.resetAt)}\uFF09` : `${base}\uFF09`;
}
function renderUsageLine(usage, now) {
  if (usage.kind === "error") {
    return `  \u7528\u91CF\uFF1A\u8BFB\u53D6\u5931\u8D25\uFF08${usage.code}\uFF09\uFF0C\u9700\u767B\u5F55\u6001\u4E0E org/project`;
  }
  const parts = [
    formatUsageWindow("5h \u7A97\u53E3", usage.fiveHour, formatClockTime),
    formatUsageWindow("\u5468", usage.weekly, formatWeekTime)
  ];
  const diffMinutes = Math.floor((now - usage.readAt) / 6e4);
  const ago = diffMinutes < 1 ? "\u521A\u521A" : `${diffMinutes} \u5206\u949F\u524D`;
  return `  \u7528\u91CF\uFF1A${parts.join(" \xB7 ")}\uFF08\u8BFB\u6570 ${ago}\uFF0C\u670D\u52A1\u7AEF\u805A\u5408\u5EF6\u8FDF 1\u20132 \u5206\u949F\uFF09`;
}
function renderNoteLine(haltReason, refConflict) {
  if (haltReason !== void 0) return `  \u5907\u6CE8\uFF1A${haltReason.code}\uFF1A${haltReason.message}`;
  if (refConflict !== void 0) {
    return `  \u5907\u6CE8\uFF1AREF_CONFLICT\uFF1AZCODE_PLAN_PAT \u7531\u5916\u90E8\u6765\u6E90\uFF08${refConflict.source ?? "unknown"}\uFF09\u4F9B\u503C`;
  }
  return "  \u5907\u6CE8\uFF1A\u65E0";
}
function renderStatus(snapshot2) {
  const lines = [
    `zcode-plan \u72B6\u6001\uFF08\u8BFB\u6570 ${formatFullTime(snapshot2.now)}\uFF09`,
    renderLoginLine(snapshot2.grant, snapshot2.now),
    renderKeyLine(snapshot2.key),
    renderPatLine(snapshot2.pat, snapshot2.now, snapshot2.patRenewalLeadMs),
    `  ${renderRouteLine(snapshot2.route)}`,
    renderSigningLine(snapshot2.signing, snapshot2.now),
    renderUsageLine(snapshot2.usage, snapshot2.now),
    renderNoteLine(snapshot2.haltReason, snapshot2.refConflict)
  ];
  return lines.join("\n");
}

// src/host/commands.ts
var COMMAND_NAME = "zcode-plan";
var COMMAND_DESCRIPTION = "zcode \u8BA1\u5212\u6865\u63A5\uFF1ABigModel \u767B\u5F55 / PAT \u7EED\u671F / \u8DEF\u7531\u6CE8\u518C\u4E0E\u7528\u91CF\u72B6\u6001\uFF08login | logout | status | route | refresh\uFF09";
var COMMAND_INPUT_HINT = "[login [\u56DE\u8C03URL] | logout | status | route [install|remove|status] | refresh]";
var USAGE = [
  `\u7528\u6CD5\uFF1A/${COMMAND_NAME} [login [\u56DE\u8C03URL] | logout | status | route [install|remove|status] | refresh]`,
  "  login                \u53D1\u8D77 BigModel \u6388\u6743\uFF08\u6D4F\u89C8\u5668\u5B8C\u6210\u540E\u7C98\u8D34\u56DE\u8C03 URL\uFF09",
  "  login <\u56DE\u8C03URL>      \u63D0\u4EA4\u7C98\u8D34\u7684\u56DE\u8C03 URL\uFF0C\u6362\u53D1\u767B\u5F55\u51ED\u8BC1",
  "  logout               \u9000\u51FA\u767B\u5F55\u5E76\u6E05\u9664 ZCODE_PLAN_PAT\uFF08\u670D\u52A1\u7AEF Key \u4FDD\u7559\uFF09",
  "  status               \u67E5\u770B\u767B\u5F55 / Key / PAT / \u8DEF\u7531 / \u7528\u91CF\u72B6\u6001\uFF08\u7F3A\u7701\u5B50\u547D\u4EE4\uFF09",
  "  route install        \u628A zcode-plan \u8DEF\u7531\u5199\u5165 profile \u5C42 providers",
  "  route remove         \u4ECE profile \u5C42\u79FB\u9664 zcode-plan \u8DEF\u7531",
  "  route status         \u67E5\u770B\u8DEF\u7531\u6CE8\u518C\u72B6\u6001",
  "  refresh              \u7ACB\u5373\u6362\u53D1\u4E00\u5F20 PAT"
].join("\n");
function logEvent(log, event, detail) {
  log.info(detail === void 0 || detail.length === 0 ? event : `${event} ${detail}`);
}
function parseZcodePlanInput(rawInput) {
  const trimmed = rawInput.trim();
  if (trimmed.length === 0) return { kind: "status" };
  const separator = /\s/.exec(trimmed);
  const head = (separator === null ? trimmed : trimmed.slice(0, separator.index)).replace(/^\//, "");
  const rest = separator === null ? "" : trimmed.slice(separator.index).trim();
  switch (head) {
    case "status":
      return rest.length === 0 ? { kind: "status" } : { kind: "bad" };
    case "login":
      return rest.length === 0 ? { kind: "login" } : { kind: "login", callbackUrl: rest };
    case "logout":
      return rest.length === 0 ? { kind: "logout" } : { kind: "bad" };
    case "refresh":
      return rest.length === 0 ? { kind: "refresh" } : { kind: "bad" };
    case "route": {
      if (rest.length === 0) return { kind: "route", action: "status" };
      const restTokens = rest.split(/\s+/);
      const action = restTokens[0]?.replace(/^\//, "") ?? "";
      const isKnown = action === "install" || action === "remove" || action === "status";
      return isKnown && restTokens.length === 1 ? { kind: "route", action } : { kind: "bad" };
    }
    default:
      return { kind: "bad" };
  }
}
function describeFailure2(error) {
  if (error instanceof BridgeError) return `${error.code}\uFF08${error.message}\uFF09`;
  return error instanceof Error ? error.name : "unknown";
}
async function handleZcodePlanCommand(rawInput, deps, signal) {
  const parsed = parseZcodePlanInput(rawInput);
  switch (parsed.kind) {
    case "status": {
      const snapshot2 = await deps.status(signal);
      return { kind: "success", text: renderStatus(snapshot2) };
    }
    case "login":
      return handleLogin(parsed.callbackUrl, deps);
    case "logout":
      return handleLogout(deps);
    case "route":
      return handleRoute(parsed.action, deps);
    case "refresh":
      return handleRefresh(deps);
    case "bad":
      return { kind: "error", text: USAGE };
  }
}
async function handleLogin(callbackUrl, deps) {
  const driver = deps.driver();
  if (driver === void 0) {
    return { kind: "error", text: "\u767B\u5F55\u901A\u9053\u672A\u5C31\u7EEA\uFF08\u5BBF\u4E3B\u7F3A\u5C11 authorization \u670D\u52A1\uFF09\uFF0C\u65E0\u6CD5\u5904\u7406\u767B\u5F55" };
  }
  if (callbackUrl !== void 0) {
    const pasted = driver.paste(callbackUrl);
    if (pasted.ok) return { kind: "success", text: "\u5DF2\u6536\u5230\u56DE\u8C03\uFF0C\u6B63\u5728\u6362\u53D1\u767B\u5F55\u51ED\u8BC1\u2026" };
    return pasted.reason === "no-attempt" ? { kind: "error", text: "\u5F53\u524D\u6CA1\u6709\u8FDB\u884C\u4E2D\u7684\u767B\u5F55\u5C1D\u8BD5\uFF1B\u8BF7\u5148\u8FD0\u884C /zcode-plan login \u53D1\u8D77\u6388\u6743" } : { kind: "error", text: "\u767B\u5F55\u6D41\u7A0B\u672A\u5728\u7B49\u5F85\u56DE\u8C03\uFF08\u53EF\u80FD\u5DF2\u5B8C\u6210\u6216\u5DF2\u8D85\u65F6\uFF09\uFF1B\u53EF\u8FD0\u884C /zcode-plan status \u67E5\u770B\u72B6\u6001" };
  }
  const begun = await driver.begin("/zcode-plan");
  if (begun.url === void 0) return { kind: "success", text: begun.text };
  return {
    kind: "success",
    text: `\u5DF2\u53D1\u8D77 BigModel \u6388\u6743\u3002
\u6388\u6743\u94FE\u63A5\uFF1A${begun.url}
\u5B8C\u6210\u6D4F\u89C8\u5668\u6388\u6743\u540E\uFF0C\u628A\u5730\u5740\u680F\u6574\u6761 URL \u7C98\u8D34\u4E3A\uFF1A/zcode-plan login ${begun.url}`
  };
}
async function handleLogout(deps) {
  const credentials = deps.credentials();
  if (credentials === void 0) {
    return { kind: "error", text: "credentials \u670D\u52A1\u4E0D\u53EF\u7528\uFF0C\u65E0\u6CD5\u6E05\u9664\u672C\u673A\u767B\u5F55\u6001" };
  }
  try {
    await deps.driver()?.abort();
    await credentials.deleteRecord(LOGIN_RECORD_KEY);
    await credentials.unset(PAT_REF);
    deps.owner()?.dispose();
    deps.afterLogout?.();
    return { kind: "success", text: "\u5DF2\u9000\u51FA\u767B\u5F55\u5E76\u6E05\u9664 ZCODE_PLAN_PAT\uFF1B\u670D\u52A1\u7AEF Key \u672A\u88AB\u5220\u9664" };
  } catch (error) {
    return { kind: "error", text: `\u9000\u51FA\u767B\u5F55\u5931\u8D25\uFF1A${describeFailure2(error)}` };
  }
}
async function handleRoute(action, deps) {
  if (action === "status") {
    return { kind: "success", text: renderRouteLine(readRouteState(deps.llm())) };
  }
  const configEditor = deps.configEditor();
  if (configEditor === void 0) {
    return { kind: "error", text: "config-editor \u670D\u52A1\u4E0D\u53EF\u7528\uFF0C\u65E0\u6CD5\u8BFB\u5199 profile \u5C42\u8DEF\u7531" };
  }
  try {
    if (action === "install") {
      const result2 = await installRoute({ configEditor, llm: deps.llm(), log: deps.log });
      if (!result2.ok && result2.reason === "no-llm-pi-ai-row") {
        return { kind: "error", text: "\u5F53\u524D profile \u6CA1\u6709 llm-pi-ai \u884C\uFF0C\u8DEF\u7531\u65E0\u6CD5\u81EA\u52A8\u6CE8\u518C" };
      }
      const registered = result2.registered ?? (deps.llm()?.listProviders().some((provider) => provider.id === ROUTE_ID) ?? false);
      return registered ? { kind: "success", text: "\u5DF2\u5199\u5165 llm-pi-ai.providers.zcode-plan\uFF08profile \u5C42\uFF09\uFF1B\u5F53\u524D\u8DEF\u7531\u5DF2\u6CE8\u518C" } : { kind: "success", text: "\u5DF2\u5199\u5165 llm-pi-ai.providers.zcode-plan\uFF08profile \u5C42\uFF09\uFF1Bllm \u76EE\u5F55\u5C1A\u672A\u6CE8\u518C\uFF0C\u5F85\u5BBF\u4E3B\u91CD\u8F7D\u914D\u7F6E\u540E\u751F\u6548" };
    }
    const result = await removeRoute({ configEditor, log: deps.log });
    if (!result.ok && result.reason === "no-llm-pi-ai-row") {
      return { kind: "error", text: "\u5F53\u524D profile \u6CA1\u6709 llm-pi-ai \u884C\uFF0C\u65E0\u6CD5\u6458\u9664\u8DEF\u7531" };
    }
    return { kind: "success", text: "\u5DF2\u4ECE profile \u5C42\u79FB\u9664 zcode-plan \u8DEF\u7531\uFF1B\u56DE\u9000\u8DEF\u7531 zai-coding-cn \u4E0D\u53D7\u5F71\u54CD" };
  } catch (error) {
    return { kind: "error", text: `\u8DEF\u7531\u53D8\u66F4\u5931\u8D25\uFF1A${describeFailure2(error)}` };
  }
}
async function handleRefresh(deps) {
  const owner = deps.owner();
  if (owner === void 0) {
    return { kind: "error", text: "PAT \u7EED\u671F\u5668\u672A\u5C31\u7EEA\uFF08\u672A\u767B\u5F55\u6216 credentials \u670D\u52A1\u4E0D\u53EF\u7528\uFF09\uFF1B\u8BF7\u5148\u8FD0\u884C /zcode-plan login" };
  }
  const previous = owner.current();
  try {
    const lease = await owner.ensure();
    const changed = previous === void 0 || previous.pat !== lease.pat;
    deps.afterRefresh?.();
    logEvent(deps.log, "pat_issued", `expiresAt=${new Date(lease.expiresAt).toISOString()}`);
    return {
      kind: "success",
      text: `\u5DF2\u6362\u53D1 PAT\uFF08\u4E0E\u4E0A\u4E00\u5F20\u4E0D\u540C\uFF1A${changed ? "\u662F" : "\u5426"}\uFF09\uFF1B\u6709\u6548\u671F\u81F3 ${formatFullTime(lease.expiresAt)}`
    };
  } catch (error) {
    return { kind: "error", text: `PAT \u6362\u53D1\u5931\u8D25\uFF1A${describeFailure2(error)}` };
  }
}
function createZcodePlanCommand(deps) {
  return {
    name: COMMAND_NAME,
    description: COMMAND_DESCRIPTION,
    input: { hint: COMMAND_INPUT_HINT },
    handler: ({ rawInput, signal }) => handleZcodePlanCommand(rawInput, deps, signal)
  };
}

// src/host/login-flow.ts
import { randomUUID } from "node:crypto";

// src/host/loopback.ts
import http from "node:http";
var CallbackClosedError = class extends Error {
  constructor() {
    super("\u672C\u5730\u56DE\u8C03\u670D\u52A1\u5668\u5DF2\u5173\u95ED\uFF08\u8D85\u65F6\u6216\u6D41\u7A0B\u7ED3\u675F\uFF09\uFF0C\u56DE\u8C03\u4E0D\u518D\u63A5\u6536");
    this.name = "CallbackClosedError";
  }
};
var CALLBACK_SERVER_TIMEOUT_MS = 6e5;
async function startCallbackServer(options) {
  const { state, path, log } = options;
  const clock = options.clock ?? nodeClock;
  const timeoutMs = options.timeoutMs ?? CALLBACK_SERVER_TIMEOUT_MS;
  let settle;
  let rejectSettle;
  const result = new Promise((resolve2, reject) => {
    settle = resolve2;
    rejectSettle = reject;
  });
  let settled = false;
  const settleOnce = (action) => {
    if (settled) return;
    settled = true;
    action();
  };
  const server = http.createServer((req, res) => {
    const respond = (status, body) => {
      try {
        res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
        res.end(body);
      } catch {
        res.destroy();
      }
    };
    if (req.method !== "GET") {
      respond(405, "\u672C\u56DE\u8C03\u5730\u5740\u53EA\u63A5\u53D7 GET\n");
      return;
    }
    let url;
    try {
      url = new URL(req.url ?? "/", "http://127.0.0.1");
    } catch {
      respond(400, "\u56DE\u8C03 URL \u65E0\u6CD5\u89E3\u6790\n");
      return;
    }
    if (url.pathname !== path) {
      respond(404, "Not Found\n");
      return;
    }
    if (settled) {
      respond(410, "\u672C\u56DE\u8C03\u5730\u5740\u5DF2\u5931\u6548\uFF08\u4E00\u6B21\u6027\u4F7F\u7528\uFF09\n");
      return;
    }
    const authCode = url.searchParams.get("authCode") ?? url.searchParams.get("code");
    if (authCode === null || authCode.length === 0) {
      log?.info("\u56DE\u8C03\u547D\u4E2D\uFF1A\u7F3A\u6388\u6743\u7801\u53C2\u6570\uFF0C\u6309 AUTH_STATE \u62D2\u7EDD");
      settleOnce(() => rejectSettle(new BridgeError("AUTH_STATE", "\u56DE\u8C03\u7F3A\u5C11\u6388\u6743\u7801\u53C2\u6570\uFF08authCode\uFF09\uFF0C\u5DF2\u62D2\u7EDD\u672C\u6B21\u6388\u6743")));
      respond(400, "\u6388\u6743\u5931\u8D25\uFF1A\u56DE\u8C03\u7F3A\u5C11\u6388\u6743\u7801\u53C2\u6570\uFF0C\u8BF7\u56DE\u5230\u7EC8\u7AEF\u91CD\u65B0\u53D1\u8D77\u767B\u5F55\u3002\n");
      return;
    }
    const returnedState = url.searchParams.get("state") ?? "";
    if (returnedState !== state) {
      log?.info("\u56DE\u8C03\u547D\u4E2D\uFF1Astate \u6821\u9A8C\u4E0D\u901A\u8FC7\uFF0C\u6309 AUTH_STATE \u62D2\u7EDD");
      settleOnce(() => rejectSettle(new BridgeError("AUTH_STATE")));
      respond(400, "\u6388\u6743\u5931\u8D25\uFF1Astate \u6821\u9A8C\u4E0D\u901A\u8FC7\uFF0C\u8BF7\u56DE\u5230\u7EC8\u7AEF\u91CD\u65B0\u53D1\u8D77\u767B\u5F55\u3002\n");
      return;
    }
    log?.info("\u56DE\u8C03\u547D\u4E2D\uFF1Astate \u6821\u9A8C\u901A\u8FC7\uFF0C\u6388\u6743\u7801\u5DF2\u63A5\u6536\uFF08result \u5DF2\u7ED3\u7B97\uFF09");
    settleOnce(() => settle({ code: authCode, state: returnedState }));
    respond(200, "\u6388\u6743\u6210\u529F\uFF0C\u8BF7\u56DE\u5230\u7EC8\u7AEF\u7EE7\u7EED\u3002\n");
  });
  let failListen;
  const listening = new Promise((resolve2, reject) => {
    failListen = reject;
    server.once("listening", resolve2);
  });
  server.once("error", (error) => failListen?.(error));
  server.listen(0, "127.0.0.1");
  try {
    await listening;
  } catch (error) {
    server.close();
    throw error;
  }
  server.on("error", (error) => {
    log?.warn(`\u56DE\u8C03\u670D\u52A1\u5668\u8FD0\u884C\u671F\u9519\u8BEF\uFF1A${error.name}`);
  });
  const port = server.address().port;
  const redirectUri = `http://127.0.0.1:${port}${path}`;
  let closed = false;
  let timer;
  const close = () => {
    if (closed) return;
    closed = true;
    if (timer !== void 0) clock.clearTimeout(timer);
    try {
      server.close(() => {
      });
      server.closeIdleConnections();
    } catch {
    }
    settleOnce(() => rejectSettle(new CallbackClosedError()));
    log?.info("\u56DE\u8C03\u670D\u52A1\u5668\u5DF2\u5173\u95ED");
  };
  timer = clock.setTimeout(() => {
    log?.warn("\u56DE\u8C03\u670D\u52A1\u5668\u7B49\u5F85\u8D85\u65F6\uFF0C\u81EA\u52A8\u5173\u95ED\uFF08\u6302\u8D77\u7684\u56DE\u8C03\u5DF2\u4F5C\u5E9F\uFF09");
    close();
  }, timeoutMs);
  log?.info(`\u56DE\u8C03\u670D\u52A1\u5668\u5DF2\u542F\u52A8\uFF1A${redirectUri}`);
  return { redirectUri, result, close };
}

// src/host/login-flow.ts
var AUTHORIZE_URL2 = "https://bigmodel.cn/login";
var AUTHORIZE_APP_ID = "zcode";
var CALLBACK_PATH = "/oauth/callback/bigmodel";
var LOGIN_FLOW_LABEL = "BigModel / GLM Coding Plan\uFF08ZCode \u8EAB\u4EFD\uFF09";
var LOGIN_NOTICE_MESSAGE = "\u5728\u6D4F\u89C8\u5668\u5B8C\u6210 BigModel \u6388\u6743\uFF08\u56DE\u8C03\u5730\u5740\u4F1A\u81EA\u52A8\u5E26 code\uFF1B\u5BB9\u5668\u5185\u8BF7\u590D\u5236\u56DE\u8C03 URL\uFF09";
var LOGIN_PASTE_PROMPT = "\u7C98\u8D34\u6D4F\u89C8\u5668\u5730\u5740\u680F\u7684\u5B8C\u6574\u56DE\u8C03 URL";
var BEGIN_TEXT_TIMEOUT_MS = 2e3;
var CALLBACK_ERROR_MAX = 80;
function buildAuthorizeUrl(options) {
  const params = new URLSearchParams();
  params.set("appId", options.appId ?? AUTHORIZE_APP_ID);
  if (options.redirect !== void 0) params.set("redirect", options.redirect);
  params.set("state", options.state);
  return `${AUTHORIZE_URL2}?${params.toString()}`;
}
function randomState() {
  return randomUUID().replace(/-/g, "");
}
function hasScheme(text) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(text);
}
function parseCallbackUrl(text) {
  const trimmed = text.trim();
  if (trimmed === "") return void 0;
  let url;
  try {
    url = new URL(hasScheme(trimmed) ? trimmed : `http://${trimmed}`);
  } catch {
    return void 0;
  }
  const authCode = url.searchParams.get("authCode") ?? url.searchParams.get("code");
  if (authCode === null || authCode.length === 0) return void 0;
  const state = url.searchParams.get("state") ?? void 0;
  const redirectUri = `${url.protocol}//${url.host}${url.pathname}`;
  return { authCode, redirectUri, ...state !== void 0 && state.length > 0 && { state } };
}
function createLoginFlow(deps) {
  return {
    key: LOGIN_RECORD_KEY,
    label: LOGIN_FLOW_LABEL,
    methods: [{ id: "browser", label: "\u7528\u6D4F\u89C8\u5668\u767B\u5F55 bigmodel.cn" }],
    run: (session) => runLoginAttempt(session, deps)
  };
}
async function runLoginAttempt(session, deps) {
  const state = randomState();
  const controller = new AbortController();
  const forwardAbort = () => {
    controller.abort();
  };
  if (session.signal.aborted) controller.abort();
  else session.signal.addEventListener("abort", forwardAbort, { once: true });
  const startServer = deps.startServer ?? (deps.config.callbackServer ? startCallbackServer : void 0);
  let server;
  if (deps.config.callbackServer && startServer !== void 0) {
    server = await startServer({ state, path: CALLBACK_PATH, log: deps.log, clock: deps.clock });
  }
  try {
    const authorizeUrl = buildAuthorizeUrl({ state, redirect: server?.redirectUri });
    deps.log.info("\u5DF2\u53D1\u8D77 BigModel \u6388\u6743\uFF08\u7B49\u5F85\u56DE\u8C03\u6216\u7C98\u8D34\uFF09");
    session.notify({ message: LOGIN_NOTICE_MESSAGE, url: authorizeUrl });
    const pasteAbort = new AbortController();
    const branches = [];
    if (server !== void 0) {
      branches.push(
        server.result.then(
          (result) => "code" in result ? { kind: "callback", code: result.code, state: result.state } : { kind: "callback-error", error: result.error }
        )
      );
    }
    branches.push(
      session.prompt({ kind: "text", message: LOGIN_PASTE_PROMPT, signal: pasteAbort.signal }).then((text) => ({ kind: "paste", text }))
    );
    let winner;
    try {
      winner = await Promise.race(branches);
    } finally {
      pasteAbort.abort();
      if (server !== void 0) server.result.catch(() => {
      });
    }
    let authCode;
    let redirectUri;
    if (winner.kind === "callback") {
      if (winner.state !== state) throw new BridgeError("AUTH_STATE");
      authCode = winner.code;
      redirectUri = server?.redirectUri ?? "";
    } else if (winner.kind === "callback-error") {
      const detail = winner.error.slice(0, CALLBACK_ERROR_MAX);
      throw new BridgeError("AUTH_STATE", `\u56DE\u8C03\u8FD4\u56DE\u9519\u8BEF\uFF08${detail}\uFF09\uFF0C\u5DF2\u62D2\u7EDD\u672C\u6B21\u6388\u6743`);
    } else {
      const parsed = parseCallbackUrl(winner.text);
      if (parsed === void 0) {
        throw new BridgeError("AUTH_STATE", "\u7C98\u8D34\u5185\u5BB9\u4E0D\u662F\u53EF\u89E3\u6790\u7684\u56DE\u8C03 URL\uFF08\u9700\u542B authCode \u53C2\u6570\uFF09");
      }
      if (parsed.state !== state) throw new BridgeError("AUTH_STATE");
      authCode = parsed.authCode;
      redirectUri = parsed.redirectUri;
    }
    const jwt = await deps.client.exchangeAuthCode({ authCode, redirectUri, state, signal: controller.signal });
    const grant = {
      v: GRANT_VERSION,
      jwt,
      organization: deps.config.organization,
      project: deps.config.project,
      loginAt: deps.clock.now()
    };
    const record = { kind: "grant", payload: grant };
    await session.commit(record);
    deps.log.info("\u767B\u5F55\u5B8C\u6210\uFF1A\u5DF2\u63D0\u4EA4 BigModel \u767B\u5F55\u8BB0\u5F55");
  } finally {
    server?.close();
    session.signal.removeEventListener("abort", forwardAbort);
  }
}
var PasteWithdrawnError = class extends Error {
  constructor() {
    super("\u7C98\u8D34\u63D0\u95EE\u5DF2\u88AB\u64A4\u56DE\uFF08\u53E6\u4E00\u5206\u652F\u5148\u884C\u5B8C\u6210\uFF09");
    this.name = "PasteWithdrawnError";
  }
};
function describeFailure3(error) {
  if (error instanceof BridgeError) return `code=${error.code}`;
  if (error instanceof Error) {
    const frame = error.stack?.split("\n")[1]?.trim() ?? "";
    return `${error.name}: ${error.message.slice(0, 200)}${frame === "" ? "" : ` @ ${frame.slice(0, 160)}`}`;
  }
  return "unknown";
}
function createLoginDriver(deps) {
  let attempt;
  const handleNotice = (a, notice, releaseWait) => {
    a.notices.push(notice);
    if (a.url === void 0 && notice.url !== void 0) a.url = notice.url;
    releaseWait?.();
  };
  const settle = (a) => {
    deps.clock.clearTimeout(a.timer);
    if (attempt === a) attempt = void 0;
  };
  return {
    async begin(origin) {
      if (attempt !== void 0) {
        const existing = attempt;
        deps.log.info("\u767B\u5F55\u5C1D\u8BD5\u5DF2\u5728\u8FDB\u884C\u4E2D\uFF08\u56DE\u663E\u73B0\u6709\u6388\u6743\u94FE\u63A5\uFF09");
        return {
          status: "in-flight",
          ...existing.url !== void 0 && { url: existing.url },
          text: "\u767B\u5F55\u5C1D\u8BD5\u5DF2\u5728\u8FDB\u884C\u4E2D\uFF0C\u8BF7\u7EE7\u7EED\u5B8C\u6210\u6D4F\u89C8\u5668\u6388\u6743\u5E76\u7C98\u8D34\u56DE\u8C03 URL"
        };
      }
      const controller = new AbortController();
      const a = {
        controller,
        notices: [],
        promise: void 0,
        timer: void 0
      };
      let releaseWait;
      const firstNotice = new Promise((resolve2) => {
        releaseWait = resolve2;
      });
      const waitHandle = deps.clock.setTimeout(() => releaseWait?.(), BEGIN_TEXT_TIMEOUT_MS);
      const interaction = {
        notify: (notice) => handleNotice(a, notice, releaseWait),
        prompt: (prompt) => new Promise((resolve2, reject) => {
          const slot = { resolve: resolve2, reject };
          a.pendingPaste = slot;
          const withdraw = () => {
            if (a.pendingPaste !== slot) return;
            a.pendingPaste = void 0;
            reject(new PasteWithdrawnError());
          };
          if (prompt.signal !== void 0) {
            prompt.signal.addEventListener("abort", withdraw, { once: true });
            if (prompt.signal.aborted) withdraw();
          }
        })
      };
      a.promise = deps.beginAttempt({ key: LOGIN_RECORD_KEY, interaction, signal: controller.signal });
      a.timer = deps.clock.setTimeout(() => controller.abort(), deps.ttlMs);
      a.promise.then(
        () => settle(a),
        (error) => {
          deps.log.warn(`\u767B\u5F55\u5C1D\u8BD5\u5931\u8D25\uFF1A${describeFailure3(error)}`);
          settle(a);
        }
      );
      attempt = a;
      deps.log.info(`\u5DF2\u4E3A ${origin} \u53D1\u8D77 BigModel \u767B\u5F55\u5C1D\u8BD5`);
      await firstNotice;
      deps.clock.clearTimeout(waitHandle);
      const first = a.notices[0];
      return {
        status: "started",
        ...a.url !== void 0 && { url: a.url },
        text: first?.message ?? "\u6B63\u5728\u53D1\u8D77 BigModel \u6388\u6743\uFF0C\u8BF7\u7A0D\u5019\uFF08\u5B8C\u6210\u540E\u628A\u56DE\u8C03 URL \u7C98\u8D34\u56DE\u6765\uFF09"
      };
    },
    paste(text) {
      const current = attempt;
      if (current === void 0) return { ok: false, reason: "no-attempt" };
      const slot = current.pendingPaste;
      if (slot === void 0) return { ok: false, reason: "not-waiting" };
      current.pendingPaste = void 0;
      slot.resolve(text);
      return { ok: true };
    },
    current() {
      return attempt === void 0 ? { inFlight: false } : { inFlight: true, ...attempt.url !== void 0 && { url: attempt.url } };
    },
    async abort() {
      const current = attempt;
      if (current === void 0) return;
      current.controller.abort();
      await current.promise.catch(() => {
      });
    }
  };
}

// src/host/pat-owner.ts
var RETRY_BACKOFF_MS = 5e3;
var MIN_RETRY_MS = 5e3;
var MIN_SCHEDULE_MS = 1e3;
function createPatOwner(deps) {
  let lease;
  let patState = { kind: "none" };
  let halted;
  let generation = 0;
  let currentIdentity;
  let pending;
  let timer;
  let disposed = false;
  const now = () => deps.clock.now();
  function describe(error) {
    return error instanceof BridgeError ? `code=${error.code}` : error instanceof Error ? error.name : "unknown";
  }
  function clearTimer() {
    if (timer !== void 0) {
      deps.clock.clearTimeout(timer);
      timer = void 0;
    }
  }
  function staleError() {
    return new BridgeError("REF_CONFLICT", "\u7EED\u671F\u4EE3\u6B21\u5DF2\u66F4\u66FF\uFF08logout / \u91CD\u767B\u5F55 / owner \u91CD\u5EFA\uFF09\uFF0C\u672C\u6B21\u7ED3\u679C\u5DF2\u4E22\u5F03");
  }
  function staleLease() {
    const stale = lease;
    if (stale !== void 0) return stale;
    throw staleError();
  }
  function schedule(ms, gen) {
    clearTimer();
    timer = deps.clock.setTimeout(() => {
      timer = void 0;
      if (gen !== generation) return;
      void ensure().catch(() => {
      });
    }, ms);
  }
  function scheduleRenewal(currentLease, gen) {
    const t = now();
    const delay = currentLease.expiresAt - t - deps.leadMs - Math.random() * deps.jitterMs;
    const upper = Math.max(MIN_SCHEDULE_MS, currentLease.expiresAt - t - 1e3);
    const scheduledMs = Math.min(Math.max(delay, MIN_RETRY_MS), upper);
    schedule(scheduledMs, gen);
    deps.log.info(`pat_refresh_deferred at=${new Date(t + scheduledMs).toISOString()}`);
  }
  function scheduleRetry(gen) {
    schedule(RETRY_BACKOFF_MS, gen);
  }
  function halt(error) {
    clearTimer();
    lease = void 0;
    halted = { code: error.code, message: error.message };
    patState = { kind: "halted", code: error.code };
    deps.log.error(`PAT \u7EED\u671F\u5DF2\u7EC8\u6B62\uFF08${error.code}\uFF09\uFF1A${error.message}`);
    throw error;
  }
  function retryLater(error, gen) {
    clearTimer();
    const t = now();
    patState = lease === void 0 ? { kind: "none" } : lease.expiresAt > t ? { kind: "valid", expiresAt: lease.expiresAt } : { kind: "expired" };
    deps.log.warn(`PAT \u7EED\u671F\u5931\u8D25\uFF08\u53EF\u91CD\u8BD5\uFF0C${RETRY_BACKOFF_MS / 1e3}s \u540E\u518D\u8BD5\uFF09\uFF1A${describe(error)}`);
    scheduleRetry(gen);
    throw error;
  }
  function classifyAndThrow(error, gen) {
    if (isRetryable(error)) retryLater(error, gen);
    if (error instanceof BridgeError) halt(error);
    throw error;
  }
  function isRetryable(error) {
    if (error instanceof BridgeError) {
      const code = error.code;
      if (code === "TIMEOUT") return true;
      const match = /^HTTP:(\d+)$/.exec(code);
      if (match !== null) {
        const status = Number(match[1]);
        return status === 0 || status === 429 || status >= 500;
      }
      return false;
    }
    return error instanceof Error && error.name === "AbortError";
  }
  async function ensureKeyClassified(grant, gen) {
    try {
      return await deps.keyManager.ensureKey({ client: deps.client, grant });
    } catch (error) {
      if (gen !== generation) throw staleError();
      classifyAndThrow(error, gen);
    }
  }
  async function issuePatWithRetry(grant, identity, gen, attempt, keyId) {
    try {
      return await deps.client.issuePat({ jwt: identity.jwt, organization: identity.organization, project: identity.project, keyId });
    } catch (error) {
      if (gen !== generation) return staleLease();
      const keyLost = error instanceof BridgeError && error.code === "KEY_LOST";
      if (!keyLost || attempt >= 1) classifyAndThrow(error, gen);
      deps.log.warn("\u6865\u63A5 Key \u6362 PAT \u5931\u8D25\uFF08KEY_LOST\uFF09\uFF1A\u4F5C\u5E9F\u7F13\u5B58\u5E76\u91CD\u67E5\u4E00\u8F6E");
      deps.keyManager.invalidateKey(keyId);
      const nextKeyId = await ensureKeyClassified(grant, gen);
      if (gen !== generation) return staleLease();
      return await issuePatWithRetry(grant, identity, gen, attempt + 1, nextKeyId);
    }
  }
  async function publish(result, gen) {
    await deps.credentials.set(deps.patRef, result.pat);
    if (gen === generation) deps.onPatPublished?.(result.pat);
    if (gen !== generation) return;
    deps.log.info(`pat_issued expiresAt=${new Date(result.expiresAt).toISOString()}`);
    lease = result;
    patState = { kind: "valid", expiresAt: result.expiresAt };
    halted = void 0;
    scheduleRenewal(result, gen);
    try {
      await patchGrant(deps, deps.recordKey, { patExpiresAt: result.expiresAt });
    } catch (error) {
      deps.log.warn(`\u8865\u5199 patExpiresAt \u5931\u8D25\uFF08\u4E0D\u5F71\u54CD\u7EED\u671F\uFF09\uFF1A${describe(error)}`);
    }
  }
  async function runEnsure() {
    const gen = generation;
    const grant = parseGrant(await deps.credentials.readRecord(deps.recordKey), deps.log);
    if (gen !== generation) return staleLease();
    if (grant === void 0) {
      patState = { kind: "none" };
      throw new BridgeError("AUTH_STATE", "\u672A\u627E\u5230\u6709\u6548\u767B\u5F55\u8BB0\u5F55\uFF0C\u8BF7\u5148\u6267\u884C /zcode-plan login");
    }
    const { jwt, organization, project } = grant;
    if (organization === void 0 || project === void 0) {
      patState = { kind: "none" };
      throw new BridgeError("AUTH_STATE", "\u767B\u5F55\u8BB0\u5F55\u7F3A\u5C11 organization/project\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55");
    }
    const identity = { jwt, organization, project };
    currentIdentity = identity;
    const keyId = await ensureKeyClassified(grant, gen);
    if (gen !== generation) return staleLease();
    const result = await issuePatWithRetry(grant, identity, gen, 0, keyId);
    if (gen !== generation) return staleLease();
    await publish(result, gen);
    if (gen !== generation) return staleLease();
    return result;
  }
  function ensure() {
    if (disposed) return Promise.reject(staleError());
    if (pending !== void 0) return pending;
    const promise = runEnsure().finally(() => {
      if (pending === promise) pending = void 0;
    });
    pending = promise;
    return promise;
  }
  return {
    current: () => lease === void 0 ? void 0 : { ...lease },
    ensure,
    state: () => ({ ...patState }),
    identity: () => currentIdentity === void 0 ? void 0 : { ...currentIdentity },
    haltReason: () => halted === void 0 ? void 0 : { ...halted },
    dispose: () => {
      disposed = true;
      clearTimer();
      generation += 1;
      pending = void 0;
    }
  };
}

// src/host/index.ts
var name = "zcode-plan";
var inject = [];
var Config = Schema.object({
  organization: Schema.string().required().description("zcode \u4FA7\u7EC4\u7EC7\u540D\uFF08\u5FC5\u586B\uFF1A\u5E73\u53F0\u65E0\u81EA\u52A8\u53D1\u73B0\uFF09"),
  project: Schema.string().required().description("zcode \u4FA7\u9879\u76EE\u540D\uFF08\u5FC5\u586B\uFF09"),
  clientVersion: Schema.string().default("0.17.0").description("\u6865\u63A5\u8BF7\u6C42\u5192\u5145\u7684 zcode \u5BA2\u6237\u7AEF\u7248\u672C"),
  refreshLeadMs: Schema.number().default(12e4).description("\u51ED\u8BC1\u5230\u671F\u524D\u63D0\u524D\u5237\u65B0\u7684\u63D0\u524D\u91CF\uFF08\u6BEB\u79D2\uFF09"),
  refreshJitterMs: Schema.number().default(6e4).description("\u5237\u65B0\u65F6\u523B\u53E0\u52A0\u7684\u968F\u673A\u6296\u52A8\u4E0A\u9650\uFF08\u6BEB\u79D2\uFF09"),
  requestTimeoutMs: Schema.number().default(15e3).description("\u5BF9 zcode \u4FA7 HTTP \u8BF7\u6C42\u7684\u8D85\u65F6\uFF08\u6BEB\u79D2\uFF09"),
  callbackServer: Schema.boolean().default(true).description("\u767B\u5F55\u6D41\u7A0B\u662F\u5426\u542F\u52A8\u672C\u5730\u56DE\u8C03\u670D\u52A1\u5668"),
  loginAttemptTtlMs: Schema.number().default(6e5).description("\u767B\u5F55\u5C1D\u8BD5\u8BB0\u5F55\u7684\u5B58\u6D3B\u65F6\u957F\uFF08\u6BEB\u79D2\uFF09\uFF0C\u8D85\u65F6\u5373\u4F5C\u5E9F"),
  signing: Schema.boolean().default(true).description("\u7B7E\u540D\u901A\u9053\uFF08\u5B98\u65B9 ZCode \u6298\u6263\u8BA1\u8D39\uFF1B\u5173\u95ED = \u65E0\u7B7E\u540D\u76F4\u8FDE\u57FA\u7EBF\u884C\u4E3A\uFF09")
}).description("zcode \u8BA1\u5212\u6865\u63A5\uFF1A\u51ED\u8BC1\u590D\u7528\u3001/zcode-plan \u547D\u4EE4\u4E0E PAT owner \u7684\u63D2\u4EF6\u914D\u7F6E");
function describeFailure4(error) {
  return error instanceof BridgeError ? `code=${error.code}` : error instanceof Error ? error.name : "unknown";
}
function parseSigningRecord(record) {
  if (record === void 0 || record.kind !== "grant") return void 0;
  const payload = record.payload;
  if (typeof payload !== "object" || payload === null) return void 0;
  const candidate = payload;
  if (candidate.signing !== 1) return void 0;
  if (candidate.v !== 1) return void 0;
  if (typeof candidate.fingerprint !== "string" || candidate.fingerprint.length === 0) return void 0;
  if (typeof candidate.pkcs8B64 !== "string" || candidate.pkcs8B64.length === 0) return void 0;
  if (typeof candidate.createdAt !== "number" || !Number.isFinite(candidate.createdAt)) return void 0;
  return { v: 1, fingerprint: candidate.fingerprint, pkcs8B64: candidate.pkcs8B64, createdAt: candidate.createdAt };
}
var EVENT_HOOK_PATTERNS = [
  { pattern: /^已新建桥接 Key/, event: "key_created" },
  { pattern: /^已复用桥接 Key/, event: "key_reused" },
  { pattern: /^PAT 续期已终止（([^）]+)）/, event: "halted", detail: (match) => `code=${match[1]}` },
  { pattern: /^PAT 续期失败(?:.*?(code=\S+))?/, event: "pat_refresh_failed", detail: (match) => match[1] },
  { pattern: /^登录完成/, event: "login_committed" },
  { pattern: /^zcode-plan 路由已写入 profile patch 并在 llm 目录注册/, event: "route_registered" }
];
function withEventHooks(inner) {
  const emit = (message) => {
    for (const hook of EVENT_HOOK_PATTERNS) {
      const match = hook.pattern.exec(message);
      if (match === null) continue;
      logEvent(inner, hook.event, hook.detail?.(match));
      return;
    }
  };
  return {
    info: (message) => {
      inner.info(message);
      emit(message);
    },
    warn: (message) => {
      inner.warn(message);
      emit(message);
    },
    error: (message) => {
      inner.error(message);
      emit(message);
    }
  };
}
function readService(ctx, serviceId) {
  try {
    const get = ctx.get;
    if (typeof get !== "function") return void 0;
    return get.call(ctx, serviceId);
  } catch {
    return void 0;
  }
}
function llmPort(ctx) {
  const llm = readService(ctx, "llm");
  if (llm === null || typeof llm !== "object") return void 0;
  const directory = llm;
  const listProviders = directory.listProviders;
  if (typeof listProviders !== "function") return void 0;
  const listConfigurableProviders = directory.listConfigurableProviders;
  return {
    listProviders: () => listProviders.call(directory),
    listConfigurableProviders: () => listConfigurableProviders?.call(directory) ?? []
  };
}
function configEditorPort(ctx) {
  const editor = readService(ctx, "configEditor");
  if (editor === null || typeof editor !== "object") return void 0;
  const candidate = editor;
  if (typeof candidate.entries !== "function" || typeof candidate.configuration !== "function" || typeof candidate.edit !== "function") {
    return void 0;
  }
  return candidate;
}
function apply(ctx, config) {
  const log = withEventHooks(createLogPort(ctx));
  ctx.logger.info("zcode-plan: loaded");
  if (typeof ctx.inject !== "function") return;
  const client = createBigmodelClient({
    fetch: nodeFetch,
    clock: nodeClock,
    log,
    clientVersion: config.clientVersion
  });
  const keyManager = createKeyManager({ log });
  let owner;
  let driver;
  let credentialsRef;
  let refConflictSource;
  let signer;
  if (config.signing === true) {
    const boundFetch = globalThis.fetch.bind(globalThis);
    const signingRecord = {
      read: async () => {
        const credentials = credentialsRef;
        if (credentials === void 0) return void 0;
        const record = await credentials.readRecord(SIGNING_RECORD_KEY).catch(() => void 0);
        return parseSigningRecord(record);
      },
      write: async (record) => {
        const credentials = credentialsRef;
        if (credentials === void 0) return;
        await credentials.modifyRecord(SIGNING_RECORD_KEY, () => Promise.resolve({ kind: "grant", payload: { signing: 1, ...record } })).catch(() => {
        });
      },
      clear: async () => {
        const credentials = credentialsRef;
        if (credentials === void 0) return;
        await credentials.deleteRecord(SIGNING_RECORD_KEY).catch(() => {
        });
      }
    };
    signer = createSigner({ fetch: (input, init) => boundFetch(input, init), clock: nodeClock, log, record: signingRecord });
    installSigningFetch(signer, log);
  }
  const rebuildOwner = (credentials) => {
    owner?.dispose();
    owner = createPatOwner({
      credentials,
      client,
      keyManager,
      log,
      clock: nodeClock,
      leadMs: config.refreshLeadMs,
      jitterMs: config.refreshJitterMs,
      recordKey: LOGIN_RECORD_KEY,
      patRef: PAT_REF,
      // 签名通道联动（signed-channel D8）：发布即 setCredential（指纹变化 → 后台预握手）。
      onPatPublished: (pat) => signer?.setCredential(pat)
    });
    return owner;
  };
  const collectStatus = async (signal) => {
    const now = nodeClock.now();
    const credentials = credentialsRef;
    const grant = credentials === void 0 ? void 0 : await readGrant(credentials, LOGIN_RECORD_KEY, log);
    const usage = grant === void 0 ? { kind: "error", code: "AUTH_STATE" } : await readUsage(client, grant, nodeClock, signal);
    const haltReason = owner?.haltReason();
    return {
      now,
      ...grant !== void 0 && { grant },
      key: keyManager.state(),
      pat: owner !== void 0 ? owner.state() : { kind: "none" },
      patRenewalLeadMs: config.refreshLeadMs,
      ...haltReason !== void 0 && { haltReason },
      ...refConflictSource !== void 0 && { refConflict: { source: refConflictSource } },
      route: readRouteState(llmPort(ctx)),
      ...signer !== void 0 && { signing: signer.status() },
      usage
    };
  };
  ctx.inject(["credentials", "authorization"], (scope) => {
    const services = scope;
    const { credentials, authorization } = services;
    credentialsRef = credentials;
    services.effect(
      () => () => {
        owner?.dispose();
      },
      "zcode-plan: pat owner"
    );
    const keepDisposer = (dispose, label) => {
      try {
        services.effect(() => dispose, label);
      } catch {
        dispose();
      }
    };
    void (async () => {
      let info;
      try {
        info = await credentials.describe(PAT_REF);
      } catch (error) {
        log.warn(`PAT_REF describe \u5931\u8D25\uFF0C\u6309\u65E0\u51B2\u7A81\u7EE7\u7EED\uFF1A${describeFailure4(error)}`);
        info = { configured: false, writable: false };
      }
      if (isPatRefConflict(info)) {
        refConflictSource = info.source ?? "unknown";
        log.error(`REF_CONFLICT\uFF1AZCODE_PLAN_PAT \u5DF2\u7531\u5916\u90E8\u6765\u6E90\uFF08${info.source ?? "unknown"}\uFF09\u4F9B\u503C\uFF0C\u4E0D\u6CE8\u518C\u767B\u5F55 flow \u4E5F\u4E0D\u53D1\u5E03 PAT`);
        return;
      }
      const begin = authorization.begin;
      if (typeof begin === "function") {
        driver = createLoginDriver({
          beginAttempt: (request) => begin.call(authorization, request),
          log,
          clock: nodeClock,
          ttlMs: config.loginAttemptTtlMs
        });
      }
      const loginFlow = createLoginFlow({ client, config, log, clock: nodeClock });
      const disposeFlow = authorization.registerFlow(loginFlow);
      keepDisposer(() => disposeFlow(), "zcode-plan: authorization flow");
      services.on("credentials/record-updated", (key) => {
        if (key !== LOGIN_RECORD_KEY) return;
        void (async () => {
          const grant2 = await readGrant(credentials, LOGIN_RECORD_KEY, log);
          const current = owner?.identity();
          if (grant2 !== void 0 && current !== void 0 && grant2.jwt === current.jwt && grant2.organization === current.organization && grant2.project === current.project) {
            return;
          }
          rebuildOwner(credentials);
          log.info("\u767B\u5F55\u8BB0\u5F55\u5DF2\u66F4\u65B0\uFF1APAT owner \u5DF2\u91CD\u5EFA");
          if (grant2 === void 0) return;
          try {
            await owner?.ensure();
          } catch (error) {
            log.warn(`\u767B\u5F55\u540E PAT \u62C9\u8D77\u5931\u8D25\uFF08\u4E0D\u5F71\u54CD\u767B\u5F55\uFF0C\u53EF\u624B\u52A8 /zcode-plan refresh\uFF09\uFF1A${describeFailure4(error)}`);
          }
        })();
      });
      const grant = await readGrant(credentials, LOGIN_RECORD_KEY, log);
      if (grant === void 0) return;
      if (signer !== void 0) {
        try {
          const pat = await credentials.resolve(PAT_REF);
          signer.setCredential(pat?.value);
        } catch (error) {
          log.warn(`\u7B7E\u540D\u901A\u9053\u542F\u52A8\u89E3\u6790 PAT \u5931\u8D25\uFF08\u4E0D\u5F71\u54CD\u63D2\u4EF6\u52A0\u8F7D\uFF09\uFF1A${describeFailure4(error)}`);
        }
      }
      const patOwner = rebuildOwner(credentials);
      try {
        await keyManager.ensureKey({ client, grant });
        const lease = await patOwner.ensure();
        logEvent(log, "pat_issued", `expiresAt=${new Date(lease.expiresAt).toISOString()}`);
      } catch (error) {
        log.warn(`\u542F\u52A8\u62C9\u8D77 PAT \u5931\u8D25\uFF08\u4E0D\u5F71\u54CD\u63D2\u4EF6\u52A0\u8F7D\uFF09\uFF1A${describeFailure4(error)}`);
      }
    })();
  });
  ctx.inject(["commands"], (scope) => {
    const services = scope;
    const commands = services.commands;
    if (commands === void 0 || typeof commands.register !== "function") return;
    const dispose = commands.register(
      createZcodePlanCommand({
        driver: () => driver,
        owner: () => owner,
        credentials: () => credentialsRef,
        configEditor: () => configEditorPort(ctx),
        llm: () => llmPort(ctx),
        status: (signal) => collectStatus(signal),
        afterLogout: () => {
          owner = void 0;
          signer?.setCredential(void 0);
        },
        afterRefresh: () => {
          signer?.resetFailures();
        },
        log
      })
    );
    try {
      services.effect?.(() => dispose, "zcode-plan: command");
    } catch {
      dispose();
    }
  });
}
export {
  Config,
  apply,
  inject,
  name
};
