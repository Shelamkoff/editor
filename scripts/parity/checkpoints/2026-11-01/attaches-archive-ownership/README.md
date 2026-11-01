# Attaches archive request ownership — 2026-11-01

## Source and scope

Updated the clean Windows checkout by fast-forward from `573e4605` to remote
`3fcfa86647a081b6485287ae7b888be0a44f95c7` on
`refactor/rector-v2-architecture`. This continuation is a local patch on that
base; it has not been committed or published. The current specification is
`RECTOR_V2_CONTRACT_AND_BOUNDARY_REFACTOR_SPEC.md`.

This fixes a confirmed request-lifetime defect in the Attaches renderer and two
Windows verification failures. It does not accept the complete
`BLOCK_ATTACHES_DOWNLOADS` or `BLOCK_ATTACHES_LIFETIME` rows. The preservation
register remains **209 IDs: 64 accepted / 145 open**. Existing improvements over
v1, including populated-block drop and filename preservation, remain intact.

## Reproduction and repair

Starting another ZIP download cancels its predecessor. A fetch provider can
observe that cancellation synchronously and destroy the output or request a
newer download. Previously the outer click continued after that callback,
started work for a destroyed view, or overwrote the successor's request owner.
In the latter case, destroying the output failed to cancel the successor and
could still download an archive. Without destruction, both requests could
download a ZIP.

The existing per-output request map now reserves the replacement controller
before notifying the predecessor's abort observers. It checks that the output
is live, the controller is un-aborted and the reservation is still current
before starting work. Destruction removes its map entry before cancellation.
The original per-request finalizer still removes only its own entry. No new
task manager, public surface or transaction owner is added.

Three Node tests use the real renderer factory, AbortSignal and Response with a
small DOM port and a controlled ZIP provider. Before the fix, two tests failed:
the destroyed view issued four requests instead of two, and the superseded
outer request issued six instead of four. Ordinary replacement already passed.
After the fix, all three pass, along with the 21 existing archive/runtime tests.

Four registered browser cases use actual DOM, AbortSignal, streaming Response
and JSZip. Fetch responses are controlled and generated anchor clicks are
intercepted to inspect the Blob. A newer request from an abort observer uses a
synthetic MouseEvent: native `HTMLElement.click()` suppresses recursive calls
on the same element. These are browser contract tests, not trusted native
download gestures or OS save-dialog acceptance.

The final identical browser fixture fails three cases before the repair and
passes all four afterward, with 42 immutable observations. It verifies no
publication after destruction, one accepted archive, successor cancellation,
exact `report.txt` and `report (2).txt` entries, literal byte payloads
`[65,10]` and `[66,0,255]`, ZIP MIME/name, exact URL release and inert retired
controls. The containing renderer-lifetimes page passes all 40 cases.

## Windows verification repairs

The first complete Node run reports 2,166 passes, two failures and three
platform skips. The two failures are independent of the ZIP change:

- `scripts/verification-results.mjs` tried to execute the Windows `npm.cmd`
  shim through `execFileSync`. The environment recorder now uses `cmd.exe` for
  the fixed `npm --version` command on Windows. The existing argv, timestamps,
  source identity, secret exclusion and environment assertions remain.
- `shared/dompurifyVersion.test.js` compared an LF-only license prefix against
  a CRLF checkout. It normalizes CRLF in both license texts before comparing
  the complete upstream license. The sanitizer pin, integrity and attribution
  requirements are unchanged; no license text or dependency version changes.

The focused Windows rerun passes eight tests, with three existing POSIX-only
skips. The subsequent full Node run passes **2,168 tests, zero failures, three
platform skips** (2,171 total).

## Executed verification and limits

Environment: Windows x64, Node 24.9.0, npm 11.2.0, installed Chrome
156.0.8078.79. Dependencies were installed from the updated lock with `npm ci`.
Runtime and browser fixture bytes were unchanged between the final targeted
browser run, all-page browser run and package checks. The later Windows fixes
touch only the verification recorder and license test.

| Check | Result |
| --- | --- |
| Archive/runtime Node tests | 24 passed |
| Full Node runner | 2,168 passed, zero failures, three platform skips |
| Both source TypeScript configurations | Passed |
| Package build | Passed; 285 runtime declarations, zero source diagnostics |
| All ordinary browser pages | 42 pages passed, including the four new cases |
| Documentation/source/localization contracts | Passed; 94 READMEs, 53 examples |
| Heap and history eviction | Passed; 23 sentinels, zero retained |
| Sequential installed-package gate | Passed; native import, Vite, Bundler/NodeNext, external browser contracts and 22 CSS assets |
| Documentation site and demo | Passed; 127 HTML pages, zero broken links or missing assets, RU/EN and both themes |

The initial package check ran concurrently with the Node size-report tests,
which also rebuild `dist`. Its asset build failed to resolve a generated module.
That failed attempt is retained. The complete sequential rerun after Node
finishes passes, including all installed consumers and the 22 CSS assets.

Ignored evidence directory: `test-results/continuation-2026-11-01/`. It retains
`archive-node-red.log`, `archive-browser-red-final.log`,
`archive-browser-red-final.json`, `archive-browser-green.log`, `node.log`,
`node-final.log`, `windows-checks-green.log`, `typecheck.log`, `build.log`,
`browser-pages.log`, `docs-contracts.log`, `docs-contracts-final.log`,
`docs-site.log`, `heap.log`, `package.log` and `package-final.log`.
`source-snapshot.json` identifies the base and SHA-256 of
all six changed implementation/test files. The earlier browser RED attempt
used recursive `.click()` and reproduced only destruction; it is excluded as
proof of successor reentry. The corrected final RED and GREEN use the same
fixture and retain their actual failure/success statuses.

Reproduce the scoped checks from the repository root in PowerShell:

```powershell
node --test renderer/renderers/attaches/index.test.js renderer/renderers/attaches/lifecycle.test.js shared/zipRuntime.test.js
$env:EDITOR_BROWSER_PAGE = 'renderer-lifetimes.html'
node tests/browser/run.mjs
Remove-Item Env:EDITOR_BROWSER_PAGE
```

Run the full Node command and package command sequentially because the Node
size-report tests also generate package output. The full 47-group native
matrix, physical OS downloads, other browser engines and a new immutable
three-source download comparison were not run. No complete parity, release,
or wider platform acceptance is claimed.
