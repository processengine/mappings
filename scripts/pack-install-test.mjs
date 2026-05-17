import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const workdir = mkdtempSync(join(tmpdir(), 'mappings-smoke-'));
const tarball = execFileSync('npm', ['pack'], { cwd: root, encoding: 'utf8' }).trim().split('\n').pop();

const dryRun = JSON.parse(execFileSync('npm', ['pack', '--json', '--dry-run'], { cwd: root, encoding: 'utf8' }))[0];
const files = new Set(dryRun.files.map((f) => f.path));
for (const required of ['dist/index.js', 'dist/index.d.ts', 'examples/mappings/client_payload.json', 'SPEC.md', 'MIGRATION.md', 'COMPATIBILITY.md']) {
  if (!files.has(required)) throw new Error(`tarball missing ${required}`);
}
if ([...files].some((file) => file.includes('RELEASE_NOTES_2') || file.includes('mapping-definition.v1'))) {
  throw new Error('tarball contains v2 release notes or v1 schema');
}

writeFileSync(join(workdir, 'package.json'), JSON.stringify({ name: 'smoke', private: true, type: 'module' }));
execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', join(root, tarball)], { cwd: workdir, stdio: 'inherit' });

const script = `
import { validateMappings, prepareMappings, executeMappings, MappingsRuntimeError } from '@processengine/mappings';

const source = {
  mappingId: 'mappings.smoke.payload',
  kind: 'payload',
  title: 'Smoke mapping',
  description: 'Smoke test mapping for pack install.',
  output: {
    name: { text: { from: '$.person.name', trim: true } },
    count: { count: { from: '$.items[*]' } },
    phone: { removeNonDigits: '$.phone' },
    status: { const: 'OK' }
  }
};

const v = validateMappings(source);
if (!v.ok) throw new Error('validate failed: ' + JSON.stringify(v.diagnostics));
const a = prepareMappings(source);
if (a.version !== 'v3' || a.artifactType !== 'mappings') throw new Error('wrong artifact');
const r = executeMappings(a, { person: { name: '  Иванов  ' }, items: [1, 2, 3], phone: '+7 999' }, { trace: 'basic' });
if (r.output.name !== 'Иванов') throw new Error('text failed');
if (r.output.count !== 3) throw new Error('count failed');
if (r.output.phone !== '7999') throw new Error('removeNonDigits failed');
if (!Array.isArray(r.trace)) throw new Error('trace missing');
JSON.parse(JSON.stringify(r));
try { executeMappings({ artifactType: 'mappings', version: 'v2' }, {}); throw new Error('should throw'); }
catch (e) { if (!(e instanceof MappingsRuntimeError)) throw new Error('wrong error type'); }
console.log('mappings smoke ok');
`;
writeFileSync(join(workdir, 'check.mjs'), script);
execFileSync('node', ['check.mjs'], { cwd: workdir, stdio: 'inherit' });

const cjs = `
(async () => {
  const { validateMappings } = await import('@processengine/mappings');
  if (typeof validateMappings !== 'function') throw new Error('dynamic import failed');
  console.log('cjs dynamic import ok');
})();
`;
writeFileSync(join(workdir, 'check.cjs'), cjs);
execFileSync('node', ['check.cjs'], { cwd: workdir, stdio: 'inherit' });
rmSync(join(root, tarball), { force: true });
