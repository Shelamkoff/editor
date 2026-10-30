# Independent review: authored line breaks and Table keyboard behavior

## Review conclusion

No blocking defect was found in `3a16cf9fe64046780d4573464387dd2eb864b80e` relative to `01fb551a9542ddd94e6b5652f637193875b55888`. The reviewer is independent of the implementation and fixture author. The review supports the shared typing repair and the bounded `BLOCK_TABLE_KEYBOARD` acceptance, subject to the parent's broader integration gates. It does not accept the complete Paragraph editing or split/merge rows.

The production diff changes only `core/LogicalSelection.js` and `core/NativeInputController.js`. The remaining changes are the new guard tests, native controls and exact-source comparison instrumentation. No public API, additional selection/history store or second transaction owner is introduced.

## Why the change is needed

The fixed case starts with a caret inside the last character boundary of `<b>Alpha</b>`, followed by plain text and genuine Mention/Color widgets. Enter correctly creates an authored BR inside the bold wrapper. The old collapsed-point restoration then chooses the next plain Text node, and subsequent native typing loses bold formatting. Restoring only the DOM side is insufficient in the recorded Chrome runtime: the browser can still place typing into the next visual text run.

The independent audit confirms the exact pre-fix failure inventory. Its 12 failed observations are two cases (headed/body Table), two phases (typing after Enter and its Redo) and three surfaces (canonical cells, live editor cells and renderer cells). They are repeated observations of the same bounded formatting loss, not twelve separate defects. The same final fixture gives the repaired source **21 complete cases / 3,435 observations / zero failures**. Historical v1 and specification failures remain failures.

## Ownership, input and history review

`LogicalSelection.restore()` changes affinity only for a collapsed logical point immediately after an authored BR. It retains the existing offset model, excludes privately owned caret padding and leaves noncollapsed start/end bias and direction handling unchanged. Plain-text control selection continues through its earlier separate branch. Existing owner and active-element revalidation still runs before native selection publication.

The new controlled insertion is deliberately narrow. It requires a trusted, cancelable `beforeinput` event with nonempty `insertText` data, a rich-text owner, one collapsed native Range and an element boundary immediately after an authored BR. It captures a logical bookmark and re-resolves the exact current field element, mode, block ID and field key. The active element, both native endpoints, live Range start and BR containment must still agree after those reads. Existing editing-host resolution rejects locked boundaries, independent native controls, inline widget interiors, nested hosts and foreign ownership.

The helper declines both padding-before-caret and padding-after-caret cases. Terminal padding already gives the browser a stable insertion position; leaving that route native preserves its genuine `input` event. Ordinary mark boundaries and noncollapsed ranges retain their existing paths. Composition, replacement text, paste, drop and history event types do not enter the new branch. Read-only and destroyed-controller admission remain ahead of it.

Accepted text is inserted at the existing authored DOM boundary and then synchronized through the existing native commit path, including the captured pre-edit selection, coalescing owner, projection preservation and controlled-input notification. There is no synthetic `input` event or new document acceptance mechanism. The existing projection synchronization still owns canonical preparation, history and failure recovery. The native fixture proves a preceding `X`, Enter and following `Y` are separate history actions; exact Undo/Redo restores their full records and caret states. Shared Paragraph controls also type a fresh `Z` after replaying Enter.

## Independent evidence checks

`review.py` imports neither production code nor browser fixture helpers. It reconstructs the 21-case inventory and **227 full candidate phase documents** from literal author data. Separate fixed expectations cover the marked and unmarked BR positions, unaffected cells, row/cell IDs, headings, widget sidecars, renderer/editor shapes, row-major focus, caret direction, native control ownership and history counts. The script checks both the recorded actual state and the fixture's expected state against that model.

The final audit passes **16,945 checks**, including:

- All **13,043** raw actual-versus-expected verdicts across four sources, without changing historical status.
- The **227** complete canonical phase documents and **2,457** additional fixed surface, history, transaction-count and caret checks.
- **655** served source-file hashes, exact source identities and trees, and fixture/runner bytes.
- Reconstruction of the original pre-fix and candidate commit objects and trees from retained full-index patches and raw commit bytes in temporary Git storage. Repository refs, index and object store are not modified.

| Source | Executed / recorded cases | Observations | Failed observations | Unsupported cases |
|---|---:|---:|---:|---:|
| v1 `5e5c7f8d…` | 19 / 21 | 2,738 | 159 | 2 |
| Specification `e981ff30…` | 21 / 21 | 3,435 | 216 | 0 |
| Pre-fix `01fb551a…` | 21 / 21 | 3,435 | 12 | 0 |
| Candidate `3a16cf9f…` | 21 / 21 | 3,435 | 0 | 0 |

No executed case is incomplete or has a page error or diagnostic. v1 lacks keyed editable-field focus and boolean admission; the two missing/retired-key cases remain explicitly unsupported. The comparison's observed process exit is **1**, and its separate `candidatePass` is true. This is preserved in the author's final process metadata rather than inferred from the candidate result.

The reviewer separately ran the existing `LogicalSelection`, `NativeInputController` and new authored-BR guard suites on unchanged `3a16cf9f`: **81 real node:test cases pass, actual exit 0**. The 24 new guards are included in that total. A preceding restricted-environment attempt reported only three file-level entries and no scenario inventory; its exit 0 is retained under `sandbox-file-only-*` but contributes no coverage. The final run uses the environment needed for real child-process execution. `core-unit.meta.json` and compressed streams preserve the actual outcome and hashes.

The author also records 30 passing native cases (21 Table plus nine shared controls), the separately passing existing terminal-Table control and both typecheck configurations on the same immutable source. Those author runs were inspected, not rerun or relabeled as independent browser executions. The shared controls distinguish nested active marks, plain BR followed by marked text, unchanged ordinary mark boundaries, terminal padding and forward/backward noncollapsed restoration. Root owns the broad integration matrix; this review does not claim it has passed.

## Reproduction and limits

After integrating the parent checkpoint, run:

```sh
python scripts/parity/checkpoints/2026-10-30/table-keyboard/peer-review/review.py \
  --repo . \
  --raw scripts/parity/checkpoints/2026-10-30/table-keyboard/final/comparison.json.gz \
  --output /tmp/table-keyboard-peer-review.json
```

The decoded raw SHA-256 is `59b2600838f0c6664f600d8bca37c6b9dbc561af332886749d7c9fb46cfb517d`. The published base and historical v1/specification Git objects must be present; the script restores the unpublished pre-fix/candidate objects into temporary storage itself. `sources.json` records their original bytes and patch hashes. `artifact-hashes.json` covers this peer evidence, including decoded gzip hashes.

The browser evidence is from Chrome 156 on Linux. It does not establish other engines, arbitrary operating-system IME sessions, the complete Paragraph contract or whole-library parity. Failed historical behavior is not restored to obtain superficial equality. Existing `B-HTML`, `B-STYLE` and broader structural obligations are unaffected.
