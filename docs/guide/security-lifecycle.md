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

## Raw HTML

The Raw block exists for intentionally accepted HTML, but it still uses the library's raw-content policy. Do not use it to render administrator input, embedded scripts, arbitrary iframes, event handler attributes, or application templates.

If an application needs a richer embed, create a typed plugin whose data stores an approved service and resource identifier, then construct the DOM with fixed attributes in its renderer.

## URLs and external content

Accept only schemes required by the feature. In most links this means `https:` and optionally `http:`. Reject or normalize `javascript:`, unsafe `data:` forms, credentials in URLs, and application-specific schemes unless a reviewed requirement explicitly permits them.

External previews, mentions, uploads, polls, and embeds should receive structured data from application callbacks. Rector does not authenticate those services, apply authorization, rate-limit requests, or validate server business rules.

## Files

Client MIME types and extensions are hints, not proof. Before upload, enforce application limits for count and size. On the server, validate actual file content, generate safe names, isolate storage, and serve with correct content headers.

Revoke every object URL after the preview is replaced or the block is destroyed.

## Clipboard

Paste routing first matches declared plugin capabilities and then passes a normalized event to the plugin. A plugin must still sanitize `event.element`, validate `event.file`, and parse `event.data` defensively.

Asynchronous paste work participates in one history transaction through `waitForPaste()`. Rejecting that promise must leave no partially committed document state.

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

A block plugin's `destroy(element)` is called for each owned element. An inline plugin's `destroy()` is called when the editor is destroyed. Inline tool `destroy()` releases tool-wide resources. Temporary control groups may return their own `destroy()` callback.

Track resources explicitly:

```js
class LiveBlock {
  controllers = new WeakMap()

  render(data) {
    const element = document.createElement('div')
    const controller = new AbortController()
    this.controllers.set(element, controller)
    this.load(data.id, controller.signal)
    return element
  }

  destroy(element) {
    this.controllers.get(element)?.abort()
    this.controllers.delete(element)
  }
}
```

Use `WeakMap` for per-element state because one plugin instance may render several blocks. Never keep the most recently rendered element in one shared field.

## Renderer lifecycle

Pair every mount with cleanup and every style acquisition with release:

```js
const renderer = createEditorRenderer()
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
