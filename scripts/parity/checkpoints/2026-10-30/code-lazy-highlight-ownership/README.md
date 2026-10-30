# Code lazy highlight source and target ownership — 2026-10-30

Base for this slice: `b409e912fa62521d5dc1e7f9a156b0cc823a2dc9` (the completed Code Copy checkpoint). Frozen tested source: `1a6199f77ab6949afdc2cb7c98613924ae289ac5`. The common combined base remains `eae1b93ee6bc39a32230de1b46c67f27b39c8015`.

## Observed defects and bounded fix

The Code runtime's pending highlight dependency loader previously invoked the same unguarded refresh function used by synchronous projection. When the actual dependency became available, it could overwrite a code node adopted into a foreign container, including adoption of its pre, editor surface, whole wrapper or shell. It could also read a separately adopted textarea and publish the foreign source value into the editor's still-current highlighted view.

The existing refreshers set now holds a narrowly guarded `refreshAfterLoad`. It checks the exact `code → pre → editor → wrapper` path, the original textarea's parent, and lifetime, then uses the existing core `getData()` original-owner admission and rechecks those same local nodes. Lost ownership skips that view without preventing the next healthy instance from highlighting. The existing synchronous `refresh`, `project` and input paths remain unchanged, including their fallible behavior. The source remains the current value of the original owned textarea; no canonical-text substitution, snapshot cache, new registry, token, public API or mock loader is introduced.

Root reviewed the initial target guard and requested the independent textarea-source regression and matching parent check. Both target and source defects were demonstrated before the final approved predicate was applied. The initial review candidate is retained as review history; the applied candidate includes the requested textarea guard.

## Public tests and actual dependency

The new browser module uses `createCodePlugin` through the normal public editor fixture. It resets `getHighlightRuntime`/`setHighlightRuntime` and `window.hljs` through the already existing test seam, and awaits the actual `loadHighlightRuntime()` package dependency. Creation and adoption occur synchronously before the first await, so even a previously imported module exercises its real delayed continuation.

Two positive cases cover current editable and read-only views and independently assert the real JavaScript keyword and number marks. Five target-adoption cases cover code, pre, editor surface, wrapper and shell. A sixth negative case moves only the textarea, assigns `Foreign text` to that new owner's source, and requires the original highlighted view to remain untouched. Every negative case includes a second healthy Code instance sharing the same runtime; its actual highlighted output must complete. Canonical blocks and history are checked before each intended failing DOM assertion. GREEN also confirms retained exact child-node identities.

A public plugin lifecycle control injects a DOM projection failure and verifies that synchronous `instance.update()` still throws the exact original error. The Node command also retains the preceding Copy lifecycle controls and existing highlighter selection/lazy-load tests.

## Exact-source sequence

| Run | Source | Observed outcome |
| --- | --- | --- |
| run-YOHUg7 | c6ae4613 | 9 Node controls pass; planned browser gate not run; original aggregate remains not-run |
| run-ZC5Wbe | b9305af8 | RED: 9 Node pass; full runtime-contracts page 107 pass / 6 expected fail (new cases: 2 pass / 6 fail) |
| run-MMnUcn | 1a6199f7 | GREEN: 9 Node pass; full runtime-contracts page 113/113 pass, including all 8 new cases; typecheck exit 0 |

Every executed gate reports `sourceUnchanged: true`. The first partial run was closed before the additionally requested source-adoption test changed source. It is retained without relabeling; a fresh RED run owns the updated fixture. Gates execute sequentially. The browser RED's complete JSON result is included in addition to the human-readable failure log, whose formatter limits long DOM excerpts.

`tests/browser/runtime-contracts.js` imports the regression module, so all eight cases belong to the normal full ordinary-browser inventory. There is no manual-only fixture or new test loader. Final GREEN runs the full existing page, including the earlier delayed inline-code text preservation control and existing core runtime contracts.

## Artifacts and limits

Original manifests remain byte-identical. Logs and the complete RED browser JSON are deterministic gzip files with stored and original hashes/lengths in `hash-index.json`. The aggregate runtime/test patches, exact review candidates, sequential RED/GREEN supervisor, source history mbox and source hashes are included. The index excludes itself.

This evidence-only checkpoint follows the completed gates; it is not relabeled as the tested runtime source. These are DOM/dependency tests, not trusted native-input or system-clipboard proof. The previous Copy native tests remain tied to source 3906cdec, and full combined native/library verification is owned by root. No whole-library or v1 parity completion is claimed here.
