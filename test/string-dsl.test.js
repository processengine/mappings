import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareMappings, executeMappings, validateMappings } from '../dist/index.js';

const addressMapping = {
  mappingId: 'beneficiary.address.fullAddress.v1',
  sources: { application: 'object' },
  output: {
    'client.legalAddress.fullAddress': {
      coalesce: [
        { from: 'sources.application.beneficiary.address.registration.fullAddress' },
        { from: 'sources.application.beneficiary.address.registration.addressLine' },
        {
          joinNonEmpty: {
            separator: ', ',
            items: [
              { from: 'sources.application.beneficiary.address.registration.postalCode' },
              { from: 'sources.application.beneficiary.address.registration.regionName' },
              {
                template: 'г {{city}}',
                vars: {
                  city: { from: 'sources.application.beneficiary.address.registration.city' },
                },
              },
              {
                joinNonEmpty: {
                  separator: ' ',
                  items: [
                    { from: 'sources.application.beneficiary.address.registration.streetType' },
                    { from: 'sources.application.beneficiary.address.registration.street' },
                  ],
                },
              },
              {
                template: 'д {{house}}',
                vars: {
                  house: { from: 'sources.application.beneficiary.address.registration.house' },
                },
              },
              {
                template: 'кв {{apartment}}',
                vars: {
                  apartment: { from: 'sources.application.beneficiary.address.registration.apartment' },
                },
              },
            ],
          },
        },
        { literal: 'fallback' },
      ],
    },
  },
};

function input(registration) {
  return { application: { beneficiary: { address: { registration } } } };
}

test('joinNonEmpty and template build fullAddress from FIAS parts', () => {
  const artifact = prepareMappings(addressMapping);
  assert.equal(artifact.version, 'v2');
  assert.ok(artifact.getCompiledPlan(), 'prepared artifact exposes compiled v2 plan internally');
  const result = executeMappings(artifact, input({
    countryCode: 'RU',
    postalCode: '630091',
    regionName: 'Новосибирская область',
    city: 'Новосибирск',
    streetType: 'пр-кт',
    street: 'Красный',
    house: '18',
    apartment: '45',
  }));
  assert.equal(result.output.client.legalAddress.fullAddress, '630091, Новосибирская область, г Новосибирск, пр-кт Красный, д 18, кв 45');
});

test('joinNonEmpty skips empty address parts without extra separators', () => {
  const artifact = prepareMappings(addressMapping);
  const result = executeMappings(artifact, input({
    postalCode: '630091',
    regionName: 'Новосибирская область',
    city: 'Новосибирск',
    streetType: 'пр-кт',
    street: 'Красный',
    house: '18',
    apartment: null,
  }));
  assert.equal(result.output.client.legalAddress.fullAddress, '630091, Новосибирская область, г Новосибирск, пр-кт Красный, д 18');
});

test('coalesce continues when joinNonEmpty returns null', () => {
  const artifact = prepareMappings(addressMapping);
  const result = executeMappings(artifact, input({}));
  assert.equal(result.output.client.legalAddress.fullAddress, 'fallback');
});

test('coalesce prefers fullAddress and addressLine before assembled value', () => {
  const artifact = prepareMappings(addressMapping);
  assert.equal(executeMappings(artifact, input({ fullAddress: 'normalized', addressLine: 'manual', city: 'X' })).output.client.legalAddress.fullAddress, 'normalized');
  assert.equal(executeMappings(artifact, input({ addressLine: 'manual', city: 'X' })).output.client.legalAddress.fullAddress, 'manual');
});

test('template defaults to null when any variable is empty', () => {
  const artifact = prepareMappings({
    mappingId: 'template.empty.v1',
    sources: { input: 'object' },
    output: {
      x: { template: { template: 'д {{house}}', vars: { house: { from: 'sources.input.house' } } } },
    },
  });
  assert.equal(executeMappings(artifact, { input: {} }).output.x, null);
});

test('template can keep non-empty part when skipIfAnyVarEmpty is false', () => {
  const artifact = prepareMappings({
    mappingId: 'template.partial.v1',
    sources: { input: 'object' },
    output: {
      x: { template: { template: '{{streetType}} {{street}}', skipIfAnyVarEmpty: false, vars: { streetType: { literal: 'пр-кт' }, street: { from: 'sources.input.street' } } } },
    },
  });
  assert.equal(executeMappings(artifact, { input: {} }).output.x, 'пр-кт');
});

test('validateMappings rejects invalid string operator shapes', () => {
  const badJoin = validateMappings({ mappingId: 'bad.join.v1', sources: { input: 'object' }, output: { x: { joinNonEmpty: { separator: 1, items: [] } } } });
  assert.equal(badJoin.ok, false);
  assert.ok(badJoin.diagnostics.some((item) => item.code === 'JOIN_NON_EMPTY_ITEMS_EMPTY'));
  assert.ok(badJoin.diagnostics.some((item) => item.code === 'JOIN_NON_EMPTY_SEPARATOR_MUST_BE_STRING'));

  const badTemplate = validateMappings({ mappingId: 'bad.template.v1', sources: { input: 'object' }, output: { x: { template: { template: 'г {{city}}', vars: {} } } } });
  assert.equal(badTemplate.ok, false);
  assert.ok(badTemplate.diagnostics.some((item) => item.code === 'TEMPLATE_VAR_MISSING'));
});
