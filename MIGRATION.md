# Migration to 2.x

## Breaking changes

- `MappingEngine` is no longer part of the public package API.
- `compile()` is no longer part of the public package API.
- Runtime no longer mixes prepare and execute in one public entrypoint.
- Package exports now point to `dist/` only.
- Package is now ESM-first.

## New canonical path

Old style:

```js
const engine = new MappingEngine();
const compileResult = engine.compile(definition);
const runtimeResult = compileResult.mapping.execute(sources, { trace: true });
```

New style:

```js
import {
  validateMappings,
  prepareMappings,
  executeMappings,
} from '@processengine/mappings';

const validation = validateMappings(source);
if (!validation.ok) {
  // inspect validation.diagnostics
}

const artifact = prepareMappings(source);
const result = executeMappings(artifact, input, { trace: 'basic' });
```

## Error handling

Compile errors now throw `MappingsCompileError`.
Runtime errors now throw `MappingsRuntimeError`.
