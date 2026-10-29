import { test, assert, equal, make, para, blockElement, pause, run } from './regressions/harness.js'

function fixture({ editable = false, withUpdate = false } = {}) {
  const flags = { failCreation: null, failUpdate: null, caret: 2 }
  const created = []
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
    ...(editable ? { editing: { handle() {
      return { kind: 'update', data: { label: 'Updated' },
        ...(Number.isInteger(flags.caret) ? { caret: flags.caret } : {}) }
    } } } : {}),
    setup({ ownerDocument }) {
      return {
        create(id, data, context) {
          created.push(data.label)
          if (id === 'x' && flags.failCreation) {
            const error = flags.failCreation
            flags.failCreation = null
            throw error
          }
          contexts.push({ id, context })
          const element = ownerDocument.createElement('span')
          element.dataset.staticBadge = id
          element.textContent = data.label
          roots.push(element)
          // update() is deliberately absent from this supported contract.
          return {
            element,
            ...(withUpdate ? { update(next) {
              element.textContent = next.label
              if (flags.failUpdate) {
                const error = flags.failUpdate
                flags.failUpdate = null
                throw error
              }
            } } : {}),
            setReadOnly(value) { element.contentEditable = String(editable && !value) },
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
    editor, roots, disposed, flags, created,
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


function caught(operation) {
  try { operation() } catch (error) { return error }
  throw new Error('Expected an operation failure')
}

test('failed fallback acquisition restores accepted data and history without reviving the old scope', () => {
  const h = fixture()
  h.editor.blocks.update('b', () => ({ data: { text: 'Accepted sibling' } }))
  const before = h.data(), other = blockElement(h.editor, 'b')
  const context = h.context('x'), task = context.beginTask(), old = h.root('x')
  const failure = new Error('Replacement acquisition failed')
  h.flags.failCreation = failure
  assert(caught(() => context.updateData(() => ({ label: 'Rejected' }))) === failure)
  equal(h.data(), before)
  equal(h.root('x').textContent, 'Original')
  assert(h.root('x') !== old && context.signal.aborted && task.signal.aborted)
  assert(blockElement(h.editor, 'b') === other, 'failed x acquisition replaced another block')
  equal(h.disposed.filter(element => element === old).length, 1)
  let attempts = 0
  equal(task.commit(() => { attempts++; return { label: 'Retired' } }), false)
  equal(attempts, 0)
  assert(h.editor.undo(), 'failed replacement lost the previously accepted Undo action')
  equal(h.data()[1].data.text, 'Other')
  equal(h.editor.canUndo, false)
  h.context('x').updateData(() => ({ label: 'Recovered' }))
  equal(h.root('x').textContent, 'Recovered', 'recovery left the editor unusable')
})

test('a throwing update hook is not retried by creating the rejected new payload', () => {
  const h = fixture({ withUpdate: true })
  const before = h.data(), context = h.context('x'), failure = new Error('Update rejected')
  h.flags.failUpdate = failure
  assert(caught(() => context.updateData(() => ({ label: 'Rejected' }))) === failure)
  equal(h.data(), before)
  equal(h.root('x').textContent, 'Original')
  assert(!h.created.includes('Rejected'), 'a failed update was converted into successful recreation')
  assert(context.signal.aborted, 'rollback revived the damaged occurrence')
  equal(h.editor.canUndo, false)
  const stable = h.root('x')
  h.context('x').updateData(() => ({ label: 'Accepted' }))
  assert(h.root('x') === stable, 'working update hook unnecessarily recreated its occurrence')
  equal(stable.textContent, 'Accepted')
})

function editWidget(h) {
  const old = h.root('x')
  blockElement(h.editor, 'a').querySelector('[contenteditable="true"]').focus()
  const selection = window.getSelection()
  selection.setBaseAndExtent(old.firstChild, 3, old.firstChild, 3)
  const event = new InputEvent('beforeinput', {
    inputType: 'deleteContentBackward', bubbles: true, cancelable: true,
  })
  old.dispatchEvent(event)
  assert(event.defaultPrevented, 'owned immediate edit was not consumed')
  return old
}

test('immediate editing.handle places its caret inside the exact new optional-update occurrence', async () => {
  const h = fixture({ editable: true }), before = h.data()
  const old = editWidget(h), replacement = h.root('x')
  assert(replacement !== old)
  equal(replacement.textContent, 'Updated')
  await pause()
  const selection = window.getSelection()
  assert(selection.anchorNode === replacement.firstChild && selection.focusNode === replacement.firstChild)
  equal([selection.anchorOffset, selection.focusOffset], [2, 2])
  const after = h.data()
  assert(h.editor.undo())
  equal(h.data(), before)
  equal(h.editor.canUndo, false)
  assert(h.editor.redo())
  equal(h.data(), after)
})

test('a newer native selection supersedes the immediate replacement caret', async () => {
  const h = fixture({ editable: true })
  editWidget(h)
  const other = blockElement(h.editor, 'b').querySelector('[contenteditable="true"]')
  other.focus()
  window.getSelection().setBaseAndExtent(other.firstChild, 1, other.firstChild, 1)
  await pause()
  assert(window.getSelection().anchorNode === other.firstChild)
  equal(window.getSelection().anchorOffset, 1)
  equal(h.root('x').textContent, 'Updated')
})

test('missing immediate caret keeps the ordinary exterior logical completion', async () => {
  const h = fixture({ editable: true })
  h.flags.caret = null
  editWidget(h)
  await pause()
  const selection = window.getSelection(), replacement = h.root('x')
  assert(selection.isCollapsed && !replacement.contains(selection.anchorNode))
  assert(blockElement(h.editor, 'a').contains(selection.anchorNode))
  equal(h.data()[0].inline.x.data, { label: 'Updated' })
})

await run()
