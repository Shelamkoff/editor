# LinkPreview main-image alternative text — 2026-10-30 UTC

This bounded repair makes the editor's main card image follow the canonical
plain title. It does not add a renderer/parser path, change favicon semantics,
create history or accept another preservation-register row.

The editor initialized `image.alt` to an empty string and never updated it in
`project()`. A nonempty title therefore appeared as visible literal text and in
the public renderer's image alternative, while the editor image retained an
empty alternative. The pinned v1 source
`5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340` also derives this image alternative
from the plain title. That v1 statement is a static source comparison, not a
new three-source browser execution.

## Source and implementation

The isolated worktree starts from current published runtime `69c8425e`, plus
the separate guide-only commit `1f37ee35`. Its test-first commit is
`a42985db9b616fcb332807913c722310e90b2e26`. Implementation commit
`506822bcf811c214c4794819dc27a6aee4b1bde2` adds only
`image.alt=data.title` to the existing projection path. The schema has already
normalized this metadata to a string. Assignment to the image property retains
literal angle brackets, entity-looking text, ampersands, quotes and unowned
token-looking text without interpreting them as markup.

Four new ordinary public-editor cases cover load, read-only round trips,
canonical metadata replacement/clearing, and actual configured provider-task
completion with replay. They check complete independent canonical records,
the retained image and URL control, the renderer alternative, literal title
contents, decorative favicon alternatives, exact history steps and provider
request count. The existing native URL/default cases now also require the
image source and alternative through trusted typing, metadata clearing and
one keyboard Undo/Redo. No shared 65-case differential fixture was changed.

`source.patch` is the complete four-file runtime/test diff against the stated
guide-only base. `verification.json` records the full source identities, file
hashes, executed commands, times and losslessly archived logs. The source was
clean and unchanged throughout every recorded gate. Dependencies were a
separate physical copy of the current lock's successful script-free install,
including the pinned Carousel commit `f7f64858`; Vite did not share a cache with
another checkout. Chrome for Testing was `156.0.8078.47`, Node `v24.22.1`.

## Actual RED and GREEN

| Source / C11 run | Gate | Actual result |
| --- | --- | --- |
| `a42985db` / `run-EkJ6hh` | Entire ordinary projection page | 191 PASS / 3 intended FAIL, 194 total |
| `a42985db` / `run-EkJ6hh` | LinkPreview native controls | 18 PASS / 1 intended FAIL, 19 total |
| `506822bc` / `run-69aS0Q` | Same entire projection page | 194/194 PASS |
| `506822bc` / `run-69aS0Q` | Same native controls | 19/19 PASS |
| `506822bc` / `run-69aS0Q` | Both source checkJs configurations | PASS |
| `506822bc` / `run-G6MVMf` | Existing input-lifetime units | 18/18 PASS, no failures, skips or cancellations |

The three ordinary RED failures report exactly the missing nonempty editor
alternative. The empty-title positive control passes; canonical records,
renderer alternatives and decorative favicon checks preceding the failing
assertions also pass. The native populated-card case fails on its initial
alternative, while the actual default and the remaining 17 LinkPreview
controls pass. After the single production line, the same expectations pass
through the later native edit and keyboard history phases.

The final gate of `run-69aS0Q` used the nonexistent session-command path
`plugins/link-preview/reconciliation.test.js`. It did not run a unit test.
That command's failure and the overall failed C11 manifest remain unchanged.
The separate fresh `run-G6MVMf` executes the actual existing
`plugins/link-preview/input-lifetime.test.js` and passes. The successful browser
and type gates in the earlier manifest retain their own successful outcomes;
the manifest as a whole is not relabeled green.

This checkpoint adds no complete native-suite, package-consumer or later
integration claim. Those gates must identify their own combined source.
