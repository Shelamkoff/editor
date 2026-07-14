// @ts-nocheck
import test from 'node:test'
import assert from 'node:assert/strict'

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase()
    this.className = ''
    this.dataset = {}
    this.childNodes = []
    this.parentNode = null
    this.textContent = ''
  }

  get children() {
    return this.childNodes
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

test('strict renderer validation rejects lossy built-in data with a content-free issue', async () => {
  const { EditorRenderer } = await import('./index.js')
  const issues = []
  const renderer = new EditorRenderer({
    blockTypes: ['table'],
    validationMode: 'strict',
    onValidationError: issue => issues.push(issue),
  })

  assert.throws(() => renderer.renderBlock({
    id: 'table-1',
    type: 'table',
    data: { content: [['kept', 'lost'], ['ragged']] },
  }), /does not match its schema/)
  assert.deepEqual(issues, [{ blockId: 'table-1', type: 'table' }])
  assert.equal(JSON.stringify(issues).includes('kept'), false)
})

test('renderTo reuses, reorders, replaces and disposes keyed blocks', async () => {
  const { EditorRenderer } = await import('./index.js')
  let renderCalls = 0
  const destroyed = []

  const renderer = new EditorRenderer({ blockTypes: [] })
  renderer.registerRenderer({
    type: 'test',
    render(block) {
      renderCalls++
      const element = document.createElement('article')
      element.textContent = block.data.text
      return element
    },
    destroy(element) {
      destroyed.push(element)
    },
  })

  const container = document.createElement('main')
  const initial = {
    blocks: [
      { id: 'a', type: 'test', data: { text: 'A' } },
      { id: 'b', type: 'test', data: { text: 'B' } },
    ],
  }

  renderer.renderTo(initial, container)
  const wrapper = container.children[0]
  const firstA = wrapper.children[0]
  const firstB = wrapper.children[1]

  renderer.renderTo(initial, container)
  assert.equal(renderCalls, 2)
  assert.equal(wrapper.children[0], firstA)
  assert.equal(wrapper.children[1], firstB)

  renderer.renderTo({
    blocks: [
      { id: 'a', type: 'test', data: { text: 'A' } },
      { id: 'b', type: 'test', data: { text: 'B2' } },
    ],
  }, container)
  const secondB = wrapper.children[1]
  assert.equal(renderCalls, 3)
  assert.equal(wrapper.children[0], firstA)
  assert.notEqual(secondB, firstB)
  assert.deepEqual(destroyed, [firstB])

  renderer.renderTo({
    blocks: [
      { id: 'b', type: 'test', data: { text: 'B2' } },
      { id: 'a', type: 'test', data: { text: 'A' } },
    ],
  }, container)
  assert.equal(renderCalls, 3)
  assert.equal(wrapper.children[0], secondB)
  assert.equal(wrapper.children[1], firstA)

  renderer.renderTo({
    blocks: [
      { id: 'b', type: 'test', data: { text: 'B2' } },
    ],
  }, container)
  assert.deepEqual(destroyed, [firstB, firstA])

  renderer.destroy(container)
  assert.deepEqual(destroyed, [firstB, firstA, secondB])
  assert.equal(container.children.length, 0)
})

test('repeated render and destroy cycles release every renderer-owned resource', async () => {
  const { EditorRenderer } = await import('./index.js')
  const live = new Set()
  let created = 0
  let destroyed = 0
  const renderer = new EditorRenderer({ blockTypes: [] })
  renderer.registerRenderer({
    type: 'leak-contract',
    render(block) {
      const element = document.createElement('article')
      element.textContent = block.data.text
      live.add(element)
      created++
      return element
    },
    destroy(element) {
      assert.ok(live.delete(element), 'destroy must receive a currently live element')
      destroyed++
    },
  })

  const container = document.createElement('main')
  for (let cycle = 0; cycle < 100; cycle++) {
    renderer.renderTo({
      blocks: Array.from({ length: 5 }, (_, index) => ({
        id: `block-${index}`,
        type: 'leak-contract',
        data: { text: `${cycle}:${index}` },
      })),
    }, container)
    assert.equal(live.size, 5)
    renderer.destroy(container)
    assert.equal(live.size, 0)
    assert.equal(container.children.length, 0)
  }

  assert.equal(created, 500)
  assert.equal(destroyed, created)
})

test('render and renderBlock results retain explicit resource ownership', async () => {
  const { EditorRenderer } = await import('./index.js')
  const destroyed = []
  const renderer = new EditorRenderer({ blockTypes: [] })
  renderer.registerRenderer({
    type: 'owned',
    render(block) {
      const element = document.createElement('article')
      element.textContent = block.data.text
      return element
    },
    destroy(element) { destroyed.push(element) },
  })

  const single = renderer.renderBlock({ id: 'single', type: 'owned', data: { text: 'single' } })
  const documentWrapper = renderer.render({
    blocks: [
      { id: 'a', type: 'owned', data: { text: 'A' } },
      { id: 'b', type: 'owned', data: { text: 'B' } },
    ],
  })
  const documentElements = [...documentWrapper.children]

  renderer.destroy(single)
  assert.deepEqual(destroyed, [single])
  assert.equal(single.children.length, 0)

  renderer.destroy(documentWrapper)
  assert.deepEqual(destroyed, [single, ...documentElements])
  assert.equal(documentWrapper.children.length, 0)
})

test('failed detached document rendering disposes blocks created before the failure', async () => {
  const { EditorRenderer } = await import('./index.js')
  const destroyed = []
  const renderer = new EditorRenderer({ blockTypes: [] })
  renderer.registerRenderer({
    type: 'transactional',
    render(block) {
      if (block.data.fail) throw new Error('intentional render failure')
      return document.createElement('article')
    },
    destroy(element) { destroyed.push(element) },
  })

  assert.throws(() => renderer.render({
    blocks: [
      { id: 'valid', type: 'transactional', data: {} },
      { id: 'broken', type: 'transactional', data: { fail: true } },
    ],
  }), /intentional render failure/)
  assert.equal(destroyed.length, 1)
})

test('renderer replacement and unregister invalidate mounted blocks and keep the owning disposer', async () => {
  const { EditorRenderer } = await import('./index.js')
  const disposedByOld = []
  const disposedByNew = []
  const renderer = new EditorRenderer({ blockTypes: [], throwOnUnknown: false })

  renderer.registerRenderer({
    type: 'dynamic',
    render() {
      const element = document.createElement('article')
      element.textContent = 'old'
      return element
    },
    destroy(element) { disposedByOld.push(element) },
  })

  const container = document.createElement('main')
  const data = { blocks: [{ id: 'stable', type: 'dynamic', data: { value: 1 } }] }
  renderer.renderTo(data, container)
  const oldElement = container.children[0].children[0]

  renderer.registerRenderer({
    type: 'dynamic',
    render() {
      const element = document.createElement('section')
      element.textContent = 'new'
      return element
    },
    destroy(element) { disposedByNew.push(element) },
  })
  renderer.renderTo(data, container)
  const newElement = container.children[0].children[0]
  assert.notEqual(newElement, oldElement)
  assert.deepEqual(disposedByOld, [oldElement])
  assert.deepEqual(disposedByNew, [])

  renderer.unregisterRenderer('dynamic')
  renderer.renderTo(data, container)
  assert.equal(container.children[0].children[0].className, 'editor-unknown')
  assert.deepEqual(disposedByNew, [newElement])

  renderer.destroy(container)
  assert.deepEqual(disposedByOld, [oldElement])
  assert.deepEqual(disposedByNew, [newElement])
})

test('producer revisions skip deep signatures while JSON input keeps compatibility fallback', async () => {
  const { EditorRenderer } = await import('./index.js')
  let renderCalls = 0
  const renderer = new EditorRenderer({ blockTypes: [] })
  renderer.registerRenderer({
    type: 'revisioned',
    render(block) {
      renderCalls++
      const element = document.createElement('article')
      element.textContent = block.data.text
      return element
    },
  })

  const container = document.createElement('main')
  renderer.renderTo({
    blocks: [{ id: 'stable', type: 'revisioned', revision: 'hash-1', data: { text: 'first' } }],
  }, container)
  const first = container.children[0].children[0]

  const opaqueData = new Proxy({}, {
    ownKeys() { throw new Error('deep signature was evaluated') },
    getOwnPropertyDescriptor() { throw new Error('deep signature was evaluated') },
  })
  renderer.renderTo({
    blocks: [{ id: 'stable', type: 'revisioned', revision: 'hash-1', data: opaqueData }],
  }, container)
  assert.equal(renderCalls, 1)
  assert.equal(container.children[0].children[0], first)

  renderer.renderTo({
    blocks: [{ id: 'stable', type: 'revisioned', revision: 'hash-2', data: { text: 'second' } }],
  }, container)
  assert.equal(renderCalls, 2)
  assert.notEqual(container.children[0].children[0], first)
})
