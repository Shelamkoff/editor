# Commands and history

Rector treats one completed user action as one command and one history step. This rule covers structural changes, inline formatting, block settings, paste, splitting and merging, and plugin-owned controls.

Understanding the command boundary is essential when integrating application controls or writing an interactive extension.

## What a command means

A command is a synchronous transaction around a document mutation. Rector captures the document state at the outer command boundary, applies the mutation, marks affected blocks, emits change events, and commits exactly one history entry.

If the mutation throws, Rector rolls the complete command back and does not add a history entry. Nested mutations join the outer transaction; catching a nested failure does not turn the outer command into a successful one.

The internal command dispatcher and command objects are not public API. Application code uses `editor` and `editor.blocks`. Extension code uses the `mutate(...)` function supplied in its context.

## Commands from application code

The public structural methods already enter the command pipeline. Do not emit editor events or modify block wrapper DOM to imitate an operation.

```js
const inserted = editor.blocks.insert(
  'paragraph',
  { text: 'New paragraph' },
  editor.blocks.getBlockCount(),
)

if (inserted) {
  editor.blocks.convert(
    editor.blocks.getBlockIndex(inserted.id),
    'heading',
    { level: 2 },
  )
}
```

Each call above is one distinct history step. The same applies to `remove()` and `move()`.

`render()` and `clear()` replace the document through the editor composition boundary. Use them for document-level application actions, not for implementing plugin controls.

## Commands from block plugins

`render(data, context)` receives a `BlockMutationContext`. An event handler that changes persistent block state or DOM calls `context.mutate()` once **for each completed user action**. Every new click in the example below is a new action, so every click starts one new command and produces one new history step.

```js
render(data, context) {
  const root = document.createElement('div')
  const button = document.createElement('button')
  const value = document.createElement('span')

  value.textContent = String(data.count ?? 0)
  button.textContent = 'Increment'

  button.addEventListener('click', () => {
    context.mutate(() => {
      value.textContent = String(Number(value.textContent) + 1)
    })
  })

  root.append(value, button)
  return root
}
```

Do not interpret "once" as once during the plugin lifetime. It means one command boundary around one logical action: a click that changes several related fields still uses one `mutate()` call, while two separate clicks use two calls and create two history steps.

Rector saves the plugin DOM before and after the mutation. Undo restores the previous serialized document; redo restores the next one. The plugin's `save()` and `render()` therefore must form a stable round trip.

Do not call `mutate()` for focus, hover, opening a menu, or another transient UI state that is not part of the document.

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

The List plugin applies data-aware rules instead of splitting `<li>` markup as generic HTML:

1. selected list content is removed from the source list;
2. the target block is inserted immediately after the remaining list;
3. an ordered list is renumbered by the browser because its remaining items stay in one `<ol>`;
4. when the target is a text block, selected inline markup becomes its `text` data;
5. when the target is not a text block, the selection is removed and the target starts with that plugin's initial data;
6. if the selection consumes every item, the source list is removed and the target takes its position.

Undo and redo restore both the list and the inserted block atomically. Extension authors can opt into the same behavior with `splitSelection()` as described in [Creating extensions](/guide/extensions#data-aware-partial-conversion).

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

`renderInlineControls(contentElement, ctx)` is for block-specific controls displayed in the inline toolbar, such as changing a heading level. Its `ctx.mutate()` creates the history entry.

If an action replaces the block's editable element, call `ctx.suppressSelectionChange()` before the replacement and `ctx.onContentElementChanged(newElement)` afterwards. These methods preserve selection ownership; they do not create history by themselves.

## Commands from inline widgets

Persistent inline plugins receive `InlinePluginContext`. Pass the widget or one of its descendants as `target` so Rector can associate the command with its owner block.

```js
hydrate(element, ctx) {
  const remove = element.querySelector('[data-remove]')

  remove.addEventListener('click', () => {
    ctx.mutate(element, () => element.remove())
  })
}
```

`notifyChanged()` exists for compatibility with changes that have already occurred, but new code should prefer `mutate()` so the before-state is captured correctly.

## Asynchronous work

The callback passed to `mutate()` must be synchronous. Do not make it `async` and do not leave a promise running inside it. Perform network, file, or media work first, then commit the resolved result in one short mutation.

```js
button.addEventListener('click', async () => {
  button.disabled = true
  try {
    const uploaded = await uploadFile(file)
    context.mutate(() => {
      preview.src = uploaded.url
      preview.dataset.fileId = uploaded.id
    })
  } finally {
    button.disabled = false
  }
})
```

Protect asynchronous handlers against stale results and destruction. An extension should ignore a response when its element is detached, a newer request superseded it, or its `destroy()` method has run.

## Undo and redo controls

The editor registers platform-aware keyboard shortcuts inside its root:

| Action | Shortcut |
| --- | --- |
| Undo | `Mod+Z` |
| Redo | `Mod+Shift+Z` or `Mod+Y` |

`Mod` means Command on macOS and Control on Windows or Linux. Rector deliberately does not expose public `undo()` and `redo()` methods in version 1.0.0. Host buttons should not reach into the internal undo manager.

Native undo remains available in ordinary `input` and `textarea` controls owned by a plugin. Editor history takes precedence only when focus belongs to editable document content or editor UI.

## History ordering and coalescing

History is last-in, first-out. If a block is inserted and formatting is then applied, the first undo removes the formatting and the second undo removes the inserted block. Redo replays them in the opposite direction.

Continuous text input is coalesced within `tuning.undo.debounceMs`, which defaults to 300 ms. A command boundary, selection-changing action, structural operation, paste, or toolbar action closes the typing group.

The history stack stores at most `tuning.undo.maxStack` entries, which defaults to 100. Committing a new action after undo discards the redo branch.

## Events are observations, not commands

`editor.events` is subscription-only. Events report completed behavior and must not be emitted by application or plugin code.

```js
const unsubscribe = editor.events.on('history:commit', () => {
  updateDirtyIndicator()
})

// Later
unsubscribe()
```

Use `history:commit` to observe a committed step and `editor:changed` to observe a document mutation. `onChange` is the debounced serialized notification intended for persistence.

## Extension checklist

Before publishing an interactive extension, verify all of these sequences:

1. perform the action, undo once, and compare the complete document with the before-state;
2. redo once and compare it with the after-state;
3. repeat the action after undo and confirm the old redo branch disappears;
4. make the action throw and confirm neither DOM nor history changes remain;
5. destroy the editor while asynchronous work is pending and confirm the result is ignored;
6. verify selection and focus after undo and redo.
