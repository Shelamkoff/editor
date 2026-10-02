import test from 'node:test'
import assert from 'node:assert/strict'

import { paragraphDataSchema } from '../../shared/blockSchemas/paragraph.js'
import { createParagraphDefinition } from './v2.js'

test('Paragraph v2 definition is immutable and creates isolated block instances', () => {
  const definition = createParagraphDefinition()
  assert.equal(definition.type, 'paragraph')
  assert.equal(definition.schema, paragraphDataSchema)
  assert.ok(Object.isFrozen(definition))

  const ownerDocument = /** @type {Document} */ ({
    createElement(tag) {
      return {
        tagName: String(tag).toUpperCase(),
        ownerDocument: this,
        contentEditable: 'inherit',
        dataset: {},
        className: '',
        innerHTML: '',
        textContent: '',
        setAttribute() {},
        removeAttribute() {},
        focus() {},
      }
    },
  })

  const runtime = definition.setup({
    ownerDocument,
    signal: new AbortController().signal,
    t: (_key, fallback = '') => fallback,
    isDefaultBlock: true,
    editorPlaceholder: 'Write',
  })

  const makeContext = data => ({
    ownerDocument,
    signal: new AbortController().signal,
    getData: () => data,
    updateData() {},
    commitDomMutation(operation) { operation() },
    requestSplit() {},
    requestExit() {},
    isReadOnly: () => false,
  })

  const first = runtime.create({ text: 'A' }, makeContext({ text: 'A' }))
  const second = runtime.create({ text: 'B' }, makeContext({ text: 'B' }))

  assert.notEqual(first, second)
  assert.notEqual(first.element, second.element)
  assert.equal(first.read().text, 'A')
  assert.equal(second.read().text, 'B')

  first.destroy()
  second.destroy()
  runtime.destroy()
})

test('Paragraph v2 instance read-only transition is in-place and reversible', () => {
  const nodes = []
  const ownerDocument = /** @type {Document} */ ({
    createElement() {
      const node = {
        ownerDocument: this,
        contentEditable: 'inherit',
        dataset: {},
        className: '',
        innerHTML: '',
        textContent: '',
        setAttribute(name, value) { this[name] = value },
        removeAttribute(name) { delete this[name] },
        focus() {},
      }
      nodes.push(node)
      return node
    },
  })
  const definition = createParagraphDefinition()
  const runtime = definition.setup({
    ownerDocument,
    signal: new AbortController().signal,
    t: (_key, fallback = '') => fallback,
    isDefaultBlock: false,
  })
  const context = {
    ownerDocument,
    signal: new AbortController().signal,
    getData: () => ({ text: '' }),
    updateData() {},
    commitDomMutation(operation) { operation() },
    requestSplit() {},
    requestExit() {},
    isReadOnly: () => false,
  }
  const instance = runtime.create({ text: '' }, context)
  const element = instance.element

  instance.setReadOnly(true)
  assert.equal(instance.element, element)
  assert.equal(element.contentEditable, 'false')

  instance.setReadOnly(false)
  assert.equal(instance.element, element)
  assert.equal(element.contentEditable, 'true')

  instance.destroy()
  runtime.destroy()
})
