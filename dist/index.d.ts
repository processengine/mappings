export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };
export type PathRef = string;
export type TargetPath = string;
export type MappingKind = 'payload' | 'facts' | 'result';
export type JsonScalar = string | number | boolean | null;
export type TraceMode = 'off' | 'basic' | 'verbose';

export interface MappingDiagnostic {
  code: string;
  level: 'error' | 'warning' | 'info';
  message: string;
  path?: string;
  details?: JsonObject;
}

export interface ValidationResult {
  ok: boolean;
  diagnostics: MappingDiagnostic[];
}

export interface ExecuteMappingsOptions {
  trace?: TraceMode;
  redact?: ((value: JsonValue) => JsonValue) | 'mask' | { redact(value: JsonValue): JsonValue };
}

export interface MappingExpressionDocumentation {
  name?: string;
  description?: string;
}

export type MappingExpression = MappingExpressionDocumentation & (
  | { from: PathRef }
  | { const: JsonValue }
  | { coalesce: Array<PathRef | MappingExpression> }
  | { text: { from: PathRef; trim?: boolean; spaces?: 'preserve' | 'normalize'; case?: 'preserve' | 'upper' | 'lower' } }
  | { removeNonDigits: PathRef }
  | { dictionary: { from: PathRef; values: Record<string, JsonValue>; default?: JsonValue } }
  | { equals: [PathRef, JsonScalar] }
  | { exists: PathRef }
  | { count: { from: PathRef; where?: MappingWhere } }
  | { existsAny: { from: PathRef; where?: MappingWhere } }
  | { containsValue: { from: PathRef; value: JsonScalar } }
  | { collect: { from: PathRef; where?: MappingWhere; select?: PathRef | Record<string, PathRef> } }
  | { join: MappingJoinExpression }
  | { findOne: { from: PathRef; where?: MappingWhere } }
);

export interface MappingWhere {
  field: string;
  equals?: JsonScalar;
  in?: JsonScalar[];
  startsWith?: string;
}

export interface MappingJoinExpression {
  separator?: string;
  items: Array<PathRef | string | { from: PathRef; prefix?: string } | { join: MappingJoinExpression }>;
}

export interface MappingDefinitionV3 {
  mappingId: string;
  kind: MappingKind;
  title: string;
  description: string;
  output: Record<TargetPath, MappingExpression>;
  metadata?: JsonObject;
}

export interface CompiledMappingsPlanItem {
  readonly targetPath: TargetPath;
  readonly expr: MappingExpression;
}

export type CompiledMappingsPlan = readonly CompiledMappingsPlanItem[];

export interface PreparedMappingsArtifact {
  readonly artifactType: 'mappings';
  readonly version: 'v3';
  readonly mappingId: string;
  readonly kind: MappingKind;
  readonly title: string;
  readonly description: string;
  readonly compiledPlan: CompiledMappingsPlan;
  getDefinition(): MappingDefinitionV3;
}

export interface MappingTraceEvent {
  kind: string;
  artifactType: 'mappings';
  artifactId: string;
  step: string;
  at: string;
  outcome: 'completed' | 'failed';
  details?: JsonObject;
  input?: JsonValue;
  output?: JsonValue;
}

export interface ExecuteMappingsResult {
  output: JsonObject;
  trace?: MappingTraceEvent[];
}

export class MappingsCompileError extends Error {
  code: string;
  diagnostics: MappingDiagnostic[];
  cause?: unknown;
}

export class MappingsRuntimeError extends Error {
  code: string;
  details?: unknown;
  cause?: unknown;
}

export function validateMappings(source: unknown): ValidationResult;
export function prepareMappings(source: MappingDefinitionV3): PreparedMappingsArtifact;
export function executeMappings(artifact: PreparedMappingsArtifact, input: JsonObject, options?: ExecuteMappingsOptions): ExecuteMappingsResult;
export function formatMappingsDiagnostics(diagnostics: MappingDiagnostic[]): string;
export function formatMappingsRuntimeError(error: MappingsRuntimeError | Error): string;
