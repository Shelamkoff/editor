# Code language, highlighting and copy completion — 2026-10-30

## Result

The Code editor now discards a highlighter result if its compatible provider
synchronously retires the editor or causes a newer field presentation. Before
the fix, a provider could successfully call `editor.blocks.update()` with new
source text, leaving the canonical document and textarea correct while the
older completion replaced the visible highlighted layer with obsolete text.
A provider that called `editor.destroy()` also modified the retired DOM after
destruction returned.

The Code renderer had the corresponding late-load defect: its existing
`liveElements` check ran before the highlighter callback. A real highlight.js
`before:highlight` plugin could call `renderer.destroy(target)` successfully,
after which the old completion still wrote into that retired output. A second
check of the same existing owner after `highlightCode()` now prevents that
write. An independent live renderer continues to highlight normally.

Production changes are confined to `plugins/code/index.js` and
`renderer/renderers/code/index.js`. The editor stages computed highlighting,
then checks its local refresh invocation, current text/language and existing
instance signal before publication or plain-text fallback. The renderer uses
its existing output lifetime. No public API, canonical/history owner, shared
runtime semantics, retry policy or compatibility route is introduced.

The earlier explicit unknown-language repair remains intact. The editor keeps
unknown nonempty identifiers and uses literal plain text; the renderer's
existing shared automatic-detection behavior is unchanged.

## Exact sources

| Role | Source |
| --- | --- |
| Pinned v1 | `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340` |
| Specification baseline | `e981ff308000c1d92d7e820df95113c1e19bcee8` |
| Pre-fix current source | `69c8425e0081fde69cf5176ccb73d032720c15fc` |
| Editor native RED | `bc62b28664b1bd2f357b19ff87fa5f86717d4f41` |
| Editor first native GREEN | `6e679939f57ba538c8a2ee4302bf81aa2955e380` |
| First completed editor-only source | `2ffa4bc83e131e8828cfa7f3637774f70777dd75` |
| Renderer public RED | `6e707b979a2066e47dc8980053ed87900a89984d` |
| Renderer fix | `11e06d6f65e30a68a0861a812135f1397c210b25` |
| Final production/native/unit/typecheck source | `33659119322c865833f3d6722981fc632f46026d` |
| Final independently corrected comparison source | `df18bbcadf525685d505beeba6b0d58419c2ee28` |
| Final comparison tree | `fe1a93640a27ae79e7da7be7e1e4bbf41a68da6f` |

`manifest.json` and eleven full-index patches reconstruct all recorded fixture,
RED, first-GREEN and final trees from the reachable pre-fix source. They retain
local commit identities; an integration or publication with another tree or
commit is not silently presented as this tested source. The original editor
stage manifest is retained separately without rewriting its outcomes.

## Final executed checks

| Check | Result |
| --- | --- |
| Registered native Code group | **16/16 passed**, including the two new reentry regressions |
| Registered ordinary Code lazy renderer page | **1/1 passed**, with an independent live-output control |
| Code and shared highlighter unit contracts | **13/13 passed**, no skip |
| Both source typecheck configurations | **Passed** |
| Four-source semantic comparison | **28 cases / 567 observations per source**, every case complete |

The registered native/ordinary, unit and typecheck gates ran on `33659119`.
The final comparison runs on `df18bbca`; the recorded diff between them changes
only its standalone runner and two fixtures. Production, registered tests,
dependencies and configuration are identical. This distinction is retained
instead of asserting that a command ran on an identity it did not use.

The final comparison exits **1**, preserving historical failures. It separately
reports `candidatePass: true`; no classifier grants baseline or candidate
exceptions.

| Source | Cases | Observations | Raw failures | Page/server errors or incomplete cases |
| --- | ---: | ---: | ---: | ---: |
| v1 | 28 | 567 | 21 | 0 |
| Specification baseline | 28 | 567 | 4 | 0 |
| Pre-fix current | 28 | 567 | 2 | 0 |
| Candidate | 28 | 567 | 0 | 0 |

The two pre-fix failures are the editor and renderer writes after provider
retirement. The registered native tests independently cover the visible
superseding-data defect and subsequent native input/Undo/Redo. The historical
v1 failures additionally include caret replay, a no-match language-menu
history effect and retired copy callbacks. The specification baseline also
has the already repaired explicit unknown-language fallback. These failures
remain visible in the raw JSON. Every source's renderer provider control now
records callback entry and successful disposal before testing stale writes.

## What the comparison proves

**Language selection.** A fixed literal source and unknown nonempty language
load unchanged. Trusted text input and keyboard navigation filter by language
name, select Python, wrap across multiple matches, handle an empty result and
cancel with Escape. The language label, selected option, menu/focus state,
code and caller input have independently specified expected values. A prior
native input and the language choice remain separate history actions, with
two Undo/Redo steps. Cancellation and read-only round trips do not author.

**Editor highlighting.** Default lazy loading, explicit compatible injection,
a throwing provider, delayed success and failed network loading all preserve
readable literal source and inert HTML-looking text. Delayed completion uses
the newest native input. Retired instances do not repaint after loading or
after a synchronous provider destroys them. Native history checks preserve
the exact current text and caret. The existing native auto/supported/unknown
controls remain registered and pass in the final Code group.

**Renderer highlighting.** The public `EditorRenderer` runs injected and
throwing providers, the real default runtime, delayed/failed loading,
replacement before load, disposal before load and disposal inside the real
provider callback. Original input is unchanged, escaped source remains
literal, replaced output cannot repaint, and live independent output still
works. No renderer implementation is replaced by a test double.

**Copy.** Editor and renderer Copy buttons are activated by real browser
pointer input. Actual Clipboard API contents are compared with fixed source
text and pasted through the native shortcut into a separate textarea. Editor
copy is repeated in read-only mode and with newly committed input; copy and
feedback/reset do not add a document history action. An actual
`Permissions-Policy: clipboard-write=()` header makes the browser reject its
own `writeText()` with `NotAllowedError`, even though the test browser's
separate permission grant remains present. The policy and actual native
rejection are asserted separately. No fake rejection substitutes for this
native negative.

Separate controlled host API cases cover a rejected promise, unavailable API,
empty Code draft and pending completion after retirement. Retained renderer
buttons cannot start a new write after disposal. These controlled service
cases are explicitly distinguished from the real successful and denied
browser clipboard operations.

## Evidence integrity and retained development failures

The runner serves production modules directly from the stated Git objects
without rewriting them. Test-only adapters translate factory/class and
document/data-version spelling, plus the v1 language-label selector. V1's
original local highlighter bundle is served unchanged and delayed/failed at
its actual module request. Current sources use a browser ESM bundle built
from the installed declared highlight.js package; every bundle input is
hashed. The final raw record contains **628 served source-module hashes**, **63
served dependency-file hashes**, and **194 highlighter-input hashes**, plus
runner, both fixture and bundle hashes. Environment: Chrome
`156.0.8078.79`, Linux x64, Node `v24.22.1`.

The archive preserves these failed development attempts instead of relabeling
them as product regressions or successful gates:

- The initial editor fixture toggled an already editing block into hidden
  view before checking history and expected `canUndo` to remain true in
  read-only mode. The correction explicitly reacquires source ownership and
  checks the disabled public history result before editable history resumes.
- The first native clipboard denial attempted a CDP override, but the browser
  still reported and permitted a grant. A real response policy was then used.
  Its write correctly rejected while the separate Permissions API grant
  remained `granted`; the final fixture checks that distinction directly.
- The first ordinary renderer test started provider registration concurrently
  with Code's lazy completion. Its first after-fix attempt did not exercise
  retirement and failed its setup assertion. The final fixture awaits the
  real dependency and installs its public hook before Code selects that
  runtime. No runtime internal is mocked or reset. The immutable-source
  comparison independently controls the actual request and reproduces the
  product failure on all three historical sources.
- Independent review found that an earlier comparison kept a mutable
  `clipboardCalls` array in a prior observation. A later v1 stale click changed
  that recorded value, so one stored `PASS` no longer matched the serialized
  actual/expected pair. The same review found a specification-baseline lazy
  case whose provider retirement had not actually occurred. That entire raw
  `complete-final` comparison remains archived as **defective evidence and is
  excluded from acceptance**. Both fixtures now snapshot values, and the
  provider control establishes causal registration before Code selects the
  runtime, with explicit callback-entry/error/retirement checks. The fresh
  `reviewed-final` run supplies all comparison counts above.

The editor's two original RED assertions fail for obsolete publication;
the first GREEN and final native group pass. The renderer's original public
RED asserts the changed retired markup, while the final ordinary and
four-source controls pass for the candidate. These are separate from the
fixture-development failures above.

`review.py` recalculates every stored verdict, verifies source/dependency
hashes and reconstructs the eleven recorded source trees with a temporary Git
index. It explicitly reports the one known mismatch in the excluded earlier
capture, while requiring zero mismatches in the accepted fresh comparison.
It is archive verification, not an additional independent browser
execution. `artifact-hashes.json` covers encoded and decoded artifact bytes.

## Reproduction and acceptance scope

With the recorded dependencies, a configured Chrome executable and Playwright:

```sh
EDITOR_NATIVE_PAGE=native-plugin-parity.html EDITOR_NATIVE_FILTER='Code ' node tests/browser/physical-history.mjs
EDITOR_BROWSER_PAGE=code-lazy-contracts.html node tests/browser/run.mjs
node --test plugins/code/*.test.js shared/highlightRuntime.test.js
npm run typecheck
node scripts/parity/code-controls.mjs
python3 scripts/parity/checkpoints/2026-10-30/code-controls-completion/review.py
```

The differential accepts `EDITOR_CHROME_PATH`, `EDITOR_PLAYWRIGHT_PATH` and
`EDITOR_DEPENDENCIES_ROOT`. `EDITOR_CODE_SOURCE` and `EDITOR_CODE_CASE` select
diagnostic subsets; they do not replace the archived complete final run.

This evidence supports the complete recorded Chromium scope of
`BLOCK_CODE_LANGUAGE` and `BLOCK_CODE_HIGHLIGHT_COPY`, subject to combined
integration verification. It does not accept `BLOCK_CODE_SOURCE`,
`BLOCK_CODE_PASTE`, `BLOCK_CODE_CONVERSION`, iframe/CSP/platform-wide rows,
all renderer contracts or whole-library parity. The existing common Code
ROUNDTRIP acceptance remains separate.
