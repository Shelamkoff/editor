# Configuration

`createEditor(config)` accepts one configuration object. Only `holder` and `plugins` are required. Rector validates both immediately and throws a `TypeError` when the holder is not an `HTMLElement` or plugins is not an array.

## Complete configuration shape

```ts
interface EditorConfig {
  holder: HTMLElement
  plugins: BlockPlugin[]
  inlineTools?: Array<string | InlineTool>
  inlinePlugins?: InlinePlugin[]
  data?: EditorDocument
  migrations?: DocumentMigration[]
  documentVersionPolicy?: 'preserve' | 'strict'
  readOnly?: boolean
  injectStyles?: boolean
  placeholder?: string
  autofocus?: boolean
  minHeight?: number
  defaultBlock?: string
  locale?: Record<string, LocaleValue>
  tuning?: DeepPartial<EditorTuning>
  onChange?: (data: EditorDocument) => void
  onReady?: () => void
  validationMode?: 'preserve' | 'strict'
  onValidationError?: (issue: BlockValidationIssue) => void
  onDiagnostic?: (diagnostic: EditorDiagnostic) => void
  diagnosticThresholds?: Partial<DiagnosticThresholds>
  theme?: string
}
```

## Every option at a glance

The table below is the complete public `EditorConfig` contract. A value described as “omitted” has no hidden callback or service behind it.

| Option | Required | Default | What it controls |
| --- | --- | --- | --- |
| `holder` | yes | — | The `HTMLElement` that receives the editor root. One holder can own only one live editor instance. |
| `plugins` | yes | — | Constructed block-plugin instances. Their unique `type` values define which block types the editor can load, create, convert, and save. At least one plugin is required. |
| `inlineTools` | no | all built-in tools | The formatting tools available in the inline toolbar. Strings select built-in tools by `type`; tool objects add or replace implementations. An empty array disables all global inline tools. |
| `inlinePlugins` | no | `[]` | Persistent widgets embedded in text, such as mentions or color swatches. These are different from formatting tools because their data is stored in the block's `inline` map. |
| `data` | no | one empty default block | The initial versioned document. Rector clones and normalizes it before plugins receive data; later mutations of the caller's object do not mutate the editor. |
| `migrations` | no | `[]` | Directed synchronous document migrations. Rector follows `from` → `to` links until the current document version is reached. |
| `documentVersionPolicy` | no | `'preserve'` | What to do when the incoming document has an unknown version or an incomplete migration chain. `preserve` applies every reachable migration and keeps the last structurally valid version; `strict` requires a complete chain and throws otherwise. |
| `readOnly` | no | `false` | Selects the initial mode. It disables user and plugin editing controls while keeping host-authorized document methods available. Change it later with `editor.setReadOnly()`. |
| `injectStyles` | no | `true` | Loads base, theme, registered block-plugin, and registered inline-plugin styles through reference-counted `<link>` elements. Set it to `false` when the host imports package CSS through a bundler. |
| `placeholder` | no | plugin locale | Overrides the placeholder of the default block when that plugin implements `setPlaceholder()`. Pass an empty string to suppress that placeholder. It does not change placeholders owned by other plugins. |
| `autofocus` | no | `false` | Focuses the first editable or focusable element after successful creation. It has no effect in read-only mode. |
| `minHeight` | no | stylesheet value | Sets a finite non-negative inline minimum height, in CSS pixels, on the editor root. Omit it to leave sizing to CSS. |
| `defaultBlock` | no | `paragraph`, otherwise the first plugin | Registered block type used for an empty document, Enter-created blocks, and the replacement inserted after the last block is removed. |
| `locale` | no | built-in English dictionary | A merged core-and-plugin dictionary. Use the exported aggregated locale to translate all built-in UI, and `__lang` to select plural rules. |
| `tuning` | no | `DEFAULT_TUNING` | Partial behavioral overrides for dragging, history, change notifications, the toolbox, animations, and the mobile breakpoint. Each leaf is described below. |
| `onChange` | no | omitted | Debounced notification containing a detached serialized document after a committed mutation. It is not called for the initial document. |
| `onReady` | no | omitted | Microtask notification after composition succeeds. `createEditor()` itself already returns a ready handle synchronously. |
| `validationMode` | no | `'preserve'` | Handling of a registered plugin whose `validate(data)` returns `false`: preserve and report the block, or throw during `save()`. |
| `onValidationError` | no | omitted | Receives `{ blockId, type, data }` for invalid plugin data. It runs in both validation modes before strict mode throws. |
| `onDiagnostic` | no | omitted | Receives content-free operational signals. When omitted, diagnostics do not call consumer code. |
| `diagnosticThresholds` | no | no slow-operation thresholds | Enables individual `*.slow` signals when an operation exceeds a supplied duration. Omitted leaves do not have an implicit duration. |
| `theme` | no | `'dark'` | Adds `oe-theme-{theme}` to the editor root. Rector ships `dark` and `light`; a custom name can be used with consumer-provided CSS variables and selectors. |

## Holder and block plugins

`holder` is the DOM element whose contents Rector owns. Do not share one holder between editor instances.

`plugins` contains instantiated block plugins. A block type is available only when its plugin is registered. Plugin `type` values must be unique. `defaultBlock` must name one of these types. When omitted, Rector uses `paragraph` if registered, otherwise the first plugin in the array. An empty plugin array therefore fails because no default block type can be mounted.

```js
import { Paragraph } from '@shelamkoff/rector/plugins/paragraph'
import { Quote } from '@shelamkoff/rector/plugins/quote'

const plugins = [new Paragraph(), new Quote()]
```

## Initial document

`data` is normalized before blocks are mounted. Omitting it creates an empty document with one default block. The object is cloned at the ownership boundary, so later mutations to the object supplied by the application do not mutate the editor.

See [Document format](/guide/document-format) for versions, migrations, block identities, and inline widget data.

## Inline tools

Without `inlineTools`, Rector enables its complete built-in tool set. Supply string names to keep only selected defaults, or tool objects to add or replace behavior.

```js
import { createDefaultInlineTools } from '@shelamkoff/rector'

createEditor({
  holder,
  plugins,
  inlineTools: ['bold', 'italic', 'link'],
})
```

```js
const defaults = createDefaultInlineTools()

createEditor({
  holder,
  plugins,
  inlineTools: [...defaults, myInlineTool],
})
```

A block controls whether the configured tool set applies to its editable fields through the plugin's `inlineTools` property. It can enable the whole set with `true`, provide a string allowlist, or disable inline tools with `false`. See [Inline tools and plugins](/guide/inline-extensions).

See [Inline tools and inline plugins](/guide/inline-extensions) for every built-in name, the complete custom-tool contract, action panels, history rules, and cleanup.

## Inline plugins

`inlinePlugins` registers persistent widgets embedded inside text, such as a mention or color swatch. Unlike formatting tools, a widget owns serializable data in the block's `inline` map.

```js
import { createMentionPlugin } from '@shelamkoff/rector/inline-plugins/mention'

createEditor({
  holder,
  plugins,
  inlinePlugins: [createMentionPlugin({ searchFunction: findPeople })],
})
```

## Editing mode and layout

| Option | Default | Meaning |
| --- | --- | --- |
| `readOnly` | `false` | Selects the initial interactive or read-only mode. Read `editor.readOnly` and call `editor.setReadOnly(boolean)` to change it later. |
| `placeholder` | localized text | Placeholder passed to the default block plugin when it implements `setPlaceholder()`. An empty string disables it. |
| `autofocus` | `false` | Focuses the initial block after creation. |
| `minHeight` | editor stylesheet default | Minimum editable area height in pixels. |
| `theme` | `dark` | Theme name placed on the editor root. Built-in names are `dark` and `light`. |

`setReadOnly()` preserves the current document and history. The transition rebuilds plugin DOM with a new `context.readOnly` value, but does not create a history step, trigger `onChange`, or request or restore browser focus. Replacing mounted plugin elements may therefore lose the current focus; call `editor.focus()` after returning to edit mode when required. While read-only, user editing, inline insertion, undo, and redo are unavailable; `save()`, `render()`, `clear()`, and host structural block commands remain available. The complete runtime contract is described in [Editor API](/guide/editor-api#editing-and-read-only-modes).

## Localization

`locale` is one flat dictionary assembled from core and registered plugin messages. Import a ready aggregate when using a built-in language.

```js
import ru from '@shelamkoff/rector/locale/ru'

createEditor({ holder, plugins, locale: ru })
```

Custom entries override keys with the same name. Include `__lang` when plural rules must follow a specific language.

## Change callbacks

`onReady` is queued as a microtask after successful composition. `createEditor()` already returns a ready handle synchronously; the callback is for notifying another part of the application. It is skipped if the editor is destroyed before the microtask runs.

`onChange` is not called for the initial document. After a document mutation, Rector waits for `tuning.change.debounceMs` (250 ms by default), runs synchronous `save()`, and passes the resulting detached document to the callback. A later change restarts a pending delay. Destroying the editor cancels a pending notification.

If the internal `save()` throws, Rector writes a warning and does not call `onChange`. The callback's return value is ignored, so handle failures inside an asynchronous persistence function. This callback is a notification, not a persistence transaction: a newer edit may occur while a previous request is in progress.

```js
const editor = createEditor({
  holder,
  plugins,
  onReady() {
    console.log('Editor is ready')
  },
  onChange(document) {
    scheduleAutosave(document)
  },
})
```

Use request cancellation or monotonically increasing revisions in the storage layer so an older response cannot overwrite newer content.

## Document and block validation

`documentVersionPolicy` controls unsupported document versions:

- `preserve` applies every reachable migration and, if the chain ends early, keeps the last structurally valid document reached (which may still be the originally declared version);
- `strict` rejects an unknown or incomplete version chain.

`validationMode` controls a registered plugin whose `validate(data)` returns `false`:

- `preserve` keeps the block and reports it through `onValidationError`;
- `strict` makes `save()` throw before returning the document.

```js
createEditor({
  holder,
  plugins,
  documentVersionPolicy: 'strict',
  validationMode: 'strict',
  onValidationError(issue) {
    console.warn(issue.blockId, issue.type)
  },
})
```

## Behavioral tuning

Partial values are merged with these defaults:

```js
const defaultTuning = {
  drag: { threshold: 5 },
  undo: { maxStack: 100, debounceMs: 300 },
  change: { debounceMs: 250 },
  toolbar: { filterThreshold: 7 },
  animations: {
    blockInsertMs: 350,
    blockMoveMs: 200,
    blockRemoveMs: 350,
  },
  mobileBreakpoint: 768,
}
```

Every leaf has one purpose; tuning values never change the document schema.

| Path | Default | Unit | Effect |
| --- | ---: | --- | --- |
| `drag.threshold` | `5` | CSS pixels | Minimum pointer movement before a press on a drag handle becomes block dragging. |
| `undo.maxStack` | `100` | history entries | Maximum number of committed undo steps retained. When the limit is exceeded, the oldest step is discarded. |
| `undo.debounceMs` | `300` | ms | Quiet window used to combine consecutive native text-input changes in the same block. Explicit commands, toolbar actions, and structural changes remain separate steps. |
| `change.debounceMs` | `250` | ms | Quiet window before `onChange` serializes and reports the latest document. It does not merge or reorder undo history. |
| `toolbar.filterThreshold` | `7` | registered block types | Minimum number of toolbox entries before the block selector shows its filter input. |
| `animations.blockInsertMs` | `350` | ms | Duration budget used by the block-insertion animation. |
| `animations.blockMoveMs` | `200` | ms | Duration budget used by the block-move animation. |
| `animations.blockRemoveMs` | `350` | ms | Duration budget used by the block-removal animation. |
| `mobileBreakpoint` | `768` | CSS pixels | Viewport width below which editor controls switch to their mobile layout. Keep custom CSS media queries aligned with this value. |

`undo.debounceMs` coalesces continuous text input; it does not combine explicit structural or toolbar actions. `change.debounceMs` affects notifications only, not history ordering.

All numeric tuning leaves must be finite and non-negative. `undo.maxStack` must additionally be an integer of at least `1`, and `toolbar.filterThreshold` must be an integer. Invalid values are rejected synchronously before Rector claims the holder or mounts plugin DOM.

## Diagnostics

Operational diagnostics are disabled unless `onDiagnostic` is present. Signals contain operation metadata but never document or plugin payloads.

```js
createEditor({
  holder,
  plugins,
  onDiagnostic(signal) {
    telemetry.record(signal)
  },
  diagnosticThresholds: {
    commandMs: 16,
    saveMs: 50,
    renderMs: 50,
    pasteMs: 100,
  },
})
```

Possible `code` values are `command.failed`, `command.slow`, `paste.failed`, `paste.slow`, `migration.applied`, `migration.failed`, `migration.unavailable`, `save.failed`, `save.slow`, `render.slow`, `editor.create.failed`, and `cleanup.failed`.

`diagnosticThresholds` contains four independent millisecond values:

| Field | Emits |
| --- | --- |
| `commandMs` | `command.slow` for a command that meets or exceeds the threshold |
| `saveMs` | `save.slow` for document serialization |
| `renderMs` | `render.slow` for block/document rendering measured by the instrumented operation |
| `pasteMs` | `paste.slow` for a paste transaction |

Every supplied threshold must be a finite non-negative number. An invalid threshold is rejected during `createEditor()` before DOM composition starts.

Every `EditorDiagnostic` has `code` and a numeric `timestamp`. Depending on the operation it may also contain `durationMs`, `operation`, `pluginType`, `blockType`, `fromVersion`, `toVersion`, or `errorName`. It never contains document text, block data, plugin configuration, or thrown error objects.

## Supporting callback shapes

`migrations` accepts objects with the following contract:

```ts
interface DocumentMigration {
  from: string
  to: string
  migrate(document: EditorDocument): EditorDocument
}
```

`from` must be unique within the array, `from` and `to` must differ, and `migrate()` must return a structurally valid document. Rector passes a clone into each migration and validates the returned envelope before continuing. Migrations are synchronous and ordered by their links, not by their position in the array.

`onValidationError` receives:

```ts
interface BlockValidationIssue {
  blockId: string
  type: string
  data: Record<string, unknown>
}
```

`data` is a detached snapshot of the invalid block payload. Treat it as diagnostic input; changing it does not repair the live block.
