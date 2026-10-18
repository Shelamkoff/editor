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

test('reentrant acquisition during link insertion cannot create orphaned duplicate styles', () => {
  const { doc, links } = fakeDocument('reentry')
  let attempted = false
  doc.head.appendChild = link => {
    links.push(link)
    if (!attempted) {
      attempted = true
      assert.throws(() => acquireStyleUrls(['/same.css'], doc), /Cannot reenter stylesheet acquisition/)
    }
  }
  const lease = acquireStyleUrls(['/same.css'], doc)
  assert.equal(links.length, 1, 'only the authoritative link is inserted')
  lease.destroy()
  assert.equal(links[0].removed, true)

  const next = acquireStyleUrls(['/same.css'], doc)
  assert.equal(links.length, 2, 'the temporary acquisition gate must be released')
  next.destroy()
  assert.equal(links[1].removed, true)
})

test('uncaught reentrant acquisition error rolls back partially appended stylesheet', () => {
  const { doc, links } = fakeDocument('failed-reentry')
  let first = true
  doc.head.appendChild = link => {
    links.push(link)
    if (first) {
      first = false
      acquireStyleUrls(['/same.css'], doc)
    }
  }
  assert.throws(() => acquireStyleUrls(['/same.css'], doc), /Cannot reenter stylesheet acquisition/)
  assert.equal(links.length, 1)
  assert.equal(links[0].removed, true, 'partially inserted link is removed on failure')
  const later = acquireStyleUrls(['/same.css'], doc)
  assert.equal(links.length, 2)
  later.destroy()
  assert.equal(links[1].removed, true)
})

test('stylesheet acquisition ignores caller-owned array iterators while de-duplicating URLs', () => {
  const { doc, links } = fakeDocument('iterator')
  const urls = ['/a.css', '/a.css', '/b.css']
  urls[Symbol.iterator] = () => { throw new Error('extension iterator must not run') }
  const lease = acquireStyleUrls(urls, doc)
  assert.equal(links.length, 2)
  assert.deepEqual(links.map(link => link.href), ['/a.css', '/b.css'])
  lease.destroy()
  assert.equal(links.every(link => link.removed), true)
})

test('stylesheet cleanup does not delete a link adopted by another DOM owner', () => {
  const { doc, links } = fakeDocument('adoption')
  const lease = acquireStyleUrls(['/owned.css'], doc)
  const link = links[0]
  const outside = { name: 'external owner' }
  link.parentNode = outside // another owner moved this stylesheet out of editor head
  lease.destroy()
  assert.equal(link.removed, false, 'old lease removed a link that changed owners')
  assert.equal(link.parentNode, outside)
  const replacement = acquireStyleUrls(['/owned.css'], doc)
  assert.equal(links.length, 2, 'stale ownership remained in registry')
  replacement.destroy()
  assert.equal(links[1].removed, true)
})

test('failed stylesheet append does not remove a link adopted during the callback', () => {
  const { doc, links } = fakeDocument('failed adoption')
  const original = doc.head.appendChild
  const outside = { name: 'external owner' }
  doc.head.appendChild = link => {
    links.push(link)
    link.parentNode = outside
    throw new Error('DOM append failed after external adoption')
  }
  assert.throws(() => acquireStyleUrls(['/adopted.css'], doc), /DOM append failed/)
  assert.equal(links[0].removed, false, 'rollback removed a foreign-adopted link')
  assert.equal(links[0].parentNode, outside)
  doc.head.appendChild = original
  const later = acquireStyleUrls(['/adopted.css'], doc)
  assert.equal(links.length, 2)
  later.destroy()
  assert.equal(links[1].removed, true)
})
test('stylesheet URL acquisition captures all entries before a host append callback', () => {
  const { doc, links } = fakeDocument('snapshot')
  const urls = ['/first.css', '/second.css']
  const append = doc.head.appendChild
  doc.head.appendChild = link => {
    append(link)
    if (link.href === '/first.css') urls[1] = '/redirected.css'
  }

  const lease = acquireStyleUrls(urls, doc)
  try {
    assert.deepEqual(links.map(link => link.href), ['/first.css', '/second.css'],
      'a style insertion callback changed a later URL before the registry owned it')
    assert.deepEqual(urls, ['/first.css', '/redirected.css'],
      'the hostile append callback did not mutate the fixture')
  } finally {
    lease.destroy()
  }
  assert.equal(links.every(link => link.removed), true)
})
