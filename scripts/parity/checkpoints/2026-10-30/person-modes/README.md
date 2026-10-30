# Person hidden focus and reader tabs — 2026-10-30

This checkpoint verifies the named `BLOCK_PERSON_HIDDEN_FOCUS` and
`BLOCK_PERSON_READONLY_TABS` contracts. The current source passes **28 native
cases**, **5,497 differential observations** and **338 complete content phases**.
No new production defect was found. This slice changes tests and evidence only;
it does not claim a production RED/GREEN repair or whole-Person parity.

The candidate retains the improved v2 behavior. The original implementation's
missing keyed focus and persistent Person widget capabilities remain explicitly
unsupported. Its actual public block focus and pointer tabs are executed
separately. Historical failures and incomplete executions remain visible, and
the three-source comparison honestly exits **1**. The separate current native
gate exits **0**. There is no historical classifier or candidate exemption.

## Frozen source and executed results

- Base: `d67229c08f5fae7101cb2a252f2d56385224da08`.
- Final test source: `fde41c70584b890a1ae51c9b7f23f752f0a18c8a`, tree
  `73a47f391a8d38ace760ae2a061f937fddd1edfb`.
- Fixture SHA-256:
  `a48eb9a863635e9e04fb5706651b844598e6138eb1801e024d0b7251c3f42069`.
- Comparison runner SHA-256:
  `fd24f8b556cf4bd74a81f326b40044f6a98197bb76fada8a3124547a2cf2a610`.
- Uncompressed final comparison SHA-256:
  `2be60f1f9b1779d3875470c3022f6d2806dc1ffa76894a5296d2a638ef46f8db`.
- Comparison environment: Node `v24.22.1`, Chrome `156.0.8078.79`, Linux x64.
  Both browser commands use `/tmp/rector-chrome/opt/google/chrome/chrome`.

| Source | Completed cases | Explicitly unsupported | Observations | Raw FAIL | Incomplete cases | Page errors / diagnostics |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| v1 `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340` | 4 | 24 | 791 | 193 | 0 | 0 / 0 |
| Specification `e981ff308000c1d92d7e820df95113c1e19bcee8` | 26 | 0 | 5,041 | 901 | 2 | 17 / 17 |
| Candidate `fde41c70584b890a1ae51c9b7f23f752f0a18c8a` | 28 | 0 | 5,497 | 0 | 0 | 0 / 0 |

The specification's 17 page errors are captured by both the page-level listener
and the per-case listener; those are two records of the same error channel,
not 34 independent exceptions. Candidate server errors, page errors,
per-case page errors, diagnostics and unsupported cases are all zero.

Every served production module comes directly from its recorded Git object.
The archive identifies and verifies **109 v1, 107 specification and 107
candidate modules**, plus **23 dependency files**. Both final commands began
and ended with the same clean tracked source. The runtime is byte-for-byte
unchanged from the base: the four changed source paths are the new fixture,
new comparison runner, new native regression module and its existing harness
import. `source-identities.json` and `test-source.patch.gz` reconstruct that
source even if the test commits are later cherry-picked.

## Hidden-profile focus: 20 cases and two real public controls

The fixed authored document contains three complete profiles and neighboring
Paragraphs. All profiles have independent names, roles, biographies, URL/link
IDs and stable profile IDs. Widget variants contain real Mention and Color
instances in **all nine rich fields**, with independently fixed sidecars.
Formatting, hidden data, widget identities and caller-owned input are checked
throughout.

Sixteen cases cross literal/widget content, initially active first/second
profiles and the requested Name, Role, Bio or URL field. Each case first types
`A` into the active biography through the real browser keyboard. Its first
`blocks.focus()` request then targets the other, hidden profile. The request
must reveal that profile, return `true`, place the exact logical caret and
leave the accepted document, transaction count and history unchanged.

Two more cases place the first requested caret after a real widget in Bio or
Role, exercising the one-unit widget offset rather than merely a plain-text
prefix. Two URL cases request numeric position 22 inside a valid URL path;
the main URL cases request `end`. Starting from the second profile, rich-field
cases use trusted Shift+Left to create a backward range. Native `X`, two
separate Undo steps and two separate Redo steps must restore exact full records,
active profile, caret endpoints and selection direction. Same-block reveal
must not publish a current-block change. A final invalid keyed request returns
`false` and preserves the valid selection and author data.

The two `PERSON_PUBLIC_FOCUS_NATIVE_NAVIGATION` controls execute the actual
legacy surface: a trusted pointer tab switch, public
`editor.blocks.getBlockById('profiles').focus()`, then native Home and two
Right arrows. They perform subsequent native input and both history steps.
They do not translate keyed/numeric focus into private v1 calls, invent a
boolean return or pretend to execute an unavailable invalid-key request.
Current v2 executes its own public focus command in these controls.

## Read-only tabs: six cases

The cases cover literal profiles, real widget profiles and keyboard-activated
tabs, each constructed read-only or entered from editable mode. Every profile
is reached in read-only mode; its Name, Role, Bio, URL and actual widget content
are checked against the authored records. Editable controls are absent, rich
fields are not editable, URL controls are read-only, and tabs are not draggable.
Pointer and keyboard tab changes add no history or document transaction.

Each visited profile receives a real `Z` key attempt in its Name and URL. The
fixture proves that a trusted keydown was delivered and that no input event,
canonical write or history entry followed. It also retains six decisive
author controls from the editable instance: three profile-removal buttons,
profile Add, link Add and link Remove. Their detached callbacks are invoked
both during read-only mode and after editable mode returns. Those synthetic
negative lifetime probes remain inert; they are not described as native input.
Avatar/provider workflows are outside this slice.

Read-only traversal ends on the **third** profile. Both the initial transition
to editable mode and the later editable return must preserve that noninitial
profile. This positive context check distinguishes preservation from an
accidental reset to the first profile. Native continuation edits the third
biography, followed by exact two-step Undo/Redo across the earlier second-profile
edit. During read-only mode `canUndo` and `canRedo` are both false; returning to
editable mode exposes the preserved history without adding a mode/tab entry.

## What the historical records show

Pinned v1 has no keyed/numeric `editor.blocks.focus()` command, no boolean
acknowledgment and no persistent Person text-field mapping (`inlineTools` is
false and `mapTextFields` is absent). Its tabs are div-based pointer targets
without keyboard activation. Consequently 20 keyed focus cases, two rich-widget
read-only cases and two keyboard-tab cases are explicitly unsupported. The
remaining four cases execute to completion through the real public surface.

Those four cases retain 193 raw failures. v1 displays authored name HTML in its
tab labels, resets the active profile on mode transitions, and loses profile
selection/caret ownership during history replay. The ensuing native edit can
therefore reach a different profile, and replay can stop when keyboard ownership
is lost. The archive retains the exact values and downstream consequences;
these are not 193 independently diagnosed production defects.

The specification source fails the first boolean acknowledgment in all 20
keyed cases. Rich-widget and history paths also retain their original label,
projection and replay failures. Two widget read-only cases throw
`Inline widget root left its projection boundary before hydration` at the mode
transition: one on entry into read-only mode, the other on initial return to
editable mode. Their unexecuted later phases remain incomplete. Current v2
completes those exact cases without errors. None of these historical behaviors
is restored to obtain superficial parity.

## Evidence audit and preparation history

`audit.py` is a separate offline reconstruction. It does not import fixture
helpers. It verifies a fixed 28-case inventory, independently authored full
records, expected phase order, all 338 current snapshots, active profiles,
history availability and transaction counts, logical selection endpoints,
trusted author edits, delivered read-only attempts and unsupported-capability
boundaries. It recalculates all **11,329 stored observation verdicts**, checks
native case inventory and actual process statuses, and hashes every served
module and dependency. `audit.json` retains its successful result.

The preparation evidence is retained without calling it product RED:

- `4a82ac0b` passed the initial one-case native focus probe.
- `a370a5f7` produced a 20/28 native result. The six read-only cases incorrectly
  expected Undo availability while read-only; the two numeric-URL cases inserted
  `X` into `https`, creating a disallowed scheme correctly cleared by the
  existing sanitizer. The fixture was corrected to the specified disabled
  history availability and a numeric position inside a safe URL path. Runtime
  validation was not weakened.
- `2bb32ca8` passed 28 native cases and all 5,497 candidate observations. Its
  read-only traversal ended on the first profile. The final fixture strengthens
  that check by ending on the third profile, preventing a reset-to-first false
  positive. Both prior raw runs and their actual exit metadata are retained in
  `preparation/pre-context/`.
- `fde41c70` is the final strengthened source reported above. No product code
  changed in any preparation step.

The supervisors record actual subprocess exit codes, timestamps, clean source
identity and stdout/stderr hashes before returning to the terminal. The initial
one-case log has no supervisor exit record and is described only by its retained
passing terminal result. `hash-index.json` covers every retained artifact and
also records the decompressed hash of each gzip payload.

## Replay and acceptance boundary

From a checkout containing the final fixture and runner, with dependencies
installed and the three source objects available:

```sh
EDITOR_CHROME_PATH=/path/to/chrome \
EDITOR_PLAYWRIGHT_PATH=/path/to/playwright/index.mjs \
node scripts/parity/person-modes.mjs

EDITOR_CHROME_PATH=/path/to/chrome \
EDITOR_NATIVE_PAGE=native-plugin-parity.html \
EDITOR_NATIVE_FILTER='Person mode parity ' \
node tests/browser/physical-history.mjs

python3 scripts/parity/checkpoints/2026-10-30/person-modes/audit.py
```

The comparison runner rejects dirty tracked source and serves committed bytes.
`EDITOR_CANDIDATE_SHA` can freeze a candidate production source independently
of the committed fixture. Its optional `EDITOR_PERSON_MODES_FILTER` narrows an
exploratory replay; the archived final run has no filter. The native command
uses the existing CDP harness; the comparison uses actual Playwright mouse and
keyboard actions. Neither replaces native author input with model setters.

This evidence is adequate for the two named preservation rows, including v2's
explicit improvements where v1 lacks the API or has a demonstrated defect.
It does not accept `BLOCK_PERSON_CARDS`, `BLOCK_PERSON_AVATAR`,
`BLOCK_PERSON_LINKS`, renderer behavior, provider lifecycle, arbitrary tab
reordering, another browser/platform or whole-library parity. No shared
preservation ledger, main documentation, runtime file or remote ref is changed
by this isolated checkpoint.

## Archive portability and parent review

The parent integration retains the original raw commit bytes for all four prepared/tested sources in `original-source-commits.json`. The audit now reconstructs their exact trees and commit objects from the published base plus retained binary patches, using a temporary index and object store. It leaves repository refs, index and objects untouched. This permits the audit to run in a fresh clone after cherry-pick/publication changes commit metadata; it does not rerun the browser or relabel the source that was executed.

An independent parent review is retained under `peer-review/`. It checks all recorded verdicts and rebuilds complete literal documents, active-profile transitions and history for all 338 candidate snapshots, including the return to the noninitial third profile. Its first-request caret/range controls and retained author controls support only the two named Person rows. The historical 17 page events, their 17 case-local records and 17 diagnostics describe corresponding observations, not 51 independently diagnosed defects.
