import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateMappings,
  prepareMappings,
  executeMappings,
  MappingsCompileError,
  MappingsRuntimeError,
} from '../dist/index.js';

const validSource = {
  mappingId: 'contract.person.v1',
  sources: { input: 'object' },
  output: {
    'person.name': { trim: 'sources.input.name' },
    'person.hasInn': { exists: 'sources.input.inn' },
  },
};

test('validateMappings returns canonical result', () => {
  const result = validateMappings(validSource);
  assert.equal(result.ok, true);
  assert.deepEqual(result.diagnostics, []);
});

test('validateMappings returns diagnostics without throw', () => {
  const result = validateMappings({ mappingId: '', sources: { input: 'object' }, output: {} });
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, 'INVALID_MAPPING_ID');
});

test('prepareMappings returns prepared artifact', () => {
  const artifact = prepareMappings(validSource);
  assert.equal(artifact.type, 'mapping');
  assert.equal(artifact.mappingId, 'contract.person.v1');
});

test('prepareMappings throws typed compile error', () => {
  assert.throws(
    () => prepareMappings({ mappingId: '', sources: { input: 'object' }, output: {} }),
    (error) => error instanceof MappingsCompileError && error.code === 'INVALID_MAPPING_ID',
  );
});

test('executeMappings returns success result without envelope', () => {
  const artifact = prepareMappings(validSource);
  const result = executeMappings(artifact, { input: { name: '  Alice  ', inn: '123' } });
  assert.deepEqual(result.output, {
    person: { name: 'Alice', hasInn: true },
  });
  assert.equal('status' in result, false);
});

test('executeMappings throws typed runtime error', () => {
  const artifact = prepareMappings(validSource);
  assert.throws(
    () => executeMappings(artifact, { input: null }),
    (error) => error instanceof MappingsRuntimeError && error.code === 'INVALID_SOURCE_TYPE',
  );
});
