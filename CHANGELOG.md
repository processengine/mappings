# Changelog

Формат: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).  
Версионирование: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).  
Политика совместимости: [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md).

---

## [1.0.1] — 2025-04-04

### Улучшено

- **Спецификация пробельных символов:** `SPEC_RU.md` теперь явно документирует, что `trim` и `normalizeSpaces` используют JavaScript `\s` — включая `\u00A0` (неразрывный пробел), вертикальную табуляцию, разрыв страницы и другие Unicode-пробелы. Это часть контракта оператора.
- **TypeScript пример в README:** добавлен полный пример с типизированным `compile()`, `MappingDefinition` и `MappingResult` как discriminated union.
- **Бенчмарки:** добавлен `benchmarks/run.mjs` и `docs/BENCHMARKS.md` с описанием методологии и интерпретацией чисел.

---

## [1.0.0] — 2025-04-04

Первый стабильный релиз.

### Добавлено

**Движок и compile-first модель**

- `compile(definition)` — компилирует описание маппинга в неизменяемый `CompiledMapping`; definition валидируется один раз
- `CompiledMapping.execute(sources[, options])` — выполняет маппинг без повторной валидации definition
- `MappingEngine.compile(definition)` — метод движка, идентичный standalone `compile()`
- `MappingEngine.validate(definition)` — проверка без создания исполнимого артефакта; для CI-валидации
- `MappingEngine.run({ definition, sources, trace? })` — сахар над compile + execute; удобен для одиночных вызовов

**Операторы структурного маппинга**

- `from` — копирует значение из источника по пути; deep copy для массивов и plain-объектов
- `literal` — вставляет JSON-safe константу: string, конечное число, boolean, null
- `exists` — проверяет, разрешается ли путь в не-null значение; всегда возвращает boolean; только локальный технический признак
- `equals` — строгое сравнение (`===`) с JSON-safe литералом; всегда возвращает boolean; только локальный технический признак
- `coalesce` — возвращает первое не-null значение из 1–4 кандидатов (path или literal)

**Операторы форматной нормализации**

- `trim` — убирает ведущие и хвостовые пробельные символы
- `lowercase` — приводит к нижнему регистру
- `uppercase` — приводит к верхнему регистру
- `normalizeSpaces` — trim + схлопывание внутренних пробельных последовательностей
- `removeNonDigits` — оставляет только символы `[0-9]`; пустая строка `""` — валидный результат

Все строковые операторы: нет неявного приведения типов; не-строка, null, неразрешённый путь → поле не создаётся.

**Оператор словарной канонизации**

- `mapValue` — ищет строковое значение в явно заданном словаре
  - Корневая форма: `{ from, map, fallback? }`
  - Шаговая форма (только внутри `transform`): `{ map, fallback? }`
  - `fallback`: JSON-safe literal, `"passthrough"` (вернуть исходное значение) или отсутствие (поле не создаётся)
  - Без неявного приведения типов: число `643` ≠ строковый ключ `"643"`
  - `fallback` применяется только при `no_match`; при `path_unresolved`, `null_value`, `type_mismatch` — поле не создаётся

**Оператор цепочки преобразований**

- `transform` — самостоятельный корневой оператор; применяет 2–8 шагов к значению из источника
  - Допустимые шаги: строковые операторы (аргумент `true`), `mapValue` в шаговой форме
  - Цепочка прерывается при первом шаге с `outputCreated = false`
  - Не комбинируется с другими корневыми операторами

**Модель путей**

- Точечная нотация источников: `sources.<n>.<field>[.<nested>...]`
- Точечная нотация результата с автоматическим построением вложенных объектов
- Запрещённые сегменты: `__proto__`, `prototype`, `constructor`
- Числовые индексы (`items.0`) отвергаются при компиляции

**Модель ошибок**

- Ошибки содержат `phase` (`compile` / `execute`), `operator`, `targetPath`, `from`, `stepIndex` при наличии
- Compile errors: `INVALID_MAPPING_SCHEMA`, `INVALID_MAPPING_ID`, `UNKNOWN_OPERATOR`, `INVALID_ARGS`, `INVALID_SOURCE_DECLARATION`, `INVALID_PATH`, `INVALID_TARGET_PATH`, `CONFLICTING_TARGET_PATHS`
- Execute errors: `MISSING_SOURCE`, `INVALID_SOURCE_TYPE`, `INVALID_SOURCE_CONTENT`, `INTERNAL_ERROR`

**Трассировка**

- Все операторы поддерживают `trace: true`
- Trace-записи используют `from` (не `path`) — согласовано с DSL
- Для `transform`: массив `steps` с `in`, `out`, `applied` на каждом шаге
- При обрыве: `stoppedChain: true`, `reason` на сломавшемся шаге; `reason: 'chain_stopped'` на уровне `transform`
- Trace содержит входные и выходные значения — требует осторожности с ПДн в production

**Безопасность**

- `isPlainObject` строгий: отвергает `Date`, `Map`, `Set`, экземпляры классов
- `deepCopy` — рекурсивный обход без `JSON.stringify/parse`; обнаруживает циклические ссылки
- Рекурсивная валидация JSON-safe содержимого источников перед исполнением
- Защита от prototype pollution: запрещённые сегменты в путях

**TypeScript**

- `types/index.d.ts` — полные типы публичного API: `MappingDefinition`, `CompiledMapping`, `CompileResult`, `MappingResult`, `MappingError`, `TraceEntry` и всех операторов

**JSON Schema**

- `schema/mapping-definition.v1.schema.json` — формальная схема DSL; может использоваться независимо от рантайма

**Документация**

- `README.md` — английский README для npm
- `README.ru.md` — русская документация
- `SPEC_RU.md` — нормативная спецификация на русском
- `docs/COMPATIBILITY.md` — политика совместимости: breaking changes, lifecycle операторов, архитектурные границы, политика ПДн в trace

**CLI**

- `validate-file <file>` — компилирует и проверяет один сценарий
- `run-file <file> --sources <file> [--trace]` — исполняет маппинг
- `validate-dir <dir>` — проверяет все `*.json` с `mappingId`, пропускает остальные
- `list <dir>` — выводит `mappingId → путь к файлу`
- `--json` — машинночитаемый вывод для CI/CD

**Пакет**

- `exports` ограничивает публичный API `src/index.js` с TypeScript-типами
- `files` включает `src/`, `bin/`, `types/`, `schema/`, `docs/`, документацию
- Нет runtime-зависимостей; Node.js >= 18

### Известные ограничения v1

- Числовые индексы в путях не поддерживаются (планируется в v2)
- Нормализация дат — вне scope v1
- Нормализация телефонов с автоопределением страны — вне scope v1
