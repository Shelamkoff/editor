import { createMentionPlugin } from '../../inline-plugins/mention/index.js'
import { test, make, blockElement, editorRoot, assert, equal, pause, run } from './regressions/harness.js'
import { clickNative, dispatchKey, printable } from './native-input-helpers.js'

async function suggestions() {
  const editor = make([{ id: 'a', type: 'paragraph', dataVersion: 2, data: { text: '' } }], { injectStyles: true, inlinePlugins: [createMentionPlugin({
    debounceDelay: 0, searchFunction: async () => [{ id: 42, name: 'Ada' }, ...Array.from({ length: 19 }, (_, i) => ({ id: i + 1, name: 'Result ' + (i + 1) }))],
  })] })
  await clickNative(blockElement(editor, 'a').querySelector('.oe-paragraph'))
  await printable('@'); await printable('A'); await pause(100)
  assert(editorRoot(editor).querySelectorAll('.oe-mention-item[role="option"]').length === 20, 'Mention candidates did not load')
  return editor
}
test('Mention listbox fits its owned popup and the short viewport with a native choice', async () => {
  await window.__testInput('Viewport.set', { width: 390, height: 180 })
  try {
    const editor = await suggestions(), root = editorRoot(editor)
    const host = root.querySelector('.oe-ip-popup').getBoundingClientRect(), box = root.querySelector('.oe-mention-dropdown').getBoundingClientRect()
    assert(host.width >= 260 && host.height > 20, 'Mention contents escaped their measurable popup host: ' + JSON.stringify(host.toJSON()))
    assert(box.left >= 8 && box.right <= innerWidth - 8 && box.top >= 8 && box.bottom <= innerHeight - 8, 'Mention menu escaped the viewport: ' + JSON.stringify(box.toJSON()))
    const before = editor.save().blocks
    await dispatchKey('Enter', 'Enter', 13)
    const after = editor.save().blocks
    equal(Object.values(after[0].inline)[0].data, { id: '42', name: 'Ada' })
    await dispatchKey('z', 'KeyZ', 90, 2); equal(editor.save().blocks, before)
    await dispatchKey('z', 'KeyZ', 90, 10); equal(editor.save().blocks, after)
  } finally { await window.__testInput('Viewport.reset') }
})
test('Mention arrow navigation keeps the active last and first candidates visible', async () => {
  await window.__testInput('Viewport.set', { width: 390, height: 180 })
  try {
    const editor = await suggestions(), root = editorRoot(editor), before = editor.save().blocks
    const visibleActive = () => {
      const active = root.querySelector('.oe-mention-item--active'), menu = root.querySelector('.oe-mention-dropdown')
      assert(active && menu)
      const bounds = active.getBoundingClientRect(), clip = menu.getBoundingClientRect()
      assert(bounds.top >= clip.top && bounds.bottom <= clip.bottom && bounds.top >= 8 && bounds.bottom <= innerHeight - 8, 'Keyboard-active mention is outside the visible listbox: ' + JSON.stringify(bounds.toJSON()))
      return active
    }
    await dispatchKey('ArrowUp', 'ArrowUp', 38)
    equal(visibleActive().dataset.index, '0', 'Up at the first result wrapped to the last one')
    for (let index = 0; index < 19; index++) await dispatchKey('ArrowDown', 'ArrowDown', 40)
    equal(visibleActive().dataset.index, '19')
    await dispatchKey('ArrowDown', 'ArrowDown', 40)
    equal(visibleActive().dataset.index, '19', 'Down at the last result wrapped to the first one')
    for (let index = 0; index < 19; index++) await dispatchKey('ArrowUp', 'ArrowUp', 38)
    equal(visibleActive().dataset.index, '0')
    equal(editor.save().blocks, before)
    await dispatchKey('Enter', 'Enter', 13)
    equal(Object.values(editor.save().blocks[0].inline)[0].data, { id: '42', name: 'Ada' })
  } finally { await window.__testInput('Viewport.reset') }
})
test('Mention accepts the keyboard-selected candidate with Tab and one Undo/Redo action', async () => {
  const editor = await suggestions(), root = editorRoot(editor), before = editor.save().blocks
  await dispatchKey('ArrowDown', 'ArrowDown', 40)
  await dispatchKey('Tab', 'Tab', 9)
  const after = editor.save().blocks
  assert(after[0].inline, 'Tab left the mention query instead of committing the active candidate')
  equal(Object.values(after[0].inline)[0].data, { id: '1', name: 'Result 1' })
  assert(!root.querySelector('.oe-mention-dropdown'))
  await dispatchKey('z', 'KeyZ', 90, 2); equal(editor.save().blocks, before)
  await dispatchKey('z', 'KeyZ', 90, 10); equal(editor.save().blocks, after)
})

test('Leaving a fresh mention query with Home closes its menu and lets native Enter split text', async () => {
  const editor = await suggestions(), root = editorRoot(editor), before = editor.save().blocks
  await dispatchKey('Home', 'Home', 36)
  assert(!root.querySelector('.oe-mention-dropdown'), 'Moving before the trigger kept its suggestions active')
  equal(editor.save().blocks, before)
  await dispatchKey('Enter', 'Enter', 13)
  const after = editor.save().blocks
  equal(after.map(block => block.data.text), ['', '@A'])
  assert(after.every(block => !block.inline), 'Retired suggestions committed a mention after the caret left its query')
  await dispatchKey('z', 'KeyZ', 90, 2); equal(editor.save().blocks, before)
  await dispatchKey('z', 'KeyZ', 90, 10); equal(editor.save().blocks, after)
})

test('Mention choice after moving within the query keeps the text after the live caret', async () => {
  const editor = await suggestions(), before = editor.save().blocks
  await dispatchKey('ArrowLeft', 'ArrowLeft', 37)
  assert(editorRoot(editor).querySelector('.oe-mention-dropdown'), 'Moving inside the query closed valid suggestions')
  await dispatchKey('Enter', 'Enter', 13)
  const after = editor.save().blocks
  assert(after[0].inline, 'Choosing a result at the live query caret was ignored')
  const id = Object.keys(after[0].inline)[0]
  equal(after[0].data.text, '{{' + id + '}}A', 'The unselected query suffix was removed')
  equal(after[0].inline[id].data, { id: '42', name: 'Ada' })
  await dispatchKey('z', 'KeyZ', 90, 2); equal(editor.save().blocks, before)
  await dispatchKey('z', 'KeyZ', 90, 10); equal(editor.save().blocks, after)
})

test('Selecting part of a fresh mention query closes suggestions without altering authored text', async () => {
  const editor = await suggestions(), root = editorRoot(editor), before = editor.save().blocks
  await dispatchKey('ArrowLeft', 'ArrowLeft', 37, 8)
  equal(window.getSelection().toString(), 'A')
  assert(!root.querySelector('.oe-mention-dropdown'), 'A noncollapsed selection kept suggestions active')
  equal(editor.save().blocks, before)
  await dispatchKey('Enter', 'Enter', 13)
  const after = editor.save().blocks
  equal(after.map(block => block.data.text), ['@', ''])
  assert(after.every(block => !block.inline))
  await dispatchKey('z', 'KeyZ', 90, 2); equal(editor.save().blocks, before)
  await dispatchKey('z', 'KeyZ', 90, 10); equal(editor.save().blocks, after)
})

async function retainedTrigger() {
  const sessions = [], cancellations = []
  const definition = {
    type: 'probe', trigger: '@', icon: '', label: { key: 'title', fallback: 'Probe' },
    schema: { currentVersion: 1, createDefault: () => ({ name: '' }), encode: data => ({ dataVersion: 1, data }), decode: input => input },
    setup(runtime) {
      return {
        create(_id, data) {
          const element = runtime.ownerDocument.createElement('span')
          element.contentEditable = 'false'; element.textContent = data.name
          return { element, update(next) { element.textContent = next.name }, setReadOnly() {}, destroy() {} }
        },
        onTriggerQuery(session) { sessions.push(session) },
        onTriggerCancel() { cancellations.push(true) },
        destroy() {},
      }
    },
  }
  const editor = make([{ id: 'a', type: 'paragraph', dataVersion: 2, data: { text: '' } }], { injectStyles: true, inlinePlugins: [definition] })
  await clickNative(blockElement(editor, 'a').querySelector('.oe-paragraph'))
  await printable('@'); await printable('A')
  const retired = sessions.at(-1)
  await dispatchKey('ArrowLeft', 'ArrowLeft', 37); await printable('B')
  const current = sessions.at(-1)
  assert(retired !== current && retired.range.end === current.range.end, 'The query fixture did not replace the session at the same caret offset')
  return { editor, retired, current, cancellations }
}

for (const action of ['cancel', 'commit']) test('A retained generic trigger cannot ' + action + ' its successor query with the same caret offset', async () => {
  const { editor, retired, current, cancellations } = await retainedTrigger(), before = editor.save().blocks
  if (action === 'cancel') retired.cancel()
  else equal(retired.commit({ name: 'Stale' }), false, 'An earlier query committed its result into the successor')
  equal(cancellations.length, 0, 'An earlier query cancelled its successor')
  equal(editor.save().blocks, before)
  equal(current.commit({ name: 'Current' }), true, 'The live query lost authoring authority')
  const after = editor.save().blocks
  equal(Object.values(after[0].inline)[0].data, { name: 'Current' })
  await dispatchKey('z', 'KeyZ', 90, 2); equal(editor.save().blocks, before)
  await dispatchKey('z', 'KeyZ', 90, 10); equal(editor.save().blocks, after)
})

test('Moving out of an edited mention closes suggestions and preserves the next native Enter', async () => {
  const editor = make([{ id: 'a', type: 'paragraph', dataVersion: 2, data: { text: '{{person}} tail' }, inline: { person: { type: 'mention', dataVersion: 1, data: { id: 'old', name: 'Ada' } } } }], { injectStyles: true, inlinePlugins: [createMentionPlugin({
    debounceDelay: 0, searchFunction: async () => [{ id: 42, name: 'Ada' }],
  })] })
  const before = editor.save().blocks, root = editorRoot(editor)
  const span = blockElement(editor, 'a').querySelector('[data-inline-plugin="mention"]')
  const field = blockElement(editor, 'a').querySelector('.oe-paragraph')
  await clickNative(field)
  const range = document.createRange(), selection = window.getSelection()
  range.setStart(span.firstChild, 3); range.collapse(true)
  selection.removeAllRanges(); selection.addRange(range)
  await dispatchKey('Backspace', 'Backspace', 8); await pause(100)
  const edited = editor.save().blocks
  equal(span.textContent, '@Aa', 'Native Backspace did not edit the widget label')
  equal(edited[0].inline.person.data.name, 'Aa', 'The edited widget label was not saved in author data')
  assert(root.querySelector('.oe-mention-item'), 'Editing the owned mention did not open suggestions')
  await dispatchKey('End', 'End', 35)
  await dispatchKey('ArrowRight', 'ArrowRight', 39)
  await dispatchKey('End', 'End', 35)
  assert(!root.querySelector('.oe-mention-dropdown'), 'Leaving the edited widget kept its suggestions active')
  equal(editor.save().blocks, edited)
  await dispatchKey('Enter', 'Enter', 13)
  const after = editor.save().blocks
  equal(after.length, 2)
  equal(after[0], edited[0]); equal(after[1].data.text, '')
  await dispatchKey('z', 'KeyZ', 90, 2); equal(editor.save().blocks, edited)
  await dispatchKey('z', 'KeyZ', 90, 2); equal(editor.save().blocks, before)
})

for (const [key, code, keyCode, typed, name] of [['Delete', 'Delete', 46, false, 'Aa'], ['X', 'KeyX', 88, true, 'AXda']]) test('Editing a mention with native ' + key + ' persists its label and undoes once', async () => {
  const editor = make([{ id: 'a', type: 'paragraph', dataVersion: 2, data: { text: '{{person}} tail' }, inline: { person: { type: 'mention', dataVersion: 1, data: { id: 'old', name: 'Ada' } } } }], { injectStyles: true, inlinePlugins: [createMentionPlugin({ debounceDelay: 0, searchFunction: async () => [{ id: 42, name: 'Ada' }] })] })
  const before = editor.save().blocks, root = editorRoot(editor)
  const span = blockElement(editor, 'a').querySelector('[data-inline-plugin="mention"]'), field = blockElement(editor, 'a').querySelector('.oe-paragraph')
  await clickNative(field)
  const range = document.createRange(), selection = window.getSelection()
  range.setStart(span.firstChild, 2); range.collapse(true)
  selection.removeAllRanges(); selection.addRange(range)
  if (typed) await printable('X')
  else await dispatchKey(key, code, keyCode)
  await pause(100)
  const after = editor.save().blocks
  equal(after[0].inline.person.data, { id: 'old', name })
  equal(span.textContent, '@' + name)
  await dispatchKey('End', 'End', 35)
  await dispatchKey('ArrowRight', 'ArrowRight', 39)
  await dispatchKey('End', 'End', 35)
  assert(!root.querySelector('.oe-mention-dropdown'))
  await dispatchKey('z', 'KeyZ', 90, 2); equal(editor.save().blocks, before); equal(editor.canUndo, false)
  await dispatchKey('z', 'KeyZ', 90, 10); equal(editor.save().blocks, after)
  equal(blockElement(editor, 'a').querySelector('[data-inline-plugin="mention"]').textContent, '@' + name)
})

for (const action of ['insert', 'Backspace', 'Delete']) test('A selected part of an existing mention is replaced by native ' + action + ' and one history action', async () => {
  const editor = make([{ id: 'a', type: 'paragraph', dataVersion: 2, data: { text: '{{person}} tail' }, inline: { person: { type: 'mention', dataVersion: 1, data: { id: 'old', name: 'Ada' } } } }], { injectStyles: true, inlinePlugins: [createMentionPlugin({ debounceDelay: 0 })] })
  const before = editor.save().blocks
  const span = blockElement(editor, 'a').querySelector('[data-inline-plugin="mention"]'), field = blockElement(editor, 'a').querySelector('.oe-paragraph')
  await clickNative(field)
  const range = document.createRange(), selection = window.getSelection()
  range.setStart(span.firstChild, 2); range.setEnd(span.firstChild, 4)
  selection.removeAllRanges(); selection.addRange(range)
  equal(selection.toString(), 'da')
  if (action === 'insert') await printable('X')
  else await dispatchKey(action, action, action === 'Delete' ? 46 : 8)
  const name = action === 'insert' ? 'AX' : 'A', after = editor.save().blocks
  equal(after[0].data.text, '{{person}} tail')
  equal(after[0].inline.person.data, { id: 'old', name }, 'The operation ignored the selected mention range')
  equal(span.textContent, '@' + name)
  await dispatchKey('End', 'End', 35); await dispatchKey('ArrowRight', 'ArrowRight', 39); await dispatchKey('End', 'End', 35)
  await dispatchKey('z', 'KeyZ', 90, 2); equal(editor.save().blocks, before); equal(editor.canUndo, false)
  await dispatchKey('z', 'KeyZ', 90, 10); equal(editor.save().blocks, after)
})

test('After leaving a fresh mention query, an auxiliary input retains native Enter without an author mutation', async () => {
  const editor = await suggestions(), root = editorRoot(editor), before = editor.save().blocks, events = []
  editor.on('transaction:committed', event => events.push(event))
  const input = document.createElement('input')
  input.value = 'Search'; root.append(input); input.focus()
  await dispatchKey('Enter', 'Enter', 13)
  equal(input.value, 'Search')
  equal(editor.save().blocks, before, 'Auxiliary Enter committed a mention from another editing owner')
  equal(events.length, 0)
  assert(!root.querySelector('.oe-mention-dropdown'), 'Leaving the trigger field kept its session active')
})

test('After leaving an owned mention, an auxiliary input retains native Backspace without an author mutation', async () => {
  const editor = make([{ id: 'a', type: 'paragraph', dataVersion: 2, data: { text: '{{person}} tail' }, inline: { person: { type: 'mention', dataVersion: 1, data: { id: 'old', name: 'Ada' } } } }], { injectStyles: true, inlinePlugins: [createMentionPlugin()] })
  const before = editor.save().blocks, root = editorRoot(editor)
  const span = blockElement(editor, 'a').querySelector('[data-inline-plugin="mention"]'), field = blockElement(editor, 'a').querySelector('.oe-paragraph')
  await clickNative(field)
  const range = document.createRange(), selection = window.getSelection()
  range.setStart(span.firstChild, 3); range.collapse(true)
  selection.removeAllRanges(); selection.addRange(range)
  const input = document.createElement('input')
  input.value = 'Draft'; root.append(input); input.focus(); input.setSelectionRange(5, 5)
  await dispatchKey('Backspace', 'Backspace', 8)
  equal(input.value, 'Draf', 'The mention stole native deletion from an auxiliary control')
  equal(editor.save().blocks, before); equal(editor.canUndo, false)
})

for (const direction of ['ArrowUp', 'ArrowDown']) test('A mention search with no results yields native ' + direction + ' to the document caret', async () => {
  const editor = make([{ id: 'a', type: 'paragraph', dataVersion: 2, data: { text: 'Alpha' } }, { id: 'b', type: 'paragraph', dataVersion: 2, data: { text: '' } }, { id: 'c', type: 'paragraph', dataVersion: 2, data: { text: 'Charlie' } }], { injectStyles: true, inlinePlugins: [createMentionPlugin({ debounceDelay: 0, searchFunction: async () => [] })] })
  const root = editorRoot(editor), field = id => blockElement(editor, id).querySelector('.oe-paragraph')
  await clickNative(field('b')); await printable('@'); await printable('A'); await pause(100)
  assert(root.querySelector('.oe-mention-no-results'), 'The empty-search fixture did not load')
  const before = editor.save().blocks
  await dispatchKey(direction, direction, direction === 'ArrowUp' ? 38 : 40)
  assert(!root.querySelector('.oe-mention-dropdown'), 'An empty mention list kept keyboard ownership after native caret movement')
  if (direction === 'ArrowUp') await dispatchKey('ArrowUp', 'ArrowUp', 38)
  equal(document.activeElement, field(direction === 'ArrowUp' ? 'a' : 'c'), 'The empty list captured the block navigation key')
  equal(editor.save().blocks, before)
})

await run()
