# Attaches names and variants: parity checkpoint

This manually written checkpoint accompanies reproducible source fixtures. Raw
JSON, stderr and process exit status belong in ignored
`test-results/attaches-names-variants/`; they are not repository deliverables.
`BLOCK_ATTACHES_NAMES_VARIANTS` is accepted within the bounded Chrome/Linux scope below after independent proof review and the completed integrated run on the same frozen source. The [publication review](../../../../../docs/architecture/rector-v2/PUBLICATION_REVIEW.md) records the decision; the [integration checkpoint](../selection-and-publication/README.md) records all eleven passed gates. Only this row changes status: **209 unique obligations, 63 accepted / 146 open**.

## Bounded row and corpus

The row requires supported rename/reorder and A/B/F/G presentations, retaining
metadata, display, order and meaningful filename characters. The corpus has
29 fixed cases:

| Cases | Observable contract |
| --- | --- |
| 17 local variant-menu cases | Each A/B/F/G initial state with one or three files, each no-op, a cycle through all presentations, and the original A3→F regression. Trusted rename, separate rename/variant Undo/Redo and editable/read-only projections. |
| 4 core settings cases | Each current variant action through the real block settings UI, preserving names, metadata and order. |
| 4 public reorder cases | Current `blocks.update` permutes the three records, then trusted input renames the moved first file. Stable IDs, duplicate-name disambiguation and independent input/reorder/moved-input history are checked. |
| 4 edge-space cases | Each presentation preserves native trailing SPACE/NBSP exactly, preserves a second filename's leading/trailing spaces, and retains the last canonical name after blank input and mode changes. |

The shared authored data includes distinct URLs, query/fragment components,
duplicate names, zero and positive sizes, mixed-case extensions, literal markup
characters, Cyrillic, combining Unicode and non-BMP characters. Fixed expected
records remain ordered arrays; only object keys are sorted for comparison.
Names are checked as literal text, without element interpretation. Renderer
links are checked for exact href/download-name metadata; no download or ZIP is
executed by this row's fixture.

v1's `plugins/attaches/index.js` has its own four-variant menu but no
`renderSettings` capability. Its `core/PublicEditorApi.js` has no `update`
producer. Thus exactly the four core-settings and four public-update reorder
cases are declared unavailable in v1 before execution. They are current
capabilities, executed in both newer sources; v1's ordinary file order, native
rename and own menu remain fully exercised. Neither source implements an
intra-attachment drag reorder control, so this fixture does not invent one.
No runtime exception becomes an unsupported capability.

Before native history commands the fixture explicitly focuses the first
filename in every source. It tests data/history retention, not uninterrupted
caret recovery. Group expansion is a real trusted click and must preserve
exact document blocks, version and history state. `save().time` is a generated
query timestamp and is excluded only from this view-only comparison. Native
SPACE may produce NBSP in Chromium: a separate logical-space assertion checks
the authored value, followed by exact canonical/DOM equality without trimming.

## Confirmed group metadata regression

The first complete native case starts with three files in variant A, renames
the first file using trusted keyboard input, switches to F using the real
Attaches menu, separately undoes/redoes the variant and rename, then enters and
leaves read-only mode. Exact names, URLs, sizes, extensions, file order, editor
projection and renderer links are checked against fixed authored records.

Pinned sources:

- v1: `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`.
- Specification baseline: `e981ff308000c1d92d7e820df95113c1e19bcee8`.
- Pre-fix candidate: `c3c8be4c822bca6b4c3b599a333f8197652fc159`.
- Minimal fixed product tree: `de4c2e08b2a6d1bf4582f3a56038d81318c26798`.
  This tree contains the pre-fix candidate plus only the seven-line Attaches
  group-summary change. It was created with an isolated temporary Git index.

In `a3-red`, v1 completes with no failures. Both newer sources fail exactly the
five A-variant `groupTotalSize` observations: the expected `1.0MB` summary is
absent. The seven-line change restores this existing, useful metadata summary
without changing filename capture, canonical records or history.

In `a3-green`, v1 and the candidate complete with no failures. The specification
baseline retains the same five failures. Both differential processes exit 1
because historical failures remain raw failures; `candidatePass` changes from
false to true. Neither run has page errors, server errors or incomplete cases.
Environment: Node v24.22.1, Linux x64, Chromium 142.0.7444.175.

The earlier `initial-a3` attempt is excluded: its fixture did not provide the
locale labels used to locate controls and therefore stopped at variant choice.
The corrected fixture supplies the same explicit public locale mapping to all
three sources. No product code changed between that attempt and the RED run.

The first full 29-case attempt, `full29-fixed-tree`, is also excluded as an
oracle error. Its expansion comparison included generated `save().time` and
therefore reported eight candidate failures solely from differing query times.
Independent review identified the issue. The correction compares exact
`version`, `blocks`, `canUndo` and `canRedo`; no file data or authored text is
normalized. The original raw outcome and nonzero exit remain saved.

## Complete corrected corpus

The `full29-canonical-oracle` run uses the same immutable fixed product tree
`de4c2e08b2a6d1bf4582f3a56038d81318c26798` and the pinned historical sources above.
It has no server errors, page errors or incomplete cases in any source.

| Source | Executable cases | Declared capability gaps | Observations | Raw failures |
| --- | ---: | ---: | ---: | ---: |
| v1 | 21 | 8 | 1,824 | 147 |
| Specification baseline | 29 | 0 | 2,967 | 166 |
| Fixed candidate | 29 | 0 | 2,967 | 0 |

All 147 v1 failures belong to the four edge-space cases. v1 trims the loaded
second name and the native first-name edge space. Since that whitespace-only
edit is discarded, it has no separate history entry: after Undo of the variant,
Undo of the missing rename is a no-op, and the next Redo already applies the
variant. The consequent history flags, variant/row selection and three absent
A-header observations are retained as failures. URL, size, extension and order
changes are not permitted in this classification.

The specification baseline has exactly 54 missing A-group total-size
observations and 112 filename-trimming consequences. Those 112 comprise 36
canonical-file differences, 36 renderer differences, 32 editor-name differences,
four exact native-name differences and four blank-input fallback differences.
The baseline's saved input and Undo history still retain the original loaded
records; native `read()` trims names after input. Neither historical behavior is
restored in the candidate.

`scripts/parity/attaches-names-variants-audit.mjs` checks the exact failure tuple
sets and values, source identities, corpus/phase completeness, frozen source
fixture hashes and absence of candidate exceptions. It succeeds for this raw
run while leaving its historical FAIL statuses untouched. Raw runner exit: 1;
audit exit: 0. An unexpected historical metadata change, runtime error or any
candidate failure is not an accepted difference.

- Fixture SHA-256: `ea94437f4cfcfb170b5493e46fa243cf63d205f5908d18e961b70bb7d7c74d59`.
- Runner SHA-256: `70c7f72513ba95a350872a8ba59fd8a8be41cdcc0af6b5b8b3e41b11157dc667`.

The independent review confirmed the 29-case scope, public API adaptations,
eight predeclared v1 gaps and exact SPACE/NBSP checks; it also found the timestamp
oracle issue before acceptance. It accepted the corrected full corpus and audit
source without candidate exceptions. The audit separately rejected three
negative controls: candidate data loss, an unrelated historical size change,
and a runtime error inside a declared v1 capability gap. It does not close file
sources, download/ZIP or lifetime preservation rows.

## Final published candidate

The final complete replay uses published proof-source and implementation commit
`a7c77d1118f15f55b2cc54aae5c6a6e78881fe0e`, tree
`7130da73428c444edc6662d709a9f5264aee420c`. HEAD is identical before and after
execution. This includes all four runtime fixes published in the continuation,
including the Attaches group-summary fix in
`52a944e9414a6290e3b5061d55a3dfa99779c7ca` and its permanent browser regression.

Run interval: 2026-10-31 10:19:55.727–10:21:05.247 UTC, Node v24.22.1, Linux x64,
Chromium 142.0.7444.175. The final candidate passes all 29 cases and all 2,967
observations, with zero unsupported cases, incomplete cases, page errors or
server errors. Both historical sources reproduce exactly the counts and
differences in the table above. The raw differential exits 1; the exact audit
exits 0. Raw failures are retained, and candidate exceptions remain empty.

The final ignored evidence directory is
`test-results/attaches-names-variants/final-a7c77d11/`, containing `raw.json`,
`stderr.log`, `exit-status`, `audit.json`, `audit.stderr.log`,
`audit.exit-status` and a compact `summary.json`. Both stderr files are empty.
Source fixture and runner hashes match the corrected corpus above.

- Audit source SHA-256: `fab7e28bd5a3ad60a73b2ddb057c3d2b638716cbdb428b6f8b9d5a5c7de6d0d1`.
- Final raw JSON SHA-256: `7e41971742b25e75ed16a514cf4b946af873979b6ec0e2de4ff82de9f3d2f03f`.
- Final audit JSON SHA-256: `b629e6369ae4f9c8d16351d87cb466db7dbd361a02b17fdf119db47d9540cd88`.

The runner records the actual dependency versions and SHA-256 of every loaded
product and dependency module. All three products use the same installed
dependency runtime. No generated evidence is added to Git.

## Reproduction

For exact reproduction, use a checkout of proof-source commit `a7c77d11` and run
from its repository root. The final run used these environment paths; substitute
an installed Playwright public module and Chrome executable on another machine.
Preserve the raw differential status even though historical differences make
that process exit nonzero:

```sh
mkdir -p test-results/attaches-names-variants/final-a7c77d11
attaches_raw_exit=0
EDITOR_PLAYWRIGHT_PATH=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs \
EDITOR_CHROME_PATH=/tmp/rector-browsers/chrome-linux64/chrome \
EDITOR_CANDIDATE_SHA=a7c77d1118f15f55b2cc54aae5c6a6e78881fe0e \
EDITOR_ATTACHES_NAMES_FILTER='' \
node scripts/parity/attaches-names-variants.mjs \
  > test-results/attaches-names-variants/final-a7c77d11/raw.json \
  2> test-results/attaches-names-variants/final-a7c77d11/stderr.log \
  || attaches_raw_exit=$?
printf '%s\n' "$attaches_raw_exit" > test-results/attaches-names-variants/final-a7c77d11/exit-status
```

Then check the complete corpus and exact historical differences:

```sh
attaches_audit_exit=0
node scripts/parity/attaches-names-variants-audit.mjs \
  test-results/attaches-names-variants/final-a7c77d11/raw.json \
  > test-results/attaches-names-variants/final-a7c77d11/audit.json \
  2> test-results/attaches-names-variants/final-a7c77d11/audit.stderr.log \
  || attaches_audit_exit=$?
printf '%s\n' "$attaches_audit_exit" > test-results/attaches-names-variants/final-a7c77d11/audit.exit-status
test "$attaches_audit_exit" -eq 0
```

The original narrow RED can be reproduced with the same runner and executable
paths by setting `EDITOR_CANDIDATE_SHA` to
`c3c8be4c822bca6b4c3b599a333f8197652fc159` and `EDITOR_ATTACHES_NAMES_FILTER` to
`ATTACHES_NAMES_VARIANTS/inline/3/a-to-f`. It must retain the five missing group
summary failures in the candidate.

The runner freezes and hashes its fixture at startup, serves every product
module from a pinned Git tree, and records loaded module/dependency hashes.
Unrelated worktree changes or later HEAD movement cannot change the products
under test. A nonzero raw differential exit is expected while historical
failures remain; assess candidate observations separately and never relabel
historical errors as unsupported capabilities.
