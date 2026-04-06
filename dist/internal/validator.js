import { isPlainObject, validatePathSyntax, validateTargetPathSyntax } from './path.js';

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

function makeDiagnostic(code, message, location = {}) {
  const diagnostic = {
    code,
    level: 'error',
    message,
  };
  if (location.targetPath) diagnostic.path = `output.${location.targetPath}`;
  if (location.path && !diagnostic.path) diagnostic.path = location.path;
  if (Object.keys(location).length > 0) diagnostic.details = { ...location };
  return diagnostic;
}

function isJsonSafeLiteral(val) {
  if (val === null) return true;
  if (typeof val === 'string') return true;
  if (typeof val === 'boolean') return true;
  if (typeof val === 'number') return Number.isFinite(val);
  return false;
}

function literalTypeError(context, location) {
  return makeDiagnostic(
    'INVALID_ARGS',
    `Literal must be a JSON-safe value (string, finite number, boolean, or null) in "${context}"`,
    location,
  );
}

function validateSourcePath(pathStr, context, declaredSources, location = {}) {
  const result = validatePathSyntax(pathStr);
  if (!result.valid) {
    return makeDiagnostic(result.code, `${result.message} (in "${context}")`, { ...location, path: pathStr });
  }
  const sourceName = pathStr.split('.')[1];
  if (!declaredSources.has(sourceName)) {
    return makeDiagnostic(
      'INVALID_PATH',
      `Path references undeclared source "${sourceName}" in "${context}": "${pathStr}"`,
      { ...location, path: pathStr },
    );
  }
  return null;
}

function validateMap(map, context, location) {
  if (!isPlainObject(map)) {
    return makeDiagnostic('INVALID_ARGS', `mapValue "map" must be a plain object in "${context}"`, location);
  }
  const keys = Object.keys(map);
  if (keys.length === 0) {
    return makeDiagnostic('INVALID_ARGS', `mapValue "map" must not be empty in "${context}"`, location);
  }
  for (const key of keys) {
    if (!isJsonSafeLiteral(map[key])) {
      return makeDiagnostic(
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
    return makeDiagnostic(
      'INVALID_ARGS',
      `mapValue "fallback" must be a JSON-safe literal or "passthrough" in "${context}"`,
      location,
    );
  }
  return null;
}

function validateTransformStep(step, stepIndex, targetPath) {
  const loc = { operator: 'transform', targetPath, stepIndex };

  if (!isPlainObject(step)) {
    return makeDiagnostic('INVALID_ARGS', `transform step [${stepIndex}] must be a plain object in "${targetPath}"`, loc);
  }
  const keys = Object.keys(step);
  if (keys.length !== 1) {
    return makeDiagnostic('INVALID_ARGS', `transform step [${stepIndex}] must have exactly one key in "${targetPath}"`, loc);
  }
  const stepOp = keys[0];
  if (!TRANSFORM_STEP_OPERATORS.has(stepOp)) {
    return makeDiagnostic('INVALID_ARGS', `transform step [${stepIndex}] has unknown operator "${stepOp}" in "${targetPath}"`, loc);
  }
  const stepArgs = step[stepOp];

  if (STRING_ROOT_OPERATORS.has(stepOp)) {
    if (stepArgs !== true) {
      return makeDiagnostic(
        'INVALID_ARGS',
        `transform step [${stepIndex}] operator "${stepOp}" expects argument true in "${targetPath}"`,
        loc,
      );
    }
    return null;
  }

  if (stepOp === 'mapValue') {
    if (!isPlainObject(stepArgs)) {
      return makeDiagnostic('INVALID_ARGS', `transform step [${stepIndex}] mapValue argument must be a plain object in "${targetPath}"`, loc);
    }
    if ('from' in stepArgs) {
      return makeDiagnostic(
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

function validateOperatorArgs(op, args, targetPath, declaredSources) {
  const loc = { operator: op, targetPath };

  switch (op) {
    case 'from':
    case 'exists':
    case 'trim':
    case 'lowercase':
    case 'uppercase':
    case 'normalizeSpaces':
    case 'removeNonDigits': {
      if (typeof args !== 'string') {
        return makeDiagnostic('INVALID_ARGS', `Operator '${op}' expects a path string in "${targetPath}"`, loc);
      }
      return validateSourcePath(args, targetPath, declaredSources, { ...loc, from: args });
    }

    case 'literal': {
      if (!isJsonSafeLiteral(args)) {
        return literalTypeError(targetPath, loc);
      }
      return null;
    }

    case 'equals': {
      if (!Array.isArray(args) || args.length !== 2) {
        return makeDiagnostic('INVALID_ARGS', `Operator 'equals' expects [path, literal] in "${targetPath}"`, loc);
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
        return makeDiagnostic('INVALID_ARGS', `Operator 'coalesce' expects 1–4 candidates in "${targetPath}"`, loc);
      }
      for (let i = 0; i < args.length; i++) {
        const cand = args[i];
        if (!isPlainObject(cand)) {
          return makeDiagnostic('INVALID_ARGS', `Coalesce candidate [${i}] must be a plain object in "${targetPath}"`, loc);
        }
        const keys = Object.keys(cand);
        if (keys.length !== 1 || (!('path' in cand) && !('literal' in cand))) {
          return makeDiagnostic(
            'INVALID_ARGS',
            `Coalesce candidate [${i}] must have exactly one key: "path" or "literal" in "${targetPath}"`,
            loc,
          );
        }
        if ('path' in cand) {
          const pathErr = validateSourcePath(cand.path, targetPath, declaredSources, loc);
          if (pathErr) return pathErr;
        } else if (!isJsonSafeLiteral(cand.literal)) {
          return makeDiagnostic('INVALID_ARGS', `Coalesce literal candidate [${i}] must be a JSON-safe value in "${targetPath}"`, loc);
        }
      }
      return null;
    }

    case 'mapValue': {
      if (!isPlainObject(args)) {
        return makeDiagnostic('INVALID_ARGS', `Operator 'mapValue' expects an object in "${targetPath}"`, loc);
      }
      if (typeof args.from !== 'string') {
        return makeDiagnostic('INVALID_ARGS', `Operator 'mapValue' requires string "from" in "${targetPath}"`, loc);
      }
      const pathErr = validateSourcePath(args.from, targetPath, declaredSources, { ...loc, from: args.from });
      if (pathErr) return pathErr;
      const mapErr = validateMap(args.map, targetPath, loc);
      if (mapErr) return mapErr;
      if ('fallback' in args) {
        const fbErr = validateFallback(args.fallback, targetPath, loc);
        if (fbErr) return fbErr;
      }
      return null;
    }

    case 'transform': {
      if (!isPlainObject(args)) {
        return makeDiagnostic('INVALID_ARGS', `Operator 'transform' expects an object in "${targetPath}"`, loc);
      }
      if (typeof args.from !== 'string') {
        return makeDiagnostic('INVALID_ARGS', `Operator 'transform' requires string "from" in "${targetPath}"`, loc);
      }
      const pathErr = validateSourcePath(args.from, targetPath, declaredSources, { ...loc, from: args.from });
      if (pathErr) return pathErr;
      if (!Array.isArray(args.steps)) {
        return makeDiagnostic('INVALID_ARGS', `Operator 'transform' requires array "steps" in "${targetPath}"`, loc);
      }
      if (args.steps.length < 2) {
        return makeDiagnostic('INVALID_ARGS', `Operator 'transform' requires at least 2 steps (got ${args.steps.length}) in "${targetPath}"`, { ...loc, from: args.from });
      }
      if (args.steps.length > 8) {
        return makeDiagnostic('INVALID_ARGS', `Operator 'transform' allows at most 8 steps (got ${args.steps.length}) in "${targetPath}"`, { ...loc, from: args.from });
      }
      for (let i = 0; i < args.steps.length; i++) {
        const stepErr = validateTransformStep(args.steps[i], i, targetPath);
        if (stepErr) return stepErr;
      }
      return null;
    }

    default:
      return makeDiagnostic('UNKNOWN_OPERATOR', `Unknown operator '${op}' in "${targetPath}"`, loc);
  }
}

function hasConflictingTargetPaths(output) {
  const targets = Object.keys(output).sort();
  for (let i = 0; i < targets.length; i++) {
    for (let j = i + 1; j < targets.length; j++) {
      const a = targets[i];
      const b = targets[j];
      if (b.startsWith(`${a}.`)) {
        return { a, b };
      }
    }
  }
  return null;
}

export function validateDefinition(definition) {
  if (!isPlainObject(definition)) {
    return makeDiagnostic('INVALID_MAPPING_SCHEMA', 'Mapping definition must be a plain object', { path: 'definition' });
  }

  if (typeof definition.mappingId !== 'string' || definition.mappingId.trim() === '') {
    return makeDiagnostic('INVALID_MAPPING_ID', 'mappingId must be a non-empty string', { path: 'mappingId' });
  }

  if (!isPlainObject(definition.sources)) {
    return makeDiagnostic('INVALID_SOURCE_DECLARATION', 'sources must be a plain object', { path: 'sources' });
  }

  const declaredSources = new Set();
  for (const [sourceName, sourceType] of Object.entries(definition.sources)) {
    if (typeof sourceType !== 'string' || sourceType !== 'object') {
      return makeDiagnostic(
        'INVALID_SOURCE_DECLARATION',
        `Source '${sourceName}' must declare type "object"`,
        { path: `sources.${sourceName}` },
      );
    }
    declaredSources.add(sourceName);
  }

  if (!isPlainObject(definition.output)) {
    return makeDiagnostic('INVALID_MAPPING_SCHEMA', 'output must be a plain object', { path: 'output' });
  }

  const conflictingTargets = hasConflictingTargetPaths(definition.output);
  if (conflictingTargets) {
    return makeDiagnostic(
      'CONFLICTING_TARGET_PATHS',
      `Conflicting target paths: "${conflictingTargets.a}" and "${conflictingTargets.b}"`,
      { path: `output.${conflictingTargets.a}`, conflictingWith: conflictingTargets.b },
    );
  }

  for (const [targetPath, rule] of Object.entries(definition.output)) {
    const targetPathValidation = validateTargetPathSyntax(targetPath);
    if (!targetPathValidation.valid) {
      return makeDiagnostic(targetPathValidation.code, targetPathValidation.message, { path: `output.${targetPath}` });
    }

    if (!isPlainObject(rule)) {
      return makeDiagnostic('INVALID_MAPPING_SCHEMA', `Rule for "${targetPath}" must be a plain object`, { targetPath });
    }

    const operatorNames = Object.keys(rule);
    if (operatorNames.length !== 1) {
      return makeDiagnostic('INVALID_MAPPING_SCHEMA', `Rule for "${targetPath}" must contain exactly one operator`, { targetPath });
    }

    const op = operatorNames[0];
    if (!SUPPORTED_OPERATORS.has(op)) {
      return makeDiagnostic('UNKNOWN_OPERATOR', `Unknown operator '${op}' in "${targetPath}"`, { targetPath, operator: op });
    }

    const argsError = validateOperatorArgs(op, rule[op], targetPath, declaredSources);
    if (argsError) return argsError;
  }

  return null;
}
