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


for (const kind of ['block', 'document', 'container']) {
  test(`destroy(${kind}) detaches ownership before calling a reentrant disposer`, async () => {
    const { EditorRenderer } = await import('./index.js')
    const renderer = new EditorRenderer({ blockTypes: [], injectStyles: false })
    let target
    let calls = 0
    renderer.registerRenderer({
      schema: passthroughSchema,
      type: 'dispose-probe',
      render() { return document.createElement('article') },
      destroy() {
        calls++
        if (calls === 1) renderer.destroy(target)
      },
    })
    const block = { id: 'a', type: 'dispose-probe', dataVersion: 1, data: {} }
    if (kind === 'block') target = renderer.renderBlock(block)
    else if (kind === 'document') target = renderer.render({ version: '2.0.0', blocks: [block] })
    else {
      target = document.createElement('main')
      renderer.renderTo({ version: '2.0.0', blocks: [block] }, target)
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
  const input = { version: '2.0.0', blocks: [{ id: 'invalid', type: 'table', dataVersion: 2, data: { content: 'invalid' } }] }
  let reports = 0
  const renderer = new EditorRenderer({
    blockTypes: ['table'], injectStyles: false,
    onValidationError() {
      reports++
      if (reports === 1) assert.throws(() => renderer.renderTo(input, second), { name: 'InvalidBlockDataError' })
    },
  })
  assert.throws(() => renderer.renderTo(input, first), { name: 'InvalidBlockDataError' })
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
    schema: passthroughSchema,
    type: 'owner',
    render(block) { const element = document.createElement('article'); element.textContent = block.id; return element },
    destroy(element) {
      disposed.push(element.textContent)
      if (element.textContent === 'first') {
        renderer.destroy(second)
        replacement = renderer.renderBlock({ id: 'replacement', type: 'owner', dataVersion: 1, data: {} })
      }
    },
  })
  renderer.renderTo({ version: '2.0.0', blocks: [{ id: 'first', type: 'owner', dataVersion: 1, data: {} }] }, document.createElement('main'))
  second = renderer.renderBlock({ id: 'second', type: 'owner', dataVersion: 1, data: {} })
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
    schema: passthroughSchema,
    type: 'owner', render() { return document.createElement('article') },
    destroy() {
      try { renderer.renderTo({ version: '2.0.0', blocks: [] }, container) }
      catch (error) { rejected = /Cannot reenter renderTo/.test(String(error)) }
    },
  })
  renderer.renderTo({ version: '2.0.0', blocks: [{ id: 'owner-1', type: 'owner', dataVersion: 1, data: {} }] }, container)
  renderer.destroy(container)
  assert.equal(rejected, true)
  renderer.renderTo({ version: '2.0.0', blocks: [] }, container)
  renderer.destroy(container)
})

test('failed mounted block insertion after mutation restores DOM and releases only the new owner', async () => {
  const { EditorRenderer } = await import('./index.js')
  const released = []
  const created = []
  const renderer = new EditorRenderer({ blockTypes: [], injectStyles: false })
  renderer.registerRenderer({
    type: 'atomic-dom', schema: passthroughSchema,
    render(block) {
      const element = document.createElement('article')
      element.textContent = block.data.text
      created.push(element)
      return element
    },
    destroy(element) { released.push(element) },
  })
  const documentFor = text => ({
    version: '2.0.0',
    blocks: [{ id: 'a', type: 'atomic-dom', dataVersion: 1, data: { text } }],
  })
  const container = document.createElement('main')
  renderer.renderTo(documentFor('old'), container)
  const wrapper = container.firstChild
  const previous = wrapper.firstChild
  const insert = wrapper.insertBefore
  let first = true
  wrapper.insertBefore = function (...args) {
    const result = insert.apply(this, args)
    if (first) {
      first = false
      throw new Error('injected failure after insertion')
    }
    return result
  }

  assert.throws(() => renderer.renderTo(documentFor('new'), container), /injected failure after insertion/)
  assert.equal(container.firstChild, wrapper)
  assert.equal(wrapper.firstChild, previous)
  assert.deepEqual(released, [created[1]], 'newly created result must be destroyed exactly once')

  wrapper.insertBefore = insert
  renderer.renderTo(documentFor('new'), container)
  assert.equal(wrapper.firstChild, created[2])
  assert.deepEqual(released, [created[1], previous], 'successful retry releases only the retired old result')
  renderer.destroy(container)
  assert.deepEqual(released, [created[1], previous, created[2]], 'each result has exactly one disposer')
})

test('failed container replacement after DOM mutation restores caller siblings and existing owner', async () => {
  const { EditorRenderer } = await import('./index.js')
  const released = []
  const created = []
  const renderer = new EditorRenderer({ blockTypes: [], injectStyles: false })
  renderer.registerRenderer({
    type: 'replace-atomic', schema: passthroughSchema,
    render(block) {
      const element = document.createElement('article')
      element.textContent = block.data.text
      created.push(element)
      return element
    },
    destroy(element) { released.push(element) },
  })
  const documentFor = text => ({
    version: '2.0.0',
    blocks: [{ id: 'a', type: 'replace-atomic', dataVersion: 1, data: { text } }],
  })
  const container = document.createElement('main')
  renderer.renderTo(documentFor('old'), container)
  const wrapper = container.firstChild
  const previous = wrapper.firstChild
  const extra = document.createElement('aside')
  container.appendChild(extra)

  const replace = container.replaceChildren
  let first = true
  container.replaceChildren = function (...args) {
    const result = replace.apply(this, args)
    if (first) {
      first = false
      throw new Error('injected failure after replace')
    }
    return result
  }
  assert.throws(() => renderer.renderTo(documentFor('new'), container), /injected failure after replace/)
  assert.equal(wrapper.firstChild, previous)
  assert.deepEqual(container.children, [wrapper, extra], 'preexisting outer DOM must be restored')
  assert.deepEqual(released, [created[1]])
  container.replaceChildren = replace

  renderer.destroy(container)
  assert.deepEqual(released, [created[1], previous])
})

test('successful renderTo publishes replacement before invoking the old owner disposer', async () => {
  const { EditorRenderer } = await import('./index.js')
  const container = document.createElement('main')
  const observed = []
  const renderer = new EditorRenderer({ blockTypes: [], injectStyles: false })
  renderer.registerRenderer({
    type: 'dispose-order', schema: passthroughSchema,
    render(block) {
      const element = document.createElement('article')
      element.textContent = block.data.text
      return element
    },
    destroy(element) {
      observed.push({
        disposed: element.textContent,
        mounted: container.firstChild?.firstChild?.textContent,
      })
    },
  })
  const documentFor = text => ({
    version: '2.0.0',
    blocks: [{ id: 'a', type: 'dispose-order', dataVersion: 1, data: { text } }],
  })
  renderer.renderTo(documentFor('old'), container)
  renderer.renderTo(documentFor('new'), container)
  assert.deepEqual(observed, [{ disposed: 'old', mounted: 'new' }])
  renderer.destroy(container)
  assert.equal(observed.length, 2)
})

test('asynchronous custom block rendering is rejected synchronously', async () => {
  const { EditorRenderer } = await import('./index.js')
  const renderer = new EditorRenderer({ blockTypes: [], injectStyles: false })
  renderer.registerRenderer({
    type: 'async-block',
    schema: passthroughSchema,
    render() { return Promise.resolve(document.createElement('article')) },
  })

  assert.throws(
    () => renderer.renderBlock({ id: 'async', type: 'async-block', dataVersion: 1, data: {} }),
    /must complete synchronously/,
  )
  renderer.destroy()
})

test('one element cannot be mounted as two live blocks', async () => {
  const { EditorRenderer } = await import('./index.js')
  const element = document.createElement('article')
  const released = []
  const renderer = new EditorRenderer({ blockTypes: [], injectStyles: false })
  renderer.registerRenderer({
    type: 'singleton', schema: passthroughSchema,
    render() { return element }, destroy(value) { released.push(value) },
  })
  const block = id => ({ id, type: 'singleton', dataVersion: 1, data: {} })
  const container = document.createElement('main')
  assert.throws(() => renderer.renderTo({ version: '2.0.0', blocks: [block('a'), block('b')] }, container), /fresh HTMLElement/)
  assert.equal(container.children.length, 0)
  assert.deepEqual(released, [element])
  renderer.renderTo({ version: '2.0.0', blocks: [block('c')] }, container)
  renderer.destroy(container)
  assert.deepEqual(released, [element, element], 'an element may be reused after release')
})

test('live element ownership is exclusive across renderer instances', async () => {
  const { EditorRenderer } = await import('./index.js')
  const element = document.createElement('article')
  const released = []
  const plugin = {
    type: 'singleton-cross', schema: passthroughSchema,
    render() { return element }, destroy(value) { released.push(value) },
  }
  const a = new EditorRenderer({ blockTypes: [], injectStyles: false })
  const b = new EditorRenderer({ blockTypes: [], injectStyles: false })
  a.registerRenderer(plugin)
  b.registerRenderer(plugin)
  const block = { id: 'a', type: 'singleton-cross', dataVersion: 1, data: {} }
  const owned = a.renderBlock(block)
  assert.throws(() => b.renderBlock(block), /fresh HTMLElement/)
  assert.deepEqual(released, [], 'failure must not release another renderer owner')
  a.destroy(owned)
  const next = b.renderBlock(block)
  b.destroy(next)
  assert.deepEqual(released, [element, element])
})

test('foreign-document HTMLElement is rejected and disposed', async () => {
  const { EditorRenderer } = await import('./index.js')
  const foreign = document.createElement('article')
  foreign.ownerDocument = { defaultView: { HTMLElement: FakeElement } }
  const released = []
  const renderer = new EditorRenderer({ blockTypes: [], injectStyles: false })
  renderer.registerRenderer({
    type: 'foreign-root', schema: passthroughSchema,
    render() { return foreign }, destroy(element) { released.push(element) },
  })
  assert.throws(() => renderer.renderBlock({ id: 'foreign', type: 'foreign-root', dataVersion: 1, data: {} }), /owning document/)
  assert.deepEqual(released, [foreign])
  renderer.destroy()
})

test('failed decoration releases newly-created HTMLElement before a retry', async () => {
  const { EditorRenderer } = await import('./index.js')
  const element = document.createElement('article')
  Object.freeze(element.dataset)
  const released = []
  const renderer = new EditorRenderer({ blockTypes: [], injectStyles: false })
  renderer.registerRenderer({
    type: 'decoration-failure', schema: passthroughSchema,
    render() { return element }, destroy(value) { released.push(value) },
  })
  const block = { id: 'a', type: 'decoration-failure', dataVersion: 1, data: {} }
  assert.throws(() => renderer.renderBlock(block), TypeError)
  assert.deepEqual(released, [element])
  element.dataset = {}
  const recovered = renderer.renderBlock(block)
  renderer.destroy(recovered)
  assert.deepEqual(released, [element, element])
})

test('async cleanup return is rejected and contained while owner is released once', async () => {
  const { EditorRenderer } = await import('./index.js')
  const renderer = new EditorRenderer({ blockTypes: [], injectStyles: false })
  let readThen = 0
  let destroyed = 0
  renderer.registerRenderer({
    type: 'async-destroy', schema: passthroughSchema,
    render() { return document.createElement('article') },
    destroy() {
      destroyed++
      return Object.defineProperty({}, 'then', {
        get() {
          readThen++
          return (_resolve, reject) => reject(new Error('async destroy failure'))
        },
      })
    },
  })
  const block = { id: 'a', type: 'async-destroy', dataVersion: 1, data: {} }
  const originalWarn = console.warn
  const warnings = []
  try {
    console.warn = (...values) => { warnings.push(values) }
    const first = renderer.renderBlock(block)
    renderer.destroy(first)
    await Promise.resolve()
    await Promise.resolve()
    assert.equal(destroyed, 1)
    assert.equal(readThen, 1, 'cleanup thenable must be observed exactly once')
    assert.equal(warnings.length, 1, 'async completion violates the synchronous contract')
    const second = renderer.renderBlock(block)
    renderer.destroy(second)
    assert.equal(destroyed, 2)
    assert.equal(readThen, 2)
  } finally {
    console.warn = originalWarn
    renderer.destroy()
  }
})

test('destroy(container) preserves application nodes placed after renderTo', async () => {
  const { EditorRenderer } = await import('./index.js')
  const renderer = new EditorRenderer({ blockTypes: [], injectStyles: false })
  const released = []
  renderer.registerRenderer({
    type: 'retired-output', schema: passthroughSchema,
    render() { return document.createElement('article') },
    destroy(element) { released.push(element) },
  })
  const container = document.createElement('main')
  const data = { version: '2.0.0', blocks: [
    { id: 'one', type: 'retired-output', dataVersion: 1, data: {} },
  ] }
  renderer.renderTo(data, container)
  const owned = container.firstChild.firstChild
  const external = document.createElement('aside')
  container.replaceChildren(external)
  renderer.destroy(container)

  assert.deepEqual(container.children, [external], 'renderer cannot clear the host replacement')
  assert.deepEqual(released, [owned], 'the original renderer-owned resource was still released')
  renderer.destroy(container)
  assert.deepEqual(released, [owned])
})

test('tearing down a displaced renderer does not delete a successor renderer output', async () => {
  const { EditorRenderer } = await import('./index.js')
  const first = new EditorRenderer({ blockTypes: [], injectStyles: false })
  const second = new EditorRenderer({ blockTypes: [], injectStyles: false })
  const released = []
  first.registerRenderer({
    type: 'first-output', schema: passthroughSchema,
    render() { return document.createElement('article') },
    destroy() { released.push('first') },
  })
  second.registerRenderer({
    type: 'second-output', schema: passthroughSchema,
    render() { return document.createElement('section') },
    destroy() { released.push('second') },
  })
  const container = document.createElement('main')
  first.renderTo({ version: '2.0.0', blocks: [
    { id: 'one', type: 'first-output', dataVersion: 1, data: {} },
  ] }, container)
  second.renderTo({ version: '2.0.0', blocks: [
    { id: 'two', type: 'second-output', dataVersion: 1, data: {} },
  ] }, container)
  const successor = container.firstChild
  first.destroy(container)
  assert.equal(container.firstChild, successor)
  assert.deepEqual(released, ['first'])
  second.destroy(container)
  assert.equal(container.children.length, 0)
  assert.deepEqual(released, ['first', 'second'])
})

test('a custom block renderer cannot steal an existing connected application element', async () => {
  const { EditorRenderer } = await import('./index.js')
  const application = document.createElement('section')
  const borrowed = document.createElement('article')
  application.appendChild(borrowed)
  // Model the native DOM's connected flag; this minimal fixture does not
  // implement isConnected based on document roots.
  Object.defineProperty(borrowed, 'isConnected', { value: true })
  const destroyed = []
  const renderer = new EditorRenderer({ blockTypes: [], injectStyles: false })
  renderer.registerRenderer({
    type: 'borrowed-node',
    schema: passthroughSchema,
    render() { return borrowed },
    destroy(element) { destroyed.push(element) },
  })
  const container = document.createElement('main')
  assert.throws(() => renderer.renderTo({
    version: '2.0.0',
    blocks: [{ id: 'borrowed', type: 'borrowed-node', dataVersion: 1, data: {} }],
  }, container), /must return a detached HTMLElement/)
  assert.equal(application.firstChild, borrowed)
  assert.equal(container.children.length, 0)
  assert.deepEqual(destroyed, [], 'a foreign live node is not a resource this renderer acquired')
  renderer.destroy(container)
  assert.equal(application.firstChild, borrowed)
})


for (const method of ['renderBlock', 'render', 'renderTo']) {
  test(`${method} cannot steal elements already parented in a disconnected host`, async () => {
    const { EditorRenderer } = await import('./index.js')
    const application = document.createElement('section')
    const borrowed = document.createElement('article')
    application.appendChild(borrowed)
    // This host is not connected to the document. isConnected alone is
    // insufficient to establish that the returned element is unowned.
    assert.equal(borrowed.isConnected, undefined)
    const disposed = []
    const renderer = new EditorRenderer({ blockTypes: [], injectStyles: false })
    renderer.registerRenderer({
      type: 'parented-node',
      schema: passthroughSchema,
      render() { return borrowed },
      destroy(element) { disposed.push(element) },
    })
    const block = { id: 'b', type: 'parented-node', dataVersion: 1, data: {} }
    const container = document.createElement('main')
    try {
      assert.throws(() => {
        if (method === 'renderBlock') renderer.renderBlock(block)
        else if (method === 'render') renderer.render({ version: '2.0.0', blocks: [block] })
        else renderer.renderTo({ version: '2.0.0', blocks: [block] }, container)
      }, /must return a detached HTMLElement/)
      assert.equal(application.firstChild, borrowed, 'renderer stole a detached application node')
      assert.equal(container.children.length, 0, 'failed render changed its target')
      assert.deepEqual(disposed, [], 'foreign node must not be disposed by Rector')
    } finally {
      renderer.destroy()
    }
    assert.equal(application.firstChild, borrowed)
  })
}

test('a custom detached block element remains accepted after connected-node rejection', async () => {
  const { EditorRenderer } = await import('./index.js')
  const detached = document.createElement('article')
  const renderer = new EditorRenderer({ blockTypes: [], injectStyles: false })
  renderer.registerRenderer({
    type: 'detached-node',
    schema: passthroughSchema,
    render() { return detached },
  })
  const block = { id: 'detached', type: 'detached-node', dataVersion: 1, data: {} }
  assert.equal(renderer.renderBlock(block), detached)
  renderer.destroy(detached)
})
test('block renderer cannot return a node adopted during dataset decoration', async () => {
  const { EditorRenderer } = await import('./index.js')
  const renderer = new EditorRenderer({ blockTypes: [], injectStyles: false })
  const outside = document.createElement('aside')
  let node
  let disposals = 0
  renderer.registerRenderer({
    type: 'adopted-decoration',
    schema: passthroughSchema,
    render() {
      node = document.createElement('article')
      Object.defineProperty(node.dataset, 'blockType', {
        configurable: true,
        set() { outside.appendChild(node) },
      })
      return node
    },
    destroy() { disposals++ },
  })
  try {
    assert.throws(
      () => renderer.renderBlock({
        id: 'first', type: 'adopted-decoration', dataVersion: 1, data: {},
      }),
      /detached HTMLElement/,
      'an attribute callback adopted the node after its initial ownership check',
    )
    assert.equal(outside.children[0], node,
      'failed detached rendering stole the element from its newer parent')
    assert.equal(disposals, 1,
      'a provisionally acquired renderer instance was not released exactly once')
  } finally {
    renderer.destroy()
  }
  assert.equal(disposals, 1)
})

test('mounted renderer does not steal nodes adopted by a later decoration callback', async () => {
  const { EditorRenderer } = await import('./index.js')
  const renderer = new EditorRenderer({ blockTypes: [], injectStyles: false })
  const container = document.createElement('main')
  const outside = document.createElement('aside')
  let node
  let disposals = 0
  renderer.registerRenderer({
    type: 'adopted-decoration',
    schema: passthroughSchema,
    render() {
      node = document.createElement('article')
      Object.defineProperty(node.dataset, 'blockType', {
        configurable: true,
        set() { outside.appendChild(node) },
      })
      return node
    },
    destroy() { disposals++ },
  })
  try {
    assert.throws(
      () => renderer.renderTo({
        version: '2.0.0',
        blocks: [{ id: 'first', type: 'adopted-decoration', dataVersion: 1, data: {} }],
      }, container),
      /detached HTMLElement/,
    )
    assert.equal(container.children.length, 0,
      'failed staging still published a block owned by another DOM subtree')
    assert.equal(outside.children[0], node,
      'the staged renderer detached an element claimed during its attribute callback')
    assert.equal(disposals, 1)
  } finally {
    renderer.destroy()
  }
  assert.equal(disposals, 1)
})
test('block renderer rejects an element adopted by a foreign document during decoration', async () => {
  const { EditorRenderer } = await import('./index.js')
  const renderer = new EditorRenderer({ blockTypes: [], injectStyles: false })
  const foreignDocument = { foreignOwner: true }
  let element
  let releases = 0
  renderer.registerRenderer({
    type: 'reassigned-realm',
    schema: passthroughSchema,
    render() {
      element = document.createElement('article')
      Object.defineProperty(element.dataset, 'blockType', {
        configurable: true,
        set() { element.ownerDocument = foreignDocument },
      })
      return element
    },
    destroy() { releases++ },
  })
  try {
    assert.throws(
      () => renderer.renderBlock({
        id: 'a', type: 'reassigned-realm', dataVersion: 1, data: {},
      }),
      /owning document/,
      'custom-element callback changed the owning document after the initial realm check',
    )
    assert.equal(element.ownerDocument, foreignDocument,
      'renderer took ownership of a node adopted by a different document')
    assert.equal(releases, 1)
  } finally {
    renderer.destroy()
  }
  assert.equal(releases, 1)
})
