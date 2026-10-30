# Independent peer review: CaseTransform and ClearFormatting actions

## Recommendation

Accept the two detailed preservation rows `TOOL_CASETRANSFORM_ACTION` and `TOOL_CLEARFORMATTING_ACTION` after the parent completes its integration checks, within the recorded Chrome 156 supported author-text scope. The reviewed final source is `9cb70473c9793623632e1018144e490ca2cc73d7`. Production files are unchanged from `69c8425e0081fde69cf5176ccb73d032720c15fc`; this slice adds verification rather than a runtime repair.

This review was performed by a separate agent. It inspected the fixture and runner, independently verified immutable Git/dependency hashes, recomputed every recorded verdict and reconstructed the candidate's text, marks, logical selection, transaction sequence, canonical history and live-projection expectations. It did not rerun a browser suite or modify the reviewed repository.

## Findings addressed before the final freeze

1. **Live projection was missing from parts of the original oracle.** The first fixture compared `editor.save()` after actions and history, which could miss stale visible marks or a missing projected widget when canonical data survived. The final fixture independently walks real field DOM in every relevant load/input/action/replay phase. A real `[data-inline-plugin]` is an atomic placeholder before the walker reaches its owned markup. Each field also has a fixed expected widget inventory: ID, type, value, label, color dot and noneditable status. The original live node/child identity and exact markup checks on Apply remain.
2. **Earlier observations aliased a mutable transaction array.** At source `9199bb27`, six raw records retained `status: PASS` while their `actual` array had later acquired commit/undo/redo events and no longer matched the recorded empty expectation. `observation-alias-finding.json` retains all six contradictions and the exact raw SHA-256. This was an evidence-capture defect, not a production defect. The final fixture snapshots both sides through one JSON helper at check time, and its regression also compares the saved values independently of the stored verdict. The final raw report has zero verdict contradictions.

The recorded failed audit log for `9199bb27` is retained as the evidence check's RED result. Only the `9cb70473` raw report is accepted by this review.

## TOOL template coverage

| Obligation | Evidence reviewed |
|---|---|
| Named operation through its actual UI | Trusted native clicks on ClearFormatting or CaseTransform; current tool producer count and public transaction records |
| Forward/backward, Text/Element endpoints | Complete direction/boundary combinations in one Paragraph, two Paragraph blocks and Quote text/caption |
| Mixed and partial existing marks | Partial bold endpoints, nested bold/italic/strike/code/highlight/sup/sub, strong/em aliases, font-size/color/background spans, retained links and BR |
| Intended case transformation | Mixed-to-upper and upper-to-lower, `ß → SS`, `İ → i̇`, contextual Greek sigma across a formatting-node boundary, preserved unselected prefix/suffix |
| Atomic widgets | Actual Color widget inside author selections; fixed sidecar, live identity on Apply, visible payload throughout replay; separate atomic-only no-op selections |
| One action and exact replay | Independent native `X`, one formatting commit, two separate native Undo steps and two Redo steps; independent audit checks names and origins as well as action counts |
| Canonical no-op | Uncased selected text for CaseTransform, unformatted text/link for ClearFormatting, and atomic-only ranges; existing Redo branch survives and replays exactly |
| Selection | Independently reconstructed UTF-16 offsets, field ownership and direction after Apply, Undo action and Redo action, including width-changing case mappings |
| Inactive/retired UI | Read-only suppression; retained button after destroy tested while a fresh editable successor with the same block ID owns a valid selection; old producer stays silent and the new live action still works |

The corpus contains 36 positive action cases, eight no-op cases and four lifetime cases: 30 CaseTransform cases and 18 ClearFormatting cases. Read-only is a suspension control; destroy is the permanent-retirement control. Explicit DOM selections establish valid ranges; this evidence makes no physical-drag claim.

## Independent audit result

`review-9cb70473.json` and its log record PASS:

- **5,930 raw verdicts** recomputed from saved values, with zero contradictions.
- **1,224 candidate oracle checks** rebuilt independently from fixed author strings/marks, per-field offsets, exact public transaction names/origins and canonical histories. This includes the added live DOM and widget inventory checks.
- **334 source-file hashes**, **seven loaded dependency-file hashes** and **eight dependency versions** verified.
- All 48 expected case IDs and specs checked in each source. Planned and completed phase order is verified exactly, rather than by length alone.
- Candidate: **48 complete cases / 2,072 observations / zero failed observations**, no unsupported properties.
- Spec baseline: **48 complete cases / 2,072 observations / 258 historical failed observations**.
- v1: **44 complete cases plus four atomic-only toolbar cases unavailable / 1,786 observations / 278 historical failed observations**. The absent v2 transaction/producer-observation contract is also explicitly recorded. Unknown phases are not counted as passes.
- Page, native-input and server error channels are empty; all case diagnostic arrays are empty. The four v1 atomic-only unavailable-UI errors and incomplete phase lists remain explicit in the raw report. The runner does not collect a separate console-message channel, and this review makes no claim about such logs.

All input and initial canonical-meaning controls passed across the three sources. The v1/spec failures remain raw failures; improved current behavior is preserved. This review does not infer full historical equality, other-browser parity, another inline-plugin's complete UI behavior, or a new policy for formatting around protected widget ancestors. The same existing protected-host semantics remain in production.

Final raw report SHA-256: `243d1b71b549e49ade94e6c3c9037eadb1e638c852c9120e2339ea9fcbfc9feb`.

## Reproduction

The parent checkpoint retains the final raw report and the immutable source material. This directory retains the separate audit implementation, its accepted output, the earlier contradictory-observation finding and both audit logs. `artifact-hashes.json` covers all other files here.

```sh
python /workspace/scratch/2231de9d6b0d/tool-actions-peer-review/review.py \
  --repo /workspace/scratch/2231de9d6b0d/work-tools-sixth \
  --raw /workspace/scratch/2231de9d6b0d/work-tools-sixth/test-results/tool-actions-sixth/verified-actions-differential.json \
  --output /tmp/tool-actions-independent-review.json
```

Use the corresponding restored Git objects and pinned installed dependency files when replaying in another checkout. The audit is read-only with respect to the repository and writes only its requested output file.
