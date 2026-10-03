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
    let rejected = false
    try {
      createEditor({
        holder,
        plugins: [definition],
        defaultBlock: 'embed',
        injectStyles: false,
        data: {
          version: '2.0.0',
          blocks: [{
            id: `embed-${service}`,
            type: 'embed',
            dataVersion: definition.schema.currentVersion,
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
    } catch {
      rejected = true
    }
    assert(rejected && holder.childNodes.length === 0, `current embed schema accepted prototype service ${service}`)
    holder.remove()

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
  result.textContent = JSON.stringify({ prototypeServices: 3, currentOnly: true })
} catch (error) {
  document.body.dataset.status = 'fail'
  result.textContent = error?.stack || String(error)
}
