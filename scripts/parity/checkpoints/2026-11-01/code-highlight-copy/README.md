# Code highlight/copy acceptance — 2026-11-01

Accepted scope: **BLOCK_CODE_HIGHLIGHT_COPY**, on immutable local candidate
`40bab78db6631f7ae3b297e5c7f028f2e9f9e82a`. The same 28-case fixture executes
against v1 `5e5c7f8d`, specification baseline `e981ff30`, preceding implementation
`69c8425e` and candidate. Environment: Windows x64, Node 24.9.0, Chrome
156.0.8078.79, isolated Playwright 1.64.1; no product dependency change.

Each source completes 573 observations without runtime/server errors or missing
phases. Historical failed observations remain **21 / 4 / 2**; candidate failures
are zero. The raw command retains exit **1**, separately recording
`candidatePass: true`. No current exception or unsupported case is accepted.

The corpus includes editor and renderer default, injected and lazy providers;
delayed and failed loading; thrown providers; retirement and replacement;
readable literal source and obsolete completion guards. Trusted native copy and
paste exercise real clipboard bytes. Real Permissions-Policy denial produces
`NotAllowedError`; unavailable/rejected/empty/read-only and retired pending
controls do not author data or revive output. Two language cases are included
as shared controls; language acceptance retains its separate earlier scope.

Windows native clipboard readback represents LF as CRLF. The initial replay
retained three failed observations rather than changing the product or
relabelling the result. The final runner first independently writes/reads
the intended literal source through the browser clipboard, checks that only
newline representation differs, then writes a distinct sentinel. Actual
trusted product copy must replace that sentinel with **exactly** the independent
native reference. Native paste still must produce the original literal LF
source. Neither product readback nor paste output is normalized to pass.

The initial fixture-byte check also exposed Git checkout CRLF conversion.
Historical products and shared fixtures are now served as exact Git-object
bytes. Worktree equivalence permits only CRLF/LF conversion and records both
hashes. Other byte changes still fail before execution.

Root reviewed the literal oracles and the independent historical review in
`scripts/parity/checkpoints/2026-10-30/code-controls-completion/`. The fresh
`review.mjs` requires exact case/source inventories, recomputes all **2,292
verdicts**, verifies **628 product module records, 63 dependency files, 194
highlighter inputs** and both Git fixture hashes. It checks native reference,
distinct seed, literal paste and actual denied-copy observations. Review passes.
Four deliberate corruptions (stale PASS, missing case, runtime error and module
hash) each fail with exit 1. This is root review of a new execution, not a claim
that another agent reviewed this platform-oracle change.

Ignored evidence under `test-results/audit-closeout-2026-11-01/`:
`code-controls-platform.json`, its stderr/exit records,
`code-highlight-copy-review.json`, and `code-review-negative-*.json/.log`.
Earlier `code-controls.json` and `code-controls-final.json` remain failed attempts.

```powershell
node scripts/parity/code-controls.mjs
node scripts/parity/checkpoints/2026-11-01/code-highlight-copy/review.mjs test-results/audit-closeout-2026-11-01/code-controls-platform.json 40bab78d
```

The earlier combined integration manifest has its own patch identity; this
comparison does not imply a new full native/integration run on later Raw edits.
This bounded acceptance moves the register to **66 accepted / 143 open**.
