import { deepCopy, setTargetPath } from './path.js';

function scalarToString(value, context) {
  if (value === null || typeof value === 'undefined') return { ok: true, empty: true, value: null };
  const t = typeof value;
  if (t === 'string') return { ok: true, empty: value.trim() === '', value };
  if (t === 'number') {
    if (!Number.isFinite(value)) return { ok: false, message: `${context} must be scalar JSON-safe string/number/boolean/null` };
    return { ok: true, empty: false, value: String(value) };
  }
  if (t === 'boolean') return { ok: true, empty: false, value: String(value) };
  return { ok: false, message: `${context} must be scalar JSON-safe string/number/boolean/null` };
}

function evalExpression(expr, sources) {
  switch (expr.kind) {
    case 'from': {
      const resolution = expr.accessor.resolve(sources);
      return { resolved: resolution.resolved, value: resolution.resolved ? deepCopy(resolution.value) : null, empty: !resolution.resolved || resolution.value === null };
    }
    case 'literal':
      return { resolved: true, value: expr.value, empty: expr.value === null };
    case 'coalesce': {
      const candidates = [];
      for (let i = 0; i < expr.candidates.length; i++) {
        const result = evalExpression(expr.candidates[i], sources);
        candidates.push({ index: i, resolved: result.resolved, empty: result.empty });
        if (result.resolved && result.value !== null && typeof result.value !== 'undefined') {
          return { resolved: true, value: result.value, empty: false, candidates, selectedIndex: i };
        }
      }
      return { resolved: false, value: null, empty: true, candidates, selectedIndex: null };
    }
    case 'joinNonEmpty': {
      const parts = [];
      let emptyItemCount = 0;
      for (const item of expr.items) {
        const result = evalExpression(item, sources);
        if (!result.resolved || result.value === null || typeof result.value === 'undefined') {
          emptyItemCount += 1;
          continue;
        }
        const scalar = scalarToString(result.value, 'joinNonEmpty item result');
        if (!scalar.ok) throw new TypeError(scalar.message);
        let value = scalar.value;
        if (expr.trimItems && typeof value === 'string') value = value.trim();
        if (value === '') {
          emptyItemCount += 1;
          continue;
        }
        parts.push(value);
      }
      let joined = parts.join(expr.separator);
      if (expr.trimResult) joined = joined.trim();
      if (joined === '' && expr.emptyAsNull) joined = null;
      return {
        resolved: true,
        value: joined,
        empty: joined === null || joined === '',
        details: { itemsCount: expr.items.length, selectedItemsCount: parts.length, emptyItemCount },
      };
    }
    case 'template': {
      const values = new Map();
      let missingVarsCount = 0;
      for (const token of expr.tokens) {
        if (token.type !== 'var' || values.has(token.name)) continue;
        const result = evalExpression(token.expression, sources);
        if (!result.resolved || result.value === null || typeof result.value === 'undefined') {
          missingVarsCount += 1;
          values.set(token.name, '');
          continue;
        }
        const scalar = scalarToString(result.value, `template var "${token.name}" result`);
        if (!scalar.ok) throw new TypeError(scalar.message);
        const value = typeof scalar.value === 'string' ? scalar.value.trim() : scalar.value;
        if (value === '') missingVarsCount += 1;
        values.set(token.name, value);
      }
      if (expr.skipIfAnyVarEmpty && missingVarsCount > 0) {
        return { resolved: true, value: null, empty: true, details: { varsCount: Object.keys(expr.vars).length, missingVarsCount } };
      }
      let rendered = '';
      for (const token of expr.tokens) {
        rendered += token.type === 'literal' ? token.value : (values.get(token.name) ?? '');
      }
      if (expr.trimResult) rendered = rendered.trim();
      if (rendered === '' && expr.emptyAsNull) rendered = null;
      return { resolved: true, value: rendered, empty: rendered === null || rendered === '', details: { varsCount: Object.keys(expr.vars).length, missingVarsCount } };
    }
    default:
      throw new TypeError(`Unsupported compiled expression kind: ${expr.kind}`);
  }
}

function runExpressionRule(rule, sources) {
  const result = evalExpression(rule.expression, sources);
  return {
    outputCreated: result.resolved,
    outputValue: result.resolved ? result.value : undefined,
    traceEntry: {
      kind: 'mapping.rule',
      target: rule.targetPath,
      operator: rule.op,
      outcome: result.resolved ? 'applied' : 'skipped',
      details: {
        resultType: result.value === null ? 'null' : typeof result.value,
        resultIsEmpty: Boolean(result.empty),
        ...(result.details ?? {}),
        ...(typeof result.selectedIndex !== 'undefined' ? { selectedIndex: result.selectedIndex } : {}),
      },
      output: result.resolved ? result.value : undefined,
    },
  };
}

function applyStringTransform(op, str) {
  switch (op) {
    case 'trim': return str.trim();
    case 'lowercase': return str.toLowerCase();
    case 'uppercase': return str.toUpperCase();
    case 'normalizeSpaces': return str.trim().replace(/\s+/g, ' ');
    case 'removeNonDigits': return str.replace(/[^0-9]/g, '');
    default: return str;
  }
}

function runLegacyRule(rule, sources) {
  switch (rule.op) {
    case 'from': {
      const resolution = rule.accessor.resolve(sources);
      return {
        outputCreated: resolution.resolved,
        outputValue: resolution.resolved ? deepCopy(resolution.value) : undefined,
        traceEntry: {
          kind: 'mapping.rule',
          target: rule.targetPath,
          operator: 'from',
          from: rule.accessor.path,
          resolved: resolution.resolved,
          outcome: resolution.resolved ? 'applied' : 'skipped',
        },
      };
    }
    case 'literal':
      return {
        outputCreated: true,
        outputValue: rule.value,
        traceEntry: { kind: 'mapping.rule', target: rule.targetPath, operator: 'literal', outcome: 'applied' },
      };
    case 'exists': {
      const resolution = rule.accessor.resolve(sources);
      return {
        outputCreated: true,
        outputValue: resolution.resolved && resolution.value !== null,
        traceEntry: { kind: 'mapping.rule', target: rule.targetPath, operator: 'exists', from: rule.accessor.path, resolved: resolution.resolved, outcome: 'applied' },
      };
    }
    case 'equals': {
      const resolution = rule.accessor.resolve(sources);
      return {
        outputCreated: true,
        outputValue: resolution.resolved && resolution.value === rule.expected,
        traceEntry: { kind: 'mapping.rule', target: rule.targetPath, operator: 'equals', from: rule.accessor.path, resolved: resolution.resolved, outcome: 'applied' },
      };
    }
    case 'coalesce': {
      let selected = null;
      const candidates = [];
      for (let i = 0; i < rule.candidates.length; i++) {
        const cand = rule.candidates[i];
        if (cand.kind === 'path') {
          const resolution = cand.accessor.resolve(sources);
          candidates.push({ kind: 'path', path: cand.path, resolved: resolution.resolved });
          if (resolution.resolved && resolution.value !== null) {
            selected = { index: i, kind: 'path', value: deepCopy(resolution.value) };
            break;
          }
        } else {
          candidates.push({ kind: 'literal' });
          selected = { index: i, kind: 'literal', value: cand.value };
          break;
        }
      }
      return {
        outputCreated: Boolean(selected),
        outputValue: selected ? selected.value : undefined,
        traceEntry: {
          kind: 'mapping.rule',
          target: rule.targetPath,
          operator: 'coalesce',
          selectedIndex: selected?.index ?? null,
          selectedKind: selected?.kind ?? null,
          outcome: selected ? 'applied' : 'skipped',
          candidates,
        },
      };
    }
    case 'mapValue': {
      const resolution = rule.accessor.resolve(sources);
      if (!resolution.resolved || resolution.value === null) {
        return {
          outputCreated: false,
          outputValue: undefined,
          traceEntry: { kind: 'mapping.rule', target: rule.targetPath, operator: 'mapValue', from: rule.accessor.path, resolved: resolution.resolved, reason: resolution.resolved ? 'null_value' : 'path_unresolved', outcome: 'skipped' },
        };
      }
      const lookupKey = typeof resolution.value === 'string' ? resolution.value : String(resolution.value);
      if (Object.prototype.hasOwnProperty.call(rule.map, lookupKey)) {
        return {
          outputCreated: true,
          outputValue: rule.map[lookupKey],
          traceEntry: { kind: 'mapping.rule', target: rule.targetPath, operator: 'mapValue', from: rule.accessor.path, matched: true, outcome: 'applied' },
        };
      }
      if (typeof rule.fallback === 'undefined') {
        return {
          outputCreated: false,
          outputValue: undefined,
          traceEntry: { kind: 'mapping.rule', target: rule.targetPath, operator: 'mapValue', from: rule.accessor.path, matched: false, reason: 'no_match', outcome: 'skipped' },
        };
      }
      const value = rule.fallback === 'passthrough' ? deepCopy(resolution.value) : rule.fallback;
      return {
        outputCreated: true,
        outputValue: value,
        traceEntry: { kind: 'mapping.rule', target: rule.targetPath, operator: 'mapValue', from: rule.accessor.path, matched: false, fallbackApplied: true, fallbackKind: rule.fallback === 'passthrough' ? 'passthrough' : 'literal', outcome: 'applied' },
      };
    }
    case 'transform': {
      const resolution = rule.accessor.resolve(sources);
      if (!resolution.resolved || resolution.value === null) {
        return {
          outputCreated: false,
          outputValue: undefined,
          traceEntry: { kind: 'mapping.rule', target: rule.targetPath, operator: 'transform', from: rule.accessor.path, resolved: resolution.resolved, reason: resolution.resolved ? 'null_value' : 'path_unresolved', outcome: 'skipped' },
        };
      }
      let current = resolution.value;
      for (const step of rule.steps) {
        if (step.op === 'mapValue') {
          const lookupKey = typeof current === 'string' ? current : String(current);
          if (Object.prototype.hasOwnProperty.call(step.args.map, lookupKey)) current = step.args.map[lookupKey];
          else if (!Object.prototype.hasOwnProperty.call(step.args, 'fallback')) {
            return { outputCreated: false, outputValue: undefined, traceEntry: { kind: 'mapping.rule', target: rule.targetPath, operator: 'transform', from: rule.accessor.path, reason: 'chain_stopped', outcome: 'skipped' } };
          } else if (step.args.fallback !== 'passthrough') current = step.args.fallback;
        } else {
          if (typeof current !== 'string') {
            return { outputCreated: false, outputValue: undefined, traceEntry: { kind: 'mapping.rule', target: rule.targetPath, operator: 'transform', from: rule.accessor.path, reason: 'chain_stopped', outcome: 'skipped' } };
          }
          current = applyStringTransform(step.op, current);
        }
      }
      return { outputCreated: true, outputValue: deepCopy(current), traceEntry: { kind: 'mapping.rule', target: rule.targetPath, operator: 'transform', from: rule.accessor.path, outcome: 'applied' } };
    }
    case 'trim':
    case 'lowercase':
    case 'uppercase':
    case 'normalizeSpaces':
    case 'removeNonDigits': {
      const resolution = rule.accessor.resolve(sources);
      if (!resolution.resolved || resolution.value === null || typeof resolution.value !== 'string') {
        return {
          outputCreated: false,
          outputValue: undefined,
          traceEntry: { kind: 'mapping.rule', target: rule.targetPath, operator: rule.op, from: rule.accessor.path, resolved: resolution.resolved, reason: !resolution.resolved ? 'path_unresolved' : resolution.value === null ? 'null_value' : 'type_mismatch', outcome: 'skipped' },
        };
      }
      return {
        outputCreated: true,
        outputValue: applyStringTransform(rule.op, resolution.value),
        traceEntry: { kind: 'mapping.rule', target: rule.targetPath, operator: rule.op, from: rule.accessor.path, resolved: true, outcome: 'applied' },
      };
    }
    default:
      return { outputCreated: false, outputValue: undefined, traceEntry: null };
  }
}

function selectItems(rule, sources) {
  const selection = rule.selector.select(sources);
  if (!selection.resolved) {
    return { selectedItems: [], baseCount: 0, reason: selection.reason, selectedCount: 0 };
  }
  const base = selection.items;
  const filtered = rule.where ? base.filter((item) => rule.where.test(item)) : base;
  return { selectedItems: filtered, baseCount: base.length, selectedCount: filtered.length, reason: null };
}

function runAggregateRule(rule, sources) {
  const { selectedItems, baseCount, selectedCount, reason } = selectItems(rule, sources);
  const traceBase = {
    kind: 'mapping.aggregate',
    target: rule.targetPath,
    operator: rule.op,
    from: rule.selector.path,
    selectedCount,
    resultType: null,
    outcome: 'applied',
    details: {
      from: rule.selector.path,
      baseCount,
      selectedCount,
      hasWhere: Boolean(rule.where),
      hasMatch: Boolean(rule.match),
    },
  };

  if (reason) {
    traceBase.outcome = 'skipped';
    traceBase.details.reason = reason;
    if (rule.op === 'collect') return { outputCreated: true, outputValue: [], traceEntry: { ...traceBase, resultType: 'array', resultLength: 0 } };
    if (rule.op === 'count') return { outputCreated: true, outputValue: 0, traceEntry: { ...traceBase, resultType: 'number', resultValue: 0 } };
    if (rule.op === 'countAtLeast') return { outputCreated: true, outputValue: false, traceEntry: { ...traceBase, resultType: 'boolean', resultValue: false, details: { ...traceBase.details, threshold: rule.value } } };
    if (rule.op === 'containsValue') return { outputCreated: true, outputValue: false, traceEntry: { ...traceBase, resultType: 'boolean', resultValue: false, details: { ...traceBase.details, value: rule.value } } };
    if (rule.op === 'existsAny') return { outputCreated: true, outputValue: false, traceEntry: { ...traceBase, resultType: 'boolean', resultValue: false } };
    if (rule.op === 'existsAll') return { outputCreated: true, outputValue: true, traceEntry: { ...traceBase, resultType: 'boolean', resultValue: true } };
    if (rule.op === 'pickFirst') return { outputCreated: true, outputValue: null, traceEntry: { ...traceBase, resultType: 'null', picked: false } };
  }

  if (rule.op === 'collect') {
    const out = [];
    let droppedCount = 0;
    for (const item of selectedItems) {
      const resolution = rule.valueAccessor.resolve(item);
      if (!resolution.resolved) {
        droppedCount += 1;
        continue;
      }
      out.push(deepCopy(resolution.value));
    }
    return { outputCreated: true, outputValue: out, traceEntry: { ...traceBase, resultType: 'array', resultLength: out.length, droppedCount } };
  }

  if (rule.op === 'collectObject') {
    const out = [];
    let droppedCount = 0;
    let droppedFieldCount = 0;
    let partialObjectCount = 0;
    const totalFieldCount = Object.keys(rule.fieldAccessors).length;
    for (const item of selectedItems) {
      const obj = {};
      let resolvedFieldCount = 0;
      for (const [key, accessor] of Object.entries(rule.fieldAccessors)) {
        const resolution = accessor.resolve(item);
        if (!resolution.resolved) {
          droppedFieldCount += 1;
          continue;
        }
        obj[key] = deepCopy(resolution.value);
        resolvedFieldCount += 1;
      }
      if (resolvedFieldCount === 0) {
        droppedCount += 1;
        continue;
      }
      if (resolvedFieldCount < totalFieldCount) partialObjectCount += 1;
      out.push(obj);
    }
    return {
      outputCreated: true,
      outputValue: out,
      traceEntry: { ...traceBase, resultType: 'array', resultLength: out.length, droppedCount, droppedFieldCount, partialObjectCount },
    };
  }

  if (rule.op === 'count') {
    return { outputCreated: true, outputValue: selectedCount, traceEntry: { ...traceBase, resultType: 'number', resultValue: selectedCount } };
  }

  if (rule.op === 'countAtLeast') {
    const result = selectedCount >= rule.value;
    return { outputCreated: true, outputValue: result, traceEntry: { ...traceBase, resultType: 'boolean', resultValue: result, details: { ...traceBase.details, threshold: rule.value } } };
  }

  if (rule.op === 'containsValue') {
    const result = selectedItems.some((item) => item === rule.value);
    return { outputCreated: true, outputValue: result, traceEntry: { ...traceBase, resultType: 'boolean', resultValue: result, details: { ...traceBase.details, value: rule.value } } };
  }

  if (rule.op === 'existsAny') {
    const result = selectedCount > 0;
    return { outputCreated: true, outputValue: result, traceEntry: { ...traceBase, resultType: 'boolean', resultValue: result } };
  }

  if (rule.op === 'existsAll') {
    const result = selectedItems.every((item) => rule.match.test(item));
    return { outputCreated: true, outputValue: result, traceEntry: { ...traceBase, resultType: 'boolean', resultValue: result } };
  }

  if (rule.op === 'pickFirst') {
    const picked = selectedItems.length > 0 ? deepCopy(selectedItems[0]) : null;
    return { outputCreated: true, outputValue: picked, traceEntry: { ...traceBase, resultType: picked === null ? 'null' : 'object', picked: picked !== null } };
  }

  return { outputCreated: false, outputValue: undefined, traceEntry: null };
}

export function executeCompiledPlan(plan, sources) {
  const output = {};
  const trace = [];
  for (const rule of plan.rules) {
    const executed = rule.kind === 'aggregate' ? runAggregateRule(rule, sources) : (rule.kind === 'expression' ? runExpressionRule(rule, sources) : runLegacyRule(rule, sources));
    if (executed.outputCreated) {
      setTargetPath(output, rule.targetPath, executed.outputValue);
    }
    if (executed.traceEntry) {
      trace.push(executed.traceEntry);
    }
  }
  return { output, trace };
}
