import { createEditor } from '../../core/index.js'
import { Carousel, Embed, Gallery, Image } from '../../plugins/index.js'

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

async function assertBoundary({ name, plugin, type, data, actionSelector, openerText }) {
  const sandbox = document.querySelector('#sandbox')
  const holder = document.createElement('section')
  sandbox.appendChild(holder)

  const editor = createEditor({
    holder,
    plugins: [plugin],
    defaultBlock: type,
    inlineTools: [],
    data: {
      version: 'action-label-security',
      blocks: [{ id: `action-label-${name}`, type, data }],
    },
  })

  try {
    const actions = editor.rootElement.querySelector(actionSelector)
    assert(actions instanceof HTMLElement, `${name} action bar is missing`)

    const opener = [...actions.querySelectorAll('button')]
      .find(button => button.textContent?.includes(openerText))
    assert(opener instanceof HTMLButtonElement, `${name} action source opener is missing`)
    opener.click()

    const custom = [...actions.querySelectorAll('button')]
      .find(button => button.textContent?.includes('Library'))
    assert(custom instanceof HTMLButtonElement, `${name} custom action is missing`)
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

  await assertBoundary({
    name: 'image',
    plugin: new Image({ actions: [configuredAction()] }),
    type: 'image',
    data: { file: { url: pixel }, caption: 'Image' },
    actionSelector: '.oe-image__actions',
    openerText: 'Replace',
  })

  await assertBoundary({
    name: 'gallery',
    plugin: new Gallery({ actions: [configuredAction()] }),
    type: 'gallery',
    data: { images: [{ url: pixel, caption: 'Gallery' }], layout: 'auto' },
    actionSelector: '.oe-gallery__actions',
    openerText: 'Add',
  })

  await assertBoundary({
    name: 'carousel',
    plugin: new Carousel({ actions: [configuredAction()] }),
    type: 'carousel',
    data: {
      slides: [{ id: 'first', type: 'image', src: pixel, alt: 'First' }],
      options: {
        loop: false,
        autoplay: false,
        autoplayDelay: 3000,
        navigation: true,
        pagination: true,
        thumbnails: true,
      },
    },
    actionSelector: '.oe-carousel-block__actions',
    openerText: 'Add',
  })

  await assertBoundary({
    name: 'embed',
    plugin: new Embed({ actions: [configuredAction()], resolvePreview: false }),
    type: 'embed',
    data: {
      service: 'youtube',
      videoId: 'dQw4w9WgXcQ',
      caption: '',
      cover: pixel,
      title: '',
      duration: '',
    },
    actionSelector: '.oe-embed__actions',
    openerText: 'Cover',
  })

  await new Promise(resolve => setTimeout(resolve, 30))
  assert(window.__actionLabelProbe === 0, 'an action label payload executed')
  document.querySelector('#sandbox').replaceChildren()
  return { plugins: ['image', 'gallery', 'carousel', 'embed'], labelMode: 'text', iconMode: 'trusted markup' }
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
