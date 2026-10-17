import test from 'node:test'
import assert from 'node:assert/strict'
import { createLinkPreviewPlugin } from './index.js'

// A small signal-aware owning-DOM fixture. These tests exercise the actual
// plugin instance / public update path, not browser layout or URL sanitation.
class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase()
    this.ownerDocument = ownerDocument
    this.parentNode = null
    this.children = []
    this.className = ''
    this.dataset = {}
    this.attributes = new Map()
    this.style = {}
    this.listeners = new Map()
    this.value = ''
    this._text = ''
    this._html = ''
    this.hidden = false
    const element = this
    this.classList = {
      contains(name) { return element.className.split(/\s+/).includes(name) },
      add(name) { if (!this.contains(name)) element.className += ' ' + name },
      remove(name) {
        element.className = element.className.split(/\s+/).filter(part => part !== name).join(' ')
      },
      toggle(name, force) {
        const value = force ?? !this.contains(name)
        if (value) this.add(name)
        else this.remove(name)
        return value
      },
    }
  }
  get textContent() { return this._text + this.children.map(child => child.textContent).join('') }
  set textContent(value) { this.replaceChildren(); this._text = String(value); this._html = String(value) }
  get innerHTML() { return this._html || this.children.map(child => child.innerHTML).join('') }
  set innerHTML(value) { this.replaceChildren(); this._html = String(value); this._text = String(value) }
  setAttribute(key, value) { this.attributes.set(key, String(value)) }
  getAttribute(key) { return this.attributes.get(key) ?? null }
  removeAttribute(key) { this.attributes.delete(key) }
  append(...children) { for (const child of children) this.appendChild(child) }
  appendChild(child) {
    if (typeof child === 'string') child = this.ownerDocument.createTextNode(child)
    child.remove()
    child.parentNode = this
    this.children.push(child)
    return child
  }
  replaceChildren(...children) {
    if (this.contains(this.ownerDocument.activeElement)
        && this.ownerDocument.activeElement !== this) this.ownerDocument.activeElement = null
    for (const child of this.children) child.parentNode = null
    this.children = []
    this._html = ''
    this._text = ''
    this.append(...children)
  }
  remove() {
    if (!this.parentNode) return
    const siblings = this.parentNode.children
    const index = siblings.indexOf(this)
    if (index >= 0) siblings.splice(index, 1)
    this.parentNode = null
  }
  contains(target) {
    return target === this || this.children.some(child => child.contains(target))
  }
  addEventListener(type, callback, options = {}) {
    if (options.signal?.aborted) return
    const callbacks = this.listeners.get(type) ?? []
    callbacks.push(callback)
    this.listeners.set(type, callbacks)
    options.signal?.addEventListener('abort', () => {
      const index = callbacks.indexOf(callback)
      if (index >= 0) callbacks.splice(index, 1)
    }, { once: true })
  }
  dispatch(type) {
    const event = {
      type, target: this,
      stopPropagation() {},
      preventDefault() {},
      key: type === 'keydown' ? 'Enter' : undefined,
    }
    for (const callback of [...(this.listeners.get(type) ?? [])]) callback(event)
  }
  focus() { this.ownerDocument.activeElement = this }
  querySelector(selector) {
    if (!selector.startsWith('.')) return null
    const classname = selector.slice(1)
    const find = node => {
      for (const child of node.children) {
        if (child.className.split(/\s+/).includes(classname)) return child
        const nested = find(child)
        if (nested) return nested
      }
      return null
    }
    return find(this)
  }
}

function mount(config = {}, initialOverrides = {}) {
  let nextTimer = 1
  const timers = new Map()
  const ownerDocument = {
    activeElement: null,
    defaultView: {
      AbortController,
      setTimeout(callback) { const id = nextTimer++; timers.set(id, callback); return id },
      clearTimeout(id) { timers.delete(id) },
    },
    createElement(tag) { return new FakeElement(tag, ownerDocument) },
    createTextNode(text) {
      const node = new FakeElement('#text', ownerDocument)
      node.textContent = text
      return node
    },
    addEventListener() {},
  }
  const owner = new AbortController()
  const definition = createLinkPreviewPlugin({ ...config, injectStyles: false })
  let failNextRead = false
  const taskSignals = []
  let canonical = {
    ...definition.schema.createDefault(),
    url: 'https://example.com/Alpha',
    title: 'Alpha',
    domain: 'example.com',
    template: 'horizontal',
    ...initialOverrides,
  }
  let instance
  const context = {
    ownerDocument, signal: owner.signal,
    getData: () => {
      if (failNextRead) {
        failNextRead = false
        throw new Error('revoked during task acquisition')
      }
      return canonical
    },
    isReadOnly: () => false,
    beginTask() {
      const controller = new AbortController()
      taskSignals.push(controller.signal)
      owner.signal.addEventListener('abort', () => controller.abort(), { once: true })
      return {
        signal: controller.signal,
        cancel() { controller.abort() },
        commit(producer) {
          if (controller.signal.aborted) return false
          const updated = producer(structuredClone(canonical))
          if (updated !== canonical) {
            canonical = updated
            instance.update(canonical)
          }
          return true
        },
      }
    },
    updateData(producer) {
      canonical = producer(structuredClone(canonical))
      instance.update(canonical)
    },
  }
  instance = definition.setup({ t: (_key, fallback) => fallback }).create(canonical, context)
  const input = instance.editableFields().find(field => field.key === 'url').element
  return {
    instance, input, ownerDocument,
    failNextRead() { failNextRead = true },
    taskSignals: () => taskSignals,
    model: () => canonical,
    timerIds: () => [...timers.keys()],
    flushTimers() {
      const callbacks = [...timers.values()]
      timers.clear()
      for (const callback of callbacks) callback()
    },
    nativeCommit(next) { canonical = structuredClone(next) },
    external(next) { canonical = structuredClone(next); instance.update(canonical) },
    destroy() { instance.destroy(); owner.abort() },
  }
}

test('LinkPreview preserves an unfinished URL and its original debounce across template updates', () => {
  const h = mount()
  try {
    const draft = 'https://vimeo.com/123456'
    h.input.focus()
    h.input.value = draft
    h.input.dispatch('input')
    assert.equal(h.timerIds().length, 1)
    const timerId = h.timerIds()[0]

    h.external({ ...h.model(), template: 'compact', description: 'Host supplied' })
    assert.equal(h.input.value, draft, 'unrelated template change erased a pending URL')
    assert.equal(h.ownerDocument.activeElement, h.input)
    assert.deepEqual(h.timerIds(), [timerId],
      'unrelated updates must not restart or cancel the pending URL deadline')
    assert.equal(h.instance.element.querySelector('.oe-lp__card')?.className,
      'oe-lp__card oe-lp__card--compact')

    h.flushTimers()
    assert.equal(h.model().url, draft)
    assert.equal(h.model().template, 'compact')
    assert.equal(h.model().domain, 'vimeo.com')
    assert.equal(h.timerIds().length, 0)
  } finally { h.destroy() }
})

test('LinkPreview preserves a native-committed URL when later metadata is updated', () => {
  const h = mount()
  try {
    const draft = 'https://vimeo.com/123456'
    h.input.focus()
    h.input.value = draft
    h.input.dispatch('input')
    const timerId = h.timerIds()[0]
    h.nativeCommit({ ...h.model(), url: draft, domain: 'vimeo.com' })

    h.external({ ...h.model(), title: 'New title from host' })
    assert.equal(h.input.value, draft,
      'host update forgot a native URL already committed without source reprojection')
    assert.equal(h.ownerDocument.activeElement, h.input)
    assert.deepEqual(h.timerIds(), [timerId])
  } finally { h.destroy() }
})

test('LinkPreview rejects stale URL drafts when host replaces the canonical source', () => {
  const h = mount()
  try {
    h.input.focus()
    h.input.value = 'https://vimeo.com/123456'
    h.input.dispatch('input')
    assert.equal(h.timerIds().length, 1)

    h.external({ ...h.model(), url: 'https://example.org/new', title: 'Replacement' })
    assert.equal(h.input.value, 'https://example.org/new')
    assert.deepEqual(h.timerIds(), [],
      'late URL debounce could overwrite a newer canonical source')
    h.flushTimers()
    assert.equal(h.model().url, 'https://example.org/new')
  } finally { h.destroy() }
})

test('LinkPreview read-only transition revokes a pending URL draft', () => {
  const h = mount()
  try {
    h.input.focus()
    h.input.value = 'https://vimeo.com/123456'
    h.input.dispatch('input')
    assert.equal(h.timerIds().length, 1)

    h.instance.setReadOnly(true)
    assert.equal(h.input.value, h.model().url)
    assert.equal(h.input.readOnly, true)
    assert.deepEqual(h.timerIds(), [])
    h.flushTimers()
    assert.equal(h.model().url, 'https://example.com/Alpha')
  } finally { h.destroy() }
})

test('LinkPreview late metadata cannot overwrite a newer host title for the same URL', async () => {
  let finish
  const h = mount({
    fetchMeta: () => new Promise(resolve => { finish = resolve }),
  })
  try {
    h.input.value = 'https://vimeo.com/123456'
    h.input.dispatch('keydown')
    assert.equal(typeof finish, 'function')
    assert.equal(h.model().url, 'https://vimeo.com/123456')

    h.external({ ...h.model(), title: 'Host-authored title' })
    finish({ title: 'Stale fetched title', description: 'Fetched description' })
    await Promise.resolve()
    await Promise.resolve()

    assert.equal(h.model().title, 'Host-authored title',
      'late metadata silently overwrote a more recent host-authored title')
    assert.equal(h.model().description, 'Fetched description',
      'an untouched description should still benefit from metadata resolution')
  } finally { h.destroy() }
})

test('LinkPreview cancels an obsolete metadata request after host replaces its URL', async () => {
  let finish
  let pendingSignal
  const h = mount({
    fetchMeta: (_url, { signal }) => {
      pendingSignal = signal
      return new Promise(resolve => { finish = resolve })
    },
  })
  try {
    h.input.value = 'https://vimeo.com/123456'
    h.input.dispatch('keydown')
    assert.equal(pendingSignal.aborted, false)
    h.external({ ...h.model(), url: 'https://example.org/new', title: 'Host replacement' })
    assert.equal(pendingSignal.aborted, true,
      'an obsolete metadata request retained authority after canonical source replacement')
    finish({ title: 'Old URL title' })
    await Promise.resolve()
    await Promise.resolve()
    assert.equal(h.model().url, 'https://example.org/new')
    assert.equal(h.model().title, 'Host replacement')
  } finally { h.destroy() }
})

test('LinkPreview retires a task if authority is revoked during metadata snapshot', async () => {
  const h = mount({ fetchMeta: async () => ({ title: 'Should not load' }) })
  try {
    h.failNextRead()
    h.input.value = 'https://vimeo.com/123456'
    h.input.dispatch('keydown')
    await Promise.resolve()
    assert.equal(h.taskSignals().length, 1)
    assert.equal(h.taskSignals()[0].aborted, true,
      'a failure reading the metadata baseline left an acquired DataTask alive')
  } finally { h.destroy() }
})

test('LinkPreview initial metadata microtask does not restart an already-submitted new URL', async () => {
  const requests = []
  const h = mount({
    fetchMeta: (url, { signal }) => {
      requests.push({ url, signal })
      return new Promise(() => {})
    },
  }, { title: '' })
  try {
    // Initial empty metadata queues an asynchronous attempt for the loaded URL.
    // Submit a different URL before that microtask has executed.
    h.input.value = 'https://vimeo.com/123456'
    h.input.dispatch('keydown')
    assert.deepEqual(requests.map(request => request.url), ['https://vimeo.com/123456'])

    await Promise.resolve()
    await Promise.resolve()
    assert.deepEqual(requests.map(request => request.url), ['https://vimeo.com/123456'],
      'outdated initial metadata microtask restarted the new URL request')
    assert.equal(requests[0].signal.aborted, false,
      'initial metadata microtask canceled a more recent user-initiated request')
  } finally { h.destroy() }
})


test('LinkPreview initial metadata loads once when the original URL is unchanged', async () => {
  const calls = []
  const h = mount({
    fetchMeta: async url => {
      calls.push(url)
      return { title: 'Loaded title', description: 'Loaded description' }
    },
  }, { title: '' })
  try {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    assert.deepEqual(calls, ['https://example.com/Alpha'])
    assert.equal(h.model().title, 'Loaded title')
    assert.equal(h.model().description, 'Loaded description')
  } finally { h.destroy() }
})

test('LinkPreview initial enrichment is skipped after the host supplies metadata', async () => {
  const calls = []
  const h = mount({
    fetchMeta: async url => {
      calls.push(url)
      return { title: 'Fetched late' }
    },
  }, { title: '' })
  try {
    h.external({ ...h.model(), title: 'Host-provided title' })
    await Promise.resolve()
    await Promise.resolve()
    assert.deepEqual(calls, [],
      'initial metadata request ignored the title supplied by host before its microtask')
    assert.equal(h.model().title, 'Host-provided title')
  } finally { h.destroy() }
})
