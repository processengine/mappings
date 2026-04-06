#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  validateMappings,
  prepareMappings,
  executeMappings,
  formatMappingsDiagnostics,
  formatMappingsRuntimeError,
  MappingsCompileError,
  MappingsRuntimeError,
} from '../dist/index.js';

const COMMANDS = new Set(['validate-file', 'compile', 'run-file', 'validate-dir', 'list', '--help', '-h', 'help']);

function printUsage() {
  console.log(`mappings CLI

Usage:
  mappings <mapping-file.json>
  mappings validate-file <mapping-file.json> [--json]
  mappings compile <mapping-file.json> [--json]
  mappings run-file <mapping-file.json> --sources <sources.json> [--trace [basic|verbose]] [--json]
  mappings validate-dir <directory> [--json]
  mappings list <directory> [--json]
`);
}

function parseOptions(args) {
  const options = { json: false, trace: false, sourcesPath: null };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--sources') {
      options.sourcesPath = args[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (arg === '--trace') {
      const next = args[i + 1];
      if (next === 'basic' || next === 'verbose') {
        options.trace = next;
        i += 1;
      } else {
        options.trace = 'basic';
      }
      continue;
    }
    if (arg.startsWith('--trace=')) {
      const value = arg.slice('--trace='.length);
      options.trace = value === 'verbose' ? 'verbose' : 'basic';
    }
  }
  return options;
}

async function readJsonFile(filePath) {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

function isMappingSource(value) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof value.mappingId === 'string' &&
      value.sources &&
      typeof value.sources === 'object' &&
      !Array.isArray(value.sources) &&
      value.output &&
      typeof value.output === 'object' &&
      !Array.isArray(value.output),
  );
}

async function collectJsonFiles(dirPath, files = []) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.DS_Store') continue;
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await collectJsonFiles(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(fullPath);
    }
  }
  return files;
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function toArtifactSummary(artifact) {
  return {
    artifactType: artifact.type,
    mappingId: artifact.mappingId,
    version: artifact.version,
  };
}

async function commandValidateFile(filePath, options) {
  const source = await readJsonFile(filePath);
  const result = validateMappings(source);
  if (options.json) {
    printJson(result);
  } else if (result.ok) {
    console.log(`OK: ${source.mappingId ?? '<unknown>'}`);
  } else {
    console.error(formatMappingsDiagnostics(result.diagnostics));
  }
  process.exit(result.ok ? 0 : 2);
}

async function commandCompile(filePath, options) {
  try {
    const source = await readJsonFile(filePath);
    const artifact = prepareMappings(source);
    const payload = toArtifactSummary(artifact);
    if (options.json) {
      printJson(payload);
    } else {
      console.log(`Prepared: ${payload.mappingId}`);
    }
  } catch (error) {
    if (error instanceof MappingsCompileError) {
      console.error(formatMappingsDiagnostics(error.diagnostics));
      process.exit(2);
    }
    throw error;
  }
}

async function commandRunFile(filePath, options) {
  if (!options.sourcesPath) {
    console.error('Missing required option --sources <sources.json>');
    process.exit(1);
  }
  try {
    const source = await readJsonFile(filePath);
    const sources = await readJsonFile(options.sourcesPath);
    const artifact = prepareMappings(source);
    const result = executeMappings(artifact, sources, { trace: options.trace });
    if (options.json || options.trace) {
      printJson(result);
    } else {
      printJson(result.output);
    }
  } catch (error) {
    if (error instanceof MappingsCompileError) {
      console.error(formatMappingsDiagnostics(error.diagnostics));
      process.exit(2);
    }
    if (error instanceof MappingsRuntimeError) {
      console.error(formatMappingsRuntimeError(error));
      process.exit(2);
    }
    throw error;
  }
}

async function commandValidateDir(dirPath, options) {
  const jsonFiles = await collectJsonFiles(dirPath);
  const results = [];
  let hasErrors = false;

  for (const file of jsonFiles) {
    try {
      const source = await readJsonFile(file);
      if (!isMappingSource(source)) continue;
      const result = validateMappings(source);
      results.push({ file: file.replace(/\\/g, '/'), mappingId: source.mappingId, ok: result.ok, diagnostics: result.diagnostics });
      if (!result.ok) hasErrors = true;
    } catch (error) {
      results.push({ file: file.replace(/\\/g, '/'), ok: false, diagnostics: [{ code: 'INVALID_JSON', level: 'error', message: error.message }] });
      hasErrors = true;
    }
  }

  if (options.json) {
    printJson({ ok: !hasErrors, results });
  } else {
    for (const item of results) {
      console.log(`${item.ok ? 'OK' : 'ERROR'} ${item.file}${item.mappingId ? ` (${item.mappingId})` : ''}`);
      if (!item.ok && Array.isArray(item.diagnostics)) {
        console.log(formatMappingsDiagnostics(item.diagnostics));
      }
    }
  }
  process.exit(hasErrors ? 2 : 0);
}

async function commandList(dirPath, options) {
  const jsonFiles = await collectJsonFiles(dirPath);
  const items = [];
  for (const file of jsonFiles) {
    try {
      const source = await readJsonFile(file);
      if (!isMappingSource(source)) continue;
      items.push({ file: file.replace(/\\/g, '/'), mappingId: source.mappingId });
    } catch {
      // ignore invalid JSON in list mode
    }
  }

  if (options.json) {
    printJson(items);
  } else {
    for (const item of items) {
      console.log(`${item.mappingId}  ${item.file}`);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const first = args[0];

  if (!first || first === '--help' || first === '-h' || first === 'help') {
    printUsage();
    return;
  }

  if (!COMMANDS.has(first)) {
    return commandValidateFile(resolve(first), { json: false, trace: false, sourcesPath: null });
  }

  const command = first;
  const target = args[1];
  const options = parseOptions(args.slice(2));

  if (!target && command !== '--help' && command !== '-h' && command !== 'help') {
    printUsage();
    process.exit(1);
  }

  switch (command) {
    case 'validate-file':
      return commandValidateFile(resolve(target), options);
    case 'compile':
      return commandCompile(resolve(target), options);
    case 'run-file':
      return commandRunFile(resolve(target), options);
    case 'validate-dir':
      return commandValidateDir(resolve(target), options);
    case 'list':
      return commandList(resolve(target), options);
    default:
      printUsage();
      process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(3);
});
