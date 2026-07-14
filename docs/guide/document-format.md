# Document format

The stored value is an `EditorDocument`: a versioned JSON envelope containing ordered blocks. It is the only supported interchange format between the editor, persistence, migrations, and the document renderer.

## Document envelope

```ts
interface EditorDocument {
  time?: number
  version: string
  blocks: BlockData[]
}
```

```json
{
  "time": 1783846522956,
  "version": "1.0.0",
  "blocks": [
    {
      "id": "intro",
      "type": "heading",
      "data": {
        "text": "Document title",
        "level": 2
      }
    }
  ]
}
```

`version` is required after normalization. The current version is `1.0.0`. `time` is optional metadata and must be a finite number when present. `blocks` preserves document order.

## Block data

```ts
interface BlockData {
  id: string
  revision?: string | number
  type: string
  data: Record<string, unknown>
  tunes?: Record<string, unknown>
  inline?: Record<string, EditorInlineWidget>
}
```

- `id` is the stable identity used by selection, events, history, and application references. It must be unique inside the document.
- `revision` is an optional producer-owned content revision or stable hash used to accelerate repeated `renderTo()` calls.
- `type` selects the registered block plugin and renderer.
- `data` is owned and validated by that block plugin.
- `tunes` stores optional cross-block settings.
- `inline` stores persistent widgets referenced from the block's text fields.

Do not infer a block's identity from its array index. Indices change after insert, remove, and move operations.

`revision` is not a block id and not the document-format `version`. When supplied, it must change whenever `data` or `inline` changes. Rector preserves an input revision while the editor leaves that block untouched, then removes it after a local mutation because the editor cannot generate the producer's next value. Omitting `revision` is fully supported; the renderer falls back to a deep content signature.

## Plugin-owned data

Every plugin defines its own `data` shape. For example:

```ts
type ParagraphData = {
  text: string
  align?: 'left' | 'center' | 'right' | 'justify'
}

type HeadingData = {
  text: string
  level: 2 | 3 | 4 | 5 | 6
  align?: 'left' | 'center' | 'right'
}
```

Use the plugin reference page as the source of truth for its fields and defaults. Unknown keys should not be used for application metadata: the plugin may discard them during its save round trip. Store document-level application metadata outside `EditorDocument` unless an explicit plugin contract owns it.

## Inline widget storage

Persistent widgets are separated from HTML-bearing text. A text field contains a placeholder <code>&#123;&#123;&lt;id&gt;&#125;&#125;</code>; the block-level `inline` map stores the widget type and payload under the same stable id.

```json
{
  "id": "greeting",
  "type": "paragraph",
  "data": {
    "text": "Hello {{person-42}}"
  },
  "inline": {
    "person-42": {
      "type": "mention",
      "data": {
        "id": "42",
        "name": "Ada"
      }
    }
  }
}
```

The owning text plugin implements `mapTextFields()` so Rector can replace live widget DOM with placeholders during save and restore it during load. Application code should treat placeholder syntax as an internal part of the documented serialization contract and should not edit it independently from the `inline` map.

## HTML-bearing fields

Formatting produced by inline tools is stored in plugin text fields as sanitized HTML. The supported markup is intentionally limited. URLs, styles, tags, and attributes are filtered by the shared sanitizer when content crosses parsing boundaries.

Never concatenate untrusted data into saved HTML. Put text into `textContent`, pass URLs through the plugin contract, and let Rector sanitize persisted markup again during rendering.

## Normalization

`DocumentSchema.normalize(input)` returns a cloned, structurally valid document:

- in `preserve` mode, a non-object input becomes an empty document and a missing `blocks` value becomes an empty array;
- in `strict` mode, those malformed envelopes throw;
- a missing version becomes the current version;
- invalid `time` metadata is omitted;
- migration outputs are always checked strictly before the next step.

The editor applies normalization to initial `data` and every `render()` input.

Application code may run the same envelope and migration pipeline before mounting an editor:

```js
import { DocumentSchema } from '@shelamkoff/rector'

const schema = new DocumentSchema({
  currentVersion: '1.0.0',
  versionPolicy: 'strict',
  migrations,
})

const normalized = schema.normalize(untrustedInput)
```

`currentVersion` defaults to Rector's current document version, `versionPolicy` defaults to `preserve`, and `migrations` defaults to an empty list. `normalize()` does not validate plugin-owned `data` because no block plugin registry is attached to a standalone schema.

## Version policy

The document version belongs to the complete envelope, not to one plugin. Choose one policy for an editor instance:

- `preserve` accepts a structurally valid document at an unknown version when no migration begins at that version;
- `strict` requires a complete migration path to the current version.

Preservation is useful for lossless inspection or staged deployments. Strict mode is appropriate when the application can only operate on the current schema.

## Migrations

A migration is one synchronous directed step:

```ts
interface DocumentMigration {
  from: string
  to: string
  migrate(document: EditorDocument): EditorDocument
}
```

```js
const migrations = [
  {
    from: '0.9.0',
    to: '1.0.0',
    migrate(document) {
      return {
        ...document,
        version: '1.0.0',
        blocks: document.blocks.map(block => (
          block.type === 'text'
            ? { ...block, type: 'paragraph' }
            : block
        )),
      }
    },
  },
]
```

Rector clones the input before each migration, verifies that the result is a document, and forces the declared `to` version. Duplicate `from` values, self-targeting steps, cycles, and incomplete chains are rejected according to policy.

Migration functions must be deterministic and synchronous. Do not perform network requests, read mutable global state, mutate the supplied object in another task, or depend on current locale.

## Block validation

Envelope validation and plugin validation solve different problems. The schema validates the outer document shape. A registered block plugin may implement `validate(data)` for its own payload.

In `validationMode: 'preserve'`, invalid plugin data is retained and reported through `onValidationError`. In `strict` mode, `save()` throws before returning a document. This policy does not replace input sanitization or server-side validation at a trust boundary.

## Compatibility rules

When evolving a published plugin:

1. keep reading previously published data shapes;
2. write one canonical current shape from `save()`;
3. add a document migration when the old shape cannot be read safely;
4. never reuse an existing `type` for unrelated data;
5. preserve block `id` values through migrations;
6. test editor load → save and renderer output for every supported historical fixture.
