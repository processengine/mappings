# @processengine/mappings

`@processengine/mappings` — библиотека семейства ProcessEngine для декларативной нормализации данных и построения compact facts.

## Канонический lifecycle

- `validateMappings(source)` — мягкая валидация, возвращает `{ ok, diagnostics }`
- `prepareMappings(source)` — подготовка артефакта, на ошибке бросает `MappingsCompileError`
- `executeMappings(artifact, input, options?)` — исполнение только подготовленного артефакта

## Ограниченный DSL для массивов

В `2.1.x` добавлен ограниченный DSL для массивов. В `2.4.0` добавлены два boolean-helper для частых проверок порога и наличия scalar-значения.

Поддерживаемые aggregate-операторы:
- `collect`
- `collectObject`
- `count`
- `countAtLeast`
- `containsValue`
- `existsAny`
- `existsAll`
- `pickFirst`

Поддерживаемые comparators в `where` / `match`:
- `equals`
- `in`
- `startsWith`

### Пример

```json
{
  "mappingId": "issues.to.facts.v1",
  "sources": {
    "rules": "object",
    "findClient": "object"
  },
  "output": {
    "facts.errorCount": {
      "count": {
        "from": "sources.rules.issues[*]",
        "where": { "field": "level", "equals": "ERROR" }
      }
    },
    "facts.warningCodes": {
      "collect": {
        "from": "sources.rules.issues[*]",
        "where": { "field": "level", "equals": "WARNING" },
        "value": "code"
      }
    },
    "facts.foundClient": {
      "pickFirst": {
        "from": "sources.findClient.clients[*]"
      }
    }
  }
}
```

## Ограничения первой версии

В `2.1.x` сознательно **не** поддерживаются:
- numeric indexes;
- wildcard вне aggregate `from`;
- nested wildcard;
- `groupBy`, `mapEach`, `flatMap`, общий `reduce`;
- expression DSL;
- nested aggregate operators.

## Специальные случаи

- `collect([]) -> []`
- `count([]) -> 0`
- `existsAny([]) -> false`
- `existsAll([]) -> true`
- `pickFirst([]) -> null`

`existsAll([])` — vacuous truth. В бизнес-сценариях безопаснее использовать вместе с companion fact вроде `count > 0`.

Для `collect` элементы с неразрешённым `value` пропускаются. Это отражается в trace через `droppedCount`.

## Prepared artifact

- `prepareMappings(...)` в `2.1.x` возвращает артефакт `v2`
- `v2` использует compiled execution plan
- `executeMappings(...)` сохраняет legacy compatibility path для `v1`

## Документация

- [SPEC.md](./SPEC.md)
- [SPEC_RU.md](./SPEC_RU.md)
- [COMPATIBILITY.md](./COMPATIBILITY.md)
- [MIGRATION.md](./MIGRATION.md)
- [CHANGELOG.md](./CHANGELOG.md)


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

## Строковые выражения: `joinNonEmpty` и `template`

Начиная с `2.3.0`, mappings поддерживает compiled string expressions для детерминированной сборки строк.

```json
{
  "mappingId": "address.fullAddress.v1",
  "sources": { "address": "object" },
  "output": {
    "fullAddress": {
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
          },
          {
            "joinNonEmpty": {
              "separator": " ",
              "items": [
                { "from": "sources.address.streetType" },
                { "from": "sources.address.street" }
              ]
            }
          }
        ]
      }
    }
  }
}
```

Операторы компилируются в `PreparedMappingsArtifact v2`. Runtime не парсит пути и не делает hidden compile. Результат transport-safe: `string` или `null`.

## `countAtLeast`

`countAtLeast` выбирает элементы массива из `from`, опционально фильтрует их через `where` и возвращает `true`, если количество выбранных элементов больше или равно целочисленному `value`.

```json
{
  "hasMultipleClients": {
    "countAtLeast": {
      "from": "sources.findClient.clients[*]",
      "value": 2
    }
  }
}
```

Ограничения:

- `from` использует существующую форму array selector, где `[*]` стоит последним сегментом;
- `value` — только целочисленный literal `>= 0`;
- `where` поддерживает те же ограниченные comparators, что и другие array DSL операторы: `equals`, `in`, `startsWith`;
- dynamic threshold expressions, nested wildcards, custom code и expression pipelines не поддерживаются.

## `containsValue`

`containsValue` выбирает элементы массива из `from`, опционально фильтрует их через `where` и возвращает `true`, если хотя бы один выбранный элемент строго равен JSON-safe scalar `value`.

```json
{
  "emptyFieldsContainsEmail": {
    "containsValue": {
      "from": "sources.absClient.emptyFields[*]",
      "value": "email"
    }
  }
}
```

Ограничения:

- элементы массива должны быть scalar JSON-safe значениями; object/array membership намеренно вне scope;
- `value` — JSON-safe scalar literal;
- сравнение выполняется строгим равенством; regex, contains-by-field, transforms и partial match не поддерживаются.

Оба оператора компилируются в execution plan `PreparedMappingsArtifact v2` и предназначены для компактного, ревьюируемого построения facts.
