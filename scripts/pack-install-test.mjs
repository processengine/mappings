import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const workdir = mkdtempSync(join(tmpdir(), 'mappings-pack-'));
const tarballName = execFileSync('npm', ['pack'], { cwd: root, encoding: 'utf8' }).trim().split('\n').pop();
const tarballPath = join(root, tarballName);

writeFileSync(join(workdir, 'package.json'), JSON.stringify({ name: 'install-fixture', private: true, type: 'module' }, null, 2));
execFileSync('npm', ['install', tarballPath], { cwd: workdir, stdio: 'inherit' });
const script = `
import { validateMappings, prepareMappings, executeMappings } from '@processengine/mappings';
const source = { mappingId: 'pack.test', sources: { a: 'object' }, output: { value: { from: 'sources.a.value' } } };
const validation = validateMappings(source);
if (!validation.ok) throw new Error('validation failed');
const artifact = prepareMappings(source);
const result = executeMappings(artifact, { a: { value: 42 } });
if (result.output.value !== 42) throw new Error('unexpected output');
console.log('ok');
`;
writeFileSync(join(workdir, 'check.mjs'), script);
execFileSync('node', ['check.mjs'], { cwd: workdir, stdio: 'inherit' });
