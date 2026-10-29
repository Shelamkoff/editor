# Image derived alt: lifecycle seam remains open

Read-only audit against `ede029cc646f0f528c84e3984797e502bd4e37ec` found no
existing block notification that runs after inline hydration. No production
change or new API is proposed by this record. An independent peer read of the
same owners reached the same conclusion without a new browser run.

Image computes `image.alt` from caption.textContent in `project()`, and also
updates it from a native caption `input` listener. Its initial create/update
and mode paths compute the value before core replaces canonical inline tokens
with actual widget DOM. A public inline payload update changes the sidecar
without changing block data, so it does not call Image.update at all.

| Existing owner / path | Actual order or boundary | Why it does not close the gap |
| --- | --- | --- |
| BlockReconciler.#createEntry | runtime.create → wrapper/shell assembly → setReadOnly → field capture/tunes → prepareBlock | All Image callbacks precede hydration; no block callback follows it. |
| Prepared block update | block update only when dataChanged → field refresh → reconcileBlock → tunes | A sidecar-only change skips block update; an ordinary block update still precedes hydration. |
| BlockReconciler.setReadOnly | block setReadOnly → field projection → inline mode acceptance | Image derives alt before hydrated labels settle. |
| C12 field refresh/recovery | owner validation → field projection → field publication | The existing flow does not notify the block instance after projection. |
| BlockInstance / snapshotBlockInstance | read, update, editableFields, setReadOnly, focus, destroy | No post-projection method is declared or captured. |
| BlockPluginRuntimeContext / BlockInstanceContext | document, signals, data/mutation/task services | No event subscription or exact editor-boundary admission service is exposed. |
| InlineWidgetInstance.afterNativeEdit | one inline occurrence after native settlement | It is not a block hook and does not cover load, mode or public sidecar updates. |
| Native caption input | DOM input listener | Hydration and programmatic sidecar updates do not dispatch this native input event. |

Calling read()/editableFields() for presentation side effects would change
query/descriptor semantics. Repeating setReadOnly or update after hydration
would replay arbitrary extension effects and can reconstruct rich DOM again.
Using commitDomMutation or a no-op data update for notification would cross a
canonical mutation boundary. None is an existing settled notification contract.

A delayed callback or local observer also cannot derive exact editor ownership
from the existing context. InstanceScope.getData validates health, generation,
revocation and data access; isReadOnly reports scope mode. Neither verifies
that the entire wrapper/shell remains in its original editor. A parent captured
later, CSS/closest heuristic or document-wide observer does not establish that
ownership. No such workaround was introduced.

The minimal architectural location to consider in a future settled contract is
the existing core block projection owner after successful inline projection and
ownership validation. Defining a safe notification there still requires an
explicit contract for initial staging, accepted updates, mode changes,
field-local recovery, callback failure/reentry and abort/disposal. This audit
does not create that contract or assume permission to add an API.

The preserved actual Image10 oracle on the earlier quadratic repair remained
5 PASS / 5 FAIL: hydrated load, both mode transitions, and actual Mention/Color
updates still fail only derived-alt assertions. The update cases' DOM identity,
backward range, canonical data and single Undo/Redo assertions pass. Those are
historical source-specific results, not a rerun on the linear or later combined
integration. Full Image parity remains OPEN.

Relevant source hashes and the Image10 fixture/trace identities are retained in
REPRODUCTION-MANIFEST.json. Read-only anchors: plugins/image/index.js project
and returned BlockInstance; core/BlockReconciler.js snapshotBlockInstance,
#createEntry, prepare.apply, setReadOnly and #registerFields;
core/InstanceScope.js createAuthority; plugin-kit/types.d.ts block contexts,
BlockInstance and InlineWidgetInstance.afterNativeEdit.
