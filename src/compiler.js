'use strict';

const { validateDefinition } = require('./validator.js');
const { isPlainObject, validateJsonSafeValue } = require('./path.js');
const { execute } = require('./executor.js');

// ---------------------------------------------------------------------------
// deepFreeze — рекурсивная заморозка plain-объектов и массивов
// ---------------------------------------------------------------------------

/**
 * Рекурсивно замораживает plain-объекты и массивы через Object.freeze.
 * Вызывается на validated definition — гарантированно JSON-совместимом объекте,
 * не содержащем циклических ссылок, функций или экземпляров классов.
 *
 * Примитивы (string, number, boolean, null) возвращаются как есть.
 * Используется только для definition внутри compile-пути; не применяется к sources.
 */
function deepFreeze(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Object.isFrozen(value)) return value;

  Object.freeze(value);

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) deepFreeze(value[i]);
  } else {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }

  return value;
}

// ---------------------------------------------------------------------------
// CompiledMapping — неизменяемый исполнимый артефакт
// ---------------------------------------------------------------------------

/**
 * Результат успешной компиляции сценария маппинга.
 * Definition проверяется один раз при компиляции и глубоко замораживается.
 * execute() не выполняет повторную валидацию definition.
 *
 * Инварианты:
 * - definition уже прошёл полную валидацию;
 * - definition глубоко заморожен: внешняя мутация исходного объекта
 *   не влияет на поведение execute() — хранится глубокая копия;
 * - сам экземпляр заморожен (Object.freeze);
 * - execute() принимает только runtime-параметры (sources, options).
 */
class CompiledMapping {
  #mappingId;
  #definition;

  constructor(mappingId, definition) {
    this.#mappingId = mappingId;
    // Глубокое копирование + заморозка: артефакт не зависит от дальнейшей
    // жизни исходного JS-объекта definition.
    //
    // JSON.parse(JSON.stringify(...)) корректен здесь при одном условии:
    // definition гарантированно JSON-совместим — без NaN, Infinity, Date,
    // функций, циклических ссылок и т.п. Это условие обеспечивается
    // validateDefinition(), которая вызывается до конструктора в compile().
    // Если в будущем DSL расширится до поддержки нежных JSON типов,
    // этот приём нужно заменить на deepCopy() из path.js.
    this.#definition = deepFreeze(JSON.parse(JSON.stringify(definition)));
    Object.freeze(this);
  }

  get mappingId() {
    return this.#mappingId;
  }

  /**
   * Выполняет скомпилированный маппинг для переданных источников.
   * Definition не перепроверяется.
   *
   * @param {object} sources                - Словарь источников: { name: plainObject }
   * @param {{ trace?: boolean }} [options] - Опции выполнения
   * @returns {MappingResult}
   */
  execute(sources, options = {}) {
    const { trace = false } = options;
    try {
      // Валидация контейнера источников
      if (!isPlainObject(sources)) {
        return this.#runtimeError({
          code: 'INVALID_SOURCE_TYPE',
          message: 'sources must be a plain object',
          phase: 'execute',
        });
      }

      // Валидация каждого объявленного источника
      for (const sourceName of Object.keys(this.#definition.sources)) {
        if (!(sourceName in sources)) {
          return this.#runtimeError({
            code: 'MISSING_SOURCE',
            message: `Source '${sourceName}' not provided in input`,
            phase: 'execute',
          });
        }
        const src = sources[sourceName];
        if (!isPlainObject(src)) {
          return this.#runtimeError({
            code: 'INVALID_SOURCE_TYPE',
            message: `Source '${sourceName}' must be a plain object`,
            phase: 'execute',
          });
        }
        const contentErr = validateJsonSafeValue(src, sourceName);
        if (contentErr) {
          return this.#runtimeError({ ...contentErr, phase: 'execute' });
        }
      }

      // Выполнение
      const { result, trace: traceData } = execute(this.#definition, sources, trace);
      const output = {
        status: 'SUCCESS',
        mappingId: this.#mappingId,
        result,
      };
      if (trace && traceData) {
        output.trace = traceData;
      }
      return output;

    } catch (e) {
      return this.#runtimeError({
        code: 'INTERNAL_ERROR',
        message: e && e.message ? e.message : 'Unexpected internal error',
        phase: 'execute',
      });
    }
  }

  #runtimeError(err) {
    return { status: 'MAPPING_ERROR', mappingId: this.#mappingId, error: err };
  }
}

// ---------------------------------------------------------------------------
// compile() — публичная функция компиляции
// ---------------------------------------------------------------------------

/**
 * Компилирует описание маппинга в неизменяемый исполнимый артефакт.
 *
 * Выполняет полную валидацию definition единожды.
 * Возвращённый CompiledMapping.execute() не повторяет валидацию definition.
 *
 * @param {object} definition
 * @returns {{ success: true, mapping: CompiledMapping } | { success: false, error: object }}
 */
function compile(definition) {
  try {
    const err = validateDefinition(definition);
    if (err) {
      return { success: false, error: err };
    }
    return {
      success: true,
      mapping: new CompiledMapping(definition.mappingId, definition),
    };
  } catch (e) {
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: e && e.message ? e.message : 'Unexpected internal error',
        phase: 'compile',
      },
    };
  }
}

module.exports = { compile, CompiledMapping };
