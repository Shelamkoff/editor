# Reproducible comparative audit

`Rector v2 comparative audit` supplements the eight `Verify library` jobs. It runs
on pushes to `fix/rector-v2-audit-2026-11-06` and can also be dispatched manually.
It does not reduce the ordinary browser or 159-page native inventory.

The workflow checks out the exact commit with full history, requires a clean
source tree, installs the locked package dependencies and builds the package.
The comparative, structural and focused jobs install Playwright 1.62.1 and its
matching Chromium 151 runtime separately from the checkout. The runtime setup
records executable and browser descriptor identities in the current run's
results. The native media diagnostic uses the runner's preinstalled Chrome and
records its version and executable hashes separately.

## All 100 comparative corpora

`run-corpora.py` reads the maintained 100-file registry from
`scripts/parity/checkpoints/2026-11-05/audit-completion/execution.tar.gz`. That
archive supplies the inventory, not successful results. Every registered script
runs freshly, sequentially, without inherited selection filters or retries.
Individual failures do not suppress the remaining registered scripts.

Full Git history is required. The committed `restore-reference.py` additionally
reconstructs an unavailable historical comparison commit from its archived patch
and raw commit. It verifies the patch hash, exact resulting tree and commit hash
using a temporary index. A missing or mismatched object fails the preflight; no
alternative baseline is selected.

Use separate empty result directories for preflight and execution:

```sh
python3 -B scripts/parity/checkpoints/2026-11-05/audit-completion/restore-reference.py
python3 -B scripts/audit/run-corpora.py --out test-results/corpora-preflight \
  --head "$(git rev-parse HEAD)" --chrome "$EDITOR_CHROME_PATH" \
  --playwright "$EDITOR_PLAYWRIGHT_PATH" --preflight-only
python3 -B scripts/audit/run-corpora.py --out test-results/corpora \
  --head "$(git rev-parse HEAD)" --chrome "$EDITOR_CHROME_PATH" \
  --playwright "$EDITOR_PLAYWRIGHT_PATH"
```

The repository root defaults to the checkout containing the script; `--repo` can
select another checkout. `--node`, `--chrome`, `--playwright` and `--timeout` are
explicit runtime configuration. The workflow preserves the 1,200-second budget
per corpus and gives the full job 240 minutes for setup, execution and reporting.

The manifest preserves each raw process exit, candidate verdict, independent
checker verdict, source identity and stdout/stderr hash. Exit 1 from a historical
comparison is accepted only when the current candidate passes and the existing
checker attributes the exit to historical differences or unavailability. A
failed candidate, missing report, duplicate report, unaccounted exit or changed
source remains a failure. SIGTERM stops the owned child process group and closes
the attempt as interrupted.

## Focused Chromium 151 controls

The separate focused job executes the complete navigation comparison, clipboard
regression controls and retained FontSize controls once. Isolated counterfactual
worktrees restore only the baseline ClipboardController or FontSize source file;
their expected product failures remain separate from candidate outcomes.
Raw outputs and the original comparison assertions are retained. This job does
not replace either the 100-corpus run or the eight main verification jobs.

## Full structural authoring and memory audit

`run-structural.mjs` runs the maintained `benchmarks/structural-authoring.mjs`
against immutable Git sources: baseline
`8761946d0d202b7fe74adfbb3bdc1b49fc245ba8` and the current workflow commit. It
removes inherited `EDITOR_STRUCTURAL_*` selectors, fixes five warmups and 21
samples, and requires all controls, timing, attribution and memory stages for
the seven maintained document shapes. Both sources use the same fixture,
installed dependencies and pinned Chromium 151 runtime.

The job has a 30-minute limit, with a 24-minute owned benchmark-process limit.
Benchmark failure, interruption or missing raw output remains a failed gate.
Complete execution produces 74 semantic/sensitivity controls, 56 timing rows,
56 attribution rows, 14 memory observations and 112 compressed trace/allocation
artifacts. The maintained `library-recheck/structural-review.mjs` independently
checks source and dependency bytes, sample distributions, native input, trace
reconstruction, allocation samples, released objects and live memory controls.
It also checks reduced large-structure traversal. Timing distributions retain
slower paths; a consistency PASS alone does not establish universal speedups.

The same reviewer must first accept the unmodified fresh result. Seven separate
copies then corrupt source identity, sample count, a distribution, native-input
trust, a live memory control, released-object retention and trace counts. Each
copy must fail through an actual assertion; missing files, timeouts, signals and
launch failures do not satisfy these negative controls. The original result and
all 112 artifact hashes are checked again afterwards.

The controls also have a standalone CLI with explicit source identities:

```sh
node scripts/audit/structural-review-controls.mjs \
  "$EDITOR_RESULTS_DIR/structural" \
  8761946d0d202b7fe74adfbb3bdc1b49fc245ba8 "$(git rev-parse HEAD)" \
  "$EDITOR_RESULTS_DIR/structural-review-controls"
```

The control-output directory must be fresh. The maintained reviewer, benchmark
and fixture execute unchanged. Historical controls with fixed commit identities
remain archived; the new CLI applies the same seven mutations with explicit
current source identities.

## Native media functional contract and bounded observations

The version 2 media job runs all 30 native HTML-content cases once unchanged,
then once with a test-only observation overlay in a temporary worktree. The
original 28 case names remain; two native negative controls are appended. The
four playback cases retain their single trusted Space action, initial
`pause(100)`, retirement checks and caller-owned resource checks. Playback must
be observed as trusted input, an unpaused video and a nonempty played range
before a strict 3,000ms deadline. The clock starts when the native dispatch
helper returns, before the initial wait. A positive sample at or after the
deadline fails. This is a functional readiness contract, not a 100ms latency
guarantee or an explanation of any historical playback failure.

The two controls require a trusted Space on a different button and a genuinely
paused video that already has played history. Only an actual playback deadline
is accepted for either control; missing input, changed ownership, media errors
and failed observations are failures. The paused-history setup first proves
native playback and then a second trusted Space on the same video. These are
two test cases with three recorded phases, giving seven readiness records with
the four positive cases.

The physical runner saves `media-readiness.json` before either terminal verdict.
It contains actual elapsed samples, the initial observation, first observed
positive time and terminal state. Sample times do not measure playback onset
or first-frame latency. The adapter requires the exact 30-case report, seven
phases, current ownership and strict terminal deadline semantics. Missing or
malformed evidence cannot pass; raw process logs remain available on failure.

Only the four original positive media cases receive the observation overlay.
It records focus, trusted keys, cancellation and media events, then adds a
bounded 300ms observation after the functional verdict. A failed verdict keeps
the same Error and remains a failure even if playback starts later. The two
native controls remain uninstrumented. Both attempts retain their case reports,
source identities, overlay and runtime receipts. Standalone pages exclude
earlier pages of the full native run, and instrumentation can perturb timing;
the report withholds release acceptance and a historical causal conclusion.

The previous fixed-100ms adapter and its raw outcomes remain in Git history
(for example, commit `545c7da3eaed9450de6b68b09462af99ad65a3ee`). Version 2
results do not reinterpret those failures. A startup between 100ms and the new
deadline can now pass the functional check, so a separate performance guarantee
would need its own specified latency contract and measurements.

Each job uses `verification-results.mjs` to bind commands to the current source,
record prerequisites and close interrupted attempts. Finalization and artifact
upload run even after failure. An earlier failed run remains failed; later
evidence receives a new run identity.

## Supervisor controls

```sh
python3 -B -m unittest discover -s scripts/audit -p '*_test.py' -v
node --test scripts/audit/run-structural.test.mjs
```

These tests exercise the supervisor using temporary Git repositories and fake
100-script registries. They check report parsing, complete execution after
failures, historical exit attribution, selector removal, dirty-source rejection
and owned-child cleanup. They do not execute a browser or produce product
acceptance results.
