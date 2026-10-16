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
