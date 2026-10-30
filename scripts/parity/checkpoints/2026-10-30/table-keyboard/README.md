# Table keyboard and authored line-break continuation

## Result and proposed acceptance

This checkpoint proposes acceptance of **`BLOCK_TABLE_KEYBOARD` only**, after the parent's integration checks. The fixed four-source corpus executes native Enter, Shift+Enter, Tab and Shift+Tab against populated 2×2 tables with and without a heading row. It also checks real native auxiliary controls and rejected missing/retired field keys. The candidate is the original immutable source **`3a16cf9fe64046780d4573464387dd2eb864b80e`**.

The comparison finds and fixes a real current defect: after inserting a line break at the end of a marked run followed by plain text, subsequent typing can inherit the following run's formatting. Both Table Enter and Paragraph Shift+Enter expose the shared problem. The same final fixture retains **12 failed observations before the fix and none afterward**. No old defect is restored to obtain inter-version equality.

| Source | Executed / recorded cases | Observations | Failed observations | Unsupported cases |
|---|---:|---:|---:|---:|
| v1 `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340` | 19 / 21 | 2,738 | 159 | 2 |
| Specification baseline `e981ff308000c1d92d7e820df95113c1e19bcee8` | 21 / 21 | 3,435 | 216 | 0 |
| Before repair `01fb551a9542ddd94e6b5652f637193875b55888` | 21 / 21 | 3,435 | 12 | 0 |
| Candidate `3a16cf9fe64046780d4573464387dd2eb864b80e` | 21 / 21 | 3,435 | 0 | 0 |

The recorded comparison process exits **1**, preserving the historical and pre-fix failures. Its separate `candidatePass` is true. All executed cases complete their phase plans. Page, per-case page, diagnostic and server-error channels are empty. Unsupported v1 keyed-focus capabilities are explicitly recorded without observations; no adapter fabricates them. Failed observation counts include repeated manifestations and are not distinct-bug totals.

## Reproduced defect and bounded repair

Start with `<b>Alpha</b> tail` and a real caret inside the `Alpha` text node at offset 5. After a line-break action, the authored result is `<b>Alpha<br></b> tail`. The old logical restoration uses the next text run's start at that collapsed boundary. A subsequent trusted `Y` becomes plain text outside the bold wrapper. The fixed result is `<b>Alpha<br>Y</b> tail`.

Changing restoration bias alone did not solve the entire browser behavior: Chromium can still insert into a neighboring visual run even when the restored DOM boundary follows the BR inside the mark. That unsuccessful intermediate experiment is retained. The final repair makes two changes within the existing owners:

1. `LogicalSelection.restore` keeps a collapsed authored-BR boundary on the preceding side, retaining the BR's authored formatting context. Ordinary boundaries and noncollapsed start/end bias keep their existing behavior. Projection-only caret padding is excluded explicitly.
2. `NativeInputController` handles only a trusted, cancelable, non-composing `beforeinput` for nonempty `insertText`, at a collapsed live range immediately after an authored BR in the current focused rich field. It inserts at that DOM boundary and uses the existing native commit/history path. It validates the field, block, live range and native selection again before mutation. Native controls, plain text, paste/drop/replacement/composition input, locked or nested hosts, external boundaries, retired owners and foreign focus remain with their existing owners.

The terminal case where owned projection padding follows the authored BR already works through the browser's ordinary input path. The final helper leaves that path intact, including its trusted `input` event. No filler character, forced formatting command, synthetic input event, new public API or additional state/selection/transaction authority is introduced.

The same-source guard unit suite contains 24 passing cases. Nine shared native regressions cover bold and nested marked Paragraph continuations, plain BR before marked text, ordinary bold/plain and bold/italic boundaries, terminal padding and both directions of noncollapsed restoration. They check exact authored content and native Undo/Redo. Four shared cases fail on the unchanged pre-fix runtime with the final native fixture; the other five retain their old correct behavior. All nine pass after repair. This bounded shared coverage does **not** accept the complete Paragraph split/merge preservation row.

## Complete Table keyboard corpus

Two navigation cases traverse every cell in row-major order in each heading mode. Interior Tab places the caret at the next cell's start; Shift+Tab places it at the preceding cell's end. At the first and last boundaries, native focus leaves the cell set without wrapping to another cell. Navigation retains source data, sidecars, field host identity and history. A preceding native `X` remains independently undoable and redoable.

Sixteen break cases cover start, middle and mark-end carets, forward and backward replacement ranges, both sides of a real Mention widget and Shift+Enter on a backward range, in both heading modes. Each case starts with a separate trusted native edit, performs one line-break action, then types `Y`. Three Undo steps and three Redo steps independently restore the edit, break and continuation, including logical caret/direction and exact canonical records. The mark-end initial DOM point is recorded explicitly, so this proof cannot pass by starting in an already plain-text boundary.

Three ownership cases exercise an actual textarea inside an auxiliary Table caption, a missing keyed field and a key retired by removing the second row. The keyed requests return false without moving the native control's focus/range. Enter, typing and native-control Undo do not author the Table. Returning focus to the Table permits its own history to replay independently. v1 has no keyed/numeric public field-focus API or boolean admission result; its two absent capabilities remain unsupported, while its real auxiliary native-control surface is exercised.

The fixed data contains stable row/cell/block IDs, bold/italic/strike content, an entity, Mention and Color in different rows, and fixed widget sidecars. Every captured phase compares canonical cell markup, editable cell markup, rendered table markup, heading tags, visible widget IDs and payload labels, surviving sidecars, history and caller-owned input. Removing a row prunes only that row's sidecars and Undo restores them. No search provider is invoked by these keyboard actions. Expected author strings and state transitions are supplied without calling the production shortcut, range replacement or field-discovery implementation.

## Executed verification

All final processes have recorded actual exits and unchanged source/fixture hashes:

| Gate | Result | Actual exit |
|---|---|---:|
| Native filter `Table keyboard parity` | 30 / 30 PASS: 21 Table scenarios and 9 shared controls | 0 |
| Existing terminal Table Enter regression | 1 / 1 PASS | 0 |
| Authored-BR admission/denial units | 24 / 24 PASS | 0 |
| Both source typecheck configurations | PASS | 0 |
| Four-source comparison | Current 21 / 21 cases, 3,435 / 3,435 observations; historical/pre-fix failures retained | 1 |
| Pre-fix shared native controls with final fixture | 4 FAIL / 5 PASS | 1 |

The last row is explicitly an overlay: production is unchanged `01fb551a`, and only the native regression file is copied byte-for-byte from `3a16cf9f`. The complete overlay patch and fixture hash are preserved. It is not mislabeled as an immutable committed checkout. Its four failures are the two marked Paragraph continuations and the two plain-BR-before-marked-text cases. The unaffected ordinary-boundary, terminal-padding and noncollapsed-range cases pass before and after repair.

The finishing agent's `audit.py` is an author-side offline verification program, not the independent peer review. It imports no browser fixture or production oracle. It rebuilds fixed source strings and records for all **227 candidate phases**, checks canonical and both visible projections, independent history/caret values, case inventories and process outcomes, and recomputes all **13,043 raw verdicts**. It performs 1,575 fixed-oracle checks, verifies 655 served source-module hashes and 64 loaded dependency-file hashes, and reconstructs all three original source commits and trees in a temporary Git object store. Repository refs, index and object storage are not mutated. Independent peer evidence is maintained separately under `peer-review/` when integrated by the parent.

The recorded runtime is Chrome `156.0.8078.79`, Node `v24.22.1`, Linux x64. The runtime executable, Playwright entry/manifest, served dependency bytes and versions are retained or hashed. No full repository matrix is claimed by this checkpoint; the parent integration owns that check.

## Evidence, preparation failures and source identity

`final/comparison.json.gz` is the complete accepted raw comparison, decoded SHA-256:

`59b2600838f0c6664f600d8bca37c6b9dbc561af332886749d7c9fb46cfb517d`

The adjacent stdout/stderr and `*.meta.json.gz` files record exact commands, source identities, hashes, times and process exits. `manifest.json` retains original commit bytes and complete binary/full-index patches from published base `d67229c0`; `sources/` reconstructs `9fe6a385`, `01fb551a` and `3a16cf9f`. Publication or cherry-pick metadata may give integration commits other IDs; no later commit is substituted as the source of these runs.

`attempts/` preserves all 17 available original exploration files: the initial complete RED comparison, the narrow DOM-boundary investigation, unsuccessful end-bias experiment, first controlled-insertion experiment, original shared-control expectation failures, terminal native-event regression and earlier unit/typecheck/native logs. Three overly strict control expectations were corrected after comparison with the pre-fix runtime: Chromium's ordinary marked-boundary typing and the unchanged backward noncollapsed DOM endpoint. These are fixture corrections, not three additional production repairs. The final fixed corpus and exact pre-fix comparison retain the actual defect.

A vanished native session left an empty output file; it has no recorded actual exit and is not counted as successful execution. Original exploratory terminal exit results that were not retained remain unknown. The later complete recorded processes above supply the final acceptance evidence. No empty output, unsupported capability, partial plan or historical failure is converted into a pass.

`artifact-hashes.json` indexes this checkpoint's files and both compressed and decoded payload hashes; independent peer files have their own index. The source patches and original raw commit bytes are sufficient for audit in a fresh published clone without depending on local unpublished branch references.

## Reproduction

With dependencies available, audit the retained proof from a checkout containing this archive:

```sh
python scripts/parity/checkpoints/2026-10-30/table-keyboard/audit.py \
  --repo /path/to/editor \
  --output /tmp/table-keyboard-audit.json
```

On the original or reconstructed tested source with the recorded runtime, execute:

```sh
EDITOR_CHROME_PATH=/tmp/rector-chrome/opt/google/chrome/chrome \
EDITOR_PLAYWRIGHT_PATH=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs \
node scripts/parity/table-keyboard-parity.mjs

EDITOR_CHROME_PATH=/tmp/rector-chrome/opt/google/chrome/chrome \
EDITOR_NATIVE_PAGE=native-plugin-parity.html \
EDITOR_NATIVE_FILTER='Table keyboard parity' \
node tests/browser/physical-history.mjs

node --test core/NativeInputController.authoredBreak.test.js
npm run typecheck
```

The comparison must retain exit 1 while the preserved historical/pre-fix failures remain. The native filter must execute exactly 30 cases. The proof is limited to the named Table keyboard contract and recorded shared regressions in this Chrome environment. Wider browsers/platforms, full Table editing, other block rows, whole-library parity and unsettled `B-HTML`/`B-STYLE` choices remain separate obligations.
