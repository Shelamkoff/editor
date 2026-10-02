import { createEditor } from '../../core/index.js'
import {
  createCarouselPlugin,
  createEmbedPlugin,
  createGalleryPlugin,
  createImagePlugin,
} from '../../plugins/index.js'

const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+Av7lWQAAAABJRU5ErkJggg=='
const maliciousLabel = '<img src="x" onerror="window.__actionLabelProbe++">Library'
const trustedIcon = '<svg data-trusted-action-icon="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" aria-hidden="true"><path d="M0 0h1v1H0z"/></svg>'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function configuredAction() {
  return {
    icon: trustedIcon,
    label: maliciousLabel,
    async handler() { return null },
  }
}

async function assertBoundary({ name, definition, data, actionSelector }) {
  const sandbox = document.querySelector('#sandbox')
  const holder = document.createElement('section')
  sandbox.appendChild(holder)

  const editor = createEditor({
    holder,
    plugins: [definition],
    defaultBlock: definition.type,
    injectStyles: false,
    data: {
      version: '2.0.0',
      blocks: [{ id: `action-label-${name}`, type: definition.type, data }],
    },
  })

  try {
    const actions = holder.querySelector(actionSelector)
    assert(actions instanceof HTMLElement, `${name} action bar is missing`)
    const custom = [...actions.querySelectorAll('button')]
      .find(button => button.textContent?.includes('Library'))
    assert(custom instanceof HTMLButtonElement, `${name} custom action is missing in filled state`)
    assert(custom.textContent?.includes(maliciousLabel), `${name} action label was not preserved as literal text`)
    assert(custom.querySelector('[data-trusted-action-icon="true"]') instanceof SVGElement, `${name} trusted action icon was not rendered as markup`)
    assert(!custom.querySelector('img, script, iframe, object, embed'), `${name} action label created an active element`)
    assert(
      ![...custom.querySelectorAll('*')].some(element => [...element.attributes].some(attribute => attribute.name.startsWith('on'))),
      `${name} action label created an event handler`,
    )
  } finally {
    editor.destroy()
    holder.remove()
  }
}

async function run() {
  window.__actionLabelProbe = 0

  const image = createImagePlugin({ injectStyles: false, actions: [configuredAction()] })
  await assertBoundary({
    name: 'image',
    definition: image,
    data: { ...image.schema.createDefault(), file: { url: pixel }, caption: 'Image' },
    actionSelector: '.oe-image__actions',
  })

  const gallery = createGalleryPlugin({ injectStyles: false, actions: [configuredAction()] })
  await assertBoundary({
    name: 'gallery',
    definition: gallery,
    data: {
      ...gallery.schema.createDefault(),
      images: [{ id: 'gallery-image', url: pixel, caption: 'Gallery' }],
    },
    actionSelector: '.oe-gallery__actions',
  })

  const carousel = createCarouselPlugin({ injectStyles: false, actions: [configuredAction()] })
  await assertBoundary({
    name: 'carousel',
    definition: carousel,
    data: {
      ...carousel.schema.createDefault(),
      slides: [{ id: 'first', type: 'image', src: pixel, alt: 'First', caption: '' }],
    },
    actionSelector: '.oe-carousel-block__actions',
  })

  const embed = createEmbedPlugin({ injectStyles: false, actions: [configuredAction()], resolvePreview: false })
  await assertBoundary({
    name: 'embed',
    definition: embed,
    data: {
      service: 'youtube',
      videoId: 'dQw4w9WgXcQ',
      caption: '',
      cover: pixel,
      title: '',
      duration: '',
    },
    actionSelector: '.oe-embed__actions',
  })

  await new Promise(resolve => setTimeout(resolve, 30))
  assert(window.__actionLabelProbe === 0, 'an action label payload executed')
  document.querySelector('#sandbox').replaceChildren()
  return { plugins: ['image', 'gallery', 'carousel', 'embed'], labelMode: 'text', iconMode: 'trusted markup', filledState: true }
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
