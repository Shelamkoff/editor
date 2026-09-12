import assert from 'node:assert/strict'
import test from 'node:test'
import { createColumnsRenderer } from './index.js'

class FakeElement {
  constructor() {
    this.className = ''
    this.style = {}
    this.children = []
  }
  appendChild(child) { this.children.push(child); return child }
}

test('columns renderer ignores inherited layout registry names', () => {
  const previous = globalThis.document
  globalThis.document = { createElement: () => new FakeElement() }
  try {
    const renderer = createColumnsRenderer('test', {})
    for (const layout of ['constructor', 'toString', '__proto__']) {
      const element = renderer.render({ data: { layout, columns: [] } }, () => new FakeElement())
      assert.equal(element.style.gridTemplateColumns, '1fr 1fr', layout)
    }
  } finally {
    globalThis.document = previous
  }
})
