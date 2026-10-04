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
  │      └─ scoped context / DataTask authority
  │
  └─ createEditorRenderer(config) ──> Document DOM

Versioned JSON document is the contract between editing, storage, and rendering.
```

## The application boundary

The application creates and destroys the editor, supplies configuration, persists documents, and subscribes to public events. It receives a narrow `IEditor` handle rather than internal composition objects.

The handle deliberately does not expose the block manager, command dispatcher, undo manager, selection manager, event emitter, popup manager, or style injector. This prevents application code from bypassing document invariants.

## The document boundary

An `EditorDocument` is plain serializable data in one explicit current wire format. Rector exact-decodes the current envelope on ingress and returns detached data on save. Missing, older, or future document/schema versions are rejected; migration and preserved-document modes are not part of the runtime. The live DOM is never the storage contract.

Each block has a stable `id`, a registered `type`, plugin-owned `data`, and optional `revision`, `tunes`, and `inline` fields. The core owns the envelope and identities; a plugin owns only the shape of its own `data`. A producer-owned `revision` is an optimization token for incremental rendering, not another schema version.

The document version describes the wire envelope and cross-plugin conventions. Each registered block or inline schema has its own exact `currentVersion`; serialized `dataVersion` must match it. Historical conversion, when an application deliberately needs it, happens outside Rector before current data is passed in.

## The editor composition boundary

`createEditor()` is the composition root. It validates current-format configuration and constructs canonical document ownership, prepared transactions, projection/recovery, selection, history, keyboard/native-input ownership, toolbars, clipboard/HTML ingress, diagnostics, localization, and style ownership.

These services communicate through narrow internal interfaces. They are implementation details even when a declaration file exists in the source tree. Public imports are limited to paths declared by the package `exports` map.

## The command boundary

Every persistent interaction enters one command transaction. Core builds a draft, prepares projection and history state, applies the candidate projection, and crosses one commit point for store/history before finalizing superseded lifetimes and publishing immutable events. A failure before commit recovers the previous projection without advancing model or history; unrecoverable recovery fails the editor closed.

Application host commands and user/plugin interaction authority are distinct, especially in read-only mode. Block and inline instances receive scoped `updateData()`, protected DOM-commit operations and revocable `beginTask()` authority instead of managers. See [Commands and history](/guide/commands-history).

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
- one mounted block instance owns listeners and third-party objects attached to its occurrence and releases them in `destroy()`; its scoped mutation authority is revoked before disposal;
- an inline control group releases temporary controls in its `destroy()` callback;
- the renderer owns mounted renderer instances per output container and releases them through `destroy(container?)`;
- the application owns the editor handle and any renderer style owner it creates.

No extension should depend on page unload for cleanup.

## Data flow

### Initial load

1. The application passes a current `2.0.0` document to `createEditor()`.
2. The shared current-only boundary validates the envelope, block identities and exact registered schema versions before live state is changed.
3. The registry snapshots reusable definitions and creates per-editor runtimes.
4. Block/inline projections are staged with candidate-scoped contexts and become active only after successful mount/commit.
5. Canonical inline placeholders are hydrated only from the block-level `inline` sidecar; external widget-shaped HTML is not a decoder.

### Editing and save

1. A host command, native input, toolbar action or extension context enters the canonical command boundary.
2. Data-first operations assemble complete canonical records; protected rich-text edits may mutate registered projection fields and synchronously serialize only the affected blocks.
3. The transaction prepares projection/history state before committing the model.
4. Inline occurrences are serialized back to canonical placeholders plus the block-level `inline` sidecar, with collision/literal handling owned by canonical transforms.
5. `save()` exports detached current data; async persisted work commits only through a live `DataTask`.

### Document rendering

1. The application passes saved JSON to an `EditorRenderer`.
2. The renderer selects a `BlockRenderer` by block `type`.
3. Registered current inline records are exact-decoded and their canonical placeholders are rehydrated through inline renderers.
4. The block renderer returns output DOM.
5. `destroy()` releases renderer-owned resources when the container is replaced or removed.

## Dependency direction

The core does not import application code. Block plugins depend on public contracts and small shared utilities. The renderer depends on the document contract, not the editing runtime. Optional integrations are loaded only by features that require them.

Keep this direction when creating extensions: depend on exported types and context capabilities, never on files under `core/` that are not exported by `package.json`.
