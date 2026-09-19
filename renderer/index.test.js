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

test('render observes the blocks collection once', async () => {
  const { EditorRenderer } = await import('./index.js')
  let reads = 0
  const renderer = new EditorRenderer({ blockTypes: [] })
  renderer.registerRenderer({
    type: 'single-read',
    render(block) {
      const element = document.createElement('article')
      element.textContent = block.data.text
      return element
    },
  })
  const first = [{ id: 'a', type: 'single-read', data: { text: 'first' } }]
  const second = [{ id: 'b', type: 'single-read', data: { text: 'second' } }]
  const input = {
    get blocks() {
      reads++
      return reads === 1 ? first : second
    },
  }

  const wrapper = renderer.render(input)
  assert.equal(reads, 1)
  assert.equal(wrapper.children[0].dataset.blockId, 'a')
  assert.equal(wrapper.children[0].textContent, 'first')
  renderer.destroy(wrapper)
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

test('deep-signature renderTo observes caller accessors exactly once', async () => {
  const { EditorRenderer } = await import('./index.js')
  let reads = 0
  const block = {
    id: 'accessor',
    type: 'accessor',
    get data() {
      reads++
      return { text: reads === 1 ? 'first' : 'second' }
    },
  }
  const renderer = new EditorRenderer({ blockTypes: [] })
  renderer.registerRenderer({
    type: 'accessor',
    render(input) {
      const element = document.createElement('article')
      element.textContent = input.data.text
      return element
    },
  })

  const container = document.createElement('main')
  renderer.renderTo({ blocks: [block] }, container)

  assert.equal(reads, 1)
  assert.equal(container.children[0].children[0].textContent, 'first')
  renderer.destroy(container)
})

test('block tunes participate in incremental rendering and apply safe text alignment', async () => {
  const { EditorRenderer } = await import('./index.js')
  let renderCalls = 0
  const renderer = new EditorRenderer({ blockTypes: [] })
  renderer.registerRenderer({
    type: 'tuned',
    render() {
      renderCalls++
      return document.createElement('article')
    },
  })

  const container = document.createElement('main')
  renderer.renderTo({
    blocks: [{ id: 'stable', type: 'tuned', data: {}, tunes: { textAlign: 'center' } }],
  }, container)
  const centered = container.children[0].children[0]
  assert.equal(centered.style.textAlign, 'center')

  renderer.renderTo({
    blocks: [{ id: 'stable', type: 'tuned', data: {}, tunes: { textAlign: 'right' } }],
  }, container)
  const right = container.children[0].children[0]
  assert.equal(renderCalls, 2)
  assert.notEqual(right, centered)
  assert.equal(right.style.textAlign, 'right')

  const unsafe = renderer.renderBlock({
    id: 'unsafe',
    type: 'tuned',
    data: {},
    tunes: { textAlign: 'expression(alert(1))' },
  })
  assert.equal(unsafe.style.textAlign, undefined)
})

test('custom classPrefix keeps consumer classes while retaining bundled style aliases', async () => {
  const { EditorRenderer } = await import('./index.js')
  const renderer = new EditorRenderer({ classPrefix: 'article', blockTypes: ['delimiter'], injectStyles: false })
  const wrapper = renderer.render({
    blocks: [{ id: 'd', type: 'delimiter', data: {} }],
  })

  assert.equal(wrapper.className, 'article-content editor-content')
  assert.equal(wrapper.children[0].className, 'article-delimiter editor-delimiter')

  const custom = new EditorRenderer({ classPrefix: 'article', blockTypes: [], injectStyles: false })
  custom.registerRenderer({
    type: 'custom',
    render() {
      const element = document.createElement('article')
      element.className = 'article-warning'
      return element
    },
  })
  assert.equal(custom.renderBlock({ type: 'custom', data: {} }).className, 'article-warning')
})


test('renderer contains rejected validation observer promises', async () => {
  const { EditorRenderer } = await import('./index.js')
  let calls = 0
  const renderer = new EditorRenderer({
    blockTypes: ['table'],
    validationMode: 'preserve',
    async onValidationError() {
      calls++
      throw new Error('async renderer validation failure')
    },
  })

  assert.doesNotThrow(() => renderer.renderBlock({
    id: 'table-async',
    type: 'table',
    data: { content: 'invalid-table-content' },
  }))
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(calls, 1)
})


test('renderer validation observer cannot synchronously recurse on the same invalid block', async () => {
  const { EditorRenderer } = await import('./index.js')
  let calls = 0
  let renderer
  const block = {
    id: 'table-reentrant',
    type: 'table',
    data: { content: 'invalid-table-content' },
  }
  renderer = new EditorRenderer({
    blockTypes: ['table'],
    validationMode: 'preserve',
    onValidationError() {
      calls++
      assert.doesNotThrow(() => renderer.renderBlock(block))
    },
  })

  const element = renderer.renderBlock(block)
  assert.equal(calls, 1)
  renderer.destroy(element)
  renderer.destroy()
})


test('renderer validation guard survives an async observer until settlement', async () => {
  const { EditorRenderer } = await import('./index.js')
  let calls = 0
  let renderer
  const block = {
    id: 'table-async-reentrant',
    type: 'table',
    data: { content: 'invalid-table-content' },
  }
  renderer = new EditorRenderer({
    blockTypes: ['table'],
    validationMode: 'preserve',
    async onValidationError() {
      calls++
      await Promise.resolve()
      const nested = renderer.renderBlock(block)
      renderer.destroy(nested)
    },
  })

  const element = renderer.renderBlock(block)
  for (let index = 0; index < 6; index++) await Promise.resolve()
  assert.equal(calls, 1)
  renderer.destroy(element)
  renderer.destroy()
})


test('renderer validation contains hostile thenable accessors and releases its guard', async () => {
  const { EditorRenderer } = await import('./index.js')
  let calls = 0
  const block = {
    id: 'table-hostile-thenable',
    type: 'table',
    data: { content: 'invalid-table-content' },
  }
  const renderer = new EditorRenderer({
    blockTypes: ['table'],
    validationMode: 'preserve',
    onValidationError() {
      calls++
      return Object.defineProperty({}, 'then', {
        get() { throw new Error('hostile then getter') },
      })
    },
  })

  const first = renderer.renderBlock(block)
  const second = renderer.renderBlock(block)
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(calls, 2)
  renderer.destroy(first)
  renderer.destroy(second)
  renderer.destroy()
})


test('async validation guard does not suppress independent invalid blocks', async () => {
  const { EditorRenderer } = await import('./index.js')
  const seen = []
  let releaseFirst
  const firstPending = new Promise(resolve => { releaseFirst = resolve })
  const renderer = new EditorRenderer({
    blockTypes: ['table'],
    validationMode: 'preserve',
    async onValidationError(issue) {
      seen.push(issue.blockId)
      if (issue.blockId === 'table-a') await firstPending
    },
  })

  const first = renderer.renderBlock({
    id: 'table-a',
    type: 'table',
    data: { content: 'invalid-a' },
  })
  const second = renderer.renderBlock({
    id: 'table-b',
    type: 'table',
    data: { content: 'invalid-b' },
  })

  assert.deepEqual(seen, ['table-a', 'table-b'])
  releaseFirst()
  for (let index = 0; index < 4; index++) await Promise.resolve()
  renderer.destroy(first)
  renderer.destroy(second)
  renderer.destroy()
})


test('renderer rejects non-finite numeric block revisions', async () => {
  const { EditorRenderer } = await import('./index.js')
  const renderer = new EditorRenderer({ blockTypes: [] })
  renderer.registerRenderer({
    type: 'revision-check',
    render() { return document.createElement('article') },
  })

  for (const revision of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.throws(
      () => renderer.renderBlock({ type: 'revision-check', revision, data: {} }),
      /revision must be a string or finite number/,
    )
  }
})


test('renderTo rejects reentry for the same container before ownership can be overwritten', async () => {
  const { EditorRenderer } = await import('./index.js')
  const renderer = new EditorRenderer({ blockTypes: [] })
  const container = document.createElement('main')
  let nestedAttempts = 0

  renderer.registerRenderer({
    type: 'reentrant-container',
    render(block) {
      nestedAttempts++
      renderer.renderTo({
        blocks: [{ id: 'nested', type: 'reentrant-container-leaf', data: {} }],
      }, container)
      return document.createElement('article')
    },
  })
  renderer.registerRenderer({
    type: 'reentrant-container-leaf',
    render() { return document.createElement('span') },
  })

  assert.throws(
    () => renderer.renderTo({
      blocks: [{ id: 'outer', type: 'reentrant-container', data: {} }],
    }, container),
    /Cannot reenter renderTo() for the same container/,
  )
  assert.equal(nestedAttempts, 1)
  assert.equal(container.children.length, 0, 'failed outer render must not leave staged nested output mounted')
})


test('renderTo prevents destroy from double-disposing the previous mounted owner', async () => {
  const { EditorRenderer } = await import('./index.js')
  const renderer = new EditorRenderer({ blockTypes: [] })
  const container = document.createElement('main')
  let oldDestroyCalls = 0

  renderer.registerRenderer({
    type: 'owned-before-reentry',
    render() { return document.createElement('article') },
    destroy() { oldDestroyCalls++ },
  })
  renderer.renderTo({
    blocks: [{ id: 'stable', type: 'owned-before-reentry', data: {} }],
  }, container)

  renderer.registerRenderer({
    type: 'destroy-during-render',
    render() {
      renderer.destroy(container)
      return document.createElement('section')
    },
  })

  assert.throws(
    () => renderer.renderTo({
      blocks: [{ id: 'next', type: 'destroy-during-render', data: {} }],
    }, container),
    /Cannot destroy renderer output during an active renderTo()/,
  )
  assert.equal(oldDestroyCalls, 0, 'previous mounted owner must remain live after rejected reentrant destroy')

  renderer.destroy(container)
  assert.equal(oldDestroyCalls, 1, 'previous mounted owner must be disposed exactly once')
})
