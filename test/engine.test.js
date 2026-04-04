'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { MappingEngine } = require('../src/index.js');

const engine = new MappingEngine();

// ---------------------------------------------------------------------------
// Вспомогательные функции
// ---------------------------------------------------------------------------

function ok(result) {
  assert.equal(
    result.status, 'SUCCESS',
    `Expected SUCCESS, got MAPPING_ERROR: [${result.error?.code}] ${result.error?.message}`,
  );
}

function err(result, code) {
  assert.equal(result.status, 'MAPPING_ERROR', `Expected MAPPING_ERROR, got SUCCESS`);
  if (code) {
    assert.equal(
      result.error.code, code,
      `Expected error code ${code}, got ${result.error.code}: ${result.error.message}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Граница API — run() с некорректным вводом
// ---------------------------------------------------------------------------

describe('run() — граница API (некорректный ввод)', () => {
  const validDef = {
    mappingId: 'test.v1',
    sources: { a: 'object' },
    output: { 'x': { literal: 1 } },
  };

  test('run(undefined) не бросает исключение, возвращает MAPPING_ERROR', () => {
    let result;
    assert.doesNotThrow(() => { result = engine.run(undefined); });
    err(result);
  });

  test('run({}) не бросает исключение, возвращает MAPPING_ERROR', () => {
    let result;
    assert.doesNotThrow(() => { result = engine.run({}); });
    err(result);
  });

  test('run({ definition }) без sources → INVALID_SOURCE_TYPE', () => {
    err(engine.run({ definition: validDef }), 'INVALID_SOURCE_TYPE');
  });

  test('run({ definition, sources: null }) → INVALID_SOURCE_TYPE', () => {
    err(engine.run({ definition: validDef, sources: null }), 'INVALID_SOURCE_TYPE');
  });

  test('run({ definition, sources: [] }) → INVALID_SOURCE_TYPE', () => {
    err(engine.run({ definition: validDef, sources: [] }), 'INVALID_SOURCE_TYPE');
  });

  test('run({ definition, sources: "oops" }) → INVALID_SOURCE_TYPE', () => {
    err(engine.run({ definition: validDef, sources: 'oops' }), 'INVALID_SOURCE_TYPE');
  });
});

// ---------------------------------------------------------------------------
// validate() — контракт: без result, без trace
// ---------------------------------------------------------------------------

describe('validate() — контракт result/trace', () => {
  const validDef = {
    mappingId: 'test.v1',
    sources: { a: 'object' },
    output: { 'x': { from: 'sources.a.f' } },
  };

  test('SUCCESS не содержит поля result', () => {
    const r = engine.validate(validDef);
    ok(r);
    assert.equal(r.result, undefined);
  });

  test('SUCCESS не содержит поля trace', () => {
    const r = engine.validate(validDef);
    ok(r);
    assert.equal(r.trace, undefined);
  });

  test('validate(undefined) не бросает исключение', () => {
    let result;
    assert.doesNotThrow(() => { result = engine.validate(undefined); });
    err(result);
  });

  test('MAPPING_ERROR не содержит поля result', () => {
    const r = engine.validate({ mappingId: 'x', sources: {}, output: { 'y': { from: 'bad' } } });
    err(r);
    assert.equal(r.result, undefined);
  });
});

// ---------------------------------------------------------------------------
// validate() — валидация схемы
// ---------------------------------------------------------------------------

describe('validate()', () => {
  test('корректное описание возвращает SUCCESS', () => {
    const r = engine.validate({
      mappingId: 'test.v1',
      sources: { a: 'object' },
      output: { 'x.y': { from: 'sources.a.field' } },
    });
    ok(r);
    assert.equal(r.mappingId, 'test.v1');
  });

  test('отсутствует mappingId → INVALID_MAPPING_ID', () => {
    err(engine.validate({ sources: { a: 'object' }, output: {} }), 'INVALID_MAPPING_ID');
  });

  test('пустой mappingId → INVALID_MAPPING_ID', () => {
    err(engine.validate({ mappingId: '', sources: { a: 'object' }, output: {} }), 'INVALID_MAPPING_ID');
  });

  test('отсутствует sources → INVALID_SOURCE_DECLARATION', () => {
    err(engine.validate({ mappingId: 'x', output: {} }), 'INVALID_SOURCE_DECLARATION');
  });

  test('источник с неверным типом → INVALID_SOURCE_DECLARATION', () => {
    err(engine.validate({ mappingId: 'x', sources: { a: 'array' }, output: {} }), 'INVALID_SOURCE_DECLARATION');
  });

  test('отсутствует output → INVALID_MAPPING_SCHEMA', () => {
    err(engine.validate({ mappingId: 'x', sources: {} }), 'INVALID_MAPPING_SCHEMA');
  });

  test('неизвестный оператор → UNKNOWN_OPERATOR', () => {
    err(engine.validate({
      mappingId: 'x',
      sources: { a: 'object' },
      output: { 'x': { map: 'sources.a.f' } },
    }), 'UNKNOWN_OPERATOR');
  });

  test('нет оператора в поле output → INVALID_MAPPING_SCHEMA', () => {
    err(engine.validate({
      mappingId: 'x', sources: { a: 'object' }, output: { 'x': {} },
    }), 'INVALID_MAPPING_SCHEMA');
  });

  test('путь без префикса sources. → INVALID_PATH', () => {
    err(engine.validate({
      mappingId: 'x', sources: { a: 'object' }, output: { 'x': { from: 'a.field' } },
    }), 'INVALID_PATH');
  });

  test('путь ссылается на необъявленный источник → INVALID_PATH', () => {
    err(engine.validate({
      mappingId: 'x', sources: { a: 'object' }, output: { 'x': { from: 'sources.b.field' } },
    }), 'INVALID_PATH');
  });

  test('слишком короткий путь sources.name → INVALID_PATH', () => {
    err(engine.validate({
      mappingId: 'x', sources: { a: 'object' }, output: { 'x': { from: 'sources.a' } },
    }), 'INVALID_PATH');
  });

  test('запрещённый сегмент __proto__ в пути → INVALID_PATH', () => {
    err(engine.validate({
      mappingId: 'x', sources: { a: 'object' }, output: { 'x': { from: 'sources.a.__proto__.field' } },
    }), 'INVALID_PATH');
  });

  test('запрещённый сегмент prototype в целевом пути → INVALID_TARGET_PATH', () => {
    err(engine.validate({
      mappingId: 'x', sources: { a: 'object' }, output: { 'prototype.x': { literal: 'v' } },
    }), 'INVALID_TARGET_PATH');
  });

  test('числовой индекс в пути → INVALID_PATH', () => {
    err(engine.validate({
      mappingId: 'x', sources: { a: 'object' }, output: { 'x': { from: 'sources.a.items.0' } },
    }), 'INVALID_PATH');
  });

  test('конфликт целевых путей (вложенность) → CONFLICTING_TARGET_PATHS', () => {
    err(engine.validate({
      mappingId: 'x', sources: { a: 'object' },
      output: { 'validation': { literal: 'x' }, 'validation.status': { from: 'sources.a.s' } },
    }), 'CONFLICTING_TARGET_PATHS');
  });

  test('пустой output является валидным', () => {
    ok(engine.validate({ mappingId: 'x', sources: {}, output: {} }));
  });
});

// ---------------------------------------------------------------------------
// run() — валидация источников
// ---------------------------------------------------------------------------

describe('run() — валидация источников', () => {
  const def = {
    mappingId: 'test.v1',
    sources: { a: 'object', b: 'object' },
    output: { 'x': { from: 'sources.a.f' } },
  };

  test('отсутствующий источник → MISSING_SOURCE', () => {
    err(engine.run({ definition: def, sources: { a: { f: 1 } } }), 'MISSING_SOURCE');
  });

  test('источник null → INVALID_SOURCE_TYPE', () => {
    err(engine.run({ definition: def, sources: { a: null, b: {} } }), 'INVALID_SOURCE_TYPE');
  });

  test('источник массив → INVALID_SOURCE_TYPE', () => {
    err(engine.run({ definition: def, sources: { a: [], b: {} } }), 'INVALID_SOURCE_TYPE');
  });

  test('источник строка → INVALID_SOURCE_TYPE', () => {
    err(engine.run({ definition: def, sources: { a: 'hello', b: {} } }), 'INVALID_SOURCE_TYPE');
  });
});

// ---------------------------------------------------------------------------
// Оператор: from
// ---------------------------------------------------------------------------

describe('оператор: from', () => {
  function run(sourceValue, pathSuffix = 'field') {
    return engine.run({
      definition: { mappingId: 'test', sources: { a: 'object' }, output: { 'out': { from: `sources.a.${pathSuffix}` } } },
      sources: { a: sourceValue },
    });
  }

  test('копирует строку', () => { const r = run({ field: 'hello' }); ok(r); assert.equal(r.result.out, 'hello'); });
  test('копирует число', () => { const r = run({ field: 42 }); ok(r); assert.equal(r.result.out, 42); });
  test('копирует boolean', () => { const r = run({ field: false }); ok(r); assert.equal(r.result.out, false); });
  test('копирует null (поле существует с null)', () => { const r = run({ field: null }); ok(r); assert.equal(r.result.out, null); });
  test('поле отсутствует → поле не создаётся', () => { const r = run({ other: 'x' }); ok(r); assert.equal(r.result.out, undefined); });

  test('копирует массив как deep copy', () => {
    const arr = [1, 2, 3];
    const r = run({ field: arr });
    ok(r);
    assert.deepEqual(r.result.out, arr);
    r.result.out.push(4);
    assert.equal(arr.length, 3, 'Оригинальный массив не должен мутировать');
  });

  test('копирует вложенный объект как deep copy', () => {
    const obj = { x: { y: 1 } };
    const r = run({ field: obj });
    ok(r);
    r.result.out.x.y = 99;
    assert.equal(obj.x.y, 1, 'Оригинальный объект не должен мутировать');
  });

  test('null на промежуточном пути → поле не создаётся', () => {
    const r = run({ parent: null }, 'parent.child');
    ok(r);
    assert.equal(r.result.out, undefined);
  });
});

// ---------------------------------------------------------------------------
// Оператор: literal
// ---------------------------------------------------------------------------

describe('оператор: literal', () => {
  function run(value) {
    return engine.run({
      definition: { mappingId: 'test', sources: {}, output: { 'out': { literal: value } } },
      sources: {},
    });
  }

  test('строковый литерал', () => { const r = run('hello'); ok(r); assert.equal(r.result.out, 'hello'); });
  test('числовой литерал', () => { const r = run(42); ok(r); assert.equal(r.result.out, 42); });
  test('boolean true', () => { const r = run(true); ok(r); assert.equal(r.result.out, true); });
  test('boolean false', () => { const r = run(false); ok(r); assert.equal(r.result.out, false); });
  test('null литерал', () => { const r = run(null); ok(r); assert.equal(r.result.out, null); });
  test('всегда создаёт поле', () => {
    const r = run('x');
    ok(r);
    assert.ok(Object.prototype.hasOwnProperty.call(r.result, 'out'));
  });
});

// ---------------------------------------------------------------------------
// Оператор: exists
// ---------------------------------------------------------------------------

describe('оператор: exists', () => {
  function run(sourceObj) {
    return engine.run({
      definition: { mappingId: 'test', sources: { a: 'object' }, output: { 'out': { exists: 'sources.a.field' } } },
      sources: { a: sourceObj },
    });
  }

  test('поле с не-null значением → true', () => { const r = run({ field: 'x' }); ok(r); assert.equal(r.result.out, true); });
  test('поле с null → false', () => { const r = run({ field: null }); ok(r); assert.equal(r.result.out, false); });
  test('поле отсутствует → false', () => { const r = run({ other: 'x' }); ok(r); assert.equal(r.result.out, false); });
  test('поле со значением 0 → true (0 не является null)', () => { const r = run({ field: 0 }); ok(r); assert.equal(r.result.out, true); });
  test('поле с false → true (false не является null)', () => { const r = run({ field: false }); ok(r); assert.equal(r.result.out, true); });
  test('поле с пустой строкой → true', () => { const r = run({ field: '' }); ok(r); assert.equal(r.result.out, true); });
  test('всегда создаёт поле', () => {
    const r = run({});
    ok(r);
    assert.ok(Object.prototype.hasOwnProperty.call(r.result, 'out'));
  });
});

// ---------------------------------------------------------------------------
// Оператор: equals
// ---------------------------------------------------------------------------

describe('оператор: equals', () => {
  function run(sourceObj, literal) {
    return engine.run({
      definition: { mappingId: 'test', sources: { a: 'object' }, output: { 'out': { equals: ['sources.a.field', literal] } } },
      sources: { a: sourceObj },
    });
  }

  test('строка совпадает → true', () => { const r = run({ field: 'ERROR' }, 'ERROR'); ok(r); assert.equal(r.result.out, true); });
  test('строка не совпадает → false', () => { const r = run({ field: 'OK' }, 'ERROR'); ok(r); assert.equal(r.result.out, false); });
  test('число совпадает → true', () => { const r = run({ field: 42 }, 42); ok(r); assert.equal(r.result.out, true); });
  test('строгое сравнение: "42" !== 42', () => { const r = run({ field: '42' }, 42); ok(r); assert.equal(r.result.out, false); });
  test('путь не разрешился → false', () => { const r = run({ other: 'x' }, 'ERROR'); ok(r); assert.equal(r.result.out, false); });
  test('асимметрия null: exists=false, equals(null)=true', () => {
    const r = engine.run({
      definition: { mappingId: 'test', sources: { a: 'object' }, output: { 'a': { exists: 'sources.a.f' }, 'b': { equals: ['sources.a.f', null] } } },
      sources: { a: { f: null } },
    });
    ok(r);
    assert.equal(r.result.a, false);
    assert.equal(r.result.b, true);
  });
});

// ---------------------------------------------------------------------------
// Оператор: coalesce
// ---------------------------------------------------------------------------

describe('оператор: coalesce', () => {
  function run(sourceObj, candidates) {
    return engine.run({
      definition: { mappingId: 'test', sources: { a: 'object' }, output: { 'out': { coalesce: candidates } } },
      sources: { a: sourceObj },
    });
  }

  test('первый путь разрешился → использует его', () => {
    const r = run({ x: 'hello' }, [{ path: 'sources.a.x' }, { literal: 'fallback' }]);
    ok(r); assert.equal(r.result.out, 'hello');
  });
  test('первый путь null, второй разрешился', () => {
    const r = run({ x: null, y: 'found' }, [{ path: 'sources.a.x' }, { path: 'sources.a.y' }]);
    ok(r); assert.equal(r.result.out, 'found');
  });
  test('все пути отсутствуют → использует literal', () => {
    const r = run({}, [{ path: 'sources.a.x' }, { literal: 'DEFAULT' }]);
    ok(r); assert.equal(r.result.out, 'DEFAULT');
  });
  test('все кандидаты не разрешились → поле не создаётся', () => {
    const r = run({ x: null }, [{ path: 'sources.a.x' }, { path: 'sources.a.y' }]);
    ok(r); assert.equal(r.result.out, undefined);
  });
  test('литеральный кандидат всегда побеждает', () => {
    const r = run({ x: 'x' }, [{ literal: 'FIRST' }, { path: 'sources.a.x' }]);
    ok(r); assert.equal(r.result.out, 'FIRST');
  });
});

// ---------------------------------------------------------------------------
// Оператор: trim
// ---------------------------------------------------------------------------

describe('оператор: trim', () => {
  function run(value) {
    return engine.run({
      definition: { mappingId: 'test', sources: { a: 'object' }, output: { 'out': { trim: 'sources.a.f' } } },
      sources: { a: { f: value } },
    });
  }

  test('убирает ведущие и хвостовые пробелы', () => { const r = run('  hello  '); ok(r); assert.equal(r.result.out, 'hello'); });
  test('убирает пробелы только с краёв, внутренние сохраняет', () => { const r = run('  а б  '); ok(r); assert.equal(r.result.out, 'а б'); });
  test('пустая строка остаётся пустой', () => { const r = run(''); ok(r); assert.equal(r.result.out, ''); });
  test('строка без пробелов не изменяется', () => { const r = run('abc'); ok(r); assert.equal(r.result.out, 'abc'); });
  test('значение null → поле не создаётся', () => {
    const r = engine.run({
      definition: { mappingId: 'test', sources: { a: 'object' }, output: { 'out': { trim: 'sources.a.f' } } },
      sources: { a: { f: null } },
    });
    ok(r); assert.equal(r.result.out, undefined);
  });
  test('путь не разрешился → поле не создаётся', () => {
    const r = engine.run({
      definition: { mappingId: 'test', sources: { a: 'object' }, output: { 'out': { trim: 'sources.a.f' } } },
      sources: { a: {} },
    });
    ok(r); assert.equal(r.result.out, undefined);
  });
  test('значение не строка (число) → поле не создаётся', () => { const r = run(42); ok(r); assert.equal(r.result.out, undefined); });
  test('значение не строка (boolean) → поле не создаётся', () => { const r = run(true); ok(r); assert.equal(r.result.out, undefined); });
  test('аргумент не путь → INVALID_ARGS', () => {
    err(engine.validate({ mappingId: 'x', sources: { a: 'object' }, output: { 'x': { trim: 42 } } }), 'INVALID_ARGS');
  });
});

// ---------------------------------------------------------------------------
// Оператор: lowercase
// ---------------------------------------------------------------------------

describe('оператор: lowercase', () => {
  function run(value) {
    return engine.run({
      definition: { mappingId: 'test', sources: { a: 'object' }, output: { 'out': { lowercase: 'sources.a.f' } } },
      sources: { a: { f: value } },
    });
  }

  test('приводит к нижнему регистру', () => { const r = run('HELLO'); ok(r); assert.equal(r.result.out, 'hello'); });
  test('смешанный регистр', () => { const r = run('HeLLo WoRLd'); ok(r); assert.equal(r.result.out, 'hello world'); });
  test('уже нижний регистр не изменяется', () => { const r = run('abc'); ok(r); assert.equal(r.result.out, 'abc'); });
  test('не строка → поле не создаётся', () => { const r = run(42); ok(r); assert.equal(r.result.out, undefined); });
});

// ---------------------------------------------------------------------------
// Оператор: uppercase
// ---------------------------------------------------------------------------

describe('оператор: uppercase', () => {
  function run(value) {
    return engine.run({
      definition: { mappingId: 'test', sources: { a: 'object' }, output: { 'out': { uppercase: 'sources.a.f' } } },
      sources: { a: { f: value } },
    });
  }

  test('приводит к верхнему регистру', () => { const r = run('hello'); ok(r); assert.equal(r.result.out, 'HELLO'); });
  test('смешанный регистр', () => { const r = run('HeLLo WoRLd'); ok(r); assert.equal(r.result.out, 'HELLO WORLD'); });
  test('уже верхний регистр не изменяется', () => { const r = run('ABC'); ok(r); assert.equal(r.result.out, 'ABC'); });
  test('не строка → поле не создаётся', () => { const r = run(false); ok(r); assert.equal(r.result.out, undefined); });
});

// ---------------------------------------------------------------------------
// Оператор: normalizeSpaces
// ---------------------------------------------------------------------------

describe('оператор: normalizeSpaces', () => {
  function run(value) {
    return engine.run({
      definition: { mappingId: 'test', sources: { a: 'object' }, output: { 'out': { normalizeSpaces: 'sources.a.f' } } },
      sources: { a: { f: value } },
    });
  }

  test('схлопывает множественные пробелы', () => { const r = run('Иван  Иванов'); ok(r); assert.equal(r.result.out, 'Иван Иванов'); });
  test('убирает краевые пробелы и схлопывает внутренние', () => { const r = run('  Иван  Иванов  '); ok(r); assert.equal(r.result.out, 'Иван Иванов'); });
  test('строка без лишних пробелов не изменяется', () => { const r = run('abc def'); ok(r); assert.equal(r.result.out, 'abc def'); });
  test('строка только из пробелов → пустая строка', () => { const r = run('   '); ok(r); assert.equal(r.result.out, ''); });
  test('не строка → поле не создаётся', () => { const r = run(null); ok(r); assert.equal(r.result.out, undefined); });
});

// ---------------------------------------------------------------------------
// Оператор: removeNonDigits
// ---------------------------------------------------------------------------

describe('оператор: removeNonDigits', () => {
  function run(value) {
    return engine.run({
      definition: { mappingId: 'test', sources: { a: 'object' }, output: { 'out': { removeNonDigits: 'sources.a.f' } } },
      sources: { a: { f: value } },
    });
  }

  test('удаляет не-цифры из телефона', () => { const r = run('+7 (999) 111-22-33'); ok(r); assert.equal(r.result.out, '79991112233'); });
  test('строка только из цифр не изменяется', () => { const r = run('12345'); ok(r); assert.equal(r.result.out, '12345'); });
  test('строка без цифр → пустая строка (поле создаётся)', () => {
    const r = run('---');
    ok(r);
    assert.equal(r.result.out, '');
    assert.ok(Object.prototype.hasOwnProperty.call(r.result, 'out'), 'Поле должно быть создано');
  });
  test('пустая строка → пустая строка', () => { const r = run(''); ok(r); assert.equal(r.result.out, ''); });
  test('не строка → поле не создаётся', () => { const r = run(42); ok(r); assert.equal(r.result.out, undefined); });
});

// ---------------------------------------------------------------------------
// Оператор: mapValue (корневая форма)
// ---------------------------------------------------------------------------

describe('оператор: mapValue (корневая форма)', () => {
  const def = (map, fallbackEntry = {}) => ({
    mappingId: 'test',
    sources: { a: 'object' },
    output: {
      'out': {
        mapValue: {
          from: 'sources.a.code',
          map,
          ...fallbackEntry,
        },
      },
    },
  });

  test('строковый ключ найден → возвращает значение из словаря', () => {
    const r = engine.run({ definition: def({ 'RUR': 'RUB', '643': 'RUB' }), sources: { a: { code: '643' } } });
    ok(r); assert.equal(r.result.out, 'RUB');
  });

  test('ключ не найден, fallback отсутствует → поле не создаётся', () => {
    const r = engine.run({ definition: def({ 'USD': 'USD' }), sources: { a: { code: 'GBP' } } });
    ok(r); assert.equal(r.result.out, undefined);
  });

  test('ключ не найден, fallback: null → поле создаётся с null', () => {
    const r = engine.run({ definition: def({ 'USD': 'USD' }, { fallback: null }), sources: { a: { code: 'GBP' } } });
    ok(r);
    assert.equal(r.result.out, null);
    assert.ok(Object.prototype.hasOwnProperty.call(r.result, 'out'));
  });

  test('ключ не найден, fallback: "UNKNOWN" → поле создаётся с "UNKNOWN"', () => {
    const r = engine.run({ definition: def({ 'USD': 'USD' }, { fallback: 'UNKNOWN' }), sources: { a: { code: 'GBP' } } });
    ok(r); assert.equal(r.result.out, 'UNKNOWN');
  });

  test('ключ не найден, fallback: "passthrough" → поле создаётся с исходным значением', () => {
    const r = engine.run({ definition: def({ 'USD': 'USD' }, { fallback: 'passthrough' }), sources: { a: { code: 'EUR' } } });
    ok(r); assert.equal(r.result.out, 'EUR');
  });

  test('КРИТИЧНО: числовой вход 643 не совпадает со строковым ключом "643"', () => {
    const r = engine.run({ definition: def({ '643': 'RUB' }), sources: { a: { code: 643 } } });
    ok(r); assert.equal(r.result.out, undefined, 'Число не должно совпадать со строковым ключом');
  });

  test('числовой вход с passthrough → поле не создаётся (not string)', () => {
    const r = engine.run({ definition: def({ '643': 'RUB' }, { fallback: 'passthrough' }), sources: { a: { code: 643 } } });
    ok(r); assert.equal(r.result.out, undefined);
  });

  test('boolean вход → поле не создаётся', () => {
    const r = engine.run({ definition: def({ 'true': 'yes' }), sources: { a: { code: true } } });
    ok(r); assert.equal(r.result.out, undefined);
  });

  test('значение null → поле не создаётся', () => {
    const r = engine.run({ definition: def({ 'null': 'n' }), sources: { a: { code: null } } });
    ok(r); assert.equal(r.result.out, undefined);
  });

  test('путь не разрешился → поле не создаётся', () => {
    const r = engine.run({ definition: def({ 'x': 'y' }), sources: { a: {} } });
    ok(r); assert.equal(r.result.out, undefined);
  });

  test('значение словаря может быть числом', () => {
    const r = engine.run({ definition: def({ '643': 643 }), sources: { a: { code: '643' } } });
    ok(r); assert.equal(r.result.out, 643);
  });

  test('отсутствует from → INVALID_ARGS', () => {
    err(engine.validate({
      mappingId: 'x', sources: { a: 'object' },
      output: { 'x': { mapValue: { map: { 'a': 'b' } } } },
    }), 'INVALID_ARGS');
  });

  test('пустой словарь → INVALID_ARGS', () => {
    err(engine.validate({
      mappingId: 'x', sources: { a: 'object' },
      output: { 'x': { mapValue: { from: 'sources.a.f', map: {} } } },
    }), 'INVALID_ARGS');
  });

  test('значение словаря NaN → INVALID_ARGS', () => {
    err(engine.validate({
      mappingId: 'x', sources: { a: 'object' },
      output: { 'x': { mapValue: { from: 'sources.a.f', map: { 'a': NaN } } } },
    }), 'INVALID_ARGS');
  });

  test('fallback: Infinity → INVALID_ARGS', () => {
    err(engine.validate({
      mappingId: 'x', sources: { a: 'object' },
      output: { 'x': { mapValue: { from: 'sources.a.f', map: { 'a': 'b' }, fallback: Infinity } } },
    }), 'INVALID_ARGS');
  });
});

// ---------------------------------------------------------------------------
// Оператор: transform
// ---------------------------------------------------------------------------

describe('оператор: transform', () => {

  test('trim + uppercase + mapValue: полный happy path', () => {
    const r = engine.run({
      definition: {
        mappingId: 'test',
        sources: { a: 'object' },
        output: {
          'out': {
            transform: {
              from: 'sources.a.gender',
              steps: [
                { trim: true },
                { uppercase: true },
                { mapValue: { map: { 'М': 'MALE', 'M': 'MALE', 'Ж': 'FEMALE', 'F': 'FEMALE' }, fallback: null } },
              ],
            },
          },
        },
      },
      sources: { a: { gender: ' m ' } },
    });
    ok(r); assert.equal(r.result.out, 'MALE');
  });

  test('removeNonDigits + mapValue: нормализация телефона', () => {
    const r = engine.run({
      definition: {
        mappingId: 'test',
        sources: { a: 'object' },
        output: {
          'out': {
            transform: {
              from: 'sources.a.phone',
              steps: [
                { removeNonDigits: true },
                { mapValue: { map: { '89991112233': '79991112233' }, fallback: 'passthrough' } },
              ],
            },
          },
        },
      },
      sources: { a: { phone: '+7 (999) 111-22-33' } },
    });
    ok(r); assert.equal(r.result.out, '79991112233');
  });

  test('trim + lowercase: два строковых шага', () => {
    const r = engine.run({
      definition: {
        mappingId: 'test',
        sources: { a: 'object' },
        output: { 'out': { transform: { from: 'sources.a.v', steps: [{ trim: true }, { lowercase: true }] } } },
      },
      sources: { a: { v: '  HELLO  ' } },
    });
    ok(r); assert.equal(r.result.out, 'hello');
  });

  test('путь не разрешился → поле не создаётся', () => {
    const r = engine.run({
      definition: {
        mappingId: 'test', sources: { a: 'object' },
        output: { 'out': { transform: { from: 'sources.a.missing', steps: [{ trim: true }, { uppercase: true }] } } },
      },
      sources: { a: {} },
    });
    ok(r); assert.equal(r.result.out, undefined);
  });

  test('значение null → поле не создаётся', () => {
    const r = engine.run({
      definition: {
        mappingId: 'test', sources: { a: 'object' },
        output: { 'out': { transform: { from: 'sources.a.v', steps: [{ trim: true }, { uppercase: true }] } } },
      },
      sources: { a: { v: null } },
    });
    ok(r); assert.equal(r.result.out, undefined);
  });

  test('обрыв цепочки на первом шаге: не-строка на строковом операторе', () => {
    const r = engine.run({
      definition: {
        mappingId: 'test', sources: { a: 'object' },
        output: { 'out': { transform: { from: 'sources.a.v', steps: [{ trim: true }, { uppercase: true }] } } },
      },
      sources: { a: { v: 42 } },
    });
    ok(r); assert.equal(r.result.out, undefined);
  });

  test('обрыв цепочки на втором шаге: mapValue без fallback', () => {
    const r = engine.run({
      definition: {
        mappingId: 'test', sources: { a: 'object' },
        output: {
          'out': {
            transform: {
              from: 'sources.a.v',
              steps: [
                { trim: true },
                { mapValue: { map: { 'KNOWN': 'ok' } } },
              ],
            },
          },
        },
      },
      sources: { a: { v: '  UNKNOWN  ' } },
    });
    ok(r); assert.equal(r.result.out, undefined);
  });

  test('mapValue passthrough передаёт значение следующему шагу', () => {
    const r = engine.run({
      definition: {
        mappingId: 'test', sources: { a: 'object' },
        output: {
          'out': {
            transform: {
              from: 'sources.a.v',
              steps: [
                { mapValue: { map: { 'OLD': 'NEW' }, fallback: 'passthrough' } },
                { uppercase: true },
              ],
            },
          },
        },
      },
      sources: { a: { v: 'existing' } },
    });
    ok(r); assert.equal(r.result.out, 'EXISTING');
  });

  test('mapValue с fallback: null в конце цепочки создаёт поле с null', () => {
    const r = engine.run({
      definition: {
        mappingId: 'test', sources: { a: 'object' },
        output: {
          'out': {
            transform: {
              from: 'sources.a.v',
              steps: [
                { trim: true },
                { mapValue: { map: { 'KNOWN': 'ok' }, fallback: null } },
              ],
            },
          },
        },
      },
      sources: { a: { v: 'UNKNOWN' } },
    });
    ok(r);
    assert.equal(r.result.out, null);
    assert.ok(Object.prototype.hasOwnProperty.call(r.result, 'out'));
  });

  test('steps меньше 2 → INVALID_ARGS', () => {
    err(engine.validate({
      mappingId: 'x', sources: { a: 'object' },
      output: { 'x': { transform: { from: 'sources.a.f', steps: [{ trim: true }] } } },
    }), 'INVALID_ARGS');
  });

  test('steps больше 8 → INVALID_ARGS', () => {
    err(engine.validate({
      mappingId: 'x', sources: { a: 'object' },
      output: {
        'x': {
          transform: {
            from: 'sources.a.f',
            steps: [
              { trim: true }, { lowercase: true }, { uppercase: true }, { normalizeSpaces: true },
              { trim: true }, { lowercase: true }, { uppercase: true }, { normalizeSpaces: true },
              { trim: true },
            ],
          },
        },
      },
    }), 'INVALID_ARGS');
  });

  test('отсутствует from → INVALID_ARGS', () => {
    err(engine.validate({
      mappingId: 'x', sources: { a: 'object' },
      output: { 'x': { transform: { steps: [{ trim: true }, { uppercase: true }] } } },
    }), 'INVALID_ARGS');
  });

  test('строковый шаг с аргументом не true → INVALID_ARGS', () => {
    err(engine.validate({
      mappingId: 'x', sources: { a: 'object' },
      output: { 'x': { transform: { from: 'sources.a.f', steps: [{ trim: {} }, { uppercase: true }] } } },
    }), 'INVALID_ARGS');
  });

  test('шаг mapValue с from → INVALID_ARGS (шаговая форма не допускает from)', () => {
    err(engine.validate({
      mappingId: 'x', sources: { a: 'object' },
      output: {
        'x': {
          transform: {
            from: 'sources.a.f',
            steps: [
              { trim: true },
              { mapValue: { from: 'sources.a.f', map: { 'a': 'b' } } },
            ],
          },
        },
      },
    }), 'INVALID_ARGS');
  });

  test('неизвестный шаговый оператор → INVALID_ARGS', () => {
    err(engine.validate({
      mappingId: 'x', sources: { a: 'object' },
      output: { 'x': { transform: { from: 'sources.a.f', steps: [{ trim: true }, { reverse: true }] } } },
    }), 'INVALID_ARGS');
  });

  test('from нельзя комбинировать с transform → INVALID_MAPPING_SCHEMA', () => {
    err(engine.validate({
      mappingId: 'x', sources: { a: 'object' },
      output: { 'x': { from: 'sources.a.f', transform: { from: 'sources.a.f', steps: [{ trim: true }, { uppercase: true }] } } },
    }), 'INVALID_MAPPING_SCHEMA');
  });
});

// ---------------------------------------------------------------------------
// Целевой путь — построение вложенных объектов
// ---------------------------------------------------------------------------

describe('целевой путь — построение вложенных объектов', () => {
  test('точечная нотация строит вложенные объекты', () => {
    const r = engine.run({
      definition: {
        mappingId: 'test', sources: { a: 'object' },
        output: {
          'validation.status': { from: 'sources.a.s' },
          'validation.hasErrors': { equals: ['sources.a.s', 'ERROR'] },
          'meta.source': { literal: '@processengine/mappings' },
        },
      },
      sources: { a: { s: 'ERROR' } },
    });
    ok(r);
    assert.deepEqual(r.result, {
      validation: { status: 'ERROR', hasErrors: true },
      meta: { source: '@processengine/mappings' },
    });
  });

  test('частичный результат — SUCCESS когда часть путей не разрешилась', () => {
    const r = engine.run({
      definition: {
        mappingId: 'test', sources: { a: 'object' },
        output: {
          'present': { from: 'sources.a.x' },
          'absent': { from: 'sources.a.missing' },
        },
      },
      sources: { a: { x: 'found' } },
    });
    ok(r);
    assert.equal(r.result.present, 'found');
    assert.equal(r.result.absent, undefined);
  });
});

// ---------------------------------------------------------------------------
// Трассировка
// ---------------------------------------------------------------------------

describe('трассировка', () => {
  test('trace не включается по умолчанию', () => {
    const r = engine.run({
      definition: { mappingId: 'test', sources: { a: 'object' }, output: { 'x': { from: 'sources.a.f' } } },
      sources: { a: { f: 1 } },
    });
    ok(r);
    assert.equal(r.trace, undefined);
  });

  test('trace: true возвращает массив записей', () => {
    const r = engine.run({
      definition: { mappingId: 'test', sources: { a: 'object' }, output: { 'x': { from: 'sources.a.f' } } },
      sources: { a: { f: 1 } },
      trace: true,
    });
    ok(r);
    assert.ok(Array.isArray(r.trace));
    assert.equal(r.trace.length, 1);
  });

  test('trace: запись содержит outputCreated', () => {
    const r = engine.run({
      definition: { mappingId: 'test', sources: { a: 'object' }, output: { 'x': { from: 'sources.a.f' } } },
      sources: { a: { f: 1 } },
      trace: true,
    });
    ok(r);
    assert.equal(typeof r.trace[0].outputCreated, 'boolean');
  });

  test('trace: строковый оператор содержит inputValue и outputValue', () => {
    const r = engine.run({
      definition: { mappingId: 'test', sources: { a: 'object' }, output: { 'x': { trim: 'sources.a.f' } } },
      sources: { a: { f: '  hello  ' } },
      trace: true,
    });
    ok(r);
    assert.equal(r.trace[0].inputValue, '  hello  ');
    assert.equal(r.trace[0].outputValue, 'hello');
  });

  test('trace: mapValue содержит matched: true при нахождении ключа', () => {
    const r = engine.run({
      definition: {
        mappingId: 'test', sources: { a: 'object' },
        output: { 'x': { mapValue: { from: 'sources.a.f', map: { 'RUR': 'RUB' } } } },
      },
      sources: { a: { f: 'RUR' } },
      trace: true,
    });
    ok(r);
    assert.equal(r.trace[0].matched, true);
  });

  test('trace: transform содержит массив steps', () => {
    const r = engine.run({
      definition: {
        mappingId: 'test', sources: { a: 'object' },
        output: {
          'x': {
            transform: {
              from: 'sources.a.f',
              steps: [{ trim: true }, { uppercase: true }],
            },
          },
        },
      },
      sources: { a: { f: '  hello  ' } },
      trace: true,
    });
    ok(r);
    assert.ok(Array.isArray(r.trace[0].steps));
    assert.equal(r.trace[0].steps.length, 2);
  });

  test('trace: обрыв цепочки — steps частично, reason: chain_stopped', () => {
    const r = engine.run({
      definition: {
        mappingId: 'test', sources: { a: 'object' },
        output: {
          'x': {
            transform: {
              from: 'sources.a.f',
              steps: [{ trim: true }, { mapValue: { map: { 'KNOWN': 'ok' } } }],
            },
          },
        },
      },
      sources: { a: { f: '  UNKNOWN  ' } },
      trace: true,
    });
    ok(r);
    const entry = r.trace[0];
    assert.equal(entry.outputCreated, false);
    assert.equal(entry.reason, 'chain_stopped');
    assert.equal(entry.steps.length, 2);
    assert.equal(entry.steps[0].applied, true);
    assert.equal(entry.steps[1].applied, false);
    assert.equal(entry.steps[1].stoppedChain, true);
    assert.equal(entry.steps[1].reason, 'no_match');
  });

  test('validate() никогда не возвращает trace', () => {
    const r = engine.validate({
      mappingId: 'test', sources: { a: 'object' },
      output: { 'x': { from: 'sources.a.f' } },
    });
    ok(r);
    assert.equal(r.trace, undefined);
  });
});

// ---------------------------------------------------------------------------
// Не-JSON значения — литералы
// ---------------------------------------------------------------------------

describe('не-JSON значения — литералы', () => {
  const def = (v) => ({ mappingId: 'test', sources: {}, output: { 'x': { literal: v } } });

  test('literal: NaN → INVALID_ARGS', () => { err(engine.validate(def(NaN)), 'INVALID_ARGS'); });
  test('literal: Infinity → INVALID_ARGS', () => { err(engine.validate(def(Infinity)), 'INVALID_ARGS'); });
  test('literal: функция → INVALID_ARGS', () => { err(engine.validate(def(() => {})), 'INVALID_ARGS'); });
  test('literal: объект → INVALID_ARGS', () => { err(engine.validate(def({ a: 1 })), 'INVALID_ARGS'); });
  test('literal: конечное число → валидно', () => { ok(engine.validate(def(42))); });
  test('literal: 0 → валидно', () => { ok(engine.validate(def(0))); });
});

// ---------------------------------------------------------------------------
// Не-JSON значения — источники во время выполнения
// ---------------------------------------------------------------------------

describe('не-JSON значения — источники во время выполнения', () => {
  const validDef = {
    mappingId: 'test', sources: { a: 'object' },
    output: { 'x': { from: 'sources.a.field' } },
  };

  test('источник содержит Date → INVALID_SOURCE_CONTENT', () => {
    err(engine.run({ definition: validDef, sources: { a: { field: new Date() } } }), 'INVALID_SOURCE_CONTENT');
  });

  test('источник содержит Map → INVALID_SOURCE_CONTENT', () => {
    err(engine.run({ definition: validDef, sources: { a: { field: new Map() } } }), 'INVALID_SOURCE_CONTENT');
  });

  test('источник содержит циклическую ссылку → INVALID_SOURCE_CONTENT', () => {
    const obj = { field: {} };
    obj.field.self = obj.field;
    err(engine.run({ definition: validDef, sources: { a: obj } }), 'INVALID_SOURCE_CONTENT');
  });

  test('источник содержит NaN → INVALID_SOURCE_CONTENT', () => {
    err(engine.run({ definition: validDef, sources: { a: { field: NaN } } }), 'INVALID_SOURCE_CONTENT');
  });

  test('источник содержит Infinity → INVALID_SOURCE_CONTENT', () => {
    err(engine.run({ definition: validDef, sources: { a: { field: Infinity } } }), 'INVALID_SOURCE_CONTENT');
  });

  test('источник: экземпляр класса на верхнем уровне → INVALID_SOURCE_TYPE', () => {
    class Foo { constructor() { this.x = 1; } }
    err(engine.run({ definition: validDef, sources: { a: new Foo() } }), 'INVALID_SOURCE_TYPE');
  });

  test('корректный источник с массивами и объектами проходит', () => {
    const r = engine.run({
      definition: { ...validDef, output: { 'x': { from: 'sources.a.items' } } },
      sources: { a: { items: [{ id: 1 }, { id: 2 }] } },
    });
    ok(r);
    assert.deepEqual(r.result.x, [{ id: 1 }, { id: 2 }]);
  });
});

// ---------------------------------------------------------------------------
// isPlainObject — структура описания
// ---------------------------------------------------------------------------

describe('isPlainObject — структура описания', () => {
  test('описание является экземпляром Date → INVALID_MAPPING_SCHEMA', () => {
    err(engine.validate(new Date()), 'INVALID_MAPPING_SCHEMA');
  });

  test('описание является массивом → INVALID_MAPPING_SCHEMA', () => {
    err(engine.validate([]), 'INVALID_MAPPING_SCHEMA');
  });
});
