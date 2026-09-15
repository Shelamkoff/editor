import assert from 'node:assert/strict'
import test from 'node:test'

import { deserializeInlineHtml, serializeInlineHtml } from './inlineMarshal.js'

class ParentHTMLElement {}
class ForeignHTMLElement {}

class TextNode {
  constructor(data, ownerDocument) {
    this.data = data
    this.ownerDocument = ownerDocument
    this.parentNode = null
    this.parentElement = null
  }
  get textContent() { return this.data }
  set textContent(value) { this.data = String(value ?? '') }
  replaceWith(node) {
    const parent = this.parentNode
    const index = parent.childNodes.indexOf(this)
    parent.childNodes.splice(index, 1, ...node.childNodes)
    for (const child of node.childNodes) child.parentNode = parent
  }
}

class Fragment {
  constructor(ownerDocument) {
    this.ownerDocument = ownerDocument
    this.childNodes = []
  }
  appendChild(node) {
    node.parentNode = this
    this.childNodes.push(node)
    return node
  }
  querySelectorAll() { return [] }
}

class Template {
  constructor(ownerDocument) {
    this.ownerDocument = ownerDocument
    this.content = new Fragment(ownerDocument)
  }
  set innerHTML(value) {
    this.content.childNodes = []
    this.content.appendChild(new TextNode(String(value), this.ownerDocument))
  }
  get innerHTML() {
    return this.content.childNodes.map(serialize).join('')
  }
}

class ForeignElement extends ForeignHTMLElement {
  constructor(ownerDocument, label) {
    super()
    this.ownerDocument = ownerDocument
    this.label = label
    this.parentNode = null
  }
}

function serialize(node) {
  if (node instanceof TextNode) return node.data
  if (node instanceof ForeignElement) {
    return `<span data-inline-plugin="probe" data-id="wid">${node.label}</span>`
  }
  return ''
}

function createDocument() {
  return {
    createElement(tag) {
      assert.equal(tag, 'template')
      return new Template(this)
    },
    createTreeWalker(root) {
      let index = 0
      return {
        currentNode: root,
        nextNode() {
          const node = root.childNodes[index++] ?? null
          if (node) this.currentNode = node
          return node
        },
      }
    },
    createDocumentFragment() { return new Fragment(this) },
    createTextNode(value) { return new TextNode(String(value), this) },
  }
}

test('deserializeInlineHtml stays in the supplied owning realm', () => {
  const oldDocument = globalThis.document
  const oldHTMLElement = globalThis.HTMLElement
  const ownerDocument = createDocument()
  ownerDocument.defaultView = { HTMLElement: ForeignHTMLElement }
  globalThis.document = {
    createElement() { throw new Error('ambient document must not be used') },
    createTreeWalker() { throw new Error('ambient document must not be used') },
    createDocumentFragment() { throw new Error('ambient document must not be used') },
    createTextNode() { throw new Error('ambient document must not be used') },
  }
  globalThis.HTMLElement = ParentHTMLElement

  try {
    const registry = new Map([['probe', {
      createWidget(data, id, context) {
        assert.equal(id, 'wid')
        assert.equal(context?.ownerDocument, ownerDocument)
        return new ForeignElement(ownerDocument, String(data.label))
      },
    }]])
    const result = deserializeInlineHtml('{{wid}}', {
      wid: { type: 'probe', data: { label: 'Realm widget' } },
    }, registry, ownerDocument)

    assert.match(result, /data-inline-plugin="probe"/)
    assert.match(result, /Realm widget/)
    assert.doesNotMatch(result, /\{\{wid\}\}/)
  } finally {
    if (oldDocument === undefined) delete globalThis.document
    else globalThis.document = oldDocument
    if (oldHTMLElement === undefined) delete globalThis.HTMLElement
    else globalThis.HTMLElement = oldHTMLElement
  }
})


test('serializeInlineHtml parses text in the supplied owning realm', () => {
  const oldDocument = globalThis.document
  const ownerDocument = createDocument()
  ownerDocument.defaultView = { HTMLElement: ForeignHTMLElement }
  globalThis.document = {
    createElement() { throw new Error('ambient document must not be used') },
    createTreeWalker() { throw new Error('ambient document must not be used') },
    createTextNode() { throw new Error('ambient document must not be used') },
  }

  try {
    const preserved = { wid: { type: 'probe', data: { label: 'Realm widget' } } }
    const result = serializeInlineHtml('before {{wid}} after', new Map(), new Set(), preserved, ownerDocument)
    assert.equal(result.html, 'before {{wid}} after')
    assert.deepEqual(result.inline, preserved)
  } finally {
    if (oldDocument === undefined) delete globalThis.document
    else globalThis.document = oldDocument
  }
})
