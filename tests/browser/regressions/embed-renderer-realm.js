import { EditorRenderer } from '../../../renderer/index.js'
import { createEmbedRenderer } from '../../../renderer/renderers/embed/index.js'
import { test, equal, assert } from './harness.js'

const data = {
  service: 'youtube', videoId: 'dQw4w9WgXcQ', caption: '<b>Owned caption</b>',
  cover: '', title: 'Owned title', duration: '1:00',
}
function forbidAmbient(operation) {
  const create = document.createElement
  document.createElement = () => { throw new Error('embed renderer borrowed ambient document') }
  try { return operation() } finally { document.createElement = create }
}
export function register() {
  test('public embed renderTo builds its entire player in the container owning document', () => {
    const frame = document.createElement('iframe')
    document.body.appendChild(frame)
    const renderer = new EditorRenderer({ blockTypes: ['embed'], injectStyles: false })
    try {
      const doc = frame.contentDocument
      const container = doc.createElement('main')
      doc.body.appendChild(container)
      forbidAmbient(() => renderer.renderTo({ blocks: [{ id: 'e', type: 'embed', data }] }, container))
      const player = container.querySelector('.editor-embed__player')
      assert(player)
      equal(player.ownerDocument, doc)
      equal(container.querySelector('b').textContent, 'Owned caption')
    } finally { renderer.destroy(); frame.remove() }
  })

  test('foreign embed play callback retains the correct document after player adoption', () => {
    const frame = document.createElement('iframe')
    document.body.appendChild(frame)
    const renderer = new EditorRenderer({ blockTypes: ['embed'], injectStyles: false })
    try {
      const doc = frame.contentDocument
      const container = doc.createElement('main')
      doc.body.appendChild(container)
      renderer.renderTo({ blocks: [{ id: 'e', type: 'embed', data }] }, container)
      forbidAmbient(() => container.querySelector('.editor-embed__play-btn').click())
      const playerFrame = container.querySelector('iframe')
      assert(playerFrame, 'the play action must create its iframe')
      equal(playerFrame.ownerDocument, doc)
      equal(playerFrame.title, 'Owned title')
      equal(playerFrame.getAttribute('src'), 'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0')
    } finally { renderer.destroy(); frame.remove() }
  })

  test('direct embed renderer honors an explicit ownerDocument and preserves the caption', () => {
    const frame = document.createElement('iframe')
    document.body.appendChild(frame)
    try {
      const doc = frame.contentDocument
      const renderer = createEmbedRenderer('owned', {})
      const parse = text => doc.createTextNode(text)
      const output = forbidAmbient(() => renderer.render({ type: 'embed', data }, parse, { ownerDocument: doc }))
      equal(output.ownerDocument, doc)
      equal(output.querySelector('.owned-embed__preview').ownerDocument, doc)
      equal(output.querySelector('.owned-embed__caption').textContent, '<b>Owned caption</b>')
    } finally { frame.remove() }
  })

  test('same-document embed still plays once with its sandbox and accessible title', () => {
    const renderer = createEmbedRenderer('same', {})
    const output = renderer.render({ type: 'embed', data }, text => document.createTextNode(text))
    const play = output.querySelector('.same-embed__play-btn')
    play.click(); play.click()
    equal(output.querySelectorAll('iframe').length, 1)
    equal(output.querySelector('iframe').title, 'Owned title')
    assert(output.querySelector('iframe').hasAttribute('sandbox'))
  })
}
