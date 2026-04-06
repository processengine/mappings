# Examples for @processengine/mappings

This directory contains small but complete examples for the canonical `validate -> prepare -> execute` lifecycle.

## Included examples

- `basic-transform.mjs` — basic transformation from source to output.
- `validate-diagnostics.mjs` — invalid source, diagnostics, and `MappingsCompileError`.
- `runtime-error.mjs` — execution-time failure and `MappingsRuntimeError`.
- `trace-basic.mjs` — execution with `trace: 'basic'`.
- `trace-verbose.mjs` — execution with `trace: 'verbose'`.
- `prepared-artifact.mjs` — prepared artifact as the runtime boundary.
- `process-boundary.mjs` — example of mappings as a ProcessEngine boundary.
- `limitations.md` — examples of tasks that should not be forced into mappings.

## Existing example assets

The repository also contains JSON mapping and source fixtures under `examples/mappings/` and `examples/sources/`.
They remain useful for CLI smoke checks and small manual runs.
