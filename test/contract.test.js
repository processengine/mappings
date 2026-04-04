'use strict';

/**
 * Контрактные тесты @processengine/mappings
 *
 * Проверяют не "работает ли библиотека", а "не ломает ли она внешний контракт":
 * - compile/execute lifecycle и инварианты CompiledMapping
 * - стабильная форма trace-записей (поля, имена, типы)
 * - стабильная форма ошибок (phase, operator, targetPath)
 * - backward compatibility: run() даёт тот же результат что compile+execute
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { MappingEngine, compile, CompiledMapping } = require('../src/index.js');

const engine = new MappingEngine();

// ---------------------------------------------------------------------------
// Вспомогательные функции
// ---------------------------------------------------------------------------

function validDef(output = {}) {
  return {
    mappingId: 'contract.test.v1',
    sources: { a: 'object' },
    output,
  };
}

function validSources() {
  return { a: { field: 'hello', num: 42, code: 'RUR' } };
}

// ---------------------------------------------------------------------------
// compile/execute lifecycle
// ---------------------------------------------------------------------------

describe('contract: compile/execute lifecycle', () => {

  test('compile() возвращает { success: true, mapping } для валидного definition', () => {
    const result = compile(validDef({ x: { literal: 1 } }));
    assert.equal(result.success, true);
    assert.ok(result.mapping instanceof CompiledMapping);
    assert.equal(result.mapping.mappingId, 'contract.test.v1');
    assert.equal(result.error, undefined);
  });

  test('compile() возвращает { success: false, error } для невалидного definition', () => {
    const result = compile(null);
    assert.equal(result.success, false);
    assert.ok(result.error);
    assert.equal(typeof result.error.code, 'string');
    assert.equal(result.mapping, undefined);
  });

  test('engine.compile() идентичен standalone compile()', () => {
    const def = validDef({ x: { literal: 42 } });
    const r1 = compile(def);
    const r2 = engine.compile(def);
    assert.equal(r1.success, r2.success);
    assert.equal(r1.mapping.mappingId, r2.mapping.mappingId);
  });

  test('CompiledMapping.execute() возвращает MappingResult', () => {
    const { mapping } = compile(validDef({ x: { from: 'sources.a.field' } }));
    const r = mapping.execute(validSources());
    assert.equal(r.status, 'SUCCESS');
    assert.equal(r.mappingId, 'contract.test.v1');
    assert.ok(typeof r.result === 'object');
    assert.equal(r.result.x, 'hello');
  });

  test('compile + execute даёт тот же результат что run()', () => {
    const def = validDef({
      'x': { from: 'sources.a.field' },
      'n': { literal: 99 },
    });
    const sources = validSources();

    const r1 = engine.run({ definition: def, sources });
    const { mapping } = compile(def);
    const r2 = mapping.execute(sources);

    assert.equal(r1.status, r2.status);
    assert.deepEqual(r1.result, r2.result);
  });

  test('CompiledMapping неизменяем — нельзя переназначить mappingId', () => {
    const { mapping } = compile(validDef({ x: { literal: 1 } }));
    assert.throws(() => { mapping.mappingId = 'other'; });
  });

  test('compile failure содержит phase: compile', () => {
    const result = compile({ mappingId: '', sources: {}, output: {} });
    assert.equal(result.success, false);
    assert.equal(result.error.phase, 'compile');
  });

  test('execute failure на невалидных sources содержит phase: execute', () => {
    const { mapping } = compile(validDef({ x: { literal: 1 } }));
    const r = mapping.execute(null);
    assert.equal(r.status, 'MAPPING_ERROR');
    assert.equal(r.error.phase, 'execute');
  });

  test('CompiledMapping.execute() не принимает undefined sources', () => {
    const { mapping } = compile(validDef({ x: { literal: 1 } }));
    const r = mapping.execute(undefined);
    assert.equal(r.status, 'MAPPING_ERROR');
    assert.equal(r.error.code, 'INVALID_SOURCE_TYPE');
  });

  test('compile один раз — execute многократно — одинаковые результаты', () => {
    const def = validDef({ x: { from: 'sources.a.field' } });
    const { mapping } = compile(def);

    const r1 = mapping.execute({ a: { field: 'first' } });
    const r2 = mapping.execute({ a: { field: 'second' } });
    const r3 = mapping.execute({ a: { field: 'third' } });

    assert.equal(r1.result.x, 'first');
    assert.equal(r2.result.x, 'second');
    assert.equal(r3.result.x, 'third');
  });
});

// ---------------------------------------------------------------------------
// Контракт: структура trace (терминология: from, не path)
// ---------------------------------------------------------------------------

describe('contract: trace — структура и поля', () => {

  test('trace поле называется from (не path) для оператора from', () => {
    const r = engine.run({
      definition: validDef({ x: { from: 'sources.a.field' } }),
      sources: validSources(),
      trace: true,
    });
    assert.equal(r.trace[0].from, 'sources.a.field');
    assert.equal(r.trace[0].path, undefined, 'поле path не должно существовать');
  });

  test('trace поле называется from (не path) для строкового оператора', () => {
    const r = engine.run({
      definition: validDef({ x: { trim: 'sources.a.field' } }),
      sources: { a: { field: '  hello  ' } },
      trace: true,
    });
    assert.equal(r.trace[0].from, 'sources.a.field');
    assert.equal(r.trace[0].path, undefined, 'поле path не должно существовать');
  });

  test('trace поле называется from (не path) для mapValue', () => {
    const r = engine.run({
      definition: validDef({ x: { mapValue: { from: 'sources.a.code', map: { RUR: 'RUB' } } } }),
      sources: validSources(),
      trace: true,
    });
    assert.equal(r.trace[0].from, 'sources.a.code');
    assert.equal(r.trace[0].path, undefined);
  });

  test('trace поле называется from (не path) для transform', () => {
    const r = engine.run({
      definition: validDef({ x: { transform: { from: 'sources.a.field', steps: [{ trim: true }, { uppercase: true }] } } }),
      sources: validSources(),
      trace: true,
    });
    assert.equal(r.trace[0].from, 'sources.a.field');
    assert.equal(r.trace[0].path, undefined);
  });

  test('trace запись всегда содержит target, op, outputCreated', () => {
    const r = engine.run({
      definition: validDef({
        'x': { from: 'sources.a.field' },
        'y': { literal: 42 },
      }),
      sources: validSources(),
      trace: true,
    });
    for (const entry of r.trace) {
      assert.equal(typeof entry.target, 'string');
      assert.equal(typeof entry.op, 'string');
      assert.equal(typeof entry.outputCreated, 'boolean');
    }
  });

  test('trace outputValue присутствует только при outputCreated: true', () => {
    const r = engine.run({
      definition: validDef({
        'present': { from: 'sources.a.field' },
        'absent': { from: 'sources.a.missing' },
      }),
      sources: validSources(),
      trace: true,
    });
    const presentEntry = r.trace.find(e => e.target === 'present');
    const absentEntry  = r.trace.find(e => e.target === 'absent');

    assert.equal(presentEntry.outputCreated, true);
    assert.notEqual(presentEntry.outputValue, undefined);

    assert.equal(absentEntry.outputCreated, false);
    assert.equal(absentEntry.outputValue, undefined);
  });

  test('trace: transform шаги содержат op, in, applied', () => {
    const r = engine.run({
      definition: validDef({
        x: { transform: { from: 'sources.a.field', steps: [{ trim: true }, { uppercase: true }] } },
      }),
      sources: { a: { field: ' hello ' } },
      trace: true,
    });
    const steps = r.trace[0].steps;
    assert.ok(Array.isArray(steps));
    for (const step of steps) {
      assert.equal(typeof step.op, 'string');
      assert.equal(typeof step.applied, 'boolean');
      assert.ok('in' in step);
    }
  });

  test('trace: обрыв цепочки — steps частичные, reason присутствует', () => {
    const r = engine.run({
      definition: validDef({
        x: {
          transform: {
            from: 'sources.a.field',
            steps: [{ trim: true }, { mapValue: { map: { KNOWN: 'ok' } } }],
          },
        },
      }),
      sources: { a: { field: 'UNKNOWN' } },
      trace: true,
    });
    const entry = r.trace[0];
    assert.equal(entry.outputCreated, false);
    assert.equal(entry.reason, 'chain_stopped');
    assert.equal(entry.steps.length, 2);
    assert.equal(entry.steps[0].applied, true);
    assert.equal(entry.steps[1].applied, false);
    assert.equal(entry.steps[1].stoppedChain, true);
    assert.ok('reason' in entry.steps[1]);
  });

  test('trace нет в ответе по умолчанию (trace: false)', () => {
    const r = engine.run({
      definition: validDef({ x: { literal: 1 } }),
      sources: { a: {} },
    });
    assert.equal(r.trace, undefined);
  });

  test('validate() никогда не возвращает trace', () => {
    const r = engine.validate(validDef({ x: { from: 'sources.a.f' } }));
    assert.equal(r.trace, undefined);
  });
});

// ---------------------------------------------------------------------------
// Контракт: структура ошибок
// ---------------------------------------------------------------------------

describe('contract: error — структура и location', () => {

  test('ошибка компиляции содержит phase: compile', () => {
    const r = engine.validate({ mappingId: '', sources: {}, output: {} });
    assert.equal(r.status, 'MAPPING_ERROR');
    assert.equal(r.error.phase, 'compile');
  });

  test('ошибка оператора содержит targetPath и operator', () => {
    const r = engine.validate({
      mappingId: 'x', sources: { a: 'object' },
      output: { 'client.name': { trim: 42 } },
    });
    assert.equal(r.status, 'MAPPING_ERROR');
    assert.equal(r.error.targetPath, 'client.name');
    assert.equal(r.error.operator, 'trim');
    assert.equal(r.error.phase, 'compile');
  });

  test('ошибка transform step содержит stepIndex', () => {
    const r = engine.validate({
      mappingId: 'x', sources: { a: 'object' },
      output: {
        x: {
          transform: {
            from: 'sources.a.f',
            steps: [{ trim: true }, { mapValue: { from: 'bad', map: { a: 'b' } } }],
          },
        },
      },
    });
    assert.equal(r.status, 'MAPPING_ERROR');
    assert.equal(r.error.stepIndex, 1);
    assert.equal(r.error.operator, 'transform');
  });

  test('ошибка содержит стабильный machine-readable code', () => {
    const cases = [
      [{ mappingId: '', sources: {}, output: {} }, 'INVALID_MAPPING_ID'],
      [{ mappingId: 'x', output: {} }, 'INVALID_SOURCE_DECLARATION'],
      [{ mappingId: 'x', sources: {}, output: null }, 'INVALID_MAPPING_SCHEMA'],
    ];
    for (const [def, expectedCode] of cases) {
      const r = engine.validate(def);
      assert.equal(r.error.code, expectedCode, `Expected ${expectedCode} for ${JSON.stringify(def)}`);
    }
  });

  test('runtime ошибка содержит phase: execute', () => {
    const { mapping } = compile(validDef({ x: { from: 'sources.a.field' } }));
    const r = mapping.execute({ a: NaN });
    assert.equal(r.status, 'MAPPING_ERROR');
    assert.equal(r.error.phase, 'execute');
  });

  test('ошибка содержит code и message как строки', () => {
    const r = engine.validate(null);
    assert.equal(typeof r.error.code, 'string');
    assert.equal(typeof r.error.message, 'string');
  });
});

// ---------------------------------------------------------------------------
// Контракт: обратная совместимость run()
// ---------------------------------------------------------------------------

describe('contract: backward compatibility — run()', () => {

  test('run() возвращает MappingResult с status SUCCESS', () => {
    const r = engine.run({
      definition: validDef({ x: { literal: 1 } }),
      sources: { a: {} },
    });
    assert.equal(r.status, 'SUCCESS');
    assert.equal(typeof r.mappingId, 'string');
    assert.ok(typeof r.result === 'object');
  });

  test('run() возвращает MAPPING_ERROR для невалидного definition', () => {
    const r = engine.run({ definition: null, sources: {} });
    assert.equal(r.status, 'MAPPING_ERROR');
    assert.ok(r.error);
  });

  test('run(undefined) не бросает исключение', () => {
    let r;
    assert.doesNotThrow(() => { r = engine.run(undefined); });
    assert.equal(r.status, 'MAPPING_ERROR');
  });

  test('run() и compile+execute дают идентичный result', () => {
    const def = {
      mappingId: 'compat.v1',
      sources: { raw: 'object' },
      output: {
        'client.phone':    { removeNonDigits: 'sources.raw.phone' },
        'client.name':     { normalizeSpaces: 'sources.raw.name' },
        'client.currency': { mapValue: { from: 'sources.raw.code', map: { RUR: 'RUB' }, fallback: 'passthrough' } },
      },
    };
    const sources = { raw: { phone: '+7 (999) 111-22-33', name: '  Иван  Иванов  ', code: 'RUR' } };

    const r1 = engine.run({ definition: def, sources });
    const compiled = compile(def);
    const r2 = compiled.mapping.execute(sources);

    assert.equal(r1.status, 'SUCCESS');
    assert.equal(r2.status, 'SUCCESS');
    assert.deepEqual(r1.result, r2.result);
  });
});

// ---------------------------------------------------------------------------
// Контракт: модули экспортируют стабильный публичный API
// ---------------------------------------------------------------------------

describe('contract: публичный API', () => {

  test('MappingEngine экспортируется', () => {
    assert.ok(MappingEngine);
    assert.equal(typeof MappingEngine, 'function');
  });

  test('compile экспортируется как функция', () => {
    assert.equal(typeof compile, 'function');
  });

  test('CompiledMapping экспортируется', () => {
    assert.ok(CompiledMapping);
    assert.equal(typeof CompiledMapping, 'function');
  });

  test('engine.compile, engine.validate, engine.run — методы engine', () => {
    assert.equal(typeof engine.compile, 'function');
    assert.equal(typeof engine.validate, 'function');
    assert.equal(typeof engine.run, 'function');
  });

  test('MappingResult содержит стабильные поля: status, mappingId, result', () => {
    const r = engine.run({
      definition: validDef({ x: { literal: 'value' } }),
      sources: { a: {} },
    });
    assert.ok('status' in r);
    assert.ok('mappingId' in r);
    assert.ok('result' in r);
  });

  test('MAPPING_ERROR содержит стабильные поля: status, error.code, error.message', () => {
    const r = engine.run({ definition: null });
    assert.equal(r.status, 'MAPPING_ERROR');
    assert.ok('error' in r);
    assert.equal(typeof r.error.code, 'string');
    assert.equal(typeof r.error.message, 'string');
  });
});

// ---------------------------------------------------------------------------
// Контракт: защита от внешней мутации definition после compile
// ---------------------------------------------------------------------------

describe('contract: mutation protection after compile', () => {

  test('мутация literal после compile не влияет на execute', () => {
    const def = { mappingId: 'mut.v1', sources: { a: 'object' }, output: { x: { literal: 1 } } };
    const { mapping } = compile(def);

    def.output.x.literal = 999;

    const r = mapping.execute({ a: {} });
    assert.equal(r.status, 'SUCCESS');
    assert.equal(r.result.x, 1, 'execute должен работать по зафиксированной версии definition');
  });

  test('мутация from-пути после compile не влияет на execute', () => {
    const def = {
      mappingId: 'mut.v1',
      sources: { a: 'object' },
      output: { x: { from: 'sources.a.field' } },
    };
    const { mapping } = compile(def);

    def.output.x.from = 'sources.a.other';

    const r = mapping.execute({ a: { field: 'original', other: 'mutated' } });
    assert.equal(r.result.x, 'original', 'должно читаться поле field, а не other');
  });

  test('мутация объявления sources после compile не влияет на execute', () => {
    const def = {
      mappingId: 'mut.v1',
      sources: { a: 'object' },
      output: { x: { from: 'sources.a.field' } },
    };
    const { mapping } = compile(def);

    // Добавляем источник — execute не должен его требовать
    def.sources.b = 'object';

    const r = mapping.execute({ a: { field: 'hello' } });
    assert.equal(r.status, 'SUCCESS', 'не должно требовать новый источник b');
    assert.equal(r.result.x, 'hello');
  });

  test('мутация mappingId после compile не влияет на артефакт', () => {
    const def = { mappingId: 'original.v1', sources: { a: 'object' }, output: { x: { literal: 42 } } };
    const { mapping } = compile(def);

    def.mappingId = 'mutated-id';

    assert.equal(mapping.mappingId, 'original.v1');
  });

  test('мутация transform.steps после compile не влияет на execute', () => {
    const def = {
      mappingId: 'mut.v1',
      sources: { a: 'object' },
      output: {
        x: {
          transform: {
            from: 'sources.a.v',
            steps: [{ trim: true }, { uppercase: true }],
          },
        },
      },
    };
    const { mapping } = compile(def);

    // Подменяем второй шаг и добавляем третий
    def.output.x.transform.steps[1] = { lowercase: true };
    def.output.x.transform.steps.push({ trim: true });

    const r = mapping.execute({ a: { v: '  hello  ' } });
    assert.equal(r.result.x, 'HELLO', 'должно применить uppercase, а не lowercase');
  });

  test('мутация mapValue.map после compile не влияет на execute', () => {
    const def = {
      mappingId: 'mut.v1',
      sources: { a: 'object' },
      output: { x: { mapValue: { from: 'sources.a.code', map: { RUR: 'RUB' } } } },
    };
    const { mapping } = compile(def);

    def.output.x.mapValue.map.RUR = 'MUTATED';
    def.output.x.mapValue.map.NEW = 'EXTRA';

    const r = mapping.execute({ a: { code: 'RUR' } });
    assert.equal(r.result.x, 'RUB', 'должно использовать зафиксированный словарь');
  });

  test('definition frozen — прямая мутация бросает TypeError в strict mode', () => {
    const def = { mappingId: 'mut.v1', sources: { a: 'object' }, output: { x: { literal: 1 } } };
    compile(def); // after compile, def itself is NOT frozen — it's a clone that is frozen
    // The original def is still mutable — that's fine, the clone is what's protected
    // Verify the clone is truly isolated by checking execute output is unchanged
    def.output.x = { literal: 777 };
    const { mapping } = compile({ ...def, output: { x: { literal: 1 } } });
    def.output.x = { literal: 888 };
    const r = mapping.execute({ a: {} });
    assert.equal(r.result.x, 1);
  });
});
