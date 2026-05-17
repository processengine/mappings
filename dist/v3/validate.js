import { isValidInputPath, isValidTargetPath, isSafeObjectKey, isJsonSafe, isPlainObject, isJsonScalar } from './path.js';

const ALLOWED_TOP_LEVEL_FIELDS = new Set(['mappingId', 'kind', 'title', 'description', 'output', 'metadata']);
const VALID_KINDS = new Set(['payload', 'facts', 'result']);
const FORBIDDEN_V2_OPERATORS = new Set([
  'literal', 'mapValue', 'transform', 'trim', 'normalizeSpaces', 'uppercase', 'lowercase',
  'template', 'joinNonEmpty', 'collectObject', 'countAtLeast', 'existsAll', 'pickFirst',
]);
const ALLOWED_OPERATORS = new Set([
  'from', 'const', 'coalesce', 'text', 'removeNonDigits', 'dictionary', 'equals', 'exists',
  'count', 'existsAny', 'containsValue', 'collect', 'join', 'findOne',
]);
const DECISION_LIKE_NAMES = /^(should|reject|approve|route|outcome)/i;
const RESULT_LIKE_NAMES = /^(status|reasonCode|merchantMessage)$/;

function diag(code, level, message, path) {
  const d = { code, level, message };
  if (path) d.path = path;
  return d;
}

function hasErrors(ds) {
  return ds.some((d) => d.level === 'error');
}

function validateJsonSafe(value, code, path, diagnostics, message) {
  if (!isJsonSafe(value)) diagnostics.push(diag(code, 'error', message, path));
}

function validateJsonObject(value, code, path, diagnostics, message) {
  if (!isPlainObject(value) || !isJsonSafe(value)) diagnostics.push(diag(code, 'error', message, path));
}

function validateScalar(value, code, path, diagnostics, message) {
  if (!isJsonScalar(value)) diagnostics.push(diag(code, 'error', message, path));
}

function validateTargetPath(value, path, diagnostics) {
  if (typeof value !== 'string' || !value.trim()) {
    diagnostics.push(diag('MAPPINGS_PATH_INVALID', 'error', 'target path must be a non-empty string', path));
    return;
  }
  if (!isValidTargetPath(value)) {
    diagnostics.push(diag('MAPPINGS_TARGET_PATH_FORBIDDEN_SEGMENT', 'error', 'target path contains an empty or forbidden object key segment', path));
  }
}

function validatePath(value, path, diagnostics, label = 'path') {
  if (typeof value !== 'string' || !isValidInputPath(value)) {
    diagnostics.push(diag('MAPPINGS_PATH_INVALID', 'error', `${label} must start with "$.",`, path));
    return;
  }
  if (value.startsWith('sources.')) {
    diagnostics.push(diag('MAPPINGS_LEGACY_SOURCES_FORBIDDEN', 'error', '"sources.*" paths are forbidden in v3. Use "$.*" paths from the single input object.', path));
  }
}

function validateWhere(where, path, diagnostics) {
  if (where === undefined) return;
  if (!isPlainObject(where)) {
    diagnostics.push(diag('MAPPINGS_OPERATOR_UNSUPPORTED', 'error', 'where must be an object', path));
    return;
  }
  const allowed = new Set(['field', 'equals', 'in', 'startsWith']);
  for (const key of Object.keys(where)) {
    if (!allowed.has(key)) diagnostics.push(diag('MAPPINGS_OPERATOR_UNSUPPORTED', 'error', `where field "${key}" is not supported in mappings v3`, `${path}.${key}`));
  }
  if (typeof where.field !== 'string' || where.field.length === 0) {
    diagnostics.push(diag('MAPPINGS_OPERATOR_UNSUPPORTED', 'error', 'where.field must be a non-empty string', `${path}.field`));
  }
  const modes = ['equals', 'in', 'startsWith'].filter((k) => k in where);
  if (modes.length !== 1) {
    diagnostics.push(diag('MAPPINGS_OPERATOR_UNSUPPORTED', 'error', 'where must contain exactly one of equals, in, startsWith', path));
  }
  if ('equals' in where) validateScalar(where.equals, 'MAPPINGS_OPERATOR_VALUE_NOT_JSON_SAFE', `${path}.equals`, diagnostics, 'where.equals must be a JSON scalar');
  if ('in' in where) {
    if (!Array.isArray(where.in) || where.in.length === 0) {
      diagnostics.push(diag('MAPPINGS_OPERATOR_UNSUPPORTED', 'error', 'where.in must be a non-empty array', `${path}.in`));
    } else {
      where.in.forEach((item, index) => validateScalar(item, 'MAPPINGS_OPERATOR_VALUE_NOT_JSON_SAFE', `${path}.in.${index}`, diagnostics, 'where.in items must be JSON scalars'));
    }
  }
  if ('startsWith' in where && typeof where.startsWith !== 'string') {
    diagnostics.push(diag('MAPPINGS_OPERATOR_UNSUPPORTED', 'error', 'where.startsWith must be a string', `${path}.startsWith`));
  }
}

function validateJoinItem(item, path, diagnostics) {
  if (typeof item === 'string') {
    if (item.startsWith('$.')) validatePath(item, path, diagnostics, 'join item path');
    return;
  }
  if (!isPlainObject(item)) {
    diagnostics.push(diag('MAPPINGS_OPERATOR_UNSUPPORTED', 'error', 'join item must be a path string, string literal, from item, or nested join', path));
    return;
  }
  if ('join' in item) {
    validateJoin(item.join, `${path}.join`, diagnostics);
    return;
  }
  const allowed = new Set(['from', 'prefix']);
  for (const key of Object.keys(item)) {
    if (!allowed.has(key)) diagnostics.push(diag('MAPPINGS_OPERATOR_UNSUPPORTED', 'error', `join item field "${key}" is not supported`, `${path}.${key}`));
  }
  if (!('from' in item)) diagnostics.push(diag('MAPPINGS_OPERATOR_UNSUPPORTED', 'error', 'join object item must contain from', `${path}.from`));
  else validatePath(item.from, `${path}.from`, diagnostics, 'join item from');
  if ('prefix' in item && typeof item.prefix !== 'string') diagnostics.push(diag('MAPPINGS_OPERATOR_UNSUPPORTED', 'error', 'join item prefix must be a string', `${path}.prefix`));
}

function validateJoin(join, path, diagnostics) {
  if (!isPlainObject(join)) {
    diagnostics.push(diag('MAPPINGS_OPERATOR_UNSUPPORTED', 'error', 'join must be an object', path));
    return;
  }
  const allowed = new Set(['separator', 'items']);
  for (const key of Object.keys(join)) if (!allowed.has(key)) diagnostics.push(diag('MAPPINGS_OPERATOR_UNSUPPORTED', 'error', `join field "${key}" is not supported`, `${path}.${key}`));
  if ('separator' in join && typeof join.separator !== 'string') diagnostics.push(diag('MAPPINGS_OPERATOR_UNSUPPORTED', 'error', 'join.separator must be a string', `${path}.separator`));
  if (!Array.isArray(join.items) || join.items.length === 0) {
    diagnostics.push(diag('MAPPINGS_OPERATOR_UNSUPPORTED', 'error', 'join.items must be a non-empty array', `${path}.items`));
    return;
  }
  join.items.forEach((item, index) => validateJoinItem(item, `${path}.items.${index}`, diagnostics));
}

function validateValueExpression(expr, path, diagnostics) {
  if (typeof expr === 'string') {
    validatePath(expr, path, diagnostics, 'path ref');
    return;
  }
  validateExpression(expr, path, diagnostics);
}

function validateSelect(select, path, diagnostics) {
  if (typeof select === 'string') {
    validatePath(select, path, diagnostics, 'collect.select path');
    return;
  }
  if (!isPlainObject(select)) {
    diagnostics.push(diag('MAPPINGS_OPERATOR_UNSUPPORTED', 'error', 'collect.select must be a PathRef string or object projection of PathRef values', path));
    return;
  }
  for (const [key, value] of Object.entries(select)) {
    if (!isSafeObjectKey(key)) diagnostics.push(diag('MAPPINGS_PROJECTION_KEY_FORBIDDEN', 'error', 'collect.select projection key contains a forbidden object key segment', `${path}.${key}`));
    if (typeof value !== 'string') diagnostics.push(diag('MAPPINGS_OPERATOR_UNSUPPORTED', 'error', `collect.select.${key} must be a PathRef string`, `${path}.${key}`));
    else validatePath(value, `${path}.${key}`, diagnostics, `collect.select.${key}`);
  }
}

export function validateExpression(expr, path, diagnostics) {
  if (!isPlainObject(expr)) {
    diagnostics.push(diag('MAPPINGS_OPERATOR_UNSUPPORTED', 'error', 'mapping expression must be an object', path));
    return;
  }

  const keys = Object.keys(expr);
  const operators = keys.filter((key) => ALLOWED_OPERATORS.has(key) || FORBIDDEN_V2_OPERATORS.has(key));
  for (const key of keys) {
    if (FORBIDDEN_V2_OPERATORS.has(key)) diagnostics.push(diag('MAPPINGS_OPERATOR_UNSUPPORTED', 'error', `Operator "${key}" is not supported in mappings v3. See migration guide.`, `${path}.${key}`));
    else if (!ALLOWED_OPERATORS.has(key)) diagnostics.push(diag('MAPPINGS_OPERATOR_UNSUPPORTED', 'error', `Operator or field "${key}" is not supported in mappings v3`, `${path}.${key}`));
  }
  if (operators.length !== 1) {
    diagnostics.push(diag('MAPPINGS_OPERATOR_UNSUPPORTED', 'error', 'mapping expression must contain exactly one supported operator', path));
    return;
  }

  if ('from' in expr) validatePath(expr.from, `${path}.from`, diagnostics, 'from path');
  if ('const' in expr) {
    validateJsonSafe(expr.const, 'MAPPINGS_CONST_NOT_JSON_SAFE', `${path}.const`, diagnostics, 'const value must be JSON-safe');
    return;
  }

  if ('text' in expr) {
    const t = expr.text;
    if (!isPlainObject(t)) {
      diagnostics.push(diag('MAPPINGS_OPERATOR_UNSUPPORTED', 'error', 'text must be an object', `${path}.text`));
      return;
    }
    const allowed = new Set(['from', 'trim', 'spaces', 'case']);
    for (const key of Object.keys(t)) if (!allowed.has(key)) diagnostics.push(diag('MAPPINGS_OPERATOR_UNSUPPORTED', 'error', `text field "${key}" is not supported`, `${path}.text.${key}`));
    validatePath(t.from, `${path}.text.from`, diagnostics, 'text.from');
    if ('trim' in t && typeof t.trim !== 'boolean') diagnostics.push(diag('MAPPINGS_OPERATOR_UNSUPPORTED', 'error', 'text.trim must be boolean', `${path}.text.trim`));
    if ('spaces' in t && !['preserve', 'normalize'].includes(t.spaces)) diagnostics.push(diag('MAPPINGS_OPERATOR_UNSUPPORTED', 'error', 'text.spaces must be preserve or normalize', `${path}.text.spaces`));
    if ('case' in t && !['preserve', 'upper', 'lower'].includes(t.case)) diagnostics.push(diag('MAPPINGS_OPERATOR_UNSUPPORTED', 'error', 'text.case must be preserve, upper, or lower', `${path}.text.case`));
  }

  if ('removeNonDigits' in expr) validatePath(expr.removeNonDigits, `${path}.removeNonDigits`, diagnostics, 'removeNonDigits path');

  if ('dictionary' in expr) {
    const d = expr.dictionary;
    if (!isPlainObject(d)) {
      diagnostics.push(diag('MAPPINGS_OPERATOR_UNSUPPORTED', 'error', 'dictionary must be an object', `${path}.dictionary`));
      return;
    }
    const allowed = new Set(['from', 'values', 'default']);
    for (const key of Object.keys(d)) if (!allowed.has(key)) diagnostics.push(diag('MAPPINGS_OPERATOR_UNSUPPORTED', 'error', `dictionary field "${key}" is not supported`, `${path}.dictionary.${key}`));
    validatePath(d.from, `${path}.dictionary.from`, diagnostics, 'dictionary.from');
    validateJsonObject(d.values, 'MAPPINGS_DICTIONARY_VALUES_INVALID', `${path}.dictionary.values`, diagnostics, 'dictionary.values must be a JSON-safe object');
    if ('default' in d) validateJsonSafe(d.default, 'MAPPINGS_DICTIONARY_DEFAULT_NOT_JSON_SAFE', `${path}.dictionary.default`, diagnostics, 'dictionary.default must be JSON-safe');
  }

  if ('coalesce' in expr) {
    if (!Array.isArray(expr.coalesce) || expr.coalesce.length === 0) diagnostics.push(diag('MAPPINGS_OPERATOR_UNSUPPORTED', 'error', 'coalesce must be a non-empty array', `${path}.coalesce`));
    else expr.coalesce.forEach((candidate, index) => validateValueExpression(candidate, `${path}.coalesce.${index}`, diagnostics));
  }

  if ('equals' in expr) {
    if (!Array.isArray(expr.equals) || expr.equals.length !== 2) diagnostics.push(diag('MAPPINGS_OPERATOR_UNSUPPORTED', 'error', 'equals must be a two-item array', `${path}.equals`));
    else {
      validatePath(expr.equals[0], `${path}.equals.0`, diagnostics, 'equals path');
      validateScalar(expr.equals[1], 'MAPPINGS_OPERATOR_VALUE_NOT_JSON_SAFE', `${path}.equals.1`, diagnostics, 'equals expected value must be a JSON scalar');
    }
  }

  if ('exists' in expr) validatePath(expr.exists, `${path}.exists`, diagnostics, 'exists path');

  for (const op of ['count', 'existsAny', 'findOne']) {
    if (op in expr) {
      const spec = expr[op];
      if (!isPlainObject(spec)) diagnostics.push(diag('MAPPINGS_OPERATOR_UNSUPPORTED', 'error', `${op} must be an object`, `${path}.${op}`));
      else {
        const allowed = new Set(['from', 'where']);
        for (const key of Object.keys(spec)) if (!allowed.has(key)) diagnostics.push(diag('MAPPINGS_OPERATOR_UNSUPPORTED', 'error', `${op} field "${key}" is not supported`, `${path}.${op}.${key}`));
        validatePath(spec.from, `${path}.${op}.from`, diagnostics, `${op}.from`);
        validateWhere(spec.where, `${path}.${op}.where`, diagnostics);
      }
    }
  }

  if ('containsValue' in expr) {
    const spec = expr.containsValue;
    if (!isPlainObject(spec)) diagnostics.push(diag('MAPPINGS_OPERATOR_UNSUPPORTED', 'error', 'containsValue must be an object', `${path}.containsValue`));
    else {
      const allowed = new Set(['from', 'value']);
      for (const key of Object.keys(spec)) if (!allowed.has(key)) diagnostics.push(diag('MAPPINGS_OPERATOR_UNSUPPORTED', 'error', `containsValue field "${key}" is not supported`, `${path}.containsValue.${key}`));
      validatePath(spec.from, `${path}.containsValue.from`, diagnostics, 'containsValue.from');
      if (!('value' in spec)) diagnostics.push(diag('MAPPINGS_OPERATOR_UNSUPPORTED', 'error', 'containsValue.value is required', `${path}.containsValue.value`));
      else validateScalar(spec.value, 'MAPPINGS_OPERATOR_VALUE_NOT_JSON_SAFE', `${path}.containsValue.value`, diagnostics, 'containsValue.value must be a JSON scalar');
    }
  }

  if ('collect' in expr) {
    const spec = expr.collect;
    if (!isPlainObject(spec)) diagnostics.push(diag('MAPPINGS_OPERATOR_UNSUPPORTED', 'error', 'collect must be an object', `${path}.collect`));
    else {
      const allowed = new Set(['from', 'where', 'select']);
      for (const key of Object.keys(spec)) if (!allowed.has(key)) diagnostics.push(diag('MAPPINGS_OPERATOR_UNSUPPORTED', 'error', `collect field "${key}" is not supported`, `${path}.collect.${key}`));
      validatePath(spec.from, `${path}.collect.from`, diagnostics, 'collect.from');
      validateWhere(spec.where, `${path}.collect.where`, diagnostics);
      if ('select' in spec) validateSelect(spec.select, `${path}.collect.select`, diagnostics);
    }
  }

  if ('join' in expr) validateJoin(expr.join, `${path}.join`, diagnostics);
}

export function validateMappingsSourceV3(source) {
  const diagnostics = [];

  if (!isPlainObject(source)) {
    diagnostics.push(diag('MAPPINGS_SOURCE_INVALID', 'error', 'source must be a non-null object'));
    return { ok: false, diagnostics };
  }

  for (const key of Object.keys(source)) {
    if (!ALLOWED_TOP_LEVEL_FIELDS.has(key)) {
      if (key === 'sources') diagnostics.push(diag('MAPPINGS_LEGACY_SOURCES_FORBIDDEN', 'error', 'Field "sources" is not allowed in mappings v3. Use single input object paths like "$.*".', 'sources'));
      else diagnostics.push(diag('MAPPINGS_SOURCE_FORBIDDEN_FIELD', 'error', `Field "${key}" is not allowed in mappings v3 source.`, key));
    }
  }

  if (typeof source.mappingId !== 'string' || !source.mappingId.trim()) diagnostics.push(diag('MAPPINGS_MAPPING_ID_MISSING', 'error', 'mappingId must be a non-empty string', 'mappingId'));
  if (!VALID_KINDS.has(source.kind)) diagnostics.push(diag(source.kind === undefined ? 'MAPPINGS_KIND_MISSING' : 'MAPPINGS_KIND_INVALID', 'error', 'kind must be one of: payload, facts, result', 'kind'));
  if (typeof source.title !== 'string' || !source.title.trim()) diagnostics.push(diag('MAPPINGS_TITLE_MISSING', 'error', 'title must be a non-empty string', 'title'));
  if (typeof source.description !== 'string' || !source.description.trim()) diagnostics.push(diag('MAPPINGS_DESCRIPTION_MISSING', 'error', 'description must be a non-empty string', 'description'));
  if ('metadata' in source) validateJsonObject(source.metadata, 'MAPPINGS_METADATA_INVALID', 'metadata', diagnostics, 'metadata must be a JSON-safe plain object');

  if (!isPlainObject(source.output)) {
    diagnostics.push(diag('MAPPINGS_OUTPUT_MISSING', 'error', 'output must be a non-empty object', 'output'));
    return { ok: !hasErrors(diagnostics), diagnostics };
  }
  if (Object.keys(source.output).length === 0) diagnostics.push(diag('MAPPINGS_OUTPUT_EMPTY', 'error', 'output must have at least one field', 'output'));

  for (const [targetPath, expr] of Object.entries(source.output)) {
    validateTargetPath(targetPath, `output.${targetPath}`, diagnostics);
    validateExpression(expr, `output.${targetPath}`, diagnostics);
  }

  if (source.kind === 'facts') {
    for (const field of Object.keys(source.output ?? {})) {
      if (DECISION_LIKE_NAMES.test(field)) diagnostics.push(diag('MAPPINGS_FACTS_DECISION_LIKE_FIELD', 'warning', `Field "${field}" looks like a decision-level field. Facts should describe situation state, not choices.`, `output.${field}`));
      if (RESULT_LIKE_NAMES.test(field)) diagnostics.push(diag('MAPPINGS_FACTS_RESULT_LIKE_FIELD', 'warning', `Field "${field}" looks like a result-level field. Facts should describe situation state, not process outcomes.`, `output.${field}`));
      if (field.includes('.')) diagnostics.push(diag('MAPPINGS_FACTS_DEEP_OUTPUT_PATH', 'warning', `Field "${field}" is a deep output path. Facts are easier to inspect when kept flat.`, `output.${field}`));
    }
  }

  if (source.kind === 'result') {
    if (!('status' in source.output)) diagnostics.push(diag('MAPPINGS_RESULT_STATUS_MISSING', 'error', 'result mapping must produce "status" field', 'output'));
    if (!('outcome' in source.output)) diagnostics.push(diag('MAPPINGS_RESULT_OUTCOME_MISSING', 'warning', 'result mapping should produce "outcome" field for TERMINAL.resultRef compatibility', 'output'));
  }

  if (source.kind === 'payload') {
    for (const field of Object.keys(source.output ?? {})) {
      if (DECISION_LIKE_NAMES.test(field)) diagnostics.push(diag('MAPPINGS_PAYLOAD_DECISION_LIKE_FIELD', 'warning', `Field "${field}" looks like a decision-level field. Payload mappings should not choose outcomes.`, `output.${field}`));
    }
  }

  return { ok: !hasErrors(diagnostics), diagnostics };
}
