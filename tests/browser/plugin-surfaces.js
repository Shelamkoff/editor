import { createEditor } from '../../core/index.js'
import {
  createAttachesPlugin,
  createCarouselPlugin,
  createGalleryPlugin,
  createImagePlugin,
} from '../../plugins/index.js'

const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+Av7lWQAAAABJRU5ErkJggg=='
const sandbox = document.querySelector('#sandbox')
const tick = () => new Promise(resolve => setTimeout(resolve, 0))

function assert(value, message) {
  if (!value) throw new Error(message)
}

function buttonByText(root, selector, text) {
  return [...root.querySelectorAll(selector)]
    .find(button => button.textContent?.trim().toLowerCase().includes(text.toLowerCase()))
}

function mount(definition, data) {
  const holder = document.createElement('section')
  sandbox.appendChild(holder)
  const editor = createEditor({
    holder,
    plugins: [definition],
    defaultBlock: definition.type,
    injectStyles: true,
    changeDebounceMs: 0,
    data: { version: '2.0.0', blocks: [{ id: definition.type, type: definition.type, data: structuredClone(data) }] },
  })
  const root = holder.querySelector('.oe-editor')
  const block = holder.querySelector(`.oe-block[data-block-id="${definition.type}"]`)
  assert(root instanceof HTMLElement && block instanceof HTMLElement, `${definition.type}: editor shell is missing`)
  return { definition, type: definition.type, holder, editor, root, block, wrapper: block.firstElementChild }
}

function unmount(entry) {
  entry.editor.destroy()
  entry.holder.remove()
}

function assertPreloadedSourceEditor(entry, kind) {
  const root = entry.wrapper.querySelector(`.oe-source-editor[data-oe-source-editor="${kind}"]`)
  assert(root instanceof HTMLElement, `${entry.type}: ${kind} editor was not preloaded`)
  const style = getComputedStyle(root)
  assert(
    root.classList.contains('oe-source-editor--preloaded')
      && style.display === 'grid'
      && style.visibility === 'hidden',
    `${entry.type}: ${kind} editor deferred first layout until click`,
  )
  assert(root.getAttribute('aria-hidden') === 'true' && root.inert, `${entry.type}: preloaded source editor is interactive`)
  return root
}

function assertSourceEditor(entry, kind, expectedRoot) {
  const root = entry.wrapper.querySelector(`.oe-source-editor[data-oe-source-editor="${kind}"]`)
  assert(root instanceof HTMLElement, `${entry.type}: ${kind} source editor did not open`)
  if (expectedRoot) assert(root === expectedRoot, `${entry.type}: preloaded source editor was rebuilt on open`)
  assert(!root.classList.contains('oe-source-editor--preloaded'), `${entry.type}: source editor stayed preloaded`)
  assert(getComputedStyle(root).visibility === 'visible', `${entry.type}: source editor stayed hidden`)
  assert(entry.block.dataset.oeLayerOpen === 'true', `${entry.type}: source editor did not raise block layer`)
  assert(getComputedStyle(entry.block).zIndex === '2', `${entry.type}: active block layer z-index is wrong`)
  assert(getComputedStyle(root).zIndex === '1200', `${entry.type}: source editor z-index is wrong`)
  const field = root.querySelector('.oe-source-editor__field')
  assert(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement, `${entry.type}: source field is missing`)
  return { root, field }
}

function submitSource(entry, kind, value, expectedRoot) {
  const { root, field } = assertSourceEditor(entry, kind, expectedRoot)
  const form = root.querySelector('form')
  assert(form instanceof HTMLFormElement, `${entry.type}: source form is missing`)
  form.requestSubmit()
  const error = root.querySelector('.oe-source-editor__error')
  assert(
    error instanceof HTMLElement && !error.hidden && field.getAttribute('aria-invalid') === 'true',
    `${entry.type}: source editor fell back to native validation`,
  )
  field.value = value
  form.requestSubmit()
  assert(
    ![...entry.wrapper.querySelectorAll('.oe-source-editor')]
      .some(editor => !editor.classList.contains('oe-source-editor--preloaded')),
    `${entry.type}: source editor did not close after valid submit`,
  )
  assert(!entry.block.hasAttribute('data-oe-layer-open'), `${entry.type}: source layer leaked after submit`)
}

async function testUrlEditors() {
  const cases = [
    {
      entry: mount(createImagePlugin(), createImagePlugin({ injectStyles: false }).schema.createDefault()),
      value: 'https://example.com/image.png',
      verify(entry) {
        assert(entry.editor.save().blocks[0].data.file.url === this.value, 'image URL was not persisted')
      },
    },
    {
      entry: mount(createGalleryPlugin(), createGalleryPlugin({ injectStyles: false }).schema.createDefault()),
      value: 'https://example.com/gallery.png',
      verify(entry) {
        assert(entry.editor.save().blocks[0].data.images[0]?.url === this.value, 'gallery URL was not persisted')
      },
    },
    {
      entry: mount(createCarouselPlugin(), createCarouselPlugin({ injectStyles: false }).schema.createDefault()),
      value: 'https://example.com/carousel.png',
      verify(entry) {
        assert(entry.editor.save().blocks[0].data.slides[0]?.src === this.value, 'carousel URL was not persisted')
      },
    },
    {
      entry: mount(createAttachesPlugin(), createAttachesPlugin({ injectStyles: false }).schema.createDefault()),
      value: 'https://example.com/file.pdf',
      verify(entry) {
        assert(entry.editor.save().blocks[0].data.files[0]?.url === this.value, 'attachment URL was not persisted')
      },
    },
  ]

  for (const item of cases) {
    const preloaded = assertPreloadedSourceEditor(item.entry, 'url')
    const urlButton = buttonByText(item.entry.wrapper, 'button', 'url')
    assert(urlButton instanceof HTMLButtonElement, `${item.entry.type}: URL source action is missing`)
    urlButton.click()
    submitSource(item.entry, 'url', item.value, preloaded)
    await tick()
    item.verify(item.entry)
    unmount(item.entry)
  }
}

async function testHtmlEditor() {
  const definition = createCarouselPlugin()
  const entry = mount(definition, definition.schema.createDefault())
  const preloaded = assertPreloadedSourceEditor(entry, 'html')
  const htmlButton = buttonByText(entry.wrapper, 'button', 'html')
  assert(htmlButton instanceof HTMLButtonElement, 'carousel HTML source action is missing')
  htmlButton.click()
  const { root, field } = assertSourceEditor(entry, 'html', preloaded)
  const panel = root.querySelector('.oe-source-editor__panel')
  assert(panel instanceof HTMLElement && field instanceof HTMLTextAreaElement, 'carousel HTML source panel is incomplete')
  assert(getComputedStyle(panel).textAlign === 'left', 'carousel HTML source editor inherited centered text')
  assert(field.rows === 6, 'carousel HTML source textarea is oversized')
  submitSource(entry, 'html', '<article><strong>Safe</strong><script>unsafe()</script></article>', preloaded)
  await tick()
  const slide = entry.editor.save().blocks[0].data.slides[0]
  assert(slide?.type === 'html' && slide.html.includes('<strong>Safe</strong>'), 'carousel HTML slide was not persisted')
  assert(!slide.html.includes('<script'), 'carousel HTML source retained unsafe script markup')
  unmount(entry)
}

async function openCoreSettings(entry) {
  entry.editor.blocks.focus(entry.type)
  await tick()
  const trigger = entry.holder.querySelector('.oe-toolbar__drag')
  assert(trigger instanceof HTMLButtonElement, `${entry.type}: core settings trigger is missing`)
  trigger.click()
  await tick()
  const menu = entry.holder.querySelector('.oe-settings-menu')
  assert(menu instanceof HTMLElement && menu.style.display !== 'none', `${entry.type}: core settings menu did not open`)
  assert(Number(getComputedStyle(menu).zIndex) > Number(getComputedStyle(entry.block).zIndex), `${entry.type}: core settings menu is below plugin block`)
  return menu
}

async function testSettingsCapabilities() {
  const image = mount(createImagePlugin(), {
    ...createImagePlugin({ injectStyles: false }).schema.createDefault(),
    file: { url: pixel },
  })
  let menu = await openCoreSettings(image)
  const border = buttonByText(menu, '.oe-settings-menu__item', 'Border')
  assert(border instanceof HTMLElement, 'image settings capability lost Border')
  border.click()
  await tick()
  assert(image.editor.save().blocks[0].data.withBorder === true, 'image settings did not update canonical data')
  unmount(image)

  const galleryDef = createGalleryPlugin()
  const gallery = mount(galleryDef, {
    ...galleryDef.schema.createDefault(),
    images: [{ id: 'one', url: pixel, caption: '' }],
  })
  menu = await openCoreSettings(gallery)
  const zoom = buttonByText(menu, '.oe-settings-menu__item', 'Zoom')
  assert(zoom instanceof HTMLElement, 'gallery settings capability lost Zoom')
  zoom.click()
  await tick()
  assert(gallery.editor.save().blocks[0].data.options.zoom === false, 'gallery settings did not update canonical data')
  unmount(gallery)

  const attachesDef = createAttachesPlugin()
  const attaches = mount(attachesDef, {
    ...attachesDef.schema.createDefault(),
    files: [{ id: 'one', url: 'https://example.com/file.pdf', name: 'file.pdf', size: 0, extension: 'pdf' }],
  })
  menu = await openCoreSettings(attaches)
  const variant = buttonByText(menu, '.oe-settings-menu__item', 'Variant B')
  assert(variant instanceof HTMLElement, 'attachments settings capability lost variants')
  variant.click()
  await tick()
  assert(attaches.editor.save().blocks[0].data.variant === 'b', 'attachment variant did not update canonical data')
  unmount(attaches)

  const carouselDef = createCarouselPlugin()
  const carousel = mount(carouselDef, {
    slides: [{ id: 'one', type: 'image', src: pixel, alt: 'One', caption: '' }],
    options: { loop: false, autoplay: false, autoplayDelay: 3000, navigation: true, pagination: true, thumbnails: false },
  })
  menu = await openCoreSettings(carousel)
  const panel = menu.querySelector('.oe-carousel-block__settings-panel')
  assert(panel instanceof HTMLElement, 'carousel settings panel was not rendered by core')
  const input = [...panel.querySelectorAll('.oe-carousel-block__field')]
    .find(label => label.textContent?.includes('Autoplay delay'))?.querySelector('input')
  assert(input instanceof HTMLInputElement, 'carousel model-first settings fields are missing')
  input.value = '4200'
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await tick()
  assert(carousel.editor.save().blocks[0].data.options.autoplayDelay === 4200, 'carousel settings panel did not update canonical data')
  unmount(carousel)
}

function testPendingPasteSpinnerStyles() {
  const shell = document.createElement('div')
  shell.className = 'oe-block oe-block--pending-paste'
  const indicator = document.createElement('div')
  indicator.className = 'oe-pending-paste__indicator'
  const spinner = document.createElement('span')
  spinner.className = 'oe-pending-paste__spinner'
  indicator.appendChild(spinner)
  const hiddenPluginSurface = document.createElement('div')
  hiddenPluginSurface.hidden = true
  hiddenPluginSurface.style.display = 'block'
  shell.append(indicator, hiddenPluginSurface)
  sandbox.appendChild(shell)
  const spinnerStyle = getComputedStyle(spinner)
  assert(spinnerStyle.animationName === 'oe-pending-paste-spin', 'pending paste spinner is not animated')
  assert(spinnerStyle.width === '40px' && spinnerStyle.height === '40px', 'pending paste spinner has wrong size')
  assert(getComputedStyle(hiddenPluginSurface).display === 'none', 'pending plugin UI is visible behind spinner')
  shell.remove()
}

async function run() {
  await testUrlEditors()
  await testHtmlEditor()
  await testSettingsCapabilities()
  testPendingPasteSpinnerStyles()
  return {
    urlEditors: 4,
    htmlEditors: 1,
    settingsSystems: 1,
    settingsCapabilities: 4,
    pasteSpinners: 1,
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
