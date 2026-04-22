const ARTIFACT_MARKER = Symbol.for('processengine.mappings.artifact');

function deepFreeze(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Object.isFrozen(value)) return value;
  Object.freeze(value);
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item);
  } else {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

export class PreparedMappingsArtifact {
  #definition;
  #compiledPlan;

  constructor(source, { version = 'v2', compiledPlan = null } = {}) {
    this.type = 'mapping';
    this.mappingId = source.mappingId;
    this.version = version;
    this[ARTIFACT_MARKER] = true;
    this.#definition = deepFreeze(cloneJson(source));
    this.#compiledPlan = compiledPlan ? deepFreeze(compiledPlan) : null;
    Object.freeze(this);
  }

  getDefinition() {
    return this.#definition;
  }

  getCompiledPlan() {
    return this.#compiledPlan;
  }
}

export function isPreparedMappingsArtifact(value) {
  return Boolean(value && value.type === 'mapping' && value[ARTIFACT_MARKER] === true && typeof value.getDefinition === 'function');
}
