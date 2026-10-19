import assert from 'node:assert/strict'
import test from 'node:test'
import { Tooltip } from './Tooltip.js'

function tooltipHarness() {
  const callbacks = []
  const cleared = []
  const attributes = new Map()
  const anchor = {
    getBoundingClientRect: () => ({ left: 20, width: 80, top: 20, bottom: 40, height: 20 }),
    getAttribute: name => attributes.get(name) ?? null,
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: name => attributes.delete(name),
    addEventListener() {},
  }
  let popup = null
  const document = {
    addEventListener() {},
    createElement() {
      return {
        className: '',
        style: { display: '' },
        textContent: '',
        children: [],
        attributes: new Map(),
        setAttribute(name, value) { this.attributes.set(name, value) },
        replaceChildren(...children) { this.children = children },
        append(...children) { this.children.push(...children) },
        getBoundingClientRect() { return { width: 100, height: 24 } },
        remove() { this.removed = true },
      }
    },
  }
  document.defaultView = {
    AbortController,
    navigator: { userAgent: 'Test' },
    innerWidth: 400,
    innerHeight: 300,
    addEventListener() {},
    setTimeout(callback) { callbacks.push(callback); return callbacks.length },
    clearTimeout(id) { cleared.push(id) },
  }
  const root = {
    ownerDocument: document,
    isConnected: true,
    contains: candidate => candidate === anchor,
    append(element) { popup = element },
    addEventListener() {},
  }
  return { root, anchor, callbacks, cleared, get popup() { return popup } }
}

test('a cancelled tooltip callback cannot recreate presentation or aria-describedby', () => {
  const h = tooltipHarness()
  const tooltip = new Tooltip(h.root)
  tooltip.show(h.anchor, 'Old')
  tooltip.hide()
  // The timer was already queued before clearTimeout was observed.
  h.callbacks[0]()
  assert.equal(h.popup.style.display, 'none')
  assert.equal(h.anchor.getAttribute('aria-describedby'), null)
  assert.deepEqual(h.cleared, [1])
  tooltip.destroy()
})

test('an earlier queued tooltip callback cannot overwrite a newer pending tooltip', () => {
  const h = tooltipHarness()
  const tooltip = new Tooltip(h.root)
  tooltip.show(h.anchor, 'Old')
  tooltip.show(h.anchor, 'New')
  h.callbacks[0]()
  assert.equal(h.popup.style.display, 'none', 'stale callback presented old content')
  h.callbacks[1]()
  assert.equal(h.popup.style.display, 'flex')
  assert.equal(h.popup.children[0].textContent, 'New')
  assert.equal(h.anchor.getAttribute('aria-describedby'), h.popup.id)
  tooltip.hide()
  assert.equal(h.anchor.getAttribute('aria-describedby'), null)
  tooltip.destroy()
})

test('a retired timer cannot expose an already destroyed tooltip', () => {
  const h = tooltipHarness()
  const tooltip = new Tooltip(h.root)
  tooltip.show(h.anchor, 'Old')
  tooltip.destroy()
  h.callbacks[0]()
  assert.equal(h.popup.removed, true)
  assert.equal(h.popup.style.display, 'none')
  assert.equal(h.anchor.getAttribute('aria-describedby'), null)
})

function boundAnchor(rect = { left: 20, width: 80, top: 20, bottom: 40, height: 20 }) {
  const handlers = new Map()
  const attrs = new Map()
  return {
    handlers,
    addEventListener(type, fn) { handlers.set(type, fn) },
    fire(type) { handlers.get(type)?.() },
    getBoundingClientRect: () => rect,
    getAttribute: name => attrs.get(name) ?? null,
    setAttribute(name, value) { attrs.set(name, value) },
    removeAttribute(name) { attrs.delete(name) },
  }
}

test('an obsolete mouseleave does not cancel a newer anchor tooltip', () => {
  const h = tooltipHarness()
  const a = boundAnchor()
  const b = boundAnchor({ left: 120, width: 60, top: 20, bottom: 40, height: 20 })
  h.root.contains = node => node === a || node === b
  const tooltip = new Tooltip(h.root)
  tooltip.bind(a, () => 'Old')
  tooltip.bind(b, () => 'New')

  a.fire('mouseenter')
  b.fire('mouseenter')
  a.fire('mouseleave')
  h.callbacks[1]()
  assert.equal(h.popup.style.display, 'flex',
    'old anchor mouseleave canceled the new anchor pending tooltip')
  assert.equal(h.popup.children[0].textContent, 'New')
  assert.equal(b.getAttribute('aria-describedby'), h.popup.id)
  tooltip.destroy()
})

test('an obsolete blur does not hide another anchor already showing a tooltip', () => {
  const h = tooltipHarness()
  const a = boundAnchor()
  const b = boundAnchor({ left: 120, width: 60, top: 20, bottom: 40, height: 20 })
  h.root.contains = node => node === a || node === b
  const tooltip = new Tooltip(h.root)
  tooltip.bind(a, () => 'Old')
  tooltip.bind(b, () => 'New')
  a.fire('focus')
  h.callbacks[0]()
  b.fire('focus')
  h.callbacks[1]()
  a.fire('blur')
  assert.equal(h.popup.style.display, 'flex',
    'old anchor blur retired a newer active tooltip')
  assert.equal(b.getAttribute('aria-describedby'), h.popup.id)
  tooltip.destroy()
})

test('queued bound event after destroy never evaluates extension tooltip labels', () => {
  const h = tooltipHarness()
  const a = boundAnchor()
  h.root.contains = node => node === a
  const tooltip = new Tooltip(h.root)
  let labelCalls = 0
  tooltip.bind(a, () => { labelCalls++; return 'Unavailable' })
  tooltip.destroy()
  a.fire('mouseenter')
  assert.equal(labelCalls, 0,
    'retired tooltip still ran author-provided label callback')
  assert.equal(h.popup.removed, true)
})

test('throwing tooltip label does not leak the previous visible presentation', () => {
  const h = tooltipHarness()
  const b = boundAnchor({ left: 120, width: 60, top: 20, bottom: 40, height: 20 })
  h.root.contains = node => node === h.anchor || node === b
  const tooltip = new Tooltip(h.root)
  tooltip.show(h.anchor, 'Old')
  h.callbacks[0]()
  assert.equal(h.popup.style.display, 'flex')

  tooltip.bind(b, () => { throw new Error('extension tooltip label failed') })
  assert.doesNotThrow(() => b.fire('mouseenter'),
    'failed extension tooltip label propagated from a native mouse event')
  assert.equal(h.popup.style.display, 'none')
  assert.equal(h.anchor.getAttribute('aria-describedby'), null)
  tooltip.destroy()
})

test('tooltip label reentry cannot overwrite a newer owner', () => {
  const h = tooltipHarness()
  const first = boundAnchor()
  const successor = boundAnchor({left:120,width:60,top:20,bottom:40,height:20})
  h.root.contains = node => node === first || node === successor
  const tooltip = new Tooltip(h.root)
  tooltip.bind(first, () => {
    tooltip.show(successor, 'Successor')
    return 'Obsolete'
  })
  first.fire('mouseenter')
  assert.equal(h.callbacks.length, 1,
    'stale label result scheduled a second tooltip over the new presentation')
  h.callbacks[0]()
  assert.equal(h.popup.style.display, 'flex')
  assert.equal(h.popup.children[0].textContent, 'Successor')
  assert.equal(successor.getAttribute('aria-describedby'), h.popup.id)
  assert.equal(first.getAttribute('aria-describedby'), null)
  tooltip.destroy()
})

test('tooltip geometry reentry cannot publish an obsolete tooltip', () => {
  const h = tooltipHarness()
  const first = boundAnchor()
  const successor = boundAnchor({left:120,width:60,top:20,bottom:40,height:20})
  h.root.contains = node => node === first || node === successor
  const tooltip = new Tooltip(h.root)
  const originalRect = first.getBoundingClientRect
  let reentered = false
  first.getBoundingClientRect = () => {
    if (!reentered) {
      reentered = true
      tooltip.show(successor, 'Successor')
    }
    return originalRect()
  }
  tooltip.show(first, 'Obsolete')
  h.callbacks[0]()
  assert.equal(h.popup.style.display, 'none',
    'a retired geometry callback published its old tooltip over the new owner')
  assert.equal(first.getAttribute('aria-describedby'), null)
  h.callbacks[1]()
  assert.equal(h.popup.children[0].textContent, 'Successor')
  assert.equal(successor.getAttribute('aria-describedby'), h.popup.id)
  tooltip.destroy()
})
test('reentrant timer registration cannot replace the newest tooltip owner', () => {
  const h = tooltipHarness()
  const view = h.root.ownerDocument.defaultView
  const pending = new Map()
  let issued = 0
  let tooltip
  view.setTimeout = callback => {
    const id = ++issued
    pending.set(id, callback)
    if (id === 1) tooltip.show(h.anchor, 'Newest')
    return id
  }
  view.clearTimeout = id => pending.delete(id)
  tooltip = new Tooltip(h.root)
  tooltip.show(h.anchor, 'Obsolete')
  assert.deepEqual([...pending.keys()], [2],
    'a superseded registration left a stale tooltip timer alive')
  pending.get(2)()
  assert.equal(h.popup.children[0].textContent, 'Newest')
  tooltip.destroy()
  assert.deepEqual([...pending.keys()], [2],
    'an already fired callback should be outside pending host map only when its host retires it')
})

test('destroy during timer registration does not leave a tooltip timer alive', () => {
  const h = tooltipHarness()
  const view = h.root.ownerDocument.defaultView
  const pending = new Map()
  let tooltip
  view.setTimeout = callback => {
    pending.set(1, callback)
    tooltip.destroy()
    return 1
  }
  view.clearTimeout = id => pending.delete(id)
  tooltip = new Tooltip(h.root)
  tooltip.show(h.anchor, 'Retired')
  assert.deepEqual([...pending.keys()], [],
    'a destroyed tooltip retained a timer returned by its obsolete host registration')
  assert.equal(h.popup.removed, true)
})
