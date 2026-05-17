import { validateMappingsSourceV3 } from '../v3/validate.js';

export function validateMappings(source) {
  return validateMappingsSourceV3(source);
}
