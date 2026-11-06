# Browser verification

`projection-contracts.html` checks partial projection merge, invalid field addressing, final normalized inline occurrence counting, own-key dictionaries, marker-free third-party widget coordinates, and pending Person input before tab changes. These are controlled DOM contract tests; trusted input preservation is covered by the native Poll/Person/Carousel suites below.

Rector's release-tested editing runtime is the current stable Chrome/Chromium family. The browser suites exercise native `contenteditable`, Selection/Range, clipboard, focus, keyboard, composition, and lifecycle behavior through Chrome DevTools Protocol; those semantics are part of the verified release contract.

Firefox and WebKit/Safari may work, but they are not release-supported until equivalent native browser gates are added for them. Do not infer cross-engine support from the package being browser-native or ESM-only. A future support expansion must add engine-specific automated coverage before the documentation is broadened.

Use Node.js 22 or 24 and an installed Chrome or Chromium. Install dependencies in this repository (`npm install --ignore-scripts`); no neighboring repositories are required. The scripts resolve their own checkout location, so its name and the shell working directory are not part of the test contract.

Run `npm run test:browser` for the page suites (including `audit.html`), physical keyboard/mouse history tests, and heap/lifecycle checks. Run `npm run docs:check` for the built documentation and its browser smoke test.

`EDITOR_CHROME_PATH` selects a browser executable when it is not on the standard OS path. `EDITOR_VITE_PATH` can select a different Vite CLI; the default is the repository's installed Vite. To run a single page, use `EDITOR_BROWSER_PAGE=audit.html node tests/browser/run.mjs` (set the environment variable using your shell's syntax).

The runners discover the browser without executing it, start headless Chrome directly on a fixture URL, bind temporary servers to loopback only, and clean up their profiles and child processes. This avoids the blank windows that `chrome.exe --version` can open on Windows. A browser navigation restriction is a failed or unavailable browser check, not a successful test.

The physical runner includes trusted native Copy/Cut/Paste between independent editors, including the private fragment MIME and selected widgets. Standard clipboard regressions also check line breaks, visible widget labels, literal markup, selected marks and links, exclusion of internal controls, and native paste into an independent editing host. It also drives Chrome's IME engine with `Input.imeSetComposition`, Process/229 keys and `Input.insertText`. It verifies provisional data, forward/backward cross-block ranges, Quote fields, cancellation, opaque edges, caret/history, render and read-only revocation. Chrome marks its CDP commit's `compositionend` untrusted; the fixture does not construct or dispatch composition events. Browser-engine proof and synthetic failure cases do not replace manual testing with specific OS input methods and clipboard permission dialogs.

The physical runner waits for the exact loaded fixture document before configuring sanitized clipboard write access for its loopback origin and owned default profile. It verifies that the fresh profile has no CDP-created contexts, checks the default context ID when advertised, and addresses that default context by omitting the optional permission context parameter. The reported target/default IDs and selection reason are recorded before the permission command. Browser/permission metadata requires read and gestureless-write permission states to remain unchanged. The setup does not grant clipboard read or unsanitized write access.

`native-conversion.html` adds seven complete native mouse/keyboard gestures: forward/backward partial selection through three blocks, conversion to Heading/List/Code, a mixed Heading/Paragraph/List range, preserved marks/widgets, and rejection of lossy widget conversion. The checks click the type menu, verify the unselected edges and final caret/focus, and use Ctrl+Z/Ctrl+Shift+Z to verify one atomic history entry. The backward three-block case guards against the floating toolbar intercepting the mouse while the selection is still growing.

`native-block-menus.html` verifies desktop button/menu geometry, Heading/List variant drill-downs, conversion/back navigation, localized empty Heading placeholders, keyboard navigation, a real phone viewport resize, and obsolete menu callbacks. Menu mutations prepare their final caret for history, so Undo/Redo retains editor focus after a host is replaced or removed. These geometry assertions complement visual checks inside the VitePress demo, whose page styles differ from the isolated fixtures.

`native-cross-selection.html` drives the actual mixed VitePress demo document through Heading, Paragraph with Mention/Color, List and both Quote fields. Its 32 cases check visible CSS Highlight styling, intact data, selection beyond every editor edge and through gaps, returning the drag to its starting field, the nearest visual line in multiline fields, starting-block toolbar controls, level changes, formatting and conversion with native Undo/Redo. Shift+Left/Right/Up/Down, word and line-boundary movement can create and adjust cross-field ranges; emoji graphemes and inline widgets remain intact. A correct logical bookmark alone does not prove that the user can see the selection or reach the toolbar.

`native-structural.html` checks 21 keyboard/click actions against v1 behavior: paragraph and List/Checklist item joins, empty-block removal/exit, marked Enter splits, Toggle opening, and boundaries between fields of composite blocks. Enter in a final empty List/Checklist item exits into a following Paragraph; removing an empty middle item focuses the next item at its start. Clicking beneath the document appends a default block or reuses its empty tail, while read-only rejects insertion. The fixture verifies committed data, the caret at the original join, collapsed DOM selection at mark boundaries, focus, and atomic Undo/Redo.

For a focused native run, set `EDITOR_NATIVE_PAGE=native-cross-selection.html` (or another `native-*.html`) and run `node tests/browser/physical-history.mjs`. `EDITOR_NATIVE_FILTER` optionally selects case names containing that text; an empty selection of cases fails. Unset both variables before the full run. The runner waits for all input acknowledgements before navigating to the next fixture and fails on a driver error.

`native-attaches-downloads.html` adds 13 cases for individual A/B/F/G downloads, both grouped-A links, complete/partial ZIPs, portable and colliding names, and pending stream cancellation. Trusted Chrome clicks perform real downloads into the runner's disposable profile. The driver waits for `Browser.downloadProgress` completion, reads the completed file and returns its bytes to the fixture; it does not intercept generated download anchors or accept an empty placeholder file. ZIP contents and literal bytes are checked using JSZip. Three stream cases use controlled fetch responses with native ReadableStream cancellation, including pending and rejected cleanup. Browser download behavior is configured through CDP, without OS save dialogs.

`native-html-content.html` retains its original 28 Raw/Carousel editor/renderer
cases and appends two native playback negative controls, for 30 cases. Each of
the four positive video cases focuses its original video and sends one trusted
Space. Functional playback requires all three observations: trusted input,
`paused === false`, and a nonempty `played` range on the same connected video,
frame and child document. Retirement must still pause that media, author data
must remain unchanged, and the caller's Blob must remain usable.

The version 2 playback contract records its monotonic origin immediately after
`dispatchKey` completes; the helper's own input acknowledgement delay is outside
this measurement. The existing `pause(100)` remains the initial observation.
If its predicate is false, read-only observations continue at 50ms intervals up
to a strict 3,000ms deadline. Time is sampled after reading state: a positive
observation at or after the deadline fails, including delayed first samples.
There are no repeated inputs, focus repairs, playback calls or media replacements.
The negative controls require an actual trusted Space on another focused button
to leave a ready video unplayed, and an actual native play followed by a new
native pause to reject nonempty historical played ranges. Only an explicit
deadline outcome satisfies these controls; setup, owner, media and read errors
remain failures.

When `EDITOR_RESULTS_DIR` is set, `media-readiness.json` is written before the
native runner returns or throws its completed page result. Its
`native-playback-functional-v2` records distinguish four positive phases,
wrong-target rejection, paused-history preparation, and paused-history rejection.
Each phase retains the actual initial elapsed time and predicate, all subsequent
observations, first observed positive time, terminal state and outcome. Observation
times are not frame-onset measurements. Expected negative deadlines are not
product failures or positive playback timing samples.

This functional contract explicitly accepts a valid playback observation after
the former one-shot sample but before the deadline. The recorded initial miss
does not impose a new startup latency guarantee. Historical fixed-sample failures
remain evidence with an unresolved cause; passing this contract does not prove
their cause or rule out a startup latency regression below the new deadline.

Tests belonging to the standalone cropper/expose repositories are not part of this checkout. Rector's own lifecycle and plugin integration suites still test its use and cleanup of those installed packages.

## Bundle size

The CI `size-report` job requires a complete bundle measurement and validates its static import boundaries; numeric reference excesses are informational. Run `node benchmarks/bundle-budget.mjs --enforce` for optional local enforcement of the Paragraph, default interactive and full preset references. Core remains informational in both modes. The references and measurement method are documented in `benchmarks/README.md`.


`native-plugin-parity.html` checks all 21 plugins and 34 authoring fields through native input, directed replacement, caret and Undo/Redo, plus multiline/single-line behavior, Code and Raw view controls, literal Code-to-rich conversion, whole conversions and read-only projection.

`native-code-copy-ownership.html` checks 10 Code Copy continuations with trusted clicks, a controlled Clipboard API provider and real reset deadlines. Current editable/read-only buttons complete normally; adopted buttons, toolbars, wrappers and shells preserve their new owner's DOM and canonical history. Select this page with `EDITOR_NATIVE_PAGE=native-code-copy-ownership.html`; `EDITOR_NATIVE_FILTER` continues to select its case names.

`native-plugin-controls.html` verifies 156 actual controls: all 21 plugins' Move/Duplicate/Delete commands, Table grid and Columns layouts, Gallery and Person drag, Person crop Apply/Cancel, hidden editing hosts after tab/slide changes, Poll option sorting/results/voting/reset, LinkPreview templates and Attaches variants. The OS file chooser is intercepted only to supply the disposable test file; the crop dialog, canvas, upload and history still execute.

`native-plugin-ranges.html` checks 116 native cross-block conversions across all 29 rich-text fields and both range directions. `native-plugin-local-ranges.html` runs 76 additional partial conversions within single compound fields or across a compound owner's own fields. They verify untouched author fields, asset ownership, stable IDs, exact directed ranges and one keyboard Undo/Redo. The pages are split to retain the bounded page timeout, without dropping cases.

`native-plugin-clipboard.html` checks 48 trusted Copy/Cut/Paste gestures between independent editors for 12 compound plugins, including structured fragment preservation and keeping unselected assets/settings in the source.

`native-plugin-media.html` checks 95 visible media/presentation effects: Embed URL/Replace/settings/cover/Play, five custom source actions, four native URL dialogs, Carousel HTML/video/counter/settings/remove-all/autoplay, every Gallery layout's actual geometry, and read-only Toggle/Spoiler interaction. It also checks Image Replace and Gallery/Carousel Add drill-downs, Image dimensions/switches with history, separate Gallery thumbnail controls, opened Settings panels at 320×500, resizing an already open panel, native Escape immediately after mouse opening, and Settings above a focused neighboring block. Provider iframe integration is checked; remote provider availability/playback is not a local gate.

`native-block-settings.html`, `native-code-source-language.html`, `native-person-modes.html` and `native-table-keyboard.html` run the Heading/List and Columns settings controls, detailed Code controls, Person hidden-field/read-only modes and Table keyboard corpora as separate pages. They use the same native driver, regression modules, styles and case harness as `native-plugin-parity.html`. The full physical runner includes these pages and the separate Code-copy ownership page in its final aggregate, retaining the existing 120-second budget per page. Heading/List and Columns settings have one registration in `native-block-settings.html`; the former `native-plugin-settings.html` partition is not also registered. Counts in archived runs belong to their recorded runner source and do not establish a completed run for a later combined partition.

Native coordinate helpers wait for mounted stylesheets and fonts before measuring click/drag targets. They still require trusted input, real hit testing and exact offsets; they do not retry a failed gesture or replace it with a programmed selection.

`native-authored-break.html` compares controlled typing after a marked line break with actual browser text input. Checklist and Paragraph cover single, repeated and bulk spaces, subsequent text, computed whitespace modes, formatting, logical caret positions, saved data and one-step Undo/Redo. The suite uses the same native driver and page budget as the other physical checks.

`native-core-behavior.html` checks layout-independent shortcuts on Russian keys, the v1 Ctrl+A cycle (including empty/plain hosts), modified cross-range deletion, public disjoint block selection and native clipboard/typing/IME, stale selection after render, native drag identity, slash cancellation/commit/IME, planned caret restoration after inline insertion/pattern paste/widget deletion, external plain/HTML/multiline paste, committed event/debounce/destroy semantics, failed protected-edit caret/range recovery in both directions, and exact protected-edit Undo/Redo bookmarks. Its prepared-file case supplies a synthetic disposable File, then checks actual keyboard Undo/Redo; it does not exercise the OS file chooser. The runner reports the actual case results for every native group alongside the physical Enter/toolbox/history scenarios.


`native-plugin-field-clipboard.html` checks 68 trusted local Paste/Cut gestures across all 34 authoring fields: selected-text replacement, untouched sibling fields, rich marks, literal plain-text pastes, focus/caret and one Undo/Redo. Attaches filenames and Person URLs remain focused when projections are replaced.

`native-plugin-design.html` checks 84 plugin/theme/width combinations and four states in each (336 states): filled, empty, filled read-only and empty read-only. All 21 plugins use light/dark themes at 640/288px, self-contained images, unchanged canonical data, hidden-state visibility, editable-field bounds, theme text, media dropzones and v1 stylesheet contracts. Raw preview retains its opaque sandbox and uses a readable light HTML canvas. Add `?visual` to inspect all plugins or one plugin using the page controls.

`native-audit-edges.html` verifies Mention word deletion, native local Copy/Cut/Paste, trigger removal and atomic Undo/Redo. Latin, Cyrillic and emoji labels remain consistent with their saved data. Native text in an equivalent inline box provides the independent deletion oracle. Separate contract cases reject failed clipboard writes and events from auxiliary controls with a stale label selection.

`native-audit-poll.html` checks that leaving an edited Poll question or option preserves inline widget identities, sibling fields and one native Undo/Redo step. Focus changes synchronize through core's canonical projection serializer.

`native-audit-hidden-fields.html` verifies Person tab changes and Carousel caption editing with inline widgets in inactive fields. Both registered and unloaded payloads survive edits and native Undo/Redo; hidden rich text comes from the committed record rather than a plugin's stale DOM cache.

`native-audit-recheck.html` checks immediate read-only transitions with Mention in all 29 rich-text authoring fields, repeated Person/Carousel navigation, removal with hidden inline payloads, auxiliary native input and exact Undo/Redo. Separate synthetic contract cases cover browser replacement target ranges, restored stale label selections and rejection of reentrant plugin/host mutations from dynamic presentation callbacks and repeated field queries.
