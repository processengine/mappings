/**
 * @processengine/mappings — benchmark script
 *
 * Measures three hot paths:
 *   1. compile()   — validation + deep clone + deep freeze (once-cost)
 *   2. execute()   — the production hot path: pure synchronous field processing
 *   3. run()       — compile + execute combined (one-off call cost)
 *
 * Run:
 *   node benchmarks/run.mjs
 */

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { compile, MappingEngine } = require("../src/index.js");

const engine = new MappingEngine();

// ---------------------------------------------------------------------------
// Test fixture — representative mapping with all operator types
// ---------------------------------------------------------------------------

const definition = {
  mappingId: "bench.normalize.v1",
  sources: { raw: "object" },
  output: {
    "client.phone": { removeNonDigits: "sources.raw.phone" },
    "client.email": { lowercase: "sources.raw.email" },
    "client.name": { normalizeSpaces: "sources.raw.fullName" },
    "client.currency": {
      mapValue: {
        from: "sources.raw.currencyCode",
        map: { RUR: "RUB", 643: "RUB", 840: "USD", 978: "EUR" },
        fallback: "passthrough",
      },
    },
    "client.gender": {
      transform: {
        from: "sources.raw.gender",
        steps: [
          { trim: true },
          { uppercase: true },
          {
            mapValue: {
              map: { M: "MALE", Ж: "FEMALE", F: "FEMALE" },
              fallback: null,
            },
          },
        ],
      },
    },
    "client.hasDocument": { exists: "sources.raw.documentNumber" },
    "client.orderId": { from: "sources.raw.orderId" },
    "meta.version": { literal: "v1" },
  },
};

const sources = {
  raw: {
    phone: "+7 (999) 111-22-33",
    email: "CUSTOMER@EXAMPLE.COM",
    fullName: "  Иван   Иванов  ",
    currencyCode: "RUR",
    gender: " m ",
    documentNumber: "4510 123456",
    orderId: "ORD-2025-001",
  },
};

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function bench(label, fn, iterations) {
  // Warm up
  for (let i = 0; i < Math.min(iterations * 0.05, 1000); i++) fn();

  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const elapsed = performance.now() - start;

  const opsPerSec = Math.round(iterations / (elapsed / 1000));
  const avgMs = (elapsed / iterations).toFixed(4);

  console.log(`${label}`);
  console.log(`  iterations : ${iterations.toLocaleString()}`);
  console.log(`  elapsed    : ${elapsed.toFixed(1)} ms`);
  console.log(`  ops/s      : ${opsPerSec.toLocaleString()}`);
  console.log(`  avg latency: ${avgMs} ms`);
  console.log();
}

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

console.log("=== @processengine/mappings benchmarks ===");
console.log(`Node.js ${process.version}`);
console.log();

// 1. compile() — once-cost: validation + deep clone + deep freeze
bench(
  "compile() — validation + clone + freeze",
  () => {
    compile(definition);
  },
  10_000,
);

// 2. execute() — hot path: compile once, execute many times
const compiled = compile(definition);
if (!compiled.success)
  throw new Error("Compile failed: " + compiled.error.message);
const { mapping } = compiled;

bench(
  "execute() — hot path (pre-compiled)",
  () => {
    mapping.execute(sources);
  },
  100_000,
);

// 3. run() — compile + execute combined (one-off call pattern)
bench(
  "run() — compile + execute (one-off)",
  () => {
    engine.run({ definition, sources });
  },
  10_000,
);
