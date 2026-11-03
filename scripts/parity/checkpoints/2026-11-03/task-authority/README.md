# Public task and decoded-read authority — accepted 2026-11-03

This extends the existing public `scoped-authority.html` regressions from 12
to 34 cases without changing production code. It targets the nine named
task/read/disposal contract rows, not every C07/C12 or extension obligation.
Committed-source validation below accepts these nine rows: the register moves
from 69 accepted / 140 open to **78 accepted / 131 open**.

Cases cover cancelled/consumed/mode-revoked tasks before options or producers;
single option capture with guarded nested commands, focus and selection;
live/retired inline input; no-op and an existing Redo branch; retryable input
failure versus consumed entered-producer failure for all six falsy values;
accepted remounts with an aborted old signal, an independent pending task and
in-place/no-op controls; exact revoked readers; and normal/read-only/staged
decoded reads followed by a valid host command. During each read the schema
getter supplies a distinct valid label, while stored data and history remain
unchanged. Decoder and value capture run once, including detached construction.
Terminal transaction/recovery failure retains readable data and permits
idempotent public disposal, exact instance/signal release and holder reuse.

`scripts/parity/task-authority.mjs` serves every production module from its
exact Git object. The same committed tests and original harness serve both v2
sources. A test-only harness wrapper snapshots own descriptors without invoking
result accessors; this avoids spending an extra application getter. The plain
browser gate separately executes all 34 cases without this observation wrapper.
There is no private core API adapter, production transformation or native
gesture claim.

v1 runs a real Paragraph construction/save/render/disposal control. It has no
public instance-scoped DataTask/schema-context contract under test. Its six
plugin-private `beginTask` references are retained explicitly and are not
mislabelled as absent asynchronous functionality or emulated as the v2 port.
The source query for public core/plugin-kit declarations is separately empty.
The specification baseline executes the full current contract corpus and
retains its historical failures.

The final exploratory candidate on `f2070510` passes **34 cases / 333 recorded
observations**. A separate manual model reconstructs the same 333 canonical
state, callback, signal, focus, history and decoded-value expectations, verifies
275 production modules and six dependency files, and reviews 478 recorded
observations across both v2 sources. The baseline passes 14 of 34 cases; its
145 observations and twenty failed/incomplete cases remain raw evidence.
Earlier wrong BlockPatch examples and a probe that loaded the original fixture
instead of the expanded one remain fixture diagnostics, not product failures.

`review.py` imports neither the browser fixture nor production code. It verifies
the exact 34-case inventory, every candidate assertion against manually written
states, ordinary unobserved-browser output, source/dependency identities and
byte equality with production `f2070510`. Its separately preserved original
twenty-one-gate integration manifest binds that unchanged runtime.

## Immutable acceptance

Candidate `61ec543ec98e4133509ecf42afe7a4c03c130eb7`, tree
`bd274e5ffcaf69f396589bbbd09b6127c6a9ceeb`, repeats all **34/34 cases and
333/333 candidate observations**. The ordinary unobserved browser page also
passes all 34 cases. The model reviews all 478 v2 observations, verifies 275
production modules, six dependency files and eight versions, and independently
reconstructs every candidate result. The baseline retains 14 passing cases,
twenty failed/incomplete cases and 145 observations; comparison exit **1** is
preserved separately from successful candidate/model review exit **0**.

All five affected gates in `run-jV7549` pass on clean unchanged source: both
typechecks, ordinary browser page, Git-source comparison plus independent
model, five negative controls and docs contracts. Started
2026-11-03T02:27:04.097Z; finished 2026-11-03T02:29:37.960Z; source identity
`6cb6a17ff96590c1d97265e09eb231b14cd528cf49b5a82dc316875b854cd808`.
Environment: Windows x64, Node 24.22.2, Chrome 156.0.8078.80, Python 3.12.14.
All runtime paths and loaded candidate modules are byte identical to
`f2070510`, whose separately preserved `run-xxJbdd` passes all 21 integration
gates. The five-gate run is not presented as a new 21-gate execution.

Healthy evidence review returns 0; the following five corruptions each return
1 at the intended source/model/inventory check: wrong candidate, consistently
false canonical state, missing option getter invocation, removed mode-retired
case, exposed undecoded accessor. Original mutated corpora, recipes, hashes and
failure output are retained. The model imports neither fixture nor runtime;
this is author verification, not a separate-agent review.

Only these rows are accepted:

- `CONTRACT_RETIRED_TASK_OPTIONS`
- `CONTRACT_ACTIVE_TASK_OPTIONS`
- `CONTRACT_INLINE_OPTION_CAPTURE`
- `CONTRACT_TASK_SETTLEMENT`
- `CONTRACT_TASK_SUCCESS_RETIRES_OWNER`
- `CONTRACT_READ_GUARDED_INLINE_DECODE`
- `CONTRACT_READ_REVOKED_INLINE_DECODE`
- `CONTRACT_READ_PRESERVED_MODES_AND_DATA`
- `CONTRACT_FAILED_PUBLIC_DISPOSAL`

Other C07/C12 rows, B-HTML and full-library readiness retain their own proof
obligations. Improved task/remount/read behavior remains intact.

## Artifacts and reproduction

`final-differential.json.gz` decodes to SHA-256
`bf1b98392069c5ba9b5922a49a8a801440399b715a8b06fabe587f9056ee990d`.
`artifact-hashes.json` binds stored and decoded bytes, including both original
manifests, all five corrupted corpora, ordinary browser/type/docs logs, process
outcome and review. `executed-review.py.gz` preserves exact Windows execution
bytes with SHA-256
`fbbaf390c348fe66819285b561489071fc0ba3ef92ae03b78bbfb7c24641fd44`.
Runner/fixture LF and binary JSON/gzip attributes preserve source identity on
fresh Windows checkouts.

Final acceptance prose also passes docs contracts and the built 127-page site:
zero broken links/assets, with the editor/search/menus and EN/RU browser smoke
checks passing. The first site attempt rejected an unquoted English `getter`
term in Russian prose; that failed log is preserved separately, the term is
corrected and the next complete site check passes. These documentation checks
do not alter the original five-gate candidate record.

Final acceptance prose also passes docs contracts and the built 127-page site:
zero broken links/assets, with the editor/search/menus and EN/RU browser smoke
checks passing. The first site attempt rejected an unquoted English `getter`
term in Russian prose; that failed log is preserved separately, the term is
corrected and the next complete site check passes. These documentation checks
do not alter the original five-gate candidate record.

From repository root at the candidate, run `node scripts/parity/task-authority.mjs`
with `EDITOR_PLAYWRIGHT_PATH` and `EDITOR_CHROME_PATH` set to the installed
Playwright module and Chrome executable. Retain complete stdout and its expected
exit 1. Run `node tests/browser/run.mjs` with
`EDITOR_BROWSER_PAGE=scoped-authority.html`, retaining its complete output.
Invoke `review.py --raw RAW --candidate SHA --browser BROWSER_LOG --output REVIEW`
with Python 3, then `node scripts/parity/checkpoints/2026-11-03/task-authority/controls.mjs
RAW SHA BROWSER_LOG OUTPUT_DIRECTORY` with `EDITOR_PYTHON_PATH` set. The final
comparison and the original failed baseline remain independently inspectable.
