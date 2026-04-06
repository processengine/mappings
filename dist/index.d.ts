export type SourcePath = string;
export type TargetPath = string;
export type JsonSafeLiteral = string | number | boolean | null;
export type SourceTypeDeclaration = 'object';
export type TraceLevel = false | 'basic' | 'verbose';

export interface MappingDiagnostic {
  code: string;
  level: 'error' | 'warning' | 'info';
  message: string;
  path?: string;
  details?: Record<string, unknown>;
}

export interface ValidateMappingsResult {
  ok: boolean;
  diagnostics: MappingDiagnostic[];
}

export interface PrepareMappingsOptions {}
export interface ValidateMappingsOptions {}
export interface ExecuteMappingsOptions {
  trace?: TraceLevel;
  redact?: ((value: unknown) => unknown) | 'mask' | { redact(value: unknown): unknown };
}

export interface MappingTraceEvent {
  kind: 'mapping.rule';
  artifactType: 'mapping';
  artifactId: string;
  step: string;
  at: string;
  outcome: 'applied' | 'skipped';
  target: string;
  details?: Record<string, unknown>;
  input?: Record<string, unknown>;
  output?: unknown;
}

export interface ExecuteMappingsResult {
  output: Record<string, unknown>;
  trace?: MappingTraceEvent[];
}

export interface MappingDefinition {
  mappingId: string;
  sources: Record<string, SourceTypeDeclaration>;
  output: Record<TargetPath, Record<string, unknown>>;
}

export interface PreparedMappingsArtifact {
  readonly type: 'mapping';
  readonly mappingId: string;
  readonly version: string;
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

export function validateMappings(source: unknown, options?: ValidateMappingsOptions): ValidateMappingsResult;
export function prepareMappings(source: unknown, options?: PrepareMappingsOptions): PreparedMappingsArtifact;
export function executeMappings(artifact: PreparedMappingsArtifact, input: Record<string, Record<string, unknown>>, options?: ExecuteMappingsOptions): ExecuteMappingsResult;
export function formatMappingsDiagnostics(diagnostics: MappingDiagnostic[]): string;
export function formatMappingsRuntimeError(error: MappingsRuntimeError | Error): string;
