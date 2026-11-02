import assert from 'node:assert/strict'

/**
 * Inert template for node-identity unit fixtures using only ordinary text.
 * Not an HTML parser or sanitizer substitute: markup requires browser tests.
 */
export function plainTextTemplate(ownerDocument) {
  let text = ''
  const content = { nodeType: 11, childNodes: [] }
  return {
    ownerDocument, localName: 'template',
    content,
    get innerHTML() { return text },
    set innerHTML(value) {
      text = String(value)
      assert.doesNotMatch(text, /[<&]/, 'This DOM fixture only supports plain text')
      content.childNodes = text ? [{ nodeType: 3, textContent: text, parentNode: content,
        remove() {
          if (!this.parentNode) return
          const siblings = this.parentNode.childNodes ?? this.parentNode.children
          siblings.splice(siblings.indexOf(this), 1)
          this.parentNode = null
        },
      }] : []
    },
  }
}
