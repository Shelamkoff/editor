import { Image } from '../../../plugins/image/index.js'
import { test, equal, assert, pause } from './harness.js'

export function register() {
  for (const mode of ['local', 'remote']) {
    test(`image ${mode} application failure is contained and clears loading`, async () => {
      const plugin = new Image(mode === 'remote'
        ? { uploadFile: async () => ({ url: 'https://example.test/pixel.png' }) } : {})
      let attempts = 0
      const file = new File(['pixel'], 'pixel.png', { type: 'image/png' })
      const root = plugin.render(plugin.onPaste({ type: 'file', file }), {
        ownerDocument: document, readOnly: false,
        mutate() { attempts++; throw new Error('image application failed') },
      })
      document.body.appendChild(root)
      try {
        const result = await Promise.race([
          plugin.waitForPaste(root).then(() => 'fulfilled', () => 'rejected'),
          pause(1000).then(() => 'pending'),
        ])
        equal(result, 'fulfilled')
        equal(attempts, 1)
        assert(!root.classList.contains('oe-image--loading'), 'loading was not cleared')
        equal(plugin.save(root).file.url, '')
        // Unexpected window errors fail independently of Promise settlement.
        await pause()
      } finally { plugin.destroy(root); root.remove() }
    })
  }
}
