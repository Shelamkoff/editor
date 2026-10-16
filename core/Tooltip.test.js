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
