# Public read-only mode acceptance — 2026-11-03

`PUBLIC_READONLY` is accepted on `bac774b77c9a334faf068c31300dc95c2112e8d5`. The register becomes
**109 accepted / 100 open**. No production change is needed. The new matrix
completes **24 cases / 1,152 independently checked current observations**;
a fresh replay of the accepted public structural oracle adds **58 cases /
1,192 observations**. Together: **82 cases / 2,344 current observations**.
Twelve evidence corruptions are rejected, including denied host updates and
lost host Redo in stable read-only mode.

Both initial modes and empty, Undo and Redo histories cover ordinary text,
open/closed Toggle and Spoiler. Repeated mode assignments emit no duplicate
facts. Entering read-only emits exactly its mode fact and unavailable-history
fact, preserves canonical content, makes author fields non-editable and leaves
the history cursor intact. Actual trusted text, Delete and undo-shortcut keys
cannot author content or consume history. Public Undo/Redo reject. Native
Toggle/Spoiler buttons reveal and hide real content while canonical open state,
document facts and history stay unchanged. Returning to editable mode reveals
the retained availability; exact old replay, fresh trusted typing and its exact
Undo/Redo all pass. Post-return transaction/document/history facts are checked
against literal records and the expected revision sequence.

Read-only still allows application-owned commands. The fresh 58-case structural
comparison covers insert, update, tunes, move, remove, unknown/inert blocks,
no-ops, invalid commands and nested rollback in both modes. Changed host
commands commit canonically and become replayable after editing is enabled;
no-ops preserve Redo. The existing independent structural model is reused
unchanged and bound to the current Git source alongside every loaded module.
No new block-command obligation is counted a second time.

All three versions complete all 24 mode cases. The specification baseline
matches all 1,152 observations. v1 produces 1,128 observations with **24 API
representation differences**: its blocked public Undo/Redo return `false`,
where the current API throws. Both preserve content/history; these are not
reported as old editing failures. Its absent typed document/transaction fact
ports are declared in 24 observation records; no reader action is unavailable.
The fresh structural comparison retains the earlier 57 v1 differences and
unavailable producer/observation contracts, with 1,068 old observations; baseline
and current each pass all 1,192. Both raw comparisons keep exit 1 and the
independent current review exits 0. The initial 16-case exploratory corpus is
retained separately; its uncommitted fixture is not acceptance evidence.

Clean unchanged `run-7FaMgo` passes **all seven affected gates**: types, all 54
ordinary browser pages, native mode pages **24 ordinary + 25 enforced Trusted
Types cases**, the two comparisons/model, twelve corruption controls and docs.
The policy case actually rejects an untrusted HTML sink. Both new native pages
are included in the default runner. Environment: Windows x64, Node 24.22.2,
Chrome 156.0.8078.80. The mode corpus verifies 307 primary
module identities; structural controls verify 286.

Production is byte identical to `4e153854`, the runtime basis of the preceding
Font Size integration. Its original 27-gate run remains failed for two native
fixture imports, with 25 passing gates; the separate four-gate fixture-only
follow-up passes. Both exact manifests are inherited without changing their
outcomes. That runtime has Node 2,202 pass / three skips, 95.5 KiB gzip /
96 KiB FullPreset, heap 23 / zero retained, installed-package and site checks.
This test-only follow-up makes no fresh full-runtime claim. The
[checkpoint](https://github.com/Shelamkoff/editor/blob/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-11-03/public-readonly/README.md)
retains full corpora, executed models, native logs, corruptions, source manifests
and stored/decoded hashes. This is author verification with independent current
models. Other obligations and whole-library readiness remain open.


`artifact-hashes.json` binds stored and decoded evidence bytes.
