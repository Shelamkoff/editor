# Attaches streams, portable names and real downloads — 2026-11-01

This local continuation builds on the preceding
[request ownership repair](../attaches-archive-ownership/README.md), on base
`3fcfa86647a081b6485287ae7b888be0a44f95c7`. Earlier accepted results retain
their original source identities. The patches remain local, without commit or
push. The active contract is `RECTOR_V2_CONTRACT_AND_BOUNDARY_REFACTOR_SPEC.md`.

## Confirmed defects and repairs

1. An acquired ZIP stream was checked for cancellation only around `read()`.
   A pending read could keep an already cancelled operation open indefinitely
   when a fetch adapter did not forward its signal to the response body.
   Successful reads also retained their reader lock. Two real Node
   ReadableStream regressions fail before the fix. The reader now receives
   signal-driven, idempotent cancellation and releases its lock in `finally`.
   Cleanup rejection is contained, and an unresolved source cleanup promise
   cannot block cancellation settlement. The original abort reason, size
   reservation refunds and prohibition on late ZIP publication remain.
2. The 128-unit filename limit could expose trailing spaces/dots or a Windows
   reserved basename after the earlier checks. A collision suffix could also
   expose a space at the newly truncated extension boundary. Separate RED
   regressions reproduce both paths. ZIP member names are now validated after
   truncation, and clipped collision extensions lose unsafe trailing
   characters. Existing suffix uniqueness, Unicode boundaries and hard limits
   remain. Persisted author filenames and enhanced v2 behavior are preserved.

No new task coordinator, format, fallback runtime or configuration surface is
introduced. This continuation does not change the archive limits or partial
success policy.

## Registered browser proof

The new `native-attaches-downloads.html` page is registered in the existing
physical runner and supports its existing page/filter selection. Its final
scoped run passes **13/13 cases** in Windows Chrome 156.0.8078.79:

- Four trusted individual downloads exercise variants A/B/F/G, exact Unicode
  filenames and bytes `[0,1,127,255]`.
- Two trusted grouped-A downloads exercise the filename and download links
  for the second file, with exact bytes `[66,10,0]`.
- Four trusted ZIP downloads exercise complete and partial success, clipping
  into trailing/reserved characters and three colliding long extensions.
  JSZip parses the actual file downloaded by Chrome and checks exact entry
  names and bytes. Caller-owned data stays unchanged.
- Three controlled native ReadableStream cases prove prompt cancellation,
  released locks, original abort reason and no download, with successful,
  never-settling and rejected source cleanup. These use controlled fetch
  responses and are not claimed as trusted network failure gestures.

The driver configures Chrome's downloads to a disposable directory under its
own profile. A dedicated browser CDP session receives completion events; only
then are bytes read from the browser-selected GUID file. Pages cannot supply
filesystem paths. The file is removed after reading, and the profile is
removed by the existing runner cleanup. Actual download anchors and browser
file writes are exercised; OS save dialogs are not.

The first exploratory run read filename placeholders before writes completed,
producing empty and cross-case observations. Its failure is retained and is
not product evidence. Completion events fix that harness race. A second run
used a nonexistent Vite path as a supposed failed response; the development
server returned its SPA HTML with HTTP 200. The final partial-failure control
uses a revoked native Blob URL, which genuinely rejects the browser fetch.
Neither fixture correction changes product expectations or excuses a candidate
failure. The final thirteen-case run completes with zero failures.

## Verification and remaining scope

Focused archive/runtime Node checks pass **29/29**, including earlier request
ownership regressions. Raw RED, exploratory failures and GREEN logs remain
separate in ignored `test-results/continuation-2026-11-01-downloads/`.

The complete combined run **`run-cLXIAC` passes all ten gates**, recorded by
the existing `scripts/verification-results.mjs` helper in ignored
`test-results/run-cLXIAC/manifest.json`. Each gate exits 0 and records unchanged
source; the finished manifest also has `outcome: passed` and
`sourceUnchanged: true`. Its base HEAD is `3fcfa866` plus the complete local
patch, including the earlier continuation. The manifest records the exact
binary patch hash, new-file hashes, lock hash, environment and per-command
timestamps; this is not described as a clean committed tree.

| Gate | Recorded result |
| --- | --- |
| Build | 285 runtime declarations; zero source diagnostics |
| Full Node runner | 2,173 passed; zero failures; three existing Windows platform skips |
| Types | Both source projects passed |
| Ordinary browser pages | All 42 passed |
| Native downloads | All 13 cases passed |
| Existing native plugin controls | All 169 cases passed |
| Heap/history eviction | 23 sentinels; zero retained |
| Documentation contracts | Source/dependency/localization and 94 README/53 example checks passed |
| Installed package | Native import, Vite, Bundler/NodeNext, external browser contracts and 22 CSS assets passed |
| Site/demo | 127 HTML pages; zero broken links/missing assets; RU/EN and both themes passed |

Two earlier complete-run attempts retain their failures. `run-n7D0cf` stops
at Node with a strict RU terminology error and transient `ENOTEMPTY` during
cleanup of its own verification fixture. The terminology is now marked as a
technical term, and that fixture cleanup has bounded filesystem retries.
The subsequent `run-YX5G9I` passes build but stops at a different declaration
fixture's cleanup (`EBUSY`); its declaration assertions had completed.
The same bounded cleanup is applied to that owned temporary directory.
Neither retry changes product behavior, skips assertions or treats the failed
runs as successful. The intermediate focused helper log also retains exit 1
for stale built README copies; the final run starts with a fresh build.

After the successful source freeze, only this report and the root progress
paragraph are updated with observed results. Runtime, tests, dependency and
build inputs remain those identified by the successful manifest. The complete
47-group prior native matrix is not newly executed; the two named native
pages above are the actual scopes of this combined run.

Reproduce the native scope in PowerShell:

```powershell
$env:EDITOR_NATIVE_PAGE = 'native-attaches-downloads.html'
node tests/browser/physical-history.mjs
Remove-Item Env:EDITOR_NATIVE_PAGE
```

This is current-candidate proof, without a new immutable v1/spec/candidate
download comparison or the complete native matrix. Broad read/commit/resource
lifetimes and the complete download row still require their remaining proof.
The register stays **209 IDs: 64 accepted / 145 open**. No whole-library or
cross-engine acceptance is claimed.
