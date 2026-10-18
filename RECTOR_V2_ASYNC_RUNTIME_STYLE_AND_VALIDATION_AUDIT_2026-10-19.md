# Rector v2 — asynchronous highlighter, stylesheet input snapshots, diagnostic validation, and timer teardown

**Date:** 2026-10-19  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `1bbf46baf80d9d71874b314d07a7407747698845`  
**Scope:** `shared/highlightRuntime.js`, `shared/styleRegistry.js`, `renderer/EditorRenderer.js`, `core/ChangeNotifier.js`, and the corresponding public-facing regression tests.

This pass follows the active `RECTOR_V2_REMEDIATION_SPEC.md`: async work cannot overwrite a newer owner's state; DOM/extension observers must not cause unexpected input changes; diagnostics are best-effort and cannot replace the canonical error; and all timer/resource leases must be retired even during reentrant host callbacks. The repository's `.agents/skills/tdd/SKILL.md` and `.agents/skills/modern-javascript-patterns/SKILL.md` were reviewed in the audit stream. Edits were committed directly to the existing refactor branch, using a freshly fetched GitHub file SHA before each update.

## Finding HL-LOAD-1 — lazy import overwrote a newer injected highlighter (P2)

`loadHighlightRuntime()` started a dynamic `highlight.js` import, then unconditionally assigned `runtime = loaded` on fulfillment. A call to `setHighlightRuntime(preferred)` during the pending import therefore lost precedence to a stale request. In addition, the resolved `loadPromise` stayed cached after `setHighlightRuntime(null)`, so a later `loadHighlightRuntime()` could return the old promise without repopulating the active runtime.

**RED:** the unchanged production source was executed in isolated V8 with a deferred dependency importer. After explicit injection, the pending import overwrote the preferred runtime and `highlightCode()` used the old provider. Reacquisition after reset also left the active runtime empty.

**Fix:** track the revision of explicit runtime choices, retire the old load lease when an override/reset occurs, preserve a newer explicit or ambient runtime when a stale import resolves, and clear the settled loader lease only if it is still current. An abandoned import rejection returns an already-selected valid substitute; otherwise the original import failure still propagates. `setHighlightRuntime` now explicitly accepts a nullable reset in its JSDoc.

- [RED regression tests `670f7a66`](https://github.com/Shelamkoff/editor/commit/670f7a66c32efff0f99fda98cc8d460ef13b2c88)
- [Production fix `47300eb1`](https://github.com/Shelamkoff/editor/commit/47300eb14df14a34edd10fb4f0b4a956a17eafcc)

**Focused verification:** all **4/4 actual `shared/highlightRuntime.test.js` test bodies** passed against the updated source in isolated V8, with a controlled dependency loader. The tests use the declared real `highlight.js` dependency when later run under the repository's Node environment. The historical `master` module has a similar lazy-override pattern; this correction is not asserted to be a v2-only regression.

## Finding RENDER-DIAG-1 — diagnostic logger failure replaced a renderer schema rejection (P2)

`EditorRenderer.#rejectBlockSchema()` catches exceptions from `onValidationError` and hostile thenables, but directly invoked `console.warn` inside those failure paths. With a throwing log adapter, it propagated the logging failure and suppressed the original `InvalidBlockDataError` with the correct `RangeError` cause. A rejected asynchronous observer could also generate another rejected promise if its logging callback failed.

**RED:** executing the exact unfixed private rejection method under a throwing observer and a throwing logger surfaced `Error: logging infrastructure failed` rather than `InvalidBlockDataError`.

**Fix:** centralize validation warning reporting in a small best-effort warning helper that catches logging errors; use it from synchronous observer rejection, hostile thenable getter rejection and asynchronous callback rejection. The existing validation identity/reentrancy guard remains unchanged.

- [RED test `423e281b`](https://github.com/Shelamkoff/editor/commit/423e281b56e982b84ef25d79e38024a5f5211b19)
- [Production fix `e4ae6f0f`](https://github.com/Shelamkoff/editor/commit/e4ae6f0f317a0cad57208059a6b5dd2b2ba792ce)

**Focused verification:** the updated real rejection method was exercised in isolated V8 with a throwing warning sink and three observer failure types: synchronous throw, Promise rejection, and throwing `then` accessor. In all three scenarios the canonical `InvalidBlockDataError` was preserved with the original `RangeError` cause. The actual `renderer/index.test.js` integration test was written but not run in Node.

## Finding STYLE-SNAPSHOT-1 — a DOM append callback changed later stylesheet URLs (P2)

`acquireStyleUrls(urls, ownerDocument)` previously iterated the caller-owned URL array while creating and appending each `<link>`. A synchronous `head.appendChild(link)` callback for the first style could change `urls[1]` before the second value was captured, leading to a different stylesheet from the one supplied at operation entry. This affects direct calls to the style registry even where higher-level registries snapshot their configurations.

**RED:** a new test ran against the old real source and failed: the acquired URLs were `['/first.css','/redirected.css']` instead of `['/first.css','/second.css']`.

**Fix:** perform one dense, scalar-validated, order-preserving URL snapshot/deduplication pass before any DOM mutation. Then acquire the snapshot's stylesheet leases in the original order. The helper continues to avoid calling caller-provided array iterators and retains its partial-acquisition rollback and per-document reference counting.

- [RED test `ebe7131e`](https://github.com/Shelamkoff/editor/commit/ebe7131e4b3fadf2b033fba6ede701d84be35c06)
- [Production fix `8dd5600d`](https://github.com/Shelamkoff/editor/commit/8dd5600d94ee4672442e6e400c2ef0238f8ae4a3)

**Focused verification:** **10/10 actual `shared/styleRegistry.realm.test.js` test bodies** passed in isolated V8, including cross-realm ownership, partial append rollback, reentrant acquisition, foreign link adoption, sparse/caller iterator behavior, and the new snapshot regression.

## Finding CHG-DESTROY-1 — reentrant teardown cancelled the same timer twice (P3)

`ChangeNotifier.destroy()` previously invoked host `clearTimeout(this.#timer)` while the handle was still stored in `#timer`. A host cancellation callback that synchronously reentered `destroy()` tried to cancel the same timer a second time. This violates idempotent owner teardown.

**RED:** the added test observed `[1,1]` cancellations instead of `[1]` against the previous real source.

**Fix:** make `destroy()` idempotent at entry, detach the timer handle before invoking the host cancellation, and preserve terminal generation revocation.

- [RED test `7570ae69`](https://github.com/Shelamkoff/editor/commit/7570ae69f713acb6be6d86da3d9fa7bad8ccb9c2)
- [Production fix `637df4ec`](https://github.com/Shelamkoff/editor/commit/637df4eca0c960119b20bfd81628dbe57cc06d68)

**Focused verification:** the complete **15/15 `core/ChangeNotifier.test.js` test bodies** passed in isolated V8 against actual fetched code with a controlled timer host and Node assertion adapter.

## Test execution limits

The executing container has Node `v22.16.0` and npm `10.9.2`, but no checked-out repository; direct GitHub access from the container failed with `Could not resolve host: github.com`. Repository source reads and commits used the authorized GitHub connector. Therefore the tests above ran in an isolated V8 runner with controlled adapters, **not** the repository's complete Node/npm runner.

| Verification | Result |
| --- | --- |
| Highlighter source and tests | 4/4 isolated V8 tests |
| Renderer validation error handling | Three controlled source-level failure scenarios |
| Style registry source and tests | 10/10 isolated V8 tests |
| ChangeNotifier source and tests | 15/15 isolated V8 tests |
| Full Node/TypeScript/Chromium/package/documentation gates | **Not executed** |
| Full source-to-browser behavioral parity with Rector v1 | **Not established** |

Required local acceptance on the final commit:

```sh
npm ci
node --test shared/highlightRuntime.test.js shared/styleRegistry.realm.test.js core/ChangeNotifier.test.js renderer/index.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

In Chromium, verify a lazy highlighter import settling after injection/replacement, multiple concurrent renderer callers, DOM insertion callbacks that mutate later style inputs, and validation observer/logger rejection without lost schema diagnostics.

## Conclusion

This pass fixes four real, bounded owner/observer failures and adds regression proof. It does **not** certify global library stability, full native browser correctness or complete v1/v2 feature parity. Those decisions remain gated on the final local acceptance suite.
