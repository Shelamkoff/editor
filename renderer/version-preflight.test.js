// @ts-nocheck
import test from 'node:test'
import assert from 'node:assert/strict'

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase()
    this.ownerDocument = ownerDocument
    this.className = ''
    this.dataset = {}
    this.style = {}
    this.childNodes = []
    this.parentNode = null
    this.textContent = ''
  }
  get children() { return this.childNodes }
  get firstChild() { return this.childNodes[0] ?? null }
  get nextSibling() {
    const siblings = this.parentNode?.childNodes ?? []
    return siblings[siblings.indexOf(this) + 1] ?? null
  }
  remove() {
    if (!this.parentNode) return
    const siblings = this.parentNode.childNodes
    const index = siblings.indexOf(this)
    if (index >= 0) siblings.splice(index, 1)
    this.parentNode = null
  }
  appendChild(child) { return this.insertBefore(child, null) }
  insertBefore(child, anchor) {
    if (anchor !== null && !this.childNodes.includes(anchor)) throw new Error('NotFoundError')
    if (child === anchor) return child
    child.remove()
    const index = anchor === null ? this.childNodes.length : this.childNodes.indexOf(anchor)
    this.childNodes.splice(index, 0, child)
    child.parentNode = this
    return child
  }
  replaceChildren(...children) {
    for (const child of this.childNodes) child.parentNode = null
    this.childNodes = []
    for (const child of children) this.appendChild(child)
  }
  querySelectorAll() { return [] }
}

const ownerDocument = {
  createElement(name) { return new FakeElement(name, ownerDocument) },
}
ownerDocument.defaultView = { HTMLElement: FakeElement }
globalThis.HTMLElement = FakeElement
globalThis.document = ownerDocument

function fixture(EditorRenderer) {
  let projected = 0
  const issues = []
  const renderer = new EditorRenderer({
    blockTypes: [], injectStyles: false,
    onValidationError(issue) { issues.push(issue) },
  })
  renderer.registerRenderer({
    type: 'strict-version',
    schema: {
      currentVersion: 1,
      createDefault() { return {} },
      encode(data) { return { dataVersion: 1, data } },
      decode(input) {
        if (input.dataVersion !== 1) throw new RangeError('unsupported version')
        return { dataVersion: 1, data: input.data }
      },
    },
    render() { projected++; return ownerDocument.createElement('article') },
  })
  return { renderer, issues, projected: () => projected }
}

for (const operation of ['renderBlock', 'render', 'renderTo']) {
  for (const revisioned of [false, true]) {
    test(operation + ' rejects a registered mismatched version before traversing private payload (' +
      (revisioned ? 'producer revision' : 'unrevisioned') + ')', async () => {
      const { EditorRenderer } = await import('./index.js')
      const { renderer, issues, projected } = fixture(EditorRenderer)
      const container = ownerDocument.createElement('main')
      const goodBlock = { id: 'good', type: 'strict-version', dataVersion: 1, data: {}, revision: 'first' }
      let original = null
      if (operation === 'renderTo') {
        renderer.renderTo({ version: '2.0.0', blocks: [goodBlock] }, container)
        original = container.children[0].children[0]
      }
      let reads = 0
      const badData = {
        get secret() {
          reads++
          throw new Error('invalid-version data getter should never be read')
        },
      }
      const invalid = {
        id: 'bad', type: 'strict-version', dataVersion: 99, data: badData,
        ...(revisioned ? { revision: 'invalid-revision' } : {}),
      }
      try {
        assert.throws(() => {
          if (operation === 'renderBlock') renderer.renderBlock(invalid)
          else if (operation === 'render') renderer.render({ version: '2.0.0', blocks: [invalid] })
          else renderer.renderTo({ version: '2.0.0', blocks: [goodBlock, invalid] }, container)
        }, error => {
          assert.equal(error.name, 'InvalidBlockDataError')
          assert.equal(error.cause?.name, 'RangeError')
          assert.match(error.cause.message, /version/i)
          return true
        })
        assert.equal(reads, 0, 'unsupported schema version traversed its payload')
        assert.deepEqual(issues.map(issue => issue.reason), ['unsupported-data-version'])
        assert.equal(projected(), operation === 'renderTo' ? 1 : 0)
        if (operation === 'renderTo') {
          assert.equal(container.children[0].children[0], original,
            'failed late block changed the previously mounted editor DOM')
          assert.equal(container.children[0].children.length, 1)
        }
      } finally {
        renderer.destroy()
      }
    })
  }
}
