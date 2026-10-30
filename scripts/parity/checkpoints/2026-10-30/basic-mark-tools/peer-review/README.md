# Independent review of basic mark actions

Root reviewed the fixed corpus, public producer wrapping, trusted input bridge, lifecycle controls, exact history sequences and immutable-source runner independently of the author. The review supports acceptance of only `TOOL_BOLD_ACTION`, `TOOL_ITALIC_ACTION` and `TOOL_STRIKETHROUGH_ACTION`, subject to the parent integration checks. No production change is part of this scope.

`review.py` imports no fixture or production helper. It builds literal text, per-character marks, style/link meaning and atom inventories independently, applies the intended operation only within the fixed logical range, and compares recorded canonical and live values. The audit checks all 96 cases, all raw historical verdicts, complete phase order, supported current execution, no-op Redo preservation, one producer/action, separate input/action history, retirement and widget identity. It passes 14,443 checks, including all 12,939 raw actual-versus-expected verdicts. The root also reran the author's separate source/dependency/tree reconstruction audit; its result is retained as `author-audit-rerun.json` and is not relabeled as a separately authored audit.

The exclusion of Mention's inter-version internal editing-mode attribute is appropriate to this TOOL scope: the final proof still checks every widget root attribute unchanged within each action. The 45 actual historical Color-dot losses remain failures. All six historical unavailable atomic toolbar actions remain incomplete with their errors. The native success, actual historical-comparison exit 1 and precise candidate source are retained in the parent checkpoint.

Limitations remain: the recorded Chrome runtime, explicitly installed DOM selections, and the three named tools. This does not establish full Color/Mention behavior, physical drag selection or whole-library parity.

Run from any checkout containing this checkpoint:

```sh
python scripts/parity/checkpoints/2026-10-30/basic-mark-tools/peer-review/review.py \
  scripts/parity/checkpoints/2026-10-30/basic-mark-tools \
  /tmp/basic-mark-peer-review.json
```
