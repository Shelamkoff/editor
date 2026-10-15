import { createMentionPlugin } from '../../inline-plugins/mention/index.js'
import { test, make, blockElement, editorRoot, assert, equal, run } from './regressions/harness.js'
import { dispatchKey, waitForStyles } from './native-input-helpers.js'

for (const name of ['Ada Lovelace', 'Анна Мария', 'Ada 👨‍👩‍👧‍👦']) {
  for (const key of ['Backspace', 'Delete']) {
    test('Mention Ctrl+' + key + ' keeps native word deletion in saved data: ' + name, async () => {
      const text = '@' + name
      const editor = make([
        { id: 'plain', type: 'paragraph', dataVersion: 2, data: { text } },
        { id: 'mention', type: 'paragraph', dataVersion: 2, data: { text: '{{person}}' }, inline: {
          person: { type: 'mention', dataVersion: 1, data: { id: 'person', name } },
        } },
      ], { injectStyles: true, inlinePlugins: [createMentionPlugin({ debounceDelay: 0, searchFunction: async () => [] })] })
      const offset = key === 'Backspace' ? text.length : 1
      const keyCode = key === 'Backspace' ? 8 : 46
      const plain = blockElement(editor, 'plain').querySelector('.oe-paragraph')
      await waitForStyles(document)
      equal(getComputedStyle(plain).whiteSpace, 'pre-wrap', 'Native deletion started before the authoring stylesheet loaded')
      const label = document.createElement('span')
      // Use the same inline box, with no widget identity or editing handler.
      label.className = 'oe-ip oe-ip--mention'
      label.textContent = text
      plain.replaceChildren(label)
      plain.focus()
      window.getSelection().setBaseAndExtent(label.firstChild, offset, label.firstChild, offset)
      await dispatchKey(key, key, keyCode, 2)
      const expected = plain.textContent
      const before = editor.save().blocks
      const field = blockElement(editor, 'mention').querySelector('.oe-paragraph')
      const span = field.querySelector('[data-inline-plugin="mention"]')
      field.focus()
      window.getSelection().setBaseAndExtent(span.firstChild, offset, span.firstChild, offset)
      await dispatchKey(key, key, keyCode, 2)
      equal(field.textContent, expected, 'Visible mention word deletion differs from native text')
      const after = editor.save().blocks
      assert(after[1].inline?.person, 'Word deletion unexpectedly removed the remaining mention')
      equal(after[1].inline.person.data.name, expected.slice(1), 'Saved mention differs from its edited label')
      await dispatchKey('z', 'KeyZ', 90, 2)
      equal(editor.save().blocks, before, 'Undo did not restore word deletion')
      await dispatchKey('z', 'KeyZ', 90, 10)
      equal(editor.save().blocks, after, 'Redo did not restore word deletion')
      equal(blockElement(editor, 'mention').querySelector('.oe-paragraph').textContent, expected, 'Redo changed the edited mention label')
    })
  }
}

for (const [key, offset] of [['Backspace', 1], ['Backspace', 2], ['Delete', 4], ['Delete', 11]]) {
  test('Mention word deletion at offset ' + offset + ' preserves surrounding text: Ctrl+' + key, async () => {
    const prefix = 'Prefix ', name = 'Ada Lovelace', suffix = ' tail'
    const editor = make([
      { id: 'plain', type: 'paragraph', dataVersion: 2, data: { text: prefix + '@' + name + suffix } },
      { id: 'mention', type: 'paragraph', dataVersion: 2, data: { text: prefix + '{{person}}' + suffix }, inline: {
        person: { type: 'mention', dataVersion: 1, data: { id: 'person', name } },
      } },
    ], { injectStyles: true, inlinePlugins: [createMentionPlugin({ debounceDelay: 0, searchFunction: async () => [] })] })
    const keyCode = key === 'Backspace' ? 8 : 46
    const plain = blockElement(editor, 'plain').querySelector('.oe-paragraph')
    await waitForStyles(document)
    equal(getComputedStyle(plain).whiteSpace, 'pre-wrap', 'Native deletion started before the authoring stylesheet loaded')
    const label = document.createElement('span')
    // Match the native inline box without registering widget identity or handlers.
    label.className = 'oe-ip oe-ip--mention'
    label.textContent = '@' + name
    plain.replaceChildren(document.createTextNode(prefix), label, document.createTextNode(suffix))
    plain.focus()
    window.getSelection().setBaseAndExtent(label.firstChild, offset, label.firstChild, offset)
    await dispatchKey(key, key, keyCode, 2)
    const expected = plain.textContent, before = editor.save().blocks
    const field = blockElement(editor, 'mention').querySelector('.oe-paragraph')
    const span = field.querySelector('[data-inline-plugin="mention"]')
    field.focus()
    window.getSelection().setBaseAndExtent(span.firstChild, offset, span.firstChild, offset)
    await dispatchKey(key, key, keyCode, 2)
    equal(field.textContent, expected, 'Mention boundary changed native word deletion')
    const after = editor.save().blocks
    await dispatchKey('z', 'KeyZ', 90, 2)
    equal(editor.save().blocks, before, 'Word deletion was not one undoable operation')
    await dispatchKey('z', 'KeyZ', 90, 10)
    equal(editor.save().blocks, after)
    equal(blockElement(editor, 'mention').querySelector('.oe-paragraph').textContent, expected, 'Redo restored stale mention text')
  })
}

for (const operation of ['cut', 'paste']) for (const [start, end] of [[1, 4], [0, 1], [2, 2]]) {
  if (operation === 'cut' && start === end) continue
  test('Mention local ' + operation + ' edits label range ' + start + ':' + end + ' atomically', async () => {
    const name = 'Ada Lovelace', text = '@' + name
    const editor = make([
      { id: 'source', type: 'paragraph', dataVersion: 2, data: { text: 'XY' } },
      { id: 'mention', type: 'paragraph', dataVersion: 2, data: { text: 'Prefix {{person}} tail' }, inline: {
        person: { type: 'mention', dataVersion: 1, data: { id: 'person', name } },
      } },
    ], { injectStyles: true, inlinePlugins: [createMentionPlugin({ debounceDelay: 0, searchFunction: async () => [] })] })
    const source = blockElement(editor, 'source').querySelector('.oe-paragraph')
    source.focus()
    window.getSelection().setBaseAndExtent(source.firstChild, 0, source.firstChild, 2)
    await dispatchKey('c', 'KeyC', 67, 2)
    const before = editor.save().blocks
    const field = blockElement(editor, 'mention').querySelector('.oe-paragraph'), span = field.querySelector('[data-inline-plugin="mention"]')
    field.focus()
    window.getSelection().setBaseAndExtent(span.firstChild, start, span.firstChild, end)
    await dispatchKey(operation === 'cut' ? 'x' : 'v', operation === 'cut' ? 'KeyX' : 'KeyV', operation === 'cut' ? 88 : 86, 2)
    const expected = 'Prefix ' + text.slice(0, start) + (operation === 'cut' ? '' : 'XY') + text.slice(end) + ' tail'
    equal(blockElement(editor, 'mention').querySelector('.oe-paragraph').textContent, expected, 'Clipboard did not edit the selected label range')
    const after = editor.save().blocks
    if (start > 0) equal(after[1].inline.person.data.name, expected.slice(8, -5), 'Clipboard left stale serialized mention text')
    else assert(!after[1].inline, 'Removing the trigger retained mention identity')
    await dispatchKey('z', 'KeyZ', 90, 2)
    equal(editor.save().blocks, before)
    equal(editor.canUndo, false, 'Clipboard split one action into multiple history entries')
    await dispatchKey('z', 'KeyZ', 90, 10)
    equal(editor.save().blocks, after)
    equal(blockElement(editor, 'mention').querySelector('.oe-paragraph').textContent, expected)
  })
}

for (const backwards of [false, true]) test('Mention local copy exports only the ' + (backwards ? 'backward' : 'forward') + ' label selection', async () => {
  const editor = make([
    { id: 'target', type: 'paragraph', dataVersion: 2, data: { text: '' } },
    { id: 'mention', type: 'paragraph', dataVersion: 2, data: { text: '{{person}}' }, inline: {
      person: { type: 'mention', dataVersion: 1, data: { id: 'person', name: 'Ada Lovelace' } },
    } },
  ], { injectStyles: true, inlinePlugins: [createMentionPlugin({ debounceDelay: 0, searchFunction: async () => [] })] })
  const field = blockElement(editor, 'mention').querySelector('.oe-paragraph'), span = field.querySelector('[data-inline-plugin="mention"]')
  field.focus()
  window.getSelection().setBaseAndExtent(span.firstChild, backwards ? 4 : 1, span.firstChild, backwards ? 1 : 4)
  const before = editor.save().blocks
  await dispatchKey('c', 'KeyC', 67, 2)
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false, 'Copy created author history')
  const target = blockElement(editor, 'target').querySelector('.oe-paragraph')
  target.focus()
  window.getSelection().setBaseAndExtent(target, 0, target, 0)
  await dispatchKey('v', 'KeyV', 86, 2)
  equal(editor.save().blocks[0].data.text, 'Ada', 'Copy exported hidden widget identity or unselected label text')
  equal(editor.save().blocks[1], before[1])
})

test('Mention refuses a cut whose clipboard write fails', async () => {
  const editor = make([{ id: 'mention', type: 'paragraph', dataVersion: 2, data: { text: '{{person}}' }, inline: {
    person: { type: 'mention', dataVersion: 1, data: { id: 'person', name: 'Ada' } },
  } }], { inlinePlugins: [createMentionPlugin()] })
  const field = blockElement(editor, 'mention').querySelector('.oe-paragraph'), span = field.querySelector('[data-inline-plugin="mention"]')
  field.focus()
  window.getSelection().setBaseAndExtent(span.firstChild, 1, span.firstChild, 4)
  const before = editor.save().blocks
  const event = new ClipboardEvent('cut', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', { value: { setData() { throw new Error('unavailable') }, getData() { return '' } } })
  field.dispatchEvent(event)
  assert(event.defaultPrevented, 'A failed clipboard write permitted native Cut')
  equal(editor.save().blocks, before)
  equal(span.textContent, '@Ada')
  equal(editor.canUndo, false)
})

test('Mention clipboard ignores an auxiliary input with a stale native label range', async () => {
  const editor = make([{ id: 'mention', type: 'paragraph', dataVersion: 2, data: { text: '{{person}}' }, inline: {
    person: { type: 'mention', dataVersion: 1, data: { id: 'person', name: 'Ada' } },
  } }], { inlinePlugins: [createMentionPlugin()] })
  const field = blockElement(editor, 'mention').querySelector('.oe-paragraph'), span = field.querySelector('[data-inline-plugin="mention"]')
  field.focus()
  window.getSelection().setBaseAndExtent(span.firstChild, 1, span.firstChild, 4)
  const input = document.createElement('input')
  editorRoot(editor).append(input)
  const before = editor.save().blocks, data = new DataTransfer()
  data.setData('text/plain', 'Replacement')
  const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data })
  input.dispatchEvent(event)
  assert(!event.defaultPrevented, 'Mention captured an auxiliary control clipboard event')
  equal(editor.save().blocks, before)
})

for (const value of ['Grace', '<b>Grace</b>']) test('Mention browser text replacement stores literal label text: ' + value, async () => {
  const editor = make([{ id: 'mention', type: 'paragraph', dataVersion: 2, data: { text: '{{person}}' }, inline: {
    person: { type: 'mention', dataVersion: 1, data: { id: 'person', name: 'Ada' } },
  } }], { inlinePlugins: [createMentionPlugin({ searchFunction: async () => [] })] })
  const before = editor.save().blocks
  const field = blockElement(editor, 'mention').querySelector('.oe-paragraph'), span = field.querySelector('[data-inline-plugin="mention"]')
  field.focus()
  window.getSelection().setBaseAndExtent(span.firstChild, 1, span.firstChild, 4)
  const event = new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertReplacementText', data: value })
  field.dispatchEvent(event)
  assert(event.defaultPrevented, 'Replacement text bypassed the widget data boundary')
  equal(editor.save().blocks[0].inline.person.data.name, value)
  equal(span.textContent, '@' + value)
  equal(span.childElementCount, 0, 'Browser replacement was interpreted as HTML')
  editor.undo()
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
})

await run()
