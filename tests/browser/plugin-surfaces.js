import { Image } from '../../plugins/image/index.js'
import { Gallery } from '../../plugins/gallery/index.js'
import { CarouselBlock } from '../../plugins/carousel/index.js'
import { Attaches } from '../../plugins/attaches/index.js'

const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+Av7lWQAAAABJRU5ErkJggg=='
const sandbox = document.querySelector('#sandbox')
const context = { readOnly: false, mutate(operation) { return operation() } }

function assert(value, message) {
  if (!value) throw new Error(message)
}

function buttonByText(root, selector, text) {
  return [...root.querySelectorAll(selector)]
    .find(button => button.textContent.trim().toLowerCase().includes(text.toLowerCase()))
}

function mount(plugin, data) {
  const block = document.createElement('div')
  block.className = 'oe-block'
  const wrapper = plugin.render(structuredClone(data), context)
  block.appendChild(wrapper)
  sandbox.appendChild(block)
  return { plugin, block, wrapper }
}

function unmount(entry) {
  entry.plugin.destroy(entry.wrapper)
  entry.block.remove()
}

function assertSourceEditor(entry, kind) {
  const root = entry.wrapper.querySelector(`.oe-source-editor[data-oe-source-editor="${kind}"]`)
  assert(root instanceof HTMLElement, `${entry.plugin.type}: ${kind} editor did not open`)
  assert(!root.classList.contains('oe-source-editor--preloaded'), `${entry.plugin.type}: ${kind} editor stayed preloaded`)
  assert(getComputedStyle(root).visibility === 'visible', `${entry.plugin.type}: ${kind} editor stayed hidden`)
  assert(entry.block.dataset.oeLayerOpen === 'true', `${entry.plugin.type}: source editor did not raise its block`)
  assert(getComputedStyle(entry.block).zIndex === '2', `${entry.plugin.type}: active block z-index is incorrect`)
  assert(getComputedStyle(root).zIndex === '1200', `${entry.plugin.type}: source editor z-index is incorrect`)
  const field = root.querySelector('.oe-source-editor__field')
  assert(
    field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement,
    `${entry.plugin.type}: source field is missing`,
  )
  assert(
    getComputedStyle(field).backgroundColor !== 'rgba(0, 0, 0, 0)',
    `${entry.plugin.type}: source field is unstyled`,
  )
  field.focus()
  const focusedStyle = getComputedStyle(field)
  assert(
    focusedStyle.outlineStyle === 'none' && focusedStyle.boxShadow === 'none',
    `${entry.plugin.type}: source field retained a focus outline`,
  )
  return { root, field }
}

function assertPreloadedSourceEditor(entry, kind) {
  const root = entry.wrapper.querySelector(`.oe-source-editor[data-oe-source-editor="${kind}"]`)
  assert(root instanceof HTMLElement, `${entry.plugin.type}: ${kind} editor was not preloaded`)
  const style = getComputedStyle(root)
  assert(
    root.classList.contains('oe-source-editor--preloaded')
      && style.display === 'grid'
      && style.visibility === 'hidden',
    `${entry.plugin.type}: ${kind} editor deferred its first layout until click`,
  )
  assert(root.getAttribute('aria-hidden') === 'true' && root.inert, `${entry.plugin.type}: preloaded ${kind} editor is interactive`)
  return root
}

function submitSource(entry, kind, value, expectedRoot) {
  const { root, field } = assertSourceEditor(entry, kind)
  if (expectedRoot) assert(root === expectedRoot, `${entry.plugin.type}: ${kind} editor was rebuilt on open`)
  const form = root.querySelector('form')
  assert(form instanceof HTMLFormElement, `${entry.plugin.type}: source form is missing`)
  form.requestSubmit()
  const error = root.querySelector('.oe-source-editor__error')
  assert(
    error instanceof HTMLElement && !error.hidden && field.getAttribute('aria-invalid') === 'true',
    `${entry.plugin.type}: ${kind} editor fell back to native form validation`,
  )
  field.value = value
  form.requestSubmit()
  const visibleEditor = [...entry.wrapper.querySelectorAll('.oe-source-editor')]
    .find(editor => !editor.classList.contains('oe-source-editor--preloaded'))
  assert(!visibleEditor, `${entry.plugin.type}: source editor did not close`)
  assert(!entry.block.hasAttribute('data-oe-layer-open'), `${entry.plugin.type}: source layer leaked after submit`)
}

function testUrlEditors() {
  const cases = [
    {
      entry: mount(new Image(), {}),
      selector: '.oe-image__select-link',
      expectedLinks: 2,
      value: 'https://example.com/image.png',
      verify(entry) {
        assert(entry.plugin.save(entry.wrapper).file.url === this.value, 'image: URL was not saved')
      },
    },
    {
      entry: mount(new Gallery(), {}),
      selector: '.oe-gallery__select-link',
      expectedLinks: 2,
      value: 'https://example.com/gallery.png',
      verify(entry) {
        assert(entry.plugin.save(entry.wrapper).images[0]?.url === this.value, 'gallery: URL was not saved')
      },
    },
    {
      entry: mount(new CarouselBlock(), {}),
      selector: '.oe-carousel-block__select-link',
      expectedLinks: 3,
      value: 'https://example.com/carousel.png',
      verify(entry) {
        assert(entry.plugin.save(entry.wrapper).slides[0]?.src === this.value, 'carousel: URL was not saved')
      },
    },
    {
      entry: mount(new Attaches(), {}),
      selector: '.oe-attaches__select-link',
      expectedLinks: 2,
      value: 'https://example.com/file.pdf',
      verify(entry) {
        assert(entry.plugin.save(entry.wrapper).files[0]?.url === this.value, 'attaches: URL was not saved')
      },
    },
  ]

  for (const item of cases) {
    const links = item.entry.wrapper.querySelectorAll(item.selector)
    assert(links.length === item.expectedLinks, `${item.entry.plugin.type}: inline source links are incomplete`)
    const urlLink = buttonByText(item.entry.wrapper, item.selector, 'url')
    assert(urlLink instanceof HTMLButtonElement, `${item.entry.plugin.type}: URL link is missing`)
    const preloaded = assertPreloadedSourceEditor(item.entry, 'url')
    urlLink.click()
    submitSource(item.entry, 'url', item.value, preloaded)
    item.verify(item.entry)
    unmount(item.entry)
  }
}

function testHtmlEditor() {
  const entry = mount(new CarouselBlock(), {})
  const htmlLink = buttonByText(entry.wrapper, '.oe-carousel-block__select-link', 'html')
  assert(htmlLink instanceof HTMLButtonElement, 'carousel: HTML link is missing')
  const preloaded = assertPreloadedSourceEditor(entry, 'html')
  htmlLink.click()
  const root = entry.wrapper.querySelector('.oe-source-editor[data-oe-source-editor="html"]')
  const panel = root?.querySelector('.oe-source-editor__panel')
  const field = root?.querySelector('.oe-source-editor__field')
  assert(root instanceof HTMLElement && panel instanceof HTMLElement, 'carousel: HTML editor panel is missing')
  assert(field instanceof HTMLTextAreaElement, 'carousel: HTML editor textarea is missing')
  assert(getComputedStyle(panel).textAlign === 'left', 'carousel: HTML editor inherited centered text')
  assert(field.rows === 6, 'carousel: HTML editor textarea is oversized')
  assert(root.getBoundingClientRect().height >= panel.getBoundingClientRect().height, 'carousel: HTML editor backdrop does not cover its panel')
  submitSource(entry, 'html', '<article><strong>Safe</strong><script>unsafe()</script></article>', preloaded)
  const slide = entry.plugin.save(entry.wrapper).slides[0]
  assert(slide?.type === 'html' && slide.html.includes('<strong>Safe</strong>'), 'carousel: HTML slide was not saved')
  assert(!slide.html.includes('<script'), 'carousel: unsafe HTML was retained')
  unmount(entry)
}

function testSettingsLayers() {
  const cases = [
    {
      entry: mount(new Image(), { file: { url: pixel } }),
      button: '.oe-image__action-btn',
      panel: '.oe-image__dropdown-panel',
    },
    {
      entry: mount(new Gallery(), { images: [{ url: pixel, caption: '' }] }),
      button: '.oe-gallery__action-btn',
      panel: '.oe-gallery__dropdown-panel',
    },
    {
      entry: mount(new CarouselBlock(), { slides: [{ id: 'one', type: 'image', src: pixel }] }),
      button: '.oe-carousel-block__action-btn',
      panel: '.oe-carousel-block__dropdown-panel',
    },
    {
      entry: mount(new Attaches(), {
        files: [{ url: 'https://example.com/file.pdf', name: 'file.pdf', size: 0, extension: 'pdf' }],
      }),
      button: '.oe-attaches__action-btn',
      panel: '.oe-attaches__dropdown-panel',
    },
  ]

  for (const item of cases) {
    const { entry } = item
    if (entry.plugin.type !== 'attaches') {
      assertPreloadedSourceEditor(entry, 'url')
    }
    if (entry.plugin.type === 'carousel') {
      assertPreloadedSourceEditor(entry, 'html')
    }
    const settings = buttonByText(entry.wrapper, item.button, 'settings')
    assert(settings instanceof HTMLButtonElement, `${entry.plugin.type}: settings button is missing`)
    const panelBeforeOpen = entry.wrapper.querySelector(item.panel)
    if (entry.plugin.type === 'carousel') {
      assert(panelBeforeOpen instanceof HTMLElement, 'carousel: settings panel is missing before opening')
      const hiddenStyle = getComputedStyle(panelBeforeOpen)
      assert(hiddenStyle.display === 'block' && hiddenStyle.visibility === 'hidden',
        'carousel: hidden settings panel still defers its first layout until click')
    }
    settings.click()
    const panel = entry.wrapper.querySelector(item.panel)
    assert(panel instanceof HTMLElement, `${entry.plugin.type}: settings panel is missing`)
    assert(entry.block.dataset.oeLayerOpen === 'true', `${entry.plugin.type}: settings did not raise its block`)
    assert(getComputedStyle(entry.block).zIndex === '2', `${entry.plugin.type}: settings block z-index is incorrect`)
    assert(getComputedStyle(panel).zIndex === '1100', `${entry.plugin.type}: settings panel z-index is incorrect`)

    if (entry.plugin.type === 'image') {
      const trigger = entry.wrapper.querySelector('.oe-image__custom-select-trigger')
      assert(trigger instanceof HTMLButtonElement, 'image: nested dropdown trigger is missing')
      trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      const options = entry.wrapper.querySelector('.oe-image__custom-select-options')
      assert(options instanceof HTMLElement, 'image: nested dropdown is missing')
      assert(getComputedStyle(options).zIndex === '1120', 'image: nested dropdown z-index is incorrect')
    }

    if (entry.plugin.type === 'carousel') {
      const style = getComputedStyle(panel)
      const input = panel.querySelector('.oe-carousel-block__field input')
      const toggle = panel.querySelector('.oe-carousel-block__switch input')
      assert(style.visibility === 'visible' && panel.getAttribute('aria-hidden') === 'false',
        'carousel: settings panel did not become visible')
      assert(parseFloat(style.width) === 400, 'carousel: settings panel did not retain its original width')
      assert(style.padding === '12px', 'carousel: settings panel padding diverged from Image')
      assert(style.borderRadius === '8px', 'carousel: settings panel radius diverged from Image/Gallery')
      assert(input instanceof HTMLInputElement && getComputedStyle(input).height === '22px', 'carousel: settings input diverged from Image/Gallery')
      assert(toggle instanceof HTMLInputElement && getComputedStyle(toggle).width === '28px' && getComputedStyle(toggle).height === '16px', 'carousel: settings toggle diverged from Gallery')
    }

    settings.click()
    assert(!entry.block.hasAttribute('data-oe-layer-open'), `${entry.plugin.type}: settings layer leaked after close`)
    unmount(entry)
  }
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
  assert(spinnerStyle.width === '40px' && spinnerStyle.height === '40px', 'pending paste spinner has the wrong size')
  assert(getComputedStyle(hiddenPluginSurface).display === 'none', 'pending plugin UI is visible behind the spinner')
  shell.remove()
}

function testEditorMenusStayAbovePluginBlocks() {
  const editor = sandbox.closest('.oe-editor')
  assert(editor instanceof HTMLElement, 'editor fixture is missing')

  const block = document.createElement('div')
  block.className = 'oe-block oe-block--focused'
  block.dataset.oeLayerOpen = 'true'
  block.style.cssText = [
    'position:fixed',
    'left:16px',
    'top:16px',
    'width:220px',
    'height:160px',
    'background:#4357b4',
  ].join(';')
  sandbox.appendChild(block)

  const tuneMenu = document.createElement('ul')
  tuneMenu.className = 'oe-settings-menu'
  tuneMenu.style.cssText = [
    'display:block',
    'background:#111',
  ].join(';')
  for (const [property, value] of Object.entries({
    position: 'fixed',
    left: '32px',
    top: '32px',
    right: 'auto',
    bottom: 'auto',
    width: '120px',
    height: '80px',
    transform: 'none',
  })) {
    tuneMenu.style.setProperty(property, value, 'important')
  }
  editor.appendChild(tuneMenu)

  assert(
    Number(getComputedStyle(tuneMenu).zIndex) > Number(getComputedStyle(block).zIndex),
    'editor tune menu is below an active plugin block',
  )
  const menuRect = tuneMenu.getBoundingClientRect()
  const topElement = document.elementFromPoint(menuRect.left + 10, menuRect.top + 10)
  assert(
    topElement === tuneMenu || tuneMenu.contains(topElement),
    `active plugin block visually covers the editor tune menu (top: ${topElement?.tagName || 'none'}.${topElement?.className || ''}, menu: ${menuRect.left},${menuRect.top},${menuRect.width},${menuRect.height})`,
  )

  tuneMenu.remove()
  block.remove()
}

async function run() {
  testUrlEditors()
  testHtmlEditor()
  testSettingsLayers()
  testPendingPasteSpinnerStyles()
  testEditorMenusStayAbovePluginBlocks()
  return {
    urlEditors: 4,
    htmlEditors: 1,
    settingsLayers: 4,
    nestedDropdowns: 1,
    pasteSpinners: 1,
    editorOverlayLayers: 1,
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
