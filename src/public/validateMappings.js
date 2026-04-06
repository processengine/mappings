import { validateMappingsSource } from '../diagnostics/validate.js';

export function validateMappings(source, options = {}) {
  void options;
  return validateMappingsSource(source);
}
