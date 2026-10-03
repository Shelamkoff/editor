# Document format

Rector accepts one serialized document format. The current wire version is `2.0.0`; the editor, renderer, async presets, and private clipboard import share the same current-only boundary.

## Document envelope

```ts
interface EditorDocument {
  version: '2.0.0'
  time?: number
  blocks: BlockData[]
}
```

```json
{
  "version": "2.0.0",
  "blocks": [
    {
      "id": "p1",
      "type": "paragraph",
      "dataVersion": 2,
      "data": { "text": "Hello" }
    }
  ]
}
```

`version` and `blocks` are required. A missing, older, or future envelope version is rejected before projection. `time` is optional and, when present, must be a finite JSON number.

## Block data

```ts
interface BlockData {
  id: string
  type: string
  dataVersion: number
  data: Record<string, unknown>
  revision?: string | number
  tunes?: Record<string, unknown>
  inline?: Record<string, EditorInlineWidget>
}
```

```ts
interface EditorInlineWidget {
  type: string
  dataVersion: number
  data: Record<string, unknown>
}
```

`id`, `type`, `dataVersion`, and `data` are required. Block ids are unique in one document. For a registered block or inline type, `dataVersion` must equal that schema's `currentVersion` exactly. A schema whose current version is `1` is current, not legacy. Numeric `revision` values must be finite.

## Plugin-owned data

```json
{
  "id": "h1",
  "type": "heading",
  "dataVersion": 2,
  "data": { "text": "Title", "level": 2 },
  "tunes": { "textAlign": "center" }
}
```

```js
const encoded = definition.schema.encode(localData)
const decoded = definition.schema.decode({
  dataVersion: encoded.dataVersion,
  data: encoded.data,
})
```

Local authoring values use `schema.encode()`. Serialized values use `schema.decode()` and must carry the exact current version. Paragraph and Heading alignment belongs only to `tunes.textAlign`; old `data.align` shapes are rejected.

## Inline widget storage

```json
{
  "data": { "text": "Hello {{mention-1}}" },
  "inline": {
    "mention-1": {
      "type": "mention",
      "dataVersion": 1,
      "data": { "id": "42", "name": "Ada" }
    }
  }
}
```

```ts
type InlineTable = Record<string, EditorInlineWidget>
```

An unregistered current-format inline type remains opaque and inert. If the type is registered, its exact schema version is validated before any runtime code is invoked. Rich-text placeholders and the inline sidecar are one logical value and must be transformed together.

## HTML-bearing fields

```html
<b>safe formatting</b>
```

```text
External HTML is sanitized before it becomes canonical plugin data.
Host-created live widget markers are not a serialized widget decoder.
```

Rich-text and raw-HTML capabilities retain their existing sanitizer, URL policy, and Trusted Types protections. Current-only versioning does not weaken security boundaries.

## Current-only validation

The public boundary rejects malformed JSON, sparse arrays, unsupported envelope fields, duplicate block ids, absent required metadata, and known schema mismatches before committing a document. Unknown block types are different: when their current envelope is valid, Rector owns their JSON as opaque data and exposes them as `unregistered`.

## Version rules

The document version is a wire-format version, not the npm package version. A library patch does not automatically change `2.0.0`. When the wire contract changes, the new format is explicit and old documents are not relabelled or guessed.

## No built-in migrations

Rector v2 does not expose `DocumentMigration`, `documentVersionPolicy`, migration chains, or a preserved-document mode. Applications that deliberately transform external historical data must do so outside Rector and pass a fully valid current document afterward.

## Extension validation

Registered block and inline definitions provide exact-version schemas with `currentVersion`, `createDefault()`, `encode()`, and `decode()`. Invalid known data is rejected. `onValidationError` is content-free and observational; callback failures cannot turn rejected data into accepted data.

## Evolution rules

Change the current schema deliberately: update producers and consumers together, bump the affected schema version when its serialized shape changes, and update the document wire version only when the envelope contract changes. Do not add implicit versions, fallback migrations, compatibility aliases, or silent legacy normalization. Historical JSON belongs in negative tests or an application-owned external converter, not in Rector's runtime.
