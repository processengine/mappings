import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareMappings, executeMappings } from '../dist/index.js';

const source = {
  mappingId: 'trace.person.v1',
  sources: { input: 'object' },
  output: {
    'person.name': { trim: 'sources.input.name' },
    'person.maskedInn': { from: 'sources.input.inn' },
  },
};

const artifact = prepareMappings(source);

test('trace false omits trace', () => {
  const result = executeMappings(artifact, { input: { name: '  Alice  ', inn: '1234567890' } }, { trace: false });
  assert.equal(result.trace, undefined);
});

test('trace basic returns canonical compact events', () => {
  const result = executeMappings(artifact, { input: { name: '  Alice  ', inn: '1234567890' } }, { trace: 'basic' });
  assert.ok(Array.isArray(result.trace));
  assert.equal(result.trace[0].artifactType, 'mapping');
  assert.equal(result.trace[0].kind, 'mapping.rule');
  assert.equal(result.trace[0].input, undefined);
});

test('trace verbose includes redacted payload fragments', () => {
  const result = executeMappings(
    artifact,
    { input: { name: '  Alice  ', inn: '1234567890' } },
    { trace: 'verbose', redact: 'mask' },
  );
  assert.ok(Array.isArray(result.trace));
  const innEvent = result.trace.find((event) => event.target === 'person.maskedInn');
  assert.ok(innEvent);
  assert.notEqual(innEvent.output, '1234567890');
});
