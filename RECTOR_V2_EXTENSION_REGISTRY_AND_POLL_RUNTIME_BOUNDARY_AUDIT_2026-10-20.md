# Rector v2 — ExtensionRegistry lifecycle and Poll runtime boundary audit

**Date:** 2026-10-20  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD for this pass:** `8606b028408802a32bb3baff1508b6c48a51a26c`

## Scope and acceptance requirements

Continued the Rector v2 bug-fixing audit after the previous stylesheet-ledger and schema-boundary work. Reviewed current `core/ExtensionRegistry.js` and its tests, `shared/pollData.js` and its tests, registry style and schema dependencies, and the active `RECTOR_V2_REMEDIATION_SPEC.md` / project TDD skill.

The governing requirements are: I7 (revoked contexts and owners do not gain successor authority), I11 (extension definitions and contracts snapshotted before setup), P5 (owner-document resource cleanup), and P1/P2 (preserved Poll behavior and valid current data). Legacy v1 persisted formats or API signatures were not restored.

## Previous pending regression completed — registry AbortController teardown

Immediately preceding this pass, a targeted regression found that `ExtensionRegistry.destroy()` called an owner-supplied `AbortController.abort()` without isolating exceptions. If that call threw, later runtime and stylesheet disposal did not run. The fix catches the abort failure and continues releasing inline runtimes, block runtimes, and styles. A follow-up test establishes that a failed extension setup retains its primary error even when the owner AbortController throws during rollback.

Commits:
- [Lifecycle RED test](https://github.com/Shelamkoff/editor/commit/e85fc9b8c644da91e81b6c8cb64c8f5ce6b6504c)
- [Teardown fix](https://github.com/Shelamkoff/editor/commit/684a53c324a27f40145a42b879e03f680a4015be)
- [Original setup error retention test](https://github.com/Shelamkoff/editor/commit/8606b028408802a32bb3baff1508b6c48a51a26c)

With those changes, the 37 then-current `core/ExtensionRegistry.test.js` tests passed in a controlled source-backed V8 harness.

## EXT-OWNER-PREFLIGHT-1 — controller constructor mutated unowned extension declarations (P2)

The old constructor allocated the owner-document AbortController **before** snapshotting `options.blocks` and `options.inline`. A custom owner-realm constructor could synchronously mutate the caller-owned `blocks` array while the registry still had not copied its definitions. The registry then registered a substituted block instead of the originally supplied one. Also, invalid definitions unnecessarily allocated an owner cancellation resource even though setup would never begin.

### RED → GREEN

Added two public-boundary tests:
1. An owner `AbortController` constructor changes the source definitions array. The registry must still register `intended`, not `substituted`.
2. Invalid block definitions fail before allocating any owner AbortController.

The two added tests **both failed** against the old production code: **37/39 passed** overall. The production fix moves controller allocation to **after all block and inline definition snapshots, uniqueness validation and default-block validation**, but before plugin setup. **39/39 passed** against the updated source with unchanged registry integration and style behavior.

Commits:
- [RED preflight tests](https://github.com/Shelamkoff/editor/commit/ff62e827bb9179c8faf92443e6b009df2341617c)
- [Snapshot-before-controller fix](https://github.com/Shelamkoff/editor/commit/7cfefd909f8abc0df6e41483dc361c7f7cf70ab2)

## POLL-COUNT-1 — untrusted runtime counts invoked object coercion hooks (P2)

`normalizePollResults()` previously applied `Number(option.votes)` and `Number(source.total)` to any input. A supplied runtime object could define a throwing or stateful `toString()` or `valueOf()`; those hooks executed during normalization, interrupting result rendering and potentially running extension code at an unexpected boundary.

### RED → GREEN

The regression asserts that object-valued `votes` normalize to zero, the invalid `total` falls back to the sum of accepted votes, and no coercion hook runs. A positive control requires primitive numeric strings to preserve the previous count behavior. With the tests added, **10/11 Poll checks passed**; the new hostile-coercion scenario failed against the old code. The fix introduces `pollResultNumber()`, which returns `NaN` for object, function and symbol values without coercing them, while retaining `Number()` behavior for primitive values. All **11/11 passed** after the change.

Commits:
- [Count normalization regressions](https://github.com/Shelamkoff/editor/commit/045749bc2f0a4446f1fcf0c64f9caf089329fa01)
- [Count normalization fix](https://github.com/Shelamkoff/editor/commit/25bb1825076db63a0ab441448e52742e8336281d)

## POLL-LOCAL-IDS-1 — local votes could reference deleted options (P2)

The exported `applyLocalPollVote()` normalized its prior `PollResults` against current `optionIds`, but then built raw `previous` and `next` sets from caller inputs. A vote against a deleted/unknown option could therefore increment `total` despite no vote in any valid choice, and insert that unavailable id into `currentUserVote`. A stale update replacing a valid vote with an unknown option similarly left the ballot count inconsistent.

### RED → GREEN

Two tests verify:
1. An initially invalid option id produces **no ballot**, zero option votes, and empty `currentUserVote`.
2. Replacing a valid vote with a deleted option clears that ballot and decrements the valid option's count.

Against the source before the fix, **11/13 tests passed**; both new cases failed. The fix filters both old and new vote IDs through the active option set before applying counts and writing `currentUserVote`. The full `shared/pollData.test.js` focused suite then passed **13/13**.

Commits:
- [Stale local option RED tests](https://github.com/Shelamkoff/editor/commit/b9ab337c9b64a0a4dc877be37f869f7b397eec4c)
- [Local vote ID fix](https://github.com/Shelamkoff/editor/commit/59bb82be698666c2b1b3e78f4ca6c3323805baec)

## Verification summary

| Focused subset | RED | GREEN |
| --- | --- | --- |
| ExtensionRegistry, snapshot/controller race | 37/39 | **39/39** |
| Poll result coercion (before stale-id additions) | 10/11 | **11/11** |
| Poll local vote option validation | 11/13 | **13/13** |
| Final scoped total, using two non-overlapping suites | — | **54/54 (including the later runtime-retirement checks documented below)** |

All tests above executed the exact fetched production/test bodies with controlled V8 adapters for Node assertions, owner-document DOM and AbortController. They were **not** executed by native `node --test`. An ordinary direct `git ls-remote` from the local execution container failed with `Could not resolve host: github.com`; code reads and direct commits used the connected GitHub API instead. A check of the GitHub combined status and workflow runs for the intermediate commit returned no statuses or runs, not a passing CI signal.

## Required acceptance before release

In an installed checkout of the branch:

```sh
npm ci
node --test core/ExtensionRegistry.test.js shared/pollData.test.js \
  shared/styleRegistry.realm.test.js shared/snapshotDataSchema.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
```

Also run Chromium scenarios for two editor instances overlapping in one document, plugin setup/destroy lifecycle, and Poll live result refresh/vote/removal during pending callbacks; verify no retained resources, phantom ballots or invalid `currentUserVote`. Validate full user-facing v1/v2 feature parity separately against the 21 block-type matrix.

**Not completed:** native Node/npm, TypeScript/type declaration verification, browser/heap/IME gates, package consumers, and full functional parity matrix. Therefore the individual reproduced defects are corrected at source level, but **overall Rector v2 release readiness is not certified**.


## EXT-RETAINED-RUNTIME-1 — saved plugin producers remained callable after destroy (P2)

A caller could retain a reference returned by `getBlockRuntime(type)` or `getInlineRuntime(type)`, then call the previously captured `create()` or inline trigger callbacks after `ExtensionRegistry.destroy()`. Although the registry cleared its internal maps and disposed runtimes, the frozen runtime wrappers held bound extension callbacks with no active-owner test. This violated the I7 owner-revocation contract.

Added a regression retaining block and inline runtime handles, calling the methods before disposal (positive control) and after registry teardown (negative control). The old source passed **39/40** tests; the new case failed because the retained callback still ran. The fix makes each exported producer check a closure that verifies the registry is still active before invoking the saved plugin method. Registry-wide cleanup still calls the dedicated destructor without this guard. After the fix, **40/40 passed**.

A second regression demonstrated that direct `runtime.destroy()` (while the registry itself remains active) had the same stale-handle problem. This test failed against the first fix at **40/41 passed**. The final code adds a runtime-local `retired` lease which is set **before** calling plugin cleanup. Both `create()` and optional inline trigger methods reject future calls once retired, including after a throwing or reentrant destructor. The runtime destructor stays idempotent, and subsequent whole-registry `destroy()` does not double-dispose it. The complete current registry suite passed **41/41** in isolated JS execution.

Commits:
- [Retained-handle RED regression](https://github.com/Shelamkoff/editor/commit/127dd845fb95c736b13e931f26522f867e889d3d)
- [Registry lifetime guard](https://github.com/Shelamkoff/editor/commit/e6ff9b2fbd10cab4514a5bef40b881b29cfd7083)
- [Direct runtime destroy RED regression](https://github.com/Shelamkoff/editor/commit/e99f60335445c335d0283a25082c28ce7f32cb29)
- [Runtime-local lease revocation](https://github.com/Shelamkoff/editor/commit/6aab37186b2dca624f5e61875c073f91ccc8caee)

### Updated final scoped status

- `core/ExtensionRegistry.test.js`: **41/41** current source-backed isolated tests.
- `shared/pollData.test.js`: **13/13** current source-backed isolated tests.
- **54/54** non-overlapping focused tests in these two modules.

The prior 52/52 count described the initial pass before retained-runtime regressions. This updated count supersedes it. Native Node, TypeScript and browser release gates remain **not executed**; source-backed checks cannot establish complete Rector v2 release readiness.
