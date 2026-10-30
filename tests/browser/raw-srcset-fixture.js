export const srcsetCases = [
  'comma-url', 'comma-url-without-descriptor', 'exponent-density',
  'leading-dot-density', 'positive-exponent-density', 'width-height-descriptors',
  'trailing-comma', 'ascii-whitespace', 'unsafe-neighbors', 'unsafe-leading-candidate',
  'parenthesized-invalid-descriptor', 'unterminated-invalid-descriptor',
  'non-ascii-descriptor-whitespace',
]

// The expected resource and candidate spelling come from each authored case,
// never from the sanitizer. The bare-browser control independently selects it.
export function srcsetDefinition(name, origin = location.href) {
  const asset = label => new URL('/tests/browser/fixtures/srcset-pixel.svg?case=' + label, origin).href
  const primary = asset(name + ',primary')
  const secondary = asset(name + '-secondary')
  const fallback = asset(name + '-fallback')
  const common = { name, fallback: null, sizes: '2px', expectedCurrentSrc: primary, controlKind: 'bare-authored' }
  const exact = input => ({ ...common, input, expectedSrcset: input, controlSrcset: input })
  if (name === 'comma-url') return exact(primary + ' 1x')
  if (name === 'comma-url-without-descriptor') return exact(primary)
  if (name === 'exponent-density') return exact(primary + ' 1e0x')
  if (name === 'leading-dot-density') return exact(primary + ' .5x')
  if (name === 'positive-exponent-density') return exact(primary + ' 1E+0x')
  if (name === 'width-height-descriptors') return exact(primary + ' 2w 1h')
  if (name === 'trailing-comma') return { ...exact(primary), input: primary + ',, ' }
  if (name === 'ascii-whitespace') return {
    ...exact(primary + ' 1e0x'), input: ' ,\t' + primary + '\n\r\t1e0x\f ',
  }
  if (name === 'unsafe-neighbors') return {
    ...exact(primary + ' 1x'),
    input: primary + ' 1x, javascript:alert(1) 2x, data:image/svg+xml,%3Csvg%20onload=bad()%3E 3x, https://user:pass@example.invalid/image.png 4x',
    controlKind: 'policy-allowed',
  }
  if (name === 'unsafe-leading-candidate') return {
    ...exact(primary + ' 1x'),
    input: 'javascript:alert(1) 2x, ' + primary + ' 1x',
    controlKind: 'policy-allowed',
  }
  if (name === 'parenthesized-invalid-descriptor') {
    const input = primary + ' invalid(, ' + fallback + ' 1x, ), ' + secondary + ' 2x'
    return { ...exact(input), expectedCurrentSrc: secondary }
  }
  if (name === 'unterminated-invalid-descriptor') {
    const input = primary + ' invalid(, ' + secondary + ' 1x'
    return { ...exact(input), fallback, expectedCurrentSrc: fallback }
  }
  if (name === 'non-ascii-descriptor-whitespace') {
    const input = primary + ' 1x\u00a0, ' + secondary + ' 2x'
    return { ...exact(input), expectedCurrentSrc: secondary }
  }
  throw new Error('Unknown srcset fixture: ' + name)
}

export async function observeSrcset({ name, sanitizer, ownerDocument = document }) {
  const definition = srcsetDefinition(name)
  const observations = []
  const observe = (property, actual, expected) => observations.push({
    property, actual, expected,
    status: JSON.stringify(actual) === JSON.stringify(expected) ? 'PASS' : 'FAIL',
  })
  const host = ownerDocument.createElement('section')
  const control = ownerDocument.createElement('img')
  ownerDocument.body.append(host, control)
  const escape = text => text.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
  const source = definition.fallback ? ` src="${escape(definition.fallback)}"` : ''
  const html = `<b>Lead</b><img${source} srcset="${escape(definition.input)}" sizes="${definition.sizes}" alt="Responsive sample"><i>Tail</i>`
  try {
    if (definition.fallback) control.src = definition.fallback
    control.sizes = definition.sizes
    control.srcset = definition.controlSrcset
    await control.decode()
    observe('browser.currentSrc', control.currentSrc, definition.expectedCurrentSrc)
    const safe = sanitizer.sanitizeRawHtml(html, ownerDocument)
    sanitizer.setSanitizedRawHtml(host, html)
    const image = host.querySelector('img')
    observe('sanitized.srcset', image.getAttribute('srcset'), definition.expectedSrcset)
    const decoded = await image.decode().then(() => true, () => false)
    observe('image.decoded', decoded, true)
    observe('image.currentSrc', image.currentSrc, definition.expectedCurrentSrc)
    observe('image.alt', image.alt, 'Responsive sample')
    observe('image.ownerDocument', image.ownerDocument === ownerDocument, true)
    observe('neighbor.content', host.textContent, 'LeadTail')
    observe('neighbor.marks', [host.firstElementChild.tagName, host.lastElementChild.tagName], ['B', 'I'])
    observe('string.nodeParity', safe, host.innerHTML)
    observe('string.idempotent', sanitizer.sanitizeRawHtml(safe, ownerDocument), safe)
    return { name, definition, observations, complete: true }
  } catch (error) {
    return { name, definition, observations, complete: false, error: error.stack ?? String(error) }
  } finally {
    host.remove()
    control.remove()
  }
}
