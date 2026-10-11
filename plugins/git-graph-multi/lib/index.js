// ../../node_modules/.pnpm/@deepseek-ai+cosmokit@1.8.5/node_modules/@deepseek-ai/cosmokit/lib/index.js
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

// ../../node_modules/.pnpm/@deepseek-ai+schemastery@3.18.4/node_modules/@deepseek-ai/schemastery/lib/index.mjs
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
function validateVolatileSchema(schema, path3 = [], blocked = false, seen = /* @__PURE__ */ new Map()) {
  const states = seen.get(schema) ?? /* @__PURE__ */ new Set();
  if (states.has(blocked)) return;
  states.add(blocked);
  seen.set(schema, states);
  if (schema.meta?.volatile && blocked) throw new ValidationError("volatile fields require a fixed object path without an enclosing volatile field", { path: path3 });
  const nested = blocked || !!schema.meta?.volatile;
  if (schema.dict) for (const [key, child] of Object.entries(schema.dict)) validateVolatileSchema(child, [...path3, key], nested, seen);
  if (schema.sKey) validateVolatileSchema(schema.sKey, [...path3, "<key>"], true, seen);
  if (schema.inner && (schema.type !== "lazy" || schema.inner[kSchema])) validateVolatileSchema(schema.inner, [...path3, "*"], true, seen);
  if (schema.list) for (let index = 0; index < schema.list.length; index++) validateVolatileSchema(schema.list[index], [...path3, String(index)], true, seen);
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
function defineMethod(name, keys, format) {
  formatters[name] = format;
  Object.assign(Schema, { [name](...args) {
    const schema = new Schema({ type: name });
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
    if (name === "object" || name === "dict") schema.meta.default = {};
    else if (name === "array" || name === "tuple") schema.meta.default = [];
    else if (name === "bitset") schema.meta.default = 0;
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

// src/host/config.ts
var Config = Schema.object({
  autoIsolate: Schema.boolean().default(false).volatile(),
  autoBaseline: Schema.union(["current", "default"]).default("current").volatile(),
  agentTool: Schema.boolean().default(false).volatile()
});
function effectiveConfig(config) {
  return {
    autoIsolate: config?.autoIsolate?.get() ?? false,
    autoBaseline: config?.autoBaseline?.get() ?? "current",
    agentTool: config?.agentTool?.get() ?? false
  };
}

// src/host/git-service.ts
import { existsSync } from "node:fs";
import { mkdir, realpath } from "node:fs/promises";
import { resolve as resolve2, sep as sep2 } from "node:path";

// src/host/git-runner.ts
var OUTPUT_CAP_BYTES = 1 << 20;
function subprocessRunner(ctx, options = {}) {
  const spawnArgv = options.spawnArgv ?? ((argv) => ["git", ...argv]);
  const degrade = options.failureMode === "degrade";
  const errorTag = options.errorTag ?? "git";
  const failure = (prefix, error) => ({
    exitCode: 127,
    stdout: "",
    stderr: prefix + (error instanceof Error ? error.message : String(error))
  });
  return {
    async run(argv, cwd, signal) {
      signal?.throwIfAborted();
      const spec = {
        argv: spawnArgv(argv),
        cwd,
        stdio: {
          stdin: "ignore",
          stdout: { maxBytes: OUTPUT_CAP_BYTES },
          stderr: { maxBytes: OUTPUT_CAP_BYTES }
        },
        graceMs: 1e4,
        signal
      };
      if (degrade) {
        let handle2;
        try {
          handle2 = ctx.subprocess.spawn(spec);
        } catch (error) {
          signal?.throwIfAborted();
          console.error("[" + errorTag + "] git spawn failed:", error);
          return failure("git: spawn failed: ", error);
        }
        try {
          const outcome2 = await handle2.done;
          signal?.throwIfAborted();
          const stdout2 = handle2.collected.stdout?.readFrom(0).text ?? "";
          const stderr2 = handle2.collected.stderr?.readFrom(0).text ?? "";
          return { exitCode: outcome2.exitCode, stdout: stdout2, stderr: stderr2 };
        } catch (error) {
          signal?.throwIfAborted();
          console.error("[" + errorTag + "] git run failed:", error);
          return failure("git: run failed: ", error);
        }
      }
      const handle = ctx.subprocess.spawn(spec);
      const outcome = await handle.done;
      signal?.throwIfAborted();
      const stdout = handle.collected.stdout?.readFrom(0).text ?? "";
      const stderr = handle.collected.stderr?.readFrom(0).text ?? "";
      return { exitCode: outcome.exitCode, stdout, stderr };
    }
  };
}

// src/core/git-command.ts
var topLevelArgv = () => ["rev-parse", "--show-toplevel"];
var headBranchArgv = () => ["rev-parse", "--abbrev-ref", "HEAD"];
var headShortArgv = () => ["rev-parse", "--short", "HEAD"];
var forEachRefArgv = () => [
  "for-each-ref",
  "refs/heads",
  "--format=%(refname:short)%00%(HEAD)%00%(objectname)"
];
var statusPorcelainArgv = () => ["status", "--porcelain"];
var unmergedArgv = () => ["diff", "--name-only", "--diff-filter=U"];
var worktreeListArgv = () => ["worktree", "list", "--porcelain"];
var worktreeAddArgv = (path3, branch, baseRef) => [
  "worktree",
  "add",
  "-b",
  branch,
  path3,
  baseRef
];
var worktreeRemoveArgv = (path3, force) => force ? ["worktree", "remove", "--force", path3] : ["worktree", "remove", path3];
var branchDeleteForceArgv = (name) => ["branch", "-D", name];
var verifyRevArgv = (rev) => ["rev-parse", "--verify", "--quiet", rev];
var WORKTREE_BRANCH_PREFIX = "wt/";
function sanitizeWorktreeName(raw) {
  const cleaned = raw.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/-{2,}/g, "-").replace(/^[-.]+/, "").replace(/[-.]+$/, "").slice(0, 64);
  if (cleaned === "" || cleaned === "." || cleaned === "..") return null;
  return cleaned;
}
var verifyRefArgv = (branch) => ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`];
var checkRefFormatArgv = (name) => ["check-ref-format", "--branch", name];
var switchArgv = (branch) => ["switch", "--no-guess", "--", branch];
var createBranchArgv = (name) => ["switch", "--no-guess", "-c", name];
var createBranchAtArgv = (name, base) => ["switch", "--no-guess", "-c", name, base];
var DEFAULT_BASE_CANDIDATES = ["origin/HEAD", "main", "master", "HEAD"];
var graphLogArgv = (limit) => [
  "log",
  "--branches",
  "--tags",
  "--remotes",
  "--topo-order",
  "--parents",
  "--format=%H%x00%P%x00%an%x00%at%x00%D%x00%s%x1e",
  "--max-count",
  String(limit)
];
var OPERATION_MARKERS = [
  "MERGE_HEAD",
  "CHERRY_PICK_HEAD",
  "REVERT_HEAD",
  "BISECT_LOG",
  "rebase-merge",
  "rebase-apply",
  "sequencer"
];
var gitPathArgv = (marker) => ["rev-parse", "--git-path", marker];
var operationMarkersArgv = () => [
  "rev-parse",
  ...OPERATION_MARKERS.flatMap((marker) => ["--git-path", marker])
];
var OVERWRITE_PATTERNS = [
  {
    code: "tracked-changes-would-be-overwritten",
    header: /Your local changes to the following files would be overwritten by checkout/
  },
  {
    code: "untracked-changes-would-be-overwritten",
    header: /The following untracked working tree files would be overwritten by checkout/
  },
  {
    code: "tracked-changes-would-be-overwritten",
    header: /Your local changes to the following files would be overwritten by merge/
  }
];
var gitPathEncoder = new TextEncoder();
var gitPathDecoder = new TextDecoder();
var GIT_SIMPLE_ESCAPES = { a: 7, b: 8, f: 12, n: 10, r: 13, t: 9, v: 11 };
function decodeGitQuoted(input) {
  if (!input.includes("\\")) return input;
  const bytes = [];
  const pattern2 = /\\(?:([0-7]{3})|([\s\S]))/g;
  let index = 0;
  let match;
  while ((match = pattern2.exec(input)) !== null) {
    bytes.push(...gitPathEncoder.encode(input.slice(index, match.index)));
    const octal = match[1];
    if (octal !== void 0) {
      bytes.push(Number.parseInt(octal, 8) & 255);
    } else {
      const escaped = match[2];
      const control = GIT_SIMPLE_ESCAPES[escaped];
      if (control === void 0) bytes.push(...gitPathEncoder.encode(escaped));
      else bytes.push(control);
    }
    index = match.index + match[0].length;
  }
  bytes.push(...gitPathEncoder.encode(input.slice(index)));
  return gitPathDecoder.decode(new Uint8Array(bytes));
}
function extractBlockedPaths(stderr, header) {
  const start = stderr.indexOf("\n", stderr.search(header));
  if (start === -1) return { paths: [], moreFiles: 0 };
  const paths = [];
  for (const line of stderr.slice(start + 1).split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || !line.startsWith("	")) break;
    const quoted = /^"(.+)"$/.exec(trimmed);
    const path3 = quoted === null ? decodeGitQuoted(trimmed) : decodeGitQuoted(quoted[1] ?? "");
    paths.push(path3);
  }
  return { paths: paths.slice(0, 2), moreFiles: Math.max(0, paths.length - 2) };
}
function classifySwitchFailure(stderr) {
  const head = stderr.trim().split("\n")[0] ?? stderr;
  for (const pattern2 of OVERWRITE_PATTERNS) {
    if (pattern2.header.test(stderr)) {
      const { paths, moreFiles } = extractBlockedPaths(stderr, pattern2.header);
      return { code: pattern2.code, message: head, paths, moreFiles };
    }
  }
  if (/did not match any file\(s\) known to git|invalid reference|not a valid branch/.test(stderr)) {
    return { code: "target-branch-not-found", message: head };
  }
  if (/already used by worktree|is already checked out at/.test(stderr)) {
    return { code: "branch-in-other-worktree", message: head };
  }
  if (/local changes to the following files would be overwritten/.test(stderr)) {
    return { code: "tracked-changes-would-be-overwritten", message: head };
  }
  return { code: "internal", message: head || "git switch failed" };
}
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

// src/core/types.ts
function parseBranches(stdout) {
  const rows = [];
  for (const line of stdout.split("\n")) {
    if (line === "") continue;
    const [name, head, oid] = line.split("\0");
    if (name === void 0 || head === void 0 || oid === void 0) continue;
    rows.push({ name, current: head === "*" });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}
function parseWorktreeBranches(stdout) {
  const branches = [];
  for (const line of stdout.split("\n")) {
    if (!line.startsWith("branch refs/heads/")) continue;
    const name = line.slice("branch refs/heads/".length).trim();
    if (name !== "" && !branches.includes(name)) branches.push(name);
  }
  return branches;
}
function parseWorktrees(stdout) {
  const rows = [];
  let current = null;
  const flush = () => {
    if (current === null || current.path === void 0) return;
    rows.push({
      path: current.path,
      head: current.head ?? "",
      branch: current.branch ?? "",
      main: rows.length === 0
    });
  };
  for (const line of stdout.split("\n")) {
    if (line === "") {
      flush();
      current = null;
      continue;
    }
    if (line.startsWith("worktree ")) {
      flush();
      current = { path: line.slice("worktree ".length).trim() };
      continue;
    }
    if (current === null) continue;
    if (line.startsWith("HEAD ")) current.head = line.slice("HEAD ".length).trim();
    else if (line.startsWith("branch refs/heads/")) current.branch = line.slice("branch refs/heads/".length).trim();
  }
  flush();
  return rows;
}
function parsePorcelain(stdout) {
  let dirtyFiles = 0;
  let untrackedFiles = 0;
  let conflicts = 0;
  const unmerged = /* @__PURE__ */ new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]);
  for (const line of stdout.split("\n")) {
    if (line === "") continue;
    const xy = line.slice(0, 2);
    if (unmerged.has(xy)) conflicts += 1;
    else if (xy.startsWith("??")) untrackedFiles += 1;
    else dirtyFiles += 1;
  }
  return { dirtyFiles, untrackedFiles, conflicts };
}
function parseGraph(stdout) {
  const commits = [];
  for (const raw of stdout.split("")) {
    const entry = raw.replace(/^\n/, "");
    if (entry === "") continue;
    const [oid, parentsRaw, author, authorTimeRaw, decoration, subject] = entry.split("\0");
    if (oid === void 0 || oid === "") continue;
    commits.push({
      oid,
      parents: parentsRaw === void 0 || parentsRaw === "" ? [] : parentsRaw.split(" "),
      subject: subject ?? "",
      author: author ?? "",
      authorTime: Number(authorTimeRaw ?? "0"),
      refs: parseDecoration(decoration ?? "")
    });
  }
  return commits;
}
function parseDecoration(decoration) {
  if (decoration === "") return [];
  return decoration.split(", ").map((part) => {
    if (part === "HEAD") return "";
    let name = part.replace(/^HEAD -> /, "").replace(/^tag: /, "");
    return name.trim();
  }).filter((name) => name !== "");
}
function isRepoStatus(value) {
  if (typeof value !== "object" || value === null) return false;
  const record = value;
  return typeof record.root === "string" && typeof record.branch === "string" && typeof record.head === "string" && typeof record.dirtyFiles === "number" && typeof record.untrackedFiles === "number" && typeof record.conflicts === "number" && typeof record.operationInProgress === "boolean";
}
function isBranchRow(value) {
  if (typeof value !== "object" || value === null) return false;
  const record = value;
  return typeof record.name === "string" && typeof record.current === "boolean";
}
function isBranchesView(value) {
  if (typeof value !== "object" || value === null) return false;
  const record = value;
  return typeof record.root === "string" && typeof record.branch === "string" && Array.isArray(record.branches) && record.branches.every(isBranchRow) && typeof record.dirtyFiles === "number" && typeof record.untrackedFiles === "number" && typeof record.conflicts === "number" && typeof record.operationInProgress === "boolean";
}
function isGraphCommit(value) {
  if (typeof value !== "object" || value === null) return false;
  const record = value;
  return typeof record.oid === "string" && Array.isArray(record.parents) && record.parents.every((parent) => typeof parent === "string") && typeof record.subject === "string" && typeof record.author === "string" && typeof record.authorTime === "number" && Array.isArray(record.refs) && record.refs.every((ref) => typeof ref === "string");
}
function isGraphView(value) {
  if (typeof value !== "object" || value === null) return false;
  const record = value;
  return typeof record.root === "string" && typeof record.branch === "string" && Array.isArray(record.commits) && record.commits.every(isGraphCommit) && typeof record.hasMore === "boolean";
}
var GIT_ERROR_CODES = /* @__PURE__ */ new Set([
  "conflicts-present",
  "operation-in-progress",
  "branch-in-other-worktree",
  "tracked-changes-would-be-overwritten",
  "untracked-changes-would-be-overwritten",
  "target-branch-not-found",
  "invalid-branch-name",
  "branch-already-exists",
  "workspace-unknown",
  "invalid-worktree-name",
  "worktree-already-exists",
  "worktree-dirty",
  "worktree-not-found",
  "worktree-is-main",
  "base-ref-not-found",
  "internal"
]);
function isWorktreeInfo(value) {
  if (typeof value !== "object" || value === null) return false;
  const record = value;
  return typeof record.path === "string" && typeof record.head === "string" && typeof record.branch === "string" && typeof record.main === "boolean";
}
function isWorktreeListView(value) {
  if (typeof value !== "object" || value === null) return false;
  const record = value;
  return typeof record.root === "string" && Array.isArray(record.worktrees) && record.worktrees.every(isWorktreeInfo);
}
function isGitFeatureConfig(value) {
  if (typeof value !== "object" || value === null) return false;
  const record = value;
  return typeof record.autoIsolate === "boolean" && (record.autoBaseline === "current" || record.autoBaseline === "default") && typeof record.worktreesHome === "string";
}
function isGitErrorCode(value) {
  return typeof value === "string" && GIT_ERROR_CODES.has(value);
}
function isGitError(value) {
  if (typeof value !== "object" || value === null) return false;
  const record = value;
  if (!isGitErrorCode(record.code)) return false;
  if (typeof record.message !== "string") return false;
  if (record.paths !== void 0 && (!Array.isArray(record.paths) || !record.paths.every((path3) => typeof path3 === "string"))) {
    return false;
  }
  if (record.moreFiles !== void 0 && typeof record.moreFiles !== "number") return false;
  return true;
}
function isRepoRef(value) {
  if (typeof value !== "object" || value === null) return false;
  const record = value;
  return typeof record.path === "string" && typeof record.name === "string" && typeof record.primary === "boolean";
}
function isRepoStatusRow(value) {
  if (typeof value !== "object" || value === null) return false;
  const record = value;
  if (!isRepoRef(record.repo)) return false;
  return record.status === null || isRepoStatus(record.status);
}
function isReposView(value) {
  if (typeof value !== "object" || value === null) return false;
  const record = value;
  return typeof record.workspaceRoot === "string" && Array.isArray(record.repos) && record.repos.every(isRepoStatusRow);
}
var GROUP_OUTCOMES = /* @__PURE__ */ new Set(["ok", "skipped", "failed", "not-run"]);
function isGroupOutcome(value) {
  return typeof value === "string" && GROUP_OUTCOMES.has(value);
}
function isGroupRepoResult(value) {
  if (typeof value !== "object" || value === null) return false;
  const record = value;
  if (!isRepoRef(record.repo)) return false;
  if (!isGroupOutcome(record.outcome)) return false;
  return record.error === void 0 || isGitError(record.error);
}
function isGroupResultView(value) {
  if (typeof value !== "object" || value === null) return false;
  const record = value;
  return (record.action === "switch" || record.action === "create") && typeof record.branch === "string" && Array.isArray(record.results) && record.results.every(isGroupRepoResult);
}
function isGroupBase(value) {
  return value === "mainline" || value === "head";
}

// src/host/repo-scan.ts
import { readdir } from "node:fs/promises";
import path from "node:path";
var DEFAULT_MAX_DEPTH = 3;
var DEFAULT_MAX_DIRS = 500;
var DEFAULT_SKIP_DIRS = ["node_modules", "target", "dist", "build", "out"];
async function scanRepos(root, options = {}) {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxDirs = options.maxDirs ?? DEFAULT_MAX_DIRS;
  const skipDirs = new Set(options.skipDirs ?? DEFAULT_SKIP_DIRS);
  const found = [];
  let visited = 0;
  const pending = [{ dir: root, depth: 0 }];
  while (pending.length > 0 && visited < maxDirs) {
    const current = pending.pop();
    if (current === void 0) break;
    visited += 1;
    const entries = await readEntries(current.dir);
    if (entries === null) continue;
    if (entries.some((entry) => entry.name === ".git")) {
      found.push(repoRef(root, current.dir));
      if (current.dir !== root) continue;
    }
    if (current.depth >= maxDepth) continue;
    const children = entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && !skipDirs.has(entry.name)).map((entry) => entry.name).sort();
    for (const name of children.reverse()) {
      pending.push({ dir: path.join(current.dir, name), depth: current.depth + 1 });
    }
  }
  return sortRepos(found);
}
async function readEntries(dir) {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }
}
function repoRef(root, dir) {
  if (dir === root) return { path: dir, name: path.basename(root), primary: true };
  return {
    path: dir,
    name: path.relative(root, dir).split(path.sep).join("/"),
    primary: false
  };
}
function sortRepos(repos) {
  return repos.sort((a, b) => {
    if (a.primary !== b.primary) return a.primary ? -1 : 1;
    if (a.name === b.name) return 0;
    return a.name < b.name ? -1 : 1;
  });
}

// src/host/worktree-home.ts
import { createHash } from "node:crypto";
import { basename, join as join2, sep } from "node:path";

// src/host/dsh-home.ts
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { isAbsolute as posixIsAbsolute, join as posixJoin } from "node:path/posix";
function expandHome(path3, home = homedir()) {
  const isPosix = home.startsWith("/");
  const j = isPosix ? posixJoin : join;
  if (path3 === "~") return home;
  if (path3.startsWith("~/") || path3.startsWith("~\\")) return j(home, path3.slice(2));
  return path3;
}
function resolveDshHome(env = process.env, home = homedir()) {
  const isPosix = home.startsWith("/");
  const j = isPosix ? posixJoin : join;
  const isAbs = isPosix ? posixIsAbsolute : isAbsolute;
  const raw = env.DSH_HOME;
  if (raw !== void 0 && raw.trim() !== "") {
    const expanded = expandHome(raw.trim(), home);
    return isAbs(expanded) ? expanded : j(process.cwd(), expanded);
  }
  return j(home, ".dsh");
}
function dshHome() {
  return resolveDshHome();
}

// src/host/worktree-home.ts
function worktreesHome() {
  return join2(dshHome(), "worktrees");
}
function repoKeyFor(root) {
  const base = sanitizeWorktreeName(basename(root)) ?? "repo";
  const hash = createHash("sha1").update(root).digest("hex").slice(0, 8);
  return `${base}-${hash}`;
}
function worktreePathFor(root, name) {
  return join2(worktreesHome(), repoKeyFor(root), name);
}
function repoWorktreesDir(root) {
  return join2(worktreesHome(), repoKeyFor(root));
}
function isManagedWorktreeOf(dir, candidate) {
  if (!candidate.startsWith(dir + sep)) return false;
  return !candidate.slice(dir.length + 1).includes(sep);
}

// src/host/git-service.ts
function gitSpawnArgv(platform, argv) {
  return platform === "win32" ? ["git.exe", ...argv] : ["git", ...argv];
}
function buildWorkspaceGate(registry) {
  return async (path3) => {
    let canonical;
    try {
      canonical = await realpath(path3);
    } catch {
      return { ok: false, error: { code: "workspace-unknown", message: "path does not resolve on disk" } };
    }
    const workspaceRoot = longestWorkspaceRoot(canonical, registry.list().map((workspace) => workspace.path));
    if (workspaceRoot === null) {
      return { ok: false, error: { code: "workspace-unknown", message: "path is not a registered workspace" } };
    }
    return { ok: true, canonical, workspaceRoot };
  };
}
function longestWorkspaceRoot(canonical, roots) {
  let best = null;
  for (const root of roots) {
    if (root === "" || !isWithin(root, canonical)) continue;
    if (best === null || root.length > best.length) best = root;
  }
  return best;
}
function isWithin(root, candidate) {
  if (candidate === root) return true;
  return candidate.startsWith(root.endsWith(sep2) ? root : root + sep2);
}
function subprocessRunner2(ctx) {
  return subprocessRunner(ctx, { spawnArgv: (argv) => gitSpawnArgv(process.platform, argv) });
}
var DETACHED = "HEAD";
var REPO_OUTSIDE_WORKSPACE = {
  code: "workspace-unknown",
  message: "repository top level is outside the workspace"
};
var GitService = class {
  /**
   * @param runner - the spawn seam.
   * @param gate - workspace-membership gate (host: canonical path ∈ registered workspace paths or below one).
   */
  constructor(runner, gate) {
    this.runner = runner;
    this.gate = gate;
  }
  /** Status work currently running for each requested workspace path. */
  statusFlights = /* @__PURE__ */ new Map();
  /**
   * Resolve the repository behind one requested path, fenced to the gated
   * workspace: the path itself must pass the gate, the repository top level
   * (`git rev-parse --show-toplevel`) must realpath, and that canonical top
   * level must still live in the very workspace the gate matched. A workspace
   * subdirectory that actually belongs to an outside checkout (a repository
   * above the workspace, a symlinked tree) is therefore rejected instead of
   * being operated on. Reads map `ok: false` onto `null`; mutations return the
   * rejection.
   * @param path - the browser-supplied path.
   * @param signal - optional abort signal for the resolving spawn.
   * @returns the canonical repository root plus its workspace root, or the rejection.
   */
  async gatedRepoRoot(path3, signal) {
    const gated = await this.gate(path3);
    if (!gated.ok) return { ok: false, error: gated.error };
    const root = await this.repoRoot(gated.canonical, signal);
    if (root === null) return { ok: false, error: { code: "internal", message: "not a git repository" } };
    let canonicalTop;
    try {
      canonicalTop = await realpath(root);
    } catch {
      return { ok: false, error: { code: "internal", message: "repository root does not resolve on disk" } };
    }
    if (!isWithin(gated.workspaceRoot, canonicalTop)) {
      return { ok: false, error: REPO_OUTSIDE_WORKSPACE };
    }
    return { ok: true, root: canonicalTop, workspaceRoot: gated.workspaceRoot };
  }
  /**
   * The plumbing every read view shares once the repository root is known:
   * the current branch plus the porcelain counts and the operation marker.
   * @param root - the canonical repository root.
   * @param signal - optional abort signal for the read spawns.
   */
  async snapshotAt(root, signal) {
    const [branchResult, porcelain] = await Promise.all([
      this.runner.run(headBranchArgv(), root, signal),
      this.runner.run(statusPorcelainArgv(), root, signal)
    ]);
    const branch = branchResult.stdout.trim();
    return {
      root,
      branch: branch === DETACHED ? "" : branch,
      counts: parsePorcelain(porcelain.stdout),
      operationInProgress: await this.operationInProgress(root, signal)
    };
  }
  /** Full status of one already-resolved repository root. */
  async statusAt(root, signal) {
    const snap = await this.snapshotAt(root, signal);
    const headResult = await this.runner.run(headShortArgv(), root, signal);
    return {
      root: snap.root,
      branch: snap.branch,
      head: headResult.stdout.trim(),
      dirtyFiles: snap.counts.dirtyFiles,
      untrackedFiles: snap.counts.untrackedFiles,
      conflicts: snap.counts.conflicts,
      operationInProgress: snap.operationInProgress
    };
  }
  /**
   * The repository snapshot the branch chip renders; null when not a repository.
   * Concurrent reads for the same requested workspace share one underlying
   * status task until it settles, preventing timed-out polls from accumulating.
   */
  status(path3, signal) {
    const existing = this.statusFlights.get(path3);
    if (existing !== void 0) return existing;
    const flight = this.statusFromPath(path3, signal);
    this.statusFlights.set(path3, flight);
    const clear = () => {
      if (this.statusFlights.get(path3) === flight) this.statusFlights.delete(path3);
    };
    void flight.then(clear, clear);
    return flight;
  }
  async statusFromPath(path3, signal) {
    const resolved = await this.gatedRepoRoot(path3, signal);
    if (!resolved.ok) return null;
    return await this.statusAt(resolved.root, signal);
  }
  /** Local branch list with the current branch marked (git for-each-ref refs/heads). */
  async branches(path3) {
    const resolved = await this.gatedRepoRoot(path3);
    if (!resolved.ok) return null;
    const snap = await this.snapshotAt(resolved.root);
    const refs = await this.runner.run(forEachRefArgv(), snap.root);
    return {
      root: snap.root,
      branch: snap.branch,
      branches: parseBranches(refs.stdout),
      dirtyFiles: snap.counts.dirtyFiles,
      untrackedFiles: snap.counts.untrackedFiles,
      conflicts: snap.counts.conflicts,
      operationInProgress: snap.operationInProgress
    };
  }
  /**
   * Enumerate every repository of the gated workspace with its status in one
   * aggregate read: the scan runs against the WORKSPACE ROOT the gate matched
   * (never the requested subdirectory), and each row's status is fetched
   * concurrently. A row whose directory stopped being a usable repository —
   * or whose status read fails — reports `status: null` instead of failing the
   * whole view.
   * @param path - any path inside the workspace (the workspace root in practice).
   * @param signal - optional abort signal for the per-repository reads.
   * @returns the overview, or null when the path is outside every workspace.
   */
  async repos(path3, signal) {
    const gated = await this.gate(path3);
    if (!gated.ok) return null;
    const refs = await scanRepos(gated.workspaceRoot);
    const repos = await Promise.all(refs.map(async (repo) => ({
      repo,
      status: await this.statusOfRepo(repo, gated.workspaceRoot, signal)
    })));
    return { workspaceRoot: gated.workspaceRoot, repos };
  }
  /**
   * Status of one scanned repository, re-probing usability first: the entry may
   * have stopped being a repository between the scan and this read, and its own
   * top level must still resolve inside the workspace root. Any failure maps
   * onto `null` (the row is reported unavailable, never fatal).
   * @param repo - the scanned row.
   * @param workspaceRoot - the gated workspace root the scan ran against.
   * @param signal - optional abort signal for the read spawns.
   */
  async statusOfRepo(repo, workspaceRoot, signal) {
    try {
      const probe = await this.runner.run(topLevelArgv(), repo.path, signal);
      if (probe.exitCode !== 0) return null;
      const top = probe.stdout.trim();
      if (top === "") return null;
      const canonicalTop = await realpath(top);
      if (!isWithin(workspaceRoot, canonicalTop)) return null;
      return await this.statusAt(canonicalTop, signal);
    } catch {
      return null;
    }
  }
  /**
   * Switch the workspace's checked-out branch: real `git switch --no-guess`
   * on disk, affecting every session in the workspace (never a per-session
   * override). Guards run before the mutation; switch failures classify onto
   * the stable error codes.
   * @param path - any path inside the workspace.
   * @param branch - existing local branch name.
   */
  async switchBranch(path3, branch) {
    const resolved = await this.gatedRepoRoot(path3);
    if (!resolved.ok) return { ok: false, error: resolved.error };
    const root = resolved.root;
    const formatted = await this.runner.run(checkRefFormatArgv(branch), root);
    if (formatted.exitCode !== 0) {
      return { ok: false, error: { code: "invalid-branch-name", message: formatted.stderr.trim() || "invalid branch name" } };
    }
    const verified = await this.runner.run(verifyRefArgv(branch), root);
    if (verified.exitCode !== 0) {
      return { ok: false, error: { code: "target-branch-not-found", message: `branch "${branch}" does not exist locally` } };
    }
    const currentResult = await this.runner.run(headBranchArgv(), root);
    const current = currentResult.stdout.trim();
    if (current === branch) return { ok: true, branch };
    const blocked = await this.guardBlock(root, branch);
    if (blocked !== null) return { ok: false, error: blocked };
    const switched = await this.runner.run(switchArgv(branch), root);
    if (switched.exitCode === 0) return { ok: true, branch };
    return { ok: false, error: classifySwitchFailure(switched.stderr) };
  }
  /**
   * Create a branch and switch to it. Without `base` the branch starts at the
   * checkout's current HEAD (`git switch --no-guess -c <name>`); with a base
   * the revision is verified first and then used as the start point
   * (`git switch --no-guess -c <name> <base>`). The authoritative name gate is
   * `git check-ref-format --branch`; duplicates and unresolvable bases are
   * rejected up front, and the pre-switch guards run before the mutation.
   * @param path - any path inside the workspace.
   * @param name - proposed branch name.
   * @param base - start-point revision; undefined (or blank) means the current HEAD.
   */
  async createBranchAt(path3, name, base) {
    const mirrorReason = validateBranchName(name);
    if (mirrorReason !== null) {
      return { ok: false, error: { code: "invalid-branch-name", message: `invalid branch name: ${mirrorReason}` } };
    }
    const resolved = await this.gatedRepoRoot(path3);
    if (!resolved.ok) return { ok: false, error: resolved.error };
    const root = resolved.root;
    const formatted = await this.runner.run(checkRefFormatArgv(name), root);
    if (formatted.exitCode !== 0) {
      return { ok: false, error: { code: "invalid-branch-name", message: formatted.stderr.trim() || "invalid branch name" } };
    }
    const exists = await this.runner.run(verifyRefArgv(name), root);
    if (exists.exitCode === 0) {
      return { ok: false, error: { code: "branch-already-exists", message: `branch "${name}" already exists` } };
    }
    const baseRef = base === void 0 || base.trim() === "" ? void 0 : base.trim();
    if (baseRef !== void 0) {
      const verifiedBase = await this.runner.run(verifyRevArgv(baseRef), root);
      if (verifiedBase.exitCode !== 0) {
        return { ok: false, error: { code: "base-ref-not-found", message: `base ref "${baseRef}" does not resolve` } };
      }
    }
    const blocked = await this.guardBlock(root, void 0);
    if (blocked !== null) return { ok: false, error: blocked };
    const created = await this.runner.run(
      baseRef === void 0 ? createBranchArgv(name) : createBranchAtArgv(name, baseRef),
      root
    );
    if (created.exitCode === 0) return { ok: true, branch: name };
    return { ok: false, error: classifySwitchFailure(created.stderr) };
  }
  /**
   * Create a branch from the current HEAD and switch to it. The two-argument
   * form the routes call; identical to `createBranchAt(path, name, undefined)`.
   * @param path - any path inside the workspace.
   * @param name - proposed branch name.
   */
  async createBranch(path3, name) {
    return await this.createBranchAt(path3, name, void 0);
  }
  /**
   * The pre-mutation guard verdict for one repository, exposed so a group
   * operation can run every participant's guards before touching any of them.
   *
   * A repository already on the target branch has nothing to switch, so it
   * passes regardless of its worktree list — the very same short-circuit
   * {@link switchBranch} applies (`current === branch` → ok). Without it,
   * `parseWorktreeBranches` would report the checkout's OWN primary
   * `branch refs/heads/<target>` and reject the repository as
   * `branch-in-other-worktree`, which the group preflight would then escalate
   * into "no repository moves at all". A detached HEAD ('HEAD') never equals a
   * branch name, so it still runs the guards.
   * @param path - any path inside the workspace.
   * @param target - target branch; undefined for create (worktree check skipped).
   * @returns the rejection, or null when the mutation may proceed.
   */
  async preflight(path3, target) {
    const resolved = await this.gatedRepoRoot(path3);
    if (!resolved.ok) return resolved.error;
    if (target !== void 0) {
      const currentResult = await this.runner.run(headBranchArgv(), resolved.root);
      const current = currentResult.stdout.trim();
      if (current !== DETACHED && current === target) return null;
    }
    return await this.guardBlock(resolved.root, target);
  }
  /**
   * The repository's default mainline ref name, probed in the host's fixed
   * order (`origin/HEAD` → `main` → `master` → `HEAD`) with a quiet
   * `git rev-parse --verify --quiet` per candidate.
   * @param path - any path inside the workspace.
   * @returns the first resolvable ref name, or null when none resolves.
   */
  async defaultBase(path3) {
    const resolved = await this.gatedRepoRoot(path3);
    if (!resolved.ok) return null;
    for (const candidate of DEFAULT_BASE_CANDIDATES) {
      const verified = await this.runner.run(verifyRevArgv(candidate), resolved.root);
      if (verified.exitCode === 0) return candidate;
    }
    return null;
  }
  /** Topo-ordered commit graph across branches/tags/remotes (read-only). */
  async graph(path3, limit = 200) {
    const resolved = await this.gatedRepoRoot(path3);
    if (!resolved.ok) return null;
    const root = resolved.root;
    const [logResult, branchResult] = await Promise.all([
      this.runner.run(graphLogArgv(limit + 1), root),
      this.runner.run(headBranchArgv(), root)
    ]);
    const commits = parseGraph(logResult.stdout);
    const hasMore = commits.length > limit;
    const branch = branchResult.stdout.trim();
    return {
      root,
      branch: branch === DETACHED ? "" : branch,
      commits: hasMore ? commits.slice(0, limit) : commits,
      hasMore
    };
  }
  /** All linked worktrees of the workspace's repository (read-only). */
  async worktrees(path3, signal) {
    const resolved = await this.gatedRepoRoot(path3, signal);
    if (!resolved.ok) return null;
    const root = resolved.root;
    const result = await this.runner.run(worktreeListArgv(), root, signal);
    if (result.exitCode !== 0) return null;
    return { root, worktrees: parseWorktrees(result.stdout) };
  }
  /**
   * Create a managed worktree: `git worktree add -b wt/<name> <target> <baseRef>`
   * under $DSH_HOME/worktrees/<repo-key>/<name>/. The target path is ALWAYS
   * host-constructed (the caller supplies only a name, never a path), and the
   * worktree always checks out a NEW wt/ branch — git allows one branch in
   * one checkout, so reusing the base branch would break the main checkout.
   * @param path - workspace root.
   * @param rawName - proposed worktree name (sanitized; collisions reject).
   * @param baseRef - base revision; omitted means the checkout's current HEAD,
   *   and an unresolvable 'origin/HEAD' falls back to HEAD (no remote).
   */
  async addWorktree(path3, rawName, baseRef) {
    const name = sanitizeWorktreeName(rawName);
    if (name === null) {
      return { ok: false, error: { code: "invalid-worktree-name", message: `invalid worktree name: ${JSON.stringify(rawName)}` } };
    }
    const resolved = await this.gatedRepoRoot(path3);
    if (!resolved.ok) return { ok: false, error: resolved.error };
    const root = resolved.root;
    const branch = WORKTREE_BRANCH_PREFIX + name;
    const formatted = await this.runner.run(checkRefFormatArgv(branch), root);
    if (formatted.exitCode !== 0) {
      return { ok: false, error: { code: "invalid-worktree-name", message: formatted.stderr.trim() || "invalid worktree name" } };
    }
    const branchExists = await this.runner.run(verifyRefArgv(branch), root);
    if (branchExists.exitCode === 0) {
      return { ok: false, error: { code: "worktree-already-exists", message: `branch "${branch}" already exists` } };
    }
    const target = worktreePathFor(root, name);
    if (existsSync(target)) {
      return { ok: false, error: { code: "worktree-already-exists", message: `worktree path already exists: ${target}` } };
    }
    let base = baseRef === void 0 || baseRef.trim() === "" ? "HEAD" : baseRef.trim();
    const verified = await this.runner.run(verifyRevArgv(base), root);
    if (verified.exitCode !== 0) {
      if (base === "origin/HEAD") {
        base = "HEAD";
      } else {
        return { ok: false, error: { code: "base-ref-not-found", message: `base ref "${base}" does not resolve` } };
      }
    }
    if (await this.operationInProgress(root)) {
      return { ok: false, error: { code: "operation-in-progress", message: "a git operation is in progress" } };
    }
    await mkdir(repoWorktreesDir(root), { recursive: true });
    const added = await this.runner.run(worktreeAddArgv(target, branch, base), root);
    if (added.exitCode === 0) return { ok: true, path: target, branch, name };
    return { ok: false, error: classifySwitchFailure(added.stderr) };
  }
  /**
   * Remove a managed worktree. Containment is enforced twice: the canonical
   * target must be a direct child of the repository's managed directory, and
   * it must appear in `git worktree list`. A dirty worktree (or one with an
   * in-progress operation) rejects unless force is set; deleteBranch removes
   * the wt/ branch afterwards and only ever applies to that prefix.
   * @param path - workspace root.
   * @param worktreePath - the worktree to remove (any spelling; canonicalized here).
   * @param opts - force overrides the dirtiness guard; deleteBranch drops the wt/ branch.
   */
  async removeWorktree(path3, worktreePath, opts = {}) {
    const resolved = await this.gatedRepoRoot(path3);
    if (!resolved.ok) return { ok: false, error: resolved.error };
    const root = resolved.root;
    let canonical;
    try {
      canonical = await realpath(worktreePath);
    } catch {
      return { ok: false, error: { code: "worktree-not-found", message: `worktree path does not resolve: ${worktreePath}` } };
    }
    let canonicalHome;
    try {
      canonicalHome = await realpath(repoWorktreesDir(root));
    } catch {
      return { ok: false, error: { code: "worktree-not-found", message: "this repository has no managed worktree directory" } };
    }
    if (!isManagedWorktreeOf(canonicalHome, canonical)) {
      return { ok: false, error: { code: "worktree-not-found", message: "not a managed worktree of this repository" } };
    }
    const listed = await this.runner.run(worktreeListArgv(), root);
    let entry;
    for (const item of parseWorktrees(listed.stdout)) {
      try {
        if (await realpath(item.path) === canonical) {
          entry = item;
          break;
        }
      } catch {
      }
    }
    if (entry === void 0) {
      return { ok: false, error: { code: "worktree-not-found", message: `git does not list ${canonical} as a worktree` } };
    }
    if (entry.main) {
      return { ok: false, error: { code: "worktree-is-main", message: "the primary checkout cannot be removed" } };
    }
    if (opts.force !== true) {
      const porcelain = await this.runner.run(statusPorcelainArgv(), canonical);
      const counts = parsePorcelain(porcelain.stdout);
      if (counts.dirtyFiles + counts.untrackedFiles + counts.conflicts > 0) {
        return { ok: false, error: { code: "worktree-dirty", message: "the worktree has uncommitted changes" } };
      }
      if (await this.operationInProgress(canonical)) {
        return { ok: false, error: { code: "operation-in-progress", message: "a git operation is in progress in the worktree" } };
      }
    }
    const removed = await this.runner.run(worktreeRemoveArgv(canonical, opts.force === true), root);
    if (removed.exitCode !== 0) {
      return { ok: false, error: { code: "internal", message: removed.stderr.trim() || "git worktree remove failed" } };
    }
    if (opts.deleteBranch === true && entry.branch.startsWith(WORKTREE_BRANCH_PREFIX)) {
      await this.runner.run(branchDeleteForceArgv(entry.branch), root);
    }
    return { ok: true };
  }
  /** Repository root of a canonical path, or null when not inside a git repository. */
  async repoRoot(path3, signal) {
    const result = await this.runner.run(topLevelArgv(), path3, signal);
    if (result.exitCode !== 0) return null;
    const root = result.stdout.trim();
    return root === "" ? null : root;
  }
  /** Whether any git operation marker is present in the repository. */
  async operationInProgress(root, signal) {
    const resolved = await this.runner.run(operationMarkersArgv(), root, signal);
    if (resolved.exitCode === 0) {
      const markerPaths = resolved.stdout.split("\n").map((line) => line.trim()).filter((line) => line !== "");
      return markerPaths.some((markerPath) => existsSync(resolve2(root, markerPath)));
    }
    let inProgress = false;
    for (const marker of OPERATION_MARKERS) {
      const single = await this.runner.run(gitPathArgv(marker), root, signal);
      const markerPath = single.stdout.trim();
      if (markerPath !== "" && existsSync(resolve2(root, markerPath))) inProgress = true;
    }
    return inProgress;
  }
  /**
   * The pre-switch guards (ZCode branchSwitcher semantics): unresolved
   * conflicts, in-progress operations, and a target already checked out in
   * another worktree.
   * @param root - repository root.
   * @param target - target branch; undefined for create (worktree check skipped).
   * @returns the rejection, or null when the switch may proceed.
   */
  async guardBlock(root, target) {
    const [conflicts, inProgress, worktrees] = await Promise.all([
      this.runner.run(unmergedArgv(), root),
      this.operationInProgress(root),
      target === void 0 ? Promise.resolve(null) : this.runner.run(worktreeListArgv(), root)
    ]);
    const conflictCount = conflicts.stdout.split("\n").filter((line) => line !== "").length;
    if (conflictCount > 0) {
      return { code: "conflicts-present", message: `repository has ${conflictCount} unresolved conflict(s)` };
    }
    if (inProgress) {
      return { code: "operation-in-progress", message: "a git operation is in progress" };
    }
    if (target !== void 0 && worktrees !== null && parseWorktreeBranches(worktrees.stdout).includes(target)) {
      return { code: "branch-in-other-worktree", message: `branch "${target}" is checked out in another worktree` };
    }
    return null;
  }
};

// src/host/events.ts
var MAX_EVENT_PATHS = 64;
var NO_REPO_DIGEST = "no-repo";
function parseEventPaths(params) {
  const paths = [];
  const seen = /* @__PURE__ */ new Set();
  for (const value of params.getAll("path")) {
    if (value === "" || seen.has(value)) continue;
    seen.add(value);
    paths.push(value);
    if (paths.length === MAX_EVENT_PATHS) break;
  }
  return paths;
}
function pollDigestKey(status, worktreeDigest) {
  if (status === null) return NO_REPO_DIGEST;
  return `${status.root}|${status.branch}|${status.head}|wt:${worktreeDigest}`;
}
function collectChanges(previous, current) {
  const changed = [];
  for (const [path3, digest] of current) {
    if (previous.get(path3) !== digest) changed.push(path3);
  }
  return changed;
}

// src/host/poll-guard.ts
var DEFAULT_TIMERS = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => {
    clearTimeout(handle);
  }
};
var PollGuard = class {
  options;
  handle;
  running = false;
  startedAt = 0;
  stopped = false;
  failures = 0;
  /** @param options - loop bounds; interval/deadline/backoff/onRun are required, the rest optional. */
  constructor(options) {
    this.options = {
      timers: DEFAULT_TIMERS,
      onDeadline: () => {
      },
      onSettled: () => {
      },
      ...options
    };
  }
  /** Start the loop. Safe to call once; later calls are ignored. */
  start() {
    if (this.startedAt !== 0) return;
    this.startedAt = Date.now();
    this.schedule(this.options.intervalMs);
  }
  /** Stop the loop permanently and drop any pending tick. */
  stop() {
    this.stopped = true;
    this.options.timers.clear(this.handle);
    this.handle = void 0;
  }
  schedule(delayMs) {
    if (this.stopped) return;
    this.handle = this.options.timers.set(() => {
      void this.tick();
    }, delayMs);
  }
  delay() {
    const backoff = this.options.intervalMs * 2 ** Math.min(this.failures, 8);
    return Math.min(backoff, this.options.maxBackoffMs);
  }
  async tick() {
    if (this.stopped) return;
    if (this.running) return;
    if (Date.now() - this.startedAt >= this.options.deadlineMs) {
      this.stopped = true;
      this.options.onDeadline();
      return;
    }
    this.running = true;
    try {
      await this.options.onRun();
      this.failures = 0;
    } catch {
      this.failures += 1;
    } finally {
      this.running = false;
      this.options.onSettled(this.failures);
      this.schedule(this.delay());
    }
  }
};

// src/host/loopback.ts
function isIPv4Loopback(v4) {
  const parts = v4.split(".");
  return parts.length === 4 && parts[0] === "127" && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}
function isLoopbackAddress(address) {
  if (address === void 0) return false;
  const normalized = address.toLowerCase();
  if (normalized === "::1") return true;
  if (normalized.startsWith("::ffff:")) return isIPv4Loopback(normalized.slice("::ffff:".length));
  return isIPv4Loopback(normalized);
}
function isLoopbackHostname(hostname) {
  if (hostname === "localhost" || hostname === "[::1]") return true;
  return isIPv4Loopback(hostname);
}
function isLoopbackRequest(request) {
  if (!isLoopbackAddress(request.socket.remoteAddress)) return false;
  const host = request.headers.host;
  if (typeof host !== "string") return false;
  let hostUrl;
  try {
    hostUrl = new URL("http://" + host);
  } catch {
    return false;
  }
  if (!isLoopbackHostname(hostUrl.hostname)) return false;
  if (request.headers["sec-fetch-site"] === "cross-site") return false;
  const origin = request.headers.origin;
  if (origin === void 0) return true;
  try {
    return new URL(origin).host === hostUrl.host;
  } catch {
    return false;
  }
}

// src/host/pair-access.ts
function isPairedOrLoopbackAllowed(ctx, request) {
  if (isLoopbackRequest(request)) return true;
  const fromGet = typeof ctx.get === "function" ? ctx.get("remoteWebUiPairing", false) : void 0;
  const pairing = isPairingAccess(fromGet) ? fromGet : ctx.remoteWebUiPairing;
  return pairing?.isPairedDevice(request) === true;
}
function isPairingAccess(value) {
  return value !== void 0 && value !== null && typeof value.isPairedDevice === "function";
}

// src/host/access.ts
function isGitAllowed(ctx, request) {
  return isPairedOrLoopbackAllowed(ctx, request);
}

// src/host/http.ts
var DEFAULT_JSON_BODY_MAX_BYTES = 64 * 1024;
var JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "referrer-policy": "no-referrer"
};
async function readJsonBody(req, opts = {}) {
  const maxBytes = opts.maxBytes ?? DEFAULT_JSON_BODY_MAX_BYTES;
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = chunk;
    size += buffer.length;
    if (size > maxBytes) {
      req.destroy();
      return null;
    }
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (text === "") return null;
  try {
    const parsed = JSON.parse(text);
    if (opts.objectOnly && !isJsonObject(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}
function isJsonObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function writeJson(res, status, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { ...JSON_HEADERS, ...headers });
  res.end(payload);
}

// src/host/group-ops.ts
import path2 from "node:path";
function canonicalPath(value) {
  return path2.resolve(value);
}
function messageOf(cause) {
  return cause instanceof Error && cause.message !== "" ? cause.message : "git operation failed";
}
function invalidBranchName(name, reason) {
  return { code: "invalid-branch-name", message: `invalid branch name "${name}": ${reason}` };
}
function workspaceUnknown(repoPath) {
  return { code: "workspace-unknown", message: `no repository is enumerated at ${repoPath}` };
}
async function branchesOrNull(deps, repoPath) {
  try {
    return await deps.branchesOf(repoPath);
  } catch {
    return null;
  }
}
async function preflightOrRejected(deps, repoPath, branch) {
  try {
    return await deps.preflight(repoPath, branch);
  } catch (cause) {
    return { code: "internal", message: messageOf(cause) };
  }
}
async function switchOne(deps, repo, branch) {
  try {
    const switched = await deps.switchBranch(repo.path, branch);
    return switched.ok ? { repo, outcome: "ok" } : { repo, outcome: "failed", error: switched.error };
  } catch (cause) {
    return { repo, outcome: "failed", error: { code: "internal", message: messageOf(cause) } };
  }
}
async function createOne(deps, repo, name, base) {
  try {
    let from2;
    if (base === "mainline") {
      const resolved = await deps.defaultBase(repo.path);
      if (resolved === null) {
        return {
          repo,
          outcome: "failed",
          error: { code: "base-ref-not-found", message: `no default mainline resolves in ${repo.name}` }
        };
      }
      from2 = resolved;
    }
    const created = await deps.createBranchAt(repo.path, name, from2);
    return created.ok ? { repo, outcome: "ok" } : { repo, outcome: "failed", error: created.error };
  } catch (cause) {
    return { repo, outcome: "failed", error: { code: "internal", message: messageOf(cause) } };
  }
}
async function groupSwitch(deps, workspacePath, branch) {
  const repos = await deps.repos(workspacePath);
  if (repos === null) return { action: "switch", branch, results: [] };
  const listings = await Promise.all(repos.map((repo) => branchesOrNull(deps, repo.path)));
  const owns = listings.map((view) => view !== null && view.branches.some((row) => row.name === branch));
  const results = repos.map((repo, index) => owns[index] ? { repo, outcome: "not-run" } : { repo, outcome: "skipped" });
  const participants = repos.map((_, index) => index).filter((index) => owns[index]);
  if (participants.length === 0) return { action: "switch", branch, results };
  const verdicts = await Promise.all(participants.map((index) => preflightOrRejected(deps, repos[index].path, branch)));
  if (verdicts.some((verdict) => verdict !== null)) {
    for (const [position, index] of participants.entries()) {
      const error = verdicts[position];
      if (error !== null) results[index] = { repo: repos[index], outcome: "failed", error };
    }
    return { action: "switch", branch, results };
  }
  const switched = await Promise.all(participants.map((index) => switchOne(deps, repos[index], branch)));
  for (const [position, index] of participants.entries()) results[index] = switched[position];
  return { action: "switch", branch, results };
}
async function groupCreate(deps, workspacePath, repoPaths, name, base) {
  const repos = await deps.repos(workspacePath);
  if (repos === null) return { action: "create", branch: name, results: [] };
  const enumerated = new Set(repos.map((repo) => canonicalPath(repo.path)));
  const checked = new Set(repoPaths.map((requested) => canonicalPath(requested)));
  const chosen = repos.map((repo) => checked.has(canonicalPath(repo.path)));
  const results = repos.map((repo) => ({ repo, outcome: "skipped" }));
  const appendUnknown = () => {
    for (const requested of repoPaths) {
      const canonical = canonicalPath(requested);
      if (enumerated.has(canonical)) continue;
      results.push({
        repo: { path: canonical, name: path2.basename(canonical), primary: false },
        outcome: "failed",
        error: workspaceUnknown(canonical)
      });
    }
  };
  const invalid = validateBranchName(name);
  if (invalid !== null) {
    for (let index = 0; index < repos.length; index += 1) {
      if (!chosen[index]) continue;
      results[index] = { repo: repos[index], outcome: "failed", error: invalidBranchName(name, invalid) };
    }
    appendUnknown();
    return { action: "create", branch: name, results };
  }
  await Promise.all(repos.map(async (repo, index) => {
    if (!chosen[index]) return;
    results[index] = await createOne(deps, repo, name, base);
  }));
  appendUnknown();
  return { action: "create", branch: name, results };
}

// src/host/routes.ts
var defaultFeatureConfig = () => ({
  autoIsolate: false,
  autoBaseline: "current",
  worktreesHome: worktreesHome()
});
var OK = (value) => ({ ok: true, value });
var FAIL = (error) => ({ ok: false, error });
var BAD_REQUEST = { code: "internal", message: "malformed request" };
var POLL_INTERVAL_MS = 3e4;
var HEARTBEAT_INTERVAL_MS = 15e3;
var STATUS_TIMEOUT_MS = 15e3;
var STATUS_TIMEOUT_MESSAGE = "git status timed out";
var POLL_LIFETIME_MS = Number.MAX_SAFE_INTEGER;
var MALFORMED_VIEW = { code: "internal", message: "malformed git response" };
function pathOf(payload) {
  if (typeof payload !== "object" || payload === null) return null;
  const path3 = payload.path;
  return typeof path3 === "string" && path3 !== "" ? path3 : null;
}
function okView(res, value, guard) {
  if (value !== null && !guard(value)) {
    writeJson(res, 200, FAIL(MALFORMED_VIEW));
    return;
  }
  writeJson(res, 200, OK(value));
}
function serviceGroupDeps(service) {
  return {
    repos: async (workspacePath) => {
      const view = await service.repos(workspacePath);
      return view === null ? null : view.repos.map((row) => row.repo);
    },
    branchesOf: (repoPath) => service.branches(repoPath),
    preflight: (repoPath, target) => service.preflight(repoPath, target),
    switchBranch: (repoPath, branch) => service.switchBranch(repoPath, branch),
    createBranchAt: (repoPath, name, base) => service.createBranchAt(repoPath, name, base),
    defaultBase: (repoPath) => service.defaultBase(repoPath)
  };
}
function registerGitRoutes(ctx, service, config = defaultFeatureConfig) {
  const subscribers = /* @__PURE__ */ new Set();
  let guard;
  let heartbeatTimer;
  const groupPort = serviceGroupDeps(service);
  const removeSubscriber = (subscriber) => {
    subscriber.statusAbort?.abort(new Error("git status subscriber closed"));
    subscriber.statusAbort = void 0;
    subscribers.delete(subscriber);
    if (subscribers.size === 0) {
      guard?.stop();
      guard = void 0;
      if (heartbeatTimer !== void 0) clearInterval(heartbeatTimer);
      heartbeatTimer = void 0;
    }
  };
  const push2 = (subscriber, payload) => {
    subscriber.res.write(`event: change
data: ${JSON.stringify(payload)}

`);
  };
  const withDeadline = async (work, controller) => {
    let timeout;
    const deadline = new Promise((_, reject) => {
      timeout = setTimeout(() => {
        const error = new Error(STATUS_TIMEOUT_MESSAGE);
        controller.abort(error);
        reject(error);
      }, STATUS_TIMEOUT_MS);
    });
    try {
      return await Promise.race([work(controller.signal), deadline]);
    } finally {
      if (timeout !== void 0) clearTimeout(timeout);
    }
  };
  const statusWithDeadline = async (path3, controller = new AbortController()) => await withDeadline((signal) => service.status(path3, signal), controller);
  const reposWithDeadline = async (path3) => await withDeadline((signal) => service.repos(path3, signal), new AbortController());
  const runPoll = async () => {
    await Promise.all([...subscribers].map(async (subscriber) => {
      const controller = new AbortController();
      subscriber.statusAbort = controller;
      try {
        const next = /* @__PURE__ */ new Map();
        await Promise.all(subscriber.paths.map(async (path3) => {
          const status = await statusWithDeadline(path3, controller);
          let worktreeDigest = subscriber.worktreeDigests.get(path3) ?? "";
          try {
            const view = await service.worktrees(path3, controller.signal);
            if (view !== null) {
              worktreeDigest = view.worktrees.map((item) => `${item.path}:${item.branch}:${item.head}`).join(",");
              subscriber.worktreeDigests.set(path3, worktreeDigest);
            }
          } catch {
          }
          next.set(path3, pollDigestKey(status, worktreeDigest));
        }));
        const changed = collectChanges(subscriber.digests, next);
        subscriber.digests = next;
        if (changed.length > 0) push2(subscriber, { paths: changed });
      } catch (error) {
        if (subscribers.has(subscriber)) {
          ctx.logger.warn(`dsh-git-graph-multi: status poll failed for ${subscriber.paths.join(", ")}: ${String(error)}`);
        }
      } finally {
        if (subscriber.statusAbort === controller) subscriber.statusAbort = void 0;
      }
    }));
  };
  const handler = async (req, res) => {
    if (!isGitAllowed(ctx, req)) {
      writeJson(res, 403, { error: "forbidden: loopback-only" });
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(405);
      res.end();
      return;
    }
    const contentType = req.headers["content-type"] ?? "";
    if (!contentType.toLowerCase().startsWith("application/json")) {
      res.writeHead(415);
      res.end();
      return;
    }
    const pathname = new URL(req.url ?? "/", "http://x").pathname;
    const payload = await readJsonBody(req, { maxBytes: 1024 * 1024 });
    if (pathname === "/git/config") {
      const view = config();
      writeJson(res, 200, isGitFeatureConfig(view) ? OK(view) : FAIL(MALFORMED_VIEW));
      return;
    }
    const path3 = pathOf(payload);
    if (path3 === null) {
      writeJson(res, 200, FAIL(BAD_REQUEST));
      return;
    }
    switch (pathname) {
      case "/git/status":
        try {
          okView(res, await statusWithDeadline(path3), isRepoStatus);
        } catch (error) {
          ctx.logger.warn(`dsh-git-graph-multi: status request failed for ${path3}: ${String(error)}`);
          writeJson(res, 200, FAIL({ code: "internal", message: STATUS_TIMEOUT_MESSAGE }));
        }
        return;
      case "/git/branches":
        okView(res, await service.branches(path3), isBranchesView);
        return;
      case "/git/repos":
        try {
          okView(res, await reposWithDeadline(path3), isReposView);
        } catch (error) {
          ctx.logger.warn(`dsh-git-graph-multi: repos request failed for ${path3}: ${String(error)}`);
          writeJson(res, 200, FAIL({ code: "internal", message: STATUS_TIMEOUT_MESSAGE }));
        }
        return;
      case "/git/graph": {
        const rawLimit = typeof payload === "object" && payload !== null ? payload.limit : void 0;
        const limit = typeof rawLimit === "number" && rawLimit > 0 ? Math.min(rawLimit, 1e3) : void 0;
        okView(res, await service.graph(path3, limit), isGraphView);
        return;
      }
      case "/git/switch": {
        const branch = typeof payload === "object" && payload !== null ? payload.branch : void 0;
        if (typeof branch !== "string" || branch === "") {
          writeJson(res, 200, FAIL(BAD_REQUEST));
          return;
        }
        const result = await service.switchBranch(path3, branch);
        writeJson(res, 200, result.ok ? OK({ branch: result.branch }) : FAIL(isGitError(result.error) ? result.error : MALFORMED_VIEW));
        return;
      }
      case "/git/create-branch": {
        const name = typeof payload === "object" && payload !== null ? payload.name : void 0;
        if (typeof name !== "string" || name === "") {
          writeJson(res, 200, FAIL(BAD_REQUEST));
          return;
        }
        const result = await service.createBranch(path3, name);
        writeJson(res, 200, result.ok ? OK({ branch: result.branch }) : FAIL(isGitError(result.error) ? result.error : MALFORMED_VIEW));
        return;
      }
      case "/git/group-switch": {
        const branch = typeof payload === "object" && payload !== null ? payload.branch : void 0;
        if (typeof branch !== "string" || branch === "") {
          writeJson(res, 200, FAIL(BAD_REQUEST));
          return;
        }
        okView(res, await groupSwitch(groupPort, path3, branch), isGroupResultView);
        return;
      }
      case "/git/group-create": {
        const record = typeof payload === "object" && payload !== null ? payload : {};
        const repos = record.repos;
        const name = record.name;
        const base = record.base;
        if (!Array.isArray(repos) || !repos.every((item) => typeof item === "string" && item !== "") || typeof name !== "string" || name === "" || !isGroupBase(base)) {
          writeJson(res, 200, FAIL(BAD_REQUEST));
          return;
        }
        okView(res, await groupCreate(groupPort, path3, repos, name, base), isGroupResultView);
        return;
      }
      case "/git/worktrees":
        okView(res, await service.worktrees(path3), isWorktreeListView);
        return;
      case "/git/worktree-add": {
        const record = typeof payload === "object" && payload !== null ? payload : {};
        const name = record.name;
        const baseRef = record.baseRef;
        if (typeof name !== "string" || name === "" || baseRef !== void 0 && typeof baseRef !== "string") {
          writeJson(res, 200, FAIL(BAD_REQUEST));
          return;
        }
        const result = await service.addWorktree(path3, name, baseRef);
        writeJson(res, 200, result.ok ? OK({ path: result.path, branch: result.branch, name: result.name }) : FAIL(isGitError(result.error) ? result.error : MALFORMED_VIEW));
        return;
      }
      case "/git/worktree-remove": {
        const record = typeof payload === "object" && payload !== null ? payload : {};
        const worktreePath = record.worktreePath;
        if (typeof worktreePath !== "string" || worktreePath === "") {
          writeJson(res, 200, FAIL(BAD_REQUEST));
          return;
        }
        const result = await service.removeWorktree(path3, worktreePath, {
          force: record.force === true,
          deleteBranch: record.deleteBranch === true
        });
        writeJson(res, 200, result.ok ? OK({ removed: true }) : FAIL(isGitError(result.error) ? result.error : MALFORMED_VIEW));
        return;
      }
      default:
        res.writeHead(404);
        res.end();
    }
  };
  const sse = (req, res) => {
    if (!isGitAllowed(ctx, req)) {
      writeJson(res, 403, { error: "forbidden: loopback-only" });
      return;
    }
    const url = new URL(req.url ?? "/", "http://x");
    const paths = parseEventPaths(url.searchParams);
    if (paths.length === 0) {
      res.writeHead(400);
      res.end();
      return;
    }
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "keep-alive"
    });
    res.write("retry: 2000\n\n");
    const subscriber = { paths, digests: /* @__PURE__ */ new Map(), worktreeDigests: /* @__PURE__ */ new Map(), res };
    subscribers.add(subscriber);
    res.on("error", () => {
      removeSubscriber(subscriber);
    });
    if (guard === void 0) {
      guard = new PollGuard({
        intervalMs: POLL_INTERVAL_MS,
        deadlineMs: POLL_LIFETIME_MS,
        maxBackoffMs: POLL_INTERVAL_MS,
        onRun: runPoll
      });
    }
    guard.start();
    if (heartbeatTimer === void 0) {
      heartbeatTimer = setInterval(() => {
        for (const current of subscribers) current.res.write(": ping\n\n");
      }, HEARTBEAT_INTERVAL_MS);
    }
    req.on("close", () => {
      removeSubscriber(subscriber);
    });
  };
  const disposers = [
    ctx.webServer.register({ kind: "prefix", path: "/git", handler }),
    ctx.webServer.register({ kind: "exact", path: "/git/events", handler: sse })
  ];
  return () => {
    for (const dispose of disposers) dispose();
    guard?.stop();
    if (heartbeatTimer !== void 0) clearInterval(heartbeatTimer);
    for (const subscriber of subscribers) {
      subscriber.statusAbort?.abort(new Error("git status routes disposed"));
      subscriber.res.end();
    }
    subscribers.clear();
  };
}

// src/host/agent-tool.ts
var GIT_WORKTREE_TOOL = "git_worktree";
function callingCwd(exec) {
  const agent = exec.agent;
  const cwd = agent?.session?.header?.cwd;
  return typeof cwd === "string" && cwd !== "" ? cwd : void 0;
}
function buildWorktreeTool(ctx, service) {
  return {
    name: GIT_WORKTREE_TOOL,
    description: [
      "Manage isolated git worktrees of the current session's repository.",
      "create makes a new worktree under the DSH-managed worktrees home on a new wt/<name> branch and registers it as a workspace;",
      "the returned path is ready for a new session (or for direct use when the sandbox permits).",
      "list shows every worktree; remove deletes a managed worktree (uncommitted changes reject unless force)."
    ].join(" "),
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        action: {
          type: "string",
          enum: ["create", "list", "remove"],
          description: "The worktree operation to perform."
        },
        name: {
          type: "string",
          description: "create: worktree name (sanitized to [a-z0-9._-]); omit for an auto-generated one."
        },
        baseRef: {
          type: "string",
          description: "create: base revision (branch or rev); omit for the checkout's current HEAD. 'origin/HEAD' falls back to HEAD when no remote exists."
        },
        worktreePath: {
          type: "string",
          description: "remove: absolute worktree path, exactly as reported by list/create."
        },
        force: {
          type: "boolean",
          description: "remove: override the uncommitted-changes guard."
        },
        deleteBranch: {
          type: "boolean",
          description: "remove: also delete the wt/<name> branch after removal."
        }
      },
      required: ["action"]
    },
    output: {
      schema: { type: "object", additionalProperties: true },
      render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }]
    },
    timeoutMs: 6e4,
    async execute(args, exec) {
      const input = typeof args === "object" && args !== null ? args : {};
      const cwd = callingCwd(exec);
      if (cwd === void 0) {
        return { ok: false, code: "workspace-unknown", message: "git_worktree needs a calling session with a project cwd" };
      }
      switch (input.action) {
        case "list": {
          const view = await service.worktrees(cwd, exec.signal);
          if (view === null) return { ok: false, code: "workspace-unknown", message: "not a git workspace" };
          return { ok: true, root: view.root, worktrees: view.worktrees };
        }
        case "create": {
          const rawName = typeof input.name === "string" && input.name.trim() !== "" ? input.name : `agent-${Date.now().toString(36)}`;
          const baseRef = typeof input.baseRef === "string" && input.baseRef.trim() !== "" ? input.baseRef : void 0;
          const result = await service.addWorktree(cwd, rawName, baseRef);
          if (!result.ok) return { ok: false, code: result.error.code, message: result.error.message };
          const workspace = await ctx.workspaceRegistry.create(result.path, `wt: ${result.name}`);
          return {
            ok: true,
            path: result.path,
            branch: result.branch,
            name: result.name,
            workspaceId: String(workspace.id),
            note: "The current session stays in its original checkout; open a new session on the registered workspace to work inside the worktree."
          };
        }
        case "remove": {
          if (typeof input.worktreePath !== "string" || input.worktreePath === "") {
            return { ok: false, code: "invalid-worktree-name", message: "remove requires worktreePath" };
          }
          const result = await service.removeWorktree(cwd, input.worktreePath, {
            force: input.force === true,
            deleteBranch: input.deleteBranch === true
          });
          if (!result.ok) return { ok: false, code: result.error.code, message: result.error.message };
          const linked = ctx.workspaceRegistry.list().find((item) => item.path === input.worktreePath);
          if (linked !== void 0) await ctx.workspaceRegistry.delete(linked.id);
          return { ok: true, removed: input.worktreePath };
        }
        default:
          return { ok: false, code: "internal", message: "action must be one of 'create', 'list', 'remove'" };
      }
    }
  };
}

// src/mount-once.ts
var MOUNTED = Symbol.for("dsh-web.mounted-plugins");
var WAITERS = Symbol.for("dsh-web.mounted-plugins.waiters");
function mountedSet() {
  const registry = globalThis;
  const existing = registry[MOUNTED];
  if (existing instanceof Set) return existing;
  const created = /* @__PURE__ */ new Set();
  registry[MOUNTED] = created;
  return created;
}
function mountWaiters() {
  const registry = globalThis;
  return registry[WAITERS] ??= /* @__PURE__ */ new Map();
}
function mountOnce(packageName, fn) {
  const mount = (...args) => {
    const mounted = mountedSet();
    const ctx = args[0];
    if (mounted.has(packageName)) {
      const waiters = mountWaiters();
      const queue = waiters.get(packageName) ?? [];
      let alive = true;
      const pending = {
        run: () => {
          if (alive) mount(...args);
        }
      };
      ctx?.effect?.(() => () => {
        alive = false;
        const index = queue.indexOf(pending);
        if (index >= 0) queue.splice(index, 1);
      });
      queue.push(pending);
      waiters.set(packageName, queue);
      return;
    }
    mounted.add(packageName);
    ctx?.effect?.(() => () => {
      mounted.delete(packageName);
      const waiters = mountWaiters();
      const queue = waiters.get(packageName);
      if (queue === void 0) return;
      waiters.delete(packageName);
      for (const waiter of queue.splice(0)) queueMicrotask(() => {
        waiter.run();
      });
    });
    return fn(...args);
  };
  return mount;
}

// src/index.ts
var inject = ["webServer", "subprocess", "workspaceRegistry"];
function createWorkspaceGate(ctx) {
  return buildWorkspaceGate(ctx.workspaceRegistry);
}
var apply = mountOnce("dsh-plugin-git-graph-multi", applyImpl);
function applyImpl(ctx, config) {
  const service = new GitService(subprocessRunner2(ctx), createWorkspaceGate(ctx));
  const featureConfig = () => {
    const active = effectiveConfig(config);
    return {
      autoIsolate: active.autoIsolate,
      autoBaseline: active.autoBaseline,
      worktreesHome: worktreesHome()
    };
  };
  let toolFiber;
  const syncTool = () => {
    const want = effectiveConfig(config).agentTool;
    if (want && toolFiber === void 0) {
      toolFiber = ctx.inject(["tools"], (toolCtx) => {
        toolCtx.effect(() => toolCtx.tools.register(buildWorktreeTool(ctx, service)), "dsh-git-graph-multi: git_worktree tool");
      });
    } else if (!want && toolFiber !== void 0) {
      toolFiber.dispose();
      toolFiber = void 0;
    }
  };
  ctx.effect(() => {
    const dispose = ctx.on("loader/volatile-update", (paths) => {
      if (paths.some((path3) => path3[0] === "agentTool")) syncTool();
    });
    return () => {
      dispose();
    };
  }, "dsh-git-graph-multi: settings-committed tool sync");
  ctx.effect(() => {
    syncTool();
    const disposeRoutes = registerGitRoutes(ctx, service, featureConfig);
    return () => {
      disposeRoutes();
      toolFiber?.dispose();
      toolFiber = void 0;
    };
  }, "dsh-git-graph-multi: /git routes + tool");
}
export {
  Config,
  apply,
  createWorkspaceGate,
  inject
};
