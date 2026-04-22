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

function compileLegacyRule(targetPath, op, args) {
  switch (op) {
    case 'from':
    case 'exists':
    case 'trim':
    case 'lowercase':
    case 'uppercase':
    case 'normalizeSpaces':
    case 'removeNonDigits':
      return { kind: 'legacy', targetPath, op, accessor: compileSourcePathAccessor(args) };
    case 'literal':
      return { kind: 'legacy', targetPath, op, value: cloneJsonSafe(args) };
    case 'equals':
      return { kind: 'legacy', targetPath, op, accessor: compileSourcePathAccessor(args[0]), expected: cloneJsonSafe(args[1]) };
    case 'coalesce':
      return {
        kind: 'legacy',
        targetPath,
        op,
        candidates: args.map((cand) => ('path' in cand
          ? { kind: 'path', accessor: compileSourcePathAccessor(cand.path), path: cand.path }
          : { kind: 'literal', value: cloneJsonSafe(cand.literal) })),
      };
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
    valueAccessor: args.value ? compileRelativeAccessor(args.value) : null,
  };
}

export function compileDefinition(definition) {
  const rules = [];
  for (const [targetPath, rule] of Object.entries(definition.output)) {
    const op = Object.keys(rule)[0];
    const args = rule[op];
    if (['collect', 'count', 'existsAny', 'existsAll', 'pickFirst'].includes(op)) {
      rules.push(compileAggregateRule(targetPath, op, args));
    } else {
      rules.push(compileLegacyRule(targetPath, op, args));
    }
  }
  return {
    kind: 'compiledPlan',
    rules,
  };
}
