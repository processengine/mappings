const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

export function isPlainObject(val) {
  if (val === null || typeof val !== 'object') return false;
  if (Array.isArray(val)) return false;
  const proto = Object.getPrototypeOf(val);
  return proto === Object.prototype || proto === null;
}

export function validatePathSyntax(pathStr) {
  if (!pathStr || typeof pathStr !== 'string') {
    return { valid: false, code: 'INVALID_PATH', message: 'Path must be a non-empty string' };
  }
  const segments = pathStr.split('.');
  for (const seg of segments) {
    if (seg === '') {
      return { valid: false, code: 'INVALID_PATH', message: `Path contains empty segment: "${pathStr}"` };
    }
    if (FORBIDDEN_SEGMENTS.has(seg)) {
      return { valid: false, code: 'INVALID_PATH', message: `Path contains forbidden segment "${seg}": "${pathStr}"` };
    }
    if (/^\d+$/.test(seg)) {
      return { valid: false, code: 'INVALID_PATH', message: `Array index access not supported in v1: "${pathStr}"` };
    }
  }
  if (segments[0] !== 'sources') {
    return { valid: false, code: 'INVALID_PATH', message: `Path must start with "sources.": "${pathStr}"` };
  }
  if (segments.length < 3) {
    return { valid: false, code: 'INVALID_PATH', message: `Path must have at least "sources.<n>.<field>": "${pathStr}"` };
  }
  return { valid: true };
}

export function validateTargetPathSyntax(pathStr) {
  if (!pathStr || typeof pathStr !== 'string') {
    return { valid: false, code: 'INVALID_TARGET_PATH', message: 'Target path must be a non-empty string' };
  }
  const segments = pathStr.split('.');
  for (const seg of segments) {
    if (seg === '') {
      return { valid: false, code: 'INVALID_TARGET_PATH', message: `Target path contains empty segment: "${pathStr}"` };
    }
    if (FORBIDDEN_SEGMENTS.has(seg)) {
      return { valid: false, code: 'INVALID_TARGET_PATH', message: `Target path contains forbidden segment "${seg}": "${pathStr}"` };
    }
    if (/^\d+$/.test(seg)) {
      return { valid: false, code: 'INVALID_TARGET_PATH', message: `Array index in target path not supported in v1: "${pathStr}"` };
    }
  }
  return { valid: true };
}

export function resolvePath(sourcesMap, pathStr) {
  const segments = pathStr.split('.');
  const sourceName = segments[1];

  if (!(sourceName in sourcesMap)) {
    return { resolved: false };
  }

  let current = sourcesMap[sourceName];

  for (let i = 2; i < segments.length - 1; i++) {
    if (!isPlainObject(current)) {
      return { resolved: false };
    }
    const key = segments[i];
    if (!Object.prototype.hasOwnProperty.call(current, key)) {
      return { resolved: false };
    }
    current = current[key];
  }

  const lastKey = segments[segments.length - 1];

  if (segments.length === 2) {
    return { resolved: true, value: current };
  }

  if (!isPlainObject(current)) {
    return { resolved: false };
  }

  if (!Object.prototype.hasOwnProperty.call(current, lastKey)) {
    return { resolved: false };
  }

  return { resolved: true, value: current[lastKey] };
}

export function setTargetPath(result, targetPath, value) {
  const segments = targetPath.split('.');
  let current = result;
  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i];
    if (!isPlainObject(current[key])) {
      current[key] = {};
    }
    current = current[key];
  }
  current[segments[segments.length - 1]] = value;
}

export function deepCopy(value) {
  return deepCopyValue(value, new Set());
}

function deepCopyValue(value, seen) {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (seen.has(value)) {
    throw new TypeError('Circular reference detected in source data');
  }
  seen.add(value);

  let result;
  if (Array.isArray(value)) {
    result = value.map((item) => deepCopyValue(item, seen));
  } else if (isPlainObject(value)) {
    result = {};
    for (const key of Object.keys(value)) {
      result[key] = deepCopyValue(value[key], seen);
    }
  } else {
    const name = value.constructor ? value.constructor.name : typeof value;
    throw new TypeError(`Non-JSON-compatible value cannot be copied: ${name}`);
  }

  seen.delete(value);
  return result;
}

export function validateJsonSafeValue(value, sourceName, keyPath, seen = new Set()) {
  const loc = keyPath ? ` at "${keyPath}"` : '';

  if (value === null) return null;

  const type = typeof value;
  if (type === 'string' || type === 'boolean') return null;
  if (type === 'number') {
    if (!Number.isFinite(value)) {
      const display = Number.isNaN(value) ? 'NaN' : (value > 0 ? 'Infinity' : '-Infinity');
      return {
        code: 'INVALID_SOURCE_CONTENT',
        level: 'error',
        message: `Source '${sourceName}' contains non-JSON-safe number (${display})${loc}`,
        path: keyPath ? `sources.${sourceName}.${keyPath}` : `sources.${sourceName}`,
      };
    }
    return null;
  }

  if (type !== 'object') {
    return {
      code: 'INVALID_SOURCE_CONTENT',
      level: 'error',
      message: `Source '${sourceName}' contains non-JSON-safe value (${type})${loc}`,
      path: keyPath ? `sources.${sourceName}.${keyPath}` : `sources.${sourceName}`,
    };
  }

  if (seen.has(value)) {
    return {
      code: 'INVALID_SOURCE_CONTENT',
      level: 'error',
      message: `Source '${sourceName}' contains a circular reference${loc}`,
      path: keyPath ? `sources.${sourceName}.${keyPath}` : `sources.${sourceName}`,
    };
  }
  seen.add(value);

  let err = null;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const childPath = keyPath ? `${keyPath}[${i}]` : `[${i}]`;
      err = validateJsonSafeValue(value[i], sourceName, childPath, seen);
      if (err) break;
    }
  } else if (isPlainObject(value)) {
    for (const key of Object.keys(value)) {
      const childPath = keyPath ? `${keyPath}.${key}` : key;
      err = validateJsonSafeValue(value[key], sourceName, childPath, seen);
      if (err) break;
    }
  } else {
    const name = value.constructor ? value.constructor.name : 'unknown';
    err = {
      code: 'INVALID_SOURCE_CONTENT',
      level: 'error',
      message: `Source '${sourceName}' contains non-JSON-compatible object (${name})${loc}`,
      path: keyPath ? `sources.${sourceName}.${keyPath}` : `sources.${sourceName}`,
    };
  }

  seen.delete(value);
  return err;
}
