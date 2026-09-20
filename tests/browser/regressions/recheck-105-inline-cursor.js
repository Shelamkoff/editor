import { EditorRenderer } from '../../../renderer/index.js'
import { deserializeInlineHtml } from '../../../shared/inlineMarshal.js'
import { test, equal } from './harness.js'

export function register() {
  test('nested renderer calls keep independent inline placeholder cursors', () => {
    const calls = []
    let renderer
    let nested = false
    const plugin = {
      type: 'nested-probe',
      getData() { return {} },
      createWidget(data, id, { ownerDocument }) {
        calls.push(id)
        const span = ownerDocument.createElement('span')
        span.dataset.inlinePlugin = 'nested-probe'
        span.dataset.id = id
        span.textContent = data.label
        if (id === 'parent' && !nested) {
          nested = true
          const inner = renderer.renderBlock({
            type: 'paragraph', data: { text: '{{inner}}' },
            inline: { inner: { type: 'nested-probe', data: { label: 'INNER' } } },
          })
          span.textContent += `(${inner.textContent})`
          renderer.destroy(inner)
        }
        return span
      },
    }
    renderer = new EditorRenderer({ blockTypes: ['paragraph'], inlinePlugins: [plugin], injectStyles: false })
    try {
      const result = renderer.renderBlock({
        type: 'paragraph', data: { text: '{{parent}} / {{last}}' },
        inline: {
          parent: { type: 'nested-probe', data: { label: 'P' } },
          last: { type: 'nested-probe', data: { label: 'LAST' } },
        },
      })
      equal(calls, ['parent', 'inner', 'last'])
      equal(result.textContent, 'P(INNER) / LAST')
    } finally { renderer.destroy() }
  })

  test('nested deserialization failure preserves a token without retrying its factory', () => {
    let calls = 0
    const registry = new Map([['probe', {
      createWidget() {
        if (++calls === 1) {
          deserializeInlineHtml('{{unresolved}}', {}, registry, document)
          throw new Error('invalid widget')
        }
        const element = document.createElement('span')
        element.textContent = 'MUST NOT RETRY'
        return element
      },
    }]])
    const result = deserializeInlineHtml('before {{outer}} after', {
      outer: { type: 'probe', data: {} },
    }, registry, document)
    equal(calls, 1)
    equal(result, 'before {{outer}} after')
  })
}
