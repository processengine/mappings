# @processengine/mappings

[![npm version](https://img.shields.io/npm/v/%40processengine%2Fmappings)](https://www.npmjs.com/package/@processengine/mappings)
[![CI](https://github.com/processengine/mappings/actions/workflows/ci.yml/badge.svg)](https://github.com/processengine/mappings/actions/workflows/ci.yml)
[![Node >= 20.19.0](https://img.shields.io/badge/node-%3E%3D%2020.19.0-339933)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Декларативная библиотека преобразования JSON-данных для семейства ProcessEngine.

`@processengine/mappings` — это граница преобразования и нормализации данных в семействе ProcessEngine. Библиотека берёт декларативный mapping source, подготавливает runtime-артефакт и исполняет его на входных данных времени выполнения.

## Что это за библиотека

`mappings` — это небольшой runtime для простых, явных и декларативных преобразований данных.

Она подходит для задач вроде:
- нормализации сырого входа в устойчивую структуру;
- подготовки payload для следующего шага процесса;
- вычисления небольшого набора нормализованных facts из исходных данных;
- выноса логики преобразования из сервисного кода.

В общем потоке данных ProcessEngine `mappings` занимает место между сырыми данными и следующим слоем, которому нужен нормализованный output.

## Чего библиотека не делает

`mappings` — это не:
- язык общего назначения;
- runtime для stateful processing;
- место для сложной алгоритмической логики;
- механизм внешних вызовов, сетевого I/O и побочных эффектов.

Если задача требует циклов с произвольным управлением, состояния, внешних вызовов или заметной процедурной логики, её нужно выносить в код или в другую явную runtime-границу, а не заталкивать в mapping DSL.

## Канонический API

Канонический публичный API:

- `validateMappings(source, options?)`
- `prepareMappings(source, options?)`
- `executeMappings(artifact, input, options?)`
- `MappingsCompileError`
- `MappingsRuntimeError`
- `formatMappingsDiagnostics(...)`
- `formatMappingsRuntimeError(...)`

Роли функций:

- `validateMappings(...)` делает мягкую проверку и возвращает `{ ok, diagnostics }` без исключения на невалидном source.
- `prepareMappings(...)` валидирует source и подготавливает runtime-артефакт. Невалидный source приводит к `MappingsCompileError`.
- `executeMappings(...)` исполняет только prepared artifact и не делает скрытую compile/prepare-фазу.

Legacy entrypoint'ы в стиле engine, такие как `MappingEngine` и публичный `compile()`, больше не входят в публичный контракт пакета.

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
  mappingId: 'profile.normalize.v1',
  sources: {
    raw: 'object',
  },
  output: {
    'profile.displayName': { normalizeSpaces: 'sources.raw.fullName' },
    'profile.email': { lowercase: 'sources.raw.email' },
    'profile.country': {
      mapValue: {
        from: 'sources.raw.countryCode',
        map: {
          DE: 'DE',
          DEU: 'DE',
          FR: 'FR',
          FRA: 'FR',
        },
        fallback: 'passthrough',
      },
    },
    'profile.hasTags': { exists: 'sources.raw.tags' },
  },
};

const validation = validateMappings(source);
if (!validation.ok) {
  console.error(validation.diagnostics);
  process.exit(1);
}

const artifact = prepareMappings(source);

const result = executeMappings(
  artifact,
  {
    raw: {
      fullName: '  Ada   Lovelace  ',
      email: 'ADA@EXAMPLE.COM',
      countryCode: 'DEU',
      tags: ['math', 'notes'],
    },
  },
  { trace: 'basic' },
);

console.log(result.output);
// {
//   profile: {
//     displayName: 'Ada Lovelace',
//     email: 'ada@example.com',
//     country: 'DE',
//     hasTags: true
//   }
// }
```

## Trace

Поддерживаются режимы:

- `false`
- `'basic'`
- `'verbose'`

По умолчанию trace выключен.

- `false` не возвращает trace.
- `'basic'` возвращает компактные события исполнения, пригодные для обычной диагностики.
- `'verbose'` может включать дополнительные redacted-фрагменты входа и результата для отладки и локального анализа.

Для управления маскированием trace используйте опцию `redact`.

## Runtime-контракт

`executeMappings(...)` возвращает success result такой формы:

```js
{
  output: { ... },
  trace: [ ... ] // опционально
}
```

Это не `success/error` status-envelope.

Ошибки возвращаются через typed errors:
- `MappingsCompileError`
- `MappingsRuntimeError`

## Поддерживаемые операторы v1

В текущей версии source поддерживает операторы:

- `from`
- `literal`
- `exists`
- `equals`
- `coalesce`
- `trim`
- `lowercase`
- `uppercase`
- `normalizeSpaces`
- `removeNonDigits`
- `mapValue`
- `transform`

Подробности по форме source, ограничениям операторов, runtime-семантике и ограничениям библиотеки смотри в спецификации.

## Примеры

Примеры в репозитории сделаны маленькими, но полными. Они показывают source, validation, prepare, execute, output и trace там, где это важно.

- [`examples/README.md`](./examples/README.md)
- [`examples/basic-transform.mjs`](./examples/basic-transform.mjs)
- [`examples/validate-diagnostics.mjs`](./examples/validate-diagnostics.mjs)
- [`examples/runtime-error.mjs`](./examples/runtime-error.mjs)
- [`examples/trace-basic.mjs`](./examples/trace-basic.mjs)
- [`examples/trace-verbose.mjs`](./examples/trace-verbose.mjs)
- [`examples/prepared-artifact.mjs`](./examples/prepared-artifact.mjs)
- [`examples/process-boundary.mjs`](./examples/process-boundary.mjs)
- [`examples/limitations.md`](./examples/limitations.md)

## Документация

- [SPEC.md](./SPEC.md)
- [SPEC_RU.md](./SPEC_RU.md)
- [COMPATIBILITY.md](./COMPATIBILITY.md)
- [MIGRATION.md](./MIGRATION.md)
- [CHANGELOG.md](./CHANGELOG.md)

## Релизная линия

`2.x` — каноническая публичная линия релизов `@processengine/mappings`.
