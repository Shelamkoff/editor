import { createEditor } from '../../core/index.js'
import {
  createAttachesPlugin,
  createChecklistPlugin,
  createCodePlugin,
  createColumnsPlugin,
  createDelimiterPlugin,
  createEmbedPlugin,
  createGalleryPlugin,
  createCarouselPlugin,
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
} from '../../plugins/index.js'
import { EditorRenderer } from '../../renderer/index.js'
import { BLOCK_TYPES } from '../../shared/blockTypes.js'

const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+Av7lWQAAAABJRU5ErkJggg=='

const fixtures = {
  paragraph: { text: 'Hello <b>world</b>' },
  heading: { text: 'Stable heading', level: 3 },
  list: { style: 'unordered', items: ['First', 'Second'] },
  quote: { text: 'A useful quote', caption: 'Author' },
  code: { code: 'const answer = 42', language: 'javascript' },
  image: { file: { url: pixel }, caption: 'Pixel', withBorder: true },
  delimiter: {},
  table: { withHeadings: true, content: [['Name', 'Value'], ['Answer', '42']] },
  checklist: { items: [{ text: 'Done', checked: true }, { text: 'Pending', checked: false }] },
  warning: { title: 'Heads up', message: 'Stable warning' },
  embed: { service: 'youtube', videoId: 'dQw4w9WgXcQ', caption: 'Video' },
  raw: { html: '<p>Safe <strong>HTML</strong></p>' },
  gallery: {
    images: [{ url: pixel, caption: 'Pixel' }],
    layout: '1',
    styles: { gap: '4px', borderRadius: '2px' },
    options: { loop: false, zoom: true, navigation: true, captions: true },
  },
  carousel: {
    slides: [
      { id: 'image-slide', type: 'image', src: pixel, alt: 'Pixel', caption: 'Image' },
      { id: 'html-slide', type: 'html', html: '<p>Safe <strong>slide</strong></p>', caption: 'HTML' },
    ],
    options: { loop: true, autoplay: false, autoplayDelay: 3000, navigation: true, pagination: true, thumbnails: false, aspectRatio: '16 / 9' },
  },
  attaches: {
    files: [{ url: '/hello.txt', name: 'hello.txt', size: 5, extension: 'txt' }],
    variant: 'f',
  },
  linkPreview: {
    url: 'https://example.com/article',
    title: 'Example',
    description: 'Preview description',
    image: pixel,
    favicon: pixel,
    domain: 'example.com',
    template: 'horizontal',
  },
  toggle: { title: 'Details', content: '<p>Visible content</p>', open: true },
  columns: { columns: [{ content: '<p>Left</p>' }, { content: '<p>Right</p>' }], layout: '1-1' },
  spoiler: { label: 'Spoiler', content: '<p>Secret</p>' },
  poll: {
    pollId: 'roundtrip-poll',
    question: 'Choose one',
    type: 'single',
    options: [{ id: 'yes', text: 'Yes' }, { id: 'no', text: 'No' }],
    resultsMode: 'afterVote',
    initialResults: { total: 1, options: [{ id: 'yes', votes: 1 }, { id: 'no', votes: 0 }] },
  },
  person: {
    persons: [{
      avatar: pixel,
      name: 'Ada Lovelace',
      role: 'Engineer',
      bio: 'A short biography',
      links: [{ type: 'website', url: 'https://example.com' }],
    }],
  },
}

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

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
  }
  return value
}

function stableJson(value) {
  return JSON.stringify(canonical(value))
}

function editorFor(definition, holder, data) {
  return createEditor({
    holder,
    plugins: [definition],
    defaultBlock: definition.type,
    injectStyles: false,
    data,
  })
}

async function run() {
  const sandbox = document.querySelector('#sandbox')
  const runtimeErrors = []
  window.addEventListener('error', event => runtimeErrors.push(event.error?.stack || event.message))
  window.addEventListener('unhandledrejection', event => runtimeErrors.push(event.reason?.stack || String(event.reason)))

  assert(pluginFactories.length === BLOCK_TYPES.length, 'plugin factory count differs from BLOCK_TYPES')
  const savedBlocks = []

  for (const factory of pluginFactories) {
    const definition = factory({ injectStyles: false })
    const type = definition.type
    const fixture = fixtures[type]
    assert(fixture, `missing fixture for ${type}`)

    const defaultHolder = document.createElement('section')
    sandbox.appendChild(defaultHolder)
    const defaultEditor = editorFor(definition, defaultHolder)
    const defaultSaved = defaultEditor.save()
    assert(defaultSaved.blocks.length === 1, `${type} default editor did not create one block`)
    assert(defaultSaved.blocks[0].type === type, `${type} default editor created the wrong block type`)
    defaultEditor.destroy()
    defaultEditor.destroy()
    defaultHolder.remove()

    const fixtureBefore = stableJson(fixture)
    const firstHolder = document.createElement('section')
    sandbox.appendChild(firstHolder)
    const firstEditor = editorFor(definition, firstHolder, {
      version: '2.0.0',
      blocks: [{ id: `block-${type}`, type, data: structuredClone(fixture) }],
    })
    const firstDocument = firstEditor.save()
    const firstBlock = firstDocument.blocks[0]
    assert(firstBlock?.type === type, `${type} did not survive editor ingestion`)
    assert(firstBlock.dataVersion === definition.schema.currentVersion, `${type} did not normalize to its current dataVersion`)
    assert(stableJson(fixture) === fixtureBefore, `${type} editor ingestion mutated caller data`)
    firstEditor.destroy()
    firstHolder.remove()

    const secondHolder = document.createElement('section')
    sandbox.appendChild(secondHolder)
    const secondDefinition = factory({ injectStyles: false })
    const secondEditor = editorFor(secondDefinition, secondHolder, structuredClone(firstDocument))
    const secondDocument = secondEditor.save()
    assert(
      stableJson(secondDocument.blocks[0]) === stableJson(firstBlock),
      `${type} is not stable across editor save-reload-save`,
    )
    secondEditor.destroy()
    secondHolder.remove()
    savedBlocks.push(structuredClone(firstBlock))
  }

  assert(savedBlocks.length === BLOCK_TYPES.length, 'not every block plugin completed the editor round-trip')

  const apiHolder = document.createElement('section')
  sandbox.appendChild(apiHolder)
  const apiEditor = editorFor(createParagraphPlugin({ injectStyles: false }), apiHolder, {
    version: '2.0.0',
    blocks: [
      { id: 'api-a', type: 'paragraph', dataVersion: 2, data: { text: 'A' } },
      { id: 'api-b', type: 'paragraph', dataVersion: 2, data: { text: 'B' } },
    ],
  })
  assert(apiEditor.isReady === false, 'isReady became true before the ready microtask')
  const interactionEvents = []
  apiEditor.on('selection:changed', payload => interactionEvents.push(['selection', [...payload.selectedIds]]))
  apiEditor.on('currentBlock:changed', payload => interactionEvents.push(['current', payload.currentId]))
  apiEditor.blocks.select(['api-a', 'api-b'])
  apiEditor.blocks.setCurrent('api-b')
  await Promise.resolve()
  assert(apiEditor.isReady === true, 'isReady did not become true after successful composition')
  assert(
    interactionEvents.some(([kind, ids]) => kind === 'selection' && ids.join(',') === 'api-a,api-b'),
    'selection:changed did not publish document-ordered ids',
  )
  assert(
    interactionEvents.some(([kind, id]) => kind === 'current' && id === 'api-b'),
    'currentBlock:changed did not publish the new current block',
  )
  apiEditor.destroy()
  assert(apiEditor.isReady === false, 'isReady must remain readable and false after destroy')
  apiHolder.remove()

  const mobileHolder = document.createElement('section')
  sandbox.appendChild(mobileHolder)
  const mobileDefinition = createParagraphPlugin({ injectStyles: false })
  const mobileEditor = createEditor({
    holder: mobileHolder,
    plugins: [mobileDefinition],
    defaultBlock: 'paragraph',
    injectStyles: false,
    mobileBreakpoint: 100000,
  })
  const mobileRoot = mobileHolder.querySelector('.oe-editor')
  assert(mobileRoot?.classList.contains('oe-editor--mobile'), 'configured mobile breakpoint did not activate mobile mode')
  const mobileId = mobileEditor.blocks.at(0)?.id
  assert(mobileId, 'mobile editor default block is missing')
  mobileEditor.blocks.focus(mobileId)
  await Promise.resolve()
  const mobilePlus = mobileRoot.querySelector('.oe-toolbar__btn:not(.oe-toolbar__drag)')
  const mobileToolbox = mobileRoot.querySelector('.oe-toolbox')
  const mobileBackdrop = mobileRoot.querySelector('.oe-offcanvas-backdrop')
  mobilePlus.click()
  assert(mobileToolbox.classList.contains('oe-toolbox--open'), 'mobile toolbox did not enter open state')
  assert(mobileBackdrop.classList.contains('oe-offcanvas-backdrop--visible'), 'mobile toolbox backdrop did not open')
  mobileBackdrop.click()
  assert(!mobileToolbox.classList.contains('oe-toolbox--open'), 'mobile backdrop did not close toolbox')
  mobileEditor.destroy()
  mobileHolder.remove()

  const renderer = new EditorRenderer({ blockTypes: BLOCK_TYPES, throwOnUnknown: true, theme: 'light' })
  const output = { time: 1, version: '2.0.0', blocks: savedBlocks }
  const container = document.createElement('main')
  sandbox.appendChild(container)

  renderer.renderTo(structuredClone(output), container)
  const wrapper = container.firstElementChild
  assert(document.querySelectorAll('link[data-oe-style]').length > 0,
    'renderer did not automatically acquire styles')
  assert(wrapper?.children.length === BLOCK_TYPES.length, 'read-only renderer did not render every block')
  assert(!container.querySelector('[contenteditable="true"]'), 'read-only renderer created editable content')
  const renderedList = container.querySelector('[data-block-id="block-list"]')
  assert(renderedList?.textContent?.includes('First') && renderedList.textContent.includes('Second'),
    'v2 list data was not rendered from canonical item objects')
  const renderedTable = container.querySelector('[data-block-id="block-table"]')
  assert(renderedTable?.textContent?.includes('Name') && renderedTable.textContent.includes('Answer'),
    'v2 table rows/cells were not rendered from canonical data')
  const firstNodes = [...wrapper.children]

  renderer.renderTo(structuredClone(output), container)
  const secondNodes = [...container.firstElementChild.children]
  assert(firstNodes.every((node, index) => node === secondNodes[index]), 'no-op read-only render replaced DOM')

  const injected = renderer.injectStyles()
  const injectedSecondOwner = renderer.injectStyles()
  assert(document.querySelectorAll('link[data-oe-style]').length > 0, 'renderer styles were not injected')
  injected.destroy()
  assert(document.querySelectorAll('link[data-oe-style]').length > 0, 'one renderer owner removed shared styles')
  injectedSecondOwner.destroy()
  assert(document.querySelectorAll('link[data-oe-style]').length > 0,
    'explicit owners removed the renderer automatic style owner')

  for (let cycle = 0; cycle < 10; cycle++) {
    renderer.renderTo(structuredClone(output), container)
    renderer.destroy(container)
    assert(container.childNodes.length === 0, `renderer destroy leaked DOM at cycle ${cycle}`)
  }

  renderer.destroy()
  assert(document.querySelectorAll('link[data-oe-style]').length === 0,
    'renderer automatic styles leaked after destroy')

  const manualRenderer = new EditorRenderer({ blockTypes: [], injectStyles: false })
  manualRenderer.renderTo({ version: '2.0.0', blocks: [] }, container)
  assert(document.querySelectorAll('link[data-oe-style]').length === 0,
    'renderer injectStyles:false still acquired styles')
  manualRenderer.destroy()

  await new Promise(resolve => setTimeout(resolve, 250))
  assert(runtimeErrors.length === 0, `browser runtime errors: ${runtimeErrors.join('\n')}`)
  sandbox.replaceChildren()

  return {
    plugins: savedBlocks.map(block => block.type),
    defaultRenders: savedBlocks.length,
    editableRoundTrips: savedBlocks.length,
    rendererBlocks: firstNodes.length,
    lifecycleCycles: 10,
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
