// @ts-nocheck
import test from 'node:test'
import assert from 'node:assert/strict'
import { triggerFileInput } from './fileInput.js'

function pickerFixture({ create, append, files = [] } = {}) {
  const listeners = new Map()
  const counts = { creates: 0, appends: 0, clicks: 0, removes: 0, deliveries: 0 }
  const controller = new AbortController()
  const input = { style: {}, files, parentNode: null,
    addEventListener(type, callback) { listeners.set(type, callback) },
    click() { counts.clicks++ },
    remove() { counts.removes++; input.parentNode = null },
  }
  const ownerDocument = {
    createElement() { counts.creates++; create?.(controller); return input },
    body: { appendChild(node) { counts.appends++; node.parentNode = this; append?.(controller); return node } },
  }
  const config = { ownerDocument, signal: controller.signal, onFiles() { counts.deliveries++ } }
  return { input, listeners, counts, controller, config }
}

test('retirement during file input creation never mounts or opens a picker', () => {
  const fixture = pickerFixture({ create(controller) { controller.abort() } })
  triggerFileInput(fixture.config)
  assert.equal(fixture.counts.appends, 0)
  assert.equal(fixture.counts.clicks, 0)
})

test('retirement during file input mounting prevents the dialog action', () => {
  const fixture = pickerFixture({ append(controller) { controller.abort() } })
  triggerFileInput(fixture.config)
  assert.equal(fixture.counts.clicks, 0)
  assert.equal(fixture.input.parentNode, null)
  assert.equal(fixture.counts.removes, 1)
})

test('partial file input mounting failure releases the input and original signal lease', () => {
  const failure = new Error('append failed after insertion')
  const fixture = pickerFixture({ append() { throw failure } })
  assert.throws(() => triggerFileInput(fixture.config), error => error === failure)
  assert.equal(fixture.input.parentNode, null)
  assert.equal(fixture.counts.removes, 1)
  assert.equal(fixture.counts.clicks, 0)
  fixture.controller.abort()
  assert.equal(fixture.counts.removes, 1)
})

test('file capture that retires the picker cannot deliver stale files', () => {
  const fixture = pickerFixture()
  Object.defineProperty(fixture.input, 'files', { get() { fixture.controller.abort(); return [{}] } })
  triggerFileInput(fixture.config)
  fixture.listeners.get('change')()
  assert.equal(fixture.counts.deliveries, 0)
  assert.equal(fixture.counts.removes, 1)
})

test('live file input delivers its original files once and retires before the callback', () => {
  const file = { name: 'original.png', type: 'image/png' }
  const fixture = pickerFixture({ files: [file] })
  fixture.config.onFiles = files => {
    fixture.counts.deliveries++
    assert.deepEqual(files, [file])
    assert.equal(files[0], file)
    assert.equal(fixture.input.parentNode, null)
    fixture.listeners.get('change')()
  }
  triggerFileInput(fixture.config)
  fixture.listeners.get('change')()
  fixture.controller.abort()
  assert.deepEqual(fixture.counts, { creates: 1, appends: 1, clicks: 1, removes: 1, deliveries: 1 })
})

test('file input is created and mounted in the supplied owning document', () => {
  const previousDocument = globalThis.document
  globalThis.document = {
    createElement() { throw new Error('ambient document must not be consulted') },
    body: { appendChild() { throw new Error('ambient body must not be consulted') } },
  }
  try {
    let appended = null
    let clicks = 0
    const listeners = new Map()
    const input = {
      type: '', style: {}, accept: '', multiple: false, files: [],
      addEventListener(type, handler) { listeners.set(type, handler) },
      remove() {},
      click() { clicks++ },
    }
    const ownerDocument = {
      createElement(tag) {
        assert.equal(tag, 'input')
        return input
      },
      body: {
        appendChild(node) { appended = node; return node },
      },
    }

    triggerFileInput({ ownerDocument, accept: 'image/*', multiple: true, onFiles() {} })

    assert.equal(appended, input)
    assert.equal(clicks, 1)
    assert.equal(input.accept, 'image/*')
    assert.equal(input.multiple, true)
  } finally {
    globalThis.document = previousDocument
  }
})
