import { Gallery } from '../../../plugins/gallery/index.js'
import { test, equal, assert, pause } from './harness.js'

const file = () => new File(['pixel'], 'pixel.png', { type: 'image/png' })
const config = mode => mode === 'remote'
  ? { uploadFile: async () => ({ url: 'https://example.test/pixel.png' }) } : {}

export function register() {
  for (const mode of ['local', 'remote']) {
    test(`gallery ${mode} application failure rejects waitForPaste and clears loading`, async () => {
      const plugin = new Gallery(config(mode))
      const failure = new Error('gallery application failed')
      const root = plugin.render(plugin.onPaste({ type: 'file', file: file() }), {
        ownerDocument: document, readOnly: false, mutate() { throw failure },
      })
      document.body.appendChild(root)
      try {
        const result = await Promise.race([
          plugin.waitForPaste(root).then(() => 'fulfilled', error => error === failure ? 'rejected' : 'wrong error'),
          pause(1000).then(() => 'pending'),
        ])
        equal(result, 'rejected')
        assert(!root.classList.contains('oe-gallery--loading'), 'loading was not cleared')
        equal(plugin.save(root).images, [])
      } finally { plugin.destroy(root); root.remove() }
    })
    test(`gallery ${mode} dropped-file failure is observed without unhandledrejection`, async () => {
      const plugin = new Gallery(config(mode))
      let attempts = 0
      const root = plugin.render({}, {
        ownerDocument: document, readOnly: false,
        mutate() { attempts++; throw new Error('dropped gallery application failed') },
      })
      document.body.appendChild(root)
      try {
        const dataTransfer = new DataTransfer()
        dataTransfer.items.add(file())
        root.querySelector('.oe-gallery__select').dispatchEvent(new DragEvent('drop', { dataTransfer, bubbles: true, cancelable: true }))
        const deadline = performance.now() + 1000
        while ((!attempts || root.classList.contains('oe-gallery--loading')) && performance.now() < deadline) await pause(10)
        equal(attempts, 1)
        assert(!root.classList.contains('oe-gallery--loading'))
        equal(plugin.save(root).images, [])
        // The harness independently fails any window error/unhandledrejection.
        await pause()
      } finally { plugin.destroy(root); root.remove() }
    })
  }
}
