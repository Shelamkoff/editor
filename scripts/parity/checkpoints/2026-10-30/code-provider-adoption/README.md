# Code highlighter provider ownership — 2026-10-30

The combined source `2afd45aaaab3f60574ed19cfb60bd37a55bda342` preserved the
independently repaired highlighter reentry and delayed-loader ownership paths.
Their combination still allowed a compatible provider to move the highlighted
element, source textarea, complete wrapper or block shell during its own
synchronous callback. The old completion then repainted a view whose source or
output no longer belonged to the original block.

Four native-input cases reproduce that defect before the fix: every case types
`X` with trusted input, records the markup immediately after the provider moves
the DOM, and observes the stale completion replacing it. All four fail for the
intended unwanted write, with no exception granted. The test-only RED patch and
raw failing log are retained.

The repair stays inside the existing Code refresh. After each external
highlighter boundary, the guard checks its original invocation, text, language,
internal parents and the existing `context.getData()` admission for the original
block owner. It rechecks the local conditions after that read. Whole-wrapper and
shell moves therefore cannot pass merely because their internal structure is
unchanged. No public API, additional owner or document mutation is introduced.
Normal initial projection, native editing, explicit unknown-language fallback,
newer accepted updates and synchronous projection errors remain covered.

All GREEN checks use the base plus `candidate.patch.gz`; `manifest.json` records
the full-index patch hashes, source-file hashes, exact commands, environment
identity and outcomes. The source was unchanged across the final checks:

- Nine native highlighter cases pass, including the four original failures.
- The complete native Code filter passes 22 cases on the partitioned fixture.
- The ordinary projection page passes, including current and adopted lazy Code
  views; its exact case count is retained in the manifest and raw log.
- Nine Code lifecycle/shared-highlighter unit tests pass with no skips. This
  includes the test requiring synchronous projection failures to reach callers.
- Both source typecheck projects pass.

The highlighter-only and complete Code results overlap and are not additive.
This is a bounded regression repair, not full preservation-register acceptance,
a new performance measurement or evidence for another browser engine. The
broader merge and publication checks are recorded separately by their owner.

An independent peer reviewed the guards and found no blocking issue. After the
checks, its one comment-only correction clarifies that the delayed loader also
checks ownership before invoking the provider. `publication.patch.gz` records
that final spelling separately; the executed candidate patch remains unchanged.
