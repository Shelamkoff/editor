import test from 'node:test'
import assert from 'node:assert/strict'

import { renderInlineWidgets } from './inlineWidgets.js'

class FakeElement {
  constructor(ownerDocument = undefined) {
    this.ownerDocument = ownerDocument
    this.parentNode = null
    this.isConnected = false
  }
  attributes = {}
  contentEditable = 'inherit'
  setAttribute(name, value) { this.attributes[name] = value }
}

function harness(render, { registered = true } = {}) {
  const token = {
    data: 'before {{one}} after',
    parentElement: null,
    replaced: null,
    replaceWith(value) { this.replaced = value },
  }
  const ownerDocument = {
    defaultView: { HTMLElement: FakeElement },
    createTreeWalker() {
      let first = true
      return { nextNode() { if (!first) return null; first = false; return token } }
    },
    createDocumentFragment() {
      return {
        nodes: [],
        append(...nodes) {
          for (const node of nodes) {
            node.parentNode = this
            this.nodes.push(node)
          }
        },
      }
    },
    createTextNode(data) { return { data } },
  }
  const inline = { one: { type: 'third-party', dataVersion: 1, data: { label: 'One' } } }
  const registry = registered
    ? new Map([['third-party', { schema: { decode: input => input }, render }]])
    : new Map()
  const fragment = {}
  return { invoke: () => renderInlineWidgets(fragment, inline, registry, ownerDocument), token, fragment, ownerDocument }
}

test('a registered inline renderer cannot silently leave the widget placeholder visible', () => {
  const probe = harness(() => null)
  assert.throws(probe.invoke, /must return an HTMLElement/)
  assert.equal(probe.token.replaced, null, 'the original DOM is unchanged on failed projection')
})

test('asynchronous inline renderer completion is rejected at the rendering boundary', async () => {
  const probe = harness(() => Promise.resolve(new FakeElement()))
  assert.throws(probe.invoke, /must complete synchronously/)
  await Promise.resolve()
  assert.equal(probe.token.replaced, null)
})

test('unknown widget types remain inert and valid registered types replace their placeholder', () => {
  const unknown = harness(() => { throw new Error('not registered') }, { registered: false })
  assert.equal(unknown.invoke(), unknown.fragment)
  assert.equal(unknown.token.replaced, null)

  const valid = harness(() => new FakeElement())
  assert.equal(valid.invoke(), valid.fragment)
  assert.equal(valid.token.replaced.nodes.length, 3)
  const element = valid.token.replaced.nodes[1]
  assert.equal(element.attributes['data-inline-plugin'], 'third-party')
  assert.equal(element.attributes['data-id'], 'one')
  assert.equal(element.contentEditable, 'false')
})

test('registered inline renderer cannot adopt an element connected to another UI', () => {
  let connected
  const probe = harness(() => connected)
  connected = new FakeElement(probe.ownerDocument)
  connected.isConnected = true

  assert.throws(probe.invoke, /must return a fresh detached HTMLElement/)
  assert.equal(probe.token.replaced, null)
  assert.equal(connected.isConnected, true, 'failed inline rendering never claims the original element')
})

test('registered inline renderer cannot adopt a foreign-document or parented element', () => {
  let node
  const probe = harness(() => node)
  node = new FakeElement({ differentDocument: true })
  assert.throws(probe.invoke, /must return an HTMLElement in the owning document/)
  assert.equal(probe.token.replaced, null)

  node = new FakeElement(probe.ownerDocument)
  const foreignFragment = { nodes: [node] }
  node.parentNode = foreignFragment
  assert.throws(probe.invoke, /must return a fresh detached HTMLElement/)
  assert.equal(node.parentNode, foreignFragment)
  assert.deepEqual(foreignFragment.nodes, [node])
  assert.equal(probe.token.replaced, null)
})

test('one inline DOM element cannot serve two occurrences in the same field', () => {
  let reused
  const probe = harness(() => reused)
  probe.token.data = '{{one}} {{one}}'
  reused = new FakeElement(probe.ownerDocument)

  assert.throws(probe.invoke, /must return a fresh detached HTMLElement/)
  assert.equal(probe.token.replaced, null, 'failed projection cannot publish a truncated pair')
})

test('distinct detached inline elements still project repeated widget occurrences', () => {
  let probe
  let created = 0
  probe = harness(() => { created++; return new FakeElement(probe.ownerDocument) })
  probe.token.data = '{{one}} {{one}}'
  assert.equal(probe.invoke(), probe.fragment)
  assert.equal(created, 2)
  assert.equal(probe.token.replaced.nodes.length, 3)
  assert.equal(probe.token.replaced.nodes[0].attributes['data-id'], 'one')
  assert.equal(probe.token.replaced.nodes[2].attributes['data-id'], 'one')
})
