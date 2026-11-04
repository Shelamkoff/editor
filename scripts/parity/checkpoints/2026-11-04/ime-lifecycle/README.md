# Native IME lifecycle — 2026-11-04

**Accepted: NATIVE_IME.**
Register: **145 accepted / 64 open / 209 total**. Tested source: `0e470fe5a84474aaf08658d6b2ee4ca6f6a1f7f2`.

`NATIVE_IME` is accepted on `0e470fe5`: **145/209 obligations accepted,
64 open**. All **sixteen integration gates** pass on one clean unchanged source.
[Exact evidence](https://github.com/Shelamkoff/editor/blob/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-11-04/ime-lifecycle/README.md) verifies **16 current executions / 360 observations**,
**380 module identities** and **22 rejected corruptions**.

The repaired defect was reproducible before the change: replacing a document
during composition detached its host without necessarily receiving compositionend.
The retired session then suppressed Ctrl+Z even after the new field was focused.
Accepted document changes now retire stale composition by generation, revision
and mode epoch before UI notifications. Reconciliation at the same document
identity preserves a live composition. The canonical pre-fix run retains both
failed observations per policy; its actual events and data match the immutable
parent. The controller tests reproduce the failure and preserve the live control.

Actual Chrome composition confirms once, cancels without history, replaces both
range directions and keeps successive confirmations as separate history units.
Pending updates stay out of canonical data. Render, read-only transitions and
destroy revoke late preedit; a same-holder successor accepts only its own fresh
input. Exact native Undo/Redo, caret/direction, DOM text and caller ownership pass.
Trusted compositionstart/updates and the engine-generated **untrusted**
compositionend are recorded as observed. This is supported browser-engine input
through CDP, not a physical operating-system IME certification.

All eight cases finish without page/input errors on v1, baseline, parent and both
current policies. v1 retains **54 differences**, baseline and parent **two** each;
current improvements remain. Legacy transaction subscriptions are explicitly
unavailable. Native pages pass **8 + 9 + 16 + 14 cases**, totaling
**47**; inventory is **106 native pages**. The complete build, Node,
implementation/public types, ordinary browser pages, package consumer/assets,
bundle budget, heap, docs and site gates pass. Exact logs retain their measured
counts. The first exploratory render-shortcut fixture lacked renewed field focus;
the corrected pre-fix run still reproduces the product bug. All attempts remain
archived. Only this IME row is newly accepted; ordinary typing, B-HTML and full
readiness remain open.

Post-acceptance documentation and site checks pass on `a2addaac`.
`artifact-hashes.json` verifies actual Git blobs and decoded compressed artifacts.
