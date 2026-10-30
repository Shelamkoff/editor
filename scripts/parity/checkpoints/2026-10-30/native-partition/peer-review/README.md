# Independent review: native page partition

**Verdict: no blocking findings in `d06547af677fc55152bd2d6e3f0df9b941eeb159`.**
The final five pages retain exactly the original 444 distinct scenarios. The
shipping page deadline stays at 120 seconds, and the fixture callbacks, native
input driver, error handling, selection filter and assertions remain unchanged.

The original monolithic page was also executed independently, in its original
case order and shared page scope. All 444 scenarios passed after **198.718
seconds of page elapsed time**, using a diagnostic-only 360-second deadline.
This directly supports the page-capacity explanation for the original timeout.
It does not replace or relabel that failed run.

## Source identities

| Role | Commit |
| --- | --- |
| Original failed full matrix and monolithic diagnostic | `8e22c752a1712c0a8c3908f59fe65a2d25e1db1b` |
| Metadata-only parent of the partition | `cd446e5866d09881011176d881278fff6449c6ef` |
| Intermediate four-page partition | `8e626f6f9332a887c4b8de8894cdd702c9cc4707` |
| Reviewed final five-page partition | `d06547af677fc55152bd2d6e3f0df9b941eeb159` |

The original and metadata parent have identical runtime, fixtures and runners.
The complete partition patch changes eleven files, all under `tests/browser`:
four HTML/JS entry pairs, the original page entry, the physical runner and its
README. It changes no production code or fixture callback. Relevant immutable
source snapshots and tree identities are in `sources.json.gz`; the full shipping
diff is `shipping-partition.patch.gz`.

## Original failure and independent diagnosis

`original/manifest.json.gz` and `original/native-browser.log` preserve
`run-ph5JBn`: eleven gates passed, and `native-browser` exited with code 1 at the
120-second page deadline. The source stayed at `8e22c752`. The failing runner
frame identifies `native-plugin-parity.html`; its results had not yet been
published by the page harness.

The independent diagnostic used an isolated worktree at that exact source.
Its only tracked overlay changed `waitForHistoryMatrix` from `120_000` to
`360_000`. The overlay SHA-256 is
`2ac6a2714a5a7d58506a9fa90db6b90b4b59dd33183d14429b1a43cda2dbff12`.
No fixture, callback, assertion, native input function or production source was
modified. The run had no case filter.

The actual process exited with code 0, with 444 PASS results and empty stderr.
The source and diagnostic overlay remained unchanged throughout execution.
The original runner bytes were restored afterward; the 360-second deadline is
not part of the shipping fix.

| Measurement | Observed value |
| --- | ---: |
| Browser navigation time origin to received native completion line | 198.718 seconds |
| Page load end relative to navigation | 0.325 seconds |
| Whole diagnostic process, including startup and cleanup | 204.404 seconds |
| Completed original scenarios | 444 / 444 |

The page measurement uses a passive CDP read of `performance.timeOrigin` and the
supervisor timestamp of the runner's `Native … 444 passed` line. It includes
page load and final polling/CDP/stdout latency; it excludes Vite/Chrome startup
and process cleanup. It is not a product performance measurement or an exact
timer around the test callbacks. Those boundary differences cannot account for
the approximately 78.7-second excess over the shipping page budget.

The recorder could not discover its Chrome child through `/proc`. Consequently
its internal `observerExitCode` is null. The same passive clock observer was
invoked separately once, exited with code 0, and detached after reading the
running plugin page's clock. `diagnostic/observer-invocation.json` preserves
that distinction. It wrote no DOM state and installed no native input binding.
The monolithic test process was not restarted.

`diagnostic/stdout.log.gz` retains the exact raw output (uncompressed SHA-256
`000d337271412e7e9ec325530468a6a88d942d22b448a4a162a44bc9372b8ae2`).
`diagnostic/process.json`, the original overlay, passive observer, and exact
executed recorder source accompany it. The recorder was originally executed
from `test-results/native-partition-peer/`; it is retained here as execution
provenance rather than as an automatically runnable test command from this
archive directory.

## Final partition and execution evidence

| Final page | Actual cases | Recorded process duration | Actual executed source |
| --- | ---: | ---: | --- |
| `native-plugin-parity.html` | 333 | 89.603 seconds | `d06547af` |
| `native-block-settings.html` | 33 | 37.246 seconds | `d06547af` |
| `native-code-source-language.html` | 20 | 52.201 seconds | `8e626f6f` |
| `native-person-modes.html` | 28 | 28.967 seconds | `8e626f6f` |
| `native-table-keyboard.html` | 30 | 22.470 seconds | `8e626f6f` |

Every listed run completed with actual exit code 0 and unchanged source.
These durations include process startup and cleanup; they are not individual
page measurements. The final 333-case page provides substantially more room
under the existing deadline than the intermediate 366-case page, whose complete
process lasted 121.342 seconds. The intermediate result remains archived as a
successful intermediate run, with its own exact source identity.

The Code, Person and Table results retain their real intermediate execution
SHA. Their HTML, entry modules, callback modules, runtime, driver and single-page
runner behavior are identical in the final source. The final commit only
extracts two other modules into the new settings page and adds that page to the
full-run branch. These three earlier focused results are not relabeled as
fresh executions at `d06547af`.

The reviewer compared multisets and per-group order, not merely totals:

- The original registration inventory matches the independently executed
  monolithic result order, with 444 distinct names.
- The intermediate 366 + 20 + 28 + 30 actual results preserve that exact multiset.
- The final registration inventory is 333 + 33 + 20 + 28 + 30, without omitted
  or duplicate names.
- The final two new executions and the three unchanged focused executions
  match the final per-page inventories exactly.

Registration-only instrumentation is retained separately from execution
evidence. It observes real module registrations but skips callbacks; it does
not count as a passing fixture run. The full raw stdout, stderr, process records
and registration scripts are retained in `intermediate-evidence.json.gz` and
`final-evidence.json.gz`.

## Contract review

Removing precisely five import lines from the original page entry produces the
final entry byte for byte. The four new modules import those same five callback
modules and then call the same `run()` function. Normalizing only each HTML title
and module entry filename leaves the original style links, body CSS, markup and
native input driver import unchanged.

Removing four added `await runNativePage(...)` calls and their four aggregate
fields from the final runner produces the original runner byte for byte. Each
new group is awaited exactly once and included exactly once in the final JSON.
No error catch, retry, timeout relaxation or alternate assertion path was added.

The unchanged runner still forwards the literal `EDITOR_NATIVE_FILTER` as
`test-filter`; the unchanged harness uses substring matching. An empty match
still fails through the runner's nonempty-result assertion. The extracted
families now use their documented new page filenames. These filter and error
properties were reviewed through byte identity and source inspection; this
peer review did not add redundant browser runs for unchanged functions.

Unexpected browser errors and rejected native input still fail the run. The
120-second page deadline, 10-second normal case deadline, 20-second load deadline
and 30-second CDP command deadline are unchanged.

## Limits and offline audit

The independent diagnostic establishes that all 444 original cases complete
in their original shared page and order. It does not establish every possible
cross-page interaction after the full native gate's preceding pages. The root
agent owns that complete sequential native gate on the final source; no such
result is claimed by this peer archive. Browser evidence here is Chrome
156.0.8078.79 on Linux with Node 24.22.1.

Run the self-contained evidence audit from the repository root:

```sh
python3 scripts/parity/checkpoints/2026-10-30/native-partition/peer-review/audit.py
```

It checks archived payload hashes, immutable source relations, the unchanged
deadline and failure contracts, original failed process records, the diagnostic
overlay and timing, actual process outcomes, and all 444 names across both
partitions. It requires neither a browser nor the original scratch worktrees and
does not re-execute fixture callbacks. `manifest.json` fingerprints every other
file in this peer archive.
