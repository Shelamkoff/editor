# Public task and decoded-read authority — proof in progress

This extends the existing public `scoped-authority.html` regressions from 12
to 34 cases without changing production code. It targets the nine named
task/read/disposal contract rows, not every C07/C12 or extension obligation.
The register remains 69 accepted / 140 open until committed-source validation.

Cases cover cancelled/consumed/mode-revoked tasks before options or producers;
single option capture with guarded nested commands, focus and selection;
live/retired inline input; no-op and an existing Redo branch; retryable input
failure versus consumed entered-producer failure for all six falsy values;
accepted remounts with an aborted old signal, an independent pending task and
in-place/no-op controls; exact revoked readers; and normal/read-only/staged
decoded reads followed by a valid host command. During each read the schema
getter supplies a distinct valid label, while stored data and history remain
unchanged. Decoder and value capture run once, including detached construction.
Terminal transaction/recovery failure retains readable data and permits
idempotent public disposal, exact instance/signal release and holder reuse.

`scripts/parity/task-authority.mjs` serves every production module from its
exact Git object. The same committed tests and original harness serve both v2
sources. A test-only harness wrapper snapshots own descriptors without invoking
result accessors; this avoids spending an extra application getter. The plain
browser gate separately executes all 34 cases without this observation wrapper.
There is no private core API adapter, production transformation or native
gesture claim.

v1 runs a real Paragraph construction/save/render/disposal control. It has no
public instance-scoped DataTask/schema-context contract under test. Its six
plugin-private `beginTask` references are retained explicitly and are not
mislabelled as absent asynchronous functionality or emulated as the v2 port.
The source query for public core/plugin-kit declarations is separately empty.
The specification baseline executes the full current contract corpus and
retains its historical failures.

The final exploratory candidate on `f2070510` passes **34 cases / 333 recorded
observations**. A separate manual model reconstructs the same 333 canonical
state, callback, signal, focus, history and decoded-value expectations, verifies
275 production modules and six dependency files, and reviews 478 recorded
observations across both v2 sources. The baseline passes 14 of 34 cases; its
145 observations and twenty failed/incomplete cases remain raw evidence.
Earlier wrong BlockPatch examples and a probe that loaded the original fixture
instead of the expanded one remain fixture diagnostics, not product failures.

`review.py` imports neither the browser fixture nor production code. It verifies
the exact 34-case inventory, every candidate assertion against manually written
states, ordinary unobserved-browser output, source/dependency identities and
byte equality with production `f2070510`. Its separately preserved original
twenty-one-gate integration manifest binds that unchanged runtime. Final
candidate identity, source-specific results, negative evidence controls and row
acceptance will be recorded after the committed run.
