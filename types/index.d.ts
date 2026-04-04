/**
 * @processengine/mappings
 * TypeScript type definitions
 */

// ---------------------------------------------------------------------------
// Примитивы DSL
// ---------------------------------------------------------------------------

/** Строковый путь к источнику вида "sources.<name>.<field>[.nested...]" */
export type SourcePath = string;

/** Точечный путь в результирующем объекте вида "field[.nested...]" */
export type TargetPath = string;

/** Значение, безопасное для JSON-сериализации */
export type JsonSafeLiteral = string | number | boolean | null;

/** Объявление источника. В v1 поддерживается только "object". */
export type SourceTypeDeclaration = 'object';

// ---------------------------------------------------------------------------
// Операторы output-правил
// ---------------------------------------------------------------------------

export interface FromOperator {
  from: SourcePath;
}

export interface LiteralOperator {
  literal: JsonSafeLiteral;
}

export interface ExistsOperator {
  exists: SourcePath;
}

export interface EqualsOperator {
  equals: [SourcePath, JsonSafeLiteral];
}

export interface CoalescePathCandidate {
  path: SourcePath;
}

export interface CoalesceLiteralCandidate {
  literal: JsonSafeLiteral;
}

export type CoalesceCandidate = CoalescePathCandidate | CoalesceLiteralCandidate;

export interface CoalesceOperator {
  coalesce: [CoalesceCandidate, ...CoalesceCandidate[]];
}

export interface TrimOperator        { trim:             SourcePath; }
export interface LowercaseOperator   { lowercase:        SourcePath; }
export interface UppercaseOperator   { uppercase:        SourcePath; }
export interface NormalizeSpacesOperator { normalizeSpaces: SourcePath; }
export interface RemoveNonDigitsOperator { removeNonDigits: SourcePath; }

/** Семантика fallback в mapValue */
export type MapValueFallback = JsonSafeLiteral | 'passthrough';

export interface MapValueRootArgs {
  /** Путь к исходному значению */
  from: SourcePath;
  /** Словарь канонизации. Ключи — строки, значения — JSON-safe literals. */
  map: Record<string, JsonSafeLiteral>;
  /**
   * Поведение при ненайденном ключе.
   * Отсутствие → поле не создаётся.
   * null → создаётся со значением null.
   * "passthrough" → создаётся с исходным значением.
   * Любой JSON-safe literal → создаётся с этим значением.
   */
  fallback?: MapValueFallback;
}

export interface MapValueOperator {
  mapValue: MapValueRootArgs;
}

/** Шаговые операторы внутри transform.steps (аргумент true) */
export interface TrimStep            { trim:             true; }
export interface LowercaseStep       { lowercase:        true; }
export interface UppercaseStep       { uppercase:        true; }
export interface NormalizeSpacesStep { normalizeSpaces:  true; }
export interface RemoveNonDigitsStep { removeNonDigits:  true; }

export interface MapValueStepArgs {
  /** Поле from отсутствует: входное значение берётся из предыдущего шага */
  map: Record<string, JsonSafeLiteral>;
  fallback?: MapValueFallback;
}

export interface MapValueStep {
  mapValue: MapValueStepArgs;
}

export type TransformStep =
  | TrimStep
  | LowercaseStep
  | UppercaseStep
  | NormalizeSpacesStep
  | RemoveNonDigitsStep
  | MapValueStep;

export interface TransformArgs {
  /** Путь к исходному значению */
  from: SourcePath;
  /**
   * Последовательность шагов. Минимум 2, максимум 8.
   * Для одного шага используйте соответствующий корневой оператор.
   */
  steps: [TransformStep, TransformStep, ...TransformStep[]];
}

export interface TransformOperator {
  transform: TransformArgs;
}

/** Объединение всех допустимых операторов для поля output */
export type OutputRule =
  | FromOperator
  | LiteralOperator
  | ExistsOperator
  | EqualsOperator
  | CoalesceOperator
  | TrimOperator
  | LowercaseOperator
  | UppercaseOperator
  | NormalizeSpacesOperator
  | RemoveNonDigitsOperator
  | MapValueOperator
  | TransformOperator;

// ---------------------------------------------------------------------------
// MappingDefinition
// ---------------------------------------------------------------------------

/**
 * Декларативное описание маппинга.
 * Каждое поле output содержит ровно один оператор.
 */
export interface MappingDefinition {
  /** Уникальный идентификатор сценария */
  mappingId: string;
  /** Объявление источников данных */
  sources: Record<string, SourceTypeDeclaration>;
  /** Правила построения результата */
  output: Record<TargetPath, OutputRule>;
}

// ---------------------------------------------------------------------------
// Модель ошибок
// ---------------------------------------------------------------------------

export type ErrorPhase = 'compile' | 'execute';

/**
 * Структурированная ошибка с location-контекстом.
 * Поля location присутствуют только когда применимы.
 */
export interface MappingError {
  /** Стабильный machine-readable код */
  code: string;
  /** Human-readable описание ошибки */
  message: string;
  /** Фаза, на которой возникла ошибка */
  phase?: ErrorPhase;
  /** Имя оператора, вызвавшего ошибку */
  operator?: string;
  /** Целевой путь поля output */
  targetPath?: string;
  /** Исходный путь (значение поля from) */
  from?: string;
  /** Индекс шага в transform.steps (0-based) */
  stepIndex?: number;
}

// Compile-time error codes
export type CompileErrorCode =
  | 'INVALID_MAPPING_SCHEMA'
  | 'INVALID_MAPPING_ID'
  | 'UNKNOWN_OPERATOR'
  | 'INVALID_ARGS'
  | 'INVALID_SOURCE_DECLARATION'
  | 'INVALID_PATH'
  | 'INVALID_TARGET_PATH'
  | 'CONFLICTING_TARGET_PATHS'
  | 'INTERNAL_ERROR';

// Execute-time error codes
export type ExecuteErrorCode =
  | 'MISSING_SOURCE'
  | 'INVALID_SOURCE_TYPE'
  | 'INVALID_SOURCE_CONTENT'
  | 'INTERNAL_ERROR';

// ---------------------------------------------------------------------------
// Трассировка
// ---------------------------------------------------------------------------

export interface BaseTraceEntry {
  /** Целевой путь поля в результате */
  target: string;
  /** Имя оператора */
  op: string;
  /** Создано ли поле в результате */
  outputCreated: boolean;
  /** Значение поля (присутствует только при outputCreated: true) */
  outputValue?: unknown;
  /** Причина не-создания поля (присутствует только при outputCreated: false) */
  reason?: 'path_unresolved' | 'null_value' | 'type_mismatch' | 'chain_stopped';
}

export interface PathBasedTraceEntry extends BaseTraceEntry {
  /** Исходный путь, использованный оператором */
  from: string;
  /** Разрешился ли путь */
  resolved: boolean;
  /** Исходное значение (присутствует при resolved: true) */
  inputValue?: unknown;
}

export interface MapValueTraceEntry extends PathBasedTraceEntry {
  op: 'mapValue';
  /** Найден ли ключ в словаре */
  matched?: boolean;
  /** Применён ли fallback */
  fallbackApplied?: boolean;
  /** Тип применённого fallback */
  fallbackKind?: 'literal' | 'passthrough';
}

export interface TransformStepTrace {
  op: string;
  in: unknown;
  out?: unknown;
  applied: boolean;
  stoppedChain?: boolean;
  reason?: 'type_mismatch' | 'no_match';
  matched?: boolean;
  fallbackKind?: 'literal' | 'passthrough';
}

export interface TransformTraceEntry extends PathBasedTraceEntry {
  op: 'transform';
  steps?: TransformStepTrace[];
}

export type TraceEntry =
  | PathBasedTraceEntry
  | MapValueTraceEntry
  | TransformTraceEntry
  | BaseTraceEntry;

// ---------------------------------------------------------------------------
// MappingResult
// ---------------------------------------------------------------------------

export interface MappingSuccess {
  status: 'SUCCESS';
  mappingId: string;
  result: Record<string, unknown>;
  trace?: TraceEntry[];
}

export interface MappingFailure {
  status: 'MAPPING_ERROR';
  mappingId?: string;
  error: MappingError;
}

export type MappingResult = MappingSuccess | MappingFailure;

// ---------------------------------------------------------------------------
// ValidateResult (только для engine.validate())
// ---------------------------------------------------------------------------

export interface ValidateSuccess {
  status: 'SUCCESS';
  mappingId: string;
}

export interface ValidateFailure {
  status: 'MAPPING_ERROR';
  mappingId?: string;
  error: MappingError;
}

export type ValidateResult = ValidateSuccess | ValidateFailure;

// ---------------------------------------------------------------------------
// Compile result
// ---------------------------------------------------------------------------

export interface CompileSuccess {
  success: true;
  mapping: CompiledMapping;
}

export interface CompileFailure {
  success: false;
  error: MappingError;
}

export type CompileResult = CompileSuccess | CompileFailure;

// ---------------------------------------------------------------------------
// CompiledMapping
// ---------------------------------------------------------------------------

export interface ExecuteOptions {
  /**
   * Включить трассировку выполнения.
   *
   * ВАЖНО: trace содержит входные и выходные значения операторов.
   * В production-потоке trace может требовать маскирования или отключения
   * если данные содержат персональную информацию.
   */
  trace?: boolean;
}

/**
 * Неизменяемый исполнимый артефакт, созданный функцией compile().
 * Definition был проверен при компиляции и не перепроверяется при execute().
 */
export declare class CompiledMapping {
  readonly mappingId: string;

  /**
   * Выполняет скомпилированный маппинг для переданных источников.
   * Definition не перепроверяется.
   *
   * @param sources - Словарь источников данных
   * @param options - Опции выполнения
   */
  execute(
    sources: Record<string, Record<string, unknown>>,
    options?: ExecuteOptions
  ): MappingResult;
}

// ---------------------------------------------------------------------------
// Публичный API
// ---------------------------------------------------------------------------

/**
 * Компилирует описание маппинга в неизменяемый исполнимый артефакт.
 *
 * Предпочтительный паттерн для production:
 * ```typescript
 * const result = compile(definition);
 * if (result.success) {
 *   const output = result.mapping.execute(sources);
 * }
 * ```
 */
export declare function compile(definition: unknown): CompileResult;

/**
 * Основная точка входа библиотеки.
 *
 * Для одиночных вызовов и тестов используйте engine.run().
 * Для production с повторным использованием definition — engine.compile() + mapping.execute().
 */
export declare class MappingEngine {
  /**
   * Компилирует описание маппинга в неизменяемый исполнимый артефакт.
   */
  compile(definition: unknown): CompileResult;

  /**
   * Проверяет описание маппинга без создания исполнимого артефакта.
   * Используется для CI-валидации файлов определений.
   */
  validate(definition: unknown): ValidateResult;

  /**
   * Сахар над compile + execute.
   * Удобен для одиночных вызовов и тестирования.
   */
  run(input?: {
    definition?: unknown;
    sources?: unknown;
    trace?: boolean;
  }): MappingResult;
}
