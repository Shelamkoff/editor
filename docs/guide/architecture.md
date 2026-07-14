# Architecture

Rector separates the stored document, editing runtime, extensions, and document renderer. These layers share data contracts but not mutable managers or UI state.

## System boundaries

```text
Application
  │
  ├─ createEditor(config) ──> Editor handle
  │                           ├─ blocks API
  │                           ├─ event subscriptions
  │                           └─ save/render/destroy
  │
  ├─ Block and inline extensions
  │      └─ mutate(...) command boundary
  │
  └─ createEditorRenderer(config) ──> Document DOM

Versioned JSON document is the contract between editing, storage, and rendering.
```

## The application boundary

The application creates and destroys the editor, supplies configuration, persists documents, and subscribes to public events. It receives a narrow `IEditor` handle rather than internal composition objects.

The handle deliberately does not expose the block manager, command dispatcher, undo manager, selection manager, event emitter, popup manager, or style injector. This prevents application code from bypassing document invariants.

## The document boundary

An `EditorDocument` is plain serializable data. Rector clones documents when they cross into the editor, through a migration, or out of a save operation. The live DOM is never the storage contract.

Each block has a stable `id`, a registered `type`, plugin-owned `data`, and optional `revision`, `tunes`, and `inline` fields. The core owns the envelope and identities; a plugin owns only the shape of its own `data`. A producer-owned `revision` is an optimization token for incremental rendering, not another schema version.

The document version describes the envelope and cross-plugin conventions. A plugin must evolve its data compatibly or participate in an explicit document migration.

## The editor composition boundary

`createEditor()` is the composition root. It validates configuration and constructs document normalization, block ownership, selection, commands, history, keyboard routing, toolbars, paste routing, diagnostics, localization, and style ownership.

These services communicate through narrow internal interfaces. They are implementation details even when a declaration file exists in the source tree. Public imports are limited to paths declared by the package `exports` map.

## The command boundary

Every persistent interaction enters one command transaction. The transaction captures a before-state, applies a synchronous mutation, marks affected blocks, and commits one history step. A failed command rolls back atomically.

Application code enters this boundary through public editor methods. Extensions receive only the appropriate `mutate(...)` capability. See [Commands and history](/guide/commands-history).

## Extension boundaries

Rector has four distinct extension roles:

| Role | Owns | Does not own |
| --- | --- | --- |
| Block plugin | one block's editable DOM and serialized `data` | document order, block identity, global history |
| Inline tool | formatting behavior for a selected range | persistent widget data |
| Inline plugin | a widget embedded in text and its serialized payload | the surrounding block schema |
| Block renderer | output DOM for one block type | editor controls or editor state |

Extensions receive capabilities instead of managers. A plugin may mutate its own element through the supplied context, but it cannot reorder arbitrary blocks or emit internal events.

## Style ownership

The application imports Rector's base stylesheet. A plugin class may declare static stylesheet URLs; Rector reference-counts their `<link>` elements across editor instances. Destroying the last owner removes an injected stylesheet.

The document renderer has a separate style lifecycle. `renderer.injectStyles()` returns an owner whose `destroy()` method releases those links. This symmetry prevents global style leaks.

## Resource ownership

Anything that subscribes or allocates must have a clear owner:

- the editor owns its root listeners, observers, managers, popups, and registered plugin instances;
- a block plugin owns listeners and third-party objects attached to its rendered block and releases them in `destroy(element)`;
- an inline control group releases temporary controls in its `destroy()` callback;
- the renderer owns mounted renderer instances per output container and releases them through `destroy(container?)`;
- the application owns the editor handle and any renderer style owner it creates.

No extension should depend on page unload for cleanup.

## Data flow

### Initial load

1. The application passes a document to `createEditor()`.
2. The document schema validates the envelope and applies a deterministic migration chain.
3. Registered block plugins render their own data.
4. Text plugins map stored inline placeholders back to widget DOM.
5. Rector establishes the first history checkpoint after composition.

### Editing and save

1. A public method or extension context opens a command.
2. The command changes owned DOM or document structure.
3. The affected plugin serializes its element through `save()`.
4. Rector marshals inline widgets into the block-level `inline` map.
5. The document is validated and emitted as detached data.

### Document rendering

1. The application passes saved JSON to an `EditorRenderer`.
2. The renderer selects a `BlockRenderer` by block `type`.
3. Inline placeholders are sanitized and rehydrated through registered inline plugins.
4. The block renderer returns output DOM.
5. `destroy()` releases renderer-owned resources when the container is replaced or removed.

## Dependency direction

The core does not import application code. Block plugins depend on public contracts and small shared utilities. The renderer depends on the document contract, not the editing runtime. Optional integrations are loaded only by features that require them.

Keep this direction when creating extensions: depend on exported types and context capabilities, never on files under `core/` that are not exported by `package.json`.
