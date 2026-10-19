# Rector v2 — renderer provisional stylesheet leases and decorated DOM ownership

**Date:** 2026-10-19  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `a602bc3773148024f152ff1a7dc17ff2156e805b`

## Scope, normative contract, and review method

This pass audited actual `renderer/EditorRenderer.js`, `renderer/EditorRenderer.realm.test.js`, `renderer/reentrancy.test.js` and `shared/styleRegistry.js`. The active `RECTOR_V2_REMEDIATION_SPEC.md` requires renderer output to own its automatic CSS and returned DOM, reject adoption of another UI's element, and preserve stable existing mounts when a separate operation fails. The repository's `.agents/skills/tdd/SKILL.md` was reviewed and tests were written before each fix. Public feature behavior from v1 is a comparison target, not permission to restore obsolete v1 persisted formats.

Direct GitHub edits used the currently fetched blob SHA and targeted file replacements; no branch merge or pull request was created.

## Finding REND-STYLES-1 — wrapper allocation failure kept unowned stylesheet references (P2)

**Observed:** `EditorRenderer.render()` and `renderTo()` installed automatic stylesheet leases **before** creating a DOM wrapper. If the owning document's `createElement('div')` threw, the existing error cleanup was not reached. The operation returned no live output, but the stylesheet links remained registered in the DOM document.

**RED:** new regression tests used the existing foreign-document fixture, a real `acquireStyleUrls()` registry, and a document whose link insertion succeeds but `createElement('div')` throws. Both `render()` and `renderTo()` left styles that should have been released. The prior production source failed the tests for exactly that condition, not a missing dependency or failed fixture.

**Fix:** include stylesheet acquisition, wrapper construction and detached document publication in the `render()` cleanup boundary. Add an outer error cleanup boundary to `renderTo()` that releases automatically owned styles only if no living output requires them. Preserve the primary error, or report combined cleanup failure explicitly when rollback itself fails. No public API or format change.

**Positive control:** add a separate test where another result remains mounted in the same document while an independent detached render fails. Its stylesheet remains installed, the existing output remains mounted, and the final owner release removes the styles.

- [RED tests `fe7cc2d5`](https://github.com/Shelamkoff/editor/commit/fe7cc2d5fa03d9c8bf5e06006bbabcab4a96fadf)
- [Production fix `cee89b9e`](https://github.com/Shelamkoff/editor/commit/cee89b9ed1317cc8eaf7dfcbbba392ccb2f53b10)
- [Live-owner regression `53c93a1f`](https://github.com/Shelamkoff/editor/commit/53c93a1f9d7f1d57cc5cf2639006380d5014bf35)

**GREEN:** the complete `renderer/EditorRenderer.realm.test.js` test file—four test bodies including the three newly added cases—passed under isolated V8 with the actual current renderer and stylesheet registry implementations, adapting ESM imports, CSS module URLs and DOM/window interfaces.

## Finding REND-DOM-1 — custom element attribute callbacks could move the block node after ownership checks (P2)

**Observed:** `#createRenderedBlock()` checked whether a custom block-renderer node was connected, parented or foreign-document **before** writing its style and dataset attributes. Setting `dataset.blockId` or `dataset.blockType` can fire a custom element's synchronous attribute-change callback. That callback may attach the returned node under a different UI or adopt it into a different document. The former code then published or mounted the newly adopted node, stealing another owner's DOM.

**RED:** two new tests exercised the direct `renderBlock()` and mounted `renderTo()` paths with a dataset setter that reparented the element during decoration. Both failed against the old source: no rejection occurred. A third regression tested a setter that changed the element's `ownerDocument` while leaving it detached; that also failed against the source before the correction. Each test also checks that the provisional plugin disposer runs exactly once.

**Fix:** after all potentially reentrant attribute/style writes, revalidate both detached DOM ownership and the exact owning document immediately before the node is returned for publication. If ownership changed, reject, dispose the provisional renderer resource and do not move the node.

- [RED reparenting tests `8c887676`](https://github.com/Shelamkoff/editor/commit/8c8876761e10871e6c9f9a27afaf8cf4cf9467ee)
- [Production fix `76e0196f`](https://github.com/Shelamkoff/editor/commit/76e0196f096e6ef8f8eafd4c0b275bce9cbbb388)
- [Foreign-document regression `3e447a83`](https://github.com/Shelamkoff/editor/commit/3e447a8387382e105b005a2afca6b9a8dd3a1d23)

**GREEN:** all three new adoption tests pass against the actual updated renderer class with the existing fake-DOM test harness. Re-executed the three against pre-fix production commit `cee89b9e`: **3/3 failed** for their intended missing ownership rejection.

## Verification detail and boundaries

| Verification | Result | Limit |
| --- | --- | --- |
| Renderer per-document style, allocation failure and live owner coverage | **4/4 test bodies passed** | Isolated V8 with actual renderer/style registry but adapted module loader and fake DOM |
| `renderer/reentrancy.test.js` | **24/25 test bodies passed** | One additional case requires built-in table schema/renderer and public `renderer/index.js`; these were not loaded in the isolated adapter |
| Newly added adoption cases | **3/3 passed** (and 3/3 RED with old renderer) | Fake DOM, not native custom-element callbacks |
| All full Node.js and browser acceptance commands | **Not executed** | No full repository checkout/dependency installation in this execution environment |
| End-to-end v1/v2 feature parity | **Not established** | Separate acceptance matrix required |

**Important:** The one nonpassing adapted reentrancy case is `renderTo keeps the original validation identity through the signature snapshot`. The isolated adapter used an empty built-in renderer map and consequently returned `UnknownBlockTypeError` rather than the case's expected `InvalidBlockDataError` from the real registered table renderer. This is an **unexecuted integration contract** in that environment, not a demonstrated new production regression. No test was modified to hide it.

The tests exercise actual production source compiled with only module/import substitutions and controlled collaborators. They cannot replace native browser Custom Elements, JS engine DOM ownership or the project's Node test runner.

## Local acceptance on final HEAD

```sh
npm ci
node --test renderer/EditorRenderer.realm.test.js renderer/reentrancy.test.js renderer/index.test.js renderer/version-preflight.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

In Chromium, exercise a document `createElement('div')` failure after style acquisition, a sibling live renderer mount sharing the owning document, `attributeChangedCallback` reparenting during `data-block-type` updates, and foreign-document adoption. Verify original exception retention, zero leaked links after aborted output, no theft of a newer DOM owner's node, and exactly-once provisional renderer disposal.

## Conclusion

Two independently reproduced source-level renderer ownership bugs were corrected and given regression coverage. Neither the full package stability nor behavior parity with Rector v1 is certified without the complete local acceptance suite on final HEAD.
