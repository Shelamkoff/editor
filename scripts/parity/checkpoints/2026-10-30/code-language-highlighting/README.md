# Code explicit-language highlighting continuation — 2026-10-30

## Result and intended behavior

An imported explicit language that the configured highlighter does not recognize now keeps the Code block as literal text. The language identifier remains canonical and visible in the selector. Explicit supported languages and `auto` retain their highlighting.

This follows the current `plugins/code/README.md` contract (Data and Configuration) and the `BLOCK_CODE_LANGUAGE` preservation obligation: an unknown explicit identifier falls back to escaped plain text. The fix is not based on reproducing v1 behavior indiscriminately. Automatic detection remains useful when the author has actually selected `auto`; applying it to an explicit unknown identifier changes that choice. The existing shared highlighter used by renderer/inline output is unchanged, along with its separately tested automatic-detection behavior.

The production change is confined to `plugins/code/index.js`: resolve a non-`auto` language first and keep literal text if unsupported. There is no new provider API, state owner, compatibility path or lifetime manager.

## Sources

| Role | Immutable source |
| --- | --- |
| Pinned v1 | `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340` |
| Specification baseline | `e981ff308000c1d92d7e820df95113c1e19bcee8` |
| Pre-fix continuation | `b856d85e13848d7129fb3f2ad96fd8cb9e2b7d13` |
| Production fix plus native regressions | `9b7f6989e1740d0d21bbcbc76800631aeb57df07` |
| Final isolated source and differential fixture | `e37d0195ffef700de03a36665af94be586e4ba9e` |
| Final isolated tree | `c3248d67c628968d20245ec44cf7f2813b28d573` |

Production bytes are unchanged between the fix and the final isolated source. A later integration cherry-pick may have a different commit and tree because it also contains other work; it is not asserted to be the isolated tested source. Four full-index patches and `manifest.json` reconstruct the RED fixture, production/native commit, initial comparison fixture and final isolated tree from the reachable pre-fix source. Each patch was independently applied using a fresh temporary Git index, and `write-tree` matched its recorded tree. This reconstructs file content, not the original commit metadata.

## Executed checks

| Check | Outcome |
| --- | --- |
| RED on unchanged pre-fix production | Unknown-language test fails because guessed highlight markup appears; `auto` and supported explicit controls both pass |
| GREEN after the small language dispatch fix | 3/3 native cases pass |
| All Code cases selected from native-plugin-parity | 14/14 pass on final isolated source |
| Existing Code conversion, paste, lifecycle and shared highlighter unit contracts | 13/13 pass on final isolated source |
| Both source typecheck projects | Pass on final isolated source |
| Four-source native differential | All cases complete without page/server/runtime errors; raw exit code **1** retains historical failures |

The three new registered native cases use real browser input and independent keyboard Undo/Redo. They check the exact literal source including HTML-like text/entities, provider selection, preserved language, visible highlight output, and the absence of extra history. The unknown-language case also checks both mode transitions. The broader existing Code group includes actual clipboard Copy/paste, language-menu filtering/keyboard selection, indentation, multiline selection, conversion, editing controls and native history.

The final differential uses the same fixed source, compatible injected highlighter and native insertion/Undo/Redo for three language choices. It loads product modules from the stated Git objects without rewriting them. Test adapters change only factory/class spelling, document/data-version spelling and the v1 language-label selector.

| Source | Cases / observations | Raw failures | Meaning |
| --- | --- | --- | --- |
| v1 | 3 / 186 | 8 | Six historical caret offsets after Undo/Redo; two retained input handlers invoke the highlighter after disposal |
| Specification baseline | 3 / 186 | 12 | Unknown explicit language is auto-highlighted in all six observed phases |
| Pre-fix continuation | 3 / 186 | 12 | Same unknown-language defect |
| Candidate | 3 / 186 | 0 | All required properties pass, with no exceptions or incomplete phases |

The initial differential mistakenly queried the current language-label class in v1. Its 18 label failures were fixture defects, corrected to the actual `.oe-code-lang` selector. That run and its exact source patch remain archived separately. Only the final raw run supplies the product comparison above. Existing improvements in caret replay and retirement are retained; historical v1 failures do not become candidate expectations.

Independent archive verification recalculated all **744** verdicts, checked **377** served source-module hash records and **6** dependency-file hashes, and verified the runner/fixture hashes. `artifact-hashes.json` covers both compressed and decoded bytes of all 18 retained artifacts. The browser was Chrome `156.0.8078.79`, Linux x64, Node `v24.22.1`.

## Reproduction

With the recorded source/dependencies and a configured Chrome/Chromium executable:

```sh
EDITOR_NATIVE_PAGE=native-plugin-parity.html EDITOR_NATIVE_FILTER='Code ' node tests/browser/physical-history.mjs
node --test plugins/code/*.test.js shared/highlightRuntime.test.js
npm run typecheck
node scripts/parity/code-language-highlighting.mjs
```

The differential additionally accepts `EDITOR_PLAYWRIGHT_PATH` and `EDITOR_DEPENDENCIES_ROOT`. It requires a clean committed fixture and records the candidate commit before/after, served module/dependency hashes, environment and complete raw observations. Its nonzero exit code is deliberate when any historical source differs; `candidatePass` is reported separately and does not hide those differences.

## Scope and separate peer review

This is bounded evidence for explicit-language fallback and its native editing/history controls. It does not accept the complete `BLOCK_CODE_LANGUAGE` or `BLOCK_CODE_HIGHLIGHT_COPY` rows. Delayed/failed highlighting, all copy outcomes, renderer/iframe behavior and platform breadth retain their separate obligations. No new preservation row is accepted here.

A separate independent real-browser review of the tool agent's formatting-host changes is retained as `tool-host-review.json.gz` and `review-tool-hosts.mjs.gz`. Its seven controls pass: cross-block authored text excludes nested/locked/control/widget content; subtree clipping is preserved; a nested host selected independently still owns its own CaseTransform/ClearFormatting operation; surrounding outer text is unchanged. The four inspected production-file hashes were unchanged during that run and no page error occurred. This review is not added to the Code test or acceptance totals.
