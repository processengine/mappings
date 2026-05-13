import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareMappings, executeMappings, validateMappings } from '../dist/index.js';

const source = {
  mappingId: 'beneficiary.issues.facts.v1',
  sources: { rules: 'object', findClient: 'object' },
  output: {
    'facts.errorCount': {
      count: {
        from: 'sources.rules.issues[*]',
        where: { field: 'level', equals: 'ERROR' },
      },
    },
    'facts.warningCodes': {
      collect: {
        from: 'sources.rules.issues[*]',
        where: { field: 'level', equals: 'WARNING' },
        value: 'code',
      },
    },
    'facts.merchantErrors': {
      collectObject: {
        from: 'sources.rules.issues[*]',
        where: { field: 'level', equals: 'ERROR' },
        fields: {
          code: 'code',
          message: 'message',
          field: 'field',
        },
      },
    },
    'facts.hasException': {
      existsAny: {
        from: 'sources.rules.issues[*]',
        where: { field: 'level', equals: 'EXCEPTION' },
      },
    },
    'facts.allErrorsInContacts': {
      existsAll: {
        from: 'sources.rules.issues[*]',
        where: { field: 'level', equals: 'ERROR' },
        match: { field: 'field', startsWith: 'beneficiary.contacts.' },
      },
    },
    'facts.foundClient': {
      pickFirst: {
        from: 'sources.findClient.clients[*]',
      },
    },
  },
};

const artifact = prepareMappings(source);

const input = {
  rules: {
    issues: [
      { level: 'ERROR', code: 'E1', field: 'beneficiary.contacts.phone' },
      { level: 'ERROR', code: 'E3', message: 'Need email', field: 'beneficiary.contacts.email' },
      { level: 'WARNING', code: 'W1', field: 'beneficiary.address.city' },
      { level: 'ERROR', code: 'E2', field: 'beneficiary.contacts.email' },
      { level: 'EXCEPTION', code: 'X1', field: 'beneficiary.identity.inn' },
    ],
  },
  findClient: {
    clients: [
      { id: 'C1', cardLastModifiedAt: '2026-04-01T00:00:00Z' },
      { id: 'C2' },
    ],
  },
};

test('prepareMappings returns v2 artifact for array DSL', () => {
  assert.equal(artifact.version, 'v2');
});

test('array DSL operators build facts from issues and clients arrays', () => {
  const result = executeMappings(artifact, input);
  assert.deepEqual(result.output, {
    facts: {
      errorCount: 3,
      warningCodes: ['W1'],
      merchantErrors: [
        { code: 'E1', field: 'beneficiary.contacts.phone' },
        { code: 'E3', message: 'Need email', field: 'beneficiary.contacts.email' },
        { code: 'E2', field: 'beneficiary.contacts.email' },
      ],
      hasException: true,
      allErrorsInContacts: true,
      foundClient: { id: 'C1', cardLastModifiedAt: '2026-04-01T00:00:00Z' },
    },
  });
});

test('pickFirst returns null for empty selection', () => {
  const result = executeMappings(artifact, { ...input, findClient: { clients: [] } });
  assert.equal(result.output.facts.foundClient, null);
});

test('existsAll on empty set is true', () => {
  const result = executeMappings(artifact, { ...input, rules: { issues: [] } });
  assert.equal(result.output.facts.allErrorsInContacts, true);
});

test('collectObject drops fully unresolved items and keeps partial objects', () => {
  const result = executeMappings(artifact, {
    ...input,
    rules: {
      issues: [
        { level: 'ERROR', unknown: 'x' },
        { level: 'ERROR', code: 'E4' },
      ],
    },
  }, { trace: 'basic' });
  assert.deepEqual(result.output.facts.merchantErrors, [{ code: 'E4' }]);
  const aggregate = result.trace.find((event) => event.target === 'facts.merchantErrors');
  assert.equal(aggregate.details.droppedCount, 1);
  assert.equal(aggregate.details.droppedFieldCount, 5);
  assert.equal(aggregate.details.partialObjectCount, 1);
});

test('validateMappings returns warning for empty in comparator', () => {
  const validation = validateMappings({
    mappingId: 'warning.empty.in.v1',
    sources: { rules: 'object' },
    output: {
      'facts.none': {
        existsAny: {
          from: 'sources.rules.issues[*]',
          where: { field: 'level', in: [] },
        },
      },
    },
  });
  assert.equal(validation.ok, true);
  assert.equal(validation.diagnostics[0].code, 'EMPTY_IN_ARRAY');
  assert.equal(validation.diagnostics[0].level, 'warning');
});

test('trace basic returns aggregate events', () => {
  const result = executeMappings(artifact, input, { trace: 'basic' });
  const aggregate = result.trace.find((event) => event.kind === 'mapping.aggregate' && event.target === 'facts.warningCodes');
  assert.ok(aggregate);
  assert.equal(aggregate.details.resultLength, 1);
});

test('validateMappings rejects invalid collectObject fields', () => {
  const validation = validateMappings({
    mappingId: 'invalid.collectObject.v1',
    sources: { rules: 'object' },
    output: {
      'facts.merchantErrors': {
        collectObject: {
          from: 'sources.rules.issues[*]',
          fields: { 'bad[*]': 'code' },
        },
      },
    },
  });
  assert.equal(validation.ok, false);
  assert.ok(validation.diagnostics.some((item) => item.code === 'INVALID_TARGET_PATH'));
});


test('countAtLeast and containsValue build boolean facts', () => {
  const prepared = prepareMappings({
    mappingId: 'array.extra.v1',
    sources: { findClient: 'object', abs: 'object' },
    output: {
      'facts.hasMultipleClients': {
        countAtLeast: {
          from: 'sources.findClient.clients[*]',
          value: 2,
        },
      },
      'facts.hasEmailEmptyField': {
        containsValue: {
          from: 'sources.abs.emptyFields[*]',
          value: 'email',
        },
      },
    },
  });

  const result = executeMappings(prepared, {
    findClient: { clients: [{ id: 'C1' }, { id: 'C2' }] },
    abs: { emptyFields: ['phone', 'email'] },
  }, { trace: 'basic' });

  assert.deepEqual(result.output, {
    facts: {
      hasMultipleClients: true,
      hasEmailEmptyField: true,
    },
  });
  assert.equal(result.trace.find((event) => event.target === 'facts.hasMultipleClients').details.threshold, 2);
});

test('countAtLeast and containsValue return false for non-matching or missing arrays', () => {
  const prepared = prepareMappings({
    mappingId: 'array.extra.false.v1',
    sources: { findClient: 'object', abs: 'object' },
    output: {
      'facts.hasMultipleClients': {
        countAtLeast: {
          from: 'sources.findClient.clients[*]',
          value: 2,
        },
      },
      'facts.hasEmailEmptyField': {
        containsValue: {
          from: 'sources.abs.emptyFields[*]',
          value: 'email',
        },
      },
      'facts.hasMissingScalar': {
        containsValue: {
          from: 'sources.abs.missingFields[*]',
          value: 'email',
        },
      },
    },
  });

  const result = executeMappings(prepared, {
    findClient: { clients: [{ id: 'C1' }] },
    abs: { emptyFields: ['phone'] },
  });

  assert.deepEqual(result.output, {
    facts: {
      hasMultipleClients: false,
      hasEmailEmptyField: false,
      hasMissingScalar: false,
    },
  });
});

test('countAtLeast and containsValue validate arguments', () => {
  const invalid = validateMappings({
    mappingId: 'array.extra.invalid.v1',
    sources: { abs: 'object' },
    output: {
      'facts.badCount': {
        countAtLeast: { from: 'sources.abs.items[*]', value: -1 },
      },
      'facts.badContains': {
        containsValue: { from: 'sources.abs.items[*]', value: { not: 'scalar' } },
      },
    },
  });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.diagnostics.some((item) => item.message.includes("countAtLeast")));
  assert.ok(invalid.diagnostics.some((item) => item.message.includes("containsValue")));
});
