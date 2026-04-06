# Migration to 2.x

## What changed

`2.x` is the canonical public line of `@processengine/mappings`.

Breaking changes from the pre-canonical engine-style API:
- `MappingEngine` is no longer part of the public package API;
- public `compile()` is no longer part of the public package API;
- public runtime no longer mixes prepare and execute in a single entrypoint;
- package exports point to `dist/` only;
- package publication is ESM-first.

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
  console.error(validation.diagnostics);
}

const artifact = prepareMappings(source);
const result = executeMappings(artifact, input, { trace: 'basic' });
```

## Error handling

Compile failures now throw `MappingsCompileError`.
Runtime failures now throw `MappingsRuntimeError`.

## Artifact model

Prepared artifacts are now first-class runtime entities.
Treat them as minimal public runtime objects suitable for `executeMappings(...)`, not as a rich public serialization format.

## Trace model

Legacy boolean-style trace usage is replaced in the public API by canonical trace modes:
- `false`
- `'basic'`
- `'verbose'`
