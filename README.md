# @processengine/mappings v3

A safe declarative DSL for turning raw microservice JSON responses into normalized decision facts.

`@processengine/mappings` v3 performs one job:

```text
prepared mapping + input object -> { output }
```

It does not know Flow graph state, `PROCESS/DATA`, `CONTROL/ROUTE`, effects, waits, or process persistence. Composition belongs to `@processengine/dataflows`.

## Canonical lifecycle

```js
import {
  validateMappings,
  prepareMappings,
  executeMappings,
} from "@processengine/mappings";

const source = {
  mappingId: "mappings.client.payload",
  kind: "payload",
  title: "Build client payload",
  description: "Normalizes client data for a downstream adapter.",
  output: {
    name: { text: { from: "$.client.name", trim: true } },
    phone: { removeNonDigits: "$.contacts.phone" },
  },
};

const validation = validateMappings(source);
if (!validation.ok) throw new Error(JSON.stringify(validation.diagnostics));

const artifact = prepareMappings(source);
const result = executeMappings(artifact, {
  client: { name: "  Alice  " },
  contacts: { phone: "+1 (555) 000-0000" },
});

console.log(result.output);
```

## Source artifact v3

```ts
interface MappingDefinitionV3 {
  mappingId: string;
  kind: "payload" | "facts" | "result";
  title: string;
  description: string;
  output: Record<TargetPath, MappingExpression>;
  metadata?: Record<string, JsonValue>;
}
```

`output` must be a non-empty object. Source `version`, `sources`, and `compiledPlan` are forbidden.

## Prepared artifacts

`prepareMappings(...)` deep-copies the source and returns a deeply immutable prepared artifact. Mutating the original source, `compiledPlan`, or the object returned by `getDefinition()` must not change execution behavior.

## Runtime result

```ts
interface ExecuteMappingsResult {
  output: JsonObject;
  trace?: MappingTraceEvent[];
}
```

The result is JSON-safe / transport-safe and can be passed to downstream ProcessEngine libraries without host-side cleanup.

## Supported operators

```text
from
const
coalesce
text
removeNonDigits
dictionary
equals
exists
count
existsAny
containsValue
collect
join
findOne
```

Legacy v2 operators and `sources.*` paths are not supported in v3. `collect.select` must use explicit `$.` PathRefs, for example `select: '$.code'` or `select: { code: '$.code' }`; implicit selectors like `code` are invalid.

## CLI

```bash
node bin/mappings.js validate-file examples/mappings/client_payload.json --json
node bin/mappings.js compile examples/mappings/client_payload.json --json
node bin/mappings.js run-file examples/mappings/client_payload.json --input examples/input/client.json --trace verbose --json
node bin/mappings.js validate-dir examples --json
```

## Documentation

- `SPEC.md` / `SPEC_RU.md` — normative v3 specification
- `MIGRATION.md` — v2 to v3 migration guide
- `COMPATIBILITY.md` — compatibility policy
- `examples/` — payload, facts, and result artifacts

## Design rules

- One mapping artifact = one transformation.
- Composition belongs to `@processengine/dataflows`.
- Decision logic belongs to `@processengine/decisions`.
- v3 has no hidden pipeline, no hidden selection, and no v2 compatibility mode.
- `mappingId` is the mappings artifact identifier. It plays the same role as `id` in Flow/dataflow artifacts.

## Boundary and security guarantees

Prepared artifacts are deep-copied and deeply immutable. Mutating the original source or the object returned by `getDefinition()` does not affect runtime behavior.

Target paths and projection keys forbid `__proto__`, `prototype`, and `constructor`. Runtime revalidates prepared artifacts before execution.

`text` and `removeNonDigits` return `""` for missing or `null` input. `join` skips empty values; string join items that start with `$.` are paths, while other strings are literals.

See `SECURITY.md` for security constraints and `SPEC_RU.md` for the operator semantics matrix.
