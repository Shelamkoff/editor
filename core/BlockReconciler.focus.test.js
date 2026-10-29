import test from 'node:test'
import assert from 'node:assert/strict'
import { BlockReconciler } from './BlockReconciler.js'
import { DocumentStore } from './DocumentStore.js'

// Owner identity/focus protocol only. Genuine DOM selection is covered by
// runtime-contracts and the installed-package external-extension scenario.
class Element {
  constructor(tagName, document) {
    this.tagName = tagName.toUpperCase()
    this.ownerDocument = document
    this.parentNode = null
    this.children = []
    this.dataset = {}
    this.style = {}
    this.contentEditable = 'inherit'
  }
  get firstChild() { return this.children[0] ?? null }
  get nextSibling() { return this.parentNode?.children[this.parentNode.children.indexOf(this) + 1] ?? null }
  appendChild(child) { child.remove(); child.parentNode = this; this.children.push(child); return child }
  replaceChildren(...children) { for (const child of [...this.children]) child.remove(); for (const child of children) this.appendChild(child) }
  remove() { if (this.parentNode) { const siblings = this.parentNode.children; siblings.splice(siblings.indexOf(this), 1); this.parentNode = null } }
  contains(target) { for (let node = target; node; node = node.parentNode) if (node === this) return true; return false }
  focus() { this.ownerDocument.activeElement = this }
}

function fixture() {
  const document = { activeElement: null, defaultView: { HTMLElement: Element, AbortController },
    createElement(tag) { return new Element(tag, document) },
  }
  const fields = new Map()
  const registry = {
    hasBlock: () => true,
    getBlockDefinition: type => ({ type }),
    getBlockRuntime: () => ({ create(initial) {
      const element = document.createElement('article')
      const title = document.createElement('input'), body = document.createElement('textarea')
      element.appendChild(title); element.appendChild(body)
      fields.set('title', title); fields.set('body', body)
      return { element, read: () => initial, setReadOnly() {}, destroy() {},
        editableFields: () => [
          { key: 'title', mode: 'plain-text', element: title },
          { key: 'body', mode: 'plain-text', element: body },
        ],
      }
    } }),
  }
  const container = document.createElement('main')
  const reconciler = new BlockReconciler({ container, registry, contextFactory: () => ({}) })
  reconciler.mount(new DocumentStore({ version: '2.0.0', blocks: [
    { id: 'a', type: 'custom', dataVersion: 1, data: { title: 'Title', body: 'Body' } },
  ] }))
  return { document, fields, container, reconciler }
}

test('a valid block without optional focus can focus its registered editable field', () => {
  const h = fixture()
  try {
    assert.equal(h.reconciler.focus('a', { fieldKey: 'body' }), true)
    assert.equal(h.document.activeElement, h.fields.get('body'))
    assert.equal(h.reconciler.focus('a'), true)
    assert.equal(h.document.activeElement, h.fields.get('title'))
  } finally { h.reconciler.destroy() }
})

test('optional-focus fallback never redirects an unknown field or displaced owner', () => {
  const h = fixture()
  try {
    h.fields.get('title').focus()
    assert.equal(h.reconciler.focus('a', { fieldKey: 'missing' }), false)
    assert.equal(h.document.activeElement, h.fields.get('title'))
    h.reconciler.getElement('a').remove()
    assert.equal(h.reconciler.focus('a', { fieldKey: 'body' }), false)
    assert.equal(h.document.activeElement, h.fields.get('title'))
  } finally { h.reconciler.destroy() }
})

test('optional-focus fallback cannot accept its retired occurrence', () => {
  const h = fixture()
  h.fields.get('body').focus = () => h.reconciler.destroy()
  assert.equal(h.reconciler.focus('a', { fieldKey: 'body' }), false)
  assert.deepEqual(h.reconciler.ids, [])
})
