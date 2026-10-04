# Browser verification

Rector's release-tested editing runtime is the current stable Chrome/Chromium family. The browser suites exercise native `contenteditable`, Selection/Range, clipboard, focus, keyboard, composition, and lifecycle behavior through Chrome DevTools Protocol; those semantics are part of the verified release contract.

Firefox and WebKit/Safari may work, but they are not release-supported until equivalent native browser gates are added for them. Do not infer cross-engine support from the package being browser-native or ESM-only. A future support expansion must add engine-specific automated coverage before the documentation is broadened.

Use Node.js 22 or 24 and an installed Chrome or Chromium. Install dependencies in this repository (`npm install --ignore-scripts`); no neighboring repositories are required. The scripts resolve their own checkout location, so its name and the shell working directory are not part of the test contract.

Run `npm run test:browser` for the page suites (including `audit.html`), physical keyboard/mouse history tests, and heap/lifecycle checks. Run `npm run docs:check` for the built documentation and its browser smoke test.

`EDITOR_CHROME_PATH` selects a browser executable when it is not on the standard OS path. `EDITOR_VITE_PATH` can select a different Vite CLI; the default is the repository's installed Vite. To run a single page, use `EDITOR_BROWSER_PAGE=audit.html node tests/browser/run.mjs` (set the environment variable using your shell's syntax).

The runners discover the browser without executing it, start headless Chrome directly on a fixture URL, bind temporary servers to loopback only, and clean up their profiles and child processes. This avoids the blank windows that `chrome.exe --version` can open on Windows. A browser navigation restriction is a failed or unavailable browser check, not a successful test.

The physical runner includes trusted native Copy/Cut/Paste between independent editors, including the private fragment MIME and selected widgets. It also drives Chrome's IME engine with `Input.imeSetComposition`, Process/229 keys and `Input.insertText`. It verifies provisional data, forward/backward cross-block ranges, Quote fields, cancellation, opaque edges, caret/history, render and read-only revocation. Chrome marks its CDP commit's `compositionend` untrusted; the fixture does not construct or dispatch composition events. Browser-engine proof and synthetic failure cases do not replace manual testing with specific OS input methods and clipboard permission dialogs.

`native-conversion.html` adds seven complete native mouse/keyboard gestures: forward/backward partial selection through three blocks, conversion to Heading/List/Code, a mixed Heading/Paragraph/List range, preserved marks/widgets, and rejection of lossy widget conversion. The checks click the type menu, verify the unselected edges and final caret/focus, and use Ctrl+Z/Ctrl+Shift+Z to verify one atomic history entry. The backward three-block case guards against the floating toolbar intercepting the mouse while the selection is still growing.

`native-block-menus.html` verifies desktop button/menu geometry, Heading/List variant drill-downs, conversion/back navigation, localized empty Heading placeholders, keyboard navigation, a real phone viewport resize, and obsolete menu callbacks. Menu mutations prepare their final caret for history, so Undo/Redo retains editor focus after a host is replaced or removed. These geometry assertions complement visual checks inside the VitePress demo, whose page styles differ from the isolated fixtures.

`native-cross-selection.html` drives the actual mixed VitePress demo document through Heading, Paragraph with Mention/Color, List and both Quote fields. Its 32 cases check visible CSS Highlight styling, intact data, selection beyond every editor edge and through gaps, returning the drag to its starting field, the nearest visual line in multiline fields, starting-block toolbar controls, level changes, formatting and conversion with native Undo/Redo. Shift+Left/Right/Up/Down, word and line-boundary movement can create and adjust cross-field ranges; emoji graphemes and inline widgets remain intact. A correct logical bookmark alone does not prove that the user can see the selection or reach the toolbar.

`native-structural.html` checks 21 keyboard/click actions against v1 behavior: paragraph and List/Checklist item joins, empty-block removal/exit, marked Enter splits, Toggle opening, and boundaries between fields of composite blocks. Enter in a final empty List/Checklist item exits into a following Paragraph; removing an empty middle item focuses the next item at its start. Clicking beneath the document appends a default block or reuses its empty tail, while read-only rejects insertion. The fixture verifies committed data, the caret at the original join, collapsed DOM selection at mark boundaries, focus, and atomic Undo/Redo.

For a focused native run, set `EDITOR_NATIVE_PAGE=native-cross-selection.html` (or another `native-*.html`) and run `node tests/browser/physical-history.mjs`. `EDITOR_NATIVE_FILTER` optionally selects case names containing that text; an empty selection of cases fails. Unset both variables before the full run. The runner waits for all input acknowledgements before navigating to the next fixture and fails on a driver error.

Tests belonging to the standalone cropper/expose repositories are not part of this checkout. Rector's own lifecycle and plugin integration suites still test its use and cleanup of those installed packages.

## Bundle size

The CI `size-report` job records the package measurements without treating the historical size targets as release requirements. Compilation or measurement errors still fail the job. Run `node benchmarks/bundle-budget.mjs --enforce` only when intentionally checking those targets; the default command is informational.


`native-plugin-parity.html` checks all 21 plugins and 34 authoring fields through native input, directed replacement, caret and Undo/Redo, plus multiline/single-line behavior, Code and Raw view controls, literal Code-to-rich conversion, whole conversions and read-only projection (139 cases).

`native-plugin-controls.html` verifies 141 actual controls: all 21 plugins' Move/Duplicate/Delete commands, Table grid and Columns layouts, Gallery and Person drag, Person crop Apply/Cancel, hidden editing hosts after tab/slide changes, Poll option sorting/results/voting/reset, LinkPreview templates and Attaches variants. The OS file chooser is intercepted only to supply the disposable test file; the crop dialog, canvas, upload and history still execute.

`native-plugin-ranges.html` checks 116 native cross-block conversions across all 29 rich-text fields and both range directions. `native-plugin-local-ranges.html` runs 76 additional partial conversions within single compound fields or across a compound owner's own fields. They verify untouched author fields, asset ownership, stable IDs, exact directed ranges and one keyboard Undo/Redo. The pages are split to retain the bounded page timeout, without dropping cases.

`native-plugin-clipboard.html` checks 48 trusted Copy/Cut/Paste gestures between independent editors for 12 compound plugins, including structured fragment preservation and keeping unselected assets/settings in the source.

`native-plugin-media.html` checks 58 visible media/presentation effects: Embed URL/Replace/settings/cover/Play, five custom source actions, four native URL dialogs, Carousel HTML/video/counter/settings/remove-all/autoplay, every Gallery layout's actual geometry, and read-only Toggle/Spoiler interaction. It also checks Image Replace and Gallery/Carousel Add drill-downs, Image dimensions/switches with history, separate Gallery thumbnail controls, and opened Image/Gallery/Carousel/Embed Settings panels at 320×500. Provider iframe integration is checked; remote provider availability/playback is not a local gate.

Native coordinate helpers wait for mounted stylesheets and fonts before measuring click/drag targets. They still require trusted input, real hit testing and exact offsets; they do not retry a failed gesture or replace it with a programmed selection.

`native-core-behavior.html` adds 45 core parity cases: layout-independent shortcuts on Russian keys, the v1 Ctrl+A cycle (including empty/plain hosts), modified cross-range deletion, public disjoint block selection and native clipboard/typing/IME, stale selection after render, native drag identity, slash cancellation/commit/IME, planned caret restoration after inline insertion/pattern paste/widget deletion, external plain/HTML/multiline paste, and committed event/debounce/destroy semantics. Its prepared-file case supplies a synthetic disposable File, then checks actual keyboard Undo/Redo; it does not exercise the OS file chooser. The full native matrix contains 925 cases plus the physical Enter/toolbox/history scenarios.


`native-plugin-field-clipboard.html` checks 68 trusted local Paste/Cut gestures across all 34 authoring fields: selected-text replacement, untouched sibling fields, rich marks, literal plain-text pastes, focus/caret and one Undo/Redo. Attaches filenames and Person URLs remain focused when projections are replaced.

`native-plugin-design.html` checks 84 plugin/theme/width combinations and four states in each (336 states): filled, empty, filled read-only and empty read-only. All 21 plugins use light/dark themes at 640/288px, self-contained images, unchanged canonical data, hidden-state visibility, editable-field bounds, theme text, media dropzones and v1 stylesheet contracts. Raw preview retains its opaque sandbox and uses a readable light HTML canvas. Add `?visual` to inspect all plugins or one plugin using the page controls.
