import { EditorRenderer } from '../../../renderer/index.js'
import { createAttachesRenderer } from '../../../renderer/renderers/attaches/index.js'
import { test, equal, assert, pause } from './harness.js'
const parse = text => document.createTextNode(text)

export function register() {
  for (const retirement of ['destroy', 'replace']) {
    test(`attachment ZIP control retired by ${retirement} cannot start downloads`, async () => {
      const original = window.fetch
      const urls = []
      window.fetch = async url => { urls.push(url); return new Response('', { status: 404 }) }
      const files = [
        { url: 'https://example.test/a.txt', name: 'a.txt', size: 1, extension: 'txt' },
        { url: 'https://example.test/b.txt', name: 'b.txt', size: 1, extension: 'txt' },
      ]
      const container = document.createElement('main')
      document.body.appendChild(container)
      const renderer = new EditorRenderer({ blockTypes: ['attaches'], injectStyles: false })
      let direct, root
      try {
        if (retirement === 'destroy') {
          direct = createAttachesRenderer('retired', {})
          root = direct.render({ type: 'attaches', data: { files, variant: 'a' } }, parse)
          container.appendChild(root)
        } else {
          renderer.renderTo({ blocks: [{ id: 'a', type: 'attaches', data: { files, variant: 'a' } }] }, container)
          root = container.querySelector('.editor-attaches')
        }
        const download = root.querySelector('a[href="#"]')
        assert(download, 'ZIP link fixture must exist')
        download.click()
        const deadline = performance.now() + 2000
        while (urls.length < 2 && performance.now() < deadline) await pause(10)
        equal(urls, ['https://example.test/a.txt', 'https://example.test/b.txt'])
        await pause()
        urls.length = 0
        if (direct) direct.destroy(root)
        else renderer.renderTo({ blocks: [] }, container)
        download.click()
        await pause(20)
        equal(urls, [], 'retired control must not perform a new network operation')
      } finally { direct?.destroy(root); renderer.destroy(); container.remove(); window.fetch = original }
    })
  }
}
