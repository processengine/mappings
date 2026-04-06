# @processengine/mappings

Декларативная библиотека преобразования JSON-данных для семейства ProcessEngine.

`@processengine/mappings` — это слой нормализации и преобразования данных. Он один раз подготавливает mapping-артефакт и затем многократно исполняет его на входных данных времени выполнения.

## Публичный API

Канонический публичный API:

- `validateMappings(source, options?)`
- `prepareMappings(source, options?)`
- `executeMappings(artifact, input, options?)`
- `MappingsCompileError`
- `MappingsRuntimeError`
- `formatMappingsDiagnostics(...)`
- `formatMappingsRuntimeError(...)`

Legacy API вроде `MappingEngine` и старого `compile()` наружу больше не публикуется.

## Установка

```bash
npm install @processengine/mappings
```

Минимальная версия Node.js: `>=20.19.0`.

## Быстрый старт

```js
import {
  validateMappings,
  prepareMappings,
  executeMappings,
} from '@processengine/mappings';

const source = {
  mappingId: 'person.normalize.v1',
  sources: { input: 'object' },
  output: {
    'person.name': { trim: 'sources.input.name' },
    'person.hasInn': { exists: 'sources.input.inn' },
  },
};

const validation = validateMappings(source);
if (!validation.ok) {
  throw new Error('Некорректный mapping source');
}

const artifact = prepareMappings(source);
const result = executeMappings(artifact, {
  input: { name: '  Alice  ', inn: '1234567890' },
}, { trace: 'basic' });

console.log(result.output);
```

## Runtime-контракт

`executeMappings(...)` возвращает стабильный success result:

```js
{
  output: { ... },
  trace: [ ... ] // опционально
}
```

Ошибки compile/runtime-фазы отдаются через typed errors:

- `MappingsCompileError`
- `MappingsRuntimeError`

## Trace

Поддерживаются режимы:

- `false`
- `'basic'`
- `'verbose'`

`basic` даёт компактную и безопасную трассировку.
`verbose` может включать redacted-фрагменты входа и результата. Для управления маскированием используйте `redact`.

## Форма поставки

Пакет публикуется как:

- ESM-first
- dist-only runtime
- явные `exports`
- с типами `.d.ts`

Установленный пакет не исполняет файлы из `src/`.

## Документация

- [SPEC.md](./SPEC.md)
- [SPEC_RU.md](./SPEC_RU.md)
- [COMPATIBILITY.md](./COMPATIBILITY.md)
- [MIGRATION.md](./MIGRATION.md)
