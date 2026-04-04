# Benchmarks: @processengine/mappings

## What is measured

Three scenarios covering the library's hot paths:

1. **`compile()`** — definition validation + deep clone + deep freeze (once-cost at startup)
2. **`execute()`** — the production hot path: pre-compiled mapping executed against sources
3. **`run()`** — `compile()` + `execute()` combined (one-off call pattern)

The benchmark uses a representative mapping with all operator types: `from`, `literal`, `exists`, `removeNonDigits`, `lowercase`, `normalizeSpaces`, `mapValue`, and `transform` with three steps.

## Run

```bash
node benchmarks/run.mjs
```

## Example output (Node.js v22, Apple M-series)

```
compile() — validation + clone + freeze
  iterations : 10,000
  elapsed    : 250 ms
  ops/s      : ~40,000
  avg latency: 0.025 ms

execute() — hot path (pre-compiled)
  iterations : 100,000
  elapsed    : 536 ms
  ops/s      : ~187,000
  avg latency: 0.005 ms

run() — compile + execute (one-off)
  iterations : 10,000
  elapsed    : 252 ms
  ops/s      : ~40,000
  avg latency: 0.025 ms
```

## Reading the numbers

**`execute()` is ~5× faster than `compile()`** — this is the expected result of the compile-first pattern. In production, `compile()` is called once at startup; `execute()` is called on every request.

**`compile()` overhead (~25 µs)** comes almost entirely from `JSON.parse(JSON.stringify(definition))` + recursive `Object.freeze` on the deep clone. This is the price of immutability. It is a one-time cost.

**`run()` ≈ `compile()`** — confirms that `run()` is purely sugar over `compile() + execute()` with negligible overhead beyond the compile step.

## What these numbers mean in practice

At ~187,000 `execute()` ops/s on a single core, the library is not a bottleneck in any realistic service scenario. The meaningful latency in any processengine flow step is dominated by I/O (database reads, message broker round-trips, external service calls), not by the mapping layer.

Use these benchmarks for **regression detection** — to notice if a change in the library unexpectedly increases per-call latency.

## Notes

- Run on an idle machine without other CPU-intensive processes
- Compare results only within the same Node.js version and hardware
- Warm-up runs are included in the script; do not disable them
- Results vary with the complexity of the mapping definition; the provided fixture is representative but not exhaustive

## Scope and limitations

These benchmarks measure the library itself: validation, compilation, and in-process execution. They do **not** include:

- network I/O or database round-trips
- message broker latency
- host-application scheduler overhead
- JSON serialization/deserialization of sources from external input

Use them for regression detection within the library. End-to-end production throughput depends entirely on the host environment.
