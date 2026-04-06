#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import {
  validateMappings,
  prepareMappings,
  executeMappings,
  formatMappingsDiagnostics,
  formatMappingsRuntimeError,
  MappingsCompileError,
  MappingsRuntimeError,
} from '../dist/index.js';

function printUsage() {
  console.log(`Usage:
  mappings validate-file <mapping-file.json> [--json]
  mappings compile <mapping-file.json> [--json]
  mappings run-file <mapping-file.json> --sources <sources-file.json> [--trace[=basic|verbose]] [--json]
  mappings validate-dir <directory> [--json]
  mappings list <directory> [--json]

Notes:
  --trace without value means trace=basic.
  The legacy single-argument mode is still supported:
    mappings <mapping-file.json>`);
}

function parseOptions(argv) {
  const options = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--trace') {
      options.trace = 'basic';
      continue;
    }
    if (arg.startsWith('--trace=')) {
      options.trace = arg.slice('--trace='.length) || 'basic';
      continue;
    }
    if (arg === '--sources') {
      options.sources = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    options._.push(arg);
  }
  return options;
}

async function readJsonFile(filePath) {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

function isLikelyMappingSource(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && typeof value.sources === 'object' && value.output && typeof value.output === 'object');
}

async function walkJsonFiles(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === '.DS_Store') continue;
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkJsonFiles(fullPath)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(fullPath);
    }
  }
  return files.sort();
}

function emit(data, asJson) {
  if (asJson) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  if (typeof data === 'string') {
    console.log(data);
    return;
  }
  console.log(JSON.stringify(data, null, 2));
}

async function commandValidateFile(filePath, options) {
  const source = await readJsonFile(filePath);
  const result = validateMappings(source);
  if (options.json) {
    emit({ file: filePath, ...result }, true);
  } else if (result.ok) {
    console.log(`OK: ${source.mappingId ?? '<unknown>'}`);
  } else {
    console.error(formatMappingsDiagnostics(result.diagnostics));
  }
  return result.ok ? 0 : 2;
}

async function commandCompile(filePath, options) {
  const source = await readJsonFile(filePath);
  try {
    const artifact = prepareMappings(source);
    const payload = {
      ok: true,
      artifact: {
        type: artifact.type,
        mappingId: artifact.mappingId,
        version: artifact.version,
      },
    };
    emit(options.json ? payload : `Prepared: ${artifact.mappingId ?? '<unknown>'}`, options.json);
    return 0;
  } catch (error) {
    if (error instanceof MappingsCompileError) {
      const payload = { ok: false, code: error.code, diagnostics: error.diagnostics };
      if (options.json) {
        emit(payload, true);
      } else {
        console.error(formatMappingsDiagnostics(error.diagnostics));
      }
      return 2;
    }
    throw error;
  }
}

async function commandRunFile(filePath, options) {
  if (!options.sources) {
    console.error('Missing required option: --sources <sources-file.json>');
    return 1;
  }
  const source = await readJsonFile(filePath);
  const sources = await readJsonFile(options.sources);
  const artifact = prepareMappings(source);
  const result = executeMappings(artifact, sources, {
    trace: options.trace ?? false,
  });
  emit(options.json ? result : result.output, options.json);
  return 0;
}

async function commandValidateDir(dirPath, options) {
  const files = await walkJsonFiles(dirPath);
  const checked = [];
  const skipped = [];
  let hasErrors = false;

  for (const file of files) {
    const value = await readJsonFile(file);
    if (!isLikelyMappingSource(value)) {
      skipped.push(file);
      continue;
    }
    const result = validateMappings(value);
    checked.push({
      file,
      mappingId: value.mappingId ?? null,
      ok: result.ok,
      diagnostics: result.diagnostics,
    });
    if (!result.ok) hasErrors = true;
  }

  const payload = {
    ok: !hasErrors,
    checkedCount: checked.length,
    skippedCount: skipped.length,
    checked,
    skipped,
  };

  if (options.json) {
    emit(payload, true);
  } else {
    for (const item of checked) {
      console.log(`${item.ok ? 'OK' : 'ERROR'} ${item.mappingId ?? '<unknown>'} — ${item.file}`);
      if (!item.ok) {
        console.error(formatMappingsDiagnostics(item.diagnostics));
      }
    }
    console.log(`Checked: ${checked.length}, skipped: ${skipped.length}`);
  }

  return hasErrors ? 2 : 0;
}

async function commandList(dirPath, options) {
  const files = await walkJsonFiles(dirPath);
  const items = [];
  for (const file of files) {
    const value = await readJsonFile(file);
    if (!isLikelyMappingSource(value)) continue;
    items.push({
      mappingId: value.mappingId ?? null,
      file,
    });
  }
  if (options.json) {
    emit(items, true);
  } else {
    for (const item of items) {
      console.log(`${item.mappingId ?? '<unknown>'}\t${item.file}`);
    }
  }
  return 0;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const [command, ...rest] = options._;

  if (options.help) {
    printUsage();
    return;
  }

  if (!command) {
    printUsage();
    process.exit(1);
  }

  if (!['validate-file', 'compile', 'run-file', 'validate-dir', 'list'].includes(command)) {
    const exitCode = await commandValidateFile(command, options);
    process.exit(exitCode);
  }

  const target = rest[0];
  if (!target) {
    printUsage();
    process.exit(1);
  }

  let exitCode = 0;
  switch (command) {
    case 'validate-file':
      exitCode = await commandValidateFile(target, options);
      break;
    case 'compile':
      exitCode = await commandCompile(target, options);
      break;
    case 'run-file':
      exitCode = await commandRunFile(target, options);
      break;
    case 'validate-dir':
      exitCode = await commandValidateDir(target, options);
      break;
    case 'list':
      exitCode = await commandList(target, options);
      break;
    default:
      printUsage();
      exitCode = 1;
      break;
  }
  process.exit(exitCode);
}

main().catch((error) => {
  if (error instanceof MappingsCompileError) {
    console.error(formatMappingsDiagnostics(error.diagnostics));
    process.exit(2);
  }
  if (error instanceof MappingsRuntimeError) {
    console.error(formatMappingsRuntimeError(error));
    process.exit(2);
  }
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(3);
});
