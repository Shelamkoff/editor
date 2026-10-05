import { createEditor } from '../../core/index.js'
import {
  createAttachesPlugin,
  createCarouselPlugin,
  createGalleryPlugin,
  createImagePlugin,
} from '../../plugins/index.js'

const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+Av7lWQAAAABJRU5ErkJggg=='
const sandbox = document.querySelector('#sandbox')

function assert(value, message) {
  if (!value) throw new Error(message)
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0))

function mount(definition, data, id = definition.type) {
  const holder = document.createElement('section')
  sandbox.appendChild(holder)
  const editor = createEditor({
    holder,
    plugins: [definition],
    defaultBlock: definition.type,
    injectStyles: true,
    changeDebounceMs: 0,
    data: {
      version: '2.0.0',
      blocks: [{ id, type: definition.type, dataVersion: definition.schema.currentVersion, data: structuredClone(data) }],
    },
  })
  const block = holder.querySelector(`.oe-block[data-block-id="${id}"]`)
  assert(block instanceof HTMLElement, `${definition.type}: block projection is missing`)
  return { definition, editor, holder, block, id }
}

function unmount(entry) {
  entry.editor.destroy()
  entry.holder.remove()
}

function buttonByText(entry, text) {
  const candidate = [...entry.block.querySelectorAll('button')]
    .find(button => !button.closest('.oe-source-editor')
      && button.textContent?.trim().toLowerCase().includes(text.toLowerCase()))
  return candidate instanceof HTMLButtonElement ? candidate : null
}

function sourceSurface(entry, kind) {
  return entry.block.querySelector(`.oe-source-editor[data-oe-source-editor="${kind}"]`)
}

function assertPreloadedSourceEditor(entry, kind) {
  const root = sourceSurface(entry, kind)
  assert(root instanceof HTMLElement, `${entry.definition.type}: ${kind} source editor was not preloaded`)
  assert(root.classList.contains('oe-source-editor--preloaded'), `${entry.definition.type}: ${kind} source editor is not preloaded`)
  assert(root.getAttribute('aria-hidden') === 'true' && root.inert, `${entry.definition.type}: preloaded ${kind} source editor is interactive`)
  return root
}

function assertOpenedSourceEditor(entry, kind, expected) {
  const root = sourceSurface(entry, kind)
  assert(root === expected, `${entry.definition.type}: ${kind} source surface was rebuilt on first open`)
  assert(!root.classList.contains('oe-source-editor--preloaded'), `${entry.definition.type}: ${kind} source editor stayed preloaded`)
  assert(root.getAttribute('aria-hidden') === 'false' && !root.inert, `${entry.definition.type}: opened ${kind} source editor stayed inert`)
  assert(entry.block.dataset.oeLayerOpen === 'true', `${entry.definition.type}: source editor did not raise its block`)
  const field = root.querySelector('.oe-source-editor__field')
  assert(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement, `${entry.definition.type}: source field is missing`)
  return { root, field }
}

async function submitSource(entry, kind, openButtonText, value) {
  const preloaded = assertPreloadedSourceEditor(entry, kind)
  const trigger = buttonByText(entry, openButtonText)
  assert(trigger, `${entry.definition.type}: ${openButtonText} source action is missing`)
  trigger.click()
  const { root, field } = assertOpenedSourceEditor(entry, kind, preloaded)
  const form = root.querySelector('form')
  assert(form instanceof HTMLFormElement, `${entry.definition.type}: source form is missing`)

  form.requestSubmit()
  const error = root.querySelector('.oe-source-editor__error')
  assert(error instanceof HTMLElement && !error.hidden && field.getAttribute('aria-invalid') === 'true',
    `${entry.definition.type}: invalid source fell through to browser validation`)

  field.value = value
  field.dispatchEvent(new Event('input', { bubbles: true }))
  form.requestSubmit()
  await tick()
  const visible = [...entry.block.querySelectorAll('.oe-source-editor')]
    .find(editor => !editor.classList.contains('oe-source-editor--preloaded'))
  assert(!visible, `${entry.definition.type}: source editor did not close after submit`)
  assert(!entry.block.hasAttribute('data-oe-layer-open'), `${entry.definition.type}: source layer leaked after submit`)
}

async function testSourceEditors() {
  const imageDefinition = createImagePlugin({ injectStyles: false })
  const image = mount(imageDefinition, imageDefinition.schema.createDefault(), 'image-source')
  await submitSource(image, 'url', 'url', 'https://example.com/image.png')
  assert(image.editor.save().blocks[0].data.file.url === 'https://example.com/image.png', 'image: URL source was not canonicalized')
  unmount(image)

  const galleryDefinition = createGalleryPlugin({ injectStyles: false })
  const gallery = mount(galleryDefinition, galleryDefinition.schema.createDefault(), 'gallery-source')
  await submitSource(gallery, 'url', 'url', 'https://example.com/gallery.png')
  assert(gallery.editor.save().blocks[0].data.images[0]?.url === 'https://example.com/gallery.png', 'gallery: URL source was not canonicalized')
  unmount(gallery)

  const carouselDefinition = createCarouselPlugin({ injectStyles: false })
  const carousel = mount(carouselDefinition, carouselDefinition.schema.createDefault(), 'carousel-source')
  await submitSource(carousel, 'url', 'url', 'https://example.com/carousel.png')
  assert(carousel.editor.save().blocks[0].data.slides[0]?.src === 'https://example.com/carousel.png', 'carousel: URL source was not canonicalized')
  unmount(carousel)

  const htmlDefinition = createCarouselPlugin({ injectStyles: false })
  const htmlCarousel = mount(htmlDefinition, htmlDefinition.schema.createDefault(), 'carousel-html')
  const htmlSurface = assertPreloadedSourceEditor(htmlCarousel, 'html')
  const htmlButton = buttonByText(htmlCarousel, 'html')
  assert(htmlButton, 'carousel: HTML source action is missing')
  htmlButton.click()
  const opened = assertOpenedSourceEditor(htmlCarousel, 'html', htmlSurface)
  assert(opened.field instanceof HTMLTextAreaElement && opened.field.rows === 6, 'carousel: HTML source is not a textarea')
  const form = opened.root.querySelector('form')
  opened.field.value = '<article><strong>Safe</strong><script>unsafe()</script></article>'
  form.requestSubmit()
  await tick()
  const slide = htmlCarousel.editor.save().blocks[0].data.slides[0]
  assert(slide?.type === 'html' && slide.html.includes('<strong>Safe</strong>'), 'carousel: HTML slide was not stored')
  assert(!slide.html.includes('<script'), 'carousel: unsafe HTML survived canonical commit')
  unmount(htmlCarousel)

  const attachesDefinition = createAttachesPlugin({ injectStyles: false })
  const attaches = mount(attachesDefinition, attachesDefinition.schema.createDefault(), 'attaches-source')
  await submitSource(attaches, 'url', 'url', 'https://example.com/file.pdf')
  assert(attaches.editor.save().blocks[0].data.files[0]?.url === 'https://example.com/file.pdf', 'attaches: URL source was not canonicalized')
  unmount(attaches)
}

async function openSettings(entry) {
  entry.editor.blocks.focus(entry.id)
  await tick()
  const settingsButton = entry.holder.querySelector('.oe-toolbar__drag')
  assert(settingsButton instanceof HTMLButtonElement, `${entry.definition.type}: core settings button is missing`)
  settingsButton.click()
  await tick()
  const menu = entry.holder.querySelector('.oe-settings-menu')
  assert(menu instanceof HTMLElement && menu.style.display !== 'none', `${entry.definition.type}: core settings menu did not open`)
  return menu
}

function controlByLabel(root, text) {
  const labels = [...root.querySelectorAll('label')]
  const label = labels.find(candidate => {
    const own = candidate.querySelector(':scope > span')?.textContent ?? candidate.textContent ?? ''
    return own.trim().toLowerCase().includes(text.toLowerCase())
  })
  return label?.querySelector('input,select,textarea') ?? null
}

function changeValue(control, value) {
  assert(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement,
    'settings control is missing')
  control.value = value
  control.dispatchEvent(new Event('change', { bubbles: true }))
}

async function testSettingsPanels() {
  const imageDefinition = createImagePlugin({ injectStyles: false })
  const image = mount(imageDefinition, {
    ...imageDefinition.schema.createDefault(),
    file: { url: pixel },
    caption: 'Pixel',
  }, 'image-settings')
  let menu = await openSettings(image)
  assert(!menu.querySelector('.oe-image__style-form'), 'image: styles leaked into the block tune menu')
  const settings = [...image.block.querySelectorAll('.oe-image__action-btn')]
    .find(button => button.textContent.trim() === 'Settings')
  assert(settings instanceof HTMLButtonElement, 'image: separate Settings button is missing')
  settings.click()
  let panel = image.block.querySelector('.oe-image__dropdown-panel .oe-image__style-form')
  assert(panel instanceof HTMLElement && panel.checkVisibility(), 'image: separate settings panel is missing')
  for (const label of ['Width','Height','Min width','Max width','Fit','Position','Background color','Border style','Border width','Border radius']) {
    assert(controlByLabel(panel, label), `image: setting "${label}" is missing`)
  }
  changeValue(controlByLabel(panel, 'Width'), '320px')
  assert(image.editor.save().blocks[0].data.styles.width === '320px', 'image: width setting was not persisted')
  assert(image.block.querySelector('.oe-image__image')?.style.width === '320px', 'image: width setting was not projected')
  assert(image.editor.undo(), 'image: settings change did not enter history')
  assert(image.editor.save().blocks[0].data.styles.width === undefined, 'image: settings undo did not restore canonical data')
  assert(image.editor.redo(), 'image: settings redo was unavailable')
  assert(image.editor.save().blocks[0].data.styles.width === '320px', 'image: settings redo failed')
  unmount(image)

  const galleryDefinition = createGalleryPlugin({ injectStyles: false })
  const gallery = mount(galleryDefinition, {
    ...galleryDefinition.schema.createDefault(),
    images: [{ id: 'img-1', url: pixel, caption: 'Pixel' }],
  }, 'gallery-settings')
  menu = await openSettings(gallery)
  panel = menu.querySelector('.oe-settings-menu__panel .oe-gallery__style-form')
  assert(panel instanceof HTMLElement, 'gallery: v2 settings panel is missing')
  for (const label of ['Layout','Autoplay interval','Gap','Border radius','Height']) {
    assert(controlByLabel(panel, label), `gallery: setting "${label}" is missing`)
  }
  changeValue(controlByLabel(panel, 'Gap'), '12px')
  assert(gallery.editor.save().blocks[0].data.styles.gap === '12px', 'gallery: gap setting was not persisted')
  assert(gallery.block.querySelector('.oe-gallery')?.style.gap === '12px', 'gallery: gap setting was not projected')
  assert(gallery.editor.undo(), 'gallery: settings change did not enter history')
  assert(gallery.editor.save().blocks[0].data.styles.gap === undefined, 'gallery: settings undo failed')
  unmount(gallery)

  const carouselDefinition = createCarouselPlugin({ injectStyles: false })
  const carousel = mount(carouselDefinition, {
    ...carouselDefinition.schema.createDefault(),
    slides: [{ id: 'slide-1', type: 'image', src: pixel, alt: 'Pixel', caption: '' }],
  }, 'carousel-settings')
  menu = await openSettings(carousel)
  panel = menu.querySelector('.oe-settings-menu__panel .oe-carousel-block__settings-panel')
  assert(panel instanceof HTMLElement, 'carousel: v2 settings panel is missing')
  for (const label of ['Source URL','Alternative text','Autoplay delay','Aspect ratio']) {
    assert(controlByLabel(panel, label), `carousel: setting "${label}" is missing`)
  }
  changeValue(controlByLabel(panel, 'Alternative text'), 'Accessible pixel')
  assert(carousel.editor.save().blocks[0].data.slides[0].alt === 'Accessible pixel', 'carousel: alt setting was not persisted')
  assert(carousel.block.querySelector('.oe-carousel-block__media img')?.alt === 'Accessible pixel', 'carousel: alt setting was not projected')
  assert(carousel.editor.undo(), 'carousel: settings change did not enter history')
  assert(carousel.editor.save().blocks[0].data.slides[0].alt === 'Pixel', 'carousel: settings undo failed')
  unmount(carousel)

  const attachesDefinition = createAttachesPlugin({ injectStyles: false })
  const attaches = mount(attachesDefinition, {
    ...attachesDefinition.schema.createDefault(),
    files: [{ id: 'file-1', url: 'https://example.com/file.pdf', name: 'file.pdf', size: 0, extension: 'pdf' }],
  }, 'attaches-settings')
  const initialVariant = attaches.editor.save().blocks[0].data.variant
  menu = await openSettings(attaches)
  const variantB = [...menu.querySelectorAll('[role="menuitem"]')]
    .find(item => item.textContent?.includes('Variant B'))
  assert(variantB instanceof HTMLElement, 'attaches: variant settings are missing from core menu')
  variantB.click()
  assert(attaches.editor.save().blocks[0].data.variant === 'b', 'attaches: variant setting was not persisted')
  assert(attaches.editor.undo(), 'attaches: variant change did not enter history')
  assert(attaches.editor.save().blocks[0].data.variant === initialVariant, 'attaches: variant undo failed')
  unmount(attaches)
}

function testLayeringContract() {
  const outer = sandbox.closest('.oe-editor')
  assert(outer instanceof HTMLElement, 'outer editor fixture is missing')
  const block = document.createElement('div')
  block.className = 'oe-block'
  block.dataset.oeLayerOpen = 'true'
  block.style.position = 'relative'
  const menu = document.createElement('ul')
  menu.className = 'oe-settings-menu'
  menu.style.display = 'block'
  outer.append(block, menu)
  assert(Number(getComputedStyle(menu).zIndex) > Number(getComputedStyle(block).zIndex),
    'core settings menu is below an active plugin layer')
  menu.remove()
  block.remove()
}

async function run() {
  await testSourceEditors()
  await testSettingsPanels()
  testLayeringContract()
  sandbox.replaceChildren()
  return {
    sourceEditors: ['image:url','gallery:url','carousel:url','carousel:html','attaches:url'],
    settingsPanels: ['gallery','carousel'],
    inlineSettings: ['image'],
    actionSettings: ['attaches'],
    history: true,
    dualSettingsApi: false,
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
