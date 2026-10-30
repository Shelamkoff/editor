# Person canonical tab labels — 2026-10-30

Verified implementation and tests: `d673b9d04d9aad7d1687b356f7a726455b6fd99e`,
tree `97b0748553c19307f84a2dae3782fbe427318643`. The isolated worktree was based
on `e99fec9d3cfe6b3b05028fb60bc26bb24c3924ef`. This checkpoint closes the
reproduced never-opened Person widget-name label defect. It does not accept a
new preservation-register row or claim full-library parity.

The production change is also included in the later [published assembled
source](https://github.com/Shelamkoff/editor/commit/37ed30083ee97629eecf284944f99b7b330d65ad).
That assembly contains other Gallery/core repairs and is not tree-equivalent
to the isolated source verified here; its combined validation is separate.

## Behavior and contract

A never-opened profile name previously displayed
`Alpha {{mention}} {{swatch}} tail` instead of the independently expected
`Alpha @Ada #123456 tail`. Opening the actual field hydrated the correct text,
with no change to author data or history. The earlier
[sibling-field checkpoint](../person-rich-field-preservation/README.md),
[Person common proof](../person-roundtrip/README.md) and
[combined continuation](../continuation-final-integration/README.md) retain
that source-specific open status and their original evidence. This is the
later resolution of that defect.

Specification §16.8 now defines optional pure `InlinePluginDefinition.toText`
and scoped `BlockInstanceContext.getFieldText`. Text derivation uses the same
canonical rich-field mapping and reference/literal scanner. It reads the
admitted prospective record during projection, captures the inline callback
with its receiver, freezes its decoded payload and rejects asynchronous or
non-string results. It does not acquire hidden widget instances, provider
requests or a second model/lifecycle. Unknown or unsupported inline text
capabilities retain token text; configured Mention triggers and Color values
come from their own definitions.

An instance that queries canonical field text receives existing `update`
delivery for sidecar-only changes. A consumer without `update` uses the
existing replacement path. Person retains unaffected author fields and native
controls; its active label still follows actual completed DOM through
`afterProjection`. Canonical text does not describe transient widget previews
or mode-specific presentation.

## Executed proof

| Gate | Recorded result |
| --- | --- |
| RED `run-xQuiuf`, original production plus the regression | 161 projection cases: 160 pass; only the new never-opened label assertion fails |
| GREEN `run-QMUd5Z`, related unit files | 306/306 pass; no failures or skips |
| GREEN complete `projection-contracts.html` | 190/190 pass |
| GREEN `native-plugin-parity.html`, `Person` filter | 20/20 pass |
| GREEN source typecheck | Both projects pass |
| GREEN generated declaration contracts | 7/7 pass |

Both original manifests report `sourceUnchanged: true`. The GREEN run finished
at `2026-10-30T03:44:02.230Z`; all five planned gates passed. Environment:
Linux x64, Node `24.22.1`, npm `11.9.0`, actual Chrome `156.0.8078.47` and an
isolated Vite cache. The exact launcher/configuration are retained in
`environment/`; their absolute installed-dependency paths identify that
environment rather than a portable installation requirement. The manifest
records the exact command and environment of each gate.

The public Person tests cover initial labels without hidden instances or
search requests, configured triggers, literal/unknown tokens, one-pass entity
decoding, both modes and a scoped widget edit followed by closing that profile
and Undo/Redo. That edit deliberately has no selection bookmark, so history
does not request opening the hidden field. Active author Text nodes, backward
ranges and widget identities stay intact. A trusted native `beforeinput` URL
control performs a sibling inline update during the event and verifies the
retained input/icon, continuing text and exact history sequence.

The independent custom-inline controls exercise prospective sidecar delivery
before acceptance, optional-update replacement, opt-in delivery, deeply frozen
payloads, receiver capture, invalid keys, rejected nested writes/control/tasks,
recursive reads, stale owners and root/shell adoption. Ordinary, falsy,
thenable and invalid-result failures use the existing initial, direct-read,
canonical-update and mode recovery owners. Declared methods also pass the
generated strict consumer checks.

## Exact source reconstruction

The verification ran before the implementation commit, so the original
manifests correctly describe dirty snapshots of the base, not a clean commit:

- RED tracked patch: `red/source.patch.gz`, decompressed SHA-256
  `3b7d5a2bcfc19562ff6010000e0ba7917fcda169da741d7998e80d5214d4b54c`.
  `red/fixture.js` is the exact executed regression file. The reconstructed
  patch was verified against the original manifest's recorded hash.
- GREEN tracked patch: `green/source.patch.gz`, decompressed SHA-256
  `b3cc91c2232100c3782f117b6074206f1564b48f1554cb348758635ba7695b66`.
  The then-untracked `tests/browser/regressions/canonical-field-text.js` is
  retained as `green/canonical-field-text.js`, SHA-256
  `f340f9c33af4fb238cc43c346e706a435daf274449f8948f019dc911b8d32123`.

In a disposable checkout of the base, decompress the corresponding patch and
apply it with `git apply`. For GREEN, also place the retained untracked file at
its recorded repository path.
The result matches the implementation/test commit above. Install the pinned
dependencies and use an available Chromium via `EDITOR_CHROME_PATH`; the
standard browser runner can use an environment-appropriate Vite launcher.
The focused browser commands are:

```sh
EDITOR_BROWSER_PAGE=projection-contracts.html node tests/browser/run.mjs
EDITOR_NATIVE_PAGE=native-plugin-parity.html EDITOR_NATIVE_FILTER=Person node tests/browser/physical-history.mjs
```

Original manifests and compressed complete logs are in `red/` and `green/`.
The original RED failure JSON remains failed. `summary.json` records the
scope and identities; `hash-index.json` hashes the retained checkpoint files.
Earlier development-only fixture mistakes are not acceptance results: one
exploratory fixture tried to change the inline map through public
`blocks.update`, which correctly rejected it. The final generic tests use the
existing canonical inline-update owner; public Person tests use real scoped
widget edits and history. No write API was added to accommodate the tests.

The full combined suite, wider browser/platform coverage, performance and all
unaccepted detailed preservation rows remain separate obligations. This
checkpoint contains no new timing, heap or whole-library acceptance claim.
