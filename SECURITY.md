# Security Policy

`@processengine/mappings` is a DSL runtime. Treat mapping artifacts and runtime inputs as untrusted unless they come from a trusted artifact registry.

## Security boundaries

The package enforces the following public security constraints:

- Target paths and projection keys must not contain `__proto__`, `prototype`, or `constructor` segments.
- Runtime applies the same unsafe-segment checks when executing prepared artifacts; validation is not the only defense.
- Source artifacts must be JSON-safe. `BigInt`, functions, `Date`, `Map`, `Set`, symbols, `undefined`, and cyclic references are not valid source values.
- Runtime input, output, and trace must be JSON-safe / transport-safe.
- Trace redaction must return JSON-safe values. Non-JSON-safe redaction output is rejected with a typed runtime error.
- Malformed prepared artifacts are rejected with `MAPPINGS_PREPARED_ARTIFACT_INVALID` rather than executed best-effort.

## Reporting security issues

Report vulnerabilities through the repository security advisory flow or the maintainer channel used by the ProcessEngine team. Do not publish exploit details before a fix is available.

## Prototype pollution regression

The following must remain invalid:

```json
{
  "output": {
    "__proto__.polluted": { "const": "yes" }
  }
}
```

The expected result is a validation/runtime error and no mutation of global object prototypes.
