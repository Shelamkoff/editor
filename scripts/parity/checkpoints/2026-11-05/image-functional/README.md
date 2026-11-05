# Image functional acceptance — 2026-11-05

Accepted: `BLOCK_IMAGE_SOURCES`, `BLOCK_IMAGE_CAPTION`,
`BLOCK_IMAGE_APPEARANCE`, `BLOCK_IMAGE_EXPANDED`.
Register: **173 accepted / 36 open / 209 total**.

Comparative source: `0a8a3580ad797fb27e1c072c80fdb457a54049cb`.
Maintained native source: `08f3a1e0`; production and fixture bytes are identical.
Production basis: `3d4b8f46`. Linux x64 / Node 24.22.1 / Chromium 155.0.8059.79.

Twenty-six complete scenarios run under both current policies: **52 executions
/ 798 observations**. The independent `review.mjs` reconstructs literal blocks,
versions, marks, sidecars, style values, history, directed ranges and the exact
case/phase/observation inventory. It verifies **716 Git module identities**.
`controls.mjs` rejects **19** damaged reports, including altered expected models,
missing observations, lost payloads, false policy/input claims and wrong bytes.

The actual native runner passes **26 + 27 cases**. Providers, local FileReader,
upload names/MIME/bytes, late rejection/cancellation, no-op history, native URL
input and exact keyboard replay are exercised. Caption cases use real widgets
and verify sibling caret/text-host preservation. All stored appearance values
are compared with an independent native CSS declaration. Expanded tests measure
the actual owner at both widths/background states and retain stored dimensions.
File chooser delivery is controlled; no OS picker interaction is claimed.

V1 retains fifteen differences and four incomplete pending-URL pointer bodies.
Those bodies are not counted as passes, unavailable API capabilities or proven
product defects. The spec baseline retains forty differences. Parent and both
current policies have zero. Earlier invalid oracle attempts and verifier failures
are retained separately from the final passing evidence.

Runtime remains identical to the `3d4b8f46` integration basis. Its fresh Node
suite (2247), typecheck, build, site and package consumers pass. The original
package attempt fails because `umask 0077` changes archive file modes to 0600;
the same-source `umask 022` follow-up reproduces the exact locked 0644 SRI. The
lockfile and integrity assertions are unchanged. The full native union continues;
this checkpoint does not claim all remaining audit obligations are complete.
