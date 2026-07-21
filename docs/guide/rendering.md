# Rendering documents

`EditorRenderer` converts saved Rector documents into DOM without mounting editing controls, history, selection, or toolbars. Use it for article pages, previews, exports, and any view that only needs the document result.

The synchronous renderer entry contains the complete built-in preset. Its module graph includes the Gallery and Person integrations, so install their optional peers before importing `@shelamkoff/rector/renderer`:

```bash
npm install @shelamkoff/rector @shelamkoff/carousel @shelamkoff/expose @shelamkoff/masonry
```

Applications that never import the renderer do not need those packages. `blockTypes` limits constructed renderers but cannot change ESM module resolution after the entry has been imported.

## Basic usage

```js
import { createEditorRenderer } from '@shelamkoff/rector/renderer'

const renderer = createEditorRenderer({ theme: 'dark' })
renderer.renderTo(documentData, document.querySelector('#article'))

// When the view is removed:
renderer.destroy()
```

The renderer accepts the document returned by `editor.save()` directly. Metadata such as `time`, `version`, and block `id` is optional to rendering; `blocks`, each block `type`, and plugin data are the functional inputs.

## Configuration

```ts
interface RendererConfig {
  injectStyles?: boolean
  classPrefix?: string
  throwOnUnknown?: boolean
  theme?: 'dark' | 'light'
  validationMode?: 'preserve' | 'strict'
  onValidationError?: (issue: { blockId?: string; type: string }) => void
  locale?: Record<string, LocaleValue>
  blockTypes?: BlockType[]
  blockConfigs?: {
    poll?: PollRendererConfig
    [type: string]: unknown
  }
  inlinePlugins?: InlinePluginLike[]
}
```

| Option | Default | Meaning |
| --- | --- | --- |
| `injectStyles` | `true` | automatically load base and registered-renderer styles on first render |
| `classPrefix` | `editor` | namespace used by generated renderer classes |
| `throwOnUnknown` | `true` | throw for an unregistered block instead of rendering a placeholder |
| `theme` | `dark` | renderer theme tokens |
| `validationMode` | `preserve` | normalize malformed built-in data, or throw before rendering it in `strict` mode |
| `onValidationError` | none | receive a content-free `{ blockId?, type }` notice for invalid built-in data |
| `locale` | built-in English | flat `renderer.*` message dictionary |
| `blockTypes` | all built-ins | construct only selected built-in renderers |
| `blockConfigs` | none | runtime configuration keyed by built-in block type |
| `inlinePlugins` | none | factories used to restore persistent inline widgets |

The default fails explicitly when a renderer is missing. Set `throwOnUnknown: false` only when a mixed-version application intentionally accepts a placeholder for unsupported blocks. The placeholder has the class `<classPrefix>-unknown` and a `data-block-type` attribute; it does not reproduce the missing content.

Validation covers built-in data shapes and URL policies before their built-in renderers run. In `preserve` mode malformed data is replaced with the built-in type's normalized safe shape and `onValidationError` is called; in `strict` mode an `InvalidBlockDataError` is thrown instead. A custom renderer registered for the same type owns its own validation contract, so replacing a built-in renderer also disables that built-in validator.

`blockConfigs.poll` accepts the same `dataSource`, `compareRevisions`, `onError`, and `maxVoters` runtime options as the Poll editor plugin. `compareRevisions(next, current)` must return a positive value only when `next` is newer; without it, unequal opaque revisions follow arrival order. The renderer loads and subscribes to current results without changing the supplied document. Call `destroy()` to abort requests and unsubscribe.

## TypeScript contracts

Import renderer values from `@shelamkoff/rector/renderer` and renderer-only declarations from the type-only entry:

```ts
import { createEditorRenderer } from '@shelamkoff/rector/renderer'
import type {
  BlockRenderer,
  OutputData,
  ParagraphBlock,
  RendererConfig,
} from '@shelamkoff/rector/renderer/types'
```

The type entry exports:

- the document envelope `OutputData`, the generic block shape `OutputBlockData`, and `InlineWidget`;
- `Block`, `BlockType`, and a named block alias such as `ParagraphBlock`, `ImageBlock`, or `PollBlock` for every built-in renderer;
- the matching data contracts such as `ParagraphData`, `ImageData`, `GalleryData`, `CarouselData`, `PollData`, and `PersonData`;
- extension contracts `BlockRenderer`, `InlineParser`, `InlinePluginLike`, and `RendererConfig`;
- poll integration contracts `PollDataSource`, `PollResults`, `PollVoter`, and `PollRendererConfig`.

Use `OutputData` when a renderer-only application does not depend on editor types. An `EditorDocument` returned by `editor.save()` is structurally compatible and does not need conversion. Use a named block alias when implementing a renderer for a known built-in data shape; use `OutputBlockData<'callout', CalloutData>` for an application-defined type.

## Rendering methods

`renderBlock(block)` returns one block element or follows the unknown-block policy. The returned element is owned by this renderer instance; release it with `renderer.destroy(element)` before discarding it.

`render(data)` returns a wrapper containing all rendered blocks. The caller chooses where to mount it, while the renderer retains cleanup ownership; release that result with `renderer.destroy(wrapper)`.

`renderTo(data, container)` replaces renderer-owned output in a container and records the mounted block elements for later cleanup.

```js
const wrapper = renderer.render(documentData)
preview.replaceChildren(wrapper)
```

Prefer `renderTo()` for a container that will be updated repeatedly because its cleanup ownership is explicit.

## Incremental updates and block revisions

`renderTo()` matches blocks by stable `id` and current order. An unchanged block keeps the same DOM element and renderer-owned resources; a changed block alone is replaced. Re-registering or unregistering a renderer invalidates reuse for that block type.

When a block has no `revision`, Rector compares a deep signature of its `type`, `data`, `tunes`, and `inline` values. A producer that already maintains an authoritative content revision or stable hash may supply it as `block.revision`. Rector then compares that value in constant time instead of serializing the block data:

```js
const block = {
  id: 'intro',
  revision: 'sha256:9f4c…',
  type: 'paragraph',
  data: { text: 'Hello' },
}
```

Change `revision` whenever `data`, `tunes`, or `inline` changes. Reusing a revision for different content deliberately tells the renderer that the block is unchanged. The editor preserves an incoming revision while the block remains untouched and removes it after the first local mutation because it cannot mint the producer's next revision.

## Registering renderers

Built-in renderers are registered by default. Add or replace one by matching the stored block `type`:

```js
renderer.registerRenderer(createCalloutRenderer('article'))

renderer.hasRenderer('callout')       // true
renderer.getRegisteredTypes()         // string[]
renderer.unregisterRenderer('callout')
```

Registering the same type replaces the previous renderer for future output. Release already mounted output before removing a renderer whose `destroy(element)` method owns resources.

## Loading only used block types

For a smaller initial graph, create plugins and renderers from a document or explicit type list through asynchronous entry points.

```js
import { createBlockPluginsAsync } from '@shelamkoff/rector/plugins/async'
import { createDefaultRenderersAsync } from '@shelamkoff/rector/renderer/async'

const plugins = await createBlockPluginsAsync(documentData)
const renderers = await createDefaultRenderersAsync('oe', {}, documentData)
```

The asynchronous helpers use known public block types. An unknown type rejects rather than importing an arbitrary path.

## Inline formatting and widgets

Every block renderer receives `parseInline(text)`. It sanitizes supported inline markup and returns a `DocumentFragment`; append the fragment instead of assigning `innerHTML`.

Persistent widgets also require a lightweight renderer-side plugin with `type`, `createWidget(data, id)`, and `getData(element)`. Its `createWidget()` must preserve the supplied id as `data-id`.

The block renderer's `mapTextFields()` must identify exactly the same HTML-bearing fields as the editor plugin. Rector expands <code>&#123;&#123;id&#125;&#125;</code> placeholders before calling the renderer.

## Styles

With the default `injectStyles: true`, the first render automatically acquires the deduplicated base and registered-renderer stylesheet URLs. Destroying the last owned result or calling a full `renderer.destroy()` releases that automatic owner. `getStyleUrls()` exposes the URLs, and `injectStyles()` remains available for explicit preloading; it returns an independent release handle.

```js
import '@shelamkoff/rector/styles/renderer.css'
import '@shelamkoff/rector/renderer/renderers/gallery/styles.css'

const renderer = createEditorRenderer({
  blockTypes: ['gallery'],
  injectStyles: false,
})
renderer.renderTo(documentData, container)
```

Do not import editor UI CSS for output-only content. Bundler-managed mode uses `@shelamkoff/rector/styles/renderer.css` plus each selected `renderer/renderers/<type>/styles.css` subpath. The all-in-one `@shelamkoff/rector/styles.css` is also available when bundle size is not a concern.

## Cleanup

`destroy(target)` accepts a container previously passed to `renderTo()`, a wrapper returned by `render()`, or an element returned by `renderBlock()`. It invokes the owning block renderer's optional `destroy(element)`, empties renderer-owned output, and forgets that result. `destroy()` without an argument releases every result owned by the instance.

Cleanup does not remove a container supplied by the application. It releases renderer-owned observers, listeners, and third-party instances and forgets the mount. Automatic styles are released when no owned result remains. A separate handle returned by an explicit `injectStyles()` call has its own lifetime and must still be released with its own `destroy()`.

## Security boundary

Renderer input may come from storage or another service and remains untrusted. Built-in renderers use the shared sanitizers for HTML, URLs, and styles. A custom renderer must use `textContent`, `parseInline()`, safe attribute setters, and explicit allowlists. Never assume that content was safe because it previously passed through an editor.

See the [renderer catalog](/reference/editor/renderers/index) for exact block data and feature-specific dependencies.
