import {
  Attaches,
  Checklist,
  Code,
  Columns,
  Delimiter,
  Embed,
  Gallery,
  CarouselBlock,
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
} from '../../plugins/index.js'
import { EditorRenderer } from '../../renderer/index.js'
import { BLOCK_TYPES } from '../../shared/blockTypes.js'

const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+Av7lWQAAAABJRU5ErkJggg=='

const fixtures = {
  paragraph: { text: 'Hello <b>world</b>', align: 'center' },
  heading: { text: 'Stable heading', level: 3, align: 'left' },
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

const pluginConstructors = [
  Paragraph,
  Heading,
  List,
  Quote,
  Code,
  Image,
  Delimiter,
  Table,
  Checklist,
  Warning,
  Embed,
  Raw,
  Gallery,
  CarouselBlock,
  Attaches,
  LinkPreview,
  Toggle,
  Columns,
  Spoiler,
  Poll,
  Person,
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

async function run() {
  const sandbox = document.querySelector('#sandbox')
  const runtimeErrors = []
  window.addEventListener('error', event => runtimeErrors.push(event.error?.stack || event.message))
  window.addEventListener('unhandledrejection', event => runtimeErrors.push(event.reason?.stack || String(event.reason)))

  assert(pluginConstructors.length === BLOCK_TYPES.length, 'plugin constructor count differs from BLOCK_TYPES')
  const savedBlocks = []

  for (const Plugin of pluginConstructors) {
    const plugin = new Plugin()
    const type = plugin.type
    const fixture = fixtures[type]
    assert(fixture, `missing fixture for ${type}`)

    const defaultElement = plugin.render({}, { mutate: (operation) => operation() })
    assert(defaultElement instanceof HTMLElement, `${type}.render({}) must return HTMLElement`)
    sandbox.replaceChildren(defaultElement)
    const defaultSaved = await plugin.save(defaultElement)
    assert(defaultSaved && typeof defaultSaved === 'object', `${type}.save(default) must return data`)
    plugin.destroy?.(defaultElement)
    plugin.destroy?.(defaultElement)
    sandbox.replaceChildren()

    const fixtureBefore = stableJson(fixture)
    const firstElement = plugin.render(structuredClone(fixture), { mutate: (operation) => operation() })
    assert(firstElement instanceof HTMLElement, `${type}.render() must return HTMLElement`)
    sandbox.replaceChildren(firstElement)

    if (type === 'person') {
      const linkInput = firstElement.querySelector('.oe-person__link-url')
      assert(linkInput instanceof HTMLInputElement, 'person link input is missing')
      linkInput.value = 'https://github.com/ada'
      linkInput.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' }))
      linkInput.dispatchEvent(new Event('paste', { bubbles: true }))
      await new Promise(resolve => requestAnimationFrame(() => resolve()))
    }

    const firstSaved = await plugin.save(firstElement)
    assert(plugin.validate(firstSaved), `${type}.validate() rejected its own saved data`)
    if (type === 'person') {
      assert(firstSaved.persons?.[0]?.links?.[0]?.type === 'github', 'person paste did not persist the resolved social-link type')
    }
    assert(stableJson(fixture) === fixtureBefore, `${type}.render()/save() mutated caller data`)

    const secondElement = plugin.render(structuredClone(firstSaved), { mutate: (operation) => operation() })
    sandbox.replaceChildren(secondElement)
    const secondSaved = await plugin.save(secondElement)
    assert(
      stableJson(secondSaved) === stableJson(firstSaved),
      `${type} is not stable across render-save-render-save`,
    )

    plugin.destroy?.(firstElement)
    plugin.destroy?.(firstElement)
    plugin.destroy?.(secondElement)
    plugin.destroy?.(secondElement)
    sandbox.replaceChildren()
    savedBlocks.push({ id: `block-${type}`, type, data: structuredClone(secondSaved) })
  }

  assert(savedBlocks.length === BLOCK_TYPES.length, 'not every block plugin completed the editable round-trip')

  const renderer = new EditorRenderer({ blockTypes: BLOCK_TYPES, throwOnUnknown: true, theme: 'light' })
  const output = { time: 1, version: 'browser-contract', blocks: savedBlocks }
  const container = document.createElement('main')
  sandbox.appendChild(container)

  renderer.renderTo(structuredClone(output), container)
  const wrapper = container.firstElementChild
  assert(wrapper?.children.length === BLOCK_TYPES.length, 'read-only renderer did not render every block')
  assert(!container.querySelector('[contenteditable="true"]'), 'read-only renderer created editable content')
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
  assert(document.querySelectorAll('link[data-oe-style]').length === 0, 'renderer styles leaked after last owner destroy')

  for (let cycle = 0; cycle < 10; cycle++) {
    renderer.renderTo(structuredClone(output), container)
    renderer.destroy(container)
    assert(container.childNodes.length === 0, `renderer destroy leaked DOM at cycle ${cycle}`)
  }

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
