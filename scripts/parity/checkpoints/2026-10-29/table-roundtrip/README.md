# Table roundtrip proof, 2026-10-29

The frozen source and gate identities are recorded in `manifest.json`; `final-gates.json` is the unmodified C11 manifest. The integrated three test files are byte-identical to the executed source. No production code changed in this slice. The previously published default repair supplies the actual 3×3 empty table.

The cumulative 45-case run contains 7,553 current observations with no failure; v1 has 7,487 observations and 519 exact classified differences; the specification baseline has 5,759 observations, 61 classified failures and twelve explicitly incomplete formatted cases. Its one raw error and one page error are the exact paired, previously classified Embed Redo failure. The current source has no page/server error. Native execution passes 45/45. Counts overlap all preceding cumulative runs.

Table adds actual default, a fixed 2×2 heading table with independent marked text and Mention/Color sidecars, and its unwrapped control. All cells/IDs and table/row/cell DOM identities, editability, three renderer contexts, first-cell trusted input, one Undo/Redo, neighbors and disposal are checked. Row/column actions, Tab/Enter, paste and multiple-cell interaction are separate obligations. v1 receives only its real string matrix wire adapter, without invented row/cell IDs.

Both invalid fixture-development attempts are retained separately and are not product RED evidence. The final valid raw comparison and exact classifier counterexamples are retained alongside the complete merged result. Every `.gz` file is a lossless gzip of the original JSON; its compressed and original hashes are in the manifest.

Apply `source.patch` to published `a0fabcaa0bd7a430a9e69f4240ad0ca763b80217` to reconstruct the four executable/fixture bytes of the frozen combined Embed/Table/diagnostics run. The recorded original commit additionally contains only its historical documentation state. Use the existing public runner under Node 24 and the recorded Chromium 142 executable; preserve both pinned reference checkouts and dependency versions from the raw result.
