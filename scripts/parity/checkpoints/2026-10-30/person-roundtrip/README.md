# Person ROUNDTRIP and responsive renderer — 2026-10-30

This checkpoint executes four complete, bounded `BLOCK_PERSON_ROUNDTRIP` cases
against the pinned v1, specification baseline and candidate. It repairs two
observed presentation defects and verifies the responsive renderer upgrade. It
does not change the shared acceptance ledger or close every Person scenario.
In particular, a never-opened inactive profile whose name contains a persistent
widget remains a separate OPEN presentation capability.

## Frozen sources and results

The production base is `4bfb39426744bc0a96725258c06dc9192b58098b`. The final
isolated source is `b1bf7bc9bf16802d690165e67adfe231eac3e6e4`, tree
`b26955c95b6f2d6848ba750cdcc6e06d6953bf4f`. The code patch SHA-256 is
`fa118891bf4e0ac19887935896e07ad3a6ad53b05a92d7a2f353923af9a5b96d`.
`source-fingerprints.json` contains all seven before/after file hashes.

Only `plugins/person/index.js` and `renderer/renderers/person/index.js` change
runtime behavior. The other five files add the Person fixture, exact historical
classifiers, native renderer tests and their existing harness import. Core,
public APIs, dependencies and the previous URL-owner repair are unchanged.

| Verification | Result |
| --- | --- |
| Shared 57-case, three-source differential, Chrome 156.0.8078.47 | candidate 10,055 observations, zero failures; exit 0 |
| Four Person cases in that same differential | candidate 926/926; all planned phases complete |
| Person native cases, Chrome 142.0.7444.175 | 4/4 PASS |
| Detached/responsive renderer native cases, Chrome 142 | 2/2 PASS |
| Related renderer and Person unit files, separate Node processes | 135/135 PASS in 11 files |
| Library and runtime TypeScript projects | both exit 0 |
| Person historical classifier sensitivity | 217 exact positives; 4,562 altered observations rejected |
| Classifier against the actual candidate tab failures | both real candidate failures rejected |

The final C11 record reports unchanged runner, fixture, classifiers, loaded
source and dependency files, verified source identity, and no server errors.
The candidate has no browser/page errors and no exceptions in the classifier.
Node is v24.22.1. Dependencies are an actual isolated `node_modules` directory,
copied without Vite caches. Full provenance and loaded file hashes are retained
inside `final-shared57.json.gz`; they are not replaced by the summary table.

## Executed Person template

The default case creates the real empty editor without supplying fabricated
Person data. The three populated cases use independently fixed records for two
profiles, including IDs, avatars, names, roles, biographies, link IDs, providers
and URLs. Literal HTML, wrapped Mention/Color tokens, and unwrapped controls are
separate cases. Real Mention and Color implementations provide the sidecars.

Every content phase checks the complete saved records, including the inactive
profile and sidecars, against fixed expectations. It also checks current rich
fields and URL controls, readable tabs, active identity, avatar, mode, history,
input immutability, neighboring block IDs and DOM identity. Retired fields must
be detached and lose mutation authority. Synthetic dispatch is used only for
that negative retired-owner control.

The populated cases perform trusted clicks to the second profile and back,
checking its actual rich body and URL controls without creating history. They
then perform a trusted native text edit, one Undo and one Redo. Native caret
ownership and offsets are exact. Mode transitions preserve a foreign focus.
The three renderer faces are separately inspected: detached `render()`, its
immediately attached result, and `renderTo()`. All profiles' rendered names,
roles, biographies, avatars and links are checked; renderer inputs remain
immutable. Disposal and retained-control behavior are checked afterwards.

The first profile contains real widgets; the second has independent literal
rich markup. This is not evidence that arbitrary widgets in a never-opened
secondary name already produce a readable tab. That limitation remains below.

## Test-first defects and implementation

### Detached output and responsive reuse

At the production base a multi-profile renderer created its cards only after a
ResizeObserver measurement. Detached output and its immediate attachment were
empty. `detached-output-red.json.gz` retains 12 actual candidate failures, with
221 candidate observations. After the first renderer change, the same fixture
has zero candidate failures in `detached-output-green.json.gz`.

Cards now exist before attachment. A subsequent native test demonstrated that
the first implementation rebuilt them when the container needed a carousel:
the fitted-list control passed, but both card identities failed in the overflow
case. `renderer-reuse-red.log.gz` retains that failure. The final implementation
passes the already parsed cards through the existing Carousel content-factory
port. Exact list/card/resource checks guard the measurement upgrade. Both the
cards and real widget nodes survive; native Next/Previous moves the carousel
and returns to the original position. Retired navigation cannot recreate output.

Existing fitted-list, foreign-document, Trusted Types and missing-observer
fallbacks keep their readable list. There is no new renderer API, DOM cloning,
second inline parse, or change to the installed carousel configuration.

### Tab selection

The extended full fixture then exposed two candidate failures, one wrapped and
one unwrapped: after switching to the second profile, the already settled first
tab changed from `Alpha @Ada tail` to `Alpha {{mention}} tail`.
`view-tabs-red.json.gz` retains both, with 926 observations. The same final
fixture produces 926/926 candidate PASS in `view-tabs-green.json.gz`.

The existing tab action now retains the tab nodes and their completed labels.
It validates the exact clicked path before and after the existing flush,
updates active/ARIA state and renders the selected body. It introduces no
canonical write, label cache, sidecar decoder, new listener or public port.
The prior rich-field completion path remains responsible for the active label.

The runtime files received an independent read-only peer ACK. That review did
not claim a second execution of the browser suite or a full classifier audit.

## Historical observations remain visible

The Person slice has 181 raw v1 differences and 36 specification-baseline
differences. The classifier accepts only the pinned historical source, exact
case, executed phase, property and actual/expected values. It additionally
requires the complete independent author records, sidecars, modes and history
for every executed phase. Caret differences require exact native owners and
endpoints. There are no candidate exemptions.

Recorded categories include empty-draft wire representation, historical raw or
uninterpolated labels, the missing detached renderer cards, raw avatar alt HTML,
historical block remounts and native caret differences. Persistent Person
widgets were not a v1 capability: pinned v1 declares `inlineTools = false` and
no required `mapTextFields` hook. Its missing widgets and sidecars are reported
as unsupported, not asserted to be equivalent rendered behavior.

The specification baseline's two widget cases fail at the read-only transition
with the exact hydration-boundary error. Only `load` completed; all subsequent
phases remain explicitly incomplete. Classification does not turn them into
passed executions. The shared 57-case run also retains its existing unrelated
historical classifications and one previously classified baseline page error.

`classifier-sensitivity.mjs` is offline evidence: it does not operate a browser,
alter input, or rewrite recorded outcomes. Its negative controls change source,
case, phase, values, records, hidden-profile data, sidecars, mode, history and
native endpoints. Both actual candidate tab regressions are rejected as well.

## Evidence interpretation and reproduction

Early differential probes used the existing runner before the new Person
classifier was installed. They intentionally exit 1 when historical differences
remain, including the candidate-GREEN probes. Their full statuses and source
fingerprints are in `runs.json`; candidate success is not described as an
all-source process pass. The two initial detached probes have an identical
fixture fingerprint. The view-tab RED and GREEN use the exact final committed
fixture. `pre-tabs-fixture.js.gz` reconstructs the earlier four-case fixture and
matches its recorded SHA-256 exactly. `historical-probe-runner.mjs.gz` preserves
the corresponding old runner. The initial extra empty v1 URL draft control and
removed-control lifetime oracle corrections are fixture compatibility changes,
not production fixes.

An initial unit invocation placed all files in one Node process. A fake global
HTMLElement from the Person unit collided with an unrelated realm diagnostic:
134 passed, one failed. That output is preserved as a harness diagnostic.
Without changing runtime or tests, running the same 11 files in separate Node
processes passed all 135. The final per-file exits are archived. Empty typecheck
logs are successful commands without output; the manifest records their exits.

`source-history.mbox.gz` retains the four isolated runtime/test commits. Apply
them on the recorded base or use the integrated equivalent source hashes. To
repeat the final checks with the locked dependencies:

```sh
EDITOR_V1_ROOT=/path/to/v1 EDITOR_SPEC_BASELINE_ROOT=/path/to/spec-baseline EDITOR_PLAYWRIGHT_PATH=/path/to/playwright/index.mjs EDITOR_CHROME_PATH=/path/to/chrome node scripts/parity/block-roundtrip.mjs
EDITOR_CHROME_PATH=/path/to/chrome EDITOR_NATIVE_PAGE=native-roundtrip-preservation.html EDITOR_NATIVE_FILTER=BLOCK_PERSON_ROUNDTRIP node tests/browser/physical-history.mjs
EDITOR_CHROME_PATH=/path/to/chrome EDITOR_NATIVE_PAGE=native-plugin-media.html EDITOR_NATIVE_FILTER='Person detached profiles' node tests/browser/physical-history.mjs
node scripts/parity/checkpoints/2026-10-30/person-roundtrip/classifier-sensitivity.mjs
node node_modules/typescript/bin/tsc -p jsconfig.json
node node_modules/typescript/bin/tsc -p jsconfig.runtime.json
```

Run each `renderer/*.test.js` and `plugins/person/reconciliation.test.js` in a
separate `node --test` process, or use Node's ordinary file isolation. Gzip
artifacts preserve raw bytes with a fixed compression mtime; original and
stored SHA-256 values are recorded in `manifest.json`.

## Remaining scope

Never-opened inactive widget-name tabs remain OPEN, as already documented in
the previous Person presentation checkpoint. The public completion contract
covers mounted fields; Person has no public detached inline decoder for a hidden
tab. This patch preserves an existing completed label across a legitimate view
switch. It does not invent hidden fields, cache projected names, parse private
payloads or expand `afterProjection`. Other Person detail rows, the combined
integration/release gates and whole-library v1 parity require their own evidence.
