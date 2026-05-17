# @processengine/mappings v3 examples

These examples use the Flow 5 v3 contract: one input object, explicit `kind`, and `{ output }` runtime results.

- `mappings/client_payload.json` — `kind: payload`
- `mappings/comparison_facts.json` — `kind: facts`
- `mappings/reject_result.json` — `kind: result`
- `basic.cjs` / `basic.mjs` — package import smoke examples

## Negative examples

`examples/invalid/*.json.example` contains invalid artifacts used as documentation for patterns that v3 rejects:

- legacy `sources` and `sources.*` paths;
- prototype-pollution target paths;
- result mappings without `status`;
- implicit `collect.select` selectors;
- removed `pickFirst` operator.

These files intentionally use `.json.example`, not `.json`, so normal `validate-dir examples` smoke checks only validate runnable examples.

## Flow 5 interop fixtures

`examples/interop/` contains local contract-shaped fixtures showing how mappings output is intended to sit in Flow 5:

- `payload_to_dataflow_item.json`;
- `facts_to_decisions.json`;
- `result_to_terminal_resultRef.json`.
