// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'

class ForeignHTMLElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase()
    this.ownerDocument = ownerDocument
    this.className = ''
    this.dataset = {}
    this.style = { textAlign: '' }
    this.childNodes = []
    this.parentNode = null
    this.textContent = ''
    this.removed = false
  }
  get children() { return this.childNodes }
  get firstChild() { return this.childNodes[0] ?? null }
  get nextSibling() {
    const siblings = this.parentNode?.childNodes ?? []
    return siblings[siblings.indexOf(this) + 1] ?? null
  }
  appendChild(child) {
    child.remove?.()
    this.childNodes.push(child)
    child.parentNode = this
    return child
  }
  insertBefore(child, anchor) {
    child.remove?.()
    const index = anchor === null ? this.childNodes.length : this.childNodes.indexOf(anchor)
    if (index < 0) throw new Error('NotFoundError')
    this.childNodes.splice(index, 0, child)
    child.parentNode = this
    return child
  }
  replaceChildren(...children) {
    for (const child of this.childNodes) child.parentNode = null
    this.childNodes = []
    for (const child of children) this.appendChild(child)
  }
  remove() {
    if (this.parentNode) {
      const index = this.parentNode.childNodes.indexOf(this)
      if (index >= 0) this.parentNode.childNodes.splice(index, 1)
      this.parentNode = null
    }
    this.removed = true
  }
}

function createRealm() {
  const links = []
  const ownerWindow = { HTMLElement: ForeignHTMLElement }
  const ownerDocument = {
    defaultView: ownerWindow,
    head: {
      appendChild(link) {
        links.push(link)
        link.parentNode = this
      },
      childNodes: [],
    },
    createElement(tagName) {
      return new ForeignHTMLElement(tagName, ownerDocument)
    },
  }
  return { ownerDocument, ownerWindow, links }
}

test('renderTo keeps custom DOM and automatic styles in the target owning document', async () => {
  const { EditorRenderer } = await import('./EditorRenderer.js')
  const realm = createRealm()
  const container = realm.ownerDocument.createElement('main')
  let contextDocument = null
  const renderer = new EditorRenderer({ blockTypes: [] })
  renderer.registerRenderer({
    type: 'foreign',
    styles: ['/foreign.css'],
    render(block, _parseInline, context) {
      contextDocument = context.ownerDocument
      const element = context.ownerDocument.createElement('article')
      element.textContent = block.data.text
      return element
    },
  })

  const previousDocument = globalThis.document
  const previousHTMLElement = globalThis.HTMLElement
  globalThis.document = new Proxy({}, { get() { throw new Error('ambient document must not be used') } })
  globalThis.HTMLElement = class AmbientHTMLElement {}
  try {
    renderer.renderTo({ blocks: [{ id: 'a', type: 'foreign', data: { text: 'A' } }] }, container)
    const wrapper = container.children[0]
    assert.equal(contextDocument, realm.ownerDocument)
    assert.equal(wrapper.ownerDocument, realm.ownerDocument)
    assert.equal(wrapper.children[0].ownerDocument, realm.ownerDocument)
    assert.ok(realm.links.length >= 2)
    assert.equal(realm.links.every(link => link.ownerDocument === realm.ownerDocument), true)

    renderer.destroy(container)
    assert.equal(realm.links.every(link => link.removed), true)
  } finally {
    globalThis.document = previousDocument
    globalThis.HTMLElement = previousHTMLElement
  }
})
