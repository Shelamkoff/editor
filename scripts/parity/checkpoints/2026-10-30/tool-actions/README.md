# CaseTransform and ClearFormatting: complete TOOL action proof

## Result and proposed acceptance

This checkpoint proposes acceptance of `TOOL_CASETRANSFORM_ACTION` and `TOOL_CLEARFORMATTING_ACTION` after the parent completes its integration checks. It adds a fixed public-editor action corpus, the existing native-harness registration and an exact-source differential runner. **Production is unchanged from base `69c8425e0081fde69cf5176ccb73d032720c15fc`.** No current production defect was found in this scope, and no historical defect was reintroduced to force equality.

The accepted final source is `9cb70473c9793623632e1018144e490ca2cc73d7`, tree `882fe5eaba43fc2fc76610be4302c965e76e38c1`. All 48 current cases complete with 2,072 passing observations in Chrome `156.0.8078.79`, Node `v24.22.1`. The same 48 cases pass through the repository's standard focused native harness. Both TypeScript configurations passed on `cef9a068`; the subsequent changes are confined to browser tests excluded from those configurations, and all production/declaration inputs are identical.

This is a new action proof. The preceding formatting-host-ownership checkpoint was a bounded ownership repair and did not accept these complete rows. Its assertions have not been relabeled as new full acceptance.

## Fixed corpus and independent oracles

| Cases | Operation and observable result |
|---|---|
| 12 ClearFormatting positive | One Paragraph, two Paragraph blocks, and the text/caption fields of one Quote; Text/Element endpoints in both directions. Clear selected ordinary formatting while keeping the partial unselected bold endpoints, links, line breaks, widget data and surrounding content. |
| 24 CaseTransform positive | The same three field arrangements and four direction/boundary combinations for mixed-to-upper and upper-to-lower. Preserve all marks, links, widgets and unselected characters. Include `ß → SS`, `İ → i̇` and contextual Greek sigma split across formatting nodes. |
| 8 canonical no-op | Each tool in both directions on suitable unchanged text and on a real atomic-only Color selection. Undo an earlier native `X` first, then prove that the no-op preserves the existing Redo branch and its exact original edit. |
| 4 lifetime controls | Each tool while read-only and after destroy. A retained destroyed button is invoked while a new editable editor with the same block ID owns a valid selection. Its old producer remains silent; the live successor button still performs one native action and exact Undo/Redo. |

The positive fixture includes nested bold, italic, strikethrough, code, highlight, superscript/subscript, strong/em aliases and a span containing font-size, color and background. Selection endpoints cut existing bold text in the Text cases and use actual Element child boundaries in the Element cases. Links and BR remain authored content. The Color widget is the actual built-in runtime, with fixed ID `swatch` and value `#aBcDef`; the mixed-case label also proves that widget presentation does not choose CaseTransform's mode.

Expected text and marks are authored as fixed strings in the fixture. A small test-only meaning reader allows equivalent strong/b and em/i spelling and CSS declaration order without calling a production tool or normalizer to derive expectations. It reads canonical output and separately walks real field DOM. A real widget is one atom before the walker can enter plugin-owned markup. Visible widget inventories check count, ID, type, stored value attribute, label, color dot and noneditable state on load/input/Apply/Undo/Redo. Apply additionally checks original widget and child-node identity and exact widget markup. Exact full canonical block records are compared on history replay.

Logical offsets are computed by an independent test reader over UTF-16 text, BR and unit-length widget atoms. Apply, Undo action and Redo action must retain field ownership, endpoints and forward/backward direction, including width-changing case mappings. The three field arrangements distinguish a single editing host, different blocks and different fields sharing one block/history owner.

Every positive action starts after a separate trusted native `X`. One toolbar click must call the named producer once and yield one completed formatting transaction. Two native Undo steps restore the typed document and then the initial document; two Redo steps restore each independently. Current public transaction records, content and history availability expose extra or coalesced actions. In the no-op cases, the tool runs once but publishes no document action and cannot clear the pre-existing Redo branch.

Read-only is a suspension control, not a permanently retired button. Destroy is the retirement control. The latter has an editable successor and a valid selection, so its negative result is not explained by read-only suppression or an accidental content no-op. Late retained-button dispatch is synthetic by design; the subsequent live toolbar operation and all history gestures are trusted native input.

## Three-source results

| Source | Complete cases | Observations | Raw FAIL observations | Unavailable execution |
|---|---:|---:|---:|---|
| v1 `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340` | 44 | 1,786 | 278 | Four valid atomic-only ranges have no visible named toolbar action. |
| Spec baseline `e981ff308000c1d92d7e820df95113c1e19bcee8` | 48 | 2,072 | 258 | None. |
| Candidate `9cb70473c9793623632e1018144e490ca2cc73d7` | 48 | 2,072 | 0 | None. |

All sources pass the fixed initial canonical-meaning and input controls. All executed initial endpoint checks pass. The same source-independent fixture is used throughout; the legacy adapter changes the documented constructor/configuration and wire-version spelling only. Native v1 Undo/Redo is executed, while the absent v2 public transaction/producer-observation contract is explicitly unsupported rather than fabricated.

The **raw differential exits 1**, retaining all 536 historical failed observations and the four unavailable v1 atomic-only cases. `candidatePass` is separately true. Page, input and server error channels are empty and all diagnostic arrays are empty; candidate case errors/incomplete phases are zero. The four v1 action-visibility errors remain in their raw cases and are not passes. The runner does not collect a separate console-message channel, so this checkpoint makes no claim about such logs.

The old results expose loss of backward selection and history fidelity, incomplete clearing of mixed formatting, widget internals disturbed by v1 clearing, case decisions influenced by widget labels and late retained UI affecting selection. These are repeated observations across the fixed matrix, not counts of distinct bugs. The current improved behavior is retained. Exact differences and their phases remain inspectable in the raw report.

## Independent review and proof repairs

A separate agent reviewed the TOOL template, fixture and runner. It requested two changes before acceptance:

1. The original corpus checked canonical saves but did not directly prove every live projection after Apply/history. The final fixture adds the independent live DOM and fixed widget-inventory checks described above.
2. The original `check()` retained mutable arrays by reference. On `9199bb27`, six raw observations said PASS after their recorded `actual` transaction array had later changed. This was an evidence-capture bug. The final shared helper snapshots actual and expected values at observation time, and the native regression compares the stored values independently of the status flag.

The peer's observation-alias finding and failed audit are retained under `peer-review/`; neither is a production RED. The final report contains zero contradictory verdicts. The peer recommends the two scoped rows after integration and reports:

- 5,930 raw verdicts recomputed from saved values;
- 1,224 candidate expectations rebuilt independently for text, marks, live DOM, widgets, logical selection, public transaction names/origins and canonical replay;
- 334 source-file hashes, seven loaded dependency files and eight dependency versions verified;
- all expected case IDs/specs and exact phase order verified, with no missing live-projection cases.

The checkpoint's separate `recheck.py` also verifies IDs/phases, all saved equality verdicts, trusted input/history traces, source/dependency hashes, the native log and all three complete source patches in temporary Git indexes. It checks provenance and recorded equality; it is not presented as the independent semantic review. The peer implementation and result are retained unchanged in their own directory and hash index.

## Preserved evidence and reproduction

`manifest.json` records sources, exact trees/raw commit bytes, scope and raw gate outcomes. `final-differential.json.gz` is the accepted raw report, with decoded SHA-256 `243d1b71b549e49ade94e6c3c9037eadb1e638c852c9120e2339ea9fcbfc9feb`. Its empty stderr, final native log, typecheck output and actual process completion records are retained separately. `runtime-hashes.json` records the Node and Chrome executable hashes, Playwright entry/manifest hashes and runtime versions. The runner records each served production/dependency file hash, dependency versions, fixture/runner/lock hashes and unchanged HEAD.

`sources/` contains full-index binary patches from the stated base to `cef9a068`, `9199bb27` and the final `9cb70473`. Each reconstructs its exact tree. Original commit bytes in the manifest permit exact source-ID recovery when a publication preserves a tree under different commit metadata.

`attempts/` retains the earlier differentials and bounded development logs. The `cef9a068` differential included a field-edge trailing separator that v1 trims; `9199bb27` uses the same separator-free field boundary for every source. Both earlier differentials retain the mutable-observation problem and are **not acceptance evidence**. Draft underline-import and lifecycle-transition comparisons failed because of invalid test preconditions: imported `u` is outside this native rich-text fixture's supported input and read-only/destroy legitimately change widget presentation. Those draft logs are not production failures, and their uncommitted test drafts are not claimed as reproducible source freezes.

Run the following on the restored final source with the pinned dependencies and browser:

```sh
EDITOR_CHROME_PATH=/tmp/rector-chrome/opt/google/chrome/chrome \
EDITOR_PLAYWRIGHT_PATH=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs \
node scripts/parity/tool-actions.mjs

EDITOR_CHROME_PATH=/tmp/rector-chrome/opt/google/chrome/chrome \
EDITOR_NATIVE_PAGE=native-tools.html EDITOR_NATIVE_FILTER='tool action ' \
node tests/browser/physical-history.mjs

python scripts/parity/checkpoints/2026-10-30/tool-actions/recheck.py \
  --repo /workspace/scratch/2231de9d6b0d/work-tools-sixth \
  --output /tmp/tool-actions-recheck.json
```

The differential's exit 1 is expected while these historical failures remain. It does not authorize an exception for candidate failures. The native filter must execute exactly 48 cases. For peer replay, decompress the accepted raw JSON and run `peer-review/review.py --repo <repo> --raw <decoded-json> --output <scratch-report>`.

The scope is the two supported author-text tool actions in the recorded Chrome environment. Explicit valid DOM selections establish the ranges; no physical-drag claim is made. This does not accept other tools, another inline-plugin's complete UI behavior, other browsers, whole-library parity or a new policy for inherited formatting around protected widget ancestors. Existing host ownership and widget protection remain unchanged.
