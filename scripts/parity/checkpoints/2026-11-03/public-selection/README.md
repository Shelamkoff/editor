# Public block selection — pending acceptance

Forty-four public control cases cover ordered/deduplicated selection, empty/clear, explicit current versus focus, missing/removed/replaced IDs, same-ID replacement, known and inert block roots, both modes, local native ranges and an independent editor with a matching ID. A seeded Redo branch must survive every control; exact replay executes after returning to editable mode. Read-only hides availability while retaining history.

Legacy real public index/selectBlocks/getSelectedBlocks operations execute. No stale-ID setter or current event/snapshot port is fabricated for v1. The actual old selection behavior remains in the corpus. Production is unchanged from separately integrated `efc619d2`. This row stays open until a frozen full corpus, independent model, corruption controls and all ordinary pages pass.
