import { getTextOffset } from '../../shared/textOffset.js'
import { createMentionPlugin } from '../../inline-plugins/mention/index.js'
import { createColumnsPlugin } from '../../plugins/columns/index.js'
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
  equal(after[0].data.text.replaceAll('&nbsp;', ' '), '{{' + id + '}} A', 'The unselected query suffix was removed')
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

async function retainedTrigger(extraBlocks = []) {
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
  const editor = make([{ id: 'a', type: 'paragraph', dataVersion: 2, data: { text: '' } }, ...extraBlocks], { injectStyles: true, inlinePlugins: [definition] })
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
  assert(span.classList.contains('oe-ip--mention--editing'), 'Editing did not activate the mention span')
  await dispatchKey('End', 'End', 35)
  await dispatchKey('ArrowRight', 'ArrowRight', 39)
  await dispatchKey('End', 'End', 35)
  assert(!root.querySelector('.oe-mention-dropdown'), 'Leaving the edited widget kept its suggestions active')
  assert(!span.classList.contains('oe-ip--mention--editing'), 'Leaving the widget did not deactivate its span')
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

test('A generic trigger result cannot replace a host-updated query at the same live caret offset', async () => {
  const { editor, current } = await retainedTrigger()
  editor.blocks.update('a', () => ({ data: { text: '@CA' } }))
  editor.blocks.focus('a', { offset: 2 })
  const before = editor.save().blocks, events = []
  editor.on('transaction:committed', event => events.push(event))
  equal(current.commit({ name: 'Stale B result' }), false, 'The old query result replaced text from the host update')
  equal(editor.save().blocks, before); equal(events.length, 0)
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks[0].data.text, '@BA')
})

test('Destroying an editor immediately after a fresh inline command retires its queued autocomplete work', async () => {
  let searches = 0
  const editor = make([{ id: 'a', type: 'paragraph', dataVersion: 2, data: { text: '' } }], { injectStyles: true, inlinePlugins: [createMentionPlugin({
    debounceDelay: 0, searchFunction: async () => { searches++; return [{ id: 42, name: 'Ada' }] },
  })] })
  editor.blocks.focus('a', { offset: 0 })
  const root = editorRoot(editor)
  equal(editor.insertInlinePlugin('mention'), true)
  equal(editor.save().blocks[0].data.text, '@')
  editor.destroy()
  await pause(50)
  equal(searches, 0, 'A retired inline command started an autocomplete request')
  assert(!root.isConnected)
})

test('A generic autocomplete session keeps its captured source when a plugin attempts to change its owner', async () => {
  const { editor, current } = await retainedTrigger([{ id: 'b', type: 'paragraph', dataVersion: 2, data: { text: 'Bravo' } }])
  const before = editor.save().blocks
  Reflect.set(current, 'blockId', 'b')
  equal(current.commit({ name: 'Current' }), true)
  const after = editor.save().blocks
  equal(after[1], before[1], 'Changing a session owner redirected its command to another block')
  equal(Object.values(after[0].inline)[0].data, { name: 'Current' })
  await dispatchKey('z', 'KeyZ', 90, 2); equal(editor.save().blocks, before)
  await dispatchKey('z', 'KeyZ', 90, 10); equal(editor.save().blocks, after)
})

test('A queued fresh inline query cannot reopen autocomplete in read-only mode', async () => {
  let searches = 0
  const editor = make([{ id: 'a', type: 'paragraph', dataVersion: 2, data: { text: '' } }], { injectStyles: true, inlinePlugins: [createMentionPlugin({
    debounceDelay: 0, searchFunction: async () => { searches++; return [{ id: 42, name: 'Ada' }] },
  })] })
  editor.blocks.focus('a', { offset: 0 })
  const root = editorRoot(editor)
  equal(editor.insertInlinePlugin('mention'), true)
  const before = editor.save().blocks
  editor.setReadOnly(true)
  await pause(60)
  equal(searches, 0, 'A queued query started a request after read-only was enabled')
  assert(!root.querySelector('.oe-mention-dropdown'), 'A queued query reopened a menu in read-only mode')
  equal(editor.save().blocks, before)
  editor.setReadOnly(false); await pause(30)
  equal(searches, 0)
  editor.blocks.focus('a', { offset: 1 }); await printable('A'); await pause(60)
  assert(root.querySelector('.oe-mention-item'), 'Editing did not resume a fresh query')
  equal(editor.save().blocks[0].data.text, '@A')
  await dispatchKey('z', 'KeyZ', 90, 2); equal(editor.save().blocks, before)
})

test('A read-only transition retires the generic autocomplete session even after editing resumes', async () => {
  const { editor, current, cancellations } = await retainedTrigger(), before = editor.save().blocks
  editor.setReadOnly(true); editor.setReadOnly(false)
  editor.blocks.focus('a', { offset: 2 })
  const events = []
  editor.on('transaction:committed', event => events.push(event))
  equal(current.commit({ name: 'Retired result' }), false, 'The retired query regained authoring authority after read-only was disabled')
  equal(editor.save().blocks, before); equal(events.length, 0)
  equal(cancellations.length, 1, 'The runtime was not notified that its query was retired')
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks[0].data.text, '', 'A retired result added an Undo action')
})

test('A reused custom mention row commits its current candidate after the query changes', async () => {
  const rows = new Map()
  const editor = make([{ id: 'a', type: 'paragraph', dataVersion: 2, data: { text: '' } }], { injectStyles: true, inlinePlugins: [createMentionPlugin({
    debounceDelay: 0, searchFunction: async query => query === 'A' ? [{ id: 'ada', name: 'Ada' }] : query === 'AB' ? [{ id: 'grace', name: 'Grace' }, { id: 'ada', name: 'Ada' }] : [],
    renderItem(item) {
      if (!rows.has(item.id)) { const row = document.createElement('button'); row.type = 'button'; row.textContent = item.name; rows.set(item.id, row) }
      return rows.get(item.id)
    },
  })] })
  const field = blockElement(editor, 'a').querySelector('.oe-paragraph')
  await clickNative(field); await printable('@'); await printable('A'); await pause(80)
  const row = rows.get('ada')
  assert(row?.isConnected, 'The initial custom candidate was not mounted')
  await printable('B'); await pause(80)
  assert(row.isConnected && rows.get('ada') === row, 'The fixture did not reuse its custom result row')
  const before = editor.save().blocks
  await clickNative(row)
  const after = editor.save().blocks
  equal(Object.values(after[0].inline)[0].data, { id: 'ada', name: 'Ada' }, 'An old row handler chose another candidate from the new query')
  await dispatchKey('z', 'KeyZ', 90, 2); equal(editor.save().blocks, before)
  await dispatchKey('z', 'KeyZ', 90, 10); equal(editor.save().blocks, after)
})

test('Fresh mention typing and confirmation keep the caret after the trigger and insert following text outside the widget', async () => {
  const editor = await suggestions(), root = editorRoot(editor), field = blockElement(editor, 'a').querySelector('.oe-paragraph')
  const selection = window.getSelection(), before = editor.save().blocks
  equal(field.textContent, '@A')
  equal(getTextOffset(field, selection.focusNode, selection.focusOffset), 2, 'The query caret moved before its trigger')
  await dispatchKey('Enter', 'Enter', 13)
  const committed = editor.save().blocks, id = Object.keys(committed[0].inline)[0], span = field.querySelector('[data-inline-plugin="mention"]')
  equal(getTextOffset(field, selection.focusNode, selection.focusOffset), 2, 'Confirmation did not place the caret after its trailing space')
  equal(field.textContent.replaceAll('\u00a0', ' '), '@Ada ', 'Confirmation did not insert one external space')
  assert(!span.contains(selection.focusNode), 'Confirmation left the caret inside the mention')
  await printable('X')
  const after = editor.save().blocks
  equal(after[0].inline[id].data, { id: '42', name: 'Ada' })
  equal(span.textContent, '@Ada', 'Following text was inserted inside the mention span')
  equal(field.textContent.replaceAll('\u00a0', ' '), '@Ada X')
  equal(after[0].data.text.replaceAll('&nbsp;', ' '), '{{' + id + '}} X', 'Following text was not saved after the widget')
  await dispatchKey('z', 'KeyZ', 90, 2); equal(editor.save().blocks, committed)
  await dispatchKey('z', 'KeyZ', 90, 2); equal(editor.save().blocks, before)
})

for (const editing of [false, true]) test('Typing a space at the end of a mention line keeps it outside the pill / editing ' + editing, async () => {
  const editor = make([{ id: 'a', type: 'paragraph', dataVersion: 2, data: { text: '{{person}}' }, inline: { person: { type: 'mention', dataVersion: 1, data: { id: 'old', name: 'Ada' } } } }], { injectStyles: true, inlinePlugins: [createMentionPlugin({ debounceDelay: 0, searchFunction: async () => [{ id: 'ada', name: 'Ada' }] })] })
  const field = blockElement(editor, 'a').querySelector('.oe-paragraph'), span = field.querySelector('[data-inline-plugin="mention"]'), selection = window.getSelection()
  field.focus(); selection.setBaseAndExtent(span.firstChild, 2, span.firstChild, 2)
  if (editing) { await printable('X'); await pause(80); assert(editorRoot(editor).querySelector('.oe-mention-dropdown'), 'Editing did not open suggestions') }
  await dispatchKey('End', 'End', 35)
  const before = editor.save().blocks, name = before[0].inline.person.data.name
  await printable(' ')
  const afterSpace = editor.save().blocks
  equal(span.textContent, '@' + name, 'The end-of-line space became part of the mention span')
  equal(afterSpace[0].inline.person.data, before[0].inline.person.data)
  equal(afterSpace[0].data.text.replaceAll('&nbsp;', ' '), '{{person}} ', 'The space was not saved outside the mention')
  equal(selection.focusNode.nodeType, Node.TEXT_NODE)
  assert(!span.contains(selection.focusNode), 'The caret stayed inside the mention after the space')
  equal(getTextOffset(field, selection.focusNode, selection.focusOffset), 2)
  assert(!editorRoot(editor).querySelector('.oe-mention-dropdown'), 'The ended mention kept its suggestions active')
  await printable('X')
  const after = editor.save().blocks
  equal(field.textContent, '@' + name + ' X'); equal(span.textContent, '@' + name)
  equal(after[0].data.text.replaceAll('&nbsp;', ' '), '{{person}} X')
  await dispatchKey('z', 'KeyZ', 90, 2); equal(editor.save().blocks, before)
  await dispatchKey('z', 'KeyZ', 90, 10); equal(editor.save().blocks, after)
})

test('Replacing a backwards selected mention label ending at its boundary edits the label', async () => {
  const editor = make([{ id: 'a', type: 'paragraph', dataVersion: 2, data: { text: '{{person}}' }, inline: { person: { type: 'mention', dataVersion: 1, data: { id: 'old', name: 'Ada' } } } }], { injectStyles: true, inlinePlugins: [createMentionPlugin({ debounceDelay: 0, searchFunction: async () => [] })] })
  const field = blockElement(editor, 'a').querySelector('.oe-paragraph'), span = field.querySelector('[data-inline-plugin="mention"]'), selection = window.getSelection(), before = editor.save().blocks
  field.focus(); selection.setBaseAndExtent(span.firstChild, 4, span.firstChild, 1)
  equal(selection.toString(), 'Ada')
  await printable('X')
  const after = editor.save().blocks
  equal(span.textContent, '@X'); equal(field.textContent, '@X')
  equal(after[0].inline.person.data, { id: 'old', name: 'X' })
  equal(after[0].data.text, '{{person}}')
  await dispatchKey('z', 'KeyZ', 90, 2); equal(editor.save().blocks, before)
  await dispatchKey('z', 'KeyZ', 90, 10); equal(editor.save().blocks, after)
})

for (const backwards of [false, true]) test('Deleting a selected mention suffix ending at its outside boundary restarts search / backwards ' + backwards, async () => {
  const queries = []
  const editor = make([{ id: 'a', type: 'paragraph', dataVersion: 2, data: { text: 'Lead {{person}} Tail' }, inline: { person: { type: 'mention', dataVersion: 1, data: { id: 'ada', name: 'Ada Lovelace' } } } }], { injectStyles: true, inlinePlugins: [createMentionPlugin({
    debounceDelay: 0, searchFunction: async query => { queries.push(query); return [{ id: 'grace', name: 'Grace' }] },
  })] })
  const field = blockElement(editor, 'a').querySelector('.oe-paragraph'), span = field.querySelector('[data-inline-plugin="mention"]'), selection = window.getSelection(), before = editor.save().blocks
  field.focus()
  if (backwards) selection.setBaseAndExtent(span.nextSibling, 0, span.firstChild, 3)
  else selection.setBaseAndExtent(span.firstChild, 3, span.nextSibling, 0)
  equal(selection.toString(), 'a Lovelace')
  await dispatchKey('Backspace', 'Backspace', 8); await pause(80)
  equal(queries, ['Ad'], 'Deleting the selected name suffix did not start a query')
  equal(editor.save().blocks[0].inline.person.data, { id: 'ada', name: 'Ad' })
  equal(span.textContent, '@Ad')
  assert(span.contains(selection.focusNode)); equal(selection.focusOffset, 3)
  assert(span.classList.contains('oe-ip--mention--editing'))
  assert(editorRoot(editor).querySelector('.oe-mention-item'))
  const edited = editor.save().blocks
  await dispatchKey('Enter', 'Enter', 13)
  const after = editor.save().blocks
  equal(after[0].inline.person.data, { id: 'grace', name: 'Grace' })
  equal(field.textContent, 'Lead @Grace Tail')
  assert(!span.contains(selection.focusNode)); equal(getTextOffset(field, selection.focusNode, selection.focusOffset), 7)
  await dispatchKey('z', 'KeyZ', 90, 2); equal(editor.save().blocks, edited)
  await dispatchKey('z', 'KeyZ', 90, 2); equal(editor.save().blocks, before)
  await dispatchKey('z', 'KeyZ', 90, 10)
  await dispatchKey('z', 'KeyZ', 90, 10); equal(editor.save().blocks, after)
})

test('Backspace immediately after an existing mention starts name search and preserves the edit caret', async () => {
  const queries = []
  const editor = make([{ id: 'a', type: 'paragraph', dataVersion: 2, data: { text: 'Lead {{person}}&nbsp; Tail' }, inline: { person: { type: 'mention', dataVersion: 1, data: { id: 'ada', name: 'Ada Lovelace' } } } }], { injectStyles: true, inlinePlugins: [createMentionPlugin({
    debounceDelay: 0, searchFunction: async query => { queries.push(query); return [{ id: 'grace', name: 'Grace Hopper' }] },
  })] })
  const field = blockElement(editor, 'a').querySelector('.oe-paragraph'), span = field.querySelector('[data-inline-plugin="mention"]'), selection = window.getSelection(), before = editor.save().blocks
  field.focus(); selection.setBaseAndExtent(span.nextSibling, 0, span.nextSibling, 0)
  await dispatchKey('Backspace', 'Backspace', 8); await pause(80)
  equal(queries, ['Ada Lovelac'], 'Deletion from the outside boundary did not start mention search')
  equal(span.textContent, '@Ada Lovelac')
  assert(span.contains(selection.focusNode), 'The edit caret remained outside the mention')
  assert(span.classList.contains('oe-ip--mention--editing'))
  assert(editorRoot(editor).querySelector('.oe-mention-item'), 'Mention choices did not reopen after deletion')
  const edited = editor.save().blocks
  await dispatchKey('Enter', 'Enter', 13)
  const after = editor.save().blocks
  equal(after[0].inline.person.data, { id: 'grace', name: 'Grace Hopper' })
  equal(field.textContent.replaceAll('\u00a0', ' '), 'Lead @Grace Hopper  Tail')
  assert(!span.contains(selection.focusNode)); equal(getTextOffset(field, selection.focusNode, selection.focusOffset), 7)
  await dispatchKey('z', 'KeyZ', 90, 2); equal(editor.save().blocks, edited)
  await dispatchKey('z', 'KeyZ', 90, 2); equal(editor.save().blocks, before)
  await dispatchKey('z', 'KeyZ', 90, 10)
  await dispatchKey('z', 'KeyZ', 90, 10); equal(editor.save().blocks, after)
})

test('Choosing a replacement for an edited mention leaves the caret after the widget through Undo and Redo', async () => {
  const editor = make([{ id: 'a', type: 'paragraph', dataVersion: 2, data: { text: '{{person}}' }, inline: { person: { type: 'mention', dataVersion: 1, data: { id: 'old', name: 'Ada' } } } }], { injectStyles: true, inlinePlugins: [createMentionPlugin({
    debounceDelay: 0, searchFunction: async () => [{ id: 'grace', name: 'Grace Hopper' }],
  })] })
  const field = blockElement(editor, 'a').querySelector('.oe-paragraph'), span = field.querySelector('[data-inline-plugin="mention"]'), selection = window.getSelection()
  field.focus(); selection.setBaseAndExtent(span.firstChild, 2, span.firstChild, 2)
  await printable('X'); await pause(80)
  const edited = editor.save().blocks
  await dispatchKey('Enter', 'Enter', 13)
  const after = editor.save().blocks
  equal(after[0].inline.person.data, { id: 'grace', name: 'Grace Hopper' })
  equal(getTextOffset(field, selection.focusNode, selection.focusOffset), 2, 'Choosing an edited mention did not place the caret after its trailing space')
  equal(after[0].data.text.replaceAll('&nbsp;', ' '), '{{person}} ')
  assert(!span.classList.contains('oe-ip--mention--editing'), 'Confirmation kept the mention active')
  await dispatchKey('z', 'KeyZ', 90, 2); equal(editor.save().blocks, edited)
  await dispatchKey('z', 'KeyZ', 90, 10); equal(editor.save().blocks, after)
  equal(getTextOffset(field, selection.focusNode, selection.focusOffset), 2, 'Redo did not restore the caret after the mention space')
})

test('A mention moved into another column by a layout change keeps search, confirmation and caret in its new field', async () => {
  const columns = createColumnsPlugin()
  const editor = make([{ id: 'a', type: 'columns', dataVersion: columns.schema.currentVersion, data: { layout: '1-1-1', columns: [
    { id: 'left', content: 'Left' }, { id: 'center', content: 'Center' }, { id: 'right', content: '{{person}}' },
  ] }, inline: { person: { type: 'mention', dataVersion: 1, data: { id: 'ada', name: 'Ada' } } } }], { injectStyles: true, plugins: [columns], inlinePlugins: [createMentionPlugin({ debounceDelay: 0, searchFunction: async () => [{ id: 'grace', name: 'Grace' }] })] })
  const root = editorRoot(editor), original = editor.save().blocks
  editor.blocks.focus('a', { fieldKey: 'column:right', offset: 0 })
  await clickNative(root.querySelector('.oe-toolbar__drag'))
  const layout = [...root.querySelectorAll('.oe-settings-menu [role="menuitem"]')].find(item => item.querySelector('.oe-settings-menu__label')?.textContent === '50 / 50')
  assert(layout, 'The two-column layout action is missing'); await clickNative(layout)
  const merged = editor.save().blocks, field = blockElement(editor, 'a').querySelector('[data-column-id="center"]'), span = field.querySelector('[data-inline-plugin="mention"]'), selection = window.getSelection()
  equal(merged[0].data.columns, [{ id: 'left', content: 'Left' }, { id: 'center', content: 'Center<br>{{person}}' }])
  assert(span, 'The layout change lost the moved mention')
  field.focus(); selection.setBaseAndExtent(span.firstChild, 2, span.firstChild, 2)
  await printable('X'); await pause(80)
  const edited = editor.save().blocks
  await dispatchKey('Enter', 'Enter', 13)
  const after = editor.save().blocks
  equal(after[0].inline.person.data, { id: 'grace', name: 'Grace' }, 'The moved mention committed through its previous field')
  equal(after[0].data.columns[1].content.replaceAll('&nbsp;', ' '), 'Center<br>{{person}} ')
  equal(span.textContent, '@Grace'); equal(document.activeElement, field)
  equal(getTextOffset(field, selection.focusNode, selection.focusOffset), 9)
  assert(!span.contains(selection.focusNode))
  await dispatchKey('z', 'KeyZ', 90, 2); equal(editor.save().blocks, edited)
  await dispatchKey('z', 'KeyZ', 90, 2); equal(editor.save().blocks, merged)
  await dispatchKey('z', 'KeyZ', 90, 2); equal(editor.save().blocks, original)
  for (let i = 0; i < 3; i++) await dispatchKey('z', 'KeyZ', 90, 10)
  equal(editor.save().blocks, after)
  const restored = blockElement(editor, 'a').querySelector('[data-column-id="center"]')
  equal(document.activeElement, restored)
  equal(getTextOffset(restored, selection.focusNode, selection.focusOffset), 9)
})

test('Programmatic mention insertion places the caret after its external space', async () => {
  const editor = make([{ id: 'a', type: 'paragraph', dataVersion: 2, data: { text: '' } }], { injectStyles: true, inlinePlugins: [createMentionPlugin()] })
  const field = blockElement(editor, 'a').querySelector('.oe-paragraph'), before = editor.save().blocks
  editor.blocks.focus('a', { offset: 0 })
  equal(editor.insertInlinePlugin('mention', { id: 'ada', name: 'Ada' }), true)
  const after = editor.save().blocks, span = field.querySelector('[data-inline-plugin="mention"]'), selection = window.getSelection()
  equal(field.textContent.replaceAll('\u00a0', ' '), '@Ada ')
  equal(span.textContent, '@Ada')
  equal(getTextOffset(field, selection.focusNode, selection.focusOffset), 2)
  assert(!span.contains(selection.focusNode))
  await dispatchKey('z', 'KeyZ', 90, 2); equal(editor.save().blocks, before)
  await dispatchKey('z', 'KeyZ', 90, 10); equal(editor.save().blocks, after)
  equal(getTextOffset(field, selection.focusNode, selection.focusOffset), 2)
})

test('Changing a debounced mention query immediately retires the previous candidates', async () => {
  const editor = make([{ id: 'a', type: 'paragraph', dataVersion: 2, data: { text: '' } }], { injectStyles: true, inlinePlugins: [createMentionPlugin({ debounceDelay: 300, searchFunction: async query => query ? [{ id: 'alice', name: 'Alice' }] : [{ id: 'ada', name: 'Ada' }] })] })
  const root = editorRoot(editor), field = blockElement(editor, 'a').querySelector('.oe-paragraph')
  await clickNative(field); await printable('@'); await pause(340)
  equal(root.querySelector('[role="option"] .oe-mention-name')?.textContent, 'Ada')
  await printable('A')
  equal(root.querySelectorAll('[role="option"]').length, 0, 'Old query candidates remained available during debounce')
  assert(root.querySelector('.oe-mention-loading'), 'A pending query did not show its loading state')
  const before = editor.save().blocks
  await pause(340)
  equal(root.querySelector('[role="option"] .oe-mention-name')?.textContent, 'Alice')
  await dispatchKey('Enter', 'Enter', 13)
  const after = editor.save().blocks
  equal(Object.values(after[0].inline)[0].data, { id: 'alice', name: 'Alice' })
  await dispatchKey('z', 'KeyZ', 90, 2); equal(editor.save().blocks, before)
  await dispatchKey('z', 'KeyZ', 90, 10); equal(editor.save().blocks, after)
})

test('An empty mention query searches immediately even with a configured debounce', async () => {
  const queries = []
  const editor = make([{ id: 'a', type: 'paragraph', dataVersion: 2, data: { text: '' } }], { injectStyles: true, inlinePlugins: [createMentionPlugin({ debounceDelay: 300, searchFunction: async query => { queries.push(query); return [{ id: 'ada', name: 'Ada' }] } })] })
  await clickNative(blockElement(editor, 'a').querySelector('.oe-paragraph')); await printable('@'); await pause(80)
  equal(queries, [''], 'The initial trigger search was unnecessarily delayed')
  equal(editorRoot(editor).querySelectorAll('[role="option"]').length, 1)
})

for (const editing of [false, true]) test('Mention confirmation reuses the following authored space / editing ' + editing, async () => {
  const block = editing
    ? { id: 'a', type: 'paragraph', dataVersion: 2, data: { text: '{{person}} tail' }, inline: { person: { type: 'mention', dataVersion: 1, data: { id: 'old', name: 'Ada' } } } }
    : { id: 'a', type: 'paragraph', dataVersion: 2, data: { text: ' tail' } }
  const editor = make([block], { injectStyles: true, inlinePlugins: [createMentionPlugin({ debounceDelay: 0, searchFunction: async () => [{ id: 'ada', name: 'Ada' }] })] })
  const field = blockElement(editor, 'a').querySelector('.oe-paragraph'), selection = window.getSelection()
  if (editing) {
    const span = field.querySelector('[data-inline-plugin="mention"]')
    field.focus(); selection.setBaseAndExtent(span.firstChild, 2, span.firstChild, 2); await printable('X')
  } else { editor.blocks.focus('a', { offset: 0 }); await printable('@'); await printable('A') }
  await pause(80)
  const before = editor.save().blocks
  await dispatchKey('Enter', 'Enter', 13)
  const after = editor.save().blocks, id = Object.keys(after[0].inline)[0], span = field.querySelector('[data-inline-plugin="mention"]')
  equal(after[0].data.text.replaceAll('&nbsp;', ' '), '{{' + id + '}} tail', 'Confirmation duplicated the authored separator')
  equal(field.textContent.replaceAll('\u00a0', ' '), '@Ada tail')
  equal(getTextOffset(field, selection.focusNode, selection.focusOffset), 2)
  equal(span.textContent, '@Ada'); assert(!span.classList.contains('oe-ip--mention--editing'))
  await dispatchKey('z', 'KeyZ', 90, 2); equal(editor.save().blocks, before)
  await dispatchKey('z', 'KeyZ', 90, 10); equal(editor.save().blocks, after)
})

for (const [key, offset] of [['Backspace', 1], ['Delete', 0]]) test('Deleting the trigger of an edited mention stops search and unwraps text / ' + key, async () => {
  const queries = []
  const editor = make([{ id: 'a', type: 'paragraph', dataVersion: 2, data: { text: '{{person}} tail' }, inline: { person: { type: 'mention', dataVersion: 1, data: { id: 'old', name: 'Ada' } } } }], { injectStyles: true, inlinePlugins: [createMentionPlugin({ debounceDelay: 0, searchFunction: async (query, _page, { signal }) => { queries.push({ query, signal }); return [{ id: 'ada', name: 'Ada' }] } })] })
  const root = editorRoot(editor), field = blockElement(editor, 'a').querySelector('.oe-paragraph'), span = field.querySelector('[data-inline-plugin="mention"]'), selection = window.getSelection()
  field.focus(); selection.setBaseAndExtent(span.firstChild, 3, span.firstChild, 3)
  await dispatchKey('Backspace', 'Backspace', 8); await pause(80)
  equal(span.textContent, '@Aa'); equal(queries.at(-1).query, 'Aa')
  assert(span.classList.contains('oe-ip--mention--editing'), 'Deleting a name character did not activate its span')
  assert(root.querySelector('.oe-mention-dropdown'), 'Deleting a name character did not open search')
  const before = editor.save().blocks, calls = queries.length
  selection.setBaseAndExtent(span.firstChild, offset, span.firstChild, offset)
  await dispatchKey(key, key, key === 'Delete' ? 46 : 8); await pause(80)
  const after = editor.save().blocks
  equal(field.textContent, 'Aa tail'); equal(after[0].data.text, 'Aa tail')
  assert(!field.querySelector('[data-inline-plugin="mention"]'), 'The removed trigger left a mention span')
  assert(!after[0].inline || !Object.keys(after[0].inline).length, 'Unwrapping kept a serialized mention')
  assert(!root.querySelector('.oe-mention-dropdown'), 'Trigger deletion left search open')
  equal(queries.length, calls, 'Trigger deletion started another search')
  equal(getTextOffset(field, selection.focusNode, selection.focusOffset), 0, 'Unwrapping moved the caret away from the deleted trigger')
  await dispatchKey('z', 'KeyZ', 90, 2); equal(editor.save().blocks, before)
  await dispatchKey('z', 'KeyZ', 90, 10); equal(editor.save().blocks, after)
})

for (const theme of ['light', 'dark']) for (const width of [390, 1280]) test('Mention results fill their menu width and align variable-length labels / ' + theme + ' / ' + width, async () => {
  await window.__testInput('Viewport.set', { width, height: 600 })
  try {
    const editor = make([{ id: 'a', type: 'paragraph', dataVersion: 2, data: { text: '' } }], { theme, injectStyles: true, inlinePlugins: [createMentionPlugin({ debounceDelay: 0, searchFunction: async () => [
      { id: 'ada', name: 'Ада Лавлейс', details: 'Математик' },
      { id: 'grace', name: 'Грейс Хоппер', details: 'Учёный в области информатики' },
      { id: 'margaret', name: 'Маргарет Гамильтон', details: 'Инженер-программист' },
    ] })] })
    await clickNative(blockElement(editor, 'a').querySelector('.oe-paragraph')); await printable('@'); await pause(80)
    const root = editorRoot(editor), menu = root.querySelector('.oe-mention-dropdown'), style = getComputedStyle(menu)
    const available = menu.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
    const rows = [...menu.querySelectorAll('.oe-mention-item[role=option]')]
    equal(rows.length, 3)
    for (const row of rows) {
      assert(Math.abs(row.getBoundingClientRect().width - available) <= 1, 'A result width follows its content instead of filling the menu')
      assert(['left', 'start'].includes(getComputedStyle(row).textAlign), 'A result label inherits centered button text')
    }
    const nameLefts = rows.map(row => row.querySelector('.oe-mention-name').getBoundingClientRect().left)
    assert(nameLefts.every(left => Math.abs(left - nameLefts[0]) <= 1), 'Labels do not share a left text column')
    const bounds = menu.getBoundingClientRect()
    assert(bounds.left >= 8 && bounds.right <= innerWidth - 8, 'The menu escapes the viewport')
    await clickNative(rows[1])
    equal(Object.values(editor.save().blocks[0].inline)[0].data, { id: 'grace', name: 'Грейс Хоппер' })
  } finally { await window.__testInput('Viewport.reset') }
})

await run()
