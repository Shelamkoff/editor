import { EditorRenderer } from '../../../renderer/index.js'
import { createEmbedRenderer } from '../../../renderer/renderers/embed/index.js'
import { test, equal, assert } from './harness.js'

const data = videoId => ({ service: 'youtube', videoId, caption: '', cover: '', title: '', duration: '' })
const block = videoId => ({ id: 'video', type: 'embed', data: data(videoId) })

export function register() {
  for (const started of [false, true]) {
    test(`Embed direct renderer disposal ${started ? 'stops playback' : 'prevents playback'} and retires its Play control`, () => {
      const renderer = createEmbedRenderer('direct', {})
      const root = renderer.render(block('abcdefghijk'), text => document.createTextNode(text))
      document.body.appendChild(root)
      try {
        const play = root.querySelector('button')
        if (started) { play.click(); equal(root.querySelectorAll('iframe').length, 1) }
        renderer.destroy?.(root)
        equal(root.querySelectorAll('iframe').length, 0, 'a disposed player must release its embedded browsing context')
        play.click()
        equal(root.querySelectorAll('iframe').length, 0, 'a retired control must not create another player')
        renderer.destroy?.(root)
      } finally { root.remove() }
    })
  }

  test('Embed replacement retires the old Play button but leaves the new player usable', () => {
    const container = document.createElement('main')
    document.body.appendChild(container)
    const renderer = new EditorRenderer({ blockTypes: ['embed'], injectStyles: false })
    try {
      renderer.renderTo({ blocks: [block('abcdefghijk')] }, container)
      const oldRoot = container.querySelector('figure'), oldPlay = oldRoot.querySelector('button')
      renderer.renderTo({ blocks: [block('ABCDEFGHIJK')] }, container)
      oldPlay.click()
      equal(oldRoot.querySelectorAll('iframe').length, 0)
      container.querySelector('button').click()
      const frame = container.querySelector('iframe')
      assert(frame, 'live replacement must play')
      assert(frame.src.includes('ABCDEFGHIJK'))
    } finally { renderer.destroy(); container.remove() }
  })

  test('Embed renderer destroy releases playback in a fragment mounted by the consumer', () => {
    const container = document.createElement('main')
    document.body.appendChild(container)
    const renderer = new EditorRenderer({ blockTypes: ['embed'], injectStyles: false })
    try {
      container.appendChild(renderer.render({ blocks: [block('abcdefghijk')] }))
      const root = container.querySelector('figure'), play = root.querySelector('button')
      play.click()
      equal(root.querySelectorAll('iframe').length, 1)
      renderer.destroy()
      equal(root.querySelectorAll('iframe').length, 0)
      play.click()
      equal(root.querySelectorAll('iframe').length, 0)
    } finally { renderer.destroy(); container.remove() }
  })
}
