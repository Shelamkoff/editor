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

const passthroughSchema = Object.freeze({
  currentVersion: 1,
  createDefault: () => ({}),
  decode({ dataVersion, data }) {
    if (dataVersion !== 1) throw new RangeError('unsupported data version')
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new TypeError('data must be an object')
    return { dataVersion: 1, data: { ...data } }
  },
  encode(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new TypeError('data must be an object')
    return { dataVersion: 1, data: { ...data } }
  },
})

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
    schema: passthroughSchema,
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
    renderer.renderTo({ blocks: [{ id: 'a', type: 'foreign', dataVersion: 1, data: { text: 'A' } }] }, container)
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
test('failed detached renderer wrapper creation releases all automatic styles', async () => {
  const { EditorRenderer } = await import('./EditorRenderer.js')
  const { ownerDocument, links } = createRealm()
  const createElement = ownerDocument.createElement
  ownerDocument.createElement = function (tagName) {
    if (tagName === 'div') throw new Error('wrapper allocation failed')
    return createElement.call(this, tagName)
  }
  const previousDocument = globalThis.document
  const renderer = new EditorRenderer({ blockTypes: [], injectStyles: true })
  try {
    globalThis.document = ownerDocument
    assert.throws(
      () => renderer.render({ version: '2.0.0', blocks: [] }),
      /wrapper allocation failed/,
    )
    assert.ok(links.length > 0, 'the failure did not follow style acquisition')
    assert.equal(links.every(link => link.removed), true,
      'failed render left document-global links without any live result')

    ownerDocument.createElement = createElement
    const wrapper = renderer.render({ version: '2.0.0', blocks: [] })
    assert.ok(links.length >= 2, 'a stale style reference prevented later acquisition')
    renderer.destroy(wrapper)
    assert.equal(links.every(link => link.removed), true)
  } finally {
    renderer.destroy()
    globalThis.document = previousDocument
  }
})

test('failed renderTo wrapper creation releases styles without retaining the container', async () => {
  const { EditorRenderer } = await import('./EditorRenderer.js')
  const { ownerDocument, links } = createRealm()
  const container = ownerDocument.createElement('main')
  const createElement = ownerDocument.createElement
  ownerDocument.createElement = function (tagName) {
    if (tagName === 'div') throw new Error('mounted wrapper allocation failed')
    return createElement.call(this, tagName)
  }
  const renderer = new EditorRenderer({ blockTypes: [], injectStyles: true })
  try {
    assert.throws(
      () => renderer.renderTo({ version: '2.0.0', blocks: [] }, container),
      /mounted wrapper allocation failed/,
    )
    assert.ok(links.length > 0, 'the failure did not follow style acquisition')
    assert.equal(links.every(link => link.removed), true,
      'failed renderTo retained automatic style ownership without a mount')
    assert.equal(container.children.length, 0, 'failed mount changed application DOM')

    ownerDocument.createElement = createElement
    renderer.renderTo({ version: '2.0.0', blocks: [] }, container)
    assert.equal(container.children.length, 1, 'a failed renderTo blocked subsequent use')
    renderer.destroy(container)
    assert.equal(links.every(link => link.removed), true)
  } finally {
    renderer.destroy()
  }
})
test('failed independent renderer output preserves styles held by a live mount', async () => {
  const { EditorRenderer } = await import('./EditorRenderer.js')
  const { ownerDocument, links } = createRealm()
  const container = ownerDocument.createElement('main')
  const originalCreate = ownerDocument.createElement
  const previousDocument = globalThis.document
  const renderer = new EditorRenderer({ blockTypes: [], injectStyles: true })
  try {
    renderer.renderTo({ version: '2.0.0', blocks: [] }, container)
    assert.ok(links.length > 0)
    assert.equal(links.some(link => link.removed), false)
    ownerDocument.createElement = function (tagName) {
      if (tagName === 'div') throw new Error('independent output allocation failed')
      return originalCreate.call(this, tagName)
    }
    globalThis.document = ownerDocument
    assert.throws(
      () => renderer.render({ version: '2.0.0', blocks: [] }),
      /independent output allocation failed/,
    )
    assert.equal(links.some(link => link.removed), false,
      'rollback removed stylesheet links still required by an existing mount')
    assert.equal(container.children.length, 1,
      'failed independent detached render displaced a previously mounted editor')

    renderer.destroy(container)
    assert.equal(links.every(link => link.removed), true)
  } finally {
    renderer.destroy()
    globalThis.document = previousDocument
  }
})
