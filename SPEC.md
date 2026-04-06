# SPEC: @processengine/mappings

## 1. Purpose of the library

`@processengine/mappings` is the ProcessEngine runtime for declarative data transformation and normalization.

The library is intended to:
- transform raw input into a normalized output structure;
- keep transformation logic outside surrounding service code;
- prepare compact derived data for the next layer in a process;
- provide a stable `validate -> prepare -> execute` lifecycle for mapping artifacts.

The library is not intended to:
- express arbitrary procedural logic;
- perform stateful processing;
- perform external I/O;
- replace explicit code where algorithmic behavior is the real source of complexity.

In a larger ProcessEngine flow, `mappings` acts as a transformation boundary between input data and the next consumer of normalized output.

## 2. Source model

### 2.1. What counts as source

A mapping source is a declarative JSON object describing:
- the mapping identifier;
- the declared runtime sources accepted by execution;
- the output structure to be produced;
- the operator used for each output target.

### 2.2. Top-level source shape

The v1 source shape is:

- `mappingId: string`
- `sources: Record<string, 'object'>`
- `output: Record<TargetPath, OperatorDefinition>`

Minimal example:

```json
{
  "mappingId": "profile.normalize.v1",
  "sources": {
    "raw": "object"
  },
  "output": {
    "profile.name": { "normalizeSpaces": "sources.raw.fullName" },
    "profile.hasTags": { "exists": "sources.raw.tags" }
  }
}
```

### 2.3. Required parts

A valid source must contain:
- a non-empty `mappingId` string;
- a non-empty plain-object `sources` declaration;
- a non-empty plain-object `output` declaration.

### 2.4. Source declarations

In v1, declared sources are intentionally small in scope.

Each declared source name maps to the declaration `'object'`.
This means runtime input is expected to be a plain object per declared source.

Example:

```json
{
  "sources": {
    "raw": "object",
    "meta": "object"
  }
}
```

### 2.5. Output rules

Each `output` entry uses exactly one root operator.

Supported root operators in v1:
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

### 2.6. Path rules

Source paths:
- must be strings;
- must start with `sources.`;
- must reference a declared source name;
- must not contain forbidden prototype-related segments;
- must not use numeric array-index path segments in v1.

Target paths:
- must be non-empty strings;
- must not contain forbidden prototype-related segments;
- must not use numeric array-index path segments in v1.

### 2.7. Structural limitations of source

The source model is intentionally constrained.

In particular, v1 does not aim to model:
- arbitrary branching logic;
- loops;
- side effects;
- external calls;
- custom executable code inside source.

## 3. Compile semantics

### 3.1. `validateMappings(source, options?)`

`validateMappings(...)` performs soft validation.

Its role is to:
- inspect the source shape;
- validate declared paths and operators;
- validate operator arguments;
- return structured diagnostics;
- avoid throwing only because the source is invalid.

Result shape:

```js
{
  ok: boolean,
  diagnostics: MappingDiagnostic[]
}
```

### 3.2. `prepareMappings(source, options?)`

`prepareMappings(...)` is the canonical production entrypoint for preparation.

Its role is to:
- validate the source;
- reject invalid source with a typed compile error;
- return a prepared runtime artifact on success.

### 3.3. What is validated in compile phase

Compile-phase validation covers, at minimum:
- top-level source structure;
- presence and type of `mappingId`, `sources`, and `output`;
- source declaration consistency;
- source-path syntax;
- target-path syntax;
- supported operator set;
- operator argument shape;
- transform-step constraints;
- JSON-safe literal constraints where applicable.

### 3.4. Compile failure

A compile failure is any source condition that prevents creation of a prepared artifact.

Examples include:
- missing required top-level fields;
- undeclared source references;
- invalid source path syntax;
- invalid target path syntax;
- unsupported operators;
- malformed operator arguments.

### 3.5. Difference between validate and prepare

`validateMappings(...)` returns diagnostics without throwing on invalid source.
`prepareMappings(...)` enforces the same compile rules, but on failure throws `MappingsCompileError` instead of returning a success-path artifact.

## 4. Prepared artifact contract

A mappings artifact is the prepared runtime entity returned by `prepareMappings(...)`.

Publicly, the artifact is intentionally minimal.

The library guarantees only that:
- it is a prepared mappings artifact;
- it exposes stable minimal identity fields documented in the public types;
- it is suitable as input to `executeMappings(...)`;
- it behaves as immutable from the consumer perspective.

The artifact should be treated as intentionally opaque-ish.

Consumers should not assume that the artifact is:
- a rich external serialization format;
- a stable internal AST contract;
- a public place for compile internals beyond documented minimal fields.

The artifact is a runtime boundary, not a broad schema for external storage.

## 5. Runtime semantics

### 5.1. `executeMappings(artifact, input, options?)`

`executeMappings(...)` is the canonical runtime entrypoint.

It:
- accepts only a prepared artifact;
- accepts runtime input keyed by declared source names;
- does not perform hidden compile or prepare work;
- produces success output and optional trace;
- throws `MappingsRuntimeError` on runtime failure.

### 5.2. Runtime input

Runtime input must be a plain object whose keys match declared source names.
Each declared source must be present and must hold a plain object.

Source content is expected to be JSON-safe.
Non-JSON-safe values, circular references, and unsupported object types may cause runtime failure.

### 5.3. Success path

On successful execution, the library returns transformed output.
If trace is enabled, trace is returned alongside output.

### 5.4. Runtime failure

Runtime failure covers execution-time conditions such as:
- invalid artifact passed to `executeMappings(...)`;
- missing declared source in runtime input;
- invalid runtime source type;
- invalid runtime source content.

## 6. Runtime result contract

Successful execution returns:

```js
{
  output: Record<string, unknown>,
  trace?: MappingTraceEvent[]
}
```

Normative fields:
- `output`
- `trace?`

Important constraints:
- this result is not a `status/envelope` object;
- compile diagnostics are not mixed into the success result;
- runtime errors are not returned as part of the success result.

## 7. Diagnostics and errors

### 7.1. Diagnostics shape

Compile diagnostics are structured objects with this shape:

- `code: string`
- `level: 'error' | 'warning' | 'info'`
- `message: string`
- `path?: string`
- `details?: Record<string, unknown>`

Diagnostics are intended to be machine-readable.
Formatter functions are convenience helpers for CLI, logs, and developer-facing output.

### 7.2. `MappingsCompileError`

`MappingsCompileError` is thrown by `prepareMappings(...)` when the source cannot be prepared.

It contains:
- `code`
- `message`
- `diagnostics`
- optional `cause`

### 7.3. `MappingsRuntimeError`

`MappingsRuntimeError` is thrown by `executeMappings(...)` when execution cannot proceed or runtime input is invalid.

It contains:
- `code`
- `message`
- optional `details`
- optional `cause`

### 7.4. Formatter helpers

The library provides:
- `formatMappingsDiagnostics(...)`
- `formatMappingsRuntimeError(...)`

These helpers do not replace structured diagnostics and errors. They format them for presentation.

## 8. Trace semantics

Supported trace modes:
- `false`
- `basic`
- `verbose`

### 8.1. `false`

No trace is returned.

### 8.2. `basic`

`basic` is intended for compact and safer operational visibility.

The expectation is:
- execution events are present;
- raw values are not exposed more than needed;
- the trace is useful without becoming a full data dump.

### 8.3. `verbose`

`verbose` may include additional redacted input and output fragments useful for debugging, local analysis, and tests.

`verbose` is broader than `basic`, but it is still not promised to be a perfect dump of the entire runtime state.

### 8.4. Redaction model

The trace API supports a redaction control hook via `options.redact`.

This exists to let host applications:
- mask values before they appear in trace;
- avoid accidental leakage of sensitive payload fragments;
- tailor trace output to operational safety requirements.

## 9. Conflict semantics and limitations

### 9.1. Output assembly semantics

Output is assembled by applying rules in source order and writing values to target paths.
If a rule does not produce output, no value is written for that target.

### 9.2. Path collisions and overwrites

The v1 library does not define a rich conflict-resolution framework.
Consumers should avoid ambiguous or structurally conflicting target-path designs.

In practice, source authors should treat target layout as deterministic and non-overlapping.

### 9.3. Intentional limitations

The library is intentionally limited to transparent data transformation.
It does not attempt to solve all possible transformation problems.

## 10. Non-goals

`@processengine/mappings` is not intended for:
- complex algorithmic logic;
- stateful processing;
- orchestration logic;
- external calls;
- imperative programming inside mapping source;
- becoming a general-purpose language.

If a problem is fundamentally procedural, it should stay procedural in code.

## 11. Compatibility guarantees

Public compatibility is judged by documented public contract.

Public contract includes:
- public API names and signatures;
- diagnostics shape;
- typed error shape at documented level;
- runtime success result shape;
- documented trace levels and event model;
- explicit package exports;
- documented minimal artifact contract.

The following may change without breaking public compatibility:
- internal validator layout;
- internal executor structure;
- undocumented artifact internals;
- internal helper modules;
- internal implementation strategy.

Breaking change occurs when a documented part of the public contract changes incompatibly.
