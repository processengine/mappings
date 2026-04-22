import { validateDefinition } from '../internal/validator.js';

export function validateMappingsSource(source) {
  try {
    const diagnostics = validateDefinition(source);
    const hasErrors = diagnostics.some((item) => item.level !== 'warning');
    return { ok: !hasErrors, diagnostics };
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
