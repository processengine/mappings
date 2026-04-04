# @processengine/mappings

[![CI](https://github.com/processengine/mappings/actions/workflows/ci.yml/badge.svg)](https://github.com/processengine/mappings/actions)
[![npm](https://img.shields.io/npm/v/@processengine/mappings)](https://www.npmjs.com/package/@processengine/mappings)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node 18+](https://img.shields.io/badge/Node-18%2B-green)](https://nodejs.org/)

Declarative JSON mapping and normalization library for [@processengine](https://github.com/processengine).

Describe in configuration how to extract fields from one or more JSON objects, normalize their values, and assemble a new JSON structure — without application code.

**[Русская документация](README.ru.md) · [Нормативная спецификация](SPEC_RU.md) · [Политика совместимости](docs/COMPATIBILITY.md)**

---

## Architecture

```text
input
  ↓
flow (process)
  ├─ mapping    ← this library: extract, normalize, prepare data
  ├─ rule       — validate against business rules
  ├─ decision   — choose a branch or next step
  ├─ command    — perform an action
  └─ ...
  ↓
output
```

`@processengine/mappings` sits between raw input and business logic. It handles structural preparation and value normalization — nothing more.

**What it does:**

- copy fields from sources into a new structure
- normalize strings (trim, case, whitespace, digits)
- canonicalize values via explicit dictionaries
- compute simple boolean flags from a single value
- chain multiple normalization steps on one value

**What it intentionally does not do:**

- conditional logic (`if`/`else`, branching)
- arithmetic
- regular expressions
- business rule evaluation
- decision making
- context-dependent data interpretation

---

## Installation

```bash
npm install @processengine/mappings
```

Requires Node.js >= 18. No runtime dependencies.

---

## Quick start

```js
const { compile } = require("@processengine/mappings");

const definition = {
  mappingId: "client.normalize.v1",
  sources: { raw: "object" },
  output: {
    "client.phone": { removeNonDigits: "sources.raw.phone" },
    "client.email": { lowercase: "sources.raw.email" },
    "client.name": { normalizeSpaces: "sources.raw.fullName" },
    "client.gender": {
      transform: {
        from: "sources.raw.gender",
        steps: [
          { trim: true },
          { uppercase: true },
          {
            mapValue: {
              map: { M: "MALE", Ж: "FEMALE", F: "FEMALE" },
              fallback: null,
            },
          },
        ],
      },
    },
    "client.currency": {
      mapValue: {
        from: "sources.raw.currencyCode",
        map: { RUR: "RUB", 643: "RUB", 840: "USD" },
        fallback: "passthrough",
      },
    },
  },
};

// Compile once — execute many times
const result = compile(definition);
if (!result.success) {
  console.error(result.error); // { code, message, phase, targetPath?, operator? }
  process.exit(1);
}

const { mapping } = result; // CompiledMapping — immutable, reusable

const output = mapping.execute({
  raw: {
    phone: "+7 (999) 111-22-33",
    email: "CUSTOMER@EXAMPLE.COM",
    fullName: "  Иван   Иванов  ",
    gender: "M",
    currencyCode: "RUR",
  },
});

console.log(output.result);
// {
//   client: {
//     phone:    '79991112233',
//     email:    'customer@example.com',
//     name:     'Иван Иванов',
//     gender:   'MALE',
//     currency: 'RUB',
//   }
// }
```

---

## Compile-first pattern

Compile-first separates definition validation (once at startup) from data processing (many times per request):

```js
const { compile } = require("@processengine/mappings");

// Step 1 — compile once
const result = compile(definition);
if (!result.success) {
  // error.phase === 'compile'
  // error.code, error.targetPath, error.operator — see error model below
  throw new Error(`[${result.error.code}] ${result.error.message}`);
}

const { mapping } = result; // immutable CompiledMapping

// Step 2 — execute many times
const out = mapping.execute(sources);
const outWithTrace = mapping.execute(sources, { trace: true });
```

For one-off calls and tests, `engine.run()` is available as shorthand (compiles and executes in one call):

```js
const { MappingEngine } = require("@processengine/mappings");
const engine = new MappingEngine();

const out = engine.run({ definition, sources });
```

---

## Operators

### Structural mapping

| Operator   | Description                                                          |
| ---------- | -------------------------------------------------------------------- |
| `from`     | Copies a value from a source path (deep copy for objects and arrays) |
| `literal`  | Inserts a constant value                                             |
| `exists`   | Returns `true` if path resolves to a non-null value                  |
| `equals`   | Strict (`===`) comparison with a literal → always returns boolean    |
| `coalesce` | Returns the first non-null value from 1–4 path or literal candidates |

**Note on `exists` and `equals`:** these operators compute simple one-value technical flags. Logical compositions (`and`, `or`, `not`) are not supported and will not be added. Business-level facts belong in `@processengine/rules`.

### String normalization

| Operator          | Description                                                |
| ----------------- | ---------------------------------------------------------- |
| `trim`            | Removes leading and trailing whitespace                    |
| `lowercase`       | Converts to lowercase                                      |
| `uppercase`       | Converts to uppercase                                      |
| `normalizeSpaces` | Trim + collapse internal whitespace sequences to one space |
| `removeNonDigits` | Keeps only `[0-9]` characters                              |

All string operators: if the value is not a string, is `null`, or the path does not resolve — the output field is **not created** (no implicit type coercion).

Special case: `removeNonDigits` creates `""` if nothing remains after filtering (`"---"` → `""`). An empty string is `outputCreated: true` — it is not the same as an absent field.

### Dictionary canonicalization: `mapValue`

```js
// Root form — standalone operator
'payment.currency': {
  mapValue: {
    from:     'sources.req.currencyCode',
    map:      { RUR: 'RUB', '643': 'RUB', '840': 'USD' },
    fallback: 'passthrough',
  }
}
```

`mapValue` does **not** perform implicit type coercion. The number `643` and the string `"643"` are different values.

`fallback` behavior when the key is not found:

| `fallback`      | Behavior                              |
| --------------- | ------------------------------------- |
| absent          | Field not created                     |
| `null`          | Field created with `null`             |
| `"passthrough"` | Field created with the original value |
| JSON literal    | Field created with that literal       |

### Normalization chain: `transform`

Use when two or more sequential operations are needed on a single value. `transform` is a standalone root operator and cannot be combined with others on the same field.

```js
'client.gender': {
  transform: {
    from: 'sources.raw.gender',
    steps: [
      { trim:      true },
      { uppercase: true },
      { mapValue: { map: { M: 'MALE', Ж: 'FEMALE', F: 'FEMALE' }, fallback: null } },
    ],
  },
}
```

- **Minimum 2 steps, maximum 8.** For a single step use the corresponding root operator.
- Allowed steps: `trim`, `lowercase`, `uppercase`, `normalizeSpaces`, `removeNonDigits` (argument `true`); `mapValue` in step form (no `from` field).
- The chain stops at the first step that cannot produce a value.

---

## Field creation semantics

Every operator produces exactly one of two outcomes:

- **`outputCreated: true`** — field is written to the result with a specific value
- **`outputCreated: false`** — field is not written to the result at all

`null`, `""`, `false`, and `0` are all valid output values (`outputCreated: true`). Only `outputCreated: false` means the field is absent.

---

## Tracing

```js
const out = mapping.execute(sources, { trace: true });
// out.trace — array of entries, one per output field
```

Each entry includes `target`, `op`, `outputCreated`, `outputValue` (when created). For `transform`, `steps` contains per-step detail including `in`, `out`, `applied`. On chain stop, the failing step carries `stoppedChain: true` and `reason`.

Trace entries use `from` (not `path`) to refer to source paths — consistent with the definition DSL.

**Security:** trace contains operator input and output values. In production with personal data (names, phones, documents), disable trace (`trace: false`, the default) or mask values before logging.

---

## Error model

All methods return `MappingResult` and never throw exceptions.

```js
// Success
{ status: 'SUCCESS', mappingId: '...', result: { ... } }

// Error
{
  status: 'MAPPING_ERROR',
  mappingId?: '...',
  error: {
    code:        'INVALID_ARGS',       // machine-readable, stable
    message:     'human-readable ...',
    phase:       'compile',            // 'compile' | 'execute'
    operator:    'transform',          // present when applicable
    targetPath:  'client.gender',      // present when applicable
    from:        'sources.raw.gender', // present when applicable
    stepIndex:   1,                    // present for transform step errors
  }
}
```

**Compile errors** (`phase: 'compile'`): `INVALID_MAPPING_SCHEMA`, `INVALID_MAPPING_ID`, `UNKNOWN_OPERATOR`, `INVALID_ARGS`, `INVALID_SOURCE_DECLARATION`, `INVALID_PATH`, `INVALID_TARGET_PATH`, `CONFLICTING_TARGET_PATHS`.

**Execute errors** (`phase: 'execute'`): `MISSING_SOURCE`, `INVALID_SOURCE_TYPE`, `INVALID_SOURCE_CONTENT`, `INTERNAL_ERROR`.

---

## CLI

```bash
# Validate a definition file
mappings validate-file path/to/definition.json

# Run a mapping against sources
mappings run-file path/to/definition.json --sources path/to/sources.json [--trace]

# Validate all *.json files in a directory (recursive)
mappings validate-dir path/to/mappings/

# List all mapping IDs found in a directory
mappings list path/to/mappings/

# Machine-readable JSON output (for CI/CD)
mappings validate-file definition.json --json
mappings run-file definition.json --sources sources.json --json
```

Exit codes: `0` = success, `1` = error.

---

## TypeScript

Types are auto-resolved via the `types` field in `package.json`. No extra configuration needed.

```typescript
import {
  compile,
  type MappingDefinition,
  type MappingResult,
} from "@processengine/mappings";

const definition: MappingDefinition = {
  mappingId: "client.normalize.v1",
  sources: { raw: "object" },
  output: {
    "client.phone": { removeNonDigits: "sources.raw.phone" },
    "client.email": { lowercase: "sources.raw.email" },
    "client.gender": {
      transform: {
        from: "sources.raw.gender",
        steps: [
          { trim: true },
          { uppercase: true },
          { mapValue: { map: { M: "MALE", F: "FEMALE" }, fallback: null } },
        ],
      },
    },
  },
};

// compile() returns CompileResult — discriminated union
const compiled = compile(definition);

if (!compiled.success) {
  // compiled.error is typed as MappingError with code, message, phase, targetPath...
  console.error(`[${compiled.error.code}] ${compiled.error.message}`);
  process.exit(1);
}

// compiled.mapping is CompiledMapping — immutable, reusable
const { mapping } = compiled;

// execute() returns MappingResult — discriminated union
const out: MappingResult = mapping.execute({
  raw: { phone: "+7 (999) 111-22-33", email: "USER@EXAMPLE.COM", gender: "M" },
});

if (out.status === "SUCCESS") {
  // out.result is Record<string, unknown>
  console.log(out.result.client);
  // { phone: '79991112233', email: 'user@example.com', gender: 'MALE' }
}
```

All operator shapes (`FromOperator`, `MapValueOperator`, `TransformArgs`, etc.) are exported from `types/index.d.ts` for use in typed definition builders.

---

## JSON Schema

A formal JSON Schema for mapping definitions is at `schema/mapping-definition.v1.schema.json`. Use it for editor validation, IDE autocompletion, or external CI checks independent of the runtime validator.

---

## Benchmarks

```bash
node benchmarks/run.mjs
```

Measures `compile()`, `execute()` (the production hot path), and `run()` (one-off). On a representative mapping with all operator types: `execute()` runs at ~187K ops/s; `compile()` at ~40K ops/s. See [docs/BENCHMARKS.md](docs/BENCHMARKS.md) for interpretation and limitations.

---

## Compatibility

Follows [Semantic Versioning](https://semver.org/). See [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) for the full policy: breaking changes, operator lifecycle, hard architectural boundaries, the immutability contract of `CompiledMapping`, and the sensitive-data trace policy.

All v1.0.0 operators are **Stable**.

---

## JSON Schema

A formal JSON Schema for mapping definitions is available as a stable importable subpath:

```js
const schema = require("@processengine/mappings/schema/mapping-definition.v1.schema.json");
```

The schema covers the structural shape of all operators and their argument types. It does **not** cover runtime-only invariants: source path syntax, cross-references between paths and declared sources, conflicting target paths. Those are enforced by `compile()` and `validate()`. See [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) for details.

---

## Known limitations (v1)

- **No array support.** Source paths with numeric indexes (`sources.a.items.0`) are rejected at compile time. Normalizing collections of elements is planned for v2.
- **No date normalization.** Date parsing and formatting is out of scope for v1.
- **No phone normalization beyond digit extraction.** `removeNonDigits` extracts digits; country-specific phone formatting is out of scope.
