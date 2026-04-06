#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { validateMappings, formatMappingsDiagnostics } from '../dist/index.js';

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: mappings <mapping-file.json>');
    process.exit(1);
  }

  const raw = await readFile(filePath, 'utf8');
  const source = JSON.parse(raw);
  const result = validateMappings(source);
  if (result.ok) {
    console.log(`OK: ${source.mappingId ?? '<unknown>'}`);
    return;
  }
  console.error(formatMappingsDiagnostics(result.diagnostics));
  process.exit(2);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(3);
});
