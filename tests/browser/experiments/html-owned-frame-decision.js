import { mountHtmlExperiment } from './html-owned-frame.js'
import { test, assert, equal, pause, run } from '../regressions/harness.js'
import { clickNative } from '../native-input-helpers.js'

const styles = 'html,body{margin:0;padding:0}body{display:flow-root;font:20px sans-serif;color:rgb(18,28,38)}.article-accent{font-size:1.5em;color:rgb(12,84,156)}'
async function mounted(html, check, css = styles) {
  const holder = document.createElement('section'); holder.className = 'probe-holder'; document.body.append(holder)
  const before = html, experiment = mountHtmlExperiment(holder, html, [css])
  try {
    assert(await experiment.ready, 'Frame did not acquire its initial document')
    await pause(30)
    await check(experiment, holder)
    equal(html, before, 'Projection rewrote canonical author source')
  } finally { experiment.dispose(); holder.remove() }
}
async function insideClick(experiment, selector) {
  const element = experiment.document.querySelector(selector)
  element.scrollIntoView({ block: 'nearest' })
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  const outer = experiment.frame.getBoundingClientRect(), inner = element.getBoundingClientRect()
  let trusted = false
  element.addEventListener('click', event => { trusted = event.isTrusted }, { once: true })
  await window.__testInput('Input.click', { x: outer.left + inner.left + inner.width / 2, y: outer.top + inner.top + inner.height / 2 })
  assert(trusted, 'Frame action was not a trusted Chrome click')
  await pause(30)
}

test('explicit content CSS retains theme, long flow and tail focus under Trusted Types', async () => {
  await mounted('<p class="article-accent">Themed article</p><div style="height:900px">Long body</div><a id="tail" href="#start">Tail</a>', async probe => {
    const theme = probe.document.querySelector('.article-accent')
    equal(probe.document.defaultView.getComputedStyle(theme).color, 'rgb(12, 84, 156)')
    equal(probe.document.defaultView.getComputedStyle(theme).fontSize, '30px')
    assert(probe.frame.getBoundingClientRect().height > 950, 'Long content lost natural flow')
    const tail = probe.document.querySelector('#tail'); tail.focus()
    assert(probe.document.activeElement === tail, 'Tail is not keyboard reachable')
    equal(probe.frame.getAttribute('sandbox'), 'allow-same-origin')
    equal(probe.document.querySelectorAll('script').length, 0)
  })
})

test('content follows its host width and retains trusted native checkbox input', async () => {
  await mounted('<p class="article-accent">Responsive article with deliberately wrapping words.</p><input id="check" type="checkbox"><div id="fluid" style="width:100%">Fluid content</div>', async (probe, holder) => {
    holder.style.width = '420px'
    await pause(60)
    equal(probe.frame.getBoundingClientRect().width, 420)
    assert(probe.document.querySelector('#fluid').getBoundingClientRect().width <= 420)
    await insideClick(probe, '#check')
    equal(probe.document.querySelector('#check').checked, true)
  })
})

test('parent-window vh and vw do not feed back as natural frame height changes', async () => {
  await mounted('<div id="size" style="height:calc(100vh + 20px);width:25vw">Viewport content</div>', async probe => {
    const box = probe.document.querySelector('#size')
    equal(box.getBoundingClientRect().height, innerHeight + 20)
    equal(box.getBoundingClientRect().width, innerWidth / 4)
    const count = probe.measurements.length
    await pause(180)
    equal(probe.measurements.length, count, 'Resize feedback did not settle')
    await window.__testInput('Viewport.set', { width: 900, height: 600 })
    await pause(60)
    equal(box.getBoundingClientRect().height, 620)
    equal(box.getBoundingClientRect().width, 225)
    await window.__testInput('Viewport.reset', {})
    await pause(60)
  })
})

test('percentage root height retains page-viewport meaning without a resize feedback loop', async () => {
  await mounted('<div id="percentage" style="height:calc(100% + 20px)">Percentage body</div>', async probe => {
    equal(probe.document.querySelector('#percentage').getBoundingClientRect().height, innerHeight + 20)
    const count = probe.measurements.length
    await pause(180)
    equal(probe.measurements.length, count, 'Root percentage feedback did not settle')
  }, styles + 'html,body{height:100%}')
})

test('nested application media rules use page viewport and imported typography retains meaning', async () => {
  const sizes = ['16px', '16.5px', '1.5em', '150%', '1.5rem', 'calc(10px + 1em)', '201px', '250px', 'inherit']
  await mounted('<span id="conditional">Responsive theme</span>' + sizes.map((size, index) =>
    `<span id="font-${index}" style="font-size:${size}">j</span>`).join(''), async probe => {
    const view = probe.document.defaultView
    equal(view.getComputedStyle(probe.document.querySelector('#conditional')).color, 'rgb(12, 84, 156)')
    const expected = ['16px', '16.5px', '30px', '30px', '24px', '30px', '201px', '250px', '20px']
    equal(sizes.map((_, index) => view.getComputedStyle(probe.document.querySelector('#font-' + index)).fontSize), expected)
  }, styles + 'html{font-size:16px}@supports(display:grid){@media(min-height:700px){#conditional{color:rgb(12,84,156)}}}')
})

test('moving the accepted frame revokes delegation without removing foreign DOM', async () => {
  await mounted('<a id="stale" href="/must-not-navigate" target="_top">Stale link</a>', async (probe, holder) => {
    const stale = probe.document.querySelector('#stale'), foreign = document.createElement('aside')
    document.body.append(foreign)
    try {
      foreign.append(probe.frame)
      assert(!probe.live, 'A moved frame retained the original creating owner')
      stale.click(); await pause()
      equal(probe.commands, [])
      probe.dispose()
      assert(probe.frame.parentNode === foreign, 'Disposal removed foreign-owned connected DOM')
    } finally { foreign.remove() }
  })
})

test('replacing the accepted child document revokes delegated authority', async () => {
  await mounted('<a href="/must-not-navigate" target="_top">Original link</a>', async probe => {
    const original = probe.document
    probe.frame.src = 'about:blank'; probe.frame.removeAttribute('srcdoc')
    await pause(100)
    assert(!probe.live, 'A replacement document acquired original navigation authority')
    assert(probe.frame.contentDocument !== original)
    equal(probe.commands, [])
  })
})

test('trusted local fragment keeps its owned document and reaches the target', async () => {
  await mounted('<a id="jump" href="#destination">Jump</a><div style="height:900px">Body</div><h2 id="destination">Destination</h2>', async probe => {
    const original = probe.document
    await insideClick(probe, '#jump')
    assert(probe.document === original && probe.frame.contentDocument === original)
    equal(original.defaultView.location.hash, '#destination')
    equal(probe.commands, [{ kind: 'fragment', id: 'destination' }])
  })
})

test('a permitted missing local fragment still updates native fragment state', async () => {
  await mounted('<a id="jump" href="#missing">Missing local target</a>', async probe => {
    const original = probe.document
    await insideClick(probe, '#jump')
    assert(probe.frame.contentDocument === original)
    equal(original.defaultView.location.hash, '#missing')
  })
})

test('trusted frame link downloads the authorized literal filename and bytes', async () => {
  const bytes = [0, 65, 255, 10], url = URL.createObjectURL(new Blob([new Uint8Array(bytes)]))
  try {
    await mounted(`<a id="download" href="${url}" download="content-proof.bin">Download</a>`, async probe => {
      equal(probe.document.querySelector('#download').getAttribute('href'), url, 'The controlled Blob URL was removed before activation')
      await insideClick(probe, '#download')
      equal(await window.__testInput('Download.take', {}), { name: 'content-proof.bin', bytes })
      equal(probe.commands.length, 1)
    })
  } finally { URL.revokeObjectURL(url) }
})

test('scriptless owned content retains native video playback under the parent CSP', async () => {
  const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 90
  const context = canvas.getContext('2d'), stream = canvas.captureStream(10), chunks = []
  const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' })
  recorder.addEventListener('dataavailable', event => { if (event.data.size) chunks.push(event.data) })
  const stopped = new Promise(resolve => recorder.addEventListener('stop', resolve, { once: true }))
  const paint = setInterval(() => { context.fillStyle = 'black'; context.fillRect(0, 0, 160, 90) }, 30)
  recorder.start()
  await pause(400)
  recorder.stop(); await stopped; clearInterval(paint); stream.getTracks().forEach(track => track.stop())
  const url = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }))
  try {
    await mounted(`<video id="video" controls muted playsinline preload="auto" src="${url}" style="width:160px;height:90px"></video>`, async probe => {
      const video = probe.document.querySelector('#video')
      equal(video.getAttribute('src'), url)
      const deadline = performance.now() + 3000
      while (video.readyState < 2) {
        assert(performance.now() < deadline, 'Controlled native video did not become playable')
        await pause(20)
      }
      assert(video.controls)
      video.focus()
      for (const type of ['keyDown', 'keyUp']) await window.__testInput('Input.dispatchKeyEvent', {
        type, key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32,
      })
      await pause(100)
      assert(!video.paused && video.currentTime > 0, 'Trusted native Space did not advance playback')
    })
  } finally { URL.revokeObjectURL(url) }
})

test('fixed host-class collision and native popover cannot intercept host UI', async () => {
  let hostClicks = 0
  const button = document.querySelector('#host-action'), clicked = () => hostClicks++
  button.addEventListener('click', clicked)
  try {
    await mounted('<div class="host-overlay">Class collision</div><button id="open-details" popovertarget="details">Details</button><div id="details" popover style="position:fixed;inset:0;width:100vw;height:100vh">Popover</div><script>parent.__escaped=1</script><img src="/missing-probe.png" onerror="parent.__escaped=1">', async probe => {
      await insideClick(probe, '#open-details')
      assert(probe.document.querySelector(':popover-open'), 'Native popover did not open')
      await clickNative(button)
      equal(hostClicks, 1)
      equal(window.__escaped, undefined)
      equal(probe.document.querySelectorAll('script,[onerror]').length, 0)
      equal(probe.document.defaultView.getComputedStyle(probe.document.querySelector('.host-overlay')).position, 'static')
    })
  } finally { button.removeEventListener('click', clicked) }
})

test('synthetic and retired links receive no navigation or download authority', async () => {
  await mounted('<a id="download" href="/forbidden-synthetic" download="forbidden.txt">Download</a>', async probe => {
    const link = probe.document.querySelector('#download')
    link.click(); await pause()
    equal(probe.commands, [])
    probe.dispose(); link.click(); await pause()
    equal(probe.commands, [])
  })
})

await run()
