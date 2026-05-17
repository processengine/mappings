import { validateMappingsSourceV3 } from './validate.js';
import { deepCopy, deepFreeze } from './path.js';
import { MappingsCompileError } from '../errors/MappingsCompileError.js';

function compilePlan(output) {
  return Object.entries(output).map(([targetPath, expr]) => ({ targetPath, expr: deepCopy(expr) }));
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
