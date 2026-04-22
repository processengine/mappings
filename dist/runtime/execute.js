import { execute as executeLegacy } from '../internal/executor.js';
import { executeCompiledPlan } from '../internal/compiledExecutor.js';
import { isPlainObject, validateJsonSafeValue } from '../internal/path.js';
import { createTraceRecorder } from '../trace/createTraceRecorder.js';
import { isPreparedMappingsArtifact } from './artifact.js';
import { MappingsRuntimeError } from '../errors/MappingsRuntimeError.js';

function assertValidSources(definition, input) {
  if (!isPlainObject(input)) {
    throw new MappingsRuntimeError('sources must be a plain object', {
      code: 'INVALID_SOURCE_TYPE',
      details: { phase: 'execute' },
    });
  }

  for (const sourceName of Object.keys(definition.sources)) {
    if (!(sourceName in input)) {
      throw new MappingsRuntimeError(`Source '${sourceName}' not provided in input`, {
        code: 'MISSING_SOURCE',
        details: { sourceName, phase: 'execute' },
      });
    }
    const sourceValue = input[sourceName];
    if (!isPlainObject(sourceValue)) {
      throw new MappingsRuntimeError(`Source '${sourceName}' must be a plain object`, {
        code: 'INVALID_SOURCE_TYPE',
        details: { sourceName, phase: 'execute' },
      });
    }
    const contentErr = validateJsonSafeValue(sourceValue, sourceName);
    if (contentErr) {
      throw new MappingsRuntimeError(contentErr.message, {
        code: contentErr.code,
        details: contentErr,
      });
    }
  }
}

export function executeMappingsInternal(artifact, input, options = {}) {
  if (!isPreparedMappingsArtifact(artifact)) {
    throw new MappingsRuntimeError('executeMappings expects a prepared mappings artifact.', {
      code: 'INVALID_ARTIFACT',
    });
  }

  const definition = artifact.getDefinition();
  assertValidSources(definition, input);

  const traceLevel = options.trace ?? false;
  const captureTrace = traceLevel === 'basic' || traceLevel === 'verbose';
  const runtimeResult = { output: {} };

  if (artifact.version === 'v2' && artifact.getCompiledPlan()) {
    const executed = executeCompiledPlan(artifact.getCompiledPlan(), input);
    runtimeResult.output = executed.output;
    if (captureTrace) {
      const recorder = createTraceRecorder({ artifactId: artifact.mappingId, level: traceLevel, redact: options.redact });
      recorder.recordCompiledEntries(executed.trace ?? []);
      runtimeResult.trace = recorder.finalize();
    }
    return runtimeResult;
  }

  const { result, trace: legacyTrace } = executeLegacy(definition, input, captureTrace);
  runtimeResult.output = result;
  if (captureTrace) {
    const recorder = createTraceRecorder({ artifactId: artifact.mappingId, level: traceLevel, redact: options.redact });
    recorder.recordLegacyEntries(legacyTrace ?? []);
    runtimeResult.trace = recorder.finalize();
  }
  return runtimeResult;
}
