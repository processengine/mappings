# @processengine/mappings

Declarative JSON mappings runtime for ProcessEngine.

`@processengine/mappings` is the normalization and transformation layer in the ProcessEngine family. It prepares mapping artifacts once and executes them against runtime input many times.

## Public API

The canonical public API is:

- `validateMappings(source, options?)`
- `prepareMappings(source, options?)`
- `executeMappings(artifact, input, options?)`
- `MappingsCompileError`
- `MappingsRuntimeError`
- `formatMappingsDiagnostics(...)`
- `formatMappingsRuntimeError(...)`

Legacy entrypoints such as `MappingEngine` and `compile()` are not part of the public package API anymore.

## Installation

```bash
npm install @processengine/mappings
```

Node.js requirement: `>=20.19.0`.

## Quick start

```js
import {
  validateMappings,
  prepareMappings,
  executeMappings,
} from '@processengine/mappings';

const source = {
  mappingId: 'person.normalize.v1',
  sources: { input: 'object' },
  output: {
    'person.name': { trim: 'sources.input.name' },
    'person.hasInn': { exists: 'sources.input.inn' },
  },
};

const validation = validateMappings(source);
if (!validation.ok) {
  throw new Error('Invalid mapping source');
}

const artifact = prepareMappings(source);
const result = executeMappings(artifact, {
  input: { name: '  Alice  ', inn: '1234567890' },
}, { trace: 'basic' });

console.log(result.output);
```

## Runtime contract

`executeMappings(...)` returns a stable success result:

```js
{
  output: { ... },
  trace: [ ... ] // optional
}
```

Compile-time and runtime failures are surfaced via typed errors:

- `MappingsCompileError`
- `MappingsRuntimeError`

## Trace

Supported trace levels:

- `false`
- `'basic'`
- `'verbose'`

`basic` is compact and safe by default.
`verbose` may include redacted input/output fragments. Use the `redact` option to control masking.

## Package shape

The package is published as:

- ESM-first
- dist-only runtime
- explicit `exports`
- `.d.ts` types included

Installed consumers do not execute files from `src/`.

## Documentation

- [SPEC.md](./SPEC.md)
- [SPEC_RU.md](./SPEC_RU.md)
- [COMPATIBILITY.md](./COMPATIBILITY.md)
- [MIGRATION.md](./MIGRATION.md)
