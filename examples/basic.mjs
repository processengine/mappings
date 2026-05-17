import { validateMappings, prepareMappings, executeMappings } from '@processengine/mappings';

const source = {
  mappingId: 'mappings.example.basic_payload',
  kind: 'payload',
  title: 'Build basic payload',
  description: 'Small ESM example for package consumers.',
  output: {
    name: { text: { from: '$.name', trim: true } },
    phoneDigits: { removeNonDigits: '$.phone' }
  }
};

const validation = validateMappings(source);
if (!validation.ok) throw new Error(JSON.stringify(validation.diagnostics));
const artifact = prepareMappings(source);
const result = executeMappings(artifact, { name: '  Alice  ', phone: '+1 (555) 000-0000' });
console.log(JSON.stringify(result.output));
