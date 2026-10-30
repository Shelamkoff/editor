# Parity runner reporting repair — 2026-10-30

## Outcome

Commit `67bb364d01ff3939ff3f7724df087211643efce7`, tree `117dc71c90108b5605c25a8907d41b90c649914a`, changes only the four new parity runners over `24cc569c2fdcb3f115417ae895a01084858cdf67`. Production, fixtures, historical checkpoints and their verdicts are unchanged. The working tree is clean.

This is an evidence-reporting repair, not a new product parity claim. No new framework or shared runtime abstraction was introduced. The runner diff is 35 additions / 16 deletions.

## Real empty-filter CLI RED and GREEN

Every CLI invocation uses the actual local Chrome/Playwright and the runner's committed source/fixture identity checks. `__no_matching_reporting_case__` is selected through each existing filter variable. Raw stdout/stderr, process exits, timestamps and hashes are retained in the corresponding stage directory.

| Runner | Base result | Fixed result |
| --- | --- | --- |
| Columns | zero cases, candidatePass false, **exit 0** | zero cases, candidatePass false, **exit 1** |
| Heading/List | zero cases, candidatePass **true**, **exit 0** | zero cases, candidatePass false, **exit 1** |
| Raw | **exit 1** with an uncaught no-cases exception, no JSON report | zero cases, candidatePass false, **exit 1**, structured JSON report |

Tools has no filter interface; no new filter API was invented. Its existing nonempty-case guard is tested in the deterministic result probes. Raw's original CLI was already fail-closed; it is not described as a false-green CLI. The initial report-stage-only Raw probe shows a latent vacuous-success gate behind that earlier exception.

## What changed

- Columns and Heading/List reject empty source result sets, unsupported current cases, server errors and incomplete phase/observation evidence consistently in both candidatePass and process exit. Their runners attach the expected phase sequence from each selected specification and compare exact completed order. Legacy unsupported surfaces remain explicit and are not converted into failures or fabricated passes.
- Raw now emits the normal structured failed report for an empty filter. Its final gate also rejects missing candidate results, unsupported current cases, empty observations and empty phase plans.
- Tools requires a real candidate row, nonempty observations and phase plans, exact phase ordering, and no unsupported current observations. Existing page/input/diagnostic/case error checks remain active.
- A candidate success can coexist with a nonzero differential exit when historical implementations have real failures. Those old outcomes are unchanged.

## Deterministic negative controls

`green-gates/gate-probes.json` contains **62/62 PASS** on exact source `67bb364d`. The probe executes the actual aggregation and final report blocks extracted from the recorded runner Git objects; it does not reproduce their decision logic in a separate implementation. Only import.meta's metadata URL is supplied to the isolated execution context. Each runner/block hash is retained.

Inputs cover a valid complete result, an empty candidate, an empty historical source, server error, page error, native bridge failure, case exception, unsupported current behavior, missing observations, a missing phase, an incorrect phase with unchanged phase count, an empty plan, missing candidate, explicit historical unavailability and historical FAIL. Text also checks per-case page errors, and Tools checks diagnostics. Positive and historical controls prevent a blanket always-failing fix from passing.

These are deterministic reporting checks, not browser coverage. Any exception from the tested block is recorded as an error and does not count as successful rejection. Original RED gate outcomes are in `red-gates`; they are not claims that every synthetic malformed state was reachable through the original full CLI. In particular, missing-candidate exceptions would terminate a real process, and Raw previously rejected its empty filter before entering the report block.

## Real positive controls on the fixed source

| Runner | Filter | Candidate cases | Candidate observations | Candidate raw FAIL |
| --- | --- | ---: | ---: | ---: |
| Columns | direct/empty-removed | 1 | 252 | 0 |
| Heading/List | LIST_STYLE/unordered/ordered | 1 | 120 | 0 |
| Raw | RAW_SOURCE/tab-caret | 1 | 67 | 0 |
| Tools | existing complete bounded tool-action corpus | 48 | 2,072 | 0 |

All four candidatePass values are true; page/server/native-input/case error channels for the candidate are empty. Every raw differential process still exits **1**: v1 failures are respectively 5, 4, 4 and 278, and Tools additionally retains 258 specification-baseline failures and four historical unavailable atomic-only action cases. These are regression controls for the reporting change, not additive new acceptance coverage.

No repository-wide matrix was run. The parent owns final combined integration and publication. Scripts and exact patch/commit metadata are retained under `reproduce/` and `source.json`. The helper scripts retain the session's explicit worktree/dependency paths; `red`, `green` and `positive` are their selected stages. One sandboxed Node child-process attempt reported EPERM before probe execution and was repeated through the required escalated execution path; see `preparation.json`.
