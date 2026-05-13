import {
  isPlainObject,
  validatePathSyntax,
  validateTargetPathSyntax,
  validateAggregateFromPathSyntax,
  validateElementFieldPathSyntax,
} from './path.js';

const SUPPORTED_OPERATORS = new Set([
  'from', 'literal', 'exists', 'equals', 'coalesce',
  'trim', 'lowercase', 'uppercase', 'normalizeSpaces', 'removeNonDigits',
  'mapValue', 'transform',
  'collect', 'collectObject', 'count', 'countAtLeast', 'existsAny', 'existsAll', 'pickFirst', 'containsValue',
  'joinNonEmpty', 'template',
]);

const STRING_ROOT_OPERATORS = new Set([
  'trim', 'lowercase', 'uppercase', 'normalizeSpaces', 'removeNonDigits',
]);

const TRANSFORM_STEP_OPERATORS = new Set([
  'trim', 'lowercase', 'uppercase', 'normalizeSpaces', 'removeNonDigits', 'mapValue',
]);

function makeDiagnostic(code, message, location = {}, level = 'error') {
  const diagnostic = { code, level, message };
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

function validateAggregateFrom(from, context, declaredSources, location = {}) {
  const result = validateAggregateFromPathSyntax(from);
  if (!result.valid) {
    return makeDiagnostic(result.code, `${result.message} (in "${context}")`, { ...location, path: from });
  }
  const sourceName = from.split('.')[1];
  if (!declaredSources.has(sourceName)) {
    return makeDiagnostic('INVALID_PATH', `Path references undeclared source "${sourceName}" in "${context}": "${from}"`, { ...location, path: from });
  }
  return null;
}

function validateElementFieldPath(field, context, location = {}) {
  const result = validateElementFieldPathSyntax(field);
  if (!result.valid) {
    return makeDiagnostic(result.code, `${result.message} (in "${context}")`, { ...location, path: field });
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


function validateBooleanOption(value, name, context, location) {
  if (typeof value !== 'boolean') {
    return makeDiagnostic('INVALID_ARGS', `${name} must be a boolean in "${context}"`, location);
  }
  return null;
}

function validateStringExpression(expr, context, declaredSources, location = {}) {
  if (!isPlainObject(expr)) {
    return [makeDiagnostic('INVALID_ARGS', `String expression must be a plain object in "${context}"`, location)];
  }

  // Template expression form: { template: "...", vars: {...}, ... }.
  if (Object.prototype.hasOwnProperty.call(expr, 'template') && typeof expr.template === 'string') {
    return validateTemplateExpression(expr, context, declaredSources, location);
  }

  const keys = Object.keys(expr);
  if (keys.length !== 1) {
    return [makeDiagnostic('INVALID_ARGS', `String expression must contain exactly one operator in "${context}"`, location)];
  }

  const op = keys[0];
  const args = expr[op];

  if (op === 'from' || op === 'path') {
    if (typeof args !== 'string') return [makeDiagnostic('INVALID_ARGS', `${op} expression expects a path string in "${context}"`, location)];
    const err = validateSourcePath(args, context, declaredSources, { ...location, from: args });
    return err ? [err] : [];
  }

  if (op === 'literal') {
    return isJsonSafeLiteral(args) ? [] : [literalTypeError(context, location)];
  }

  if (op === 'coalesce') {
    return validateCoalesceCandidates(args, context, declaredSources, location);
  }

  if (op === 'joinNonEmpty') {
    return validateJoinNonEmptyExpression(args, context, declaredSources, location);
  }

  return [makeDiagnostic('UNKNOWN_OPERATOR', `Unknown string expression operator '${op}' in "${context}"`, { ...location, operator: op })];
}

function validateJoinNonEmptyExpression(args, context, declaredSources, location = {}) {
  const loc = { ...location, operator: 'joinNonEmpty' };
  const diagnostics = [];
  if (!isPlainObject(args)) {
    return [makeDiagnostic('INVALID_JOIN_NON_EMPTY_SHAPE', `joinNonEmpty expects an object in "${context}"`, loc)];
  }
  if (!Array.isArray(args.items)) {
    diagnostics.push(makeDiagnostic('JOIN_NON_EMPTY_ITEMS_MUST_BE_ARRAY', `joinNonEmpty.items must be an array in "${context}"`, loc));
  } else if (args.items.length === 0) {
    diagnostics.push(makeDiagnostic('JOIN_NON_EMPTY_ITEMS_EMPTY', `joinNonEmpty.items must not be empty in "${context}"`, loc));
  } else {
    args.items.forEach((item, index) => diagnostics.push(...validateStringExpression(item, `${context}.items[${index}]`, declaredSources, { ...loc, itemIndex: index })));
  }
  if ('separator' in args && typeof args.separator !== 'string') diagnostics.push(makeDiagnostic('JOIN_NON_EMPTY_SEPARATOR_MUST_BE_STRING', `joinNonEmpty.separator must be a string in "${context}"`, loc));
  for (const name of ['trimItems', 'trimResult', 'emptyAsNull']) {
    if (name in args) {
      const err = validateBooleanOption(args[name], `joinNonEmpty.${name}`, context, loc);
      if (err) diagnostics.push(err);
    }
  }
  const allowed = new Set(['separator', 'items', 'trimItems', 'trimResult', 'emptyAsNull']);
  for (const key of Object.keys(args)) {
    if (!allowed.has(key)) diagnostics.push(makeDiagnostic('INVALID_ARGS', `Unsupported field "${key}" for joinNonEmpty in "${context}"`, { ...loc, field: key }));
  }
  return diagnostics;
}

function extractTemplateVarNames(template) {
  const names = [];
  const validRe = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;
  let match;
  while ((match = validRe.exec(template)) !== null) names.push(match[1]);
  const allBraces = template.match(/\{\{[^}]*\}\}/g) ?? [];
  if (allBraces.length !== names.length) return { names, invalid: true };
  return { names, invalid: false };
}

function validateTemplateExpression(args, context, declaredSources, location = {}) {
  const loc = { ...location, operator: 'template' };
  const diagnostics = [];
  if (!isPlainObject(args)) return [makeDiagnostic('INVALID_TEMPLATE_SHAPE', `template expects an object in "${context}"`, loc)];
  if (typeof args.template !== 'string') {
    diagnostics.push(makeDiagnostic('TEMPLATE_STRING_REQUIRED', `template.template must be a string in "${context}"`, loc));
  }
  const vars = args.vars ?? {};
  if (!isPlainObject(vars)) {
    diagnostics.push(makeDiagnostic('TEMPLATE_VARS_MUST_BE_OBJECT', `template.vars must be an object in "${context}"`, loc));
  }
  if (typeof args.template === 'string' && isPlainObject(vars)) {
    const parsed = extractTemplateVarNames(args.template);
    if (parsed.invalid) diagnostics.push(makeDiagnostic('TEMPLATE_VAR_NAME_INVALID', `template contains invalid variable placeholder in "${context}"`, loc));
    for (const name of Object.keys(vars)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) diagnostics.push(makeDiagnostic('TEMPLATE_VAR_NAME_INVALID', `template var name "${name}" is invalid in "${context}"`, { ...loc, varName: name }));
      diagnostics.push(...validateStringExpression(vars[name], `${context}.vars.${name}`, declaredSources, { ...loc, varName: name }));
    }
    for (const name of parsed.names) {
      if (!Object.prototype.hasOwnProperty.call(vars, name)) diagnostics.push(makeDiagnostic('TEMPLATE_VAR_MISSING', `template var "${name}" is used but not defined in "${context}"`, { ...loc, varName: name }));
    }
  }
  for (const name of ['trimResult', 'emptyAsNull', 'skipIfAnyVarEmpty']) {
    if (name in args) {
      const err = validateBooleanOption(args[name], `template.${name}`, context, loc);
      if (err) diagnostics.push(err);
    }
  }
  const allowed = new Set(['template', 'vars', 'trimResult', 'emptyAsNull', 'skipIfAnyVarEmpty']);
  for (const key of Object.keys(args)) {
    if (!allowed.has(key)) diagnostics.push(makeDiagnostic('INVALID_ARGS', `Unsupported field "${key}" for template in "${context}"`, { ...loc, field: key }));
  }
  return diagnostics;
}

function validateCoalesceCandidates(args, context, declaredSources, location) {
  if (!Array.isArray(args) || args.length < 1 || args.length > 8) {
    return [makeDiagnostic('INVALID_ARGS', `Operator 'coalesce' expects 1–8 candidates in "${context}"`, location)];
  }
  const diagnostics = [];
  for (let i = 0; i < args.length; i++) {
    const cand = args[i];
    diagnostics.push(...validateStringExpression(cand, `${context}.coalesce[${i}]`, declaredSources, { ...location, candidateIndex: i }));
  }
  return diagnostics;
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
      return makeDiagnostic('INVALID_ARGS', `transform step [${stepIndex}] operator "${stepOp}" expects argument true in "${targetPath}"`, loc);
    }
    return null;
  }

  if (stepOp === 'mapValue') {
    if (!isPlainObject(stepArgs)) {
      return makeDiagnostic('INVALID_ARGS', `transform step [${stepIndex}] mapValue argument must be a plain object in "${targetPath}"`, loc);
    }
    if ('from' in stepArgs) {
      return makeDiagnostic('INVALID_ARGS', `transform step [${stepIndex}] mapValue (step form) must not contain "from" in "${targetPath}"`, loc);
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

function validateConditionShape(condition, context, targetPath, slot) {
  const loc = { operator: slot, targetPath };
  if (!isPlainObject(condition)) {
    return [makeDiagnostic('INVALID_CONDITION_SHAPE', `${slot} must be a plain object in "${context}"`, loc)];
  }
  if (typeof condition.field !== 'string') {
    return [makeDiagnostic('INVALID_CONDITION_SHAPE', `${slot}.field must be a string in "${context}"`, loc)];
  }
  const fieldErr = validateElementFieldPath(condition.field, context, { ...loc, field: condition.field });
  if (fieldErr) return [fieldErr];

  const comparators = ['equals', 'in', 'startsWith'].filter((name) => Object.prototype.hasOwnProperty.call(condition, name));
  if (comparators.length !== 1) {
    return [makeDiagnostic('INVALID_CONDITION_SHAPE', `${slot} must contain exactly one comparator in "${context}"`, loc)];
  }

  const op = comparators[0];
  if (op === 'equals') {
    if (!isJsonSafeLiteral(condition.equals)) {
      return [makeDiagnostic('INVALID_CONDITION_SHAPE', `${slot}.equals must be a JSON-safe literal in "${context}"`, loc)];
    }
  }
  if (op === 'in') {
    if (!Array.isArray(condition.in) || !condition.in.every(isJsonSafeLiteral)) {
      return [makeDiagnostic('INVALID_CONDITION_SHAPE', `${slot}.in must be an array of JSON-safe literals in "${context}"`, loc)];
    }
    if (condition.in.length === 0) {
      return [makeDiagnostic('EMPTY_IN_ARRAY', `${slot}.in is empty and will always be false in "${context}"`, loc, 'warning')];
    }
  }
  if (op === 'startsWith') {
    if (typeof condition.startsWith !== 'string') {
      return [makeDiagnostic('INVALID_CONDITION_SHAPE', `${slot}.startsWith must be a string in "${context}"`, loc)];
    }
  }
  return [];
}

function validateCollectObjectFields(fields, context, targetPath) {
  const loc = { operator: 'collectObject', targetPath };
  if (!isPlainObject(fields)) {
    return [makeDiagnostic('INVALID_ARGS', `Operator 'collectObject' requires plain-object "fields" in "${context}"`, loc)];
  }

  const keys = Object.keys(fields);
  if (keys.length === 0) {
    return [makeDiagnostic('INVALID_ARGS', `Operator 'collectObject' requires non-empty "fields" in "${context}"`, loc)];
  }

  const diagnostics = [];
  for (const key of keys) {
    const keyValidation = validateTargetPathSyntax(key);
    if (!keyValidation.valid) {
      diagnostics.push(makeDiagnostic(keyValidation.code, `${keyValidation.message} (in "${context}")`, { ...loc, path: key }));
      continue;
    }

    if (typeof fields[key] !== 'string') {
      diagnostics.push(makeDiagnostic('INVALID_ARGS', `collectObject field "${key}" must map to a relative path string in "${context}"`, { ...loc, path: key }));
      continue;
    }

    const valueErr = validateElementFieldPath(fields[key], `${context}.fields.${key}`, { ...loc, path: fields[key] });
    if (valueErr) diagnostics.push(valueErr);
  }

  return diagnostics;
}

function validateAggregateOperator(op, args, targetPath, declaredSources) {
  const loc = { operator: op, targetPath };
  if (!isPlainObject(args)) {
    return [makeDiagnostic('INVALID_ARGS', `Operator '${op}' expects an object in "${targetPath}"`, loc)];
  }
  if (typeof args.from !== 'string') {
    return [makeDiagnostic('INVALID_ARGS', `Operator '${op}' requires string "from" in "${targetPath}"`, loc)];
  }
  const diagnostics = [];
  const fromErr = validateAggregateFrom(args.from, targetPath, declaredSources, { ...loc, from: args.from });
  if (fromErr) diagnostics.push(fromErr);
  if (args.where) diagnostics.push(...validateConditionShape(args.where, targetPath, targetPath, 'where'));
  if (args.match) diagnostics.push(...validateConditionShape(args.match, targetPath, targetPath, 'match'));

  if (op === 'collect') {
    if (typeof args.value !== 'string') {
      diagnostics.push(makeDiagnostic('MISSING_VALUE_IN_COLLECT', `Operator 'collect' requires string "value" in "${targetPath}"`, loc));
    } else {
      const valueErr = validateElementFieldPath(args.value, targetPath, { ...loc, value: args.value });
      if (valueErr) diagnostics.push(valueErr);
    }
    if (args.match) diagnostics.push(makeDiagnostic('INVALID_ARGS', `Operator 'collect' does not support "match" in first version for "${targetPath}"`, loc));
  } else if (op === 'collectObject') {
    diagnostics.push(...validateCollectObjectFields(args.fields, targetPath, targetPath));
    if (args.match) diagnostics.push(makeDiagnostic('INVALID_ARGS', `Operator 'collectObject' does not support "match" in first version for "${targetPath}"`, loc));
  } else if (op === 'countAtLeast') {
    if (!Number.isInteger(args.value) || args.value < 0) {
      diagnostics.push(makeDiagnostic('INVALID_ARGS', `Operator 'countAtLeast' requires integer "value" >= 0 in "${targetPath}"`, loc));
    }
  } else if (op === 'containsValue') {
    if (!isJsonSafeLiteral(args.value)) {
      diagnostics.push(makeDiagnostic('INVALID_ARGS', `Operator 'containsValue' requires JSON-safe scalar "value" in "${targetPath}"`, loc));
    }
  } else if ('value' in args) {
    diagnostics.push(makeDiagnostic('INVALID_ARGS', `Operator '${op}' does not support "value" in "${targetPath}"`, loc));
  }

  if (op === 'existsAll') {
    if (!args.match) diagnostics.push(makeDiagnostic('INVALID_CONDITION_SHAPE', `Operator 'existsAll' requires "match" in "${targetPath}"`, loc));
  } else if (args.match && op !== 'existsAny' && op !== 'count' && op !== 'pickFirst') {
    diagnostics.push(makeDiagnostic('INVALID_ARGS', `Operator '${op}' does not support "match" in "${targetPath}"`, loc));
  }

  const allowed = new Set(['from', 'where']);
  if (op === 'collect' || op === 'countAtLeast' || op === 'containsValue') allowed.add('value');
  if (op === 'collectObject') allowed.add('fields');
  if (op === 'existsAll') allowed.add('match');
  if (op === 'existsAny' || op === 'count' || op === 'countAtLeast' || op === 'containsValue' || op === 'pickFirst') {
    // where only in first version
  }
  for (const key of Object.keys(args)) {
    if (!allowed.has(key)) {
      diagnostics.push(makeDiagnostic('INVALID_ARGS', `Unsupported field "${key}" for operator '${op}' in "${targetPath}"`, { ...loc, field: key }));
    }
  }

  return diagnostics;
}

function validateOperatorArgs(op, args, targetPath, declaredSources) {
  const loc = { operator: op, targetPath };

  if (['collect', 'collectObject', 'count', 'countAtLeast', 'existsAny', 'existsAll', 'pickFirst', 'containsValue'].includes(op)) {
    return validateAggregateOperator(op, args, targetPath, declaredSources);
  }

  switch (op) {
    case 'from':
    case 'exists':
    case 'trim':
    case 'lowercase':
    case 'uppercase':
    case 'normalizeSpaces':
    case 'removeNonDigits': {
      if (typeof args !== 'string') {
        return [makeDiagnostic('INVALID_ARGS', `Operator '${op}' expects a path string in "${targetPath}"`, loc)];
      }
      const err = validateSourcePath(args, targetPath, declaredSources, { ...loc, from: args });
      return err ? [err] : [];
    }

    case 'literal':
      return !isJsonSafeLiteral(args) ? [literalTypeError(targetPath, loc)] : [];

    case 'equals': {
      if (!Array.isArray(args) || args.length !== 2) {
        return [makeDiagnostic('INVALID_ARGS', `Operator 'equals' expects [path, literal] in "${targetPath}"`, loc)];
      }
      const [pathArg, literalArg] = args;
      const diagnostics = [];
      const pathErr = validateSourcePath(pathArg, targetPath, declaredSources, { ...loc, from: pathArg });
      if (pathErr) diagnostics.push(pathErr);
      if (!isJsonSafeLiteral(literalArg)) diagnostics.push(literalTypeError(targetPath, loc));
      return diagnostics;
    }

    case 'coalesce':
      return validateCoalesceCandidates(args, targetPath, declaredSources, loc);

    case 'mapValue': {
      if (!isPlainObject(args)) {
        return [makeDiagnostic('INVALID_ARGS', `Operator 'mapValue' expects an object in "${targetPath}"`, loc)];
      }
      const diagnostics = [];
      if (typeof args.from !== 'string') diagnostics.push(makeDiagnostic('INVALID_ARGS', `Operator 'mapValue' requires string "from" in "${targetPath}"`, loc));
      else {
        const pathErr = validateSourcePath(args.from, targetPath, declaredSources, { ...loc, from: args.from });
        if (pathErr) diagnostics.push(pathErr);
      }
      const mapErr = validateMap(args.map, targetPath, loc);
      if (mapErr) diagnostics.push(mapErr);
      if ('fallback' in args) {
        const fbErr = validateFallback(args.fallback, targetPath, loc);
        if (fbErr) diagnostics.push(fbErr);
      }
      return diagnostics;
    }

    case 'joinNonEmpty':
      return validateJoinNonEmptyExpression(args, targetPath, declaredSources, loc);

    case 'template':
      return validateTemplateExpression(args, targetPath, declaredSources, loc);

    case 'transform': {
      if (!isPlainObject(args)) {
        return [makeDiagnostic('INVALID_ARGS', `Operator 'transform' expects an object in "${targetPath}"`, loc)];
      }
      const diagnostics = [];
      if (typeof args.from !== 'string') diagnostics.push(makeDiagnostic('INVALID_ARGS', `Operator 'transform' requires string "from" in "${targetPath}"`, loc));
      else {
        const pathErr = validateSourcePath(args.from, targetPath, declaredSources, { ...loc, from: args.from });
        if (pathErr) diagnostics.push(pathErr);
      }
      if (!Array.isArray(args.steps)) diagnostics.push(makeDiagnostic('INVALID_ARGS', `Operator 'transform' requires array "steps" in "${targetPath}"`, loc));
      else {
        if (args.steps.length < 2) diagnostics.push(makeDiagnostic('INVALID_ARGS', `Operator 'transform' requires at least 2 steps (got ${args.steps.length}) in "${targetPath}"`, loc));
        if (args.steps.length > 8) diagnostics.push(makeDiagnostic('INVALID_ARGS', `Operator 'transform' allows at most 8 steps (got ${args.steps.length}) in "${targetPath}"`, { ...loc, from: args.from }));
        for (let i = 0; i < args.steps.length; i++) {
          const stepErr = validateTransformStep(args.steps[i], i, targetPath);
          if (stepErr) diagnostics.push(stepErr);
        }
      }
      return diagnostics;
    }

    default:
      return [makeDiagnostic('UNKNOWN_OPERATOR', `Unknown operator '${op}' in "${targetPath}"`, loc)];
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
  const diagnostics = [];

  if (!isPlainObject(definition)) {
    return [makeDiagnostic('INVALID_MAPPING_SCHEMA', 'Mapping definition must be a plain object', { path: 'definition' })];
  }

  if (typeof definition.mappingId !== 'string' || definition.mappingId.trim() === '') {
    diagnostics.push(makeDiagnostic('INVALID_MAPPING_ID', 'mappingId must be a non-empty string', { path: 'mappingId' }));
  }

  if (!isPlainObject(definition.sources)) {
    diagnostics.push(makeDiagnostic('INVALID_SOURCE_DECLARATION', 'sources must be a plain object', { path: 'sources' }));
  }

  const declaredSources = new Set();
  if (isPlainObject(definition.sources)) {
    for (const [sourceName, sourceType] of Object.entries(definition.sources)) {
      if (typeof sourceType !== 'string' || sourceType !== 'object') {
        diagnostics.push(makeDiagnostic('INVALID_SOURCE_DECLARATION', `Source '${sourceName}' must declare type "object"`, { path: `sources.${sourceName}` }));
      }
      declaredSources.add(sourceName);
    }
  }

  if (!isPlainObject(definition.output)) {
    diagnostics.push(makeDiagnostic('INVALID_MAPPING_SCHEMA', 'output must be a plain object', { path: 'output' }));
  }

  if (!isPlainObject(definition.output)) return diagnostics;

  const conflictingTargets = hasConflictingTargetPaths(definition.output);
  if (conflictingTargets) {
    diagnostics.push(makeDiagnostic('CONFLICTING_TARGET_PATHS', `Conflicting target paths: "${conflictingTargets.a}" and "${conflictingTargets.b}"`, { path: `output.${conflictingTargets.a}`, conflictingWith: conflictingTargets.b }));
  }

  for (const [targetPath, rule] of Object.entries(definition.output)) {
    const targetPathValidation = validateTargetPathSyntax(targetPath);
    if (!targetPathValidation.valid) {
      diagnostics.push(makeDiagnostic(targetPathValidation.code, targetPathValidation.message, { path: `output.${targetPath}` }));
      continue;
    }

    if (!isPlainObject(rule)) {
      diagnostics.push(makeDiagnostic('INVALID_MAPPING_SCHEMA', `Rule for "${targetPath}" must be a plain object`, { targetPath }));
      continue;
    }

    const operatorNames = Object.keys(rule);
    if (operatorNames.length !== 1) {
      diagnostics.push(makeDiagnostic('INVALID_MAPPING_SCHEMA', `Rule for "${targetPath}" must contain exactly one operator`, { targetPath }));
      continue;
    }

    const op = operatorNames[0];
    if (!SUPPORTED_OPERATORS.has(op)) {
      diagnostics.push(makeDiagnostic('UNKNOWN_OPERATOR', `Unknown operator '${op}' in "${targetPath}"`, { targetPath, operator: op }));
      continue;
    }

    diagnostics.push(...validateOperatorArgs(op, rule[op], targetPath, declaredSources));
  }

  return diagnostics;
}
