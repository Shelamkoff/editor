# Reproducible comparative audit

`Rector v2 comparative audit` supplements the seven `Verify library` jobs. It runs
on pushes to `fix/rector-v2-audit-2026-11-06` and can also be dispatched manually.
It does not reduce the ordinary browser or 159-page native inventory.

The workflow checks out the exact commit with full history, requires a clean
source tree, installs the locked package dependencies and builds the package.
Playwright 1.62.1 and its matching Chromium 151 runtime are installed separately
from the checkout. The runtime setup records executable and browser descriptor
identities in the current run's results.

## All 100 comparative corpora

`run-corpora.py` reads the maintained 100-file registry from
`scripts/parity/checkpoints/2026-11-05/audit-completion/execution.tar.gz`. That
archive supplies the inventory, not successful results. Every registered script
runs freshly, sequentially, without inherited selection filters or retries.
Individual failures do not suppress the remaining registered scripts.

Full Git history is required. The committed `restore-reference.py` additionally
reconstructs an unavailable historical comparison commit from its archived patch
and raw commit. It verifies the patch hash, exact resulting tree and commit hash
using a temporary index. A missing or mismatched object fails the preflight; no
alternative baseline is selected.

Use separate empty result directories for preflight and execution:

```sh
python3 -B scripts/parity/checkpoints/2026-11-05/audit-completion/restore-reference.py
python3 -B scripts/audit/run-corpora.py --out test-results/corpora-preflight \
  --head "$(git rev-parse HEAD)" --chrome "$EDITOR_CHROME_PATH" \
  --playwright "$EDITOR_PLAYWRIGHT_PATH" --preflight-only
python3 -B scripts/audit/run-corpora.py --out test-results/corpora \
  --head "$(git rev-parse HEAD)" --chrome "$EDITOR_CHROME_PATH" \
  --playwright "$EDITOR_PLAYWRIGHT_PATH"
```

The repository root defaults to the checkout containing the script; `--repo` can
select another checkout. `--node`, `--chrome`, `--playwright` and `--timeout` are
explicit runtime configuration. The workflow preserves the 1,200-second budget
per corpus and gives the full job 240 minutes for setup, execution and reporting.

The manifest preserves each raw process exit, candidate verdict, independent
checker verdict, source identity and stdout/stderr hash. Exit 1 from a historical
comparison is accepted only when the current candidate passes and the existing
checker attributes the exit to historical differences or unavailability. A
failed candidate, missing report, duplicate report, unaccounted exit or changed
source remains a failure. SIGTERM stops the owned child process group and closes
the attempt as interrupted.

## Focused Chromium 151 controls

The separate focused job executes the complete navigation comparison, the
clipboard regression controls and two retained FontSize controls once. Expected
failures from the regression control remain separate from candidate outcomes.
Raw outputs and the original comparison assertions are retained. This job does
not replace either the 100-corpus run or the seven main verification jobs.

Both jobs use `verification-results.mjs` to bind commands to the current source,
record prerequisites and close interrupted attempts. Finalization and artifact
upload run even after failure. An earlier failed run remains failed; later
evidence receives a new run identity.

## Supervisor controls

```sh
python3 -B -m unittest discover -s scripts/audit -p '*_test.py' -v
```

These tests exercise the supervisor using temporary Git repositories and fake
100-script registries. They check report parsing, complete execution after
failures, historical exit attribution, selector removal, dirty-source rejection
and owned-child cleanup. They do not execute a browser or produce product
acceptance results.
