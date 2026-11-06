# Security and lifecycle

Rector sanitizes supported content boundaries, but an editor is not a trust boundary. Treat documents, clipboard input, callback results, files, URLs, and plugin configuration as untrusted whenever they originate outside the current application process.

## Content model

Built-in text plugins store a limited HTML subset for inline formatting. Shared sanitizers remove unsupported tags, attributes, URL schemes, and style declarations. Built-in renderers sanitize again because stored content may have bypassed the editor.

Sanitization is context-specific:

- use `textContent` for plain text;
- use `sanitizeHtml()` only for the supported formatting subset;
- use Rector URL utilities or explicit protocol allowlists for links and media;
- use explicit CSS property allowlists for user-controlled styles;
- never pass arbitrary HTML to `innerHTML`, `insertAdjacentHTML`, or SVG markup sinks.

## Trusted Types

Rector supports pages that enforce `Content-Security-Policy: require-trusted-types-for 'script'`. Internal HTML sinks reuse the owning realm's `rector` policy rather than a default policy. The Raw sanitizer uses that same policy only for its inert parse and sanitized output, so it does not compete for the `dompurify` policy name with an independent host instance. An explicit `trusted-types` allowlist must permit `rector`; permit `dompurify` as well if the application separately uses DOMPurify's default policy. No `allow-duplicates` or script/script-URL policy callback is required. Existing allowlists containing both names remain supported.

Rector never installs a default policy. `sanitizeHtml()` intentionally remains a string-returning API because sanitized HTML is also persisted as document data and may be sent to storage or the network. Application code must not take that returned string and assign it directly to a Trusted Types-protected HTML sink. Prefer DOM construction, or create and review an application-owned policy for that specific integration.

A Trusted Types value is not an authorization decision. Persisted/user HTML must still pass the appropriate sanitizer before it reaches Rector's internal trusted sink helpers. Plugin icons and other extension-provided markup execute with the same application-level trust described under [Extension trust](#extension-trust).

## Raw HTML

The Raw block exists for intentionally accepted HTML, but it still uses the library's raw-content policy. Do not use it to render administrator input, embedded scripts, arbitrary iframes, event handler attributes, or application templates.

If an application needs a richer embed, create a typed plugin whose data stores an approved service and resource identifier, then construct the DOM with fixed attributes in its renderer.

## URLs and external content

Accept only schemes required by the feature. In most links this means `https:` and optionally `http:`. Reject or normalize `javascript:`, unsafe `data:` forms, credentials in URLs, and application-specific schemes unless a reviewed requirement explicitly permits them.

External previews, mentions, uploads, polls, and embeds should receive structured data from application callbacks. Rector does not authenticate those services, apply authorization, rate-limit requests, or validate server business rules.

## Files

Client MIME types and extensions are hints, not proof. Before upload, enforce application limits for count and size. On the server, validate actual file content, generate safe names, isolate storage, and serve with correct content headers.

Release object URLs created by an extension when their presentation owner is retired. URLs returned by the paste context's `createObjectURL()` belong to core: it releases them on cancellation or failure and retains committed URLs until editor disposal so Undo/Redo can restore the media reference. Do not revoke those committed URLs from a block instance's cleanup.

## Clipboard

Paste routing uses a definition's `capabilities.paste.accepts(input)` and `resolve(input, context)`. `PasteInput` contains either `{ kind: 'text', text }` or `{ kind: 'file', file }`. A resolver prepares a `PasteResult` or returns `null`; it does not mutate mounted DOM or commit document data itself. Core admits the prepared result through the clipboard transaction. Pass `context.signal` to cancellable work and check it after asynchronous work completes.

For example, this resolver accepts a bounded text file and requests insertion as plain text. The `replacement.kind: 'text'` result lets core escape the text for the destination rich-text field.

```js
/** @type {import('@shelamkoff/rector/types').PasteCapability<{text: string}>} */
const textFilePaste = {
  accepts(input) {
    return input.kind === 'file' && input.file.type === 'text/plain'
      && input.file.size <= 1024 * 1024
  },
  async resolve(input, context) {
    if (context.signal.aborted || input.kind !== 'file'
        || input.file.type !== 'text/plain' || input.file.size > 1024 * 1024) return null
    const text = await input.file.text()
    if (context.signal.aborted) return null
    return { kind: 'rich-text', replacement: { kind: 'text', text } }
  },
}
```

Assign this object to the definition's `capabilities.paste`. MIME and size checks are application policy, not proof of file authenticity. `File.text()` itself is not abortable; the second signal check discards a late result. See [Block extensions](/guide/extensions.md) for the complete schema and capability contracts.

## Extension trust

Plugin `icon`, plugin code, configuration callbacks, and renderer factories execute with application privileges. Install extensions as code dependencies and review them accordingly. The HTML sanitizer cannot protect against a malicious plugin that directly accesses the DOM, network, or storage.

Only import paths listed in the package `exports` map are supported. Importing internal files weakens upgrade and security boundaries.

## Diagnostics and privacy

Built-in operational diagnostics are content-free. They may contain an operation name, plugin or block type, versions, duration, and error class. Do not attach full documents, selected text, URLs, file names, or user identifiers when forwarding diagnostics to telemetry.

## Editor lifecycle

An editor owns resources from successful creation until `destroy()`:

```js
const editor = createEditor(config)

try {
  // use editor
} finally {
  editor.destroy()
}
```

If composition fails, Rector rolls back resources already acquired. If cleanup itself fails, remaining cleanup continues and `cleanup.failed` can be reported through diagnostics.

## Extension cleanup

A reusable `BlockPluginDefinition.setup(runtimeContext)` creates one editor's `BlockPluginRuntime`. Its `create(initial, context)` creates a separate `BlockInstance` for each mounted occurrence. Mutable DOM, listeners, observers and cleanup belong to that instance; `BlockInstance.destroy()` takes no arguments. Runtime `destroy()` releases editor-wide resources. Inline plugin runtimes and individual widgets likewise have separate cleanup, and inline tool `destroy()` releases the mounted tool's resources.

Keep occurrence state in the `create()` closure. This setup factory accepts an application observer that returns its cleanup function and uses the occurrence's lifecycle signal:

```js
/**
 * @param {(element: HTMLElement, signal: AbortSignal) => () => void} watch
 * @returns {import('@shelamkoff/rector/types').BlockPluginDefinition<{label: string}>['setup']}
 */
function createLiveBlockSetup(watch) {
  return () => ({
    create(initial, context) {
      const element = context.ownerDocument.createElement('div')
      let data = { ...initial }
      let disposed = false
      element.textContent = data.label
      element.setAttribute('aria-readonly', String(context.isReadOnly()))
      const stop = watch(element, context.signal)
      const dispose = () => {
        if (disposed) return
        disposed = true
        context.signal.removeEventListener('abort', dispose)
        stop()
      }
      context.signal.addEventListener('abort', dispose, { once: true })
      if (context.signal.aborted) dispose()
      return {
        element,
        read: () => ({ ...data }),
        update(next) { data = { ...next }; element.textContent = data.label },
        setReadOnly(value) { element.setAttribute('aria-readonly', String(value)) },
        destroy: dispose,
      }
    },
    destroy() {}, // This runtime acquires no editor-wide resources.
  })
}
```

Use the returned function as the definition's `setup`. Each occurrence receives its own element, state and idempotent cleanup. A definition may be reused by several editors; a shared "last rendered element" field would mix their owners. An observer that throws while acquiring resources must release its partial acquisition before propagating the error.

## Asynchronous persisted updates

An ordinary lifecycle `signal` is suitable for presentation work. Persisted asynchronous changes require a scoped `DataTask`: obtain it with `context.beginTask()`, pass `task.signal` to the loader and call `task.commit(producer)` against the current data. Replacement, destruction, generation changes or entering read-only mode revoke that task. Returning to editable mode does not revive it. `commit()` returns `false` when it can no longer authorize the update.

```js
/**
 * @param {import('@shelamkoff/rector/types').BlockInstanceContext<{label: string, note: string}>} context
 * @param {(signal: AbortSignal) => Promise<string>} loadLabel
 * @returns {Promise<boolean>}
 */
async function refreshLabel(context, loadLabel) {
  if (context.signal.aborted || context.isReadOnly()) return false
  const task = context.beginTask()
  try {
    const label = await loadLabel(task.signal)
    if (task.signal.aborted) return false
    return task.commit(current => ({ ...current, label }))
  } finally {
    task.cancel()
  }
}
```

The producer preserves fields edited while the loader was pending. Always release the task in `finally`, including loader failure; handle a rejected loader at the calling application boundary. Do not write a late result into a retained element or an old data snapshot.

## Renderer lifecycle

Pair every mount with cleanup and every style acquisition with release:

```js
const renderer = new EditorRenderer()
const styleOwner = renderer.injectStyles()

renderer.renderTo(data, container)

renderer.destroy(container)
styleOwner.destroy()
```

When replacing one application view with another, cleanup must run even if rendering or later application logic throws.

## Destruction tests

For every stateful extension, test destruction:

1. before an asynchronous request resolves;
2. while a popup or dropdown is open;
3. after repeated render and save cycles;
4. after undo and redo;
5. with multiple blocks sharing one plugin instance;
6. with two editor or renderer instances sharing stylesheet URLs.

After cleanup there should be no active global listeners, observers, timers, animation frames, requests, object URLs, detached DOM references, or unowned style links.
