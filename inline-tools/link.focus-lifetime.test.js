// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { createLinkTool } from './link.js'

function fixture(scheduler) {
  const frames = []
  let active = true
  class Element {
    constructor(tag, document) {
      this.ownerDocument = document; this.tagName = tag.toUpperCase(); this.nodeType = 1
      this.parentNode = null; this.children = []; this.style = {}; this.attrs = new Map(); this.focusCalls = 0
    }
    get isConnected() { return this === this.ownerDocument.body || this.parentNode?.isConnected === true }
    appendChild(child) { child.remove(); child.parentNode = this; this.children.push(child); return child }
    remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null }
    contains(node) { return this === node || this.children.some(child => child.contains(node)) }
    setAttribute(name, value) { this.attrs.set(name, String(value)) }
    getAttribute(name) { return this.attrs.get(name) ?? null }
    addEventListener() {}
    focus() { this.focusCalls++; this.ownerDocument.activeElement = this }
  }
  const document = { defaultView: { getSelection: () => null }, createElement: tag => new Element(tag, document) }
  document.body = document.createElement('body')
  if (scheduler === 'frame') document.defaultView.requestAnimationFrame = callback => { frames.push(callback); return frames.length }
  const field = document.createElement('p'), range = { startContainer: field }
  const ctx = { get range() { return active ? range : null }, close() {}, showTooltip() {}, hideTooltip() {} }
  const panel = createLinkTool('Link').renderActions(ctx)
  document.body.appendChild(panel)
  const input = panel.children.find(element => element.tagName === 'INPUT')
  const host = document.createElement('section'); document.body.appendChild(host)
  const successor = document.createElement('input'); host.appendChild(successor); successor.focus()
  return { document, panel, input, host, successor, retire() { active = false },
    async flush() { if (scheduler === 'frame') frames.splice(0).forEach(callback => callback()); else await Promise.resolve() } }
}

for (const scheduler of ['frame', 'microtask']) {
  test(`Link ${scheduler} focuses a live mounted URL input`, async () => {
    const h = fixture(scheduler); await h.flush()
    assert.equal(h.input.focusCalls, 1); assert.ok(h.document.activeElement === h.input)
  })

  test(`retired Link ${scheduler} cannot focus a retained panel adopted by another host`, async () => {
    const h = fixture(scheduler); h.retire(); h.host.appendChild(h.panel); await h.flush()
    assert.equal(h.input.focusCalls, 0); assert.ok(h.document.activeElement === h.successor)
  })

  test(`Link ${scheduler} cannot focus an input extracted from its panel`, async () => {
    const h = fixture(scheduler); h.host.appendChild(h.input); await h.flush()
    assert.equal(h.input.focusCalls, 0); assert.ok(h.document.activeElement === h.successor)
  })

  test(`Link ${scheduler} cannot focus its former input after foreign-document adoption`, async () => {
    const h = fixture(scheduler)
    const foreign = { body: h.panel, activeElement: null }
    for (const element of [h.panel, ...h.panel.children]) element.ownerDocument = foreign
    await h.flush()
    assert.equal(h.input.focusCalls, 0); assert.ok(h.document.activeElement === h.successor)
  })

  test(`Link ${scheduler} retains focus through a harmless panel layout wrapper`, async () => {
    const h = fixture(scheduler), wrapper = h.document.createElement('div')
    h.panel.appendChild(wrapper); wrapper.appendChild(h.input); await h.flush()
    assert.equal(h.input.focusCalls, 1); assert.ok(h.document.activeElement === h.input)
  })
}
