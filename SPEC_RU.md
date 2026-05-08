# SPEC_RU: @processengine/mappings

## Что нормативно определяется этим документом

Документ нормативно фиксирует:
- роль библиотеки в семейства ProcessEngine;
- lifecycle `validate -> prepare -> execute`;
- shape source artifact;
- semantics built-in operators;
- prepared artifact contract;
- runtime result contract;
- diagnostics / runtime errors / trace;
- ограничения первой версии array DSL.

## 1. Роль библиотеки

`@processengine/mappings` — слой нормализации и построения facts.
Он не должен превращаться в язык программирования, оркестратор или decision-runtime.

## 2. Lifecycle

- `validateMappings(...)` — мягкая валидация без исключения на обычных DSL-проблемах
- `prepareMappings(...)` — compile-first подготовка, на blocking failure бросает `MappingsCompileError`
- `executeMappings(...)` — runtime только для prepared artifact, без hidden compile

## 3. Source artifact

Минимальный shape:

```json
{
  "mappingId": "profile.normalize.v1",
  "sources": {
    "raw": "object"
  },
  "output": {
    "profile.name": { "normalizeSpaces": "sources.raw.fullName" }
  }
}
```

## 4. Path semantics

Обычные source paths:
- начинаются с `sources.`
- не используют numeric indexes
- не используют wildcard

Для aggregate `from` разрешён только один `[*]`, только как последний сегмент.

## 5. Built-in operators

Scalar/object operators:
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

## 6. Ограниченный array DSL в 2.1.x

Поддерживаются:
- `collect`
- `collectObject`
- `count`
- `existsAny`
- `existsAll`
- `pickFirst`

Поддерживаемые comparators:
- `equals`
- `in`
- `startsWith`

### Семантика special cases

- `collect([]) -> []`
- `count([]) -> 0`
- `existsAny([]) -> false`
- `existsAll([]) -> true`
- `pickFirst([]) -> null`

`collect` с неразрешённым `value` пропускает элемент и отражает это в trace через `droppedCount`.

## 7. Prepared artifact

Публично гарантируется минимум:
- `type === 'mapping'`
- `mappingId`
- `version`
- пригодность для `executeMappings(...)`
- иммутабельность с точки зрения потребителя

Версии:
- `v1` — legacy compatibility path
- `v2` — compiled execution plan

## 8. Runtime result contract

Успешный runtime-result:

```js
{
  output: Record<string, unknown>,
  trace?: MappingTraceEvent[]
}
```

Результат transport-safe / JSON-safe по нормативному shape.

## 9. Diagnostics и runtime errors

Representative diagnostics:
- `INVALID_MAPPING_ID`
- `INVALID_SOURCE_DECLARATION`
- `INVALID_MAPPING_SCHEMA`
- `UNKNOWN_OPERATOR`
- `INVALID_ARGS`
- `CONFLICTING_TARGET_PATHS`
- `INVALID_WILDCARD_USAGE`
- `INVALID_CONDITION_SHAPE`
- `MISSING_VALUE_IN_COLLECT`
- `EMPTY_IN_ARRAY`

Runtime failures идут через `MappingsRuntimeError`.

## 10. Trace

Уровни trace:
- `false`
- `'basic'`
- `'verbose'`

Для aggregate operators `basic` trace остаётся компактным и содержит только summary-поля, без сериализации всего массива.

## 11. Ограничения первой версии

В `2.1.x` не входят:
- numeric indexes;
- wildcard вне aggregate `from`;
- nested wildcard;
- `groupBy`, `mapEach`, `flatMap`, общий `reduce`;
- arbitrary expression DSL;
- nested aggregate operators.


## `collectObject`

`collectObject` selects array items from `from`, optionally filters them with `where`, and projects each selected item into a compact object using relative paths from `fields`. Unresolved fields are skipped. If all fields are unresolved for one selected item, that item is dropped from the output array.

Example:

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

---

## Строковый DSL (`joinNonEmpty` и `template`) — v2

В версии `2.3.0` добавлены два compiled string expression оператора для детерминированной JSON-safe сборки строк.

### `joinNonEmpty`

`joinNonEmpty` склеивает непустые scalar-значения через разделитель. Оператор пропускает `null`, отсутствующие пути, пустые строки и строки из пробелов. Числа и boolean приводятся к строке. Объекты и массивы запрещены как non-scalar значения.

```json
{
  "joinNonEmpty": {
    "separator": ", ",
    "items": [
      { "from": "sources.address.postalCode" },
      { "from": "sources.address.regionName" },
      {
        "template": "г {{city}}",
        "vars": {
          "city": { "from": "sources.address.city" }
        }
      }
    ]
  }
}
```

Значения по умолчанию:

```text
separator = ""
trimItems = true
trimResult = true
emptyAsNull = true
```

Если все элементы пустые, оператор возвращает `null`.

### `template`

`template` формирует строку по шаблону с именованными переменными. Переменные задаются mapping expressions.

У `template` есть два синтаксических контекста:

- внутри списков выражений, например `joinNonEmpty.items`, используется inline-форма expression;
- в корне output rule выражение нужно обернуть в ключ оператора.

Inline-форма expression:

```json
{
  "template": "д {{house}}",
  "vars": {
    "house": { "from": "sources.address.house" }
  }
}
```

Форма для output rule:

```json
{
  "output": {
    "houseLabel": {
      "template": {
        "template": "д {{house}}",
        "vars": {
          "house": { "from": "sources.address.house" }
        }
      }
    }
  }
}
```

Значения по умолчанию:

```text
skipIfAnyVarEmpty = true
trimResult = true
emptyAsNull = true
```

При `skipIfAnyVarEmpty = true` любая пустая переменная делает результат всего шаблона равным `null`. Это не даёт получить значения вроде `"кв"`, если квартира не передана.

### Композиция

`template` можно использовать внутри `joinNonEmpty.items`. `joinNonEmpty` можно использовать внутри `coalesce`. Если `joinNonEmpty` вернул `null`, `coalesce` продолжает проверять следующий кандидат.

### Compile-first требование

`joinNonEmpty` и `template` компилируются в execution plan `PreparedMappingsArtifact v2` на этапе `prepareMappings(...)`. Runtime не должен парсить path-строки, выполнять `split('.')` в hot path или делать hidden compile при первом вызове.

### Transport-safe output

Новые операторы возвращают только `string` или `null`. Они не возвращают `undefined`, функции, class instances, `Symbol`, `BigInt`, `Date`, массивы, объекты или циклические значения.

### Пример с адресом

Основной прикладной кейс — сборка технического `fullAddress` для DTO АБС/ЦФТ из ФИАС-раскладки адреса без превращения `addressLine` в обязательное business-rules поле.
