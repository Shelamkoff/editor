import { EditorRenderer } from '../../renderer/index.js'

const pixel = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='
const documentData = suffix => ({
  version: '2.0.0',
  blocks: [{ id: 'gallery', type: 'gallery', dataVersion: 2, data: {
    images: ['one', 'two', 'three'].map(id => ({ id, url: pixel, caption: `${id}${suffix}` })),
    layout: 'auto', styles: {}, options: {},
  } }],
})

/** Exercise actual DOM output while delivering image notifications at a controlled lifetime boundary. */
export async function runGalleryRendererLifetimeTests(sandbox) {
  const results = []
  const check = (name, actual, expected) => {
    const pass = JSON.stringify(actual) === JSON.stringify(expected)
    results.push({ name, status: pass ? 'PASS' : 'FAIL',
      ...(!pass ? { actual, expected, error: JSON.stringify({ actual, expected }) } : {}) })
  }
  const observe = root => {
    let reads = 0
    const images = [...root.querySelectorAll('img')]
    for (const image of images) {
      Object.defineProperty(image, 'naturalWidth', { configurable: true, get() { reads++; return 1 } })
      Object.defineProperty(image, 'naturalHeight', { configurable: true, get() { reads++; return 1 } })
    }
    return {
      notify() {
        images.forEach((image, index) => image.dispatchEvent(new Event(index === 1 ? 'error' : 'load')))
      },
      get reads() { return reads },
      dispose() {
        for (const image of images) {
          delete image.naturalWidth
          delete image.naturalHeight
        }
      },
    }
  }

  for (const method of ['renderBlock', 'render', 'renderTo']) {
    const renderer = new EditorRenderer({ blockTypes: ['gallery'], injectStyles: false })
    const host = document.createElement('section')
    sandbox.append(host)
    let output, observation
    try {
      if (method === 'renderBlock') output = renderer.renderBlock(documentData('').blocks[0])
      else if (method === 'render') output = renderer.render(documentData(''))
      else { renderer.renderTo(documentData(''), host); output = host }
      if (output !== host) host.append(output)
      const root = output.matches('.editor-gallery') ? output : output.querySelector('.editor-gallery')
      observation = observe(root)
      const before = root.className
      renderer.destroy(output)
      observation.notify()
      await Promise.resolve()
      check(`${method}: retired Gallery image callbacks do not read geometry`, observation.reads, 0)
      check(`${method}: retired Gallery image callbacks do not replace layout`, root.className, before)
    } finally {
      observation?.dispose()
      renderer.destroy()
      host.remove()
    }
  }

  const cachedImage = document.createElement('img')
  cachedImage.src = pixel
  await cachedImage.decode()
  const cachedRenderer = new EditorRenderer({ blockTypes: ['gallery'], injectStyles: false })
  const cachedHost = document.createElement('section')
  sandbox.append(cachedHost)
  let cached
  try {
    cachedRenderer.renderTo(documentData(' cached'), cachedHost)
    const root = cachedHost.querySelector('.editor-gallery')
    check('Gallery cached-image control starts with complete real images',
      [...root.querySelectorAll('img')].every(image => image.complete), true)
    cached = observe(root)
    const before = root.className
    cachedRenderer.destroy(cachedHost)
    await Promise.resolve()
    check('Gallery cached-image microtasks do not read after disposal', cached.reads, 0)
    check('Gallery cached-image microtasks do not replace retired layout', root.className, before)
  } finally {
    cached?.dispose()
    cachedRenderer.destroy()
    cachedHost.remove()
  }

  const renderer = new EditorRenderer({ blockTypes: ['gallery'], injectStyles: false })
  const host = document.createElement('section')
  sandbox.append(host)
  let retired, current
  try {
    renderer.renderTo(documentData(''), host)
    const retiredRoot = host.querySelector('.editor-gallery')
    retired = observe(retiredRoot)
    const before = retiredRoot.className
    renderer.renderTo(documentData(' updated'), host)
    const currentRoot = host.querySelector('.editor-gallery')
    current = observe(currentRoot)
    retired.notify()
    check('renderTo replacement: retired Gallery has no image geometry reads', retired.reads, 0)
    check('renderTo replacement: retired Gallery keeps its final layout', retiredRoot.className, before)
    current.notify()
    check('renderTo replacement: current Gallery still refines the loaded layout', currentRoot.classList.contains('eg--3c'), true)
    const readsAfterSettlement = current.reads
    check('renderTo replacement: current Gallery actually measures live images', readsAfterSettlement > 0, true)
    current.notify()
    check('renderTo replacement: load/error duplicates cannot settle images twice', current.reads, readsAfterSettlement)
  } finally {
    retired?.dispose()
    current?.dispose()
    renderer.destroy()
    host.remove()
  }
  return results
}
