# Person card actions and hidden URL focus — 2026-10-30

This slice found **no new production defect**. It adds six native regression
controls for existing behavior and records a bounded comparison with the pinned
v1 and specification sources. No runtime, public API, preservation status or
accepted-count is changed. There is no claimed product RED/GREEN repair here.

## Sources and executed validation

- Base production source: `ebf128b1ac301c8985e0359e1cf6ced422ed94b0`, tree
  `2eef70961d69c1721cd04f73c8d2f3e9c8a4a53f`.
- Test-only commit: `34db74cace859d7c89af59448baaa6e21ffac45f`, tree
  `463153be0f93aa285b6b640d14bd77eceeb38773`.
- Final native run: **`run-5VyFsq`, 26/26 Person cases PASS**, including the six
  new cases. Its manifest records a clean test commit and unchanged source.
- Literal reference comparison: **`run-FghSUs`**, candidate **86/86** and
  specification baseline **86/86** observations pass. Original v1 has **85
  observations and 14 raw failures**; those failures remain in the archive.
- Environment: Linux x64, Node `24.22.1`, Chrome `156.0.8078.47`. The native run
  uses the existing CDP driver and an isolated Vite cache. The comparison uses
  real Playwright mouse/keyboard actions and verifies every served production
  file against its pinned Git object.

The reference manifest correctly describes the base plus the then-dirty native
test import and untracked regression module. The reference fixture and driver
were external to that worktree and have separately recorded hashes. The served
candidate production is pinned to the base commit; the new native tests do not
alter those production bytes. This is not a claim that the original comparison
ran from a clean checkout of the later test commit.

## New native controls

| Cases | Author operation and checked effects |
| --- | --- |
| Two active-profile removal cases | Three complete profiles and neighboring Paragraphs; literal or real Mention/Color fields; native biography edit; remove the active middle profile; two separate keyboard Undo and Redo steps. Full names, roles, biographies, links, IDs/order and inline sidecars are checked. Removing the profile prunes its sidecars; Undo restores their original identities and payloads. |
| Two native tab-reorder cases | Native biography input followed by a trusted first-to-last tab drag. The active name, biography, URL input and widget occurrences are retained. Exact full records, order and both keyboard history steps are checked. |
| Add and edit a profile | Add a blank profile beside three profiles with real widgets; natively edit name, role and biography; add a link and type its URL. Six separate keyboard Undo/Redo steps retain the generated IDs and all hidden author data. |
| First hidden URL focus request | After native biography input in the first profile, one `blocks.focus()` request reveals the second profile's URL, returns `true` and puts its native selection at offset 25. Native URL continuation and two keyboard Undo/Redo steps show that reveal added no history. A real transition to the neighboring block is the positive control for the current-block observer. |

The removal/reorder cases verify the biography caret when the preceding native
edit is undone and replayed: literal offsets 16/17, or logical offsets 23/24
with an atomic Mention and trailing author text. They never focus the editor
again to make a failed structural-action shortcut pass. All six cases check
unchanged caller input and zero Mention search requests. Expected records are
constructed from fixed author input. Only freshly allocated profile/link IDs
are read back, checked and retained in independently constructed expectations.

## What the pinned references show

The separate comparison exercises literal biography editing followed by
active-middle removal, first-to-last reorder or adding a blank profile. Every
case records load, edit, structural action, two Undo, two Redo and disposal.
Only the documented document envelope and absence of persistent profile/link
IDs in v1 are adapted. Rich text or widget behavior is not flattened for v1;
those capabilities are outside this literal comparison.

| Source | Cases | Observations | Raw failures | Page/server errors |
| --- | ---: | ---: | ---: | ---: |
| v1 `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340` | 3 | 85 | 14 | 0 |
| Specification `e981ff308000c1d92d7e820df95113c1e19bcee8` | 3 | 86 | 0 | 0 |
| Candidate `ebf128b1ac301c8985e0359e1cf6ced422ed94b0` | 3 | 86 | 0 | 0 |

On v1, addition and removal leave keyboard focus outside Person after the
focused control is destroyed. The subsequent trusted shortcuts do not change
the document or history. Each case records one keyboard-owner failure and six
resulting document/history mismatches; the final Redo-action state happens to
equal the unchanged action result and is not evidence that replay occurred.
The literal reorder case passes all its observations. These are observed
historical defects, not regressions introduced by this slice.

There is no automatic historical classifier in this probe. Its process status
checks the candidate and source integrity; it does **not** turn the 14 v1
failures into passing reference execution or a fully accepted differential.
The raw observations, native event targets/trust and full records remain
available for review. Source hashing covers 108 v1, 99 baseline and 99 candidate
files, plus 22 dependency files.

## Retained evidence and replay

- `native/manifest.json` and `native/person-native.log.gz` retain the final
  clean-commit command, environment and complete 26-case result.
- `reference/manifest.json`, `reference/raw.json.gz`, `reference/runner.mjs`
  and `reference/fixture.js` retain the exact comparison and its original
  failures. Set `EDITOR_PERSON_ROOT` to a disposable repository checkout and
  `EDITOR_PERSON_FIXTURE` to the retained fixture when replaying the driver.
  Its `EDITOR_V1_ROOT`, `EDITOR_SPEC_BASELINE_ROOT`, `EDITOR_CANDIDATE_ROOT`,
  `EDITOR_CANDIDATE_SHA`, `EDITOR_DEPENDENCIES_ROOT`, `EDITOR_PLAYWRIGHT_PATH`
  and `EDITOR_CHROME_PATH` inputs identify the immutable source and environment.
- `reference/working-tree.patch.gz` and
  `reference/untracked-person-cards-native.js` reconstruct the dirty source
  identity in the original reference manifest. Both hashes were checked
  against that manifest.
- `test-source.patch.gz` reconstructs the test-only commit from the base. Its
  decompressed SHA-256 is
  `3295b45a483b667abd25a387034489e0ceedc4a548cc239c343ae9cff62cbf5c`.
- `environment/` retains the native Vite launcher/configuration. Absolute
  dependency paths describe the recorded environment, not a portability rule.
- `summary.json` and `hash-index.json` record scope, outcomes and exact bytes.
  `exploratory/` retains the initial dependency-path failure before any browser
  launch; correcting the Playwright path required no fixture or production
  change. It is not a product RED.

The native command is:

```sh
EDITOR_NATIVE_PAGE=native-plugin-parity.html EDITOR_NATIVE_FILTER=Person node tests/browser/physical-history.mjs
```

This proof is bounded to the recorded three-profile actions and first hidden
URL handoff on Chrome 156/Linux. It does not execute a complete last-profile,
overflow, avatar/provider, keyboard-activation, mode or renderer action matrix.
Full `BLOCK_PERSON_CARDS`, `BLOCK_PERSON_HIDDEN_FOCUS`, other Person obligations
and whole-library/platform parity remain open. No timing, heap, unit-suite or
typecheck result is claimed by this test-only slice.
