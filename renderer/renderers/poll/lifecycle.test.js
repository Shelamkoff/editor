import test from 'node:test'
import assert from 'node:assert/strict'
import { createPollRenderer } from './index.js'
import { Poll } from '../../../plugins/poll/index.js'

// Only the synchronous DOM operations needed by Poll's view builder. Network
// and disposal assertions below use the real renderer factory, not a mock.
function ownerDocument() {
  const doc = { defaultView: { AbortController } }
  doc.createElement = tag => ({
    tagName: tag, ownerDocument: doc, children: [], style: {}, attributes: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {} }, listeners: new Map(),
    setAttribute(name, value) { this.attributes[name] = value },
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
  const plugin = new Poll(config)
  const data = { ...block.data, resultsMode: 'hidden', options: [{ id: 'yes', text: '' }, { id: 'no', text: '' }] }
  const element = plugin.render(data, { ownerDocument: ownerDocument(), readOnly: true, mutate() {} })
  return { plugin, element }
}

test('editor Poll does not start deferred load after destruction', async () => {
  let loads = 0
  const f = editorPoll({ dataSource: {
    async load() { loads++; return emptyResults() }, async vote() { return emptyResults() },
  } })
  f.plugin.destroy(f.element)
  await settle()
  assert.equal(loads, 0)
})

test('editor Poll releases ownership before reentrant subscription disposal', () => {
  let unsubscribes = 0
  let f
  f = editorPoll({ dataSource: {
    async load() { return emptyResults() }, async vote() { return emptyResults() },
    subscribe() { return () => { unsubscribes++; if (unsubscribes === 1) f.plugin.destroy(f.element) } },
  } })
  f.plugin.destroy(f.element)
  assert.equal(unsubscribes, 1)
})
