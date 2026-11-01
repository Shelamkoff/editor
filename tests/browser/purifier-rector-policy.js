import { sanitizeRawHtmlForSink, setSanitizedRawHtml } from '../../shared/sanitize/sanitizeRawHtml.js'
import { getTrustedHtmlPolicy } from '../../shared/sanitize/trustedHtml.js'
import { test, assert, equal, run } from './regressions/harness.js'

test('Raw remains usable with only rector allowed and grants no script URL policy', () => {
  const clean = sanitizeRawHtmlForSink('<p>Safe <b>source</b></p><script>unsafe()</script>', document)
  assert(trustedTypes.isHTML(clean))
  const output = document.createElement('section')
  output.innerHTML = clean
  equal(output.innerHTML, '<p>Safe <b>source</b></p>')
  const policy = getTrustedHtmlPolicy(document)
  let denied = false
  try { policy.createScriptURL('/unauthorized.js') } catch { denied = true }
  assert(denied, 'An HTML parser policy must not grant script URL creation')
  equal(trustedTypes.defaultPolicy, null)
})

test('Raw retains an explicitly supplied inert ownerDocument without a Window', () => {
  const ownerDocument = document.implementation.createHTMLDocument('isolated owner')
  equal(ownerDocument.defaultView, null)
  const output = ownerDocument.createElement('section')
  setSanitizedRawHtml(output, '<p>Isolated <b>safe</b></p><script>unsafe()</script>')
  equal(output.innerHTML, '<p>Isolated <b>safe</b></p>')
  assert(output.ownerDocument === ownerDocument)
})

await run()
