import { prepareMappings, executeMappings } from '../dist/index.js';

const source = {
  mappingId: 'trace.verbose.v1',
  sources: { raw: 'object' },
  output: {
    'profile.email': { lowercase: 'sources.raw.email' },
    'profile.phone': { removeNonDigits: 'sources.raw.phone' },
  },
};

const artifact = prepareMappings(source);
const result = executeMappings(artifact, {
  raw: {
    email: 'ADA@EXAMPLE.COM',
    phone: '+49 123-456-789',
  },
}, {
  trace: 'verbose',
  redact: 'mask',
});

console.log(JSON.stringify(result, null, 2));
