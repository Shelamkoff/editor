# Registered decoder recovery and unknown inline preservation — accepted 2026-11-03

This checkpoint targets only `CONTRACT_PROJECTION_REGISTERED_DECODE_FAILURE`
and `CONTRACT_PROJECTION_UNKNOWN_INLINE_CONTROL`. Committed-source checks accept
these two rows: **94 accepted / 115 open**.

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

## Immutable acceptance

Candidate `d7eecafd25ef0474d3426a325674417908a75155`, tree
`5919b0146eece5c651c34ef289da322c1f1c842d`, passes all 24 cases / 215
manual expectations. Seven owner records and twelve primitive-cause records
also pass semantic data/classification/cleanup checks. The model reviews 299
observations across both v2 sources, verifies 458 production modules, 63
dependency files and eight dependency versions. The three v1 unknown-extension
losses remain FAIL; the baseline retains 3/24 passing with 84 observations.

`run-zTaAYr` passes five affected gates on clean unchanged source: types, all
47 ordinary browser pages, three-source comparison plus manual model, seven
corruption controls and docs. UTC interval: 2026-11-03 11:10:26.866 through
11:16:30.119. Source identity:
`7a3fd4b1e463cb3cae5bc0b32292798dfa472e8354b4569e8b995bbd1af35c79`.
Chrome product and revision match the separately integrated 21-gate source.
This five-gate result is not relabelled as another full 21-gate execution.

Raw comparison SHA-256:
`1c72106ccb91987a822b1a5bb196287904de6eb9eb2a6b264d80436e4d2b21cc`.
Executed verifier SHA-256:
`325b48165298e2985299df6a60c0ebad3d6a338dae1ef30b25d9090afb64827e`.
Raw exit 1 and manual-review exit 0 remain separate. Original logs, both
manifests, browser environment, exact executed verifier, all seven rejected
corpora and the transport diagnostic are retained with hashes.
