import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const bin = resolve('bin/mappings.js');
const mapping = resolve('examples/mappings/client_payload.json');
const input = resolve('examples/input/client.json');
const examples = resolve('examples');
const mappingsDir = resolve('examples/mappings');

function run(args) {
  return execFileSync(process.execPath, [bin, ...args], { encoding: 'utf8' });
}

test('CLI validate-file works', () => {
  const out = JSON.parse(run(['validate-file', mapping, '--json']));
  assert.equal(out.ok, true);
});

test('CLI compile works', () => {
  const out = JSON.parse(run(['compile', mapping, '--json']));
  assert.equal(out.artifactType, 'mappings');
  assert.equal(out.version, 'v3');
});

test('CLI run-file works with input and trace', () => {
  const out = JSON.parse(run(['run-file', mapping, '--input', input, '--trace', 'verbose', '--json']));
  assert.equal(out.output.client.inn, '123456');
  assert.equal(out.output.client.phone, '79991234567');
  assert.ok(Array.isArray(out.trace));
});

test('CLI validate-dir works', () => {
  const out = JSON.parse(run(['validate-dir', examples, '--json']));
  assert.equal(out.ok, true);
  assert.ok(out.results.length >= 3);
});

test('CLI list works', () => {
  const out = JSON.parse(run(['list', mappingsDir, '--json']));
  assert.ok(out.some((item) => item.mappingId === 'mappings.example.client_payload'));
});
