import { Embed } from '../../plugins/embed/index.js'
import { buildPlayer } from '../../shared/embedPlayer.js'

const sandbox = document.querySelector('#sandbox')
const result = document.querySelector('#result')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

try {
  for (const service of ['__proto__', 'constructor', 'toString']) {
    const plugin = new Embed()
    const wrapper = plugin.render({
      service,
      videoId: 'dQw4w9WgXcQ',
      caption: '',
      cover: '',
      title: '',
      duration: '',
    }, { readOnly: false, mutate(operation) { return operation() } })
    sandbox.appendChild(wrapper)
    try {
      assert(!wrapper.textContent.includes('[object Object]'), `embed rendered prototype markup for ${service}`)
      assert(!wrapper.textContent.includes('native code'), `embed rendered inherited function markup for ${service}`)
      plugin._play(wrapper)
    } finally {
      plugin.destroy(wrapper)
      plugin.dispose?.()
      wrapper.remove()
    }

    const player = buildPlayer({
      service,
      videoId: 'dQw4w9WgXcQ',
      cover: '',
      title: '',
      duration: '',
      classPrefix: 'audit',
      playIcon: '',
    })
    player.play()
    assert(!player.player.querySelector('iframe'), `unknown embed service created an iframe for ${service}`)
  }

  document.body.dataset.status = 'pass'
  result.textContent = JSON.stringify({ prototypeServices: 3 })
} catch (error) {
  document.body.dataset.status = 'fail'
  result.textContent = error?.stack || String(error)
}
