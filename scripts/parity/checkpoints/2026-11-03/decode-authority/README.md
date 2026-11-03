# Registered decoder recovery and unknown inline preservation — pending

This checkpoint targets only `CONTRACT_PROJECTION_REGISTERED_DECODE_FAILURE`
and `CONTRACT_PROJECTION_UNKNOWN_INLINE_CONTROL`. The register remains
**92 accepted / 117 open** until committed-source checks finish.

The seven existing owner-recovery cases retain their names and assertions in
the original regression suite. A dedicated comparative copy captures their
public data, schema classification, failure identity, application-controlled
phase flags, scope signals, history, restoration and final public destruction.
Fourteen further cases cover all six falsy thrown values with one or two
projection failures, own cause presence (including undefined), ordered aggregate
causes, and returned Promise/thenable rejection without literal fallback.
Three unknown-extension cases use IDs `future`, `__proto__` and `constructor`,
opaque nested JSON keys, inert marker identity, Undo/Redo, mode changes and the
public renderer, with a registered known-extension control.

The exploratory current source passes 24 cases / 215 manually specified
expectations. The baseline retains three passing and 21 failed/incomplete
cases with 84 observations. Actual v1 import/save/DOM/renderer controls execute
through legacy APIs: all three preserve literal visible/output text but lose
opaque inline data and fail. These losses remain FAIL, not unavailable cases.
The basic v1 Paragraph save/render/disposal control passes. No new-definition
or versioned-schema port is emulated on v1.

Playwright's object-result transport strips own `__proto__` keys. A separate
blank-page diagnostic reproduces this without loading the editor. The runner
therefore returns JSON text from the browser and parses it in Node, preserving
those keys. The manual Python model rejected the earlier object-transport
corpus; it checks both operands against its own opaque-data model and explicit
key-presence observations. This was a test transport issue, not product RED.

The committed runner serves production and common test modules from exact Git
objects, observes assertion descriptors without evaluating result getters, and
preserves raw legacy/baseline failures with exit 1. The independent manual model
imports neither runtime nor browser fixtures; the existing read-only validation
issue lookup only classifies errors and does not normalize expected data.
Seven corruption controls exercise source identity, literal fallback, missing
undefined cause, consistent proto loss, incomplete cleanup, relabelled legacy
loss and a missing reversal case. Verification is by the author, not a separate
agent. Runtime equality is bound to the original successful 21-gate `f2070510`
manifest and its original Chrome 156.0.8078.80 environment log. No production
change, full C12, native gesture or full B-HTML acceptance is claimed here.
