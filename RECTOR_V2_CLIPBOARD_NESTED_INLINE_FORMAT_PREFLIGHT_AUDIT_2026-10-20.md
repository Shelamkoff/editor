# Rector v2 — private Clipboard nested inline envelope preflight audit

**Date:** 2026-10-20  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `289a21f55a378e5e5d61348677710f8ac4f6e5ef`  
**Production:** `core/ClipboardFragment.js`  
**Tests:** `core/ClipboardFragment.test.js`, existing Clipboard ownership/import and shared document schema suites.

## Scope and governing contract

Continued the stability and v1-feature-parity audit after the strict TransferBlock wire-format and ID-preflight fixes. The current `RECTOR_V2_REMEDIATION_SPEC.md`, **C0** and **C4 §8.1**, requires private MIME `application/x-rector-fragment` version 2 to be treated as untrusted current serialized input. A declared inline occurrence has nonempty `type`, positive exact-version `dataVersion` for the known extension, and a JSON object `data`. Unregistered extensions retain their explicit version and opaque data; unsupported undeclared record fields are rejected, not silently stored or dropped. Private-format validation must occur before individual parts can begin any authoring step.

The previous pass addressed unknown outer envelope/part/TransferBlock fields and direct transfer ID consumption. This pass looked for missed nested inline-envelope verification at the private MIME entry boundary. The project TDD skill and existing C0 decoder implementation were used rather than inventing parallel format rules.

## Finding C4-NESTED-INLINE-PREFLIGHT-1 (P2)

### Reproduction on the actual code

`decodeClipboardFragment()` checked root/part/TransferBlock field names and called the local `createClipboardFragment()` composer. This composer cloned `part.inline` and `part.block.inline` as arbitrary JSON objects without invoking the canonical inline-record validator.

As a result, the **old** decoder accepted these invalid private MIME records:
- Rich-text part with an inline widget missing mandatory `dataVersion`.
- Block part containing an inline widget with an unknown nested `future` field.
- Inline version `0` or an inline `data` field containing a string rather than an object.

The exported decoder thus returned a purportedly valid fragment even though those inline entries were not valid in C0. Such data might be rejected only later by `recordWithRichTextFragment()`, `materializeClipboardBlock()`, or a plugin-normalization path — after a consumer had begun preparing earlier parts, acquiring temporary resources or issuing session IDs.

The direct source-backed reproduction used actual old `ClipboardFragment.js`, `DocumentSchema.js` and JSON ownership functions. Both malformed examples were accepted. A valid unknown-type inline record with positive explicit `dataVersion` was also accepted, as intended.

### Correction

Import and invoke the existing exported `decodeCurrentInlineMap()` from `shared/DocumentSchema.js` **during private MIME decoding**, for both:

1. `{kind:'rich-text', inline}`
2. `{kind:'block', block:{ ..., inline }}`

It runs without a plugin resolver because `ClipboardFragment` is the neutral current-format codec: it verifies shape/positive versions/known field names without pretending to know which plugins will be installed in the destination editor. A later materialization stage still checks the **registered** schema's exact `currentVersion`.

The local `createClipboardFragment()` exporter remains a distinct API: it can take source blocks and strip origin-only `id`/`revision` when composing a current transfer, but untrusted private MIME now undergoes the stricter current inline envelope check before returning any parts. No legacy alias or fallback was added.

## Regression coverage

Added two tests:
- **Negative matrix:** four malformed inline-envelope variants, each exercised in rich-text and whole-block private parts, must throw during `decodeClipboardFragment()`.
- **Positive current-only control:** a future block and future inline type with valid explicit versions, opaque nested JSON and a referenced inline ID round-trip without data loss.

RED check against original source:
- **10/11** current Clipboard codec/ownership tests passed; the new negative test failed as intended.

After the production correction and test-only adjustment to match the shared schema's established `unsupported field` error:
- **11/11** Clipboard codec/ownership tests passed.
- **41/41** tests passed across the four current suites: `core/ClipboardFragment.test.js`, `core/ClipboardFragment.ownership.test.js`, `core/ClipboardPlans.importOwnership.test.js`, `shared/DocumentSchema.test.js`.

The broad check used actual fetched source bodies of `ClipboardFragment`, the shared canonical `DocumentSchema`, JSON cloning, validation metadata, the two exported Clipboard transfer materializers and all four suite bodies. Tests were executed in an isolated JavaScript/V8 harness with Node `test/assert` adapters and ESM module syntax adapted for the harness. This **is not** native `node --test` or a Chromium Clipboard interaction.

Direct commits:
- [RED tests](https://github.com/Shelamkoff/editor/commit/5295c2107926851977acf6ea1371971e46eb5728)
- [Production correction](https://github.com/Shelamkoff/editor/commit/a6e883cc57e06c134a8e8a24bb25d052e6a2f4f0)
- [Test diagnostic matching](https://github.com/Shelamkoff/editor/commit/ef000878daae0181da66d0eef32eb93ab3a71f8f)

## Required native/browser acceptance

In a complete installed checkout of the final branch:

```sh
npm ci
node --test core/ClipboardFragment.test.js \
  core/ClipboardFragment.ownership.test.js \
  core/ClipboardPlans.importOwnership.test.js \
  shared/DocumentSchema.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
```

In Chromium, copy/paste a private fragment with a valid first block and a malformed inline record in a later part, and prove that the destination model, history, selection and ID ownership remain intact and HTML/plain fallback does **not** activate after malformed private MIME. Also test an unknown current-format widget copied between independent editors, with and without its destination extension registered, and verify exact-version rejection by the destination registry.

**Outcome:** one confirmed early-validation defect fixed at the private Clipboard entrypoint with RED/GREEN proof and 41/41 current scoped source-backed tests. Full Rector v2 release readiness, native typecheck, real browser resource handling and the complete v1/v2 behavioral parity matrix remain **unverified**.
