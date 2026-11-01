import assert from 'node:assert/strict'
import test from 'node:test'
import { createAttachesRenderer } from './index.js'
import { getZipRuntime, setZipRuntime } from '../../../shared/zipRuntime.js'

const settle = async () => { for (let index = 0; index < 30; index++) await Promise.resolve() }

// A small DOM port; archive requests use real AbortSignal and Response objects.
function mount() {
  const requests = [], downloads = [], revoked = []
  const doc = { defaultView: {
    AbortController, Blob,
    fetch(url, { signal }) {
      return new Promise(resolve => requests.push({ url, signal, resolve }))
    },
    URL: { createObjectURL: () => 'blob:archive', revokeObjectURL: url => revoked.push(url) },
    setTimeout(callback) { callback() },
  } }
  doc.createElement = tag => ({
    ownerDocument: doc, tagName: tag, children: [], style: {}, listeners: new Map(),
    setAttribute() {}, classList: { toggle() {} },
    append(...children) { this.children.push(...children) },
    appendChild(child) { this.children.push(child); return child },
    addEventListener(name, callback) { this.listeners.set(name, callback) },
    click() {
      if (this.download === 'files.zip') downloads.push(this.download)
      this.listeners.get('click')?.({ preventDefault() {}, stopPropagation() {} })
    },
  })
  const renderer = createAttachesRenderer('test', {})
  const element = renderer.render({ data: { variant: 'a', files: [
    { id: 'one', url: '/one.txt', name: 'one.txt', size: 1, extension: 'txt' },
    { id: 'two', url: '/two.txt', name: 'two.txt', size: 1, extension: 'txt' },
  ] } }, () => {}, { ownerDocument: doc })
  const find = node => node.className === 'test-attaches__download' ? node : node.children.map(find).find(Boolean)
  const control = find(element)
  return { renderer, element, requests, downloads, revoked, click: () => control.click(),
    async complete() {
      for (const request of requests) request.resolve(new Response(new Uint8Array([1])))
      await settle()
    },
  }
}

async function withZip(run) {
  const previous = getZipRuntime()
  setZipRuntime(class {
    file() {}
    async generateAsync() { return new Uint8Array([1]) }
  })
  try { await run() } finally { setZipRuntime(previous) }
}

test('ZIP replacement cannot restart downloads when an abort observer destroys the output', () => withZip(async () => {
  const f = mount()
  try {
    f.click(); await settle()
    assert.equal(f.requests.length, 2)
    f.requests[0].signal.addEventListener('abort', () => f.renderer.destroy(f.element), { once: true })
    f.click(); await settle()
    assert.equal(f.requests.length, 2, 'destroyed output started another archive')
    await f.complete()
    assert.deepEqual(f.downloads, [])
  } finally { f.renderer.destroy(f.element); await f.complete() }
}))

test('ZIP replacement preserves the newer request started by its abort observer', () => withZip(async () => {
  const f = mount()
  try {
    f.click(); await settle()
    f.requests[0].signal.addEventListener('abort', () => f.click(), { once: true })
    f.click(); await settle()
    assert.equal(f.requests.length, 4, 'superseded outer request also fetched attachments')
    assert.equal(f.requests[0].signal.aborted, true)
    assert.equal(f.requests[2].signal.aborted, false)
    f.renderer.destroy(f.element)
    assert.ok(f.requests.every(request => request.signal.aborted), 'successor escaped disposal')
    await f.complete()
    assert.deepEqual(f.downloads, [])
  } finally { f.renderer.destroy(f.element); await f.complete() }
}))

test('ordinary ZIP replacement downloads once and retired controls stay inert', () => withZip(async () => {
  const f = mount()
  try {
    f.click(); await settle()
    f.click(); await settle()
    assert.equal(f.requests.length, 4)
    assert.equal(f.requests[0].signal.aborted, true)
    assert.equal(f.requests[2].signal.aborted, false)
    await f.complete()
    assert.deepEqual(f.downloads, ['files.zip'])
    assert.deepEqual(f.revoked, ['blob:archive'])
    f.renderer.destroy(f.element)
    f.click(); await settle()
    assert.equal(f.requests.length, 4)
  } finally { f.renderer.destroy(f.element); await f.complete() }
}))
