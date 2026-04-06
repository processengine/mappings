# Release notes — 2.0.0

`2.0.0` is the first public release of the canonical `@processengine/mappings` line.

## Highlights

- Canonical public API:
  - `validateMappings(...)`
  - `prepareMappings(...)`
  - `executeMappings(...)`
- Legacy API removed from public exports.
- ESM-first and dist-only package shape.
- Typed diagnostics, `MappingsCompileError`, and `MappingsRuntimeError`.
- Trace modes: `false | "basic" | "verbose"`.
- Minimal public prepared artifact for runtime execution.
- `MIGRATION.md` included as the migration path from the old API.

## Summary

This release makes `@processengine/mappings` a canonical ProcessEngine product package rather than a legacy engine-style library surface. The internal mapping semantics are preserved, while the public contract, packaging, diagnostics, trace model, and documentation are aligned with the ProcessEngine API canon.
