# Public mode recovery — proof in progress

This expands the existing 28 public inline cases to 58 cases covering real
block and inline extension instances. The exploratory current source passes
all 58 cases and 762 manual expectations; the specification baseline retains
29 passing and 29 failed/incomplete cases with 439 observations. These
preliminary results alone do not accept any row. The register remains
78 accepted / 131 open pending committed-source validation.

The four target rows are `CONTRACT_FAILED_MODE_DISPOSAL`,
`CONTRACT_MODE_FALSY_RECOVERY`, `CONTRACT_MODE_RECOVERY_CONTROLS` and
`CONTRACT_MODE_RECOVERY_TERMINAL_DISPOSAL`. Ordinary transition, successful
reversal and reconstruction controls are paired with every falsy thrown value
and an Error, both starting modes, real native disabled controls, canonical
data/history, exact error identity and ordered recovery failures. Terminal
public disposal is idempotent, releases every occurrence/signal and the holder,
and cannot destroy its later public-editor successor. Successful transitions
keep current instances while old pending tasks remain retired.

`scripts/parity/mode-recovery.mjs` serves exact production Git objects and
the same committed public fixture/original harness for both v2 sources.
A test-only descriptor observer records assertions without invoking accessors;
NaN and undefined have explicit distinct tags. The plain browser gate runs
without this wrapper. `review.py` imports neither fixture nor production code:
its 58-case / 762-expectation state model is manually written. It also verifies
source/dependency identities, the ordinary browser inventory and runtime byte
equality with separately integrated `f2070510`. The original successful
21-gate integration manifest is retained unchanged.

v1 has real public mode transitions implemented through document reconstruction;
they are not declared absent. A Paragraph control runs false/true/false and
records native editability, exact saved text, remount behavior and disposal.
It lacks the v2 instance hook/scope-recovery contract under test, so no shim
pretends to execute that contract there. Existing private plugin task references
remain separately recorded. There is no native gesture or security-sandbox
claim, and no production behavior is changed by this proof.
