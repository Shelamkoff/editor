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

test('popup refuses to adopt editor-owned nodes and keeps the active presentation intact', () => {
  const { root, anchor, host, create } = fixture()
  const events = []
  const active = host.showPopup('active', anchor, create(), () => events.push('active'))
  assert.equal(root.children.length, 2)

  // This previously moved the editable anchor under popup, then removed it
  // from the editor when the popup closed.
  assert.throws(
    () => host.showPopup('invalid', anchor, anchor, () => events.push('invalid')),
    /Popup requires owning-document HTML elements/,
  )
  assert.equal(root.children[0], anchor)
  assert.equal(root.contains(anchor), true)
  assert.equal(root.children.length, 2, 'invalid content must not close the active popup')
  assert.deepEqual(events, [])

  const ownedControl = create()
  root.appendChild(ownedControl)
  assert.throws(() => host.showPopup('invalid-control', anchor, ownedControl), /Popup requires/)
  assert.equal(root.contains(ownedControl), true)

  active.close()
  assert.equal(root.contains(anchor), true)
  assert.equal(root.contains(ownedControl), true)
  assert.deepEqual(events, ['active'])
  host.destroy()
})

test('popup rejects connected content borrowed from another editor in the same document', () => {
  const { root, anchor, host, create } = fixture()
  const foreignRoot = create()
  foreignRoot.isRoot = true
  const control = create()
  foreignRoot.appendChild(control)
  assert.equal(control.isConnected, true)
  assert.equal(root.contains(control), false)

  assert.throws(
    () => host.showPopup('borrowed', anchor, control),
    /Popup requires owning-document HTML elements/,
  )
  assert.equal(foreignRoot.contains(control), true)
  assert.equal(root.children.length, 1)
  host.destroy()
})

test('popup cannot steal content owned by a disconnected application subtree', () => {
  const { root, anchor, host, create } = fixture()
  const releases = []
  const active = host.showPopup('active', anchor, create(), () => releases.push('active'))
  const currentPopup = root.children[1]
  const detachedApplication = create()
  const borrowed = create()
  detachedApplication.appendChild(borrowed)
  assert.equal(borrowed.isConnected, false)
  assert.equal(root.contains(borrowed), false)

  assert.throws(
    () => host.showPopup('borrowed', anchor, borrowed, () => releases.push('borrowed')),
    /Popup requires owning-document HTML elements/,
  )
  assert.equal(detachedApplication.children[0], borrowed, 'popup adopted a foreign detached node')
  assert.equal(root.children[1], currentPopup, 'invalid popup closed a valid presentation')
  assert.deepEqual(releases, [], 'a rejected request cannot own the foreign disposer')
  active.close()
  assert.deepEqual(releases, ['active'])
  host.destroy()
  assert.equal(detachedApplication.children[0], borrowed)
})

test('popup removed by custom-element disconnect cannot retire a reentrant successor', () => {
  const { root, anchor, host, create } = fixture()
  const destroyed = []
  host.showPopup('old', anchor, create(), () => destroyed.push('old'))
  const oldPopup = root.children[1]
  const remove = oldPopup.remove.bind(oldPopup)
  let successor = null
  let invoked = false
  oldPopup.remove = () => {
    remove()
    if (invoked) return
    invoked = true
    successor = host.showPopup('successor', anchor, create(), () => destroyed.push('successor'))
  }

  host.hidePopup()
  assert.deepEqual(destroyed, ['old'], 'the new cleanup must not run with the old popup')
  assert.equal(root.children.length, 2, 'successor must remain mounted')
  successor.close()
  assert.deepEqual(root.children, [anchor])
  assert.deepEqual(destroyed, ['old', 'successor'])
  host.destroy()
  assert.deepEqual(destroyed, ['old', 'successor'], 'each owner is released once')
})

test('reentry from outside-listener removal retains successor ownership', async () => {
  const { root, anchor, host, create } = fixture()
  const destroyed = []
  host.showPopup('old', anchor, create(), () => destroyed.push('old'))
  await Promise.resolve()

  const ownerDocument = root.ownerDocument
  let next = null
  let invoked = false
  ownerDocument.removeEventListener = () => {
    if (invoked) return
    invoked = true
    next = host.showPopup('successor', anchor, create(), () => destroyed.push('successor'))
  }

  host.hidePopup()
  assert.deepEqual(destroyed, ['old'])
  assert.equal(root.children.length, 2)
  next.close()
  assert.deepEqual(root.children, [anchor])
  assert.deepEqual(destroyed, ['old', 'successor'])
  host.destroy()
})

test('observer teardown failure still releases popup and invokes author cleanup once', () => {
  const { root, anchor, host, create } = fixture()
  const originalCtor = root.ownerDocument.defaultView.MutationObserver
  let disconnected = 0
  root.ownerDocument.defaultView.MutationObserver = class {
    observe() {}
    disconnect() {
      disconnected++
      throw new Error('observer disconnect failed')
    }
  }
  const released = []
  try {
    const handle = host.showPopup('owner', anchor, create(), () => released.push('cleanup'))
    assert.equal(root.children.length, 2)
    assert.doesNotThrow(() => handle.close(),
      'a faulty observer turned normal popup disposal into a thrown editor error')
    assert.equal(disconnected, 1)
    assert.deepEqual(root.children, [anchor],
      'observer failure left a transient popup attached to the editor')
    assert.deepEqual(released, ['cleanup'])
    handle.close()
    host.destroy()
    assert.deepEqual(released, ['cleanup'])
  } finally {
    root.ownerDocument.defaultView.MutationObserver = originalCtor
  }
})

test('outside-listener removal failure does not strand the popup or author cleanup', async () => {
  const { root, anchor, host, create } = fixture()
  const released = []
  const document = root.ownerDocument
  const originalRemove = document.removeEventListener
  document.removeEventListener = () => { throw new Error('outside handler removal failed') }
  try {
    host.showPopup('owner', anchor, create(), () => released.push('cleanup'))
    await Promise.resolve()
    assert.equal(root.children.length, 2)
    assert.doesNotThrow(() => host.hidePopup())
    assert.deepEqual(root.children, [anchor],
      'listener error left the old presentation mounted')
    assert.deepEqual(released, ['cleanup'])
    host.destroy()
    assert.deepEqual(released, ['cleanup'])
  } finally {
    document.removeEventListener = originalRemove
  }
})

test('popup cleanup must not remove a surface adopted by another application root', () => {
  const { root, anchor, host, create } = fixture()
  const releases = []
  const handle = host.showPopup('owner', anchor, create(), () => releases.push('owner'))
  const surface = root.children[1]
  const outside = create()
  outside.isRoot = true
  outside.appendChild(surface)
  assert.equal(surface.parentNode, outside)
  handle.close()
  assert.deepEqual(root.children, [anchor])
  assert.deepEqual(outside.children, [surface],
    'retired popup stole a surface another root had adopted')
  assert.deepEqual(releases, ['owner'])
  host.destroy()
  assert.deepEqual(outside.children, [surface])
})
test('popup admission cannot steal content adopted by read-only preflight', () => {
  const { root, anchor, create } = fixture()
  const content = create()
  const foreign = create()
  let checks = 0
  let released = 0
  const host = new InlinePopupHost({
    root,
    isReadOnly() {
      if (++checks === 1) foreign.appendChild(content)
      return false
    },
  })
  assert.throws(
    () => host.showPopup('owner', anchor, content, () => released++),
    /Popup requires owning-document HTML elements/,
    'the host stole content adopted after its initial admission check',
  )
  assert.equal(checks, 1, 'preflight was not exercised')
  assert.deepEqual(foreign.children, [content])
  assert.deepEqual(root.children, [anchor],
    'rejected content unexpectedly mounted a popup shell')
  assert.equal(released, 0,
    'a rejected request must not invoke a cleanup now owned by another UI')
  host.destroy()
})

test('popup mount refuses content adopted during connected DOM insertion', () => {
  const { root, anchor, create } = fixture()
  const content = create()
  const foreign = create()
  const originalAppend = root.appendChild.bind(root)
  const released = []
  let detached = false
  root.appendChild = child => {
    const result = originalAppend(child)
    if (!detached && child !== anchor) {
      detached = true
      foreign.appendChild(content)
    }
    return result
  }

  const host = new InlinePopupHost({ root })
  assert.throws(
    () => host.showPopup('owner', anchor, content, () => released.push('cleanup')),
    /Popup content ownership changed during mounting/,
    'the host published an empty popup after its child was adopted elsewhere',
  )
  assert.equal(detached, true)
  assert.deepEqual(foreign.children, [content],
    'failed mount reclaimed another DOM owner\'s content')
  assert.deepEqual(root.children, [anchor],
    'a failed mount left an empty popup attached to the editor')
  assert.deepEqual(released, ['cleanup'],
    'provisional popup cleanup did not settle exactly once')
  host.destroy()
  assert.deepEqual(released, ['cleanup'])
})
test('popup surface adopted by another root during insertion survives failed mount', () => {
  const { root, anchor, create } = fixture()
  const outside = create()
  outside.isRoot = true
  const originalAppend = root.appendChild.bind(root)
  let adopted
  root.appendChild = child => {
    const result = originalAppend(child)
    if (child !== anchor) {
      outside.appendChild(child)
      adopted = child
    }
    return result
  }
  const host = new InlinePopupHost({ root })
  const cleaned = []
  assert.throws(
    () => host.showPopup('owner', anchor, create(), () => cleaned.push('once')),
    /Popup surface ownership changed during mounting/,
    'popup mounted even though a newer owner adopted its shell',
  )
  assert.deepEqual(root.children, [anchor])
  assert.deepEqual(outside.children, [adopted],
    'rollback removed a popup node from its newer DOM owner')
  assert.deepEqual(cleaned, ['once'])
  host.destroy()
  assert.deepEqual(outside.children, [adopted])
  assert.deepEqual(cleaned, ['once'])
})

test('old popup cleanup cannot redirect new popup content into its own subtree', () => {
  const { root, anchor, host, create } = fixture()
  const pending = create()
  const outside = create()
  const old = host.showPopup('old', anchor, create(), () => {
    outside.appendChild(pending)
  })
  let newCleanup = 0
  assert.throws(
    () => host.showPopup('new', anchor, pending, () => newCleanup++),
    /Popup requires owning-document HTML elements/,
    'cleanup of retired popup stole a newer popup input before its mount',
  )
  assert.deepEqual(outside.children, [pending])
  assert.deepEqual(root.children, [anchor])
  assert.equal(newCleanup, 0, 'never-acquired content cleanup was invoked')
  old.close()
  host.destroy()
})
