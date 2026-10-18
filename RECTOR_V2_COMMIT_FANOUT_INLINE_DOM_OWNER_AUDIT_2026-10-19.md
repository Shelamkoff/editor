# Rector v2 — committed event fanout and inline widget DOM ownership

**Date:** 2026-10-19  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `0b46241176adcaaa0f3b0612e1a1bcc25b655f03`  
**Reviewed contracts:** `RECTOR_V2_REMEDIATION_SPEC.md` §5.2–5.3 (independent post-commit observations), §10 (owned DOM), project skills `.agents/skills/tdd/SKILL.md` and `.agents/skills/modern-javascript-patterns/SKILL.md`.

## Finding COMMIT-FANOUT-1 — a failed post-commit adapter suppressed committed events (P1/P2)

The `createEditorRuntime` `onCommit` callback sequentially ran clipboard invalidation, interaction reconciliation, toolbar refresh, and the debounced `ChangeNotifier.schedule()` before publishing `transaction:committed`, `document:changed`, and `history:changed`.

The transaction engine already commits model/history before this callback and protects the entire callback with `invokeObserver`. But that single outer catch meant a thrown timer host or DOM/UI adapter **skipped all subsequent event publications**, even though the author transaction had committed. That violates the spec's rule that one post-commit observer may not obstruct other observers.

**RED witness:** extracted the exact unfixed `onCommit:event=>{...}` expression from `core/createEditorRuntime.js`, executed it in isolated V8 with failing clipboard, toolbar and notifier collaborators, and verified that an injected failure before fanout yielded no committed events. The unchanged control produced all three events.

**Fix:** wrap each post-commit adapter and each event dispatch in an independently contained completion step. Each failure is routed through the content-free diagnostics boundary; an error in any individual step does not prevent remaining events. This does not change the canonical commit point or allow nested editor mutations.

**Browser regression:** `tests/browser/runtime-contracts.js` now creates a real editor with `onChange`, patches only its unique debounce timer duration to throw, performs a public block update, then requires the canonical data and all three committed events to be present and independently shaped. The timer patch is restored in `finally`.

- [RED test addition `2c32d311`](https://github.com/Shelamkoff/editor/commit/2c32d3113eaab5d997fcdd7acfbb2d65c537c15d)
- [Production fix `2d3c61d6`](https://github.com/Shelamkoff/editor/commit/2d3c61d62f6b1e1e8ae59e8553b8dfef121ec189)

**Verification:** the current real `onCommit` expression passed six injected scenarios in isolated V8: failing notifier, toolbar, clipboard, one individual transaction event, one individual document event, and healthy control. Each retained the three expected event-dispatch attempts, with a single diagnostic for the failing step. Source syntax parsed successfully after adapting ESM imports. **The new real-Chromium browser test has not yet been run.**

## Finding INLINE-DOM-1 — renderer decoration adopted a node after its initial detached check (P2)

`renderer/inlineWidgets.js` correctly rejected an inline renderer that initially returned an already-connected or parented `HTMLElement`. But after that validation it called `element.setAttribute('data-inline-plugin', ...)`, `element.setAttribute('data-id', ...)` and set `contentEditable = 'false'` before appending the element to its provisional fragment.

A browser custom element's `attributeChangedCallback`, or an accessor-backed DOM fixture, can synchronously attach the returned node to a different UI during any of those writes. The previous renderer did not recheck ownership and then moved the now-foreign node into the editor's fragment.

**RED:** two new tests on the actual old `inlineWidgets.js` source fail while the seven existing cases pass: adoption during `setAttribute`, and adoption via a `contentEditable` setter. The observable contract is that no projection is published and the adopted node retains its newer parent.

**Fix:** check detached and correct owner-document state again immediately after the fallible decoration writes, before `replacement.append(element)`. No node from another DOM owner is moved into the renderer output.

- [RED regression tests `95cfbaf5`](https://github.com/Shelamkoff/editor/commit/95cfbaf5e07ee9228e848f7ca835efa945dfe8f6)
- [Production fix `2434b502`](https://github.com/Shelamkoff/editor/commit/2434b50253917ec7a594f35e1fbac4c5e9ea6ceb)

**Verification:** all **9/9 `renderer/inlineWidgets.test.js`** test bodies passed with the actual fixed module in isolated V8 and a lightweight Node-test assertion adapter. This is not a real custom-element/browser test and not a proof of full rendering stability or v1/v2 behavioral parity.

## Verification and local acceptance

| Area | Status |
| --- | --- |
| Fresh remote code and latest commits inspected before and after edits | Confirmed |
| Commit fanout RED source witness, then 6-case isolated GREEN | Confirmed |
| Inline DOM adoption RED (2 fails, 7 controls pass), then 9/9 GREEN | Confirmed |
| Browser regression written in `tests/browser/runtime-contracts.js` | Written, not run |
| Full `npm test` and `npm run typecheck` at final HEAD | Not run |
| Chrome/native/IME, styles, heap, package, full v1/v2 author gesture matrix | Not run |

Run from a fresh checkout:

```sh
npm ci
node --test renderer/inlineWidgets.test.js renderer/reentrancy.test.js renderer/index.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

In Chromium, confirm an adopted custom element is not stolen by inline projection, `attributeChangedCallback` reentry does not partially replace text nodes, and a post-commit timer/toolbar failure does not suppress immutable transaction, document and history notifications.

## Conclusion

Two source-level defects were reproduced and corrected with focused regression evidence. These changes improve ownership and event delivery but **do not** establish full-library stability or complete behavioral parity with Rector v1. Full Node/browser/package acceptance remains pending.
