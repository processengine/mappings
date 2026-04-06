import { validateMappings, prepareMappings, MappingsCompileError } from '../dist/index.js';

const invalidSource = {
  mappingId: 'broken.mapping.v1',
  sources: { raw: 'object' },
  output: {
    'profile.name': { trim: true },
    'profile.email': { lowercase: 'raw.email' },
  },
};

const validation = validateMappings(invalidSource);
console.log('validation:', validation);

try {
  prepareMappings(invalidSource);
} catch (error) {
  if (error instanceof MappingsCompileError) {
    console.log('compile error code:', error.code);
    console.log('compile diagnostics:', error.diagnostics);
  } else {
    throw error;
  }
}
