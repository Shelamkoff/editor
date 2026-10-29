# Core continuation evidence — 2026-10-29

This checkpoint retains actual intermediate and combined verification for C12
presentation recovery, C09 public snapshots, C07 phase types and C10 retention.
It does not declare complete
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
integration source. The completed combined gates are recorded separately below.

## Combined source and actual final gates

`final-verification.json` retains the original completed command manifests,
per-command log hashes and observed summaries. The clean frozen integration is
`0cf0cc72a12a2995e22e73cf75c2e29ef91bd476`, tree
`ad395ef5ca1b812033e129baf7fef5149ca47661`. Its complete runs passed with source
identity unchanged before and after every command:

| Gate | Actual result | Command duration |
| --- | --- | ---: |
| Unit | 1962 passed, no failures or skips | 27.964 s |
| checkJs | Both projects passed | 14.675 s |
| Ordinary browser | All 35 registered pages passed | 38.446 s |
| Native browser | 2128 passed across 41 arrays; base Enter/toolbox/history scenarios also completed | 968.422 s |
| Live heap and disposal | Evicted authored payloads absent; live/control objects present as expected; 23 disposal sentinels, zero retained | 12.193 s |
| Installed package | Bundler/NodeNext, Vite, native ESM, external browser and 22 CSS assets passed | 44.685 s |
| Documentation contracts | Source, locale, README and documentation audits passed | 5.038 s |
| Three-source roundtrip | 28 candidate cases, 4632 observations, zero candidate failures | 55.436 s |

The native totals include the 14 genuine-input presentation cases. The ordinary
pages include all 63 presentation and 60 projection contracts plus the nine
optional-inline cases. Counts from focused runs overlap these totals; they are
not added together. Environment is Linux x64, Node v24.22.1 and Chromium
142.0.7444.175. This does not establish other browser engines or manual OS IME.

The same production/test core was integrated as main source
`1b1db09196fd96b4377b167346385762a3972838`, published with its exact tree as
`0fecf490fe8a57188ac9edb502d2803743c29883`. Compared with the frozen integration,
only the ten listed parity fixture/documentation files differ: they add Spoiler
and Columns evidence. A separate clean unchanged run on that merged main passed
all 34 candidate roundtrips / 5706 observations and all 34 native roundtrips.
Its command durations are 65.182 s and 29.070 s. Historical v1 differences remain
classified exactly, and ten specification-baseline cases remain incomplete.

The actual final heap counts match the bounded C10 control: after eviction,
only the deliberately held case-2 public snapshot and live cases 11/12 remain;
after releasing the public snapshot, cases 1–10 are absent while 11/12 remain.
Undo/Redo still restores the full latest action in the living editor. See
`history-heap/README.md` for the earlier sensitivity RED and its limitations.

`inline-range/README.md` retains the measured quadratic-to-linear decision and
replay inputs. The Image-derived-alt problem remains open, independently of
the now-tested range repair. `structural-benchmark-audit.md` identifies the
uncompleted Table/Gallery/Columns/native/UI/allocation parts of C09/T15; it is
a read-only evidence audit, not a new timing run or proof of a runtime defect.

## Reconstructing the exact integration sources

The published main has newer parity fixtures, so its whole tree differs from
the earlier integration even though the production files match. The compact
`integration-source-map.json` preserves the original commit objects and exact
changed blob IDs for all 25 integration commits from published `efae6d0e` through
the frozen source. All 88 distinct referenced blobs were verified reachable
from the published branch. This avoids storing another copy of the source.

After fetching the branch, run from the repository root:

```sh
python3 scripts/parity/checkpoints/2026-10-29/core-continuation/restore-integration-source.py
git worktree add --detach /tmp/rector-core-replay 0cf0cc72a12a2995e22e73cf75c2e29ef91bd476
```

The restorer checks the original Git commit hashes, linear parents and every
reconstructed tree using a temporary index. It writes Git objects and one
dedicated `refs/rector-checkpoints/integration-...` ref; it does not change the
current branch, real index or working files. The actual restoration verified
all 25 trees, and a deliberately mismatched source-map tree was rejected before
restoration without touching the real index or files. Install dependencies
from the frozen lockfile in the disposable worktree before running its gates.

The separate inline benchmark replay reconstructs only its measured historical
modules from published `fcd7fbc4`. A fresh parent `--prepare-only` check verified
all 258 recorded module hashes and three lockfiles; no additional browser timing
run was performed. The first sandbox attempt could not spawn Git and was not a
source failure; the completed reconstruction used the permitted process runner.
