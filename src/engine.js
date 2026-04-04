'use strict';

const { validateDefinition } = require('./validator.js');
const { compile: compileDefinition } = require('./compiler.js');

// ---------------------------------------------------------------------------
// MappingEngine
// ---------------------------------------------------------------------------

/**
 * MappingEngine — основная точка входа @processengine/mappings.
 *
 * Методы:
 *   compile(definition)                        — валидация + создание CompiledMapping
 *   validate(definition)                       — валидация без выполнения
 *   run({ definition, sources, trace? })       — сахар над compile + execute
 *
 * Предпочтительный паттерн для production-использования:
 *   const result = engine.compile(definition);
 *   if (result.success) {
 *     const out = result.mapping.execute(sources);
 *   }
 */
class MappingEngine {

  /**
   * Компилирует описание маппинга в неизменяемый исполнимый артефакт.
   * Definition валидируется один раз. CompiledMapping.execute() не повторяет
   * валидацию definition.
   *
   * @param {object} definition
   * @returns {{ success: true, mapping: CompiledMapping } | { success: false, error: object }}
   */
  compile(definition) {
    return compileDefinition(definition);
  }

  /**
   * Проверяет описание маппинга без создания исполнимого артефакта.
   * Используется для CI-валидации файлов определений.
   *
   * @param {object} definition
   * @returns {MappingResult} без полей result и trace
   */
  validate(definition) {
    try {
      const err = validateDefinition(definition);
      if (err) {
        return buildError(definition, err);
      }
      return { status: 'SUCCESS', mappingId: definition.mappingId };
    } catch (e) {
      return buildInternalError(definition, e);
    }
  }

  /**
   * Сахар над compile + execute.
   * Удобен для одиночных вызовов и тестирования.
   * В production предпочтителен compile-first паттерн.
   *
   * @param {{ definition: object, sources: object, trace?: boolean }} input
   * @returns {MappingResult}
   */
  run(input = {}) {
    const { definition, sources, trace = false } = input;
    try {
      const compileResult = compileDefinition(definition);
      if (!compileResult.success) {
        const result = { status: 'MAPPING_ERROR', error: compileResult.error };
        const mappingId = getMappingId(definition);
        if (mappingId !== undefined) result.mappingId = mappingId;
        return result;
      }
      return compileResult.mapping.execute(sources, { trace });
    } catch (e) {
      return buildInternalError(definition, e);
    }
  }
}

// ---------------------------------------------------------------------------
// Вспомогательные функции
// ---------------------------------------------------------------------------

function getMappingId(definition) {
  return (definition && typeof definition.mappingId === 'string')
    ? definition.mappingId
    : undefined;
}

function buildError(definition, err) {
  const result = { status: 'MAPPING_ERROR', error: err };
  const mappingId = getMappingId(definition);
  if (mappingId !== undefined) result.mappingId = mappingId;
  return result;
}

function buildInternalError(definition, e) {
  return buildError(definition, {
    code: 'INTERNAL_ERROR',
    message: e && e.message ? e.message : 'Unexpected internal error',
    phase: 'compile',
  });
}

module.exports = { MappingEngine };
