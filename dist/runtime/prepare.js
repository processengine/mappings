import { validateMappingsSource } from '../diagnostics/validate.js';
import { PreparedMappingsArtifact } from './artifact.js';
import { MappingsCompileError } from '../errors/MappingsCompileError.js';
import { compileDefinition } from '../internal/compiler.js';

export function prepareMappingsInternal(source) {
  const validation = validateMappingsSource(source);
  if (!validation.ok) {
    throw new MappingsCompileError('Failed to prepare mappings artifact.', {
      code: validation.diagnostics.find((item) => item.level !== 'warning')?.code ?? 'MAPPINGS_COMPILE_ERROR',
      diagnostics: validation.diagnostics,
    });
  }
  const compiledPlan = compileDefinition(source);
  return new PreparedMappingsArtifact(source, { version: 'v2', compiledPlan });
}
