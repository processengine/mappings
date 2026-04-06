# Compatibility

Public compatibility for `@processengine/mappings` is evaluated by the documented package contract rather than by internal implementation details.

## Public contract

The following are public:

- exported API names and signatures;
- diagnostics shape returned by `validateMappings(...)`;
- `MappingsCompileError` and `MappingsRuntimeError` at the documented level;
- success result shape of `executeMappings(...)`;
- documented trace levels and documented event model;
- explicit package exports;
- documented minimal artifact contract.

## Not public

The following are internal and may change without a breaking release:

- internal validator structure;
- internal executor structure;
- internal helper modules;
- internal artifact internals beyond documented minimal fields;
- undocumented trace details;
- build scripts and internal repository layout.

## Artifact compatibility

The prepared artifact is intentionally opaque-ish.

The public guarantee is limited to:
- it is a prepared mappings artifact;
- it is accepted by `executeMappings(...)`;
- it behaves as immutable from the consumer perspective;
- documented minimal identity fields remain stable at the public level.

No broad serialization compatibility is promised unless explicitly documented in a future release.

## Breaking changes

A change is breaking if it incompatibly changes any documented part of the public contract, including:

- public API names or signatures;
- documented diagnostics shape;
- documented error shape;
- documented success result shape;
- documented trace modes or event model;
- explicit exports;
- documented artifact guarantees.
