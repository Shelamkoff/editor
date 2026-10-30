# Poll provider ownership checkpoint — 2026-10-30

Frozen tested source: `64f53902c8ace8010716bb2987c50f961f522d5c` (base `69c8425e0081fde69cf5176ccb73d032720c15fc`). This checkpoint is an evidence-only addition after all recorded source gates completed.

## Scope

`BlockContext.getData()` now reuses the existing original projection-owner admission before reading and after producing its immutable snapshot. Existing staged creation, read-only access, preparation, generation, and revocation semantics remain intact. Poll no longer queues a second canonical write on wrapper blur. Provider updates and deferred load/vote settlement contain rejected presentation, report once without a second repaint, and release vote resources. Falsy provider rejection values are preserved. No new public API, ancestry registry, or canonical state is introduced.

The owner tests use the actual Poll dataSource subscription/load/vote callbacks. Whole wrapper and whole shell adoption must preserve foreign DOM identities/content, canonical blocks and history. Positive controls exercise current subscription results and trusted native input, blur, Undo and Redo. New regressions are imported by the existing projection-contracts and native-plugin-controls entry points used by normal full gates.

## Observed TDD sequence

| Run | Frozen source | Result |
| --- | --- | --- |
| run-lx8rl6 | c463872a | Provider ownership RED: 1 pass, 2 intended foreign DOM failures |
| run-wOkp3R | 8796dfe2 | Native blur RED: 1 pass, 2 unhandled owner rejection failures |
| run-ykFOVK | 9c2da8b6 | Core snapshot admission RED: 1 pass, 3 missing rejection failures |
| run-vYFbHY | 13d53076 | Core 4/4 and native blur 3/3 pass; provider reporting remains RED 1/3 |
| run-1YgHQE | 115b9976 | Settlement/observer RED: 5 pass, 6 intended reporting/rejection failures |
| run-dHKUtw | 64f53902 | Valid native gate 11/11; original aggregate remains not-run after recorder overlap |
| run-LwbSNu | 64f53902 | Sequential final: 206 core Node, 197 projection, 20 Poll state, 167 native controls pass; types/docs exit 0 |

Each executed, credited gate reports `sourceUnchanged: true`. Exact commands, times, process outcomes and source identities remain in the copied original manifests.

## Node coverage clarification

The 206 Node tests are the three real core suites: `core/DocumentRuntime.test.js`, `core/BlockReconciler.test.js`, and `core/InstanceScope.test.js`. The archived command also supplied nonexistent `plugins/poll/reconciliation.test.js`; Node 24 ignored that unmatched path while running the other suites and returned exit 0. This checkpoint therefore claims no Poll unit suite from that command. The subsequent `poll-completed-result` checkpoint runs the real `plugins/poll/shortcut-empty.test.js` and `shared/pollData.test.js` files on its own frozen source and records 15 passing tests. The original command, supervisor and manifests remain unchanged.

## Recorder incident

The first final native gate completed successfully, but a units recorder was started before that recorder fully finished. The native recorder then wrote its older manifest snapshot over the units metadata. Therefore `run-dHKUtw/units.log.gz` is retained as raw diagnostic output only, not credited as a completed C11 unit gate. The original manifest still says `not-run` for units and the other scheduled gates; its aggregate is also `not-run`. The follow-up supervisor executes one gate at a time and produces the independent, fully passed `run-LwbSNu` manifest. No old manifest or log was changed to manufacture completion.

## Reproducibility and limits

`source-history.mbox.gz` preserves all source commits from the upstream base through the frozen tested source; `source-final.patch.gz` preserves the final aggregate change. The full review patches and exact sequential supervisor are included. `summary.json` records source-file hashes and exact observed counts. `hash-index.json` records stored and uncompressed hashes/lengths; compressed logs are byte-identical to the original after decompression. The index excludes itself.

The first two browser RED runs used an existing copied Carousel npm 1.0.0 installation. They exercise Poll, not Carousel. Before the first GREEN, dependencies were replaced with a physical copy of main's successful npm-ci installation using the actual Git-pinned Carousel f7f64858 dependency. All GREEN and later settlement RED use that corrected installation. Chrome was 156.0.8078.47. See summary for paths.

This scoped checkpoint does not establish full-library or v1 parity. Root owns combined full verification and publication. The remaining live author-DOM reread on provider refresh is the subject of a separate next TDD slice and is not claimed fixed by this checkpoint. Lost historical /tmp artifacts are not evidence for this work.
