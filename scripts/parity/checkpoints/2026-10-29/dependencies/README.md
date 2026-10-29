# Reviewed dependency maintenance — 2026-10-29

This is a bounded dependency/attribution change under C05/C11. It does not
change sanitizer options, accepted author markup, public APIs, Node engine
coverage or the unresolved B-HTML/B-STYLE confinement decisions.

## Fresh upstream and integrity review

The official npm registry and upstream GitHub release/tag/commit objects
were read on 2026-10-29. The initial audit reported three affected packages;
the post-update audit reported zero advisories across the resolved graph.
An audit inventory is not proof of an exploitable Rector path or a complete
security review.

| Package | Before → reviewed version | Official source |
| --- | --- | --- |
| DOMPurify | 3.4.15 → 3.4.17 | [Release](https://github.com/cure53/DOMPurify/releases/tag/3.4.17), commit `a77a3e78b59f72fa4d1c83f22e121ad9cc7d3575` |
| Vite (development) | 7.3.6 → 7.3.7 | [Release](https://github.com/vitejs/vite/releases/tag/v7.3.7), commit `284f6b58d6b511cebdd52ab7731975f385bf3c6b` |
| source-map-js (development, transitive) | 1.2.1 → 1.2.2 | [Release](https://github.com/7rulnik/source-map-js/releases/tag/v1.2.2), commit `0a1d334fd1e55a47df97fcd60a7915d46df3b08a` |

DOMPurify remains exactly pinned. Vite's existing package range remains
unchanged; only its resolved patch and the source-map-js patch change.
The lock diff changes ten lines: the root sanitizer pin and each selected
package's version, resolved URL and integrity. npm's unrelated entry
reordering was removed after asserting complete JSON equality with the
actually installed/generated lock.

The three official registry tarballs were downloaded and their SHA-512
digests independently matched their advertised SRI and the lock. All 180
resolved entries retain registry.npmjs.org URLs and SHA-512 integrity.
GitHub reported verified signatures for the DOMPurify/Vite release tags
and commits; source-map-js's matching release commit is unsigned. This
records observed upstream provenance, not an independent signature audit.

| Tarball | Verified SHA-256 |
| --- | --- |
| dompurify-3.4.17.tgz | `056cbdae276897208b88c21d1d779adfa09ad7be488a2f510a28e900d3bbffe7` |
| vite-7.3.7.tgz | `61819c1c5e0b526a012b39b5d4dfb9d10875ced139554f9105a8999990ce7b08` |
| source-map-js-1.2.2.tgz | `05c8cf8e7c3a6b56cada7668fe9342b10f4b625efc92aba9ba05b9e8fe4d71a3` |

DOMPurify still offers MPL-2.0 or Apache-2.0. The distributed Apache text
matches the new package LICENSE exactly (SHA-256
`cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30`).
Its attribution was inconsistent before this change: NOTICE named 3.4.15
but THIRD_PARTY_LICENSES named 3.4.12. Both now identify 3.4.17; the complete
selected license text is unchanged. Vite remains MIT and source-map-js
BSD-3-Clause.

## Applicability and preservation boundary

The fresh DOMPurify advisories include
[IN_PLACE hook removal](https://github.com/cure53/DOMPurify/security/advisories/GHSA-mrv2-3pqr-j5jr),
[SAFE_FOR_TEMPLATES and shadow roots](https://github.com/cure53/DOMPurify/security/advisories/GHSA-cg2g-xh64-v4q7),
and [SMIL in XHTML mode](https://github.com/cure53/DOMPurify/security/advisories/GHSA-c6gr-qvv4-5v3f).
The only production DOMPurify importer is
`shared/sanitize/sanitizeRawHtml.js`. It supplies string input and an HTML
profile; it does not enable IN_PLACE, SAFE_FOR_TEMPLATES, XHTML parsing or
custom sanitizer hooks. Those advisory-specific configurations are not
the current Rector route. The patch is dependency maintenance; it does
not claim those upstream exploits were reproduced in Rector.

Vite's [development-server advisory](https://github.com/vitejs/vite/security/advisories/GHSA-rq7h-c2jc-7f22)
lists 7.3.7 as patched; source-map-js's release fixes malformed indexed
source-map processing. These are build/development dependencies, separate
from the published browser runtime. No forced major upgrade was used.

The new standard Trusted Types case runs real parent and iframe Windows
under enforced CSP. It preserves text/marks, benign classes/language,
201px typography, fragment/download metadata and native video controls,
while rejecting active elements, event handlers and active URLs. It tests
both string and TrustedHTML sinks, actual ownerDocument throughout,
renderer input immutability and disposal. An observation of the real
iframe `trustedTypes.createPolicy` verifies policy acquisition/reuse in
that Window. A deliberately wrong-realm sanitizer in an isolated negative
control failed exactly that assertion; unmodified old and updated
sanitizers both pass. No mutation from that control is shipped.

This is not navigation-activation or visual-confinement acceptance. In
particular, a DOMPurify version bump cannot resolve hostile host classes,
long-content iframe sizing, top-layer UI or Carousel input ownership.

## Executed checks

The isolated source baseline was `af71acd228b6622a31bb08fd3dfdc4db66204978`.
Environment: Linux, Node 24.22.1, npm 11.9, Chromium 142.0.7444.175. Dependencies
were installed independently using `npm ci --ignore-scripts`. Original
controls used a recorded link to the pre-update installed dependencies.

| Command/control | Observed result on 2026-10-29 UTC |
| --- | --- |
| `node --test shared/dompurifyVersion.test.js` before the update | Three expected failures for version/lock/attribution; after update 3/3 PASS |
| `node tests/browser/run.mjs` before/after | 35/35 ordinary pages each; 16:39:30–16:40:01 / 16:44:06–16:44:35 |
| `EDITOR_BROWSER_PAGE=trusted-types.htm node tests/browser/run.mjs` | Final owning-policy corpus 7/7 on old and updated dependency; deliberately wrong-realm control 1 exact FAIL |
| `npm test` | 1942/1942, zero failures/skips; 16:46:06–16:46:36 |
| `npm run test:package` | Strict Bundler/NodeNext, Vite, installed browser 39/39 and 22 CSS assets; 16:46:08–16:46:49 |
| `npm run docs:check` | 127 pages, zero broken links/assets, English/Russian light/dark interactions; 16:46:05–16:47:11 |
| `npm run typecheck` | Both checkJs configurations; 16:51:06–16:51:17 |
| `EDITOR_NATIVE_PAGE=native-plugin-parity.html node tests/browser/physical-history.mjs` | Unfiltered 228/228 PASS; 16:50:59–16:51:59 |
| `npm audit --json` | Exit 0; zero reported vulnerabilities after update |

The initial full-browser/package/unit/docs observations used tracked patch
`b3d82cb06bfff44e0dba08182bd36603d26e5093d827b8385640405be2e3395f`.
The added actual-policy observation, typecheck and native run used patch
`c8eb194bb4252b5d445b076942878391f22654c9e06af288efc5b9a39d97b84a`.
Both are against the stated isolated source, with no production JS edit.
Tracked bytes stayed unchanged during every command. The unit wrapper
additionally observed a temporary untracked VitePress build directory
created by the concurrent documentation build, so its full-status
`sourceUnchanged` flag is false; it is not presented as a clean immutable
whole-library freeze. Other reported wrappers recorded stable status.
The final lock-order cleanup preserves exactly the tested dependency
objects; the three consistency tests were rerun successfully afterwards.

Reproduce using the committed lock with `npm ci --ignore-scripts`, the
commands above and the browser path documented in `tests/browser/environment.mjs`.
Keep results outside tracked source. The tests and exact registry/release
references are retained here; generated logs, npm responses and binaries
are not committed. Later runtime changes require their own acceptance.
