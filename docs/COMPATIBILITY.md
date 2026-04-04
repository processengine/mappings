# Compatibility Policy: @processengine/mappings

**Document version:** 1.0  
**Applies from:** v1.0.0

---

## Versioning

This library follows [Semantic Versioning 2.0.0](https://semver.org/):

- **PATCH** (1.0.x) — bug fixes with no contract changes
- **MINOR** (1.x.0) — new capabilities, fully backward compatible
- **MAJOR** (x.0.0) — breaking changes

---

## What constitutes a breaking change

### DSL (MappingDefinition)

**Breaking:**

- removing an existing operator
- changing the semantics of an existing operator
- changing the argument format of an existing operator
- changing `outputCreated` semantics for an existing operator
- changing how `fallback` works in `mapValue`
- reducing the allowed `steps` range in `transform`

**Non-breaking (minor):**

- adding a new operator
- adding a new optional field to an existing operator's arguments
- adding a new valid `fallback` value

### Public API

**Breaking:**

- renaming or removing `MappingEngine`, `compile`, `CompiledMapping`
- changing the signature of `compile()`, `validate()`, `run()`, `execute()`
- changing the structure of `MappingResult` (fields `status`, `mappingId`, `result`, `error`)
- removing stable fields from `MappingError`
- renaming existing error codes

**Non-breaking:**

- adding new error codes
- adding new optional fields to `MappingError`
- adding new methods or properties to `MappingEngine` or `CompiledMapping`

### Trace contract

**Breaking:**

- changing or removing existing trace entry fields
- changing the meaning of existing field values

**Non-breaking:**

- adding new optional fields to trace entries
- adding trace fields for new operators

### Error model

**Breaking:**

- removing or renaming a `code` value
- changing which phase (`compile` / `execute`) an error belongs to

**Non-breaking:**

- adding new `code` values
- adding new optional location fields (`operator`, `targetPath`, `from`, `stepIndex`)

### CLI

**Breaking:**

- changing exit codes
- changing the `--json` output format

**Non-breaking:**

- adding new commands
- adding new flags to existing commands

---

## Rules for adding a new operator

1. A new operator is introduced in a minor release only
2. It does not change the behavior of existing operators
3. It is documented in `SPEC_RU.md` and `README.md` before release
4. It is added to `schema/mapping-definition.v1.schema.json`
5. It is covered by tests — including contract tests — before release
6. It is added to `types/index.d.ts`

---

## Hard architectural boundaries

The following will never be added to this library:

- conditional operators (`if`, `else`, `when`, `switch`)
- logical compositions (`and`, `or`, `not`)
- arithmetic
- general-purpose regular expressions
- context-dependent dictionaries (selecting a map based on client type, channel, scenario, country, etc.)
- nested `transform`
- user code callbacks (`eval`, plugin hooks)
- automatic type inference from content
- business-level data interpretation

These boundaries protect the library's architectural role as a data preparation layer, not a rules engine or decision engine. Business rules belong in `@processengine/rules`. Decisions belong in `@processengine/decisions`.

---

## Immutability contract of CompiledMapping

`compile(definition)` produces a `CompiledMapping` that is independent of the original `definition` object. The internal representation is a deep clone with deep freeze applied.

This means:

- mutating the `definition` object after `compile()` does not affect `execute()`
- the compiled artifact is safe to share across concurrent execution contexts
- `execute()` always works against the definition state at the moment of compilation

This contract is verified by contract tests in `test/contract.test.js`.

---

## JSON Schema and runtime validator

The JSON Schema at `schema/mapping-definition.v1.schema.json` is a formal, importable artifact that covers the structural shape of a valid mapping definition. It is a supported part of the public interface, exportable via:

```js
// Node.js
const schema = require("@processengine/mappings/schema/mapping-definition.v1.schema.json");
```

**What the schema covers:**

- required top-level fields (`mappingId`, `sources`, `output`)
- all operator argument shapes and types
- both forms of `mapValue` (root and step)
- `transform.steps` structure and argument types

**What the schema intentionally does not cover** (runtime-only invariants):

- `sources.*` path syntax validation (`sources.<n>.<field>`)
- target path conflict detection (one path being a prefix of another)
- cross-referencing: whether a source name used in a path is declared in `sources`
- path segment restrictions (`__proto__`, `prototype`, `constructor`, numeric indexes)

These invariants require runtime context and are enforced by the runtime validator (`compile()` / `validate()`). JSON Schema alone is not sufficient to fully validate a mapping definition — it should be used as a first-pass structural check, with runtime validation as the authoritative contract.

---

## Sensitive data in trace

Trace contains operator input and output values, which may include personally identifiable information after normalization (names, phone numbers, document numbers, emails).

Recommendations for production:

- disable trace (`trace: false`, the default) in standard production execution paths
- if trace is required for diagnostics, mask or filter values before logging
- do not store unmasked trace output in systems that do not meet applicable data protection requirements

The trace format is stable and considered part of the public contract. See the trace contract section in `SPEC_RU.md`.

---

## Operator lifecycle

**Stable:** fully tested, documented, and protected by compatibility contract.

**Deprecated:** marked as deprecated. Will not be removed before the next major version. Noted in changelog and documentation.

**Removed:** removed in a major version.

All v1.0.0 operators (`from`, `literal`, `exists`, `equals`, `coalesce`, `trim`, `lowercase`, `uppercase`, `normalizeSpaces`, `removeNonDigits`, `mapValue`, `transform`) are **Stable**.

---

## v2 Roadmap

The following capabilities are planned for v2 and are not part of the current stable contract:

- limited array normalization support (without general iteration language)
- date normalization
- phone number normalization

Addition of v2 capabilities will be accompanied by explicit description of the boundary with the existing contract.
