'use strict';

const { isPlainObject, validatePathSyntax, validateTargetPathSyntax } = require('./path.js');

// ---------------------------------------------------------------------------
// Множества допустимых операторов
// ---------------------------------------------------------------------------

const SUPPORTED_OPERATORS = new Set([
  'from', 'literal', 'exists', 'equals', 'coalesce',
  'trim', 'lowercase', 'uppercase', 'normalizeSpaces', 'removeNonDigits',
  'mapValue', 'transform',
]);

const STRING_ROOT_OPERATORS = new Set([
  'trim', 'lowercase', 'uppercase', 'normalizeSpaces', 'removeNonDigits',
]);

const TRANSFORM_STEP_OPERATORS = new Set([
  'trim', 'lowercase', 'uppercase', 'normalizeSpaces', 'removeNonDigits', 'mapValue',
]);

// ---------------------------------------------------------------------------
// Построение ошибок с location-контекстом
// ---------------------------------------------------------------------------

/**
 * Создаёт объект ошибки. Поля location включаются только если заданы.
 *
 * @param {string} code
 * @param {string} message
 * @param {object} [location] — { phase, operator, targetPath, from, stepIndex }
 */
function makeError(code, message, location = {}) {
  const err = { code, message };
  if (location.phase)                   err.phase = location.phase;
  if (location.operator)                err.operator = location.operator;
  if (location.targetPath)              err.targetPath = location.targetPath;
  if (location.from)                    err.from = location.from;
  if (location.stepIndex !== undefined) err.stepIndex = location.stepIndex;
  return err;
}

// ---------------------------------------------------------------------------
// Вспомогательные функции
// ---------------------------------------------------------------------------

function isJsonSafeLiteral(val) {
  if (val === null)            return true;
  if (typeof val === 'string') return true;
  if (typeof val === 'boolean') return true;
  if (typeof val === 'number')  return Number.isFinite(val);
  return false;
}

function literalTypeError(context, location) {
  return makeError(
    'INVALID_ARGS',
    `Literal must be a JSON-safe value (string, finite number, boolean, or null) in "${context}"`,
    location,
  );
}

function validateSourcePath(pathStr, context, declaredSources, location = {}) {
  const result = validatePathSyntax(pathStr);
  if (!result.valid) {
    return makeError(result.code, `${result.message} (in "${context}")`, location);
  }
  const sourceName = pathStr.split('.')[1];
  if (!declaredSources.has(sourceName)) {
    return makeError(
      'INVALID_PATH',
      `Path references undeclared source "${sourceName}" in "${context}": "${pathStr}"`,
      location,
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Валидация словаря mapValue
// ---------------------------------------------------------------------------

function validateMap(map, context, location) {
  if (!isPlainObject(map)) {
    return makeError('INVALID_ARGS', `mapValue "map" must be a plain object in "${context}"`, location);
  }
  const keys = Object.keys(map);
  if (keys.length === 0) {
    return makeError('INVALID_ARGS', `mapValue "map" must not be empty in "${context}"`, location);
  }
  for (const key of keys) {
    if (!isJsonSafeLiteral(map[key])) {
      return makeError(
        'INVALID_ARGS',
        `mapValue "map" value for key "${key}" must be a JSON-safe literal in "${context}"`,
        location,
      );
    }
  }
  return null;
}

function validateFallback(fallback, context, location) {
  if (fallback === 'passthrough') return null;
  if (!isJsonSafeLiteral(fallback)) {
    return makeError(
      'INVALID_ARGS',
      `mapValue "fallback" must be a JSON-safe literal or "passthrough" in "${context}"`,
      location,
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Валидация шагов transform
// ---------------------------------------------------------------------------

/**
 * Проверяет один шаг внутри transform.steps.
 * Ошибки обогащаются location-контекстом: operator: 'transform', targetPath, stepIndex.
 */
function validateTransformStep(step, stepIndex, targetPath) {
  const loc = { phase: 'compile', operator: 'transform', targetPath, stepIndex };

  if (!isPlainObject(step)) {
    return makeError('INVALID_ARGS', `transform step [${stepIndex}] must be a plain object in "${targetPath}"`, loc);
  }
  const keys = Object.keys(step);
  if (keys.length !== 1) {
    return makeError('INVALID_ARGS', `transform step [${stepIndex}] must have exactly one key in "${targetPath}"`, loc);
  }
  const stepOp = keys[0];
  if (!TRANSFORM_STEP_OPERATORS.has(stepOp)) {
    return makeError('INVALID_ARGS', `transform step [${stepIndex}] has unknown operator "${stepOp}" in "${targetPath}"`, loc);
  }
  const stepArgs = step[stepOp];

  if (STRING_ROOT_OPERATORS.has(stepOp)) {
    if (stepArgs !== true) {
      return makeError(
        'INVALID_ARGS',
        `transform step [${stepIndex}] operator "${stepOp}" expects argument true in "${targetPath}"`,
        loc,
      );
    }
    return null;
  }

  if (stepOp === 'mapValue') {
    if (!isPlainObject(stepArgs)) {
      return makeError('INVALID_ARGS', `transform step [${stepIndex}] mapValue argument must be a plain object in "${targetPath}"`, loc);
    }
    if ('from' in stepArgs) {
      return makeError(
        'INVALID_ARGS',
        `transform step [${stepIndex}] mapValue (step form) must not contain "from" in "${targetPath}"`,
        loc,
      );
    }
    const mapErr = validateMap(stepArgs.map, targetPath, loc);
    if (mapErr) return mapErr;
    if ('fallback' in stepArgs) {
      const fbErr = validateFallback(stepArgs.fallback, targetPath, loc);
      if (fbErr) return fbErr;
    }
    return null;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Валидация аргументов операторов
// ---------------------------------------------------------------------------

function validateOperatorArgs(op, args, targetPath, declaredSources) {
  const loc = { phase: 'compile', operator: op, targetPath };

  switch (op) {

    // --- v1 операторы ---

    case 'from': {
      if (typeof args !== 'string') {
        return makeError('INVALID_ARGS', `Operator 'from' expects a path string in "${targetPath}"`, loc);
      }
      return validateSourcePath(args, targetPath, declaredSources, { ...loc, from: args });
    }

    case 'literal': {
      if (!isJsonSafeLiteral(args)) {
        return literalTypeError(targetPath, loc);
      }
      return null;
    }

    case 'exists': {
      if (typeof args !== 'string') {
        return makeError('INVALID_ARGS', `Operator 'exists' expects a path string in "${targetPath}"`, loc);
      }
      return validateSourcePath(args, targetPath, declaredSources, { ...loc, from: args });
    }

    case 'equals': {
      if (!Array.isArray(args) || args.length !== 2) {
        return makeError('INVALID_ARGS', `Operator 'equals' expects [path, literal] in "${targetPath}"`, loc);
      }
      const [pathArg, literalArg] = args;
      const pathErr = validateSourcePath(pathArg, targetPath, declaredSources, { ...loc, from: pathArg });
      if (pathErr) return pathErr;
      if (!isJsonSafeLiteral(literalArg)) {
        return literalTypeError(targetPath, loc);
      }
      return null;
    }

    case 'coalesce': {
      if (!Array.isArray(args) || args.length < 1 || args.length > 4) {
        return makeError('INVALID_ARGS', `Operator 'coalesce' expects 1–4 candidates in "${targetPath}"`, loc);
      }
      for (let i = 0; i < args.length; i++) {
        const cand = args[i];
        if (!isPlainObject(cand)) {
          return makeError('INVALID_ARGS', `Coalesce candidate [${i}] must be a plain object in "${targetPath}"`, loc);
        }
        const keys = Object.keys(cand);
        if (keys.length !== 1 || (!('path' in cand) && !('literal' in cand))) {
          return makeError(
            'INVALID_ARGS',
            `Coalesce candidate [${i}] must have exactly one key: "path" or "literal" in "${targetPath}"`,
            loc,
          );
        }
        if ('path' in cand) {
          const pathErr = validateSourcePath(cand.path, targetPath, declaredSources, loc);
          if (pathErr) return pathErr;
        } else {
          if (!isJsonSafeLiteral(cand.literal)) {
            return makeError('INVALID_ARGS', `Coalesce literal candidate [${i}] must be a JSON-safe value in "${targetPath}"`, loc);
          }
        }
      }
      return null;
    }

    // --- v2 строковые операторы (корневая форма) ---

    case 'trim':
    case 'lowercase':
    case 'uppercase':
    case 'normalizeSpaces':
    case 'removeNonDigits': {
      if (typeof args !== 'string') {
        return makeError('INVALID_ARGS', `Operator '${op}' expects a path string in "${targetPath}"`, loc);
      }
      return validateSourcePath(args, targetPath, declaredSources, { ...loc, from: args });
    }

    // --- v2 mapValue (корневая форма) ---

    case 'mapValue': {
      if (!isPlainObject(args)) {
        return makeError('INVALID_ARGS', `Operator 'mapValue' expects a plain object in "${targetPath}"`, loc);
      }
      if (typeof args.from !== 'string') {
        return makeError(
          'INVALID_ARGS',
          `Operator 'mapValue' (root form) requires a "from" path string in "${targetPath}"`,
          loc,
        );
      }
      const pathErr = validateSourcePath(args.from, targetPath, declaredSources, { ...loc, from: args.from });
      if (pathErr) return pathErr;
      const mapErr = validateMap(args.map, targetPath, { ...loc, from: args.from });
      if (mapErr) return mapErr;
      if ('fallback' in args) {
        const fbErr = validateFallback(args.fallback, targetPath, { ...loc, from: args.from });
        if (fbErr) return fbErr;
      }
      return null;
    }

    // --- v2 transform ---

    case 'transform': {
      if (!isPlainObject(args)) {
        return makeError('INVALID_ARGS', `Operator 'transform' expects a plain object in "${targetPath}"`, loc);
      }
      if (typeof args.from !== 'string') {
        return makeError('INVALID_ARGS', `Operator 'transform' requires a "from" path string in "${targetPath}"`, loc);
      }
      const pathErr = validateSourcePath(args.from, targetPath, declaredSources, { ...loc, from: args.from });
      if (pathErr) return pathErr;
      if (!Array.isArray(args.steps)) {
        return makeError('INVALID_ARGS', `Operator 'transform' requires "steps" array in "${targetPath}"`, loc);
      }
      if (args.steps.length < 2) {
        return makeError(
          'INVALID_ARGS',
          `Operator 'transform' requires at least 2 steps (got ${args.steps.length}) in "${targetPath}"`,
          { ...loc, from: args.from },
        );
      }
      if (args.steps.length > 8) {
        return makeError(
          'INVALID_ARGS',
          `Operator 'transform' allows at most 8 steps (got ${args.steps.length}) in "${targetPath}"`,
          { ...loc, from: args.from },
        );
      }
      for (let i = 0; i < args.steps.length; i++) {
        const stepErr = validateTransformStep(args.steps[i], i, targetPath);
        if (stepErr) return stepErr;
      }
      return null;
    }

    default:
      return makeError('UNKNOWN_OPERATOR', `Unknown operator "${op}" in "${targetPath}"`, loc);
  }
}

// ---------------------------------------------------------------------------
// Главная функция валидации
// ---------------------------------------------------------------------------

/**
 * Проверяет объект описания маппинга.
 * Возвращает объект ошибки { code, message, phase, operator?, targetPath?, from?, stepIndex? }
 * или null при успехе.
 */
function validateDefinition(definition) {
  const compileLoc = { phase: 'compile' };

  if (!isPlainObject(definition)) {
    return makeError('INVALID_MAPPING_SCHEMA', 'Definition must be a plain JSON object', compileLoc);
  }

  if (
    !definition.mappingId ||
    typeof definition.mappingId !== 'string' ||
    definition.mappingId.trim() === ''
  ) {
    return makeError('INVALID_MAPPING_ID', 'mappingId is required and must be a non-empty string', compileLoc);
  }

  if (!isPlainObject(definition.sources)) {
    return makeError('INVALID_SOURCE_DECLARATION', 'sources must be a plain object', compileLoc);
  }
  for (const [key, val] of Object.entries(definition.sources)) {
    if (val !== 'object') {
      return makeError(
        'INVALID_SOURCE_DECLARATION',
        `Source "${key}" must have type "object", got "${val}"`,
        compileLoc,
      );
    }
  }

  if (!isPlainObject(definition.output)) {
    return makeError('INVALID_MAPPING_SCHEMA', 'output must be a plain object', compileLoc);
  }

  const declaredSources = new Set(Object.keys(definition.sources));

  for (const [targetPath, rule] of Object.entries(definition.output)) {
    const tpResult = validateTargetPathSyntax(targetPath);
    if (!tpResult.valid) {
      return makeError(tpResult.code, tpResult.message, { ...compileLoc, targetPath });
    }

    if (!isPlainObject(rule)) {
      return makeError(
        'INVALID_MAPPING_SCHEMA',
        `Output rule for "${targetPath}" must be a plain object`,
        { ...compileLoc, targetPath },
      );
    }

    const ruleKeys = Object.keys(rule);
    const opKeys = ruleKeys.filter(k => SUPPORTED_OPERATORS.has(k));
    const unknownKeys = ruleKeys.filter(k => !SUPPORTED_OPERATORS.has(k));

    if (unknownKeys.length > 0) {
      return makeError(
        'UNKNOWN_OPERATOR',
        `Unknown operator "${unknownKeys[0]}" in output field "${targetPath}"`,
        { ...compileLoc, targetPath, operator: unknownKeys[0] },
      );
    }
    if (opKeys.length === 0) {
      return makeError(
        'INVALID_MAPPING_SCHEMA',
        `Output field "${targetPath}" must have exactly one operator`,
        { ...compileLoc, targetPath },
      );
    }
    if (opKeys.length > 1) {
      return makeError(
        'INVALID_MAPPING_SCHEMA',
        `Output field "${targetPath}" must have exactly one operator, found: ${opKeys.join(', ')}`,
        { ...compileLoc, targetPath },
      );
    }

    const op = opKeys[0];
    const argsErr = validateOperatorArgs(op, rule[op], targetPath, declaredSources);
    if (argsErr) return argsErr;
  }

  // Проверка конфликтующих целевых путей
  const targetPaths = Object.keys(definition.output);
  for (let i = 0; i < targetPaths.length; i++) {
    for (let j = i + 1; j < targetPaths.length; j++) {
      const a = targetPaths[i];
      const b = targetPaths[j];
      if (a === b || b.startsWith(a + '.') || a.startsWith(b + '.')) {
        return makeError(
          'CONFLICTING_TARGET_PATHS',
          `Conflicting target paths: "${a}" and "${b}"`,
          compileLoc,
        );
      }
    }
  }

  return null;
}

module.exports = { validateDefinition };
