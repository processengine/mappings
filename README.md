# @processengine/mappings

[![npm version](https://img.shields.io/npm/v/%40processengine%2Fmappings)](https://www.npmjs.com/package/@processengine/mappings)
[![CI](https://github.com/processengine/mappings/actions/workflows/ci.yml/badge.svg)](https://github.com/processengine/mappings/actions/workflows/ci.yml)
[![Node >= 20.19.0](https://img.shields.io/badge/node-%3E%3D%2020.19.0-339933)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Declarative JSON mappings runtime for ProcessEngine.

`@processengine/mappings` is the transformation and normalization boundary in the ProcessEngine family. It turns a declarative mapping source into a prepared runtime artifact and executes that artifact against runtime input.

## What this library is

`mappings` is a small runtime for simple, explicit, declarative data transformation.

It is intended for tasks such as:
- normalizing raw input into a stable structure;
- building a payload for the next step in a process;
- deriving small sets of normalized facts from source data;
- keeping transformation logic outside of surrounding service code.

Inside the broader ProcessEngine family, `mappings` sits between raw data and the next layer that consumes normalized output.

## What this library is not

`mappings` is not:
- a general-purpose programming language;
- a runtime for stateful processing;
- a place for complex algorithmic logic;
- a mechanism for external I/O, network calls, or side effects.

If a task requires loops with arbitrary control flow, stateful orchestration, external calls, or substantial procedural logic, that task belongs in code or another explicit runtime boundary rather than in mapping DSL.

## Canonical API

The canonical public API is:

- `validateMappings(source, options?)`
- `prepareMappings(source, options?)`
- `executeMappings(artifact, input, options?)`
- `MappingsCompileError`
- `MappingsRuntimeError`
- `formatMappingsDiagnostics(...)`
- `formatMappingsRuntimeError(...)`

Roles:

- `validateMappings(...)` performs soft validation and returns `{ ok, diagnostics }` without throwing on invalid source.
- `prepareMappings(...)` validates and prepares a runtime artifact. Invalid source causes `MappingsCompileError`.
- `executeMappings(...)` executes only a prepared artifact. It does not perform hidden compile/prepare work.

Legacy engine-style entrypoints such as `MappingEngine` and public `compile()` are not part of the public package API.

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
  mappingId: 'profile.normalize.v1',
  sources: {
    raw: 'object',
  },
  output: {
    'profile.displayName': { normalizeSpaces: 'sources.raw.fullName' },
    'profile.email': { lowercase: 'sources.raw.email' },
    'profile.country': {
      mapValue: {
        from: 'sources.raw.countryCode',
        map: {
          DE: 'DE',
          DEU: 'DE',
          FR: 'FR',
          FRA: 'FR',
        },
        fallback: 'passthrough',
      },
    },
    'profile.hasTags': { exists: 'sources.raw.tags' },
  },
};

const validation = validateMappings(source);
if (!validation.ok) {
  console.error(validation.diagnostics);
  process.exit(1);
}

const artifact = prepareMappings(source);

const result = executeMappings(
  artifact,
  {
    raw: {
      fullName: '  Ada   Lovelace  ',
      email: 'ADA@EXAMPLE.COM',
      countryCode: 'DEU',
      tags: ['math', 'notes'],
    },
  },
  { trace: 'basic' },
);

console.log(result.output);
// {
//   profile: {
//     displayName: 'Ada Lovelace',
//     email: 'ada@example.com',
//     country: 'DE',
//     hasTags: true
//   }
// }
```

## Trace

Supported trace levels:

- `false`
- `'basic'`
- `'verbose'`

Trace is disabled by default.

- `false` returns no trace.
- `'basic'` returns compact execution events suitable for routine diagnostics.
- `'verbose'` may include additional redacted input and output fragments for debugging and local inspection.

Use the `redact` option to control masking of trace values.

## Runtime contract

`executeMappings(...)` returns a success result with this shape:

```js
{
  output: { ... },
  trace: [ ... ] // optional
}
```

This is not a `success/error` status envelope.

Failures are surfaced through typed errors:
- `MappingsCompileError`
- `MappingsRuntimeError`

## Supported operators in v1

Current source definitions support these operators:

- `from`
- `literal`
- `exists`
- `equals`
- `coalesce`
- `trim`
- `lowercase`
- `uppercase`
- `normalizeSpaces`
- `removeNonDigits`
- `mapValue`
- `transform`

See the specification for source shape, operator constraints, runtime semantics, and limitations.

## Examples

Repository examples are intentionally small but complete. They show source, validation, preparation, execution, output, and trace where relevant.

- [`examples/README.md`](./examples/README.md)
- [`examples/basic-transform.mjs`](./examples/basic-transform.mjs)
- [`examples/validate-diagnostics.mjs`](./examples/validate-diagnostics.mjs)
- [`examples/runtime-error.mjs`](./examples/runtime-error.mjs)
- [`examples/trace-basic.mjs`](./examples/trace-basic.mjs)
- [`examples/trace-verbose.mjs`](./examples/trace-verbose.mjs)
- [`examples/prepared-artifact.mjs`](./examples/prepared-artifact.mjs)
- [`examples/process-boundary.mjs`](./examples/process-boundary.mjs)
- [`examples/limitations.md`](./examples/limitations.md)

## Documentation

- [SPEC.md](./SPEC.md)
- [SPEC_RU.md](./SPEC_RU.md)
- [COMPATIBILITY.md](./COMPATIBILITY.md)
- [MIGRATION.md](./MIGRATION.md)
- [CHANGELOG.md](./CHANGELOG.md)

## Release line

`2.x` is the canonical public release line of `@processengine/mappings`.
