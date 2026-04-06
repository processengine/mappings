export class MappingsCompileError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'MappingsCompileError';
    this.code = options.code ?? 'MAPPINGS_COMPILE_ERROR';
    this.diagnostics = Array.isArray(options.diagnostics) ? options.diagnostics : [];
    this.cause = options.cause;
  }
}
