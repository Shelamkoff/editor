import test from 'node:test'
import assert from 'node:assert/strict'
import { createEmbedPlugin } from './index.js'

// Deliberately small, owning-document DOM: this suite checks whether a
// focused native caption is detached, not HTML parsing or sanitization.
class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase()
    this.ownerDocument = ownerDocument
    this.parentNode = null
    this.children = []
    this.className = ''
    this.dataset = {}
    this.style = {}
    this.attributes = new Map()
    this._text = ''
    this._html = ''
    this.contentEditable = 'inherit'
    this.isConnected = true
    this.hidden = false
    this.listeners = new Map()
    const element = this
    this.classList = {
      contains: name => element.className.split(/\s+/).includes(name),
      add(name) {
        if (!this.contains(name)) element.className += ' ' + name
      },
      remove(name) {
        element.className = element.className.split(/\s+/).filter(part => part !== name).join(' ')
      },
      toggle(name, force) {
        const next = force ?? !this.contains(name)
        if (next) this.add(name)
        else this.remove(name)
        return next
      },
    }
  }
  get firstChild() { return this.children[0] ?? null }
  get textContent() { return this._text + this.children.map(child => child.textContent).join('') }
  set textContent(value) {
    this.replaceChildren()
    this._text = String(value)
    this._html = String(value)
  }
  get innerHTML() { return this._html || this.children.map(child => child.innerHTML).join('') }
  set innerHTML(value) {
    this.replaceChildren()
    this._html = String(value)
    this._text = String(value)
  }
  append(...children) { for (const child of children) this.appendChild(child) }
  appendChild(child) { return this.insertBefore(child, null) }
  insertBefore(child, reference) {
    if (typeof child === 'string') child = this.ownerDocument.createTextNode(child)
    child.remove()
    child.parentNode = this
    child.isConnected = this.isConnected
    const index = reference === null ? -1 : this.children.indexOf(reference)
    if (index < 0) this.children.push(child)
    else this.children.splice(index, 0, child)
    return child
  }
  replaceChildren(...children) {
    // Setting innerHTML on the focused element does not detach its editing
    // host. Replacing an ancestor's children does, and must lose focus.
    if (this.ownerDocument.activeElement !== this
      && this.contains(this.ownerDocument.activeElement)) this.ownerDocument.activeElement = null
    for (const child of this.children) {
      child.parentNode = null
      child.isConnected = false
    }
    this.children = []
    this._text = ''
    this._html = ''
    this.append(...children)
  }
  remove() {
    if (!this.parentNode) return
    if (this.contains(this.ownerDocument.activeElement)) this.ownerDocument.activeElement = null
    const siblings = this.parentNode.children
    const index = siblings.indexOf(this)
    if (index >= 0) siblings.splice(index, 1)
    this.parentNode = null
    this.isConnected = false
  }
  contains(target) {
    return target === this || this.children.some(child => child.contains(target))
  }
  querySelectorAll(selector) {
    const found = []
    const visit = parent => {
      for (const child of parent.children) {
        if (selector.startsWith('.')
          ? child.className.split(/\s+/).includes(selector.slice(1))
          : child.tagName === selector.toUpperCase()) found.push(child)
        visit(child)
      }
    }
    visit(this)
    return found
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null }
  addEventListener(name, handler, options = {}) {
    if (options.signal?.aborted) return
    const group = this.listeners.get(name) ?? []
    group.push(handler)
    this.listeners.set(name, group)
    options.signal?.addEventListener('abort', () => {
      const index = group.indexOf(handler)
      if (index >= 0) group.splice(index, 1)
    }, { once: true })
  }
  dispatch(type, details = {}) {
    for (const handler of [...(this.listeners.get(type) ?? [])]) {
      handler({
        type, target: this,
        preventDefault() { this.defaultPrevented = true },
        stopPropagation() {},
        ...details,
      })
    }
  }
  focus() { this.ownerDocument.activeElement = this }
  setAttribute(name, value) { this.attributes.set(name, String(value)) }
  getAttribute(name) { return this.attributes.get(name) ?? null }
  removeAttribute(name) { this.attributes.delete(name) }
  closest() { return null }
  getClientRects() { return [] }
}

function mount({ config = {}, initial = {}, fetch, schedule } = {}) {
  const timers = new Map()
  let nextTimer = 1
  let clock = 0
  let writes = 0
  const ownerDocument = {
    activeElement: null,
    defaultView: {
      AbortController,
      fetch,
      addEventListener() {}, removeEventListener() {},
      setTimeout(callback, delay = 0) {
        if (schedule) return schedule(callback, delay)
        const id = nextTimer++
        timers.set(id, { callback, at: clock + Math.max(0, Number(delay) || 0) })
        return id
      },
      clearTimeout(id) { timers.delete(id) },
    },
    createElement(tag) { return new FakeElement(tag, ownerDocument) },
    createTextNode(value) {
      const node = new FakeElement('#text', ownerDocument)
      node.textContent = value
      return node
    },
    addEventListener() {},
  }
  const owner = new AbortController()
  const definition = createEmbedPlugin({ injectStyles: false, resolvePreview: false, ...config })
  let canonical = {
    ...definition.schema.createDefault(),
    service: 'youtube',
    videoId: 'dQw4w9WgXcQ',
    ...initial,
  }
  let instance
  instance = definition.setup({ t: (_key, fallback) => fallback }).create(canonical, {
    ownerDocument,
    signal: owner.signal,
    getData: () => canonical,
    isReadOnly: () => false,
    updateData(producer) {
      writes++
      canonical = producer(structuredClone(canonical))
      instance.update(canonical)
    },
  })
  return {
    instance,
    ownerDocument,
    model: () => canonical,
    writes: () => writes,
    pendingTimers: () => timers.size,
    pendingTimerIds: () => [...timers.keys()],
    flushTimers() {
      const queued = [...timers.values()]
      timers.clear()
      for (const { callback } of queued) callback()
    },
    advance(ms) {
      clock += ms
      for (const [id, timer] of [...timers]) {
        if (timer.at > clock || !timers.has(id)) continue
        timers.delete(id)
        timer.callback()
      }
    },
    nativeCommit(next) { canonical = structuredClone(next) },
    external(next) {
      canonical = structuredClone(next)
      instance.update(canonical)
    },
    destroy() { instance.destroy(); owner.abort() },
  }
}

function deferred() {
  let resolve, reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

test('Embed custom preview timeout aborts its resolver and ignores a late result', async () => {
  const pending = deferred()
  let request
  const h = mount({
    config: { previewTimeoutMs: 25, resolvePreview(value) { request = value; return pending.promise } },
    initial: { service: 'vimeo', videoId: '12345' },
  })
  try {
    const before = structuredClone(h.model())
    assert.equal(request.service, 'vimeo')
    assert.equal(request.videoId, '12345')
    assert.equal(request.url, 'https://vimeo.com/12345')
    assert.equal(request.signal.aborted, false)
    h.advance(24)
    assert.equal(request.signal.aborted, false, 'The resolver expired before its configured deadline')
    h.advance(1)
    assert.equal(request.signal.aborted, true, 'The custom resolver did not receive its configured timeout')
    pending.resolve({ thumbnailUrl: 'https://example.test/late.jpg', title: 'Late preview' })
    await pending.promise
    await Promise.resolve()
    assert.equal(h.instance.element.querySelector('.oe-embed__preview'), null)
    assert.deepEqual(h.model(), before)
    assert.equal(h.writes(), 0, 'Preview timeout or completion submitted an author edit')
    assert.equal(h.pendingTimers(), 0)
  } finally { h.destroy() }
})

test('Embed custom preview completes before its deadline without authoring or retaining a timer', async () => {
  const pending = deferred()
  let request
  const h = mount({
    config: { previewTimeoutMs: 25, resolvePreview(value) { request = value; return pending.promise } },
    initial: { service: 'vimeo', videoId: '12345' },
  })
  try {
    const before = structuredClone(h.model())
    h.advance(24)
    pending.resolve({ thumbnailUrl: 'https://example.test/current.jpg', title: 'Current preview' })
    await pending.promise
    await Promise.resolve()
    assert.equal(h.instance.element.querySelector('.oe-embed__preview')?.getAttribute('src'), 'https://example.test/current.jpg')
    assert.equal(h.instance.element.querySelector('.oe-embed__preview')?.alt, 'Current preview')
    assert.equal(request.signal.aborted, false)
    assert.equal(h.pendingTimers(), 0)
    h.advance(100)
    assert.equal(request.signal.aborted, false, 'A completed request retained an obsolete deadline')
    assert.deepEqual(h.model(), before)
    assert.equal(h.writes(), 0)
  } finally { h.destroy() }
})

test('Embed cancels the default preview deadline even when fetch ignores abort', async () => {
  const pending = deferred()
  let signal
  const h = mount({
    config: { resolvePreview: undefined, previewTimeoutMs: 25 },
    initial: { service: 'vimeo', videoId: '12345' },
    fetch(_url, options) { signal = options.signal; return pending.promise },
  })
  try {
    assert.equal(signal.aborted, false)
    assert.equal(h.pendingTimers(), 1)
    h.destroy()
    assert.equal(signal.aborted, true)
    assert.equal(h.pendingTimers(), 0, 'Cancellation retained a preview timer until its ignored request settles')
    assert.equal(h.writes(), 0)
  } finally { h.destroy(); pending.resolve({ ok: false }); await pending.promise }
})

test('Embed default preview timeout exposes TimeoutError and ignores a late response', async () => {
  const pending = deferred()
  let signal
  const h = mount({
    config: { resolvePreview: undefined, previewTimeoutMs: 25 },
    initial: { service: 'vimeo', videoId: '12345' },
    fetch(_url, options) { signal = options.signal; return pending.promise },
  })
  try {
    const before = structuredClone(h.model())
    h.advance(24)
    assert.equal(signal.aborted, false)
    h.advance(1)
    assert.equal(signal.aborted, true)
    assert.equal(signal.reason?.name, 'TimeoutError', 'Preview expiration must remain distinguishable from lifecycle cancellation')
    pending.resolve({ ok: true, async json() { return { thumbnail_url: 'https://example.test/late.jpg' } } })
    await pending.promise
    await Promise.resolve()
    assert.equal(h.instance.element.querySelector('.oe-embed__preview'), null)
    assert.deepEqual(h.model(), before)
    assert.equal(h.writes(), 0)
    assert.equal(h.pendingTimers(), 0)
  } finally { h.destroy() }
})

test('Embed contains a preview scheduler failure without an author edit or unhandled rejection', async () => {
  const failure = new Error('Controlled owner-document scheduler failure')
  const h = mount({
    config: { resolvePreview: undefined },
    initial: { service: 'vimeo', videoId: '12345' },
    schedule() { throw failure },
    async fetch() { return { ok: true, async json() { return { thumbnail_url: 'https://example.test/preview.jpg' } } } },
  })
  try {
    const before = structuredClone(h.model())
    // Let Node report an unhandled rejected void resolver promise if it escaped.
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(h.instance.element.querySelector('.oe-embed__preview'), null)
    assert.deepEqual(h.model(), before)
    assert.equal(h.writes(), 0)
    assert.equal(h.pendingTimers(), 0)
  } finally { h.destroy() }
})

for (const [label, configured, deadline] of [
  ['omitted', undefined, 5000],
  ['non-finite', Infinity, 5000],
  ['negative', -25, 0],
]) test(`Embed custom preview uses the documented ${label} deadline`, () => {
  let signal
  const h = mount({
    config: { previewTimeoutMs: configured, resolvePreview(request) {
      signal = request.signal
      return new Promise(() => {})
    } },
    initial: { service: 'vimeo', videoId: '12345' },
  })
  try {
    if (deadline) h.advance(deadline - 1)
    assert.equal(signal.aborted, false)
    h.advance(deadline ? 1 : 0)
    assert.equal(signal.aborted, true)
    assert.equal(signal.reason?.name, 'TimeoutError')
    assert.equal(h.pendingTimers(), 0)
    assert.equal(h.writes(), 0)
  } finally { h.destroy() }
})

test('Embed disabled preview acquires neither a fetch request nor a deadline', () => {
  let fetches = 0
  const h = mount({
    config: { resolvePreview: false, previewTimeoutMs: 0 },
    initial: { service: 'vimeo', videoId: '12345' },
    async fetch() { fetches++; return { ok: false } },
  })
  try {
    h.advance(5000)
    assert.equal(fetches, 0)
    assert.equal(h.pendingTimers(), 0)
    assert.equal(h.writes(), 0)
    assert.equal(h.instance.element.querySelector('.oe-embed__preview'), null)
  } finally { h.destroy() }
})

test('Embed default preview completes before its deadline without retaining a timer', async () => {
  const pending = deferred()
  let signal
  const h = mount({
    config: { resolvePreview: undefined, previewTimeoutMs: 25 },
    initial: { service: 'vimeo', videoId: '12345' },
    fetch(_url, options) { signal = options.signal; return pending.promise },
  })
  try {
    const before = structuredClone(h.model())
    h.advance(24)
    pending.resolve({ ok: true, async json() { return { thumbnail_url: 'https://example.test/current.jpg', title: 'Current preview' } } })
    await pending.promise
    await Promise.resolve()
    const preview = h.instance.element.querySelector('.oe-embed__preview')
    assert.equal(preview?.getAttribute('src'), 'https://example.test/current.jpg')
    assert.equal(preview?.alt, 'Current preview')
    assert.equal(h.pendingTimers(), 0)
    h.advance(100)
    assert.equal(signal.aborted, false)
    assert.deepEqual(h.model(), before)
    assert.equal(h.writes(), 0)
  } finally { h.destroy() }
})

function caption(instance) {
  return instance.editableFields().find(field => field.key === 'caption')?.element
}

test('Embed retains focused native caption when title and duration change', () => {
  const h = mount()
  try {
    const field = caption(h.instance)
    field.focus()
    field.innerHTML = 'AlXpha'
    // NativeInputController can commit the edit without reprojecting the
    // originating DOM; the plugin-local snapshot is therefore still empty.
    h.nativeCommit({ ...h.model(), caption: 'AlXpha' })
    h.external({ ...h.model(), title: 'New title', duration: '2:34' })

    assert.equal(caption(h.instance), field,
      'unrelated player metadata update detached a native contenteditable')
    assert.equal(h.ownerDocument.activeElement, field,
      'unrelated player metadata update lost native focus and caret owner')
    assert.equal(h.instance.read().caption, 'AlXpha')
    assert.equal(h.instance.element.querySelector('.oe-embed__title')?.textContent, 'New title')
    assert.equal(h.instance.element.querySelector('.oe-embed__duration')?.textContent, '2:34')
  } finally { h.destroy() }
})

test('Embed retains native caption while changing the video source', () => {
  const h = mount()
  try {
    const field = caption(h.instance)
    field.focus()
    field.innerHTML = 'AlXpha'
    h.nativeCommit({ ...h.model(), caption: 'AlXpha' })
    h.external({ ...h.model(), videoId: '9bZkp7q19f0' })

    assert.equal(caption(h.instance), field,
      'source replacement should change the player, not detach unchanged caption DOM')
    assert.equal(h.ownerDocument.activeElement, field)
    assert.equal(h.instance.read().videoId, '9bZkp7q19f0')
    assert.equal(h.instance.read().caption, 'AlXpha')
  } finally { h.destroy() }
})

test('Embed reprojects an externally changed caption instead of hiding it behind native DOM', () => {
  const h = mount()
  try {
    const field = caption(h.instance)
    field.focus()
    field.innerHTML = 'AlXpha'
    h.nativeCommit({ ...h.model(), caption: 'AlXpha' })
    h.external({ ...h.model(), title: 'First update' })
    assert.equal(caption(h.instance), field)

    h.external({ ...h.model(), caption: '' })
    assert.notEqual(caption(h.instance), field,
      'a genuinely remote caption edit must replace the old authoring host')
    assert.equal(h.instance.read().caption, '')
    assert.notEqual(h.ownerDocument.activeElement, field)
  } finally { h.destroy() }
})

test('Embed preserves an in-progress URL draft and its debounce across an unrelated update', () => {
  const h = mount()
  try {
    const input = h.instance.element.querySelector('.oe-embed__url-input')
    input.focus()
    input.value = 'https://vimeo.com/123456'
    input.dispatch('input')
    assert.equal(h.pendingTimers(), 1)
    const originalTimer = h.pendingTimerIds()[0]

    h.external({ ...h.model(), title: 'Metadata from another control' })
    assert.equal(h.ownerDocument.activeElement, input)
    assert.equal(input.value, 'https://vimeo.com/123456',
      'unrelated canonical update erased the unfinished video URL')
    assert.equal(h.pendingTimers(), 1,
      'unrelated canonical update silently canceled the URL debounce')
    assert.equal(h.pendingTimerIds()[0], originalTimer,
      'repeated host updates must not restart a pending URL parse indefinitely')

    h.flushTimers()
    assert.equal(h.model().service, 'vimeo')
    assert.equal(h.model().videoId, '123456')
    assert.equal(h.pendingTimers(), 0)
  } finally { h.destroy() }
})

test('Embed drops a stale URL draft when the canonical video source is changed externally', () => {
  const h = mount()
  try {
    const input = h.instance.element.querySelector('.oe-embed__url-input')
    input.focus()
    input.value = 'https://vimeo.com/123456'
    input.dispatch('input')
    assert.equal(h.pendingTimers(), 1)

    h.external({ ...h.model(), videoId: '9bZkp7q19f0' })
    assert.equal(input.value, 'https://youtu.be/9bZkp7q19f0')
    assert.equal(h.pendingTimers(), 0,
      'obsolete URL draft could overwrite an external source replacement')
    h.flushTimers()
    assert.equal(h.model().videoId, '9bZkp7q19f0')
  } finally { h.destroy() }
})

test('Embed removes a now-irrelevant empty caption after its last video is cleared', () => {
  const h = mount()
  try {
    const previous = caption(h.instance)
    assert.equal(previous?.innerHTML, '')
    h.external({ ...h.model(), service: '', videoId: '', caption: '' })

    assert.equal(h.instance.element.querySelector('.oe-embed__caption'), null,
      'cleared video retained a caption editor that must not exist for an empty Embed')
    assert.equal(caption(h.instance), undefined,
      'empty Embed still advertised a stale editable caption')
    assert.equal(h.instance.read().caption, '')
  } finally { h.destroy() }
})

test('Embed does not parse a URL before IME composition ends', () => {
  const h = mount()
  try {
    const input = h.instance.element.querySelector('.oe-embed__url-input')
    input.focus()
    const original = structuredClone(h.model())
    input.dispatch('compositionstart')
    input.value = 'https://vimeo.com/123456'
    input.dispatch('input', { isComposing: true })
    input.dispatch('keydown', { key: 'Enter', isComposing: true })
    input.dispatch('paste', { isComposing: true })
    h.flushTimers()
    assert.deepEqual(h.model(), original,
      'IME preedit unexpectedly changed the canonical video provider')

    input.dispatch('compositionend')
    assert.equal(h.pendingTimers(), 1)
    h.flushTimers()
    assert.equal(h.model().service, 'vimeo')
    assert.equal(h.model().videoId, '123456')
    assert.equal(h.pendingTimers(), 0)
  } finally { h.destroy() }
})

test('Embed discards earlier URL timer when composition starts', () => {
  const h = mount()
  try {
    const input = h.instance.element.querySelector('.oe-embed__url-input')
    input.focus()
    input.value = 'https://vimeo.com/123456'
    input.dispatch('input')
    assert.equal(h.pendingTimers(), 1)
    input.dispatch('compositionstart')
    assert.equal(h.pendingTimers(), 0)
    input.value = 'https://vimeo.com/765432'
    input.dispatch('input', { isComposing: true })
    h.flushTimers()
    assert.equal(h.model().service, 'youtube')

    input.dispatch('compositionend')
    h.flushTimers()
    assert.equal(h.model().service, 'vimeo')
    assert.equal(h.model().videoId, '765432')
  } finally { h.destroy() }
})

test('Embed skips composing input without a preceding compositionstart', () => {
  const h = mount()
  try {
    const input = h.instance.element.querySelector('.oe-embed__url-input')
    input.value = 'https://vimeo.com/123456'
    input.dispatch('input', { isComposing: true })
    assert.equal(h.pendingTimers(), 0)
    input.dispatch('input', { isComposing: false })
    assert.equal(h.pendingTimers(), 1)
    h.flushTimers()
    assert.equal(h.model().videoId, '123456')
  } finally { h.destroy() }
})
