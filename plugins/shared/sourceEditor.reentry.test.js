import assert from 'node:assert/strict'
import test from 'node:test'
import { openSourceEditor, preloadSourceEditor } from './sourceEditor.js'
import { createPluginLayer } from './layer.js'

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


test('reparented preloaded source surface is not removed from a foreign host on refresh', () => {
  const h = fixture()
  preloadSourceEditor(h.wrapper, h.controller.signal, ['url'])
  const old = h.surface('url')
  assert.ok(old)
  const foreign = new Node(h.document, 'section')
  foreign.appendChild(old)
  assert.equal(old.parentNode, foreign)

  preloadSourceEditor(h.wrapper, h.controller.signal, ['url'])
  const replacement = h.surface('url')
  assert.ok(replacement && replacement !== old,
    'source editor failed to rebuild its own replacement')
  assert.equal(foreign.contains(old), true,
    'SourceEditor removed a DOM node now owned by another host')
  assert.equal(old.parentNode, foreign)
  h.controller.abort()
})

test('reparented source surface survives original owner abort', () => {
  const h = fixture()
  preloadSourceEditor(h.wrapper, h.controller.signal, ['html'])
  const old = h.surface('html')
  assert.ok(old)
  const foreign = new Node(h.document, 'section')
  foreign.appendChild(old)

  h.controller.abort()
  assert.equal(foreign.contains(old), true,
    'aborted source owner removed a surface in a foreign host')
  assert.equal(old.parentNode, foreign)
})

test('owner abort still removes source surfaces remaining in the original wrapper', () => {
  const h = fixture()
  preloadSourceEditor(h.wrapper, h.controller.signal, ['url', 'html'])
  const url = h.surface('url')
  const html = h.surface('html')
  h.controller.abort()
  assert.equal(url.parentNode, null)
  assert.equal(html.parentNode, null)
  assert.deepEqual(h.wrapper.children, [])
})

for (const kind of ['url', 'html']) {
  test(`closing ${kind} preserves the cached same-kind successor opened by focus`, async () => {
    const h = fixture()
    h.wrapper.closest = selector => selector === '.oe-block' ? h.wrapper : null
    const previousFocus = new Node(h.document, 'button')
    previousFocus.getClientRects = () => [{}]
    h.wrapper.appendChild(previousFocus)
    let armed = false
    let successor
    const submitted = []
    previousFocus.addEventListener('focus', () => {
      if (!armed) return
      armed = false
      successor = openSourceEditor(h.options(kind, {
        title: 'Successor', onSubmit: value => submitted.push(value),
      }))
    })
    previousFocus.focus()
    const old = openSourceEditor(h.options(kind, { title: 'Old editor' }))
    const surface = h.surface(kind)
    h.field(kind).focus()
    armed = true
    old.close()
    old.close()
    await Promise.resolve()
    assert.ok(successor)
    assert.equal(h.surface(kind), surface, 'the cached surface should be reused')
    assert.equal(h.panel(kind).getAttribute('aria-label'), 'Successor')
    assert.equal(surface.getAttribute('aria-hidden'), 'false')
    assert.equal(surface.inert, false)
    assert.equal(h.document.activeElement, h.field(kind))
    assert.equal(h.wrapper.getAttribute('data-oe-layer-open'), 'true')
    h.field(kind).value = 'successor value'
    h.panel(kind).fire('submit')
    assert.deepEqual(submitted, ['successor value'])
    assert.equal(surface.getAttribute('aria-hidden'), 'true')
    assert.equal(h.wrapper.getAttribute('data-oe-layer-open'), null)
    h.controller.abort()
  })

  test(`an abort observer opening a ${kind} successor retains the shared layer`, async () => {
    const h = fixture()
    h.wrapper.closest = selector => selector === '.oe-block' ? h.wrapper : null
    const settings = createPluginLayer(h.wrapper, h.controller.signal)
    settings.open()
    preloadSourceEditor(h.wrapper, h.controller.signal, [kind])
    const backdrop = h.surface(kind).children[0]
    const addListener = backdrop.addEventListener.bind(backdrop)
    let sessionSignal
    backdrop.addEventListener = (type, listener, options) => {
      if (type === 'click') sessionSignal = options.signal
      addListener(type, listener, options)
    }
    const old = openSourceEditor(h.options(kind))
    let successor
    sessionSignal.addEventListener('abort', () => {
      successor = openSourceEditor(h.options(kind, { title: 'Abort successor' }))
    }, { once: true })
    old.close()
    await Promise.resolve()
    assert.ok(successor)
    assert.equal(h.panel(kind).getAttribute('aria-label'), 'Abort successor')
    assert.equal(h.surface(kind).getAttribute('aria-hidden'), 'false')
    assert.equal(h.surface(kind).inert, false)
    settings.close()
    assert.equal(h.wrapper.getAttribute('data-oe-layer-open'), 'true',
      'old close released the successor layer along with the settings layer')
    successor.close()
    assert.equal(h.wrapper.getAttribute('data-oe-layer-open'), null)
    h.controller.abort()
  })

  test(`restoring focus cannot submit ${kind} after its owner is revoked`, async () => {
    const h = fixture()
    const button = new Node(h.document, 'button')
    button.getClientRects = () => [{}]
    h.wrapper.appendChild(button)
    button.focus()
    const submitted = []
    openSourceEditor(h.options(kind, { onSubmit: value => submitted.push(value) }))
    h.field(kind).focus()
    button.addEventListener('focus', () => h.controller.abort())
    h.field(kind).value = 'validated value'
    const surface = h.surface(kind)
    h.panel(kind).fire('submit')
    await Promise.resolve()
    assert.deepEqual(submitted, [])
    assert.equal(surface.parentNode, null)
    assert.equal(surface.getAttribute('aria-hidden'), 'true')
  })
}
