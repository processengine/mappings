# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).  
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).  
Compatibility policy: [COMPATIBILITY.md](COMPATIBILITY.md).

---

## [2.0.1] — 2026-04-06

Documentation and examples release for the canonical `2.x` line.

### Added

- Substantially expanded `README.md` and `README.ru.md` as full entry points into the library.
- Substantially expanded `SPEC.md` and `SPEC_RU.md` into normative library specifications.
- Repository examples covering:
  - basic transformation;
  - validate + diagnostics;
  - runtime error;
  - trace basic;
  - trace verbose;
  - prepared artifact usage;
  - use as a ProcessEngine boundary;
  - limitations and non-goals.
- Documentation badge block in README for npm version, CI status, Node requirement, and license.
- `RELEASE_NOTES_2.0.1.md` for the documentation maturity release.

### Changed

- Documentation terminology aligned across README, specification, migration guide, compatibility notes, changelog, and release notes.
- Documentation examples rewritten to be neutral library examples rather than project-specific examples.
- English and Russian documentation brought to the same semantic depth.

### Notes

- This release does not change package shape, canonical API, or runtime model.
- The `2.0.0` release remains the first public canonical API release.

---

## [2.0.0] — 2026-04-06

First public release of the canonical `@processengine/mappings` line.

### Changed

- Public API aligned with the ProcessEngine canon: `validateMappings(...)`, `prepareMappings(...)`, and `executeMappings(...)` are the normative public entrypoints.
- Legacy API removed from public exports: `MappingEngine`, public `compile(...)`, and mixed runtime entrypoints are no longer part of the product contract.
- Package moved to `ESM-first`, `dist-only`, explicit exports, and Node.js `>=20.19.0`.
- `executeMappings(...)` now accepts only a prepared artifact and does not perform hidden compile work.
- Prepared artifact formalized as a minimal public, opaque-ish runtime entity.

### Added

- `MappingsCompileError` and `MappingsRuntimeError` as typed compile/runtime errors.
- `formatMappingsDiagnostics(...)` and `formatMappingsRuntimeError(...)` for CLI, logs, and debugging.
- Canonical trace with `false | "basic" | "verbose"` and basic redaction support.
- `MIGRATION.md` as the migration route from the old public API.
- Contract tests, trace tests, pack/install tests, and regression coverage through the canonical API.

### Documentation

- README, specifications, compatibility notes, and migration guide rewritten for the canonical library form.

---

## Before 2.0.0

Before `2.0.0`, the library existed in a pre-canonical internal line built around `MappingEngine` and public `compile(...)`.
The public canonical release line starts at `2.0.0`.
