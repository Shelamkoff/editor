# Rector v2 — natively edited fields vs later unrelated canonical updates

Date: 2026-10-17. Branch: `refactor/rector-v2-architecture`. Starting HEAD: `aa6a63469ac28f11a05d574c50cd764ad036d19c`.

## Executive result

Three new, confirmed focus/caret regressions were fixed in **Gallery, Carousel, and Person**. They occurred when a native field edit was canonically committed with `preserveSourceProjection` (so its live DOM and selection were deliberately retained), followed by an unrelated author/host update to the same block. The previous optimizations to avoid unnecessary repaint compared new canonical text only against the **stale plugin-local `data`**. Consequently they needlessly called `project()/render()`, detaching the still-focused editing field.

This pass preserves the current plugin architecture and versioned schemas; no legacy v1 compatibility, new stateful service or public API change. It also retains full rerender when the active authored field **actually changes externally**.

## G-C1 — Gallery style update after native caption typing (P2)

After a native edit changed the canonical caption `Alpha→AlXpha`, Gallery's plugin-local `data.images[0].caption` could still be `Alpha`. A subsequent style-only host update to `gap:12px` now carried the canonical `AlXpha`, so Gallery's `sameImages` test incorrectly failed and `project(next)` replaced its editing host.

**Fix:** canonical incoming caption is considered equivalent either to the prior projected value **or** to the live owned `captionFields.get(id).innerHTML.trim()`. All ID/URL/order/layout/options guards are unchanged. Truly different remotely authored captions still use `project(next)`.

- RED with actual source: **1 full reprojection, focus loss**.
- GREEN: **0 full reprojections**, same DOM field and focus retained, grid gap `12px`, canonical `AlXpha` preserved.
- Negative control: externally changed active caption causes full reproject, so stale markup cannot hide a real content change.

Production instance `createGalleryPlugin().setup().create()` with a controlled DOM passed the full source→native-input simulation→style update→external-active-caption update sequence.

[Regression scenarios](https://github.com/Shelamkoff/editor/commit/31d794f7184d2ea2fbe2476fc3a22401a23cbc6e) · [Fix](https://github.com/Shelamkoff/editor/commit/f709ba025b9078e392b573436e048d0867c5f2cc).

## C-C1 — Carousel inactive caption update after native editing the active caption (P2)

Active slide A's caption was canonically committed as `AlXpha`, but the instance still held `Alpha` while its input stayed mounted. Updating only slide B's caption caused Carousel to compare next A `AlXpha` to stale `Alpha` and call full `project()`, destroying A's caret. A prior fix already handled this when A's local snapshot happened to match canonical; the scenario here proves the missing **native-source** case.

**Fix:** during `update(next)` the active caption can match either the local previous value or the currently mounted `captionFields.get(id)?.innerHTML.trim()`. All other discriminants (`id/type/src/alt/poster/html`, slide order and options) still require equality. Changes to active media and truly remote active text still reproject.

- RED: full repaint even though the active DOM displayed the canonical caption.
- GREEN: no repaint; active field identity/focus preserved; B's hidden Settings selector label updates.
- Negative controls: remote active-caption change and actual media source change both still reproject.

Verified via public production `createCarouselPlugin` factory with controlled DOM and a separate six-path update-method probe.

[Regression scenarios](https://github.com/Shelamkoff/editor/commit/31d794f7184d2ea2fbe2476fc3a22401a23cbc6e) · [Fix](https://github.com/Shelamkoff/editor/commit/2b120ad7a28ac0e14516d3934606b1b6b2be7b5f).

## P-C1 — Person sibling record changes after native active rich-text or URL editing (P2)

`Person.update(next)` previously compared `JSON.stringify(nextActive)` with the stale `previousActive`. After a native edit to an active person's name/role/bio or link URL, the new canonical active record no longer equaled the stale local record. An unrelated change in person B therefore called `render()`, discarding A's focused editing host. This regressed the recently added tab-only reconciliation guarantee.

**Fix:** `projectedActive()` takes the previous active record, synchronizes owned link controls with the existing `syncControls()`, and reads visible authoring fields' `innerHTML.trim()` (name/role/bio) when editable. Incoming active canonical data is compared against that **visible source snapshot**. If unchanged, only the tabs render; if active canonical content genuinely differs, full `render()` remains required.

- RED original source: 11/12 tests passed; native active name followed by sibling edit detached the field.
- GREEN: 12/12 passed.
- Added URL field case and reran: **13/13 passed** under the controlled original-source unit fixture.
- Remote active name overwrite correctly reprojects the edited field; 400 deterministic sibling reorder/add/remove cycles and other prior regression controls stay green.

[Native active text regression](https://github.com/Shelamkoff/editor/commit/10b600f99b283a3378b9a28de2338455ec7c6f60) · [Fix](https://github.com/Shelamkoff/editor/commit/675518b235dfec23d13fe909d68121481fff84cc) · [Native URL case](https://github.com/Shelamkoff/editor/commit/e0c5b26f0d9020555467105694fe02ffe4ed8b51).

## Registered browser integration coverage

Four new scenarios were recorded in `tests/browser/native-plugin-parity.js`:
1. Gallery native caption typing → style update → focus/caret → further typing → undo ordering.
2. Carousel native active-caption typing → inactive slide edit → focus/caret and Settings selector → further typing → undo.
3. Person native name typing → sibling role update → focus/caret and subsequent typing/undo.
4. Person native URL typing → sibling role update → same active input and subsequent typing/undo.

[Gallery/Carousel scenarios](https://github.com/Shelamkoff/editor/commit/31d794f7184d2ea2fbe2476fc3a22401a23cbc6e) · [Person scenarios](https://github.com/Shelamkoff/editor/commit/2fa717386fa01fd17e087d3f9d8882dd2d3fbcab).

These browser scenarios are **registered but not executed with the full editor + native Chromium runner on this HEAD**. The red/green proof in this report uses real production source through deterministic V8 / controlled DOM adapters, not full end-to-end acceptance. All five modified JavaScript files passed independent syntax parsing after ESM import/export stripping. No full project npm/typecheck/package run was performed in this pass.

## Boundaries and follow-up acceptance

In Gallery/Carousel, the fast-path comparison against the live editing field is used **only** when all structural/media/option identity checks remain satisfied; it must not suppress legitimate incoming canonical changes. In Person, the live DOM snapshot is taken only for the current authoring body and existing link fields, not for arbitrary application nodes.

The final local release gate remains mandatory: `npm ci`, `npm test`, `npm run typecheck`, `npm run test:browser`, `npm run test:docs`, `npm run test:types`, `npm run test:package`, physical IME/selection checks, memory/retention, and a differential v1/v2 behavioral matrix. Prior PASS on different SHAs does not establish these on the current branch tip.

**Conclusion:** three concrete native-caret regressions fixed and verified within their focused source-level contracts. This is not a claim that the entire Rector library is release stable.
