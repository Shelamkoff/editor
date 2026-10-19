# Rector v2 — canonical inline replay, literal token ownership, and widget DOM lease

**Date:** 2026-10-19  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `915f4269d938064c76d6cf0879ed744e2633bc4f`  
**Code checkpoint before this report:** `a6713380475bf327ec0a40a2ed03d45c32f18611`

## Scope and source of truth

Continue [the earlier hydration/serialization audit](RECTOR_V2_INLINE_PROJECTION_TEXT_OWNERSHIP_AUDIT_2026-10-19.md). This pass reviewed `InlineProjectionRuntime` through canonical model reconciliation, preserved native source DOM, cleanup of retired widget references, literal `{{id}}` text, and DOM reparenting during extension callbacks. The v2 remediation spec's P2/P3/P4 and I1/I2/I6/I7/I8 require preserving authored text, inline payload, actual event/DOM ownership, and an atomic replayable document state.

Affected production file: `core/InlineProjectionRuntime.js`. Regressions are in `tests/browser/native-tools.js`, calling the **public** `InlineProjectionRuntime` interface.

## Finding CANONICAL-REPLAY-1 — obsolete widget survived canonical removal (P2)

During `reconcileBlock(..., { preserveSourceProjection: true })`, the existing `#hydrateField` tail treated every mounted widget still contained by an editable field as live, irrespective of whether its canonical `inline` sidecar and rich-text reference remained present. After a logical removal, the previous DOM root could survive in the source field despite the next record no longer referencing its ID. This risks reintroducing retired widget content and confuses Undo/Redo replay.

**RED:** actual previous `#hydrateField` source, exercised against a controlled current state, kept `inline-1` live with an empty sidecar and zero matching canonical references. The stale root remained in the field and continued to contribute `Ada` to text that should have been `AB`.

**Fix:** a source-mounted widget is live only if its ID is still present in the canonical sidecar, has the expected type, and occurs exactly once across the canonical rich text. Otherwise the existing `#projectState` cleanup disposes the old widget instance. New browser test checks a canonical removal followed by a model replay restoring the same ID as a **new** mounted instance.

## Finding CANONICAL-REPLAY-2 — literal {{id}} moved the already mounted widget (P2)

When a live inline widget already represented an ID inside authored text, a user could also type the literal characters `{{inline-1}}` elsewhere in the editable field. The prior hydration scanner treated this literal as an instruction to reuse the same widget and appended it into the new fragment, moving the existing root out of its rightful author position. This violated authored text and DOM identity without any explicit move command.

**RED:** exact previous method moved the widget from its initial position between `A` and `B` to the typed literal at the end, rewriting `AAdaB{{inline-1}}` into `ABAda`.

**Fix:** if a live, current, same-type occurrence already occupies an authored DOM position in the same field, skip any incidental matching literal token found in adjacent author text. Preserve the existing root and the literal's Text node. A separate regression asserts both remain in place. Canonical full save/round-trip ambiguity when the *same* `{{id}}` appears as author text and as an actual sidecar reference remains a broader serialization-format acceptance case; passing live DOM reconciliation does **not** prove its persistence semantics.

- [RED browser regressions for canonical removal and typed literal](https://github.com/Shelamkoff/editor/commit/28b66610dae2a39d4b204f24a07c7eb8980b9c69)
- [Model-referenced live ownership and literal fix](https://github.com/Shelamkoff/editor/commit/08415a9e293dcec875ee5981b80c1efcb66e6976)

## Finding WIDGET-OWNER-3 — native control adoption within same field retained authority (P2)

The previous runtime resolvers considered `field.contains(widget)` sufficient. Moving the same widget beneath a native button or nested editing host **inside the same registered field** preserved connectivity and containment, but transferred actual DOM ownership. The public `resolveWidgetElement()`, `resolveWidgetInputTarget()`, and `captureNativeField()` still authorized it.

**RED:** using the real previous public resolver methods with a simulated registered mounted occurrence, both widget and caret resolution succeeded after moving it under a native button; native-field capture still contained one occurrence.

**Fix:** use one `belongsToAuthorField(field,node)` predicate that requires the path to the registered field to avoid native/role controls, nested editing hosts, and inline-widget owners other than the widget root itself. Apply it consistently to source hydration, live widget lookup, native capture, native update/notice paths and current occurrence checks. Detached staging fields remain supported because connectivity is checked independently from ancestry.

A special `allowDetached` lease used by native deletion must continue recognizing **actually removed** widget nodes so the deletion can be settled, but may not authorize a still-connected widget adopted by a native button. A separate regression covers both cases.

- [Native reparenting regression](https://github.com/Shelamkoff/editor/commit/b7db132e947fd2398033347bb45101350de67692)
- [Unified author-field DOM boundary](https://github.com/Shelamkoff/editor/commit/a1d39e27f51802a3289db19f77acdadd9ba69b85)
- [Native deletion lease regression](https://github.com/Shelamkoff/editor/commit/002d17a3d31904e5253246a93d80c66067840426)
- [Strict connected/legitimate detached lease](https://github.com/Shelamkoff/editor/commit/4d470526467458e573c231f203203771163dae71)

## Finding WIDGET-OWNER-4 — reentrant update could borrow a foreign root during hydration (P2)

While replaying a canonical inline reference, `#hydrateField` may reuse a detached prior widget after updating its data. A plugin's `instance.update()`, `setReadOnly()`, or observed attribute setter can synchronously append the root into another DOM container. The previous code did not verify the root was still detached before appending it into the editor fragment; fragment adoption silently stole it back from that external owner.

**RED:** real previous `#hydrateField` source under a synthetic document: update of an existing canonical occurrence attached the root to an external section, and the hydration call returned without error after moving it back to the rich field.

**Fix:** before adopting a widget root into the fragment, reject a non-null `parentNode` or a connected root. This allows the normal detached-to-author hydration path, but fails the projection when a callback illegally changes ownership. The existing projection transaction/recovery path handles the failure rather than silently continuing with borrowed DOM. A public browser regression checks the update callback is exercised and the unauthorized adoption is rejected.

- [RED browser regression](https://github.com/Shelamkoff/editor/commit/652d9822a7044ab01c83bf9d09c27c6c2f2499cc)
- [Hydration boundary fix](https://github.com/Shelamkoff/editor/commit/a6713380475bf327ec0a40a2ed03d45c32f18611)

## Focused verification matrix

| Check | Result | Evidence |
| --- | --- | --- |
| Original canonical-reference removal | **RED** | Real private hydration method retained stale widget |
| Current canonical removal, literal collision, existing widget | **3/3 pass** | Real method + synthetic DOM, ownership/cache counters |
| Original intra-field native adoption | **RED** | Real public resolver methods permitted button-adopted widget |
| Current connected / button-adopted / returned widget | **3 scenario groups pass** | Real public lookup/target/capture methods in V8 |
| Current native detached lease | **4/4 conditions pass** | Real method: connected accepted, button-adopted rejected, genuinely detached allowed only when opted in |
| Original external-root reparent during plugin update | **RED** | Actual prior hydration method stole plugin root from other container |
| Current ordinary vs reentrant plugin update | **2/2 pass** | Actual current hydration method in a synthetic document |
| Generalized canonical hydrate/current/drop/adopt | **4/4 pass** | Actual current private method in synthetic DOM |
| Existing related source-backed tests | **175/175 pass** | Current shared text offsets, logical selection, authority, inline normalization, realm, inline/native input and keyboard tests in isolated V8 |
| JavaScript syntax parse | **19/19 pass** | ESM imports/exports stripped; includes changed projector and browser regressions |
| New real Rector browser cases | **Authored, not executed** | Public runtime lifecycle, literal, button reparenting and reentrant callback fixtures |
| `npm test`, TypeScript, complete Chromium Rector, package/docs acceptance | **Not run** | No complete local repository with dependencies available |
| Full Undo/Redo equivalence and v1 behavior parity | **Not established** | Requires a complete editor/browser history gate |

The synthetic V8 checks evaluate actual fetched method bodies, not independently reimplemented production logic. However they are **not a substitute** for `node --test`, TypeScript, the complete browser editor, or a complete document save → Undo → Redo → restore test.

## Required acceptance

From a current branch checkout:

```sh
npm ci
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

In Chromium, exercise:
1. Source projection with an existing widget whose canonical sidecar/reference is removed; ensure one disposal and no ghost widget or extra Undo entry.
2. Undo reintroducing the same ID; ensure fresh widget element/lease with the correct sidecar payload, and redo returning to the removed state.
3. User-typed literal `{{inline-1}}` next to a still-mounted `inline-1` widget, including save/reload; confirm the literal and widget survive distinctly.
4. Native button or nested host adopting a widget; ensure it cannot receive author selection, mutation or native-delete authority.
5. Reentrant `update()` or `setReadOnly()` transferring the widget root; ensure failure rolls back and unrelated DOM remains owned.
6. Multi-field, backwards Unicode, read-only transitions and remounting a block with the same canonical ID.

No unrelated agents' files were overwritten, and changes were committed directly with per-file GitHub blob SHA preconditions.
