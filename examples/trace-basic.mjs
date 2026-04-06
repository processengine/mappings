import { prepareMappings, executeMappings } from '../dist/index.js';

const source = {
  mappingId: 'trace.basic.v1',
  sources: { raw: 'object' },
  output: {
    'profile.name': { normalizeSpaces: 'sources.raw.fullName' },
    'profile.hasEmail': { exists: 'sources.raw.email' },
  },
};

const artifact = prepareMappings(source);
const result = executeMappings(artifact, {
  raw: {
    fullName: '  Ada   Lovelace  ',
    email: 'ada@example.com',
  },
}, { trace: 'basic' });

console.log(JSON.stringify(result, null, 2));
