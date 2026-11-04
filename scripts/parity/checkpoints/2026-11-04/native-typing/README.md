# Ordinary native input — 2026-11-04

**Accepted: NATIVE_TYPING.**
Register: **146 accepted / 63 open / 209 total**. Tested source: `35ec80a9e4106610f33fef518dec161d7b263cf5`.

`NATIVE_TYPING` is accepted on `35ec80a9`: **146/209 obligations accepted,
63 open**. All **seven affected gates** pass on one clean unchanged source.
[Evidence](https://github.com/Shelamkoff/editor/blob/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-11-04/native-typing/README.md): **28 current executions / 812 observations**,
**380 module identities**, **24 rejected corruptions**. No repair is required.

Trusted text input covers ASCII, an astral character, combining text, preserved
Bold/Italic, forward/backward replacement and deletion, whole-astral deletion,
authored BR deletion, Shift+Enter and an empty field. Every case requires literal
canonical documents, DOM text/breaks/marks, exact caret/range direction and one
native keyboard Undo/Redo. A preceding focus in another field cannot redirect
the write; untouched neighboring data and DOM identities remain intact. Caller
data stays unchanged. Only a lone native placeholder BR for a canonical empty
field is visually neutral; authored BR remains an exact requirement.

All fourteen cases complete on v1, baseline, immutable parent and both current
policies without page/input errors. v1 retains **19 differences**, principally
Undo selection and its Shift+Enter representation. Baseline/parent/current have
zero differences; current improvements remain. Legacy observer availability is
explicit. Native pages pass **14 + 15 + 52 cases**, totaling
**81**; the existing text-input page includes cross-block ownership
and typed-widget controls. Inventory: **108 native pages**. Docs/site pass.
Exact runtime identity retains all sixteen passing integration gates from
`0e470fe5` and **119 Git-verified artifacts**, with their actual source/date.
Only this ordinary-input row is newly accepted; Paragraph's complete plugin and
conversion contracts, B-HTML and full readiness remain open.

Post-acceptance documentation and site checks pass on `604f26cc`.
`artifact-hashes.json` verifies actual Git blobs and decoded compressed artifacts.
