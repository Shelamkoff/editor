import { createEditor } from '../../../core/index.js'
import { createRawPlugin } from '../../../plugins/raw/index.js'
import { createCarouselPlugin } from '../../../plugins/carousel/index.js'
import { EditorRenderer } from '../../../renderer/index.js'
import { waitForEmbeddedDocument } from '../embedded-html-helpers.js'
import { clickNative, dispatchKey } from '../native-input-helpers.js'
import { test, assert, equal, pause, run } from './harness.js'
import { appendFailureDiagnostic } from './failure-diagnostics.js'

const surfaces = [['Raw editor', 'raw', true], ['Raw renderer', 'raw', false],
  ['Carousel editor', 'carousel', true], ['Carousel renderer', 'carousel', false]]
const contentStyles = ['html,body{margin:0}body{display:flow-root;font:20px sans-serif}']

async function mounted(type, editing, html, inspect, styles = contentStyles) {
  const holder = document.createElement('section'); document.querySelector('#fixtures').append(holder)
  const data = { version: '2.0.0', blocks: [{ id: 'content', type, dataVersion: 1,
    data: type === 'raw' ? { html } : { slides: [{ id: 'html', type: 'html', html, caption: '' }],
      options: { loop: false, autoplay: false, autoplayDelay: 3000, navigation: true, pagination: true, thumbnails: false } } }] }
  const before = structuredClone(data)
  let editor, renderer, retired = false
  try {
    if (editing) editor = createEditor({ holder, plugins: [type === 'raw' ? createRawPlugin({ injectStyles: false }) : createCarouselPlugin({ injectStyles: false })],
      injectStyles: false, readOnly: true, contentStyles: styles, data })
    else { renderer = new EditorRenderer({ blockTypes: [type], injectStyles: false, contentStyles: styles }); renderer.renderTo(data, holder) }
    const frame = holder.querySelector('iframe'), childDocument = await waitForEmbeddedDocument(frame)
    await pause(40)
    await inspect(frame, childDocument, () => {
      if (editor) { const saved = editor.save(); equal({ version: saved.version, blocks: saved.blocks }, data) }
      retired = true; editor?.destroy(); renderer?.destroy()
    })
    equal(data, before)
    if (editor && !retired) { const saved = editor.save(); equal({ version: saved.version, blocks: saved.blocks }, data) }
  } finally { editor?.destroy(); renderer?.destroy(); holder.remove(); window.scrollTo(0, 0) }
}

for (const [name, type, editing] of surfaces) test(`${name}: short content retains only its surface's preview affordance`, async () => {
  await mounted(type, editing, '<p id="proof">Short readable content</p>', async (frame, document) => {
    equal(document.querySelector('#proof').getBoundingClientRect().height, 20)
    equal(frame.getBoundingClientRect().height, type === 'raw' && editing ? 100 : 20,
      'Only the Raw editor preview requires an empty minimum-height affordance')
  }, ['html,body{margin:0}body{display:flow-root;font:16px/20px sans-serif}p{margin:0}'])
})

for (const [name, type, editing] of surfaces) test(`${name}: trusted wheel cannot scroll short content into an artificial blank page`, async () => {
  await mounted(type, editing, '<p id="proof">Short readable content</p>', async (frame, document) => {
    frame.scrollIntoView({ block: 'start' }); await pause(40)
    const proof = document.querySelector('#proof'), before = proof.getBoundingClientRect().top
    let trusted = false, pointedAtContent = false
    const wheel = event => { trusted ||= event.isTrusted }
    document.addEventListener('mousemove', event => { pointedAtContent ||= event.isTrusted }, { once: true, passive: true })
    document.addEventListener('wheel', wheel, { passive: true })
    window.addEventListener('wheel', wheel, { passive: true })
    const box = frame.getBoundingClientRect(), x = box.left + 30, y = box.top + Math.min(12, box.height / 2)
    try {
      await window.__testInput('Input.hover', { x, y })
      await window.__testInput('Input.wheel', { x, y, deltaX: 0, deltaY: 250 })
      await pause(120)
      // With a non-scrollable child, Chrome may target its scrolling parent.
      // Independently require a trusted move at the child and a trusted wheel.
      assert(trusted && pointedAtContent, 'Native wheel did not act at the real content frame')
      equal(document.defaultView.scrollY, 0, 'A synthetic root height created a scrollable blank document')
      equal(proof.getBoundingClientRect().top, before, 'Native wheel hid the readable content')
    } finally { document.removeEventListener('wheel', wheel); window.removeEventListener('wheel', wheel) }
  })
})

for (const [name, type, editing] of surfaces) test(`${name}: application-owned body scrolling remains a usable native control`, async () => {
  await mounted(type, editing, '<div id="proof">Deliberately scrollable content</div>', async (frame, document) => {
    frame.scrollIntoView({ block: 'start' }); await pause(40)
    assert(frame.getBoundingClientRect().height <= 101, 'The inner scroll extent created blank outer flow')
    let trusted = false
    document.addEventListener('wheel', event => { trusted = event.isTrusted }, { once: true, passive: true })
    const box = frame.getBoundingClientRect(), x = box.left + 30, y = box.top + 20
    await window.__testInput('Input.hover', { x, y })
    await window.__testInput('Input.wheel', { x, y, deltaX: 0, deltaY: 250 })
    await pause(120)
    assert(trusted && document.body.scrollTop > 0, 'The explicit native body scroller lost its trusted wheel action')
    equal(document.defaultView.scrollY, 0)
  }, ['html,body{margin:0}body{display:flow-root;font:20px sans-serif;height:100px;overflow:auto}#proof{height:400px}'])
})

for (const [name, type, editing] of surfaces) test(`${name}: retirement during a parent activation observer revokes navigation`, async () => {
  const originalUrl = location.href, originalHash = location.hash
  try {
    await mounted(type, editing, '<a id="proof" href="#retired-host-navigation" target="_parent">Retire before navigation</a>', async (frame, child, retire) => {
      let trusted = false, observed = 0
      child.defaultView.addEventListener('click', event => { trusted = event.isTrusted }, { once: true, capture: true })
      const observer = event => {
        if (event.target?.tagName === 'A' && event.target.getAttribute('href')?.endsWith('#retired-host-navigation')) {
          observed++; retire()
        }
      }
      document.addEventListener('click', observer, { passive: true })
      try {
        frame.scrollIntoView({ block: 'start' }); await pause(40)
        const outer = frame.getBoundingClientRect(), inner = child.querySelector('a').getBoundingClientRect()
        await window.__testInput('Input.click', { x: outer.left + inner.left + inner.width / 2, y: outer.top + inner.top + inner.height / 2 })
        await pause(50)
        assert(trusted && observed === 1, `The observer did not retire a real admitted activation: ${JSON.stringify({trusted,observed})}`)
        equal(location.hash, originalHash, 'A retired frame still navigated through its parent-owned anchor')
      } finally { document.removeEventListener('click', observer) }
    })
  } finally { history.replaceState(null, '', originalUrl) }
})

for (const [name, type, editing] of surfaces) test(`${name}: a live trusted link retains its requested parent destination`, async () => {
  const originalUrl = location.href
  try {
    await mounted(type, editing, '<a id="proof" href="#live-host-navigation" target="_parent">Live destination</a>', async (frame, child) => {
      let trusted = false
      child.defaultView.addEventListener('click', event => { trusted = event.isTrusted }, { once: true, capture: true })
      frame.scrollIntoView({ block: 'start' }); await pause(40)
      const outer = frame.getBoundingClientRect(), inner = child.querySelector('a').getBoundingClientRect()
      await window.__testInput('Input.click', { x: outer.left + inner.left + inner.width / 2, y: outer.top + inner.top + inner.height / 2 })
      await pause(50)
      assert(trusted)
      equal(location.hash, '#live-host-navigation', 'The live link was suppressed or forced into a different target')
    })
  } finally { history.replaceState(null, '', originalUrl) }
})

async function clickContent(frame, element) {
  frame.scrollIntoView({ block: 'start' }); await pause(40)
  const outer = frame.getBoundingClientRect(), inner = element.getBoundingClientRect()
  await window.__testInput('Input.click', { x: outer.left + inner.left + inner.width / 2, y: outer.top + inner.top + inner.height / 2 })
}

for (const [name, type, editing] of surfaces) test(`${name}: a real trusted download preserves the application Blob and filename`, async () => {
  const bytes = [0, 65, 255, 10], filename = 'content Ω.bin'
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' }))
  try {
    await mounted(type, editing, `<a href="${url}" download="${filename}">Download authored content</a>`, async (frame, child) => {
      let trusted = false
      child.defaultView.addEventListener('click', event => { trusted = event.isTrusted }, { once: true, capture: true })
      const link = child.querySelector('a')
      equal(link.getAttribute('href'), url)
      await clickContent(frame, link)
      equal(await window.__testInput('Download.take', {}), { name: filename, bytes })
      assert(trusted)
    })
    // A bare native download also proves the caller's URL remains live. Fetch
    // would need a separate connect-src blob: grant under this fixture's CSP.
    const reference = document.createElement('a'); reference.href = url; reference.download = 'caller-owned-control.bin'
    reference.textContent = 'Caller-owned download control'; document.body.append(reference)
    try {
      await clickNative(reference)
      equal(await window.__testInput('Download.take', {}), { name: 'caller-owned-control.bin', bytes })
    } finally { reference.remove() }
  } finally { URL.revokeObjectURL(url) }
})

for (const [name, type, editing] of surfaces) test(`${name}: scriptless content retains actual native video playback and retires it`, async () => {
  const response = await fetch('/tests/browser/carousel-roundtrip-16x16.webm')
  assert(response.ok)
  const url = URL.createObjectURL(await response.blob())
  try {
    await mounted(type, editing, `<video src="${url}" controls muted loop playsinline width="320" height="180"></video>`, async (frame, child, retire) => {
      const video = child.querySelector('video'), deadline = performance.now() + 3000
      while (video.readyState < 2) {
        assert(performance.now() < deadline && !video.error, 'Native video did not decode')
        await pause(10)
      }
      let trusted = false
      child.defaultView.addEventListener('keydown', event => { trusted ||= event.isTrusted && event.code === 'Space' }, { capture: true })
      video.focus()
      await dispatchKey(' ', 'Space', 32)
      await pause(100)
      try {
        assert(trusted && !video.paused && video.played.length > 0, 'Native controls did not start actual playback')
      } catch (error) {
        // Observe only after the original verdict, so diagnostics cannot make a
        // slow or misdirected native activation pass by delaying that verdict.
        try {
          appendFailureDiagnostic(error, 'Playback state after failure: ' + JSON.stringify({
            trusted, paused: video.paused, played: Array.from({ length: video.played.length }, (_, index) =>
              [video.played.start(index), video.played.end(index)]),
            currentTime: video.currentTime, duration: video.duration, readyState: video.readyState,
            networkState: video.networkState, ended: video.ended, seeking: video.seeking,
            mediaError: video.error?.code ?? null, videoConnected: video.isConnected,
            frameConnected: frame.isConnected, sameChildDocument: frame.contentDocument === child,
            childActive: child.activeElement?.tagName ?? null, parentActive: document.activeElement?.tagName ?? null,
            childHasFocus: child.hasFocus(), parentHasFocus: document.hasFocus(),
            childVisibility: child.visibilityState, parentVisibility: document.visibilityState,
            frameRect: frame.getBoundingClientRect().toJSON(), videoRect: video.getBoundingClientRect().toJSON(),
          }))
        } catch (diagnosticError) {
          appendFailureDiagnostic(error, 'Playback state collection failed: ' + String(diagnosticError))
        }
        throw error
      }
      retire(); await pause(50)
      assert(video.paused, 'Retired child content kept playing its native media')
    })
    const reference = document.createElement('video'); reference.src = url; reference.preload = 'auto'; document.body.append(reference)
    try {
      const deadline = performance.now() + 3000
      while (reference.readyState < 2) {
        assert(performance.now() < deadline && !reference.error, 'Disposal revoked caller-owned video bytes')
        await pause(10)
      }
    } finally { reference.remove() }
  } finally { URL.revokeObjectURL(url) }
})

await run()
