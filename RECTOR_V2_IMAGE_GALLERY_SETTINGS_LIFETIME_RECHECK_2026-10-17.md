# Rector v2 — Image / Gallery settings lifecycle recheck

**Date:** 17 October 2026  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `f4ab8a0f5e23743c8df3c8c81272d36019f66af3`

## Summary

Two independently reproduced UI event-lifetime regressions were fixed in the Image and Gallery authoring settings. Both bugs allowed controls from a **retired DOM projection** to mutate current canonical data, even after the form had been replaced. The fixes use local, abort-scoped event lifetimes rather than restoring old v1 APIs, changing schemas, or introducing a new state manager.

**Scope caveat:** This pass is targeted TDD and does not establish full Rector v2 stability, installed-package behavior or exhaustive v1/v2 functional parity.

## IMAGE-S1 — obsolete Image settings remained authoritative (P2)

The `renderImageSettings()` utility registered input, select and switch `change` handlers with no AbortSignal. `Image.project(next)` recreated the form using `panel.replaceChildren(renderImageSettings(...))` on ordinary updates, including a host update of `styles.height` or `expanded`, but never retired old handlers. The old detached height input or Expanded switch could continue writing canonical image settings if a delayed, repeated or externally dispatched event reached it. The block's `destroy()` also left handlers on retained references to those DOM nodes.

**TDD:** new `plugins/image/settings-lifecycle.test.js` exercises the real Image definition through `setup().create()`, its settings form and `context.updateData()`:
- After external host projection, a detached height input cannot overwrite the new height while the live input must continue working.
- A retired Expanded toggle cannot revert a newer canonical value, but the current toggle remains operative.
- Block disposal revokes its settings control handlers.

**RED:** 0/3 passed with the previous Image plugin source. **GREEN:** 3/3 passed with the final production code in the controlled signal-aware DOM fixture.

**Fix:** settings form render and rerender use an internal AbortController to retire replaced form controls. The block owns a separate controller per settings projection, aborted on projection replacement, owner abort and block destroy. The user-provided `updateData()` callback may synchronously trigger a new projection; its retired form no longer performs a second render afterward. Normal successful changes to live controls remain supported.

Commits: [test](https://github.com/Shelamkoff/editor/commit/02d96350ad97c2cffad14deee48c715dd9a3eea8), [fix](https://github.com/Shelamkoff/editor/commit/51aac5057017ef269daf2220b50f3511a6b85ecd), [DOM fixture follow-up](https://github.com/Shelamkoff/editor/commit/f034fde70bf2dec9495316a894d91ed0e1209c94).

## GALLERY-S1 — obsolete Gallery settings and layout controls remained authoritative (P2)

`renderGallerySettings()` had the same defect across change handlers for layout selection, visual layout buttons, option switches and style inputs. Gallery additionally exports `capabilities.settings.render(context)`, which rerenders its own form after a settings change: a removed Gap input still retained the callback and could overwrite the current settings from a detached DOM node.

**TDD:** new `plugins/gallery/settings-lifecycle.test.js` covers:
- An external gallery structural update replaces settings. Old Gap input changes are inert, the current Gap input still applies changes.
- The **standalone public** `capabilities.settings.render(context)` panel replaces its inputs on a valid change; previous controls cannot act a second time, new controls remain live.
- The active embedded Gallery settings handlers are revoked when the block owner is destroyed.

**RED:** 0/3 passed on the previous Gallery source. **GREEN:** 3/3 passed with the final source in the controlled signal-aware DOM adapter.

**Fix:** `renderGallerySettings()` accepts an optional lifecycle signal (the one-argument public capability still works) and owns an abort controller for the currently rendered controls. Rendering again invalidates previous inputs, layout buttons and switch callbacks. The embedded block settings receive the current `viewController.signal`; disposal/reprojection invalidates the old form. The existing style-only Gallery fast path continues to update still-mounted style controls in place.

Commits: [test](https://github.com/Shelamkoff/editor/commit/860e422280c14157cb481bc466b0357f54791a0d), [fix](https://github.com/Shelamkoff/editor/commit/2dd99f7447e20eff47fb3060b492a4af56366818), [DOM fixture follow-up](https://github.com/Shelamkoff/editor/commit/133798ad17a4c661b44814da7e221c9f49c70916).

## Browser integrations added

Two regressions were appended to `tests/browser/native-plugin-parity.js`:
1. Image old height/Expanded controls cannot overwrite canonical settings after `blocks.update()`; current controls still work and Undo remains possible.
2. Gallery old Gap input and layout button cannot overwrite canonical settings after structural host `blocks.update()`; current controls still work and Undo remains possible.

Commits: [Image browser regression](https://github.com/Shelamkoff/editor/commit/9d7cf13c866b7ccb6979577090fa6905aafa803e), [Gallery browser regression](https://github.com/Shelamkoff/editor/commit/efff134e23fe2d89d3a24f2090d6101e77aae315).

**Important:** These browser tests were registered and JavaScript syntax-checked. The complete project's native Chromium/browser runner was **not executed** at this new HEAD. Successful isolated V8 checks on the actual production source with dependency/DOM adapters must not be presented as full-project Node/browser acceptance.

## Verification and boundary notes

The final modified blobs checked were:
- Image production `plugins/image/index.js`: `46033d7f2babde6c56549e619c2fcada861964fe`.
- Image tests `plugins/image/settings-lifecycle.test.js`: `71c7a52afba02badeb8ec8ef421908737bb5408e`.
- Gallery production `plugins/gallery/index.js`: `cf1da4027cffadbeabc3724c2f22745178d2be5c`.
- Gallery tests `plugins/gallery/settings-lifecycle.test.js`: `5d75c4817f3ca0f275adeb44da3b4d8c25ac5efa`.
- Browser test file `tests/browser/native-plugin-parity.js`: `238fffd607c02b6cbcdb1f9c8c2cd1bad08612c4`.

All five files passed independent JS syntax parsing after removing ESM import/export declarations in the analysis adapter. GitHub diff verified **8 new commits, 0 behind**, no revert of preexisting work.

The tests' fake owning Document was expanded with the viewport listener APIs and inert icon HTML insertion needed by the real plugins' panel setup. No production DOM/security sanitizer was modified for the test fixture.

## Acceptance boundary

Required before release on the actual final checkout: `npm ci`, `npm run typecheck`, `npm test`, `npm run test:browser`, `npm run test:docs`, `npm run test:types`, `npm run test:package`; native IME, actual browser event ordering and UI focus, heap/retention, and a broad v1 vs v2 behavioral differential check. CI unavailable in this workflow; previously reported green results on other SHAs do not count as acceptance of this HEAD.

**Conclusion:** Two concrete detached-settings control bugs are fixed with red/green proofs. Full-library stability and exhaustive v1 parity remain unproven.
