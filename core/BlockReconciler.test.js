import test from 'node:test'
import assert from 'node:assert/strict'

import { BlockReconciler } from './BlockReconciler.js'
import { DocumentStore } from './DocumentStore.js'

class FakeElement {
  constructor(tag, ownerDocument) {
    this.tagName = tag.toUpperCase()
    this.ownerDocument = ownerDocument
    this.parentNode = null
    this.children = []
    this.dataset = {}
    this.style = {}
    this.className = ''
    this.textContent = ''
    this.contentEditable = 'inherit'
  }
  get firstChild() { return this.children[0] ?? null }
  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child)
    this.children.push(child)
    child.parentNode = this
    return child
  }
  append(...children) { for (const child of children) this.appendChild(child) }
  removeChild(child) {
    const index = this.children.indexOf(child)
    if (index >= 0) this.children.splice(index, 1)
    child.parentNode = null
    return child
  }
  replaceChildren(...children) {
    for (const child of [...this.children]) this.removeChild(child)
    for (const child of children) this.appendChild(child)
  }
  replaceWith(next) {
    const parent = this.parentNode
    if (!parent) return
    const index = parent.children.indexOf(this)
    if (next.parentNode) next.parentNode.removeChild(next)
    parent.children[index] = next
    next.parentNode = parent
    this.parentNode = null
  }
  remove() { this.parentNode?.removeChild(this) }
  focus() {}
}

class FakeDocument {
  constructor() {
    this.defaultView = { AbortController }
  }
  createElement(tag) { return new FakeElement(tag, this) }
}

function block(id, text = id, type = 'paragraph') {
  return { id, type, data: { text } }
}

function createRegistry(document, counters) {
  const runtimes = new Map()
  for (const type of ['paragraph', 'heading']) {
    runtimes.set(type, {
      create(initial) {
        counters.create++
        const element = document.createElement(type === 'heading' ? 'h2' : 'p')
        element.textContent = initial.text
        let destroyed = false
        return {
          element,
          read() { return { text: element.textContent } },
          update(next) {
            counters.update++
            element.textContent = next.text
            if (next.fail) throw new Error('update failed')
          },
          editableFields() { return [{ key: 'text', element, mode: 'rich-text' }] },
          setReadOnly(value) {
            counters.readOnly++
            element.contentEditable = value ? 'false' : 'true'
          },
          destroy() {
            if (destroyed) return
            destroyed = true
            counters.destroy++
          },
        }
      },
      destroy() {},
    })
  }
  return {
    hasBlock(type) { return runtimes.has(type) },
    getBlockRuntime(type) { return runtimes.get(type) },
  }
}

function setup(count = 3) {
  const document = new FakeDocument()
  const container = document.createElement('div')
  const counters = { create: 0, update: 0, destroy: 0, readOnly: 0 }
  const registry = createRegistry(document, counters)
  const store = new DocumentStore({
    version: '2.0.0',
    blocks: Array.from({ length: count }, (_, index) => block(String(index))),
  })
  const reconciler = new BlockReconciler({
    container,
    registry,
    contextFactory() {
      return {
        getData: () => ({}),
        updateData() {},
        commitDomMutation(fn) { fn() },
        requestSplit() {},
        requestExit() {},
        createId(prefix) { return prefix + '-id' },
      }
    },
  })
  reconciler.mount(store)
  return { document, container, counters, registry, store, reconciler }
}

test('single update among 1000 blocks touches only one mounted instance', () => {
  const { store, reconciler, counters } = setup(1000)
  counters.create = counters.update = counters.destroy = 0
  const unrelated = reconciler.getElement('499')

  const draft = store.createDraft()
  draft.update('500', block('500', 'changed'))
  const prepared = reconciler.prepare({ store, draft, changes: draft.changes })
  prepared.apply()
  store.commit(draft)

  assert.equal(counters.update, 1)
  assert.equal(counters.create, 0)
  assert.equal(counters.destroy, 0)
  assert.equal(reconciler.getElement('499'), unrelated)
  assert.equal(reconciler.getElement('500').textContent, 'changed')
})

test('move preserves block instance and DOM identity', () => {
  const { store, reconciler, container, counters } = setup(3)
  counters.create = counters.update = counters.destroy = 0
  const moved = reconciler.getElement('0')

  const draft = store.createDraft()
  draft.move('0', 2)
  reconciler.prepare({ store, draft, changes: draft.changes }).apply()
  store.commit(draft)

  assert.equal(reconciler.getElement('0'), moved)
  assert.deepEqual(container.children.map(node => node.textContent), ['1', '2', '0'])
  assert.deepEqual(counters, { create: 0, update: 0, destroy: 0, readOnly: 0 })
})

test('type conversion replaces only the affected instance', () => {
  const { store, reconciler, counters } = setup(3)
  counters.create = counters.update = counters.destroy = 0
  const unrelated = reconciler.getElement('0')
  const old = reconciler.getElement('1')

  const draft = store.createDraft()
  draft.update('1', block('1', 'heading', 'heading'))
  reconciler.prepare({ store, draft, changes: draft.changes }).apply()
  store.commit(draft)

  assert.equal(reconciler.getElement('0'), unrelated)
  assert.notEqual(reconciler.getElement('1'), old)
  assert.equal(reconciler.getElement('1').tagName, 'H2')
  assert.equal(counters.create, 1)
  assert.equal(counters.destroy, 1)
})

test('read-only transition does not recreate block instances', () => {
  const { reconciler, counters } = setup(3)
  counters.create = counters.update = counters.destroy = counters.readOnly = 0
  const before = reconciler.getElement('1')

  reconciler.setReadOnly(true)
  assert.equal(reconciler.getElement('1'), before)
  assert.equal(counters.readOnly, 3)
  assert.equal(counters.create, 0)
  assert.equal(counters.destroy, 0)
})

test('failed update can recover committed projection', () => {
  const { store, reconciler, counters } = setup(3)
  counters.create = counters.update = counters.destroy = 0
  const draft = store.createDraft()
  draft.update('1', {
    id: '1',
    type: 'paragraph',
    data: { text: 'bad', fail: true },
  })
  const prepared = reconciler.prepare({ store, draft, changes: draft.changes })

  assert.throws(() => prepared.apply(), /update failed/)
  prepared.recover()

  assert.equal(store.get('1').data.text, '1')
  assert.equal(reconciler.getElement('1').textContent, '1')
  assert.equal(reconciler.getElement('0').textContent, '0')
})

test('unknown block types stay inert and never call a plugin runtime', () => {
  const { document, registry, counters } = setup(1)
  const container = document.createElement('div')
  const store = new DocumentStore({
    version: '2.0.0',
    blocks: [{ id: 'x', type: 'future', data: { html: '<img onerror=bad()>' } }],
  })
  counters.create = 0
  const reconciler = new BlockReconciler({ container, registry, contextFactory: () => ({}) })
  reconciler.mount(store)

  assert.equal(counters.create, 0)
  assert.equal(reconciler.getElement('x').dataset.oePreservedBlock, 'future')
  assert.equal(reconciler.getElement('x').contentEditable, 'false')
})


test('preserve activation keeps a registered block type inert', () => {
  const { document, registry, counters } = setup(1)
  const container = document.createElement('div')
  const store = new DocumentStore({
    version: '2.0.0',
    blocks: [{ id: 'x', type: 'paragraph', data: { text: 'opaque' } }],
  })
  counters.create = 0
  const reconciler = new BlockReconciler({
    container,
    registry,
    activationResolver: id => id !== 'x',
    contextFactory: () => ({}),
  })
  reconciler.mount(store)

  assert.equal(counters.create, 0)
  assert.equal(reconciler.getElement('x').dataset.oePreservedBlock, 'paragraph')
})
