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

const [{ createColorSwatchPlugin, createEditor, createMentionPlugin }, pluginModule, rendererModule, blockTypesModule, { colorPickerStylesUrl }] = await Promise.all([
  import('../../core/index.js'),
  import('../../plugins/index.js'),
  import('../../renderer/index.js'),
  import('../../shared/blockTypes.js'),
  import('@shelamkoff/color-picker'),
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

  const replaceHolder = document.createElement('section')
  sandbox.appendChild(replaceHolder)
  let replacedPreviewAborted = false
  const replaceEditor = createEditor({
    holder: replaceHolder,
    plugins: [new Embed({
      resolvePreview: request => new Promise(resolve => {
        request.signal.addEventListener('abort', () => {
          replacedPreviewAborted = true
          resolve(null)
        }, { once: true })
      }),
    })],
    inlineTools: [],
    data: {
      version: 'browser-lifecycle',
      blocks: [{ id: 'vimeo-replace', type: 'embed', data: { service: 'vimeo', videoId: '24680' } }],
    },
  })
  const documentClicksBeforeReplace = tracker.activeGlobalListeners()
    .filter(name => name === 'document:click').length
  const replaceInput = replaceHolder.querySelector('.oe-embed__url-input')
  assert(replaceInput instanceof HTMLInputElement, 'embed URL input is missing')
  replaceInput.value = 'https://youtu.be/dQw4w9WgXcQ'
  replaceInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  await delay(20)
  assert(replacedPreviewAborted, 'replacing an embed URL did not cancel the previous preview request')
  const documentClicksAfterReplace = tracker.activeGlobalListeners()
    .filter(name => name === 'document:click').length
  assert(
    documentClicksAfterReplace <= documentClicksBeforeReplace,
    `replacing an embed URL accumulated global action-panel listeners (before=${documentClicksBeforeReplace}, after=${documentClicksAfterReplace}): `
      + JSON.stringify(tracker.activeGlobalListeners()),
  )
  replaceEditor.destroy()
  replaceHolder.remove()
  assertSnapshot(tracker.snapshot(), baseline, tracker, 'replaced embed leaked resources')

  const imageRaceHolder = document.createElement('section')
  sandbox.appendChild(imageRaceHolder)
  const imageResolvers = []
  const imagePlugin = new Image({
    actions: [{
      label: 'Library',
      handler: ({ signal }) => new Promise(resolve => imageResolvers.push({ resolve, signal })),
    }],
  })
  const imageRaceElement = imagePlugin.render({}, { mutate: operation => operation(), readOnly: false })
  imageRaceHolder.appendChild(imageRaceElement)
  const imageSourceButton = imageRaceElement.querySelector('.oe-image__select-action')
  assert(imageSourceButton, 'image custom source action is missing')
  imageSourceButton.click()
  imageSourceButton.click()
  assert(imageResolvers.length === 2, 'image custom source did not start both requests')
  assert(imageResolvers[0].signal.aborted, 'new image source request did not cancel the previous request')
  imageResolvers[1].resolve({ url: 'https://example.com/latest.png', alt: 'Latest' })
  await delay(0)
  imageResolvers[0].resolve({ url: 'https://example.com/stale.png', alt: 'Stale' })
  await delay(0)
  assert(imagePlugin.save(imageRaceElement).file.url === 'https://example.com/latest.png', 'stale image source replaced the latest result')
  assert(!imageRaceElement.classList.contains('oe-image--loading'), 'image loading state remained after the latest source completed')
  imagePlugin.destroy(imageRaceElement)
  imageRaceHolder.remove()
  assertSnapshot(tracker.snapshot(), baseline, tracker, 'image source race leaked resources')

  const pickerHolder = document.createElement('section')
  sandbox.appendChild(pickerHolder)
  const pickerPlugin = new Image()
  const pickerElement = pickerPlugin.render({}, { mutate: operation => operation(), readOnly: false })
  pickerHolder.appendChild(pickerElement)
  const originalInputClick = HTMLInputElement.prototype.click
  HTMLInputElement.prototype.click = function () {}
  try {
    pickerElement.querySelector('.oe-image__select-link')?.click()
  } finally {
    HTMLInputElement.prototype.click = originalInputClick
  }
  assert(document.body.querySelector('input[type="file"]'), 'image picker did not create its temporary input')
  pickerPlugin.destroy(pickerElement)
  pickerHolder.remove()
  assert(!document.body.querySelector('input[type="file"]'), 'destroying an image block leaked its temporary file input')
  assertSnapshot(tracker.snapshot(), baseline, tracker, 'image picker leaked resources')

  const galleryRaceHolder = document.createElement('section')
  sandbox.appendChild(galleryRaceHolder)
  const galleryResolvers = []
  const galleryPlugin = new Gallery({
    actions: [{
      label: 'Library',
      handler: ({ signal }) => new Promise(resolve => galleryResolvers.push({ resolve, signal })),
    }],
  })
  const galleryRaceElement = galleryPlugin.render({}, { mutate: operation => operation(), readOnly: false })
  galleryRaceHolder.appendChild(galleryRaceElement)
  const gallerySourceButton = galleryRaceElement.querySelector('.oe-gallery__select-action')
  assert(gallerySourceButton, 'gallery custom source action is missing')
  gallerySourceButton.click()
  gallerySourceButton.click()
  assert(galleryResolvers.length === 2, 'gallery custom source did not start both requests')
  assert(!galleryResolvers[0].signal.aborted, 'starting an additive gallery source cancelled the previous source')
  galleryResolvers[1].resolve([{ url: 'https://example.com/second.png', alt: 'Second' }])
  await delay(0)
  galleryResolvers[0].resolve([{ url: 'https://example.com/first.png', alt: 'First' }])
  await delay(0)
  const galleryRaceData = galleryPlugin.save(galleryRaceElement)
  assert(galleryRaceData.images.length === 2, 'concurrent gallery sources lost an image batch')
  assert(galleryRaceData.images.some(image => image.url.endsWith('/first.png')), 'first gallery source result is missing')
  assert(galleryRaceData.images.some(image => image.url.endsWith('/second.png')), 'second gallery source result is missing')
  assert(!galleryRaceElement.classList.contains('oe-gallery--loading'), 'gallery loading state remained after all sources completed')
  galleryPlugin.destroy(galleryRaceElement)
  galleryRaceHolder.remove()
  assertSnapshot(tracker.snapshot(), baseline, tracker, 'gallery source race leaked resources')

  const masonryHolder = document.createElement('section')
  masonryHolder.style.width = '720px'
  sandbox.appendChild(masonryHolder)
  const masonryPlugin = new Gallery()
  const masonryElement = masonryPlugin.render({
    images: [
      { url: pixel, caption: 'One' },
      { url: pixel, caption: 'Two' },
      { url: pixel, caption: 'Three' },
      { url: pixel, caption: 'Four' },
    ],
    layout: 'masonry',
    styles: { gap: '8px' },
  }, { mutate: operation => operation(), readOnly: false })
  masonryHolder.appendChild(masonryElement)
  await delay(250)
  const masonryGrid = masonryElement.querySelector('.oe-gallery__grid.eg--masonry.masonry-container')
  assert(masonryGrid, 'gallery plugin did not mount @shelamkoff/masonry')
  assert(masonryGrid.querySelectorAll(':scope > .masonry-item').length === 4,
    'gallery plugin masonry did not own every image')
  assert(Number.parseFloat(masonryGrid.style.height) > 0,
    'gallery plugin masonry did not calculate a container height')
  assert(tracker.snapshot().resizeObservers > baseline.resizeObservers,
    'gallery plugin masonry observer was not created')
  masonryPlugin.destroy(masonryElement)
  masonryHolder.remove()
  await delay(0)
  assertSnapshot(tracker.snapshot(), baseline, tracker, 'gallery plugin masonry leaked resources')

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
    const colorPickerStyleLinks = Array.from(document.querySelectorAll('link[data-oe-style]'))
      .filter(link => link.href === colorPickerStylesUrl)
    assert(colorPickerStyleLinks.length === 1,
      `color plugin did not acquire the color-picker stylesheet (${closeTiming})`)
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
    assert(!Array.from(document.querySelectorAll('link[data-oe-style]'))
      .some(link => link.href === colorPickerStylesUrl),
    `color plugin did not release the color-picker stylesheet (${closeTiming})`)
    assertSnapshot(tracker.snapshot(), baseline, tracker, `color popup leaked resources (${closeTiming})`)
  }

  const manualStylesHolder = document.createElement('section')
  sandbox.appendChild(manualStylesHolder)
  const manualStylesEditor = createEditor({
    holder: manualStylesHolder,
    plugins: [new Paragraph()],
    inlinePlugins: [
      createColorSwatchPlugin(),
      createMentionPlugin({ searchFunction: async () => [] }),
    ],
    inlineTools: [],
    injectStyles: false,
  })
  assert(document.querySelectorAll('link[data-oe-style]').length === 0,
    'injectStyles:false still acquired block or inline-plugin styles')
  manualStylesEditor.destroy()
  manualStylesHolder.remove()
  assertSnapshot(tracker.snapshot(), baseline, tracker, 'manual stylesheet mode leaked resources')

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
  // Object URLs are editor-scoped rather than block-scoped: an undo snapshot
  // may recreate the removed block and still needs the same URL. The editor's
  // PluginOwnership invokes dispose() after every block has been released.
  attaches.dispose()
  assertSnapshot(tracker.snapshot(), baseline, tracker, 'attachment destroy leaked resources')

  const attachmentResolvers = []
  const concurrentAttaches = new Attaches({
    actions: [{
      label: 'Library',
      handler: ({ signal }) => new Promise(resolve => attachmentResolvers.push({ resolve, signal })),
    }],
  })
  const concurrentAttachesElement = concurrentAttaches.render({}, {
    mutate: operation => operation(),
    readOnly: false,
  })
  sandbox.appendChild(concurrentAttachesElement)
  const attachmentSource = concurrentAttachesElement.querySelector('.oe-attaches__select-action')
  assert(attachmentSource, 'attachment custom source action is missing')
  attachmentSource.click()
  attachmentSource.click()
  assert(attachmentResolvers.length === 2, 'attachment custom source did not start both requests')
  assert(!attachmentResolvers[0].signal.aborted, 'starting an additive attachment source cancelled the previous source')
  attachmentResolvers[1].resolve([{ url: 'https://example.com/second.pdf', name: 'second.pdf' }])
  await delay(0)
  attachmentResolvers[0].resolve([{ url: 'https://example.com/first.pdf', name: 'first.pdf' }])
  await delay(0)
  const concurrentAttachmentData = concurrentAttaches.save(concurrentAttachesElement)
  assert(concurrentAttachmentData.files.length === 2, 'concurrent attachment sources lost a file batch')
  assert(!concurrentAttachesElement.classList.contains('oe-attaches--loading'),
    'attachment loading state remained after all sources completed')
  concurrentAttaches.destroy(concurrentAttachesElement)
  concurrentAttaches.dispose()
  concurrentAttachesElement.remove()
  assertSnapshot(tracker.snapshot(), baseline, tracker, 'concurrent attachment sources leaked resources')

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
  galleryContainer.style.width = '720px'
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
        layout: 'masonry',
        styles: { gap: '8px' },
        options: { zoom: true, navigation: false, captions: true, fullscreen: true },
      },
    }],
  }, galleryContainer)
  await delay(250)
  const renderedMasonry = galleryContainer.querySelector('.editor-gallery.eg--masonry.masonry-container')
  assert(renderedMasonry, 'gallery renderer did not mount @shelamkoff/masonry')
  assert(renderedMasonry.querySelectorAll(':scope > .masonry-item').length === 2,
    'gallery renderer masonry did not own every image')
  assert(Number.parseFloat(renderedMasonry.style.height) > 0,
    'gallery renderer masonry did not calculate a container height')
  const galleryItem = galleryContainer.querySelector('.editor-gallery__item')
  assert(galleryItem, 'gallery renderer did not create an interactive item')
  assert(galleryItem.getAttribute('role') === 'button' && galleryItem.tabIndex === 0,
    'gallery renderer item is not keyboard accessible')
  assert(galleryItem.getAttribute('aria-label')?.includes('First'),
    'gallery renderer item has no descriptive accessible name')
  galleryItem.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  assert(document.querySelector('.expose'), 'gallery renderer did not open the Expose integration')
  assert(!document.querySelector('.expose__nav'), 'gallery renderer ignored navigation:false')
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
      'object URLs', 'styles', 'inline popup', 'ColorPicker', 'Cropper', 'Carousel', 'Masonry', 'Expose',
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
