# Limitations and non-goals

`@processengine/mappings` is intentionally small in scope.

## Good fit

- rename, copy, normalize, and reshape fields;
- map codes to stable values;
- derive small normalized flags;
- prepare payloads for the next explicit runtime boundary.

## Not a good fit

- workflow orchestration;
- external HTTP or database calls;
- stateful processing;
- arbitrary loops and branching;
- complex business algorithms.

If the logic is fundamentally procedural, keep it procedural in code.
