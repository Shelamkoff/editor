import { EditorRenderer } from '../../../renderer/index.js'
import { test, assert, equal } from './harness.js'

export function register() {
  test('renderer executes snapshotted custom renderer methods', () => {
    let renderReads = 0
    let destroyReads = 0
    let renderCalls = 0
    let destroyCalls = 0
    const custom = {
      type: 'stable-contract',
      get render() {
        renderReads++
        if (renderReads > 1) throw new Error('render getter was observed twice')
        return function () {
          renderCalls++
          const element = document.createElement('article')
          element.textContent = 'stable'
          return element
        }
      },
      get destroy() {
        destroyReads++
        if (destroyReads > 1) throw new Error('destroy getter was observed twice')
        return function () { destroyCalls++ }
      },
    }

    const renderer = new EditorRenderer({ blockTypes: [], injectStyles: false })
    renderer.registerRenderer(custom)
    const element = renderer.renderBlock({ type: 'stable-contract', data: {} })
    equal(element.textContent, 'stable')
    renderer.destroy(element)
    equal(renderReads, 1)
    equal(destroyReads, 1)
    equal(renderCalls, 1)
    equal(destroyCalls, 1)
    renderer.destroy()
  })

  test('renderer executes snapshotted inline plugin methods', () => {
    let createReads = 0
    let dataReads = 0
    const plugin = {
      type: 'stable-inline',
      get createWidget() {
        createReads++
        if (createReads > 1) throw new Error('createWidget getter was observed twice')
        return function (_data, id, context = { ownerDocument: document }) {
          const element = context.ownerDocument.createElement('span')
          element.dataset.inlinePlugin = 'stable-inline'
          element.dataset.id = id || 'w'
          element.textContent = 'widget'
          return element
        }
      },
      get getData() {
        dataReads++
        if (dataReads > 1) throw new Error('getData getter was observed twice')
        return function () { return {} }
      },
    }

    const renderer = new EditorRenderer({
      blockTypes: ['paragraph'],
      inlinePlugins: [plugin],
      injectStyles: false,
    })
    const element = renderer.renderBlock({
      type: 'paragraph',
      data: { text: '{{w}}' },
      inline: { w: { type: 'stable-inline', data: {} } },
    })

    assert(element.textContent.includes('widget'), 'snapshotted inline plugin did not render')
    equal(createReads, 1)
    equal(dataReads, 1)
    renderer.destroy(element)
    renderer.destroy()
  })
}
