import { createGalleryRenderer } from '../../renderer/renderers/gallery/index.js'
import { runGalleryAccessibleCaptionTests } from './gallery-accessible-captions.js'

const sandbox = document.querySelector('#sandbox')
const result = document.querySelector('#result')
const pixel = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='
const results = []

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

try {
  for (const layout of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
    const renderer = createGalleryRenderer('audit', {})
    const wrapper = renderer.render({
      type: 'gallery',
      dataVersion: 2, data: {
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
      results.push({ name: `Gallery prototype layout ${layout}`, status: 'PASS' })
    } finally {
      renderer.destroy(wrapper)
      wrapper.remove()
    }
  }

  results.push(...await runGalleryAccessibleCaptionTests(sandbox))
  document.body.dataset.status = results.every(result => result.status === 'PASS') ? 'pass' : 'fail'
  result.textContent = JSON.stringify(results)
} catch (error) {
  document.body.dataset.status = 'fail'
  result.textContent = error?.stack || String(error)
}
