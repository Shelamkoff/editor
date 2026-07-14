function installLifecycleTracker() {
  const originalAdd = EventTarget.prototype.addEventListener
  const originalRemove = EventTarget.prototype.removeEventListener
  const listenerRecords = []

  const captureOf = (options) => typeof options === 'boolean' ? options : !!options?.capture
  const isGlobalTarget = (target) => target === window || target === document
  const releaseRecord = (record) => {
    record.active = false
    record.target = null
    record.listener = null
  }

  EventTarget.prototype.addEventListener = function (type, listener, options) {
    originalAdd.call(this, type, listener, options)
    if (!listener || !isGlobalTarget(this) || options?.signal?.aborted) return

    const capture = captureOf(options)
    const duplicate = listenerRecords.find(record => record.active
      && record.target === this
      && record.type === type
      && record.listener === listener
      && record.capture === capture)
    if (duplicate) return

    const record = { target: this, type, listener, capture, active: true }
    listenerRecords.push(record)
    if (typeof options === 'object' && options?.signal) {
      originalAdd.call(options.signal, 'abort', () => releaseRecord(record), { once: true })
    }
  }

  EventTarget.prototype.removeEventListener = function (type, listener, options) {
    originalRemove.call(this, type, listener, options)
    if (!listener || !isGlobalTarget(this)) return
    const capture = captureOf(options)
    const record = listenerRecords.find(candidate => candidate.active
      && candidate.target === this
      && candidate.type === type
      && candidate.listener === listener
      && candidate.capture === capture)
    if (record) releaseRecord(record)
  }

  const observerSets = new Map()
  const observerCallbacks = new Map()
  for (const name of ['MutationObserver', 'ResizeObserver', 'IntersectionObserver']) {
    const NativeObserver = window[name]
    const active = new Set()
    const callbacks = new WeakMap()
    observerSets.set(name, active)
    observerCallbacks.set(name, callbacks)
    if (!NativeObserver) continue

    window[name] = class TrackedObserver extends NativeObserver {
      constructor(...args) {
        super(...args)
        callbacks.set(this, args[0])
      }

      observe(...args) {
        active.add(this)
        return super.observe(...args)
      }

      disconnect() {
        active.delete(this)
        return super.disconnect()
      }
    }
  }

  const activeObjectUrls = new Set()
  const originalCreateObjectURL = URL.createObjectURL.bind(URL)
  const originalRevokeObjectURL = URL.revokeObjectURL.bind(URL)
  URL.createObjectURL = (value) => {
    const url = originalCreateObjectURL(value)
    activeObjectUrls.add(url)
    return url
  }
  URL.revokeObjectURL = (url) => {
    activeObjectUrls.delete(String(url))
    originalRevokeObjectURL(url)
  }

  return {
    snapshot() {
      return {
        globalListeners: listenerRecords.filter(record => record.active).length,
        mutationObservers: observerSets.get('MutationObserver').size,
        resizeObservers: observerSets.get('ResizeObserver').size,
        intersectionObservers: observerSets.get('IntersectionObserver').size,
        objectUrls: activeObjectUrls.size,
      }
    },
    activeGlobalListeners() {
      return listenerRecords
        .filter(record => record.active)
        .map(record => `${record.target === window ? 'window' : 'document'}:${record.type}`)
        .sort()
    },
    triggerObservers(name) {
      const callbacks = observerCallbacks.get(name)
      for (const observer of observerSets.get(name) || []) {
        callbacks?.get(observer)?.([], observer)
      }
    },
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function assertSnapshot(actual, expected, tracker, label) {
  const keys = Object.keys(expected)
  const mismatch = keys.some(key => actual[key] !== expected[key])
  assert(
    !mismatch,
    `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}; `
      + `listeners=${JSON.stringify(tracker.activeGlobalListeners())}`,
  )
}

const tracker = installLifecycleTracker()
const heapSentinels = []

function trackHeap(label, value) {
  if (typeof WeakRef === 'function' && value && (typeof value === 'object' || typeof value === 'function')) {
    heapSentinels.push({ label, ref: new WeakRef(value) })
  }
}

window.__editorHeapReport = () => ({
  total: heapSentinels.length,
  alive: heapSentinels.filter(item => item.ref.deref() !== undefined).map(item => item.label),
})

const [{ createColorSwatchPlugin, createEditor, createMentionPlugin }, pluginModule, rendererModule, blockTypesModule] = await Promise.all([
  import('../../core/index.js'),
  import('../../plugins/index.js'),
  import('../../renderer/index.js'),
  import('../../shared/blockTypes.js'),
])

const {
  Attaches,
  Checklist,
  Code,
  Columns,
  Delimiter,
  Embed,
  Gallery,
  Heading,
  Image,
  LinkPreview,
  List,
  Paragraph,
  Person,
  Poll,
  Quote,
  Raw,
  Spoiler,
  Table,
  Toggle,
  Warning,
} = pluginModule
const { EditorRenderer } = rendererModule
const { BLOCK_TYPES } = blockTypesModule

const constructors = [
  Paragraph, Heading, List, Quote, Code, Image, Delimiter, Table, Checklist, Warning,
  Embed, Raw, Gallery, Attaches, LinkPreview, Toggle, Columns, Spoiler, Poll, Person,
]
const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+Av7lWQAAAABJRU5ErkJggg=='

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

async function run() {
  const sandbox = document.querySelector('#sandbox')
  const runtimeErrors = []
  window.addEventListener('error', event => runtimeErrors.push(event.error?.stack || event.message))
  window.addEventListener('unhandledrejection', event => runtimeErrors.push(event.reason?.stack || String(event.reason)))
  const baseline = tracker.snapshot()

  for (let cycle = 0; cycle < 5; cycle++) {
    const holder = document.createElement('section')
    sandbox.appendChild(holder)
    const cyclePlugins = constructors.map(Plugin => new Plugin())
    const editor = createEditor({
      holder,
      plugins: cyclePlugins,
      inlinePlugins: [createMentionPlugin({ searchFunction: async () => [] })],
      inlineTools: [],
      data: {
        version: 'browser-lifecycle',
        blocks: [
          { id: `paragraph-${cycle}`, type: 'paragraph', data: { text: 'Lifecycle' } },
          { id: `image-${cycle}`, type: 'image', data: { file: { url: pixel }, caption: 'Pixel' } },
          { id: `gallery-${cycle}`, type: 'gallery', data: { images: [{ url: pixel, caption: '' }] } },
          { id: `attaches-${cycle}`, type: 'attaches', data: { files: [{ url: pixel, name: 'pixel.png', size: 1 }] } },
          { id: `embed-${cycle}`, type: 'embed', data: { service: 'youtube', videoId: 'dQw4w9WgXcQ' } },
          { id: `preview-${cycle}`, type: 'linkPreview', data: { url: 'https://example.com', title: 'Example' } },
        ],
      },
      tuning: {
        undo: { debounceMs: 0 },
        change: { debounceMs: 0 },
        animations: { blockInsertMs: 0, blockMoveMs: 0 },
      },
    })

    assert(tracker.snapshot().mutationObservers > baseline.mutationObservers, 'image observer was not created')
    trackHeap(`editor:${cycle}`, editor)
    trackHeap(`editor-root:${cycle}`, holder.querySelector('.oe-editor'))
    cyclePlugins.forEach((plugin, index) => trackHeap(`editor-plugin:${cycle}:${index}`, plugin))
    editor.destroy()
    assert(holder.childNodes.length === 0, `editor destroy leaked DOM at cycle ${cycle}`)
    holder.remove()
    assertSnapshot(tracker.snapshot(), baseline, tracker, `editor cycle ${cycle} leaked resources`)
  }

  const previewHolder = document.createElement('section')
  sandbox.appendChild(previewHolder)
  let previewRequest
  const previewEditor = createEditor({
    holder: previewHolder,
    plugins: [new Embed({
      resolvePreview: async request => {
        previewRequest = request
        return { thumbnailUrl: pixel, title: 'Resolved preview' }
      },
    })],
    inlineTools: [],
    data: {
      version: 'browser-lifecycle',
      blocks: [{ id: 'vimeo', type: 'embed', data: { service: 'vimeo', videoId: '12345' } }],
    },
  })
  await delay(20)
  assert(previewRequest?.service === 'vimeo' && previewRequest.videoId === '12345', 'embed preview resolver contract changed')
  assert(previewHolder.querySelector('.oe-embed__preview')?.getAttribute('src') === pixel, 'embed preview resolver result was not applied')
  previewEditor.destroy()
  previewHolder.remove()
  assertSnapshot(tracker.snapshot(), baseline, tracker, 'embed preview resolver leaked resources')

  const abortHolder = document.createElement('section')
  sandbox.appendChild(abortHolder)
  let resolverAborted = false
  const abortEditor = createEditor({
    holder: abortHolder,
    plugins: [new Embed({
      resolvePreview: request => new Promise(resolve => {
        request.signal.addEventListener('abort', () => {
          resolverAborted = true
          resolve(null)
        }, { once: true })
      }),
    })],
    inlineTools: [],
    data: {
      version: 'browser-lifecycle',
      blocks: [{ id: 'vimeo-abort', type: 'embed', data: { service: 'vimeo', videoId: '67890' } }],
    },
  })
  abortEditor.destroy()
  abortHolder.remove()
  await delay(0)
  assert(resolverAborted, 'editor destroy did not cancel the embed preview resolver')
  assertSnapshot(tracker.snapshot(), baseline, tracker, 'cancelled embed preview resolver leaked resources')

  for (const closeTiming of ['before-frame', 'after-frame']) {
    const holder = document.createElement('section')
    sandbox.appendChild(holder)
    const editor = createEditor({
      holder,
      plugins: [new Paragraph()],
      inlinePlugins: [createColorSwatchPlugin()],
      inlineTools: [],
      data: {
        version: 'browser-lifecycle',
        blocks: [{
          id: `color-${closeTiming}`,
          type: 'paragraph',
          data: { text: 'Color {{swatch}}' },
          inline: { swatch: { type: 'color', data: { value: '#123456' } } },
        }],
      },
      tuning: { undo: { debounceMs: 0 }, change: { debounceMs: 0 } },
    })
    const beforePopup = tracker.snapshot()
    const swatch = holder.querySelector('[data-inline-plugin="color"]')
    assert(swatch, `color widget was not hydrated (${closeTiming})`)
    swatch.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    assert(holder.querySelector('.oe-ip-popup'), `color popup did not open (${closeTiming})`)
    trackHeap(`color-editor:${closeTiming}`, editor)
    trackHeap(`color-popup:${closeTiming}`, holder.querySelector('.oe-ip-popup'))
    trackHeap(`color-picker:${closeTiming}`, holder.querySelector('.oe-color-dropdown'))

    if (closeTiming === 'after-frame') {
      await delay(50)
      assert(
        tracker.snapshot().globalListeners === beforePopup.globalListeners + 1,
        'color popup outside-click listener was not installed',
      )
    }

    editor.destroy()
    holder.remove()
    await delay(50)
    assert(!document.querySelector('.oe-ip-popup'), `color popup DOM leaked (${closeTiming})`)
    assertSnapshot(tracker.snapshot(), baseline, tracker, `color popup leaked resources (${closeTiming})`)
  }

  const imageBlob = await (await fetch(pixel)).blob()
  const imageFile = new File([imageBlob], 'avatar.png', { type: 'image/png' })
  const imageTransfer = new DataTransfer()
  imageTransfer.items.add(imageFile)

  for (const closeMode of ['cancel', 'editor-destroy']) {
    const cropperHolder = document.createElement('section')
    sandbox.appendChild(cropperHolder)
    const cropperEditor = createEditor({
      holder: cropperHolder,
      plugins: [new Person()],
      inlineTools: [],
      data: {
        version: 'browser-lifecycle',
        blocks: [{
          id: `person-cropper-${closeMode}`,
          type: 'person',
          data: { persons: [{ avatar: '', name: 'Ada', role: '', bio: '', links: [] }] },
        }],
      },
      tuning: { undo: { debounceMs: 0 }, change: { debounceMs: 0 } },
    })

    const originalInputClick = HTMLInputElement.prototype.click
    HTMLInputElement.prototype.click = function () {
      if (this.type !== 'file') return originalInputClick.call(this)
      Object.defineProperty(this, 'files', { configurable: true, value: imageTransfer.files })
      this.dispatchEvent(new Event('change'))
    }
    try {
      const uploadButton = cropperHolder.querySelector('.oe-person__avatar-upload')
      assert(uploadButton, `person editor did not create the avatar upload control (${closeMode})`)
      uploadButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    } finally {
      HTMLInputElement.prototype.click = originalInputClick
    }

    assert(document.querySelector('.oe-cropper-overlay'), `person editor did not open Cropper (${closeMode})`)
    assert(tracker.activeGlobalListeners().includes('document:keydown'), `Cropper listener missing (${closeMode})`)
    assert(tracker.snapshot().objectUrls === baseline.objectUrls + 1, `Cropper object URL missing (${closeMode})`)
    trackHeap(`cropper-editor:${closeMode}`, cropperEditor)
    trackHeap(`cropper-overlay:${closeMode}`, document.querySelector('.oe-cropper-overlay'))
    trackHeap(`cropper-viewport:${closeMode}`, document.querySelector('.oe-cropper-viewport'))

    if (closeMode === 'cancel') {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await delay(50)
      assert(!document.querySelector('.oe-cropper-overlay'), 'Cropper cancel leaked its overlay')
      cropperEditor.destroy()
    } else {
      cropperEditor.destroy()
      await delay(50)
      assert(!document.querySelector('.oe-cropper-overlay'), 'editor destroy leaked the Cropper overlay')
    }

    cropperHolder.remove()
    assertSnapshot(tracker.snapshot(), baseline, tracker, `Cropper ${closeMode} leaked resources`)
  }

  const attaches = new Attaches()
  const attachesElement = attaches.render({}, { mutate: (operation) => operation() })
  sandbox.appendChild(attachesElement)
  const transfer = new DataTransfer()
  transfer.items.add(new File(['attachment'], 'attachment.txt', { type: 'text/plain' }))
  attachesElement.dispatchEvent(new DragEvent('drop', {
    dataTransfer: transfer,
    bubbles: true,
    cancelable: true,
  }))
  assert(tracker.snapshot().objectUrls === baseline.objectUrls + 1, 'attachment object URL was not tracked')
  trackHeap('attaches-plugin', attaches)
  trackHeap('attaches-element', attachesElement)
  attaches.destroy(attachesElement)
  attachesElement.remove()
  assertSnapshot(tracker.snapshot(), baseline, tracker, 'attachment destroy leaked resources')

  const renderer = new EditorRenderer({ blockTypes: BLOCK_TYPES, throwOnUnknown: true })
  const container = document.createElement('main')
  container.style.width = '320px'
  sandbox.appendChild(container)
  renderer.renderTo({
    version: 'browser-lifecycle',
    blocks: [{
      id: 'people',
      type: 'person',
      data: {
        persons: [
          { name: 'Ada', role: 'Engineer', links: [] },
          { name: 'Grace', role: 'Scientist', links: [] },
          { name: 'Linus', role: 'Engineer', links: [] },
        ],
      },
    }],
  }, container)
  assert(tracker.snapshot().resizeObservers > baseline.resizeObservers, 'person renderer observer was not created')
  const personCarouselContainer = container.querySelector('.editor-person__carousel')
  assert(personCarouselContainer, 'person renderer carousel container is missing')
  Object.defineProperty(personCarouselContainer, 'offsetWidth', { configurable: true, value: 320 })
  tracker.triggerObservers('ResizeObserver')
  assert(container.querySelector('.carousel'), 'person renderer did not initialize its carousel integration')
  trackHeap('person-renderer', renderer)
  trackHeap('person-renderer-container', container)
  trackHeap('carousel-root', container.querySelector('.carousel'))
  renderer.destroy(container)
  container.remove()
  assertSnapshot(tracker.snapshot(), baseline, tracker, 'renderer destroy leaked resources')

  const galleryRenderer = new EditorRenderer({ blockTypes: BLOCK_TYPES, throwOnUnknown: true })
  const galleryContainer = document.createElement('main')
  sandbox.appendChild(galleryContainer)
  galleryRenderer.renderTo({
    version: 'browser-lifecycle',
    blocks: [{
      id: 'gallery-lightbox',
      type: 'gallery',
      data: {
        images: [
          { url: pixel, caption: 'First' },
          { url: pixel, caption: 'Second' },
        ],
        layout: '2',
        options: { zoom: true, captions: true, fullscreen: true },
      },
    }],
  }, galleryContainer)
  const galleryItem = galleryContainer.querySelector('.editor-gallery__item')
  assert(galleryItem, 'gallery renderer did not create an interactive item')
  galleryItem.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  assert(document.querySelector('.expose'), 'gallery renderer did not open the Expose integration')
  assert(document.documentElement.classList.contains('expose-noscroll'), 'Expose did not lock document scrolling')
  trackHeap('gallery-renderer', galleryRenderer)
  trackHeap('gallery-renderer-container', galleryContainer)
  trackHeap('expose-overlay', document.querySelector('.expose'))
  galleryRenderer.destroy(galleryContainer)
  galleryContainer.remove()
  assert(!document.querySelector('.expose'), 'gallery renderer destroy leaked the Expose overlay')
  assert(!document.documentElement.classList.contains('expose-noscroll'), 'gallery renderer destroy kept the scroll lock')
  assertSnapshot(tracker.snapshot(), baseline, tracker, 'gallery lightbox destroy leaked resources')

  await new Promise(resolve => setTimeout(resolve, 650))
  assert(runtimeErrors.length === 0, `browser runtime errors: ${runtimeErrors.join('\n')}`)
  assert(document.querySelectorAll('link[data-oe-style]').length === 0, 'stylesheet handles leaked')
  assertSnapshot(tracker.snapshot(), baseline, tracker, 'delayed cleanup leaked resources')
  sandbox.replaceChildren()

  return {
    editorCycles: 5,
    tracked: [
      'global listeners', 'MutationObserver', 'ResizeObserver', 'IntersectionObserver',
      'object URLs', 'styles', 'inline popup', 'ColorPicker', 'Cropper', 'Carousel', 'Expose',
    ],
  }
}

const result = document.querySelector('#result')
try {
  const summary = await run()
  document.body.dataset.status = 'pass'
  result.textContent = JSON.stringify(summary)
} catch (error) {
  document.body.dataset.status = 'fail'
  result.textContent = error?.stack || String(error)
}
