#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { MappingEngine, compile } = require('../src/index.js');

const engine = new MappingEngine();
const args = process.argv.slice(2);
const command = args[0];

// ---------------------------------------------------------------------------
// Вспомогательные функции
// ---------------------------------------------------------------------------

function readJSON(filePath) {
  const content = fs.readFileSync(path.resolve(filePath), 'utf8');
  return JSON.parse(content);
}

/** Вывод результата: JSON или pretty-print в зависимости от флага --json */
function output(obj, isJson) {
  console.log(JSON.stringify(obj, null, isJson ? 0 : 2));
}

/** Вывод ошибки и завершение с кодом 1 */
function fail(obj, isJson) {
  if (isJson) {
    console.log(JSON.stringify(obj));
  } else {
    // Для человека — читаемый вывод
    if (obj.error) {
      const e = obj.error;
      const parts = [`[${e.code}] ${e.message}`];
      if (e.phase)      parts.push(`phase: ${e.phase}`);
      if (e.targetPath) parts.push(`target: ${e.targetPath}`);
      if (e.operator)   parts.push(`operator: ${e.operator}`);
      if (e.from)       parts.push(`from: ${e.from}`);
      if (e.stepIndex !== undefined) parts.push(`step: ${e.stepIndex}`);
      console.error(parts.join('  '));
    } else {
      console.error(JSON.stringify(obj, null, 2));
    }
  }
  process.exit(1);
}

function findOption(argList, flag) {
  const idx = argList.indexOf(flag);
  if (idx === -1 || idx + 1 >= argList.length) return null;
  return argList[idx + 1];
}

function hasFlag(argList, flag) {
  return argList.includes(flag);
}

function findJsonFiles(dir) {
  const results = [];
  function walk(d) {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); }
    catch (e) { console.error(`Cannot read directory: ${d}`); process.exit(1); }
    for (const entry of entries) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.json')) results.push(full);
    }
  }
  walk(dir);
  return results;
}

function exitWithUsage() {
  console.error([
    'Usage: mappings <command> [options]',
    '',
    'Commands:',
    '  validate-file <file> [--json]',
    '      Compile and validate a single mapping definition file.',
    '',
    '  compile <file> [--json]',
    '      Compile a mapping definition and report compile errors.',
    '',
    '  run-file <file> --sources <sources.json> [--trace] [--json]',
    '      Run a mapping definition file against the provided sources.',
    '',
    '  validate-dir <directory> [--json]',
    '      Validate all *.json files in a directory (recursive).',
    '',
    '  list <directory>',
    '      List all mapping IDs found in a directory.',
    '',
    'Options:',
    '  --json    Machine-readable JSON output (for CI/CD integration)',
    '  --trace   Include trace in run-file output',
    '  --sources Path to sources JSON file (required for run-file)',
  ].join('\n'));
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Команды
// ---------------------------------------------------------------------------

switch (command) {

  // validate-file: компилирует и сообщает о результате
  case 'validate-file': {
    const filePath = args[1];
    const isJson = hasFlag(args, '--json');
    if (!filePath) exitWithUsage();

    let definition;
    try { definition = readJSON(filePath); }
    catch (e) {
      fail({ status: 'MAPPING_ERROR', error: { code: 'PARSE_ERROR', message: e.message, phase: 'compile' } }, isJson);
    }

    const result = engine.validate(definition);
    if (result.status === 'SUCCESS') {
      output(result, isJson);
      process.exit(0);
    } else {
      fail(result, isJson);
    }
    break;
  }

  // compile: явная команда компиляции
  case 'compile': {
    const filePath = args[1];
    const isJson = hasFlag(args, '--json');
    if (!filePath) exitWithUsage();

    let definition;
    try { definition = readJSON(filePath); }
    catch (e) {
      fail({ status: 'MAPPING_ERROR', error: { code: 'PARSE_ERROR', message: e.message, phase: 'compile' } }, isJson);
    }

    const result = compile(definition);
    if (result.success) {
      const out = { status: 'SUCCESS', mappingId: result.mapping.mappingId };
      output(out, isJson);
      process.exit(0);
    } else {
      fail({ status: 'MAPPING_ERROR', error: result.error }, isJson);
    }
    break;
  }

  // run-file: компилирует и исполняет
  case 'run-file': {
    const filePath = args[1];
    const sourcesPath = findOption(args, '--sources');
    const withTrace = hasFlag(args, '--trace');
    const isJson = hasFlag(args, '--json');

    if (!filePath || !sourcesPath) exitWithUsage();

    let definition, sources;
    try { definition = readJSON(filePath); }
    catch (e) {
      fail({ status: 'MAPPING_ERROR', error: { code: 'PARSE_ERROR', message: `mapping file: ${e.message}`, phase: 'compile' } }, isJson);
    }
    try { sources = readJSON(sourcesPath); }
    catch (e) {
      fail({ status: 'MAPPING_ERROR', error: { code: 'PARSE_ERROR', message: `sources file: ${e.message}`, phase: 'execute' } }, isJson);
    }

    const result = engine.run({ definition, sources, trace: withTrace });
    if (result.status === 'SUCCESS') {
      output(result, isJson);
      process.exit(0);
    } else {
      fail(result, isJson);
    }
    break;
  }

  // validate-dir: проверяет все *.json с mappingId
  case 'validate-dir': {
    const dirPath = args[1];
    const isJson = hasFlag(args, '--json');
    if (!dirPath) exitWithUsage();

    const files = findJsonFiles(dirPath);
    if (files.length === 0) {
      if (isJson) output({ status: 'SUCCESS', files: [], skipped: 0 }, true);
      else console.log('No JSON files found.');
      process.exit(0);
    }

    let allOk = true;
    let skipped = 0;
    const results = [];

    for (const file of files) {
      let definition;
      try { definition = readJSON(file); }
      catch (e) {
        allOk = false;
        results.push({ file, status: 'PARSE_ERROR', error: e.message });
        if (!isJson) {
          console.log(`ERR  ${file}`);
          console.log(`     parse error: ${e.message}`);
        }
        continue;
      }
      // Пропускаем файлы без mappingId — они не являются сценариями маппинга
      if (!definition || typeof definition.mappingId === 'undefined') {
        skipped++;
        continue;
      }
      const result = engine.validate(definition);
      if (result.status === 'SUCCESS') {
        results.push({ file, status: 'SUCCESS', mappingId: result.mappingId });
        if (!isJson) console.log(`OK   ${file}`);
      } else {
        allOk = false;
        results.push({ file, status: 'MAPPING_ERROR', mappingId: result.mappingId, error: result.error });
        if (!isJson) {
          console.log(`ERR  ${file}`);
          const e = result.error;
          const parts = [`[${e.code}] ${e.message}`];
          if (e.targetPath) parts.push(`target: ${e.targetPath}`);
          console.log(`     ${parts.join('  ')}`);
        }
      }
    }
    if (!isJson && skipped > 0) {
      console.log(`     (${skipped} file(s) skipped — no mappingId field)`);
    }
    if (isJson) {
      output({ allOk, skipped, results }, true);
    }
    process.exit(allOk ? 0 : 1);
    break;
  }

  // list: выводит mappingId → путь
  case 'list': {
    const dirPath = args[1];
    if (!dirPath) exitWithUsage();

    const files = findJsonFiles(dirPath);
    if (files.length === 0) {
      console.log('No JSON files found.');
      process.exit(0);
    }

    for (const file of files) {
      let definition;
      try { definition = readJSON(file); }
      catch (e) { console.log(`(parse error)\t${file}`); continue; }
      const mappingId = (definition && typeof definition.mappingId === 'string')
        ? definition.mappingId
        : '(no mappingId)';
      console.log(`${mappingId}\t${file}`);
    }
    break;
  }

  default:
    exitWithUsage();
}
