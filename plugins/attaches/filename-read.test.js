import assert from 'node:assert/strict'
import test from 'node:test'
import { createAttachesPlugin } from './index.js'

// A projection/read contract test, not native input or editor history proof.
// Read-only projection avoids unrelated menus, uploads and source editors.
class Element {
  constructor(tag, ownerDocument) {
    this.tagName = tag.toUpperCase()
    this.ownerDocument = ownerDocument
    this.parentNode = null
    this.children = []
    this.style = {}
    this.dataset = {}
    this.attributes = new Map()
    this.textContent = ''
    this.classList = { toggle() {} }
  }
  append(...children) {
    for (const child of children) {
      child.remove()
      child.parentNode = this
      this.children.push(child)
    }
  }
  appendChild(child) { this.append(child); return child }
  replaceChildren(...children) {
    for (const child of this.children) child.parentNode = null
    this.children = []
    this.append(...children)
  }
  remove() {
    if (!this.parentNode) return
    const siblings = this.parentNode.children
    siblings.splice(siblings.indexOf(this), 1)
    this.parentNode = null
  }
  contains(node) { return node === this || this.children.some(child => child.contains(node)) }
  setAttribute(name, value) { this.attributes.set(name, String(value)) }
  removeAttribute(name) { this.attributes.delete(name) }
  getAttribute(name) { return this.attributes.get(name) ?? null }
  addEventListener() {}
}

function fixture(t, variant = 'f') {
  const document = {
    defaultView: { AbortController },
    createElement(tag) { return new Element(tag, document) },
  }
  const initial = {
    variant,
    files: [
      { id: 'first', url: 'https://example.test/a.pdf', name: 'original.pdf', size: 0, extension: 'pdf' },
      { id: 'second', url: 'https://example.test/b.pdf', name: 'other.pdf', size: 0, extension: 'pdf' },
    ],
  }
  let canonical = structuredClone(initial)
  const owner = new AbortController()
  const definition = createAttachesPlugin({ injectStyles: false })
  const runtime = definition.setup({ t: (_key, fallback) => fallback })
  const instance = runtime.create(initial, {
    ownerDocument: document,
    signal: owner.signal,
    isReadOnly: () => true,
    getData: () => canonical,
    createId: prefix => `${prefix}-fixture`,
    updateData() { throw new Error('Reading a filename must not author a document') },
    beginTask() { throw new Error('Reading a filename must not start a task') },
  })
  t.after(() => { instance.destroy(); owner.abort(); runtime.destroy() })
  return {
    initial,
    instance,
    field: id => instance.editableFields().find(field => field.key === `file:${id}:name`).element,
    setCanonical(value) { canonical = value },
  }
}

test('Attaches reads a trailing filename space without silently trimming it', t => {
  const h = fixture(t)
  h.field('first').textContent = 'report '
  const result = h.instance.read()
  assert.equal(result.files[0].name, 'report ')
  assert.deepEqual(result.files[1], h.initial.files[1])
  assert.equal(h.initial.files[0].name, 'original.pdf')
})

for (const [label, name] of [
  ['leading spaces', '  report.pdf'],
  ['spaces on both edges', '  report.pdf  '],
  ['internal repeated spaces', 'quarterly  report.pdf'],
  ['non-breaking spaces', '\u00a0report.pdf\u00a0'],
  ['Unicode whitespace', '\u2003отчёт.pdf\u2003'],
  ['tabs around a name', '\treport.pdf\t'],
]) {
  test(`Attaches preserves ${label} in a non-empty filename`, t => {
    const h = fixture(t)
    h.field('first').textContent = name
    assert.equal(h.instance.read().files[0].name, name)
  })
}

for (const name of ['', '   ', '\t\u00a0\u2003']) {
  test(`Attaches keeps the latest canonical name for blank input ${JSON.stringify(name)}`, t => {
    const h = fixture(t)
    // Native capture can advance canonical data without updating the local
    // projection snapshot. Match by stable ID, not canonical array position.
    const current = structuredClone(h.initial)
    current.files[0].name = ' latest accepted.pdf '
    current.files.reverse()
    h.setCanonical(current)
    h.field('first').textContent = name
    assert.equal(h.instance.read().files[0].name, ' latest accepted.pdf ')
  })
}

test('Attaches falls back to the projected name only when the canonical ID is absent', t => {
  const h = fixture(t)
  h.setCanonical({ ...h.initial, files: [h.initial.files[1]] })
  h.field('first').textContent = ''
  assert.equal(h.instance.read().files[0].name, 'original.pdf')
})

for (const variant of ['a', 'b', 'f', 'g']) {
  test(`Attaches ${variant}: retained projection and replay preserve the exact filename`, t => {
    const h = fixture(t, variant)
    const field = h.field('first')
    field.textContent = ' quarterly report.pdf '
    const edited = h.instance.read()
    h.setCanonical(edited)
    h.instance.update(edited, h.initial)
    assert.strictEqual(h.field('first'), field)
    assert.equal(field.textContent, ' quarterly report.pdf ')
    assert.equal(h.instance.read().files[0].name, ' quarterly report.pdf ')

    h.setCanonical(h.initial)
    h.instance.update(h.initial, edited)
    assert.strictEqual(h.field('first'), field)
    assert.equal(h.instance.read().files[0].name, 'original.pdf')

    h.setCanonical(edited)
    h.instance.update(edited, h.initial)
    assert.equal(h.instance.read().files[0].name, ' quarterly report.pdf ')
    h.instance.setReadOnly(true)
    assert.equal(h.field('first').textContent, ' quarterly report.pdf ')
    assert.equal(h.instance.read().files[0].name, ' quarterly report.pdf ')
  })
}
