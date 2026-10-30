# Code projection continuation after highlighter adoption

An independent review of the previous callback-ownership repair found a second
continuation to check: `project()` called `mode()` after its guarded highlight
refresh. A compatible provider could move the complete wrapper or shell during
public `blocks.update()`. The highlight write was correctly rejected, but the
subsequent mode projection changed classes, hidden states, tab indexes, ARIA,
title and disabled state in the adopted DOM.

Both cases reproduce on `e68a4fc060004f6b8e01165be646321e45d5e4fc` plus the
retained test-only patch. The tests set explicit foreign mode attributes after
adoption and compare the complete adopted markup after the public update. They
also require an Error from the rejected projection, unchanged canonical blocks
and no Undo/Redo action. Both RED failures are the unintended mode write.
These two tests use the public API in the real browser; their placement in the
native fixture does not make their public update a trusted keyboard gesture.

The fix returns the existing refresh ownership result to its caller. `project`
continues into `mode` only while that exact refresh still owns its presentation.
The same synchronous exceptions keep reaching their callers. There is no new
owner, callback protocol, public surface or canonical mutation.

On the retained candidate patch, both regression cases pass. The complete Code
filter passes 24 browser cases, including the four earlier adoption regressions
and existing native input/history controls. Nine Code lifecycle/highlighter
unit tests and both source typechecks pass without skips. The standalone
two-case result overlaps the complete filter and is not additive. An independent
peer reviewed the final runtime patch and reported no blocking issue.

`manifest.json` retains exact source and artifact hashes, commands and exit
statuses. The runtime and fixture were unchanged during the final checks. These
results cover this repair; broad integrated checks belong to their separately
identified source and run. No full preservation-row acceptance is added.
