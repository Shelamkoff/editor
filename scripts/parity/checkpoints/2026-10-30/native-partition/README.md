# Native page capacity and exact scenario preservation — 2026-10-30

The expanded native plugin page registered 444 scenarios and exceeded its existing
120-second page deadline. This checkpoint moves five existing regression imports
into four capability pages. The original scenarios, fixtures, assertions, production
code, native input bridge and deadline remain unchanged.

## Cause and original failure

The immutable original source is `8e22c752a1712c0a8c3908f59fe65a2d25e1db1b`.
`run-ph5JBn` recorded an actual native-browser exit **1** at the plugin page's
`waitForHistoryMatrix`. Its console contains 25 passing prefix groups. The other
11 gates passed. The complete original manifest and native logs are retained in
`original-timeout/`; the failed native gate remains a failed gate. Its 811,846 ms
duration is the whole native invocation through the failing page, not the duration
of that page alone.

The independent peer executed the original 444 cases in their original single-page
scope with one diagnostic-only change: the deadline was 360 seconds for that run.
All 444 passed, actual exit 0. Navigation to receipt of the completion line took
198,717.886 ms; the whole subprocess took 204,404.232 ms. A passive browser clock
recorded the navigation time origin. These observations establish a page capacity
problem without a hidden permanent stall. They do not replace the failed shipping
run, and the shipping deadline remains 120 seconds.

That diagnostic, its exact deadline overlay and timing definition are owned by
`peer-review/diagnostic/`. `summary.json` pins the diagnostic process record's hash.
The author archive does not duplicate the peer's observations or claim to have
independently executed that diagnostic.

## Source identities and changes

| Role | Immutable commit |
| --- | --- |
| Original failed full-suite source | `8e22c752a1712c0a8c3908f59fe65a2d25e1db1b` |
| Harness task base, same runtime and fixtures | `cd446e5866d09881011176d881278fff6449c6ef` |
| Successful intermediate four-page partition | `8e626f6f9332a887c4b8de8894cdd702c9cc4707` |
| Final five-page implementation | `d06547af677fc55152bd2d6e3f0df9b941eeb159` |

The first implementation removes the Code, Person and Table regression imports
from `native-plugin-parity.js`, gives each module its own page and registers all
three pages in the full physical runner and final aggregate. Every new HTML shell
has the original styles, native driver and markup, changing only the title and
entry point. The first change touches nine paths, including the browser README.

The remaining 366 cases passed, but their complete subprocess took 121.342 seconds.
Although the page itself passed the 120-second deadline, this left a weak observed
margin. The second implementation moves exactly two more imports,
`text-block-settings-native.js` and `columns-layout-native.js`, into
`native-block-settings.html` / `.js`. It adds the `nativeBlockSettings` full-run
call and aggregate field and updates the README. This second change touches five
paths. The combined harness change touches exactly eleven paths.

`source/pins.json` records those path inventories and every source identity. The
four commits between the original failed source and the harness base affect only
documentation and existing checkpoint evidence. `source/commits/` and
`source/patches/` preserve raw commit objects and full-index binary patches for
the complete six-commit chain from the original failed source to the final
implementation. The audit reconstructs all six exact trees and SHA identities in
a temporary object store. The separate source manifest checks 655 production,
regression, driver, helper and configuration files byte for byte across all four
source pins.

## Actual execution outcomes

Every native invocation below used the unchanged **120,000 ms per-page deadline**,
the existing physical runner and no case filter. All metadata has actual process
exit 0, empty stderr, unchanged source identity and unchanged source hashes.

| Phase and executed source | Page | Cases passed | Whole subprocess time |
| --- | --- | ---: | ---: |
| Intermediate `8e626f6f` | `native-plugin-parity.html` | 366 | 121.342 s |
| Intermediate `8e626f6f` | `native-code-source-language.html` | 20 | 52.201 s |
| Intermediate `8e626f6f` | `native-person-modes.html` | 28 | 28.967 s |
| Intermediate `8e626f6f` | `native-table-keyboard.html` | 30 | 22.470 s |
| Final `d06547af` | `native-plugin-parity.html` | 333 | 89.603 s |
| Final `d06547af` | `native-block-settings.html` | 33 | 37.246 s |

These times include Vite/Chrome startup and cleanup. They are not isolated page
timings. The final remaining-page process completes about 30 seconds below the
page budget even with that additional overhead; this is an observed margin on
this runtime, not a guarantee for every machine.

Code's 20, Person's 28 and Table's 30 cases were executed on the intermediate
source and retained through exact source equivalence. They are **not** relabelled
as executions on `d06547af`. The second change leaves all six HTML/entry files,
their regression modules and all production/runtime files unchanged. The shared
physical runner differs only by the additional settings call and aggregate field
in its full-run branch. Its selected-page path, filtering, failure propagation,
native bridge and deadline are byte-identical. A complete native suite invocation
on the final source is recorded separately by the parent integration task; this
checkpoint does not promote these scoped results into a full-suite result.

## Exact inventory proof

The registration-only probe loads the real modules and records their real
`test(name, callback)` registrations. It inserts an early return into `run()`
after collecting names. **No scenario callbacks execute in that probe, and no
test passes are fabricated.** The original entry and harness are read from the
pinned base. The exact probe source and instrumentation hashes are archived.

Both the successful intermediate partition and the final partition have the
original 444-name multiset, with zero duplicates or omissions. The final split is:

| Page | Registered and executed scenario inventory |
| --- | ---: |
| `native-plugin-parity.html` | 333 |
| `native-block-settings.html` | 33 |
| `native-code-source-language.html` | 20 |
| `native-person-modes.html` | 28 |
| `native-table-keyboard.html` | 30 |
| Total unique names | **444** |

The audit compares every page's actual execution names and order to its real
registration inventory, and compares the union against the complete original
names. Full stdout JSON, stderr and process metadata remain in
`intermediate-four/` and `final-five/`. The peer also compares this union against
the actual original monolithic diagnostic results.

## Worktree and dependencies

The isolated worktree's tracked source was clean before and after every native
process. It had an untracked dependency-only `node_modules` symlink targeting the
existing main-worktree dependencies. It was left in place during all executions.
The worktree therefore was **not wholly clean**. Intermediate metadata explicitly
claims only tracked cleanliness; final metadata also records the actual short git
status and symlink state at each process boundary. `dependency-state.json` records
the final observation and its historical limits. This dependency arrangement does
not modify the immutable tracked source. The parent's full-suite worktree has its
own ignored dependency directory and separate Vite cache.

## Recheck and reproduction

Run the artifact audit from the repository containing the original failed source
object and this checkpoint:

```sh
python scripts/parity/checkpoints/2026-10-30/native-partition/review.py
```

It validates stored and decoded hashes, source reconstruction, exact import and
runner edits, untouched runtime/fixtures, actual process exits, every recorded
case verdict, actual scenario names, multiplicity and execution-source mappings.
It does not run Chrome. `review.json` records the successful audit output.
`artifact-hashes.json` indexes all author files except itself and the separately
owned `peer-review/` directory.

To execute a particular final page using the existing harness, use a checkout of
the final implementation with the project's dependencies and set the Chrome path:

```sh
EDITOR_CHROME_PATH=/path/to/chrome EDITOR_NATIVE_PAGE=native-plugin-parity.html node tests/browser/physical-history.mjs
EDITOR_CHROME_PATH=/path/to/chrome EDITOR_NATIVE_PAGE=native-block-settings.html node tests/browser/physical-history.mjs
EDITOR_CHROME_PATH=/path/to/chrome EDITOR_NATIVE_PAGE=native-code-source-language.html node tests/browser/physical-history.mjs
EDITOR_CHROME_PATH=/path/to/chrome EDITOR_NATIVE_PAGE=native-person-modes.html node tests/browser/physical-history.mjs
EDITOR_CHROME_PATH=/path/to/chrome EDITOR_NATIVE_PAGE=native-table-keyboard.html node tests/browser/physical-history.mjs
```

For the complete native runner, omit `EDITOR_NATIVE_PAGE`. The preserved process
supervisors additionally record durable process outcomes and source hashes;
their original workspace paths and source assertions are retained verbatim.
