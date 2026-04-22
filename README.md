# @processengine/mappings

[![npm version](https://img.shields.io/npm/v/%40processengine%2Fmappings)](https://www.npmjs.com/package/@processengine/mappings)
[![CI](https://github.com/processengine/mappings/actions/workflows/ci.yml/badge.svg)](https://github.com/processengine/mappings/actions/workflows/ci.yml)
[![Node >= 20.19.0](https://img.shields.io/badge/node-%3E%3D%2020.19.0-339933)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Declarative JSON mappings runtime for ProcessEngine.

`@processengine/mappings` is the transformation and normalization boundary in the ProcessEngine family. It turns a declarative mapping source into a prepared runtime artifact and executes that artifact against runtime input.

## What this library is

`mappings` is a runtime for explicit, declarative data transformation.

It is intended for tasks such as:
- normalizing raw input into a stable structure;
- building payloads for the next step in a process;
- deriving compact facts from source data;
- keeping transformation logic out of surrounding service code.

Inside the broader ProcessEngine family, `mappings` sits between raw data and the next layer that consumes normalized output.

## What this library is not

`mappings` is not:
- a general-purpose programming language;
- a runtime for stateful orchestration;
- a place for complex algorithmic logic;
- a mechanism for external I/O, network calls, or side effects.

If a task requires arbitrary loops, dynamic branching, stateful coordination, external calls, or substantial procedural logic, that task belongs in code or another explicit runtime boundary rather than in mapping DSL.

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
        map: { DE: 'DE', DEU: 'DE', FR: 'FR', FRA: 'FR' },
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
const result = executeMappings(artifact, {
  raw: {
    fullName: '  Ada   Lovelace  ',
    email: 'ADA@EXAMPLE.COM',
    countryCode: 'DEU',
    tags: ['math', 'notes'],
  },
});

console.log(result.output);
```

## Limited array DSL in 2.1.x

`2.1.x` adds a limited array DSL for building compact facts from multiplicity without pushing interpretation back into service code.

Supported aggregate operators:
- `collect`
- `collectObject`
- `count`
- `existsAny`
- `existsAll`
- `pickFirst`

Supported simple comparators in `where` / `match`:
- `equals`
- `in`
- `startsWith`

### Example

```js
const source = {
  mappingId: 'issues.to.facts.v1',
  sources: {
    rules: 'object',
    findClient: 'object',
  },
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
    'facts.hasException': {
      existsAny: {
        from: 'sources.rules.issues[*]',
        where: { field: 'level', equals: 'EXCEPTION' },
      },
    },
    'facts.foundClient': {
      pickFirst: {
        from: 'sources.findClient.clients[*]',
      },
    },
  },
};
```

### Intentional limits of first version

This is not a general array language.

First version intentionally does **not** support:
- numeric indexes;
- wildcard outside aggregate `from`;
- nested wildcard;
- `groupBy`, `mapEach`, `flatMap`, or general `reduce`;
- `and / or / not` trees in conditions;
- nested aggregates;
- custom operators as the primary answer for array work.

### Special cases

- `collect([]) -> []`
- `count([]) -> 0`
- `existsAny([]) -> false`
- `existsAll([]) -> true`
- `pickFirst([]) -> null`

`existsAll([]) -> true` is vacuous truth. In business flows it is usually safer to pair it with a companion fact such as `count > 0`.

For `collect`, unresolved `value` on a selected element does not throw. The element is skipped and the skip count is reflected in trace as `droppedCount`.

## Prepared artifact

`prepareMappings(...)` now produces prepared artifact version `v2` with a compiled execution plan for runtime use.

Publicly guaranteed:
- artifact is suitable for `executeMappings(...)`;
- artifact remains immutable from the consumer perspective;
- public contract is still intentionally minimal.

Internally:
- `v2` carries compiled accessors / predicates / execution plan;
- `v1` remains a legacy compatibility path for previously prepared artifacts.

## Trace

Supported trace levels:
- `false`
- `'basic'`
- `'verbose'`

Trace is disabled by default.

For array DSL, `basic` trace records one event per aggregate operator and includes compact fields such as:
- `operator`
- `from`
- `selectedCount`
- `resultType`
- `resultValue` for boolean / number results
- `resultLength` for `collect`
- `droppedCount` for `collect`
- `picked` for `pickFirst`

## Runtime contract

`executeMappings(...)` returns a success result with this shape:

```js
{
  output: { ... },
  trace: [ ... ] // optional
}
```

Failures are surfaced through typed errors:
- `MappingsCompileError`
- `MappingsRuntimeError`

## Examples

- [`examples/README.md`](./examples/README.md)
- [`examples/basic-transform.mjs`](./examples/basic-transform.mjs)
- [`examples/array-dsl.mjs`](./examples/array-dsl.mjs)
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

`2.1.x` is the current public feature line of `@processengine/mappings`.


## `collectObject`

`collectObject` selects array items from `from`, optionally filters them with `where`, and projects each selected item into a compact object using relative paths from `fields`. Unresolved fields are skipped. If all fields are unresolved for one selected item, that item is dropped from the output array.

Example:

```json
{
  "merchantErrors": {
    "collectObject": {
      "from": "sources.rules.issues[*]",
      "where": { "field": "level", "equals": "ERROR" },
      "fields": {
        "code": "code",
        "message": "message",
        "field": "field"
      }
    }
  }
}
```
