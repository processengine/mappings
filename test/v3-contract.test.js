import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateMappings, prepareMappings, executeMappings, MappingsCompileError, MappingsRuntimeError } from '../src/index.js';

const payloadSource = {
  mappingId: 'mappings.test.payload',
  kind: 'payload',
  title: 'Build payload',
  description: 'Builds a normalized payload.',
  output: {
    clientId: { from: '$.client.id' },
    phone: { removeNonDigits: '$.contacts.phone' },
    email: { text: { from: '$.contacts.email', trim: true, case: 'lower' } },
    fullName: { join: { separator: ' ', items: ['$.client.lastName', '$.client.firstName'] } },
    statusClass: { dictionary: { from: '$.status', values: { OK: 'CONTINUE', ERROR: 'STOP' }, default: 'UNKNOWN' } },
  },
};

const factsSource = {
  mappingId: 'mappings.test.facts',
  kind: 'facts',
  title: 'Build facts',
  description: 'Builds decision-ready facts.',
  output: {
    criticalMismatchCount: { count: { from: '$.mismatches[*]', where: { field: 'severity', equals: 'CRITICAL' } } },
    nonCriticalMismatchCount: { count: { from: '$.mismatches[*]', where: { field: 'severity', equals: 'NON_CRITICAL' } } },
    hasAddressErrors: { existsAny: { from: '$.issues[*]', where: { field: 'field', startsWith: 'beneficiary.address.' } } },
    criticalMismatchCodes: { collect: { from: '$.mismatches[*]', where: { field: 'severity', equals: 'CRITICAL' }, select: '$.code' } },
    hasInn: { exists: '$.client.inn' },
  },
};

const resultSource = {
  mappingId: 'mappings.test.result',
  kind: 'result',
  title: 'Build result',
  description: 'Builds terminal result output.',
  output: {
    status: { const: 'FAIL' },
    outcome: { const: 'VALIDATION_REJECTED' },
    errors: { collect: { from: '$.issues[*]', where: { field: 'level', equals: 'ERROR' }, select: { code: '$.code', message: '$.message' } } },
  },
};

test('validateMappings accepts canonical v3 payload/facts/result artifacts', () => {
  assert.equal(validateMappings(payloadSource).ok, true);
  assert.equal(validateMappings(factsSource).ok, true);
  assert.equal(validateMappings(resultSource).ok, true);
});

test('validateMappings accepts output field documentation on expressions', () => {
  const source = {
    ...factsSource,
    output: {
      resultStatus: {
        name: 'Статус результата',
        description: 'Бизнес-статус ответа внешней операции.',
        from: '$.resultStatus',
      },
      selectedClientId: {
        name: 'Выбранная карточка клиента',
        description: 'Идентификатор карточки, выбранной после поиска.',
        coalesce: ['$.selectedClient.id', { const: null }],
      },
    },
  };

  assert.equal(validateMappings(source).ok, true);

  const artifact = prepareMappings(source);
  assert.deepEqual(artifact.compiledPlan[0].expr, { from: '$.resultStatus' });
  assert.deepEqual(artifact.compiledPlan[1].expr, { coalesce: ['$.selectedClient.id', { const: null }] });
  assert.equal(artifact.getDefinition().output.resultStatus.name, 'Статус результата');

  const result = executeMappings(artifact, {
    resultStatus: 'SUCCESS',
    selectedClient: { id: 'C-1' },
  });
  assert.deepEqual(result.output, {
    resultStatus: 'SUCCESS',
    selectedClientId: 'C-1',
  });
});

test('validateMappings rejects invalid output field documentation', () => {
  const invalidName = validateMappings({ ...payloadSource, output: { x: { name: '', description: 'Valid description.', from: '$.x' } } });
  assert.equal(invalidName.ok, false);
  assert.ok(invalidName.diagnostics.some((d) => d.code === 'MAPPINGS_EXPRESSION_METADATA_INVALID' && d.path === 'output.x.name'));

  const invalidDescription = validateMappings({ ...payloadSource, output: { x: { name: 'Valid name', description: 123, from: '$.x' } } });
  assert.equal(invalidDescription.ok, false);
  assert.ok(invalidDescription.diagnostics.some((d) => d.code === 'MAPPINGS_EXPRESSION_METADATA_INVALID' && d.path === 'output.x.description'));
});

test('validateMappings rejects missing required fields and empty output', () => {
  assert.ok(validateMappings({ ...payloadSource, mappingId: '' }).diagnostics.some((d) => d.code === 'MAPPINGS_MAPPING_ID_MISSING'));
  assert.ok(validateMappings({ ...payloadSource, kind: undefined }).diagnostics.some((d) => d.code === 'MAPPINGS_KIND_MISSING'));
  assert.ok(validateMappings({ ...payloadSource, kind: 'dto' }).diagnostics.some((d) => d.code === 'MAPPINGS_KIND_INVALID'));
  assert.ok(validateMappings({ ...payloadSource, title: '' }).diagnostics.some((d) => d.code === 'MAPPINGS_TITLE_MISSING'));
  assert.ok(validateMappings({ ...payloadSource, description: '' }).diagnostics.some((d) => d.code === 'MAPPINGS_DESCRIPTION_MISSING'));
  assert.ok(validateMappings({ ...payloadSource, output: {} }).diagnostics.some((d) => d.code === 'MAPPINGS_OUTPUT_EMPTY'));
});

test('validateMappings rejects v2 source shape and legacy operators', () => {
  for (const op of ['literal', 'mapValue', 'transform', 'template', 'joinNonEmpty', 'collectObject', 'countAtLeast', 'existsAll', 'pickFirst']) {
    const r = validateMappings({ ...payloadSource, output: { x: { [op]: {} } } });
    assert.equal(r.ok, false, `${op} should fail`);
    assert.ok(r.diagnostics.some((d) => d.code === 'MAPPINGS_OPERATOR_UNSUPPORTED'));
  }
  assert.ok(validateMappings({ ...payloadSource, sources: { input: 'object' } }).diagnostics.some((d) => d.code === 'MAPPINGS_LEGACY_SOURCES_FORBIDDEN'));
  assert.ok(validateMappings({ ...payloadSource, version: '3.0.0' }).diagnostics.some((d) => d.code === 'MAPPINGS_SOURCE_FORBIDDEN_FIELD'));
  assert.ok(validateMappings({ ...payloadSource, output: { x: { from: 'sources.input.name' } } }).diagnostics.some((d) => d.code === 'MAPPINGS_PATH_INVALID'));
});

test('role-aware lint reports facts/result/payload diagnostics', () => {
  const facts = validateMappings({ ...factsSource, output: { shouldReject: { const: true }, status: { const: 'FAIL' }, 'client.status': { from: '$.status' } } });
  assert.ok(facts.diagnostics.some((d) => d.code === 'MAPPINGS_FACTS_DECISION_LIKE_FIELD'));
  assert.ok(facts.diagnostics.some((d) => d.code === 'MAPPINGS_FACTS_RESULT_LIKE_FIELD'));
  assert.ok(facts.diagnostics.some((d) => d.code === 'MAPPINGS_FACTS_DEEP_OUTPUT_PATH'));

  const result = validateMappings({ ...resultSource, output: { outcome: { const: 'X' } } });
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some((d) => d.code === 'MAPPINGS_RESULT_STATUS_MISSING'));

  const payload = validateMappings({ ...payloadSource, output: { shouldApprove: { const: true } } });
  assert.equal(payload.ok, true);
  assert.ok(payload.diagnostics.some((d) => d.code === 'MAPPINGS_PAYLOAD_DECISION_LIKE_FIELD'));
});

test('prepareMappings returns immutable v3 artifact with compiledPlan', () => {
  const artifact = prepareMappings(payloadSource);
  assert.equal(artifact.artifactType, 'mappings');
  assert.equal(artifact.version, 'v3');
  assert.equal(artifact.kind, 'payload');
  assert.ok(Array.isArray(artifact.compiledPlan));
  assert.ok(Object.isFrozen(artifact));
  assert.throws(() => prepareMappings({ ...payloadSource, mappingId: '' }), (e) => e instanceof MappingsCompileError);
});

test('executeMappings supports scalar/string/object operators', () => {
  const artifact = prepareMappings(payloadSource);
  const result = executeMappings(artifact, {
    client: { id: 'C-1', lastName: 'Иванов', firstName: 'Иван' },
    contacts: { phone: '+7 (999) 123-45-67', email: '  IVAN@EXAMPLE.COM ' },
    status: 'OK',
  });
  assert.deepEqual(result.output, {
    clientId: 'C-1',
    phone: '79991234567',
    email: 'ivan@example.com',
    fullName: 'Иванов Иван',
    statusClass: 'CONTINUE',
  });
});

test('executeMappings supports aggregate/list operators', () => {
  const artifact = prepareMappings(factsSource);
  const result = executeMappings(artifact, {
    client: { inn: null },
    mismatches: [
      { severity: 'CRITICAL', code: 'A' },
      { severity: 'NON_CRITICAL', code: 'B' },
      { severity: 'CRITICAL', code: 'C' },
    ],
    issues: [{ field: 'beneficiary.address.city' }],
  });
  assert.equal(result.output.criticalMismatchCount, 2);
  assert.equal(result.output.nonCriticalMismatchCount, 1);
  assert.equal(result.output.hasAddressErrors, true);
  assert.deepEqual(result.output.criticalMismatchCodes, ['A', 'C']);
  assert.equal(result.output.hasInn, true, 'null is an existing value');
});

test('executeMappings supports collect object projection and result output', () => {
  const artifact = prepareMappings(resultSource);
  const result = executeMappings(artifact, { issues: [
    { level: 'ERROR', code: 'E1', message: 'bad' },
    { level: 'WARNING', code: 'W1', message: 'warn' },
  ] });
  assert.equal(result.output.status, 'FAIL');
  assert.equal(result.output.outcome, 'VALIDATION_REJECTED');
  assert.deepEqual(result.output.errors, [{ code: 'E1', message: 'bad' }]);
});

test('executeMappings supports coalesce and containsValue', () => {
  const artifact = prepareMappings({
    ...payloadSource,
    output: {
      value: { coalesce: ['$.missing', '$.present', { const: 'fallback' }] },
      hasCode: { containsValue: { from: '$.codes[*]', value: 'A' } },
    },
  });
  const result = executeMappings(artifact, { present: 'yes', codes: ['B', 'A'] });
  assert.equal(result.output.value, 'yes');
  assert.equal(result.output.hasCode, true);
});

test('executeMappings supports findOne and throws on ambiguity', () => {
  const source = { ...payloadSource, output: { client: { findOne: { from: '$.clients[*]', where: { field: 'kind', equals: 'OWN' } } } } };
  const artifact = prepareMappings(source);
  assert.equal(executeMappings(artifact, { clients: [{ id: '1', kind: 'OTHER' }, { id: '2', kind: 'OWN' }] }).output.client.id, '2');
  assert.throws(() => executeMappings(artifact, { clients: [] }), (e) => e instanceof MappingsRuntimeError && e.code === 'MAPPINGS_FIND_ONE_NOT_FOUND');
  assert.throws(() => executeMappings(artifact, { clients: [{ kind: 'OWN' }, { kind: 'OWN' }] }), (e) => e instanceof MappingsRuntimeError && e.code === 'MAPPINGS_FIND_ONE_NOT_UNIQUE');
});

test('executeMappings enforces v3 artifact, JSON-safe input/output and transport-safe trace', () => {
  assert.throws(() => executeMappings({ artifactType: 'mappings', version: 'v2' }, {}), (e) => e instanceof MappingsRuntimeError && e.code === 'MAPPINGS_INVALID_ARTIFACT_VERSION');
  assert.throws(() => executeMappings(prepareMappings(payloadSource), { bad: BigInt(1) }), (e) => e instanceof MappingsRuntimeError && e.code === 'MAPPINGS_INPUT_NOT_JSON_SAFE');

  const result = executeMappings(prepareMappings(payloadSource), {
    client: { id: 'C-1', lastName: 'A', firstName: 'B' },
    contacts: { phone: '1', email: 'X@Y.COM' },
    status: 'OK',
  }, { trace: 'verbose', redact: 'mask' });
  assert.ok(Array.isArray(result.trace));
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(result)));
});

test('interop: mappings facts output is directly usable as decisions facts', () => {
  const { output: facts } = executeMappings(prepareMappings(factsSource), {
    mismatches: [{ severity: 'CRITICAL', code: 'X' }],
    issues: [],
  });
  assert.equal(facts.criticalMismatchCount, 1);
  const restored = JSON.parse(JSON.stringify({ output: facts }));
  assert.equal(restored.output.criticalMismatchCount, 1);
});

test('security: rejects prototype pollution target paths and projection keys', () => {
  for (const targetPath of ['__proto__.polluted', 'constructor.prototype.polluted', 'safe.__proto__']) {
    const r = validateMappings({ ...payloadSource, output: { [targetPath]: { const: 'yes' } } });
    assert.equal(r.ok, false, `${targetPath} must be invalid`);
    assert.ok(r.diagnostics.some((d) => d.code === 'MAPPINGS_TARGET_PATH_FORBIDDEN_SEGMENT'));
  }

  const select = validateMappings({
    ...resultSource,
    output: {
      status: { const: 'FAIL' },
      errors: { collect: { from: '$.issues[*]', select: JSON.parse('{"__proto__":"$.code"}') } },
    },
  });
  assert.equal(select.ok, false);
  assert.ok(select.diagnostics.some((d) => d.code === 'MAPPINGS_PROJECTION_KEY_FORBIDDEN'));

  assert.throws(() => executeMappings({
    artifactType: 'mappings',
    version: 'v3',
    mappingId: 'm',
    kind: 'payload',
    title: 'T',
    description: 'D',
    compiledPlan: [{ targetPath: '__proto__.polluted', expr: { const: 'yes' } }],
    getDefinition() { return {}; },
  }, {}), (e) => e instanceof MappingsRuntimeError && e.code === 'MAPPINGS_PREPARED_ARTIFACT_INVALID');
  assert.equal({}.polluted, undefined);
});

test('validateMappings rejects non JSON-safe source values and non-scalar comparisons', () => {
  assert.ok(validateMappings({ ...payloadSource, metadata: 'x' }).diagnostics.some((d) => d.code === 'MAPPINGS_METADATA_INVALID'));
  assert.ok(validateMappings({ ...payloadSource, output: { x: { const: 1n } } }).diagnostics.some((d) => d.code === 'MAPPINGS_CONST_NOT_JSON_SAFE'));
  assert.ok(validateMappings({ ...payloadSource, output: { x: { dictionary: { from: '$.x', values: { A: () => 1 }, default: 'X' } } } }).diagnostics.some((d) => d.code === 'MAPPINGS_DICTIONARY_VALUES_INVALID'));
  assert.ok(validateMappings({ ...payloadSource, output: { x: { dictionary: { from: '$.x', values: {}, default: 1n } } } }).diagnostics.some((d) => d.code === 'MAPPINGS_DICTIONARY_DEFAULT_NOT_JSON_SAFE'));
  assert.ok(validateMappings({ ...payloadSource, output: { x: { equals: ['$.a', { object: true }] } } }).diagnostics.some((d) => d.code === 'MAPPINGS_OPERATOR_VALUE_NOT_JSON_SAFE'));
  assert.ok(validateMappings({ ...payloadSource, output: { x: { count: { from: '$.items[*]', where: { field: 'a', equals: { bad: true } } } } } }).diagnostics.some((d) => d.code === 'MAPPINGS_OPERATOR_VALUE_NOT_JSON_SAFE'));
  assert.ok(validateMappings({ ...payloadSource, output: { x: { containsValue: { from: '$.items[*]' } } } }).diagnostics.some((d) => d.code === 'MAPPINGS_OPERATOR_UNSUPPORTED'));
  assert.ok(validateMappings({ ...payloadSource, output: { x: { containsValue: { from: '$.items[*]', value: { bad: true } } } } }).diagnostics.some((d) => d.code === 'MAPPINGS_OPERATOR_VALUE_NOT_JSON_SAFE'));
});

test('executeMappings enforces strict options and trace redaction contract', () => {
  const artifact = prepareMappings(payloadSource);
  const input = { client: { id: '1', lastName: 'A', firstName: 'B' }, contacts: { phone: '1', email: 'A@B.C' }, status: 'OK' };
  for (const badOptions of [null, [], true, 'basic']) {
    assert.throws(() => executeMappings(artifact, input, badOptions), (e) => e instanceof MappingsRuntimeError && e.code === 'MAPPINGS_EXECUTION_OPTIONS_INVALID');
  }
  assert.equal(executeMappings(artifact, input, { trace: 'off' }).trace, undefined);
  assert.throws(() => executeMappings(artifact, input, { trace: false }), (e) => e instanceof MappingsRuntimeError && e.code === 'MAPPINGS_TRACE_MODE_INVALID');
  assert.throws(() => executeMappings(artifact, input, { trace: true }), (e) => e instanceof MappingsRuntimeError && e.code === 'MAPPINGS_TRACE_MODE_INVALID');
  assert.throws(() => executeMappings(artifact, input, { unknown: 1 }), (e) => e instanceof MappingsRuntimeError && e.code === 'MAPPINGS_EXECUTION_OPTIONS_INVALID');
  assert.throws(() => executeMappings(artifact, input, { trace: 'verbose', redact: 123 }), (e) => e instanceof MappingsRuntimeError && e.code === 'MAPPINGS_REDACTOR_INVALID');
  assert.throws(() => executeMappings(artifact, input, { trace: 'verbose', redact: () => 1n }), (e) => e instanceof MappingsRuntimeError && e.code === 'MAPPINGS_TRACE_NOT_JSON_SAFE');
});

test('executeMappings defensively validates prepared artifact contract', () => {
  const base = {
    artifactType: 'mappings',
    version: 'v3',
    mappingId: 'm',
    kind: 'payload',
    title: 'T',
    description: 'D',
    getDefinition() { return {}; },
  };
  const malformed = [
    { ...base, compiledPlan: [] },
    { ...base, compiledPlan: [null] },
    { ...base, compiledPlan: [{ targetPath: null, expr: { const: 'x' } }] },
    { ...base, compiledPlan: [{ targetPath: 'x', expr: { const: 1n } }] },
    { ...base, compiledPlan: [{ targetPath: 'x', expr: { containsValue: { from: '$.items[*]' } } }] },
    { ...base, compiledPlan: [{ targetPath: 'x', expr: { equals: ['$.a', { bad: true }] } }] },
    { ...base, compiledPlan: [{ targetPath: 'x', expr: { dictionary: { from: '$.a', values: {}, default: () => {} } } }] },
  ];
  for (const artifact of malformed) {
    assert.throws(() => executeMappings(artifact, {}), (e) => e instanceof MappingsRuntimeError && e.code === 'MAPPINGS_PREPARED_ARTIFACT_INVALID');
  }
});

test('prepared artifact is deep-copied and deeply immutable after prepare', () => {
  const source = {
    mappingId: 'mappings.test.immutable',
    kind: 'payload',
    title: 'Immutable artifact',
    description: 'Verifies prepared artifact stability.',
    output: { x: { const: 1 } },
  };
  const artifact = prepareMappings(source);
  assert.deepEqual(executeMappings(artifact, {}).output, { x: 1 });

  source.output.x.const = 2;
  assert.deepEqual(executeMappings(artifact, {}).output, { x: 1 });

  assert.equal(Object.isFrozen(artifact), true);
  assert.equal(Object.isFrozen(artifact.compiledPlan), true);
  assert.equal(Object.isFrozen(artifact.compiledPlan[0]), true);
  assert.equal(Object.isFrozen(artifact.compiledPlan[0].expr), true);
  assert.throws(() => { artifact.compiledPlan[0].expr.const = 3; }, TypeError);
  assert.deepEqual(executeMappings(artifact, {}).output, { x: 1 });

  const definition = artifact.getDefinition();
  definition.output.x.const = 4;
  assert.deepEqual(executeMappings(artifact, {}).output, { x: 1 });
});

test('collect.select must use explicit $. PathRef strings', () => {
  for (const badSelect of ['', 'code', 'sources.x']) {
    const r = validateMappings({
      ...factsSource,
      output: {
        values: { collect: { from: '$.items[*]', select: badSelect } },
      },
    });
    assert.equal(r.ok, false, `${badSelect} must be invalid`);
    assert.ok(r.diagnostics.some((d) => d.code === 'MAPPINGS_PATH_INVALID'));
  }

  const badProjection = validateMappings({
    ...factsSource,
    output: {
      values: { collect: { from: '$.items[*]', select: { code: 'code' } } },
    },
  });
  assert.equal(badProjection.ok, false);
  assert.ok(badProjection.diagnostics.some((d) => d.code === 'MAPPINGS_PATH_INVALID'));

  const artifact = prepareMappings({
    ...factsSource,
    output: {
      codes: { collect: { from: '$.items[*]', select: '$.code' } },
      pairs: { collect: { from: '$.items[*]', select: { code: '$.code', label: '$.label' } } },
    },
  });
  assert.deepEqual(executeMappings(artifact, { items: [{ code: 'A', label: 'Alpha' }] }).output, {
    codes: ['A'],
    pairs: [{ code: 'A', label: 'Alpha' }],
  });
});

function expectPublicRuntimeError(fn, expectedCode) {
  assert.throws(fn, (error) => {
    assert.equal(error instanceof MappingsRuntimeError, true, `expected MappingsRuntimeError, got ${error?.constructor?.name}`);
    if (expectedCode) assert.equal(error.code, expectedCode);
    assert.ok(!['TypeError', 'RangeError', 'SyntaxError', 'ReferenceError', 'AggregateError'].includes(error.constructor.name));
    return true;
  });
}

test('runtime boundary does not leak raw JavaScript exceptions', () => {
  const artifact = prepareMappings(payloadSource);
  const input = { client: { id: '1', lastName: 'A', firstName: 'B' }, contacts: { phone: '1', email: 'A@B.C' }, status: 'OK' };

  const cyclic = {};
  cyclic.self = cyclic;

  const malformedArtifacts = [
    null,
    { artifactType: 'mappings', version: 'v3', mappingId: 'm', kind: 'payload', title: 'T', description: 'D', compiledPlan: [{ targetPath: 'x', expr: { const: 1n } }], getDefinition() { return {}; } },
    { artifactType: 'mappings', version: 'v3', mappingId: 'm', kind: 'payload', title: 'T', description: 'D', compiledPlan: [{ targetPath: 'constructor.polluted', expr: { const: 'x' } }], getDefinition() { return {}; } },
    { artifactType: 'mappings', version: 'v3', mappingId: 'm', kind: 'payload', title: 'T', description: 'D', compiledPlan: [{ targetPath: 'x', expr: { collect: { from: '$.items[*]', select: 'code' } } }], getDefinition() { return {}; } },
  ];

  for (const malformed of malformedArtifacts) {
    expectPublicRuntimeError(() => executeMappings(malformed, {}));
  }

  expectPublicRuntimeError(() => executeMappings(artifact, cyclic), 'MAPPINGS_INPUT_NOT_JSON_SAFE');
  expectPublicRuntimeError(() => executeMappings(artifact, input, null), 'MAPPINGS_EXECUTION_OPTIONS_INVALID');
  expectPublicRuntimeError(() => executeMappings(artifact, input, { trace: 'verbose', redact: () => cyclic }), 'MAPPINGS_TRACE_NOT_JSON_SAFE');
});

test('documented string boundary semantics are stable', () => {
  const artifact = prepareMappings({
    mappingId: 'mappings.test.string_boundary',
    kind: 'payload',
    title: 'String boundary semantics',
    description: 'Verifies missing string normalization and join literal/path shorthand.',
    output: {
      textMissing: { text: { from: '$.missing', trim: true } },
      digitsMissing: { removeNonDigits: '$.alsoMissing' },
      joined: { join: { separator: ' ', items: ['literal', '$.name', { prefix: '#', from: '$.number' }] } },
    },
  });

  assert.deepEqual(executeMappings(artifact, { name: 'Alice', number: 7 }).output, {
    textMissing: '',
    digitsMissing: '',
    joined: 'literal Alice #7',
  });
});
