# Bold, Italic and Strikethrough: public TOOL action proof

## Result and proposed acceptance

This checkpoint proposes acceptance of `TOOL_BOLD_ACTION`, `TOOL_ITALIC_ACTION` and `TOOL_STRIKETHROUGH_ACTION` after independent review and the parent's integration checks. It adds a fixed browser corpus, registration in the existing native tools suite and an exact-source differential runner. **Production is unchanged from base `d67229c08f5fae7101cb2a252f2d56385224da08`.** No new current production defect was found in this scope, and no legacy behavior was restored to force equivalence.

The final tested source is `0b8541dab9a101d44511bd8c9a2ff319d0d21cb7`. All 96 current scenarios complete with 4,494 passing observations in Chrome `156.0.8078.79`, Node `v24.22.1`, Linux x64. The same 96 scenarios pass through the repository's focused native harness. Both TypeScript configurations pass on that exact source. This is a new complete action proof for the three named rows; preceding host-ownership fixes and other tools' proofs have not been relabeled as this acceptance.

## Fixed corpus and observable contract

| Cases | Scope and expected result |
|---|---|
| 36 apply | Each tool across one Paragraph, two Paragraph blocks and the text/caption fields of a Quote. Text/Element endpoints in both directions. Add the target mark to selected authored text while preserving other marks, styles, link attributes, BR, widget presentation/data and unselected text. |
| 36 mixed removal | The same field arrangements and boundary/direction combinations, with a mixture of plain text and existing target marks. Remove the selected target marks, including nested target marks around styled middle text, while retaining other formatting and partial unselected endpoints. |
| 12 nested removal | Each tool with the target mark nested twice inside another mark. A Text range removes only the middle `p` of `Alpha`; an Element range removes the target from all of `Alpha`. Both directions retain exact logical selection and all text. |
| 6 atomic no-op | Each tool in both directions on a real Color-only range. Undo a preceding native `X`, invoke the tool, then verify that the existing Redo branch remains intact and replays only the original native edit. |
| 6 lifecycle controls | Each tool while read-only and after destroy. Invoke a retained old button; in the destroy case a new editor with the same block ID is editable and owns a valid range. The old producer stays silent. Resume or use the successor's native toolbar action and verify one action plus exact Undo/Redo. |

Every ordinary case contains two actual built-in inline widgets: Color `swatch` with payload `{value:'#aBcDef'}` and Mention `mention` with payload `{id:'ada',name:'Ada'}`. The Mention label is `@Ada`. This uses their real rendering and persistence APIs, rather than fake atomic DOM. Author formatting cannot enter widget children or change widget IDs, sidecars, label, value, Color dot, root attributes or node identity. The Mention search provider must remain unused during all ordinary formatting/no-op scenarios.

The endpoint words are `Alpha` and `Bravo`, with a nested different mark. Between them are plain text, a `#800000` styled span containing another mark, an escaped ampersand, BR, a `/kept` link retaining `rel="noopener noreferrer"`, and both widgets. Text endpoints cut the words at interior character boundaries; Element endpoints use actual element-child boundaries. A separator is present between words only within a single field; there is no unnecessary trailing field-edge whitespace that legacy normalization could trim before the action.

Expected content is authored in the fixture without invoking a production toggle, sanitizer or normalizer. A test-only reader compares text, marks, link/style meaning and atomic placeholders in canonical saves and separately in the live editing fields. Equivalent `b`/`strong`, `i`/`em` and strike spellings and CSS declaration order are allowed. Widget internals are treated as an atom before the reader can traverse their children. Literal visible widget inventories are checked on load, native input, apply and every history replay. Apply also compares original widget and child-node identity, exact inner HTML and every root attribute against the same source's pre-action state.

The internal `contenteditable` mode of Mention is intentionally outside the inter-version inventory: v1 and v2 have different label-editing capabilities. Its value must still remain unchanged across an individual formatting action. Color remains explicitly noneditable in the fixed visible inventory. This scope does not claim complete Mention label-editing parity.

Logical offsets are derived independently over UTF-16 authored text, one unit per BR and one unit per widget. The action and its history replay must keep the owning field, endpoints and forward/backward direction. Quote cases distinguish separate editable fields sharing one block and history owner; cross-Paragraph cases distinguish different blocks. Block IDs and types and all inline sidecars remain stable.

Each positive action follows a separately trusted native `X`. The actual named toolbar button receives a trusted native mouse event and calls the named producer exactly once. The event sequence must contain one native-input commit and one tool commit. Two native Undo operations restore the typed document and then the initial document; two Redo operations restore each separately. Full canonical block snapshots, live projection, range/direction, action names/origins and history availability expose coalesced or extra actions. A canonical no-op calls the producer once while publishing no document action and preserving the prior Redo branch.

Read-only is a suspension control. Destroy is a retirement control with an independently editable successor and a real selected text range; its negative result cannot be explained solely by read-only state or an accidental no-op. The retained-button `.click()` is deliberately synthetic to exercise a late callback. Subsequent live toolbar clicks and all history gestures use trusted native input.

## Pinned-source results

| Source | Complete / recorded cases | Observations | Raw FAIL observations | Incomplete execution |
|---|---:|---:|---:|---|
| v1 `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340` | 90 / 96 | 3,951 | 408 | Six atomic-only selections have no visible named toolbar action. |
| Specification baseline `e981ff308000c1d92d7e820df95113c1e19bcee8` | 96 / 96 | 4,494 | 504 | None. |
| Current `0b8541dab9a101d44511bd8c9a2ff319d0d21cb7` | 96 / 96 | 4,494 | 0 | None. |

Each current tool has 32 scenarios and 1,498 observations. All sources pass their fixed initial canonical-meaning, preceding native input, widget payload and installed-range controls. The same fixture and intended semantic outcomes serve every source. The legacy adapter changes public construction/configuration and wire-version spelling only. Legacy has no v2 public transaction/producer-observation contract; that is explicitly unsupported, while public canonical history and live projection still execute.

The raw comparison **exits 1** and retains 912 historical failed observations and the six legacy action-visibility errors. `candidatePass` is separately true. Page, native input and server error channels are empty for all sources; diagnostic arrays are empty. Candidate has no case errors, incomplete phases or unsupported controls. A separate console-message channel is not collected, so no claim about such output is made.

The historical observations include lost backward direction, incomplete nested removal, missing/incorrect tool action boundaries and exact history replay, late retained UI affecting selection and widget child corruption. In particular, 45 remaining legacy visible-widget failures record a lost Color dot after mixed-mark removal; 36 cases also fail live widget child identity and inner-markup preservation. These are repeated observations across the fixed matrix, not counts of distinct defects. The improved current behavior is retained.

## Verification and evidence correction

`recheck.py` is the author's separate verification program, **not a separate-agent peer review**. It contains an independently written per-character text/mark oracle. It does not import the browser fixture or derive expected results from production output. It verifies candidate canonical and live meaning, fixed widget inventory, endpoints/direction, full named transaction sequence and canonical history payloads against that manual model. It also validates exact case inventories, phase order, observation counts, trusted input/history/button records and every saved actual-versus-expected verdict.

The recorded recheck passes with 12,939 verdicts recomputed and 2,610 separately rebuilt oracle checks. It verifies 345 served source-file hashes, seven loaded dependency-file hashes, eight dependency versions and the 96-case native log. Both preserved source patches reconstruct their exact trees and original commit objects in a temporary Git object store; repository refs, index and object store remain unchanged. This also allows review when the original working-branch commits were not published as ancestors of the final integration commit.

The first frozen corpus at `e696882e613d0592720c898f64d40ae41c9b8082` passed all 96 current native cases and all 4,404 current differential observations. Its legacy widget inventory incorrectly required the modern Mention editing-mode attribute. The 633 inventory failures included 588 mode-only mismatches and 45 genuine Color-dot losses. That report is retained under `attempts/` but excluded from acceptance. The final fixture removes only the cross-version Mention mode expectation, adds stricter unchanged-root-attribute checks within every action, and retains all semantic, ownership and payload assertions. This was an overbroad test expectation, not a production RED or a production fix.

The initial one-case uncommitted smoke log is also retained as a diagnostic, without a reproducible-source claim. No draft or historical error is converted to a pass.

## Preserved artifacts and reproduction

`manifest.json` records the source, trees, raw commit contents, scope and actual process outcomes. `final-differential.json.gz` contains the complete final report; its decoded SHA-256 is `0abec93c00f444dc6118e6b1226c65f2d9605754be7fdc96f38a3028954c8917`. The final native log, empty differential stderr, typecheck output and process-completion records are preserved. `runtime-hashes.json` records Node/Chrome executable and Playwright entry/manifest hashes and versions. The runner records unchanged HEAD, every served production/dependency byte hash and fixture/runner/lock hashes. `artifact-hashes.json` covers the retained files, including decoded hashes for gzip artifacts.

`sources/` contains full-index binary patches from the published base to the two frozen test sources. The manifest's raw commit bytes retain their exact original identities. `attempts/` retains the superseded full comparison, its native run and the initial bounded diagnostic smoke.

On the restored final test source and recorded runtime, run:

```sh
EDITOR_CHROME_PATH=/tmp/rector-chrome/opt/google/chrome/chrome \
EDITOR_PLAYWRIGHT_PATH=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs \
node scripts/parity/basic-mark-tools.mjs

EDITOR_CHROME_PATH=/tmp/rector-chrome/opt/google/chrome/chrome \
EDITOR_NATIVE_PAGE=native-tools.html EDITOR_NATIVE_FILTER='basic mark action ' \
node tests/browser/physical-history.mjs

npm run typecheck

python scripts/parity/checkpoints/2026-10-30/basic-mark-tools/recheck.py \
  --repo /workspace/scratch/2231de9d6b0d/work-basic-tools-seventh \
  --output /tmp/basic-mark-tools-recheck.json
```

The comparison exit 1 is expected while the preserved historical failures remain; candidate failures are never excused. The native filter must execute exactly 96 scenarios. The audit can run from the retained checkpoint after integration and reconstructs the unpublished source commits into temporary storage.

This proof concerns the three named actions in the recorded Chrome environment. It explicitly installs valid DOM selections and makes no physical mouse-drag claim. It does not accept other tools, full inline-widget feature lifecycles, other browsers or whole-library functional parity. No full repository matrix was run for this bounded addition.
