import test from 'node:test'
import assert from 'node:assert/strict'
import { createCarouselPlugin } from './carousel/index.js'
import { createAttachesPlugin } from './attaches/index.js'

// Exercise actual BlockInstance root drop handlers. No browser, network,
// image decoder or object-URL implementation is needed to test URL ownership.
class Element {
  constructor(tag, ownerDocument) {
    this.tagName = tag.toUpperCase()
    this.ownerDocument = ownerDocument
    this.parentNode = null
    this.children = []
    this.className = ''
    this.style = {}
    this.dataset = {}
    this.attributes = {}
    this.listeners = new Map()
    this.classList = {
      add() {}, remove() {}, toggle() { return false }, contains() { return false },
    }
  }
  append(...children) {
    for (let child of children) {
      if (typeof child === 'string') child = this.ownerDocument.createTextNode(child)
      child.remove()
      child.parentNode = this
      this.children.push(child)
    }
  }
  appendChild(child) { this.append(child); return child }
  replaceChildren(...children) {
    for (const child of this.children) child.parentNode = null
    this.children = []
    this.append(...children)
  }
  remove() {
    if (!this.parentNode) return
    const items = this.parentNode.children
    const index = items.indexOf(this)
    if (index >= 0) items.splice(index, 1)
    this.parentNode = null
  }
  addEventListener(type, callback, options = {}) {
    if (options.signal?.aborted) return
    const handlers = this.listeners.get(type) ?? []
    handlers.push(callback)
    this.listeners.set(type, handlers)
    options.signal?.addEventListener('abort', () => {
      const current = this.listeners.get(type) ?? []
      const index = current.indexOf(callback)
      if (index >= 0) current.splice(index, 1)
    }, { once: true })
  }
  dispatch(type, extra = {}) {
    const event = {
      type, target: this, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true },
      stopPropagation() {},
      ...extra,
    }
    for (const callback of [...(this.listeners.get(type) ?? [])]) callback(event)
    return event
  }
  setAttribute(key, value) { this.attributes[key] = String(value) }
  getAttribute(key) { return this.attributes[key] ?? null }
  querySelectorAll(selector) {
    const selectors = selector.split(',').map(value => value.trim())
    const result = []
    const visit = root => {
      for (const child of root.children) {
        if (selectors.some(name =>
          name[0] === '.' ? child.className.split(' ').includes(name.slice(1))
            : child.tagName === name.toUpperCase())) result.push(child)
        visit(child)
      }
    }
    visit(this)
    return result
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null }
}

function fixture(factory, file) {
  const created = []
  const revoked = []
  const failures = []
  const URLCtor = {
    createObjectURL() {
      const url = 'blob:local-' + (created.length + 1)
      created.push(url)
      return url
    },
    revokeObjectURL(url) { revoked.push(url) },
  }
  const doc = {
    defaultView: { URL: URLCtor, AbortController },
    createElement(tag) { return new Element(tag, doc) },
    createTextNode(value) {
      const node = new Element('#text', doc)
      node.textContent = String(value)
      return node
    },
    addEventListener() {},
  }
  const owner = new AbortController()
  let started = 0
  let cancelled = 0
  const failure = new Error('Simulated canonical transaction failure')
  const definition = factory({ injectStyles: false })
  const defaults = definition.schema.createDefault()
  const runtime = definition.setup({ t: (_key, fallback) => fallback })
  const instance = runtime.create(defaults, {
    ownerDocument: doc,
    signal: owner.signal,
    isReadOnly: () => false,
    getData: () => defaults,
    createId: kind => kind + '-1',
    updateData() { throw failure },
    beginTask() {
      started++
      const controller = new AbortController()
      return {
        signal: controller.signal,
        cancel() { cancelled++; controller.abort() },
        commit() { failures.push('commit'); throw failure },
      }
    },
  })
  return {
    instance, runtime, owner, created, revoked, failures, failure, file,
    get started() { return started },
    get cancelled() { return cancelled },
    dispose() { instance.destroy(); owner.abort(); runtime.destroy() },
  }
}

for (const [name, factory, file] of [
  ['Carousel', createCarouselPlugin, { name: 'movie.mp4', type: 'video/mp4', size: 10 }],
  ['Attaches', createAttachesPlugin, { name: 'document.pdf', type: 'application/pdf', size: 10 }],
]) {
  test(`${name}: releases an entire failed multi-file batch, including the final object URL`, async () => {
    const h = fixture(factory, file)
    try {
      const files = Array.from({ length: 8 }, (_, index) => ({
        ...file, name: 'item-' + index + (name === 'Carousel' ? '.mp4' : '.pdf'),
      }))
      h.instance.element.dispatch('drop', { dataTransfer: { types: ['Files'], files } })
      await Promise.resolve()
      const expected = files.map((_, index) => 'blob:local-' + (index + 1))
      assert.deepEqual(h.created, expected, 'batch did not allocate its expected URL ownership')
      assert.deepEqual(h.revoked, expected, 'failed batch left one or more video/file URLs retained')
      assert.equal(h.started, 1)
      assert.equal(h.cancelled, 1)
    } finally { h.dispose() }
  })

  test(`${name}: failed canonical batch commit releases all created blob URLs`, async () => {
    const h = fixture(factory, file)
    try {
      const event = h.instance.element.dispatch('drop', {
        dataTransfer: { types: ['Files'], files: [file] },
      })
      assert.equal(event.defaultPrevented, true, 'file drop was not owned by its plugin')
      await Promise.resolve()
      assert.equal(h.started, 1)
      assert.deepEqual(h.failures, ['commit'])
      assert.deepEqual(h.created, ['blob:local-1'])
      assert.deepEqual(h.revoked, ['blob:local-1'],
        'a failed canonical commit leaked the unowned blob resource')
      assert.equal(h.cancelled, 1, 'failed task was not settled exactly once')
    } finally { h.dispose() }
  })
}
