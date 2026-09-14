import assert from 'node:assert/strict'
import test from 'node:test'

import { deserializeInlineHtml } from './inlineMarshal.js'

class ParentHTMLElement {}
class ForeignHTMLElement {}

class TextNode {
  constructor(data, ownerDocument) {
    this.data = data
    this.ownerDocument = ownerDocument
    this.parentNode = null
  }
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
        nextNode() { return root.childNodes[index++] ?? null },
      }
    },
    createDocumentFragment() { return new Fragment(this) },
    createTextNode(value) { return new TextNode(String(value), this) },
  }
}

test('deserializeInlineHtml accepts widgets from their own realm', () => {
  const oldDocument = globalThis.document
  const oldHTMLElement = globalThis.HTMLElement
  const oldNodeFilter = globalThis.NodeFilter
  const parentDocument = createDocument()
  const foreignDocument = { defaultView: { HTMLElement: ForeignHTMLElement } }
  globalThis.document = parentDocument
  globalThis.HTMLElement = ParentHTMLElement
  globalThis.NodeFilter = { SHOW_TEXT: 4 }

  try {
    const registry = new Map([['probe', {
      createWidget(data) { return new ForeignElement(foreignDocument, String(data.label)) },
    }]])
    const result = deserializeInlineHtml('{{wid}}', {
      wid: { type: 'probe', data: { label: 'Realm widget' } },
    }, registry)

    assert.match(result, /data-inline-plugin="probe"/)
    assert.match(result, /Realm widget/)
    assert.doesNotMatch(result, /\{\{wid\}\}/)
  } finally {
    if (oldDocument === undefined) delete globalThis.document
    else globalThis.document = oldDocument
    if (oldHTMLElement === undefined) delete globalThis.HTMLElement
    else globalThis.HTMLElement = oldHTMLElement
    if (oldNodeFilter === undefined) delete globalThis.NodeFilter
    else globalThis.NodeFilter = oldNodeFilter
  }
})
