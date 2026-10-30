# Final library verification for the 61a continuation

The clean, unchanged source is `1c933545c6f05701741031997945c64b1ab5ba9d`,
tree `d4bbe58c5f964298fcd96739edb20ca3e5dc4baf`. The current upstream base
`0cceb84eceeb6299f2338ac4798ff40e9aa36ec8` was merged normally before this
verification. This record describes local execution; it is not a claim of
publication or whole-library functional parity.

## Changes under test

This source combines ordinary native no-op completion and recovery, Poll
provider ownership and completed result labels, LinkPreview image alternative
text, Code clipboard feedback and lazy highlight ownership, Carousel autoplay
ownership, and Embed preview deadlines and late-result ownership. These repairs
use the existing runtime and instance owners. Their separate behavioral
RED/GREEN checkpoints preserve the failing controls and the corresponding
source commits:

- [Ordinary native completion](../native-ordinary-noop-61a/README.md).
- [Poll provider ownership](../poll-provider-ownership/README.md) and
  [completed labels](../poll-completed-result/README.md).
- [LinkPreview alternative text](../link-preview-image-alt/README.md).
- [Code copy ownership](../code-copy-ownership/README.md) and
  [lazy highlight ownership](../code-lazy-highlight-ownership/README.md).
- [Carousel autoplay ownership](../carousel-autoplay-ownership-61a/README.md).
- [Embed preview deadlines and ownership](../embed-preview-parity/README.md).

The first combined run on `eae1b93e` remains separate in
[continuation-61a-integration](../continuation-61a-integration/README.md) and
[continuation-native-61a](../continuation-native-61a/README.md). Its smaller
test counts are not substituted for this source's results.

## Actual general gates

All nine gates in `run-kAQSyz` pass with `sourceUnchanged: true`. No page or
case-selection filter was active. Commands ran sequentially so their package
builds and generated documentation did not race.

| Gate | Result |
| --- | --- |
| Source types | Both checkJs configurations pass |
| Package build | Pass; zero declaration source diagnostics |
| Full Node suite | 2,060 passed; zero failed, skipped or cancelled |
| Declaration consumers | Pass |
| Installed-package consumers and assets | Pass |
| Enforced bundle budgets | Pass |
| Source, locale, README and documentation contracts | Pass |
| Documentation build, links and browser examples | 127 HTML pages; zero broken links or missing assets |
| Entire ordinary browser runner | All 38 registered pages pass |

The full preset is 95.5 KiB gzip against its enforced 96 KiB budget. Core is
125.9 KiB gzip against a 51 KiB informational target. Passing the enforced
gate does not meet that separate target; no latency or allocation improvement
is inferred.

## Retained failed attempt and source equivalence

The earlier `run-TDNe8l` on `c6e537e5d7433f0d902749719c8af265c6ae8591`
remains **failed**. Both typechecks pass; the Node suite reports 2,059 passed
and one failed out of 2,060. The failure is the Russian README contract's
English prose word `preview`. The remaining seven gates are `not-run`, not
passes. Its original manifest and complete logs are preserved unchanged.

Commit `1c933545` replaces two Russian README prose phrases. The recorded
`runtime-to-general-docs-only.patch` is the entire difference between these
sources. A Git diff excluding `plugins/embed/README.ru.md` is empty: runtime,
tests, comparison fixtures, runner scripts and the package lock are identical.
The successful general run builds before checking the complete Node suite,
so the contract inspects current packaged README bytes. An intervening direct
single-test attempt encountered the stale pre-build `dist` README; that
attempt was not a C11 run and is not presented as acceptance.

The full native/heap rerun and the maintained three-source differential
corpora have independent source-specific records. Their results must be read
from those records; this general-gate archive does not imply their completion
or convert historical-reference failures into passes.

## Reproducibility and acceptance limits

`verification.json` contains the original source commit object, tree, source
file hashes, both C11 runs and the artifact index. Every indexed payload was
checked against its original file. Gzip payloads retain separate hashes for
stored and original bytes. The two original supervisors and their status
files are retained. `runtime-and-tests.patch.gz` contains the scoped combined
changes against the merged upstream base.

The environment is Node 24.22.1, npm 11.9.0 and Chrome for Testing
156.0.8078.47. The unchanged lock pins Carousel to
`f7f6485886a1d77f9213d9079eb70000efeff499`; dependencies were installed with
scripts disabled. The command-scoped public Git URL rewrite changes neither
the lock nor global Git/TLS configuration.

There are **209 unique preservation obligations: 46 accepted and 163 open**.
This continuation accepts no new register row. These are proof obligations,
not a defect count or a completion percentage. B-HTML, B-STYLE, full C09/T15
and the remaining detailed and platform-specific obligations remain open.
