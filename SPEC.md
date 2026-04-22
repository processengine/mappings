# SPEC: @processengine/mappings

## What is normative in this document

This document normatively defines:
- the library role inside ProcessEngine;
- the public lifecycle `validate -> prepare -> execute`;
- source artifact shape and operator semantics;
- prepared artifact contract at the public level;
- runtime result contract;
- diagnostics, runtime errors, and trace semantics;
- first-version array DSL boundaries.

Internal compiled structures, optimizer details, and private helper modules are intentionally internal.

## 1. Library role

`@processengine/mappings` is the ProcessEngine family library for declarative normalization and compact fact construction.

It is responsible for:
- reading JSON-safe runtime sources;
- applying explicit transformation rules;
- building JSON-safe output;
- staying transport-safe for downstream handoff.

It is not responsible for:
- orchestration;
- decision routing;
- side effects;
- arbitrary procedural logic.

## 2. Canonical lifecycle

### `validateMappings(source)`

- performs soft validation;
- returns `{ ok, diagnostics }`;
- does not throw for ordinary source problems.

### `prepareMappings(source)`

- validates source;
- compiles a prepared artifact;
- throws `MappingsCompileError` on blocking validation failure.

### `executeMappings(artifact, input, options?)`

- executes only a prepared artifact;
- does not perform hidden compile work;
- returns `{ output, trace? }` on success;
- throws `MappingsRuntimeError` on runtime failures.

## 3. Source artifact model

Normative top-level source shape:

```json
{
  "mappingId": "profile.normalize.v1",
  "sources": {
    "raw": "object"
  },
  "output": {
    "profile.name": { "normalizeSpaces": "sources.raw.fullName" }
  }
}
```

Required top-level fields:
- `mappingId: string`
- `sources: Record<string, 'object'>`
- `output: Record<TargetPath, Rule>`

## 4. Path semantics

### Source paths

- must start with `sources.`;
- must reference a declared source;
- must not contain forbidden prototype segments;
- numeric indexes are not supported;
- wildcard `[*]` is not allowed in ordinary source paths.

### Aggregate `from`

For array DSL only, `from` may use exactly one wildcard `[*]` and it must be the last segment.

Allowed:
- `sources.rules.issues[*]`

Forbidden:
- `sources.rules[*].issues`
- `sources.rules.issues[*].code`
- `sources.rules.issues[*].details[*]`

### Target paths

- must be non-empty strings;
- must not use numeric indexes;
- conflicting target paths like `facts.a` and `facts.a.b` are compile errors.

## 5. Built-in operators

### Scalar / object operators

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

These preserve the canonical 2.0.x semantics.

## 6. Limited array DSL in 2.1.x

### Purpose

The first array DSL version is intentionally small. It exists to build compact facts from multiplicity without moving interpretation back into service code.

### Supported aggregate operators

- `collect`
- `count`
- `existsAny`
- `existsAll`
- `pickFirst`

### Supported simple comparators

- `equals`
- `in`
- `startsWith`

### Shared aggregate model

Aggregate operators work with:
- `from` — required source array selector
- `where` — optional filter over each current element
- `match` — additional predicate, used by `existsAll`
- `value` — value selector, required by `collect`

`field` and `value` paths are relative to the current selected element.

### `collect`

Collects values from selected elements.

```json
{
  "facts.errorCodes": {
    "collect": {
      "from": "sources.rules.issues[*]",
      "where": { "field": "level", "equals": "ERROR" },
      "value": "code"
    }
  }
}
```

Semantics:
- preserves source order;
- unresolved `value` skips the element;
- skipped elements are reflected in trace as `droppedCount`.

### `count`

Counts selected elements.

```json
{
  "facts.errorCount": {
    "count": {
      "from": "sources.rules.issues[*]",
      "where": { "field": "level", "equals": "ERROR" }
    }
  }
}
```

### `existsAny`

Returns `true` if at least one selected element exists.

### `existsAll`

Returns `true` if all selected elements satisfy `match`.

```json
{
  "facts.allErrorsInContacts": {
    "existsAll": {
      "from": "sources.rules.issues[*]",
      "where": { "field": "level", "equals": "ERROR" },
      "match": { "field": "field", "startsWith": "beneficiary.contacts." }
    }
  }
}
```

### `pickFirst`

Returns the first selected element or `null`.

```json
{
  "facts.foundClient": {
    "pickFirst": {
      "from": "sources.findClient.clients[*]"
    }
  }
}
```

This is intentionally not a general indexing feature. It is a deterministic aggregate selection operator.

## 7. Boundary cases

- `collect([]) -> []`
- `count([]) -> 0`
- `existsAny([]) -> false`
- `existsAll([]) -> true`
- `pickFirst([]) -> null`

`existsAll([])` is vacuous truth. Safe business usage usually pairs it with a count fact.

Condition semantics:
- missing field in `where` -> element does not enter selection;
- missing field in `match` -> predicate is `false`;
- `startsWith` on non-string -> `false`;
- empty `in` array is a validation warning `EMPTY_IN_ARRAY`.

## 8. Compile semantics

Compile validation covers:
- top-level source shape;
- path syntax and declared sources;
- conflicting target paths;
- supported operator set;
- operator argument shape;
- aggregate wildcard constraints;
- aggregate condition shape.

`prepareMappings(...)` produces prepared artifact `v2` with compiled execution plan.

## 9. Prepared artifact contract

Public guarantees:
- `type === 'mapping'`
- `mappingId` is stable
- `version` is present
- artifact is immutable from consumer perspective
- artifact is accepted by `executeMappings(...)`

Artifact versions:
- `v1` — legacy execution compatibility path
- `v2` — compiled execution plan

The internal compiled plan is intentionally not a public contract.

## 10. Runtime input

Runtime input must be a plain object keyed by declared source names.
Each declared source must be present and must itself be a plain JSON-safe object.

Non-JSON-safe source content is a runtime error.

## 11. Runtime result contract

Success result shape:

```js
{
  output: Record<string, unknown>,
  trace?: MappingTraceEvent[]
}
```

The runtime result is transport-safe / JSON-safe by normative shape and is suitable for direct downstream handoff inside the ProcessEngine family.

## 12. Diagnostics and runtime errors

### Validation diagnostics

Shape:

```js
{
  code: string,
  level: 'error' | 'warning' | 'info',
  message: string,
  path?: string,
  details?: Record<string, unknown>
}
```

Representative diagnostics:
- `INVALID_MAPPING_ID`
- `INVALID_SOURCE_DECLARATION`
- `INVALID_MAPPING_SCHEMA`
- `UNKNOWN_OPERATOR`
- `INVALID_ARGS`
- `CONFLICTING_TARGET_PATHS`
- `INVALID_WILDCARD_USAGE`
- `INVALID_CONDITION_SHAPE`
- `MISSING_VALUE_IN_COLLECT`
- `EMPTY_IN_ARRAY`

### Runtime errors

Runtime failures are surfaced through `MappingsRuntimeError`.
Representative runtime codes:
- `INVALID_ARTIFACT`
- `INVALID_SOURCE_TYPE`
- `MISSING_SOURCE`
- `INVALID_SOURCE_CONTENT`

## 13. Trace semantics

Supported trace levels:
- `false`
- `'basic'`
- `'verbose'`

`basic` is compact.
`verbose` may include redacted samples and output fragments.

Array DSL trace uses one event per aggregate rule and may include:
- `operator`
- `from`
- `selectedCount`
- `resultType`
- `resultValue`
- `resultLength`
- `droppedCount`
- `picked`

## 14. Explicit limits of first version

Out of scope in 2.1.x:
- numeric indexes;
- wildcard outside aggregate `from`;
- nested wildcard;
- `groupBy`, `mapEach`, `flatMap`, general `reduce`;
- arbitrary expression DSL;
- nested aggregate operators;
- custom operators as the primary answer for array semantics.
