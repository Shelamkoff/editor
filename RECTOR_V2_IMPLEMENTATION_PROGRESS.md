# Architecture refinement implementation

Authoritative target: [updated refinement specification](./RECTOR_V2_ARCHITECTURE_REFINEMENT_SPEC.md).

Each subsection records its own implementation checkpoint and verification scope. The current outstanding work is listed under Remaining slices; historical green suites do not establish acceptance of a later branch head.

## Preserved baseline

Commit `75b7870` preserves all pre-existing local source fixes, native audit fixtures and reviewed plans. Commit `8c80a7f` integrates the five documentation updates from the remote branch while retaining the latest reviewed specification.

## Slice 1 — complete projected data

Implemented validated candidate-key synchronization, full sidecar transfer through normalization, final text-node occurrence counting, own-key dictionary assembly/remapping and host-owned widget identity markers. Mounted descriptors are captured before ownership publication. Person flushes pending mounted input before tab/structural controls and no longer caches rendered rich HTML; Poll's preserved baseline already uses canonical DOM synchronization on blur. Carousel retains its existing instance owner.

Verification:

- `npm test`: 563 passed.
- `npm run typecheck`: passed.
- `node tests/browser/run.mjs`: all 26 registered page suites passed; the added projection suite has 13 contract cases after its final focused rerun.
- Native `native-audit-hidden-fields.html`: 4 passed; `native-audit-poll.html`: 4 passed; `native-audit-recheck.html`: 49 passed.
- `npm run test:docs`: passed (94 READMEs, 53 examples, source/localization/documentation audits).
- `npm run test:types`: 6 passed, including NodeNext and Bundler consumers.
- Behavioral red/green evidence: duplicate final reference, premature payload pruning, duplicate candidate field keys, marker-free widget identity and pending Person input each failed for their intended defect before the corresponding fix.

## Slice 2 — preparation authority and ingestion failures

Implemented one runtime preparation-depth guard and the separate validation-observation guard, protected public insert capture and public control dispatch, internal `DocumentIngestion`, private shared failure metadata and canonical validation types. Local schema/record normalization shares preparation authority; ordinary user producers retain nested commands. Engine failure presence is independent of its thrown payload. Shared decode and existing inline assembly/update/selection paths preserve own dictionary keys. Renderer reasons use the same metadata and retain their existing public wrapper/cause.

Verification:

- `npm test`: 583 passed, including new engine, runtime, public adapter, shared decoder and renderer regressions.
- `npm run typecheck`: passed; package declaration generation reported zero source diagnostics.
- `node tests/browser/run.mjs`: all 26 page suites passed; runtime contracts include real public control/scoped-task/DOM denial during schema preparation.
- `npm run test:docs`: passed.
- `npm run test:package`: passed, including isolated Bundler/NodeNext, Vite, native ESM imports and 22 CSS assets.
- Red/green evidence covers caught falsy nested throws, misleading schema exceptions in editor and renderer, validation-observer producer reentry, unguarded public insert accessors and local normalization reentry.
- Node and package checks must run sequentially because both rebuild `dist`. An initial concurrent run collided there; a subsequent package attempt hit a transient Windows temporary-file lock. The final isolated reruns above passed.

## Slice 3 — synchronous extensions, public payloads and popup ownership

Implemented synchronous completion checks in existing registry/schema/acquisition/instance owners, cleanup-before-inspection and protected DOM completion recovery. Live presentation uses the common preparation depth. Public payload generics/defaults and host data inputs accept ordinary object interfaces while dictionaries and JSON validation retain their existing meaning. Inline contexts explicitly expose their nine supported members, including declared `commitDomMutation`, without incidental allocation authority.

Popup runtime adapters bind private owners and return frozen per-show close handles. Stale handles are inert, malformed requests preserve the active popup, and retired cleanup runs under observation authority. Mention/Color and native test consumers use initiating handles; Mention's scroll callback is tied to its originating popup. Terminal trigger cancellation containment was completed here to keep the newly checked hook contract coherent; slice 8 still owns native reconciliation and the remaining independent control fan-out.

Verification:

- `npm test`: 587 passed.
- `npm run typecheck` and `npm run test:types`: passed; the complete interface-based block/widget/renderer consumer compiles under Bundler and NodeNext.
- `node tests/browser/run.mjs`: all 26 page suites passed; focused final runtime (36 cases) and Mention/session-race reruns passed.
- Native Color popup: 8 passed; Mention popup: 55 passed; final projection/read-only audit: 49 passed.
- `npm run test:docs`: passed.
- `npm run test:package`: passed for the final source, including the new complete consumer imported only through published package entries in both TypeScript modes.
- Red/green evidence covers async ordinary projection commit, absent popup handles and interface payload/DOM contract failures. Acquisition checks cover Promise, callable thenable and throwing `then`, captured cleanup and style release. Descriptor capture also rejects an overridden-array-method validation bypass.

## Slice 4a — captured draft and immediate commands

Immediate rich-text, inline, merge, alignment, Slash, conversion, toolbox and structural commands now prepare complete canonical edits from captured active-draft order and immutable references. Semantic no-ops retain their source revision. Split/removal/default decisions and private allocation reserve current draft identities. Ordinary user producers still allow nested commands; extension preparation and allocation callbacks deny producer reentry. Public conversion results use their prepared active record, including newly inserted draft blocks.

Keyboard shortcut inputs, field lengths, split sources and returned actions are captured within the accepted interaction. Invalid, asynchronous and throwing shortcut preparation cancels the owned event without fallback. The existing TypeScript-AST source audit now checks import/reexport/dynamic dependency directions, local resolution and cycles, with negative fixtures.

Verification:

- `npm test`: 606 passed.
- `npm run typecheck`: passed.
- `node tests/browser/run.mjs`: all 26 registered page suites passed.
- Native `native-structural.html`: 21 passed against the final source.
- `npm run test:docs`: passed, including the expanded dependency audit.
- `npm run test:package`: passed; zero declaration source diagnostics, Bundler/NodeNext consumers, Vite, native ESM and 22 CSS assets.
- Red/green checks cover staged alignment/merge/inline operations, retained revision, private allocator authority, nested public snapshots and captured shortcut sources. Additional checks cover stale toolbox anchors, split ID collisions and guarded final-block defaults.
- The preliminary full native run was stopped before the final split/removal changes; it is not counted as completed verification. Full native/integration convergence remains slice 9.

## Slice 4b — shared range/clipboard preparation and private handles

Extracted `LogicalRangePlans` and `ClipboardPlans` over captured order/immutable records and narrow canonical services. Shared field ordering/slicing feeds clipboard and the existing conversion adapters. Range replacement, resolved Paste, local/serialized clipboard blocks, inline segments, whole-selection replacement and block deletion prepare complete edits before application. Their results come from the planned view; semantic no-ops retain producer revisions and still return a successful Paste caret. Unselected staged blocks/gaps and populated anchors survive nested operations. Removed the unused external-block and rich-fragment wrappers and prohibited their return in the source audit.

Clipboard handles expose only deeply frozen detached transfer data. Runtime-private weak metadata checks issuer membership, committed counters, active draft order and inspected source identity before reading application payloads or invoking capabilities. Export from a building transaction captures that draft; a handle from an aborted draft cannot delete restored sources. Whole-block Cut now applies its exported handle rather than regenerating deletion. Cut chooses a surviving target without a removed source identity in its focus. Deferred focus is captured immediately after the command, before UI notifications, and checks lifetime/generation/revision before restoration.

Verification:

- `npm test`: 614 passed; final focused runtime/engine/dependency checks: 85 passed.
- `npm run typecheck`: passed.
- `node tests/browser/run.mjs`: all 26 page suites passed; runtime contracts cover no-change public Paste, staged edits/gaps, atomic invalid output, surviving Cut focus and host-owned focus identity.
- Native clipboard: 7 passed; cross-selection: 32 passed; plugin clipboard: 48 passed; individual plugin fields: 68 passed. Plugin clipboard/field suites were repeated after the final focus capture validation.
- `npm run test:docs`: passed, including dependency and removed-symbol checks.
- `npm run test:package`: passed with zero declaration source diagnostics, isolated Bundler/NodeNext consumers, Vite, native ESM and 22 CSS assets.
- Red/green evidence covers forged/foreign handles, staged source/order changes, allowed unrelated staged edits, staged empty-anchor decisions and stale focus after a current-block observer replaces the document. Payload accessor checks confirm stale rejection occurs before capture/application.

Historical checkpoint: work stopped after this slice at the user's request. Subsequent implementation is recorded below; completion of 4b does not establish completion of the full architecture plan.

## Slice 4c — guarded ingress and clipboard task lifetime (implementation staged; full gates pending)

Completed source changes in the refactor branch:

- `ClipboardController` checks advertised private MIME before reading it. A present but unreadable, empty or invalid private fragment is consumed without trying HTML/text fallback.
- Owned Paste preparation failures cancel native default and report the failure; text/file `paste.accepts()` runs under the existing runtime preparation guard, has a strict boolean result, and fails atomically rather than catching an extension error as a missed match. A selected resolver method is captured once with its original receiver before the existing async task starts.
- `HtmlImportRouter` enforces synchronous strict root matching and conversion acceptance. `DocumentRuntime.prepareHtmlImport()` captures the active draft's current type, owns candidate JSON, and encloses HTML extension callbacks and the existing private allocator. Clipboard entrypoints no longer invoke unguarded HTML-import callbacks.
- `InlineCommandController` prepares pattern decisions, matched inline data, insertion defaults and trigger encoding under the same guard. Invalid or asynchronous match output fails rather than falling through to plain text. Successful no-match remains the normal text route.
- Deferred resolver checks now include current task identity and read-only state before and after await and before application. Revoked resolver contexts cannot issue new editor IDs even after a read-only round trip. Cancelling a task retires its continuation and captured focus signal; `createEditorRuntime` revokes tasks at read-only completion before terminal controls/UI observers, and checks committed replacement/history before fallible refresh callbacks.

Verification currently available:

- 17 focused `ClipboardController` / `InlineCommandController` unit cases passed in a constrained V8 harness that executed the branch's exact fetched JS source with mocked DOM/task adapters. This is **not** the full Node/browser runner and cannot establish native keyboard/clipboard or package parity.
- Parser checks passed for the changed JS controllers, router, runtime and browser test source using module-compatible parsing substitutions in the constrained harness. These checks are **not** TypeScript diagnostics.
- Browser regression cases were committed for non-boolean file matching, read-only task revocation and rejected async HTML import; they have **not** been run against an installed editor in Chrome.
- A full checkout, `npm test`, `npm run typecheck`, browser/native suites, docs gate and package-consumer gate could not be run in this session because the local execution container cannot resolve github.com and has no checkout of this repository. The previous slice 4b green counts remain historical evidence, not an assertion about this changed head.

**Completion status:** core 4c implementation is staged, but slice completion is not claimed until local full and native gates, package conformance, and integration with slice 8's terminal cancellation are verified. Do not advance the recorded total completion percentage based on these narrow checks alone.

## Slice 5 — selection conversion plans (source implemented; full gates pending)

Implementation:

- Added `core/SelectionConversionPlans.js` as the existing preparation layer's single/cross-block conversion owner. It shares `LogicalRangePlans` field ordering/slicing, `ClipboardPlans` compound residual and selected-source helpers, and narrow canonical record/allocator services. No separate engine, mutable selection store or plugin-specific branch was introduced.
- `DocumentRuntime.convertLogicalSelection()` now enters the common `#executePrepared` boundary and captures the **active transaction draft** (ID order and immutable records) before preparing any edit; all records, generated IDs, final focus and result IDs precede application. Moved the old runtime conversion slicing/joins/edit bodies to the new planner and deleted their superseded implementations.
- Collapsed conversions, same-type no-ops, partial/single, per-block cross selection, joined single-target conversion and compound residual paths preserve the existing result shape and target capabilities. A target import acceptance is captured once and reused through the prepared data import, avoiding divergent results from non-idempotent extension callbacks. Retained source tunes, inline reference-preservation refusal, same-type author fields, default/import/toolbox configuration semantics and allocation reservation against current draft identities. Equivalent records produce no update/history churn.
- Direct block conversion, toolbox conversion/insertion and exit conversion now reuse the extracted target-data/record preparation helpers; the unused runtime data-operation context wrapper was removed.
- Updated the existing source dependency audit to classify the new planning module as preparation-owned and prohibit dependencies on live runtime/engine/projection/plugins.
- Added browser regression cases for staged source edits, staged order, staged intermediate block insertion with joined result, same-type no-op, collapsed configured same-type conversion and single-evaluation import acceptance. Added isolated Node-target unit cases for author payload retention and synchronous conversion hook failures.

Available verification:

- The new planner's exact fetched source passed syntax parsing in the constrained V8 environment. A second isolated execution using the repository's actual `LogicalRangePlans` and `projectionFields` source (with neutral plain-text slice/DOM substitutes) produced the specified edits/focus for the staged single, reordered per-block and staged joined scenarios (3/3). A broader mocked planner run also covered collapsed conversion and same-type no-op (5/5).
- The four new unit-test bodies were exercised with the exact fetched planning/JSON/synchronous-completion source in V8 (4/4). A separate per-block acceptance harness also verified two method reads and two callback invocations for two converted pieces (without repeated acceptance). These isolated executions are **not** a substitute for Node's runner, the real DOM, or native interaction.
- New browser regression tests and the unchanged native conversion suites (`native-conversion`, `native-conversion-continuations`, `native-conversion-preservation`, `native-conversion-grouping`) require a local checkout and have **not** been executed against this head.
- `npm test`, `npm run typecheck`, `npm run test:docs`, native browser tests and the package-consumer gate remain **unverified** in this session: the available container cannot resolve github.com and no checkout is mounted. The historical slice 4b green totals do not apply to the new branch head.

**Status:** slice 5's production refactor is committed; local conformance, integration and packaging checks remain required before declaring the slice fully done.

## Slice 6a — highlight ownership, mount cleanup and presentation guards (partial)

Source changes:

- `SelectionController` retains its own `Highlight` object and deletes the shared `oe-cross-select-v2` entry only when it is still the registry's current object. A previous editor cannot clear a successor editor's highlight.
- `InlineToolMounts` preflights tool instances and duplicate types, snapshots the host-used metadata/callback members under `prepareExtensionValue()`, retains their original receivers, and owns per-tool claims. Tool initialization is marked started before bind/mount hooks. A failed mount triggers independent unbind and destroy attempts for every started tool (including the failing one); cleanup retires claims and proceeds even if a hook fails. Cleanup hooks are observed through the runtime's observation guard and checked for synchronous completion.
- `InlineToolbar` now encloses its full acquisition sequence in a failure-cleanup boundary, including DOM, Tooltip and document listeners. Ordinary `destroy()` uses the same idempotent cleanup, releases tool ownership independently and forwards cleanup diagnostics. Mounted mutation contexts are staged during initialization, activated only after acquisition, and permanently revoked before cleanup.
- Tool `isActive/getIcon/getTitle` presentation is prepared and checked synchronously under the common runtime guard before updating its button. A failed tool is hidden/disabled and reported without preventing healthy tools from refreshing. Initial metadata and callable dispatch are captured once; click/shortcut cannot execute a failed disabled control.
- Existing action-panel callbacks now also check the expected canonical revision. Successful own formatting/alignment updates the panel's revision and projected block-owner snapshot; an unrelated commit retires the old action. Panel close no longer falls back to its retained raw native range.

Verification evidence from this turn:

- `core/InlineToolMounts.test.js`: 6/6 cases passed against fetched actual source in an isolated V8 test runner, including failed mount, independent unbind/destroy, duplicate claims, immutable snapshots and observation containment.
- An isolated `InlineToolbar` composition exercise using the branch's actual class and a synthetic DOM verified that a failed presentation tool was hidden/disabled while a healthy tool stayed active, and that a constructor `onMount` failure ran both started tools' cleanup. It does not establish browser/native behavior.
- Source syntax parsing passed for the altered toolbar, mounts, selection controller, composition and browser test modules. Added browser regression cases for highlight replacement, constructor cleanup/reuse, failed presentation, mounted mutation lifecycle, and panel revision invalidation. These browser cases have **not** been run in Chrome.
- Full `npm test`, `npm run typecheck`, native browser suites, `npm run test:docs`, `npm run test:package` and source/package conformance are **not verified** at the current branch head.

**Still outstanding in slice 6:** the strict mount-scoped `InlineSelectionPort` with private logical bookmarks, phase/revision/selection authority, complete migration of indexed/raw range helpers and tool consumers, and the `endOffsetDelta` and result-restoration contracts. The existing raw `CrossEditableSelectionPort` remains for those unported consumers. Do not mark slice 6 complete or infer overall completion from this partial work.

## Slice 6b — private logical selection authority for inline panels (partial)

Implementation:

- Added `core/InlineSelectionAuthority.js`, a narrow mount/panel-scoped selection view that keeps token provenance and lifetime in a private `WeakMap`. Exposed tokens are opaque frozen objects containing no native `Range`, DOM root, field index or block data. Issuance/restore requires the owning editor to be connected, healthy, writable and in the permitted phase, with matching action lease, canonical generation and revision.
- Capture requires an authorized live range and corresponding logical block/field bookmark. Foreign, cloned, forged, retired or stale tokens cannot restore. Restoration resolves both endpoint keys against current registered rich-text fields and validates logical UTF-16 lengths, surrogate boundaries, widget-label exclusion and direction before changing native selection. `endOffsetDelta` is validated once and allowed only within the owning synchronous formatting mutation; repeated restoration uses the original end rather than accumulating adjustments.
- Added internal `DocumentRuntime.canAccessFormattingSelection()` for idle/owned-projection phase checks. Internal host-only `resolveOwnResult()` re-resolves a known successful panel operation's logical bookmark in current field keys without moving focus or rebasing the old token.
- `InlineToolbar` action panels now use the private selection authority for fresh range views, restoration, model-first alignment validation and formatter dispatch. New panel token issuance follows each successful own transaction's actual revision; after an unrelated revision, generation, lease or lifecycle transition, old panel callbacks no longer mutate or restore. `#closeActions()` revokes the old panel before its controls can be reused. Owned panel focus is restored after DOM formatting to avoid spurious queued native-selection retirement.
- Introduced the target `InlineSelectionBookmark`, `InlineSelectionRestoreOptions` and `InlineSelectionPort` declarations, while leaving the existing `CrossEditableSelectionPort` temporarily in place for **unmigrated built-in tools**. This is an incremental internal migration, **not** a claim that the public selection-port replacement and legacy helper deletion are complete.

Verification:

- `core/InlineSelectionAuthority.test.js`: **10/10** test bodies passed in the constrained V8 source runner, using the repository's actual logical `textOffset` implementation. Covered staged/retired authority, foreign tokens, read-only/lease/revision/generation expiry, backward direction, surrogate boundaries, widget-local exclusion, non-cumulative end delta, denied accessor evaluation and host-only no-focus retargeting.
- A source-level synthetic DOM exercise of `InlineToolbar` and `InlineSelectionAuthority` confirmed two consecutive successful model-first panel alignment changes, then refusal of a third action after an unrelated revision. These are isolated adapter checks rather than real browser/native selection conformance.
- Added a browser regression case asserting that an externally changed document revokes the panel's range and model-first controls. It has **not** been run in Chrome. Source syntax checks were successful for the changed JS modules; `npm run typecheck`, unit/browser/native suites, package gate and documentation/source audit are still unverified at this head.

**Still outstanding in slice 6:** bind the strict per-mount port to all inline tools, migrate every raw/indexed `SavedOffsets` and `CrossEditableSelectionPort` consumer, remove retired utility exports and direct highlight helpers, validate native `selectionchange` signatures across own restoration, and run full local/native/package conformance. Do not consider this slice complete.

## Slice 6c — strict mounted tool ports and legacy offset removal (source implemented; full gates pending)

Implementation:

- Each mounted inline tool now receives a private `InlineSelectionAuthority` with mount provenance, own action lease, current generation/revision and a fresh logical range view. The previous controller-level cross-selection methods are no longer exposed to inline extensions; mounted mutation contexts require their own opaque bookmark and a synchronous `(range) => result` callback. Staged and retired contexts invoke no producer; callbacks cannot steal another tool's protected editing phase.
- `createSelectionPortBinding`, `InlineMutationContext`, `InlineToolActionContext` and the inline tool definition type use the strict public `InlineSelectionPort` contract. Simple tag tools, Clear Formatting, Case Transform, Link, Script, ColorPicker and Font Size now capture and restore owned logical bookmarks. Color/Font Size retain tokens, not DOM Range/node/index snapshots, across auxiliary panel focus; stale apply/remove/restore does not use a native fallback.
- Case Transform uses only the captured DOM-order end endpoint's non-cumulative `endOffsetDelta`, including Unicode `ß → SS` and backward selection. Multiple formatting wrapper phases validate their same token before continuing; a required failed restoration aborts the protected edit.
- Removed old `saveCrossBlockOffsets`, `restoreCrossBlockRange`, `saveSelectionOffsets`, `restoreSelectionOffsets`, `clearCrossBlockRange`, `SavedOffsets`, `getSelectedBlockElements`, and the tool-owned CSS Highlight helpers. `toggleTag` now changes wrappers only; the selection owner restores native selection. Removed the toolbar's direct native Range fallback.
- Tightened current range/token admission against actual native boundary positions, including parent-equivalent DOM positions, and expired tokens on changed native selection even before a queued `selectionchange`. Hidden/inert/non-editable current fields are not restorable. Kept a bounded expected-result signature in the existing toolbar to avoid wrongly retiring a completed own restoration on a matching queued selection notification.
- Expanded the existing parser/source audit's removed-symbol list to include obsolete formatting helpers and checked inline tools as well as core/plugins. Added browser cases for fresh/foreign/expired mounted tokens, own-result selectionchange, and native backward Unicode case expansion and stale Color/Font Size callbacks.

Available verification:

- `InlineSelectionAuthority.test.js` and `InlineToolMounts.test.js`: **19/19** focused test bodies passed in a constrained V8 source runner using the branch's actual fetched JavaScript/neutral text-offset helpers. Includes source-adapter validation, real owner-scoped token expiry, UTF-16, foreign/forged tokens, hidden/editability checks, and independent cleanup.
- Isolated `InlineToolbar` synthetic-DOM composition confirmed staged selection denial, fresh mounted token dispatch, one accepted mutation, rejection after revision change, and permanent revoke after destroy. This is **not** a replacement for Chrome/native keyboard/selection tests.
- Checked 12 affected JavaScript modules with module-compatible syntax parsing; all 12 passed. Scanning the 16 production inline-tool modules found no references to the retired exported helpers/source symbols.
- **Not yet verified**: full `npm test`, TypeScript typecheck/declarations, complete native/browser suites (including new regressions), `npm run test:docs`, package consumer gate, visual effects and OS-specific selection/IME conformance. The workspace cannot fetch a full checkout in this session; do not interpret historical green suites as applying to this branch head.

**Status:** primary slice 6 selection-port/formatting source migration is committed. Slice 6 is not complete until full local/native/package verification and correction of failures, including checking tool presentation/UI resources and native queued-selection signatures in actual browsers.

## Slice 6d — native-boundary and scope hardening (source complete, native acceptance outstanding)

- Restricted stored editor selection issuance/restoration to exact rich-text keys that remain connected, visible, non-inert and contenteditable. A token's live DOM range is checked against its canonical bookmark's boundary positions, with equivalent parent/text-node boundaries accepted. Changed native selection revokes stale rights immediately rather than waiting for a queued browser notification.
- The toolbar's mounted scope prioritizes the authoritative cross-field `SelectionController.range` over a possibly clipped native range. A bounded expected native selection signature retains the still-valid lease when a queued `selectionchange` corresponds to the just-completed own formatting restoration, and retires it when the actual selection differs.
- The wrapper helper `toggleTag` no longer calls the Selection API or publishes native focus/selection; only the core selection owner restores it. Source audit now forbids old indexed-snapshot/direct highlight helpers.
- Added targeted browser/native regressions for mounted-token provenance and revocation, own queued selection notifications, Unicode backward case expansion, and retained auxiliary formatter callbacks after a foreign canonical revision.

Verification:

- Latest isolated tests of `InlineSelectionAuthority` and `InlineToolMounts`: **19/19 passed** against the fetched branch source; 12 changed JavaScript modules parsed successfully in the module-compatible V8 checker.
- Synthetic `InlineToolbar` / scoped port exercise also passed: a real tool callback acquired and restored its current token, a matching queued `selectionchange` kept its new continuation, and a subsequently changed native selection revoked it.
- None of these simulations proves true Chrome/browser input, native clipboard, IME, actual DOM reconciliation, generated declaration consumers or npm-package conformance. Full local `npm test`, `npm run typecheck`, `npm run test:browser`, `npm run test:docs` and `npm run test:package` remain unverified at this head.

## Slice 7 — declarative settings actions and inline controls (source implemented; full acceptance pending)

Implemented on `refactor/rector-v2-architecture`, starting from `7e30f11f516b95ff3872fc8795a93b376bdaa676`:

- Extended the existing shared `SettingsAction` contract with optional `compactLabel: LocalizedLabel`. Heading declares localized H2–H6 compact labels in the plugin and both English/Russian locale tables. Parsing Heading action IDs remains inside Heading's `apply()` only.
- Added `core/SettingsActions.js` as a shared preparation helper, not a new registry. Both toolbars use it to invoke `actions()`, capture the complete dense list and every host-used action/label property, validate localized labels, and resolve strings under `DocumentRuntime.prepareExtensionValue()`. The frozen presentation has no extension-owned getters. The chosen apply method retains its original receiver and receives current author data at dispatch.
- Inline triggers display `compactLabel ?? label`; inline dropdowns and BlockToolbar display full labels. Action identifiers are opaque in generic core. Replaced the Heading-derived `data-level` attribute with `data-action-id`, preserving disabled, active, radio, keyboard and group accessibility behavior.
- Any thrown, invalid or asynchronous metadata rejects the entire affected group. InlineToolbar hides/disables that group and retires its callbacks; BlockToolbar omits that group while retaining common move/duplicate/delete controls. Failures are reported through the existing editor diagnostics, with no partial menu or metadata-driven document mutation. Disabled, superseded and revision-stale action callbacks do not apply. Deferred focus/restoration checks the accepted action's generation, revision and continuation.
- Validated proxy-provided array lengths and contained rejected label thenables immediately, before a later property getter can throw. This prevents a secondary unhandled rejection while rejecting an invalid list. No compatibility alias or Heading-specific fallback was added to core.
- Added 21 Node tests and seven real-editor browser scenarios in `tests/browser/settings-action-contracts.js`. The new scenarios are called by the already registered `action-label-security.js` page rather than left in an unregistered fixture. They cover compact/full labels, opaque IDs, literal text, atomic group rejection, guarded metadata getters, disabled/stale callbacks, and localized Heading application/Undo.

Executed verification on the exact edited helper and controller source:

- `node --test core/SettingsActions.test.js`: **21/21 passed** in Node v22.16.0. These were real Node test-runner executions, not rewritten test bodies. Red/green checks first reproduced missing compact metadata, late invalid-list acceptance, invalid proxy lengths and an uncontained rejected label.
- **12/12 controller-level DOM cases passed in actual headless Chromium**. The harness loaded the edited InlineToolbar/BlockToolbar/helper source through CDP into an isolated document, with a stubbed document runtime and unrelated toolbar dependencies. It covered both UI surfaces, literal labels, complete-list rejection, metadata producer denial, retained-button invalidation, keyboard traversal of radio actions and captured apply receivers. The same harness against the pre-change controllers passed only 1/12. This is not a full-editor, native input, sanitizer, or package test.
- Targeted `tsc --noEmit --allowJs --checkJs --target ES2022 --module ESNext --moduleResolution bundler core/SettingsActions.js`: passed using the available TypeScript 5.8.3. The project's pinned TypeScript 5.9.3 and full project configurations were not executed. Node syntax checks for the edited JS and new browser module passed.
- GitHub compare against the starting commit confirmed the changes were limited to the action helper/tests, both toolbar integrations, diagnostic wiring, the shared optional type field, Heading metadata/locales, and registered browser regressions. No unrelated refactoring code was replaced.

**Not executed at this head:** full `npm test`, project `npm run typecheck`, full real-editor/browser/native suites, `npm run test:docs`, and `npm run test:package`. The seven new real-editor scenarios are committed but not yet executed through the complete Vite/editor runner; the 12 Chromium cases above deliberately used a controller-level harness. Historical slice 4b results remain historical only.

**Status:** slice 7 implementation is committed and targeted tests pass. Final acceptance remains pending the full local/native/type/package gates; this does not mark the whole refactor complete.

## Slice 8 — Mention shared edit decisions and native input reconciliation (implementation staged; full acceptance pending)

Implemented source and tests in this branch:

- Added \`inline-plugins/mention/labelEdit.js\`: one pure, synchronous label decision for existing Mention ID/payload retention, trigger retirement to ordinary text, empty deletion and UTF-16 caret results. The helper owns code-point fallback ranges and explicitly rejects invalid/surrogate-splitting intervals. Both definition \`editing.handle()\`, new optional \`editing.reconcileNative()\` and the mounted Mention DOM adapter use that same decision; removed duplicate byte/Unicode/label mutation branches.
- Mention label-local Copy/Cut/Paste now proves occurrence/event and interval ownership before consuming native defaults and before fallible clipboard I/O. Copied data is literal plain text, Cut requires successful write/readback, nonempty plain text Paste goes through the shared label decision, and empty/missing/failed owned clipboard routes do not mutate. Both-outside structural widget selections remain core-owned.
- Introduced typed optional \`InlineWidgetEditCapability.reconcileNative\` and \`InlineWidgetInstance.afterNativeEdit\`. Registry snapshots the native decision with its original receiver and synchronous completion; the projection rejects opted-in instances lacking \`update()\`. Native completion delivers guarded, deduplicated transient notices, with the final caret owner last.
- Immediate \`InlineWidgetInputController\` now admits only an owned current event and registered rich-text occurrence; it captures the returned action under \`DocumentRuntime.prepareExtensionValue\`, validates/detaches it, consumes owned failures without generic native fallback, and checks revision/generation/field before delayed caret movement. Browser deletion intervals crossing the label are deliberately left for the existing native field owner.
- \`NativeInputController\` uses its **existing single pending envelope** for either ordinary native field input or one eligible captured inline deletion. Matching late, read-only, canceled, composition-revoked and foreign-revision events are consumed as stale, never resubmitted through generic field synchronization. The field capture includes current opted-in/non-opted widget identities and retains the pre-input logical and label-local selections.
- New internal \`DocumentRuntime.reconcileNativeInlineInput\` and narrow \`InlineProjectionRuntime\` adapters use the **existing protected-projection transaction and recovery**. Complete inline sidecar decisions, DOM removals/plain replacements and neighboring author fields are submitted as one projected canonical edit. Surviving \`instance.update\` and retained payload cache are finalized against the **normalized final canonical inline map**, after projection read but before the one commit. Equal canonical results do not fabricate revision/history and still repair a previously drifted mounted label; failures recover the original projection. Failed operations restore a label-local UTF-16 caret only when the same committed occurrence remains, without redirecting stale/mixed selections.
- The existing \`InlineTriggerController\` performs active-only fresh-query handoff before protected instance notices. Its event-local route suppresses duplicate fresh-query refresh for settled inside-label and stale/failed native input while retaining ordinary outside-text trigger behavior. The read-only composition independently completes clipboard revocation, trigger retirement, popup, toolbars, root, native composition, drag and notifications even if an earlier terminal hook fails; the same existing owner/diagnostic policies are reused.
- Added focused tests \`inline-plugins/mention/labelEdit.test.js\`, \`core/InlineWidgetInputController.test.js\`, appended native-envelope tests, registry method-snapshot tests, canonical normalization/no-op/rollback tests in \`core/DocumentRuntime.test.js\`, and new registered native Mention browser cases for word-deletion payload/Undo.

Verification available in this session:

- **47/47** isolated JavaScript test bodies passed against fetched exact branch source: pure Mention label decisions (11), inline controller/ownership/failure/native notices (15), and NativeInputController matching/stale/composition logic (21). These were exercised with a constrained V8 test harness and mocked DOM/canonical services; they were **not** \`node --test\` against a full checkout.
- Syntax parsing passed for 14 changed JavaScript modules in the module-compatible V8 checker (plus a declaration file was inspected, not TypeScript-typechecked).
- \`core/DocumentRuntime.test.js\` and \`core/ExtensionRegistry.test.js\` new native source tests are committed but not executed by the real Node runner. The new \`native-mention-popup.js\` cases are also committed but not executed in Chrome/OS native input.
- **Still unverified at this head:** full \`npm test\`, project-pinned \`npm run typecheck\`, real-editor browser/native suites, \`npm run test:docs\`, \`npm run test:types\`, \`npm run test:package\`, and actual OS/IME/Clipboard behavior. No complete repository checkout is available in the execution container; it cannot resolve github.com. Historical slice 4b gates cannot be counted for current changes.

**Status:** slice 8's shared-decision and native reconciliation implementation is committed but **not accepted as complete**. Remaining tasks include full real-browser/native integration and correction of actual failures, including mixed widget/ordinary-text selection restoration, no-op cache repair, Unicode/native word boundaries, transient search handoff and clipboard conformance, plus the full project/type/package gates. Do not infer an overall completion percentage from these isolated checks.

## Slice 8 follow-up — native event ownership, collapsed ranges and clipboard revalidation

Additional source fixes committed on the same refactor branch:

- `InlineWidgetInputController.captureNativeDeletion` now requires **both** native selection endpoints in the same current registered rich-text field, the event target inside that field (excluding nested auxiliary controls), and opt-in participation by a widget whose boundary is **actually crossed**. An unrelated opt-in widget elsewhere in the same field cannot authorize deletion across a non-opted occurrence. Word/soft-line deletion with a collapsed `StaticRange` now follows the missing-range field snapshot instead of incorrectly treating it as an explicit interval.
- `NativeInputController` resolves `beforeinput` originating from an owned editable inline widget to its current **registered** parent field only for deletion capture. It rejects buttons/inputs/selects, locked content, foreign roots, detached widgets and mismatched fields. The existing matched pending envelope still exclusively owns the later `input`; no new controller or store was introduced.
- The immediate `editing.handle()` route likewise treats a collapsed browser `getTargetRanges()` entry as **no explicit interval**. It can invoke the supported code-point character-deletion fallback; a real cross-label interval remains native-owned rather than clipped into a label.
- Mention label-local Cut/Paste now revalidates the active anchor/focus and label offsets, mounted occurrence/read-only state, current text, and canonical Mention id/name **after** fallible `ClipboardData` access and **before** applying the text decision. A clipboard getter or writer that changes selection or identity cannot mutate the stale label. Owned operations remain canceled even when the I/O or subsequent freshness check fails.
- Added red/green negative tests for crossed non-opted widgets and native widget targets, plus foreign focus, auxiliary control, and collapsed-range regressions. Added two registered native Mention browser cases for reentrant Cut/Paste selection change. Updated paired EN/RU inline extension and command/history guides with the opt-in `reconcileNative` and transient `afterNativeEdit` contracts, required `update`, and single pending/projection-transaction semantics.

Verification evidence:

- Focused isolated V8 harness against the current fetched source: **54/54** test bodies passed (11 pure Mention decisions, 20 `InlineWidgetInputController`, 23 `NativeInputController`). Prior to the relevant fixes, the new non-opted cross-widget, widget-targeted native-input and collapsed target-range tests reproduced failures; the tests then passed after source changes.
- Syntax checks passed for eight affected JavaScript production/test modules. This is parsing evidence, **not** project TypeScript or Chrome conformance.
- The actual Node `--test` runner, the committed new native-browser Cut/Paste cases, the complete existing real-editor/IME/clipboard suites, EN/RU docs validation, package and generated-declaration consumers remain **unverified** in this session. The isolated tests do not establish full slice acceptance.

**Status:** Slice 8 implementation has additional verified ownership corrections but still requires full local/native/browser/type/docs/package acceptance and resolution of any actual failures. In particular the new native label Cut/Paste/browser word-boundary tests and mixed selection/cache recovery must be run on the real editor.

## Slice 8 follow-up — native settlement hardening and checked-JS consumer parity

Additional fixes in the same refactor branch:

- If restoring a stale inline projection throws, NativeInputController still consumes that matching input with failed routing status. The error cannot unwind into generic field synchronization or restore a stale trigger. InlineWidgetInputController reports the recovery failure through its existing diagnostics. A targeted regression reproduced the thrown event first and passed after the fix.
- After a successful native commit or semantic no-op, browser failure during best-effort native caret restoration is isolated from widget afterNativeEdit notices and completed document state. The dedicated test confirmed it previously skipped a notice, then passed.
- An inline controller that owns a synchronous beforeinput during root capture and stops propagation now retires the existing NativeInputController pending input explicitly; the NativeInputController's bubble listener otherwise cannot observe the superseding event. Passing/null and foreign events do not revoke this owner. No second pending queue or controller was added.
- InlineWidgetEditAction now declares optional nonnegative label-local UTF-16 caret, as already used by the host and Mention. An external TypeScript consumer covers editing.handle, reconcileNative, and afterNativeEdit; corresponding EN/RU docs were updated. The validated action is structurally narrowed for checked JS. A focused TypeScript 5.8.3 snippet reproduced and eliminated unknown-property and numeric-comparison errors, but this is not the full project typecheck.
- Deferred NativeInputController composition uses a nonnullable checked-JS type after setup, retaining safe optional delegation while the inline controller is acquired.

Verification:

- 59/59 combined focused test bodies passed against fetched branch JavaScript under a constrained isolated V8 harness: 11 pure Mention label tests, 23 inline widget controller cases, and 25 native input controller cases. New observable regressions were confirmed red before the corresponding source fix and green afterward.
- Full real-editor/browser native suites, complete node --test, pinned project typecheck, generated external declaration consumer compilation, docs/source audits, and package gates remain unexecuted at this head. The focused TypeScript snippet is not equivalent to a complete typecheck. A complete checkout remains unavailable to the execution container.
- Slice 8 and converged slice 9 are not accepted until their real integration and publication gates pass, with any resulting failures corrected.

## Slice 8 native gesture probe — independent Chromium behavior

In the locally installed Chromium 144.0.7559.96 (an isolated editable field, **not** the editor checkout), actual keyboard events produced these independent expectations for an editable label containing '@Ada':

- Ctrl+Backspace at UTF-16 offset 4 emitted `deleteWordBackward`, with an explicit noncollapsed browser target interval [1,4], leaving '@'.
- Backspace at offset 4 emitted `deleteContentBackward` with range [3,4], leaving '@Ad'.
- Delete at offset 0 emitted `deleteContentForward` with range [0,1], leaving 'Ada'.

Added one registered native-editor test in `tests/browser/native-mention-popup.js` which compares actual Ctrl+Backspace in Mention to a separately edited ordinary text field and checks preserved/retired identity and single-step Undo. This **new editor test has not been run**; the independent Chromium probe proves only the browser's default native interval/text behavior, not Rector integration.

## Slice 8 follow-up — revocable deferred caret and independent Chromium event probe

Additional owned-input findings and changes:

- Regression tests now cover the queued `InlineWidgetInputController` caret after an accepted immediate inline edit. The test first reproduced the bug: a user moved the native selection to an unrelated node before the queued callback, but the callback still called `Selection.setBaseAndExtent` and stole focus without a canonical revision change.
- The queued continuation now records the actual native anchor/focus node and offset positions immediately **after** the accepted transaction. When the queue runs it requires the same generation/revision, field lifetime and native selection signature, or becomes inert. The accepted unchanged-owner case retains the intended label-local caret. Failure from the final presentation call is diagnosed and contained, not turned into another persisted edit.
- Both focused deferred-caret tests reproduced/verified the behavior with microtasks enabled. The combined exact-source focused V8 harness subsequently passed **61/61 tests** (inline input, native input and pure Mention decisions). Added a registered real-editor browser regression in `tests/browser/runtime-contracts.js` exercising an accepted inline widget edit followed by user selection in another block before the queued caret runs. This browser case is committed but **has not been executed**. The focused V8 results are source-level behavioral evidence and do **not** imply full project Node/native browser acceptance.
- An independent real Chromium probe on a minimal editable HTML field confirmed `Ctrl+Backspace` raises one cancelable `beforeinput` (`deleteWordBackward`) with a noncollapsed label-local target range, then a noncancelable `input`, with the event target being the owning contenteditable field and not the nested label span. The browser removed the label suffix from `@Ada` to `@`. This is useful input-event evidence, but **the Rector editor, plugins and history were not loaded in this probe**.
- Repository checkout remains inaccessible from the container (GitHub DNS unavailable), so the real project `node --test`, `npm run typecheck`, registered real-editor browser suites and package/docs gates have not been executed at the current branch head.

**Status:** the deferred-caret ownership bug is addressed; stage 8 and stage 9 are still pending full real-editor, TypeScript, documentation, native/IME/clipboard, and packaged-consumer verification.

## Local integration follow-up — 2026-10-16

Fast-forwarded the clean local checkout from `752ed6f` to the 227 already-pushed implementation commits ending at `709850c`. The earlier isolated verification notes above remain historical; this run uses the actual repository, pinned dependencies, real Node and Chrome.

Initial local acceptance passed 722/722 Node tests, both project TypeScript configurations, all 26 existing browser page suites, source/localization/docs audits and the installed-package/type consumer gate. `docs:check` built 123 HTML pages with zero broken links and passed the actual browser documentation/demo scenarios.

The first complete native run exposed test selectors still addressing retired Heading `data-level` attributes. A focused Mention run also found a Columns settings selector excluding declared radio actions. Migrated these remaining selectors to declared `data-action-id` or generic menuitem roles without restoring obsolete production attributes. Real focused native verification then passed: block menus 108, cross-selection 32, interaction sequences 24, Mention 60, and plugin controls 146.

Full native/heap and final independent installed-package convergence remain in progress at this checkpoint. No whole-refactor completion is claimed here.

## Remaining slices

4c. Full local/native/package verification and integration with the slice 8 terminal cancellation/control fan-out contract.
5. Run full local/native/package acceptance on the new conversion planner and correct any failures.
6. Run full local/native/package validation of strict formatting ports, panel settlement, tool presentation and selectionchange handling; correct resulting defects.
7. Run full-editor, native, type, documentation and package acceptance for declarative controls, including the new registered action-label-security scenarios; correct resulting defects.
8. Complete native/browser, mixed-selection recovery, IME/clipboard, typed external consumer, documentation and packaged acceptance for Mention reconciliation.
9. Convergence, packaged conformance and dependency enforcement.

Each slice must meet its specification's completion criteria, pass the relevant checks, and be committed and pushed separately. Passing Slice 1 does not establish completion of the remaining architecture work.
