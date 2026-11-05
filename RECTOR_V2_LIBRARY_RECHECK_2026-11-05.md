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

## Confirmed repair: one-read array shape capture

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

## Verification progress

The initial clean `d7a32b63` checkout passes typecheck, all 2247 Node tests,
build, package, public types, docs/source/locales, site/demo and strict bundle.
Its complete browser gate was deliberately interrupted after the new defect
was confirmed, so the original manifest is interrupted rather than accepted.
The renderer-only `0b03ccf8` continuation likewise retains eight passing gates
and an interrupted browser gate once the JSON defect is confirmed. The final
source containing both repairs requires its own complete integration and
comparative runs; neither interrupted browser command is a passing full run.
Fresh output is isolated under ignored `test-results/library-recheck/`; exact
source/fixture identities, logs, failed attempts and final results will be
recorded in the completion section after those commands actually finish.
