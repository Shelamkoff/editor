# Trusted ordinary native no-op completion

This bounded repair is based on published source
`69c8425e0081fde69cf5176ccb73d032720c15fc`. Its final tested source is
`5fd7144a7aac3bbfa18d868d65cbe296dd234e90`. All recorded timestamps are UTC.
It does not accept a complete plugin ROUNDTRIP row or whole-library parity.

## Observed problem and implementation

The existing retained-source completion path runs during canonical projection
when a declared rich-text value changes. A real browser replacement of the last
`l` in `Note a-note tail` with another `l` settled ordinary author DOM, but produced
equal canonical records. DocumentRuntime correctly skipped the transaction and
history; the field's optional completion was also skipped. A completion that
should have thrown therefore never reached the existing recovery boundary.

NativeInputController now uses its existing trusted beforeinput envelope. Only
a matching trusted input for the same field element, address, generation,
revision and mode epoch can request the new no-op completion. Cancelled or stale
envelopes, synthetic input, nonretained sources and plain controls cannot request
it. No new pending owner, registry, observer, public API or scheduling mechanism
is introduced.

The already-admitted frozen descriptor is captured once inside the existing
protected synchronization operation, before the projection read. The captured
key, mode and HTMLElement must match the native owner. DocumentRuntime computes
canonical equality once and invokes its existing internal finalizer under the
same fallible synchronization boundary. That port is now named
`finalizeNativeProjection(next, changed)`; the existing inline caller uses the
same port and still returns its existing successful-field deduplication key.
There is no old-name compatibility alias.

Ordinary input requests completion only when canonical data is unchanged. The
existing changed-source schema, ownership and hydration path remains responsible
for changed values. This distinction matters: that later path can detect an
extension schema callback transferring the source shell. The new no-op repair
does not perform an early auxiliary write ahead of those changed-source checks.
BlockReconciler remains the completion admission owner and revalidates the same
captured field after protected reads. No extra history action is manufactured.

The equality calculation precedes the internal finalizer, which changes owned
DOM and instance caches, not the assembled canonical record. Existing inline
normalization, falsy failure, removal and exact-field deduplication controls pass
on the final source.

## Test-first sequence

| Source and run | Actual observation |
| --- | --- |
| `a6863077`, `run-ysyhCc` | One real same-character replacement: trusted input and unchanged canonical/history assertions passed; the expected one completion was absent. |
| `a00c3728`, `run-yHfJQi` | Both same-character completion and its throwing-callback recovery control failed for the missing completion. This repeats the RED with the fresh dependency installation. |
| `e992e176`, `run-fXLYNY` | Initial repair: eight source-completion and six inline-completion cases passed. |
| `11e91a50`, `run-9TZbNd` / `run-kvns9p` | 287 affected Node tests, both checkJs projects and eleven source-completion cases passed. These outcomes belong to this intermediate source. |
| `cea09063`, `run-Ecxvr9` | A review control exposed a regression in the initial repair: a throwing descriptor hook left actual `tailX` DOM while canonical data still held `tail`. |
| `5fd7144a`, `run-aDFlkg` | Final repair: capture moved into the existing synchronization operation; all final gates below passed. |

The descriptor-capture RED is preserved as a real failure of the intermediate
repair. Its error was armed by the target's actual trusted input, before the
controller's bubble handler. The first implementation called the fallible
descriptor hook before entering synchronization recovery. Moving that capture
inside the existing operation restores coherent accepted content on failure.
The original failed manifest and log are not relabeled as passed.

## Final executed gates

| Gate on `5fd7144a` | Result |
| --- | --- |
| Source completion native controls | 12/12 PASS |
| Existing inline completion native controls | 6/6 PASS |
| NativeInputController, DocumentRuntime, BlockReconciler, InlineWidgetInputController and TransactionEngine Node suites | 287/287 PASS, zero failed/cancelled/skipped/todo |
| Both repository checkJs configurations | PASS |

Every gate in the seven retained C11 attempts records unchanged source. Their
source snapshots are clean, with physical independent dependencies rather than
an untracked dependency symlink. The gate counts overlap earlier runs and must
not be added together as independent coverage.

The real-browser cases prove one exact frozen descriptor with the original
receiver, no canonical action for the successful no-op, coherent recovery after
a throwing completion, and an ordinary later edit with one Undo/Redo. A schema
callback transferring the captured block shell cannot obtain completion or
overwrite its foreign auxiliary sentinel; recovery preserves the foreign shell.
Actual INPUT and TEXTAREA replacements retain normal editing/history and receive
no rich completion. Existing changed-source adoption, throwing-schema,
author-mutation, same-key successor and inline normalization controls remain
unchanged and pass.

Controller-port unit controls separately check captured-descriptor identity,
no descriptor recapture by the finalizer, synthetic beforeinput/input pairs,
cancelled and stale envelopes, and no new finalizer for paste/drop/cut. Those
port controls are not claimed as additional physical clipboard executions.
The repair is scoped to ordinary matching beforeinput/input settlement; it does
not add a new composition-session protocol.

## Environment, provenance and reproduction

The final browser is Chrome for Testing `156.0.8078.47`, Linux, with Node
`v24.22.1`. The first one-case RED used the initial independent dependency copy.
The same RED was repeated after copying the fresh root installation, and all
subsequent runs use that copy. The focused core fixture does not import Carousel;
nevertheless the final installed Carousel tree was compared with the fresh
root installation and all 51 files matched the locked Git revision
`f7f6485886a1d77f9213d9079eb70000efeff499`.

`verification.json` records every source, command, timestamp, observed verdict,
source-before/source-after identity, raw and stored hash. Original manifests are
unchanged; logs are compressed losslessly with deterministic gzip timestamps.
The six source patches are relative to the published base and include the exact
original commit objects. `runtime-and-spec.patch` contains the complete bounded
production and contract diff. Source hashes are for the actual final tested
files, before this evidence-only checkpoint was added.

Use the normal repository recorder and runners from an isolated checkout:

```sh
node scripts/verification-results.mjs init source-completion inline-completion affected-node typecheck
```

Set `EDITOR_RESULTS_DIR` to that returned directory and `EDITOR_CHROME_PATH` to
the installed browser. For native gates use
`EDITOR_NATIVE_PAGE=native-library-boundaries.html` and respectively
`EDITOR_NATIVE_FILTER='field source completion'` or
`EDITOR_NATIVE_FILTER='field completion native'`, then invoke
`node tests/browser/physical-history.mjs` through the recorder. Exact Node suite
arguments and both typecheck commands are retained in the final manifest.
Always initialize a fresh recorder attempt; do not reuse a completed gate.

Whole-library integration and publication belong to the parent branch's later
gates. This checkpoint makes no claim that those later source combinations were
executed here.
