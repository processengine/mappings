# Changelog

## [3.0.0] — 2026-05-17

### Changed
- Reworked package as Flow 5 `@processengine/mappings` v3.
- Replaced named `sources.*` with a single input object rooted at `$`.
- Added required `kind`, `title`, and `description` source fields.
- Runtime result is canonical `{ output, trace? }` and JSON-safe / transport-safe.
- Added runtime boundary hardening: strict execution options, defensive prepared artifact validation, JSON-safe trace/redactor validation, deeply immutable prepared artifacts, and prototype-pollution protection for target/projection keys.
- Removed unused public options from `validateMappings` and `prepareMappings`.

### Removed
- Removed v2 source format and legacy operators: `literal`, `mapValue`, `transform`, `template`, `joinNonEmpty`, `collectObject`, `countAtLeast`, `existsAll`, `pickFirst`.

### Added
- Added v3 operators: `const`, `text`, `dictionary`, `join`, `findOne`, and role-aware lint diagnostics.
- Added v3 examples, migration guide, compatibility document, and pack/install smoke.
- Enforced explicit `$.` PathRefs for `collect.select` string and projection selectors.

### Security
- Forbid `__proto__`, `prototype`, and `constructor` as target path/projection segments.

### Documentation
- Expanded normative documentation with design rules, runtime boundary guarantees, security constraints, operator semantics matrix, negative examples, and Flow 5 interop fixtures.
- Added `SECURITY.md`.
