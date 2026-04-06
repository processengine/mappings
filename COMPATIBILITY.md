# Compatibility

Public compatibility is evaluated by the documented package contract.

## Public contract

The following are public:

- exported API names and signatures
- diagnostics shape returned by `validateMappings(...)`
- `MappingsCompileError` and `MappingsRuntimeError`
- success result shape of `executeMappings(...)`
- documented trace levels and event shape
- explicit package exports

## Not public

The following are internal implementation details:

- internal validator/executor structure
- internal artifact fields beyond documented public properties
- internal helper modules under `src/internal`

## Artifact compatibility

The prepared artifact is intentionally opaque-ish.
The public guarantee is limited to:

- it is a prepared mappings artifact
- it is accepted by `executeMappings(...)`
- it behaves as immutable from the consumer perspective

No broad serialization compatibility is promised in this stage.
