# Configuration

`createEditor(config)` accepts one configuration object. The public configuration is intentionally small: `holder` and `plugins` are required; every extension is an immutable v2 definition created by a factory.

## Public shape

```ts
interface EditorConfig {
  holder: HTMLElement
  plugins: readonly BlockPluginDefinition[]
  inlinePlugins?: readonly InlinePluginDefinition[]
  inlineTools?: readonly InlineTool[]
  data?: EditorDocument
  defaultBlock?: string
  placeholder?: string
  readOnly?: boolean
  autofocus?: boolean
  injectStyles?: boolean
  theme?: 'light' | 'dark'
  minHeight?: number
  locale?: Record<string, unknown>
  validationMode?: 'preserve' | 'strict'
  documentVersionPolicy?: 'preserve' | 'strict'
  migrations?: readonly DocumentMigration[]
  changeDebounceMs?: number
  historyMaxStack?: number
  historyCoalesceMs?: number
  dragThreshold?: number
  toolboxFilterThreshold?: number
  onReady?: (editor: IEditor) => void | Promise<void>
  onChange?: (document: EditorDocument) => void | Promise<void>
  onValidationError?: (issue: EditorValidationIssue) => void
  onDiagnostic?: (diagnostic: EditorDiagnostic) => void | Promise<void>
  diagnosticThresholds?: Partial<DiagnosticThresholds>
}
```

## Options

| Option | Required | Default | Meaning |
| --- | --- | --- | --- |
| `holder` | yes | — | DOM element owned by this editor instance. A live holder cannot be claimed by a second editor. |
| `plugins` | yes | — | Non-empty array of immutable `BlockPluginDefinition` values. Block `type` values must be unique. |
| `inlinePlugins` | no | `[]` | Immutable `InlinePluginDefinition` values for persistent inline widgets. |
| `inlineTools` | no | `[]` | Formatting-tool objects shown by the inline toolbar. |
| `data` | no | empty default block | Initial versioned document. Input is cloned and normalized at the ownership boundary. |
| `defaultBlock` | no | `paragraph` when registered, otherwise first block definition | Type used for an empty document and generic structural editing. |
| `placeholder` | no | extension/localized default | Editor-level placeholder exposed to the default block runtime. |
| `readOnly` | no | `false` | Initial interaction mode. User/document mutations are disabled while read-only. |
| `autofocus` | no | `false` | Focus the first editable field after successful creation. |
| `injectStyles` | no | `true` | Acquire core and registered definition styles through the shared style registry. |
| `theme` | no | `light` | Built-in theme: `light` or `dark`. |
| `minHeight` | no | CSS default | Finite non-negative minimum editor height in pixels. |
| `locale` | no | built-in English | Flat message dictionary used by core and definitions. |
| `validationMode` | no | `preserve` | Invalid known block/inline data is preserved inertly or rejected strictly. |
| `documentVersionPolicy` | no | `preserve` | Incomplete/future document-version paths are preserved or rejected strictly. |
| `migrations` | no | `[]` | Directed synchronous document migrations. |
| `changeDebounceMs` | no | `250` | Delay before the detached `onChange` snapshot is delivered. |
| `historyMaxStack` | no | `100` | Maximum number of undo records retained by operation-based history. |
| `historyCoalesceMs` | no | `300` | Maximum idle interval for grouping consecutive native edits in one undo step. |
| `dragThreshold` | no | `5` | Pointer movement in pixels required before block dragging starts. |
| `toolboxFilterThreshold` | no | `7` | Show toolbox search only when the registered item count exceeds this value. |
| `onReady` | no | omitted | Observer invoked after successful composition. Callback failures do not invalidate the editor. |
| `onChange` | no | omitted | Debounced observer receiving a detached saved document after canonical commits. |
| `onValidationError` | no | omitted | Observer for preservation/validation issues. |
| `onDiagnostic` | no | omitted | Content-free operational diagnostics; callback failures are isolated. |
| `diagnosticThresholds` | no | no slow-operation thresholds | Optional non-negative thresholds for command/save/render/paste diagnostics. |

## Plugin definitions

Register factory results, not mutable class instances:

```js
import { createEditor } from '@shelamkoff/rector'
import { createParagraphPlugin } from '@shelamkoff/rector/plugins/paragraph'
import { createQuotePlugin } from '@shelamkoff/rector/plugins/quote'

const editor = createEditor({
  holder,
  plugins: [
    createParagraphPlugin(),
    createQuotePlugin(),
  ],
  defaultBlock: 'paragraph',
})
```

A definition may be reused by multiple editor instances. Per-editor state belongs to the runtime returned by `setup()`; per-block state belongs to the `BlockInstance` returned by that runtime.

## Inline-tool preset

Core does not statically install the complete inline-tool set. Import `createDefaultInlineTools` from `@shelamkoff/rector/preset` and pass the result through `inlineTools` when the standard preset is wanted. Individual tools remain available from their dedicated subpath exports.

## Initial document and version policy

`data` is decoded through the registered schemas before projection. `documentVersionPolicy: 'preserve'` applies every reachable migration and keeps the last structurally valid document when the chain cannot reach the current version. `strict` requires a complete supported path.

`validationMode: 'preserve'` keeps malformed or future known payloads inert so they round-trip without executing extension code. `strict` rejects them.

See [Document format](/guide/document-format) for the canonical envelope and migration rules.

## Read-only and layout

`editor.setReadOnly(true)` changes the live runtime mode without creating a history entry. Definition instances receive the transition through `setReadOnly()`. Core controllers also stop structural keyboard commands, paste, drag, settings mutations, inline commands, undo and redo.

Use `minHeight` only for the editor shell. Extension layout belongs in extension styles.

## Callbacks

`onReady`, `onChange`, `onValidationError`, and `onDiagnostic` are observers, not transaction hooks. Rector isolates observer failures from canonical state. Diagnostics never contain document or plugin payload data.

`onChange` is scheduled only after committed document mutations and receives a detached document. A newer commit can supersede an older pending notification.

## Style ownership

With `injectStyles: true`, core and extension style URLs are reference-counted per owning document. With `false`, Rector acquires no definition styles; the host must import the required CSS itself.

Per-extension factories may also expose an `injectStyles: false` option where documented, but editor-level `injectStyles: false` is the global manual-style mode.
