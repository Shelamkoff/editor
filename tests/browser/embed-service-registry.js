import { createEditor } from '../../core/index.js'
import { createEmbedPlugin } from '../../plugins/index.js'
import { buildPlayer } from '../../plugins/embed/player.js'

const sandbox = document.querySelector('#sandbox')
const result = document.querySelector('#result')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

try {
  for (const service of ['__proto__', 'constructor', 'toString']) {
    const definition = createEmbedPlugin({ injectStyles: false })
    const holder = document.createElement('section')
    sandbox.appendChild(holder)
    const editor = createEditor({
      holder,
      plugins: [definition],
      defaultBlock: 'embed',
      injectStyles: false,
      validationMode: 'preserve',
      data: {
        version: '2.0.0',
        blocks: [{
          id: `embed-${service}`,
          type: 'embed',
          data: {
            service,
            videoId: 'dQw4w9WgXcQ',
            caption: '',
            cover: '',
            title: '',
            duration: '',
          },
        }],
      },
    })
    try {
      assert(editor.blocks.at(0).status === 'preserved', `invalid embed service ${service} was activated`)
      const block = holder.querySelector('.oe-preserved-block')
      assert(block, `invalid embed service ${service} was not projected inertly`)
      assert(!block.textContent.includes('[object Object]'), `embed rendered prototype markup for ${service}`)
      assert(!block.textContent.includes('native code'), `embed rendered inherited function markup for ${service}`)
    } finally {
      editor.destroy()
      holder.remove()
    }

    const strictHolder = document.createElement('section')
    sandbox.appendChild(strictHolder)
    let strictRejected = false
    try {
      createEditor({
        holder: strictHolder,
        plugins: [createEmbedPlugin({ injectStyles: false })],
        defaultBlock: 'embed',
        injectStyles: false,
        validationMode: 'strict',
        data: {
          version: '2.0.0',
          blocks: [{
            id: 'strict',
            type: 'embed',
            data: { service, videoId: 'dQw4w9WgXcQ', caption: '', cover: '', title: '', duration: '' },
          }],
        },
      })
    } catch {
      strictRejected = true
    }
    assert(strictRejected && strictHolder.childNodes.length === 0, `strict embed accepted prototype service ${service}`)
    strictHolder.remove()

    const player = buildPlayer({
      service,
      videoId: 'dQw4w9WgXcQ',
      cover: '',
      title: '',
      duration: '',
      classPrefix: 'audit',
      playIcon: '',
      ownerDocument: document,
    })
    player.play()
    assert(!player.player.querySelector('iframe'), `unknown embed service created an iframe for ${service}`)
  }

  document.body.dataset.status = 'pass'
  result.textContent = JSON.stringify({ prototypeServices: 3, preserve: true, strict: true })
} catch (error) {
  document.body.dataset.status = 'fail'
  result.textContent = error?.stack || String(error)
}
