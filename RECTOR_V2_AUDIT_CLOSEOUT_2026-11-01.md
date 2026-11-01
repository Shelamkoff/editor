# Rector v2 audit closeout — active work

User instruction: continue until the complete current audit is closed; preserve
improved v2 behavior rather than reproducing inferior v1 behavior.

Normative target: `RECTOR_V2_CONTRACT_AND_BOUNDARY_REFACTOR_SPEC.md`.
Single preservation register: `docs/architecture/rector-v2/PRESERVATION.md`.
Current recorded acceptance: **209 unique IDs, 66 accepted / 143 open**.
The open count is a proof-obligation count, not a confirmed-bug count.

## Accepted user decision

On 2026-11-01 the user selected **explicit application-owned content styles and
viewport units referenced to the containing page window** to settle the
outstanding HTML/style contract. This decision authorizes that contract choice;
it does not prove an implementation or adopt a previously rejected prototype.
Do not ask the same choice again. Test a coherent confined boundary, amend
C05/C06 after evidence, then integrate all four Raw/HTML Carousel surfaces.

## Active execution

1. Complete E-HTML/E-STYLE research against the selected contract: scriptless
   owned frame, actual permitted navigation/downloads/media, explicit content
   styles, stable parent-window viewport lengths, containment and lifetime.
   Prior prototypes under `scripts/parity/checkpoints/2026-10-29/html-style/`
   remain immutable historical evidence. Their resize feedback loop and clipped
   italic glyph are rejected approaches, not production fallbacks.
2. Complete the two Attaches rows with immutable historical/current comparison,
   quotas, pending upload/read/export failure and exact resource ownership.
   Existing local fixes and 13 real-download cases are useful but not full-row
   acceptance.
3. Review existing complete comparison corpora first (Code controls, renderer
   lifetimes, owned formatting, Embed preview, Gallery viewer); rerun on an
   attributed immutable candidate and close only obligations fully covered.
4. Add missing semantic comparison cases for the remaining block/tool/inline,
   public API, input/clipboard, extension and recovery rows. Expected values
   must be independent; repaired historical defects and genuinely unavailable
   historical APIs stay explicit. Do not turn historical FAIL into PASS.
5. Complete structural C09/T15 performance proof and architecture-to-target
   review. Reduced traversal without comparative end-to-end benefit is not full
   performance acceptance.
6. Run the complete browser/native/resource/package/docs/typing suite plus all
   differential corpora on one final immutable identity. Complete audit means
   no material unresolved findings, not merely a green smoke run.

## Current source and completed local work

Base branch `refactor/rector-v2-architecture`, HEAD
`3fcfa86647a081b6485287ae7b888be0a44f95c7`. Previous changes are local and must
be preserved. They repair ZIP replacement/destroy reentry, pending stream
cancellation and reader release, portable filename clipping/collisions, plus
Windows verification issues. Their two checkpoints are:

- `scripts/parity/checkpoints/2026-11-01/attaches-archive-ownership/README.md`
- `scripts/parity/checkpoints/2026-11-01/attaches-streams-and-downloads/README.md`

Combined run `test-results/run-cLXIAC/manifest.json` passes all ten gates on its
unchanged local patch: 2,173 Node tests (three Windows platform skips), both
typechecks, build, 42 ordinary browser pages, 13 download and 169 existing native
control cases, heap/history (23 sentinels/zero retained), docs contracts,
installed package/22 CSS assets and 127-page site/demo. This is historical
evidence for that patch, not acceptance of later edits or the full native matrix.

The existing physical runner now waits for Chrome's download completion on a
dedicated browser CDP connection, then reads the GUID file from its own profile.
`Download.take` returns `{name,bytes}`; pages cannot provide filesystem paths.
New tests should reuse existing runners and owners, without another runtime
manager, fallback mode, public compatibility alias or reduced acceptance bar.

The verified Windows fixes are locally committed as `282d3077`; the archive
fixes, tests and their checkpoints are captured in the following local commit.
Earlier checkpoint notes saying "without commit" describe their original
verification time. Each subsequent comparison records its actual immutable
candidate SHA. No push or release has been performed. Keep new generated
output in ignored `test-results/`; preserve failed/partial attempts.
