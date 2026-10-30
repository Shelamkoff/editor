# Link formatting ownership — 2026-10-30

Implementation and test source: `bd9fa8a5f3457e7fa8d318ea920927bb11d45e96`, tree
`0aecc3f777e08349531741816ff056f6f92407f9`. Baseline before the repair:
`355577fc` on `refactor/rector-v2-architecture`.

## Reproduced defect and bounded repair

Link detected anchors belonging to locked content, native controls and plugin
chrome as authored links. A selected interval spanning two ordinary paragraphs
could therefore remove a control's link instead of opening the author Link
panel. Unlink also removed a shared hyperlink from protected descendants.

The repair discovers links through selected authored text and line breaks,
bounded to their editing hosts. Ordinary partial selection retains the existing
whole-link unlink behavior. A link shared with protected descendants is split
through the existing wrapper-isolation helper: author content is unlinked;
protected nodes retain their hyperlink, target and markup. No editor core,
bookmark protocol, public API or author schema changes.

## Actual candidate results

| Check | Result |
| --- | --- |
| Initial direct-tool real-DOM RED | Three failures and one passing ordinary-link control |
| Expanded RED, old Link source plus the eight new tests | Six intended failures and two positive controls |
| New focused fixture on committed source | 8/8 PASS: six direct-tool DOM controls, two native editor cases |
| Complete `native-tools.html` on unchanged committed source | 100/100 PASS; exit 0 |
| Both source typecheck configurations | PASS; exit 0 |
| `node --test inline-tools/*.test.js` | 18/18 PASS; no failures or skips |

The full native-tools run began at `2026-10-30T14:43:11.519591+00:00` and finished
at `2026-10-30T14:44:07.105249+00:00` (55.586 seconds). Its manifest confirms the
same commit/tree before and after, with no tracked source changes. Browser:
Chrome `156.0.8078.79`; Node `v24.22.1`; Linux. The worktree used the installed
dependency directory shared with the current integration checkout.

The two new native cases use the public editor and a Paragraph definition with
control-owned links outside its editable field. A backward native cross-block
drag is followed by either opening the Link panel, entering a URL and pressing
Enter, or clicking Unlink on existing authored links. They assert exact author
records, protected anchor identities/targets, directed selection and one native
keyboard Undo/Redo action. No focus repair is inserted before history shortcuts.
Six direct-tool cases exercise locked content, buttons, `role=button`, inline
widget markers, shared link wrappers, partial selection and line breaks using
the actual browser DOM. Their test mount port is deliberately minimal; those
six cases make no claim about selection authority or history internals.

## Exact-source historical comparison

`scripts/parity/link-owned-formatting.mjs` serves every loaded production module
directly from its pinned Git object, without transforming production code. It
records all loaded file hashes, the runner hash and current shared dependency
hashes. The test-only mount-port adaptation handles the public v2 port; v1 uses
its original direct tool API. It does not substitute expected data or normalize
away markup, node identity, target or line-break differences.

| Source | Cases | Observations | Raw failures | Execution/page/server errors |
| --- | ---: | ---: | ---: | ---: |
| v1 `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340` | 6 | 48 | 10 | 0 |
| Specification baseline `e981ff308000c1d92d7e820df95113c1e19bcee8` | 6 | 48 | 10 | 0 |
| Candidate `bd9fa8a5` | 6 | 48 | 0 | 0 |

All cases complete. Both references preserve ordinary partial whole-link
unlinking and authored line breaks. Their failures are the erroneous active
state, removed control-owned anchor nodes/markup and lost shared targets.
v1 additionally removes the inline-widget-owned anchor; the specification
baseline had already protected that particular owner. These are historical
control-ownership defects, not capabilities the candidate is required to retain.
The raw comparison exits **1** because it retains those reference failures;
there is no automatic exemption classifier and no candidate exception.

This comparison proves direct tool DOM ownership only. It does not execute a
historical native editor, certify historical caret/history behavior, establish
every Link action/target/platform combination, or accept the whole
`TOOL_LINK_ACTION` preservation row. The preservation register is unchanged.

## Reproduction

Use Node satisfying the package engine, installed package dependencies and a
local Chromium executable. The exact Chrome path below is environment-specific.

```sh
EDITOR_CHROME_PATH=/tmp/rector-chrome/opt/google/chrome/chrome \
EDITOR_NATIVE_PAGE=native-link-owned-formatting.html \
node tests/browser/physical-history.mjs

EDITOR_CHROME_PATH=/tmp/rector-chrome/opt/google/chrome/chrome \
EDITOR_NATIVE_PAGE=native-tools.html \
node tests/browser/physical-history.mjs

npm run typecheck
node --test inline-tools/*.test.js

EDITOR_CHROME_PATH=/tmp/rector-chrome/opt/google/chrome/chrome \
EDITOR_PLAYWRIGHT_PATH=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs \
EDITOR_CANDIDATE_SHA=bd9fa8a5f3457e7fa8d318ea920927bb11d45e96 \
node scripts/parity/link-owned-formatting.mjs
```

The native cases are also imported by the existing native-tools suite, so the
normal full browser gate includes them. The standalone native page provides a
bounded reproduction. All archived logs are gzip-compressed; `manifest.json`
records compressed and decoded SHA-256 hashes and decoded lengths. Failed
exploratory environment invocations are not counted as RED or product failures.
