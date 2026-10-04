# Commands and history

One completed interaction creates one history step, including formatting across multiple blocks, settings, clipboard, splits, merges and plugin controls.

## What a command means

A command synchronously prepares canonical data, projection and history before one commit point. A failure restores the previous model and projection without adding history. Failed projection recovery stops mutations; committed data remains available through `save()`.

Synchronous reentry during preparation, application or committed-event notification is rejected. Applications use `editor` and `editor.blocks`; extension instances receive scoped capabilities.

## Commands from application code

Commands address stable block IDs. Each call below creates one history step:

```js
const insertedId = editor.blocks.insert(
  { type: 'paragraph', data: { text: 'New paragraph' } },
  editor.blocks.count,
)
editor.blocks.convert(insertedId, { type: 'heading', toolboxItemId: 'h2' })
```

`render(document)` accepts only the current format and atomically replaces the document. `clear()` creates an empty default block. Host commands remain available in read-only mode; user commands and Undo/Redo are blocked.

## Commands from block plugins

`create(initial, context)` receives a `BlockInstanceContext`. Call `context.updateData(producer)` once per completed data action. The synchronous producer receives current data; its result is schema-encoded and projected after commit.

```js
function createCounterInstance(initial, context) {
  const root = context.ownerDocument.createElement('div')
  const button = context.ownerDocument.createElement('button')
  const value = context.ownerDocument.createElement('span')
  button.textContent = '+1'
  const project = data => { value.textContent = String(data.count) }
  project(initial)
  button.addEventListener('click', () => {
    context.updateData(current => ({ ...current, count: current.count + 1 }))
  }, { signal: context.signal })
  root.append(value, button)
  return {
    element: root,
    update: project,
    setReadOnly: readOnly => { button.disabled = readOnly },
    destroy() {},
  }
}
```

Use `context.commitDomMutation(operation)` only for synchronous protected edits to registered rich-text fields. Core serializes and validates affected fields inside the transaction. Focus, hover and opening menus do not create history.

`context.requestSplit()` and `context.requestExit()` request structural behavior; never imitate them with keyboard events. Composite editing capabilities return data and structural intent together for one transaction.

## Slash commands

Typing `/` opens the command menu. On an empty block the menu offers registered block plugins; when inline plugins are registered, it can also open after existing text and offers the matching inline widgets. Entries are built from the configured `plugins` and `inlinePlugins` arrays, so there is no separate slash-command registry.

Continue typing after `/` to filter by the plugin type and its localized title. The menu is anchored immediately below the `/query` text rather than to the left edge of the block. It follows the editor when its scroll container moves and flips above the command when the viewport does not have enough space below it.

| Key or action | Result |
| --- | --- |
| `ArrowDown` / `ArrowUp` | Move through the filtered entries. |
| `Enter` or `Tab` | Run the active command. |
| Pointer press | Run the pressed command without losing the editor selection. |
| `Escape` | Remove the current `/query` and close the menu. |
| `Backspace` when only `/` remains | Close the menu and let the browser remove `/`. |

Choosing a block entry converts the current block when it contains only `/query`. If the command follows existing content, Rector removes only `/query`, preserves the source block, and inserts the requested block immediately after it. Choosing an inline entry removes `/query` and inserts the widget at that exact position. Every variant is committed as one command, so one undo restores the state from before the selection. The menu is styled through `.oe-slash-menu` and its child classes listed in [Styling and themes](/guide/styling).

## Converting a selection inside a block

The type selector can convert a selection without replacing the entire source block. Plain text blocks are split into content before the selection, the new block, and content after the selection. The whole operation is one history step.

Whole and partial conversions are lossless for linked inline widgets: Rector preserves the referenced sidecar entries and placeholder identities when the target can represent them. If the target conversion would turn a linked widget into literal text or otherwise drop its payload, the conversion is rejected before the document or history changes. Placeholder-shaped text without a matching sidecar entry remains literal text.

The List plugin applies data-aware rules instead of splitting `<li>` markup as generic HTML:

1. selected list content is removed from the source list;
2. the target block is inserted immediately after the remaining list;
3. an ordered list is renumbered by the browser because its remaining items stay in one `<ol>`;
4. when the target is a text block, selected inline markup becomes its `text` data;
5. when the target is not a text block, the selection is removed and the target starts with that plugin's initial data;
6. if the selection consumes every item, the source list is removed and the target takes its position.

Undo and redo restore both the list and the inserted block atomically. Extension authors can opt into the same behavior with `capabilities.conversion.partial` as described in [Creating extensions](/guide/extensions#data-aware-partial-conversion).

## Commands from inline tools

The built-in toolbar routes formatting through a range mutation. A custom tool receives one of two contexts:

- `InlineMutationContext` in `onMount(button, mutations)` for a direct action;
- `InlineToolActionContext` in `renderActions(ctx)` for a panel that acts on a saved selection.

```js
renderActions(ctx) {
  const apply = document.createElement('button')
  apply.textContent = 'Apply'

  apply.addEventListener('click', () => {
    ctx.restoreSelection()
    ctx.mutate(() => applyStyleToRange(ctx.range))
    ctx.close()
  })

  return apply
}
```

Bold, italic, link creation and removal, colors, alignment, font size, and clearing formatting follow this boundary. One toolbar action must not be split into multiple `mutate()` calls.

The complete tool contract, registration rules, built-in names, action panels, and the distinction from persistent widgets are described in [Inline tools and inline plugins](/guide/inline-extensions).

## Commands from block inline controls

Block-specific controls shown in the inline toolbar reuse the block's model-first `inlineControls` capability. Each action receives canonical block data and returns updated data through the same `SettingsActionCapability` contract used by block settings.

The control never owns an editable DOM element and does not notify Rector after mutating projection state. Rector commits the returned data as one transaction and then reconciles the projection, so selection ownership and history stay inside the document runtime.

## Commands from inline widgets

Each mounted inline widget receives an `InlineWidgetContext`. Widget state is model-owned: read it with `getData()` and commit one completed interaction with one `updateData()` call.

```js
create(id, initial, context) {
  const button = document.createElement('button')
  button.textContent = initial.enabled ? 'On' : 'Off'

  button.addEventListener('click', () => {
    context.updateData(current => ({
      ...current,
      enabled: !current.enabled,
    }))
  }, { signal: context.signal })

  return {
    element: button,
    update(next) {
      button.textContent = next.enabled ? 'On' : 'Off'
    },
    setReadOnly(readOnly) {
      button.disabled = readOnly
    },
    destroy() {},
  }
}
```

The widget DOM is a projection of canonical data. Do not mutate DOM first and later try to notify Rector; commit through `updateData()` so the before/after states, undo/redo and stale-callback protection stay atomic.

## Asynchronous work

Persist asynchronous results through a revocable `DataTask`; data producers and protected DOM operations stay synchronous.

```js
button.addEventListener('click', async () => {
  const task = context.beginTask()
  button.disabled = true
  try {
    const uploaded = await uploadFile(file, { signal: task.signal })
    task.commit(current => ({ ...current, url: uploaded.url }))
  } finally {
    task.cancel()
    if (!context.signal.aborted) button.disabled = context.isReadOnly()
  }
}, { signal: context.signal })
```

Replacement, destruction, generation changes and entry into read-only mode revoke the task. A stale task returns `false` without invoking its producer; enabling editing never revives it.

## Clipboard and composite selections

Rector uses one private MIME, `application/x-rector-fragment`, with `version: 2`. The fragment is derived from the canonical model rather than a DOM clone: rich-text parts retain formatting and only actually referenced inline sidecar entries, while whole/structured parts omit block IDs and producer revisions. When the current private MIME is present it takes precedence over `text/html` and `text/plain`. Invalid, old, or future private versions reject Paste without falling back to the standard representations.

For composite blocks, `BlockCapabilities.clipboard.slice(data, context)` defines exported parts and `remaining` together. Copy and Cut therefore use the same data boundary: a detectable preparation or system-clipboard write failure never deletes source content. List, Table, and other structured blocks preserve their structure; the generic rich-text path is used only when a block does not declare a specialized capability.

Pasting over a composite selection prepares and validates both the fragment and target plan before one transaction is committed. One Undo restores the original target. Ordinary external HTML/text/file data is considered only when the current private MIME is absent.

## Undo and redo controls

The editor registers platform-aware keyboard shortcuts inside its root:

| Action | Shortcut |
| --- | --- |
| Undo | `Mod+Z` |
| Redo | `Mod+Shift+Z` or `Mod+Y` |

`Mod` means Command on macOS and Control on Windows or Linux. Application controls use the same public history through `editor.undo()` and `editor.redo()`. Both return `false` when no step is available or the editor is read-only. Use `editor.canUndo`, `editor.canRedo`, and the `history:changed` event to maintain disabled button state; do not reach into the internal undo manager.

Native undo remains available in ordinary `input` and `textarea` controls owned by a plugin. Editor history takes precedence only when focus belongs to editable document content or editor UI.

## History ordering and coalescing

History is last-in, first-out. If a block is inserted and formatting is then applied, the first undo removes the formatting and the second undo removes the inserted block. Redo replays them in the opposite direction.

Continuous native text input is coalesced by the canonical history engine. Explicit commands, selection-changing actions, structural operations, paste, and toolbar actions always form command boundaries.

`canUndo` and `history:changed` react as soon as the first input event opens that group; application buttons therefore do not wait for the debounce timer. Starting a new input branch also makes `canRedo` false immediately.

Committing a new action after undo discards the redo branch. Configure history capacity with `historyMaxStack` and native input grouping with `historyCoalesceMs`.

## Events are observations, not commands

`editor.on()` is subscription-only. Events report completed behavior and must not be emitted by application or plugin code.

```js
const stopHistoryState = editor.on('history:changed', ({ canUndo, canRedo }) => {
  undoButton.disabled = !canUndo
  redoButton.disabled = !canRedo
})

const stopDirtyState = editor.on('transaction:committed', () => {
  markDocumentDirty()
})

// Later
stopHistoryState()
stopDirtyState()
```

Use `history:changed` to observe command availability, `transaction:committed` to observe a committed step, and `document:changed` to observe a document mutation. `onChange` is the debounced serialized notification intended for persistence. Mode transitions emit `history:changed`, but do not emit `transaction:committed`, `document:changed`, or `onChange`.

## Extension checklist

Before publishing an interactive extension, verify all of these sequences:

1. perform the action, undo once, and compare the complete document with the before-state;
2. redo once and compare it with the after-state;
3. repeat the action after undo and confirm the old redo branch disappears;
4. make the action throw and confirm neither DOM nor history changes remain;
5. destroy the editor while asynchronous work is pending and confirm the result is ignored;
6. verify selection and focus after undo and redo.
