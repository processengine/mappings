# Compatibility

## Runtime

Requires Node.js `>=20.19.0`.

## Source compatibility

v3 does not support v2 source artifacts. `sources`, `sources.*` paths, and v2 operators are rejected.

## Prepared artifact compatibility

Prepared artifacts have `artifactType: 'mappings'` and `version: 'v3'`. The `compiledPlan` field exists but its structure is internal and not a stable persistence format.

## Runtime result compatibility

`executeMappings` returns `{ output, trace? }`. The result is JSON-safe / transport-safe and is suitable for direct use by `@processengine/dataflows` and downstream ProcessEngine libraries.


## Runtime boundary compatibility

`executeMappings(...)` is a closed public runtime boundary. Invalid options, malformed prepared artifacts, non-JSON-safe inputs/outputs/trace values, unsafe target path segments, and malformed redactor output are surfaced as `MappingsRuntimeError` with stable machine-readable codes. Raw JavaScript errors such as `TypeError`, `RangeError`, or JSON serialization errors must not escape the public runtime API.

`validateMappings(source)` and `prepareMappings(source)` do not accept public options in v3. Future options require an explicit compatibility decision.

## Module format

This package is native ESM (`"type": "module"`). ESM import is the canonical import mode:

```js
import { validateMappings, prepareMappings, executeMappings } from '@processengine/mappings';
```

CommonJS consumers may use Node.js dynamic `import()`. CJS `require('@processengine/mappings')` is not a supported v3 contract.

## Security compatibility

The prototype-pollution protections for target paths and projection keys are part of the v3 public contract. Relaxing these checks would be a breaking and security-sensitive change.
