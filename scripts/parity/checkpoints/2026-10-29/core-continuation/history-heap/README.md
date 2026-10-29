# History byte-budget heap evidence — 2026-10-29

This is a historical, bounded C10 retention proof. It does not record a fresh
acceptance run for a later combined source, a maximum-heap guarantee or a
latency benchmark. The tests use the existing `lifecycle.html` and
`tests/browser/heap-gate.mjs`; production code is unchanged.

## Source and retained evidence

The original baseline is `97fad198b493624ccd26fc7c61b435b1a14e4ae2`.
The tested two-file patch has SHA-256
`2be9917c2fdbab83465f0e5f42c9009e51cda84f1aa074cbaff7d5fb3de2f6af`.
The parent imported its exact contents as `0cf0cc72a12a2995e22e73cf75c2e29ef91bd476`;
that later integration needs its own fresh gate results.

The adjacent manifest, RED/GREEN JSON records and small original logs are
byte-for-byte copies of the isolated run artifacts. Their `/tmp` paths identify
the historical run, not required permanent paths. No heap snapshot, duplicate
source tree, dependency archive or generated build output is committed here.
The original manifest SHA-256 is
`093c2280d07aa84bcf662dea196c84dcaf09af3d775ed848fb1da3abb38bdc81`.
It contains file/runtime hashes and hashes of the original evidence artifacts.

Each run's `sourceBefore`/`sourceAfter` is SHA-256 of compact JSON pairs
`[trackedPath, sha256(fileBytes)]` in `git ls-files -z` order. The tracked paths
came from the isolated baseline; both edited test files were included. Equality
is recorded separately from command exit status. These hashes are not Git tree
IDs. The two valid runs have `sourceUnchanged: true`.

## Live-editor proof

A public editor remains mounted during all three snapshots. It uses
`historyMaxStack: 100`, `historyMaxBytes: 1`, twelve author edits and an exact
32 KiB ASCII body per measured payload. The count limit is not reached. The
newest complete oversized action remains undoable; earlier actions are evicted
under the configured byte budget. Initial configuration contains no measured
payload, so the proof concerns authored history rather than configuration
lifetime.

The matcher reads actual Chrome heap metadata: an object must have an own
property edge with the test marker name and a dynamically generated nonce/case
string. Source strings and returned CDP metadata cannot satisfy that predicate.
All CDP results are scalars. No array of old payloads is retained by the fixture.
A detached public payload snapshot for case 2 deliberately stays alive through
phase two, then is nulled before phase three. Cases 11/12 remain as live current
state and the latest history action.

Actual GREEN counts (array index zero is unused):

| Phase | Case 1 | Case 2 | Cases 3–10 | Case 11 | Case 12 |
| --- | ---: | ---: | ---: | ---: | ---: |
| After action 2, before repeated eviction | 1 | 3 | 0 | 0 | 0 |
| After action 12, public case-2 control held | 0 | 1 | 0 | 1 | 2 |
| After releasing that control | 0 | 0 | 0 | 1 | 2 |

The positive controls are required present, and the evicted cases required
absent. Exact multiplicities above are observations, not engine-independent
thresholds. Before and after GC, public Undo returns complete case 11, another
Undo returns false, Redo restores complete case 12, and another Redo returns
false. The assertions compare full data and block ID/type/dataVersion. Only
after this proof is the editor destroyed: all **23** lifecycle WeakRef sentinels
then become unreachable (**0** alive). That cleanup result is distinct from the
live-editor retention evidence.

## Sensitivity RED and valid GREEN

The first valid run deliberately held one extra public snapshot immediately
after `update(1)`:

```js
window.__historyHeapIntentionalLeak = editor.blocks.get('heap').data.payload
```

Its cleanup removed that property. The gate and its assertions were unchanged.
The actual exit was 1, with after-eviction counts
`[0,1,1,0,0,0,0,0,0,0,0,1,2]` and the exact failure:

```text
after-eviction: evicted history payload 1 retained after GC; counts=[0,1,1,0,0,0,0,0,0,0,0,1,2]
```

This is deliberate gate-sensitivity evidence, **not a production defect or
runtime repair**. Removing only that intentional extra reference produced the
valid exit-0 GREEN recorded alongside it. An earlier attempt failed because
the test definition omitted its mandatory runtime `destroy()` method; it
stopped before history snapshots and is explicitly excluded from the RED/GREEN
proof. Its hashes remain in the manifest for traceability.

Both valid runs used Node **v24.22.1**, Linux x64, Chrome **142.0.7444.175** and
browser V8 **14.2.231.21**. Their full environment, UTC timestamps, durations,
source identities, scalar counts and observed heap sizes are in the JSON/logs.
Serialized history bytes, total heap size and reclaimed memory are different
quantities; observed heap MiB values are not pass thresholds or freed-byte
claims.

Run the current source through the existing gate:

```sh
EDITOR_CHROME_PATH=/path/to/chrome node tests/browser/heap-gate.mjs
```

Use a fresh output directory and the current verification manifest for a new
acceptance run. To reproduce sensitivity, apply only the extra held snapshot
above plus deletion in the fixture's `dispose()`, then restore those two lines
before the ordinary gate. Do not weaken the absent-object assertions.

## Review and limits

An independent read-only review checked the exact patch, heap-edge matcher,
CDP `returnByValue`, temporary expectations, replay and cleanup. It found no
blocking issue and did not claim an independent browser rerun. Syntax checks
for both test files and `git diff --check` passed. The original five relevant
production-owner hashes remained identical to the baseline.

This proves one twelve-action JSON-payload scenario with the newest-whole-action
exception. It does not establish all payload shapes, all browsers, arbitrary
budgets, a memory SLA, native-input performance, or full C09 structural
benchmark acceptance.
