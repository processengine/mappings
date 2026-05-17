import { executeV3Plan, evalExpression } from '../v3/execute.js';
import { validateExpression } from '../v3/validate.js';
import { isJsonSafe, isPlainObject, isValidTargetPath, setNestedPath } from '../v3/path.js';
import { MappingsRuntimeError } from '../errors/MappingsRuntimeError.js';

const TRACE_MODES = new Set(['off', 'basic', 'verbose']);
const VALID_KINDS = new Set(['payload', 'facts', 'result']);
const ALLOWED_OPTION_KEYS = new Set(['trace', 'redact']);

function runtimeError(message, code, cause) {
  return new MappingsRuntimeError(message, { code, cause });
}

function assertPlainJsonObject(value, message, code) {
  if (!isPlainObject(value) || !isJsonSafe(value)) throw runtimeError(message, code);
}

function validateExecutionOptions(options) {
  if (options === undefined) return {};
  if (!isPlainObject(options)) throw runtimeError('executeMappings options must be a plain object when provided', 'MAPPINGS_EXECUTION_OPTIONS_INVALID');
  for (const key of Object.keys(options)) {
    if (!ALLOWED_OPTION_KEYS.has(key)) throw runtimeError(`executeMappings option "${key}" is not supported`, 'MAPPINGS_EXECUTION_OPTIONS_INVALID');
  }
  if ('trace' in options && !TRACE_MODES.has(options.trace)) {
    throw runtimeError('trace must be "off", "basic", or "verbose"', 'MAPPINGS_TRACE_MODE_INVALID');
  }
  if ('redact' in options) {
    const r = options.redact;
    const valid = r === 'mask' || typeof r === 'function' || (isPlainObject(r) && typeof r.redact === 'function');
    if (!valid) throw runtimeError('redact must be "mask", a function, or an object with redact(value)', 'MAPPINGS_REDACTOR_INVALID');
  }
  return options;
}

function assertThenJsonSafe(value, code, message) {
  if (!isJsonSafe(value)) throw runtimeError(message, code);
}

function redactValue(value, redactor) {
  let redacted = value;
  if (redactor === 'mask') redacted = '[REDACTED]';
  else if (typeof redactor === 'function') redacted = redactor(value);
  else if (redactor && typeof redactor.redact === 'function') redacted = redactor.redact(value);
  assertThenJsonSafe(redacted, 'MAPPINGS_TRACE_NOT_JSON_SAFE', 'redacted trace value must be JSON-safe');
  return redacted;
}

function validatePreparedExpression(expr, path) {
  const diagnostics = [];
  validateExpression(expr, path, diagnostics);
  const errors = diagnostics.filter((d) => d.level === 'error');
  if (errors.length > 0) {
    throw runtimeError(`prepared artifact contains an invalid expression at ${path}`, 'MAPPINGS_PREPARED_ARTIFACT_INVALID');
  }
}

function assertPreparedArtifact(artifact) {
  if (!isPlainObject(artifact) || artifact.artifactType !== 'mappings' || artifact.version !== 'v3') {
    throw runtimeError('executeMappings expects a prepared v3 artifact from prepareMappings()', 'MAPPINGS_INVALID_ARTIFACT_VERSION');
  }
  if (typeof artifact.mappingId !== 'string' || !artifact.mappingId.trim()) throw runtimeError('prepared artifact mappingId must be a non-empty string', 'MAPPINGS_PREPARED_ARTIFACT_INVALID');
  if (!VALID_KINDS.has(artifact.kind)) throw runtimeError('prepared artifact kind is invalid', 'MAPPINGS_PREPARED_ARTIFACT_INVALID');
  if (typeof artifact.title !== 'string' || !artifact.title.trim()) throw runtimeError('prepared artifact title must be a non-empty string', 'MAPPINGS_PREPARED_ARTIFACT_INVALID');
  if (typeof artifact.description !== 'string' || !artifact.description.trim()) throw runtimeError('prepared artifact description must be a non-empty string', 'MAPPINGS_PREPARED_ARTIFACT_INVALID');
  if (typeof artifact.getDefinition !== 'function') throw runtimeError('prepared artifact getDefinition must be a function', 'MAPPINGS_PREPARED_ARTIFACT_INVALID');
  if (!Array.isArray(artifact.compiledPlan) || artifact.compiledPlan.length === 0) throw runtimeError('prepared artifact compiledPlan must be a non-empty array', 'MAPPINGS_PREPARED_ARTIFACT_INVALID');
  artifact.compiledPlan.forEach((item, index) => {
    if (!isPlainObject(item)) throw runtimeError(`prepared artifact compiledPlan.${index} must be an object`, 'MAPPINGS_PREPARED_ARTIFACT_INVALID');
    if (typeof item.targetPath !== 'string' || !item.targetPath.trim()) throw runtimeError(`prepared artifact compiledPlan.${index}.targetPath must be a non-empty string`, 'MAPPINGS_PREPARED_ARTIFACT_INVALID');
    if (!isValidTargetPath(item.targetPath)) throw runtimeError(`prepared artifact compiledPlan.${index}.targetPath contains a forbidden or invalid segment`, 'MAPPINGS_PREPARED_ARTIFACT_INVALID');
    validatePreparedExpression(item.expr, `compiledPlan.${index}.expr`);
  });
}

function executeWithTrace(artifact, input, options) {
  const output = {};
  const trace = [];
  const mode = options.trace === 'verbose' ? 'verbose' : 'basic';
  for (const { targetPath, expr } of artifact.compiledPlan) {
    const value = evalExpression(expr, input);
    if (value !== undefined) setNestedPath(output, targetPath, value);
    const event = {
      kind: 'MAPPING_FIELD_EVALUATED',
      artifactType: 'mappings',
      artifactId: artifact.mappingId,
      step: `output:${targetPath}`,
      at: new Date().toISOString(),
      outcome: 'completed',
      details: { targetPath },
    };
    if (mode === 'verbose') {
      event.input = redactValue(input, options.redact);
      event.output = redactValue(value === undefined ? null : value, options.redact);
    }
    trace.push(event);
  }
  if (!isJsonSafe(output)) throw runtimeError('output is not JSON-safe', 'MAPPINGS_OUTPUT_NOT_JSON_SAFE');
  if (!isJsonSafe(trace)) throw runtimeError('trace is not JSON-safe', 'MAPPINGS_TRACE_NOT_JSON_SAFE');
  return { output, trace };
}

export function executeMappings(artifact, input, options) {
  const safeOptions = validateExecutionOptions(options);
  assertPreparedArtifact(artifact);
  assertPlainJsonObject(input, 'input must be a JSON-safe object', 'MAPPINGS_INPUT_NOT_JSON_SAFE');

  try {
    const result = safeOptions.trace !== undefined && safeOptions.trace !== 'off' ? executeWithTrace(artifact, input, safeOptions) : { output: executeV3Plan(artifact.compiledPlan, input) };
    if (!isJsonSafe(result.output)) throw runtimeError('output is not JSON-safe', 'MAPPINGS_OUTPUT_NOT_JSON_SAFE');
    if (result.trace && !isJsonSafe(result.trace)) throw runtimeError('trace is not JSON-safe', 'MAPPINGS_TRACE_NOT_JSON_SAFE');
    return result;
  } catch (err) {
    if (err instanceof MappingsRuntimeError) throw err;
    if (err?.code === 'MAPPINGS_FIND_ONE_NOT_FOUND' || err?.code === 'MAPPINGS_FIND_ONE_NOT_UNIQUE') throw runtimeError(err.message, err.code);
    if (err?.code === 'MAPPINGS_TARGET_PATH_FORBIDDEN_SEGMENT') throw runtimeError(err.message, err.code, err);
    throw runtimeError(err?.message ?? 'Execution failed', 'MAPPINGS_RUNTIME_ERROR', err);
  }
}
