# SPEC: @processengine/mappings

## Purpose

Mappings is the ProcessEngine runtime responsible for declarative data transformation and normalization.

## Source model

A mapping source contains:

- `mappingId`
- `sources`
- `output`

Each `output` field contains exactly one operator.

## Compile semantics

- `validateMappings(...)` validates source without throwing on invalid input.
- `prepareMappings(...)` validates and prepares an immutable artifact.
- Invalid source leads to `MappingsCompileError`.

## Runtime semantics

- `executeMappings(...)` accepts only a prepared artifact.
- Runtime does not perform hidden prepare/compile.
- Success result contains `output` and optional `trace`.
- Runtime failures are reported through `MappingsRuntimeError`.

## Trace model

Supported trace levels:

- `false`
- `basic`
- `verbose`

Trace events use a canonical ProcessEngine-oriented shape with `kind`, `artifactType`, `artifactId`, `step`, `at`, `outcome`, and optional `details`, `input`, `output`.

## Guarantees

Public contract includes:

- exported API names
- diagnostics shape
- typed errors
- runtime result shape
- trace shape on documented level
- explicit package exports
