# Rector v2 — Carousel: inactive captions and active-slide settings

**Date:** 2026-10-17  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `420472b74e2fe638809be11cd4b863b539b3be2b`  
**Reference:** v1 `master` for user-visible Carousel behavior, not its removed API or legacy data format.

## Outcome

Two independently reproduced user-facing regressions were fixed in `plugins/carousel/index.js`. The fixes keep the current schema and capabilities intact; no compatibility layer, new manager, or other architectural service was introduced.

**Overall library release stability and complete v1/v2 behavioral parity remain unverified.** The checks below are scoped and cannot be counted as a successful full project acceptance run.

## C-R1: updating an inactive caption destroyed the active editable (P2)

Before the fix, any `instance.update(next)` performed `project()` and recreated the Carousel view. Updating only `slides[1].caption` while typing in `slides[0].caption` unnecessarily removed the active `contenteditable`, losing focus/caret. The only user-visible part that needed updating was the inactive slide's label in the hidden settings selector.

### Red/green

The actual production `createCarouselPlugin` source was run in an isolated V8 realm with controlled DOM/dependency adapters. Two image slides were mounted; the first caption was focused; only the second slide's caption was changed.

- RED (source Git blob `64189bad8607713d3f71c1a7c2efb0e1da78a76d`): `beforeField !== afterField`, active focus lost. Canonical data and option label did update.
- GREEN (source Git blob `b47ebbb7db5d1c44f084b427e6763ff75507d0c7`): identical active field and focus preserved; model and settings option label updated.
- Active-caption changes continue to perform the full renderer update; media URL/Alt/HTML/poster changes, options changes and order changes also take the normal projection path.

The guarded update compares the exact canonical v2 slide fields `id,type,src,alt,poster,html` and the active caption. It allows inactive-caption-only changes and synchronizes the existing `select` option labels without disconnecting the current editor. The final code uses typed `querySelectorAll('option')` instead of property access requiring an `HTMLSelectElement` cast.

**Isolated method controls:** six scenarios (inactive caption, active caption, inactive media, reordering, options and no-op) all passed; the final Git blob `7d1df34ffdc80df6b58948093de9d55a3b97f3be` was rechecked after the typed-DOM adjustment.

**Changes:** [browser regression](https://github.com/Shelamkoff/editor/commit/28a1bd8fe65e3b7bd71084da30893b7efb6cd118), [fix](https://github.com/Shelamkoff/editor/commit/e27215b1000479a6353b8ae201e8ca4533cebbfb), [typed DOM cleanup](https://github.com/Shelamkoff/editor/commit/92a3cbba61f19e117b391b7f09eedf0804e623bc).

## C-R2: Carousel settings edited the wrong active slide (P1/P2)

The v1 `Carousel.#settingsPanel()` obtains the actual current slide via `state.data.slides[state.activeIndex]`. In v2, `renderCarouselSettings()` always initialized its picker from `context.getData().slides[0]`, even after navigating to slide 2. Therefore a person viewing the second image could enter new Alt text in Settings and inadvertently change the **first** image.

There was a second related issue: manual selection of a nonactive slide in the new v2 settings picker was reset when changing that slide's metadata caused a projection repaint.

### Red/green

The full production `createCarouselPlugin` was exercised via its public block instance `focus()`, settings `change` handlers and `update()` on a controlled DOM:

- RED (source blob `64189bad8607713d3f71c1a7c2efb0e1da78a76d`): after focusing slide 2, Settings still selected slide 1 and showed "First image". Committing an Alt edit changed the first slide. After manually choosing slide 2, an edit reset the selector back to first.
- GREEN (source blob `616a0f15975057b4c15e9ad1a221d9f7129e8b65`): navigation to slide 2 sets Settings to slide 2 and shows its Alt; editing updates only slide 2 and keeps it selected. Navigation back to slide 1 resets the settings selection to the active slide. Manual selection of slide 2 from the slide 1 view is preserved across metadata commits.

The internal `renderCarouselSettings(context, options?)` now supports optional `initialSlideId` and `onSlideSelected`; the inline settings panel passes the current slide id plus an instance-scoped explicit user selection. Navigation resets that explicit selection, so Settings follows the visible slide by default. The `capabilities.settings.render(context)` one-argument contract remains supported with the first-slide default for standalone contexts.

**Changes:** [three browser regressions](https://github.com/Shelamkoff/editor/commit/f6ea405f14b60d147bb8dfcf4c3a462dff900037) and [manual-selection regression](https://github.com/Shelamkoff/editor/commit/59801067ecee99af2ce36009c77e32572a2b53b1), [fix](https://github.com/Shelamkoff/editor/commit/4b5e21c96248eeef08eecbe4747ca37d96a99579).

## Test registration and boundaries

Five browser cases were added to `tests/browser/native-plugin-parity.js`: inactive-caption update with focus/caret/input/Undo, active caption rerender control, current slide settings Alt editing, navigation in both directions, and explicit picker choice across a metadata commit.

**These browser cases have been registered, but the complete project Vite/native browser runner on final HEAD was not executed in this audit.** Controlled-DOM regression runs did execute real Carousel production module text; they are not equivalent to the package-installed public editor runtime.

Also not completed at this HEAD: complete Node unit suite, TypeScript checking, all editor/browser/IME/clipboard matrices, package consumer, documentation, accessibility and long-running heap tests. Previously run 39 Node tests use an earlier materialized subset and are not attributed as current-HEAD acceptance.

## Final assessment

Two confirmed, user-visible Carousel defects are fixed with both positive and negative controls. The remaining blockers to claiming full-library stability are project-wide native/browser/type/package acceptance and a broad differential comparison against v1 user behavior.
