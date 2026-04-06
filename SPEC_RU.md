# Спецификация: @processengine/mappings

## Назначение

Mappings — runtime-библиотека семейства ProcessEngine для декларативного преобразования и нормализации данных.

## Модель source

Mapping source содержит:

- `mappingId`
- `sources`
- `output`

Каждое поле `output` содержит ровно один оператор.

## Семантика compile-фазы

- `validateMappings(...)` валидирует source без исключения на невалидном артефакте.
- `prepareMappings(...)` валидирует source и подготавливает иммутабельный artifact.
- Невалидный source приводит к `MappingsCompileError`.

## Семантика runtime-фазы

- `executeMappings(...)` принимает только подготовленный artifact.
- Runtime не делает скрытую compile/prepare-фазу.
- Успешный результат содержит `output` и опциональный `trace`.
- Ошибки исполнения сообщаются через `MappingsRuntimeError`.

## Trace-модель

Поддерживаются уровни:

- `false`
- `basic`
- `verbose`

Trace-события имеют канонический каркас ProcessEngine: `kind`, `artifactType`, `artifactId`, `step`, `at`, `outcome` и при необходимости `details`, `input`, `output`.

## Гарантии

К публичному контракту относятся:

- имена экспортируемых функций
- форма diagnostics
- typed errors
- форма runtime-результата
- документированная форма trace
- явные package exports
