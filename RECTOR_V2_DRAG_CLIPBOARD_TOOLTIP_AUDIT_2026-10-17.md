# Rector v2 — DragController, ClipboardController and Tooltip stability audit

**Date:** 17 October 2026  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `2361e7993608b4938955029e6c798363b1c8d406`  
**Last code commit before this report:** `39ae5648856cc5ee23b0452d361704677988906e`

## Scope and result

The audit targeted three separate ownership boundaries after previous media, history, inline-tool and logical-focus remediation:

1. Pointer-session / drop-spacer DOM ownership and exceptional drag cleanup.
2. Clipboard routing across registered plain-text inputs, toolbar controls, locked inline widgets and a stale logical cross-block selection.
3. Tooltip anchor ownership, re-ordered hover/focus events and lifecycle after destroy, including failure of plugin-provided text labels.

All defects below were reproduced with new **RED** tests on the production source, followed by direct commits and **GREEN** rechecks. No legacy v1 API, compatibility shim, persisted document migration or replacement transaction engine was introduced.

| Committed test set | Production-source result | Execution boundary |
|---|---:|---|
| `core/DragController.test.js` | **9/9 PASS** | Real controller and committed cases, controlled event/DOM/AbortController adapters |
| `core/ClipboardController.test.js` | **23/23 PASS** | All committed cases on real controller with controlled clipboard, sanitizer and DOM adapters |
| `core/Tooltip.test.js` | **7/7 PASS** | Real Tooltip and committed cases, controlled timers and DOM |
| **Total** | **39/39 PASS** | Focused source-level tests; not the normal full project runner |

The registered browser test in `tests/browser/native-clipboard.js` passed a JavaScript syntax check; it was **not executed in Chromium**. These checks are evidence for the defects in this report, **not a statement of full library stability or exhaustive behavioral parity with v1**.

## D1 — DragController could leak an inserted drop gap and retain pointer capture

During pointermove, `#activate()` and `#setGap()` could throw from a DOM method such as `insertBefore()` **after inserting** a new spacer. The session then remained active: its temporary gap, drag CSS state and pointer capture were not reliably retired. Independently, unconditional spacer `remove()` on cancel could delete an element subsequently reparented into another owner.

**Fix:** track the parent to which the drag controller successfully attached or attempted to attach the spacer; remove the node only while it is still owned by that parent. On insertion exceptions, roll back the controller-owned partial DOM. Wrap the pointermove activation/placement sequence in a failure boundary that cancels the session (including pointer capture) before rethrowing the original error. Ordinary committed moves, stale-revision/read-only cancellation, gesture focus leases and timing remained covered by existing tests.

- [RED tests](https://github.com/Shelamkoff/editor/commit/ef66886a8aa198e24d723088d33c7ba223d8902c)
- [Test assertion refinement](https://github.com/Shelamkoff/editor/commit/1f4cdd647921807ff6354ed7a37bed40cab49bd3)
- [Fix](https://github.com/Shelamkoff/editor/commit/8ee26ad6585f601e37df6f619e5218d44421580e)

**Observed focused result:** 7/9 on the prior code, 9/9 after the fix.

## C1 — stale document selection could steal clipboard operations from native controls

The `ClipboardController` had previously repaired Cut/Paste for registered plain-text inputs, but `#onCopy()` still prioritized an active cross-block selection and exported a canonical private fragment when Copy belonged to the registered native input. Its fallback `#ownsEvent()` classification also failed to exclude `button` and `[contenteditable="false"]` controls. A toolbar button or locked widget could therefore consume Cut/Copy/Paste or expose selected block data despite not owning the document selection.

**Fix:** yield native Copy for registered plain-text fields regardless of retained cross-selection. Classify buttons and locked widgets as auxiliary, while preserving the fast path for registered rich-text editing hosts. Cut/Paste native plain-text routing, structured rich-text Cut and the earlier IME guard remain unchanged.

- [RED tests](https://github.com/Shelamkoff/editor/commit/80416acc581cbcd9a765552d0fb77c76b000e1fb)
- [Fix](https://github.com/Shelamkoff/editor/commit/64059f72d5c5fcfbca39f1ac0a4a2f707f98d19e)
- [Registered browser regression](https://github.com/Shelamkoff/editor/commit/3c738150a65cca6a60d67d1b079c5461c01d010f)

**Observed focused result:** 8/10 selected clipboard cases on the previous code, 10/10 after the fix. Subsequently, the **entire committed `ClipboardController.test.js` suite** was executed in the same source-level test adapter and passed **23/23**.

## T1 — stale tooltip anchor events could cancel a newer presentation

A delayed `mouseleave` or `blur` handler from anchor A called `hide()` unconditionally. If anchor B had already acquired a pending or visible tooltip, A's handler canceled B's timer or removed B's presentation/ARIA state. A bound native event retained from before destroy could also call the author-provided label callback after the tooltip owner was revoked.

**Fix:** record the current pending anchor separately from the visible anchor and only allow the corresponding anchor's leave/blur handler to hide its presentation. Bound show handlers check `destroyed` **before** evaluating author-provided labels. A throwing label callback now retires the old tooltip and reports the error without propagating it from the native event. The tooltip's existing timer epoch still protects against queued callbacks after a newer show or destroy.

- [RED anchor/teardown tests](https://github.com/Shelamkoff/editor/commit/7aec995882031b28ff6f67ba2107996d747f8a27)
- [RED failing-label test](https://github.com/Shelamkoff/editor/commit/bb54db5a28c5232e533302726cb28e840ae4f103)
- [Fix](https://github.com/Shelamkoff/editor/commit/39ae5648856cc5ee23b0452d361704677988906e)

**Observed focused result:** 3/6 before the primary fix, with an additional failing-label regression added to the final suite; **7/7 after the fix**.

## Remaining project gates

The environment available for this audit could read and commit source through the GitHub connector but did not have a complete local checkout available for running the repository's real packages and browser harness. Therefore **none** of the full release gates below was executed here:

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

On a local checkout at the final synchronized HEAD, also verify physical/simulated pointer capture across real DOM reparenting, native Copy/Cut/Paste through toolbar buttons and registered plain fields, rapid tooltip focus/hover handoff, aborted timers and ARIA attributes in Chromium/Firefox/WebKit. Full functionality and behavior should continue to be compared with the first version across the remaining modules. Passing these targeted tests alone is not sufficient to label the whole Rector library stable.
