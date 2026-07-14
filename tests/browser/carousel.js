import { CarouselBlock } from '../../plugins/carousel/index.js'
import { EditorRenderer } from '../../renderer/index.js'

const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+Av7lWQAAAABJRU5ErkJggg=='
const options = { loop: false, autoplay: false, autoplayDelay: 3000, navigation: true, pagination: true, thumbnails: false }
const sandbox = document.querySelector('#sandbox')
const tick = () => new Promise(resolve => setTimeout(resolve, 0))
function assert(value, message) { if (!value) throw new Error(message) }
function buttonByText(root, selector, text) {
  return [...root.querySelectorAll(selector)].find(button => button.textContent.trim().includes(text))
}

async function run() {
  let mutations = 0
  const plugin = new CarouselBlock({
    actions: [{
      label: 'Library',
      async handler() {
        return [{ id: 'library', type: 'html', html: '<img src="javascript:x"><script>window.carouselXss=1</script><p>Safe</p>', caption: 'Library' }]
      },
    }],
  })
  const element = plugin.render({
    slides: [
      { id: 'first', type: 'image', src: pixel, alt: 'First' },
      { id: 'second', type: 'image', src: pixel, alt: 'Second' },
    ],
    options,
  }, { mutate(operation) { mutations++; return operation() } })
  sandbox.appendChild(element)
  assert(element.querySelector('.oe-carousel-block__stage'), 'carousel media stage is missing')
  assert(!element.querySelector('.oe-carousel-block__toolbar'), 'legacy carousel toolbar is still rendered')
  buttonByText(element, '.oe-carousel-block__action-btn', 'Add').click()
  buttonByText(element, '.oe-carousel-block__action-btn', 'Library').click()
  await tick()
  assert(mutations === 1, 'async source did not commit one atomic mutation')
  const savedAfterAction = plugin.save(element)
  assert(savedAfterAction.slides.length === 3, 'custom source slide was not added')
  assert(!savedAfterAction.slides[2].html.includes('<script'), 'HTML slide retained a script')
  assert(!savedAfterAction.slides[2].html.includes('javascript:'), 'HTML slide retained an active URL')

  element.querySelector('[aria-label="Go to slide 1"]').click()
  buttonByText(element, '.oe-carousel-block__action-btn', 'Settings').click()
  element.querySelector('[aria-label="Move slide forward"]').click()
  assert(plugin.save(element).slides[0].id === 'second', 'slide reorder failed')
  buttonByText(element, '.oe-carousel-block__action-btn', 'Settings').click()
  const pagination = [...element.querySelectorAll('.oe-carousel-block__switch')]
    .find(label => label.textContent.toLowerCase().includes('pagination'))?.querySelector('input')
  assert(pagination instanceof HTMLInputElement, 'pagination setting is missing')
  pagination.checked = false
  pagination.dispatchEvent(new Event('change', { bubbles: true }))
  assert(plugin.save(element).options.pagination === false, 'carousel option did not update')
  buttonByText(element, '.oe-carousel-block__action-btn', 'Settings').click()
  const remove = buttonByText(element, '.oe-carousel-block__settings-button--danger', 'Remove slide')
  assert(remove instanceof HTMLButtonElement, 'remove slide control is missing')
  remove.click()
  assert(plugin.save(element).slides.length === 2, 'slide removal failed')
  plugin.destroy(element)
  element.remove()

  let resolveUpload
  const pending = new CarouselBlock({ uploadFile: () => new Promise(resolve => { resolveUpload = resolve }) })
  const pendingElement = pending.render({ slides: [], options }, { mutate(operation) { mutations++; return operation() } })
  const beforeDestroy = mutations
  const file = new File(['x'], 'x.png', { type: 'image/png' })
  const pendingData = pending.onPaste({ type: 'file', file })
  const hydrated = pending.render(pendingData, { mutate(operation) { mutations++; return operation() } })
  pending.destroy(hydrated)
  resolveUpload({ url: pixel })
  await tick()
  assert(mutations === beforeDestroy, 'upload callback mutated a destroyed carousel block')
  pending.destroy(pendingElement)

  let emptySourceMutations = 0
  const emptySource = new CarouselBlock({
    actions: [{ label: 'Library', async handler() { return [{ id: 'empty-library', type: 'image', src: pixel, alt: 'Library' }] } }],
  })
  const emptyElement = emptySource.render({ slides: [], options }, { mutate(operation) { emptySourceMutations++; return operation() } })
  sandbox.appendChild(emptyElement)
  const emptyLibrary = buttonByText(emptyElement, '.oe-carousel-block__select-action', 'Library')
  assert(emptyLibrary instanceof HTMLButtonElement, 'application source is missing from the empty carousel')
  emptyLibrary.click()
  await tick()
  assert(emptySourceMutations === 1 && emptySource.save(emptyElement).slides.length === 1, 'empty-state source did not create one history operation')
  emptySource.destroy(emptyElement)
  emptyElement.remove()

  const readOnly = plugin.render(savedAfterAction, { readOnly: true, mutate() { throw new Error('read-only carousel mutated') } })
  assert(readOnly.querySelector('.oe-carousel-block__stage'), 'read-only carousel did not render its stage')
  assert(!readOnly.querySelector('.oe-carousel-block__actions'), 'read-only carousel exposed editing controls')
  plugin.destroy(readOnly)

  const renderer = new EditorRenderer({ blockTypes: ['carousel'] })
  const container = document.createElement('div')
  sandbox.appendChild(container)
  renderer.renderTo({ blocks: [{ id: 'carousel', type: 'carousel', data: savedAfterAction }] }, container)
  assert(container.querySelector('.carousel'), 'carousel renderer did not mount the external instance')
  assert(!container.querySelector('script'), 'carousel renderer mounted unsafe HTML')
  renderer.destroy(container)
  assert(container.childNodes.length === 0, 'carousel renderer leaked DOM on destroy')

  return { operations: ['source', 'empty source', 'reorder', 'settings', 'remove', 'read-only', 'upload abort', 'render/destroy'], mutations }
}

try {
  const summary = await run()
  document.querySelector('#result').textContent = JSON.stringify(summary)
  document.body.dataset.status = 'pass'
} catch (error) {
  document.querySelector('#result').textContent = error?.stack || String(error)
  document.body.dataset.status = 'fail'
}
