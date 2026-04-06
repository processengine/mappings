import { validateMappings, prepareMappings, executeMappings } from '../dist/index.js';

const source = {
  mappingId: 'profile.normalize.v1',
  sources: { raw: 'object' },
  output: {
    'profile.displayName': { normalizeSpaces: 'sources.raw.fullName' },
    'profile.email': { lowercase: 'sources.raw.email' },
    'profile.hasTags': { exists: 'sources.raw.tags' },
  },
};

const input = {
  raw: {
    fullName: '  Ada   Lovelace  ',
    email: 'ADA@EXAMPLE.COM',
    tags: ['math'],
  },
};

console.log('validate:', validateMappings(source));
const artifact = prepareMappings(source);
console.log('artifact:', artifact);
console.log('result:', executeMappings(artifact, input));
