import { prepareMappings, executeMappings, MappingsRuntimeError } from '../dist/index.js';

const source = {
  mappingId: 'profile.runtime_error.v1',
  sources: { raw: 'object' },
  output: {
    'profile.name': { from: 'sources.raw.name' },
  },
};

const artifact = prepareMappings(source);

try {
  executeMappings(artifact, {
    raw: 'not-an-object',
  });
} catch (error) {
  if (error instanceof MappingsRuntimeError) {
    console.log('runtime error code:', error.code);
    console.log('runtime details:', error.details);
  } else {
    throw error;
  }
}
