import { createEditor } from '../../../core/index.js'
import { ExtensionRegistry } from '../../../core/ExtensionRegistry.js'
import { DocumentRuntime } from '../../../core/DocumentRuntime.js'
import { BlockReconciler } from '../../../core/BlockReconciler.js'
import { InlineProjectionRuntime } from '../../../core/InlineProjectionRuntime.js'
import { Diagnostics } from '../../../core/Diagnostics.js'
import { createPresentationDefinitions } from './presentation-fixture.js'

const connectedTag = 'rector-completed-field-widget'
if (!customElements.get(connectedTag)) customElements.define(connectedTag, class extends HTMLElement {
  connectedCallback() {
    if (this.dataset.connected === 'yes') return
    this.dataset.connected = 'yes'
    this.append(this.ownerDocument.createTextNode(' connected'))
  }
})

/** Actual extension methods and existing constructors; no core hooks are replaced. */
export function createCompletionFixture(options = {}) {
  const h = createPresentationDefinitions(options)
  if (options.rewriteNestedTextOnUpdate) for (const record of h.records) record.data.front = `<b>${record.data.front}</b>`
  Object.assign(h.state, { completions: [], instances: [], nativeEdits: [], onCompletion: null, poisonCalls: 0 })
  const originalBlock = h.block
  h.block = { ...originalBlock, setup(runtimeContext) {
    const runtime = originalBlock.setup(runtimeContext)
    return { ...runtime, create(initial, context) {
      const source = runtime.create(initial, context)
      const panel = h.panels.get(initial.name)
      panel.derived = new Map()
      for (const key of ['front', 'back', 'note']) {
        const output = context.ownerDocument.createElement('output')
        output.contentEditable = 'false'
        output.textContent = 'not completed'
        panel.root.append(output)
        panel.derived.set(key, output)
      }
      const occurrence = { name: initial.name, source, panel, context, getterReads: 0 }
      h.state.instances.push(occurrence)
      if (options.repaintFrontOnUpdate || options.rewriteNestedTextOnUpdate) {
        const update = source.update
        source.update = (next, previous) => {
          update.call(source, next, previous)
          if (options.rewriteNestedTextOnUpdate) {
            const text = panel.field().querySelector('b').firstChild
            text.replaceWith(context.ownerDocument.createTextNode(text.textContent))
          } else panel.field().innerHTML = next[panel.active()]
        }
      }
      Object.defineProperty(source, 'afterProjection', { configurable: true, get() {
        occurrence.getterReads++
        if (Object.hasOwn(options, 'getterFailure')) throw options.getterFailure
        return function (field) {
          const notice = { name: initial.name, key: field.key, element: field.element, field,
            text: field.element.textContent, connected: panel.root.isConnected,
            frozen: Object.isFrozen(field), receiver: this === source, occurrence,
          }
          h.state.completions.push(notice)
          const result = h.state.onCompletion?.(notice, field)
          const target = panel.derived.get(field.key)
          if (target?.parentNode === panel.root) target.textContent = field.element.textContent
          return result
        }
      } })
      return source
    } }
  } }

  const originalInline = h.inline
  h.inline = { ...originalInline,
    ...(options.native ? { editing: {
      handle() { return null },
      reconcileNative(input) {
        h.state.nativeEdits.push({ ...input })
        return { kind: 'update', data: { label: input.text } }
      },
    } } : {}),
    schema: { ...originalInline.schema, encode(data) {
      const label = options.native === 'normalize' && data.label === 'a-fron' ? 'a-front' : data.label
      return originalInline.schema.encode({ ...data, label })
    } },
    setup(runtimeContext) {
      const runtime = originalInline.setup(runtimeContext)
      return { ...runtime, create(id, data, context) {
        const source = runtime.create(id, data, context)
        const record = h.latest(id)
        if (options.connectedWidget) {
          const element = runtimeContext.ownerDocument.createElement(connectedTag)
          element.contentEditable = 'false'
          element.append(source.element)
          source.element = element
          record.element = element
        }
        if (options.native) {
          const setReadOnly = source.setReadOnly
          source.setReadOnly = value => {
            source.element.contentEditable = String(!value)
            setReadOnly.call(source, value)
          }
        }
        return source
      } }
    },
  }

  h.holder = document.createElement('section')
  document.body.append(h.holder)
  h.mount = () => {
    if (options.publicEditor) {
      h.editor = createEditor({ holder: h.holder, injectStyles: false, plugins: [h.block], inlinePlugins: [h.inline],
        defaultBlock: h.block.type, readOnly: options.readOnly === true,
        data: { version: '2.0.0', blocks: h.records },
        onDiagnostic: item => h.state.diagnostics.push(item), onValidationError: issue => h.state.validation.push(issue),
      })
      h.editor.on('transaction:committed', event => h.state.transactions.push(event))
      return
    }
    h.registry = new ExtensionRegistry({ ownerDocument: document, blocks: [h.block], inline: [h.inline], defaultBlock: h.block.type, acquireStyles: false })
    h.projection = new InlineProjectionRuntime({ registry: h.registry, ownerDocument: document, readOnly: options.readOnly === true })
    h.runtime = new DocumentRuntime({ registry: h.registry, ownerDocument: document, readOnly: options.readOnly === true,
      data: { version: '2.0.0', blocks: h.records },
      diagnostics: new Diagnostics(item => h.state.diagnostics.push(item)), onValidationError: issue => h.state.validation.push(issue),
      onCommit: event => h.state.transactions.push(event),
      projectorFactory: ports => {
        h.reconciler = new BlockReconciler({ container: h.holder, registry: h.registry, inlineProjection: h.projection,
          readOnly: options.readOnly === true, ...ports,
          reportPresentationFailure(error, original = error) {
            h.state.reports.push(error); h.state.reportOriginals.push(original); ports.reportPresentationFailure(error, original)
          },
        })
        return h.reconciler
      },
    })
  }
  h.dispose = () => {
    try { h.editor?.destroy(); h.runtime?.destroy() }
    finally { try { h.projection?.destroy(); h.registry?.destroy() } finally { h.holder.remove() } }
  }
  return h
}
