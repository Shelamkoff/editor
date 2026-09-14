// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'

import { acquireStyleUrls } from './styleRegistry.js'

function fakeDocument(name) {
  const links = []
  const doc = {
    head: { appendChild(link) { links.push(link) } },
    createElement(tag) {
      assert.equal(tag, 'link')
      return {
        owner: name,
        dataset: {},
        removed: false,
        remove() { this.removed = true },
      }
    },
  }
  return { doc, links }
}

test('stylesheet ownership is reference-counted independently per document', () => {
  const first = fakeDocument('first')
  const second = fakeDocument('second')

  const firstA = acquireStyleUrls(['/shared.css'], first.doc)
  const firstB = acquireStyleUrls(['/shared.css'], first.doc)
  const secondA = acquireStyleUrls(['/shared.css'], second.doc)

  assert.equal(first.links.length, 1)
  assert.equal(second.links.length, 1)
  assert.notEqual(first.links[0], second.links[0])

  firstA.destroy()
  assert.equal(first.links[0].removed, false)
  assert.equal(second.links[0].removed, false)

  firstB.destroy()
  assert.equal(first.links[0].removed, true)
  assert.equal(second.links[0].removed, false)

  secondA.destroy()
  assert.equal(second.links[0].removed, true)
})

test('explicit owning document does not consult ambient document', () => {
  const { doc, links } = fakeDocument('owner')
  const previous = globalThis.document
  globalThis.document = new Proxy({}, { get() { throw new Error('ambient document must not be used') } })
  try {
    const lease = acquireStyleUrls(['/owner.css'], doc)
    assert.equal(links.length, 1)
    lease.destroy()
  } finally {
    globalThis.document = previous
  }
})
