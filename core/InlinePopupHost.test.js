// @ts-nocheck
import test from 'node:test'
import assert from 'node:assert/strict'
import { InlinePopupHost } from './InlinePopupHost.js'

class FakeElement {
  constructor(ownerDocument) {
    this.ownerDocument = ownerDocument
    this.parentNode = null
    this.children = []
    this.style = { removeProperty() {}, setProperty() {} }
    this.scrollHeight = 36
    this.scrollWidth = 36
    this.isRoot = false
    this.failAttach = false
    this.failLayout = false
    this.onMeasure = null
  }

  get isConnected() { return this.isRoot || Boolean(this.parentNode?.isConnected) }
  contains(target) {
    for (let cursor = target; cursor; cursor = cursor.parentNode) {
      if (cursor === this) return true
    }
    return false
  }
  appendChild(child) {
    child.remove()
    this.children.push(child)
    child.parentNode = this
    if (this.failAttach) {
      this.failAttach = false
      throw new Error('append failed after insertion')
    }
    return child
  }
  remove() {
    if (!this.parentNode) return
    const items = this.parentNode.children
    items.splice(items.indexOf(this), 1)
    this.parentNode = null
  }
  getBoundingClientRect() {
    if (this.failLayout) throw new Error('layout failed')
    this.onMeasure?.()
    return { left: 8, top: 40, bottom: 60, width: 80, height: 20 }
  }
}

function fixture() {
  const listeners = new Map()
  const ownerDocument = {
    defaultView: {
      HTMLElement: FakeElement,
      AbortController,
      innerWidth: 1200,
      innerHeight: 800,
      addEventListener(event, listener) { listeners.set(event, listener) },
    },
    documentElement: { clientWidth: 1200 },
    createElement() { return new FakeElement(ownerDocument) },
    addEventListener() {},
    removeEventListener() {},
  }
  const root = ownerDocument.createElement('div')
  root.isRoot = true
  const anchor = ownerDocument.createElement('span')
  root.appendChild(anchor)
  const host = new InlinePopupHost({ root })
  return { root, anchor, host, listeners, create: () => ownerDocument.createElement('div') }
}

test('failed initial popup measurement detaches surface and invokes cleanup once', () => {
  const { root, anchor, host, create } = fixture()
  let released = 0
  anchor.failLayout = true
  assert.throws(() => host.showPopup('first', anchor, create(), () => released++), /layout failed/)
  assert.deepEqual(root.children, [anchor])
  assert.equal(released, 1)
  anchor.failLayout = false
  const handle = host.showPopup('next', anchor, create(), () => released++)
  assert.equal(root.children.length, 2)
  handle.close()
  host.destroy()
  assert.equal(root.children.length, 1)
  assert.equal(released, 2)
})

test('DOM attach failure after insertion rolls back popup and cleanup', () => {
  const { root, anchor, host, create } = fixture()
  let released = 0
  root.failAttach = true
  assert.throws(() => host.showPopup('first', anchor, create(), () => released++), /append failed after insertion/)
  assert.deepEqual(root.children, [anchor])
  assert.equal(released, 1)
  host.destroy()
  assert.equal(released, 1)
})

test('reentrant successor popup survives stale handle and initial positioning', () => {
  const { root, anchor, host, create } = fixture()
  const released = []
  let successor
  anchor.onMeasure = () => {
    if (successor) return
    // Prevent recursive measurement of the same anchor while opening successor.
    anchor.onMeasure = null
    successor = host.showPopup('successor', anchor, create(), () => released.push('successor'))
  }
  const stale = host.showPopup('retired', anchor, create(), () => released.push('retired'))
  assert.deepEqual(released, ['retired'])
  assert.equal(root.children.length, 2)
  stale.close()
  assert.equal(root.children.length, 2, 'stale close must not retire successor')
  successor.close()
  host.destroy()
  assert.deepEqual(released, ['retired', 'successor'])
  assert.deepEqual(root.children, [anchor])
})

test('later resize layout failure retires popup without leaking surface', () => {
  const { root, anchor, host, listeners, create } = fixture()
  let released = 0
  const handle = host.showPopup('first', anchor, create(), () => released++)
  assert.equal(root.children.length, 2)
  anchor.failLayout = true
  const warn = console.warn
  try {
    console.warn = () => {}
    listeners.get('resize')()
  } finally {
    console.warn = warn
  }
  assert.deepEqual(root.children, [anchor])
  assert.equal(released, 1)
  handle.close()
  host.destroy()
  assert.equal(released, 1)
})

test('a retired outside-mousedown listener cannot close a successor popup', async () => {
  const { root, anchor, host, create } = fixture()
  const captured = []
  const ownerDocument = root.ownerDocument
  ownerDocument.addEventListener = (name, listener) => {
    if (name === 'mousedown') captured.push(listener)
  }
  ownerDocument.removeEventListener = () => {}
  const releases = []
  host.showPopup('first', anchor, create(), () => releases.push('first'))
  await Promise.resolve()
  assert.equal(captured.length, 1)
  const stale = captured[0]

  const successor = host.showPopup('second', anchor, create(), () => releases.push('second'))
  await Promise.resolve()
  assert.equal(root.children.length, 2)
  stale({ target: create() })
  assert.equal(root.children.length, 2, 'old captured listener has no successor authority')
  assert.deepEqual(releases, ['first'])
  successor.close()
  assert.deepEqual(releases, ['first', 'second'])
  host.destroy()
})

test('failure to install deferred popup listener retires only its own surface', async () => {
  const { root, anchor, host, create } = fixture()
  root.ownerDocument.addEventListener = () => { throw new Error('outside registration failed') }
  let released = 0
  const warn = console.warn
  try {
    console.warn = () => {}
    host.showPopup('owner', anchor, create(), () => released++)
    await Promise.resolve()
  } finally {
    console.warn = warn
  }
  assert.deepEqual(root.children, [anchor])
  assert.equal(released, 1)
  host.destroy()
  assert.equal(released, 1)
})
