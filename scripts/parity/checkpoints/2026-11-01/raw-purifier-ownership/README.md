# Raw inert parsing, Blob URLs and Trusted Types — 2026-11-01

Two independently reproduced defects are repaired without changing HTML boundary
topology or canonical author data.

1. Rector's independent per-Window DOMPurify instance competed with an
   application's instance for the default `dompurify` Trusted Types policy name.
   With no duplicate-policy permission, the second instance lost its inert
   parser. Both host-first and Rector-first order are now tested in real child
   Windows with enforcing CSP. Raw passes Rector's existing, realm-owned `rector`
   policy to DOMPurify for inert parsing. The native policy still has only an
   HTML callback; ScriptURL creation throws. No default policy or duplicate
   permission is added. A rector-only CSP and explicit inert ownerDocument are
   positive controls.
2. DOMPurify's generic URI prefilter removed application-owned Blob download and
   media URLs before Rector's selected URL policies could admit them. The inert
   fragment now retains href/src/poster for the existing hardening pass, which
   applies download/link/media policy before any node reaches active DOM.
   Executable href/src remain absent. Exact Blob URLs, filename, native media
   controls and independent host sanitization are tested. The existing srcset,
   malicious HTML and Trusted Types pages remain unchanged positive/negative
   controls.

The real-browser decision experiment first exposed the policy collision; later
targeted RED controls separately exposed Blob href and src/poster loss. Failed
attempts stay under `test-results/audit-closeout-2026-11-01/`. The ordinary
`trusted-types.js` policy instrumentation now checks the intended `rector` policy
instead of requiring DOMPurify to reserve its own name. All other sanitization,
type, owner realm and input assertions remain.

Verification on frozen patch `a88a75c39a454d0baa8739c9ddc05d59f672678152a2c629a1ed96720b6537aa`
over `28b83e13`, recorded by `test-results/run-1Xc9oI/manifest.json`, passes all
five planned gates with unchanged source: build (285 declarations, zero source
diagnostics), Node (2,190 PASS, three platform skips; includes 17 decision-only
viewport-token tests), both typecheck configurations, documentation contracts,
installed package Bundler/NodeNext/Vite/native import/external-browser consumers
and 22 CSS assets. Separately, all **44 ordinary browser pages** pass in
`raw-all-pages-current.log` on the same runtime bytes. That browser run precedes
only a documentation-comment correction and is not relabelled as a manifest gate.

The seven HTML-boundary experiment cases also pass, including a completed Blob
download and actual native video playback, but remain decision-only evidence.
No complete native matrix, new HTML production boundary, C05/C06 acceptance or
additional preservation row is claimed by this checkpoint. English/Russian
security guides document the explicit policy names and unchanged script rights.
