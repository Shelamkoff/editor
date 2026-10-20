# Rector v2 — Clipboard transfer preflight and strict private MIME validation audit

**Date:** 2026-10-20  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `0b1762959d3b76551085ad9c7c32f869ce360150`  
**Primary production modules:** `core/ClipboardPlans.js`, `core/ClipboardFragment.js`  
**Regression suites:** `core/ClipboardPlans.importOwnership.test.js`, `core/ClipboardFragment.test.js`, `core/ClipboardFragment.ownership.test.js`.

## Contract and scope

Continued Rector v2's bug/parity audit after the canonical inline-reference ownership fixes. The current `RECTOR_V2_REMEDIATION_SPEC.md`, section **8.1 (C4)**, requires private MIME `application/x-rector-fragment` at **version 2** to be treated as untrusted input; **TransferBlock** is the current, ID-free transfer envelope with only `type`, `dataVersion`, `data`, optional `tunes` and `inline`. The receiver must fully validate current format and exact known-type versions **before allocating new persistent session IDs**. A malformed current private fragment must be rejected, not silently downgraded to a lossy shape; unknown **extension types**, by contrast, must be preserved as opaque current data.

The project TDD and architecture instructions were consulted. The previous `core/CanonicalTransforms.js` changes were not overwritten; this pass concerns the next Clipboard import boundary and codec. No v1 format support, migration, or alternate Clipboard transfer format was added.

## Finding C4-TRANSFER-ID-1 — invalid transferred data consumed a session block ID (P2)

### Reproduction

`materializeClipboardBlock(services, input, reserved)` previously called `services.allocateId(input.type, reserved)` **before** running the shared `decodeCurrentBlock()` with the registered exact-version block/inline schemas. Since the editor's session ID allocator deliberately does not reuse IDs once emitted, a rejected Clipboard part could permanently consume an ID without inserting any record.

A new public function regression checked a known block with the **wrong `dataVersion`**, another with malformed registered block data, and a valid block. Against the actual previous production code, all **three new checks failed**: bad blocks allocated an ID first and a valid block's event order was `allocate → decode → record` instead of `decode → allocate → record`.

### Correction

Materialize and exact-validate the transfer as a temporary `decodeCurrentBlock` candidate using an internal `clipboard-pending` placeholder ID. This placeholder is **never allocated or published** as real document identity. Only after successfully decoding the entire block and its optional nested inline records does the receiver call `allocateId(decoded.type, reserved)`. The returned canonical block uses the actual allocated ID, whether it has a registered schema or is an inert unregistered type.

Additional controls verify:
- Mismatched version of a nested registered inline widget also fails **without an ID allocation**.
- A current-format block of an **unregistered extension type** retains its opaque payload and inline map (detached), obtains one fresh destination ID and never invokes an unknown plugin's record assembly.

The focused exported-materializer and rich-text import tests passed **8/8** against the final source.

Commits:
- [Preflight RED regressions](https://github.com/Shelamkoff/editor/commit/9b12bb4f997fbe9070addd1864660916f8950872)
- [Production preflight correction](https://github.com/Shelamkoff/editor/commit/2d793431f76728675ece0fdd657a64d5c7c05dd6)
- [Nested inline version and opaque-type regressions](https://github.com/Shelamkoff/editor/commit/a4bd511e097545a54bae56daba4407d5831f49aa)

## Finding C4-WIRE-FIELDS-1 — unknown private fragment envelope fields were silently removed (P2)

### Reproduction

`decodeClipboardFragment()` correctly checked version and rejected two removed top-level legacy shape keys, but then called `createClipboardFragment(source.parts)`. That local exporter reconstructs only known fields. Accordingly, a private MIME fragment carrying an **unknown top-level, part or TransferBlock field**, including forbidden origin `id` or `revision`, was treated as valid and its field was silently discarded. The current C4 wire contract permits neither future envelope fields nor origin identity metadata inside the transferred block.

The added negative test supplies five categories of undeclared wire fields. The old source passed **8/9** codec tests and failed the new strict-private-wire test by accepting the malformed input.

### Correction

- Validate allowed **own string field names** of the parsed JSON root and each part before local normalization.
- For block parts, also validate the TransferBlock envelope against the C4 field names.
- Keep the existing explicit wrong-version/removed-shape errors and subsequent dense-part/JSON ownership validation.
- Keep `createClipboardFragment` as a **local export composer**: copying a local source block is still supposed to strip its original `id` and `revision` before serialization.
- Preserve valid current opaque payloads for unregistered block and inline types.

Codec + ownership tests then passed **9/9**.

Commits:
- [Strict MIME RED and opaque positive tests](https://github.com/Shelamkoff/editor/commit/7bf1003e29ab17a821438977c3514688a842e9e4)
- [Private MIME wire validation correction](https://github.com/Shelamkoff/editor/commit/2aae6f07031e0e80c426c7925928b9ed09aff0ff)

## Finding C4-DIRECT-TRANSFER-1 — direct materialization bypassed strict wire field names (P2)

Although the repaired private MIME decoder rejects extra fields, `materializeClipboardBlock()` is also an exported function reachable from internal Clipboard plans. Direct callers could still pass TransferBlock with an undeclared property and have the receiver silently drop it. The regression also supplied a throwing `type` accessor to ensure the malformed envelope is rejected by **property name** before accessing payload getters or allocating IDs.

The new direct-entry regression failed on the intermediate source (**0/1** new check passed). The final correction exports the narrow, shared `assertClipboardTransferFields()` validator from `core/ClipboardFragment.js`. Both the private MIME decoder and `core/ClipboardPlans.materializeClipboardBlock` use it before any transfer type/data inspection. This avoids parallel, divergent allowlists and maintains the ID-free current transfer contract.

Commits:
- [Direct-entry RED test](https://github.com/Shelamkoff/editor/commit/4ca623959644a686506e38d7d5b63bd3ede7a62d)
- [Shared transfer-field validator](https://github.com/Shelamkoff/editor/commit/bc6b81e4a8d2869ce192f0f09478b4eb564c2b05)
- [Receiver preflight correction](https://github.com/Shelamkoff/editor/commit/9b7256b30347735c75defb52121bae3c0015d5f1)

## Source-backed RED → GREEN evidence

| Stage | Focused result |
| --- | ---: |
| Old materializer with three new validation/ID tests | **0/3** new cases passed |
| Preflight fix, original materializer/import tests + three regressions | **6/6** passed |
| Added invalid nested inline and valid opaque block controls | **8/8** materializer/import checks passed |
| Old private MIME decoder with strict wire regression | **8/9** passed |
| Strict private MIME fix | **9/9** codec + ownership checks passed |
| Direct-receiver wire regression against pre-fix receiver | **0/1** new checks passed |
| **Final combined two Clipboard entrypoint groups** | **18/18 passed** |

For the final check, used **actual current production bodies** of `core/ClipboardFragment.js`, `core/ClipboardPlans.js` (the two exported materialization functions), `shared/DocumentSchema.js`, `shared/jsonData.js`, `shared/cloneEditorData.js`, `shared/documentValidationIssue.js`, `shared/documentFormat.js` and `shared/synchronousResult.js`. The exact corresponding three test files were executed in an isolated JavaScript/V8 harness with a minimal Node assertion/test registration adapter. The whole Clipboard plans module was **not** imported from an installed repository checkout; its two relevant exported production functions were evaluated unchanged apart from module syntax adaptation. This is narrow behavioral evidence, not native `node --test`, full Clipboard event/DOM integration, or complete v1/v2 parity.

Verified final source blobs:
- `core/ClipboardPlans.js` — `d56322c4a73f34e1a9cb5d0c17581d5abea3dc6a`
- `core/ClipboardFragment.js` — `541c5c9b4f4d7b41d6e9db5c8ad00f4c0f02e408`

## Required release acceptance

In a complete checkout with dependencies, run:

```sh
npm ci
node --test core/ClipboardFragment.test.js core/ClipboardFragment.ownership.test.js \
  core/ClipboardPlans.importOwnership.test.js core/ClipboardPlans.localHtml.test.js \
  shared/DocumentSchema.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
```

In Chromium, test Copy/Paste across independent editor instances with current known and unknown block/inline types; paste mixed valid/invalid block parts; wrong document/block/inline versions; private MIME present but malformed; rapid copy/paste including Clipboard errors; and atomic transaction/history behavior. Confirm failed current private MIME does **not** fall back to HTML/plain text and does not mutate the committed editor state.

**Status:** three confirmed Clipboard validation/order defects fixed with RED/GREEN regressions and positive compatibility controls. Scoped **18/18** source-backed tests green. Native typecheck, package consumers, real browser acceptance, lifecycle/heap, and full v1/v2 behavioral parity are **not yet verified**.
