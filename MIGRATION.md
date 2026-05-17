# Migration: @processengine/mappings v2 -> v3

v3 is a rewrite, not a compatibility update. Do not preserve v2 source format inside v3 runtime.

## Main change

```text
v2: sources.input.name
v3: $.name
```

`dataflows` chooses the input with `contract.input.ref`; mappings receives one compact input object.

## Required source changes

1. Remove `sources`.
2. Add `kind`, `title`, `description`.
3. Rewrite all `sources.*` paths to `$.*` paths.
4. Ensure `output` is non-empty.

## Operator migration

```text
literal       -> const
mapValue      -> dictionary
transform     -> text
template      -> join or structured result
joinNonEmpty  -> join
collectObject -> collect.select object
countAtLeast  -> count + decisions.gte
existsAll     -> count + decisions.eqFact
pickFirst     -> decision invariant + findOne
```

## Multi-input

Do not reintroduce named sources. If a mapping needs composite input, add a previous `MAPPINGS kind=payload` item in the dataflow that builds the compact input object.
