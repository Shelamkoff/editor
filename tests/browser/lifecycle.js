function installLifecycleTracker() {
  const originalAdd = EventTarget.prototype.addEventListener
  const originalRemove = EventTarget.prototype.removeEventListener
  const listenerRecords = []

  const captureOf = options => typeof options === 'boolean' ? options : !!options?.capture
  const isGlobalTarget = target => target === window || target === document
  const releaseRecord = record => {
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
  URL.createObjectURL = value => {
    const url = originalCreateObjectURL(value)
    activeObjectUrls.add(url)
    return url
  }
  URL.revokeObjectURL = url => {
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
      for (const observer of observerSets.get(name) || []) callbacks?.get(observer)?.([], observer)
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
    `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}; listeners=${JSON.stringify(tracker.activeGlobalListeners())}`,
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

const [
  { createEditor },
  plugins,
  { createColorSwatchPlugin },
  { createMentionPlugin },
  { EditorRenderer },
  { BLOCK_TYPES },
  { colorPickerStylesUrl },
] = await Promise.all([
  import('../../core/index.js'),
  import('../../plugins/index.js'),
  import('../../inline-plugins/color.js'),
  import('../../inline-plugins/mention/index.js'),
  import('../../renderer/index.js'),
  import('../../shared/blockTypes.js'),
  import('@shelamkoff/color-picker'),
])

const {
  createAttachesPlugin,
  createCarouselPlugin,
  createChecklistPlugin,
  createCodePlugin,
  createColumnsPlugin,
  createDelimiterPlugin,
  createEmbedPlugin,
  createGalleryPlugin,
  createHeadingPlugin,
  createImagePlugin,
  createLinkPreviewPlugin,
  createListPlugin,
  createParagraphPlugin,
  createPersonPlugin,
  createPollPlugin,
  createQuotePlugin,
  createRawPlugin,
  createSpoilerPlugin,
  createTablePlugin,
  createTogglePlugin,
  createWarningPlugin,
} = plugins

const pluginFactories = [
  createParagraphPlugin,
  createHeadingPlugin,
  createListPlugin,
  createQuotePlugin,
  createCodePlugin,
  createImagePlugin,
  createDelimiterPlugin,
  createTablePlugin,
  createChecklistPlugin,
  createWarningPlugin,
  createEmbedPlugin,
  createRawPlugin,
  createGalleryPlugin,
  createCarouselPlugin,
  createAttachesPlugin,
  createLinkPreviewPlugin,
  createTogglePlugin,
  createColumnsPlugin,
  createSpoilerPlugin,
  createPollPlugin,
  createPersonPlugin,
]

const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+Av7lWQAAAABJRU5ErkJggg=='
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

function makeEditor(sandbox, definitions, data, options = {}) {
  const holder = document.createElement('section')
  sandbox.appendChild(holder)
  const editor = createEditor({
    holder,
    plugins: definitions,
    defaultBlock: options.defaultBlock,
    inlinePlugins: options.inlinePlugins ?? [],
    inlineTools: [],
    injectStyles: options.injectStyles ?? false,
    changeDebounceMs: 0,
    ...(data ? { data } : {}),
  })
  return { holder, editor }
}

function oneBlock(type, data, id = type) {
  return { version: '2.0.0', blocks: [{ id, type, data }] }
}

async function run() {
  const sandbox = document.querySelector('#sandbox')
  const runtimeErrors = []
  window.addEventListener('error', event => runtimeErrors.push(event.error?.stack || event.message))
  window.addEventListener('unhandledrejection', event => runtimeErrors.push(event.reason?.stack || String(event.reason)))

  const baseline = tracker.snapshot()

  for (let cycle = 0; cycle < 5; cycle++) {
    const definitions = pluginFactories.map(factory => factory({ injectStyles: false }))
    const blocks = definitions.map((definition, index) => ({
      id: `${definition.type}-${cycle}-${index}`,
      type: definition.type,
      data: definition.schema.createDefault(),
    }))
    const { holder, editor } = makeEditor(sandbox, definitions, { version: '2.0.0', blocks }, {
      inlinePlugins: [
        createMentionPlugin({ searchFunction: async () => [] }),
        createColorSwatchPlugin(),
      ],
      injectStyles: false,
    })
    trackHeap(`editor:${cycle}`, editor)
    trackHeap(`editor-root:${cycle}`, holder.querySelector('.oe-editor'))
    editor.destroy()
    assert(holder.childNodes.length === 0, `editor destroy leaked DOM at cycle ${cycle}`)
    holder.remove()
    assertSnapshot(tracker.snapshot(), baseline, tracker, `editor cycle ${cycle} leaked resources`)
  }

  const manual = makeEditor(
    sandbox,
    [createParagraphPlugin(), createImagePlugin()],
    oneBlock('paragraph', { text: 'Manual styles' }, 'manual'),
    {
      inlinePlugins: [createColorSwatchPlugin(), createMentionPlugin({ searchFunction: async () => [] })],
      injectStyles: false,
    },
  )
  assert(document.querySelectorAll('link[data-oe-style]').length === 0, 'editor injectStyles:false still acquired definition styles')
  manual.editor.destroy()
  manual.holder.remove()
  assertSnapshot(tracker.snapshot(), baseline, tracker, 'manual style mode leaked resources')

  const styled = makeEditor(sandbox, [createParagraphPlugin()], oneBlock('paragraph', { text: 'Styled' }, 'styled'), {
    injectStyles: true,
  })
  assert(document.querySelectorAll('link[data-oe-style]').length > 0, 'automatic editor styles were not acquired')
  styled.editor.destroy()
  styled.holder.remove()
  assert(document.querySelectorAll('link[data-oe-style]').length === 0, 'automatic editor styles leaked after destroy')
  assertSnapshot(tracker.snapshot(), baseline, tracker, 'automatic style mode leaked resources')

  let previewRequest
  const preview = makeEditor(
    sandbox,
    [createEmbedPlugin({
      injectStyles: false,
      resolvePreview: async request => {
        previewRequest = request
        return { thumbnailUrl: pixel, title: 'Resolved preview' }
      },
    })],
    oneBlock('embed', {
      service: 'vimeo', videoId: '12345', caption: '', cover: '', title: '', duration: '',
    }, 'vimeo'),
    { defaultBlock: 'embed' },
  )
  await delay(20)
  assert(previewRequest?.service === 'vimeo' && previewRequest.videoId === '12345', 'embed preview resolver contract changed')
  assert(preview.holder.querySelector('.oe-embed__preview')?.getAttribute('src') === pixel, 'embed preview result was not applied')
  preview.editor.destroy()
  preview.holder.remove()
  assertSnapshot(tracker.snapshot(), baseline, tracker, 'embed preview leaked resources')

  let previewAborted = false
  const abortingPreview = makeEditor(
    sandbox,
    [createEmbedPlugin({
      injectStyles: false,
      resolvePreview: request => new Promise(resolve => {
        request.signal.addEventListener('abort', () => {
          previewAborted = true
          resolve(null)
        }, { once: true })
      }),
    })],
    oneBlock('embed', {
      service: 'vimeo', videoId: '67890', caption: '', cover: '', title: '', duration: '',
    }, 'vimeo-abort'),
    { defaultBlock: 'embed' },
  )
  abortingPreview.editor.destroy()
  abortingPreview.holder.remove()
  await delay(0)
  assert(previewAborted, 'editor destroy did not abort embed preview work')
  assertSnapshot(tracker.snapshot(), baseline, tracker, 'aborted embed preview leaked resources')

  const imageResolvers = []
  const image = makeEditor(
    sandbox,
    [createImagePlugin({
      injectStyles: false,
      actions: [{
        label: 'Library',
        handler: ({ signal }) => new Promise(resolve => imageResolvers.push({ resolve, signal })),
      }],
    })],
    oneBlock('image', {
      file: { url: '' }, caption: '', withBorder: false, withBackground: false, expanded: false,
      styles: {},
    }, 'image-race'),
    { defaultBlock: 'image' },
  )
  const imageAction = [...image.holder.querySelectorAll('.oe-image__select-action')]
    .find(button => button.textContent?.trim().includes('Library'))
  assert(imageAction instanceof HTMLButtonElement, 'image custom source action is missing')
  imageAction.click()
  imageAction.click()
  assert(imageResolvers.length === 2, 'image source did not start two replacement requests')
  assert(imageResolvers[0].signal.aborted, 'image replacement did not abort the previous source request')
  imageResolvers[1].resolve({ url: 'https://example.com/latest.png', alt: 'Latest' })
  await delay(0)
  imageResolvers[0].resolve({ url: 'https://example.com/stale.png', alt: 'Stale' })
  await delay(0)
  assert(image.editor.save().blocks[0].data.file.url === 'https://example.com/latest.png', 'stale image source replaced the latest result')
  image.editor.destroy()
  image.holder.remove()
  assertSnapshot(tracker.snapshot(), baseline, tracker, 'image source race leaked resources')

  const galleryResolvers = []
  const gallery = makeEditor(
    sandbox,
    [createGalleryPlugin({
      injectStyles: false,
      actions: [{
        label: 'Library',
        handler: ({ signal }) => new Promise(resolve => galleryResolvers.push({ resolve, signal })),
      }],
    })],
    oneBlock('gallery', createGalleryPlugin({ injectStyles: false }).schema.createDefault(), 'gallery-race'),
    { defaultBlock: 'gallery' },
  )
  const galleryAction = gallery.holder.querySelector('.oe-gallery__select-action')
  assert(galleryAction instanceof HTMLButtonElement, 'gallery custom source action is missing')
  galleryAction.click()
  galleryAction.click()
  assert(galleryResolvers.length === 2, 'gallery source did not start both additive requests')
  assert(!galleryResolvers[0].signal.aborted, 'gallery additive source cancelled the previous request')
  galleryResolvers[1].resolve([{ url: 'https://example.com/second.png', alt: 'Second' }])
  await delay(0)
  galleryResolvers[0].resolve([{ url: 'https://example.com/first.png', alt: 'First' }])
  await delay(0)
  const galleryData = gallery.editor.save().blocks[0].data
  assert(galleryData.images.length === 2, 'parallel gallery sources lost a result')
  assert(galleryData.images.some(item => item.url.endsWith('/first.png')), 'first gallery source result is missing')
  assert(galleryData.images.some(item => item.url.endsWith('/second.png')), 'second gallery source result is missing')
  assert(!gallery.holder.querySelector('.oe-gallery')?.classList.contains('oe-gallery--loading'), 'gallery loading state did not settle')
  gallery.editor.destroy()
  gallery.holder.remove()
  assertSnapshot(tracker.snapshot(), baseline, tracker, 'gallery source race leaked resources')

  const attachmentResolvers = []
  const attachesDefinition = createAttachesPlugin({
    injectStyles: false,
    actions: [{
      label: 'Library',
      handler: ({ signal }) => new Promise(resolve => attachmentResolvers.push({ resolve, signal })),
    }],
  })
  const attaches = makeEditor(
    sandbox,
    [attachesDefinition],
    oneBlock('attaches', attachesDefinition.schema.createDefault(), 'attaches-race'),
    { defaultBlock: 'attaches' },
  )
  const attachmentAction = [...attaches.holder.querySelectorAll('.oe-attaches__select button')]
    .find(button => button.textContent?.includes('Library'))
  assert(attachmentAction instanceof HTMLButtonElement, 'attachment custom source action is missing')
  attachmentAction.click()
  attachmentAction.click()
  assert(attachmentResolvers.length === 2, 'attachment source did not start both additive requests')
  assert(!attachmentResolvers[0].signal.aborted, 'attachment additive source cancelled the previous request')
  attachmentResolvers[1].resolve([{ url: 'https://example.com/second.pdf', name: 'second.pdf' }])
  await delay(0)
  attachmentResolvers[0].resolve([{ url: 'https://example.com/first.pdf', name: 'first.pdf' }])
  await delay(0)
  const attachmentData = attaches.editor.save().blocks[0].data
  assert(attachmentData.files.length === 2, 'parallel attachment sources lost a result')
  assert(!attaches.holder.querySelector('.oe-attaches')?.classList.contains('oe-attaches--loading'), 'attachment loading state did not settle')
  attaches.editor.destroy()
  attaches.holder.remove()
  assertSnapshot(tracker.snapshot(), baseline, tracker, 'attachment source race leaked resources')

  const objectUrlDefinition = createAttachesPlugin({ injectStyles: false })
  const objectUrlEditor = makeEditor(
    sandbox,
    [objectUrlDefinition],
    oneBlock('attaches', objectUrlDefinition.schema.createDefault(), 'attaches-object-url'),
    { defaultBlock: 'attaches' },
  )
  const transfer = new DataTransfer()
  transfer.items.add(new File(['attachment'], 'attachment.txt', { type: 'text/plain' }))
  const originalInputClick = HTMLInputElement.prototype.click
  HTMLInputElement.prototype.click = function () {
    if (this.type !== 'file') return originalInputClick.call(this)
    Object.defineProperty(this, 'files', { configurable: true, value: transfer.files })
    this.dispatchEvent(new Event('change', { bubbles: true }))
  }
  try {
    const upload = [...objectUrlEditor.holder.querySelectorAll('.oe-attaches__select button')]
      .find(button => button.textContent?.includes('Upload'))
    assert(upload instanceof HTMLButtonElement, 'attachment upload control is missing')
    upload.click()
  } finally {
    HTMLInputElement.prototype.click = originalInputClick
  }
  await delay(20)
  assert(tracker.snapshot().objectUrls === baseline.objectUrls + 1, 'attachment object URL was not created')
  objectUrlEditor.editor.destroy()
  objectUrlEditor.holder.remove()
  assertSnapshot(tracker.snapshot(), baseline, tracker, 'attachment object URL leaked after editor destroy')

  const color = makeEditor(
    sandbox,
    [createParagraphPlugin({ injectStyles: false })],
    {
      version: '2.0.0',
      blocks: [{
        id: 'color',
        type: 'paragraph',
        data: { text: 'Color {{swatch}}' },
        inline: { swatch: { type: 'color', data: { value: '#123456' } } },
      }],
    },
    { inlinePlugins: [createColorSwatchPlugin()], injectStyles: true },
  )
  const colorPickerLinks = [...document.querySelectorAll('link[data-oe-style]')]
    .filter(link => link.href === colorPickerStylesUrl)
  assert(colorPickerLinks.length === 1, 'color plugin did not acquire color-picker styles')
  const swatch = color.holder.querySelector('[data-inline-plugin="color"]')
  assert(swatch instanceof HTMLElement, 'color widget was not hydrated')
  swatch.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  assert(color.holder.querySelector('.oe-ip-popup'), 'color popup did not open')
  trackHeap('color-popup', color.holder.querySelector('.oe-ip-popup'))
  color.editor.destroy()
  color.holder.remove()
  await delay(30)
  assert(!document.querySelector('.oe-ip-popup'), 'color popup leaked after editor destroy')
  assert(![...document.querySelectorAll('link[data-oe-style]')].some(link => link.href === colorPickerStylesUrl), 'color-picker style leaked')
  assertSnapshot(tracker.snapshot(), baseline, tracker, 'color popup leaked resources')

  const imageBlob = await (await fetch(pixel)).blob()
  const imageFile = new File([imageBlob], 'avatar.png', { type: 'image/png' })
  const imageTransfer = new DataTransfer()
  imageTransfer.items.add(imageFile)

  const person = makeEditor(
    sandbox,
    [createPersonPlugin({ injectStyles: false })],
    oneBlock('person', {
      persons: [{ avatar: '', name: 'Ada', role: '', bio: '', links: [] }],
    }, 'person-cropper'),
    { defaultBlock: 'person' },
  )
  const originalPersonClick = HTMLInputElement.prototype.click
  HTMLInputElement.prototype.click = function () {
    if (this.type !== 'file') return originalPersonClick.call(this)
    Object.defineProperty(this, 'files', { configurable: true, value: imageTransfer.files })
    this.dispatchEvent(new Event('change', { bubbles: true }))
  }
  try {
    const upload = person.holder.querySelector('.oe-person__avatar-upload')
    assert(upload instanceof HTMLButtonElement, 'person avatar upload control is missing')
    upload.click()
  } finally {
    HTMLInputElement.prototype.click = originalPersonClick
  }
  assert(document.querySelector('.oe-cropper-overlay'), 'person editor did not open Cropper')
  assert(tracker.activeGlobalListeners().includes('document:keydown'), 'Cropper key listener is missing')
  person.editor.destroy()
  person.holder.remove()
  await delay(30)
  assert(!document.querySelector('.oe-cropper-overlay'), 'editor destroy leaked Cropper overlay')
  assertSnapshot(tracker.snapshot(), baseline, tracker, 'Cropper leaked resources')

  const personRenderer = new EditorRenderer({ blockTypes: ['person'], throwOnUnknown: true, injectStyles: false })
  const personContainer = document.createElement('main')
  personContainer.style.width = '320px'
  sandbox.appendChild(personContainer)
  personRenderer.renderTo({
    version: '2.0.0',
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
  }, personContainer)
  const carouselContainer = personContainer.querySelector('.editor-person__carousel')
  assert(carouselContainer, 'person renderer carousel container is missing')
  Object.defineProperty(carouselContainer, 'offsetWidth', { configurable: true, value: 320 })
  tracker.triggerObservers('ResizeObserver')
  assert(personContainer.querySelector('.carousel'), 'person renderer did not initialize Carousel')
  personRenderer.destroy(personContainer)
  personRenderer.destroy()
  personContainer.remove()
  assertSnapshot(tracker.snapshot(), baseline, tracker, 'person renderer leaked resources')

  const galleryRenderer = new EditorRenderer({ blockTypes: ['gallery'], throwOnUnknown: true, injectStyles: false })
  const galleryContainer = document.createElement('main')
  galleryContainer.style.width = '720px'
  sandbox.appendChild(galleryContainer)
  galleryRenderer.renderTo({
    version: '2.0.0',
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
  assert(renderedMasonry, 'gallery renderer did not mount Masonry')
  const galleryItem = galleryContainer.querySelector('.editor-gallery__item')
  assert(galleryItem, 'gallery renderer item is missing')
  galleryItem.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  assert(document.querySelector('.expose'), 'gallery renderer did not open Expose')
  galleryRenderer.destroy(galleryContainer)
  galleryRenderer.destroy()
  galleryContainer.remove()
  assert(!document.querySelector('.expose'), 'gallery renderer destroy leaked Expose')
  assertSnapshot(tracker.snapshot(), baseline, tracker, 'gallery renderer leaked resources')

  assert(pluginFactories.length === BLOCK_TYPES.length, 'lifecycle factory matrix differs from supported block types')

  await delay(100)
  assert(runtimeErrors.length === 0, `browser runtime errors: ${runtimeErrors.join('\n')}`)
  assert(document.querySelectorAll('link[data-oe-style]').length === 0, 'styles leaked after lifecycle matrix')
  assertSnapshot(tracker.snapshot(), baseline, tracker, 'final lifecycle cleanup leaked resources')
  sandbox.replaceChildren()

  return {
    editorCycles: 5,
    factoryCount: pluginFactories.length,
    races: ['image replacement', 'gallery additive', 'attaches additive'],
    asyncAbort: ['embed preview', 'person cropper'],
    integrations: ['ColorPicker', 'Cropper', 'Carousel', 'Masonry', 'Expose'],
    tracked: ['global listeners', 'observers', 'object URLs', 'styles'],
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
