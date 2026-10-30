# Renderer registration and diagnostic-failure disposal — 2026-10-30

## Change and source

The parent is `69c8425e0081fde69cf5176ccb73d032720c15fc`. The fixed immutable source is `78fe89e90bd556c25932cdf82bcbc42d9ae4fded`, tree `21191af755c4008a0deda04458f93a01b8be9d4d`. `candidate.patch.gz` reconstructs that complete tree from the parent. The production change stays inside `EditorRenderer`: one private best-effort warning helper is shared by validation, output cleanup and post-commit stylesheet maintenance. No public API, authoring, signature, registry or resource owner changes.

A disposer failure already belonged to best-effort cleanup, but a failing `console.warn` escaped that catch. It stopped independent output disposal, replaced an authoritative staging error, or reported failure after a mounted replacement had already committed. The fix contains this diagnostic failure and preserves original rendering errors and exact output ownership.

## RED and GREEN

`renderer-red-direct` executes the public renderer tests on the parent production plus the retained test-only patch: 25 existing tests pass and all nine added regressions fail for the intended logging error. It includes Error, undefined, null, false, zero and empty-string disposal failures, failed detached/mounted staging, and successful replacement followed by failing retirement. `renderer-green-direct` passes all 34 tests after the repair. The initial `renderer-red` child-process report only reports one failed test file; it is retained separately and is not the source of the nine-case count.

`renderer-browser` is fixture development, not acceptance: its process exits 0 but its recorded source changes during execution. The initial page used the wrong terminal status vocabulary, and the first observation collector retained mutable array references. Both issues were corrected before the immutable run. The final fixture snapshots each actual/expected value at observation time; final verdict recomputation has zero mismatches.

## Immutable real-browser comparison

The runner is `scripts/parity/renderer-lifetimes.mjs`, with the shared ordinary-browser fixture `tests/browser/renderer-lifetime-parity-fixture.js`. It serves every production module directly from its exact Git object, retains module/dependency hashes, and rejects changes to its HEAD, runner, fixture or loaded dependencies. All sources share the recorded installed dependencies. Only document/data version spelling adapts for v1.

Twelve registration cases cover all three public output routes, both data and producer-revision signatures, strict unknown errors and permitted placeholders. They exercise register/replace/unregister/reregister, old retained output, subsequent output, same-data mounted invalidation, caller input preservation and exact originating disposers A/B/C. All twelve pass on v1, specification baseline, parent and candidate.

Nine separate diagnostic-failure cases compare independent cleanup, repeat/reuse, staging error identity and post-commit behavior. Across 21 cases and 302 observations per source, raw failures are v1 46, specification baseline 42, parent 42, candidate 0. All cases complete with no execution or page errors. Raw comparison exit is **1** and remains 1; `candidatePass` is true. No classifier hides or relabels a historical failure. These nine cases do not accept the complete `RENDERER_ERRORS` obligation.

## Frozen checks

On `78fe89e90bd556c25932cdf82bcbc42d9ae4fded`, all before/after source identities match:

- Registered ordinary browser page: 21 complete cases, 302 passing observations, exit 0.
- Renderer unit files: 67 passing tests, zero failures/skips, exit 0.
- Both checked-JavaScript configurations: exit 0.
- Four-source comparison: complete original trace and exit 1 above, zero candidate failures.

Environment: Node `v24.22.1`, Chrome `156.0.8078.79`, Linux. The broader integration and published commit mapping are recorded separately. This checkpoint may support scoped `RENDERER_REGISTRATION` acceptance after independent review and combined checks; it does not establish whole-library or other-browser parity.

## Independent review

A separate agent read the runtime change and ran all 34 reentrancy tests without source changes. The independent proof review checked 318 production-module records, 68 dependency hashes and all 20 initial archive hashes, recomputed all 1,208 recorded verdicts with zero mismatch, reconstructed the exact candidate tree from its full-index patch, and verified that the RED patch changes only tests. It confirms the 12 registration cases / 246 observations per source and the bounded acceptance recommendation; it does not accept RENDERER_ERRORS. Review scripts and raw reports are retained under `independent-review/`.
