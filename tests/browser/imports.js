const blockEntries = [
  ['paragraph', 'Paragraph', 'createParagraphRenderer'],
  ['heading', 'Heading', 'createHeaderRenderer'],
  ['list', 'List', 'createListRenderer'],
  ['quote', 'Quote', 'createQuoteRenderer'],
  ['code', 'Code', 'createCodeRenderer'],
  ['image', 'Image', 'createImageRenderer'],
  ['delimiter', 'Delimiter', 'createDelimiterRenderer'],
  ['table', 'Table', 'createTableRenderer'],
  ['checklist', 'Checklist', 'createChecklistRenderer'],
  ['warning', 'Warning', 'createWarningRenderer'],
  ['embed', 'Embed', 'createEmbedRenderer'],
  ['raw', 'Raw', 'createRawRenderer'],
  ['gallery', 'Gallery', 'createGalleryRenderer'],
  ['carousel', 'CarouselBlock', 'createCarouselRenderer'],
  ['attaches', 'Attaches', 'createAttachesRenderer'],
  ['link-preview', 'LinkPreview', 'createLinkPreviewRenderer'],
  ['toggle', 'Toggle', 'createToggleRenderer'],
  ['columns', 'Columns', 'createColumnsRenderer'],
  ['spoiler', 'Spoiler', 'createSpoilerRenderer'],
  ['poll', 'Poll', 'createPollRenderer'],
  ['person', 'Person', 'createPersonRenderer'],
]

const inlineToolPaths = [
  'align', 'bold', 'caseTransform', 'clearFormatting', 'code', 'colorPicker',
  'defaults', 'fontSize', 'italic', 'link', 'marker', 'scriptTool',
  'strikethrough', 'utils',
].map(name => `../../inline-tools/${name}.js`)

const localePaths = [
  '../../locale/en.js',
  '../../locale/ru.js',
  '../../core/locale/en.js',
  '../../core/locale/ru.js',
  '../../inline-plugins/locale/en.js',
  '../../inline-plugins/locale/ru.js',
  '../../renderer/locale/en.js',
  '../../renderer/locale/ru.js',
  ...blockEntries.flatMap(([folder]) => [
    `../../plugins/${folder}/locale/en.js`,
    `../../plugins/${folder}/locale/ru.js`,
  ]),
  ...['attaches', 'code', 'person', 'spoiler'].flatMap(folder => [
    `../../renderer/renderers/${folder}/locale/en.js`,
    `../../renderer/renderers/${folder}/locale/ru.js`,
  ]),
]

const runtimePaths = [
  '../../core/index.js',
  '../../plugins/index.js',
  '../../plugins/async.js',
  '../../renderer/index.js',
  '../../renderer/async.js',
  '../../renderer/inline.js',
  '../../renderer/errors.js',
  '../../renderer/renderers/index.js',
  '../../renderer/renderers/async.js',
  '../../inline-plugins/color.js',
  '../../inline-plugins/mention/index.js',
  '../../plugins/embed/player.js',
  ...['paragraph', 'heading', 'list', 'quote', 'checklist']
    .map(folder => `../../plugins/${folder}/mapTextFields.js`),
  ...blockEntries.flatMap(([folder]) => [
    `../../plugins/${folder}/index.js`,
    `../../renderer/renderers/${folder}/index.js`,
  ]),
  ...inlineToolPaths,
  ...localePaths,
]

const pluginCss = {
  paragraph: 'paragraph.css',
  heading: 'heading.css',
  list: 'list.css',
  quote: 'quote.css',
  code: 'code.css',
  image: 'image.css',
  delimiter: 'delimiter.css',
  table: 'table.css',
  checklist: 'checklist.css',
  warning: 'warning.css',
  embed: 'embed.css',
  raw: 'raw.css',
  gallery: 'gallery.css',
  carousel: 'carousel.css',
  attaches: 'attaches.css',
  'link-preview': 'link-preview.css',
  toggle: 'toggle.css',
  columns: 'columns.css',
  spoiler: 'spoiler.css',
  poll: 'poll.css',
  person: 'person.css',
}

const staticStylePaths = [
  '../../core/themes/variables.css',
  '../../core/themes/light.css',
  '../../core/themes/dark.css',
  '../../inline-plugins/mention/styles.css',
  '../../renderer/styles/base.css',
  ...blockEntries.map(([folder]) => `../../plugins/${folder}/${pluginCss[folder]}`),
]

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function run() {
  const imported = new Map()
  for (const path of new Set(runtimePaths)) {
    try {
      imported.set(path, await import(path))
    } catch (error) {
      throw new Error(`Legacy runtime import failed: ${path}`, { cause: error })
    }
  }

  const aggregatePlugins = imported.get('../../plugins/index.js')
  const aggregateRenderers = imported.get('../../renderer/renderers/index.js')
  const stylePaths = [...staticStylePaths]
  for (const [folder, pluginName, rendererName] of blockEntries) {
    const pluginModule = imported.get(`../../plugins/${folder}/index.js`)
    const rendererModule = imported.get(`../../renderer/renderers/${folder}/index.js`)
    assert(typeof pluginModule?.[pluginName] === 'function', `${folder} legacy plugin entry lost ${pluginName}`)
    assert(typeof aggregatePlugins?.[pluginName] === 'function', `${folder} aggregate entry lost ${pluginName}`)
    assert(typeof rendererModule?.[rendererName] === 'function', `${folder} renderer entry lost ${rendererName}`)
    assert(typeof aggregateRenderers?.[rendererName] === 'function', `${folder} aggregate renderer lost ${rendererName}`)

    const renderer = rendererModule[rendererName]('editor', {})
    assert(Array.isArray(renderer.styles), `${folder} renderer styles metadata must be an array`)
    for (const stylesheet of renderer.styles) {
      assert(typeof stylesheet === 'string' && stylesheet.length > 0, `${folder} renderer declared an invalid stylesheet URL`)
      stylePaths.push(stylesheet)
    }
  }

  const sharedMappers = await import('../../shared/mapTextFields.js')
  const mapperEntries = {
    paragraph: 'mapParagraphTextFields',
    heading: 'mapHeadingTextFields',
    list: 'mapListTextFields',
    quote: 'mapQuoteTextFields',
    checklist: 'mapChecklistTextFields',
  }
  for (const [folder, sharedName] of Object.entries(mapperEntries)) {
    const legacy = imported.get(`../../plugins/${folder}/mapTextFields.js`)
    const legacyData = folder === 'list'
      ? { items: ['value'] }
      : folder === 'checklist'
        ? { items: [{ text: 'value', checked: false }] }
        : folder === 'quote'
          ? { text: 'value', caption: 'caption' }
          : { text: 'value' }
    const sharedData = structuredClone(legacyData)
    legacy.mapTextFields(legacyData, value => `[${value}]`)
    sharedMappers[sharedName](sharedData, value => `[${value}]`)
    assert(JSON.stringify(legacyData) === JSON.stringify(sharedData), `${folder} mapTextFields compatibility behavior changed`)
  }

  const sharedPlayer = await import('../../shared/embedPlayer.js')
  const legacyPlayer = imported.get('../../plugins/embed/player.js')
  assert(
    Object.keys(legacyPlayer.SERVICES).join() === Object.keys(sharedPlayer.SERVICES).join(),
    'legacy embed SERVICES contract changed',
  )
  assert(typeof legacyPlayer.buildPlayer === 'function', 'legacy buildPlayer export disappeared')

  for (const path of new Set(stylePaths)) {
    const response = await fetch(new URL(path, import.meta.url))
    assert(response.ok, `Legacy stylesheet path failed: ${path} (${response.status})`)
    assert((await response.text()).length > 0, `Legacy stylesheet is empty: ${path}`)
  }

  return {
    runtimeImportPaths: new Set(runtimePaths).size,
    stylesheetPaths: new Set(stylePaths).size,
    blockPluginEntries: blockEntries.length,
    compatibilityReexports: Object.keys(mapperEntries).length + 2,
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
