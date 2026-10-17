import assert from 'node:assert/strict'
import test from 'node:test'
import { openSourceEditor } from './sourceEditor.js'

// A detached owning-document DOM with real AbortSignal listener semantics.
// Tests exercise the exported editor actions rather than their private cache.
class Node {
  constructor(ownerDocument, tag) {
    this.ownerDocument = ownerDocument
    this.tagName = tag.toUpperCase()
    this.parentNode = null
    this.children = []
    this.dataset = {}
    this.attributes = new Map()
    this.style = {}
    this.className = ''
    this.hidden = false
    this.inert = false
    this.isConnected = true
    this.value = ''
    this.textContent = ''
    this.listeners = new Map()
    const element = this
    this.classList = {
      toggle(name, force) {
        const names = new Set(element.className.split(/\s+/).filter(Boolean))
        const active = force ?? !names.has(name)
        if (active) names.add(name)
        else names.delete(name)
        element.className = [...names].join(' ')
        return active
      },
      add(name) { this.toggle(name, true) },
      remove(name) { this.toggle(name, false) },
    }
  }
  append(...nodes) { for (const node of nodes) this.appendChild(node) }
  appendChild(node) {
    if (typeof node === 'string') {
      const text = new Node(this.ownerDocument, '#text')
      text.textContent = node
      node = text
    }
    node.remove()
    node.parentNode = this
    node.isConnected = this.isConnected
    this.children.push(node)
    return node
  }
  remove() {
    if (this.parentNode) {
      const siblings = this.parentNode.children
      const index = siblings.indexOf(this)
      if (index >= 0) siblings.splice(index, 1)
      this.parentNode = null
    }
    this.isConnected = false
  }
  contains(node) {
    return node === this || this.children.some(child => child.contains(node))
  }
  closest() { return null }
  focus() {
    this.ownerDocument.activeElement = this
    this.fire('focus')
  }
  getClientRects() { return [] }
  setAttribute(name, value) { this.attributes.set(name, String(value)) }
  removeAttribute(name) { this.attributes.delete(name) }
  getAttribute(name) { return this.attributes.get(name) ?? null }
  addEventListener(type, callback, options = {}) {
    if (options.signal?.aborted) return
    const list = this.listeners.get(type) ?? []
    list.push(callback)
    this.listeners.set(type, list)
    if (options.signal) options.signal.addEventListener('abort',
      () => this.removeEventListener(type, callback), { once: true })
  }
  removeEventListener(type, callback) {
    const list = this.listeners.get(type)
    const index = list?.indexOf(callback) ?? -1
    if (index >= 0) list.splice(index, 1)
  }
  fire(type) {
    const event = {
      type, target: this, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true },
      stopPropagation() {},
    }
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn(event)
    return event
  }
}

function fixture() {
  const document = {
    activeElement: null,
    defaultView: { AbortController },
    createElement(tag) { return new Node(document, tag) },
  }
  const wrapper = new Node(document, 'div')
  const controller = new AbortController()
  const surface = kind => wrapper.children.find(item => item.dataset.oeSourceEditor === kind)
  const options = (kind, extra = {}) => ({
    wrapper,
    signal: controller.signal,
    kind,
    title: 'New source',
    label: 'Source',
    placeholder: 'https://',
    submitText: 'Insert',
    cancelText: 'Cancel',
    invalidText: 'Invalid URL',
    normalize: value => value,
    onSubmit() {},
    ...extra,
  })
  const panel = kind => surface(kind)?.children.find(item => item.tagName === 'FORM')
  const field = kind => panel(kind)?.children.find(item => item.tagName === 'LABEL')
    ?.children.find(item => item.tagName === (kind === 'url' ? 'INPUT' : 'TEXTAREA'))
  return { document, wrapper, controller, surface, options, panel, field }
}

test('source normalization cannot submit after the owning scope is aborted', async () => {
  const h = fixture()
  const changes = []
  openSourceEditor(h.options('url', {
    normalize(value) {
      h.controller.abort()
      return value
    },
    onSubmit(value) { changes.push(value) },
  }))
  const retired = h.surface('url')
  const originalField = h.field('url')
  originalField.value = 'https://example.test/one'
  h.panel('url').fire('submit')
  await Promise.resolve()
  assert.deepEqual(changes, [], 'aborted source editor submitted stale input')
  assert.equal(retired.getAttribute('aria-hidden'), 'true')
  assert.equal(retired.parentNode, null, 'aborted source surface remained mounted')
  assert.notEqual(h.document.activeElement, originalField,
    'aborted source editor stole focus back')
})

test('opening a successor while validating makes the old submit inert', async () => {
  const h = fixture()
  const oldChanges = []
  const newChanges = []
  openSourceEditor(h.options('url', {
    normalize(value) {
      openSourceEditor(h.options('html', { onSubmit(next) { newChanges.push(next) } }))
      return value
    },
    onSubmit(value) { oldChanges.push(value) },
  }))
  h.field('url').value = 'https://example.test/one'
  h.panel('url').fire('submit')
  assert.deepEqual(oldChanges, [], 'retired form submitted after its successor opened')
  assert.equal(h.surface('url').getAttribute('aria-hidden'), 'true')
  assert.equal(h.surface('html').getAttribute('aria-hidden'), 'false')
  h.field('html').value = '<p>Successor</p>'
  h.panel('html').fire('submit')
  assert.deepEqual(newChanges, ['<p>Successor</p>'])
  await Promise.resolve()
  h.controller.abort()
})

test('invalid normalization cannot focus a form revoked during validation', async () => {
  const h = fixture()
  openSourceEditor(h.options('url', {
    normalize() {
      h.controller.abort()
      return ''
    },
  }))
  const retired = h.surface('url')
  const originalField = h.field('url')
  originalField.value = 'not a URL'
  h.panel('url').fire('submit')
  await Promise.resolve()
  assert.notEqual(h.document.activeElement, originalField,
    'retired invalid form regained focus after scope teardown')
  assert.equal(retired.getAttribute('aria-hidden'), 'true')
  assert.equal(retired.parentNode, null)
})

test('ordinary validated submissions still complete once and cache the surface', async () => {
  const h = fixture()
  const values = []
  openSourceEditor(h.options('url', { onSubmit(value) { values.push(value) } }))
  const oldSurface = h.surface('url')
  h.field('url').value = 'https://example.test/first'
  h.panel('url').fire('submit')
  assert.deepEqual(values, ['https://example.test/first'])
  assert.equal(oldSurface.getAttribute('aria-hidden'), 'true')
  openSourceEditor(h.options('url', { onSubmit(value) { values.push(value) } }))
  assert.equal(h.surface('url'), oldSurface)
  h.field('url').value = 'https://example.test/second'
  h.panel('url').fire('submit')
  assert.deepEqual(values, ['https://example.test/first', 'https://example.test/second'])
  h.controller.abort()
  await Promise.resolve()
})


test('a focus-triggered successor cannot be overwritten by an older opening request', async () => {
  const h = fixture()
  const previousFocus = new Node(h.document, 'button')
  previousFocus.getClientRects = () => [{}]
  h.wrapper.appendChild(previousFocus)
  let armed = false
  let successorOpens = 0
  previousFocus.addEventListener('focus', () => {
    if (!armed) return
    successorOpens++
    openSourceEditor(h.options('html', { title: 'Newest source' }))
  })

  previousFocus.focus()
  openSourceEditor(h.options('url', { title: 'Initial source' }))
  h.field('url').focus()
  armed = true
  // Closing Initial source restores focus and synchronously opens HTML.
  // The outer URL request may no longer supersede that newer session.
  openSourceEditor(h.options('url', { title: 'Intermediate source' }))
  assert.equal(successorOpens, 1)
  assert.equal(h.surface('url').getAttribute('aria-hidden'), 'true',
    'older open request made its surface active after a successor opened')
  assert.equal(h.surface('html').getAttribute('aria-hidden'), 'false',
    'the newest reentrant source editor was hidden')
  await Promise.resolve()
  h.controller.abort()
})
