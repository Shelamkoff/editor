# Standalone presentation independence and local preservation — pending

This checkpoint targets only `CONTRACT_PRESENTATION_BATCH_INDEPENDENCE` and
`CONTRACT_PRESENTATION_LOCAL_RECOVERY_PRESERVATION`. The register remains
**94 accepted / 115 open** until committed-source checks finish.

Twenty public cases specify 208 independent expectations for two blocks,
same-block/independent task rights, known and opaque inline content, unchanged
canonical data/history, no-fault batch delivery, decoder/create failure through
observer or public-query entrypoints, one/two/persistent bounded faults, explicit
descriptor retry, partial candidate cleanup and all six falsy descriptor throws.
Settled repeated queries add zero attempts; a new descriptor grants one new
attempt. Public destruction checks every created inline/block scope and exact
once-only disposal. The exploratory current source passes 20/20; the baseline
retains 1/20 passing. Existing owner tests and native tests are unchanged.

Fourteen existing native controls add 87 manually reconstructed expectations.
They use real browser protocol IME and text insertion for pending native input,
same-block and independent siblings, and a harmless layout move whose own
pre-refresh range control must pass. Exact backward ranges and another editor's
selection/focus survive failure. Synthetic, forged, stale and unsafe DOM do not
borrow native preservation. All 25 current protocol requests are checked in
order, with actual trusted preedit/beforeinput/input records. Existing cleanup
can dispatch untrusted compositionend; this is retained and never substituted
for trusted preedit. Explicit ranges do not claim physical mouse selection.
The exploratory current source passes 14/14; the baseline retains 6/14 passing,
49 observations and 22 actually completed requests. v1 separately runs actual
native Paragraph editing in both groups; v2 field/instance ports are not emulated.

The manual model imports no browser fixture or runtime. Production/test modules
come from exact Git objects; descriptors are observed without spending result
getters, and browser results cross as JSON strings. The normal ordinary suite
and separate repository native driver repeat the cases without that observer.
The 63 original owner controls retain their explicit assertions and exact
inventory from the original successful 21-gate integration; no broad control
is replaced with the focused manual matrix. Production bytes and environment
are bound to separately integrated `f2070510`, Chrome 156.0.8078.80. That original
run is not relabelled as a fresh integration. Seven negative evidence controls
cover source identity, discarded B, manufactured history, automatic retry,
synthetic preedit, lost native text and incomplete cleanup. Verification is by
the author with an independent model, not another agent. This checkpoint does
not claim full C12, B-HTML or whole-library readiness.
