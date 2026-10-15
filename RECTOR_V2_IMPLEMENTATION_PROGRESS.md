# Architecture refinement implementation

Authoritative target: [updated refinement specification](./RECTOR_V2_ARCHITECTURE_REFINEMENT_SPEC.md).

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

Stopped after this slice at the user's request. The following slices remain unimplemented; completion of 4b does not establish completion of the full architecture plan.

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

## Remaining slices

4c. Full local/native/package verification and integration with the slice 8 terminal cancellation/control fan-out contract.
5. Run full local/native/package acceptance on the new conversion planner and correct any failures.
6. Run full local/native/package validation of strict formatting ports, panel settlement, tool presentation and selectionchange handling; correct resulting defects.
7. Declarative inline controls.
8. Shared Mention text decisions and native reconciliation.
9. Convergence, packaged conformance and dependency enforcement.

Each slice must meet its specification's completion criteria, pass the relevant checks, and be committed and pushed separately. Passing Slice 1 does not establish completion of the remaining architecture work.
