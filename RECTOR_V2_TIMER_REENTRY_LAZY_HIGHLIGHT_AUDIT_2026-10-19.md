# Rector v2 — debounced observer timer ownership and deferred code highlighting

**Date:** 2026-10-19  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `cee8d25854522023ce65ffe4037f9a0dce7b61fe`

## Scope and method

This targeted pass continued the architecture/conformance audit, following the active `RECTOR_V2_REMEDIATION_SPEC.md` and the repository's `.agents/skills/tdd/SKILL.md` and `.agents/skills/modern-javascript-patterns/SKILL.md`. Inspected `core/ChangeNotifier.js`, `core/ChangeNotifier.test.js`, `renderer/inline.js`, `shared/highlightRuntime.js`, its existing tests, the inline HTML sanitizer, and `tests/browser/runtime-contracts.js`. Compared affected source areas with historic `master`. All file edits were made using current GitHub blob SHAs. No legacy compatibility path was reintroduced.

GitHub repository access in this execution environment used the connected GitHub API; a complete Git checkout / npm dependencies could not be fetched through local Git because the container cannot resolve `github.com`. Consequently, the focused verification below used the fetched **actual production modules and test bodies** in an isolated V8 runner with explicit timer/highlighter/DOM adapters, not the full Node.js runner.

## CHG-TIMER-1 — reentrant setTimeout registration retained the wrong timer (P2)

`ChangeNotifier.schedule()` previously assigned the timer handle only after returning from the host's `setTimeout`. A host that synchronously calls `notifier.schedule()` from within `setTimeout` can publish a newer timer before the older call returns. The older call then overwrites `#timer` with its stale handle, leaving the latest timer untracked. Similarly, if `destroy()` executes during registration, the returned handle can be stored after destruction and never cancelled.

**RED:** Two regression tests ran against the unchanged actual production class and failed: after nested registration, the live handles were `[1, 2]` instead of only `[2]`; after destruction inside registration, handle `1` remained live.

**GREEN:** After the host returns, the caller checks both the captured generation and terminal state. Any stale returned handle is cancelled without replacing the newer timer. Both tests pass.

- [RED tests `5234b55`](https://github.com/Shelamkoff/editor/commit/5234b55f0e044a0015fadfccebf1b9383463d9a6)
- [Fix `9caf496`](https://github.com/Shelamkoff/editor/commit/9caf4961c64bac4b6b6f7572dfa2ab47e06a6f10)

## CHG-TIMER-2 — reentrant clearTimeout duplicated cancellation and allocated stale timers (P2)

During replacement, the prior `#timer` was retained until `clearTimeout` returned. A host-triggered nested scheduling call could read that same old handle and cancel it again. The superseded outer call could then allocate a third stale timer.

**RED:** new test observed three timer allocations where the contract requires two, and duplicate cancellation attempts on the same former handle.

**Fix:** detach the old `#timer` before invoking host `clearTimeout`; if the reentrant host operation changed generation or destroyed the notifier, return before allocating anything. A new active timer remains the sole owner.

- [RED test `b6516d5`](https://github.com/Shelamkoff/editor/commit/b6516d55cf8f95b5b212e84ef90f50b95503f00c)
- [Fix `166c1e8`](https://github.com/Shelamkoff/editor/commit/166c1e87a43e0573e87c559b6f048ac813d49605)

## CHG-TIMER-3 — already-fired inline callback was resurrected as pending (P3)

With a timer adapter that synchronously executes the callback before returning its handle, the callback correctly cleared `#timer`, but the enclosing registration subsequently assigned the expired handle again. It was incorrectly retained and cancelled on later destroy.

**RED:** the new test saw `clearTimeout(1)` on destroying a notifier whose only callback had already completed, instead of no pending lease.

**Fix:** record whether a callback ran during registration; if so, do not assign its handle as pending. Late completions continue to respect the generation/destroy guards.

- [RED test `97dbe63`](https://github.com/Shelamkoff/editor/commit/97dbe63cdbc6e4e895785bd67eaae284213dc421)
- [Fix `6e461ef`](https://github.com/Shelamkoff/editor/commit/6e461efa236a40cc37f796ab6fce42fbd430f83e)

**Verification:** all **14/14 `core/ChangeNotifier.test.js` test bodies** passed against the final fetched production class in isolated V8 with a controlled scheduling adapter and Node-assert-like assertions. The three new tests failed for their intended contract against the prior relevant source versions. The suite retains its existing tests for superseded saves, async callbacks and error sinks. This does not establish native browser timer behavior or a full Node test run.

## INLINE-HIGHLIGHT-1 — lazy highlighter overwrote newer code text (P2)

`renderer/inline.js` parsed and displayed safe raw code while lazily loading `highlight.js`. When the import resolved, its retained callback rendered markup for the **original** text into the same DOM node, even if that node's text had already changed. When loading failed, the `catch` handler similarly overwrote the node with its old snapshot. The previous `master` renderer also contained the core stale callback pattern; this is a correctness hardening finding, **not** proof of a regression exclusive to v2.

**RED:** evaluated the old production `createInlineParser` with a controlled lazy-runtime promise and a fake DOM code node. After replacing the code's text while loading, resolution applied the old syntax markup and discarded the new text.

**Fix:** immediately before applying highlighted markup, check that the code node's text still matches the captured source; check again after the highlighting callback itself. If the node changed before lazy loading, leave it untouched. Failed imports retain already-visible plain text without running a stale fallback assignment.

- [Browser regression `023f1fa`](https://github.com/Shelamkoff/editor/commit/023f1fa7a0cea9c83993b7256f895d190d29b1ef)
- [Production fix `75fe6e1`](https://github.com/Shelamkoff/editor/commit/75fe6e19c364a21e9c70d332babc3ebe5de10a53)

**Verification:** six controlled source-level scenarios against the actual final `renderer/inline.js` were exercised in isolated V8: unchanged late load highlighted, modified late load did not overwrite, modified rejected load did not overwrite, ordinary rejection retained plain text, already-loaded highlighting still worked, and synchronous text mutation during highlighting did not overwrite. The added browser regression checks the same flow through `createInlineParser()` and actual `loadHighlightRuntime()`; **it has not been executed in Chromium yet**. Syntax parsing of both modified inline.js and browser test succeeded.

## Status and required local acceptance

| Area | Focused evidence | Full gate |
| --- | --- | --- |
| Reentrant debounce registration | RED → GREEN, two tests | Node/browser pending |
| Reentrant debounce cancellation | RED → GREEN, one test | Node/browser pending |
| Inline-fired debounce callback | RED → GREEN, one test | Node/browser pending |
| Complete ChangeNotifier test file | 14/14 isolated V8 cases pass | `node --test` pending |
| Lazy code highlighting | Old source reproduced overwrite; 6/6 controlled final scenarios pass | Real Chromium browser test pending |
| Full Rector behavior and v1/v2 gesture parity | Not established | Pending |

```sh
npm ci
node --test core/ChangeNotifier.test.js shared/highlightRuntime.test.js renderer/index.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

Browser follow-up: run `tests/browser/runtime-contracts.js` with the new `deferred code highlighting does not overwrite newer inline text` case against an installed `highlight.js`, then verify unchanged code still highlights and edited code stays unchanged after lazy loading, including renderer output detached/replaced before fulfillment.

**Conclusion:** Two bounded source areas gained concrete regression coverage and fixes. Full-library stability and functional/behavioral parity with Rector v1 **remain unverified**, and the current findings should not be extrapolated to unrelated packages or plugins.
