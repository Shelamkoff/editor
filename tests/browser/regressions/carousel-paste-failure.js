import { Carousel } from '../../../plugins/carousel/index.js'
import { test, equal, assert, pause } from './harness.js'

export function register() {
  test('carousel event-started paste observes errors without swallowing waitForPaste rejection', async () => {
    const plugin = new Carousel({ uploadFile: async () => ({ url: 'https://example.test/video.mp4' }) })
    const failure = new Error('paste command checkpoint failed')
    const root = plugin.render({ _pendingFile: new File(['sample'], 'clip.mp4', { type: 'video/mp4' }) }, {
      ownerDocument: document, readOnly: false, mutate() { throw failure },
    })
    const pending = plugin.waitForPaste(root)
    try {
      // render() can start a load before its staging owner observes the Promise.
      await pause(10)
      let rejected
      await pending.catch(error => { rejected = error })
      equal(rejected, failure, 'the staging owner must still receive the application error')
      assert(plugin.save(root).slides.length === 0, 'failed checkpoint must not add slides')
    } finally { plugin.destroy(root); plugin.dispose() }
  })
}
