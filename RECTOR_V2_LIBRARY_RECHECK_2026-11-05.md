# Full library recheck — 2026-11-05

The fresh complete review after `d7a32b63` is finished. Deferred rich inline
highlighting, one-read JSON array/object shape capture and file-picker
retirement are repaired and pushed. Superior v2 behavior is preserved.

Production runtime `d8b1c4f219a8aef4c3f650d25e6e0b404fd3ed0c` is unchanged in
frozen verification source `125b3e22ffc482cbddf76e746d85e5bc0cb32e17` and the
test-only Image follow-up `8c97508830a3985b11155bc21fff8b9ccbeb59a3`. All 209
existing obligations remain accepted in the supported Chromium scope.
[Read-only review sources and exact evidence scopes](scripts/parity/checkpoints/2026-11-05/library-recheck/README.md).

## Confirmed repair: deferred rich inline code ownership

`renderer/inline.js` checked source text before delayed highlighting, but did
not bind that work to the creating output. A real highlight.js `before:highlight`
hook can dispose or replace the output and move its `<code>` into another host.
The old completion then rewrites the new host despite unchanged source text.
The existing standalone Code-block lifetime guard did not cover this shared
rich-field parser path.

Each existing rendered-block entry now retires a small private inline lease
before external cleanup. Deferred painting checks that exact output and its
document/contained code both before and after the real highlighter. Failed
staging never publishes an output lease. The deferred callback retains only
the small lease, rather than the renderer's other outputs/configuration.
Document-scoped parser reuse and synchronous/deferred highlighting of live,
including detached, results remain supported. No public API or global owner
manager is added.

The new registered ordinary/Trusted Types pages exercise target/all disposal,
detached document/block disposal, replacement, extracted code, a renderer throw
and discarded aggregate staging. Independent live output must still highlight,
original text/input must survive, and failed staging must call no old provider.
Exact baseline `d7a32b63` with only the same test-input overlay fails all eight
ownership bodies under both policies; the Trusted Types positive control passes.
The repair passes all 8 ordinary and 9 enforcing-policy cases, 146 existing
renderer Node cases and both source typechecks. The initial expanded fixture
used the wrong registration spelling; those two bodies were unexecuted until
corrected to the real public `registerRenderer` method. No functional oracle
was relaxed.

## Confirmed repair: one-read JSON shape capture

`cloneJsonValue` sampled an array's length on every iteration. A supported
JSON-shaped proxy therefore ran its length accessor repeatedly. An element
getter that grew the array added data outside the original snapshot; one that
shrunk it could silently truncate the result instead of rejecting the missing
entry. Native JSON serialization captures the initial array length.

The existing clone owner now captures length once before reading entries.
Three regressions fail on the original source and pass after the repair:
one length read, exact initial shape against a fresh native-JSON control, and
strict rejection when an originally present entry disappears. All 181 focused
JSON/realm/equality/store/transaction/history cases pass. Existing proxy support,
dense-array validation and ignored array metadata are retained. An initial
sandbox-restricted Node invocation could not run its test worker; the enabled
run independently records all three actual assertion failures before the fix.

The same review found a second enumeration of object proxy keys: symbol
validation and Object.keys could observe different shapes. Two additional
regressions compare one key-list read and a fresh native-JSON proxy control.
One Reflect.ownKeys snapshot now supplies symbol admission and the complete
enumerable string-key snapshot before payload access. Existing symbol rejection,
null prototypes and own `__proto__` behavior remain. All 183 focused cases pass.

## Confirmed repair: file picker acquisition and retirement

The shared file-input helper checked cancellation only before DOM creation.
A DOM adapter retiring the view during creation/mounting could still open its
dialog. A partial append failure escaped cleanup; cancellation during FileList
capture could still deliver files. Four fault controls fail before repair,
while normal delivery and foreign-document creation pass.

The helper now captures the original signal, rechecks retirement before and
after mounting, includes mounting in its cleanup boundary, and releases the
picker even when file capture throws. Canceled capture cannot invoke onFiles.
Normal delivery retains the original File objects, once-only dispatch and
cleanup before the callback. All nineteen focused picker/Image uploader tests
and both typechecks pass. These are controlled DOM-adapter fault boundaries,
not a claim of OS file-dialog injection.

## Retained verification attempts

The completion section below supersedes the pending status in this chronological
record. Every original failed or interrupted attempt keeps its actual outcome.

The initial clean `d7a32b63` checkout passes typecheck, all 2247 Node tests,
build, package, public types, docs/source/locales, site/demo and strict bundle.
Its complete browser gate was deliberately interrupted after the new defect
was confirmed, so the original manifest is interrupted rather than accepted.
The renderer-only `0b03ccf8` continuation likewise retains eight passing gates
and an interrupted browser gate once the JSON defect is confirmed. The final
source containing all three repairs requires its own complete integration and
comparative runs; neither interrupted browser command is a passing full run.
The subsequent clean `1be764d4` attempt passes its eight non-browser gates;
the ordinary browser loop then fails with a CDP Runtime.evaluate timeout before
the native/heap command stages. That failure is retained, and is not relabeled
as an interruption or successful complete run. Final verification includes the
object-key capture follow-up as well as all three repaired boundaries.
Fresh output is isolated under ignored `test-results/library-recheck/`; exact
source/fixture identities, logs, failed attempts and final results will be
recorded in the completion section after those commands actually finish.

The clean `d8b1c4f2` integration records six Node failures: traversal observers
in the public/runtime snapshot tests still spy on `getOwnPropertySymbols`,
which the repaired JSON boundary no longer calls. The journal's zero-visit
observer is stale for the same reason. All three observers now count
`Reflect.ownKeys`, retaining the original exact traversal and isolation
assertions; the journal additionally requires detecting a real canonical
snapshot as a positive control. The complete updated Node suite passes all
2257 tests without failures or skips. This test-only follow-up changes no
production bytes. The original integration remains failed, with its complete
browser command continuing independently on immutable `d8b1c4f2`.

The same observer inventory also covers the maintained canonical-read and
structural benchmarks and the browser committed-event regression. Those
measurement-only paths now observe both historical symbol enumeration and
current complete key capture where comparing two sources, and require a real
detached snapshot to register before accepting a measured zero. Control work
is excluded from the structural timing window and reset before counted work.
The affected complete ordinary page, native structural-control page and full
structural benchmark require fresh executions of these updated fixtures.
The updated runtime-contract page passes, and a preliminary attribution-only
Paragraph run observes nonzero real JSON work for both immutable sources.
The canonical-read probe passes all ten command/size pairs against its original
pre-optimization baseline `e99fec9d`, including real snapshot controls. An initial
invocation against already optimized `8761946d` correctly rejects a claimed
reduction: every pair has equal counts. That output remains explicit and does
not establish a product regression or a performance gain.

The full `d8b1c4f2` browser command passes its entire ordinary registry, then
fails one of sixteen authored-break native bodies: Undo leaves the first space
as a separate typing group. This fixture requests several remote inputs as one
group while relying on the default 300 ms coalescing window. It now explicitly
selects the existing 60-second test grouping configuration, as the maintained
native plugin fixture already does. Default interval boundaries remain covered
by the existing controller tests; production grouping is unchanged.

The updated ordinary continuation separately fails the owned editable Carousel
autoplay body: its fixed 400 ms sample sees slide one. With a repeating 250 ms
timer that sample does not prove which callback ran. The test now observes the
real second-slide DOM transition with a bounded failure deadline, and still
requires the exact caption, media, unchanged canonical data and zero history.
No timer implementation or product latency contract changes. Both original
assertion failures remain in their actual failed runs; fresh complete affected
pages and the remaining full inventories are required for completion.
Both complete affected pages pass (217 projection cases and sixteen native
authored-break cases). The physical driver gains an explicit `--intro-only`
mode to retain every physical typing/toolbox/history assertion and its output
when all 159 native pages run independently. The normal command still runs
the same introduction and complete registry. Its separate introduction passes;
no native case or literal assertion is removed.

The complete immutable `125b3e22` comparison later exposes one Image fixture
sampling race in the enforcing policy's empty local-file case. At the source
snapshot the file is still loading and no action has committed. Its subsequent
native Undo/Redo correctly replays the requested image, proving that the real
FileReader finishes after that snapshot. No production upload failure is
established. The fixture now waits for the existing local loading state to
settle, with a bounded failure deadline, before applying its unchanged literal
URL/data/transaction/history assertions. Other provider-race timing and all
case/observation inventories remain unchanged. This test-only change requires
its own complete Image corpus and both complete affected native pages; the
original failed comparison remains explicit.

## Complete fresh verification

The source inventory covers 377 production JS/TS/CSS files across core, shared,
plugin-kit, plugins, inline plugins/tools, renderer, preset and locale. Critical
public snapshot/preparation, transaction/history, selection/clipboard, renderer,
resource/realm, source-task, packaging and documentation boundaries were reviewed.
The only production delta after the previous accepted runtime is the four-file
repair described above. No public API or replacement authority manager is added.

All seventeen integration scopes are fulfilled. The original `run-CCOV0P`
retains sixteen passing gates and one ordinary inline-output timeout. Its entire
24-case page and complete unchanged-source `run-jGhWCT` pass; neither source nor
deadline changes. Node 20.19.0 / 22.23.4 / 24.22.1 each pass all 2257 tests with
zero failures, skips or todos, and both typecheck projects. Build, 297 generated
runtime declarations without diagnostics, exact locked package/public consumers,
source/locales/docs, the 127-page site and strict 95.9/96 KiB fullPreset pass.

The complete ordinary registry passes 69 visits / 65 distinct pages, including
both new rich-inline lifetime pages. All 159 native pages execute. The original
Gallery stylesheet/pointer failures remain failed; a complete unchanged-source
seven-case follow-up passes. The Image fixture follow-up passes all 52 comparison
executions and both complete native pages, 26 + 27 cases. The reader verifies
all unchanged case names and literal expectations and the exact two-file test/
report delta. The final native union is 6009 passing cases. Physical typing,
toolbox/history and heap/history controls also pass; zero of 23 retired heap
sentinels remain retained.

All 100 maintained comparison files run without acceptance filters. The reviewed
union has 132609 current observations, 501 other verdicts, 3648 completed planned
bodies and 38248 verified module records. Fifty-three raw comparison exit-1
outcomes are individually attributable to historical differences/unavailability.
Common roundtrips pass 65 cases / 11446 independent literal observations; all
65 actual HTML-layer/native controls pass. Existing current-only capabilities
and repaired historical defects are preserved.

The full structural proof passes 74 controls, 56 timing and 56 trace/allocation
groups, five warmups / 21 paired samples, all 112 archives and fourteen memory
observations. The reader reconstructs 336 distributions, verifies 370 Git modules
and eighteen dependency files, and checks all 1008 retired references per memory
observation against live controls. All six measured large edit paths reduce DOM
traversal. Public large-Table and native large-Columns p95 are slower in this
fresh run; the complete distributions and allocation samples remain available.

| Shape / action | Settled p50, ms | Settled p95, ms | Child lists read |
| --- | ---: | ---: | ---: |
| table-large / public | 170.6 → 125.5 | 353.3 → 465.5 | 13634 → 7250 |
| table-large / native | 185.4 → 182.6 | 773.8 → 356.0 | 22948 → 19764 |
| gallery-large / public | 33.3 → 33.3 | 49.9 → 49.7 | 1677 → 925 |
| gallery-large / native | 61.0 → 58.8 | 89.0 → 67.0 | 2884 → 2516 |
| columns-large / public | 66.9 → 51.2 | 90.8 → 72.0 | 29405 → 22191 |
| columns-large / native | 76.4 → 71.4 | 97.9 → 109.8 | 56811 → 55011 |

Twelve completeness corruptions and seven structural corruptions are rejected
after undamaged positive controls. The first completeness control invocation
selects a one-policy Alignment report and stops before its policy-removal test;
that failed invocation is retained. The corrected two-policy Columns input
passes all twelve. All four checks also pass from the exact published checker
sources in the new checkpoint. This does not turn any original failed process
into a successful process.

Raw outputs, source guards, commands and hash receipts are retained locally in
ignored `test-results/library-recheck/sealed/`. The checkpoint commits the
read-only review sources and reproduction instructions. Earlier dated acceptance
and exploratory/failed results retain their own source and scope. The supported
proof environment is Chromium 155.0.8059.79 on Linux with the three Node versions
above. Final documentation validation and repository delivery are recorded below.

## Final documentation and review-source receipt

Both final documentation commands exit zero on `8c975088` with the new report
and readiness updates: `npm run test:docs` checks 94 English/Russian README
documents, 53 examples and 92 package copies; `npm run docs:check` checks all
127 generated pages, links/assets and the complete bilingual demo controls.
Their actual commands, timestamps and exit codes are retained in
`sealed/final-documentation.json`, with both complete logs.

All 377 production source hashes still match the frozen verification tree.
The exact six published checkpoint files, their prior reviewer dependency,
all four successful published-reader outputs, the source inventory and final
documentation records are hashed in the ignored
`sealed/receipt-published.json`, SHA-256
`8e304f8ac8ec629e0ab4be6f0030d79add0a52da346da1ea2dd311c74a22e275`.
The earlier 44-file execution receipt remains separately preserved.

All eight runtime/test repair packets are pushed to
`refactor/rector-v2-architecture` through `8c975088`. The final documentation
packet versions this report, the readiness records and the six read-only review
sources. Generated execution archives stay ignored. The final commit and remote
identity are recorded locally in `sealed/delivery.json` after repository delivery.
