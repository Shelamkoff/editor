# Full library recheck — 2026-11-05

The user requested a fresh complete review after `d7a32b63`, with verified
repairs pushed as completed packets and superior v2 behavior preserved.
Historical acceptance is not substituted for fresh execution. The complete
official browser command, public/package/type/source checks, differential
corpora and a new source review are planned on the final repaired runtime.

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

## Verification progress

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
