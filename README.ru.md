# @processengine/mappings

[![CI](https://github.com/processengine/mappings/actions/workflows/ci.yml/badge.svg)](https://github.com/processengine/mappings/actions)
[![npm](https://img.shields.io/npm/v/@processengine/mappings)](https://www.npmjs.com/package/@processengine/mappings)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node 18+](https://img.shields.io/badge/Node-18%2B-green)](https://nodejs.org/)

Декларативная библиотека трансформации и нормализации JSON-данных.

Позволяет описать по конфигурации, как из одного или нескольких JSON-объектов собрать новый JSON и привести значения к каноническому виду. Без прикладного кода.

## Место в экосистеме processengine

```text
@processengine/mappings    → собрать и нормализовать данные для следующего шага
@processengine/rules       → применить правила к нормализованным данным
@processengine/decisions   → принять решение по сценарию
```

## Установка

```bash
npm install @processengine/mappings
```

Требуется Node.js >= 18.

## Быстрый старт

```js
const { MappingEngine } = require("@processengine/mappings");

const engine = new MappingEngine();

const definition = {
  mappingId: "client.normalize.v1",
  sources: { raw: "object" },
  output: {
    "client.phone": { removeNonDigits: "sources.raw.phone" },
    "client.email": { lowercase: "sources.raw.email" },
    "client.name": { normalizeSpaces: "sources.raw.fullName" },
    "client.gender": {
      transform: {
        from: "sources.raw.gender",
        steps: [
          { trim: true },
          { uppercase: true },
          {
            mapValue: {
              map: { М: "MALE", M: "MALE", Ж: "FEMALE", F: "FEMALE" },
              fallback: null,
            },
          },
        ],
      },
    },
    "client.currency": {
      mapValue: {
        from: "sources.raw.currencyCode",
        map: { RUR: "RUB", 643: "RUB", 840: "USD" },
        fallback: "passthrough",
      },
    },
  },
};

const result = engine.run({
  definition,
  sources: {
    raw: {
      phone: "+7 (999) 111-22-33",
      email: "CUSTOMER@EXAMPLE.COM",
      fullName: "  Иван   Иванов  ",
      gender: " m ",
      currencyCode: "RUR",
    },
  },
});

console.log(result);
// {
//   status: 'SUCCESS',
//   mappingId: 'client.normalize.v1',
//   result: {
//     client: {
//       phone:    '79991112233',
//       email:    'customer@example.com',
//       name:     'Иван Иванов',
//       gender:   'MALE',
//       currency: 'RUB',
//     }
//   }
// }
```

## Операторы

### Структурный маппинг

| Оператор   | Что делает                                                   |
| ---------- | ------------------------------------------------------------ |
| `from`     | Копирует значение из источника по пути                       |
| `literal`  | Вставляет константу                                          |
| `exists`   | Проверяет наличие не-null значения → boolean                 |
| `equals`   | Строгое сравнение (`===`) с литералом → boolean              |
| `coalesce` | Первое не-null значение из 1–4 кандидатов (path или literal) |

### Форматная нормализация

| Оператор          | Что делает                             |
| ----------------- | -------------------------------------- |
| `trim`            | Убирает ведущие и хвостовые пробелы    |
| `lowercase`       | Приводит к нижнему регистру            |
| `uppercase`       | Приводит к верхнему регистру           |
| `normalizeSpaces` | Trim + схлопывание внутренних пробелов |
| `removeNonDigits` | Оставляет только цифры `[0-9]`         |

Все строковые операторы: поле не создаётся, если значение не является строкой, равно null или путь не разрешился. Исключение: `removeNonDigits` создаёт пустую строку `""`, если после фильтрации ничего не осталось.

### Словарная канонизация: `mapValue`

```js
// Корневая форма
'payment.currency': {
  mapValue: {
    from:     'sources.req.currencyCode',
    map:      { RUR: 'RUB', '643': 'RUB', '840': 'USD' },
    fallback: 'passthrough',   // или null, литерал, или отсутствует
  }
}
```

`mapValue` не выполняет неявного приведения типов: число `643` и строка `"643"` — разные значения.

Варианты `fallback`:

- отсутствует — поле не создаётся
- `null` — поле создаётся со значением null
- JSON-safe literal — поле создаётся с этим значением
- `"passthrough"` — поле создаётся с исходным значением

### Цепочка преобразований: `transform`

Используется, когда нужно два и более шага. Самостоятельный оператор, не комбинируется с другими.

```js
'client.gender': {
  transform: {
    from: 'sources.raw.gender',
    steps: [
      { trim:      true },
      { uppercase: true },
      { mapValue: { map: { М: 'MALE', M: 'MALE', Ж: 'FEMALE', F: 'FEMALE' }, fallback: null } },
    ],
  },
}
```

Допустимые шаги: `trim`, `lowercase`, `uppercase`, `normalizeSpaces`, `removeNonDigits` (аргумент `true`), `mapValue` (шаговая форма без `from`). Минимум 2 шага, максимум 8.

Цепочка прерывается при первом шаге, который не может создать значение (не-строка на входе, ненайденный ключ без fallback).

## Трассировка

```js
const result = engine.run({ definition, sources, trace: true });
// result.trace — массив записей по каждому полю output
```

Каждая запись содержит `target`, `op`, `outputCreated`, `outputValue`. Для `transform` — массив `steps`, при обрыве цепочки — поля `stoppedChain` и `reason` на сломавшемся шаге.

## CLI

```bash
# Проверить файл сценария
mappings validate-file examples/mappings/client/normalize_client_data.v1.json

# Исполнить сценарий
mappings run-file examples/mappings/client/normalize_client_data.v1.json \
  --sources examples/sources/client_raw.json \
  --trace

# Проверить все сценарии в директории
mappings validate-dir examples/mappings

# Список сценариев
mappings list examples/mappings
```

## Модель ошибок

Все методы возвращают `MappingResult` и никогда не бросают исключения.

```js
// Успех
{ status: 'SUCCESS', mappingId: '...', result: { ... } }

// Ошибка
{ status: 'MAPPING_ERROR', mappingId: '...', error: { code: '...', message: '...' } }
```

Коды ошибок конфигурации: `INVALID_MAPPING_SCHEMA`, `INVALID_MAPPING_ID`, `UNKNOWN_OPERATOR`, `INVALID_ARGS`, `INVALID_SOURCE_DECLARATION`, `INVALID_PATH`, `INVALID_TARGET_PATH`, `CONFLICTING_TARGET_PATHS`.

Коды ошибок выполнения: `MISSING_SOURCE`, `INVALID_SOURCE_TYPE`, `INVALID_SOURCE_CONTENT`, `INTERNAL_ERROR`.

## Границы библиотеки

Библиотека не содержит и не будет содержать:

- условных операторов (`if`/`else`)
- арифметики
- регулярных выражений
- контекстно-зависимых словарей
- предметной интерпретации данных

Подробнее: [SPEC_RU.md](SPEC_RU.md).
