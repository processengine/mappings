import { prepareMappings, executeMappings } from '../dist/index.js';
import mapping from './mappings/arrays/issues_to_facts.v1.json' with { type: 'json' };
import sources from './sources/issues_and_find_client.json' with { type: 'json' };

const artifact = prepareMappings(mapping);
const result = executeMappings(artifact, sources, { trace: 'basic' });

console.log(JSON.stringify(result, null, 2));
