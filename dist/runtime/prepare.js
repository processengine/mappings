import { validateMappingsSource } from '../diagnostics/validate.js';
import { PreparedMappingsArtifact } from './artifact.js';
import { MappingsCompileError } from '../errors/MappingsCompileError.js';

export function prepareMappingsInternal(source) {
  const validation = validateMappingsSource(source);
  if (!validation.ok) {
    throw new MappingsCompileError('Failed to prepare mappings artifact.', {
      code: validation.diagnostics[0]?.code ?? 'MAPPINGS_COMPILE_ERROR',
      diagnostics: validation.diagnostics,
    });
  }
  return new PreparedMappingsArtifact(source);
}
