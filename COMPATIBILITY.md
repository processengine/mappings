# COMPATIBILITY

## Scope

This document defines the compatibility surface of `@processengine/mappings` as a ProcessEngine family library.

## Runtime and package compatibility

- Node.js: `>=20.19.0`
- Package shape: ESM-first, `dist/`-only public runtime
- CLI: `bin/mappings.js` commands documented in README

## Public API compatibility

The following are public and compatibility-relevant:
- `validateMappings(...)`
- `prepareMappings(...)`
- `executeMappings(...)`
- `MappingsCompileError`
- `MappingsRuntimeError`
- diagnostics result shape `{ ok, diagnostics }`
- success result shape `{ output, trace? }`
- trace levels `false | 'basic' | 'verbose'`

## Source artifact compatibility

Public source artifact compatibility covers:
- top-level fields `mappingId`, `sources`, `output`
- documented built-in operators
- documented operator field semantics
- documented limitations of first array DSL version

Adding new optional operators is non-breaking.
Changing the meaning of an existing operator is breaking.

## Prepared artifact compatibility

Prepared artifact compatibility is intentionally narrow.

Public guarantees:
- artifact `type === 'mapping'`
- `mappingId` remains stable
- `version` remains present
- artifact is accepted by `executeMappings(...)`
- artifact is immutable from consumer perspective

### Artifact versions

- `v1` — legacy prepared artifact execution path
- `v2` — current prepared artifact with compiled execution plan

`executeMappings(...)` accepts both `v1` and `v2` prepared artifacts.
`prepareMappings(...)` in `2.1.x` produces `v2`.

Internal compiled structures of `v2` are intentionally not public.

## Runtime result compatibility

The runtime success result is transport-safe / JSON-safe by normative shape and suitable for direct handoff to the next ProcessEngine family layer without host-side cleanup.

Breaking changes include:
- removing `output`
- replacing `trace` with another envelope shape
- returning non-JSON-safe runtime results

## Trace compatibility

Stable trace contract:
- event array when trace is enabled
- event fields `kind`, `artifactType`, `artifactId`, `step`, `at`, `outcome`, `target`
- `basic` remains compact
- `verbose` may add more payload fragments

Adding optional trace details is non-breaking.
Removing stable fields or changing trace mode semantics is breaking.

## Breaking changes

Breaking changes include:
- public API rename or removal
- change in source operator semantics
- incompatible artifact version handling
- incompatible runtime result shape
- incompatible trace mode semantics
- removal of documented diagnostics or error codes relied on by examples/tests


## 2.2.0 additive DSL change

Version 2.2.0 adds the non-breaking aggregate operator `collectObject`. Existing prepared artifacts and mapping sources remain valid.

## 2.3.0 string expressions compatibility

`joinNonEmpty` and `template` are backward-compatible additions to the source DSL.

- Existing artifacts continue to work unchanged.
- New string operators require `PreparedMappingsArtifact v2`.
- The legacy `v1` execution path does not support these operators.
- Runtime results of the new operators are transport-safe and JSON-safe: `string` or `null`.
- `coalesce` treats `null` from `joinNonEmpty` as an empty candidate and continues to the next candidate.
