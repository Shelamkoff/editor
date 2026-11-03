# Optional inline instances and trusted immediate caret — accepted 2026-11-03

The target is seven optional-instance rows: context update, task update,
immediate caret, no-op reuse, failed replacement, synchronous-update controls
and native-reconciliation's required update hook. Committed-source validation
below accepts these seven rows: **92 accepted / 117 open**.

The original nine ordinary cases retain their names and assertions. A shared
public extension fixture adds 21 controls: exact once-only accepted task
replacement/history, every falsy and Error creation/update failure, provisional
scope release, no fallback to a rejected payload, Promise and thenable rejection,
one then-getter/correct receiver, invalid native opt-in cleanup and valid
readable/update controls. The 30-case prototype passes all 339 independent
manual expectations; the baseline retains 15 passing and 15 failed/incomplete
cases with 185 observations.

A separate eight-case native page uses real CDP Backspace and keyboard Undo/Redo.
It verifies actual trusted consumed beforeinput, no native input leakage, exact
resulting widget/caret, one action, exterior completion without a caret, and
superseding selection, mode, same-ID owner, rollback and destruction. An
application MutationObserver acts after DOM replacement but before the old
queued caret; every race has an explicit pre-completion control. No synthetic
event or timing delay stands in for the trusted keyboard action. Installed
selection ranges are explicit and are not physical mouse-drag claims.
All eight exploratory cases / 67 expectations and 24 protocol requests pass.
The baseline retains one passing and seven failed/incomplete cases with 35
observations. v1 separately executes actual native Paragraph Backspace and
preserves the expected saved/visible text; its new-definition/instance task
ports are not emulated.

`scripts/parity/optional-inline.mjs` selects `public` or `native` through
`EDITOR_OPTIONAL_INLINE_GROUP`. Production and the common committed test
modules come from exact Git objects. A test-only descriptor observer awaits
cases without evaluating result accessors. The full ordinary run and separate
repository native driver execute without that observer. `review.py` imports
neither fixture nor runtime; its two manual models rebuild all 38 cases / 406
expectations, native protocol and trusted-event records, source/dependency
bytes and exact runtime equality with separately integrated `f2070510`.
The original successful 21-gate manifest remains unchanged.

The new native page is added as its own full-run group, without changing
existing page budgets or cases. Production behavior is unchanged. Registered
decoder, unknown-extension and standalone presentation obligations are separate;
this proof does not claim full C12, B-HTML or library readiness.

## First committed fixture setup failure

The clean unchanged `44de7d2b` run `run-WctIZ8` passes types, all 46 ordinary
pages and docs, but remains **failed**. The new native HTML omitted its
`native-input-driver.js` import, so the repository driver timed out waiting
for the page bridge. Dependent model/controls correctly refused the missing
native evidence. The exact original manifest and three failed gate logs are
retained with separate hashes. This is a fixture setup defect, not product
RED or accepted native evidence. The HTML now uses the same driver initialization
as the existing native pages. The fresh committed run below supplies acceptance.

## Immutable acceptance

Candidate `baa0ffc5d240b149b5c909f60d352423829143c3`, tree
`368f915a98c90768ca0358c07f35312e891f974c`, passes **30 ordinary cases /
339 expectations and eight native cases / 67 expectations**, 38/406 total.
The full ordinary run passes all 46 pages, and the independent repository
native driver repeats all eight trusted cases. The model reviews 626 v2
observations, verifies 275 distinct source/module identities across 550 group
visits, six dependency files and eight versions, all 24 current native protocol
requests and the real two-key-event v1 control in each group. The baseline
retains 15/30 ordinary and 1/8 native passing with 185 and 35 observations;
both raw comparisons exit **1**, while candidate/source/model review exits **0**.

`run-mFAfGI` passes all six gates on clean unchanged source: types, all ordinary
pages, repository native page, both exact-Git comparisons plus independent
manual model, six negative evidence controls and docs. Started
2026-11-03T10:06:58.537Z; finished 2026-11-03T10:13:53.472Z; source identity
`297113bc8142dd38c9bc25938376334e2ff0deef1b70f6f6f8c2b63b845bed44`.
Environment: Windows x64, Node 24.22.2, Chrome 156.0.8078.80, Python 3.12.14.
Runtime paths and loaded candidate modules are byte identical to `f2070510`,
whose separate original `run-xxJbdd` passes all 21 integration gates. This
six-gate run is not presented as a new full integration or all-51-native-group run.

Healthy review exits 0. All six corruptions return 1 at the intended model,
source or inventory assertion: wrong source, matching stale label, double then
getter, untrusted native event, stolen successor caret and missing rollback
race. Mutated corpora, recipes and rejection output are preserved. The manual
checker imports neither fixture nor production code and verifies its own exact
Git source. This is author verification, not another agent's review.

Only these rows are accepted:

- `CONTRACT_INLINE_OPTIONAL_UPDATE`
- `CONTRACT_INLINE_OPTIONAL_TASK`
- `CONTRACT_INLINE_OPTIONAL_IMMEDIATE`
- `CONTRACT_OPTIONAL_NOOP_REUSE`
- `CONTRACT_OPTIONAL_RECREATE_FAILURE`
- `CONTRACT_INLINE_SYNC_UPDATE_CONTROLS`
- `CONTRACT_NATIVE_RECONCILE_UPDATE_REQUIRED`

Decoder/unknown-extension, standalone presentation, B-HTML and full readiness
retain separate proof obligations. Current optional-instance behavior and exact
caret/history/lifetime improvements remain intact.

## Artifacts and reproduction

Decoded final corpus hashes are public
`1ef8260e4fa89d61e588efffae8e440dbd64501c7d96a707492c014cce918958` and native
`e8d3445b15da2bb9681595b8d1a4fc10c255657eb82d789b8796a9b088c04416`.
`artifact-hashes.json` binds stored/decoded bytes for both corpora, both manifests,
ordinary/native/type/docs logs, process outcomes, six corrupted corpora, review
and original failed fixture setup. `executed-review.py.gz` preserves exact
checker bytes with SHA-256
`a797e9e53d29f5b27508182818def29dca357866e43540b1f89eafbcb8a12bbc`.
LF runner/common fixtures/checker and binary evidence attributes preserve exact
source and artifact bytes on Windows.

Final acceptance prose passes docs contracts and the built 127-page site:
zero broken links/assets, with successful editor/search/menu EN/RU browser
controls. These final logs retain their separate scope and do not replace the
original six-gate source record or the earlier failed setup record.

Final acceptance prose passes docs contracts and the built 127-page site:
zero broken links/assets, with successful editor/search/menu EN/RU browser
controls. These final logs retain their separate scope and do not replace the
original six-gate source record or the earlier failed setup record.

At the candidate, run `node scripts/parity/optional-inline.mjs` twice with
`EDITOR_OPTIONAL_INLINE_GROUP=public` and `native`, retaining stdout and each
expected exit 1. Set installed `EDITOR_PLAYWRIGHT_PATH` and `EDITOR_CHROME_PATH`.
Run `node tests/browser/run.mjs` without page selection and
`node tests/browser/physical-history.mjs` with
`EDITOR_NATIVE_PAGE=native-optional-inline-update.html`. Invoke Python 3 on
`review.py --public-raw PUBLIC --native-raw NATIVE --candidate SHA --browser BROWSER_LOG --native-log NATIVE_LOG --output REVIEW`.
Then set `EDITOR_PYTHON_PATH` and run `controls.mjs PUBLIC NATIVE SHA BROWSER_LOG NATIVE_LOG OUTPUT_DIRECTORY`.
Historical failures and successful candidate/model verification remain separate.
