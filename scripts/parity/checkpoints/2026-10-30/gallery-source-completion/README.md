# Gallery derived text and native source completion — 2026-10-30

This checkpoint closes the demonstrated Gallery editor alternative-text defects and the missing ordinary native source completion that would otherwise require unsafe plugin input listeners. It does **not** accept full Gallery parity, renderer parity, full v1 parity, IME/system clipboard coverage or Firefox/WebKit behavior.

The isolated implementation starts at `1547de28ee66498d649555d69e212b58be7fcf31`. `implementation.patch.gz` contains the complete production/test/documentation change; its uncompressed SHA-256 is `ec5240c307753163c6c43c68431e77ff6e3d133626710a06b4a5297f7dea96f1`. `manifest.json` records the final source hashes, runtime versions and compressed/raw log hashes. No dependency or Masonry API is changed.

## Outcomes

Gallery computes image `alt` from the final actual caption text through the existing `afterProjection` contract. Literal entities are decoded only by the normal DOM projection; actual Mention and Color labels are included. Grid, overflow and real installed Masonry layouts are covered. Exact captured caption/image/slot/original-container relationships permit harmless layout wrappers while rejecting editable, widget, block and control boundaries. Retired views, separately adopted nodes and a whole instance moved to a foreign host cannot authorize auxiliary writes.

Ordinary native author text now completes only changed declared rich fields after the existing retained-source inline hydration and before canonical/history acceptance. The native DOM, widgets and caret remain intact. Empty/no-change input does not notify again. Inline native normalization retains its existing no-transaction completion. A transient exact field-key handoff prevents duplicate completion after native inline removal, without entering document data, history, events or replay. A newly published HTMLElement under the same key remains a new affected occurrence.

The new schema observations check the same captured owners and author content after both returning and throwing callbacks. An adopted shell is retired through the existing shrinking owner cleanup; terminal entry teardown is idempotent, so late predecessor cleanup cannot remove that foreign shell. When both mapping and ownership validation fail, the AggregateError retains the original error as its cause. These checks do not introduce another lifecycle, change native recovery policy or infer authority from transaction names.

## Fresh failure evidence

The compressed development logs document incremental RED stages. They are diagnosis/TDD records, not a claim that every intermediate whole-source state has an immutable acceptance manifest.

| Evidence | Observed failure |
| --- | --- |
| `gallery-baseline-projection-red.log.gz` | Eight failures among the initial 128 projection cases: stale/raw derived text after entity/widget load, mode/update/replay and Masonry scenarios. |
| `gallery-baseline-native-red.log.gz` | Three of the initial four genuine native cases fail for stale grid/overflow/Masonry alternative text; the separately adopted-image control passes. |
| `gallery-whole-owner-red.log.gz` | A direct input listener updates the image after the entire Gallery instance moves to a foreign host. Exact local caption/image relationships alone do not prove current block ownership. |
| `source-completion-red.log.gz` | Ordinary native author text never receives generic field completion; its intentional callback failure therefore cannot reject the native commit. |
| `duplicate-inline-completion-red.log.gz` | Adding source completion without the exact finalizer handoff calls the existing native inline removal completion twice. |
| `schema-adoption-red.log.gz` | A returning schema callback transfers the source shell; the guard stops hydration, but subsequent cleanup removes the foreign shell. |
| `source-boundaries-red.log.gz` | A same-key replacement field misses its own completion, and an in-place schema author-DOM mutation is accepted with inconsistent auxiliary text. Three independent source controls still pass. |
| `schema-throw-red.log.gz` | A mapper that transfers ownership and then throws bypasses post-callback validation and the required combined-error/retirement boundary. |

The initial foreign-input fixture listened on the inner caption even though the browser's input target was the enclosing foreign editing host. Its corrected trusted-input control is in the final suite; that earlier fixture failure is not counted as a production defect. The first custom-widget schema-adoption fixture used the wrong context for `ownerDocument`; the corrected source-specific RED is the `schema-adoption-red` log above.

`native-recovery-count-diagnostic.log.gz` preserves a provisional failed assertion that demanded exactly two notices. The existing native pipeline can reconstruct different occurrences in per-block recovery and then outer document restoration. Total count alone was not the contract or a confirmed defect. The final control requires the original failed occurrence exactly once, a distinct owner for every successful recovery notice, correct accepted text, revoked/detached predecessors, coherent final ownership and no query-triggered replay. No recovery-count behavior was changed to satisfy that test.

## Final frozen-source verification

| Gate | Result |
| --- | --- |
| Both source typecheck configurations | PASS |
| Focused BlockReconciler, TransactionEngine, DocumentRuntime, native controllers, Gallery and Masonry Node tests | 373/373 PASS |
| `projection-contracts.html` including the Gallery cases | 137/137 PASS |
| Gallery genuine native grid/overflow/real Masonry input, exact keyboard Undo/Redo and foreign-owner negatives | 6/6 PASS |
| Existing native inline completion, canonical no-op, cancellation, failure and removal controls | 6/6 PASS |
| Generic ordinary source completion, failure recovery, normal/throwing schema adoption, same-key successor and schema author-mutation controls | 6/6 PASS |

The final logs use Chrome 156 and Node 24.22.1 in this environment. Browser input is driven through the existing CDP/native helper. The no-change notification is an explicit negative synthetic control; positive author edits and deletion/removal use trusted native browser input. The generic timing control observes the previous accepted canonical state and zero commits during completion, then one accepted transaction, with unchanged sibling widgets and exact retained caret/text nodes.

Reproduce the focused gates from the implementation checkout:

```sh
npm run typecheck
node --test core/BlockReconciler*.test.js core/TransactionEngine*.test.js core/DocumentRuntime*.test.js core/NativeInputController*.test.js core/InlineWidgetInputController*.test.js plugins/gallery/uploader.failures.test.js plugins/gallery/uploader.realm.test.js plugins/gallery/settings-lifecycle.test.js shared/galleryMasonry.realm.test.js
EDITOR_CHROME_PATH=/tmp/rector-browsers-156/chrome-linux64/chrome EDITOR_BROWSER_PAGE=projection-contracts.html node tests/browser/run.mjs
EDITOR_CHROME_PATH=/tmp/rector-browsers-156/chrome-linux64/chrome EDITOR_NATIVE_PAGE=native-plugin-media.html EDITOR_NATIVE_FILTER='Gallery derived alt' node tests/browser/physical-history.mjs
EDITOR_CHROME_PATH=/tmp/rector-browsers-156/chrome-linux64/chrome EDITOR_NATIVE_PAGE=native-library-boundaries.html EDITOR_NATIVE_FILTER='field completion native' node tests/browser/physical-history.mjs
EDITOR_CHROME_PATH=/tmp/rector-browsers-156/chrome-linux64/chrome EDITOR_NATIVE_PAGE=native-library-boundaries.html EDITOR_NATIVE_FILTER='field source completion' node tests/browser/physical-history.mjs
```

Independent peer review supplied the same-key successor and schema author-mutation RED probes and the throwing-adoption probe. The final implementation and corresponding six native source controls received a review acknowledgment. Full repository acceptance belongs to the parent integration gate on its final combined source; this checkpoint does not substitute focused totals for that gate.
