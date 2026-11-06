const blockEntries = [
  ['paragraph', 'createParagraphPlugin', 'Paragraph', 'createParagraphRenderer'],
  ['heading', 'createHeadingPlugin', 'Heading', 'createHeaderRenderer'],
  ['list', 'createListPlugin', 'List', 'createListRenderer'],
  ['quote', 'createQuotePlugin', 'Quote', 'createQuoteRenderer'],
  ['code', 'createCodePlugin', 'Code', 'createCodeRenderer'],
  ['image', 'createImagePlugin', 'Image', 'createImageRenderer'],
  ['delimiter', 'createDelimiterPlugin', 'Delimiter', 'createDelimiterRenderer'],
  ['table', 'createTablePlugin', 'Table', 'createTableRenderer'],
  ['checklist', 'createChecklistPlugin', 'Checklist', 'createChecklistRenderer'],
  ['warning', 'createWarningPlugin', 'Warning', 'createWarningRenderer'],
  ['embed', 'createEmbedPlugin', 'Embed', 'createEmbedRenderer'],
  ['raw', 'createRawPlugin', 'Raw', 'createRawRenderer'],
  ['gallery', 'createGalleryPlugin', 'Gallery', 'createGalleryRenderer'],
  ['carousel', 'createCarouselPlugin', 'CarouselBlock', 'createCarouselRenderer'],
  ['attaches', 'createAttachesPlugin', 'Attaches', 'createAttachesRenderer'],
  ['link-preview', 'createLinkPreviewPlugin', 'LinkPreview', 'createLinkPreviewRenderer'],
  ['toggle', 'createTogglePlugin', 'Toggle', 'createToggleRenderer'],
  ['columns', 'createColumnsPlugin', 'Columns', 'createColumnsRenderer'],
  ['spoiler', 'createSpoilerPlugin', 'Spoiler', 'createSpoilerRenderer'],
  ['poll', 'createPollPlugin', 'Poll', 'createPollRenderer'],
  ['person', 'createPersonPlugin', 'Person', 'createPersonRenderer'],
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
  '../../plugin-kit/index.js',
  '../../plugins/index.js',
  '../../plugins/async.js',
  '../../renderer/index.js',
  '../../renderer/renderers/async.js',
  '../../renderer/inline.js',
  '../../renderer/errors.js',
  '../../renderer/renderers/index.js',
  '../../renderer/renderers/async.js',
  '../../inline-plugins/color.js',
  '../../inline-plugins/mention/index.js',
  '../../plugins/embed/player.js',
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

async function verifyGettingStartedGuide(path) {
  const response = await fetch(new URL(path, import.meta.url))
  assert(response.ok, `Getting-started guide is missing: ${path}`)
  const markdown = await response.text()
  const examples = [...markdown.matchAll(/```(?:js|javascript)\s*\r?\n([\s\S]*?)```/g)].map(match => match[1])
  assert(examples.length === 4, `${path}: expected the complete create/save/render/destroy walkthrough`)
  const entries = new Map([
    ['@shelamkoff/rector', '../../index.js'],
    ['@shelamkoff/rector/plugins/paragraph', '../../plugins/paragraph/index.js'],
    ['@shelamkoff/rector/plugins/heading', '../../plugins/heading/index.js'],
  ])
  const imports = []
  const creation = examples[0].replace(/^import\s+[^\n]+$/gm, statement => {
    imports.push(statement.replace(/(['"])(@shelamkoff\/rector[^'"]*)\1/, (_match, _quote, specifier) => {
      assert(entries.has(specifier), `${path}: unexpected public entry ${specifier}`)
      return JSON.stringify(new URL(entries.get(specifier), import.meta.url).href)
    }))
    return ''
  })
  const holder = document.createElement('div')
  holder.id = 'editor'
  document.body.append(holder)
  // Execute repository-owned published snippets unchanged except for resolving
  // their public imports to the same source entries used by this browser gate.
  const moduleUrl = URL.createObjectURL(new Blob([`
    ${imports.join('\n')}
    let guideEditor
    const observation = {}
    try {
      ${creation}
      guideEditor = editor
      observation.initial = editor.save()
      observation.heading = holder.querySelector('h2')?.textContent
      ${examples[1]}
      observation.saved = { documentData, json }
      ${examples[2]}
      observation.loaded = editor.save()
      observation.text = holder.querySelector('[contenteditable="true"]')?.textContent
      ${examples[3]}
      observation.destroyed = !editor.isReady && !holder.querySelector('.oe-editor')
    } finally {
      guideEditor?.destroy()
    }
    export default observation
  `], { type: 'text/javascript' }))
  try {
    const { default: result } = await import(/* @vite-ignore */ moduleUrl)
    assert(result.initial.version === '2.0.0', `${path}: creation did not produce a current document`)
    assert(JSON.stringify(result.initial.blocks.map(block => block.type)) === '["heading","paragraph"]', `${path}: initial blocks were not created`)
    assert(result.heading === result.initial.blocks[0].data.text, `${path}: initial Heading was not projected`)
    assert(JSON.stringify(result.saved.documentData.blocks) === JSON.stringify(result.initial.blocks), `${path}: saving changed the documented content`)
    assert(JSON.stringify(JSON.parse(result.saved.json)) === JSON.stringify(result.saved.documentData), `${path}: saved JSON does not round-trip`)
    assert(result.loaded.blocks.length === 1 && result.loaded.blocks[0].id === 'loaded'
      && result.loaded.blocks[0].type === 'paragraph', `${path}: render did not replace the initial document`)
    assert(result.text === result.loaded.blocks[0].data.text, `${path}: loaded Paragraph was not projected`)
    assert(result.destroyed, `${path}: cleanup left a live editor`)
  } catch (error) {
    throw new Error(`${path}: published getting-started walkthrough failed: ${error?.message ?? String(error)}`, { cause: error })
  } finally {
    URL.revokeObjectURL(moduleUrl)
    holder.remove()
  }
}

async function run() {
  const imported = new Map()
  for (const path of new Set(runtimePaths)) {
    try {
      imported.set(path, await import(/* @vite-ignore */ path))
    } catch (error) {
      throw new Error(`Runtime import failed: ${path}`, { cause: error })
    }
  }

  const aggregatePlugins = imported.get('../../plugins/index.js')
  const aggregateRenderers = imported.get('../../renderer/renderers/index.js')
  const stylePaths = [...staticStylePaths]
  for (const [folder, factoryName, removedClassName, rendererName] of blockEntries) {
    const pluginModule = imported.get(`../../plugins/${folder}/index.js`)
    const rendererModule = imported.get(`../../renderer/renderers/${folder}/index.js`)
    assert(typeof pluginModule?.[factoryName] === 'function', `${folder} entry lost ${factoryName}`)
    assert(typeof aggregatePlugins?.[factoryName] === 'function', `${folder} aggregate entry lost ${factoryName}`)
    assert(!Object.hasOwn(pluginModule, removedClassName), `${folder} still exposes removed class API ${removedClassName}`)
    assert(!Object.hasOwn(aggregatePlugins, removedClassName), `aggregate plugins still expose removed class API ${removedClassName}`)
    const definition = pluginModule[factoryName]({ injectStyles: false })
    assert(definition?.type === folder.replace('link-preview','linkPreview') || definition?.type === folder, `${factoryName} returned the wrong definition type`)
    assert(typeof definition.setup === 'function' && definition.schema, `${factoryName} did not return a v2 definition`)
    assert(
      Number.isSafeInteger(definition.schema.currentVersion) && definition.schema.currentVersion >= 1,
      `${factoryName} exposed an invalid currentVersion`,
    )
    const defaultData = definition.schema.createDefault()
    const encodedDefault = definition.schema.encode(defaultData)
    assert(
      encodedDefault?.dataVersion === definition.schema.currentVersion,
      `${factoryName} default encode did not emit currentVersion`,
    )
    const decodedDefault = definition.schema.decode(encodedDefault)
    assert(
      decodedDefault?.dataVersion === definition.schema.currentVersion,
      `${factoryName} default decode did not preserve currentVersion`,
    )
    assert(
      JSON.stringify(decodedDefault.data) === JSON.stringify(encodedDefault.data),
      `${factoryName} default encode/decode roundtrip is not canonical`,
    )
    assert(typeof rendererModule?.[rendererName] === 'function', `${folder} renderer entry lost ${rendererName}`)
    assert(typeof aggregateRenderers?.[rendererName] === 'function', `${folder} aggregate renderer lost ${rendererName}`)

    const renderer = rendererModule[rendererName]('editor', {})
    assert(renderer?.schema && typeof renderer.schema.decode === 'function',
      `${folder} renderer did not expose its canonical block schema`)
    assert(renderer.schema === definition.schema,
      `${folder} editor and renderer do not share the same schema object`)
    assert(Array.isArray(renderer.styles), `${folder} renderer styles metadata must be an array`)
    for (const stylesheet of renderer.styles) {
      assert(typeof stylesheet === 'string' && stylesheet.length > 0, `${folder} renderer declared an invalid stylesheet URL`)
      stylePaths.push(stylesheet)
    }
  }

  const pluginKit = imported.get('../../plugin-kit/index.js')
  for (const removed of ['BlockPluginAbstract', 'BlockPlugin', 'InlinePlugin']) {
    assert(!Object.hasOwn(pluginKit, removed), `plugin-kit still exposes removed v1 contract ${removed}`)
  }

  const currentPlayer = imported.get('../../plugins/embed/player.js')
  assert(typeof currentPlayer.buildPlayer === 'function', 'current embed player export disappeared')

  for (const path of new Set(stylePaths)) {
    const response = await fetch(new URL(path, import.meta.url))
    assert(response.ok, `Stylesheet path failed: ${path} (${response.status})`)
    assert((await response.text()).length > 0, `Stylesheet is empty: ${path}`)
  }

  for (const language of ['', 'ru/']) {
    await verifyGettingStartedGuide(`../../docs/${language}guide/getting-started.md`)
  }

  return {
    runtimeImportPaths: new Set(runtimePaths).size,
    stylesheetPaths: new Set(stylePaths).size,
    blockFactoryEntries: blockEntries.length,
    removedClassApisChecked: blockEntries.length,
    dualApi: false,
    gettingStartedGuides: ['en', 'ru'],
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
