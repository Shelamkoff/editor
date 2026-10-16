import test from 'node:test'
import assert from 'node:assert/strict'

import { renderInlineWidgets } from './inlineWidgets.js'

class FakeElement {
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
      return { nodes: [], append(...nodes) { this.nodes.push(...nodes) } }
    },
    createTextNode(data) { return { data } },
  }
  const inline = { one: { type: 'third-party', dataVersion: 1, data: { label: 'One' } } }
  const registry = registered
    ? new Map([['third-party', { schema: { decode: input => input }, render }]])
    : new Map()
  const fragment = {}
  return { invoke: () => renderInlineWidgets(fragment, inline, registry, ownerDocument), token, fragment }
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
