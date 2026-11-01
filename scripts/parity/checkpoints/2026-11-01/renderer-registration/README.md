# Renderer registration acceptance — 2026-11-01

Accepted scope: **RENDERER_REGISTRATION** only. Fresh four-source execution uses
candidate `1dd4d0a1e1ebb97da11affb78afad8be252427ae`, pinned v1 `5e5c7f8d`,
specification baseline `e981ff30` and parent `69c8425e`. All production modules
are served from their exact Git objects; fixture/dependency bytes are frozen
and hashed. Environment: Windows x64, Node 24.9.0, Chrome 156.0.8078.79, isolated
Playwright 1.64.1 (no Rector dependency change).

The unchanged fixture covers 12 registration cases / **246 observations per
source**. Every source passes: all three rendering routes, both signatures,
replacement/unregister/re-register, retained output using original disposers,
new output following the new registry, same-data mounted invalidation,
strict/placeholder behavior, unchanged caller data and exact one-time cleanup.

Nine diagnostic-failure cases stay separate. The whole raw comparison has 21
cases / 302 observations per source; failures are v1 46, baseline 42, parent 42,
candidate zero. Raw exit remains 1, with `candidatePass: true`. No historical
failure is hidden. This does not accept the complete `RENDERER_ERRORS` row.

Root reviewed the existing fixture's literal oracles and the prior independent
review in `scripts/parity/checkpoints/2026-10-30/renderer-registration-disposal/`.
The new `review.mjs` checks exact case/property inventories, recomputes all
**1,208** verdicts independently, requires zero candidate failures and verifies
**318 loaded module records and 68 dependency files** against Git/disk. All
checks pass. This is fresh execution and root review, not a claim that another
agent reviewed this run.

The candidate commits the production/test bytes exercised by preceding
`run-cLXIAC`: ten passing gates, 2,173 Node tests (three platform skips), both
typechecks, build, 42 browser pages, the named 13/169 native pages, heap,
installed package and docs. The earlier dirty-patch integration and this
immutable comparison retain separate identities. No complete native rerun is
inferred. Changes made for these dated acceptance notes are documentation and
review tooling only.

Ignored evidence: `test-results/audit-closeout-2026-11-01/renderer-lifetimes.json`,
`renderer-lifetimes.stderr.log`, `renderer-lifetimes.exit` and
`renderer-registration-review.json`.

```powershell
node scripts/parity/renderer-lifetimes.mjs
node scripts/parity/checkpoints/2026-11-01/renderer-registration/review.mjs test-results/audit-closeout-2026-11-01/renderer-lifetimes.json 1dd4d0a1
```

Configure the isolated Playwright module and installed Chrome as in the raw
command record. This acceptance moves the register to **65 accepted / 144 open**.
HTML/style, performance and all other incomplete obligations remain active.
