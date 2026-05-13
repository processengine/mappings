# Release notes 2.4.0

## Summary

This release adds two small compiled aggregate operators to the official `@processengine/mappings` DSL:

- `countAtLeast`
- `containsValue`

They are intended to replace processor-local mapping wrappers and keep facts construction inside the canonical mappings module.

## Non-goals

The release intentionally does not add:

- `coalesceTransform`;
- `fallbackUsed`;
- custom mapping operators;
- map/filter/reduce or a general expression language.

Alias normalization should remain explicit in mappings. Diagnostic fallback decisions should be represented by rules.

## Release checklist

1. `npm ci`
2. `npm test`
3. `npm run test:pack`
4. Publish/package `@processengine/mappings@2.4.0`
5. Update processor dependency and local tgz if the processor still uses file dependencies.
