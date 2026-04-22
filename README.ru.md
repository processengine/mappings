# @processengine/mappings

`@processengine/mappings` — библиотека семейства ProcessEngine для декларативной нормализации данных и построения compact facts.

## Канонический lifecycle

- `validateMappings(source)` — мягкая валидация, возвращает `{ ok, diagnostics }`
- `prepareMappings(source)` — подготовка артефакта, на ошибке бросает `MappingsCompileError`
- `executeMappings(artifact, input, options?)` — исполнение только подготовленного артефакта

## Что нового в 2.1.x

Добавлен ограниченный DSL для массивов:
- `collect`
- `collectObject`
- `count`
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
