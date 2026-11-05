import { EditorRenderer } from '../../../renderer/index.js'
import { test, assert, equal, pause } from './harness.js'

const pixel = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
if (document.querySelector('meta[http-equiv="Content-Security-Policy"]')) test('Gallery viewer preserves enforcing Trusted Types without a default policy', () => {
  let denied = false
  try { document.createElement('div').innerHTML = '<b>untrusted</b>' }
  catch (error) { denied = error instanceof TypeError }
  assert(denied)
  equal(window.trustedTypes.defaultPolicy, null)
})
test('Gallery fullscreen environment permits a bare trusted fullscreen action', async () => {
  const surface = document.createElement('div'), button = document.createElement('button')
  button.textContent = 'Bare fullscreen control'; surface.append(button); document.body.append(surface)
  let failure = null
  let activation
  button.addEventListener('click', () => {
    activation = { active: navigator.userActivation.isActive, visible: document.visibilityState, enabled: document.fullscreenEnabled, focused: document.hasFocus() }
    void surface.requestFullscreen().catch(error => { failure = String(error) })
  })
  try {
    await click(button)
    await until(() => document.fullscreenElement === surface || failure, 'Bare fullscreen action did not settle: ' + JSON.stringify(activation))
    equal(failure, null, 'The independent browser fullscreen control was denied')
    equal(document.fullscreenElement, surface)
    await document.exitFullscreen()
  } finally { if (document.fullscreenElement === surface) await document.exitFullscreen(); surface.remove() }
})
async function until(read, message) {
  const deadline = Date.now() + 5000
  while (!read()) { if (Date.now() > deadline) throw new Error(message); await pause(20) }
}
async function click(element, frame) {
  assert(element, 'Expected a declared Gallery control')
  element.scrollIntoView({ block: 'nearest' })
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  const box = element.getBoundingClientRect(), offset = frame?.getBoundingClientRect() ?? { left: 0, top: 0 }
  let delivered = false
  const capture = event => { delivered = event.isTrusted && element.contains(event.target) }
  element.ownerDocument.addEventListener('mousedown', capture, { once: true, capture: true })
  try { await window.__testInput('Input.click', { x: offset.left + box.left + box.width / 2, y: offset.top + box.top + box.height / 2 }) }
  finally { element.ownerDocument.removeEventListener('mousedown', capture, true) }
  assert(delivered, 'Gallery action must receive trusted pointer input')
  await pause(80)
}
async function fixture(foreign, options) {
  let frame
  if (foreign) {
    frame = document.createElement('iframe'); frame.allowFullscreen = true
    frame.style.cssText = 'display:block;border:0;width:800px;height:650px'
    document.body.append(frame)
  }
  const owner = frame?.contentDocument ?? document, host = owner.createElement('section')
  owner.body.append(host)
  const input = { version: '2.0.0', blocks: [{ id: 'gallery', type: 'gallery', dataVersion: 2,
    data: { images: [0, 1, 2].map(index => ({ id: `picture-${index}`, url: pixel, caption: `Picture ${index}` })),
      layout: '1', styles: {}, options } }] }
  const original = structuredClone(input), renderer = new EditorRenderer({ blockTypes: ['gallery'] })
  renderer.renderTo(input, host)
  const deadline = Date.now() + 5000
  while ([...owner.querySelectorAll('link[rel="stylesheet"]')].some(link => !link.sheet)) {
    if (Date.now() > deadline) throw new Error('Gallery stylesheet did not load')
    await pause(20)
  }
  await click(host.querySelector('.editor-gallery__item'), frame)
  await until(() => owner.querySelector('.expose, .editor-gallery__lightbox'), 'Gallery viewer did not open')
  await until(() => ![...owner.querySelectorAll('.expose, .expose__slide')].some(element => element.style.transition),
    'Gallery opening transition did not settle')
  const viewer = owner.querySelector('.expose, .editor-gallery__lightbox')
  const native = viewer.matches('dialog')
  const control = name => viewer.querySelector(`[data-name="${name}"], [data-gallery-control="${name}"]`)
  const image = () => native ? viewer.querySelector('.editor-gallery__lightbox-image')
    : [...viewer.querySelectorAll('.expose__slide')].find(slide => slide.style.display !== 'none')?.querySelector('img')
  const caption = () => viewer.querySelector('.expose__caption, .editor-gallery__lightbox-caption')
  const move = direction => viewer.querySelector(native ? `.editor-gallery__lightbox-${direction}` : `.expose__nav--${direction}`)
  return { owner, frame, viewer, native, control, image, caption, move, input, original,
    click: element => click(element, frame),
    async dispose() {
      renderer.destroy()
      if (owner.fullscreenElement) await owner.exitFullscreen()
      host.remove(); frame?.remove()
    },
  }
}

for (const foreign of [false, true]) {
  test(`Gallery viewer disabled options are honored in ${foreign ? 'foreign' : 'main'} document`, async () => {
    const h = await fixture(foreign, { loop: false, zoom: false, navigation: false, captions: false, fullscreen: false, thumbnails: false })
    try {
      equal(h.image().alt, 'Picture 0')
      for (const direction of ['prev', 'next']) assert(!h.move(direction)?.checkVisibility(), 'Disabled navigation remains visible')
      assert(!h.caption()?.checkVisibility(), 'Disabled captions remain visible')
      for (const name of ['zoom-in', 'zoom-out', 'fullscreen', 'autoplay']) assert(!h.control(name), 'Disabled option retained its control: ' + name)
      equal(h.viewer.querySelectorAll('.expose__thumb, .editor-gallery__lightbox-thumb').length, 0)
      equal(h.input, h.original)
    } finally { await h.dispose() }
  })

  test(`Gallery viewer nonloop navigation and declared controls work in ${foreign ? 'foreign' : 'main'} document`, async () => {
    const h = await fixture(foreign, { loop: false, zoom: true, navigation: true, captions: true, fullscreen: true, thumbnails: true })
    try {
      equal(h.image().alt, 'Picture 0')
      assert(!h.move('prev')?.checkVisibility() || h.move('prev').disabled, 'Nonloop viewer must stop at its first image')
      const thumbs = [...h.viewer.querySelectorAll('.expose__thumb, .editor-gallery__lightbox-thumb')]
      equal(thumbs.length, 3)
      await h.click(thumbs[1]); await until(() => h.image()?.alt === 'Picture 1', 'Thumbnail did not choose its image')
      await until(() => ![...h.viewer.querySelectorAll('.expose__slide')].some(slide => slide.style.transition), 'Viewer transition did not settle')
      equal(h.caption().textContent, 'Picture 1')
      const before = h.image().getBoundingClientRect().width
      await h.click(h.control('zoom-in'))
      await until(() => h.image().getBoundingClientRect().width > before, 'Zoom did not change the actual image geometry')
      await h.click(h.control('zoom-out'))
      await h.click(h.control('fullscreen'))
      await until(() => h.owner.fullscreenElement && h.viewer.contains(h.owner.fullscreenElement), 'Trusted fullscreen did not enter its owning document')
      await h.click(h.control('fullscreen'))
      await until(() => !h.owner.fullscreenElement, 'Fullscreen did not exit')
      const transform = () => new h.owner.defaultView.DOMMatrixReadOnly(h.owner.defaultView.getComputedStyle(
        h.native ? h.image() : h.image().closest('.expose__slide').querySelector('.expose__slide-transform'),
      ).transform)
      await h.click(h.control('rotate-cw'))
      await until(() => Math.abs(transform().a) < .001 && Math.abs(transform().b - 1) < .001, 'Rotation did not change actual image orientation')
      await h.click(h.control('flip-h'))
      await until(() => transform().a * transform().d - transform().b * transform().c < -.99, 'Horizontal flip did not reflect the image')
      await h.click(h.control('rotate-ccw'))
      await h.click(h.control('flip-v'))
      await h.click(h.control('download'))
      const download = await window.__testInput('Download.take')
      equal(download.bytes, [...Uint8Array.from(atob(pixel.split(',')[1]), char => char.charCodeAt(0))], 'Native viewer download lost image bytes')
      assert(typeof download.name === 'string' && download.name.length > 0)
      await h.click(h.move('next')); await until(() => h.image()?.alt === 'Picture 2', 'Next did not reach the last image')
      assert(!h.move('next')?.checkVisibility() || h.move('next').disabled, 'Nonloop viewer must stop at its last image')
      equal(h.input, h.original)
      const retained = h.move('prev'), viewer = h.viewer
      await h.dispose()
      retained.click()
      assert(!viewer.isConnected, 'Disposed viewer was revived')
    } finally { await h.dispose() }
  })

  test(`Gallery viewer autoplay and cleanup work in ${foreign ? 'foreign' : 'main'} document`, async () => {
    const h = await fixture(foreign, { loop: true, zoom: false, navigation: true, captions: true, fullscreen: false,
      thumbnails: false, autoplayInterval: 700 })
    try {
      await until(() => h.image()?.alt !== 'Picture 0', 'Configured autoplay did not advance')
      await h.click(h.control('autoplay'))
      const paused = h.image().alt
      await pause(1000)
      equal(h.image().alt, paused, 'Paused autoplay kept advancing')
      let previous = paused
      const successor = { 'Picture 0': 'Picture 1', 'Picture 1': 'Picture 2', 'Picture 2': 'Picture 0' }
      for (let step = 0; step < 3; step++) {
        await until(() => ![...h.viewer.querySelectorAll('.expose__slide')].some(slide => slide.style.transition), 'Loop transition did not settle')
        await h.click(h.move('next'))
        await until(() => h.image()?.alt === successor[previous], 'Loop navigation lost its declared image order')
        previous = successor[previous]
      }
      equal(h.image().alt, paused, 'A full loop did not return to its original image')
      equal(h.input, h.original)
      const viewer = h.viewer
      await h.dispose(); await pause(800)
      assert(!viewer.isConnected, 'Autoplay retained its disposed viewer')
    } finally { await h.dispose() }
  })
}
