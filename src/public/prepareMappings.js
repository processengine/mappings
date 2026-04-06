import { prepareMappingsInternal } from '../runtime/prepare.js';

export function prepareMappings(source, options = {}) {
  void options;
  return prepareMappingsInternal(source);
}
