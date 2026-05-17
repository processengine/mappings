const FORBIDDEN_OBJECT_KEY_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

export function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
}

export function isJsonScalar(value) {
  return value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));
}

export function isJsonSafe(value) {
  const stack = new WeakSet();
  function check(v) {
    if (v === null) return true;
    const k = typeof v;
    if (k === 'string' || k === 'boolean') return true;
    if (k === 'number') return Number.isFinite(v);
    if (k === 'undefined' || k === 'function' || k === 'symbol' || k === 'bigint') return false;
    if (Array.isArray(v)) {
      if (stack.has(v)) return false;
      stack.add(v);
      const ok = v.every(check);
      stack.delete(v);
      return ok;
    }
    if (v instanceof Date || v instanceof Map || v instanceof Set) return false;
    if (!isPlainObject(v)) return false;
    if (stack.has(v)) return false;
    stack.add(v);
    const ok = Object.entries(v).every(([key, nested]) => isSafeObjectKey(key) && check(nested));
    stack.delete(v);
    return ok;
  }
  return check(value);
}

export function isSafeObjectKey(segment) {
  return typeof segment === 'string' && segment.length > 0 && !FORBIDDEN_OBJECT_KEY_SEGMENTS.has(segment);
}

export function splitTargetPath(targetPath) {
  if (typeof targetPath !== 'string' || targetPath.length === 0) return null;
  const segments = targetPath.split('.');
  if (segments.some((segment) => !isSafeObjectKey(segment))) return null;
  return segments;
}

export function isValidTargetPath(targetPath) {
  return splitTargetPath(targetPath) !== null;
}

export function isValidInputPath(p) {
  return typeof p === 'string' && p.startsWith('$.') && p.length > 2;
}

export function resolvePath(input, pathStr) {
  if (!isValidInputPath(pathStr)) return { resolved: false };
  const segs = pathStr.slice(2).split('.');
  let cur = input;
  for (const seg of segs) {
    if (cur === null || typeof cur !== 'object' || !Object.prototype.hasOwnProperty.call(cur, seg)) return { resolved: false };
    cur = cur[seg];
  }
  return { resolved: true, value: cur };
}

export function resolveArrayItems(input, pathStr) {
  const idx = typeof pathStr === 'string' ? pathStr.indexOf('[*]') : -1;
  if (idx === -1) return [];
  const containerPath = pathStr.slice(0, idx);
  const rest = pathStr.slice(idx + 3);
  const { resolved, value } = resolvePath(input, containerPath);
  if (!resolved || !Array.isArray(value)) return [];
  if (!rest) return value;
  const segs = rest.startsWith('.') ? rest.slice(1).split('.') : rest.split('.');
  return value.map(item => {
    let cur = item;
    for (const s of segs) {
      if (cur === null || typeof cur !== 'object' || !Object.prototype.hasOwnProperty.call(cur, s)) return undefined;
      cur = cur[s];
    }
    return cur;
  }).filter(v => v !== undefined);
}

export function resolveElementField(item, fieldPath) {
  if (!fieldPath || fieldPath === '$') return item;
  const segs = (fieldPath.startsWith('$.') ? fieldPath.slice(2) : fieldPath).split('.');
  let cur = item;
  for (const s of segs) {
    if (cur === null || typeof cur !== 'object' || !Object.prototype.hasOwnProperty.call(cur, s)) return undefined;
    cur = cur[s];
  }
  return cur;
}

export function deepCopy(v) {
  if (!isJsonSafe(v)) throw new TypeError('value is not JSON-safe');
  return JSON.parse(JSON.stringify(v));
}

export function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item);
    return Object.freeze(value);
  }
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

export function setNestedPath(obj, targetPath, value) {
  const segs = splitTargetPath(targetPath);
  if (!segs) {
    const err = new Error('target path contains a forbidden or invalid segment');
    err.code = 'MAPPINGS_TARGET_PATH_FORBIDDEN_SEGMENT';
    throw err;
  }
  let cur = obj;
  for (let i = 0; i < segs.length - 1; i++) {
    const s = segs[i];
    if (!isPlainObject(cur[s])) cur[s] = {};
    cur = cur[s];
  }
  cur[segs[segs.length - 1]] = value;
}
