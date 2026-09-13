// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'

import { MenuBuilder } from './MenuBuilder.js'

test('settings menu items are created in the menu owning document', () => {
  const created = []
  const makeNode = tag => ({
    tagName: tag.toUpperCase(),
    className: '',
    dataset: {},
    style: {},
    children: [],
    classList: { add() {}, remove() {} },
    setAttribute() {},
    addEventListener() {},
    appendChild(node) { this.children.push(node); return node },
  })
  const ownerDocument = {
    createElement(tag) {
      created.push(tag)
      return makeNode(tag)
    },
  }
  const menu = makeNode('ul')
  menu.ownerDocument = ownerDocument
  const current = { type: 'paragraph', contentElement: {} }
  const builder = new MenuBuilder(menu, {
    blocks: {
      getCurrentIndex() { return 0 },
      getCurrentBlock() { return current },
      getBlockCount() { return 1 },
    },
    plugins: new Map(),
    i18n: { t(key) { return key } },
    actions: { moveUp() {}, moveDown() {}, duplicate() {}, delete() {} },
    rebuildMain() {},
  })

  const previousDocument = globalThis.document
  globalThis.document = new Proxy({}, { get() { throw new Error('ambient document must not be used') } })
  try {
    builder.buildMainView()
  } finally {
    globalThis.document = previousDocument
  }

  assert.ok(created.length > 0)
  assert.ok(created.every(tag => ['li', 'span'].includes(tag)))
})
