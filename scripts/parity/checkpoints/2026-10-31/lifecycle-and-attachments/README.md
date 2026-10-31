# 2026-10-31 continuation: history, attachment names and Poll output

## Scope and source

This checkpoint records completed bug-fix slices and their integrated verification. It does not establish complete v1 parity, whole-refactor acceptance or release approval.
Improved current behavior remains the target when the historical implementation was defective.

- Repository: `Shelamkoff/editor`.
- Branch: `refactor/rector-v2-architecture`.
- Frozen implementation: `259825d2a366d1fc7d2ecb3e1a7fc67d77ab1dea`.
- Frozen tree: `454d2e70845630d9e061d212e496769601590e50`.
- Integrated run: `test-results/run-8lUEK4/manifest.json`.
- Run interval: `2026-10-31T09:26:22.136Z` through `2026-10-31T09:48:38.087Z`.
- Source identity before and after: `e6838215e022e06421bc4f8cd467838d47c3a9dc5b07f3e0ab17eb874b8fcdfc`.
- Lockfile SHA-256: `91874afdcfbe533e607429bdaa3e0a4cbf9d671410831dbeb1d62d4d5d266382`.
- Runtime: Linux x64, Node `v24.22.1`, npm `11.9.0`.
- Browser: Chrome `142.0.7444.175`.
- Browser selection: `EDITOR_CHROME_PATH=/tmp/rector-browsers/chrome-linux64/chrome`.

All ten gates record exit 0, no terminating signal and unchanged source.
The finished manifest records `outcome: passed`, `sourceUnchanged: true` and a clean source both before and after the run.
This report and the root progress entry are documentation changes after that frozen implementation.

## Published slices

| Commit | Change |
| --- | --- |
| [`d563263b`](https://github.com/Shelamkoff/editor/commit/d563263b2f7a848b6de5b5bef017c194e8e0a45e) | Revalidate the deferred Undo/Redo selection owner after selection capture. |
| [`532d3783`](https://github.com/Shelamkoff/editor/commit/532d378327c82c1a7e5f15dba5bad55ea8d483f3) | Accept a zero-valued diagnostic clock origin; reject non-finite timing measurements. |
| [`34d1db3e`](https://github.com/Shelamkoff/editor/commit/34d1db3e5b92f84f457929407cd27047dba2164b) | Infer attachment names and extensions from relative URLs in the owning document. |
| [`3913d292`](https://github.com/Shelamkoff/editor/commit/3913d292bb857c00303019d93b867f2a42e99093) | Add trusted native filename-whitespace coverage for all four Attaches variants. |
| [`259825d2`](https://github.com/Shelamkoff/editor/commit/259825d2a366d1fc7d2ecb3e1a7fc67d77ab1dea) | Stop retired or superseded Poll output builds across inline, locale and DOM callbacks. |

The whitespace implementation was already published in `e19eb431`; this continuation adds real native verification of that repair.
The four older local Person commits were already published as equivalent patches; recovery required no duplicate application.

## History and diagnostic timing

Selection capture can synchronously destroy the engine even when it returns an unchanged bookmark.
Deferred replay now checks the existing engine lifetime, health, phase, generation and revision after capture.
An invalidated callback cannot restore selection into a retired editor.
The committed document, revision and stored history stacks remain unchanged; the destroyed engine rejects further authoring and replay.
Positive controls retain the second selection restoration for an unchanged live owner.

Command timing previously treated a valid start of zero as absent. The repair accepts finite numeric origins, including zero, and ignores non-finite durations.
Clock, threshold and diagnostic callbacks remain inside the existing observation boundary.
The focused core regression set passed 151 tests.
Relevant sources include `core/TransactionEngine.replay-lifetime.test.js` and `core/TransactionEngine.test.js`.

## Attachment names

Filename inference now resolves URLs against `context.ownerDocument.baseURI`.
Sanitization still precedes inference, and the authored URL is retained unchanged.
An explicitly supplied filename retains priority.
Encoded Unicode and spaces are decoded; malformed percent escapes keep their literal basename.
Five real-editor URL cases cover root-relative, parent-relative, protocol-relative, malformed-percent and absolute Unicode URLs.
They check the inferred name and extension, projected label, a single Undo step, stable IDs and exact Redo data.

The native whitespace fixture covers variants `a`, `b`, `f` and `g`.
It uses trusted Space and character input, sibling updates, caret retention and keyboard Undo/Redo.
Canonical filenames must exactly match the native field text, including boundary SPACE/NBSP.
The fixture never rewrites the DOM or normalizes the saved filename to make the assertion pass.

| Whitespace source | Same final fixture | Outcome |
| --- | --- | --- |
| `5151c646` | `attaches-filename-native.js` plus its registered entry | 4/4 RED: native trailing whitespace was trimmed from saved names. |
| `34d1db3e` with the final fixture overlay, subsequently published as `3913d292` | Identical fixture and entry | 4/4 GREEN. |

The explicit Undo/Redo boundary before the leading-space gesture isolates this regression from unrelated typing coalescing.
The complete native run on the frozen `259825d2` independently passes these four cases within the 345-case `nativePluginParity` group.
Sources: `tests/browser/regressions/attaches-filename-native.js`, `tests/browser/native-plugin-parity.js`, `tests/browser/plugin-surfaces.js`.

## Poll output ownership

The existing Poll instance state now identifies its current build; a disposed output or a newer provider publication retires the previous build.
Checks follow inline rendering, locale reads and publication of inline DOM into the live wrapper.
They cover question, final option label, status, voter labels and submit controls.
Initial rendering that retires its output cannot acquire a later provider subscription.

Independent review reproduced a missing final-option locale boundary in the first candidate.
The final repair closes it and the corresponding status, voters and submit paths.
A reentrant voter-title getter also exposed an access to a superseded result without a voters array.
The final code validates the build before reading that result or publishing its stale subtree.

- Focused Node lifecycle suite: 29/29 GREEN, including retired and superseded output controls.
- Real DOM suite with the final fixture on pre-fix baseline `34d1db3e`: 20/24 PASS, four genuine regression failures.
- Identical real DOM fixture on the repaired implementation, including the integrated browser run at `259825d2`: 24/24 PASS.
- Actual DOM controls exercise inline-renderer retirement and custom-element connection callbacks.

Sources: `renderer/renderers/poll/index.js`, `renderer/renderers/poll/lifecycle.test.js`, `tests/browser/poll-state-contracts.js`.
The Node and browser counts overlap in purpose and are not added to the integrated test totals.
The change adds no document store, history owner or public API.

## Fresh integrated verification

| Gate | Completed result | Local evidence |
| --- | --- | --- |
| Unit | 2,134/2,134 passed | `unit.log` |
| Typecheck | Both production configurations passed | `typecheck.log` |
| Build | Passed | `build.log` |
| Public type contracts | 7/7 passed | `types.log` |
| Installed package | Bundler, NodeNext, Vite, native ESM, external Chrome contracts and 22 CSS assets passed | `package.log` |
| Documentation contracts | README, source, locale and documentation audits passed | `docs.log` |
| Ordinary browser | All 41 registered pages passed | `browser.log` |
| Full native | 47 array-valued result groups / 2,683 cases, all PASS; separate physical Enter, toolbox and history controls passed | `native.log` |
| Heap/resources | 23 sentinels / zero retained; history-eviction and retained-control checks passed | `heap.log` |
| Documentation site | 47 README pairs, 127 HTML pages, zero broken links, zero missing assets; browser smoke checks passed | `docs-site.log` |

Every relative evidence filename in this table belongs to `test-results/run-8lUEK4/`.
Node unit and public-type suites report no failures, cancellations, skips or TODOs.
Native case totals count only the array-valued result groups; they exclude the separate Enter/toolbox objects and the 14-case history matrix.
Heap verification also exercises a live editor after eviction: Undo reaches the preceding action, an explicitly retained payload remains reachable until released, and the released payload is collected.
These scoped retention checks do not establish full C09/T15 performance acceptance or prove the absence of every possible leak.

## Environment and evidence handling

A copied dependency installation contained a stale Carousel implementation.
`npm ci` restored the lockfile installation, including Carousel commit `f7f6485886a1d77f9213d9079eb70000efeff499`.
No dependency version or lockfile change was needed.
The fresh integrated run above uses that corrected installation.

Generated logs remain in ignored `test-results` directories; they are not committed as new generated artifacts, following `ARCHITECTURE.md`.
Temporary historical comparison worktrees were removed after preserving their log outputs and checking the final fixture hashes.
Historical archives retain their original source attribution and do not substitute for this run.

## Reproduction

Use a fresh checkout at the frozen implementation, install with `npm ci`, and configure an available Chrome executable.
Run gates sequentially because build, declaration and package checks share generated output.
Leave page and case filters unset for the complete browser and native gates.

```sh
npm test
npm run typecheck
npm run build
npm run test:types
npm run test:package
npm run test:docs
node tests/browser/run.mjs
node tests/browser/physical-history.mjs
node tests/browser/heap-gate.mjs
npm run docs:check
```

Focused browser commands use `EDITOR_BROWSER_PAGE=poll-state-contracts.html` or `plugin-surfaces.html` with `tests/browser/run.mjs`.
Focused filename verification uses `EDITOR_NATIVE_PAGE=native-plugin-parity.html` and `EDITOR_NATIVE_FILTER='Attaches native filename whitespace'` with `tests/browser/physical-history.mjs`.
For RED comparisons, use independent checkouts at the stated historical commits and copy only the final fixture and its registration.
The production file must remain historical, and the comparison must retain the actual nonzero outcome.

## Remaining acceptance

The preservation register remains **209 unique obligations: 62 accepted / 147 open**.
These counts describe proof obligations, not known bugs or a completion percentage. This continuation grants no additional register acceptance.
B-HTML/B-STYLE, full C09/T15 and the remaining detailed/platform cases remain open.
Fresh scoped repairs and successful integration gates do not establish full functional parity or release approval.
