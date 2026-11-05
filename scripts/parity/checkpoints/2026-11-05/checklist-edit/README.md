# Checklist item editing 2026-11-05

**Accepted: BLOCK_CHECKLIST_ITEMS.**
Register: **154 accepted / 55 open / 209 total**. Tested source: `5cbdd6d680e4ef1f15e63164e67705fce62006cc`.

`BLOCK_CHECKLIST_ITEMS` is accepted on `5cbdd6d6`: **154/209 obligations accepted, 55 open**. All **seven affected gates** pass on one clean unchanged source. [Evidence](https://github.com/Shelamkoff/editor/blob/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-11-05/checklist-edit/README.md): **96 current executions / 1,920 observations**, **407 module identities**, **24 rejected corruptions**. No production change is needed.

Forty-eight native scenarios cover both initial checked states: real checkbox toggles, native typing over directed text/widget ranges, four rich split positions, selected-text/widget Enter, Backspace merge/removal at either item boundary, plain/BR/formatting-only sole/final empty exits and cross-item Enter in both directions. Stable IDs, remaining checks and rich marks survive; new split items start unchecked. Cross-item split retains both endpoint IDs without inventing a Paragraph. The first prototype expected an ordinary space after native widget replacement; Chromium preserves the visible gap as `&nbsp;`. Its exact failed expectation is retained and corrected literally without changing the product or normalizing arbitrary whitespace.

Canonical state, checkbox `aria-pressed`, widget sidecars/counts, neighboring DOM, native caret/direction, caller data and raw Undo/Redo are verified independently. Checkbox toggles commit one plugin update; native typing commits one native-input action; structural gestures retain their declared action. Undo restores the exact original directed range; Redo restores the same created IDs. Every reference body completes without page/input errors; missing old observers/stable item IDs are explicit. Historical failures remain raw differences.

Native pages pass **264 cases**; inventory is **126 native pages**. Existing List editing/conversion and structural regressions run alongside the new pages. Documentation and site checks pass. Exact runtime/package identity and 122 verified Git artifacts retain all fifteen full integration gates on `523245ff` with their actual source/date. Seven existing Checklist tests are verified by passing names in that full Node log, not a fresh invocation. Only Checklist item editing is newly accepted; broader Checklist inline merge/export, Clipboard and full readiness remain open.

Post-acceptance documentation and site checks pass on `086eba41`.
`artifact-hashes.json` verifies actual Git blobs and decoded compressed artifacts.
