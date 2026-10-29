# Core continuation evidence — 2026-10-29

This checkpoint retains actual intermediate verification for C12 presentation
recovery, C09 public snapshots and C07 phase types. It does not declare complete
library parity or turn a focused result into a full-suite pass. The repository
specification owns semantics; the adjacent presentation decision archive keeps
the rejected whole-block reconstruction comparison.

## Presentation recovery

The settled contract contains a failed projection at the affected field. Healthy
siblings retain their native DOM, backward ranges, inline occurrences, tasks and
pending trusted input. Failed descriptors are absent from authoring until an
explicit changed descriptor/content permits another attempt. Repeated queries
do not retry unchanged failures. The original failure is reported once for the
attempt; independent observer deliveries continue. Initial/canonical/mode
projection failures keep their existing preparation, rollback and terminal
recovery owners.

Ownership is rechecked after extension and cancellation callbacks. A matching
ID, failed-attempt memo or new ancestor capture cannot reclaim a foreign field
or shell. Mode validation happens before the inline owner accepts the new mode,
including block-task abort callbacks. Failed inverse callbacks still use the
existing reconstruction/failed-control path. No public recovery API, scheduler,
second canonical store or general retry manager is introduced.

Actual TDD stages in `verification-records.json` include initial 18 failures out
of 19 ordinary cases, expanded 52/55 ordinary and 8/14 native failures, and eight
additional mode-callback failures against the earlier repair. The final v9
focused run passes **63/63 ordinary and 14/14 native** cases on a clean unchanged
source. Native checks include genuine IME/preedit, trusted pending input,
backward selection, same-block/independent tasks and a second editor. Forged,
synthetic, stale and unsafe DOM controls do not acquire native preservation.

The first combined unit run passed 1960/1962 and remains recorded as failed.
Two old reconciler tests expected automatic retries of an unchanged failed
descriptor, contrary to the now-settled contract, and their fake HTMLElement
lacked attribute behavior needed by containment. The updated tests require the
same original error, zero repeated attempts, absent failed descriptors and a
successful explicit new field/mode attempt. The fake reflects standard
contenteditable attributes. No production fallback was added for the fake.
The subsequent complete unit run is **1962/1962**, with both checkJs projects
passing on clean unchanged `066b5aa8`.

## Detached public snapshots

Runtime queries, producer inputs and view conversion already transfer detached
owned records. The public adapter previously cloned those records again. It now
freezes the public envelope directly while keeping this caller's nested payload
mutable and isolated from the model, other reads, history and immutable events.
External input still crosses the strict JSON boundary; freezing caller input is
not evidence of private ownership.

The 12 tests first gave **7 PASS / 5 RED**, then **12 PASS**. They cover nested
data/tunes/opaque sidecars, retained inputs/results, draft composition, falsy
rollback, accessor capture/reentry, invalid frozen Map input, real conversion,
no-ops and absent records. The measured payload visits fall from two to one per
query record and from three to two before a public producer receives its input.

`public-snapshot-comparison.json` retains all samples, environment and source
hashes from the independent frozen comparison. Run it again with:

```sh
node benchmarks/public-snapshots.mjs /path/to/baseline /path/to/candidate
```

The benchmark exercises the synchronous public adapter plus real runtime,
schema, store, history and event path, using the default no-op projection.
Construction is excluded. It alternates variant order, retains 21 samples and
checks actual commit/revision counts. These are measured medians, not latency
guarantees:

| Input / operation | Baseline | Candidate |
| --- | ---: | ---: |
| 287-byte document, get | 0.0150 ms | 0.0080 ms |
| 141,039-byte, three-block structured document, get | 2.1126 ms | 0.9466 ms |
| Same document, list | 5.9410 ms | 2.7512 ms |
| Same document, iterator | 8.1374 ms | 2.9077 ms |
| Small complete update/commit | 0.1575 ms | 0.1576 ms |
| Large complete update/commit | 34.0564 ms | 33.1009 ms |

Small complete edits are effectively unchanged in this sample. This evidence
does not measure DOM/paint, native input, allocation/retained memory or full
Table/Gallery/Columns authoring; those T15 obligations remain separate. It is
not evidence of a general editor speedup.

## Phase types

The existing core type owner now describes all eleven actual transaction states.
The effective runtime admission context extends that union with five invocation
contexts; it does not add engine states. Health and scope lifetime stay separate.
Only three JavaScript owners' JSDoc changes; executable AST and emitted JavaScript
without comments remain identical. No new runtime or public entrypoint appears.

Two generated-consumer TDD cycles first rejected the overly broad `string`
getter/callback, then passed all seven declaration checks in strict NodeNext and
Bundler modes. Tests derive their contracts from the actual generated engine
getter and scope callback, with valid values, exhaustive handling and rejected
typos/context/health/lifetime mixtures. Existing owner suites passed 250/250;
the later combined 1962-test run includes these changes.

## Evidence boundaries

Every retained command record has its actual source identity, environment,
timestamps, outcome and before/after checks. A failed manifest is not relabeled
as successful. Original local verification commits and later publication commits
can differ; the publication map records verified exact trees where published.
The snapshot benchmark has its own earlier source pair, not the later combined
integration source. Full native, heap, installed-package and documentation gates
for the combined continuation must be recorded separately before adoption.
