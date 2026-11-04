# Transaction atomicity — 2026-11-04

**Accepted: HISTORY_ATOMICITY.**
Register: **144 accepted / 65 open / 209 total**. Tested source: `750e99ae5e3a29eed6af823096715de907c10df3`.

`HISTORY_ATOMICITY` is accepted on `750e99ae`: **144/209 obligations
accepted, 65 open**. All **five affected gates** pass on one clean unchanged
source. [Exact evidence](https://github.com/Shelamkoff/editor/blob/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-11-04/transaction-atomicity/README.md) verifies **20 current executions / 252
observations**, **116 module identities** and **22 rejected corruptions**.
No implementation repair is required.

The actual immutable DocumentStore, HistoryStore and TransactionEngine execute
six caught nested falsy throws (null, undefined, false, zero, empty string and
NaN), projection prepare/apply/recovery failures and a forbidden asynchronous
transaction return. Rejection preserves both complete blocks, revision and
Undo/Redo depths, publishes nothing and discards the failed projection where
required. Recoverable engines retain the previous Redo and admit a fresh write
with exact Undo/Redo; failed recovery leaves readable data and an explicitly
failed engine that denies both Redo and writes. Caller input remains unchanged.
The independent literal oracle also checks error identity and projection traces.

These are internal module contracts with controlled faults, **not native user
gestures**. All ten scenarios complete on the baseline, immutable parent and
both current policies without errors or differences. v1 has no
`core/TransactionEngine.js`: its ten scenario bodies are explicitly unexecuted.
Only actual module absence and its loaded editor export are checked there.
The first exploratory fixture incorrectly expected module availability; its
ten availability mismatches, exact source and corrected run remain archived.
They are not legacy behavior failures.

The existing native presentation-recovery page separately passes **14
cases**. It exercises real browser composition, selection and interface
recovery; it is not a historical differential. Docs/site pass. Production bytes
remain identical to `ce76492c`, retaining the prior fifteen passing integration
gates and two complete native follow-up gates with their actual sources/dates
and original timeout. Inventory remains **104 native pages**. Only this history
row is newly accepted; native typing/IME, B-HTML and full readiness remain open.
