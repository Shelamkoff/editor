import { createGalleryRenderer } from '../../renderer/renderers/gallery/index.js'

const sandbox = document.querySelector('#sandbox')
const result = document.querySelector('#result')
const pixel = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

try {
  for (const layout of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
    const renderer = createGalleryRenderer('audit', {})
    const wrapper = renderer.render({
      type: 'gallery',
      data: {
        images: [
          { url: pixel, caption: 'One' },
          { url: pixel, caption: 'Two' },
        ],
        layout,
        styles: {},
        options: {},
      },
    }, text => document.createTextNode(text))
    sandbox.appendChild(wrapper)
    try {
      assert(wrapper.querySelectorAll('.audit-gallery__item').length === 2, `gallery renderer lost images for ${layout}`)
    } finally {
      renderer.destroy(wrapper)
      wrapper.remove()
    }
  }

  document.body.dataset.status = 'pass'
  result.textContent = JSON.stringify({ prototypeLayouts: 4 })
} catch (error) {
  document.body.dataset.status = 'fail'
  result.textContent = error?.stack || String(error)
}
