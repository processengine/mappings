# SPEC: @processengine/mappings v3

Status: implementation specification. Target: Flow 5 / `@processengine/dataflows` v1.

## Normative scope

This document defines the v3 source artifact, prepared artifact, public API, runtime semantics, runtime result, operators, diagnostics, trace, migration, interop, and release readiness requirements.

## Role

`@processengine/mappings` v3 is a declarative transformation library:

```text
prepared mapping + input object -> JSON-safe output object
```

It does not read or write `ProcessState`, does not route processes, does not execute rules/decisions, and does not compose pipelines.

## Public API

```ts
validateMappings(source) -> ValidationResult
prepareMappings(source) -> PreparedMappingsArtifact
executeMappings(artifact, inputObject, options?) -> ExecuteMappingsResult
formatMappingsDiagnostics(diagnostics) -> string
formatMappingsRuntimeError(error) -> string
```

`validateMappings` does not throw on ordinary source problems. `prepareMappings` throws `MappingsCompileError`. `executeMappings` throws `MappingsRuntimeError`.

## Source artifact

```ts
interface MappingDefinitionV3 {
  mappingId: string;
  kind: 'payload' | 'facts' | 'result';
  title: string;
  description: string;
  output: Record<TargetPath, MappingExpression>;
  metadata?: Record<string, JsonValue>;
}
```

Required fields: `mappingId`, `kind`, `title`, `description`, `output`. `output` must be non-empty.

Forbidden fields: `sources`, `version`, `compiledPlan`.

## Prepared artifact

```ts
interface PreparedMappingsArtifact {
  readonly artifactType: 'mappings';
  readonly version: 'v3';
  readonly mappingId: string;
  readonly kind: 'payload' | 'facts' | 'result';
  readonly title: string;
  readonly description: string;
  readonly compiledPlan: CompiledMappingsPlan;
  getDefinition(): MappingDefinitionV3;
}
```

`compiledPlan` is public as a presence guarantee and internal by structure. Consumers must not construct or depend on its internal shape. Prepared artifacts are deep-copied from source and deeply immutable by public contract; mutating the original source object or a value returned by `getDefinition()` must not affect runtime behavior.

## Runtime input and result

`executeMappings` accepts one JSON-safe input object. All paths are rooted at `$`.

```ts
interface ExecuteMappingsResult {
  output: JsonObject;
  trace?: MappingTraceEvent[];
}
```

The runtime result must be JSON-safe / transport-safe. `undefined`, functions, Date, Map, Set, BigInt, and cycles are forbidden in public output and trace.

## Operators

Supported: `from`, `const`, `coalesce`, `text`, `removeNonDigits`, `dictionary`, `equals`, `exists`, `count`, `existsAny`, `containsValue`, `collect`, `join`, `findOne`. For `collect.select`, every string selector must be an explicit v3 `PathRef` starting with `$.`; legacy-looking or implicit selectors such as `code`, empty string, or `sources.x` are invalid.

Forbidden legacy operators: `literal`, `mapValue`, `transform`, `trim`, `normalizeSpaces`, `uppercase`, `lowercase`, `template`, `joinNonEmpty`, `collectObject`, `countAtLeast`, `existsAll`, `pickFirst`.


## Boundary cases

- `prepareMappings(...)` deep-copies source and returns a deeply immutable prepared artifact. Source mutation after prepare, direct `compiledPlan` mutation attempts, or mutation of `getDefinition()` output must not change runtime behavior.
- `collect.select` string values and projection values must be explicit `$.` PathRefs. Implicit element paths and `sources.*` paths are rejected.
- `text` and `removeNonDigits` return an empty string for absent or `null` input. This is intentional string-normalization behavior in v3.
- `join` string items beginning with `$.` are input paths; other string items are literals. This is the only compact literal/path shorthand retained by v3.

## Exists semantics

A path with value `null`, `false`, `0`, empty string, or empty array exists. Only an absent path does not exist.

## Interop

`@processengine/dataflows` calls `executeMappings` and writes `result.output` to `$.context.data.*`. Mappings output can be passed directly to decisions as facts without host-side cleanup.

## Definition of Done

Implementation is ready only if tests, pack/install smoke, ESM import smoke, examples in tarball, CLI smoke, CI workflows, README/SPEC/COMPATIBILITY/MIGRATION/CHANGELOG, and typings are synchronized.

## Design rules

- One mapping artifact performs one transformation from one input object to one output object.
- Composition belongs to `@processengine/dataflows`, not to mappings.
- Decisions belong to `@processengine/decisions`, not to mappings.
- Mappings v3 has no hidden pipeline, no hidden selection, and no legacy compatibility mode.
- `mappingId` is the artifact identifier for mappings. It is equivalent in role to `id` in Flow/dataflow artifacts, but the historical name is retained for this package.

## Runtime boundary guarantees

The public runtime boundary is closed:

```text
No user input, malformed prepared artifact, trace mode, runtime option, redactor, or malformed source-derived expression may produce a raw JavaScript exception from executeMappings(...).
```

All public runtime failures must be surfaced as typed `MappingsRuntimeError` with stable machine-readable codes.

## Security constraints

Target paths and projection keys must not contain these object key segments:

```text
__proto__
prototype
constructor
```

This is enforced by validation and by runtime prepared-artifact validation. Runtime must not rely only on prior validation.

## Trace and redaction semantics

`trace` is off by default. Supported runtime values are:

```ts
trace?: 'off' | 'basic' | 'verbose'
```

`verbose` trace may include redacted input/output values. Redaction is not a cleanup mechanism: redactor output must already be JSON-safe. Non-JSON-safe redactor output is a runtime error.

## Operator semantics matrix

| Operator | Missing input path | `null` input | Object/array input | Output |
|---|---|---|---|---|
| `from` | field omitted | copied as `null` | copied if JSON-safe | copied value |
| `const` | n/a | allowed | allowed if JSON-safe | constant value |
| `coalesce` | skipped | skipped | first non-empty value copied | value or `null` |
| `text` | `""` | `""` | stringified | string |
| `removeNonDigits` | `""` | `""` | stringified | string |
| `dictionary` | default or omitted | lookup by `"null"` if present | lookup by `String(value)` | mapped/default value |
| `equals` | `false` | scalar compare | forbidden as expected value | boolean |
| `exists` | `false` | `true` | `true` if path exists | boolean |
| `count` | `0` | n/a | requires array at wildcard source | number |
| `existsAny` | `false` | n/a | requires array at wildcard source | boolean |
| `containsValue` | `false` | scalar compare | expected value must be scalar | boolean |
| `collect` | `[]` | n/a | requires array at wildcard source | array |
| `join` | skips missing items | skips null items | stringifies non-empty item values | string |
| `findOne` | `MAPPINGS_FIND_ONE_NOT_FOUND` | n/a | requires exactly one matched item | JSON value |

Notes:

- `text` and `removeNonDigits` intentionally return an empty string for absent or `null` input. This is the chosen v3 string-normalization behavior.
- `join` string items beginning with `$.` are paths; other string items are literals. This is the only literal/path shorthand retained by v3.
- `collect.select` string values and projection values must be explicit `$.` PathRefs.

## Negative examples

The `examples/invalid/*.json.example` files document common invalid v2 and unsafe patterns. They intentionally do not use `.json` extension so that `validate-dir examples` remains a happy-path smoke command.

## Flow 5 interop fixtures

The `examples/interop/` directory contains contract-shaped fixtures for:

```text
mappings kind=payload -> dataflow input/output refs
mappings kind=facts   -> decisions input
mappings kind=result  -> TERMINAL.resultRef target
```

These fixtures are local examples. Full package-to-package interop tests belong in the Flow 5 workspace once `dataflows`, `decisions`, and `semantics` are wired together.
