import { EditorRenderer } from '../../../renderer/index.js'
import { createCodeRenderer } from '../../../renderer/renderers/code/index.js'
import { test, equal, pause } from './harness.js'
const parse = text => document.createTextNode(text)

export function register() {
  for (const retirement of ['destroy', 'replace']) {
    test(`code copy control retired by ${retirement} cannot overwrite the clipboard`, async () => {
      const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
      const writes = []
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { writes.push(text) } } })
      const container = document.createElement('main')
      document.body.appendChild(container)
      const renderer = new EditorRenderer({ blockTypes: ['code'], injectStyles: false })
      try {
        if (retirement === 'destroy') {
          const direct = createCodeRenderer('retired', {})
          const root = direct.render({ type: 'code', data: { code: 'old source', language: '' } }, parse)
          container.appendChild(root)
          direct.destroy(root)
          root.querySelector('button').click()
        } else {
          renderer.renderTo({ blocks: [{ id: 'c', type: 'code', data: { code: 'old source', language: '' } }] }, container)
          const oldButton = container.querySelector('button')
          renderer.renderTo({ blocks: [{ id: 'c', type: 'code', data: { code: 'new source', language: '' } }] }, container)
          oldButton.click()
        }
        await pause()
        equal(writes, [])
        renderer.renderTo({ blocks: [{ id: 'c', type: 'code', data: { code: 'current source', language: '' } }] }, container)
        container.querySelector('button').click()
        await pause()
        equal(writes, ['current source'], 'a live control must still copy its current code')
      } finally {
        renderer.destroy(); container.remove()
        if (original) Object.defineProperty(navigator, 'clipboard', original)
        else delete navigator.clipboard
      }
    })
  }
}
