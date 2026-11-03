# Optional inline instances and trusted immediate caret — proof in progress

The target is seven optional-instance rows: context update, task update,
immediate caret, no-op reuse, failed replacement, synchronous-update controls
and native-reconciliation's required update hook. The register remains
85 accepted / 124 open until committed-source validation.

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
as the existing native pages; a fresh committed run is required.
