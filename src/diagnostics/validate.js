import { validateDefinition } from '../internal/validator.js';

export function validateMappingsSource(source) {
  try {
    const diagnostic = validateDefinition(source);
    if (!diagnostic) {
      return { ok: true, diagnostics: [] };
    }
    return { ok: false, diagnostics: [diagnostic] };
  } catch (cause) {
    return {
      ok: false,
      diagnostics: [{
        code: 'INTERNAL_ERROR',
        level: 'error',
        message: cause instanceof Error ? cause.message : 'Unexpected internal error during validation',
        details: { phase: 'validate' },
      }],
    };
  }
}
