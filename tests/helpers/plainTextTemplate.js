import assert from 'node:assert/strict'

/**
 * Inert template for node-identity unit fixtures using only ordinary text.
 * Not an HTML parser or sanitizer substitute: markup requires browser tests.
 */
export function plainTextTemplate(ownerDocument) {
  let text = ''
  const content = { childNodes: [] }
  return {
    ownerDocument,
    content,
    get innerHTML() { return text },
    set innerHTML(value) {
      text = String(value)
      assert.doesNotMatch(text, /[<&]/, 'This DOM fixture only supports plain text')
      content.childNodes = text ? [{ nodeType: 3, textContent: text }] : []
    },
  }
}
