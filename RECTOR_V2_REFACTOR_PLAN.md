# Rector v2: architectural refactoring specification

Base branch: fix/audit-tdd-2026-09-05  
Base commit: 62038cefd8817a849c1a476a8c076b6bf535670b  
Implementation branch: refactor/rector-v2-architecture

## 1. Scope and target invariants

The refactoring is intentionally breaking. Do not preserve legacy interfaces when they conflict with the target architecture.

Target invariants:

1. Persisted document state is owned by a canonical in-memory model, not by DOM.
2. Every persisted mutation enters one transaction module.
3. History records committed changes, not complete document snapshots for ordinary edits.
4. Undo/redo reconciles only affected blocks.
5. An editable DOM field may be a transient browser-owned projection during native editing, but it is never the persistence source of truth.
6. Save serializes the canonical model only. It must not walk plugin DOM.
7. One block plugin definition may create many independent block instances. Per-block mutable state belongs to the block instance.
8. Plugin capabilities are explicit contracts rather than arbitrary optional methods discovered throughout core.
9. Built-in and third-party plugins use the same supported extension interface.
10. Plugins do not import private core modules.
11. Editor and renderer use the same block data schemas, migrations, rich-text policy and security policy.
12. Public application interfaces do not expose mutable block DOM or internal managers.
13. Read-only transitions do not rebuild unchanged blocks.
14. Move/reorder does not destroy and recreate unchanged block instances.
15. Native input correctness does not depend on a debounce timer.
16. Public observers are post-commit observations. Observer failures cannot roll back or corrupt committed state.
17. Inline widget payloads are canonical model state; widget DOM is a projection and is never scraped during save.
18. A persisted concern has one canonical location. In particular, text alignment is not duplicated between plugin data and block tunes.
19. Undo/redo replays committed changes through the same projection machinery without creating a new history record.
20. Core does not statically depend on the complete built-in inline-tool preset.
21. No parallel legacy/new mutation, history, keyboard or plugin mechanism remains after the migration.

Do not implement as part of this plan:

- CRDT;
- OT;
- remote collaborative editing;
- a custom text editing engine replacing contenteditable;
- React/Vue wrappers;
- a compatibility adapter for BlockPlugin v1;
- a second history implementation kept beside the new one;
- a second keyboard registry beside the existing ShortcutRegistry lineage.

The architecture must permit later operation replication without making collaboration a v2 deliverable.

### 1.1. Common contract types

Use explicit JSON-safe values at persistence boundaries.

    type JsonPrimitive = null | boolean | number | string

    type JsonValue =
      | JsonPrimitive
      | JsonValue[]
      | { [key: string]: JsonValue }

    type JsonObject = {
      [key: string]: JsonValue
    }

Runtime validation must additionally reject non-finite numbers, accessors/prototypes that violate the existing JSON trust-boundary policy, sparse/invalid arrays, and values JSON cannot represent.

Block-local selection used by split/conversion capabilities:

    interface BlockSelection {
      fieldKey: string
      start: number
      end: number
    }

    type ConversionData = JsonObject

    interface SelectionConversionResult<
      D extends JsonObject
    > {
      remaining: D | null
      selected: ConversionData
    }

Focus requests use logical field coordinates rather than DOM nodes:

    interface FocusTarget {
      fieldKey?: string
      offset?: number | "start" | "end"
    }

Transaction metadata:

    interface TransactionMetadata {
      origin: RecordedTransactionOrigin
      name: string
      historyGroup?: string
    }

These are target v2 contracts. Reuse an existing project type only when its semantics are exactly equivalent; do not keep two names for the same concept.

## 2. Module architecture

The refactoring must produce deep modules: callers depend on small interfaces while transaction, history, rollback, projection and lifecycle complexity remains inside the implementation.

Target dependency shape:

    createEditor
      |
      +-- ExtensionRegistry
      |
      +-- DocumentRuntime
      |     |
      |     +-- DocumentStore
      |     +-- TransactionEngine
      |     +-- HistoryStore
      |     +-- BlockReconciler
      |
      +-- InteractionRuntime
      |     |
      |     +-- Selection
      |     +-- NativeInputController
      |     +-- KeyboardRouter
      |     +-- Clipboard
      |     +-- Drag
      |     +-- Toolbars / popups
      |
      +-- EditorFacade

DocumentStore, TransactionEngine, HistoryStore and BlockReconciler are implementation modules behind the DocumentRuntime seam. Do not expose them to applications or plugins.

InteractionRuntime may call only the narrow DocumentRuntime mutation/read interface. It must not coordinate history through events.

Renderer is a separate runtime:

    EditorRenderer
      |
      +-- RendererRegistry
      +-- shared block schemas
      +-- RichTextCodec
      +-- renderer-specific DOM implementations

Renderer must not import editing runtime modules.

## 3. Canonical document model

Introduce a canonical DocumentState.

    interface DocumentState {
      version: string
      order: readonly string[]
      blocks: ReadonlyMap<string, BlockRecord>
    }

    type TextAlign = "left" | "center" | "right" | "justify"

    type BlockTunes = JsonObject & {
      textAlign?: TextAlign
    }

    interface InlineWidgetRecord<D extends JsonObject = JsonObject> {
      type: string
      dataVersion?: number
      data: D
    }

    interface BlockRecord<D extends JsonObject = JsonObject> {
      id: string
      type: string
      dataVersion?: number
      data: D
      tunes?: BlockTunes
      inline?: Record<string, InlineWidgetRecord>
      revision?: string | number
    }

Rules:

- order is the only source of persisted block ordering;
- blocks is the only source of persisted block content;
- DOM order does not define document order;
- known block data is always normalized before entering DocumentState;
- internal immutable BlockRecord values may be structurally shared;
- application-facing data must be cloned or immutable;
- revision keeps its current producer-owned optimization meaning;
- revision is not a schema version;
- revision is cleared when the editor changes that block's data, tunes or inline payload; move/reorder alone does not clear revision;
- dataVersion is the schema version of one block type;
- tunes are core-owned block metadata; known tune values are normalized by core and unknown tune keys remain inert opaque JSON;
- text alignment has one persisted representation in v2: tunes.textAlign;
- ParagraphData.align and HeadingData.align are legacy v1 inputs only and are removed from v2 canonical data;
- inline widget IDs are stable block-local identities;
- a live inline widget is valid only when its ID is referenced by a canonical rich-text placeholder and has a matching inline map entry;
- unknown block types preserve their opaque data, dataVersion, tunes, inline payload and revision without reinterpretation.

Canonical whole-document value used by replacement/history:

    interface CanonicalDocument {
      version: "2.0.0"
      blocks: readonly BlockRecord[]
    }

Persisted/exported v2 envelope:

    interface EditorDocumentV2 {
      version: "2.0.0"
      time?: number
      blocks: BlockRecord[]
    }

time is export metadata, not canonical document state. DocumentState/history/equality do not store or compare time. export/save may attach the current serialization timestamp.

DocumentSchema owns only:

- envelope validation;
- document-level version migration;
- JSON compatibility;
- duplicate ID rejection;
- structural document invariants.

DocumentSchema must not contain plugin-specific data migrations.

## 4. Block data schema contract

Replace duplicated validators/migrations with a neutral block data schema used by both editor plugins and renderers.

    interface BlockDataSchema<D extends JsonObject> {
      readonly currentVersion: number
      readonly legacyVersion: number

      decode(input: {
        dataVersion?: number
        data: unknown
      }): {
        dataVersion: number
        data: D
      }

      encode(data: Readonly<D>): {
        dataVersion: number
        data: D
      }

      mapRichText?(
        data: D,
        transform: (html: string, fieldKey: string) => string
      ): D
    }

Semantics:

- decode owns validation, legacy interpretation, migration and canonical normalization;
- missing dataVersion is interpreted as that schema's explicit legacyVersion;
- migration steps are private implementation details of the schema module;
- decode must either return current canonical data or throw a typed validation/migration error;
- migration must make monotonic progress and must not loop;
- encode must clone/normalize data and return currentVersion;
- schema functions do not mutate input;
- schema functions do not depend on DOM;
- unknown block types do not execute any registered schema belonging to another type.

Activation policy for external/imported data:

- a registered type is activated only after its schema successfully decodes the supplied version/data;
- an unsupported future dataVersion is never coerced to currentVersion;
- in validationMode "preserve", unknown types, unsupported future versions and malformed known payloads remain byte/JSON-preserved as inert read-only blocks and report the validation issue;
- in validationMode "strict", those cases reject the document operation;
- preservation status is runtime metadata and is not written into the persisted block envelope;
- a later editor instance with a compatible plugin/schema may activate the same preserved record without data loss.

Accordingly, "known block data is normalized" means activated known blocks. Preserved records stay opaque until a compatible schema can decode them.

Create neutral built-in schema modules outside editor-specific plugin implementations. Recommended shape:

    block-schemas/
      paragraph.js
      heading.js
      list.js
      ...

Both:

    plugins/paragraph
    renderer/renderers/paragraph

depend on:

    block-schemas/paragraph

Do not make renderer depend on editor plugin implementation files.

### 4.1. v1 document migration

Add one deterministic document-level v1 -> v2 migration.

It must preserve:

- block id;
- block type;
- data;
- tunes;
- inline;
- revision.

For known block types, missing dataVersion is interpreted by that block schema as its declared legacy input version and migrated to currentVersion.

For unknown block types, missing dataVersion remains missing. Do not invent a schema version for opaque data.

After successful load of a known block, the canonical state contains current dataVersion. Save emits the current dataVersion.

The v1 -> v2 migration also removes the existing alignment duplication:

- if tunes.textAlign is valid, it wins;
- otherwise Paragraph/Heading legacy data.align is copied to tunes.textAlign;
- data.align is removed from canonical v2 Paragraph/Heading data;
- invalid alignment values are removed by the core tune normalizer;
- future plugin data migrations must not own core tunes;
- the old TEXT_ALIGN_TUNE_ATTRIBUTE may be used transiently during migration only; it is removed from the final v2 persistence path.

This one-time rule belongs to the v1 document-format migration because it repairs a v1 cross-layer duplication. It is not a precedent for putting future plugin schema migrations into DocumentSchema.

## 5. Rich-text security and canonicalization

Introduce one RichTextCodec module.

Required interface:

    interface RichTextCodec {
      sanitize(input: string, ownerDocument: Document): string
      canonicalize(input: string, ownerDocument: Document): string

      normalize(input: string, ownerDocument: Document): string
    }

Persisted rich text follows:

    browser/plugin HTML
      -> sanitize
      -> canonicalize
      -> block schema normalization
      -> DocumentState

Renderer repeats sanitization before creating active DOM. Storage is not a trust boundary.

normalize is the persistence operation:

    normalize(x, document)
      === canonicalize(sanitize(x, document), document)

Canonicalization must be deterministic across supported realms and idempotent:

    canonicalize(canonicalize(x, document), document)
      === canonicalize(x, document)

Runtime code must use the editor/render target ownerDocument. Do not borrow globalThis.document when a concrete realm is available.

Define and test one canonical policy for:

- equivalent formatting tags;
- supported attributes;
- supported style properties;
- style value normalization;
- attribute/style ordering where serialization order matters;
- whitespace where normalization does not alter visual text;
- empty presentation-only wrappers;
- line breaks;
- links and URL schemes;
- inline widget placeholder preservation;
- browser-generated formatting markup.

Do not persist element.innerHTML directly from Paragraph, Heading or other rich-text plugins.

Trusted Types and HTML sinks remain centralized.

The public plugin-kit may expose only safe sinks/helpers:

    sanitizeHtml
    canonicalizeRichText
    setSanitizedHtml
    insertSanitizedHtml

No plugin should need a private core sanitizer import.

### 5.1. Inline widgets are model state

The current inline-widget path must be refactored together with block persistence. A v2 save must never call a widget getData(element) method or infer persisted widget payload from live DOM.

Canonical representation:

    rich-text field:
      "Hello {{w_42}}"

    block.inline:
      {
        "w_42": {
          type: "mention",
          dataVersion: 2,
          data: { ... }
        }
      }

Introduce a neutral inline widget schema:

    interface InlineWidgetSchema<D extends JsonObject> {
      readonly currentVersion: number
      readonly legacyVersion: number

      decode(input: {
        dataVersion?: number
        data: unknown
      }): {
        dataVersion: number
        data: D
      }

      encode(data: Readonly<D>): {
        dataVersion: number
        data: D
      }
    }

InlineWidgetSchema has the same purity and migration rules as BlockDataSchema: it is DOM-independent, does not mutate input, treats missing dataVersion as legacyVersion, deterministically migrates known legacy versions, and either returns current canonical data or throws a typed error.

A registered inline plugin is activated only when its schema decodes the payload. Unknown widget types, malformed payloads and unsupported future dataVersion values stay inert in preserve mode and are rejected in strict mode. An inert widget reference remains visible as non-active placeholder/fallback content and its canonical payload is retained.

Editor-side inline plugin contract:

    interface InlinePluginDefinition<D extends JsonObject = JsonObject> {
      readonly type: string
      readonly title: string
      readonly icon: string
      readonly styles?: readonly string[]
      readonly locale?: Readonly<Record<string, Readonly<Record<string, LocaleValue>>>>
      readonly trigger?: string
      readonly paste?: InlineWidgetPasteCapability<D>
      readonly insertion?: InlineWidgetInsertionCapability<D>
      readonly schema: InlineWidgetSchema<D>

      setup(
        context: InlinePluginRuntimeContext
      ): InlinePluginRuntime<D>
    }

    interface InlineWidgetPasteCapability<D extends JsonObject> {
      readonly patterns: readonly RegExp[]
      fromMatch(match: string): D | null
    }

    type InlineFreshInsertion<D extends JsonObject> =
      | { kind: "widget"; data: D }
      | { kind: "text"; text: string }

    interface InlineWidgetInsertionCapability<D extends JsonObject> {
      createInitial(): InlineFreshInsertion<D>
    }

    interface InlinePluginRuntimeContext {
      readonly ownerDocument: Document
      readonly signal: AbortSignal

      t(key: string, fallback?: string): string

      showPopup(
        anchor: HTMLElement,
        content: HTMLElement,
        cleanup?: () => void
      ): void

      hidePopup(): void
    }

    interface InlineTriggerSession<D extends JsonObject> {
      readonly blockId: string
      readonly fieldKey: string
      readonly query: string
      readonly range: {
        start: number
        end: number
      }
      readonly anchor: HTMLElement

      commit(data: D): void
      cancel(): void
    }

    interface InlinePluginRuntime<D extends JsonObject> {
      create(
        id: string,
        initial: Readonly<D>,
        context: InlineWidgetContext<D>
      ): InlineWidgetInstance<D>

      onTriggerQuery?(session: InlineTriggerSession<D>): void
      onTriggerCancel?(): void

      destroy(): void
    }

    interface InlineWidgetInstance<D extends JsonObject> {
      readonly element: HTMLElement

      update?(
        next: Readonly<D>,
        previous: Readonly<D>
      ): void

      setReadOnly(readOnly: boolean): void
      focus?(): void
      destroy(): void
    }

    interface InlineWidgetContext<D extends JsonObject> {
      readonly id: string
      readonly blockId: string
      readonly fieldKey: string
      readonly signal: AbortSignal

      getData(): Readonly<D>

      updateData(
        producer: (current: Readonly<D>) => D
      ): void

      isReadOnly(): boolean
    }

Rules:

- plugin definitions are stateless descriptors and may be reused;
- setup creates one editor-scoped runtime and follows the same exception-safe setup/teardown rule as block plugin runtimes;
- trigger characters, paste-pattern conversion, transient autocomplete/query UI and programmatic fresh insertion remain supported through explicit definition/runtime capabilities rather than persistence hooks;
- transient trigger/query state is not persisted as widget state until commit(data) produces one model transaction;
- RegExp paste patterns are treated as immutable definitions; matching must clone/reset stateful expressions so reusable definitions do not leak lastIndex across calls/editors;
- each widget occurrence has one InlineWidgetInstance;
- widget payload changes must call InlineWidgetContext.updateData;
- native controls inside a widget do not become persisted merely because their DOM changed;
- getData(element) is removed from v2 persistence;
- hydrate(element, ...) is removed as a persistence/lifecycle primitive;
- arbitrary elements carrying data-inline-plugin/data-id are never trusted as canonical widgets;
- core recognizes only widget instances it created and owns;
- deleting a widget from an editable field removes its placeholder reference and then prunes its inline record in the same transaction;
- a {{id}} token is interpreted as a widget reference only when block.inline has that exact own-property id; otherwise it remains ordinary author text;
- a missing plugin definition preserves the matching placeholder and payload inertly; it must not drop unknown widget data;
- an unreferenced inline entry produced by a local edit is removed at canonicalization; opaque unknown imported data is preserved until its containing rich-text field is normalized by an operation that owns that block.

### 5.2. Inline projection runtime

Create one InlineProjectionRuntime owned by the editor projection layer.

Responsibilities:

- replace canonical {{id}} references with owned widget instances in editable fields;
- reconcile widget instances by stable id;
- preserve widget instance identity when type and canonical payload are unchanged;
- update or replace only changed widget instances;
- maintain an ownership registry keyed by actual live widget element identity, not by forgeable attributes;
- serialize the actual EditableField DOM during native synchronization and replace only registered owned widget element objects with {{id}} references;
- never adopt a widget solely because serialized HTML contains data-inline-plugin/data-id attributes;
- never derive widget payload from arbitrary DOM;
- apply read-only state to live widget instances;
- abort/destroy widget instances when their reference disappears or their containing block is destroyed.

BlockDataSchema.mapRichText fieldKey values and BlockInstance.editableFields fieldKey values must describe the same stable logical fields. InlineProjectionRuntime uses this mapping; it must not guess plugin data paths.

During BlockInstance.read synchronization, values returned for schema-declared rich-text fields are not trusted as the final serialization. Core serializes the matching actual EditableField.element, recognizes owned widget nodes by object identity, sanitizes/canonicalizes that field, and replaces the corresponding field in the read data through BlockDataSchema.mapRichText. This prevents forged widget attributes from becoming persistence after innerHTML stringification.

A schema-declared editable rich-text field without exactly one matching live EditableField key is a contract error while the block is editable. Duplicate field keys are rejected.

Inline insertion is model-first:

    resolve logical selection
      -> allocate stable widget id
      -> validate/encode widget payload
      -> insert {{id}} into the selected canonical rich-text field
      -> add block.inline[id]
      -> commit one transaction
      -> reconcile the widget projection

Trigger-driven mention/autocomplete flows may keep transient query text in native DOM while the user is typing. Choosing a result commits one transaction that replaces the query range with a canonical placeholder and creates its inline record.

Renderer-side widget support uses the same InlineWidgetSchema but a separate read-only renderer:

    interface InlineWidgetRenderer<D extends JsonObject> {
      readonly type: string
      readonly styles?: readonly string[]
      readonly schema: InlineWidgetSchema<D>

      render(
        id: string,
        data: Readonly<D>,
        context: RendererContext
      ): HTMLElement

      destroy?(element: HTMLElement): void
    }

Renderer does not reuse interactive editor widget instances.

### 5.3. Canonical rich-text operations

Model-first widget insertion and trigger replacement require logical-offset operations on canonical HTML. Do not manipulate the HTML string by character index.

Introduce a neutral RichTextOperations helper that operates on sanitized canonical rich text in a detached document.

    type RichTextReplacement =
      | { kind: "text"; text: string }
      | { kind: "html"; html: string }
      | { kind: "inline-reference"; id: string }

Required semantics:

    interface RichTextOperations {
      replaceRange(
        html: string,
        inline: Readonly<Record<string, InlineWidgetRecord>> | undefined,
        range: { start: number; end: number },
        replacement: RichTextReplacement,
        ownerDocument: Document
      ): string
    }

Logical positions use the same rules as SelectionBookmark:

- UTF-16 units for ordinary text;
- BR is one unit;
- a {{id}} reference is one unit only when id has a corresponding canonical inline entry;
- an unmatched {{...}} token is ordinary author text, not an active widget.

RichTextReplacement supports sanitized text/HTML and a dedicated inline-reference replacement. Inline widget insertion never concatenates {{id}} directly into arbitrary HTML.

The result is sanitized/canonicalized before entering DocumentState.

Use this helper for at least:

- programmatic inline-widget insertion;
- trigger/autocomplete commit;
- canonical range deletion/replacement where a model-first path is used;
- tests that round-trip logical selection offsets between live DOM and canonical HTML.

## 6. Block plugin v2

Separate plugin definition from mounted block instance.

    interface BlockPluginDefinition<D extends JsonObject = JsonObject> {
      readonly type: string
      readonly title: string
      readonly icon: string
      readonly styles?: readonly string[]
      readonly locale?: Readonly<Record<string, Readonly<Record<string, LocaleValue>>>>
      readonly toolbox?: readonly ToolboxEntry[]
      readonly schema: BlockDataSchema<D>
      readonly capabilities?: BlockCapabilities<D>

      setup(
        context: BlockPluginRuntimeContext
      ): BlockPluginRuntime<D>
    }

    interface BlockPluginRuntimeContext {
      readonly ownerDocument: Document
      readonly signal: AbortSignal

      t(key: string, fallback?: string): string
    }

    interface BlockPluginRuntime<D extends JsonObject> {
      create(
        initial: Readonly<D>,
        context: BlockInstanceContext<D>
      ): BlockInstance<D>

      destroy(): void
    }

A definition is an immutable descriptor and may be reused across editor instances. setup creates one editor-scoped runtime that owns editor-scoped resources and is destroyed exactly once with that editor. Configuration captured by the definition must be immutable. Localization is supplied through the editor-scoped runtime context; do not mutate definitions with setI18n-style setters.

ExtensionRegistry owns runtime setup/teardown and stylesheet reference counting per ownerDocument. Definition setup must provide a strong exception guarantee: if setup throws, it must not leak listeners, styles or external resources. Previously created runtimes are cleaned by the surrounding LifecycleScope.

Each document block owns a separate BlockInstance.

    interface BlockInstance<D extends JsonObject> {
      readonly element: HTMLElement

      read(): D

      update?(
        next: Readonly<D>,
        previous: Readonly<D>
      ): void

      editableFields?(): readonly EditableField[]

      setReadOnly(readOnly: boolean): void

      focus?(target?: FocusTarget): void

      destroy(): void
    }

Required invariants:

- one instance belongs to one block ID;
- an instance is never rebound to a different block;
- ordinary per-block state lives directly inside the instance;
- WeakMap keyed by block DOM is not the normal per-block state mechanism;
- destroy is synchronous and idempotent;
- setReadOnly is synchronous, idempotent and reversible;
- update is optional;
- if update is absent, only the affected block may be recreated;
- lack of update never authorizes full-document rebuild;
- each instance receives an AbortSignal cancelled on block removal, replacement and editor destruction;
- asynchronous completion after abort is ignored.

BlockInstance.read is not used by save. It is only a synchronization seam for native DOM editing or an explicit plugin DOM mutation.

## 7. Stable editable fields and selection bookmarks

Replace fieldIndex as the durable field identity.

    interface EditableField {
      readonly key: string
      readonly element: HTMLElement
      readonly mode: "rich-text" | "plain-text"
    }

Examples:

    paragraph:
      text

    quote:
      text
      caption

    list:
      item:<stable-item-id>

    checklist:
      item:<stable-item-id>

    columns:
      column:<stable-column-id>

    table:
      cell:<stable-row-id>:<stable-cell-id>

Logical selection coordinates:

    interface LogicalPoint {
      blockId: string
      fieldKey?: string
      offset: number
      affinity?: "forward" | "backward"
    }

    interface SelectionBookmark {
      anchor: LogicalPoint
      focus: LogicalPoint
    }

A collapsed caret has equal anchor/focus. Cross-block selections are represented by different logical points and preserve direction.

Variable-length structured blocks must persist subfield identity in their v2 plugin data schema. Do not use array index as a durable field identity. At minimum:

- List items receive stable item IDs;
- Checklist items receive stable item IDs;
- Columns receive stable column IDs;
- Table rows and cells receive stable IDs.

Their v1 plugin-data migrations generate deterministic block-local IDs from legacy positions (for example legacy-item-0 / legacy-row-0 / legacy-cell-0-0). Newly inserted items/rows/cells receive fresh block-local IDs. Schemas reject duplicate live IDs. Reorder preserves IDs.

Offset semantics must remain deterministic across editor/renderer realms:

- offsets are UTF-16 code units for text;
- BR counts as one logical unit;
- one inline widget counts as one logical unit;
- widget labels/content never contribute to the surrounding rich-text offset.

History, rollback and document replacement restore selection by blockId + stable fieldKey + logical offset, never by positional field index.

Selection restoration is best-effort and must not invalidate an otherwise committed transaction. If a bookmarked block/field no longer exists, use a deterministic nearest surviving block/field fallback and clamp the logical offset.

## 8. Explicit capability contracts

Replace scattered optional-method discovery with an explicit capability object.

    interface BlockCapabilities<D extends JsonObject> {
      merge?: MergeCapability<D>
      split?: SplitCapability<D>
      conversion?: ConversionCapability<D>
      paste?: PasteCapability<D>
      settings?: SettingsCapability<D>
      inlineControls?: InlineControlsCapability<D>
      shortcuts?: ShortcutCapability
    }

Core may branch on capability presence. It must not probe arbitrary plugin methods throughout unrelated modules.

Settings/paste/controls are model-first contracts:

    interface PasteInput {
      kind: "text" | "html" | "file"
      text?: string
      html?: string
      file?: File
    }

    interface PasteCapability<D extends JsonObject> {
      parse(input: PasteInput): D | null
    }

    interface SettingsAction {
      id: string
      title: string
      icon?: string
    }

    interface SettingsCapability<D extends JsonObject> {
      actions(data: Readonly<D>): readonly SettingsAction[]
      apply(data: Readonly<D>, actionId: string): D
    }

    interface InlineControlsContext<D extends JsonObject> {
      readonly ownerDocument: Document
      readonly selection: BlockSelection | null

      getData(): Readonly<D>
      updateData(producer: (current: Readonly<D>) => D): void
    }

    interface InlineControlsCapability<D extends JsonObject> {
      render(context: InlineControlsContext<D>): HTMLElement | null
    }

    interface ShortcutCapability {
      bindings(): readonly KeyboardBinding[]
    }

Settings/inline control UI receives scoped contexts whose persisted changes ultimately call BlockInstanceContext.updateData; UI objects do not receive managers.

### 8.1. Merge

    interface MergeCapability<D> {
      merge(
        target: Readonly<D>,
        source: Readonly<D>
      ): D
    }

Merge operates on canonical data, not by mutating another block DOM.

### 8.2. Split

    interface SplitCapability<D> {
      split(
        current: Readonly<D>,
        selection: BlockSelection
      ): {
        current: D
        inserted: {
          type: string
          data: JsonObject
        }
      } | null
    }

Core must not assume a field named text.

If product semantics require "Enter creates the configured default block", represent that as an explicit command policy. Do not document "same type" while unconditionally inserting defaultBlockType.

### 8.3. Conversion

    interface ConversionCapability<D> {
      export(data: Readonly<D>): ConversionData
      import(data: ConversionData): D

      splitSelection?(
        data: Readonly<D>,
        selection: BlockSelection
      ): SelectionConversionResult<D> | null
    }

Core must not know plugin-specific data shapes.

## 9. Block instance mutation context

Plugins do not receive managers.

    interface BlockInstanceContext<D extends JsonObject> {
      readonly ownerDocument: Document
      readonly signal: AbortSignal

      getData(): Readonly<D>

      updateData(
        producer: (current: Readonly<D>) => D
      ): void

      commitDomMutation(
        operation: () => void
      ): void

      requestSplit(selection?: BlockSelection): void
      requestExit(): void

      isReadOnly(): boolean
    }

### 9.1. updateData

Preferred path for controls whose next persisted state can be calculated without editing DOM first.

    plugin action
      -> updateData
      -> schema encode/normalize
      -> transaction
      -> canonical model
      -> reconciler
      -> BlockInstance.update
      -> post-commit events

### 9.2. commitDomMutation

Use only where Range/contenteditable APIs naturally mutate DOM.

The callback must be synchronous.

    capture canonical before-state
      -> execute synchronous DOM mutation
      -> BlockInstance.read
      -> RichTextCodec / schema
      -> block update change
      -> commit

Promise-returning callbacks are forbidden.

Async work:

    start async operation
      -> await outside transaction
      -> verify AbortSignal
      -> updateData with resolved value

Remove notifyChanged compatibility behavior from the v2 plugin contract.

## 10. DocumentRuntime seam

Applications and plugins do not use DocumentStore directly.

Internal interface consumed by EditorFacade and InteractionRuntime:

    interface DocumentRuntime {
      get(id: string): Readonly<BlockRecord> | undefined
      list(): readonly Readonly<BlockRecord>[]
      export(): EditorDocumentV2

      transact<T>(
        metadata: TransactionMetadata,
        operation: (tx: DocumentTransaction) => T
      ): T

      replace(
        document: EditorDocumentV2,
        metadata: TransactionMetadata
      ): void

      undo(): boolean
      redo(): boolean

      readonly canUndo: boolean
      readonly canRedo: boolean
    }

DocumentTransaction provides only model operations:

    interface NewBlockInput {
      type: string
      data?: JsonObject
      tunes?: BlockTunes
      inline?: Record<string, InlineWidgetRecord>
    }

    interface DocumentTransaction {
      insert(index: number, block: NewBlockInput): string
      update(id: string, next: BlockRecord): void
      remove(id: string): void
      move(id: string, to: number): void
      convert(id: string, type: string, data: JsonObject): void
    }

DocumentStore mutation is private to DocumentRuntime.

## 11. Reversible change model

History and rollback use one change representation rather than duplicated forward/inverse snapshots.

    type DocumentChange =
      | {
          kind: "block.insert"
          index: number
          block: BlockRecord
        }
      | {
          kind: "block.remove"
          index: number
          block: BlockRecord
        }
      | {
          kind: "block.update"
          id: string
          before: BlockRecord
          after: BlockRecord
        }
      | {
          kind: "block.move"
          id: string
          from: number
          to: number
        }
      | {
          kind: "document.replace"
          before: CanonicalDocument
          after: CanonicalDocument
        }

A change can be applied forward or backward.

Undo applies changes in reverse transaction order and backward direction.

Redo applies changes in original transaction order and forward direction.

document.replace is allowed only for:

- public editor.render;
- public clear when represented as replacement;
- explicit whole-document application replacement;
- initial load, which is not added to history.

Ordinary editing, plugin operations, conversion, split, merge, move and native input must not use document.replace.

Whole-document replacement may be O(N) and may store O(N) before/after canonical data. It does not store export time metadata. This is an explicit exceptional operation, not the normal history representation.

## 12. Single transaction engine

Preserve the existing CommandDispatcher atomicity guarantees but move them into the single DocumentRuntime transaction mechanism.

Transaction origins:

    type RecordedTransactionOrigin =
      | "user"
      | "native-input"
      | "plugin"
      | "external"

    type CommitOrigin =
      | RecordedTransactionOrigin
      | "history"

Transaction record:

    interface TransactionRecord {
      id: number
      origin: RecordedTransactionOrigin
      name: string
      changes: readonly DocumentChange[]
      selectionBefore?: SelectionBookmark
      selectionAfter?: SelectionBookmark
      historyGroup?: string
    }

One outer transaction operates against an isolated draft rather than mutating the committed DocumentState incrementally:

1. capture logical selectionBefore;
2. build a draft state and reversible DocumentChange journal from the current immutable state;
3. normalize/validate every changed known block/widget/tune while building the draft;
4. prepare required projection changes against the draft;
5. apply the prepared projection;
6. atomically replace the committed DocumentState reference with the validated draft; this swap must not invoke extension/user code;
7. capture selectionAfter on a best-effort contained path;
8. push the complete immutable record to history;
9. enqueue public observations and onChange scheduling.

The transaction commit point is the canonical-state swap. Everything that can invoke extension code must happen before that point or as contained post-commit observation.

HistoryStore.push, canonical-state swap and internal queue bookkeeping must not invoke extension/user code.

Failure before the canonical-state swap:

- discard the draft;
- destroy staged new block/widget instances;
- recover any live projection already touched by browser input or plugin update from the committed before-state;
- history is unchanged;
- onChange is not scheduled;
- public document-change events are not delivered.

If an extension update partially mutates live DOM and then throws, core must not assume calling update(previous) is safe. Destroy/recreate the affected projection from the committed before-state when needed. Normal successful updates preserve identity; failure recovery may replace the affected instance.

If recovery of canonical projection also fails because extension code is irrecoverably broken, mark the editor runtime failed, stop further mutations, preserve/export the last committed DocumentState, and report an AggregateError through diagnostics. Do not continue with a knowingly divergent model/DOM pair.

Nested transactions:

- join the outer record;
- never create an independent history entry;
- nested failure poisons the outer transaction;
- catching a nested exception inside plugin/application code does not convert the outer transaction to success.

Reentrant transaction from a post-commit observer is a new transaction and is queued after the current transaction's public observations.

## 13. Remove event-driven internal history coordination

Delete internal production use of:

    UNDO_BATCH_START
    UNDO_BATCH_END
    HISTORY_COMMIT as an internal coordination signal
    UndoManager.beginBatch
    UndoManager.endBatch
    UndoManager.configureCommandActivity
    CommandDispatcher.configureCommit
    CommandDispatcher.configureRollback
    history correctness through WILL_CHANGE
    history correctness through CHANGED

Remove public WILL_CHANGE in v2. External code must not execute inside the transaction prelude.

Keep document/history observations post-commit only.

Recommended v2 observations:

    document:changed
    history:changed
    transaction:committed
    readOnly:changed

transaction:committed replaces the old history:commit use case without participating in internal correctness. Its public payload is immutable and contains at least commit origin, transaction name/history action, and a sanitized change summary; it must not expose internal mutable BlockRecord references. Undo/redo observations use origin "history" with action "undo" or "redo".

Public observer failures are contained and reported through diagnostics. They must not alter committed state or interrupt internal queues.

## 14. HistoryStore

HistoryStore stores committed TransactionRecord values.

    interface HistoryStore {
      push(record: TransactionRecord): void
      takeUndo(): TransactionRecord | undefined
      takeRedo(): TransactionRecord | undefined
      clear(): void
      readonly canUndo: boolean
      readonly canRedo: boolean
    }

Normal history memory is proportional to changed blocks and changed payload size, not total document size.

### 14.1. Coalescing

Debounce/timing is allowed only to merge already-correct committed records.

Correctness must not depend on a timer firing.

Adjacent native input records may coalesce only when all are true:

- same block ID;
- same fieldKey;
- compatible input type;
- same historyGroup;
- no structural change between records;
- no intervening non-input transaction;
- composition policy permits merge.

Starting a new committed branch after undo invalidates redo immediately, independent of timers.

When coalescing adjacent update records:

- preserve the first record's before value and selectionBefore;
- preserve the last record's after value and selectionAfter;
- do not retain intermediate block payloads;
- never coalesce across insert/remove/move/convert/document.replace.

### 14.2. Undo/redo replay

Undo and redo use the same validation-safe projection/recovery machinery but run in history replay mode.

History replay:

- does not call HistoryStore.push;
- does not clear the opposite history branch except through the normal takeUndo/takeRedo transfer;
- uses CommitOrigin "history" for public observations;
- undo restores selectionBefore;
- redo restores selectionAfter;
- emits document:changed, transaction:committed and history:changed after successful replay;
- schedules onChange from canonical model after successful replay;
- does not re-run block/widget migrations because history records contain already-canonical immutable records.

A failed history projection leaves the history cursor and committed DocumentState at the pre-replay position.

## 15. NativeInputController

Create one module responsible for browser-owned editable mutations.

Handle:

- beforeinput;
- input;
- compositionstart;
- compositionend;
- cancelled beforeinput;
- paste input sequences;
- deletion;
- browser autocorrect-compatible sequences;
- input events that arrive without a matching beforeinput.

### 15.1. Normal input

Canonical model remains the before-state until input is committed.

    beforeinput
      -> resolve blockId + fieldKey
      -> capture selection metadata / input type
      -> browser mutates editable DOM
      -> input
      -> BlockInstance.read for affected block only
      -> serialize matching actual EditableField DOM
      -> translate only owned widget element identities to canonical {{id}} references
      -> replace schema-declared rich-text fields in the read data
      -> RichTextCodec / block schema
      -> prune locally removed widget references
      -> one block.update change
      -> commit

No full document capture is required before input because DocumentState already contains the before-state.

If input occurs without an active beforeinput session, use the still-canonical model as the before-state and create a native-input transaction with the best available selection metadata.

### 15.2. Source DOM projection rule

For a successful native input or commitDomMutation transaction, the source block DOM has already changed.

The reconciler must support an origin hint indicating that the source instance is the producing projection.

For that source instance:

- do not blindly call update after every keystroke;
- canonical model remains authoritative;
- DOM may remain semantically equivalent but byte-noncanonical during active editing;
- save still serializes canonical model;
- undo/redo/rollback/external updates must project canonical state back through update or recreate.

The optimization is allowed only when the native mutation cannot leave untrusted active markup in the live DOM. Plain text insertion, deletion and composition may use the source projection path after validation. Paste, drop, rich HTML insertion and any input class that can introduce markup must either sanitize before DOM insertion or reconcile the affected field to sanitized canonical DOM before the transaction is publicly committed. If sanitization removes an element, attribute, URL or other active content, the source DOM must be rewritten before post-commit observers run.

This prevents caret loss and unnecessary DOM rewriting without weakening the HTML trust boundary.

### 15.3. IME

During composition:

- structural shortcuts are disabled;
- intermediate composition input does not create separate history entries;
- compositionend synchronizes the final affected block into one logical native-input record;
- undo reverts the completed composition as one logical input step.

### 15.4. Clipboard and rich paste

Do not rely on uncontrolled browser rich-paste DOM as a persistence path.

For rich-text paste/drop:

1. intercept before active markup is committed when the browser allows it;
2. parse clipboard/drop data into a detached untrusted representation;
3. sanitize and canonicalize rich HTML;
4. convert recognized block/inline structures into canonical model changes;
5. commit through DocumentRuntime;
6. let BlockReconciler project the committed result.

For multi-block paste, split/merge and cross-block deletion, Clipboard must produce DocumentTransaction operations. It must not directly reorder/remove live block DOM.

Async media paste/upload:

    parse request
      -> start/await async work outside transaction
      -> verify owning block/widget signal is still active
      -> commit resolved canonical data in one short transaction

If the platform forces a native DOM mutation before interception, the source-DOM recovery/sanitization rule in 15.2 applies before public commit.

### 15.5. Serialization/validation failure

If read, sanitization, canonicalization or schema normalization fails:

- invalid data does not enter DocumentState;
- history does not change;
- affected block projection is restored from canonical before-state;
- unrelated block instances are untouched;
- a diagnostic is emitted.

## 16. Incremental BlockReconciler

BlockReconciler is the only block-level model-to-editor-DOM projection module. It coordinates InlineProjectionRuntime and core tune projection; block plugins do not own those cross-cutting persistence layers.

Projection order for a block is:

1. create/update plugin-owned block data projection;
2. reconcile canonical inline widget references for its stable editable fields;
3. apply normalized core tunes such as textAlign;
4. restore logical selection when requested.

The alignment tool is model-first in v2: it updates tunes.textAlign for affected blocks through one transaction and lets the reconciler apply style.textAlign. TEXT_ALIGN_TUNE_ATTRIBUTE must not remain a persistence transport. Paragraph/Heading do not write alignment back into plugin data.

Required behavior:

### block.update

- resolve current instance by block ID;
- if type is unchanged and update exists, call update(next, previous);
- if update is absent, recreate only that block;
- do not touch unrelated instances.

### block.insert

- prepare one new instance;
- attach only after preparation succeeds.

### block.remove

- detach and destroy only the removed instance.

### block.move

- move the existing block DOM node;
- keep the BlockInstance;
- do not call create, render or destroy.

### type conversion

- destroy the old instance;
- create one new instance;
- preserve block ID when conversion semantics preserve identity.

### document.replace

Use keyed reconciliation by block ID:

    missing before, present after
      -> insert

    present before, missing after
      -> remove

    same id, different type
      -> replace one block

    same id, unchanged canonical record
      -> reuse instance unchanged

    same id, changed record
      -> update/recreate one block

    same id, changed position
      -> move existing node

Do not compare only array indices.

### 16.1. Projection atomicity

Prepare all new/replacement instances before destructive live-DOM changes.

If any preparation fails:

- destroy staged instances;
- leave current live projection valid;
- let transaction rollback canonical changes.

For operations that cannot be fully staged, define a reversible projection step and test rollback explicitly.

BlockInstance.update and InlineWidgetInstance.update are extension code. Their v2 contract requires a strong exception guarantee where practical, but core still contains failure by recreating the affected projection from committed canonical state rather than trusting a reverse update call.

A block update that changes only block.inline must reconcile only affected inline widget instances; it must not recreate the block plugin instance.

## 17. Read-only transition

setReadOnly is not a document transaction and does not create history.

Target flow:

    validate no active mutation
      -> unmount/mount edit-only InteractionRuntime pieces as required
      -> call setReadOnly on existing BlockInstances
      -> apply read-only to owned InlineWidgetInstances
      -> enforce core read-only DOM invariants
      -> publish readOnly:changed
      -> publish history:changed if command availability changed

Requirements:

- block IDs unchanged;
- BlockInstance identity unchanged;
- existing DOM node identity unchanged where the plugin obeys the v2 contract;
- iframe nodes survive;
- image nodes survive;
- carousel/widget local view state survives;
- history stack survives;
- no onChange;
- no document:changed.

Failure policy:

- setReadOnly must be reversible;
- if one instance throws, attempt to restore already-transitioned instances to the previous mode;
- if an extension cannot reverse its partial mode mutation, recreate only the affected block/widget projections from canonical state in the previous mode;
- do not publish readOnly:changed on failed transition;
- if canonical projection cannot be recovered, enter the same failed-runtime state defined for transaction recovery.

## 18. Public editor interface v2

Remove mutable document DOM from the public application interface:

    EditorBlockView.element
    EditorBlockView.contentElement
    IEditor.rootElement

Applications already own the holder passed to createEditor, so JavaScript in the same page can still inspect or alter descendants. The architecture guarantee is therefore not "DOM access is impossible"; it is that descendant DOM is unsupported, is not a persistence API, and cannot change canonical state merely by being mutated. save/export reads only the model. Internal DOM structure inside the holder is not a supported interface.

Expose immutable snapshots.

    interface EditorBlockSnapshot {
      readonly id: string
      readonly type: string
      readonly dataVersion?: number
      readonly data: Readonly<JsonObject>
      readonly tunes?: Readonly<BlockTunes>
      readonly inline?: Readonly<Record<string, InlineWidgetRecord>>
      readonly revision?: string | number
    }

    interface BlockUpdate {
      data?: JsonObject
      tunes?: BlockTunes | null
    }

    type InsertBlockInput = NewBlockInput

Blocks interface:

    interface EditorBlocksApi {
      get(id: string): EditorBlockSnapshot | undefined
      list(): readonly EditorBlockSnapshot[]

      insert(input: InsertBlockInput): string

      update(
        id: string,
        producer: (
          current: EditorBlockSnapshot
        ) => BlockUpdate
      ): void

      remove(id: string): void
      move(id: string, to: number): void
      convert(id: string, type: string): void
      focus(id: string, target?: FocusTarget): void
    }

All persisted mutation methods delegate to DocumentRuntime transactions. focus is not a persisted mutation and delegates to InteractionRuntime.

Application-facing snapshots cannot mutate editor state by reference. Readonly in declarations is not sufficient by itself: return detached/deep-cloned JSON values (or a deeply frozen detached representation) at consumer trust boundaries. The same rule applies to values passed into public producer callbacks.

BlockUpdate.data omitted means unchanged. BlockUpdate.tunes omitted means unchanged; null clears tunes. An empty update is a no-op. update cannot change type or block identity.

EditorBlocksApi.update cannot directly replace block.inline; inline payload/reference changes go through inline widget commands so placeholder/map invariants stay atomic.

IEditor retains a model-first programmatic widget insertion surface:

    insertInlinePlugin(
      type: string,
      data?: JsonObject
    ): boolean

It resolves the current logical selection, validates the widget schema, updates canonical rich text plus block.inline in one transaction, and returns false for read-only/no-valid-selection/unknown-type cases. It does not insert widget DOM first.

save/export semantics:

- save/export materializes block order from canonical DocumentState and deep-clones JSON for the caller;
- save/export may set time = Date.now() at serialization time;
- time never creates a history difference and never causes a block/document update.

Public render semantics:

- editor.render(document) is one explicit document.replace transaction and one history step;
- initial createEditor data load is not a history step;
- internal undo/redo never re-records history;
- clear is one transaction.

Do not add an ambiguous skipHistory flag to render. If a later product requirement needs a non-undoable application reset, define a separate reset(document) contract that explicitly clears history.

Do not keep deprecated DOM getters as aliases.

## 19. Plugin-kit

Add public package entry:

    @shelamkoff/rector/plugin-kit

This is the supported extension utility interface.

Move/export only stable extension utilities required by plugins, including as needed:

- safe HTML sinks;
- sanitizer/canonicalizer helpers;
- editable-field helpers;
- text offset helpers;
- UID generation;
- keyboard binding contracts;
- menu keyboard helpers;
- stable extension constants.

Do not export:

- DocumentStore;
- TransactionEngine;
- HistoryStore;
- BlockReconciler;
- BlockManager;
- EventBus emitter;
- SelectionManager;
- PopupManager;
- internal lifecycle ownership objects.

Add a source architecture gate:

    plugins/** must not import core/**
    inline-plugins/** must not import private core/**

Do not add exceptions to make existing violations pass. Move required utilities to plugin-kit or a neutral shared module.

Built-in source plugins import the source plugin-kit module by repository-relative path; they must not self-import the published package specifier while the package is being built. Third-party consumers use @shelamkoff/rector/plugin-kit. Both routes resolve to the same public implementation and declarations.

Extension code that creates or inspects DOM uses context.ownerDocument and its defaultView. Add a source/realm regression gate against accidental global document/window use in extension paths where a concrete owner realm is available.

## 20. Keyboard architecture

Do not introduce another keyboard registry.

Evolve ShortcutRegistry into one KeyboardRouter module.

    interface KeyboardContext {
      blockId?: string
      fieldKey?: string
      target: "editor" | "editable" | "native-control"
      composing: boolean
      readOnly: boolean
    }

    interface KeyboardBinding {
      key: string
      layer: "plugin" | "block" | "editor"
      priority?: number

      when?(context: KeyboardContext): boolean

      handle(
        event: KeyboardEvent,
        context: KeyboardContext
      ): "handled" | "pass"
    }

Routing order:

    native-control ownership
      -> plugin binding
      -> block binding
      -> editor structural binding
      -> browser default

Rules:

- stopPropagation is not the core/plugin coordination protocol;
- defaultPrevented is not the capability protocol;
- native input, textarea, select and plugin-native controls retain native behavior unless a documented plugin binding owns the key;
- IME/composition never triggers structural shortcuts;
- document-structural behavior is registered through KeyboardRouter;
- built-in plugins must not retain separate structural keydown pipelines after migration;
- local native-widget key listeners are allowed only when they cannot mutate document structure.

## 21. Renderer v2

Renderer and editor share:

- BlockRecord envelope;
- BlockDataSchema;
- InlineWidgetSchema;
- block/widget data migrations;
- RichTextCodec;
- normalized core tune semantics;
- URL/security policy;
- pure formatting helpers.

Renderer contract:

    interface BlockRenderer<D extends JsonObject> {
      readonly type: string
      readonly styles?: readonly string[]
      readonly schema: BlockDataSchema<D>

      render(
        block: Readonly<BlockRecord<D>>,
        context: RendererContext
      ): HTMLElement

      destroy?(element: HTMLElement): void
    }

Custom renderer registration without a schema is rejected.

Inline widget renderers are registered separately by type and must use the matching InlineWidgetSchema. Unknown widget types remain inert placeholder text/data and must never execute arbitrary stored markup.

Renderer applies tunes.textAlign after block rendering. It must not read legacy ParagraphData.align/HeadingData.align after v2 normalization.

Do not merge editable editor DOM and static renderer DOM into one large mode-dependent implementation.

Share data/security/pure presentation logic only.

Keep separate:

- editable DOM;
- focus and selection behavior;
- editor controls;
- static renderer DOM lifecycle.

## 22. Popup and inline mutation responsibilities

PopupManager must manage popup lifecycle/positioning only.

Do not use PopupManager as InlinePluginContext merely to gain mutate/notify behavior.

Split into:

    PopupManager
      popup positioning and lifecycle

    InlineMutationContext
      scoped inline document mutation

    InlinePluginRuntime
      plugin lifecycle and mutation binding

Inline persistent changes enter DocumentRuntime transactions.

InlineWidgetContext.updateData is the only persisted widget-data mutation path. InlineMutationContext is for rich-text range/tool operations around the containing block; it does not scrape widget DOM for persistence.

Remove notifyChanged, getData(element) persistence and hydrate-as-state-recovery compatibility after migration.

## 23. Composition root

After the contracts above stabilize, refactor createEditor wiring.

Delete post-construction dependency mutation such as:

    setCommandDispatcher
    setInlinePluginRegistry
    setInlinePluginContext
    setPluginStructuralCommands
    configureRollback
    configureCommit
    configureHistory
    configureReadOnlyTransition
    configureCommandActivity

Mandatory dependencies are constructor/factory arguments.

Optional behavior is expressed as narrow interfaces.

Do not introduce a general dependency injection container.

The goal is locality and explicit construction, not a new framework.

## 24. Inline tools and bundle architecture

Core must not statically import the complete built-in inline-tool preset.

Remove:

    core -> createDefaultInlineTools -> every built-in inline tool

Core should accept explicit configured inline tools/loaders.

Provide a separate convenience preset if required:

    @shelamkoff/rector/preset

or lazy built-in loaders with dynamic import.

Extension-specific factories such as mention must live at extension entry points, not core re-exports.

### 24.1. Bundle measurement

Replace misleading benchmark meanings.

Measure separately:

- core runtime;
- core + Paragraph;
- default interactive editor;
- full preset initial eager payload;
- full preset total lazy payload.

Bundle CI must run the enforced mode after the entries and budgets are corrected.

Do not create a second verification workflow. Extend the existing verify.yml.

Do not reduce measured size by changing the benchmark to exclude code consumers actually receive.

### 24.2. Third-party runtime packaging

Remove checked-in generated third-party runtime bundles from source where an ordinary package dependency can provide the same runtime:

    shared/runtime/highlightBundle.js
    shared/runtime/jszip.js

Replace them with lazy dynamic imports behind the existing narrow runtime loaders.

Requirements:

- use declared package dependencies with versions resolved by the repository lockfile;
- do not load from a CDN;
- preserve lazy loading so highlight/ZIP code is absent from the initial editor payload unless requested;
- keep runtime loader injection/test seams for deterministic tests;
- package-consumer tests prove the dependencies resolve from the packed package;
- license/NOTICE generation or maintenance remains accurate;
- dependency updates become visible to standard dependency/security tooling instead of requiring manual regeneration of vendored bundles.

If a concrete packaging constraint makes one vendored artifact unavoidable, document that constraint and add a reproducible generation script plus byte/source/version verification. Do not keep an opaque checked-in bundle with no reproducible provenance.

### 24.3. Generated documentation artifacts

docs/reference and docs/ru/reference are generated by the documentation sync pipeline and are already ignored as generated output. Remove tracked generated copies from the v2 source tree unless GitHub Pages deployment demonstrably requires them in git.

CI/docs gates must:

- generate references from canonical README sources;
- build/smoke-test generated docs;
- fail if generation would require committed source edits;
- keep one source of truth for extension documentation.

## 25. Complexity and performance contracts

For content-only changes affecting k blocks in a document of N blocks:

- model update work is proportional to k plus changed payload size;
- history storage is proportional to k plus changed payload size;
- projection work is proportional to affected blocks;
- unrelated plugin read/update/create/destroy calls are zero.

Structural order operations may require O(N) array/order-vector work. They must still avoid O(N) plugin lifecycle work.

Full export/save is O(N) because it serializes the document model, but it performs zero BlockInstance.read and zero InlineWidgetInstance DOM serialization calls.

Whole-document replacement is O(N) by definition.

Required scenarios:

### 1,000 blocks, one text edit

Unrelated blocks:

    read = 0
    update = 0
    create = 0
    destroy = 0

Undo and redo must not render 1,000 blocks.

### Move one block

For the moved block:

    destroy = 0
    create = 0

DOM node and BlockInstance identity are retained.

### Unrelated undo beside iframe/embed

Unrelated iframe element identity is retained.

### Read-only transition

For all blocks:

    destroy = 0
    create = 0

Do not assert fragile wall-clock times in ordinary unit tests. Use structural call counts for deterministic regression tests and separate benchmarks for elapsed-time reporting/gates.

## 26. Security contracts

Required v2 security properties:

1. External documents are untrusted.
2. Plugin read results are untrusted until schema normalization.
3. Rich HTML is sanitized before canonical persistence.
4. Renderer sanitizes independently before active DOM.
5. Unknown block data never executes as a registered plugin of another type.
6. Unknown editor blocks are preserved inert/read-only.
7. Plugins receive block-scoped capabilities, not mutable global managers.
8. Public applications receive no mutable block DOM.
9. URL validation remains centralized.
10. JSON values are cloned at trust boundaries.
11. Non-JSON and prototype-bearing malformed data is rejected according to the existing security policy.
12. Trusted Types sinks remain centralized.
13. Failed transactions leave neither partial canonical changes nor partial committed projection.
14. Block destruction aborts outstanding plugin work.
15. Stale async results after block removal/conversion/destroy cannot mutate the document.
16. Public observer exceptions/rejections cannot escape into transaction correctness.
17. Fake data-inline-plugin/data-id attributes inserted by untrusted DOM are not accepted as owned widget identity.
18. A canonical inline payload is activated only by a registered plugin definition plus a canonical placeholder reference.
19. Core tune values are validated before application to DOM.
20. A registered plugin type with malformed or unsupported-future-version data is not activated merely because its type name matches.
21. Preserved inert data is never executed as editor/renderer/widget markup.

Required security regressions:

- malicious rich HTML;
- event-handler attributes;
- javascript-like URL schemes;
- malformed inline payload;
- prototype-pollution-shaped input;
- cross-realm DOM;
- stale async upload after remove;
- stale async result after conversion;
- failed plugin update rollback;
- renderer treatment of untrusted stored HTML;
- forged inline-widget DOM attributes;
- unknown inline plugin payload preservation without execution;
- invalid tunes.textAlign;
- known type with unsupported future block/widget dataVersion;
- malformed known payload in preserve versus strict mode.

## 27. Event ordering

Preserve deterministic causal FIFO ordering.

For transaction A:

1. A commits completely.
2. A public observations are enqueued.
3. If an A observer starts transaction B, B commits as a new transaction.
4. Remaining A observations are delivered before B observations.
5. Observer failures are contained and reported.

Internal state correctness must not depend on public observer execution.

onChange remains a debounced persistence notification built from canonical model export. It is not a transaction primitive.

## 28. TDD seams

Implementation tests must use these agreed seams.

### Seam A: public editor

Use:

    createEditor
    IEditor
    EditorBlocksApi
    undo / redo
    public events
    read-only mode

This is the main seam for transaction, history, reconciliation and observable lifecycle behavior.

### Seam B: public plugin v2 contract

Use fake/custom plugins registered through BlockPluginDefinition and BlockInstance interfaces.

Do not reach into private managers to verify plugin behavior.

### Seam C: renderer

Use:

    createEditorRenderer
    registerRenderer
    render
    destroy

### Seam D: pure schema modules

BlockDataSchema and pure canonicalization modules may have direct unit tests because their interface is intentionally pure and stable.

### Seam E: installed-package consumer

Verify built package through the package exports exactly as consumers do:

- NodeNext;
- Bundler;
- public declarations;
- package exports;
- dynamic extension entries.

Avoid tests coupled to private field/class names.

Do not add direct tests for private TransactionEngine or HistoryStore implementation if the same invariant is observable through DocumentRuntime/public editor behavior. A private algorithm may receive a focused unit test only when it is a pure module with a stable explicit interface and the behavior cannot be expressed economically at the public seam.

## 29. TDD execution rule

Every implementation item is a vertical red -> green -> refactor slice.

Required cycle:

1. choose one behavior at one agreed seam;
2. add one failing behavior test;
3. run it and verify it fails for the expected missing behavior;
4. implement the minimum production behavior;
5. run the focused test;
6. run the affected integration/browser/package gate;
7. refactor only while green;
8. continue with the next behavior.

Forbidden workflow:

    write all tests for a phase
      -> implement the entire phase

Tests describe observable behavior and must survive implementation refactors.

Mocks/fakes:

- do not mock DocumentRuntime internals in public editor tests;
- do not mock history/reconciler internals merely to count interactions;
- use a fake plugin through the public plugin contract to count create/read/update/setReadOnly/destroy;
- deterministic timers are allowed for coalescing behavior;
- browser-native selection/input/IME behavior belongs in the real browser harness.

## 30. Implementation order

### Phase 1: neutral data schemas and v2 document envelope

Implement:

- BlockRecord/dataVersion;
- BlockDataSchema;
- v1 -> v2 envelope migration;
- Paragraph neutral schema first;
- RichTextCodec;
- deterministic canonicalization;
- RichTextOperations with shared logical-offset semantics;
- core tune normalization;
- one-time data.align -> tunes.textAlign migration.

TDD slices:

1. legacy Paragraph document decodes to v2 canonical state;
2. canonical rich text is idempotent;
3. invalid Paragraph data is rejected;
4. unknown block survives unchanged;
5. editor/renderer both use the same Paragraph schema;
6. preserve mode keeps malformed/future-version known data inert while strict mode rejects it;
7. alignment exists only as tunes.textAlign in canonical v2 Paragraph/Heading data;
8. matching inline placeholder references count as one logical unit while unmatched {{...}} author text remains ordinary text.

Exit criteria:

- no duplicate Paragraph validation policy;
- v2 save emits dataVersion for Paragraph;
- unknown data is lossless.

### Phase 2: plugin-kit

Implement the public plugin-kit entry and source architecture gate.

Migrate Paragraph off private core imports first.

Then migrate other built-ins.

Exit criteria:

    plugins/** -> core/** private imports = 0
    inline-plugins/** -> private core/** imports = 0

Do not solve failures by adding source-gate exceptions.

### Phase 3: BlockPlugin v2

Introduce definition/instance/capability contracts.

Migrate in vertical order:

1. Paragraph;
2. Heading;
3. Quote;
4. List;
5. Checklist;
6. Table;
7. media/async plugins;
8. remaining built-ins.

For every plugin prove:

- per-block instance isolation;
- destroy exactly once;
- read-only transition;
- async abort where applicable;
- schema round trip;
- stable editable field keys;
- deterministic migration of variable rich-text subfield IDs where applicable.

After block plugin migration, migrate inline plugins to InlinePluginDefinition/InlinePluginRuntime/InlineWidgetInstance and model-owned payloads. Cover mention and color first, including trigger/autocomplete, paste patterns, programmatic insertion, read-only behavior and missing-plugin preservation.

Delete BlockPlugin v1 and old InlinePlugin getData/hydrate persistence contracts before phase exit.

### Phase 4: DocumentRuntime canonical model

Introduce canonical DocumentState behind current facade.

First slice:

    Paragraph
    editor.blocks.get
    editor.blocks.update

Then:

- insert;
- remove;
- move;
- convert;
- export/save;
- render/replace.

Exit criteria:

- public mutations change model first;
- inline widget payload and core tunes live in the model;
- save serializes model without block/widget DOM traversal;
- unsanctioned plugin/widget DOM mutation is not persisted.

### Phase 5: single transaction engine

Move current atomicity guarantees into DocumentRuntime transactions.

Slices:

1. one block update;
2. one structural insert;
3. nested transaction;
4. nested failure poisoning;
5. schema failure rollback;
6. plugin exception rollback;
7. post-commit reentrant transaction ordering.

Exit criteria:

- exactly one mutation transaction mechanism;
- no event-driven internal commit coordination required for migrated paths.

### Phase 6: NativeInputController

Slices:

1. normal Paragraph insertText;
2. deletion;
3. input without matching beforeinput;
4. grouped typing;
5. paste;
6. IME composition;
7. multi-field block;
8. inline Range mutation;
9. owned inline widget deletion;
10. rich paste/drop;
11. multi-block clipboard paste/delete.

Exit criteria:

- wireInputTracking markDirty + CHANGED persistence path removed;
- native text edits commit only the affected block;
- model remains persistence source.

### Phase 7: operation-based history

Implement HistoryStore over TransactionRecord changes.

Slices:

1. update undo/redo;
2. insert undo/redo;
3. remove undo/redo;
4. move undo/redo;
5. convert undo/redo;
6. typing coalescing;
7. redo invalidation;
8. explicit document.replace undo/redo without persisting/exporting time metadata.

Delete snapshot history for ordinary changes.

Remove:

    UNDO_BATCH_START
    UNDO_BATCH_END
    internal HISTORY_COMMIT coordination
    configureCommandActivity
    configureCommit
    configureRollback

Exit criteria:

- ordinary history storage contains only changed records;
- timer loss changes grouping only, never correctness.

### Phase 8: incremental BlockReconciler

Slices:

1. Paragraph update;
2. insert;
3. remove;
4. move;
5. convert;
6. undo update;
7. redo update;
8. keyed document.replace;
9. inline-payload-only update without block recreation;
10. staging/update failure recovery.

Exit criteria:

- unrelated block identity survives undo/redo;
- move uses existing node/instance;
- one update among 1,000 blocks causes no unrelated plugin lifecycle calls.

### Phase 9: read-only without remount

Move read-only transition to existing instances.

Test:

- Paragraph;
- iframe/embed;
- image;
- carousel/stateful plugin;
- inline widget with native controls;
- transition failure rollback.

Exit criteria:

- no full document render;
- no unrelated create/destroy.

### Phase 10: public interface hardening

Remove public block DOM and rootElement.

Add snapshot-based blocks interface.

Replace old pre-commit/history events with post-commit v2 events.

Update declarations, docs and consumer tests in the same vertical slices.

Do not add deprecated aliases.

### Phase 11: keyboard router

Evolve existing ShortcutRegistry.

Migrate:

1. undo/redo keys;
2. structural Enter;
3. Backspace merge;
4. List;
5. Checklist;
6. Table;
7. SlashCommands;
8. block settings;
9. inline tools.

Delete old structural keydown coordination after each migrated path is covered.

Exit criteria:

- one deterministic structural key routing module;
- IME/native controls pass through correctly.

### Phase 12: renderer schema integration

Require shared block schema at block renderer registration and shared widget schema at inline widget renderer registration.

Migrate each built-in block and inline widget renderer.

Add editor-save -> renderer contract coverage for every built-in type.

Exit criteria:

- one persisted data schema per block type;
- one persisted data schema per inline widget type;
- custom block/widget renderers cannot bypass schema validation.

### Phase 13: composition root cleanup

Only after the target interfaces above are stable:

- create DocumentRuntime factory;
- create InteractionRuntime factory;
- remove post-construction setters;
- split PopupManager from InlineMutationContext;
- remove obsolete composition glue.

Do not perform this phase early and then rewrite wiring again during contract changes.

### Phase 14: bundle/preset and generated-artifact cleanup

Remove static complete inline-tool dependency from core.

Introduce explicit/lazy preset.

Replace opaque checked-in highlight.js/JSZip runtime bundles with lazy package dependencies, or add reproducible provenance verification only if vendoring is proven necessary.

Remove tracked generated docs/reference outputs when the docs pipeline does not require them as source.

Correct benchmark semantics.

Extend verify.yml with enforced architecture, package-resolution, docs-generation and bundle gates.

## 31. Browser acceptance matrix

Before completion, browser coverage must include:

History:

- typing -> undo -> redo;
- split -> undo;
- merge -> undo;
- move -> undo;
- convert -> undo;
- document.render -> undo;
- undo failure leaves history/model at pre-replay state;
- nested failure;
- validation failure;
- plugin read/update failure;
- post-commit observer starting another transaction.

Identity:

- iframe survives unrelated undo;
- image node survives unrelated undo;
- carousel instance survives unrelated undo;
- moved block retains instance/node;
- read-only retains instance/node.

Selection:

- Paragraph caret;
- second field caret;
- caret after undo;
- selection after convert;
- selection after split;
- stable fieldKey behavior after list/checklist/table/columns structural changes;
- cross-block selection direction preserved where both endpoints survive.

Native input:

- Latin input;
- Cyrillic input;
- IME composition;
- Backspace;
- Delete;
- paste;
- autocorrect-compatible sequence;
- plugin-native input/textarea is not consumed as document structural input;
- deleting an inline widget prunes its canonical inline entry;
- forged data-inline-plugin markup is not adopted as a widget;
- programmatic insertInlinePlugin commits model first and restores caret after the inserted atomic widget.

Lifecycle:

- remove destroys once;
- conversion destroys old instance once;
- editor destroy destroys every live instance once;
- abort prevents stale async completion;
- inline widget destroy/abort is exactly once;
- no style/listener/external-instance leak.

Tunes/model:

- Paragraph/Heading legacy data.align migrates to tunes.textAlign;
- alignment undo/redo changes tunes only;
- renderer/editor apply the same normalized textAlign;
- revision clears on data/tunes/inline mutation but not move.

Security:

- active markup payloads remain inert;
- unsafe URL schemes rejected;
- malformed inline payload contained;
- unknown block inert;
- registered block/widget with unsupported future dataVersion remains inert in preserve mode;
- strict mode rejects unsupported/malformed activated payloads;
- cross-realm editing/rendering preserved.

## 32. CI and architecture gates

Keep the existing verify.yml. Do not add a duplicate verification workflow.

Required final gates:

- typecheck;
- unit tests;
- browser tests;
- physical history/browser history tests;
- heap gate;
- package consumer gate;
- docs/contracts;
- security browser tests;
- plugin source architecture audit;
- renderer/core dependency audit;
- enforced bundle budgets.

Keep the supported Node matrix aligned with package engines.

Architecture audit must fail production usage of removed legacy symbols/interfaces, including:

    UNDO_BATCH_START
    UNDO_BATCH_END
    configureCommandActivity
    configureCommit
    configureRollback
    setCommandDispatcher
    PublicBlockView.element
    PublicBlockView.contentElement
    IEditor.rootElement
    notifyChanged compatibility mutation path
    InlinePlugin.getData(element) persistence
    InlinePlugin.hydrate(element, ...) persistence/recovery
    ParagraphData.align v2 declaration
    HeadingData.align v2 declaration
    TEXT_ALIGN_TUNE_ATTRIBUTE persistence transport

Documentation/changelog references describing migration may remain, but runtime/type declarations must not expose legacy behavior.

## 33. Definition of done

Architecture:

- canonical DocumentState owns persisted editor state;
- DocumentRuntime is the single mutation/history seam;
- ordinary history is change-based;
- BlockReconciler is incremental/keyed;
- block plugins use per-block instances;
- plugin capabilities are explicit;
- inline widget payload is canonical model state with per-widget instances;
- text alignment has one canonical location in tunes.textAlign;
- plugin-kit is the supported extension utility interface;
- renderer/editor share block and inline-widget schemas;
- composition root has no mandatory post-construction dependency setters;
- one structural keyboard router exists.

Correctness:

- atomic rollback preserved;
- nested failure poisoning preserved;
- public observations are post-commit and FIFO;
- observer errors contained;
- undo/redo restores logical selection;
- native input/IME history is deterministic;
- structured editable field identities survive reorder/insert/delete;
- live-DOM and canonical rich-text logical offsets agree for BR/widgets;
- unknown, malformed-preserved and unsupported-future block/widget data are preserved inertly;
- migrations are deterministic and never downgrade unsupported future versions.

Security:

- rich text sanitized/canonicalized;
- renderer sanitizes independently;
- mutable document DOM removed from public interface;
- plugins cannot mutate global document managers;
- invalid plugin data cannot enter canonical state;
- stale async work is aborted/ignored;
- forged widget DOM cannot become canonical widget state;
- core tunes are validated before projection.

Performance:

- one-block typing does not serialize N blocks;
- one-block undo does not remount N blocks;
- move does not recreate the moved block;
- read-only does not recreate blocks;
- whole-document O(N) work is restricted to explicit whole-document operations/export;
- save/export performs no DOM serialization;
- inline-only updates do not recreate their containing block;
- corrected bundle budgets are enforced;
- optional highlight/ZIP runtimes remain lazy and are package-resolvable without opaque vendored source blobs.

Testing:

- work is implemented as vertical red -> green -> refactor slices;
- behavior tests use the agreed seams;
- browser behavior is tested in the browser harness;
- package behavior is tested as an installed/consumer package;
- performance regressions use structural call-count invariants plus separate benchmarks;
- heap and security gates pass.

Cleanup:

- target contract types have one canonical definition; no duplicate legacy/v2 aliases remain;
- old snapshot history is removed from ordinary edit paths;
- BlockPlugin v1 is removed;
- old DOM-scraped InlinePlugin persistence is removed;
- Paragraph/Heading data.align duplication is removed;
- compatibility mutation adapters are removed;
- batch history events are removed;
- private core imports from extensions are removed;
- stale docs/types for removed interfaces are removed;
- generated reference docs have one canonical source and are not simultaneously ignored and maintained as source artifacts;
- opaque vendored runtimes are removed or reproducibly generated/verified;
- there is no second way to perform the same persisted document mutation.
