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

## Remaining slices

4a. Captured draft and immediate commands.
4b. Shared range/clipboard planning and private handles.
4c. Guarded ingress dispatch and clipboard task lifetime.
5. Selection conversion through prepared canonical edits.
6. Formatting selection/resource ownership.
7. Declarative inline controls.
8. Shared Mention text decisions and native reconciliation.
9. Convergence, packaged conformance and dependency enforcement.

Each slice must meet its specification's completion criteria, pass the relevant checks, and be committed and pushed separately. Passing Slice 1 does not establish completion of the remaining architecture work.
