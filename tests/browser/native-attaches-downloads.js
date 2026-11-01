import JSZip from 'jszip'
import { EditorRenderer } from '../../renderer/index.js'
import { createAttachesRenderer, downloadArchive } from '../../renderer/renderers/attaches/index.js'
import { test, assert, equal, pause, run } from './regressions/harness.js'
import { clickNative } from './native-input-helpers.js'

const payloads = [[0, 1, 127, 255], [66, 10, 0]]
const names = ['alpha Ω.bin', 'beta.txt']

async function mounted(variant, count, action, suppliedNames = names, failedSibling = false) {
  const urls = payloads.map(bytes => URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' })))
  // A revoked native Blob URL gives a genuine fetch failure; Vite may serve
  // its SPA HTML with status 200 for an unknown fixture path.
  if (failedSibling) URL.revokeObjectURL(urls[1])
  const holder = document.createElement('section')
  document.body.append(holder)
  const renderer = new EditorRenderer({ classPrefix: 'article', blockTypes: [] })
  renderer.registerRenderer(createAttachesRenderer('article', {}))
  const styles = renderer.injectStyles()
  const files = Array.from({ length: count }, (_, index) => ({
    id: `file-${index}`, url: urls[index % urls.length],
    name: suppliedNames[index], size: payloads[index % payloads.length].length, extension: 'bin',
  }))
  const input = { version: '2.0.0', blocks: [{ id: 'attachments', type: 'attaches', dataVersion: 2, data: { files, variant } }] }
  const before = structuredClone(input)
  try {
    renderer.renderTo(input, holder)
    await action(holder, input)
    equal(input, before, 'Downloads must not mutate their caller-owned author data')
  } finally {
    renderer.destroy()
    styles.destroy()
    holder.remove()
    urls.forEach((url, index) => { if (!failedSibling || index !== 1) URL.revokeObjectURL(url) })
  }
}

const take = () => window.__testInput('Download.take', {})

for (const variant of ['a', 'b', 'f', 'g']) test(`Attaches ${variant}: trusted individual download preserves filename and literal bytes`, async () => {
  await mounted(variant, 1, async holder => {
    const control = holder.querySelector('a[download]')
    let trusted = false
    control.addEventListener('click', event => { trusted = event.isTrusted }, { once: true })
    await clickNative(control)
    equal(trusted, true)
    equal(await take(), { name: names[0], bytes: payloads[0] })
  })
})

for (const target of ['.article-attaches__row-name', '.article-attaches__download']) test(`Attaches grouped A: trusted ${target} download preserves the chosen file`, async () => {
  await mounted('a', 2, async holder => {
    await clickNative(holder.querySelector('.article-attaches__chevron'))
    const rows = holder.querySelectorAll('.article-attaches__row')
    await clickNative(rows[1].querySelector(target))
    equal(await take(), { name: names[1], bytes: payloads[1] })
  })
})

for (const mode of ['complete', 'partial-failure', 'portable-names', 'collision-names']) test(`Attaches trusted ZIP download: ${mode}`, async () => {
  const portable = mode === 'portable-names'
  const collision = mode === 'collision-names'
  const stem = 'x'.repeat(127)
  const long = 'a.' + 'x'.repeat(121) + ' qqqq'
  const sourceNames = portable ? [stem + '.suffix', 'CON' + ' '.repeat(125) + 'suffix', 'report.\u00a0', 'report.\u00a0']
    : collision ? [long, long, long] : names
  const expectedNames = portable ? [stem, 'file-2', 'report', 'report (2)']
    : collision ? [long, 'a (2).' + 'x'.repeat(121), 'a (3).' + 'x'.repeat(121)]
    : mode === 'partial-failure' ? [names[0]] : names
  await mounted('a', portable ? 4 : collision ? 3 : 2, async holder => {
    const control = holder.querySelector('.article-attaches__group-header .article-attaches__download')
    let trusted = false
    control.addEventListener('click', event => { trusted = event.isTrusted }, { once: true })
    await clickNative(control)
    const download = await take()
    equal(trusted, true)
    equal(download.name, 'files.zip')
    const zip = await JSZip.loadAsync(new Uint8Array(download.bytes))
    equal(Object.keys(zip.files).sort(), [...expectedNames].sort())
    for (const [index, name] of expectedNames.entries()) {
      equal([...await zip.file(name).async('uint8array')], payloads[index % payloads.length])
    }
  }, sourceNames, mode === 'partial-failure')
})

for (const cleanup of ['complete', 'pending', 'rejected']) test(`ZIP abort releases a native pending stream with ${cleanup} cleanup`, async () => {
  const originalFetch = window.fetch
  const caller = new AbortController(), reason = new Error('archive owner retired')
  let entered, source, cancelled, cancelCount = 0, downloadCount = 0
  const reading = new Promise(resolve => { entered = resolve })
  const stream = new ReadableStream({
    start(controller) { source = controller },
    pull() { entered() },
    cancel(value) {
      cancelCount++; cancelled = value
      if (cleanup === 'pending') return new Promise(() => {})
      if (cleanup === 'rejected') return Promise.reject(new Error('source cleanup failed'))
    },
  }, { highWaterMark: 0 })
  const response = new Response(stream)
  const originalClick = HTMLAnchorElement.prototype.click
  HTMLAnchorElement.prototype.click = function () { downloadCount++ }
  window.fetch = async () => response
  const operation = downloadArchive([{ url: '/pending-body', name: 'pending.bin' }], { signal: caller.signal, ownerDocument: document })
  const outcome = operation.then(() => null, error => error)
  try {
    await reading
    caller.abort(reason)
    await pause()
    equal(cancelCount, 1, 'Cancellation must reach the source before another chunk arrives')
    assert(cancelled === reason, 'The source lost the caller cancellation reason')
    assert(await outcome === reason, 'Archive rejection lost the caller cancellation reason')
    equal(stream.locked, false)
    equal(downloadCount, 0)
  } finally {
    try { source.close() } catch {}
    await outcome
    window.fetch = originalFetch
    HTMLAnchorElement.prototype.click = originalClick
  }
})

await run()
