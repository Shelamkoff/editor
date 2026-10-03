import { createEditor } from '../../core/index.js'
import { createCarouselPlugin } from '../../plugins/carousel/index.js'
import { EditorRenderer } from '../../renderer/index.js'

const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+Av7lWQAAAABJRU5ErkJggg=='
const options = {
  loop: false,
  autoplay: false,
  autoplayDelay: 3000,
  navigation: true,
  pagination: true,
  thumbnails: false,
}
const sandbox = document.querySelector('#sandbox')
const tick = () => new Promise(resolve => setTimeout(resolve, 0))

function assert(value, message) {
  if (!value) throw new Error(message)
}

async function waitFor(predicate, message) {
  const deadline = performance.now() + 2000
  while (performance.now() < deadline) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error(message)
}

function buttonByText(root, selector, text) {
  return [...root.querySelectorAll(selector)]
    .find(button => button.textContent?.trim().toLowerCase().includes(text.toLowerCase()))
}

function mount(config = {}, data = { slides: [], options }, readOnly = false) {
  const holder = document.createElement('section')
  sandbox.appendChild(holder)
  const definition = createCarouselPlugin({ ...config, injectStyles: true })
  const editor = createEditor({
    holder,
    plugins: [definition],
    defaultBlock: 'carousel',
    injectStyles: true,
    readOnly,
    changeDebounceMs: 0,
    data: { version: '2.0.0', blocks: [{ id: 'carousel', type: 'carousel', dataVersion: definition.schema.currentVersion, data: structuredClone(data) }] },
  })
  const element = holder.querySelector('.oe-carousel-block')
  assert(element instanceof HTMLElement, 'carousel editor did not project its block')
  return { holder, editor, element }
}

async function openSettings(entry) {
  entry.editor.blocks.focus('carousel')
  await tick()
  const button = entry.holder.querySelector('.oe-toolbar__drag')
  assert(button instanceof HTMLButtonElement, 'core block settings trigger is missing')
  button.click()
  await tick()
  const panel = entry.holder.querySelector('.oe-carousel-block__settings-panel')
  assert(panel instanceof HTMLElement, 'carousel model-first settings panel is missing')
  return panel
}

function sourceEditor(entry, kind) {
  const root = entry.element.querySelector(`.oe-source-editor[data-oe-source-editor="${kind}"]`)
  assert(root instanceof HTMLElement, `carousel ${kind} source editor is missing`)
  return root
}

function submitSource(entry, kind, value) {
  const root = sourceEditor(entry, kind)
  const field = root.querySelector('.oe-source-editor__field')
  const form = root.querySelector('form')
  assert(
    (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)
      && form instanceof HTMLFormElement,
    `carousel ${kind} source form is incomplete`,
  )
  field.value = value
  form.requestSubmit()
}

async function run() {
  let mutations = 0
  const entry = mount({
    actions: [{
      label: 'Library',
      async handler() {
        return [
          {
            id: 'library',
            type: 'html',
            html: '<img src="javascript:x"><script>window.carouselXss=1</script><p>Safe</p>',
            caption: 'Library',
          },
          { id: 'invalid-image', type: 'image', src: 'javascript:alert(1)' },
          { id: 'invalid-html', type: 'html', html: '<script>window.carouselXss=2</script>' },
        ]
      },
    }],
  }, {
    slides: [
      { id: 'first', type: 'image', src: pixel, alt: 'First', caption: '' },
      { id: 'second', type: 'image', src: pixel, alt: 'Second', caption: '' },
    ],
    options,
  })
  entry.editor.on('transaction:committed', () => { mutations++ })

  assert(entry.element.querySelector('.oe-carousel-block__stage'), 'carousel media stage is missing')
  const editorStage = entry.element.querySelector('.oe-carousel-block__stage')
  const editorImage = entry.element.querySelector('.oe-carousel-block__media > img')
  assert(editorStage instanceof HTMLElement && editorImage instanceof HTMLImageElement, 'carousel editor image is missing')
  await waitFor(() => editorImage.getBoundingClientRect().width > 0, 'carousel editor styles did not load')
  assert(getComputedStyle(editorImage).maxHeight === 'none', 'carousel editor still clamps image height')
  assert(
    Math.abs(editorStage.getBoundingClientRect().width - editorImage.getBoundingClientRect().width) < 1,
    'carousel editor image does not fill the available width',
  )
  assert(!entry.element.querySelector('.oe-carousel-block__toolbar'), 'legacy carousel toolbar is still rendered')

  const library = buttonByText(entry.element, '.oe-carousel-block__action-btn', 'Library')
  assert(library instanceof HTMLButtonElement, 'filled carousel lost custom source actions')
  library.click()
  await tick()
  assert(mutations === 1, 'custom source did not commit one canonical transaction')
  let saved = entry.editor.save().blocks[0].data
  assert(saved.slides.length === 3, 'custom source valid slide was not added or invalid slides were retained')
  assert(!saved.slides[2].html.includes('<script'), 'custom HTML slide retained a script in canonical data')
  assert(!saved.slides[2].html.includes('javascript:'), 'custom HTML slide retained an active URL in canonical data')

  const urlButton = buttonByText(entry.element, '.oe-carousel-block__action-btn', 'URL')
  assert(urlButton instanceof HTMLButtonElement, 'filled carousel lost URL source')
  urlButton.click()
  submitSource(entry, 'url', 'https://example.com/added.png')
  await tick()
  saved = entry.editor.save().blocks[0].data
  assert(saved.slides.some(slide => slide.src === 'https://example.com/added.png'), 'filled URL source was not persisted')

  const htmlButton = buttonByText(entry.element, '.oe-carousel-block__action-btn', 'HTML')
  assert(htmlButton instanceof HTMLButtonElement, 'filled carousel lost HTML source')
  htmlButton.click()
  submitSource(entry, 'html', '<article><strong>Safe</strong><script>unsafe()</script></article>')
  await tick()
  saved = entry.editor.save().blocks[0].data
  const htmlSlide = saved.slides.find(slide => slide.type === 'html' && slide.html.includes('<strong>Safe</strong>'))
  assert(htmlSlide && !htmlSlide.html.includes('<script'), 'filled HTML source was not sanitized and persisted')

  const firstDot = entry.element.querySelector('.oe-carousel-block__dot')
  assert(firstDot instanceof HTMLButtonElement, 'carousel pagination control is missing')
  firstDot.click()

  let panel = await openSettings(entry)
  const sourceLabel = [...panel.querySelectorAll('.oe-carousel-block__field')]
    .find(label => label.textContent?.includes('Source URL'))
  const sourceInput = sourceLabel?.querySelector('input')
  assert(sourceInput instanceof HTMLInputElement, 'source URL setting is missing')
  const beforeInvalid = entry.editor.save().blocks[0].data.slides[0].src
  assert(sourceInput.value === '', 'embedded image data was copied into the source URL setting')
  assert(sourceInput.dataset.oeEmbeddedSource === 'true', 'embedded source is not marked compact')
  sourceInput.value = 'javascript:alert(1)'
  sourceInput.dispatchEvent(new Event('change', { bubbles: true }))
  assert(entry.editor.save().blocks[0].data.slides[0].src === beforeInvalid, 'invalid source URL replaced valid media')

  panel = entry.holder.querySelector('.oe-carousel-block__settings-panel')
  const currentSource = [...panel.querySelectorAll('.oe-carousel-block__field')]
    .find(label => label.textContent?.includes('Source URL'))?.querySelector('input')
  currentSource.value = 'https://example.com/replaced.png'
  currentSource.dispatchEvent(new Event('change', { bubbles: true }))
  await tick()
  assert(entry.editor.save().blocks[0].data.slides[0].src === 'https://example.com/replaced.png', 'source URL replacement did not update canonical data')

  panel = entry.holder.querySelector('.oe-carousel-block__settings-panel')
  const pagination = [...panel.querySelectorAll('.oe-carousel-block__switch')]
    .find(label => label.textContent?.toLowerCase().includes('pagination'))?.querySelector('input')
  assert(pagination instanceof HTMLInputElement, 'pagination setting is missing')
  pagination.checked = false
  pagination.dispatchEvent(new Event('change', { bubbles: true }))
  await tick()
  assert(entry.editor.save().blocks[0].data.options.pagination === false, 'pagination setting did not update canonical data')

  panel = entry.holder.querySelector('.oe-carousel-block__settings-panel')
  const delayInput = [...panel.querySelectorAll('.oe-carousel-block__field')]
    .find(label => label.textContent?.includes('Autoplay delay'))?.querySelector('input')
  assert(delayInput instanceof HTMLInputElement, 'autoplay delay setting is missing')
  delayInput.value = '4500'
  delayInput.dispatchEvent(new Event('change', { bubbles: true }))
  await tick()
  assert(entry.editor.save().blocks[0].data.options.autoplayDelay === 4500, 'autoplay delay setting did not persist')

  panel = entry.holder.querySelector('.oe-carousel-block__settings-panel')
  const aspectInput = [...panel.querySelectorAll('.oe-carousel-block__field')]
    .find(label => label.textContent?.includes('Aspect ratio'))?.querySelector('input')
  assert(aspectInput instanceof HTMLInputElement, 'aspect ratio setting is missing')
  aspectInput.value = '4 / 3'
  aspectInput.dispatchEvent(new Event('change', { bubbles: true }))
  await tick()
  assert(entry.editor.save().blocks[0].data.options.aspectRatio === '4 / 3', 'aspect ratio setting did not persist')

  const moveForward = entry.element.querySelector('[aria-label="Move slide forward"]')
  assert(moveForward instanceof HTMLButtonElement, 'slide forward control is missing')
  moveForward.click()
  await tick()
  assert(entry.editor.save().blocks[0].data.slides[0].id !== 'first', 'slide reorder failed')

  const remove = buttonByText(entry.element, '.oe-carousel-block__action-btn--danger', 'Remove slide')
  assert(remove instanceof HTMLButtonElement, 'remove slide control is missing')
  const countBeforeRemove = entry.editor.save().blocks[0].data.slides.length
  remove.click()
  await tick()
  assert(entry.editor.save().blocks[0].data.slides.length === countBeforeRemove - 1, 'slide removal failed')

  const add = buttonByText(entry.element, '.oe-carousel-block__action-btn', 'Add')
  assert(add instanceof HTMLButtonElement, 'carousel upload control is missing')
  const originalInputClick = HTMLInputElement.prototype.click
  HTMLInputElement.prototype.click = function () {}
  try {
    add.click()
  } finally {
    HTMLInputElement.prototype.click = originalInputClick
  }
  assert(document.body.querySelector('input[type="file"]'), 'carousel upload did not create a temporary file input')
  entry.editor.destroy()
  entry.holder.remove()
  assert(!document.body.querySelector('input[type="file"]'), 'destroying carousel leaked a temporary file input')

  let resolveUpload
  let lateCommits = 0
  const pending = mount({
    uploadFile: () => new Promise(resolve => { resolveUpload = resolve }),
  })
  pending.editor.on('transaction:committed', () => { lateCommits++ })
  const transfer = new DataTransfer()
  transfer.items.add(new File(['x'], 'x.png', { type: 'image/png' }))
  pending.element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }))
  await tick()
  const beforeDestroy = lateCommits
  pending.editor.destroy()
  pending.holder.remove()
  resolveUpload({ url: pixel })
  await tick()
  assert(lateCommits === beforeDestroy, 'upload callback mutated a destroyed carousel block')

  let unsupportedUploads = 0
  const unsupported = mount({
    async uploadFile() {
      unsupportedUploads++
      return { url: pixel }
    },
  })
  const unsupportedTransfer = new DataTransfer()
  unsupportedTransfer.items.add(new File(['plain text'], 'notes.txt', { type: 'text/plain' }))
  unsupported.element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: unsupportedTransfer }))
  await tick()
  assert(unsupportedUploads === 0, 'dropzone sent unsupported file to uploadFile')
  assert(unsupported.editor.save().blocks[0].data.slides.length === 0, 'unsupported file became a slide')
  unsupported.editor.destroy()
  unsupported.holder.remove()

  const extensionFallback = mount({
    async uploadFile() {
      return { url: pixel }
    },
  })
  const extensionTransfer = new DataTransfer()
  extensionTransfer.items.add(new File(['video'], 'clip.mp4'))
  extensionFallback.element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: extensionTransfer }))
  await tick()
  assert(extensionFallback.editor.save().blocks[0].data.slides[0]?.type === 'video', 'extension-only video was classified as image')
  extensionFallback.editor.destroy()
  extensionFallback.holder.remove()

  let emptyCommits = 0
  const empty = mount({
    actions: [{
      label: 'Library',
      async handler() {
        return [{ id: 'empty-library', type: 'image', src: pixel, alt: 'Library' }]
      },
    }],
  })
  empty.editor.on('transaction:committed', () => { emptyCommits++ })
  const emptyLibrary = buttonByText(empty.element, 'button', 'Library')
  assert(emptyLibrary instanceof HTMLButtonElement, 'custom source is missing from empty carousel')
  emptyLibrary.click()
  await tick()
  assert(emptyCommits === 1 && empty.editor.save().blocks[0].data.slides.length === 1, 'empty source did not create one canonical transaction')
  empty.editor.destroy()
  empty.holder.remove()

  const readOnly = mount({}, saved, true)
  assert(readOnly.element.querySelector('.oe-carousel-block__stage'), 'read-only carousel did not render its stage')
  assert(!readOnly.element.querySelector('.oe-carousel-block__actions'), 'read-only carousel exposed editing controls')
  readOnly.editor.destroy()
  readOnly.holder.remove()

  const renderer = new EditorRenderer({ blockTypes: ['carousel'] })
  const container = document.createElement('div')
  sandbox.appendChild(container)
  renderer.renderTo({ version: '2.0.0', blocks: [{ id: 'carousel', type: 'carousel', dataVersion: 1, data: saved }] }, container)
  assert(container.querySelector('.carousel'), 'carousel renderer did not mount external instance')
  const renderedViewport = container.querySelector('.carousel__viewport')
  const renderedImage = container.querySelector('.editor-carousel-block__slide img')
  assert(renderedViewport instanceof HTMLElement && renderedImage instanceof HTMLImageElement, 'carousel renderer image is missing')
  await waitFor(() => {
    const viewportWidth = renderedViewport.getBoundingClientRect().width
    const imageWidth = renderedImage.getBoundingClientRect().width
    return imageWidth > 0 && Math.abs(viewportWidth - imageWidth) < 1
  }, 'carousel renderer image did not settle to available width')
  assert(getComputedStyle(renderedImage).maxHeight === 'none', 'carousel renderer still clamps image height')
  assert(!container.querySelector('script'), 'carousel renderer mounted unsafe HTML')
  renderer.destroy(container)
  renderer.destroy()
  assert(container.childNodes.length === 0, 'carousel renderer leaked DOM on destroy')
  container.remove()

  return {
    operations: [
      'custom source', 'filled URL/HTML source', 'model-first settings', 'source replacement',
      'reorder', 'remove', 'read-only', 'upload abort', 'drop validation', 'extension fallback', 'renderer',
    ],
    mutations,
  }
}

try {
  const summary = await run()
  document.querySelector('#result').textContent = JSON.stringify(summary)
  document.body.dataset.status = 'pass'
} catch (error) {
  document.querySelector('#result').textContent = error?.stack || String(error)
  document.body.dataset.status = 'fail'
}
