import { validateMappingsSourceV3 } from './validate.js';
import { deepCopy, deepFreeze, isPlainObject } from './path.js';
import { MappingsCompileError } from '../errors/MappingsCompileError.js';

const EXPRESSION_METADATA_FIELDS = new Set(['name', 'description']);

function stripExpressionMetadata(expr) {
  if (!isPlainObject(expr)) return deepCopy(expr);

  const cleanExpr = {};
  for (const [key, value] of Object.entries(expr)) {
    if (EXPRESSION_METADATA_FIELDS.has(key)) continue;
    cleanExpr[key] = key === 'coalesce' && Array.isArray(value)
      ? value.map((item) => (isPlainObject(item) ? stripExpressionMetadata(item) : deepCopy(item)))
      : deepCopy(value);
  }
  return cleanExpr;
}

function compilePlan(output) {
  return Object.entries(output).map(([targetPath, expr]) => ({ targetPath, expr: stripExpressionMetadata(expr) }));
}

export function prepareMappingsV3(source) {
  const validation = validateMappingsSourceV3(source);
  if (!validation.ok) {
    const lines = validation.diagnostics.map((d, i) => `  ${i+1}. [${d.level?.toUpperCase()}] ${d.code} — ${d.message}`).join('\n');
    throw new MappingsCompileError(
      `Mappings v3 preparation failed:\n${lines}`,
      { code: 'MAPPINGS_COMPILE_ERROR', diagnostics: validation.diagnostics }
    );
  }

  const definition = deepFreeze(deepCopy(source));
  const compiledPlan = deepFreeze(compilePlan(definition.output));

  const artifact = {
    artifactType: 'mappings',
    version: 'v3',
    mappingId: definition.mappingId,
    kind: definition.kind,
    title: definition.title,
    description: definition.description,
    compiledPlan,
    getDefinition: () => deepCopy(definition),
  };
  return deepFreeze(artifact);
}
