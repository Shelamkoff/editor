import DOMPurify from 'dompurify'
import { sanitizeRawHtml, setSanitizedRawHtml } from '../../shared/sanitize/sanitizeRawHtml.js'
import { test, assert, equal, run } from './regressions/harness.js'

for (const order of ['host-first', 'rector-first']) test(`independent DOMPurify and Rector coexist under Trusted Types: ${order}`, async () => {
  const frame = document.createElement('iframe')
  document.body.append(frame)
  try {
    const document = frame.contentDocument
    let enforced = false
    try { document.createElement('div').innerHTML = '<p>plain sink</p>' } catch { enforced = true }
    assert(enforced, 'The fixture must actually enforce Trusted Types')
    const host = DOMPurify(document.defaultView)
    const own = () => {
      const output = document.createElement('section')
      setSanitizedRawHtml(output, '<p>Rector <b>safe</b></p><script>window.__unsafe=1</script>')
      equal(output.innerHTML, '<p>Rector <b>safe</b></p>')
      equal(sanitizeRawHtml('<p>Rector second</p>', document), '<p>Rector second</p>')
    }
    const external = () => equal(host.sanitize('<p>Host safe</p><script>window.__unsafe=1</script>'), '<p>Host safe</p>')
    if (order === 'host-first') { external(); own() }
    else { own(); external() }
    equal(document.defaultView.__unsafe, undefined)
  } finally { frame.remove() }
})

test('Raw download and media URLs retain host-owned Blobs while executable URLs remain absent', () => {
  const url = URL.createObjectURL(new Blob(['controlled download'], { type: 'application/octet-stream' }))
  try {
    const output = document.createElement('section')
    setSanitizedRawHtml(output, `<a href="${url}" download="proof.bin">File</a><a href="javascript:alert(1)">Unsafe</a><video src="${url}" poster="${url}" controls></video><img src="javascript:alert(1)">`)
    equal(output.children[0].getAttribute('href'), url)
    equal(output.children[0].getAttribute('download'), 'proof.bin')
    equal(output.children[1].hasAttribute('href'), false)
    equal(output.querySelector('video').getAttribute('src'), url)
    equal(output.querySelector('video').getAttribute('poster'), url)
    equal(output.querySelector('video').controls, true)
    equal(output.querySelector('img').hasAttribute('src'), false)
  } finally { URL.revokeObjectURL(url) }
})

await run()
