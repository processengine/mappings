# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Compatibility policy: [COMPATIBILITY.md](COMPATIBILITY.md).

---

## [2.1.0] — 2026-04-22

Feature release for limited array DSL and compiled prepared artifact `v2`.

### Added

- Limited array DSL operators:
  - `collect`
  - `count`
  - `existsAny`
  - `existsAll`
  - `pickFirst`
- Aggregate conditions with:
  - `equals`
  - `in`
  - `startsWith`
- Aggregate trace events with compact `basic` output and richer `verbose` output.
- Prepared artifact `v2` with compiled execution plan.
- Example mapping and sources for beneficiary-like `issues[*]` and `clients[*]` scenarios.
- Array DSL tests for runtime semantics and validation warnings.
- `RELEASE_NOTES_2.1.0.md`.

### Changed

- `prepareMappings(...)` now produces `v2` prepared artifacts.
- `executeMappings(...)` supports `v2` compiled execution and retains `v1` legacy compatibility.
- Schema updated to document aggregate operators and `pickFirst`.
- README, SPEC, COMPATIBILITY, MIGRATION, examples, and changelog updated for the array DSL release.

### Notes

- This release intentionally keeps array support small and declarative.
- Numeric indexes, nested wildcard, `groupBy`, `mapEach`, general `reduce`, and expression DSL remain out of scope.
- `existsAll([]) -> true` is preserved as first-version vacuous truth semantics.

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

---

## [2.0.0] — 2026-04-06

First public release of the canonical `@processengine/mappings` line.
