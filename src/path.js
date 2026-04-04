'use strict';

const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

// ---------------------------------------------------------------------------
// isPlainObject
// ---------------------------------------------------------------------------

/**
 * Возвращает true только для простых JSON-объектов: {} или Object.create(null).
 * Отвергает Date, Map, Set, экземпляры классов, массивы, null, примитивы.
 */
function isPlainObject(val) {
  if (val === null || typeof val !== 'object') return false;
  if (Array.isArray(val)) return false;
  const proto = Object.getPrototypeOf(val);
  return proto === Object.prototype || proto === null;
}

// ---------------------------------------------------------------------------
// Валидация синтаксиса пути к источнику
// ---------------------------------------------------------------------------

function validatePathSyntax(pathStr) {
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

// ---------------------------------------------------------------------------
// Валидация синтаксиса целевого пути
// ---------------------------------------------------------------------------

function validateTargetPathSyntax(pathStr) {
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

// ---------------------------------------------------------------------------
// Разрешение пути
// ---------------------------------------------------------------------------

/**
 * Разрешает исходный путь относительно переданного словаря источников.
 *
 * - Промежуточные узлы должны быть plain-объектами.
 * - null на промежуточном шаге → путь не разрешён.
 * - null на ПОСЛЕДНЕМ шаге → разрешён со значением null.
 * - Массивы и любые другие значения допустимы как конечный результат.
 *
 * Возвращает { resolved: true, value } или { resolved: false }.
 */
function resolvePath(sourcesMap, pathStr) {
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

// ---------------------------------------------------------------------------
// Запись по целевому пути
// ---------------------------------------------------------------------------

function setTargetPath(result, targetPath, value) {
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

// ---------------------------------------------------------------------------
// Глубокое копирование — безопасное, без скрытых преобразований
// ---------------------------------------------------------------------------

/**
 * Глубоко копирует значение для безопасного использования в результате.
 *
 * Контракт:
 * - Примитивы (string, number, boolean, null) возвращаются как есть.
 * - Plain-объекты и массивы рекурсивно копируются.
 * - Циклические ссылки → бросает TypeError (→ INTERNAL_ERROR в движке).
 * - Не-plain объекты (Date, Map, Set, экземпляры классов) → бросает TypeError.
 *
 * Гарантирует, что библиотека никогда не преобразует non-JSON значения скрыто
 * (например, JSON.parse/JSON.stringify превратит NaN→null, Date→string).
 */
function deepCopy(value) {
  return _deepCopyValue(value, new Set());
}

function _deepCopyValue(value, seen) {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (seen.has(value)) {
    throw new TypeError('Circular reference detected in source data');
  }
  seen.add(value);

  let result;
  if (Array.isArray(value)) {
    result = value.map(item => _deepCopyValue(item, seen));
  } else if (isPlainObject(value)) {
    result = {};
    for (const key of Object.keys(value)) {
      result[key] = _deepCopyValue(value[key], seen);
    }
  } else {
    const name = value.constructor ? value.constructor.name : typeof value;
    throw new TypeError(`Non-JSON-compatible value cannot be copied: ${name}`);
  }

  seen.delete(value);
  return result;
}

// ---------------------------------------------------------------------------
// Рекурсивная проверка JSON-безопасности содержимого источника
// ---------------------------------------------------------------------------

/**
 * Рекурсивно проверяет, что значение источника содержит только JSON-совместимые данные.
 *
 * Разрешены: null, string, конечное число, boolean, plain-объекты, массивы.
 * Запрещены: NaN, Infinity, -Infinity, BigInt, функции, Date, Map, Set,
 *            экземпляры классов, циклические ссылки, undefined.
 *
 * Возвращает { code: 'INVALID_SOURCE_CONTENT', message } или null при успехе.
 *
 * @param {*}      value      — проверяемое значение
 * @param {string} sourceName — имя источника для сообщений об ошибках
 * @param {string} [keyPath]  — точечный путь внутри источника (для сообщений)
 * @param {Set}    [seen]     — трекер циклических ссылок (внутренний)
 */
function validateJsonSafeValue(value, sourceName, keyPath, seen) {
  if (!seen) seen = new Set();
  const loc = keyPath ? ` at "${keyPath}"` : '';

  if (value === null) return null;

  const type = typeof value;

  if (type === 'string' || type === 'boolean') return null;

  if (type === 'number') {
    if (!Number.isFinite(value)) {
      const display = Number.isNaN(value) ? 'NaN' : (value > 0 ? 'Infinity' : '-Infinity');
      return {
        code: 'INVALID_SOURCE_CONTENT',
        message: `Source '${sourceName}' contains non-JSON-safe number (${display})${loc}`,
      };
    }
    return null;
  }

  if (type !== 'object') {
    // function, symbol, bigint, undefined
    return {
      code: 'INVALID_SOURCE_CONTENT',
      message: `Source '${sourceName}' contains non-JSON-safe value (${type})${loc}`,
    };
  }

  // Объект — сначала проверяем циклическую ссылку
  if (seen.has(value)) {
    return {
      code: 'INVALID_SOURCE_CONTENT',
      message: `Source '${sourceName}' contains a circular reference${loc}`,
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
      message: `Source '${sourceName}' contains non-JSON-compatible object (${name})${loc}`,
    };
  }

  seen.delete(value);
  return err;
}

module.exports = {
  isPlainObject,
  validatePathSyntax,
  validateTargetPathSyntax,
  resolvePath,
  setTargetPath,
  deepCopy,
  validateJsonSafeValue,
};
