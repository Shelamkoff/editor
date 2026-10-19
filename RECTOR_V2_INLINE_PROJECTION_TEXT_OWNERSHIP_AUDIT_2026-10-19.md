# Rector v2 — inline projection hydration and serialization text ownership

**Date:** 2026-10-19  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `1ad13e1d0acd627fdc89944db09d10da284bc922`

## Purpose and architectural requirements

Continue the [inline widget detachment and deferred-focus audit](RECTOR_V2_INLINE_WIDGET_DETACH_FOCUS_LIFETIME_AUDIT_2026-10-19.md). This pass audited the remaining `InlineProjectionRuntime` boundary that converts authored inline reference tokens to mounted widgets and serializes mounted DOM back into the canonical rich-text model.

The v2 remediation spec P2/P3/P4 and I2/I6/I7 require that only the author-owned selection and current inline sidecar contribute to document content. Inline widget presentation, its label and native auxiliary control DOM must not be interpreted as separate authored reference tokens or persisted text. Staged/retired widget ownership and one-operation Undo/Redo must remain intact.

Reviewed `core/InlineProjectionRuntime.js`, source tests in `tests/browser/native-tools.js`, `shared/richTextCodec.js`, `shared/sanitize/walker.js`, and related text selection / input-controller tests.

## Finding HYDRATE-OWNER-1 — a native label containing {{id}} moved an existing inline widget into a control (P2)

`InlineProjectionRuntime.#hydrateField()` previously created an unrestricted text-only `TreeWalker` under a rich text field. During `reconcileBlock(..., {preserveSourceProjection:true})`, the field may already contain mounted widget roots, native controls or nested independent editing hosts. Their labels can legitimately contain literal characters matching the canonical inline token grammar (for example `{{inline-1}}`).

The original code recognized a button label `{{inline-1}}` as if it were another authored reference to the one canonical occurrence and reused the same instance `state.widgets.get('inline-1')`. Appending the existing widget into a fragment moved it out of the author text and into the native button. A placeholder-shaped **widget's own label** could likewise be interpreted recursively, attempting to hydrate the widget inside one of its own descendants.

**RED:** the exact original `#hydrateField` source was executed in a synthetic current widget/field DOM using the original token matcher. With an author-owned widget between `A` and `B`, and a button labeled `{{inline-1}}`, the method returned with `widgetParent === 'BUTTON'`, `widgetInsideButton === true`, and button text replaced by `Ada`. This is a concrete owner/DOM mutation, not just a regex observation.

**Fix:** restrict the source-projection hydration snapshot to text nodes whose ancestors up to the registered field contain no native/role button, `[contenteditable]` editing island, `[data-inline-plugin]` widget or other native control. The field itself remains an allowed boundary, including when its own `contenteditable` is false during read-only presentation. Legitimate tokens within ordinary inline formatting wrappers still hydrate.

**GREEN:** evaluating the revised full private method preserved the live widget as a child of its author field, left the native button label unchanged, and kept a self-referential widget label `{{inline-1}}` literal rather than rehydrating its own widget. The ordinary authored-token path remained enabled.

- [Native control literal token regression](https://github.com/Shelamkoff/editor/commit/7ef507577888f38fd026a907a91d3ed9c37e4b5e)
- [Self-referential widget label regression](https://github.com/Shelamkoff/editor/commit/726d44cfc57f216fc211226f9dffad07218b0d02)
- [Production fix](https://github.com/Shelamkoff/editor/commit/f3f61a1da766480e8179061ea26bd5dfef0f5d57)

## Finding SERIALIZE-OWNER-2 — native and locked control labels leaked into canonical saved text (P2)

`InlineProjectionRuntime.#serializeField()` correctly mapped **currently owned inline widget roots** to `{{id}}` tokens. But it also recursively cloned unrelated native controls, locked descendants and nested editing hosts. The sanitizer's documented behavior intentionally **unwraps unknown tags while keeping their children**. Thus cloning a button or locked span would persist its plain label even after the dangerous/unsupported HTML element was stripped.

**RED:** exact original serializer with a controlled author field, native button `SETTINGS`, locked span `LOCKED`, and author `Alpha<b>Beta</b>` produced:

```html
AlphaSETTINGSLOCKED<b>Beta</b>
```

That persisted unrelated interface text rather than the authored `Alpha<b>Beta</b>`.

**Fix:** once a current inline-widget root has been serialized to its canonical reference, skip generic native controls, role buttons, nested `[contenteditable]` hosts, and unowned `[data-inline-plugin]` markup while cloning ordinary author DOM. The serializer never mutates source nodes.

**GREEN:** the exact revised method produced `Alpha<b>Beta</b>{{widget-1}}` when a valid mounted inline widget was also present. This proves ordinary formatting and the current sidecar reference remain represented, without the button/locked labels.

- [Serialization regression](https://github.com/Shelamkoff/editor/commit/a102660ffa27fe27a1c9c9d33b68305ede9177dc)
- [Production fix](https://github.com/Shelamkoff/editor/commit/a3674ea88571f069e6d1313a888818c7ca7a4597)

## Focused verification

| Gate | Result | Verification scope |
| --- | --- | --- |
| Original `#hydrateField` button label behavior | **RED** | Exact actual source executed with a synthetic DOM/registered widget |
| Current `#hydrateField` native label / self label / authored path | **Passed** | Exact revised method with the same synthetic DOM and source matcher |
| Original `#serializeField` control-label leakage | **RED** | Exact original method in a DOM serializer fixture |
| Current `#serializeField` + live inline ref | **Passed** | Exact revised method: expected author HTML plus `{{widget-1}}` |
| Shared UTF-16 text offset tests | **9/9 passed** | Actual source/tests under V8 adapter |
| LogicalSelection tests | **28/28 passed** | Actual source/tests under V8 adapter |
| InlineSelectionAuthority tests | **22/22 passed** | Actual source/tests under V8 adapter |
| Inline normalization tests | **9/9 passed** | Actual source/tests under V8 adapter |
| Owner-realm offset test | **1/1 passed** | Actual source/test under V8 adapter |
| InlineWidgetInputController tests | **35/35 passed** | Actual source/tests under V8, including microtasks |
| NativeInputController tests | **29/29 passed** | Actual source/tests under V8 |
| KeyboardRouter tests | **42/42 passed** | Actual source/tests under V8 |
| **Combined focused tests** | **175/175 passed** | Source-backed, isolated V8 only; no full Node.js project runner |
| JS syntax parsing | **19/19 passed** | Imports/exports stripped for V8 checks, not TypeScript |
| Actual Rector browser regression cases | **Three added, not executed** | Native label, widget self-label and control-label serialization |
| Full `npm test`, TypeScript and complete v1/v2 parity | **Not established** | Full checkout and dependencies not available in the working container |

In particular, this audit does not claim that a real undo/redo roundtrip or HTML sanitizer integration passed in the complete browser editor. The source-based fixtures verify the two precise broken methods, and the browser cases define further acceptance requirements.

## Acceptance still required

```sh
npm ci
node --test core/InlineWidgetInputController.test.js core/NativeInputController.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:types
npm run test:package
npm run test:docs
npm run docs:check
```

Add full-browser checks for save/Undo/Redo with a literal `{{inline-1}}` in a widget's label and in native controls; verify one mounted occurrence, correct `inline` sidecar, no loss of author text and no control label leakage after state replay. Also repeat when replacing the block with the same canonical ID, and on read-only transitions.

All changes were committed directly to `refactor/rector-v2-architecture` using current blob SHAs for each edited file. No force push or unrelated parallel changes were overwritten.
