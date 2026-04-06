import { deepCopy, resolvePath, setTargetPath } from './path.js';

export function execute(definition, sources, withTrace) {
  const result = {};
  const trace = withTrace ? [] : null;

  for (const [targetPath, rule] of Object.entries(definition.output)) {
    const op = Object.keys(rule)[0];
    const args = rule[op];

    const { outputCreated, outputValue, traceEntry } = applyOperator(op, args, sources, targetPath, withTrace);

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

function applyOperator(op, args, sources, targetPath, withTrace) {
  switch (op) {
    case 'from': return applyFrom(args, sources, targetPath, withTrace);
    case 'literal': return applyLiteral(args, targetPath, withTrace);
    case 'exists': return applyExists(args, sources, targetPath, withTrace);
    case 'equals': return applyEquals(args, sources, targetPath, withTrace);
    case 'coalesce': return applyCoalesce(args, sources, targetPath, withTrace);
    case 'trim':
    case 'lowercase':
    case 'uppercase':
    case 'normalizeSpaces':
    case 'removeNonDigits': return applyStringOp(op, args, sources, targetPath, withTrace);
    case 'mapValue': return applyMapValue(args, sources, targetPath, withTrace);
    case 'transform': return applyTransform(args, sources, targetPath, withTrace);
    default: return { outputCreated: false, outputValue: undefined, traceEntry: null };
  }
}

function applyFrom(pathStr, sources, targetPath, withTrace) {
  const resolution = resolvePath(sources, pathStr);
  const traceEntry = withTrace ? { target: targetPath, op: 'from', from: pathStr, resolved: resolution.resolved } : null;
  if (!resolution.resolved) {
    return { outputCreated: false, outputValue: undefined, traceEntry };
  }
  return { outputCreated: true, outputValue: deepCopy(resolution.value), traceEntry };
}

function applyLiteral(value, targetPath, withTrace) {
  const traceEntry = withTrace ? { target: targetPath, op: 'literal', literal: value } : null;
  return { outputCreated: true, outputValue: value, traceEntry };
}

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
      if (traceCandidates) traceCandidates.push({ kind: 'literal', value: cand.literal });
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

function applyStringOp(op, pathStr, sources, targetPath, withTrace) {
  const resolution = resolvePath(sources, pathStr);
  let reason = null;
  if (!resolution.resolved) reason = 'path_unresolved';
  else if (resolution.value === null) reason = 'null_value';
  else if (typeof resolution.value !== 'string') reason = 'type_mismatch';

  if (reason) {
    const traceEntry = withTrace ? { target: targetPath, op, from: pathStr, resolved: resolution.resolved, reason } : null;
    return { outputCreated: false, outputValue: undefined, traceEntry };
  }

  const outputValue = applyStringTransform(op, resolution.value);
  const traceEntry = withTrace
    ? { target: targetPath, op, from: pathStr, resolved: true, inputValue: resolution.value, outputValue }
    : null;
  return { outputCreated: true, outputValue, traceEntry };
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

function applyMapValue(args, sources, targetPath, withTrace) {
  const resolution = resolvePath(sources, args.from);
  if (!resolution.resolved || resolution.value === null) {
    const traceEntry = withTrace ? { target: targetPath, op: 'mapValue', from: args.from, resolved: resolution.resolved, reason: resolution.resolved ? 'null_value' : 'path_unresolved' } : null;
    return { outputCreated: false, outputValue: undefined, traceEntry };
  }
  const rawValue = resolution.value;
  const lookupKey = typeof rawValue === 'string' ? rawValue : String(rawValue);
  if (Object.prototype.hasOwnProperty.call(args.map, lookupKey)) {
    const outputValue = args.map[lookupKey];
    const traceEntry = withTrace ? { target: targetPath, op: 'mapValue', from: args.from, resolved: true, inputValue: rawValue, matched: true, outputValue } : null;
    return { outputCreated: true, outputValue, traceEntry };
  }
  if (!Object.prototype.hasOwnProperty.call(args, 'fallback')) {
    const traceEntry = withTrace ? { target: targetPath, op: 'mapValue', from: args.from, resolved: true, inputValue: rawValue, matched: false, reason: 'no_match' } : null;
    return { outputCreated: false, outputValue: undefined, traceEntry };
  }
  if (args.fallback === 'passthrough') {
    const outputValue = deepCopy(rawValue);
    const traceEntry = withTrace ? { target: targetPath, op: 'mapValue', from: args.from, resolved: true, inputValue: rawValue, matched: false, fallbackApplied: true, fallbackKind: 'passthrough', outputValue } : null;
    return { outputCreated: true, outputValue, traceEntry };
  }
  const outputValue = args.fallback;
  const traceEntry = withTrace ? { target: targetPath, op: 'mapValue', from: args.from, resolved: true, inputValue: rawValue, matched: false, fallbackApplied: true, fallbackKind: 'literal', outputValue } : null;
  return { outputCreated: true, outputValue, traceEntry };
}

function applyTransform(args, sources, targetPath, withTrace) {
  const resolution = resolvePath(sources, args.from);
  const traceEntry = withTrace ? { target: targetPath, op: 'transform', from: args.from, resolved: resolution.resolved, steps: [] } : null;
  if (!resolution.resolved) {
    if (traceEntry) traceEntry.reason = 'path_unresolved';
    return { outputCreated: false, outputValue: undefined, traceEntry };
  }
  if (resolution.value === null) {
    if (traceEntry) traceEntry.reason = 'null_value';
    return { outputCreated: false, outputValue: undefined, traceEntry };
  }

  let current = resolution.value;
  for (const step of args.steps) {
    const op = Object.keys(step)[0];
    const stepArgs = step[op];
    let stepTrace;

    if (op === 'mapValue') {
      const lookupKey = typeof current === 'string' ? current : String(current);
      if (Object.prototype.hasOwnProperty.call(stepArgs.map, lookupKey)) {
        const out = stepArgs.map[lookupKey];
        stepTrace = { op, in: current, out, applied: true, matched: true };
        current = out;
      } else if (!Object.prototype.hasOwnProperty.call(stepArgs, 'fallback')) {
        stepTrace = { op, in: current, applied: false, stoppedChain: true, reason: 'no_match', matched: false };
        if (traceEntry) {
          traceEntry.steps.push(stepTrace);
          traceEntry.reason = 'chain_stopped';
        }
        return { outputCreated: false, outputValue: undefined, traceEntry };
      } else if (stepArgs.fallback === 'passthrough') {
        stepTrace = { op, in: current, out: current, applied: true, matched: false, fallbackKind: 'passthrough' };
      } else {
        stepTrace = { op, in: current, out: stepArgs.fallback, applied: true, matched: false, fallbackKind: 'literal' };
        current = stepArgs.fallback;
      }
    } else {
      if (typeof current !== 'string') {
        stepTrace = { op, in: current, applied: false, stoppedChain: true, reason: 'type_mismatch' };
        if (traceEntry) {
          traceEntry.steps.push(stepTrace);
          traceEntry.reason = 'chain_stopped';
        }
        return { outputCreated: false, outputValue: undefined, traceEntry };
      }
      const out = applyStringTransform(op, current);
      stepTrace = { op, in: current, out, applied: true };
      current = out;
    }

    if (traceEntry) traceEntry.steps.push(stepTrace);
  }

  return { outputCreated: true, outputValue: deepCopy(current), traceEntry };
}
