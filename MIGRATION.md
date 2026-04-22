# MIGRATION

## Migration to 2.1.x

`2.1.x` is a feature release on top of the canonical `2.x` line.

## What changed

- `prepareMappings(...)` now produces prepared artifact version `v2`.
- `v2` uses a compiled execution plan internally.
- Limited array DSL is added:
  - `collect`
  - `count`
  - `existsAny`
  - `existsAll`
  - `pickFirst`
- `executeMappings(...)` still accepts legacy prepared artifacts through the `v1` compatibility path.

## What did not change

- canonical public API names
- success result shape `{ output, trace? }`
- typed compile/runtime errors
- ESM-first package shape

## Source migration

Old source artifacts continue to work.

No migration is required for existing v1-style operators.
You may start using new aggregate operators only where multiplicity is really part of fact construction.

## Prepared artifact migration

If your application persisted prepared artifacts explicitly:
- artifacts prepared before `2.1.x` may still execute through the legacy `v1` path;
- artifacts prepared in `2.1.x` will be `v2`.

Recommended migration path:
- re-run `prepareMappings(...)` from source artifacts when moving to `2.1.x`.

## Behavioral notes

### `collect`
If `value` cannot be resolved for a selected element, that element is skipped.
This is not a runtime error. Use trace to inspect `droppedCount`.

### `existsAll([])`
`existsAll([])` returns `true`.
This is vacuous truth. In business flows it is usually safer to pair it with a count fact.

### `pickFirst([])`
Returns `null`.

## Migration examples

Before:
```js
const artifact = prepareMappings(oldSource);
const result = executeMappings(artifact, input);
```

After:
```js
const artifact = prepareMappings(sourceWithAggregates);
const result = executeMappings(artifact, input, { trace: 'basic' });
```
