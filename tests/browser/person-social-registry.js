import { createPersonRenderer } from '../../renderer/renderers/person/index.js'

const sandbox = document.querySelector('#sandbox')
const result = document.querySelector('#result')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

try {
  for (const type of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
    const renderer = createPersonRenderer('audit', {})
    const wrapper = renderer.render({
      type: 'person',
      data: {
        persons: [{
          avatar: '',
          name: 'Ada',
          role: '',
          bio: '',
          links: [{ type, url: 'https://example.com/profile' }],
        }],
      },
    }, text => document.createTextNode(text))
    sandbox.appendChild(wrapper)
    try {
      const icon = wrapper.querySelector('.audit-person__link-icon')
      assert(icon, `person renderer omitted the social icon for ${type}`)
      assert(icon.querySelector('svg'), `person renderer did not use the fallback icon for ${type}`)
      assert(!icon.textContent.includes('[object Object]'), `person renderer exposed prototype object markup for ${type}`)
      assert(!icon.textContent.includes('native code'), `person renderer exposed inherited function markup for ${type}`)
    } finally {
      renderer.destroy(wrapper)
      wrapper.remove()
    }
  }

  document.body.dataset.status = 'pass'
  result.textContent = JSON.stringify({ prototypeTypes: 4 })
} catch (error) {
  document.body.dataset.status = 'fail'
  result.textContent = error?.stack || String(error)
}
