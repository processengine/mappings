# Changelog

Формат: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).  
Версионирование: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).  
Политика совместимости: [COMPATIBILITY.md](COMPATIBILITY.md).

---

## [2.0.0] — 2026-04-06

Первый публичный релиз новой канонической линии `@processengine/mappings`.

### Изменено

- Публичный API приведён к канону семейства ProcessEngine: наружу публикуются `validateMappings(...)`, `prepareMappings(...)` и `executeMappings(...)`.
- Legacy API удалён из публичных exports: `MappingEngine`, старый `compile(...)` и смешанные runtime entrypoint'ы больше не являются частью продуктового контракта.
- Библиотека переведена на `ESM-first` и `dist-only` поставку с явными exports и Node.js `>=20.19.0`.
- `executeMappings(...)` теперь принимает только prepared artifact и не выполняет скрытую compile-фазу.
- Prepared artifact оформлен как минимально публичная, opaque-ish сущность исполнения без лишних обещаний по структуре.

### Добавлено

- `MappingsCompileError` и `MappingsRuntimeError` как typed errors канонической compile/runtime модели.
- `formatMappingsDiagnostics(...)` и `formatMappingsRuntimeError(...)` для CLI, логов и отладочных сценариев.
- Канонический trace с режимами `false | "basic" | "verbose"` и базовой redaction model.
- `MIGRATION.md` как маршрут перехода со старого публичного API на канонический путь.
- Contract tests, trace tests, pack/install tests и regression coverage старой семантики через новый API.

### Документация

- README, спецификации, compatibility notes и migration guide переписаны под каноническую форму библиотеки.
- Исправлены устаревшие ссылки и релизная терминология перед публичной публикацией `2.0.0`.

---

## До релиза 2.0.0

Ранее библиотека существовала во внутренней доканонической линии с API вокруг `MappingEngine` и `compile(...)`. Публичным стартом новой канонической линии считается именно релиз `2.0.0`.
