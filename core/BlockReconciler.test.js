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
  get firstElementChild() { return this.children[0] ?? null }
  get nextSibling() {
    if (!this.parentNode) return null
    const index = this.parentNode.children.indexOf(this)
    return index >= 0 ? this.parentNode.children[index + 1] ?? null : null
  }
  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child)
    this.children.push(child)
    child.parentNode = this
    return child
  }
  insertBefore(child, anchor) {
    if (child.parentNode) child.parentNode.removeChild(child)
    const index = anchor === null ? this.children.length : this.children.indexOf(anchor)
    if (index < 0) throw new Error('insertBefore anchor is not a child')
    this.children.splice(index, 0, child)
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
  contains(node) {
    for (let current = node; current; current = current.parentNode) {
      if (current === this) return true
    }
    return false
  }
  focus() {}
}

class FakeDocument {
  constructor() {
    this.defaultView = { AbortController, HTMLElement: FakeElement }
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
    getBlockDefinition(type) {
      return runtimes.has(type) ? { type } : undefined
    },
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
  prepared.finalize()

  assert.equal(counters.update, 1)
  assert.equal(counters.create, 0)
  assert.equal(counters.destroy, 0)
  assert.equal(reconciler.getElement('499'), unrelated)
  assert.equal(reconciler.getElement('500').firstElementChild.textContent, 'changed')
})

test('move preserves block instance and DOM identity', () => {
  const { store, reconciler, container, counters } = setup(3)
  counters.create = counters.update = counters.destroy = counters.readOnly = 0
  const moved = reconciler.getElement('0')

  const draft = store.createDraft()
  draft.move('0', 2)
  const prepared = reconciler.prepare({ store, draft, changes: draft.changes })
  prepared.apply()
  store.commit(draft)
  prepared.finalize()

  assert.equal(reconciler.getElement('0'), moved)
  assert.deepEqual(container.children.map(node => node.firstElementChild.textContent), ['1', '2', '0'])
  assert.deepEqual(counters, { create: 0, update: 0, destroy: 0, readOnly: 0 })
})

test('type conversion replaces only the affected instance', () => {
  const { store, reconciler, counters } = setup(3)
  counters.create = counters.update = counters.destroy = 0
  const unrelated = reconciler.getElement('0')
  const old = reconciler.getElement('1')

  const draft = store.createDraft()
  draft.update('1', block('1', 'heading', 'heading'))
  const prepared = reconciler.prepare({ store, draft, changes: draft.changes })
  prepared.apply()
  assert.equal(counters.destroy, 0, 'superseded owner must stay alive before commit')
  store.commit(draft)
  prepared.finalize()

  assert.equal(reconciler.getElement('0'), unrelated)
  assert.notEqual(reconciler.getElement('1'), old)
  assert.equal(reconciler.getElement('1').firstElementChild.tagName, 'H2')
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
  const unrelated = reconciler.getElement('0')
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
  assert.equal(reconciler.getElement('1').firstElementChild.textContent, '1')
  assert.equal(reconciler.getElement('0'), unrelated, 'recovery recreated an untouched block')
  assert.equal(reconciler.getElement('0').firstElementChild.textContent, '0')
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
  assert.equal(reconciler.getElement('x').dataset.oeUnregisteredBlock, 'future')
  assert.equal(reconciler.getElement('x').contentEditable, 'false')
})


test('activation resolver can keep a registered block type unregistered', () => {
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
  assert.equal(reconciler.getElement('x').dataset.oeUnregisteredBlock, 'paragraph')
})


test('document replacement recreates same-id block instances and aborts their lifetime', () => {
  const { store, reconciler, counters } = setup(2)
  counters.create = counters.update = counters.destroy = counters.readOnly = 0
  const before = reconciler.getElement('0')

  const draft = store.createDraft()
  draft.replace({
    version: '2.0.0',
    blocks: [block('0', 'replacement'), block('1', '1')],
  })
  const prepared = reconciler.prepare({ store, draft, changes: draft.changes })
  prepared.apply()
  assert.equal(counters.destroy, 0, 'document replacement destroyed old lifetime before commit')
  store.commit(draft, { newGeneration: true })
  prepared.finalize()

  assert.notEqual(reconciler.getElement('0'), before)
  assert.equal(reconciler.getElement('0').firstElementChild.textContent, 'replacement')
  assert.equal(counters.create, 2)
  assert.equal(counters.update, 0)
  assert.equal(counters.destroy, 2)
})


test('core shell survives plugin className rewrites and keeps block identity', () => {
  const ownerDocument = new FakeDocument()
  const registry = {
    hasBlock: type => type === 'probe',
    getBlockDefinition: () => ({
      type: 'probe',
      schema: {
        createDefault: () => ({ text: '' }),
        encode: data => ({ dataVersion: 1, data }),
      },
    }),
    getBlockRuntime: () => ({
      create(data) {
        const element = ownerDocument.createElement('section')
        element.className = 'probe'
        return {
          element,
          read: () => data,
          update() {},
          editableFields: () => [],
          setReadOnly() {
            element.className = 'probe'
          },
          destroy() {},
        }
      },
    }),
  }
  const container = ownerDocument.createElement('div')
  const reconciler = new BlockReconciler({
    container,
    registry,
    contextFactory: () => ({}),
    activationResolver: () => true,
  })
  const store = new DocumentStore({
    version: '2.0.0',
    blocks: [{ id: 'a', type: 'probe', dataVersion: 1, data: { text: '' } }],
  })

  reconciler.mount(store)
  const shell = reconciler.getElement('a')
  assert.equal(shell.className, 'oe-block')
  assert.equal(shell.dataset.blockId, 'a')
  assert.equal(shell.dataset.blockType, 'probe')
  assert.equal(shell.firstElementChild.className, 'probe')

  reconciler.setReadOnly(true)
  assert.equal(shell.className, 'oe-block')
  assert.equal(shell.firstElementChild.className, 'probe')
  assert.equal(reconciler.resolveBlockTarget(shell.firstElementChild), 'a')
})


test('staged replacement context reads candidate data before store commit', () => {
  const ownerDocument = new FakeDocument()
  const container = ownerDocument.createElement('div')
  let candidateRead = null

  const runtimeFor = type => ({
    create(initial, context) {
      if (type === 'heading') candidateRead = context.getData().text
      const element = ownerDocument.createElement(type === 'heading' ? 'h2' : 'p')
      element.textContent = initial.text
      return {
        element,
        read: () => ({ text: element.textContent }),
        update() {},
        editableFields: () => [{ key: 'text', element, mode: 'rich-text' }],
        setReadOnly() {},
        destroy() {},
      }
    },
    destroy() {},
  })

  const registry = {
    hasBlock: type => type === 'paragraph' || type === 'heading',
    getBlockDefinition: type => ({ type }),
    getBlockRuntime: type => runtimeFor(type),
  }
  const store = new DocumentStore({
    version: '2.0.0',
    blocks: [block('a', 'committed', 'paragraph')],
  })
  const reconciler = new BlockReconciler({
    container,
    registry,
    contextFactory(_id, _type, _signal, readRecord) {
      return {
        getData: () => readRecord().data,
        updateData() {},
        commitDomMutation(fn) { fn() },
        requestSplit() {},
        requestExit() {},
        createId(prefix) { return prefix + '-id' },
      }
    },
  })
  reconciler.mount(store)

  const draft = store.createDraft()
  draft.update('a', block('a', 'candidate', 'heading'))
  const prepared = reconciler.prepare({ store, draft, changes: draft.changes })

  assert.equal(candidateRead, 'candidate')
  assert.equal(store.get('a').data.text, 'committed')
  assert.equal(reconciler.getElement('a').firstElementChild.tagName, 'P')

  prepared.discard()
  reconciler.destroy()
})

test('block instance cannot borrow an element already owned by another host', () => {
  const ownerDocument = new FakeDocument()
  const container = ownerDocument.createElement('main')
  const application = ownerDocument.createElement('section')
  const borrowed = ownerDocument.createElement('article')
  application.appendChild(borrowed)
  const released = []
  const registry = {
    hasBlock: () => true,
    getBlockDefinition: type => ({ type }),
    getBlockRuntime: () => ({ create() {
      return {
        element: borrowed, read() { return {} }, setReadOnly() {},
        destroy() { released.push('borrowed') },
      }
    } }),
  }
  const reconciler = new BlockReconciler({ container, registry, contextFactory: () => ({}) })
  const store = new DocumentStore({ version: '2.0.0', blocks: [block('a')] })
  assert.throws(() => reconciler.mount(store), /must return a detached HTMLElement/)
  assert.equal(application.firstChild, borrowed)
  assert.deepEqual(container.children, [])
  assert.deepEqual(released, ['borrowed'])
  reconciler.destroy()
  assert.deepEqual(released, ['borrowed'])
})

test('two block owners cannot share one renderer element', () => {
  const ownerDocument = new FakeDocument()
  const container = ownerDocument.createElement('main')
  const shared = ownerDocument.createElement('article')
  const released = []
  const registry = {
    hasBlock: () => true,
    getBlockDefinition: type => ({ type }),
    getBlockRuntime: () => ({ create(initial) {
      return {
        element: shared, read() { return initial }, setReadOnly() {},
        destroy() { released.push(initial.text) },
      }
    } }),
  }
  const reconciler = new BlockReconciler({ container, registry, contextFactory: () => ({}) })
  const store = new DocumentStore({ version: '2.0.0', blocks: [block('a'), block('b')] })
  assert.throws(() => reconciler.mount(store), /must return a fresh HTMLElement/)
  assert.deepEqual(released, ['a'])
  assert.deepEqual(container.children, [])
  reconciler.destroy()
  assert.deepEqual(released, ['a'])
})

test('block runtime must return an element created in the owning document', () => {
  const doc = new FakeDocument()
  const foreignDoc = new FakeDocument()
  const container = doc.createElement('main')
  const alien = foreignDoc.createElement('article')
  let released = 0
  const registry = {
    hasBlock: () => true,
    getBlockDefinition: type => ({ type }),
    getBlockRuntime: () => ({ create() {
      return {
        element: alien, read() { return {} }, setReadOnly() {},
        destroy() { released++ },
      }
    } }),
  }
  const reconciler = new BlockReconciler({ container, registry, contextFactory: () => ({}) })
  const store = new DocumentStore({ version: '2.0.0', blocks: [block('a')] })
  assert.throws(() => reconciler.mount(store), /owning document/)
  assert.equal(released, 1)
  assert.deepEqual(container.children, [])
  reconciler.destroy()
})

test('destroying a displaced block reconciler preserves the host replacement', () => {
  const ownerDocument = new FakeDocument()
  const container = ownerDocument.createElement('main')
  const replacement = ownerDocument.createElement('aside')
  const counters = { destroyed: 0 }
  const registry = {
    hasBlock: () => true,
    getBlockDefinition: type => ({ type }),
    getBlockRuntime: () => ({ create() {
      return {
        element: ownerDocument.createElement('article'),
        read() { return {} }, setReadOnly() {},
        destroy() { counters.destroyed++ },
      }
    } }),
  }
  const reconciler = new BlockReconciler({ container, registry, contextFactory: () => ({}) })
  const store = new DocumentStore({ version: '2.0.0', blocks: [block('a')] })
  reconciler.mount(store)
  container.replaceChildren(replacement)
  reconciler.destroy()
  assert.deepEqual(container.children, [replacement])
  assert.equal(counters.destroyed, 1)
  reconciler.destroy()
  assert.equal(counters.destroyed, 1)
})

test('a block disposer can mount unrelated application DOM without losing it', () => {
  const ownerDocument = new FakeDocument()
  const container = ownerDocument.createElement('main')
  const addition = ownerDocument.createElement('aside')
  let disposed = 0
  let staleOwnerVisible = null
  let reconciler
  const registry = {
    hasBlock: () => true,
    getBlockDefinition: type => ({ type }),
    getBlockRuntime: () => ({ create() {
      return {
        element: ownerDocument.createElement('article'),
        read() { return {} }, setReadOnly() {},
        destroy() {
          disposed++
          staleOwnerVisible = reconciler.getElement('a') !== undefined
          container.appendChild(addition)
        },
      }
    } }),
  }
  reconciler = new BlockReconciler({ container, registry, contextFactory: () => ({}) })
  reconciler.mount(new DocumentStore({ version: '2.0.0', blocks: [block('a')] }))
  reconciler.destroy()
  assert.equal(disposed, 1)
  assert.equal(staleOwnerVisible, false, 'teardown must revoke the owner map before callback')
  assert.deepEqual(container.children, [addition])
})

test('successful initial mount releases candidate data and reads the current committed store', () => {
  const ownerDocument = new FakeDocument()
  const container = ownerDocument.createElement('main')
  let currentData
  const registry = {
    hasBlock: () => true,
    getBlockDefinition: type => ({ type }),
    getBlockRuntime: () => ({ create(initial) {
      return {
        element: ownerDocument.createElement('article'),
        read() { return initial }, setReadOnly() {}, destroy() {},
      }
    } }),
  }
  const reconciler = new BlockReconciler({
    container, registry,
    contextFactory(_id, _type, _signal, readRecord) {
      currentData = () => readRecord().data
      return { getData: currentData }
    },
  })
  const store = new DocumentStore({
    version: '2.0.0', blocks: [block('a', 'original')],
  })
  reconciler.mount(store)
  assert.equal(currentData().text, 'original')

  const draft = store.createDraft()
  draft.update('a', block('a', 'updated'))
  store.commit(draft)
  assert.equal(currentData().text, 'updated',
    'the context cannot retain the detached candidate after publication')
  reconciler.destroy()
})

test('failed detached mount preparation restores the prior document authority', () => {
  const ownerDocument = new FakeDocument()
  const container = ownerDocument.createElement('main')
  let currentData
  const registry = {
    hasBlock: () => true,
    getBlockDefinition: type => ({ type }),
    getBlockRuntime: () => ({ create(initial) {
      if (initial.text === 'throw-during-stage') throw new Error('stage failed')
      return {
        element: ownerDocument.createElement('article'),
        read() { return initial }, setReadOnly() {}, destroy() {},
      }
    } }),
  }
  const reconciler = new BlockReconciler({
    container, registry,
    contextFactory(_id, _type, _signal, readRecord) {
      const getData = () => readRecord().data
      if (!currentData) currentData = getData
      return { getData }
    },
  })
  const original = new DocumentStore({
    version: '2.0.0', blocks: [block('a', 'initial')],
  })
  reconciler.mount(original)
  const oldShell = reconciler.getElement('a')

  const revised = original.createDraft()
  revised.update('a', block('a', 'committed-later'))
  original.commit(revised)
  assert.equal(currentData().text, 'committed-later')

  const attempted = new DocumentStore({
    version: '2.0.0', blocks: [block('b', 'throw-during-stage')],
  })
  assert.throws(() => reconciler.mount(attempted), /stage failed/)
  assert.equal(currentData().text, 'committed-later',
    'failed prepublication staging must not swap the committed document')
  assert.equal(reconciler.getElement('a'), oldShell)
  assert.deepEqual(container.children, [oldShell])
  reconciler.destroy()
})

test('failed first mount restores preexisting host nodes after a partial DOM commit', () => {
  const ownerDocument = new FakeDocument()
  const container = ownerDocument.createElement('main')
  const existing = ownerDocument.createElement('aside')
  container.appendChild(existing)
  let releases = 0
  const registry = {
    hasBlock: () => true,
    getBlockDefinition: type => ({ type }),
    getBlockRuntime: () => ({ create() {
      return {
        element: ownerDocument.createElement('article'),
        read() { return {} }, setReadOnly() {},
        destroy() { releases++ },
      }
    } }),
  }
  const reconciler = new BlockReconciler({ container, registry, contextFactory: () => ({}) })
  const store = new DocumentStore({ version: '2.0.0', blocks: [block('a')] })
  const replace = container.replaceChildren.bind(container)
  let injected = false
  container.replaceChildren = (...children) => {
    replace(...children)
    if (!injected) {
      injected = true
      throw new Error('DOM commit failed after mutation')
    }
  }
  assert.throws(() => reconciler.mount(store), /DOM commit failed after mutation/)
  assert.deepEqual(container.children, [existing], 'initial host DOM must be preserved')
  assert.equal(releases, 1, 'failed candidate is destroyed exactly once')
  reconciler.mount(store)
  assert.equal(container.children.length, 1)
  reconciler.destroy()
  assert.equal(releases, 2)
})

test('failed remount preserves previous block identity and original error', () => {
  const ownerDocument = new FakeDocument()
  const container = ownerDocument.createElement('main')
  const releases = []
  const registry = {
    hasBlock: () => true,
    getBlockDefinition: type => ({ type }),
    getBlockRuntime: () => ({ create(initial) {
      return {
        element: ownerDocument.createElement('article'),
        read() { return initial }, setReadOnly() {},
        destroy() { releases.push(initial.text) },
      }
    } }),
  }
  const reconciler = new BlockReconciler({ container, registry, contextFactory: () => ({}) })
  const firstStore = new DocumentStore({ version: '2.0.0', blocks: [block('a')] })
  reconciler.mount(firstStore)
  const initial = reconciler.getElement('a')
  const replace = container.replaceChildren.bind(container)
  container.replaceChildren = (...children) => {
    replace(...children)
    throw new Error('replace refuses after mutation')
  }
  const newStore = new DocumentStore({ version: '2.0.0', blocks: [block('b')] })
  assert.throws(() => reconciler.mount(newStore), /replace refuses after mutation/)
  assert.equal(reconciler.getElement('a'), initial)
  assert.deepEqual(container.children, [initial])
  assert.deepEqual(releases, ['b'], 'recovered old block remains owned and live')
  reconciler.destroy()
  assert.deepEqual(releases, ['b', 'a'])
})

test('destroy releases detached prepared block instances before they can be applied', () => {
  const { store, reconciler, counters, container } = setup(1)
  const draft = store.createDraft()
  draft.insert(1, block('b'))
  const prepared = reconciler.prepare({ store, draft, changes: draft.changes })

  assert.equal(counters.create, 2)
  reconciler.destroy()
  assert.equal(counters.destroy, 2, 'both mounted and staged owners must be retired')
  assert.deepEqual(reconciler.ids, [])
  assert.equal(container.children.length, 0)
  assert.throws(() => prepared.apply(), /destroyed/)
  assert.throws(() => prepared.finalize(), /destroyed/)
  prepared.recover()
  reconciler.destroy()
  assert.equal(counters.destroy, 2, 'stale prepared handle cannot revive a block')
})

test('destroy between prepared apply and finalize releases detached old and newly applied owners', () => {
  const { store, reconciler, counters, container } = setup(1)
  const draft = store.createDraft()
  draft.update('0', block('0', 'new', 'heading'))
  const prepared = reconciler.prepare({ store, draft, changes: draft.changes })
  prepared.apply()
  assert.equal(counters.destroy, 0, 'old replacement owner remains live until finalization')

  reconciler.destroy()
  assert.equal(counters.destroy, 2, 'the previous and replacement instance must both be released')
  assert.deepEqual(reconciler.ids, [])
  assert.equal(container.children.length, 0)
  assert.throws(() => prepared.finalize(), /destroyed/)
  prepared.recover()
  assert.equal(counters.destroy, 2)
})

test('an old prepared block edit cannot overwrite a newly applied projection', () => {
  const { store, reconciler, counters } = setup(1)
  const draft = store.createDraft()
  draft.insert(1, block('b'))
  const first = reconciler.prepare({ store, draft, changes: draft.changes })
  const stale = reconciler.prepare({ store, draft, changes: draft.changes })

  first.apply()
  assert.throws(() => stale.apply(), /owner is stale/)
  assert.equal(counters.destroy, 1, 'only the rejected staged block is destroyed')
  first.finalize()
  assert.deepEqual(reconciler.ids, ['0', 'b'])
  reconciler.destroy()
  assert.equal(counters.destroy, 3, 'each acquired owner is disposed once')
})

test('normal prepared block recovery and discard still preserve the committed projection', () => {
  const { store, reconciler, counters, container } = setup(1)
  const initial = reconciler.getElement('0')
  const draft = store.createDraft()
  draft.insert(1, block('b'))
  const discarded = reconciler.prepare({ store, draft, changes: draft.changes })
  discarded.discard()
  assert.deepEqual(reconciler.ids, ['0'])
  assert.equal(reconciler.getElement('0'), initial)

  const applied = reconciler.prepare({ store, draft, changes: draft.changes })
  applied.apply()
  applied.recover()
  assert.deepEqual(reconciler.ids, ['0'])
  assert.deepEqual(container.children, [initial])
  assert.equal(counters.destroy, 2, 'both discarded and recovered candidates are released')
  reconciler.destroy()
  assert.equal(counters.destroy, 3)
})

test('reentrant reconciler destruction during block creation cannot leave a staged orphan', () => {
  const document = new FakeDocument()
  const container = document.createElement('main')
  const disposed = []
  let reconciler
  const registry = {
    hasBlock: () => true,
    getBlockDefinition: type => ({ type }),
    getBlockRuntime: () => ({ create(data) {
      if(data.text === 'b') reconciler.destroy()
      return {
        element: document.createElement('article'),
        read() { return data },
        setReadOnly() {},
        destroy() { disposed.push(data.text) },
      }
    } }),
  }
  reconciler = new BlockReconciler({ container, registry, contextFactory: () => ({}) })
  const store = new DocumentStore({ version: '2.0.0', blocks: [block('a')] })
  reconciler.mount(store)
  const draft = store.createDraft()
  draft.insert(1, block('b'))

  assert.throws(
    () => reconciler.prepare({ store, draft, changes: draft.changes }),
    /BlockReconciler is destroyed/,
  )
  assert.deepEqual(disposed, ['a', 'b'], 'detached candidate must be cleaned after reentrant destroy')
  assert.deepEqual(reconciler.ids, [])
  assert.deepEqual(container.children, [])
})

test('failed final-order preparation releases already staged block instances', () => {
  const document = new FakeDocument()
  const container = document.createElement('main')
  const disposed = []
  const registry = {
    hasBlock: () => true,
    getBlockDefinition: type => ({ type }),
    getBlockRuntime: () => ({ create(data) {
      return {
        element: document.createElement('article'),
        read() { return data },
        setReadOnly() {},
        destroy() { disposed.push(data.text) },
      }
    } }),
  }
  const reconciler = new BlockReconciler({ container, registry, contextFactory: () => ({}) })
  const store = new DocumentStore({ version: '2.0.0', blocks: [block('a')] })
  reconciler.mount(store)
  const draft = {
    changes: [{ kind: 'block.insert', index: 1, block: block('b') }],
    peek(id) { return id === 'b' ? block('b') : store.peek(id) },
    ids() { throw new Error('planned order failed') },
  }
  assert.throws(() => reconciler.prepare({ store, draft, changes: draft.changes }),
    /planned order failed/)
  assert.deepEqual(disposed, ['b'])
  assert.deepEqual(reconciler.ids, ['a'])
  reconciler.destroy()
  assert.deepEqual(disposed, ['b', 'a'])
})

test('reentrant destruction during mount staging never publishes a retired candidate', () => {
  const document = new FakeDocument()
  const container = document.createElement('main')
  const disposed = []
  let reconciler
  const registry = {
    hasBlock: () => true,
    getBlockDefinition: type => ({ type }),
    getBlockRuntime: () => ({ create(data) {
      if(data.text === 'b') reconciler.destroy()
      return {
        element: document.createElement('article'),
        read() { return data },
        setReadOnly() {},
        destroy() { disposed.push(data.text) },
      }
    } }),
  }
  reconciler = new BlockReconciler({ container, registry, contextFactory: () => ({}) })
  reconciler.mount(new DocumentStore({ version: '2.0.0', blocks: [block('a')] }))
  assert.throws(() => reconciler.mount(
    new DocumentStore({ version: '2.0.0', blocks: [block('b')] }),
  ), /BlockReconciler is destroyed/)
  assert.deepEqual(disposed, ['a', 'b'])
  assert.deepEqual(reconciler.ids, [])
  assert.deepEqual(container.children, [])
})

test('destroy triggered by initial DOM publication cannot resurrect a block owner', () => {
  const document = new FakeDocument()
  const container = document.createElement('main')
  const destroyed = []
  const registry = {
    hasBlock: () => true,
    getBlockDefinition: type => ({ type }),
    getBlockRuntime: () => ({ create(data) {
      return {
        element: document.createElement('article'),
        read() { return data }, setReadOnly() {},
        destroy() { destroyed.push(data.text) },
      }
    } }),
  }
  const reconciler = new BlockReconciler({ container, registry, contextFactory: () => ({}) })
  const originalReplace = container.replaceChildren.bind(container)
  let injected = false
  container.replaceChildren = (...elements) => {
    originalReplace(...elements)
    if (!injected) {
      injected = true
      reconciler.destroy()
    }
  }
  assert.throws(() => reconciler.mount(
    new DocumentStore({ version: '2.0.0', blocks: [block('a')] }),
  ), /BlockReconciler is destroyed/)
  assert.deepEqual(destroyed, ['a'])
  assert.deepEqual(reconciler.ids, [])
  assert.deepEqual(container.children, [])
})

test('reentrant destruction in remount DOM replacement retires old and new owners', () => {
  const document = new FakeDocument()
  const container = document.createElement('main')
  const destroyed = []
  const registry = {
    hasBlock: () => true,
    getBlockDefinition: type => ({ type }),
    getBlockRuntime: () => ({ create(data) {
      return {
        element: document.createElement('article'),
        read() { return data }, setReadOnly() {},
        destroy() { destroyed.push(data.text) },
      }
    } }),
  }
  const reconciler = new BlockReconciler({ container, registry, contextFactory: () => ({}) })
  const store = text => new DocumentStore({
    version: '2.0.0', blocks: [block(text)],
  })
  reconciler.mount(store('a'))

  const originalReplace = container.replaceChildren.bind(container)
  let injected = false
  container.replaceChildren = (...elements) => {
    originalReplace(...elements)
    if (!injected) {
      injected = true
      reconciler.destroy()
    }
  }
  assert.throws(() => reconciler.mount(store('b')), /BlockReconciler is destroyed/)
  assert.deepEqual(destroyed, ['a', 'b'])
  assert.deepEqual(reconciler.ids, [])
  assert.deepEqual(container.children, [])
  reconciler.destroy()
  assert.deepEqual(destroyed, ['a', 'b'])
})

test('discarded prepared block owner cannot later be applied', () => {
  const { store, reconciler, counters, container } = setup(1)
  const draft = store.createDraft()
  draft.insert(1, block('b'))
  const prepared = reconciler.prepare({ store, draft, changes: draft.changes })

  prepared.discard()
  assert.equal(counters.destroy, 1, 'discard released the only detached candidate')
  assert.throws(() => prepared.apply(), /cannot be applied twice/)
  assert.throws(() => prepared.finalize(), /unapplied/)
  prepared.recover()
  assert.deepEqual(reconciler.ids, ['0'])
  assert.equal(container.children.length, 1)
  reconciler.destroy()
  assert.equal(counters.destroy, 2)
})

test('a late recover cannot reverse an already finalized block projection', () => {
  const { store, reconciler, counters, container } = setup(1)
  const draft = store.createDraft()
  draft.insert(1, block('b'))
  const prepared = reconciler.prepare({ store, draft, changes: draft.changes })
  prepared.apply()
  store.commit(draft)
  prepared.finalize()

  const published = reconciler.getElement('b')
  assert.ok(published)
  assert.doesNotThrow(() => prepared.recover())
  assert.deepEqual(reconciler.ids, ['0', 'b'])
  assert.equal(reconciler.getElement('b'), published)
  assert.deepEqual(container.children.map(node => node.dataset.blockId), ['0', 'b'])
  assert.equal(counters.destroy, 0, 'late recovery must not retire the committed owner')

  reconciler.destroy()
  assert.equal(counters.destroy, 2)
})

test('stale recover cannot undo the finalized successor block projection', () => {
  const { store, reconciler, counters, container } = setup(1)
  const firstDraft = store.createDraft()
  firstDraft.insert(1, block('b'))
  const first = reconciler.prepare({ store, draft: firstDraft, changes: firstDraft.changes })
  first.apply()
  // A separate canonical store snapshot allows overlapping projection
  // preparations without mutating the first operation's stored input.
  const successorStore = new DocumentStore({
    version: '2.0.0', blocks: [block('0'), block('b')],
  })
  const nextDraft = successorStore.createDraft()
  nextDraft.insert(2, block('c'))
  const successor = reconciler.prepare({
    store: successorStore, draft: nextDraft, changes: nextDraft.changes,
  })
  successor.apply()
  successor.finalize()
  const published = reconciler.getElement('c')
  assert.ok(published)

  first.recover()
  assert.deepEqual(reconciler.ids, ['0', 'b', 'c'])
  assert.equal(reconciler.getElement('c'), published)
  assert.deepEqual(container.children.map(node => node.dataset.blockId), ['0', 'b', 'c'])
  assert.equal(counters.destroy, 0, 'stale recovery does not destroy newer owners')
  reconciler.destroy()
  assert.equal(counters.destroy, 3)
})

test('stale recover before the successor finalizes cannot steal its projection', () => {
  const { store, reconciler, counters, container } = setup(1)
  const firstDraft = store.createDraft()
  firstDraft.insert(1, block('b'))
  const first = reconciler.prepare({ store, draft: firstDraft, changes: firstDraft.changes })
  first.apply()

  const successorStore = new DocumentStore({
    version: '2.0.0', blocks: [block('0'), block('b')],
  })
  const nextDraft = successorStore.createDraft()
  nextDraft.insert(2, block('c'))
  const successor = reconciler.prepare({
    store: successorStore, draft: nextDraft, changes: nextDraft.changes,
  })
  successor.apply()
  first.recover()
  assert.deepEqual(reconciler.ids, ['0', 'b', 'c'])
  successor.finalize()
  assert.deepEqual(container.children.map(node => node.dataset.blockId), ['0', 'b', 'c'])
  assert.equal(counters.destroy, 0)
  reconciler.destroy()
  assert.equal(counters.destroy, 3)
})

test('late finalize from an older block handle cannot retire a successor owner', () => {
  const { store, reconciler, counters, container } = setup(1)
  const firstDraft = store.createDraft()
  firstDraft.insert(1, block('b'))
  const first = reconciler.prepare({ store, draft: firstDraft, changes: firstDraft.changes })
  first.apply()

  const successorStore = new DocumentStore({
    version: '2.0.0', blocks: [block('0'), block('b')],
  })
  const nextDraft = successorStore.createDraft()
  nextDraft.insert(2, block('c'))
  const successor = reconciler.prepare({
    store: successorStore, draft: nextDraft, changes: nextDraft.changes,
  })
  successor.apply()
  assert.throws(() => first.finalize(), /owner is stale/)
  successor.finalize()
  first.recover()
  assert.deepEqual(reconciler.ids, ['0', 'b', 'c'])
  assert.deepEqual(container.children.map(node => node.dataset.blockId), ['0', 'b', 'c'])
  assert.equal(counters.destroy, 0)
  reconciler.destroy()
  assert.equal(counters.destroy, 3)
})

test('reentrant insertBefore successor survives recovery of a partially applied predecessor', () => {
  const { store, reconciler, container, counters } = setup(1)
  const firstDraft = store.createDraft()
  firstDraft.insert(1, block('b'))
  const first = reconciler.prepare({ store, draft: firstDraft, changes: firstDraft.changes })
  const secondDraft = store.createDraft()
  secondDraft.insert(1, block('c'))
  const successor = reconciler.prepare({ store, draft: secondDraft, changes: secondDraft.changes })

  const insertBefore = container.insertBefore.bind(container)
  let injected = false
  container.insertBefore = (element, anchor) => {
    const result = insertBefore(element, anchor)
    if (!injected && element.dataset.blockId === 'b') {
      injected = true
      successor.apply()
    }
    return result
  }

  assert.throws(() => first.apply(), /owner changed during apply/)
  first.recover()
  assert.deepEqual(reconciler.ids, ['0', 'c'])
  assert.deepEqual(container.children.map(node => node.dataset.blockId), ['0', 'c'])
  assert.equal(counters.destroy, 1, 'only the interrupted b owner was released')
  successor.finalize()
  assert.deepEqual(reconciler.ids, ['0', 'c'])
  reconciler.destroy()
  assert.equal(counters.destroy, 3, 'the successor and original owner are retired once')
})

test('finalize after interrupted apply cannot steal a reentrant successor projection', () => {
  const { store, reconciler, container, counters } = setup(1)
  const firstDraft = store.createDraft()
  firstDraft.insert(1, block('b'))
  const first = reconciler.prepare({ store, draft: firstDraft, changes: firstDraft.changes })
  const secondDraft = store.createDraft()
  secondDraft.insert(1, block('c'))
  const successor = reconciler.prepare({ store, draft: secondDraft, changes: secondDraft.changes })

  const insertBefore = container.insertBefore.bind(container)
  let injected = false
  container.insertBefore = (element, anchor) => {
    const result = insertBefore(element, anchor)
    if (!injected && element.dataset.blockId === 'b') {
      injected = true
      successor.apply()
    }
    return result
  }

  assert.throws(() => first.apply(), /owner changed during apply/)
  assert.throws(() => first.finalize(), /owner is stale/)
  successor.finalize()
  first.recover()
  assert.deepEqual(reconciler.ids, ['0', 'c'])
  assert.deepEqual(container.children.map(node => node.dataset.blockId), ['0', 'c'])
  assert.equal(counters.destroy, 1, 'orphaned interrupted b owner is retired')
  reconciler.destroy()
  assert.equal(counters.destroy, 3)
})

test('a failing recovery DOM commit releases each newly-created candidate before retry', () => {
  const { store, reconciler, container, counters } = setup(1)
  const draft = store.createDraft()
  draft.update('0', {
    ...block('0', 'changed'),
    data: { text: 'changed', fail: true },
  })
  const prepared = reconciler.prepare({ store, draft, changes: draft.changes })
  assert.throws(() => prepared.apply(), /update failed/)

  const replace = container.replaceChildren.bind(container)
  let fault = true
  container.replaceChildren = (...children) => {
    replace(...children)
    if (fault) throw new Error('restore failed after DOM mutation')
  }
  assert.throws(() => prepared.recover(), /restore failed after DOM mutation/)
  assert.equal(counters.create, 2, 'first recovery candidate was allocated')
  assert.equal(counters.destroy, 1, 'failed recovery candidate must be released')
  fault = false
  assert.doesNotThrow(() => prepared.recover())
  assert.deepEqual(reconciler.ids, ['0'])
  assert.equal(counters.create, 3, 'retry creates a new recovery candidate')
  assert.equal(counters.destroy, 2, 'original displaced owner is retired')
  reconciler.destroy()
  assert.equal(counters.destroy, counters.create, 'every acquired instance is released')
})

test('two successive recovery DOM faults leave no orphaned block instances', () => {
  const { store, reconciler, container, counters } = setup(1)
  const draft = store.createDraft()
  draft.update('0', {
    ...block('0', 'changed'),
    data: { text: 'changed', fail: true },
  })
  const prepared = reconciler.prepare({ store, draft, changes: draft.changes })
  assert.throws(() => prepared.apply(), /update failed/)

  const replace = container.replaceChildren.bind(container)
  container.replaceChildren = (...children) => {
    replace(...children)
    throw new Error('recovery DOM fault')
  }
  assert.throws(() => prepared.recover(), /recovery DOM fault/)
  assert.throws(() => prepared.recover(), /recovery DOM fault/)
  assert.equal(counters.create, 3)
  assert.equal(counters.destroy, 2, 'each failed recovery attempt must dispose its candidate')
  reconciler.destroy()
  assert.equal(counters.destroy, counters.create, 'final owner is independently retired')
})

test('failed block restore staging keeps the original committed document authority', () => {
  const ownerDocument = new FakeDocument()
  const container = ownerDocument.createElement('main')
  let originalContext
  const released = []
  const registry = {
    hasBlock: () => true,
    getBlockDefinition: type => ({ type }),
    getBlockRuntime: () => ({ create(initial, context) {
      if (initial.text === 'broken') throw new Error('new instance failed')
      if (initial.text === 'initial') originalContext = context
      return {
        element: ownerDocument.createElement('article'),
        read() { return initial }, setReadOnly() {},
        destroy() { released.push(initial.text) },
      }
    } }),
  }
  const reconciler = new BlockReconciler({
    container, registry,
    contextFactory(_id, _type, _signal, readRecord) {
      return { getData: () => readRecord().data }
    },
  })
  const committed = new DocumentStore({
    version: '2.0.0', blocks: [block('a', 'initial')],
  })
  reconciler.mount(committed)
  const oldShell = reconciler.getElement('a')
  assert.throws(() => reconciler.restore(new DocumentStore({
    version: '2.0.0', blocks: [block('b', 'broken')],
  })), /new instance failed/)

  const draft = committed.createDraft()
  draft.update('a', block('a', 'after-failure'))
  committed.commit(draft)
  assert.equal(originalContext.getData().text, 'after-failure',
    'the original mounted context still reads the original store')
  assert.equal(reconciler.getElement('a'), oldShell)
  assert.deepEqual(container.children, [oldShell])
  reconciler.destroy()
  assert.deepEqual(released, ['initial'])
})

test('failed block restore DOM publication reattaches the original shells', () => {
  const ownerDocument = new FakeDocument()
  const container = ownerDocument.createElement('main')
  const released = []
  const registry = {
    hasBlock: () => true,
    getBlockDefinition: type => ({ type }),
    getBlockRuntime: () => ({ create(initial) {
      return {
        element: ownerDocument.createElement('article'),
        read() { return initial }, setReadOnly() {},
        destroy() { released.push(initial.text) },
      }
    } }),
  }
  const reconciler = new BlockReconciler({
    container, registry, contextFactory: () => ({}),
  })
  reconciler.mount(new DocumentStore({
    version: '2.0.0', blocks: [block('a', 'initial')],
  }))
  const oldShell = reconciler.getElement('a')
  const replace = container.replaceChildren.bind(container)
  let failOnce = true
  container.replaceChildren = (...children) => {
    replace(...children)
    if (failOnce) {
      failOnce = false
      throw new Error('DOM restore failed after insertion')
    }
  }
  assert.throws(() => reconciler.restore(new DocumentStore({
    version: '2.0.0', blocks: [block('b', 'replacement')],
  })), /DOM restore failed after insertion/)
  assert.equal(reconciler.getElement('a'), oldShell)
  assert.deepEqual(container.children, [oldShell])
  assert.deepEqual(released, ['replacement'], 'failed restoration releases its candidate')
  reconciler.destroy()
  assert.deepEqual(released, ['replacement', 'initial'])
})

test('retired fields and shells cannot resolve as live editable targets after document replacement', () => {
  const { container, reconciler, registry } = setup(1)
  const retiredField = reconciler.getEditableField('0', 'text').element
  const retiredShell = reconciler.getElement('0')
  assert.equal(reconciler.resolveBlockTarget(retiredField), '0')
  assert.equal(reconciler.resolveEditableTarget(retiredField)?.blockId, '0')

  reconciler.mount(new DocumentStore({
    version: '2.0.0', blocks: [block('new')],
  }))
  const currentField = reconciler.getEditableField('new', 'text').element
  assert.equal(reconciler.resolveBlockTarget(retiredField), null)
  assert.equal(reconciler.resolveEditableTarget(retiredField), null)
  assert.equal(reconciler.resolveBlockTarget(currentField), 'new')
  assert.equal(reconciler.resolveEditableTarget(currentField)?.blockId, 'new')

  container.appendChild(retiredShell)
  assert.equal(reconciler.resolveBlockTarget(retiredField), null,
    'reattaching a retired shell cannot restore a stale block lease')
  assert.equal(reconciler.resolveEditableTarget(retiredField), null,
    'reattaching old DOM cannot authorize its retained field descriptors')
  assert.equal(reconciler.resolveEditableTarget(currentField)?.blockId, 'new')
  retiredShell.remove()
  reconciler.destroy()
})

test('a retired field cannot impersonate a replacement block with the same canonical ID', () => {
  const { reconciler } = setup(1)
  const oldField = reconciler.getEditableField('0', 'text').element
  const oldShell = reconciler.getElement('0')
  reconciler.mount(new DocumentStore({
    version: '2.0.0', blocks: [block('0', 'replacement')],
  }))
  const liveField = reconciler.getEditableField('0', 'text').element
  assert.notEqual(liveField, oldField)
  assert.notEqual(reconciler.getElement('0'), oldShell)
  assert.equal(reconciler.resolveBlockTarget(oldField), null)
  assert.equal(reconciler.resolveEditableTarget(oldField), null)
  assert.equal(reconciler.resolveBlockTarget(liveField), '0')
  assert.deepEqual(reconciler.resolveEditableTarget(liveField), {
    blockId: '0', fieldKey: 'text', element: liveField, mode: 'rich-text',
  })
  reconciler.destroy()
})

test('detaching a live editable field revokes target resolution until its field is remounted', () => {
  const { reconciler } = setup(1)
  const field = reconciler.getEditableField('0', 'text').element
  const shell = reconciler.getElement('0')
  assert.equal(reconciler.resolveEditableTarget(field)?.fieldKey, 'text')
  field.remove()
  assert.equal(reconciler.resolveEditableTarget(field), null,
    'an unmounted field cannot retain write authority from its old address')
  assert.equal(reconciler.resolveBlockTarget(field), null)
  shell.appendChild(field)
  assert.equal(reconciler.resolveEditableTarget(field)?.blockId, '0',
    'a field currently declared by its live owner is authorized when remounted')
  reconciler.destroy()
})

test('block runtime cannot advertise a foreign application node as editable field', () => {
  const ownerDocument = new FakeDocument()
  const container = ownerDocument.createElement('main')
  const application = ownerDocument.createElement('section')
  const unrelated = ownerDocument.createElement('textarea')
  application.appendChild(unrelated)
  const releases = []
  const registry = {
    hasBlock: () => true,
    getBlockDefinition: type => ({ type }),
    getBlockRuntime: () => ({ create(initial) {
      const element = ownerDocument.createElement('article')
      return {
        element, read() { return initial }, setReadOnly() {},
        editableFields() {
          return [{ key: 'text', mode: 'rich-text', element: unrelated }]
        },
        destroy() { releases.push(initial.text) },
      }
    } }),
  }
  const reconciler = new BlockReconciler({ container, registry, contextFactory: () => ({}) })
  const store = new DocumentStore({ version: '2.0.0', blocks: [block('a')] })
  assert.throws(() => reconciler.mount(store), /must belong to its owning block DOM/)
  assert.equal(application.firstChild, unrelated, 'foreign DOM must never be claimed or moved')
  assert.deepEqual(container.children, [])
  assert.deepEqual(releases, ['a'], 'failed instance is cleaned up once')
  assert.equal(reconciler.getEditableField('a', 'text'), undefined)
  reconciler.destroy()
  assert.deepEqual(releases, ['a'])
})

test('rejecting a staged block that borrows another block field preserves the active owner', () => {
  const { store, reconciler, registry, container } = setup(1)
  const field = reconciler.getEditableField('0', 'text').element
  const originalShell = reconciler.getElement('0')
  const originalHasBlock = registry.hasBlock
  const originalDefinition = registry.getBlockDefinition
  const originalRuntime = registry.getBlockRuntime
  registry.hasBlock = type => type === 'borrowed-field' || originalHasBlock(type)
  registry.getBlockDefinition = type => type === 'borrowed-field'
    ? { type }
    : originalDefinition(type)
  registry.getBlockRuntime = type => type === 'borrowed-field'
    ? { create(data) {
      return {
        element: container.ownerDocument.createElement('article'),
        read() { return data }, setReadOnly() {},
        editableFields() { return [{ key: 'text', element: field, mode: 'rich-text' }] },
        destroy() {},
      }
    } }
    : originalRuntime(type)
  const draft = store.createDraft()
  draft.insert(1, block('new', 'invalid', 'borrowed-field'))
  assert.throws(
    () => reconciler.prepare({ store, draft, changes: draft.changes }),
    /must belong to its owning block DOM/,
  )
  assert.equal(reconciler.getElement('0'), originalShell)
  assert.deepEqual(reconciler.resolveEditableTarget(field), {
    blockId: '0', fieldKey: 'text', element: field, mode: 'rich-text',
  })
  assert.deepEqual(reconciler.ids, ['0'])
  reconciler.destroy()
})

test('a valid nested editable field remains addressable after ownership validation', () => {
  const { reconciler, container } = setup(1)
  const field = reconciler.getEditableField('0', 'text').element
  const shell = reconciler.getElement('0')
  assert(shell.contains(field))
  assert.equal(reconciler.resolveBlockTarget(field), '0')
  assert.deepEqual(reconciler.resolveEditableTarget(field), {
    blockId: '0', fieldKey: 'text', element: field, mode: 'rich-text',
  })
  assert.equal(container.firstChild, shell)
  reconciler.destroy()
})

test('changing a field mode without replacing its element reprojects owned inline state', () => {
  const ownerDocument = new FakeDocument()
  const container = ownerDocument.createElement('main')
  const element = ownerDocument.createElement('article')
  const field = ownerDocument.createElement('span')
  element.appendChild(field)
  const reconciled = []
  let mode = 'rich-text'
  const registry = {
    hasBlock: () => true,
    getBlockDefinition: type => ({ type }),
    getBlockRuntime: () => ({ create(initial) {
      return {
        element,
        read() { return initial },
        setReadOnly() {},
        editableFields() { return [{ key: 'text', element: field, mode }] },
        destroy() {},
      }
    } }),
  }
  const inlineProjection = {
    prepareBlock() {
      return { apply() {}, finalize() {}, recover() {}, discard() {} }
    },
    reconcileBlock(id, _record, _definition, fields) {
      reconciled.push({ id, mode: fields[0].mode })
    },
    destroy() {},
  }
  const reconciler = new BlockReconciler({
    container, registry, inlineProjection, contextFactory: () => ({}),
  })
  reconciler.mount(new DocumentStore({
    version: '2.0.0', blocks: [block('a')],
  }))

  mode = 'plain-text'
  assert.equal(reconciler.getEditableField('a', 'text').mode, 'plain-text')
  assert.deepEqual(reconciled, [{ id: 'a', mode: 'plain-text' }],
    'switching to plain text must revoke stale rich-text inline projections')
  assert.equal(reconciler.getEditableField('a', 'text').element, field)
  assert.equal(reconciler.getEditableField('a', 'text').mode, 'plain-text')
  assert.equal(reconciled.length, 1, 'no extra work for unchanged field mode')
  mode = 'rich-text'
  assert.equal(reconciler.getEditableField('a', 'text').mode, 'rich-text')
  assert.deepEqual(reconciled, [
    { id: 'a', mode: 'plain-text' }, { id: 'a', mode: 'rich-text' },
  ])
  reconciler.destroy()
})

test('stable field descriptors do not cause unnecessary inline reconciliation', () => {
  const ownerDocument = new FakeDocument()
  const container = ownerDocument.createElement('main')
  const element = ownerDocument.createElement('article')
  const field = ownerDocument.createElement('span')
  element.appendChild(field)
  let projectionCalls = 0
  const registry = {
    hasBlock: () => true,
    getBlockDefinition: type => ({ type }),
    getBlockRuntime: () => ({ create(initial) {
      return {
        element, read() { return initial }, setReadOnly() {},
        editableFields() { return [{ key: 'text', element: field, mode: 'rich-text' }] },
        destroy() {},
      }
    } }),
  }
  const inlineProjection = {
    prepareBlock() { return { apply() {}, finalize() {}, recover() {}, discard() {} } },
    reconcileBlock() { projectionCalls++ },
    destroy() {},
  }
  const reconciler = new BlockReconciler({
    container, registry, inlineProjection, contextFactory: () => ({}),
  })
  reconciler.mount(new DocumentStore({
    version: '2.0.0', blocks: [block('a')],
  }))
  for (let index = 0; index < 4; index++) {
    assert.equal(reconciler.getEditableField('a', 'text').element, field)
  }
  assert.equal(projectionCalls, 0, 'unchanged mode, key, and element should not trigger a reproject')
  reconciler.destroy()
})

test('BlockReconciler rejects a non-HTMLElement DOM Node returned as a block root', () => {
  const ownerDocument = new FakeDocument()
  const container = ownerDocument.createElement('main')
  let disposed = 0
  const comment = {
    ownerDocument,
    parentNode: null,
    isConnected: false,
  }
  const registry = {
    hasBlock: () => true,
    getBlockDefinition: type => ({ type }),
    getBlockRuntime: () => ({ create(initial) {
      return {
        element: comment,
        read() { return initial },
        setReadOnly() {},
        destroy() { disposed++ },
      }
    } }),
  }
  const reconciler = new BlockReconciler({ container, registry, contextFactory: () => ({}) })
  assert.throws(() => reconciler.mount(new DocumentStore({
    version: '2.0.0', blocks: [block('a')],
  })), /must return an HTMLElement in the owning document/)
  assert.deepEqual(container.children, [])
  assert.equal(disposed, 1, 'invalid acquired instance must be retired once')
  reconciler.destroy()
  assert.equal(disposed, 1)
})

test('valid HTMLElement roots remain mountable with strict block root validation', () => {
  const { reconciler, container, counters } = setup(2)
  assert.equal(reconciler.ids.length, 2)
  assert.equal(container.children.length, 2)
  for (const id of ['0', '1']) {
    const shell = reconciler.getElement(id)
    assert(shell instanceof FakeElement)
    assert(shell.firstElementChild instanceof FakeElement)
  }
  reconciler.destroy()
  assert.equal(counters.destroy, 2)
})

test('block editable fields reject non-HTMLElement descendants of a valid block root', () => {
  const ownerDocument = new FakeDocument()
  const container = ownerDocument.createElement('main')
  const comment = { ownerDocument, parentNode: null, nodeType: 8 }
  let released = 0
  const registry = {
    hasBlock: () => true,
    getBlockDefinition: type => ({ type }),
    getBlockRuntime: () => ({ create(initial) {
      const element = ownerDocument.createElement('article')
      element.appendChild(comment)
      return {
        element,
        read() { return initial }, setReadOnly() {},
        editableFields() {
          return [{ key: 'text', mode: 'plain-text', element: comment }]
        },
        destroy() { released++ },
      }
    } }),
  }
  const reconciler = new BlockReconciler({ container, registry, contextFactory: () => ({}) })
  assert.throws(() => reconciler.mount(new DocumentStore({
    version: '2.0.0', blocks: [block('a')],
  })), /Editable field must be an HTMLElement in the owning document/)
  assert.deepEqual(container.children, [], 'no invalid field owner may be mounted')
  assert.equal(released, 1, 'the failed block instance is destroyed')
  reconciler.destroy()
  assert.equal(released, 1)
})

test('failed child inline reconciliation retries a changed field element on the next refresh', () => {
  const ownerDocument = new FakeDocument()
  const container = ownerDocument.createElement('main')
  const root = ownerDocument.createElement('article')
  const oldField = ownerDocument.createElement('span')
  const newField = ownerDocument.createElement('span')
  root.appendChild(oldField)
  root.appendChild(newField)
  let currentField = oldField
  let attempts = 0
  const registry = {
    hasBlock: () => true,
    getBlockDefinition: type => ({ type }),
    getBlockRuntime: () => ({ create(data) {
      return {
        element: root,
        read() { return data },
        editableFields() { return [{ key: 'text', element: currentField, mode: 'rich-text' }] },
        setReadOnly() {},
        destroy() {},
      }
    } }),
  }
  const inlineProjection = {
    prepareBlock() { return { apply() {}, finalize() {}, recover() {}, discard() {} } },
    reconcileBlock() {
      attempts++
      if (attempts === 1) throw new Error('child inline projection failed')
    },
    destroy() {},
  }
  const reconciler = new BlockReconciler({
    container, registry, inlineProjection, contextFactory: () => ({}),
  })
  reconciler.mount(new DocumentStore({
    version: '2.0.0', blocks: [block('a')],
  }))
  currentField = newField

  assert.throws(() => reconciler.getEditableFields('a'), /child inline projection failed/)
  assert.equal(attempts, 1)
  assert.equal(reconciler.getEditableField('a', 'text').element, newField)
  assert.equal(attempts, 2, 'a failed field publication must retry inline hydration')
  assert.equal(reconciler.resolveEditableTarget(oldField), null)
  assert.equal(reconciler.resolveEditableTarget(newField)?.blockId, 'a')
  reconciler.destroy()
})

test('failed child inline reconciliation retries a mode-only descriptor change', () => {
  const ownerDocument = new FakeDocument()
  const container = ownerDocument.createElement('main')
  const root = ownerDocument.createElement('article')
  const field = ownerDocument.createElement('span')
  root.appendChild(field)
  let mode = 'rich-text'
  let attempts = 0
  const registry = {
    hasBlock: () => true,
    getBlockDefinition: type => ({ type }),
    getBlockRuntime: () => ({ create(data) {
      return {
        element: root, read() { return data }, setReadOnly() {}, destroy() {},
        editableFields() { return [{ key: 'text', element: field, mode }] },
      }
    } }),
  }
  const inlineProjection = {
    prepareBlock() { return { apply() {}, finalize() {}, recover() {}, discard() {} } },
    reconcileBlock() {
      attempts++
      if (attempts === 1) throw new Error('mode transition projection failed')
    },
    destroy() {},
  }
  const reconciler = new BlockReconciler({
    container, registry, inlineProjection, contextFactory: () => ({}),
  })
  reconciler.mount(new DocumentStore({
    version: '2.0.0', blocks: [block('a')],
  }))
  mode = 'plain-text'

  assert.throws(() => reconciler.getEditableFields('a'), /mode transition projection failed/)
  assert.equal(attempts, 1)
  assert.equal(reconciler.getEditableField('a', 'text').mode, 'plain-text')
  assert.equal(attempts, 2, 'failed mode transition cannot be mistaken for committed projection')
  assert.equal(reconciler.resolveEditableTarget(field)?.mode, 'plain-text')
  reconciler.destroy()
})

test('throwing editableFields preserves the previously committed descriptor', () => {
  const ownerDocument = new FakeDocument()
  const container = ownerDocument.createElement('main')
  const root = ownerDocument.createElement('article')
  const field = ownerDocument.createElement('span')
  root.appendChild(field)
  let fail = false
  const registry = {
    hasBlock: () => true,
    getBlockDefinition: type => ({ type }),
    getBlockRuntime: () => ({ create(data) {
      return {
        element: root, read() { return data }, setReadOnly() {}, destroy() {},
        editableFields() {
          if (fail) throw new Error('field capture failed')
          return [{ key: 'text', element: field, mode: 'rich-text' }]
        },
      }
    } }),
  }
  const reconciler = new BlockReconciler({ container, registry, contextFactory: () => ({}) })
  reconciler.mount(new DocumentStore({
    version: '2.0.0', blocks: [block('a')],
  }))
  fail = true
  assert.throws(() => reconciler.getEditableFields('a'), /field capture failed/)
  assert.equal(reconciler.resolveEditableTarget(field)?.fieldKey, 'text')
  fail = false
  assert.equal(reconciler.getEditableField('a', 'text').element, field)
  reconciler.destroy()
})

test('readBlock rejects late external editable descriptors before serializing application DOM', () => {
  const ownerDocument = new FakeDocument()
  const container = ownerDocument.createElement('main')
  const external = ownerDocument.createElement('aside')
  external.textContent = 'unrelated-private-content'
  const blockRoot = ownerDocument.createElement('article')
  const ownedField = ownerDocument.createElement('span')
  blockRoot.appendChild(ownedField)
  ownedField.textContent = 'authored-editor-content'
  let advertiseForeign = false
  let serializations = 0
  const registry = {
    hasBlock: () => true,
    getBlockDefinition: type => ({ type }),
    getBlockRuntime: () => ({ create(data) {
      return {
        element: blockRoot, read() { return data },
        setReadOnly() {}, destroy() {},
        editableFields() {
          return [{ key: 'text', element: advertiseForeign ? external : ownedField, mode: 'rich-text' }]
        },
      }
    } }),
  }
  const inlineProjection = {
    prepareBlock() { return { apply() {}, recover() {}, finalize() {}, discard() {} } },
    serializeBlock(_id, _record, _definition, fields, data) {
      serializations++
      return { data: { ...data, text: fields[0].element.textContent }, inline: undefined }
    },
    destroy() {},
  }
  const reconciler = new BlockReconciler({
    container, registry, inlineProjection, contextFactory: () => ({}),
  })
  reconciler.mount(new DocumentStore({
    version: '2.0.0', blocks: [block('a')],
  }))
  advertiseForeign = true
  assert.throws(() => reconciler.readBlock('a'), /must belong to its owning block DOM/)
  assert.equal(serializations, 0, 'never serialize a foreign DOM field into canonical data')
  assert.equal(reconciler.resolveEditableTarget(ownedField)?.fieldKey, 'text',
    'a rejected read must not revoke the earlier mounted field owner')
  reconciler.destroy()
})

test('readBlock still serializes a valid mounted editable field', () => {
  const ownerDocument = new FakeDocument()
  const container = ownerDocument.createElement('main')
  const blockRoot = ownerDocument.createElement('article')
  const field = ownerDocument.createElement('span')
  field.textContent = 'authored'
  blockRoot.appendChild(field)
  let serializations = 0
  const registry = {
    hasBlock: () => true,
    getBlockDefinition: type => ({ type }),
    getBlockRuntime: () => ({ create(initial) {
      return {
        element: blockRoot, read() { return initial }, setReadOnly() {}, destroy() {},
        editableFields() { return [{ key: 'text', mode: 'rich-text', element: field }] },
      }
    } }),
  }
  const inlineProjection = {
    prepareBlock() { return { apply() {}, recover() {}, finalize() {}, discard() {} } },
    serializeBlock(_id, _record, _definition, fields, data) {
      serializations++
      assert.equal(fields[0].element, field)
      return { data: { ...data, text: field.textContent }, inline: undefined }
    },
    destroy() {},
  }
  const reconciler = new BlockReconciler({
    container, registry, inlineProjection, contextFactory: () => ({}),
  })
  reconciler.mount(new DocumentStore({
    version: '2.0.0', blocks: [block('a')],
  }))
  assert.equal(reconciler.readBlock('a').data.text, 'authored')
  assert.equal(serializations, 1)
  reconciler.destroy()
})

test('displaced block shell cannot supply editable fields or DOM data until remounted', () => {
  const { reconciler, container } = setup(1)
  const ownedShell = reconciler.getElement('0')
  const field = reconciler.getEditableField('0', 'text').element
  const existing = reconciler.readBlock('0')
  assert.equal(existing.data.text, '0')
  assert.equal(reconciler.resolveEditableTarget(field)?.blockId, '0')

  const replacement = container.ownerDocument.createElement('aside')
  container.replaceChildren(replacement)
  assert.throws(() => reconciler.readBlock('0'), /Projected block is no longer mounted/)
  assert.deepEqual(reconciler.getEditableFields('0'), [])
  assert.equal(reconciler.getEditableField('0', 'text'), undefined)
  assert.equal(reconciler.resolveEditableTarget(field), null)

  container.appendChild(ownedShell)
  assert.equal(reconciler.readBlock('0').data.text, '0',
    'the unchanged owned shell may be read again when reattached to its host')
  assert.equal(reconciler.getEditableField('0', 'text').element, field)
  replacement.remove()
  reconciler.destroy()
})

test('displaced block shell cannot focus while detached host retains normal operation', () => {
  const ownerDocument = new FakeDocument()
  const container = ownerDocument.createElement('main')
  let focused = 0
  const registry = {
    hasBlock: () => true,
    getBlockDefinition: type => ({ type }),
    getBlockRuntime: () => ({ create(initial) {
      const element = ownerDocument.createElement('article')
      return {
        element, read() { return initial },
        editableFields() { return [] },
        setReadOnly() {}, destroy() {},
        focus() { focused++ },
      }
    } }),
  }
  const reconciler = new BlockReconciler({ container, registry, contextFactory: () => ({}) })
  reconciler.mount(new DocumentStore({
    version: '2.0.0', blocks: [block('a')],
  }))
  const shell = reconciler.getElement('a')
  assert.equal(reconciler.focus('a'), true)
  assert.equal(focused, 1, 'a host need not be attached to document.body')

  const application = ownerDocument.createElement('aside')
  container.replaceChildren(application)
  assert.equal(reconciler.focus('a'), false)
  assert.equal(focused, 1, 'displaced block focus cannot execute extension callbacks')
  container.appendChild(shell)
  assert.equal(reconciler.focus('a'), true)
  assert.equal(focused, 2)
  application.remove()
  reconciler.destroy()
})

test('readBlock rejects data from a block replaced synchronously by its read callback', () => {
  const doc = new FakeDocument()
  const container = doc.createElement('main')
  let reconciler
  let replaceOnRead = false
  let releases = 0
  const registry = {
    hasBlock: () => true,
    getBlockDefinition: type => ({ type }),
    getBlockRuntime: () => ({ create(initial) {
      const element = doc.createElement('article')
      return {
        element,
        read() {
          if (replaceOnRead && initial.text === 'old') {
            replaceOnRead = false
            reconciler.mount(new DocumentStore({
              version: '2.0.0', blocks: [block('a', 'replacement')],
            }))
          }
          return { text: initial.text }
        },
        setReadOnly() {},
        destroy() { releases++ },
      }
    } }),
  }
  reconciler = new BlockReconciler({ container, registry, contextFactory: () => ({}) })
  reconciler.mount(new DocumentStore({
    version: '2.0.0', blocks: [block('a', 'old')],
  }))
  replaceOnRead = true
  assert.throws(() => reconciler.readBlock('a'), /ownership changed during read/)
  assert.equal(reconciler.readBlock('a').data.text, 'replacement')
  assert.equal(releases, 1, 'retired block was released after the callback')
  reconciler.destroy()
  assert.equal(releases, 2)
})

test('readBlock rejects a block destroyed during editable-field enumeration', () => {
  const doc = new FakeDocument()
  const container = doc.createElement('main')
  let reconciler
  let destroyOnFields = false
  const registry = {
    hasBlock: () => true,
    getBlockDefinition: type => ({ type }),
    getBlockRuntime: () => ({ create(initial) {
      const element = doc.createElement('article')
      const field = doc.createElement('span')
      element.appendChild(field)
      return {
        element,
        read() { return initial },
        editableFields() {
          if (destroyOnFields) {
            destroyOnFields = false
            reconciler.destroy()
          }
          return [{ key: 'text', element: field, mode: 'rich-text' }]
        },
        setReadOnly() {},
        destroy() {},
      }
    } }),
  }
  reconciler = new BlockReconciler({ container, registry, contextFactory: () => ({}) })
  reconciler.mount(new DocumentStore({
    version: '2.0.0', blocks: [block('a')],
  }))
  destroyOnFields = true
  assert.throws(() => reconciler.readBlock('a'), /ownership changed during read/)
  assert.deepEqual(reconciler.ids, [])
  assert.deepEqual(container.children, [])
})

test('reentrant field enumeration cannot return descriptors from a replaced block', () => {
  const doc = new FakeDocument()
  const container = doc.createElement('main')
  let reconciler
  let replaceOnFields = false
  const registry = {
    hasBlock: () => true,
    getBlockDefinition: type => ({ type }),
    getBlockRuntime: () => ({ create(initial) {
      const element = doc.createElement('article')
      const field = doc.createElement('span')
      element.appendChild(field)
      return {
        element,
        read() { return initial },
        editableFields() {
          if (replaceOnFields && initial.text === 'old') {
            replaceOnFields = false
            reconciler.mount(new DocumentStore({
              version: '2.0.0', blocks: [block('a', 'new')],
            }))
          }
          return [{ key: 'text', element: field, mode: 'rich-text' }]
        },
        setReadOnly() {},
        destroy() {},
      }
    } }),
  }
  reconciler = new BlockReconciler({ container, registry, contextFactory: () => ({}) })
  reconciler.mount(new DocumentStore({
    version: '2.0.0', blocks: [block('a', 'old')],
  }))
  const oldField = reconciler.getEditableField('a', 'text').element
  replaceOnFields = true
  assert.deepEqual(reconciler.getEditableFields('a'), [])
  const newField = reconciler.getEditableField('a', 'text').element
  assert.notEqual(newField, oldField)
  assert.equal(reconciler.resolveEditableTarget(oldField), null)
  assert.equal(reconciler.resolveEditableTarget(newField)?.blockId, 'a')
  reconciler.destroy()
})

test('block focus does not report success after its callback destroys the owner', () => {
  const doc = new FakeDocument()
  const container = doc.createElement('main')
  let reconciler
  let focusCalls = 0
  const registry = {
    hasBlock: () => true,
    getBlockDefinition: type => ({ type }),
    getBlockRuntime: () => ({ create(initial) {
      return {
        element: doc.createElement('article'),
        read() { return initial },
        focus() { focusCalls++; reconciler.destroy() },
        setReadOnly() {},
        destroy() {},
      }
    } }),
  }
  reconciler = new BlockReconciler({ container, registry, contextFactory: () => ({}) })
  reconciler.mount(new DocumentStore({
    version: '2.0.0', blocks: [block('a')],
  }))
  assert.equal(reconciler.focus('a'), false)
  assert.equal(focusCalls, 1)
  assert.deepEqual(reconciler.ids, [])
})

test('inline serialization cannot return data after destroying its block owner', () => {
  const doc = new FakeDocument()
  const container = doc.createElement('main')
  let reconciler
  let serializeCalls = 0
  const registry = {
    hasBlock: () => true,
    getBlockDefinition: type => ({ type }),
    getBlockRuntime: () => ({ create(initial) {
      return {
        element: doc.createElement('article'),
        read() { return initial },
        setReadOnly() {},
        destroy() {},
      }
    } }),
  }
  const inlineProjection = {
    prepareBlock() { return { apply() {}, recover() {}, finalize() {}, discard() {} } },
    serializeBlock(_id, _record, _definition, _fields, data) {
      serializeCalls++
      reconciler.destroy()
      return { data, inline: undefined }
    },
    destroy() {},
  }
  reconciler = new BlockReconciler({
    container, registry, inlineProjection, contextFactory: () => ({}),
  })
  reconciler.mount(new DocumentStore({
    version: '2.0.0', blocks: [block('a')],
  }))
  assert.throws(() => reconciler.readBlock('a'), /ownership changed during read/)
  assert.equal(serializeCalls, 1)
  assert.deepEqual(reconciler.ids, [])
})
