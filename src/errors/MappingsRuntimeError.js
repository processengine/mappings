export class MappingsRuntimeError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'MappingsRuntimeError';
    this.code = options.code ?? 'MAPPINGS_RUNTIME_ERROR';
    this.details = options.details;
    this.cause = options.cause;
  }
}
