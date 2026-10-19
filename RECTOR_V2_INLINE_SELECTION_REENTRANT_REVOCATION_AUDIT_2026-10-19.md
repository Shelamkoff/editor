# Rector v2 — inline selection authority after synchronous owner revocation

**Date:** 2026-10-19  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `fb43cd326ff060ab100f83d851c8ce974781874f`  
**Production:** `core/InlineSelectionAuthority.js`  
**Regression suite:** `core/InlineSelectionAuthority.test.js`

## Scope and contract

Audited C6 protected formatting authority against `RECTOR_V2_REMEDIATION_SPEC.md` §10.2–10.3 and the repo's TDD instructions. Inline tool/panel selection must remain scoped to one living mount and lease. Once a callback revokes or replaces the presentation, the old port must not return a native DOM Range, issue a bookmark token, report that a token is valid, or restore focus with a stale token. Runtime state getters, selection readers, `prepareExtensionValue()`, endpoint resolver callbacks and selection-version accessors are **synchronous external boundaries**; they can trigger lifecycle transitions while returning otherwise well-formed values.

Started by reading the current branch and checking `core/InlineToolbar.js` and `core/DocumentRuntime.js` ownership integration. Production calls remain in the same public port and use the current runtime preparation seam. No new public API, old v1 adapter or persistence shape was added. Every GitHub write used the freshly fetched blob SHA to avoid overwriting concurrent work.

## Finding INL-OWNER-1 — source revocation did not invalidate returned ranges/tokens (P2)

Previously `range`, `capture()`, `resolveOwnResult()` and `isValid()` relied on a preflight availability check, even though additional callbacks executed after that check. A health getter or native selection read could synchronously call `port.revoke()` while returning a valid old range; the public getter still returned it. `capture()` could return a new token after `prepareExtensionValue()` revoked the mount; `resolveOwnResult()` could return a resolved Range after that revocation. `isValid()` could return true after a DOM endpoint check retired its token.

**RED:** Five focused regressions were added and run against the actual prior module in isolated V8 with the real `shared/textOffset.js` helpers. All **five failed for their intended authorization contract** while the original 14 tests passed.

**Fix:** revalidate the mount after native range reading/cloning, after token preparation and range resolution, after endpoint validity checks, and after the potentially reentrant `canAccess` callback. A returned token is never an authoring right after the mount is retired.

- [Initial RED tests `f1e96dff`](https://github.com/Shelamkoff/editor/commit/f1e96dff74b8e9e44295873115178a9bcc8bb70c)
- [Reader fixture and final endpoint case `3483b872`](https://github.com/Shelamkoff/editor/commit/3483b8724f1429b9800c439cbc03aa0902080428)
- [Production fix `dedcf64c`](https://github.com/Shelamkoff/editor/commit/dedcf64c0840c21b600b660343f75170733104dd)

## Finding INL-OWNER-2 — final restore verification could revoke before native focus (P2)

`restore()` revalidated before constructing its candidate, and then ran `#matches(captured)` and `#currentOwns(captured)`. The latter reads the live selection and resolves native endpoints. An endpoint callback could synchronously revoke the port while reporting a valid native selection; the method then ran its retained `restoreSelection()` callback **after revocation**.

**RED:** The added regression used the actual test port, calculated a valid restore candidate, and retired its owner from the endpoint check during the *final* native verification. Before the fix, it returned true and invoked the stale restore callback. It failed against the production code after INL-OWNER-1, isolating the remaining gap.

**Fix:** after the final `#currentOwns()` callback, recheck the exact captured token owner once more before restoring. `#matches()` also verifies terminal owner state after reading runtime lease/generation/revision getters.

- [RED regression `a77a1244`](https://github.com/Shelamkoff/editor/commit/a77a1244d1d3ccafb7554407e226339055d3bf7b)
- [Fix `b81e83e5`](https://github.com/Shelamkoff/editor/commit/b81e83e5c576bf1d48f4395954b5a5a3f4d4fd68)

## Finding INL-OWNER-3 — capture issued a token stale before it returned (P2)

During `capture()`, the runtime generation, selection lease and revision are sampled separately. A reentrant getter may change the generation/lease before the token snapshot is complete while still returning an apparently valid revision. After INL-OWNER-1 the port was again active and the token was returned even though `isValid(token)` would immediately reject it.

**RED:** A new regression triggers generation or lease change during the revision getter. The source before this correction returned a token instead of null.

**Fix:** the public result of `capture()` is now conditional on `#matches()` against the **completed** token metadata after all preparation and teardown callbacks settle, rejecting tokens that are already stale at publication.

- [RED regression `5ba074bb`](https://github.com/Shelamkoff/editor/commit/5ba074bbfb3aca84b80986d16b9a1a9560f41818)
- [Fix `8b8e4473`](https://github.com/Shelamkoff/editor/commit/8b8e4473d94939b857bc15368d87c3d879ef5c01)

## Focused verification

| Suite / scope | Result | Execution boundary |
| --- | --- | --- |
| Full `core/InlineSelectionAuthority.test.js` | **21/21 tests, 85 assertions passed** | Fetched real class and `shared/textOffset.js` with `richTextCaretPadding` in isolated V8, Node-style assertion/test adapter |
| `core/InlineToolMounts.test.js` | **13/13 tests, 55 assertions passed** | Actual fetched class, `synchronousResult` and test bodies in isolated V8 |
| New INL-OWNER-1 regressions | 5 RED → GREEN | Isolated V8 |
| New final-restore and stale-capture regressions | Each independently RED → GREEN | Isolated V8 |
| TypeScript, full Node.js test runner, Chromium/native selection and package-consumer checks | **Not executed** | Requires local checkout and dependencies |
| Full Rector v1/v2 author-visible behavioral parity | **Not established** | Requires browser/manual acceptance matrix |

The input test fixture only gained a hook for running `readSelection` callbacks, to reproduce a synchronous owner revocation through the same public seam as native selection integration. All existing selection behavior tests were retained. The known adapter environment does not execute real DOM native Selection, browser focus events, IME or plugin toolbar UI.

## Local acceptance gates

```sh
npm ci
node --test core/InlineSelectionAuthority.test.js core/InlineToolMounts.test.js core/InlineToolbar.retired.test.js core/SelectionController.test.js core/LogicalSelection.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

Also verify in Chromium: a native `selectionchange` that invalidates a plugin port while its callback is running, a popup/inline toolbar that destroys itself synchronously from a selection hook, a field re-mount under the same block/field address, and native focus restoration through the living scope. No retired port may manipulate the author's subsequent caret.

## Conclusion

Three real, bounded lifetime faults were reproduced and fixed through TDD while adjacent inline mount tests remained green. These outcomes improve C6 owner authority but are **not** a certificate of full library stability, complete Node/browser correctness, or v1/v2 gesture parity.
