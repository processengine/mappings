'use strict';

const { resolvePath, setTargetPath, deepCopy } = require('./path.js');

// ---------------------------------------------------------------------------
// Точка входа выполнения
// ---------------------------------------------------------------------------

/**
 * Выполняет проверенное описание маппинга для заданных источников.
 *
 * @param {object}  definition - Проверенное описание маппинга.
 * @param {object}  sources    - Словарь: имя источника → plain-объект.
 * @param {boolean} withTrace  - Собирать ли трассировку выполнения.
 * @returns {{ result: object, trace: Array|null }}
 */
function execute(definition, sources, withTrace) {
  const result = {};
  const trace = withTrace ? [] : null;

  for (const [targetPath, rule] of Object.entries(definition.output)) {
    const op = Object.keys(rule)[0];
    const args = rule[op];

    const { outputCreated, outputValue, traceEntry } =
      applyOperator(op, args, sources, targetPath, withTrace);

    if (outputCreated) {
      setTargetPath(result, targetPath, outputValue);
    }

    if (withTrace && traceEntry) {
      traceEntry.outputCreated = outputCreated;
      if (outputCreated) traceEntry.outputValue = outputValue;
      trace.push(traceEntry);
    }
  }

  return { result, trace };
}

// ---------------------------------------------------------------------------
// Диспетчер операторов
// ---------------------------------------------------------------------------

function applyOperator(op, args, sources, targetPath, withTrace) {
  switch (op) {
    // v1
    case 'from':            return applyFrom(args, sources, targetPath, withTrace);
    case 'literal':         return applyLiteral(args, targetPath, withTrace);
    case 'exists':          return applyExists(args, sources, targetPath, withTrace);
    case 'equals':          return applyEquals(args, sources, targetPath, withTrace);
    case 'coalesce':        return applyCoalesce(args, sources, targetPath, withTrace);
    // v2 строковые
    case 'trim':
    case 'lowercase':
    case 'uppercase':
    case 'normalizeSpaces':
    case 'removeNonDigits': return applyStringOp(op, args, sources, targetPath, withTrace);
    // v2 словарная канонизация
    case 'mapValue':        return applyMapValue(args, sources, targetPath, withTrace);
    // v2 цепочка
    case 'transform':       return applyTransform(args, sources, targetPath, withTrace);
    default:
      // Сюда не должны попасть после валидации
      return { outputCreated: false, outputValue: undefined, traceEntry: null };
  }
}

// ---------------------------------------------------------------------------
// v1: from
// ---------------------------------------------------------------------------

function applyFrom(pathStr, sources, targetPath, withTrace) {
  const resolution = resolvePath(sources, pathStr);
  const traceEntry = withTrace
    ? { target: targetPath, op: 'from', from: pathStr, resolved: resolution.resolved }
    : null;

  if (!resolution.resolved) {
    return { outputCreated: false, outputValue: undefined, traceEntry };
  }

  return { outputCreated: true, outputValue: deepCopy(resolution.value), traceEntry };
}

// ---------------------------------------------------------------------------
// v1: literal
// ---------------------------------------------------------------------------

function applyLiteral(value, targetPath, withTrace) {
  const traceEntry = withTrace
    ? { target: targetPath, op: 'literal', literal: value }
    : null;
  return { outputCreated: true, outputValue: value, traceEntry };
}

// ---------------------------------------------------------------------------
// v1: exists
// ---------------------------------------------------------------------------

function applyExists(pathStr, sources, targetPath, withTrace) {
  const resolution = resolvePath(sources, pathStr);
  const exists = resolution.resolved && resolution.value !== null;

  const traceEntry = withTrace
    ? {
        target: targetPath,
        op: 'exists',
        from: pathStr,
        resolved: resolution.resolved,
        ...(resolution.resolved ? { inputValue: resolution.value } : {}),
      }
    : null;

  return { outputCreated: true, outputValue: exists, traceEntry };
}

// ---------------------------------------------------------------------------
// v1: equals
// ---------------------------------------------------------------------------

function applyEquals(args, sources, targetPath, withTrace) {
  const [pathStr, literal] = args;
  const resolution = resolvePath(sources, pathStr);
  const equal = resolution.resolved && resolution.value === literal;

  const traceEntry = withTrace
    ? {
        target: targetPath,
        op: 'equals',
        from: pathStr,
        resolved: resolution.resolved,
        ...(resolution.resolved ? { inputValue: resolution.value } : {}),
        expected: literal,
      }
    : null;

  return { outputCreated: true, outputValue: equal, traceEntry };
}

// ---------------------------------------------------------------------------
// v1: coalesce
// ---------------------------------------------------------------------------

function applyCoalesce(candidates, sources, targetPath, withTrace) {
  const traceCandidates = withTrace ? [] : null;
  let selectedIndex = -1;
  let selectedKind = null;
  let selectedValue;

  for (let i = 0; i < candidates.length; i++) {
    const cand = candidates[i];

    if ('path' in cand) {
      const resolution = resolvePath(sources, cand.path);
      if (traceCandidates) {
        const tc = { kind: 'path', path: cand.path, resolved: resolution.resolved };
        if (resolution.resolved) tc.value = resolution.value;
        traceCandidates.push(tc);
      }
      if (resolution.resolved && resolution.value !== null) {
        selectedIndex = i;
        selectedKind = 'path';
        selectedValue = deepCopy(resolution.value);
        break;
      }
    } else {
      // Литеральный кандидат — всегда совпадает
      if (traceCandidates) {
        traceCandidates.push({ kind: 'literal', value: cand.literal });
      }
      selectedIndex = i;
      selectedKind = 'literal';
      selectedValue = cand.literal;
      break;
    }
  }

  const traceEntry = withTrace
    ? {
        target: targetPath,
        op: 'coalesce',
        candidates: traceCandidates,
        ...(selectedIndex >= 0 ? { selectedIndex, selectedKind } : {}),
      }
    : null;

  if (selectedIndex >= 0) {
    return { outputCreated: true, outputValue: selectedValue, traceEntry };
  }
  return { outputCreated: false, outputValue: undefined, traceEntry };
}

// ---------------------------------------------------------------------------
// v2: строковые операторы (корневая форма)
// ---------------------------------------------------------------------------

/**
 * Применяет строковое преобразование, взяв значение по исходному пути.
 * Поле не создаётся, если: путь не разрешился, значение null, значение не строка.
 */
function applyStringOp(op, pathStr, sources, targetPath, withTrace) {
  const resolution = resolvePath(sources, pathStr);

  // Определяем причину невозможности выполнить операцию
  let reason = null;
  if (!resolution.resolved) {
    reason = 'path_unresolved';
  } else if (resolution.value === null) {
    reason = 'null_value';
  } else if (typeof resolution.value !== 'string') {
    reason = 'type_mismatch';
  }

  if (reason) {
    const traceEntry = withTrace
      ? {
          target: targetPath,
          op,
          from: pathStr,
          resolved: resolution.resolved,
          reason,
        }
      : null;
    return { outputCreated: false, outputValue: undefined, traceEntry };
  }

  const outputValue = applyStringTransform(op, resolution.value);
  const traceEntry = withTrace
    ? {
        target: targetPath,
        op,
        from: pathStr,
        resolved: true,
        inputValue: resolution.value,
        outputValue,
      }
    : null;
  return { outputCreated: true, outputValue, traceEntry };
}

/**
 * Чистая строковая трансформация без побочных эффектов.
 * Вызывается только при гарантии, что входное значение является строкой.
 */
function applyStringTransform(op, str) {
  switch (op) {
    case 'trim':             return str.trim();
    case 'lowercase':        return str.toLowerCase();
    case 'uppercase':        return str.toUpperCase();
    case 'normalizeSpaces':  return str.trim().replace(/\s+/g, ' ');
    case 'removeNonDigits':  return str.replace(/[^0-9]/g, '');
    default:                 return str;
  }
}

// ---------------------------------------------------------------------------
// v2: mapValue (корневая форма)
// ---------------------------------------------------------------------------

/**
 * Ищет строковое значение источника в словаре и возвращает канонизированное значение.
 * Не выполняет неявного приведения типов: только строковое значение проходит поиск.
 */
function applyMapValue(args, sources, targetPath, withTrace) {
  const { from: pathStr, map, fallback } = args;
  const resolution = resolvePath(sources, pathStr);

  // Определяем причину невозможности выполнить операцию
  let reason = null;
  if (!resolution.resolved) {
    reason = 'path_unresolved';
  } else if (resolution.value === null) {
    reason = 'null_value';
  } else if (typeof resolution.value !== 'string') {
    reason = 'type_mismatch';
  }

  if (reason) {
    const traceEntry = withTrace
      ? {
          target: targetPath,
          op: 'mapValue',
          from: pathStr,
          resolved: resolution.resolved,
          reason,
        }
      : null;
    return { outputCreated: false, outputValue: undefined, traceEntry };
  }

  const key = resolution.value;

  // Ключ найден в словаре
  if (Object.prototype.hasOwnProperty.call(map, key)) {
    const outputValue = map[key];
    const traceEntry = withTrace
      ? {
          target: targetPath,
          op: 'mapValue',
          from: pathStr,
          resolved: true,
          inputValue: key,
          matched: true,
          outputValue,
        }
      : null;
    return { outputCreated: true, outputValue, traceEntry };
  }

  // Ключ не найден — применяем fallback
  return applyMapValueFallback({ fallback, inputValue: key, targetPath, withTrace, pathStr });
}

/**
 * Обрабатывает ситуацию, когда ключ не найден в словаре mapValue.
 * Используется как корневым оператором, так и шаговым исполнителем.
 */
function applyMapValueFallback({ fallback, inputValue, targetPath, withTrace, pathStr }) {
  // fallback не задан → поле не создаётся
  if (fallback === undefined) {
    const traceEntry = withTrace
      ? {
          target: targetPath,
          op: 'mapValue',
          ...(pathStr !== undefined ? { from: pathStr } : {}),
          resolved: true,
          inputValue,
          matched: false,
          fallbackApplied: false,
        }
      : null;
    return { outputCreated: false, outputValue: undefined, traceEntry };
  }

  // passthrough — вернуть исходное значение без изменений
  if (fallback === 'passthrough') {
    const traceEntry = withTrace
      ? {
          target: targetPath,
          op: 'mapValue',
          ...(pathStr !== undefined ? { from: pathStr } : {}),
          resolved: true,
          inputValue,
          matched: false,
          fallbackApplied: true,
          fallbackKind: 'passthrough',
          outputValue: inputValue,
        }
      : null;
    return { outputCreated: true, outputValue: inputValue, traceEntry };
  }

  // JSON-safe literal в качестве fallback
  const traceEntry = withTrace
    ? {
        target: targetPath,
        op: 'mapValue',
        ...(pathStr !== undefined ? { from: pathStr } : {}),
        resolved: true,
        inputValue,
        matched: false,
        fallbackApplied: true,
        fallbackKind: 'literal',
        outputValue: fallback,
      }
    : null;
  return { outputCreated: true, outputValue: fallback, traceEntry };
}

// ---------------------------------------------------------------------------
// v2: transform — цепочка преобразований
// ---------------------------------------------------------------------------

/**
 * Выполняет последовательность шагов над значением из источника.
 * transform является самостоятельным корневым оператором.
 * Цепочка прерывается при первом шаге с outputCreated = false.
 */
function applyTransform(args, sources, targetPath, withTrace) {
  const { from: pathStr, steps } = args;
  const resolution = resolvePath(sources, pathStr);

  // Путь не разрешился или значение null — цепочка не запускается
  if (!resolution.resolved || resolution.value === null) {
    const reason = !resolution.resolved ? 'path_unresolved' : 'null_value';
    const traceEntry = withTrace
      ? {
          target: targetPath,
          op: 'transform',
          from: pathStr,
          resolved: resolution.resolved,
          reason,
        }
      : null;
    return { outputCreated: false, outputValue: undefined, traceEntry };
  }

  const initialValue = resolution.value;
  let currentValue = initialValue;
  const traceSteps = withTrace ? [] : null;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stepOp = Object.keys(step)[0];
    const stepArgs = step[stepOp];

    const stepResult = applyTransformStep(stepOp, stepArgs, currentValue, withTrace, targetPath);

    if (traceSteps) {
      traceSteps.push(stepResult.traceStep);
    }

    if (!stepResult.continues) {
      // Цепочка прервалась
      const traceEntry = withTrace
        ? {
            target: targetPath,
            op: 'transform',
            from: pathStr,
            resolved: true,
            inputValue: initialValue,
            steps: traceSteps,
            reason: 'chain_stopped',
          }
        : null;
      return { outputCreated: false, outputValue: undefined, traceEntry };
    }

    currentValue = stepResult.value;
  }

  // Все шаги выполнены
  const traceEntry = withTrace
    ? {
        target: targetPath,
        op: 'transform',
        from: pathStr,
        resolved: true,
        inputValue: initialValue,
        steps: traceSteps,
        outputValue: currentValue,
      }
    : null;
  return { outputCreated: true, outputValue: currentValue, traceEntry };
}

/**
 * Выполняет один шаг цепочки transform.
 * Возвращает { continues: boolean, value?, traceStep }.
 */
function applyTransformStep(stepOp, stepArgs, currentValue, withTrace, targetPath) {
  // Строковые флажковые шаги
  if (['trim', 'lowercase', 'uppercase', 'normalizeSpaces', 'removeNonDigits'].includes(stepOp)) {
    if (typeof currentValue !== 'string') {
      const traceStep = withTrace
        ? { op: stepOp, in: currentValue, applied: false, stoppedChain: true, reason: 'type_mismatch' }
        : null;
      return { continues: false, traceStep };
    }
    const out = applyStringTransform(stepOp, currentValue);
    const traceStep = withTrace
      ? { op: stepOp, in: currentValue, out, applied: true }
      : null;
    return { continues: true, value: out, traceStep };
  }

  // mapValue в шаговой форме
  if (stepOp === 'mapValue') {
    const { map, fallback } = stepArgs;

    // Нет неявного приведения типов — только строка
    if (typeof currentValue !== 'string') {
      const traceStep = withTrace
        ? { op: 'mapValue', in: currentValue, applied: false, stoppedChain: true, reason: 'type_mismatch' }
        : null;
      return { continues: false, traceStep };
    }

    // Ключ найден
    if (Object.prototype.hasOwnProperty.call(map, currentValue)) {
      const out = map[currentValue];
      const traceStep = withTrace
        ? { op: 'mapValue', in: currentValue, out, applied: true, matched: true }
        : null;
      return { continues: true, value: out, traceStep };
    }

    // Ключ не найден — применяем fallback
    if (fallback === undefined) {
      const traceStep = withTrace
        ? { op: 'mapValue', in: currentValue, applied: false, stoppedChain: true, reason: 'no_match', matched: false }
        : null;
      return { continues: false, traceStep };
    }
    if (fallback === 'passthrough') {
      const traceStep = withTrace
        ? { op: 'mapValue', in: currentValue, out: currentValue, applied: true, matched: false, fallbackKind: 'passthrough' }
        : null;
      return { continues: true, value: currentValue, traceStep };
    }
    // JSON-safe literal
    const traceStep = withTrace
      ? { op: 'mapValue', in: currentValue, out: fallback, applied: true, matched: false, fallbackKind: 'literal' }
      : null;
    return { continues: true, value: fallback, traceStep };
  }

  // Сюда не должны попасть после валидации
  return { continues: false, traceStep: null };
}

module.exports = { execute };
