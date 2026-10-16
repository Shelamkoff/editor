import test from 'node:test'
import assert from 'node:assert/strict'
import { createPollRenderer } from './index.js'
import { createPollPlugin } from '../../../plugins/poll/index.js'

// Only the synchronous DOM operations needed by Poll's view builder. Network
// and disposal assertions below use the real renderer factory, not a mock.
function ownerDocument() {
  const doc = { defaultView: { AbortController } }
  doc.createElement = tag => ({
    tagName: tag, ownerDocument: doc, children: [], style: {}, attributes: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {} }, listeners: new Map(),
    setAttribute(name, value) { this.attributes[name] = value },
    getAttribute(name) {
      if (name.startsWith('data-')) return this.dataset[name.slice(5).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase())] ?? null
      return this.attributes[name] ?? null
    },
    remove() {
      const parent = this.parentNode
      if (parent) { parent.children.splice(parent.children.indexOf(this), 1); this.parentNode = null }
    },
    replaceChildren(...children) { this.children = children },
    append(...children) { this.children.push(...children) },
    appendChild(child) { this.children.push(child); child.parentNode = this; return child },
    querySelectorAll(selector) {
      const result = []
      const visit = node => {
        if (node.className?.split(' ').includes(selector.slice(1))) result.push(node)
        node.children?.forEach(visit)
      }
      this.children.forEach(visit)
      return result
    },
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null },
    replaceWith(next) {
      const parent = this.parentNode
      if (parent) { parent.children[parent.children.indexOf(this)] = next; next.parentNode = parent }
    },
    addEventListener(name, callback) { this.listeners.set(name, callback) },
  })
  return doc
}
const block = {
  id: 'a', type: 'poll', data: {
    pollId: 'p', question: '', type: 'single', resultsMode: 'always',
    options: [{ id: 'yes', text: 'Yes' }, { id: 'no', text: 'No' }],
    initialResults: { total: 0, options: [{ id: 'yes', votes: 0 }, { id: 'no', votes: 0 }], currentUserVote: ['yes'] },
  },
}
const emptyResults = () => ({ total: 0, options: [{ id: 'yes', votes: 0 }, { id: 'no', votes: 0 }] })
const settle = async () => { for (let index = 0; index < 8; index++) await Promise.resolve() }
function mounted(config) {
  const doc = ownerDocument()
  const renderer = createPollRenderer('test', {}, config)
  const element = renderer.render(block, value => ({ textContent: value }), { ownerDocument: doc })
  const find = cls => {
    const walk = node => node.className === cls ? node : node.children?.map(walk).find(Boolean)
    return walk(element)
  }
  return { renderer, element, find }
}

test('Poll does not start deferred load after its result has been destroyed', async () => {
  let loads = 0
  const f = mounted({ dataSource: { async load() { loads++; return emptyResults() }, async vote() { return emptyResults() } } })
  f.renderer.destroy(f.element)
  await settle()
  assert.equal(loads, 0)
})

test('retained Poll option and submit controls stay inert after destruction', () => {
  const f = mounted({})
  const marker = f.element.children[0].children[0].children[0]
  const submit = f.find('test-poll__submit')
  assert.ok(marker.listeners.has('click')); assert.ok(submit.listeners.has('click'))
  f.renderer.destroy(f.element)
  f.element.replaceChildren()
  marker.listeners.get('click')()
  submit.listeners.get('click')()
  assert.deepEqual(f.element.children, [])
})

test('retained remote Poll submit does not report errors after destruction', () => {
  let errors = 0
  const f = mounted({
    dataSource: { async load() { return emptyResults() }, async vote() { return emptyResults() } },
    onError() { errors++ },
  })
  const submit = f.find('test-poll__submit')
  f.renderer.destroy(f.element)
  f.element.replaceChildren()
  submit.listeners.get('click')()
  assert.equal(errors, 0)
  assert.deepEqual(f.element.children, [])
})

test('Poll releases ownership before unsubscribe calls destroy again', () => {
  let unsubscribes = 0
  let f
  f = mounted({ dataSource: {
    async load() { return emptyResults() }, async vote() { return emptyResults() },
    subscribe() { return () => { unsubscribes++; if (unsubscribes === 1) f.renderer.destroy(f.element) } },
  } })
  f.renderer.destroy(f.element)
  assert.equal(unsubscribes, 1)
})

test('a live Poll still loads once and disposes its subscription exactly once', async () => {
  let loads = 0, unsubscribes = 0
  const f = mounted({ dataSource: {
    async load() { loads++; return emptyResults() }, async vote() { return emptyResults() },
    subscribe() { return () => { unsubscribes++ } },
  } })
  await settle()
  assert.equal(loads, 1)
  f.renderer.destroy(f.element); f.renderer.destroy(f.element)
  assert.equal(unsubscribes, 1)
})


function editorPoll(config) {
  const doc = ownerDocument()
  const definition = createPollPlugin(config)
  const runtimeController = new AbortController()
  const runtime = definition.setup({
    ownerDocument: doc,
    signal: runtimeController.signal,
    isDefaultBlock: false,
    t: (_key, fallback = '') => fallback,
  })
  const instanceController = new AbortController()
  const data = { ...block.data, resultsMode: 'hidden', options: [{ id: 'yes', text: '' }, { id: 'no', text: '' }] }
  const instance = runtime.create(data, {
    ownerDocument: doc,
    signal: instanceController.signal,
    createId: prefix => prefix + '-1',
    getData: () => data,
    updateData() {},
    commitDomMutation(operation) { operation() },
    requestSplit() {},
    requestExit() {},
    isReadOnly: () => true,
  })
  return { runtime, instance, element: instance.element }
}

test('editor Poll does not start deferred load after destruction', async () => {
  let loads = 0
  const f = editorPoll({ dataSource: {
    async load() { loads++; return emptyResults() }, async vote() { return emptyResults() },
  } })
  f.instance.destroy()
  await settle()
  assert.equal(loads, 0)
  f.runtime.destroy()
})

test('editor Poll releases ownership before reentrant subscription disposal', () => {
  let unsubscribes = 0
  let f
  f = editorPoll({ dataSource: {
    async load() { return emptyResults() }, async vote() { return emptyResults() },
    subscribe() { return () => { unsubscribes++; if (unsubscribes === 1) f.instance.destroy() } },
  } })
  f.instance.destroy()
  assert.equal(unsubscribes, 1)
  f.runtime.destroy()
})

test('renderer Poll rejects asynchronous subscription acquisition and reports it', async () => {
  const errors = []
  const f = mounted({
    dataSource: {
      async load() { return emptyResults() },
      async vote() { return emptyResults() },
      subscribe() { return Promise.resolve(() => {}) },
    },
    onError(error) { errors.push(error) },
  })
  assert.equal(errors.length, 1, 'subscription must settle before the renderer proceeds')
  assert.match(String(errors[0]), /must complete synchronously/)
  f.renderer.destroy(f.element)
  await settle()
})

test('renderer Poll contains an asynchronous unsubscribe result', async () => {
  const errors = []
  const f = mounted({
    dataSource: {
      async load() { return emptyResults() },
      async vote() { return emptyResults() },
      subscribe() { return () => Promise.resolve() },
    },
    onError(error) { errors.push(error) },
  })
  f.renderer.destroy(f.element)
  assert.equal(errors.length, 1)
  assert.match(String(errors[0]), /must complete synchronously/)
  await settle()
})

test('editor Poll rejects an asynchronous subscription acquisition', async () => {
  const errors = []
  const f = editorPoll({
    dataSource: {
      async load() { return emptyResults() },
      async vote() { return emptyResults() },
      subscribe() { return Promise.resolve(() => {}) },
    },
    onError(error) { errors.push(error) },
  })
  assert.equal(errors.length, 1)
  assert.match(String(errors[0]), /must complete synchronously/)
  f.instance.destroy()
  f.runtime.destroy()
  await settle()
})

test('editor Poll observes invalid asynchronous unsubscribe completion', async () => {
  const errors = []
  const f = editorPoll({
    dataSource: {
      async load() { return emptyResults() },
      async vote() { return emptyResults() },
      subscribe() { return () => Promise.resolve() },
    },
    onError(error) { errors.push(error) },
  })
  f.instance.destroy()
  assert.equal(errors.length, 1)
  assert.match(String(errors[0]), /must complete synchronously/)
  f.runtime.destroy()
  await settle()
})

test('renderer Poll releases unsubscribe returned after reentrant destruction', () => {
  const doc = ownerDocument()
  const create = doc.createElement
  let wrapper = null
  doc.createElement = tag => {
    const element = create(tag)
    if (!wrapper) wrapper = element
    return element
  }
  let unsubscribes = 0
  let renderer
  renderer = createPollRenderer('test', {}, {
    dataSource: {
      async load() { return emptyResults() },
      async vote() { return emptyResults() },
      subscribe({ onError }) {
        onError(new Error('reentrant notification'))
        return () => { unsubscribes++ }
      },
    },
    onError() { renderer.destroy(wrapper) },
  })
  const element = renderer.render(block, text => ({ textContent: text }), { ownerDocument: doc })
  assert.equal(wrapper, element)
  renderer.destroy(element)
  assert.equal(unsubscribes, 1, 'late disposer must be released exactly once')
})

test('editor Poll disposes subscription returned after connection abort in subscribe', () => {
  const doc = ownerDocument()
  const instanceController = new AbortController()
  let unsubscribes = 0
  const definition = createPollPlugin({
    dataSource: {
      async load() { return emptyResults() },
      async vote() { return emptyResults() },
      subscribe() {
        instanceController.abort()
        return () => { unsubscribes++ }
      },
    },
  })
  const runtimeController = new AbortController()
  const runtime = definition.setup({
    ownerDocument: doc,
    signal: runtimeController.signal,
    isDefaultBlock: false,
    t: (_key, fallback = '') => fallback,
  })
  const data = {
    ...block.data,
    resultsMode: 'hidden',
    options: [{ id: 'yes', text: '' }, { id: 'no', text: '' }],
  }
  const instance = runtime.create(data, {
    ownerDocument: doc,
    signal: instanceController.signal,
    createId: prefix => prefix + '-new',
    getData: () => data,
    updateData() {},
    commitDomMutation(operation) { operation() },
    requestSplit() {},
    requestExit() {},
    isReadOnly: () => true,
  })
  assert.equal(unsubscribes, 1, 'returned disposer belongs to an already aborted session')
  instance.destroy()
  runtime.destroy()
  assert.equal(unsubscribes, 1, 'destroy cannot repeat the retired cleanup')
})

test('renderer Poll rejects async revision comparators instead of silently dropping results', async () => {
  let publish
  const errors = []
  const f = mounted({
    dataSource: {
      async load() { return { ...emptyResults(), revision: '1' } },
      async vote() { return emptyResults() },
      subscribe({ onUpdate }) { publish = onUpdate },
    },
    compareRevisions: () => Promise.resolve(1),
    onError(error) { errors.push(error) },
  })
  await settle()
  assert.doesNotThrow(() => publish({ ...emptyResults(), revision: '2' }))
  assert.equal(errors.length, 1)
  assert.match(String(errors[0]), /must complete synchronously/)
  f.renderer.destroy(f.element)
})

test('editor Poll contains later subscription callback failures from revision comparators', async () => {
  let publish
  const errors = []
  const f = editorPoll({
    dataSource: {
      async load() { return { ...emptyResults(), revision: '1' } },
      async vote() { return emptyResults() },
      subscribe({ onUpdate }) { publish = onUpdate },
    },
    compareRevisions: () => Promise.resolve(1),
    onError(error) { errors.push(error) },
  })
  await settle()
  assert.equal(typeof publish, 'function')
  assert.doesNotThrow(() => publish({ ...emptyResults(), revision: '2' }),
    'a failed comparator must not throw into an unrelated data source')
  assert.equal(errors.length, 1)
  assert.match(String(errors[0]), /must complete synchronously/)
  f.instance.destroy()
  f.runtime.destroy()
})
