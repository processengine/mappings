# Release Notes — 2.2.0

## Highlights

- Added `collectObject` to array DSL.
- You can now build compact merchant-facing error objects directly in mappings.
- No breaking changes to package shape, exports, CLI or Node baseline.

## New operator

```json
{
  "merchantErrors": {
    "collectObject": {
      "from": "sources.rules.issues[*]",
      "where": { "field": "level", "equals": "ERROR" },
      "fields": {
        "code": "code",
        "message": "message",
        "field": "field"
      }
    }
  }
}
```

## Verification

This release is intended to pass unit tests, pack/install tests, CLI smoke tests and `npm pack` without package-shape regression.
