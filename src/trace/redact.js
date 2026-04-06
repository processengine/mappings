function defaultMask(value) {
  if (typeof value === 'string') {
    if (value.length <= 4) return '****';
    return `${value.slice(0, 2)}***${value.slice(-2)}`;
  }
  return '[REDACTED]';
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

export function redactValue(value, policy) {
  if (!policy) return value;
  if (typeof policy === 'function') {
    return policy(value);
  }
  if (policy === 'mask') {
    return defaultMask(value);
  }
  if (isPlainObject(policy) && typeof policy.redact === 'function') {
    return policy.redact(value);
  }
  return value;
}

export function maybeRedact(value, mode, policy) {
  if (mode !== 'verbose') return undefined;
  return redactValue(value, policy);
}
