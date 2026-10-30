# Embed preview deadlines and ownership — 2026-10-30

This checkpoint records two separate observed RED → GREEN cycles on top of
`eae1b93ee6bc39a32230de1b46c67f27b39c8015`. It does not close the whole Embed
parity row or claim functional parity for the entire library.

## Runtime changes

`6be200dd3e7da6491c8e6560b3d2aae12bccc7f1` restores `previewTimeoutMs` for
custom and built-in Vimeo resolution. A deadline aborts its signal with an
owning-document `DOMException` named `TimeoutError`, as observed in v1.
Cancellation releases the deadline immediately even when the provider ignores
abort and never settles. Settlement also releases it. Scheduler acquisition
and cleanup remain inside the presentation failure boundary, and late results
remain suppressed without changing canonical author data or history.

`8350cd35` admits a settled preview through the existing `context.getData()`
owner check and the exact player → view → wrapper chain. It captures provider
title metadata before that admission. The shared player also checks that its
captured placeholder/preview still belongs to the player before replacing it.
No public API or ownership registry was added.

The runtime and reusable tests were finally verified at
`80ba594f31ff177619f59979779946097604ea9a`. Later checkpoint additions contain
evidence and documentation only. Both production patches received root review
before being committed.

## Principal observations

| Run | Source | Observed result |
| --- | --- | --- |
| `run-PyieNq` | `0952d229` | Initial custom deadline RED: one timeout failure, timely-response control passes. |
| `run-VI7wHf` | `3e612dc1` | Custom timeout and default-request cancellation RED: 2 FAIL / 1 PASS. |
| `run-B27gqX` | `3e612dc1` | **Fixture failure**, not a valid product RED: the first fixture counted all staged requests instead of the one live request. Original output retained. |
| `run-iyr4x9` | `62ec6c85` | Corrected public-editor RED: 204 total, only timeout case fails; signal never aborts and a late preview appears. |
| `run-KUrE2a` | `d36a70d1` | 2 FAIL / 2 PASS, including a throwing-scheduler containment control. |
| `run-cyK09I` | `d36a70d1` | Immutable three-source pre-fix comparison; all 6 scenarios complete, candidate fails the timeout case. |
| `run-OdgXeT` | `f30c9a67` | Default timeout reason additionally reproduces `AbortError` instead of v1's `TimeoutError`: 3 FAIL / 2 PASS. |
| `run-cMhuKK` | `6be200dd` | First affected-suite GREEN, 14/14 Node tests. |
| `run-Mkcb9L` | `6be200dd` | Both JavaScript type configurations PASS. |
| `run-PrMq3Z` | `68e2b880` | Documented boundaries and positive controls: 19/19 Node tests PASS. |
| `run-cvzhjz` | `68e2b880` | English/Russian README contract validation PASS. |
| `run-7koeEz` | `68e2b880` | Timeout browser GREEN, projection page 204/204 PASS. |
| `run-8gKL1g` | `68e2b880` | Raw final timeout comparison: candidate 2/2 PASS; original raw exit **1** preserves historical failures. |
| `run-jGPsek` | `3a762c00` | Separate ownership RED: settlement removes an adopted placeholder. |
| `run-zwOd17` | `3a762c00` | Public-editor ownership RED: 209 total, exactly 5 failures for adopted placeholder/player/view/wrapper/shell. |
| `run-4paDJA` | `80ba594f` | Combined Node GREEN: 20 Embed tests + 8 strict-verifier checks = 28/28 PASS. |
| `run-7tnt8W` | `80ba594f` | Latest combined source: both JavaScript type configurations PASS. |
| `run-ho2iVs` | `80ba594f` | Combined public-editor projection page: 209/209 PASS. |
| `run-yjTaOh` | `80ba594f` | Strict comparison gate PASS; its raw child exit **1** and complete raw JSON are retained separately. |
| `run-qSoxNu` | `80ba594f` | Existing public editor/renderer roundtrip PASS: 21 default renders, 21 editable roundtrips, 21 renderer blocks, 10 lifecycle cycles, including Embed. |

Every recorded C11 manifest keeps its original outcome and reports
`sourceUnchanged: true`; the tested source was clean. The final candidate's
public preview checks preserve author data, caller-owned input and empty
history, and assert both normal timely response and ignored late response.

The Node controls cover omitted/non-finite deadlines (5000 ms), a negative
deadline (clamped to zero), disabled previews (no request or deadline), built-in
and custom timely results, cancellation when fetch ignores abort, deadline
reason, and scheduler acquisition failure without an unhandled rejection.

## Three-source oracle and strict verification

The same fixture runs with only plugin-construction and document-version
adapters against:

- v1: `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`;
- spec baseline: `e981ff308000c1d92d7e820df95113c1e19bcee8`;
- the exact candidate commit identified in the raw report and C11 manifest.

The raw runner `scripts/parity/embed-preview-timeout.mjs` always retains the
original observations. v1 aborts on time with `TimeoutError`, but accepts the
controlled provider's late response: one `timeout.latePreviewIgnored` failure.
The spec baseline has exactly three timeout failures: `timeout.signal`,
`timeout.reason`, and `timeout.latePreviewIgnored`. Both historical timely
scenarios pass. The corrected candidate has no failures.

`scripts/parity/verify-embed-preview-timeout.mjs` is a separate strict gate. It
requires all six complete scenarios, the exact immutable source identities and
fixture hash, no server/page errors, internally consistent raw verdicts, those
four exact historical differences and zero candidate failures. It does not
rewrite a raw PASS/FAIL. Its sensitivity tests mutate the actual archived
browser observation and reject a candidate failure, an additional historical
failure, missing cases/phases, wrong source identity, page errors, and a false
passing verdict.

To run a new strict comparison in an available browser lane, using the existing
`EDITOR_CHROME_PATH` / `EDITOR_PLAYWRIGHT_PATH` environment settings:

```sh
node scripts/parity/verify-embed-preview-timeout.mjs
```

When C11 sets `EDITOR_RESULTS_DIR`, the gate writes the unchanged raw JSON and
stderr there and reports `rawExitCode: 1`. Without C11 it uses the ignored
`test-results/embed-preview-timeout` directory.

To verify the captured final raw observation without launching a browser:

```sh
node scripts/parity/verify-embed-preview-timeout.mjs scripts/parity/checkpoints/2026-10-30/embed-preview-parity/run-8gKL1g/preview-parity-final.log.gz 68e2b880afe50a4dab2ec85c538ab0b078251730
node --test plugins/embed/reconciliation.test.js plugins/embed/url.test.js scripts/parity/embed-preview-timeout-verification.test.mjs
```

## Artifact integrity and limits

`artifact-index.json` lists original and archived SHA-256 digests and sizes.
C11 JSON manifests are copied byte-for-byte; logs use deterministic gzip with
mtime zero. `sources/*.patch.gz` preserve code/test/doc deltas from the fixed
base for every tested source. Checkpoint directories are excluded from those
patches to avoid recursively embedding evidence. The archived fixture required
by the verifier's sensitivity tests is supplied separately in this checkpoint.

`dependencies.json` records the physical dependency-copy comparison, including
all 51 Carousel package files matching the installed pinned dependency. Runs
used Node 24.22.1 and Chromium 156.0.8078.47.

Browser cases use real `createEditor`, DOM, history and `AbortSignal` behavior
with a controlled custom provider; they make no claim about external Vimeo
availability or trusted keyboard/clipboard/IME gestures. Built-in fetch timing
uses the existing public plugin lifecycle seam with a controlled owning-document
scheduler and fetch. Whole-library gates and the integrated source are verified
by the root agent separately.
