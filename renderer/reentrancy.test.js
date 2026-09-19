// @ts-nocheck
import test from 'node:test'
import assert from 'node:assert/strict'

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase()
    this.className = ''
    this.dataset = {}
    this.style = {}
    this.childNodes = []
    this.parentNode = null
    this.textContent = ''
  }

  get children() {
    return this.childNodes
  }

  get firstChild() { return this.childNodes[0] ?? null }
  get nextSibling() {
    const siblings = this.parentNode?.childNodes ?? []
    return siblings[siblings.indexOf(this) + 1] ?? null
  }
  remove() { this.#detach(this) }
  insertBefore(child, anchor) {
    if (anchor !== null && !this.childNodes.includes(anchor)) throw new Error('NotFoundError')
    if (child === anchor) return child
    this.#detach(child)
    const index = anchor === null ? this.childNodes.length : this.childNodes.indexOf(anchor)
    this.childNodes.splice(index, 0, child)
    child.parentNode = this
    return child
  }

  appendChild(child) {
    this.#detach(child)
    this.childNodes.push(child)
    child.parentNode = this
    return child
  }

  replaceChildren(...children) {
    for (const child of this.childNodes) child.parentNode = null
    this.childNodes = []
    for (const child of children) this.appendChild(child)
  }

  #detach(child) {
    if (!child.parentNode) return
    const siblings = child.parentNode.childNodes
    const index = siblings.indexOf(child)
    if (index >= 0) siblings.splice(index, 1)
    child.parentNode = null
  }
}

globalThis.document = {
  createElement(tagName) {
    return new FakeElement(tagName)
  },
}
globalThis.HTMLElement = FakeElement


for (const kind of ['block', 'document', 'container']) {
  test(`destroy(${kind}) detaches ownership before calling a reentrant disposer`, async () => {
    const { EditorRenderer } = await import('./index.js')
    const renderer = new EditorRenderer({ blockTypes: [], injectStyles: false })
    let target
    let calls = 0
    renderer.registerRenderer({
      type: 'dispose-probe',
      render() { return document.createElement('article') },
      destroy() {
        calls++
        if (calls === 1) renderer.destroy(target)
      },
    })
    const block = { id: 'a', type: 'dispose-probe', data: {} }
    if (kind === 'block') target = renderer.renderBlock(block)
    else if (kind === 'document') target = renderer.render({ blocks: [block] })
    else {
      target = document.createElement('main')
      renderer.renderTo({ blocks: [block] }, target)
    }
    renderer.destroy(target)
    assert.equal(calls, 1, 'one owned element must be disposed exactly once')
    renderer.destroy(target)
    renderer.destroy()
    assert.equal(calls, 1)
  })
}

test('renderTo keeps the original validation identity through the signature snapshot', async () => {
  const { EditorRenderer } = await import('./index.js')
  const first = document.createElement('main')
  const second = document.createElement('main')
  const input = { blocks: [{ id: 'invalid', type: 'table', data: { content: 'invalid' } }] }
  let reports = 0
  const renderer = new EditorRenderer({
    blockTypes: ['table'], injectStyles: false, validationMode: 'strict',
    onValidationError() {
      reports++
      if (reports === 1) assert.throws(() => renderer.renderTo(input, second), /does not match its schema/)
    },
  })
  assert.throws(() => renderer.renderTo(input, first), /does not match its schema/)
  assert.equal(reports, 1, 'same source block must not recursively report through a second container')
  renderer.destroy()
})

test('full destroy tolerates sibling disposal and preserves newly created independent output', async () => {
  const { EditorRenderer } = await import('./index.js')
  const renderer = new EditorRenderer({ blockTypes: [], injectStyles: false })
  const disposed = []
  let second
  let replacement
  renderer.registerRenderer({
    type: 'owner',
    render(block) { const element = document.createElement('article'); element.textContent = block.id; return element },
    destroy(element) {
      disposed.push(element.textContent)
      if (element.textContent === 'first') {
        renderer.destroy(second)
        replacement = renderer.renderBlock({ id: 'replacement', type: 'owner', data: {} })
      }
    },
  })
  renderer.renderTo({ blocks: [{ id: 'first', type: 'owner', data: {} }] }, document.createElement('main'))
  second = renderer.renderBlock({ id: 'second', type: 'owner', data: {} })
  renderer.destroy()
  assert.deepEqual(disposed, ['first', 'second'])
  assert.equal(replacement.textContent, 'replacement')
  renderer.destroy()
  assert.deepEqual(disposed, ['first', 'second', 'replacement'])
})

test('renderTo cannot remount a container from its disposer', async () => {
  const { EditorRenderer } = await import('./index.js')
  const renderer = new EditorRenderer({ blockTypes: [], injectStyles: false })
  const container = document.createElement('main')
  let rejected = false
  renderer.registerRenderer({
    type: 'owner', render() { return document.createElement('article') },
    destroy() {
      try { renderer.renderTo({ blocks: [] }, container) }
      catch (error) { rejected = /Cannot reenter renderTo/.test(String(error)) }
    },
  })
  renderer.renderTo({ blocks: [{ type: 'owner', data: {} }] }, container)
  renderer.destroy(container)
  assert.equal(rejected, true)
  renderer.renderTo({ blocks: [] }, container)
  renderer.destroy(container)
})
