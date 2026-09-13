// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'

import { blockClipboardHtml } from './clipboardHtml.js'

test('clipboard HTML fallback creates exported nodes in the block document', () => {
  const created = []
  const ownerDocument = {
    createElement(tag) {
      created.push(tag)
      const node = {
        tagName: tag.toUpperCase(),
        children: [],
        textContent: '',
        appendChild(child) { this.children.push(child); return child },
      }
      Object.defineProperty(node, 'outerHTML', {
        get() {
          const content = this.children.length
            ? this.children.map(child => child.outerHTML).join('')
            : this.textContent
          return `<${tag}>${content}</${tag}>`
        },
      })
      return node
    },
  }
  const root = {
    ownerDocument,
    matches() { return false },
    querySelector() { return null },
    querySelectorAll() { return [] },
  }
  const block = {
    type: 'code',
    contentElement: root,
    save() { return { data: { code: '<unsafe>' } } },
  }

  const previousDocument = globalThis.document
  globalThis.document = new Proxy({}, { get() { throw new Error('ambient document must not be used') } })
  try {
    assert.equal(blockClipboardHtml(block), '<pre><code><unsafe></code></pre>')
  } finally {
    globalThis.document = previousDocument
  }
  assert.deepEqual(created, ['pre', 'code'])
})
