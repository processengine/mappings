import { executeMappingsInternal } from '../runtime/execute.js';

export function executeMappings(artifact, input, options = {}) {
  return executeMappingsInternal(artifact, input, options);
}
