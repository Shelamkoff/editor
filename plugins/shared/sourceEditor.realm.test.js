// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'

import { openSourceEditor, preloadSourceEditor } from './sourceEditor.js'

class OwnerAbortController {
  constructor() {
    this.signal = { addEventListener() {}, removeEventListener() {} }
    this.aborted = false
  }
  abort() { this.aborted = true }
}

function makeSignal() {
  return {
    aborted: false,
    addEventListener() {},
    removeEventListener() {},
  }
}

function makeNode(ownerDocument, tag) {
  return {
    ownerDocument,
    tagName: tag.toUpperCase(),
    className: '',
    classList: { toggle() {}, add() {}, remove() {} },
    dataset: {},
    style: {},
    children: [],
    attributes: new Map(),
    isConnected: true,
    inert: false,
    hidden: false,
    value: '',
    textContent: '',
    append(...nodes) { this.children.push(...nodes) },
    appendChild(node) { this.children.push(node); return node },
    addEventListener() {},
    removeEventListener() {},
    setAttribute(name, value) { this.attributes.set(name, String(value)) },
    removeAttribute(name) { this.attributes.delete(name) },
    focus() {},
    remove() { this.isConnected = false },
    closest(selector) { return selector === '.oe-block' ? null : null },
  }
}

test('source editor uses the wrapper owning document and AbortController realm', async () => {
  const created = []
  const ownerDocument = {
    defaultView: { AbortController: OwnerAbortController },
    createElement(tag) {
      created.push(tag)
      return makeNode(ownerDocument, tag)
    },
  }
  const wrapper = makeNode(ownerDocument, 'div')
  const signal = makeSignal()

  const previousDocument = globalThis.document
  const previousAbortController = globalThis.AbortController
  globalThis.document = new Proxy({}, { get() { throw new Error('ambient document must not be used') } })
  globalThis.AbortController = class { constructor() { throw new Error('ambient AbortController must not be used') } }
  try {
    preloadSourceEditor(wrapper, signal, ['url'])
    const handle = openSourceEditor({
      wrapper,
      signal,
      kind: 'url',
      title: 'Insert URL',
      label: 'URL',
      placeholder: 'https://example.com',
      submitText: 'Insert',
      cancelText: 'Cancel',
      invalidText: 'Invalid',
      normalize(value) { return value },
      onSubmit() {},
    })
    handle.close()
    await Promise.resolve()
  } finally {
    globalThis.document = previousDocument
    globalThis.AbortController = previousAbortController
  }

  assert.deepEqual(created, ['div', 'button', 'form', 'h3', 'label', 'span', 'input', 'div', 'div', 'button', 'button'])
  assert.equal(wrapper.children.length, 1)
})
