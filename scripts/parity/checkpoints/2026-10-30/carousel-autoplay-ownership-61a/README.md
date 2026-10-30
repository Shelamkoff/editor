# Carousel autoplay preserves the current block owner

This bounded TDD repair starts from combined source
`eae1b93ee6bc39a32230de1b46c67f27b39c8015` and is tested on
`e2b75c59fdf1bc019e35f514ca0dbf7571710c02`. It does not accept an additional
preservation-register row or claim a complete Carousel feature comparison.

## Observed defect and repair

A real pending autoplay timer continued through `activate()` and `project()`
after the entire Carousel wrapper or block shell had been adopted into another
DOM owner. Canonical data and history stayed unchanged, but the callback
replaced the foreign owner's children and caption.

The five-line repair clears the fired timer handle, checks the existing
instance lifetime, and calls the existing guarded `context.getData()` before
the deferred presentation can write. A rejected original block owner stops
the timer without scheduling another callback. It adds no owner registry,
ancestor search, token, public API or canonical transaction. Immediate
navigation and projection retain their existing routes.

The independent Code/Poll agent reviewed the production diff and surrounding
timer/activation/projection/destroy paths, together with all four public-editor
controls, and found no blocking issue. The guard is scoped to whole wrapper or
shell adoption; this checkpoint makes no claim about arbitrary partial-child
transfers or unrelated caption-state behavior.

## Executed RED and GREEN

| Source / C11 run | Result |
| --- | --- |
| `116dcb4e` / `run-x3gaSD` | Projection page: 204 PASS / two intended FAIL out of 206 |
| `e2b75c59` / `run-Q12Bgv` | Same projection page: 206/206 PASS |
| `e2b75c59` / `run-Q12Bgv` | Existing Carousel lifecycle units: 2/2 PASS |
| `e2b75c59` / `run-Q12Bgv` | Both source checkJs configurations: PASS |

All recorded gates use clean source snapshots and report
`sourceUnchanged: true`. The two RED failures are exactly the foreign wrapper
and shell repaint assertions; document/history checks precede those failures.
Current editable and read-only autoplay controls already pass before repair,
and still advance the visible counter, image and formatted caption without an
author action afterwards. The negative controls additionally retain exact
child-node identities and wait through a later interval to reject rescheduling.
They use actual browser timers, not synthetic invocation of a private callback.

The browser runner's console failure formatter truncates long DOM diffs. Its
complete `browser-projection-contracts.html.json` is therefore retained as well
as stdout, the original manifests and wrapper logs. No failed outcome was
rewritten. `verification.json` contains compressed/uncompressed hashes,
original paths, tested source/tree and three changed source-file hashes.

The environment is Node 24.22.1, Chrome for Testing 156.0.8078.47, and an
independent physical copy of the current locked dependencies. Final combined
native and whole-library checks are recorded separately.
