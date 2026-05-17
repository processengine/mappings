import { resolvePath, resolveArrayItems, resolveElementField, deepCopy, setNestedPath } from './path.js';

function isEmptyValue(value) {
  return value === null || value === undefined || value === '';
}

function evalWhere(item, where) {
  if (!where) return true;
  const val = item == null ? undefined : item[where.field];
  if ('equals' in where) return val === where.equals;
  if (Array.isArray(where.in)) return where.in.includes(val);
  if ('startsWith' in where) return typeof val === 'string' && val.startsWith(where.startsWith);
  return true;
}

function evalPath(path, input) {
  const { resolved, value } = resolvePath(input, path);
  return resolved ? value : undefined;
}

function evalJoinItem(item, input) {
  if (typeof item === 'string') {
    const value = item.startsWith('$.') ? evalPath(item, input) : item;
    if (isEmptyValue(value)) return null;
    return String(value);
  }
  if (item && typeof item === 'object') {
    if ('join' in item) {
      const value = evalJoin(item.join, input);
      return isEmptyValue(value) ? null : value;
    }
    if ('from' in item) {
      const value = evalPath(item.from, input);
      if (isEmptyValue(value)) return null;
      return `${item.prefix ?? ''}${String(value)}`;
    }
  }
  return null;
}

function evalJoin(joinExpr, input) {
  const sep = joinExpr.separator ?? '';
  const parts = (joinExpr.items ?? [])
    .map((item) => evalJoinItem(item, input))
    .filter((value) => !isEmptyValue(value));
  return parts.join(sep);
}

function evalText(textExpr, input) {
  const value = evalPath(textExpr.from, input);
  if (value === undefined || value === null) return '';
  let result = String(value);
  if (textExpr.trim) result = result.trim();
  if (textExpr.spaces === 'normalize') result = result.replace(/\s+/g, ' ').trim();
  if (textExpr.case === 'upper') result = result.toUpperCase();
  if (textExpr.case === 'lower') result = result.toLowerCase();
  return result;
}

function evalDictionary(dictionaryExpr, input) {
  const value = evalPath(dictionaryExpr.from, input);
  const values = dictionaryExpr.values ?? {};
  if (value !== undefined && Object.prototype.hasOwnProperty.call(values, String(value))) return deepCopy(values[String(value)]);
  if ('default' in dictionaryExpr) return deepCopy(dictionaryExpr.default);
  return undefined;
}

function evalCoalesceCandidate(candidate, input) {
  if (typeof candidate === 'string') return evalPath(candidate, input);
  return evalExpression(candidate, input);
}

export function evalExpression(expr, input) {
  if (expr === null || expr === undefined) return undefined;
  if (typeof expr !== 'object' || Array.isArray(expr)) return undefined;

  if ('from' in expr) {
    const value = evalPath(expr.from, input);
    return value === undefined ? undefined : deepCopy(value);
  }

  if ('const' in expr) return deepCopy(expr.const);

  if ('text' in expr) return evalText(expr.text, input);

  if ('removeNonDigits' in expr) {
    const value = evalPath(expr.removeNonDigits, input);
    if (value === undefined || value === null) return '';
    return String(value).replace(/\D/g, '');
  }

  if ('dictionary' in expr) return evalDictionary(expr.dictionary, input);

  if ('coalesce' in expr) {
    for (const candidate of expr.coalesce) {
      const value = evalCoalesceCandidate(candidate, input);
      if (!isEmptyValue(value)) return deepCopy(value);
    }
    return null;
  }

  if ('exists' in expr) return resolvePath(input, expr.exists).resolved;

  if ('equals' in expr) {
    const [path, expected] = expr.equals;
    const { resolved, value } = resolvePath(input, path);
    return resolved && value === expected;
  }

  if ('count' in expr) {
    const { from, where } = expr.count;
    const items = resolveArrayItems(input, from);
    return where ? items.filter((item) => evalWhere(item, where)).length : items.length;
  }

  if ('existsAny' in expr) {
    const { from, where } = expr.existsAny;
    const items = resolveArrayItems(input, from);
    return items.some((item) => evalWhere(item, where));
  }

  if ('containsValue' in expr) {
    const { from, value } = expr.containsValue;
    return resolveArrayItems(input, from).some((item) => item === value);
  }

  if ('collect' in expr) {
    const { from, where, select } = expr.collect;
    let items = resolveArrayItems(input, from);
    if (where) items = items.filter((item) => evalWhere(item, where));
    if (select === undefined) return deepCopy(items);
    if (typeof select === 'string') return items.map((item) => resolveElementField(item, select)).filter((value) => value !== undefined).map(deepCopy);
    if (select && typeof select === 'object') {
      return items.map((item) => {
        const out = {};
        for (const [key, fieldPath] of Object.entries(select)) {
          const value = resolveElementField(item, fieldPath);
          if (value !== undefined) out[key] = deepCopy(value);
        }
        return out;
      });
    }
    return deepCopy(items);
  }

  if ('join' in expr) return evalJoin(expr.join, input);

  if ('findOne' in expr) {
    const { from, where } = expr.findOne;
    const items = resolveArrayItems(input, from);
    const filtered = where ? items.filter((item) => evalWhere(item, where)) : items;
    if (filtered.length === 0) throw Object.assign(new Error('findOne found no matching item'), { code: 'MAPPINGS_FIND_ONE_NOT_FOUND' });
    if (filtered.length > 1) throw Object.assign(new Error('findOne found more than one matching item'), { code: 'MAPPINGS_FIND_ONE_NOT_UNIQUE' });
    return deepCopy(filtered[0]);
  }

  return undefined;
}

export function executeV3Plan(compiledPlan, input) {
  const output = {};
  for (const { targetPath, expr } of compiledPlan) {
    const value = evalExpression(expr, input);
    if (value !== undefined) setNestedPath(output, targetPath, value);
  }
  return output;
}
