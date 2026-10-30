# Independent Person review

Root reviewed the fixed fixture and its native controls independently of the author, including public first-request acknowledgment, exact caret and backward range replay, native denied-edit attempts, retained controls after an editable return, real supported widgets and truthful historical capability gaps. The parent review supports only `BLOCK_PERSON_HIDDEN_FOCUS` and `BLOCK_PERSON_READONLY_TABS`, subject to the merged integration checks.

`review.py` contains a separate literal-record model and imports neither fixture nor production helpers. It validates all 11,329 raw actual-versus-expected verdicts and independently checks the 338 complete current snapshots, active profile, history, direct focus acknowledgment and important negative controls. It passes 12,589 checks. In particular, all six current read-only cases return to profile index 2; the next edit and history replay must remain with that profile rather than resetting to the default.

The original author's offline audit was also rerun successfully, then extended for exact source reconstruction in a temporary Git object store. This added source portability does not change its semantic oracle or the frozen browser evidence. No current production change was needed for the two Person rows.

Legacy keyed/numeric focus, persistent Person widgets and keyboard tabs remain explicitly unsupported where absent. Four real legacy public-navigation/pointer-tab cases execute separately. The specification baseline's two incomplete cases and page errors remain visible; no legacy exception applies to the current source. The scope is the recorded Chrome environment and these two capabilities, not complete cards/avatar/link handling.

```sh
python scripts/parity/checkpoints/2026-10-30/person-modes/peer-review/review.py \
  scripts/parity/checkpoints/2026-10-30/person-modes \
  /tmp/person-peer-review.json
```
