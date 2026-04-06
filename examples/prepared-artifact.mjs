import { prepareMappings, executeMappings } from '../dist/index.js';

const source = {
  mappingId: 'artifact.boundary.v1',
  sources: { raw: 'object' },
  output: {
    'profile.label': { from: 'sources.raw.label' },
  },
};

const artifact = prepareMappings(source);

console.log('artifact public view:', {
  type: artifact.type,
  mappingId: artifact.mappingId,
  version: artifact.version,
});

console.log('execution result:', executeMappings(artifact, {
  raw: { label: 'prepared-runtime-entity' },
}));
