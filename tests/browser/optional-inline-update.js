import { test, assert, equal, make, para, blockElement, run } from './regressions/harness.js'

function fixture() {
  const contexts = []
  const roots = []
  const disposed = []
  const schema = {
    currentVersion: 1,
    createDefault: () => ({ label: '' }),
    decode({ dataVersion, data }) {
      if (dataVersion !== 1 || typeof data?.label !== 'string') throw new TypeError('Invalid badge')
      return { dataVersion: 1, data: { label: data.label } }
    },
    encode(data) {
      if (typeof data?.label !== 'string') throw new TypeError('Invalid badge')
      return { dataVersion: 1, data: { label: data.label } }
    },
  }
  const badge = {
    type: 'static-badge', label: { key: 'badge', fallback: 'Badge' }, icon: '', schema,
    setup({ ownerDocument }) {
      return {
        create(id, data, context) {
          contexts.push({ id, context })
          const element = ownerDocument.createElement('span')
          element.dataset.staticBadge = id
          element.textContent = data.label
          roots.push(element)
          // update() is deliberately absent from this supported contract.
          return {
            element,
            setReadOnly() { element.contentEditable = 'false' },
            destroy() { disposed.push(element) },
          }
        },
        destroy() {},
      }
    },
  }
  const inline = {
    x: { type: badge.type, dataVersion: 1, data: { label: 'Original' } },
    y: { type: badge.type, dataVersion: 1, data: { label: 'Sibling' } },
  }
  const editor = make([para('a', 'A {{x}} / {{y}} Z', { inline }), para('b', 'Other')], { inlinePlugins: [badge] })
  return {
    editor, roots, disposed,
    context: id => contexts.filter(entry => entry.id === id).at(-1).context,
    root: id => blockElement(editor, 'a').querySelector(`[data-static-badge="${id}"]`),
    data: () => editor.save().blocks,
  }
}

test('a widget without update reflects changed data with a new scoped occurrence and one history action', () => {
  const h = fixture()
  const old = h.root('x'), sibling = h.root('y'), context = h.context('x')
  const before = h.data()
  const pending = context.beginTask()
  context.updateData(() => ({ label: 'Updated' }))
  const after = h.data()
  equal(after[0].inline.x.data, { label: 'Updated' })
  equal(h.root('x').textContent, 'Updated', 'accepted data left the old widget projection visible')
  assert(h.root('x') !== old, 'missing update must use a fresh occurrence')
  assert(h.root('y') === sibling, 'changing x remounted unrelated y')
  assert(!old.isConnected && context.signal.aborted && pending.signal.aborted)
  equal(h.disposed.filter(element => element === old).length, 1)
  let staleProducer = 0
  equal(pending.commit(() => { staleProducer++; return { label: 'Stale' } }), false)
  context.updateData(() => { staleProducer++; return { label: 'Stale' } })
  equal(staleProducer, 0)
  assert(h.editor.undo())
  equal(h.data(), before, 'Undo did not restore complete author data')
  equal(h.root('x').textContent, 'Original')
  equal(h.editor.canUndo, false, 'one update created more than one history action')
  assert(h.editor.redo())
  equal(h.data(), after)
  equal(h.root('x').textContent, 'Updated')
})

test('no-op and unrelated edits retain a static widget occurrence and its pending task', () => {
  const h = fixture()
  const root = h.root('x'), context = h.context('x'), pending = context.beginTask()
  context.updateData(current => ({ ...current }))
  equal(h.editor.canUndo, false)
  assert(h.root('x') === root && !context.signal.aborted && !pending.signal.aborted)
  h.editor.blocks.update('b', () => ({ data: { text: 'Other changed' } }))
  assert(h.root('x') === root && !pending.signal.aborted)
  equal(pending.commit(() => ({ label: 'Task result' })), true,
    'accepted replacement must not fail because it revokes the old task owner')
  equal(h.root('x').textContent, 'Task result')
  assert(h.root('x') !== root && pending.signal.aborted)
  equal(pending.commit(() => ({ label: 'Repeated' })), false)
})

await run()
