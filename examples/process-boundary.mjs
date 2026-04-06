import { prepareMappings, executeMappings } from '../dist/index.js';

const source = {
  mappingId: 'facts.build_profile_flags.v1',
  sources: { raw: 'object' },
  output: {
    'facts.hasEmail': { exists: 'sources.raw.email' },
    'facts.hasPhone': { exists: 'sources.raw.phone' },
    'facts.country': {
      mapValue: {
        from: 'sources.raw.countryCode',
        map: { DEU: 'DE', FRA: 'FR', ESP: 'ES' },
        fallback: 'passthrough',
      },
    },
  },
};

const artifact = prepareMappings(source);
const result = executeMappings(artifact, {
  raw: {
    email: 'ada@example.com',
    countryCode: 'DEU',
  },
});

console.log('normalized boundary output:', result.output);
