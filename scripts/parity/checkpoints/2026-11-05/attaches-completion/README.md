# Attaches downloads and lifetime acceptance — 2026-11-05

Accepts `BLOCK_ATTACHES_DOWNLOADS` and `BLOCK_ATTACHES_LIFETIME` on immutable
`e7fb76e98d8360c8e0a4867c47e36f145f8aa4f4`. No runtime change is made here.
The earlier file-source and names/variants acceptances retain their own evidence.

The retained comparison serves exact Git module bytes for v1 `5e5c7f8d`, the
specification baseline `e981ff30`, preceding candidate `3d4b8f46` and the final
candidate. It executes ten cases per source, plus a second current execution
under enforcing Trusted Types without a default policy. All twenty current
executions / 90 independently checked observations pass. Both intermediate
sources pass their ten cases. Original v1 keeps two raw failures: clicking a
retained retired ZIP button starts two more fetches after destroy. Those failures
are not converted into passes. Actual downloads finish before bytes are read.

Four individual variants A/B/F/G retain Unicode filename and bytes
`[0,1,127,255]`. Both grouped-row links download the selected second file with
bytes `[66,10,0]`. Complete and genuinely failed-sibling ZIPs are decoded with
real JSZip and checked against literal names and bytes. Pending fetch disposal
and request replacement check every signal, no publication and retired controls.
Caller input remains unchanged. The browser source trigger is trusted; controlled
pending fetch delivery is explicitly a fault boundary, not an OS network failure.

The final candidate's registered `native-attaches-downloads.html` passes all
13 cases, including portable/colliding member names and three pending-reader
cleanup outcomes. The 29 focused Node cases pass, covering count/file/total
quotas, failed-sibling byte refunds, pending stream cancellation, released locks,
late fetch/blob/arrayBuffer completion, canceled commit/publication, reentrant
replacement/destroy, URL failure cleanup and ZIP provider ownership. These are
separate from the source comparison totals. Existing accepted file-source
comparisons cover canceled local reads/uploads and failed source publication.

`review.mjs` checks literal expected outcomes and all 62 served Git module
identities; `controls.mjs` rejects fourteen evidence corruptions. An initial
review wrongly assumed a fourteen-module minimum for v1; its actual six-module
graph is now checked exactly, alongside the other source graphs (18/19/19).
No product assertion or source graph was reduced to repair that review error.

Run the retained runner from the original paths, or adapt only its `repo` and
`fixturePath` constants to an immutable checkout and this fixture. Set
`EDITOR_PLAYWRIGHT_PATH` and `EDITOR_CHROME_PATH` for the local browser installation.
The embedded source identities remain pinned. Run the independent checks from
the repository root:

```sh
node scripts/parity/checkpoints/2026-11-05/attaches-completion/review.mjs
node scripts/parity/checkpoints/2026-11-05/attaches-completion/controls.mjs
node --test renderer/renderers/attaches/index.test.js renderer/renderers/attaches/lifecycle.test.js renderer/renderers/attaches/stream-lifetime.test.js shared/zipRuntime.test.js
```

This is Chromium/Linux proof (Node 24.22.1, Chromium 155.0.8059.79), not a claim
about other engines or a completed whole-audit integration. Remaining rows and
the final combined gate continue separately. Compressed logs retain original
results; the manifest records compressed and decoded hashes.
