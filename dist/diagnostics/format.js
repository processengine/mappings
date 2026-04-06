function formatDiagnosticLine(diagnostic, index) {
  const prefix = `${index + 1}. [${diagnostic.level ?? 'error'}] ${diagnostic.code}`;
  const path = diagnostic.path ? ` @ ${diagnostic.path}` : '';
  return `${prefix}${path} — ${diagnostic.message}`;
}

export function formatMappingsDiagnostics(diagnostics) {
  if (!Array.isArray(diagnostics) || diagnostics.length === 0) {
    return 'No diagnostics.';
  }
  return diagnostics.map(formatDiagnosticLine).join('\n');
}

export function formatMappingsRuntimeError(error) {
  if (!error) return 'Unknown mappings runtime error.';
  const code = error.code ?? 'MAPPINGS_RUNTIME_ERROR';
  const details = error.details ? `\nDetails: ${JSON.stringify(error.details, null, 2)}` : '';
  return `[${code}] ${error.message}${details}`;
}
