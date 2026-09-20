import assert from 'node:assert/strict'
import test from 'node:test'
import { deserializeInlineHtml, serializeInlineHtml } from './inlineMarshal.js'

// Minimal DOM fixture for flat text + <span> fragments used below.
// It deliberately does not emulate a browser or arbitrary HTML parsing.
class TextNode {
  constructor(data, document) { this.data = data; this.ownerDocument = document; this.parentNode = null }
  get textContent() { return this.data }
  get parentElement() { return this.parentNode instanceof WidgetElement ? this.parentNode : null }
  replaceWith(node) { replace(this, node) }
}
class Fragment {
  constructor(document) { this.ownerDocument = document; this.childNodes = []; this.parentNode = null }
  appendChild(node) { this.childNodes.push(node); node.parentNode = this; return node }
  querySelectorAll() { return this.childNodes.filter(node => node instanceof WidgetElement) }
}
class WidgetElement extends Fragment {
  constructor(document, id, label) { super(document); this.id = id; this.label = label }
  getAttribute(name) { return name === 'data-id' ? this.id : name === 'data-inline-plugin' ? 'probe' : null }
  get textContent() { return this.label }
  closest() { return this }
  replaceWith(node) { replace(this, node) }
}
function replace(current, next) {
  const parent = current.parentNode
  const replacements = next instanceof Fragment && !(next instanceof WidgetElement) ? next.childNodes : [next]
  parent.childNodes.splice(parent.childNodes.indexOf(current), 1, ...replacements)
  for (const node of replacements) node.parentNode = parent
}
function serialize(node) {
  if (node instanceof TextNode) return node.data
  if (node instanceof WidgetElement) return `<span data-inline-plugin="probe" data-id="${node.id}">${node.label}</span>`
  return node.childNodes.map(serialize).join('')
}
class Template {
  constructor(document) { this.ownerDocument = document; this.content = new Fragment(document) }
  set innerHTML(html) {
    this.content = new Fragment(this.ownerDocument)
    const source = String(html)
    let offset = 0
    for (const match of source.matchAll(/<span data-inline-plugin="probe" data-id="([\w-]+)">([^<]*)<\/span>/g)) {
      if (match.index > offset) this.content.appendChild(new TextNode(source.slice(offset, match.index), this.ownerDocument))
      this.content.appendChild(new WidgetElement(this.ownerDocument, match[1], match[2]))
      offset = match.index + match[0].length
    }
    if (offset < source.length) this.content.appendChild(new TextNode(source.slice(offset), this.ownerDocument))
  }
  get innerHTML() { return serialize(this.content) }
}
const document = {
  defaultView: { HTMLElement: WidgetElement },
  createElement(tag) { assert.equal(tag, 'template'); return new Template(this) },
  createTextNode(text) { return new TextNode(text, this) },
  createDocumentFragment() { return new Fragment(this) },
  createTreeWalker(root) {
    const texts = root.childNodes.filter(node => node instanceof TextNode)
    let index = 0
    return { currentNode: root, nextNode() { return this.currentNode = texts[index++] ?? null } }
  },
}
const registry = new Map([['probe', {
  getData(element) { return { label: element.label } },
  createWidget(data, id, context) { return new WidgetElement(context.ownerDocument, id, data.label) },
}]])
const widget = '<span data-inline-plugin="probe" data-id="w">VALUE</span>'
const countWidgets = html => [...html.matchAll(/data-inline-plugin="probe"/g)].length

for (const [name, preserved] of [
  ['newly created widget', {}],
  ['previously loaded widget', { w: { type: 'probe', data: { label: 'VALUE' } } }],
]) {
  test(`authored literal token survives save/load beside a ${name}`, () => {
    const source = `literal {{w}} / ${widget}`
    const saved = serializeInlineHtml(source, registry, new Set(), preserved, document)
    const reloaded = deserializeInlineHtml(saved.html, saved.inline, registry, document)
    assert.equal(countWidgets(reloaded), 1, `literal was expanded into a second widget: ${reloaded}`)
    assert.ok(reloaded.startsWith('literal {{w}} / '))
  })
}

test('ordinary live widget keeps stable id and one instance (control)', () => {
  const source = `before / ${widget} / after`
  const saved = serializeInlineHtml(source, registry, new Set(), {}, document)
  assert.deepEqual(saved, { html: 'before / {{w}} / after', inline: { w: { type: 'probe', data: { label: 'VALUE' } } } })
  assert.equal(deserializeInlineHtml(saved.html, saved.inline, registry, document), source)
})

test('unknown opaque references still round-trip without a registered plugin (control)', () => {
  const preserved = { w: { type: 'unavailable', data: { label: 'KEEP' } } }
  const saved = serializeInlineHtml('before {{w}} after', registry, new Set(), preserved, document)
  assert.deepEqual(saved.inline, preserved)
  assert.equal(deserializeInlineHtml(saved.html, saved.inline, registry, document), 'before {{w}} after')
})

// Exercise the production block-level traversal as well as the standalone
// marshaller: sibling fields share one inline map regardless of visit order.
import { DocumentSnapshotStore } from '../core/DocumentSnapshotStore.js'
for (const reversed of [false, true]) {
  for (const preserved of [{}, { w: { type: 'probe', data: { label: 'VALUE' } } }]) {
    test(`literal in a sibling field stays literal (widget first=${reversed}, loaded=${!!preserved.w})`, () => {
      // A loaded block retains only entries that hydration could not turn
      // into live DOM; derive that provenance through the production path.
      const opaque = {}
      const live = preserved.w ? deserializeInlineHtml('{{w}}', preserved, registry, document, opaque) : widget
      const values = reversed ? { first: live, second: 'literal {{w}}' } : { first: 'literal {{w}}', second: live }
      const block = {
        id: 'a', type: 'two-fields', version: 1,
        contentElement: { ownerDocument: document },
        plugin: { mapTextFields(data, transform) { for (const key of ['first', 'second']) data[key] = transform(data[key]) } },
        save() { return { id: 'a', type: 'two-fields', data: { ...values }, inline: opaque } },
      }
      const saved = new DocumentSnapshotStore([block], registry, {}).save().blocks[0]
      const literalKey = reversed ? 'second' : 'first'
      const widgetKey = reversed ? 'first' : 'second'
      assert.equal(deserializeInlineHtml(saved.data[literalKey], saved.inline, registry, document), 'literal {{w}}')
      assert.equal(countWidgets(deserializeInlineHtml(saved.data[widgetKey], saved.inline, registry, document)), 1)
      assert.equal(Object.keys(saved.inline).length, 1)
    })
  }
}

test('transient widget text reserves literal IDs before committed widgets allocate them', () => {
  const transient = new Map([['probe', { ...registry.get('probe'), isCommitted: element => element.label !== '{{w}}' }]])
  const source = '<span data-inline-plugin="probe" data-id="draft">{{w}}</span> / ' + widget
  const saved = serializeInlineHtml(source, transient, new Set(), {}, document)
  const loaded = deserializeInlineHtml(saved.html, saved.inline, transient, document)
  assert.equal(countWidgets(loaded), 1)
  assert.ok(loaded.startsWith('{{w}} / '))
})

test('hydration records only unresolved payloads as opaque provenance', () => {
  const opaque = {}
  const refs = {
    w: { type: 'probe', data: { label: 'VALUE' } },
    absent: { type: 'missing', data: { nested: [1, 2] } },
    broken: { type: 'broken', data: { label: 'KEEP' } },
    unused: { type: 'missing', data: { unused: true } },
  }
  const plugins = new Map([...registry, ['broken', { createWidget() { throw new Error('legacy data') } }]])
  const loaded = deserializeInlineHtml('{{w}} / {{absent}} / {{broken}}', refs, plugins, document, opaque)
  assert.equal(countWidgets(loaded), 1)
  assert.deepEqual(opaque, { absent: refs.absent, broken: refs.broken })
  assert.equal(Object.keys(refs).length, 4, 'hydration must not mutate caller-owned metadata')
})

test('missing-plugin metadata survives a new live widget using its ID', () => {
  const preserved = { w: { type: 'missing', data: { name: 'KEEP' } } }
  const saved = serializeInlineHtml('{{w}} / ' + widget, registry, new Set(), preserved, document)
  assert.deepEqual(saved.inline.w, preserved.w)
  assert.equal(Object.keys(saved.inline).length, 2)
  const loaded = deserializeInlineHtml(saved.html, saved.inline, registry, document)
  assert.ok(loaded.startsWith('{{w}} / '))
  assert.equal(countWidgets(loaded), 1)
})

test('registered legacy payload which failed hydration survives a live ID collision', () => {
  const preserved = { w: { type: 'probe', data: { label: 'LEGACY' } } }
  const block = {
    id: 'a', type: 'paragraph', version: 1,
    contentElement: { ownerDocument: document },
    plugin: { mapTextFields(data, transform) { data.text = transform(data.text) } },
    save() { return { id: 'a', type: 'paragraph', data: { text: '{{w}} / ' + widget }, inline: preserved } },
  }
  const saved = new DocumentSnapshotStore([block], registry, {}).save().blocks[0]
  assert.deepEqual(saved.inline.w, preserved.w)
  assert.equal(Object.keys(saved.inline).length, 2)
})
