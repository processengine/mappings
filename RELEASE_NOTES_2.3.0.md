# Release notes — 2.3.0

## Added

- Added compiled string expression operators `joinNonEmpty` and `template`.
- Added support for `joinNonEmpty` and `template` inside `coalesce` candidates.
- Added validation diagnostics for invalid string operator shapes and non-scalar runtime values.
- Added tests for address `fullAddress` assembly from FIAS parts, coalesce fallback behavior, and template empty-variable semantics.

## Changed

- Extended prepared artifact `v2` compiled execution plan with string expression nodes.
- Updated schema, README, SPEC, compatibility and migration documentation for string operators.
- Added release workflow based on annotated version tags and npm publication through GitHub Actions.

## Compatibility

- Backward compatible for existing mappings artifacts.
- New string operators require prepared artifact `v2` and are not supported by the legacy `v1` execution path.
- Runtime outputs of new operators are transport-safe: `string` or `null`.
