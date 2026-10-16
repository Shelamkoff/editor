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

test('failed multi-style acquisition rolls back newly added styles and borrowed counts', () => {
  const { doc, links } = fakeDocument('rollback')
  const live = acquireStyleUrls(['/shared.css'], doc)
  const first = links[0]
  doc.head.appendChild = link => {
    if (link.href === '/failed.css') throw new Error('stylesheet insertion failed')
    links.push(link)
  }

  assert.throws(() => acquireStyleUrls(['/shared.css', '/temporary.css', '/failed.css'], doc),
    /stylesheet insertion failed/)
  assert.equal(first.removed, false, 'preexisting style remains owned by its original lease')
  assert.equal(links[1].removed, true, 'new style from failed acquisition is released')

  live.destroy()
  assert.equal(first.removed, true, 'a failed borrower must not retain a reference count')

  const next = acquireStyleUrls(['/temporary.css'], doc)
  assert.notEqual(links[2], links[1], 'rolled-back URL must be acquired anew')
  next.destroy()
  assert.equal(links[2].removed, true)
})

test('partial DOM append followed by an exception releases the newly appended link', () => {
  const { doc, links } = fakeDocument('partial-append')
  doc.head.appendChild = link => {
    links.push(link)
    if (link.href === '/fault.css') throw new Error('append failed after insertion')
  }

  assert.throws(() => acquireStyleUrls(['/ok.css', '/fault.css'], doc), /append failed after insertion/)
  assert.equal(links.length, 2)
  assert.equal(links[0].removed, true)
  assert.equal(links[1].removed, true)

  const lease = acquireStyleUrls(['/ok.css'], doc)
  assert.equal(links.length, 3)
  lease.destroy()
  assert.equal(links[2].removed, true)
})
