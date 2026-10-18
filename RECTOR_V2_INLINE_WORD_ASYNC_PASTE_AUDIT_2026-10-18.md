# Rector v2 — async Clipboard epoch and inline Paste whole-word parity audit

**Date:** 2026-10-18  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `7677ca3f715cd2ecacf18c0dbb02c2977eee988a`  
**Scope:** `ClipboardController` asynchronous resolver authority and `InlineCommandController` plain-text inline Paste matching. No persisted document-format changes, migration shims or public extension API additions.

## Finding A — Async Paste lease survived a read-only round trip (P2)

The synchronous Paste ingress carried `DocumentRuntime.modeEpoch`, but the separately executing `#beginAsync` task checked only its AbortSignal, current read-only boolean, document generation/revision and user selection. If read-only changed `false → true → false` while a plugin Paste resolver was pending, its original task could still author a result if no explicit `cancelPendingTask()` had arrived. Its retained resolver `createId()` also continued issuing new identifiers under stale authority.

**RED:** Two new tests against the actual pre-fix `ClipboardController.js` reproduced both failures. The public editor's regular setReadOnly path *normally cancels* Clipboard tasks, but epoch revalidation protects against callbacks that change mode during resolution or before that cleanup runs.

**Fix:** Capture the current `modeEpoch` when the async task starts and validate it along with task/controller ownership, health and editability, before and after awaiting each plugin resolver, before canonical Paste, and inside resource/data-ID callbacks. The existing generation/revision and selection checks remain in place.

- [RED tests `4518851`](https://github.com/Shelamkoff/editor/commit/4518851ec5631a183ff9a175f34934d2a063429b)
- [GREEN fix `d3bec78`](https://github.com/Shelamkoff/editor/commit/d3bec78b02301feaf27aeeeebbd1f4073ec239b2)

## Finding B — Reentrant host ID allocator returned a stale result to a Paste resolver (P2)

The async `createId` callback checked task authority **before** calling `DocumentRuntime.createDataId`, but this method can invoke a user-configured synchronous ID generator. A generator could round-trip read-only mode before returning its ID, after which the old Clipboard callback handed that ID to the now-retired resolver.

**RED:** A regression using the actual class and an ID generator which changes the mode epoch during allocation showed that the stale ID was returned.

**Fix:** Revalidate the original async lease immediately after the external ID generator returns and reject stale results. ID generation remains synchronous; it is not a second authoring transaction.

- [RED test `3bf9117`](https://github.com/Shelamkoff/editor/commit/3bf911729140cbdc9e9d1e39da598486d3f05ce3)
- [GREEN fix `cb37cdf`](https://github.com/Shelamkoff/editor/commit/cb37cdf8acee33e5a14d60ae36cf820851a751a9)

## Finding C — Inline Paste converted color-like substrings inside URL and identifier words (behavioral parity, P2)

V1 `master/core/InlinePatternMatcher.js` divides text by `/(\\s+)/`, tests each entire nonwhitespace word, and stops after the first registered matching plugin for that word. The v2 `InlineCommandController.pasteText` had removed pattern anchors to perform substring `matchAll` scans, so input such as `prefix#fff`, or `https://example.test/#fff`, incorrectly converted the embedded `#fff` into a color widget. An unanchored pattern such as `/foo/` replaced only `foo` inside `prefixfoosuffix` rather than the complete accepted v1 word; more than one pattern could also turn one word into multiple widgets.

**RED:** Four new real-class tests failed against the previous v2 implementation: embedded token conversion, unanchored full-word replacement, duplicate widgets for a multiply matching word, and punctuation keeping adjacent colors as one source token.

**Fix:** Iterate whole nonwhitespace tokens using `/\\S+/g`, then apply each registered pattern to the **entire token** in registration order. Keep using a fresh validator RegExp under the extension preparation guard so the plugin's own `lastIndex` is never modified. Stop at the first accepted pattern per word, and preserve intervening plaintext/whitespace verbatim. Existing ordered multi-word, color overlap and immutable/frozen RegExp cases remain green.

- [RED tests `90fcfa8`](https://github.com/Shelamkoff/editor/commit/90fcfa8155ff67d83cd33dca05627d6ba800651e)
- [Matcher fix `9c23217`](https://github.com/Shelamkoff/editor/commit/9c23217fe217705c109d101f93387200d3de3007)
- [Regex escape correction `ca98a55`](https://github.com/Shelamkoff/editor/commit/ca98a55cc644d52ffc14bb683014f2d014b81afe)

## Browser acceptance fixtures

Two browser-harness scenarios were registered in `tests/browser/native-text-input.js`:
1. Plain Paste of `https://example.test/#fff #f00` retains the embedded URL fragment and authors exactly one color widget for the separate `#f00`, including Undo/Redo.
2. Plain Paste of `prefix#fff suffix#f00` retains the entire text without creating inline widget entries.

[Browser regression fixtures `3596eb6`](https://github.com/Shelamkoff/editor/commit/3596eb6efbfd6be67f498fdc48b39e07d15b2b10).

They were **parsed but not run** in Chrome. The file's existing `paste()` helper constructs a ClipboardEvent; real OS/physical clipboard acceptance remains a separate required gate.

## Verification

| Checked-in real-class suite | Tests | Isolated execution |
| --- | ---: | --- |
| `core/ClipboardController.test.js` | 50 | 50 passed |
| `core/InlineCommandController.test.js` | 45 | 45 passed |
| **Total** | **95** | **95 passed** |

Seven new unit tests were added (three Clipboard, four inline Paste). All seven failed under the respective prior production sources and passed after changes. Two additional browser cases were registered, syntax checked only.

The focused class checks evaluated exact current repository JS source inside a V8 executor, using real `ClipboardFragment`, `editableFields`, `synchronousResult`, `textOffset` and `escapeHtml` helpers where relevant. DOM, AbortController and ClipboardData adapters were controlled; `TrustedHTML` was stubbed. This is not the same as running Node's native `node --test` from a checkout, a complete TypeScript check, or native Chrome integration.

## Remaining acceptance

From a clean checkout of the **current** branch HEAD:

```sh
npm ci
node --test core/ClipboardController.test.js core/InlineCommandController.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

The project `package.json` contains those scripts. In native Chrome, also compare v1/v2 typing/paste for complete words, embedded color-like URL fragments, punctuation and unanchored extension patterns. Exercise read-only transitions while a plugin file resolver is pending and custom data-ID allocators revoke their own host context. Check one canonical history action, the intended caret and correct resource cleanup.

**Conclusion:** Three concrete risks were corrected and the affected 95 isolated class tests pass. No whole-library stability or full native behavioral parity claim is made until local and browser acceptance gates pass at the final HEAD.
