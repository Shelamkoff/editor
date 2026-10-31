# Attaches file sources: parity checkpoint

This manually written checkpoint accompanies the reproducible fixture, runner
and audit. Raw JSON, stderr and process status remain under ignored
`test-results/attaches-files/`. This comparison supplies bounded evidence for
`BLOCK_ATTACHES_FILES`; final publication acceptance and the integrated candidate
are recorded separately after independent review. No production change was
needed by the completed corpus.

## Source contract and bounded corpus

The current schema requires a `files` array and a stable, nonempty, unique `id`
for every entry. An empty array is the file-selection state; one entry is a
single attachment. Local selection and configured actions allocate IDs through
the existing block context. The obsolete singular `file` format is not decoded.
The English and Russian plugin guides were corrected in published commit
`d888217a0292120689354c8360ff994fb87a76df`; that slice changed no production bytes.

The casebook contains 18 fixed cases, all using presentation F so this row does
not repeat the separately accepted A/B/F/G presentation corpus:

| Cases | Executed capability |
| --- | --- |
| 5 local-file cases | Native picker with one file in an empty block and three files appended to a populated block; controlled single/multiple drop into an empty block and multiple drop into a populated block. |
| 5 upload cases | The same routes and cardinalities through the actual configured asynchronous `uploadFile(file, { signal })` provider. |
| 2 action cases | A trusted click on the configured application-source button returns one file to an empty block or three files to a populated block. |
| 3 partial-success controls | A rejected upload sibling, an upload sibling with an unsafe URL, and an action sibling with an unsafe URL leave valid siblings in exact order and preserve any existing file. |
| 3 no-op controls | Application-source `null`, empty-array and rejected results preserve canonical data, views and an empty history. |

The fixed inputs contain literal HTML-like names, Cyrillic, combining and
non-BMP Unicode, duplicate basenames with different bytes, a zero-byte file,
positive file sizes, exact URL queries/fragments and mixed-case extensions.
Duplicate physical filenames live in separate temporary directories, so the
real picker sees the same basename with independently known content and order.
The upload provider supplies 2,048 bytes for its first returned metadata record,
zero for its second, and omits the third size to exercise fallback to the actual
seven-byte browser `File`. MIME type and content bytes are observed at the
provider/local URL boundary; they are not invented serialized fields.

All sources expose the native picker, upload provider and action capabilities.
The v1 implementation installs drop handlers only in its empty selection view
and aborts them when rendering filled files. Therefore exactly two v1 cases,
`local/drop/multiple-populated` and `upload/drop/multiple-populated`, are declared
unavailable before execution. Its single and multiple empty-block drop cases
are executed. Both newer sources execute populated-block drop, preserving the
additional current capability. No runtime failure becomes an unsupported case.

The only wire/API adaptations are v1's constructor, version envelope and absent
file IDs versus the current factory, `dataVersion: 2` and identified file
records. All versions receive equivalent files arrays. There is no test or
production singular-wire decoder.

## Observable effects and oracle

Picker cases use a real trusted button click, a browser `filechooser` event and
disk-backed files supplied through Playwright's public `FileChooser.setFiles`.
The fixture checks actual picker activation, `multiple`, the trusted native
`change` event and complete `File` name/type/size metadata. Interception is
enabled before navigation. This executes the browser's picker integration;
it does not claim a human-operated operating-system file dialog.

Drop cases dispatch a controlled `DragEvent` carrying a real `DataTransfer` and
browser `File` objects. Their recorded `isTrusted: false` is intentional; they
prove the real plugin drop handler and provider path, not an operating-system
drag gesture. Action cases use trusted clicks on the real configured button.
The asynchronous upload provider records exact input bytes, names, type, size,
order and the initially live `AbortSignal`; action calls receive the same live
signal and their returned metadata is checked independently. Signal state after accepted completion is
not used to infer whether a task committed.

Expected canonical metadata comes from fixed authored records. No URL is
normalized out of comparisons. Local object URLs are nondeterministic owner
capabilities: the observer calls the original `URL.createObjectURL`, records
its exact returned URL and the original file's independently known bytes and
metadata, then requires the editor and renderer to retain that exact URL.
After undo and replay, fetching each real URL must still return those exact
bytes. Distinct allocations, no early revocation and exactly one final revoke
per owned URL are checked. Remote and pre-existing URLs remain exact strings,
including their queries and fragments.

Every completed positive source operation contributes one history step. A
trusted native filename edit contributes a separate step. Public `undo()` and
`redo()` independently remove and restore the rename and complete source batch,
with exact file order, URLs, names, sizes, extensions, existing IDs and new ID
stability. Public history commands are used because the source undo can leave
an empty block without a filename input. This proves semantic history and
replay, not uninterrupted caret restoration or keyboard-shortcut routing.

At each phase the fixture checks canonical files, unchanged caller inputs and
action results, editor text/metadata, literal-name rendering, exact renderer
link/download attributes and history flags. Read-only mode removes source
controls. Returning to editable mode preserves names, records and history
without restarting providers. The fixture ends by destroying its renderer and editor.
The audit separately checks trusted input telemetry and the exact complete
case/phase/property sets, preventing a missing phase or omitted assertion from
being counted as a pass.

Individual download activation, ZIP creation, URL-entry dialogs, failed commit,
cancel/destroy during a pending source, late completion and broad resource
lifetime remain separate obligations. Renderer link attributes are metadata
checks, not proof of navigation or downloading. This result accepts no new
download/ZIP or lifetime row and makes no whole-library parity claim.

## Complete pinned-source result

The corrected full `snapshot-corpus` run completed on 2026-10-31
20:47:45.558–20:48:16.607 UTC, Linux x64, Node v24.22.1 and Chromium
142.0.7444.175.

| Source | Immutable commit | Tree |
| --- | --- | --- |
| v1 | `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340` | `81c14d252e25a6501be18afc5f2f840ef4480e78` |
| Specification baseline | `e981ff308000c1d92d7e820df95113c1e19bcee8` | `e9956fb78777835fd5054c4e1ec882833c4fedbc` |
| Candidate | `5572d03980e531e9647fcec29008c427a599add7` | `dd5fe87e0ab6e1f6fd3cd6e14f3ac89cd7d237b1` |

| Source | Executed cases | Predeclared gaps | Passing observations | Raw failures |
| --- | ---: | ---: | ---: | ---: |
| v1 | 16 | 2 | 1,742 | 0 |
| Specification baseline | 18 | 0 | 2,336 | 0 |
| Candidate | 18 | 0 | 2,336 | 0 |

All executable cases complete all planned phases. No source has an uncaught
page error or incomplete case, and the server reports no errors. The raw
differential and exact audit both exit 0 with `candidatePass: true`,
`exceptions: []` and `candidateExceptions: []`.
Console warnings from the deliberately partial locale map and controlled
provider rejection remain visible in the raw output; they are not rewritten
as uncaught runtime errors or silently deleted.

The runner froze and hashed its fixture at startup and served every product
module from the pinned Git tree. The shared checkout stayed at
`ad153941a29d39c111970ea12e1c7c09e63ef10a` during this run, while the candidate
under comparison remained the explicitly pinned `5572d039` product. Worktree
modules were never served. The raw result records 148 loaded v1 product files and 166
files for each newer source, with SHA-256 for every product and dependency file.
All three used the same installed dependency runtime, including DOMPurify
3.4.17; the full dependency versions and hashes remain in raw evidence.

- Fixture SHA-256: `a0ec566c678729bc5bf4291f9eedbc8a534ae788561b3b3bc7929fe4429c31b3`.
- Runner SHA-256: `70c3c6e0762d54a7cf1933d934fc330d60ac0b8ee33e604f3975eb2e21e6d890`.
- Audit source SHA-256: `83742e4b980f765858f73ba536d7c3596f774a85d9e7ac12e56331467468d49b`.
- Raw JSON SHA-256: `65d860d086f5a9790717d7582563669e226bf2f685d8b6e1f18eababa40eebd5`.
- Audit JSON SHA-256: `152e5609426850228f710e3e39d9676c36b9b2d7589c93460439cf9e91d65510`.

Preliminary `initial-local-picker` and `second-local-picker` runs are excluded
from acceptance, with original raw results retained. The first oracle read
renderer link attributes from the row wrapper instead of its actual child
anchor. Both attempts also stopped at v1's first intercepted picker event.
The untouched v1 helper opened the native picker in isolation, and the corrected
third narrow run and full corpus completed it through the original editor.
The final runner installs interception before navigation instead of first
enabling it inside the click callback. These were harness corrections; no
product defect or historical capability gap was inferred from those failures.

The first complete `initial-corpus` attempt is also excluded. Independent root
review found that the observation recorder retained actual and expected values
by reference: its initially empty `revoked` array was filled during destruction,
changing the final `source/noEarlyRevocation.actual` even though the earlier
status remained `PASS`. The exact audit rejected that original raw result with
exit 1. The corrected recorder uses `structuredClone` snapshots, including
`undefined`, before comparing or storing either value. The complete
`snapshot-corpus` was then executed again; old output and statuses were retained
unchanged. Only the corrected corpus supplies the results above.

Three additional negative controls verify the audit boundary. It rejects a
candidate filename changed while its raw status still says `PASS`, an omitted
read-only observation, and a runtime error inserted into one declared v1 gap.
All three audit processes exit 1; their raw inputs, stderr and status remain in
`test-results/attaches-files/audit-negative-controls/`. They do not modify the
accepted raw corpus or classify historical failures as allowed behavior.

## Reproduction and exact audit

From the repository root, use these runtime paths or equivalent installed
Playwright and Chromium binaries. Keep the raw status even if a future run
fails; the audit never rewrites a raw failure:

```sh
mkdir -p test-results/attaches-files/replay
attaches_files_exit=0
EDITOR_PLAYWRIGHT_PATH=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs \
EDITOR_CHROME_PATH=/tmp/rector-browsers/chrome-linux64/chrome \
EDITOR_CANDIDATE_SHA=5572d03980e531e9647fcec29008c427a599add7 \
EDITOR_ATTACHES_FILES_FILTER='' \
node scripts/parity/attaches-files.mjs \
  > test-results/attaches-files/replay/raw.json \
  2> test-results/attaches-files/replay/stderr.log \
  || attaches_files_exit=$?
printf '%s\n' "$attaches_files_exit" > test-results/attaches-files/replay/exit-status
```

Then check the entire raw corpus, both historical identities, all loaded Git
bytes and dependency hashes, the exact observation tuples, genuine native
inputs, the two predeclared gaps and the absence of candidate exceptions:

```sh
node scripts/parity/attaches-files-audit.mjs \
  test-results/attaches-files/replay/raw.json \
  > test-results/attaches-files/replay/audit.json
```

The optional `EDITOR_ATTACHES_FILES_FILTER` selects a narrow case by substring
for diagnosis. A filtered result cannot pass the full-row audit. Raw output is
an ignored local artifact and is never added to Git.

## Final published source and scoped acceptance

The final complete replay uses published `fad69ef82293fcac28b5be756e3a7118a2c4750f`, tree `0b114d129a4416c84b86df63eb4c488196bb2d53`, including the three neighboring runtime repairs and these committed proof sources. It ran 2026-10-31 20:50:46.810–20:51:17.587 UTC. HEAD before and after matches the candidate, and the checkout remains clean. Product files are served from recorded immutable Git objects; the shared installed dependency bytes and versions are hashed separately. All 166 loaded candidate product-file hashes were checked independently.

Results remain: candidate 18 cases / 2,336 PASS; specification baseline 18 / 2,336 PASS; v1 16 / 1,742 PASS with exactly two predeclared populated-drop gaps. There are no page/server errors, incomplete cases or candidate exceptions. Raw runner exit is 0, independent audit exit is 0, and the final integrated audit exits 0. The raw JSON SHA-256 is `9b715b527829877923a8dea7620f27f1afede11b850bc443da48527dc169ee81`. Evidence is under ignored `test-results/attaches-files/final-fad69ef8/`; the independent review retains its own `peer-review.*` records without altering raw output.

The [completed combined checkpoint](../successor-and-result-ownership/README.md) records all eleven passed gates in `test-results/run-l2J6B3/manifest.json` on this exact clean, unchanged source. Independent scoped review and that completed integration accept only `BLOCK_ATTACHES_FILES`: **209 unique obligations, 64 accepted / 145 open**. Downloads/ZIP, pending cancellation, failed commit and broad lifetime/mode guarantees remain separate. Better current populated-drop behavior is retained.

To reproduce this final result, use the commands above with `EDITOR_CANDIDATE_SHA=fad69ef82293fcac28b5be756e3a7118a2c4750f` and a fresh ignored output directory. The earlier `snapshot-corpus` remains a result for `5572d039`, not this later candidate. The fixture, runner and audit hashes remain unchanged.
