import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function runCli(args) {
  return execFileAsync(process.execPath, ['bin/mappings.js', ...args], {
    cwd: process.cwd(),
    env: process.env,
  });
}

test('CLI validate-file works', async () => {
  const { stdout } = await runCli(['validate-file', 'examples/mappings/client/normalize_client_data.v1.json', '--json']);
  const payload = JSON.parse(stdout);
  assert.equal(payload.ok, true);
});

test('CLI compile works', async () => {
  const { stdout } = await runCli(['compile', 'examples/mappings/client/normalize_client_data.v1.json', '--json']);
  const payload = JSON.parse(stdout);
  assert.equal(payload.artifactType, 'mapping');
});

test('CLI run-file works with trace', async () => {
  const { stdout } = await runCli([
    'run-file',
    'examples/mappings/client/normalize_client_data.v1.json',
    '--sources',
    'examples/sources/client_raw.json',
    '--trace',
  ]);
  const payload = JSON.parse(stdout);
  assert.ok(payload.output);
  assert.ok(Array.isArray(payload.trace));
});

test('CLI validate-dir works', async () => {
  const { stdout } = await runCli(['validate-dir', 'examples', '--json']);
  const payload = JSON.parse(stdout);
  assert.equal(payload.ok, true);
  assert.ok(payload.results.length >= 1);
});

test('CLI list works', async () => {
  const { stdout } = await runCli(['list', 'examples/mappings', '--json']);
  const payload = JSON.parse(stdout);
  assert.ok(payload.some((item) => item.mappingId === 'profile.normalize_input.v1'));
});
