# Third integration — 2026-10-30

**All nine combined code gates pass on unchanged source.** The original manifests, complete command logs and source/dependency identities are retained in `run-a4BfOk/`; `artifact-hashes.json` records their compressed and decoded hashes. `verification-summary.json` contains the counts below.

## Tested source

| Identity | Value |
| --- | --- |
| Local source | `d9e935dec7eae3bb3b983d1a3c5b544316a5eefb` |
| Complete tree | `f90fa22af6b4149e43972b204da9261502c1f48f` |
| Published counterpart with the same tree | [`82cf56f1793c454191b2ff2fef40c4929bf352e7`](https://github.com/Shelamkoff/editor/commit/82cf56f1793c454191b2ff2fef40c4929bf352e7) |
| Combined run | `run-a4BfOk` |
| Completion | `2026-10-30T10:13:37.305Z` |

## Changes and their evidence

- [Table Enter formatting](../table-authoring-native/README.md), published as `103aa48b`, preserves active formatting across a terminal line break and subsequent typing.
- [Carousel source selection and settings](../carousel-source-selection/README.md), published as `3c8aa68e`, activates the first added slide and directs its settings to the same slide.
- [Core projection recovery](../projection-recovery-focus/README.md), completed in `82cf56f1`, restores keyboard ownership to an eligible rebuilt shell. Seven native controls cover the original failed-source Undo and focus ownership. The original failure and both intermediate fieldless/iframe regressions retain their RED results. The fallback neither promises the former auxiliary control or arbitrary active slide nor replaces text/fieldless logical selection; newer and parent-document focus win.
- [Six new Person native controls](../person-cards-native/README.md) require no production change and do not accept the complete Person action rows.
- [Checklist empty-exit acceptance](../checklist-empty-exit/README.md) covers eight cases and 222 candidate observations. Five v1 and 35 specification-baseline differences retain their original historical outcomes. The register contains **209 unique IDs: 37 accepted / 172 open**.

The failed Carousel recovery shortcut remains a failed historical record. Its earlier bounded canonical-recovery control is not evidence of native focus recovery.

## Combined verification

| Check | Completed result |
| --- | --- |
| Unit tests | 2,031 / 2,031; zero failures or skips |
| Typechecks | Both configurations pass |
| Build and declarations | 285 declarations, zero diagnostics; seven declaration contracts pass |
| Installed package consumers | Bundler, NodeNext, Vite and browser consumers pass; 22 CSS assets |
| Ordinary browser pages | 38 pass |
| Native browser scenarios | 41 groups / 2,297 cases pass; includes 289 plugin-parity and 67 core-behavior cases |
| Disposal controls | 23 sentinels; zero retained |
| History eviction | All three phases and the live-editor Undo control pass |
| Common differential corpus | 65 cases / 11,434 candidate observations |
| Gallery caption order | Six cases / 378 candidate observations |
| Checklist historical review | Strict offline review passes; candidate receives no historical exceptions |
| Source integrity | All nine gates report unchanged source; the published tree equals the tested tree |

Both differential corpora have zero candidate failures, unexpected errors or incomplete cases. Native totals are counted once from the final aggregate; overlapping isolated results are not added. README contracts pass in the package build. The final documentation/site validation has a separate source identity below.

This checkpoint supplies no new performance measurement, broader platform result or whole-library acceptance. Historical failures and unsuccessful setup/observation attempts keep their original outcomes. Later documentation and archive additions carry their own source identity. Their completed documentation verification is recorded below.

## Final documentation validation

**`run-7aWAkk` passes all three gates** on unchanged local `1142d8deb418a88693618d9b5a7841cdbd8c1d7e`, published exact-tree counterpart [`e1eac3529e6d111a9582ab777654f7c322ee31f9`](https://github.com/Shelamkoff/editor/commit/e1eac3529e6d111a9582ab777654f7c322ee31f9), tree `8151183661b9d0128840d7196c8f11664a0f6d11`. Completion: `2026-10-30T10:19:01.939Z`. Package/README build, `npm run test:docs` and `npm run docs:check` all pass. The full manifests/logs and rendered-site observations are retained under `documentation/`; source comparison confirms that changes after the code verification are documentation/evidence only.

## Reconstructing isolated tested sources

`isolated-source-reconstruction.json` and `isolated-sources/` retain exact binary-capable patches for the five isolated source trees. Each patch was applied to its recorded base in a separate temporary Git index, and the resulting complete tree was required to equal the original tested tree. The published base has identical file content even where connector-created commit metadata differs. This preserves replayable source independently of temporary worktree branches or private original commit objects.

Apply a patch to its published base in a disposable checkout. A newly committed reconstruction can have a different commit ID: pass its actual SHA to a live probe that accepts `EDITOR_CANDIDATE_SHA`. Original manifests, loaded-file hashes and the Checklist offline review deliberately retain their original recorded identities; a new execution does not rewrite those historical results. No original historical failure is reclassified by reconstruction.
