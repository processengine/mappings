import { deepCopy, isPlainObject } from './path.js';

function splitPath(pathStr) {
  return pathStr.split('.');
}

function cloneJsonSafe(value) {
  return deepCopy(value);
}

export function compileSourcePathAccessor(pathStr) {
  const segments = splitPath(pathStr);
  const sourceName = segments[1];
  const fieldSegments = segments.slice(2);
  return {
    kind: 'sourcePath',
    path: pathStr,
    sourceName,
    fieldSegments,
    resolve(sources) {
      if (!(sourceName in sources)) return { resolved: false };
      let current = sources[sourceName];
      for (const seg of fieldSegments) {
        if (!isPlainObject(current) || !Object.prototype.hasOwnProperty.call(current, seg)) {
          return { resolved: false };
        }
        current = current[seg];
      }
      return { resolved: true, value: current };
    },
  };
}

export function compileRelativeAccessor(pathStr) {
  const segments = splitPath(pathStr);
  return {
    kind: 'relativePath',
    path: pathStr,
    segments,
    resolve(item) {
      let current = item;
      if (segments.length === 0) return { resolved: true, value: current };
      for (const seg of segments) {
        if (!isPlainObject(current) || !Object.prototype.hasOwnProperty.call(current, seg)) {
          return { resolved: false };
        }
        current = current[seg];
      }
      return { resolved: true, value: current };
    },
  };
}

export function compileArraySelector(pathStr) {
  const wildcardIndex = pathStr.indexOf('[*]');
  const containerPath = pathStr.slice(0, wildcardIndex);
  const containerAccessor = compileSourcePathAccessor(containerPath);
  return {
    kind: 'arraySelector',
    path: pathStr,
    containerAccessor,
    select(sources) {
      const resolution = containerAccessor.resolve(sources);
      if (!resolution.resolved) {
        return { resolved: false, items: [], reason: 'path_unresolved' };
      }
      if (!Array.isArray(resolution.value)) {
        return { resolved: false, items: [], reason: 'not_array' };
      }
      return { resolved: true, items: resolution.value };
    },
  };
}

export function compileConditionPredicate(condition) {
  if (!condition) return null;
  const accessor = compileRelativeAccessor(condition.field);
  if (Object.prototype.hasOwnProperty.call(condition, 'equals')) {
    const expected = condition.equals;
    return {
      kind: 'equals',
      field: condition.field,
      test(item) {
        const resolution = accessor.resolve(item);
        return resolution.resolved && resolution.value === expected;
      },
    };
  }
  if (Object.prototype.hasOwnProperty.call(condition, 'in')) {
    const set = new Set(condition.in);
    return {
      kind: 'in',
      field: condition.field,
      values: [...condition.in],
      test(item) {
        const resolution = accessor.resolve(item);
        return resolution.resolved && set.has(resolution.value);
      },
    };
  }
  if (Object.prototype.hasOwnProperty.call(condition, 'startsWith')) {
    const prefix = condition.startsWith;
    return {
      kind: 'startsWith',
      field: condition.field,
      prefix,
      test(item) {
        const resolution = accessor.resolve(item);
        return resolution.resolved && typeof resolution.value === 'string' && resolution.value.startsWith(prefix);
      },
    };
  }
  throw new Error('Unsupported compiled condition');
}

function compileTransformStep(step) {
  const op = Object.keys(step)[0];
  const args = step[op];
  return { op, args: cloneJsonSafe(args) };
}

function compileTemplateTokens(template, vars) {
  const tokens = [];
  const re = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;
  let last = 0;
  let match;
  while ((match = re.exec(template)) !== null) {
    if (match.index > last) tokens.push({ type: 'literal', value: template.slice(last, match.index) });
    tokens.push({ type: 'var', name: match[1], expression: compileExpression(vars[match[1]]) });
    last = match.index + match[0].length;
  }
  if (last < template.length) tokens.push({ type: 'literal', value: template.slice(last) });
  return tokens;
}

export function compileExpression(expr) {
  if (!isPlainObject(expr)) throw new Error('Expression must be a plain object');
  if (Object.prototype.hasOwnProperty.call(expr, 'template') && typeof expr.template === 'string') {
    return compileTemplateExpression(expr);
  }
  const keys = Object.keys(expr);
  if (keys.length !== 1) throw new Error('Expression must contain exactly one operator');
  const op = keys[0];
  const args = expr[op];
  switch (op) {
    case 'from':
      return { kind: 'from', accessor: compileSourcePathAccessor(args), path: args };
    case 'path':
      return { kind: 'from', accessor: compileSourcePathAccessor(args), path: args };
    case 'literal':
      return { kind: 'literal', value: cloneJsonSafe(args) };
    case 'coalesce':
      return { kind: 'coalesce', candidates: args.map(compileExpression) };
    case 'joinNonEmpty':
      return {
        kind: 'joinNonEmpty',
        separator: args.separator ?? '',
        items: args.items.map(compileExpression),
        trimItems: args.trimItems ?? true,
        trimResult: args.trimResult ?? true,
        emptyAsNull: args.emptyAsNull ?? true,
      };
    default:
      throw new Error(`Unsupported expression operator for compile: ${op}`);
  }
}

function compileTemplateExpression(args) {
  return {
    kind: 'template',
    template: args.template,
    tokens: compileTemplateTokens(args.template, args.vars ?? {}),
    vars: Object.fromEntries(Object.entries(args.vars ?? {}).map(([key, value]) => [key, compileExpression(value)])),
    skipIfAnyVarEmpty: args.skipIfAnyVarEmpty ?? true,
    trimResult: args.trimResult ?? true,
    emptyAsNull: args.emptyAsNull ?? true,
  };
}

function compileOutputExpression(op, args) {
  if (op === 'from') return { kind: 'from', accessor: compileSourcePathAccessor(args), path: args };
  if (op === 'literal') return { kind: 'literal', value: cloneJsonSafe(args) };
  if (op === 'coalesce') return { kind: 'coalesce', candidates: args.map(compileExpression) };
  if (op === 'joinNonEmpty') {
    return {
      kind: 'joinNonEmpty',
      separator: args.separator ?? '',
      items: args.items.map(compileExpression),
      trimItems: args.trimItems ?? true,
      trimResult: args.trimResult ?? true,
      emptyAsNull: args.emptyAsNull ?? true,
    };
  }
  if (op === 'template') return compileTemplateExpression(args);
  return null;
}

function isLegacyCoalesceCandidate(candidate) {
  if (!isPlainObject(candidate)) return false;
  const keys = Object.keys(candidate);
  return keys.length === 1 && (keys[0] === 'path' || keys[0] === 'literal');
}

function compileLegacyRule(targetPath, op, args) {
  switch (op) {
    case 'from':
      return { kind: 'legacy', targetPath, op, accessor: compileSourcePathAccessor(args) };
    case 'literal':
      return { kind: 'legacy', targetPath, op, value: cloneJsonSafe(args) };
    case 'coalesce':
      if (args.every(isLegacyCoalesceCandidate)) {
        return {
          kind: 'legacy',
          targetPath,
          op,
          candidates: args.map((cand) => ('path' in cand
            ? { kind: 'path', accessor: compileSourcePathAccessor(cand.path), path: cand.path }
            : { kind: 'literal', value: cloneJsonSafe(cand.literal) })),
        };
      }
      return { kind: 'expression', targetPath, op, expression: compileOutputExpression(op, args) };
    case 'joinNonEmpty':
    case 'template':
      return { kind: 'expression', targetPath, op, expression: compileOutputExpression(op, args) };
    case 'exists':
    case 'trim':
    case 'lowercase':
    case 'uppercase':
    case 'normalizeSpaces':
    case 'removeNonDigits':
      return { kind: 'legacy', targetPath, op, accessor: compileSourcePathAccessor(args) };
    case 'equals':
      return { kind: 'legacy', targetPath, op, accessor: compileSourcePathAccessor(args[0]), expected: cloneJsonSafe(args[1]) };
    case 'mapValue':
      return {
        kind: 'legacy',
        targetPath,
        op,
        accessor: compileSourcePathAccessor(args.from),
        map: { ...args.map },
        fallback: Object.prototype.hasOwnProperty.call(args, 'fallback') ? cloneJsonSafe(args.fallback) : undefined,
      };
    case 'transform':
      return {
        kind: 'legacy',
        targetPath,
        op,
        accessor: compileSourcePathAccessor(args.from),
        steps: args.steps.map(compileTransformStep),
      };
    default:
      throw new Error(`Unsupported legacy operator for compile: ${op}`);
  }
}

function compileAggregateRule(targetPath, op, args) {
  return {
    kind: 'aggregate',
    targetPath,
    op,
    selector: compileArraySelector(args.from),
    where: args.where ? compileConditionPredicate(args.where) : null,
    match: args.match ? compileConditionPredicate(args.match) : null,
    value: Object.prototype.hasOwnProperty.call(args, 'value') ? cloneJsonSafe(args.value) : undefined,
    valueAccessor: args.value && typeof args.value === 'string' ? compileRelativeAccessor(args.value) : null,
    fieldAccessors: args.fields
      ? Object.fromEntries(Object.entries(args.fields).map(([key, path]) => [key, compileRelativeAccessor(path)]))
      : null,
  };
}

export function compileDefinition(definition) {
  const rules = [];
  for (const [targetPath, rule] of Object.entries(definition.output)) {
    const op = Object.keys(rule)[0];
    const args = rule[op];
    if (['collect', 'collectObject', 'count', 'countAtLeast', 'existsAny', 'existsAll', 'pickFirst', 'containsValue'].includes(op)) {
      rules.push(compileAggregateRule(targetPath, op, args));
    } else {
      rules.push(compileLegacyRule(targetPath, op, args));
    }
  }
  return {
    kind: 'compiledPlan',
    version: 'v2',
    rules,
  };
}
