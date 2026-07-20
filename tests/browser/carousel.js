import { CarouselBlock } from '../../plugins/carousel/index.js'
import { EditorRenderer } from '../../renderer/index.js'

const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+Av7lWQAAAABJRU5ErkJggg=='
const options = { loop: false, autoplay: false, autoplayDelay: 3000, navigation: true, pagination: true, thumbnails: false }
const sandbox = document.querySelector('#sandbox')
const tick = () => new Promise(resolve => setTimeout(resolve, 0))
function assert(value, message) { if (!value) throw new Error(message) }
async function waitFor(predicate, message) {
  const deadline = performance.now() + 2000
  while (performance.now() < deadline) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error(message)
}
function buttonByText(root, selector, text) {
  return [...root.querySelectorAll(selector)].find(button => button.textContent.trim().includes(text))
}

async function run() {
  let mutations = 0
  const plugin = new CarouselBlock({
    actions: [{
      label: 'Library',
      async handler() {
        return [
          { id: 'library', type: 'html', html: '<img src="javascript:x"><script>window.carouselXss=1</script><p>Safe</p>', caption: 'Library' },
          { id: 'invalid-image', type: 'image', src: 'javascript:alert(1)' },
          { id: 'invalid-html', type: 'html', html: '<script>window.carouselXss=2</script>' },
        ]
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
  const editorStage = element.querySelector('.oe-carousel-block__stage')
  const editorImage = element.querySelector('.oe-carousel-block__media > img')
  assert(editorStage instanceof HTMLElement && editorImage instanceof HTMLImageElement, 'carousel editor image is missing')
  await waitFor(() => editorImage.getBoundingClientRect().width > 0, 'carousel editor styles did not load')
  assert(getComputedStyle(editorImage).maxHeight === 'none', 'carousel editor still clamps image height')
  assert(Math.abs(editorStage.getBoundingClientRect().width - editorImage.getBoundingClientRect().width) < 1,
    `carousel editor image does not fill the available width: stage=${editorStage.getBoundingClientRect().width}, image=${editorImage.getBoundingClientRect().width}`)
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
  const settingsButton = buttonByText(element, '.oe-carousel-block__action-btn', 'Settings')
  assert(settingsButton.getAttribute('aria-expanded') === 'false', 'settings disclosure has no closed state')
  settingsButton.click()
  assert(settingsButton.getAttribute('aria-expanded') === 'true', 'settings disclosure did not expose its open state')
  const sourceInput = [...element.querySelectorAll('.oe-carousel-block__field')]
    .find(label => label.textContent.includes('Source URL'))?.querySelector('input')
  assert(sourceInput instanceof HTMLInputElement, 'source URL setting is missing')
  const sourceBeforeInvalidEdit = plugin.save(element).slides[0].src
  assert(sourceInput.value === '', 'embedded image data was copied into the source URL input')
  assert(sourceInput.dataset.oeEmbeddedSource === 'true', 'embedded source setting is not marked as compact')
  assert(sourceInput.placeholder.includes('Local file'), 'embedded source setting has no replacement hint')
  assert(sourceBeforeInvalidEdit === pixel, 'compacting the source setting changed the stored image')
  sourceInput.value = 'javascript:alert(1)'
  sourceInput.dispatchEvent(new Event('change', { bubbles: true }))
  assert(plugin.save(element).slides[0].src === sourceBeforeInvalidEdit, 'invalid source URL replaced valid slide media')
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
  buttonByText(element, '.oe-carousel-block__action-btn', 'Add').click()
  buttonByText(element, '.oe-carousel-block__action-btn', 'Upload').click()
  assert(document.body.querySelector('input[type="file"]'), 'carousel upload did not create its temporary file input')
  plugin.destroy(element)
  assert(!document.body.querySelector('input[type="file"]'), 'destroying a carousel block leaked its temporary file input')
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

  let unsupportedUploads = 0
  const unsupported = new CarouselBlock({
    async uploadFile() { unsupportedUploads++; return { url: pixel } },
  })
  const unsupportedElement = unsupported.render({ slides: [], options }, { mutate(operation) { return operation() } })
  sandbox.appendChild(unsupportedElement)
  const transfer = new DataTransfer()
  transfer.items.add(new File(['plain text'], 'notes.txt', { type: 'text/plain' }))
  unsupportedElement.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }))
  await tick()
  assert(unsupportedUploads === 0, 'dropzone sent an unsupported file to uploadFile')
  assert(unsupported.save(unsupportedElement).slides.length === 0, 'dropzone converted an unsupported file into a slide')
  unsupported.destroy(unsupportedElement)
  unsupportedElement.remove()

  const extensionFallback = new CarouselBlock({
    async uploadFile() { return { url: pixel } },
  })
  const extensionElement = extensionFallback.render({ slides: [], options }, { mutate(operation) { return operation() } })
  sandbox.appendChild(extensionElement)
  const extensionTransfer = new DataTransfer()
  extensionTransfer.items.add(new File(['video'], 'clip.mp4'))
  extensionElement.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: extensionTransfer }))
  await tick()
  assert(extensionFallback.save(extensionElement).slides[0]?.type === 'video', 'extension-only video was classified as an image')
  extensionFallback.destroy(extensionElement)
  extensionElement.remove()

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
  const renderedViewport = container.querySelector('.carousel__viewport')
  const renderedImage = container.querySelector('.editor-carousel-block__slide img')
  assert(renderedViewport instanceof HTMLElement && renderedImage instanceof HTMLImageElement,
    'carousel renderer image is missing')
  await waitFor(() => {
    const viewportWidth = renderedViewport.getBoundingClientRect().width
    const imageWidth = renderedImage.getBoundingClientRect().width
    return imageWidth > 0 && Math.abs(viewportWidth - imageWidth) < 1
  }, 'carousel renderer image did not settle to the available width')
  assert(getComputedStyle(renderedImage).maxHeight === 'none', 'carousel renderer still clamps image height')
  assert(Math.abs(renderedViewport.getBoundingClientRect().width - renderedImage.getBoundingClientRect().width) < 1,
    'carousel renderer image does not fill the available width')
  assert(!container.querySelector('script'), 'carousel renderer mounted unsafe HTML')
  renderer.destroy(container)
  assert(container.childNodes.length === 0, 'carousel renderer leaked DOM on destroy')

  return { operations: ['source', 'empty source', 'reorder', 'settings', 'remove', 'read-only', 'upload abort', 'drop validation', 'extension fallback', 'render/destroy'], mutations }
}

try {
  const summary = await run()
  document.querySelector('#result').textContent = JSON.stringify(summary)
  document.body.dataset.status = 'pass'
} catch (error) {
  document.querySelector('#result').textContent = error?.stack || String(error)
  document.body.dataset.status = 'fail'
}
